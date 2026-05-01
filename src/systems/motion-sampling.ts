import { MAX_TILE_X, MAX_TILE_Y } from "./world-layout";
import { stableHash } from "./stable-random";
import { DOCKED_SHIP_DWELL_SHARE, ZONE_DWELL } from "./motion-config";
import { sampleShipWaterPath as sampleWaterPath } from "./motion-water";
import { clamp, normalizeHeading, pathKey, positiveModulo, smoothstep, smoothstepRange } from "./motion-utils";
import type { PharosVilleMotionPlan, ShipMotionRoute, ShipMotionRouteStop, ShipMotionSample, ShipMotionState, ShipWaterPath } from "./motion-types";
import type { ShipNode, ShipWaterZone } from "./world-types";

interface RouteSamplingRuntime {
  dockStopByDockId: ReadonlyMap<string, ShipMotionRoute["dockStops"][number]>;
  fallbackNonHomeStops: readonly ShipMotionRoute["dockStops"][number][];
  homeStop: ShipMotionRoute["dockStops"][number] | null;
  laneMagnitude: number;
  laneSign: -1 | 1;
  mooredSeedByStopId: ReadonlyMap<string, number>;
  riskToStopPathByDockId: ReadonlyMap<string, ShipWaterPath | undefined>;
  scheduledNonHomeStops: readonly ShipMotionRoute["dockStops"][number][];
  scheduledStopCount: number;
  stopSlotsExcludingHome: number;
  stopToRiskPathByDockId: ReadonlyMap<string, ShipWaterPath | undefined>;
  zoneDwell: { dockDwell: number; riskDwell: number; transit: number };
}

const routeSamplingRuntimeCache = new WeakMap<ShipMotionRoute, RouteSamplingRuntime>();

