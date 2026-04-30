import { MAX_TILE_X, MAX_TILE_Y } from "./world-layout";
import { stableHash } from "./stable-random";
import { DOCKED_SHIP_DWELL_SHARE, ZONE_DWELL } from "./motion-config";
import { sampleShipWaterPath as sampleWaterPath } from "./motion-water";
import { clamp, normalizeHeading, pathKey, positiveModulo, smoothstep } from "./motion-utils";
import type { PharosVilleMotionPlan, ShipMotionRoute, ShipMotionRouteStop, ShipMotionSample, ShipMotionState, ShipWaterPath } from "./motion-types";
import type { ShipNode, ShipWaterZone } from "./world-types";

export function resolveShipMotionSample(input: {
  plan: PharosVilleMotionPlan;
  reducedMotion: boolean;
  ship: ShipNode;
  timeSeconds: number;
}): ShipMotionSample {
  const route = input.plan.shipRoutes.get(input.ship.id);
  if (input.reducedMotion || !route) {
    return {
      shipId: input.ship.id,
      tile: route?.riskTile ?? input.ship.riskTile,
      state: "idle",
      zone: input.ship.riskZone,
      currentDockId: null,
      currentRouteStopId: null,
      currentRouteStopKind: null,
      heading: { x: 0, y: 0 },
      wakeIntensity: 0,
    };
  }

  const scheduledStopCount = Math.min(dockStopCount(route.dockStops.length), route.dockStopSchedule.length);
  if (scheduledStopCount === 0) {
    return openWaterPatrolSample(route, input.timeSeconds);
  }

  const cyclePosition = input.timeSeconds + route.phaseSeconds;
  const elapsedSeconds = positiveModulo(cyclePosition, route.cycleSeconds);
  const cycleIndex = Math.floor(cyclePosition / route.cycleSeconds);
  const stops = scheduledDockStopsForCycle(route, cycleIndex, scheduledStopCount);
  if (stops.length === 0) return openWaterPatrolSample(route, input.timeSeconds);

  const zoneDwell = dockedShipZoneDwell(route.zone);
  const riskSecondsEach = route.cycleSeconds * zoneDwell.riskDwell / stops.length;
  const dockSecondsEach = route.cycleSeconds * zoneDwell.dockDwell / stops.length;
  const transitSecondsEach = route.cycleSeconds * zoneDwell.transit / (stops.length * 2);
  let cursor = elapsedSeconds;

  for (let stopIndex = 0; stopIndex < stops.length; stopIndex += 1) {
    const stop = stops[stopIndex]!;
    const nextStop = stops[(stopIndex + 1) % stops.length]!;

    if (cursor < dockSecondsEach) {
      return mooredSample(route, stop, input.timeSeconds);
    }
    cursor -= dockSecondsEach;

    if (cursor < transitSecondsEach) {
      return transitSample({
        route,
        path: route.waterPaths.get(pathKey(stop.mooringTile, route.riskTile)),
        progress: smoothstep(cursor / Math.max(1, transitSecondsEach)),
        state: "departing",
        dockId: stop.dockId,
      });
    }
    cursor -= transitSecondsEach;

    if (cursor < riskSecondsEach) {
      return riskWaterSample(route, input.timeSeconds, cursor / Math.max(1, riskSecondsEach));
    }
    cursor -= riskSecondsEach;

    if (cursor < transitSecondsEach) {
      return transitSample({
        route,
        path: route.waterPaths.get(pathKey(route.riskTile, nextStop.mooringTile)),
        progress: smoothstep(cursor / Math.max(1, transitSecondsEach)),
        state: "arriving",
        dockId: nextStop.dockId,
      });
    }
    cursor -= transitSecondsEach;
  }

  return riskWaterSample(route, input.timeSeconds, 1);
}

export function sampleShipWaterPath(path: ShipWaterPath | undefined, progress: number): { point: { x: number; y: number }; heading: { x: number; y: number } } {
  return sampleWaterPath(path, progress);
}

export function shipWaterPathKey(from: { x: number; y: number }, to: { x: number; y: number }) {
  return pathKey(from, to);
}

function scheduledDockStopsForCycle(
  route: ShipMotionRoute,
  cycleIndex: number,
  scheduledStopCount: number,
): Array<ShipMotionRoute["dockStops"][number]> {
  const scheduledStops: Array<ShipMotionRoute["dockStops"][number]> = [];
  const homeStop = route.homeDockId
    ? route.dockStops.find((stop) => stop.dockId === route.homeDockId) ?? null
    : null;
  if (homeStop && scheduledStopCount > 0) scheduledStops.push(homeStop);

  const slots = scheduledStopCount - scheduledStops.length;
  const scheduledNonHomeIds = route.dockStopSchedule
    .filter((dockId, index, dockIds) => dockId !== homeStop?.dockId && dockIds.indexOf(dockId) === index);
  const fallbackNonHomeIds = route.dockStops
    .map((stop) => stop.dockId)
    .filter((dockId) => dockId !== homeStop?.dockId);
  const nonHomeIds = scheduledNonHomeIds.length > 0 ? scheduledNonHomeIds : fallbackNonHomeIds;
  const offset = nonHomeIds.length > 0 ? positiveModulo(cycleIndex * Math.max(1, slots), nonHomeIds.length) : 0;

  for (let index = 0; index < nonHomeIds.length && scheduledStops.length < scheduledStopCount; index += 1) {
    const dockId = nonHomeIds[positiveModulo(offset + index, nonHomeIds.length)]!;
    const stop = route.dockStops.find((entry) => entry.dockId === dockId) ?? null;
    if (!stop || scheduledStops.some((entry) => entry.dockId === stop.dockId)) continue;
    scheduledStops.push(stop);
  }

  return scheduledStops.slice(0, scheduledStopCount);
}

