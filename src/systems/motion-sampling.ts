import { MAX_TILE_X, MAX_TILE_Y } from "./world-layout";
import { stableHash, stableUnit } from "./stable-random";
import { DOCKED_SHIP_DWELL_SHARE, ZONE_DWELL } from "./motion-config";
import { squadForMember, squadFormationOffsetForPlacement } from "./maker-squad";
import { sampleShipWaterPathInto as sampleWaterPathInto, sampleShipWaterPath as sampleWaterPath } from "./motion-water";
import { clamp, normalizeHeadingInto, pathKey, positiveModulo, smoothstep, smoothstepRange } from "./motion-utils";
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

export function createShipMotionSample(): ShipMotionSample {
  return {
    shipId: "",
    tile: { x: 0, y: 0 },
    state: "idle",
    zone: "calm",
    currentDockId: null,
    currentRouteStopId: null,
    currentRouteStopKind: null,
    heading: { x: 0, y: 0 },
    wakeIntensity: 0,
  };
}

// Module-scope scratch sample reused for the consort branch (flagship lookup).
// Safe because resolveShipMotionSampleInto is synchronous and not re-entrant.
const flagshipScratch: ShipMotionSample = createShipMotionSample();

// Per-ship heading low-pass memory. Keyed by shipId (string) instead of ShipNode
// because the ship object can be replaced across re-renders while the id is
// stable. headingDelta caches angular velocity (rad/sec) so ship-pose can derive
// bank-into-turn without recomputing.
interface HeadingMemory {
  hx: number;
  hy: number;
  lastT: number;
  headingDelta: number;
}
const headingMemoryByShipId = new Map<string, HeadingMemory>();

export function getShipHeadingDelta(shipId: string): number {
  return headingMemoryByShipId.get(shipId)?.headingDelta ?? 0;
}

// Forward-difference scratch buffers used by transitSampleInto for the
// lane-curve aware heading. We sample the lane-displaced point a small step
// ahead and derive the tangent from the actual rendered trajectory.
const aheadPointScratch: { x: number; y: number } = { x: 0, y: 0 };
const aheadHeadingScratch: { x: number; y: number } = { x: 0, y: 0 };
const aheadLaneScratch: { x: number; y: number } = { x: 0, y: 0 };

export function resolveShipMotionSample(input: {
  plan: PharosVilleMotionPlan;
  reducedMotion: boolean;
  ship: ShipNode;
  timeSeconds: number;
}): ShipMotionSample {
  const out = createShipMotionSample();
  resolveShipMotionSampleInto(input, out);
  return out;
}

export function resolveShipMotionSampleInto(input: {
  plan: PharosVilleMotionPlan;
  reducedMotion: boolean;
  ship: ShipNode;
  timeSeconds: number;
}, out: ShipMotionSample): void {
  const route = input.plan.shipRoutes.get(input.ship.id);
  if (input.reducedMotion || !route) {
    out.shipId = input.ship.id;
    const tile = route?.riskTile ?? input.ship.riskTile;
    out.tile.x = tile.x;
    out.tile.y = tile.y;
    out.state = "idle";
    out.zone = input.ship.riskZone;
    out.currentDockId = null;
    out.currentRouteStopId = null;
    out.currentRouteStopKind = null;
    out.heading.x = 0;
    out.heading.y = 0;
    out.wakeIntensity = 0;
    return;
  }

  // Squad consorts shadow their flagship's sample with a placement-aware
  // formation offset, so the squad sails as one body through every motion
  // phase (moored, transit, drift). Without this, the flagship's dock cycle
  // leaves consorts orbiting their fixed riskTile while the flagship is away
  // — the cohesion gap documented in motion-planning.ts.
  if (input.ship.squadRole === "consort" && input.ship.squadId) {
    const squad = squadForMember(input.ship.id);
    const flagshipRoute = squad ? input.plan.shipRoutes.get(squad.flagshipId) : undefined;
    if (squad && flagshipRoute) {
      sampleRouteCycleInto(flagshipRoute, input.timeSeconds, flagshipScratch);
      // Prefer the route's cached formation offset over live computation.
      const offset = route.formationOffset
        ?? squadFormationOffsetForPlacement(input.ship.id, squad, input.ship.riskPlacement)
        ?? { dx: 0, dy: 0 };
      let tileX = flagshipScratch.tile.x + offset.dx;
      let tileY = flagshipScratch.tile.y + offset.dy;
      // #8: sub-tile breathing perturbation while the flagship is actively
      // moving; skipped when moored/idle so docked formations stay glued.
      if (flagshipScratch.state !== "moored" && flagshipScratch.state !== "idle") {
        const phase = stableUnit(`${input.ship.id}.formation-breath`) * Math.PI * 2;
        const t = input.timeSeconds;
        tileX += Math.sin(t * 0.31 + phase) * 0.18;
        tileY += Math.cos(t * 0.27 + phase * 1.1) * 0.14;
      }
      out.shipId = input.ship.id;
      clampMotionTileInto(tileX, tileY, out.tile);
      out.state = flagshipScratch.state;
      out.zone = input.ship.riskZone;
      out.currentDockId = null;
      out.currentRouteStopId = null;
      out.currentRouteStopKind = null;
      out.heading.x = flagshipScratch.heading.x;
      out.heading.y = flagshipScratch.heading.y;
      out.wakeIntensity = flagshipScratch.wakeIntensity;
      return;
    }
  }

  sampleRouteCycleInto(route, input.timeSeconds, out);
}

