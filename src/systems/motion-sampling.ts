import { MAX_TILE_X, MAX_TILE_Y } from "./world-layout";
import { stableHash, stableUnit } from "./stable-random";
import { DOCKED_SHIP_DWELL_SHARE, ZONE_DWELL } from "./motion-config";
import { squadForMember, squadFormationOffsetForPlacement } from "./maker-squad";
import { sampleShipWaterPathInto as sampleWaterPathInto, sampleShipWaterPath as sampleWaterPath, clearShipWaterSegmentHint } from "./motion-water";
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
  mooredPhaseByStopId: ReadonlyMap<string, number>;
  mooredRadiusMultiplierByStopId: ReadonlyMap<string, number>;
  riskToStopPathByDockId: ReadonlyMap<string, ShipWaterPath | undefined>;
  scheduledNonHomeStops: readonly ShipMotionRoute["dockStops"][number][];
  scheduledStopCount: number;
  stopSlotsExcludingHome: number;
  stopToRiskPathByDockId: ReadonlyMap<string, ShipWaterPath | undefined>;
  zoneDwell: { dockDwell: number; riskDwell: number; transit: number };
}

// WeakMap (not a plain Map keyed by shipId) is intentional: the runtime is
// derived from the ShipMotionRoute object and becomes invalid the moment a new
// route replaces it (e.g. on motion-plan rebuild). WeakMap auto-evicts the
// stale entry as soon as the route is garbage-collected, with no manual
// cleanup required. A shipId-keyed Map would either leak runtimes across
// rebuilds or need an explicit invalidation hook; either is worse than the
// single-pointer indirection cost here. (perf F9 considered + skipped)
const routeSamplingRuntimeCache = new WeakMap<ShipMotionRoute, RouteSamplingRuntime>();