function routeSamplingRuntime(route: ShipMotionRoute): RouteSamplingRuntime {
  const cached = routeSamplingRuntimeCache.get(route);
  if (cached) return cached;

  const dockStopByDockId = new Map<string, ShipMotionRoute["dockStops"][number]>();
  const mooredSeedByStopId = new Map<string, number>();
  for (const stop of route.dockStops) {
    dockStopByDockId.set(stop.dockId, stop);
    mooredSeedByStopId.set(stop.id, stableHash(`${route.shipId}.${stop.dockId}.moored`));
  }
  if (route.riskStop) {
    mooredSeedByStopId.set(route.riskStop.id, stableHash(`${route.shipId}.${route.riskStop.id}.moored`));
  }

  const homeStop = route.homeDockId ? dockStopByDockId.get(route.homeDockId) ?? null : null;
  const scheduledStopCount = Math.min(dockStopCount(route.dockStops.length), route.dockStopSchedule.length);
  const fallbackNonHomeStops = route.dockStops.filter((stop) => stop.dockId !== homeStop?.dockId);
  const scheduledNonHomeStops = route.dockStopSchedule
    .filter((dockId, index, dockIds) => dockId !== homeStop?.dockId && dockIds.indexOf(dockId) === index)
    .map((dockId) => dockStopByDockId.get(dockId))
    .filter((stop): stop is ShipMotionRoute["dockStops"][number] => Boolean(stop));
  const effectiveNonHomeStops = scheduledNonHomeStops.length > 0 ? scheduledNonHomeStops : fallbackNonHomeStops;
  const stopSlotsExcludingHome = Math.max(0, scheduledStopCount - (homeStop ? 1 : 0));

  const riskToStopPathByDockId = new Map<string, ShipWaterPath | undefined>();
  const stopToRiskPathByDockId = new Map<string, ShipWaterPath | undefined>();
  for (const stop of route.dockStops) {
    riskToStopPathByDockId.set(stop.dockId, route.waterPaths.get(pathKey(route.riskTile, stop.mooringTile)));
    stopToRiskPathByDockId.set(stop.dockId, route.waterPaths.get(pathKey(stop.mooringTile, route.riskTile)));
  }

  const runtime: RouteSamplingRuntime = {
    dockStopByDockId,
    fallbackNonHomeStops,
    homeStop,
    laneMagnitude: 0.11 + (route.routeSeed % 7) * 0.012,
    laneSign: stableHash(`${route.shipId}.lane`) % 2 === 0 ? 1 : -1,
    mooredSeedByStopId,
    riskToStopPathByDockId,
    scheduledNonHomeStops: effectiveNonHomeStops,
    scheduledStopCount,
    stopSlotsExcludingHome,
    stopToRiskPathByDockId,
    zoneDwell: dockedShipZoneDwell(route.zone),
  };
  routeSamplingRuntimeCache.set(route, runtime);
  return runtime;
}

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

  const runtime = routeSamplingRuntime(route);
  if (runtime.scheduledStopCount === 0) {
    return openWaterPatrolSample(route, input.timeSeconds);
  }

  const cyclePosition = input.timeSeconds + route.phaseSeconds;
  const elapsedSeconds = positiveModulo(cyclePosition, route.cycleSeconds);
  const cycleIndex = Math.floor(cyclePosition / route.cycleSeconds);
  const stopCount = activeStopCountForCycle(runtime);
  if (stopCount === 0) return openWaterPatrolSample(route, input.timeSeconds);

  const riskSecondsEach = route.cycleSeconds * runtime.zoneDwell.riskDwell / stopCount;
  const dockSecondsEach = route.cycleSeconds * runtime.zoneDwell.dockDwell / stopCount;
  const transitSecondsEach = route.cycleSeconds * runtime.zoneDwell.transit / (stopCount * 2);
  let cursor = elapsedSeconds;

  for (let stopIndex = 0; stopIndex < stopCount; stopIndex += 1) {
    const stop = scheduledDockStopAt(runtime, cycleIndex, stopIndex);
    const nextStop = scheduledDockStopAt(runtime, cycleIndex, (stopIndex + 1) % stopCount);
    if (!stop || !nextStop) break;

    if (cursor < dockSecondsEach) {
      return mooredSample(route, stop, input.timeSeconds, runtime);
    }
    cursor -= dockSecondsEach;

    if (cursor < transitSecondsEach) {
      return transitSample({
        route,
        path: runtime.stopToRiskPathByDockId.get(stop.dockId),
        progress: smoothstep(cursor / Math.max(1, transitSecondsEach)),
        state: "departing",
        routeStop: stop,
        fromMooringStop: stop,
        toMooringStop: null,
        timeSeconds: input.timeSeconds,
        runtime,
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
        path: runtime.riskToStopPathByDockId.get(nextStop.dockId),
        progress: smoothstep(cursor / Math.max(1, transitSecondsEach)),
        state: "arriving",
        routeStop: nextStop,
        fromMooringStop: null,
        toMooringStop: nextStop,
        timeSeconds: input.timeSeconds,
        runtime,
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

function activeStopCountForCycle(runtime: RouteSamplingRuntime): number {
  if (runtime.scheduledStopCount <= 0) return 0;
  const homeCount = runtime.homeStop ? 1 : 0;
  return Math.min(runtime.scheduledStopCount, homeCount + runtime.scheduledNonHomeStops.length);
}

function scheduledDockStopAt(
  runtime: RouteSamplingRuntime,
  cycleIndex: number,
  stopIndex: number,
): ShipMotionRoute["dockStops"][number] | null {
  if (runtime.scheduledStopCount <= 0) return null;
  if (runtime.homeStop && stopIndex === 0) return runtime.homeStop;
  const nonHomeStops = runtime.scheduledNonHomeStops.length > 0
    ? runtime.scheduledNonHomeStops
    : runtime.fallbackNonHomeStops;
  if (nonHomeStops.length === 0) return runtime.homeStop;
  const localIndex = stopIndex - (runtime.homeStop ? 1 : 0);
  if (localIndex < 0) return runtime.homeStop;
  const stride = Math.max(1, runtime.stopSlotsExcludingHome);
  const offset = positiveModulo(cycleIndex * stride, nonHomeStops.length);
  return nonHomeStops[positiveModulo(offset + localIndex, nonHomeStops.length)] ?? null;
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
  routeStop: ShipMotionRoute["dockStops"][number] | null;
  runtime: RouteSamplingRuntime;
  state: Extract<ShipMotionState, "arriving" | "departing" | "sailing">;
  fromMooringStop: ShipMotionRoute["dockStops"][number] | null;
  toMooringStop: ShipMotionRoute["dockStops"][number] | null;
  timeSeconds: number;
}): ShipMotionSample {
  const { point, heading } = sampleShipWaterPath(input.path, input.progress);
  const lanePoint = transitLanePoint(point, heading, input.progress, input.runtime);
  const blendedTile = applyMooringBlend({
    tile: lanePoint,
    progress: input.progress,
    route: input.route,
    fromMooringStop: input.fromMooringStop,
    toMooringStop: input.toMooringStop,
    timeSeconds: input.timeSeconds,
    runtime: input.runtime,
  });
  return {
    shipId: input.route.shipId,
    tile: blendedTile,
    state: input.state,
    zone: input.route.zone,
    currentDockId: input.routeStop?.dockId ?? null,
    currentRouteStopId: input.routeStop?.id ?? null,
    currentRouteStopKind: input.routeStop?.kind ?? null,
    heading,
    wakeIntensity: transitWakeIntensityForZone(input.route.zone),
  };
}

function applyMooringBlend(input: {
  tile: { x: number; y: number };
  progress: number;
  route: ShipMotionRoute;
  fromMooringStop: ShipMotionRoute["dockStops"][number] | null;
  runtime: RouteSamplingRuntime;
  toMooringStop: ShipMotionRoute["dockStops"][number] | null;
  timeSeconds: number;
}): { x: number; y: number } {
  let dx = 0;
  let dy = 0;
  if (input.fromMooringStop) {
    const easeIn = smoothstepRange(0, 0.15, input.progress);
    const offset = mooredOffset(input.route, input.fromMooringStop, input.timeSeconds, input.runtime);
    dx += offset.dx * (1 - easeIn);
    dy += offset.dy * (1 - easeIn);
  }
  if (input.toMooringStop) {
    const easeOut = smoothstepRange(0.85, 1, input.progress);
    const offset = mooredOffset(input.route, input.toMooringStop, input.timeSeconds, input.runtime);
    dx += offset.dx * easeOut;
    dy += offset.dy * easeOut;
  }
  if (dx === 0 && dy === 0) return input.tile;
  return clampMotionTile({ x: input.tile.x + dx, y: input.tile.y + dy });
}

function transitLanePoint(
  point: { x: number; y: number },
  heading: { x: number; y: number },
  progress: number,
  runtime: RouteSamplingRuntime,
): { x: number; y: number } {
  const laneStrength = Math.sin(clamp(progress, 0, 1) * Math.PI);
  if (laneStrength <= 0.01) return point;
  const laneMagnitude = runtime.laneMagnitude * laneStrength;
  return clampMotionTile({
    x: point.x + -heading.y * laneMagnitude * runtime.laneSign,
    y: point.y + heading.x * laneMagnitude * runtime.laneSign,
  });
}

function openWaterPatrolSample(route: ShipMotionRoute, timeSeconds: number): ShipMotionSample {
  if (!route.openWaterPatrol) return riskWaterSample(route, timeSeconds, 0.18);
  const runtime = routeSamplingRuntime(route);

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
      routeStop: null,
      runtime,
      state: "sailing",
      fromMooringStop: null,
      toMooringStop: null,
      timeSeconds,
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
    routeStop: null,
    runtime,
    state: "sailing",
    fromMooringStop: null,
    toMooringStop: null,
    timeSeconds,
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
  runtime: RouteSamplingRuntime,
): ShipMotionSample {
  const seed = runtime.mooredSeedByStopId.get(stop.id) ?? stableHash(`${route.shipId}.${stop.dockId}.moored`);
  const angle = timeSeconds * 0.027 + seed * 0.0001;
  const offset = mooredOffset(route, stop, timeSeconds, runtime);
  return {
    shipId: route.shipId,
    tile: {
      x: stop.mooringTile.x + offset.dx,
      y: stop.mooringTile.y + offset.dy,
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

function mooredOffset(
  route: ShipMotionRoute,
  stop: ShipMotionRoute["dockStops"][number],
  timeSeconds: number,
  runtime: RouteSamplingRuntime,
): { dx: number; dy: number } {
  const seed = runtime.mooredSeedByStopId.get(stop.id) ?? stableHash(`${route.shipId}.${stop.dockId}.moored`);
  const angle = timeSeconds * 0.027 + seed * 0.0001;
  const radius = mooredRadiusForZone(route.zone);
  return {
    dx: Math.cos(angle) * radius.x,
    dy: Math.sin(angle * 0.9) * radius.y,
  };
}

function riskWaterSample(route: ShipMotionRoute, timeSeconds: number, progress: number): ShipMotionSample {
  if (route.riskStop?.kind === "ledger") {
    if (route.openWaterPatrol) return ledgerRoamingSample(route, route.riskStop, timeSeconds, progress);
    return mooredRouteStopSample(route, route.riskStop, timeSeconds);
  }
  return riskDriftSample(route, timeSeconds, progress);
}

function ledgerRoamingSample(
  route: ShipMotionRoute,
  stop: ShipMotionRouteStop,
  timeSeconds: number,
  progress: number,
): ShipMotionSample {
  const patrol = route.openWaterPatrol;
  if (!patrol) return mooredRouteStopSample(route, stop, timeSeconds);

  const idleShare = 0.58;
  if (progress <= idleShare) return mooredRouteStopSample(route, stop, timeSeconds);

  const runtime = routeSamplingRuntime(route);
  const patrolProgress = (progress - idleShare) / Math.max(0.0001, 1 - idleShare);
  if (patrolProgress < 0.5) {
    return transitSample({
      route,
      path: patrol.outbound,
      progress: smoothstep(patrolProgress * 2),
      state: "sailing",
      routeStop: null,
      fromMooringStop: null,
      toMooringStop: null,
      timeSeconds,
      runtime,
    });
  }

  return transitSample({
    route,
    path: patrol.inbound,
    progress: smoothstep((patrolProgress - 0.5) * 2),
    state: "sailing",
    routeStop: null,
    fromMooringStop: null,
    toMooringStop: null,
    timeSeconds,
    runtime,
  });
}

function mooredRouteStopSample(
  route: ShipMotionRoute,
  stop: ShipMotionRouteStop,
  timeSeconds: number,
): ShipMotionSample {
  const runtime = routeSamplingRuntime(route);
  const seed = runtime.mooredSeedByStopId.get(stop.id) ?? stableHash(`${route.shipId}.${stop.id}.moored`);
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