function sampleRouteCycleInto(route: ShipMotionRoute, timeSeconds: number, out: ShipMotionSample): void {
  const runtime = routeSamplingRuntime(route);
  if (runtime.scheduledStopCount === 0) {
    openWaterPatrolSampleInto(route, timeSeconds, out);
    return;
  }

  const cyclePosition = timeSeconds + route.phaseSeconds;
  const elapsedSeconds = positiveModulo(cyclePosition, route.cycleSeconds);
  const cycleIndex = Math.floor(cyclePosition / route.cycleSeconds);
  const stopCount = activeStopCountForCycle(runtime);
  if (stopCount === 0) {
    openWaterPatrolSampleInto(route, timeSeconds, out);
    return;
  }

  const riskSecondsEach = route.cycleSeconds * runtime.zoneDwell.riskDwell / stopCount;
  const dockSecondsEach = route.cycleSeconds * runtime.zoneDwell.dockDwell / stopCount;
  const transitSecondsEach = route.cycleSeconds * runtime.zoneDwell.transit / (stopCount * 2);
  let cursor = elapsedSeconds;

  for (let stopIndex = 0; stopIndex < stopCount; stopIndex += 1) {
    const stop = scheduledDockStopAt(runtime, cycleIndex, stopIndex);
    const nextStop = scheduledDockStopAt(runtime, cycleIndex, (stopIndex + 1) % stopCount);
    if (!stop || !nextStop) break;

    if (cursor < dockSecondsEach) {
      mooredSampleInto(route, stop, timeSeconds, runtime, out);
      return;
    }
    cursor -= dockSecondsEach;

    if (cursor < transitSecondsEach) {
      transitSampleInto({
        route,
        path: runtime.stopToRiskPathByDockId.get(stop.dockId),
        progress: smoothstep(cursor / Math.max(1, transitSecondsEach)),
        state: "departing",
        routeStop: stop,
        fromMooringStop: stop,
        toMooringStop: null,
        timeSeconds,
        runtime,
      }, out);
      return;
    }
    cursor -= transitSecondsEach;

    if (cursor < riskSecondsEach) {
      riskWaterSampleInto(route, timeSeconds, cursor / Math.max(1, riskSecondsEach), out);
      return;
    }
    cursor -= riskSecondsEach;

    if (cursor < transitSecondsEach) {
      transitSampleInto({
        route,
        path: runtime.riskToStopPathByDockId.get(nextStop.dockId),
        progress: smoothstep(cursor / Math.max(1, transitSecondsEach)),
        state: "arriving",
        routeStop: nextStop,
        fromMooringStop: null,
        toMooringStop: nextStop,
        timeSeconds,
        runtime,
      }, out);
      return;
    }
    cursor -= transitSecondsEach;
  }

  riskWaterSampleInto(route, timeSeconds, 1, out);
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

// Scratch tile reused inside transitSampleInto: holds the lane-adjusted point
// before mooring blend writes it into out.tile.
const transitTileScratch: { x: number; y: number } = { x: 0, y: 0 };

function transitSampleInto(input: {
  route: ShipMotionRoute;
  path: ShipWaterPath | undefined;
  progress: number;
  routeStop: ShipMotionRoute["dockStops"][number] | null;
  runtime: RouteSamplingRuntime;
  state: Extract<ShipMotionState, "arriving" | "departing" | "sailing">;
  fromMooringStop: ShipMotionRoute["dockStops"][number] | null;
  toMooringStop: ShipMotionRoute["dockStops"][number] | null;
  timeSeconds: number;
}, out: ShipMotionSample): void {
  // Write water-path point/heading directly into out.tile / out.heading.
  sampleWaterPathInto(input.path, input.progress, out.tile, out.heading);
  // Apply lane offset (uses heading); write through a scratch tile because
  // the lane formula reads the un-offset point.
  transitLanePointInto(out.tile, out.heading, input.progress, input.runtime, transitTileScratch);
  out.tile.x = transitTileScratch.x;
  out.tile.y = transitTileScratch.y;

  // #6: derive heading from the forward-difference along the lane-displaced
  // trajectory rather than the raw path tangent. Without this, the lane bulge
  // shifts position perpendicular while heading stays straight, producing a
  // visible "crab" sideways motion.
  const aheadProgress = Math.min(1, input.progress + 0.01);
  sampleWaterPathInto(input.path, aheadProgress, aheadPointScratch, aheadHeadingScratch);
  transitLanePointInto(aheadPointScratch, aheadHeadingScratch, aheadProgress, input.runtime, aheadLaneScratch);
  const fdx = aheadLaneScratch.x - out.tile.x;
  const fdy = aheadLaneScratch.y - out.tile.y;
  if (fdx !== 0 || fdy !== 0) {
    normalizeHeadingInto(fdx, fdy, out.heading);
  }

  applyMooringBlendInto({
    progress: input.progress,
    route: input.route,
    fromMooringStop: input.fromMooringStop,
    toMooringStop: input.toMooringStop,
    timeSeconds: input.timeSeconds,
    runtime: input.runtime,
  }, out.tile);
  out.shipId = input.route.shipId;
  out.state = input.state;
  out.zone = input.route.zone;
  out.currentDockId = input.routeStop?.dockId ?? null;
  out.currentRouteStopId = input.routeStop?.id ?? null;
  out.currentRouteStopKind = input.routeStop?.kind ?? null;

  // #5: speed-aware wake. departing/arriving accelerate from rest and decelerate
  // back to rest, so wake should peak mid-leg. sailing (open-water patrol) is
  // mid-leg by construction and stays at full intensity.
  const baseWake = transitWakeIntensityForZone(input.route.zone);
  if (input.state === "departing" || input.state === "arriving") {
    const speedEnvelope = 4 * input.progress * (1 - input.progress);
    out.wakeIntensity = baseWake * speedEnvelope;
  } else {
    out.wakeIntensity = baseWake;
  }

  // #4: per-ship heading low-pass filter. Path-segment tangents jump at every
  // internal waypoint vertex; without smoothing ships visibly twitch when
  // crossing 4-connected A* corners. Skipped for moored/risk-drift (those have
  // intentional orbital headings) and for reduced-motion (deterministic snapshot).
  applyHeadingSmoothing(input.route.shipId, input.state, input.timeSeconds, out.heading);
}

function applyHeadingSmoothing(
  shipId: string,
  state: ShipMotionState,
  timeSeconds: number,
  heading: { x: number; y: number },
): void {
  const memory = headingMemoryByShipId.get(shipId);
  if (memory) {
    // Clamp dt: defends against tab-resume jumps where timeSeconds advances
    // by minutes and the filter would otherwise snap straight to the target.
    const dt = Math.max(0, Math.min(0.1, timeSeconds - memory.lastT));
    // "arriving" turns sharper into the mooring; sailing/departing breathe.
    const tau = state === "arriving" ? 0.06 : 0.18;
    const alpha = 1 - Math.exp(-dt / tau);
    const targetX = heading.x;
    const targetY = heading.y;
    const hx = memory.hx + (targetX - memory.hx) * alpha;
    const hy = memory.hy + (targetY - memory.hy) * alpha;
    normalizeHeadingInto(hx, hy, heading);

    // Track signed angular velocity for ship-pose's bank-into-turn.
    let headingDelta = 0;
    if (dt > 0) {
      const dot = memory.hx * heading.x + memory.hy * heading.y;
      const cross = memory.hx * heading.y - memory.hy * heading.x;
      headingDelta = Math.atan2(cross, dot) / dt;
    }
    memory.hx = heading.x;
    memory.hy = heading.y;
    memory.lastT = timeSeconds;
    memory.headingDelta = headingDelta;
    return;
  }
  headingMemoryByShipId.set(shipId, {
    hx: heading.x,
    hy: heading.y,
    lastT: timeSeconds,
    headingDelta: 0,
  });
}

function applyMooringBlendInto(input: {
  progress: number;
  route: ShipMotionRoute;
  fromMooringStop: ShipMotionRoute["dockStops"][number] | null;
  runtime: RouteSamplingRuntime;
  toMooringStop: ShipMotionRoute["dockStops"][number] | null;
  timeSeconds: number;
}, tile: { x: number; y: number }): void {
  let dx = 0;
  let dy = 0;
  if (input.fromMooringStop) {
    const easeIn = smoothstepRange(0, 0.15, input.progress);
    const seed = mooredSeedFor(input.route, input.fromMooringStop, input.runtime);
    const angle = input.timeSeconds * 0.027 + seed * 0.0001;
    const radius = mooredRadiusForZone(input.route.zone);
    dx += Math.cos(angle) * radius.x * (1 - easeIn);
    dy += Math.sin(angle * 0.9) * radius.y * (1 - easeIn);
  }
  if (input.toMooringStop) {
    const easeOut = smoothstepRange(0.85, 1, input.progress);
    const seed = mooredSeedFor(input.route, input.toMooringStop, input.runtime);
    const angle = input.timeSeconds * 0.027 + seed * 0.0001;
    const radius = mooredRadiusForZone(input.route.zone);
    dx += Math.cos(angle) * radius.x * easeOut;
    dy += Math.sin(angle * 0.9) * radius.y * easeOut;
  }
  if (dx === 0 && dy === 0) return;
  clampMotionTileInto(tile.x + dx, tile.y + dy, tile);
}

function transitLanePointInto(
  point: { x: number; y: number },
  heading: { x: number; y: number },
  progress: number,
  runtime: RouteSamplingRuntime,
  out: { x: number; y: number },
): void {
  const laneStrength = Math.sin(clamp(progress, 0, 1) * Math.PI);
  if (laneStrength <= 0.01) {
    out.x = point.x;
    out.y = point.y;
    return;
  }
  const laneMagnitude = runtime.laneMagnitude * laneStrength;
  clampMotionTileInto(
    point.x + -heading.y * laneMagnitude * runtime.laneSign,
    point.y + heading.x * laneMagnitude * runtime.laneSign,
    out,
  );
}

function openWaterPatrolSampleInto(route: ShipMotionRoute, timeSeconds: number, out: ShipMotionSample): void {
  if (!route.openWaterPatrol) {
    riskWaterSampleInto(route, timeSeconds, 0.18, out);
    return;
  }
  const runtime = routeSamplingRuntime(route);

  const cyclePosition = timeSeconds + route.phaseSeconds;
  const elapsedSeconds = positiveModulo(cyclePosition, route.cycleSeconds);
  const zoneDwell = ZONE_DWELL[route.zone];
  const riskSeconds = route.cycleSeconds * zoneDwell.riskDwell;
  const waypointSeconds = route.cycleSeconds * zoneDwell.dockDwell;
  const transitSecondsEach = (route.cycleSeconds - riskSeconds - waypointSeconds) / 2;
  let cursor = elapsedSeconds;

  if (cursor < riskSeconds) {
    riskWaterSampleInto(route, timeSeconds, cursor / Math.max(1, riskSeconds), out);
    return;
  }
  cursor -= riskSeconds;

  if (cursor < transitSecondsEach) {
    transitSampleInto({
      route,
      path: route.openWaterPatrol.outbound,
      progress: smoothstep(cursor / Math.max(1, transitSecondsEach)),
      routeStop: null,
      runtime,
      state: "sailing",
      fromMooringStop: null,
      toMooringStop: null,
      timeSeconds,
    }, out);
    return;
  }
  cursor -= transitSecondsEach;

  if (cursor < waypointSeconds) {
    openWaterWaypointDriftSampleInto(route, timeSeconds, cursor / Math.max(1, waypointSeconds), out);
    return;
  }
  cursor -= waypointSeconds;

  transitSampleInto({
    route,
    path: route.openWaterPatrol.inbound,
    progress: smoothstep(cursor / Math.max(1, transitSecondsEach)),
    routeStop: null,
    runtime,
    state: "sailing",
    fromMooringStop: null,
    toMooringStop: null,
    timeSeconds,
  }, out);
}

function openWaterWaypointDriftSampleInto(route: ShipMotionRoute, timeSeconds: number, progress: number, out: ShipMotionSample): void {
  if (!route.openWaterPatrol) {
    riskDriftSampleInto(route, timeSeconds, progress, out);
    return;
  }
  const angle = timeSeconds * 0.023 + route.routeSeed * 0.00013 + progress * Math.PI * 2;
  out.shipId = route.shipId;
  out.tile.x = route.openWaterPatrol.waypoint.x + Math.cos(angle) * 0.32;
  out.tile.y = route.openWaterPatrol.waypoint.y + Math.sin(angle * 0.85) * 0.22;
  out.state = "sailing";
  out.zone = route.zone;
  out.currentDockId = null;
  out.currentRouteStopId = null;
  out.currentRouteStopKind = null;
  normalizeHeadingInto(-Math.sin(angle), Math.cos(angle * 0.85), out.heading);
  out.wakeIntensity = patrolWakeIntensityForZone(route.zone);
}

function mooredSampleInto(
  route: ShipMotionRoute,
  stop: ShipMotionRoute["dockStops"][number],
  timeSeconds: number,
  runtime: RouteSamplingRuntime,
  out: ShipMotionSample,
): void {
  const seed = mooredSeedFor(route, stop, runtime);
  const angle = timeSeconds * 0.027 + seed * 0.0001;
  const radius = mooredRadiusForZone(route.zone);
  out.shipId = route.shipId;
  out.tile.x = stop.mooringTile.x + Math.cos(angle) * radius.x;
  out.tile.y = stop.mooringTile.y + Math.sin(angle * 0.9) * radius.y;
  out.state = "moored";
  out.zone = route.zone;
  out.currentDockId = stop.dockId;
  out.currentRouteStopId = stop.id;
  out.currentRouteStopKind = stop.kind;
  // Anchor heading around the dock's natural mooring axis when available so
  // moored boats sway around their berth instead of sweeping full-circle.
  writeMooredHeading(stop.dockTangent, angle, out.heading);
  out.wakeIntensity = 0.05;
}

function writeMooredHeading(
  dockTangent: { x: number; y: number } | null,
  angle: number,
  heading: { x: number; y: number },
): void {
  if (dockTangent) {
    const sway = 0.08;
    const swayX = -Math.sin(angle) * sway;
    const swayY = Math.cos(angle * 0.9) * sway;
    normalizeHeadingInto(dockTangent.x + swayX, dockTangent.y + swayY, heading);
    return;
  }
  normalizeHeadingInto(-Math.sin(angle), Math.cos(angle * 0.9), heading);
}

function mooredSeedFor(
  route: ShipMotionRoute,
  stop: ShipMotionRouteStop,
  runtime: RouteSamplingRuntime,
): number {
  const cached = runtime.mooredSeedByStopId.get(stop.id);
  if (cached !== undefined) return cached;
  const dockKey = stop.kind === "dock" ? stop.dockId : stop.id;
  return stableHash(`${route.shipId}.${dockKey}.moored`);
}

function riskWaterSampleInto(route: ShipMotionRoute, timeSeconds: number, progress: number, out: ShipMotionSample): void {
  if (route.riskStop?.kind === "ledger") {
    if (route.openWaterPatrol) {
      ledgerRoamingSampleInto(route, route.riskStop, timeSeconds, progress, out);
      return;
    }
    mooredRouteStopSampleInto(route, route.riskStop, timeSeconds, out);
    return;
  }
  riskDriftSampleInto(route, timeSeconds, progress, out);
}

function ledgerRoamingSampleInto(
  route: ShipMotionRoute,
  stop: ShipMotionRouteStop,
  timeSeconds: number,
  progress: number,
  out: ShipMotionSample,
): void {
  const patrol = route.openWaterPatrol;
  if (!patrol) {
    mooredRouteStopSampleInto(route, stop, timeSeconds, out);
    return;
  }

  const idleShare = 0.58;
  if (progress <= idleShare) {
    mooredRouteStopSampleInto(route, stop, timeSeconds, out);
    return;
  }

  const runtime = routeSamplingRuntime(route);
  const patrolProgress = (progress - idleShare) / Math.max(0.0001, 1 - idleShare);
  if (patrolProgress < 0.5) {
    transitSampleInto({
      route,
      path: patrol.outbound,
      progress: smoothstep(patrolProgress * 2),
      state: "sailing",
      routeStop: null,
      fromMooringStop: null,
      toMooringStop: null,
      timeSeconds,
      runtime,
    }, out);
    return;
  }

  transitSampleInto({
    route,
    path: patrol.inbound,
    progress: smoothstep((patrolProgress - 0.5) * 2),
    state: "sailing",
    routeStop: null,
    fromMooringStop: null,
    toMooringStop: null,
    timeSeconds,
    runtime,
  }, out);
}

function mooredRouteStopSampleInto(
  route: ShipMotionRoute,
  stop: ShipMotionRouteStop,
  timeSeconds: number,
  out: ShipMotionSample,
): void {
  const runtime = routeSamplingRuntime(route);
  const seed = mooredSeedFor(route, stop, runtime);
  const angle = timeSeconds * 0.018 + seed * 0.0001;
  const radius = mooredRadiusForZone(route.zone);
  out.shipId = route.shipId;
  clampMotionTileInto(
    stop.mooringTile.x + Math.cos(angle) * radius.x * 0.72,
    stop.mooringTile.y + Math.sin(angle * 0.9) * radius.y * 0.72,
    out.tile,
  );
  out.state = "moored";
  out.zone = route.zone;
  out.currentDockId = null;
  out.currentRouteStopId = stop.id;
  out.currentRouteStopKind = stop.kind;
  writeMooredHeading(stop.dockTangent, angle, out.heading);
  out.wakeIntensity = 0.03;
}

function mooredRadiusForZone(zone: ShipWaterZone): { x: number; y: number } {
  if (zone === "danger") return { x: 0.22, y: 0.14 };
  if (zone === "warning") return { x: 0.24, y: 0.16 };
  if (zone === "alert") return { x: 0.26, y: 0.17 };
  return { x: 0.28, y: 0.18 };
}

function riskDriftSampleInto(route: ShipMotionRoute, timeSeconds: number, progress: number, out: ShipMotionSample): void {
  const angle = timeSeconds * 0.017 + route.routeSeed * 0.0001 + progress * Math.PI * 2;
  const radius = driftRadiusForZone(route.zone);
  out.shipId = route.shipId;
  clampMotionTileInto(
    route.riskTile.x + Math.cos(angle) * radius.x,
    route.riskTile.y + Math.sin(angle * 0.8) * radius.y,
    out.tile,
  );
  out.state = "risk-drift";
  out.zone = route.zone;
  out.currentDockId = null;
  out.currentRouteStopId = null;
  out.currentRouteStopKind = null;
  normalizeHeadingInto(-Math.sin(angle), Math.cos(angle * 0.8), out.heading);
  out.wakeIntensity = 0.08;
}

function clampMotionTileInto(x: number, y: number, out: { x: number; y: number }): void {
  out.x = Math.max(0, Math.min(MAX_TILE_X, x));
  out.y = Math.max(0, Math.min(MAX_TILE_Y, y));
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