function routeSamplingRuntime(route: ShipMotionRoute): RouteSamplingRuntime {
  const cached = routeSamplingRuntimeCache.get(route);
  if (cached) return cached;

  const dockStopByDockId = new Map<string, ShipMotionRoute["dockStops"][number]>();
  const mooredSeedByStopId = new Map<string, number>();
  const mooredPhaseByStopId = new Map<string, number>();
  const mooredRadiusMultiplierByStopId = new Map<string, number>();
  const radiusStableUnitSigned = (stableUnit(`${route.shipId}.moored-radius`) - 0.5) * 2;
  const radiusMultiplier = 1 + 0.15 * radiusStableUnitSigned;
  const phaseOffset = (stableHash(`${route.shipId}.moored-phase`) % 1000) / 1000 * Math.PI * 2;
  for (const stop of route.dockStops) {
    dockStopByDockId.set(stop.dockId, stop);
    mooredSeedByStopId.set(stop.id, stableHash(`${route.shipId}.${stop.dockId}.moored`));
    mooredPhaseByStopId.set(stop.id, phaseOffset);
    mooredRadiusMultiplierByStopId.set(stop.id, radiusMultiplier);
  }
  if (route.riskStop) {
    mooredSeedByStopId.set(route.riskStop.id, stableHash(`${route.shipId}.${route.riskStop.id}.moored`));
    mooredPhaseByStopId.set(route.riskStop.id, phaseOffset);
    mooredRadiusMultiplierByStopId.set(route.riskStop.id, radiusMultiplier);
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
    mooredPhaseByStopId,
    mooredRadiusMultiplierByStopId,
    riskToStopPathByDockId,
    scheduledNonHomeStops: effectiveNonHomeStops,
    scheduledStopCount,
    stopSlotsExcludingHome,
    stopToRiskPathByDockId,
    zoneDwell: dockedShipZoneDwell(route.zone, route.dockDwellShareOverride),
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

// D3: per-ship formation offset cache. Tracks the last-seen formationOffset for
// each consort so placement changes can be detected at sample time.
interface FormationOffsetEntry {
  dx: number;
  dy: number;
  lastFormationChangeAt: number;
  prevDx: number;
  prevDy: number;
}
const formationOffsetCacheByShipId = new Map<string, FormationOffsetEntry>();

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

// D3: flush per-ship heading memory (and wake memory) when formation offset
// changes so heading converges fresh from the new position.
export function clearShipHeadingMemory(shipId: string): void {
  headingMemoryByShipId.delete(shipId);
  wakeIntensityMemoryByShipId.delete(shipId);
  clearShipWaterSegmentHint(shipId);
}

// D1: per-ship wake intensity low-pass memory. Mirrors headingMemoryByShipId.
// Prevents a one-frame jump from full baseWake (sailing) to 0 (arriving at
// progress=0, where 4*0*(1-0)=0).
interface WakeMemory {
  wake: number;
  lastT: number;
}
const wakeIntensityMemoryByShipId = new Map<string, WakeMemory>();

export function getShipWakeIntensityMemory(shipId: string): WakeMemory | undefined {
  return wakeIntensityMemoryByShipId.get(shipId);
}

function applyWakeSmoothing(shipId: string, timeSeconds: number, rawWake: number): number {
  const memory = wakeIntensityMemoryByShipId.get(shipId);
  if (!memory) {
    wakeIntensityMemoryByShipId.set(shipId, { wake: rawWake, lastT: timeSeconds });
    return rawWake;
  }
  const rawDt = timeSeconds - memory.lastT;
  // Cold-start: tab-resume, very long pause, or time went backward (new sampling
  // session in tests). Write rawWake directly to avoid cross-session leakage.
  if (rawDt > 1.0 || rawDt < 0) {
    memory.wake = rawWake;
    memory.lastT = timeSeconds;
    return rawWake;
  }
  const dt = Math.min(0.5, rawDt);
  const tau = 0.15;
  const alpha = 1 - Math.exp(-dt / tau);
  const smoothed = memory.wake + (rawWake - memory.wake) * alpha;
  memory.wake = smoothed;
  memory.lastT = timeSeconds;
  return smoothed;
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
  // Optional already-computed flagship samples by ship id. When the consort
  // branch finds its flagship's sample here it skips the redundant
  // sampleRouteCycleInto pass; without it, falls back to the local scratch.
  flagshipSamples?: ReadonlyMap<string, ShipMotionSample>;
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
      // Prefer the already-computed flagship sample from the per-frame map; if
      // missing (legacy callers / out-of-order iteration), fall back to a
      // local scratch route sample.
      const cachedFlagshipSample = input.flagshipSamples?.get(squad.flagshipId);
      const flagshipSample = cachedFlagshipSample ?? flagshipScratch;
      if (!cachedFlagshipSample) {
        sampleRouteCycleInto(flagshipRoute, input.timeSeconds, flagshipScratch);
      }
      // Prefer the route's cached formation offset over live computation.
      const offset = route.formationOffset
        ?? squadFormationOffsetForPlacement(input.ship.id, squad, input.ship.riskPlacement)
        ?? { dx: 0, dy: 0 };

      // D3: detect formation offset changes at sample time. When riskPlacement
      // changes, the new formationOffset applies but heading memory persists
      // stale. Detect the change via a per-ship cache and blend over 3.0s
      // (motion-behavior review 2026-05-03: the prior 1.5s pushed the largest
      // diagonal offsets at ~1.9 tiles/s — ~2.5× peak sail speed — visibly a
      // lurch; 3.0s gives ~0.94 tiles/s mean (peak ~1.4 with smoothstep), so
      // distress-recovery reads as a deliberate transit instead of a snap).
      const shipId = input.ship.id;
      const cachedOffset = formationOffsetCacheByShipId.get(shipId);
      const BLEND_DURATION = 3.0;
      let effectiveDx = offset.dx;
      let effectiveDy = offset.dy;
      if (!cachedOffset) {
        // First sample: seed the cache.
        formationOffsetCacheByShipId.set(shipId, {
          dx: offset.dx,
          dy: offset.dy,
          lastFormationChangeAt: input.timeSeconds,
          prevDx: offset.dx,
          prevDy: offset.dy,
        });
      } else if (cachedOffset.dx !== offset.dx || cachedOffset.dy !== offset.dy) {
        // Offset changed: flush heading/wake memory so convergence starts fresh.
        clearShipHeadingMemory(shipId);
        cachedOffset.prevDx = cachedOffset.dx;
        cachedOffset.prevDy = cachedOffset.dy;
        cachedOffset.dx = offset.dx;
        cachedOffset.dy = offset.dy;
        cachedOffset.lastFormationChangeAt = input.timeSeconds;
      } else {
        // No change: check if we're still in the blend window.
        const blendProgress = clamp((input.timeSeconds - cachedOffset.lastFormationChangeAt) / BLEND_DURATION, 0, 1);
        if (blendProgress < 1) {
          effectiveDx = cachedOffset.prevDx + (offset.dx - cachedOffset.prevDx) * blendProgress;
          effectiveDy = cachedOffset.prevDy + (offset.dy - cachedOffset.prevDy) * blendProgress;
        }
      }

      let tileX = flagshipSample.tile.x + effectiveDx;
      let tileY = flagshipSample.tile.y + effectiveDy;
      // #8: sub-tile breathing perturbation while the flagship is actively
      // moving; skipped when moored/idle so docked formations stay glued.
      if (flagshipSample.state !== "moored" && flagshipSample.state !== "idle") {
        const phase = stableUnit(`${input.ship.id}.formation-breath`) * Math.PI * 2;
        const t = input.timeSeconds;
        tileX += Math.sin(t * 0.31 + phase) * 0.18;
        tileY += Math.cos(t * 0.27 + phase * 1.1) * 0.14;
      }
      out.shipId = input.ship.id;
      clampMotionTileInto(tileX, tileY, out.tile);
      out.state = flagshipSample.state;
      out.zone = input.ship.riskZone;
      out.currentDockId = null;
      out.currentRouteStopId = null;
      out.currentRouteStopKind = null;
      out.heading.x = flagshipSample.heading.x;
      out.heading.y = flagshipSample.heading.y;
      out.wakeIntensity = flagshipSample.wakeIntensity;
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

function dockedShipZoneDwell(zone: ShipWaterZone, dockDwellShareOverride?: number): { dockDwell: number; riskDwell: number; transit: number } {
  const base = ZONE_DWELL[zone];
  // E3: use per-route dockDwellShare if provided (broad chain-presence bonus).
  const dwellShare = dockDwellShareOverride ?? DOCKED_SHIP_DWELL_SHARE;
  const transit = Math.min(base.transit, 1 - dwellShare - 0.08);
  return {
    dockDwell: dwellShare,
    riskDwell: 1 - dwellShare - transit,
    transit,
  };
}

// Scratch tile reused inside transitSampleInto: holds the lane-adjusted point
// before mooring blend writes it into out.tile.
const transitTileScratch: { x: number; y: number } = { x: 0, y: 0 };

// D2: scratch samples for the ledger-roaming blend window. Reused across calls
// (zero allocation). Safe: ledgerRoamingSampleInto is not re-entrant.
const ledgerOrbitScratch: ShipMotionSample = {
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
const ledgerTransitScratch: ShipMotionSample = {
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
  // F10: pass shipId so sampleWaterPathInto can reuse the per-ship segment-index
  // hint (progress is monotonic along a path, so the cached index is almost
  // always still valid or one segment forward).
  sampleWaterPathInto(input.path, input.progress, out.tile, out.heading, input.route.shipId);
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
  sampleWaterPathInto(input.path, aheadProgress, aheadPointScratch, aheadHeadingScratch, input.route.shipId);
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
  // D1: applyWakeSmoothing prevents the one-frame step when transitioning between
  // sailing (rawWake=baseWake) and arriving (rawWake=0 at progress=0).
  // E2: multiply raw wake by the pre-computed wakeMultiplier (1.0 baseline;
  // boosted when |change24hPct| ≥ 2%). Smoothing is applied after the multiplier
  // so the smoother damps the already-scaled value — no smoothing-induced flicker.
  const baseWake = transitWakeIntensityForZone(input.route.zone);
  let rawWake: number;
  if (input.state === "departing" || input.state === "arriving") {
    const speedEnvelope = 4 * input.progress * (1 - input.progress);
    rawWake = baseWake * speedEnvelope * input.route.wakeMultiplier;
  } else {
    rawWake = baseWake * input.route.wakeMultiplier;
  }
  out.wakeIntensity = applyWakeSmoothing(input.route.shipId, input.timeSeconds, rawWake);

  // #4: per-ship heading low-pass filter. Path-segment tangents jump at every
  // internal waypoint vertex; without smoothing ships visibly twitch when
  // crossing 4-connected A* corners. Skipped for moored/risk-drift (those have
  // intentional orbital headings) and for reduced-motion (deterministic snapshot).
  // #2: during the final 12% of an arriving transit, blend the smoothed heading
  // toward the destination dock's natural tangent so the bow tucks into the
  // berth instead of sliding sideways. The ramp is applied inside the smoothing
  // step so headingDelta (memory) captures the ramp contribution — ship-pose
  // reads it for bank-into-turn, producing an incidental bank into the dock.
  const alignmentTangent = input.state === "arriving" && input.toMooringStop?.dockTangent
    ? input.toMooringStop.dockTangent
    : null;
  const alignmentT = alignmentTangent ? smoothstepRange(0.88, 1, input.progress) : 0;
  applyHeadingSmoothing(
    input.route.shipId,
    input.state,
    input.timeSeconds,
    out.heading,
    alignmentTangent,
    alignmentT,
  );
}

function applyHeadingSmoothing(
  shipId: string,
  state: ShipMotionState,
  timeSeconds: number,
  heading: { x: number; y: number },
  alignmentTangent: { x: number; y: number } | null,
  alignmentT: number,
): void {
  const memory = headingMemoryByShipId.get(shipId);
  if (memory) {
    const rawDt = timeSeconds - memory.lastT;
    // Cold-start: if the gap is > 0.5s (tab-resume or very long pause), skip
    // the lerp entirely and write the target directly into heading/memory so
    // the filter doesn't produce a phantom heading snap or spurious bank.
    if (rawDt > 0.5) {
      if (alignmentTangent && alignmentT > 0) {
        const lerpX = heading.x + (alignmentTangent.x - heading.x) * alignmentT;
        const lerpY = heading.y + (alignmentTangent.y - heading.y) * alignmentT;
        normalizeHeadingInto(lerpX, lerpY, heading);
      }
      memory.hx = heading.x;
      memory.hy = heading.y;
      memory.lastT = timeSeconds;
      memory.headingDelta = 0;
      return;
    }
    // Clamp dt: defends against tab-resume jumps where timeSeconds advances
    // by minutes and the filter would otherwise snap straight to the target.
    const dt = Math.max(0, Math.min(0.2, rawDt));
    // "arriving" turns sharper into the mooring; sailing/departing breathe.
    const tau = state === "arriving" ? 0.06 : 0.18;
    const alpha = 1 - Math.exp(-dt / tau);
    const targetX = heading.x;
    const targetY = heading.y;
    const hx = memory.hx + (targetX - memory.hx) * alpha;
    const hy = memory.hy + (targetY - memory.hy) * alpha;
    normalizeHeadingInto(hx, hy, heading);
    // Docking alignment ramp: lerp the smoothed (unit) heading toward the
    // dockTangent and renormalize, so the ramp is the authoritative final
    // heading at touchdown.
    if (alignmentTangent && alignmentT > 0) {
      const lerpX = heading.x + (alignmentTangent.x - heading.x) * alignmentT;
      const lerpY = heading.y + (alignmentTangent.y - heading.y) * alignmentT;
      normalizeHeadingInto(lerpX, lerpY, heading);
    }

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
  // First sample for this ship: seed memory directly (skip the lerp). Apply the
  // alignment ramp before recording so the seed reflects the ramped heading.
  if (alignmentTangent && alignmentT > 0) {
    const hx = heading.x + (alignmentTangent.x - heading.x) * alignmentT;
    const hy = heading.y + (alignmentTangent.y - heading.y) * alignmentT;
    normalizeHeadingInto(hx, hy, heading);
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
  // E1: stale evidence → wider orbit (×1.35) and slower angular speed (×0.65).
  const staleRadiusFactor = input.route.staleEvidence ? 1.35 : 1.0;
  const staleAngularFactor = input.route.staleEvidence ? 0.65 : 1.0;
  let dx = 0;
  let dy = 0;
  if (input.fromMooringStop) {
    const easeIn = smoothstepRange(0, 0.15, input.progress);
    const seed = mooredSeedFor(input.route, input.fromMooringStop, input.runtime);
    const phaseOffset = mooredPhaseFor(input.route, input.fromMooringStop, input.runtime);
    const radiusMultiplier = mooredRadiusMultiplierFor(input.route, input.fromMooringStop, input.runtime);
    const angle = input.timeSeconds * 0.027 * staleAngularFactor + seed * 0.0001 + phaseOffset;
    const radius = mooredRadiusForZone(input.route.zone);
    dx += Math.cos(angle) * radius.x * radiusMultiplier * staleRadiusFactor * (1 - easeIn);
    dy += Math.sin(angle * 0.9) * radius.y * radiusMultiplier * staleRadiusFactor * (1 - easeIn);
  }
  if (input.toMooringStop) {
    const easeOut = smoothstepRange(0.85, 1, input.progress);
    const seed = mooredSeedFor(input.route, input.toMooringStop, input.runtime);
    const phaseOffset = mooredPhaseFor(input.route, input.toMooringStop, input.runtime);
    const radiusMultiplier = mooredRadiusMultiplierFor(input.route, input.toMooringStop, input.runtime);
    const angle = input.timeSeconds * 0.027 * staleAngularFactor + seed * 0.0001 + phaseOffset;
    const radius = mooredRadiusForZone(input.route.zone);
    dx += Math.cos(angle) * radius.x * radiusMultiplier * staleRadiusFactor * easeOut;
    dy += Math.sin(angle * 0.9) * radius.y * radiusMultiplier * staleRadiusFactor * easeOut;
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
  clampMotionTileInto(
    route.openWaterPatrol.waypoint.x + Math.cos(angle) * 0.32,
    route.openWaterPatrol.waypoint.y + Math.sin(angle * 0.85) * 0.22,
    out.tile,
  );
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
  const phaseOffset = mooredPhaseFor(route, stop, runtime);
  const radiusMultiplier = mooredRadiusMultiplierFor(route, stop, runtime);
  // E1: stale evidence → wider orbit (×1.35) and slower angular speed (×0.65).
  const staleRadiusFactor = route.staleEvidence ? 1.35 : 1.0;
  const staleAngularFactor = route.staleEvidence ? 0.65 : 1.0;
  const angle = timeSeconds * 0.027 * staleAngularFactor + seed * 0.0001 + phaseOffset;
  const radius = mooredRadiusForZone(route.zone);
  out.shipId = route.shipId;
  out.tile.x = stop.mooringTile.x + Math.cos(angle) * radius.x * radiusMultiplier * staleRadiusFactor;
  out.tile.y = stop.mooringTile.y + Math.sin(angle * 0.9) * radius.y * radiusMultiplier * staleRadiusFactor;
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

function mooredPhaseFor(route: ShipMotionRoute, stop: ShipMotionRouteStop, runtime: RouteSamplingRuntime): number {
  const cached = runtime.mooredPhaseByStopId.get(stop.id);
  if (cached !== undefined) return cached;
  return (stableHash(`${route.shipId}.moored-phase`) % 1000) / 1000 * Math.PI * 2;
}

function mooredRadiusMultiplierFor(route: ShipMotionRoute, stop: ShipMotionRouteStop, runtime: RouteSamplingRuntime): number {
  const cached = runtime.mooredRadiusMultiplierByStopId.get(stop.id);
  if (cached !== undefined) return cached;
  const stableUnitSigned = (stableUnit(`${route.shipId}.moored-radius`) - 0.5) * 2;
  return 1 + 0.15 * stableUnitSigned;
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
  const blendStart = 0.55;

  if (progress <= blendStart) {
    mooredRouteStopSampleInto(route, stop, timeSeconds, out);
    return;
  }

  const runtime = routeSamplingRuntime(route);

  // D2: blend window [0.55, 0.58] — smoothstep the orbit displacement toward
  // zero before transit takes over, preventing the ~0.14–0.20 tile position jump.
  if (progress < idleShare) {
    // Sample orbit (moored) into scratch.
    mooredRouteStopSampleInto(route, stop, timeSeconds, ledgerOrbitScratch);
    // Sample transit at patrolProgress=0 into scratch (start of outbound).
    transitSampleInto({
      route,
      path: patrol.outbound,
      progress: 0,
      state: "sailing",
      routeStop: null,
      fromMooringStop: null,
      toMooringStop: null,
      timeSeconds,
      runtime,
    }, ledgerTransitScratch);
    // Blend factor: 0 at blendStart, 1 at idleShare.
    const easeOut = smoothstepRange(blendStart, idleShare, progress);
    out.shipId = route.shipId;
    clampMotionTileInto(
      ledgerOrbitScratch.tile.x * (1 - easeOut) + ledgerTransitScratch.tile.x * easeOut,
      ledgerOrbitScratch.tile.y * (1 - easeOut) + ledgerTransitScratch.tile.y * easeOut,
      out.tile,
    );
    // State: use orbit state until easeOut > 0.5, then transit.
    out.state = easeOut > 0.5 ? "sailing" : "moored";
    out.zone = route.zone;
    out.currentDockId = null;
    out.currentRouteStopId = easeOut > 0.5 ? null : ledgerOrbitScratch.currentRouteStopId;
    out.currentRouteStopKind = easeOut > 0.5 ? null : ledgerOrbitScratch.currentRouteStopKind;
    // Blend heading via component lerp then renormalize.
    const blendHx = ledgerOrbitScratch.heading.x * (1 - easeOut) + ledgerTransitScratch.heading.x * easeOut;
    const blendHy = ledgerOrbitScratch.heading.y * (1 - easeOut) + ledgerTransitScratch.heading.y * easeOut;
    normalizeHeadingInto(blendHx, blendHy, out.heading);
    out.wakeIntensity = ledgerOrbitScratch.wakeIntensity * (1 - easeOut) + ledgerTransitScratch.wakeIntensity * easeOut;
    return;
  }

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
  const phaseOffset = mooredPhaseFor(route, stop, runtime);
  const radiusMultiplier = mooredRadiusMultiplierFor(route, stop, runtime);
  // E1: stale evidence → wider orbit (×1.35) and slower angular speed (×0.65).
  const staleRadiusFactor = route.staleEvidence ? 1.35 : 1.0;
  const staleAngularFactor = route.staleEvidence ? 0.65 : 1.0;
  const angle = timeSeconds * 0.018 * staleAngularFactor + seed * 0.0001 + phaseOffset;
  const radius = mooredRadiusForZone(route.zone);
  out.shipId = route.shipId;
  clampMotionTileInto(
    stop.mooringTile.x + Math.cos(angle) * radius.x * 0.72 * radiusMultiplier * staleRadiusFactor,
    stop.mooringTile.y + Math.sin(angle * 0.9) * radius.y * 0.72 * radiusMultiplier * staleRadiusFactor,
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

const MOORED_RADIUS_DANGER = { x: 0.22, y: 0.14 };
const MOORED_RADIUS_WARNING = { x: 0.24, y: 0.16 };
const MOORED_RADIUS_ALERT = { x: 0.26, y: 0.17 };
const MOORED_RADIUS_DEFAULT = { x: 0.28, y: 0.18 };

function mooredRadiusForZone(zone: ShipWaterZone): { x: number; y: number } {
  if (zone === "danger") return MOORED_RADIUS_DANGER;
  if (zone === "warning") return MOORED_RADIUS_WARNING;
  if (zone === "alert") return MOORED_RADIUS_ALERT;
  return MOORED_RADIUS_DEFAULT;
}

function riskDriftSampleInto(route: ShipMotionRoute, timeSeconds: number, progress: number, out: ShipMotionSample): void {
  // E1: stale evidence → wider orbit (×1.35) and slower angular speed (×0.65).
  const staleRadiusFactor = route.staleEvidence ? 1.35 : 1.0;
  const staleAngularFactor = route.staleEvidence ? 0.65 : 1.0;
  const angle = timeSeconds * 0.017 * staleAngularFactor + route.routeSeed * 0.0001 + progress * Math.PI * 2;
  const radius = driftRadiusForZone(route.zone);
  // Smooth the drift radius to zero at the entry (progress=0) and exit
  // (progress=1) of the risk-water window. Without this, the departing→risk-drift
  // and risk-drift→arriving boundaries have a visible position jump equal to the
  // full drift offset (~0.54 tiles for danger zone).
  const radiusScale = smoothstepRange(0, 0.12, progress) * smoothstepRange(0, 0.12, 1 - progress);
  out.shipId = route.shipId;
  clampMotionTileInto(
    route.riskTile.x + Math.cos(angle) * radius.x * radiusScale * staleRadiusFactor,
    route.riskTile.y + Math.sin(angle * 0.8) * radius.y * radiusScale * staleRadiusFactor,
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

const DRIFT_RADIUS_DANGER = { x: 0.54, y: 0.36 };
const DRIFT_RADIUS_WARNING = { x: 0.48, y: 0.32 };
const DRIFT_RADIUS_ALERT = { x: 0.44, y: 0.3 };
const DRIFT_RADIUS_WATCH = { x: 0.4, y: 0.28 };
const DRIFT_RADIUS_DEFAULT = { x: 0.38, y: 0.26 };

function driftRadiusForZone(zone: ShipWaterZone): { x: number; y: number } {
  if (zone === "danger") return DRIFT_RADIUS_DANGER;
  if (zone === "warning") return DRIFT_RADIUS_WARNING;
  if (zone === "alert") return DRIFT_RADIUS_ALERT;
  if (zone === "watch") return DRIFT_RADIUS_WATCH;
  return DRIFT_RADIUS_DEFAULT;
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