function dockStopCount(renderedDockCount: number) {
  if (renderedDockCount <= 0) return 0;
  if (renderedDockCount === 1) return 1;
  if (renderedDockCount <= 3) return 2;
  return 3;
}

function dockedShipZoneDwell(zone: ShipWaterZone): { dockDwell: number; riskDwell: number; transit: number } {
  const base = ZONE_DWELL[zone];
  const transit = Math.min(base.transit, 1 - DOCKED_SHIP_DWELL_SHARE - 0.08);
  return {
    dockDwell: DOCKED_SHIP_DWELL_SHARE,
    riskDwell: 1 - DOCKED_SHIP_DWELL_SHARE - transit,
    transit,
  };
}

function transitSample(input: {
  route: ShipMotionRoute;
  path: ShipWaterPath | undefined;
  progress: number;
  state: Extract<ShipMotionState, "arriving" | "departing" | "sailing">;
  dockId: string | null;
}): ShipMotionSample {
  const { point, heading } = sampleShipWaterPath(input.path, input.progress);
  const dockStop = input.dockId
    ? input.route.dockStops.find((stop) => stop.dockId === input.dockId) ?? null
    : null;
  const lanePoint = transitLanePoint(point, heading, input.route, input.progress);
  return {
    shipId: input.route.shipId,
    tile: lanePoint,
    state: input.state,
    zone: input.route.zone,
    currentDockId: input.dockId,
    currentRouteStopId: dockStop?.id ?? null,
    currentRouteStopKind: dockStop?.kind ?? null,
    heading,
    wakeIntensity: transitWakeIntensityForZone(input.route.zone),
  };
}

function transitLanePoint(
  point: { x: number; y: number },
  heading: { x: number; y: number },
  route: ShipMotionRoute,
  progress: number,
): { x: number; y: number } {
  const laneStrength = Math.sin(clamp(progress, 0, 1) * Math.PI);
  if (laneStrength <= 0.01) return point;
  const laneSign = stableHash(`${route.shipId}.lane`) % 2 === 0 ? 1 : -1;
  const laneMagnitude = (0.11 + (route.routeSeed % 7) * 0.012) * laneStrength;
  return clampMotionTile({
    x: point.x + -heading.y * laneMagnitude * laneSign,
    y: point.y + heading.x * laneMagnitude * laneSign,
  });
}

function openWaterPatrolSample(route: ShipMotionRoute, timeSeconds: number): ShipMotionSample {
  if (!route.openWaterPatrol) return riskWaterSample(route, timeSeconds, 0.18);

  const cyclePosition = timeSeconds + route.phaseSeconds;
  const elapsedSeconds = positiveModulo(cyclePosition, route.cycleSeconds);
  const zoneDwell = ZONE_DWELL[route.zone];
  const riskSeconds = route.cycleSeconds * zoneDwell.riskDwell;
  const waypointSeconds = route.cycleSeconds * zoneDwell.dockDwell;
  const transitSecondsEach = (route.cycleSeconds - riskSeconds - waypointSeconds) / 2;
  let cursor = elapsedSeconds;

  if (cursor < riskSeconds) {
    return riskWaterSample(route, timeSeconds, cursor / Math.max(1, riskSeconds));
  }
  cursor -= riskSeconds;

  if (cursor < transitSecondsEach) {
    return transitSample({
      route,
      path: route.openWaterPatrol.outbound,
      progress: smoothstep(cursor / Math.max(1, transitSecondsEach)),
      state: "sailing",
      dockId: null,
    });
  }
  cursor -= transitSecondsEach;

  if (cursor < waypointSeconds) {
    return openWaterWaypointDriftSample(route, timeSeconds, cursor / Math.max(1, waypointSeconds));
  }
  cursor -= waypointSeconds;

  return transitSample({
    route,
    path: route.openWaterPatrol.inbound,
    progress: smoothstep(cursor / Math.max(1, transitSecondsEach)),
    state: "sailing",
    dockId: null,
  });
}

function openWaterWaypointDriftSample(route: ShipMotionRoute, timeSeconds: number, progress: number): ShipMotionSample {
  if (!route.openWaterPatrol) return riskDriftSample(route, timeSeconds, progress);
  const angle = timeSeconds * 0.023 + route.routeSeed * 0.00013 + progress * Math.PI * 2;
  return {
    shipId: route.shipId,
    tile: {
      x: route.openWaterPatrol.waypoint.x + Math.cos(angle) * 0.32,
      y: route.openWaterPatrol.waypoint.y + Math.sin(angle * 0.85) * 0.22,
    },
    state: "sailing",
    zone: route.zone,
    currentDockId: null,
    currentRouteStopId: null,
    currentRouteStopKind: null,
    heading: normalizeHeading({ x: -Math.sin(angle), y: Math.cos(angle * 0.85) }),
    wakeIntensity: patrolWakeIntensityForZone(route.zone),
  };
}

function mooredSample(
  route: ShipMotionRoute,
  stop: ShipMotionRoute["dockStops"][number],
  timeSeconds: number,
): ShipMotionSample {
  const seed = stableHash(`${route.shipId}.${stop.dockId}.moored`);
  const angle = timeSeconds * 0.027 + seed * 0.0001;
  const radius = mooredRadiusForZone(route.zone);
  return {
    shipId: route.shipId,
    tile: {
      x: stop.mooringTile.x + Math.cos(angle) * radius.x,
      y: stop.mooringTile.y + Math.sin(angle * 0.9) * radius.y,
    },
    state: "moored",
    zone: route.zone,
    currentDockId: stop.dockId,
    currentRouteStopId: stop.id,
    currentRouteStopKind: stop.kind,
    heading: normalizeHeading({ x: -Math.sin(angle), y: Math.cos(angle * 0.9) }),
    wakeIntensity: 0.05,
  };
}

function riskWaterSample(route: ShipMotionRoute, timeSeconds: number, progress: number): ShipMotionSample {
  if (route.riskStop?.kind === "ledger") return mooredRouteStopSample(route, route.riskStop, timeSeconds);
  return riskDriftSample(route, timeSeconds, progress);
}

function mooredRouteStopSample(
  route: ShipMotionRoute,
  stop: ShipMotionRouteStop,
  timeSeconds: number,
): ShipMotionSample {
  const seed = stableHash(`${route.shipId}.${stop.id}.moored`);
  const angle = timeSeconds * 0.018 + seed * 0.0001;
  const radius = mooredRadiusForZone(route.zone);
  return {
    shipId: route.shipId,
    tile: clampMotionTile({
      x: stop.mooringTile.x + Math.cos(angle) * radius.x * 0.72,
      y: stop.mooringTile.y + Math.sin(angle * 0.9) * radius.y * 0.72,
    }),
    state: "moored",
    zone: route.zone,
    currentDockId: null,
    currentRouteStopId: stop.id,
    currentRouteStopKind: stop.kind,
    heading: normalizeHeading({ x: -Math.sin(angle), y: Math.cos(angle * 0.9) }),
    wakeIntensity: 0.03,
  };
}

function mooredRadiusForZone(zone: ShipWaterZone): { x: number; y: number } {
  if (zone === "danger") return { x: 0.22, y: 0.14 };
  if (zone === "warning") return { x: 0.24, y: 0.16 };
  if (zone === "alert") return { x: 0.26, y: 0.17 };
  return { x: 0.28, y: 0.18 };
}

function riskDriftSample(route: ShipMotionRoute, timeSeconds: number, progress: number): ShipMotionSample {
  const angle = timeSeconds * 0.017 + route.routeSeed * 0.0001 + progress * Math.PI * 2;
  const radius = driftRadiusForZone(route.zone);
  const tile = clampMotionTile({
    x: route.riskTile.x + Math.cos(angle) * radius.x,
    y: route.riskTile.y + Math.sin(angle * 0.8) * radius.y,
  });
  return {
    shipId: route.shipId,
    tile,
    state: "risk-drift",
    zone: route.zone,
    currentDockId: null,
    currentRouteStopId: null,
    currentRouteStopKind: null,
    heading: normalizeHeading({ x: -Math.sin(angle), y: Math.cos(angle * 0.8) }),
    wakeIntensity: 0.08,
  };
}

function clampMotionTile(tile: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(MAX_TILE_X, tile.x)),
    y: Math.max(0, Math.min(MAX_TILE_Y, tile.y)),
  };
}

function driftRadiusForZone(zone: ShipWaterZone): { x: number; y: number } {
  if (zone === "danger") return { x: 0.54, y: 0.36 };
  if (zone === "warning") return { x: 0.48, y: 0.32 };
  if (zone === "alert") return { x: 0.44, y: 0.3 };
  if (zone === "watch") return { x: 0.4, y: 0.28 };
  return { x: 0.38, y: 0.26 };
}

function transitWakeIntensityForZone(zone: ShipWaterZone): number {
  if (zone === "danger") return 0.72;
  if (zone === "warning") return 0.58;
  if (zone === "alert") return 0.5;
  if (zone === "watch") return 0.42;
  if (zone === "ledger") return 0.34;
  return 0.35;
}

function patrolWakeIntensityForZone(zone: ShipWaterZone): number {
  if (zone === "danger") return 0.66;
  if (zone === "warning") return 0.54;
  if (zone === "alert") return 0.48;
  if (zone === "watch") return 0.38;
  if (zone === "ledger") return 0.3;
  return 0.28;
}
