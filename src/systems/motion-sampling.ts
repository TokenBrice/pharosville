import { MAX_TILE_X, MAX_TILE_Y } from "./world-layout";
import { stableHash, stableUnit } from "./stable-random";
import {
  ARRIVING_DECEL_END,
  ARRIVING_FULL_TRANSIT_END,
  CAST_OFF_ACCEL_END,
  CAST_OFF_LINE_RELEASE_END,
  DOCKED_SHIP_DWELL_SHARE,
  MOORING_QUIET_END,
  MOORING_WORKING_END,
  ZONE_DWELL,
} from "./motion-config";
import { squadForMember, squadFormationOffsetForPlacement } from "./maker-squad";
import { sampleShipWaterPathInto as sampleWaterPathInto, sampleShipWaterPath as sampleWaterPath, clearShipWaterSegmentHint } from "./motion-water";
import { clamp, normalizeHeadingInto, pathKey, positiveModulo, smoothstep, smoothstepRange } from "./motion-utils";
import { seaStateMooringSwayMultiplier, type SeaState } from "./sea-state";
import type { PharosVilleMotionPlan, ShipMooringSubPhase, ShipMotionRoute, ShipMotionRouteStop, ShipMotionSample, ShipMotionState, ShipWaterPath } from "./motion-types";
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
    routeKey: null,
    routePathKey: null,
    currentDockId: null,
    currentRouteStopId: null,
    currentRouteStopKind: null,
    heading: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    speedTilesPerSecond: 0,
    mapVisibilityAlpha: 1,
    wakeIntensity: 0,
    mooringSubPhase: null,
    mooringSwayAmplitude: 1,
    mooringTension: 0,
    lanternAlpha: 0,
    fenderContact: 0,
    seaState: null,
  };
}

function resetSampleChoreography(out: ShipMotionSample): void {
  out.mooringSubPhase = null;
  out.mooringSwayAmplitude = 1;
  out.mooringTension = 0;
  out.lanternAlpha = 0;
  out.fenderContact = 0;
  out.seaState = null;
  out.mapVisibilityAlpha = 1;
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

// Per-route-path heading low-pass memory. The active key still starts with the
// ship id for cheap cleanup, but also carries route/path identity so bucket
// swaps or leg changes never inherit a stale tangent.
interface HeadingMemory {
  hx: number;
  hy: number;
  lastT: number;
  headingDelta: number;
}
const headingMemoryByMotionKey = new Map<string, HeadingMemory>();
const activeMotionMemoryKeyByShipId = new Map<string, string>();
const latestHeadingDeltaByShipId = new Map<string, number>();

export function getShipHeadingDelta(shipId: string): number {
  return latestHeadingDeltaByShipId.get(shipId) ?? 0;
}

// D3: flush per-ship heading memory (and wake memory) when formation offset
// changes so heading converges fresh from the new position.
export function clearShipHeadingMemory(shipId: string): void {
  deleteMotionMemoryForShip(shipId);
  activeMotionMemoryKeyByShipId.delete(shipId);
  latestHeadingDeltaByShipId.delete(shipId);
  clearShipWaterSegmentHint(shipId);
}

// D1/T15: wake intensity low-pass memory mirrors the route-path heading memory.
// Prevents a one-frame jump from full baseWake (sailing) to 0 (arriving at
// progress=0, where 4*0*(1-0)=0).
interface WakeMemory {
  wake: number;
  lastT: number;
}
const wakeIntensityMemoryByMotionKey = new Map<string, WakeMemory>();

export function getShipWakeIntensityMemory(shipId: string): WakeMemory | undefined {
  const activeKey = activeMotionMemoryKeyByShipId.get(shipId);
  if (activeKey) return wakeIntensityMemoryByMotionKey.get(activeKey);
  const prefix = `${shipId}|`;
  for (const [key, memory] of wakeIntensityMemoryByMotionKey) {
    if (key.startsWith(prefix)) return memory;
  }
  return undefined;
}

function applyWakeSmoothing(memoryKey: string, timeSeconds: number, rawWake: number): number {
  const memory = wakeIntensityMemoryByMotionKey.get(memoryKey);
  if (!memory) {
    wakeIntensityMemoryByMotionKey.set(memoryKey, { wake: rawWake, lastT: timeSeconds });
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

function deleteMotionMemoryForShip(shipId: string): void {
  const prefix = `${shipId}|`;
  for (const key of headingMemoryByMotionKey.keys()) {
    if (key.startsWith(prefix)) headingMemoryByMotionKey.delete(key);
  }
  for (const key of wakeIntensityMemoryByMotionKey.keys()) {
    if (key.startsWith(prefix)) wakeIntensityMemoryByMotionKey.delete(key);
  }
}

function beginRoutePathSample(route: ShipMotionRoute, routePathKey: string | null): string {
  const memoryKey = motionMemoryKey(route.shipId, routePathKey ?? routeIdentityKey(route));
  const previousKey = activeMotionMemoryKeyByShipId.get(route.shipId);
  if (previousKey !== memoryKey) {
    if (previousKey) {
      headingMemoryByMotionKey.delete(previousKey);
      wakeIntensityMemoryByMotionKey.delete(previousKey);
    }
    activeMotionMemoryKeyByShipId.set(route.shipId, memoryKey);
    latestHeadingDeltaByShipId.set(route.shipId, 0);
    clearShipWaterSegmentHint(route.shipId);
  }
  return memoryKey;
}

function routeIdentityKey(route: ShipMotionRoute): string {
  return route.routeKey ?? [
    route.shipId,
    `epoch=${route.routeEpoch ?? "legacy"}`,
    route.zone,
    `${route.riskTile.x},${route.riskTile.y}`,
  ].join(":");
}

function routePathIdentityKey(route: ShipMotionRoute, kind: string, detail: string | null = null): string {
  return `${routeIdentityKey(route)}|${kind}${detail ? `:${detail}` : ""}`;
}

function transitRoutePathIdentityKey(
  route: ShipMotionRoute,
  path: ShipWaterPath | undefined,
  state: Extract<ShipMotionState, "arriving" | "departing" | "sailing">,
  routeStop: ShipMotionRoute["dockStops"][number] | null,
): string {
  const legKey = path ? pathKey(path.from, path.to) : "missing-path";
  return routePathIdentityKey(route, state, `${routeStop?.id ?? "open"}:${legKey}`);
}

function motionMemoryKey(shipId: string, routePathKey: string): string {
  return `${shipId}|${routePathKey}`;
}

function writeRouteContextInto(route: ShipMotionRoute, routePathKey: string | null, out: ShipMotionSample): void {
  out.routeKey = routeIdentityKey(route);
  out.routePathKey = routePathKey;
}

function writeZeroVelocityInto(out: ShipMotionSample): void {
  writeVelocityInto(out, 0, 0);
}

function writeVelocityInto(out: ShipMotionSample, x: number, y: number): void {
  const vx = Number.isFinite(x) ? x : 0;
  const vy = Number.isFinite(y) ? y : 0;
  if (!out.velocity) {
    out.velocity = { x: vx, y: vy };
  } else {
    out.velocity.x = vx;
    out.velocity.y = vy;
  }
  out.speedTilesPerSecond = Math.hypot(vx, vy);
}

function copyVelocityInto(source: ShipMotionSample, out: ShipMotionSample): void {
  writeVelocityInto(out, source.velocity?.x ?? 0, source.velocity?.y ?? 0);
}

function writeMapVisibilityAlphaInto(out: ShipMotionSample, alpha: number): void {
  out.mapVisibilityAlpha = clamp(alpha, 0, 1);
}

const MOORED_MAP_VISIBILITY_FADE_IN_START = 0.84;

function mooredMapVisibilityAlpha(dwellProgress: number): number {
  return smoothstepRange(MOORED_MAP_VISIBILITY_FADE_IN_START, 1, dwellProgress);
}

function transitMapVisibilityAlpha(
  state: Extract<ShipMotionState, "arriving" | "departing" | "sailing">,
  progress: number,
): number {
  if (state === "departing") {
    return smoothstepRange(CAST_OFF_LINE_RELEASE_END, CAST_OFF_ACCEL_END, progress);
  }
  if (state === "arriving") {
    return 1 - smoothstepRange(ARRIVING_FULL_TRANSIT_END, 1, progress);
  }
  return 1;
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
  seaState?: SeaState | null;
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
  seaState?: SeaState | null;
  ship: ShipNode;
  timeSeconds: number;
  // Optional already-computed flagship samples by ship id. When the consort
  // branch finds its flagship's sample here it skips the redundant
  // sampleRouteCycleInto pass; without it, falls back to the local scratch.
  flagshipSamples?: ReadonlyMap<string, ShipMotionSample>;
}, out: ShipMotionSample): void {
  const route = input.plan.shipRoutes.get(input.ship.id);
  resetSampleChoreography(out);
  if (input.reducedMotion || !route) {
    reducedMotionSampleInto(input.plan, input.ship, route, input.seaState ?? null, out);
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
        sampleRouteCycleInto(flagshipRoute, input.timeSeconds, input.seaState ?? null, flagshipScratch);
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
      out.routeKey = routeIdentityKey(route);
      out.routePathKey = flagshipSample.routePathKey ?? routePathIdentityKey(route, "consort", flagshipRoute.shipId);
      copyVelocityInto(flagshipSample, out);
      writeMapVisibilityAlphaInto(out, flagshipSample.mapVisibilityAlpha ?? 1);
      out.wakeIntensity = flagshipSample.wakeIntensity;
      out.mooringSubPhase = flagshipSample.mooringSubPhase ?? null;
      out.mooringSwayAmplitude = flagshipSample.mooringSwayAmplitude ?? 1;
      out.mooringTension = flagshipSample.mooringTension ?? 0;
      out.lanternAlpha = flagshipSample.lanternAlpha ?? 0;
      out.fenderContact = flagshipSample.fenderContact ?? 0;
      out.seaState = input.seaState ?? flagshipSample.seaState ?? null;
      return;
    }
  }

  sampleRouteCycleInto(route, input.timeSeconds, input.seaState ?? null, out);
}

interface ReducedMotionRouteFrame {
  tile: { x: number; y: number };
  heading: { x: number; y: number };
  dockStop: ShipMotionRoute["dockStops"][number] | null;
  ledgerStop: ShipMotionRouteStop | null;
}

function reducedMotionSampleInto(
  plan: PharosVilleMotionPlan,
  ship: ShipNode,
  route: ShipMotionRoute | undefined,
  seaState: SeaState | null,
  out: ShipMotionSample,
): void {
  out.shipId = ship.id;
  out.state = "idle";
  out.zone = ship.riskZone;
  out.routeKey = route ? routeIdentityKey(route) : null;
  out.routePathKey = route ? routePathIdentityKey(route, "reduced") : null;
  out.currentDockId = null;
  out.currentRouteStopId = null;
  out.currentRouteStopKind = null;
  out.heading.x = 0;
  out.heading.y = 0;
  writeZeroVelocityInto(out);
  writeMapVisibilityAlphaInto(out, 1);
  out.wakeIntensity = 0;
  resetSampleChoreography(out);
  out.seaState = seaState;

  if (!route) {
    out.tile.x = ship.riskTile.x;
    out.tile.y = ship.riskTile.y;
    return;
  }

  if (ship.squadRole === "consort" && ship.squadId) {
    const squad = squadForMember(ship.id);
    const flagshipRoute = squad ? plan.shipRoutes.get(squad.flagshipId) : undefined;
    if (flagshipRoute) {
      const flagshipFrame = reducedMotionRouteFrame(flagshipRoute);
      const offset = route.formationOffset
        ?? squadFormationOffsetForPlacement(ship.id, squad!, ship.riskPlacement)
        ?? { dx: 0, dy: 0 };
      clampMotionTileInto(flagshipFrame.tile.x + offset.dx, flagshipFrame.tile.y + offset.dy, out.tile);
      out.heading.x = flagshipFrame.heading.x;
      out.heading.y = flagshipFrame.heading.y;
      return;
    }
  }

  const frame = reducedMotionRouteFrame(route);
  out.tile.x = frame.tile.x;
  out.tile.y = frame.tile.y;
  out.heading.x = frame.heading.x;
  out.heading.y = frame.heading.y;

  if (frame.ledgerStop) {
    // Existing NAV policy treats Ledger Mooring as the static representative
    // frame rather than a rendered chain dock visit.
    return;
  }

  if (frame.dockStop) {
    out.currentDockId = frame.dockStop.dockId;
    out.currentRouteStopId = frame.dockStop.id;
    out.currentRouteStopKind = frame.dockStop.kind;
    out.mooringSubPhase = "quiet";
    out.mooringTension = 1;
  }
}

function reducedMotionRouteFrame(route: ShipMotionRoute): ReducedMotionRouteFrame {
  if (route.riskStop?.kind === "ledger") {
    return {
      tile: route.riskStop.mooringTile,
      heading: route.riskStop.dockTangent ?? { x: 0, y: 0 },
      dockStop: null,
      ledgerStop: route.riskStop,
    };
  }

  const dockStop = primaryRouteDockStop(route);
  if (dockStop) {
    return {
      tile: dockStop.mooringTile,
      heading: dockStop.dockTangent ?? { x: 0, y: 0 },
      dockStop,
      ledgerStop: null,
    };
  }

  return {
    tile: route.riskTile,
    heading: { x: 0, y: 0 },
    dockStop: null,
    ledgerStop: null,
  };
}

function primaryRouteDockStop(route: ShipMotionRoute): ShipMotionRoute["dockStops"][number] | null {
  return (route.homeDockId ? route.dockStops.find((stop) => stop.dockId === route.homeDockId) : null)
    ?? route.dockStops[0]
    ?? null;
}

function sampleRouteCycleInto(route: ShipMotionRoute, timeSeconds: number, seaState: SeaState | null, out: ShipMotionSample): void {
  const runtime = routeSamplingRuntime(route);
  if (runtime.scheduledStopCount === 0) {
    openWaterPatrolSampleInto(route, timeSeconds, out);
    out.seaState = seaState;
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
      const dwellProgress = cursor / Math.max(1, dockSecondsEach);
      mooredSampleInto({
        route,
        stop,
        dwellProgress,
        secondsRemaining: dockSecondsEach - cursor,
        outgoingPath: runtime.stopToRiskPathByDockId.get(stop.dockId),
        seaState,
        timeSeconds,
        runtime,
      }, out);
      return;
    }
    cursor -= dockSecondsEach;

    if (cursor < transitSecondsEach) {
      transitSampleInto({
        route,
        path: runtime.stopToRiskPathByDockId.get(stop.dockId),
        progress: cursor / Math.max(1, transitSecondsEach),
        transitSeconds: transitSecondsEach,
        state: "departing",
        routeStop: stop,
        seaState,
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
      out.seaState = seaState;
      return;
    }
    cursor -= riskSecondsEach;

    if (cursor < transitSecondsEach) {
      transitSampleInto({
        route,
        path: runtime.riskToStopPathByDockId.get(nextStop.dockId),
        progress: cursor / Math.max(1, transitSecondsEach),
        transitSeconds: transitSecondsEach,
        state: "arriving",
        routeStop: nextStop,
        seaState,
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
  out.seaState = seaState;
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
  mooringSubPhase: null,
  mooringTension: 0,
  lanternAlpha: 0,
  fenderContact: 0,
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
  mooringSubPhase: null,
  mooringTension: 0,
  lanternAlpha: 0,
  fenderContact: 0,
};

interface TransitPhaseProfile {
  alignmentToDockTangent: number;
  fenderContact: number;
  pathProgress: number;
  speedRatio: number;
}

const ARRIVING_DECEL_DISTANCE_SHARE = (ARRIVING_DECEL_END - ARRIVING_FULL_TRANSIT_END) * (2 / Math.PI);
const ARRIVING_CONTACT_PATH_START = ARRIVING_FULL_TRANSIT_END + ARRIVING_DECEL_DISTANCE_SHARE;
const CAST_OFF_ACCEL_DISTANCE_SHARE = (CAST_OFF_ACCEL_END - CAST_OFF_LINE_RELEASE_END) * (2 / Math.PI);

function transitPhaseProfile(state: Extract<ShipMotionState, "arriving" | "departing" | "sailing">, progress: number): TransitPhaseProfile {
  const p = clamp(progress, 0, 1);
  if (state === "departing") {
    if (p <= CAST_OFF_LINE_RELEASE_END) {
      return {
        alignmentToDockTangent: 1,
        fenderContact: 0,
        pathProgress: 0,
        speedRatio: 0,
      };
    }
    if (p < CAST_OFF_ACCEL_END) {
      const local = (p - CAST_OFF_LINE_RELEASE_END) / (CAST_OFF_ACCEL_END - CAST_OFF_LINE_RELEASE_END);
      const easedDistance = CAST_OFF_ACCEL_DISTANCE_SHARE * (1 - Math.cos(local * Math.PI / 2));
      return {
        alignmentToDockTangent: 1 - smoothstep(local),
        fenderContact: 0,
        pathProgress: easedDistance,
        speedRatio: Math.sin(local * Math.PI / 2),
      };
    }
    const normalProgress = (p - CAST_OFF_ACCEL_END) / (1 - CAST_OFF_ACCEL_END);
    return {
      alignmentToDockTangent: 0,
      fenderContact: 0,
      pathProgress: CAST_OFF_ACCEL_DISTANCE_SHARE + (1 - CAST_OFF_ACCEL_DISTANCE_SHARE) * normalProgress,
      speedRatio: 1,
    };
  }

  if (state === "arriving") {
    if (p <= ARRIVING_FULL_TRANSIT_END) {
      return {
        alignmentToDockTangent: 0,
        fenderContact: 0,
        pathProgress: p,
        speedRatio: 1,
      };
    }
    if (p < ARRIVING_DECEL_END) {
      const local = (p - ARRIVING_FULL_TRANSIT_END) / (ARRIVING_DECEL_END - ARRIVING_FULL_TRANSIT_END);
      return {
        alignmentToDockTangent: smoothstep(local),
        fenderContact: 0,
        pathProgress: ARRIVING_FULL_TRANSIT_END + ARRIVING_DECEL_DISTANCE_SHARE * Math.sin(local * Math.PI / 2),
        speedRatio: 0.1 + 0.9 * Math.cos(local * Math.PI / 2),
      };
    }
    const local = (p - ARRIVING_DECEL_END) / (1 - ARRIVING_DECEL_END);
    const contactT = smoothstep(local);
    return {
      alignmentToDockTangent: 1,
      fenderContact: contactT,
      pathProgress: ARRIVING_CONTACT_PATH_START + (1 - ARRIVING_CONTACT_PATH_START) * contactT,
      speedRatio: 0.1 * (1 - contactT),
    };
  }

  return {
    alignmentToDockTangent: 0,
    fenderContact: 0,
    pathProgress: p,
    speedRatio: 1,
  };
}

function transitSampleInto(input: {
  route: ShipMotionRoute;
  path: ShipWaterPath | undefined;
  progress: number;
  transitSeconds?: number;
  routeStop: ShipMotionRoute["dockStops"][number] | null;
  runtime: RouteSamplingRuntime;
  seaState?: SeaState | null;
  state: Extract<ShipMotionState, "arriving" | "departing" | "sailing">;
  fromMooringStop: ShipMotionRoute["dockStops"][number] | null;
  toMooringStop: ShipMotionRoute["dockStops"][number] | null;
  timeSeconds: number;
}, out: ShipMotionSample): void {
  const linearProgress = clamp(input.progress, 0, 1);
  const profile = transitPhaseProfile(input.state, linearProgress);
  const routePathKey = transitRoutePathIdentityKey(input.route, input.path, input.state, input.routeStop);
  const memoryKey = beginRoutePathSample(input.route, routePathKey);
  // Write water-path point/heading directly into out.tile / out.heading.
  // F10/T15: pass a route-path key so segment-index hints stay hot within a leg
  // but cannot survive route bucket or path swaps.
  sampleWaterPathInto(input.path, profile.pathProgress, out.tile, out.heading, memoryKey);
  // Apply lane offset (uses heading); write through a scratch tile because
  // the lane formula reads the un-offset point.
  transitLanePointInto(out.tile, out.heading, profile.pathProgress, input.runtime, transitTileScratch);
  out.tile.x = transitTileScratch.x;
  out.tile.y = transitTileScratch.y;

  // #6: derive heading from the forward-difference along the lane-displaced
  // trajectory rather than the raw path tangent. Without this, the lane bulge
  // shifts position perpendicular while heading stays straight, producing a
  // visible "crab" sideways motion.
  const aheadProgress = Math.min(1, profile.pathProgress + 0.01);
  sampleWaterPathInto(input.path, aheadProgress, aheadPointScratch, aheadHeadingScratch, memoryKey);
  transitLanePointInto(aheadPointScratch, aheadHeadingScratch, aheadProgress, input.runtime, aheadLaneScratch);
  const fdx = aheadLaneScratch.x - out.tile.x;
  const fdy = aheadLaneScratch.y - out.tile.y;
  if (fdx !== 0 || fdy !== 0) {
    normalizeHeadingInto(fdx, fdy, out.heading);
  }

  applyFenderContactClampInto(input.toMooringStop, linearProgress, out.tile);
  applyMooringBlendInto({
    progress: linearProgress,
    route: input.route,
    fromMooringStop: input.fromMooringStop,
    toMooringStop: input.toMooringStop,
    seaState: input.seaState ?? null,
    timeSeconds: input.timeSeconds,
    runtime: input.runtime,
  }, out.tile);
  if (input.toMooringStop && linearProgress >= ARRIVING_DECEL_END) {
    clampAroundPointInto(out.tile, input.toMooringStop.mooringTile, 0.5, out.tile);
  }
  out.shipId = input.route.shipId;
  out.state = input.state;
  out.zone = input.route.zone;
  writeRouteContextInto(input.route, routePathKey, out);
  out.currentDockId = input.routeStop?.dockId ?? null;
  out.currentRouteStopId = input.routeStop?.id ?? null;
  out.currentRouteStopKind = input.routeStop?.kind ?? null;
  out.mooringSubPhase = null;
  out.mooringSwayAmplitude = seaStateMooringSwayMultiplier(input.seaState);
  out.mooringTension = input.state === "arriving" ? profile.fenderContact : 0;
  out.lanternAlpha = 0;
  out.fenderContact = profile.fenderContact;
  out.seaState = input.seaState ?? null;
  writeMapVisibilityAlphaInto(out, transitMapVisibilityAlpha(input.state, linearProgress));

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
    rawWake = baseWake * profile.speedRatio * input.route.wakeMultiplier;
  } else {
    rawWake = baseWake * input.route.wakeMultiplier;
  }
  out.wakeIntensity = applyWakeSmoothing(memoryKey, input.timeSeconds, rawWake);

  // #4: per-ship heading low-pass filter. Path-segment tangents jump at every
  // internal waypoint vertex; without smoothing ships visibly twitch when
  // crossing 4-connected A* corners. Skipped for moored/risk-drift (those have
  // intentional orbital headings) and for reduced-motion (deterministic snapshot).
  // Docking choreography: arriving transits start heading alignment during the
  // decel phase and finish with a tiny deterministic fender-contact yaw;
  // departing transits mirror that by holding the dock tangent through line
  // release before rotating back onto the path tangent.
  const alignmentTangent = transitAlignmentTangent(input, profile);
  const alignmentT = alignmentTangent ? profile.alignmentToDockTangent : 0;
  applyHeadingSmoothing(
    memoryKey,
    input.route.shipId,
    input.state,
    input.timeSeconds,
    out.heading,
    alignmentTangent,
    alignmentT,
  );
  const speed = transitSpeedTilesPerSecond(input.path, input.transitSeconds, profile.speedRatio);
  writeVelocityInto(out, out.heading.x * speed, out.heading.y * speed);
}

const fenderHeadingScratch: { x: number; y: number } = { x: 0, y: 0 };

function transitAlignmentTangent(input: {
  route: ShipMotionRoute;
  state: Extract<ShipMotionState, "arriving" | "departing" | "sailing">;
  fromMooringStop: ShipMotionRoute["dockStops"][number] | null;
  toMooringStop: ShipMotionRoute["dockStops"][number] | null;
  timeSeconds: number;
}, profile: TransitPhaseProfile): { x: number; y: number } | null {
  if (input.state === "arriving" && input.toMooringStop?.dockTangent) {
    if (profile.fenderContact > 0) {
      writeFenderYawedTangentInto(input.toMooringStop.dockTangent, input.route, input.timeSeconds, profile.fenderContact, fenderHeadingScratch);
      return fenderHeadingScratch;
    }
    return input.toMooringStop.dockTangent;
  }

  return input.state === "departing" && input.fromMooringStop?.dockTangent
    ? input.fromMooringStop.dockTangent
    : null;
}

function transitSpeedTilesPerSecond(
  path: ShipWaterPath | undefined,
  transitSeconds: number | undefined,
  speedRatio: number,
): number {
  const seconds = transitSeconds && transitSeconds > 0 ? transitSeconds : 1;
  const length = path?.totalLength ?? 0;
  const speed = length / seconds * speedRatio;
  return Number.isFinite(speed) ? speed : 0;
}

function writeFenderYawedTangentInto(
  dockTangent: { x: number; y: number },
  route: ShipMotionRoute,
  timeSeconds: number,
  fenderContact: number,
  out: { x: number; y: number },
): void {
  const yaw = Math.sin(timeSeconds * 2.7 + route.routeSeed * 0.00017) * 0.04 * fenderContact;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  normalizeHeadingInto(
    dockTangent.x * cos - dockTangent.y * sin,
    dockTangent.x * sin + dockTangent.y * cos,
    out,
  );
}

function applyFenderContactClampInto(
  stop: ShipMotionRoute["dockStops"][number] | null,
  progress: number,
  tile: { x: number; y: number },
): void {
  if (!stop?.dockTangent || progress < ARRIVING_FULL_TRANSIT_END) return;
  const contactT = smoothstepRange(ARRIVING_FULL_TRANSIT_END, ARRIVING_DECEL_END, progress);
  if (contactT <= 0) return;

  const tangent = stop.dockTangent;
  const normal = { x: -tangent.y, y: tangent.x };
  const dx = tile.x - stop.mooringTile.x;
  const dy = tile.y - stop.mooringTile.y;
  const tangentDistance = dx * tangent.x + dy * tangent.y;
  const normalDistance = dx * normal.x + dy * normal.y;
  let targetDx = tangent.x * clamp(tangentDistance, -0.5, 0.5)
    + normal.x * clamp(normalDistance, -0.5, 0.5);
  let targetDy = tangent.y * clamp(tangentDistance, -0.5, 0.5)
    + normal.y * clamp(normalDistance, -0.5, 0.5);
  const targetDistance = Math.hypot(targetDx, targetDy);
  if (targetDistance > 0.5) {
    const scale = 0.5 / targetDistance;
    targetDx *= scale;
    targetDy *= scale;
  }
  const targetX = stop.mooringTile.x + targetDx;
  const targetY = stop.mooringTile.y + targetDy;
  clampMotionTileInto(
    tile.x + (targetX - tile.x) * contactT,
    tile.y + (targetY - tile.y) * contactT,
    tile,
  );

  if (progress >= ARRIVING_DECEL_END) {
    clampAroundPointInto(tile, stop.mooringTile, 0.5, tile);
  }
}

function applyHeadingSmoothing(
  memoryKey: string,
  shipId: string,
  state: ShipMotionState,
  timeSeconds: number,
  heading: { x: number; y: number },
  alignmentTangent: { x: number; y: number } | null,
  alignmentT: number,
): void {
  const memory = headingMemoryByMotionKey.get(memoryKey);
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
      latestHeadingDeltaByShipId.set(shipId, 0);
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
    latestHeadingDeltaByShipId.set(shipId, headingDelta);
    return;
  }
  // First sample for this ship: seed memory directly (skip the lerp). Apply the
  // alignment ramp before recording so the seed reflects the ramped heading.
  if (alignmentTangent && alignmentT > 0) {
    const hx = heading.x + (alignmentTangent.x - heading.x) * alignmentT;
    const hy = heading.y + (alignmentTangent.y - heading.y) * alignmentT;
    normalizeHeadingInto(hx, hy, heading);
  }
  headingMemoryByMotionKey.set(memoryKey, {
    hx: heading.x,
    hy: heading.y,
    lastT: timeSeconds,
    headingDelta: 0,
  });
  latestHeadingDeltaByShipId.set(shipId, 0);
}

function applyMooringBlendInto(input: {
  progress: number;
  route: ShipMotionRoute;
  fromMooringStop: ShipMotionRoute["dockStops"][number] | null;
  runtime: RouteSamplingRuntime;
  seaState: SeaState | null;
  toMooringStop: ShipMotionRoute["dockStops"][number] | null;
  timeSeconds: number;
}, tile: { x: number; y: number }): void {
  // E1: stale evidence → wider orbit (×1.35) and slower angular speed (×0.65).
  const staleRadiusFactor = input.route.staleEvidence ? 1.35 : 1.0;
  const staleAngularFactor = input.route.staleEvidence ? 0.65 : 1.0;
  const seaSway = seaStateMooringSwayMultiplier(input.seaState);
  let dx = 0;
  let dy = 0;
  if (input.fromMooringStop) {
    const releaseT = smoothstepRange(CAST_OFF_LINE_RELEASE_END, CAST_OFF_ACCEL_END, input.progress);
    const seed = mooredSeedFor(input.route, input.fromMooringStop, input.runtime);
    const phaseOffset = mooredPhaseFor(input.route, input.fromMooringStop, input.runtime);
    const radiusMultiplier = mooredRadiusMultiplierFor(input.route, input.fromMooringStop, input.runtime);
    const angle = input.timeSeconds * 0.027 * staleAngularFactor + seed * 0.0001 + phaseOffset;
    const radius = mooredRadiusForZone(input.route.zone);
    dx += Math.cos(angle) * radius.x * radiusMultiplier * staleRadiusFactor * seaSway * (1 - releaseT);
    dy += Math.sin(angle * 0.9) * radius.y * radiusMultiplier * staleRadiusFactor * seaSway * (1 - releaseT);
  }
  if (input.toMooringStop) {
    const mooringTension = smoothstepRange(ARRIVING_DECEL_END, 1, input.progress);
    const seed = mooredSeedFor(input.route, input.toMooringStop, input.runtime);
    const phaseOffset = mooredPhaseFor(input.route, input.toMooringStop, input.runtime);
    const radiusMultiplier = mooredRadiusMultiplierFor(input.route, input.toMooringStop, input.runtime);
    const angle = input.timeSeconds * 0.027 * staleAngularFactor + seed * 0.0001 + phaseOffset;
    const radius = mooredRadiusForZone(input.route.zone);
    dx += Math.cos(angle) * radius.x * radiusMultiplier * staleRadiusFactor * seaSway * mooringTension;
    dy += Math.sin(angle * 0.9) * radius.y * radiusMultiplier * staleRadiusFactor * seaSway * mooringTension;
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
      transitSeconds: transitSecondsEach,
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
    transitSeconds: transitSecondsEach,
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
  const routePathKey = routePathIdentityKey(route, "waypoint", pathKey(route.openWaterPatrol.waypoint, route.openWaterPatrol.waypoint));
  beginRoutePathSample(route, routePathKey);
  const angle = timeSeconds * 0.023 + route.routeSeed * 0.00013 + progress * Math.PI * 2;
  out.shipId = route.shipId;
  clampMotionTileInto(
    route.openWaterPatrol.waypoint.x + Math.cos(angle) * 0.32,
    route.openWaterPatrol.waypoint.y + Math.sin(angle * 0.85) * 0.22,
    out.tile,
  );
  out.state = "sailing";
  out.zone = route.zone;
  writeRouteContextInto(route, routePathKey, out);
  writeMapVisibilityAlphaInto(out, 1);
  out.currentDockId = null;
  out.currentRouteStopId = null;
  out.currentRouteStopKind = null;
  normalizeHeadingInto(-Math.sin(angle), Math.cos(angle * 0.85), out.heading);
  writeVelocityInto(
    out,
    -Math.sin(angle) * 0.32 * 0.023,
    Math.cos(angle * 0.85) * 0.22 * 0.85 * 0.023,
  );
  out.wakeIntensity = patrolWakeIntensityForZone(route.zone);
}

const mooringPathPointScratch: { x: number; y: number } = { x: 0, y: 0 };
const mooringPathHeadingScratch: { x: number; y: number } = { x: 0, y: 0 };

interface MooringPhaseInfo {
  headingPrepT: number;
  lanternAlpha: number;
  subPhase: ShipMooringSubPhase;
  swayMultiplier: number;
  tension: number;
}

function mooringPhaseInfo(route: ShipMotionRoute, dwellProgress: number, secondsRemaining: number, timeSeconds: number): MooringPhaseInfo {
  const progress = clamp(dwellProgress, 0, 1);
  if (progress < MOORING_WORKING_END) {
    const warmedSway = smoothstepRange(CAST_OFF_LINE_RELEASE_END, MOORING_WORKING_END, progress);
    return {
      headingPrepT: 0,
      lanternAlpha: 0.35 + 0.25 * Math.max(0, Math.sin(timeSeconds * 1.7 + route.routeSeed * 0.00011)),
      subPhase: "working",
      swayMultiplier: 1 + 0.2 * warmedSway,
      tension: 1,
    };
  }

  if (progress < MOORING_QUIET_END) {
    return {
      headingPrepT: 0,
      lanternAlpha: 0,
      subPhase: "quiet",
      swayMultiplier: 1,
      tension: 1,
    };
  }

  const phasePrepT = smoothstepRange(MOORING_QUIET_END, 1, progress);
  const finalSecondsPrepT = smoothstepRange(4, 0, secondsRemaining);
  const headingPrepT = Math.max(phasePrepT, finalSecondsPrepT);
  return {
    headingPrepT,
    lanternAlpha: 0,
    subPhase: "cast-off-prep",
    swayMultiplier: 1,
    tension: 1 - headingPrepT,
  };
}

function mooredSampleInto(input: {
  route: ShipMotionRoute;
  stop: ShipMotionRoute["dockStops"][number];
  dwellProgress: number;
  secondsRemaining: number;
  outgoingPath: ShipWaterPath | undefined;
  seaState: SeaState | null;
  timeSeconds: number;
  runtime: RouteSamplingRuntime;
}, out: ShipMotionSample): void {
  const routePathKey = routePathIdentityKey(input.route, "moored", input.stop.id);
  beginRoutePathSample(input.route, routePathKey);
  const phase = mooringPhaseInfo(input.route, input.dwellProgress, input.secondsRemaining, input.timeSeconds);
  const seed = mooredSeedFor(input.route, input.stop, input.runtime);
  const phaseOffset = mooredPhaseFor(input.route, input.stop, input.runtime);
  const radiusMultiplier = mooredRadiusMultiplierFor(input.route, input.stop, input.runtime);
  // E1: stale evidence → wider orbit (×1.35) and slower angular speed (×0.65).
  const staleRadiusFactor = input.route.staleEvidence ? 1.35 : 1.0;
  const staleAngularFactor = input.route.staleEvidence ? 0.65 : 1.0;
  const angle = input.timeSeconds * 0.027 * staleAngularFactor + seed * 0.0001 + phaseOffset;
  const radius = mooredRadiusForZone(input.route.zone);
  const seaSway = seaStateMooringSwayMultiplier(input.seaState);
  const swayAmplitude = phase.swayMultiplier * seaSway;
  out.shipId = input.route.shipId;
  out.tile.x = input.stop.mooringTile.x + Math.cos(angle) * radius.x * radiusMultiplier * staleRadiusFactor * swayAmplitude;
  out.tile.y = input.stop.mooringTile.y + Math.sin(angle * 0.9) * radius.y * radiusMultiplier * staleRadiusFactor * swayAmplitude;
  out.state = "moored";
  out.zone = input.route.zone;
  writeRouteContextInto(input.route, routePathKey, out);
  out.currentDockId = input.stop.dockId;
  out.currentRouteStopId = input.stop.id;
  out.currentRouteStopKind = input.stop.kind;
  // Anchor heading around the dock's natural mooring axis when available so
  // moored boats sway around their berth instead of sweeping full-circle.
  writeMooredHeading(input.stop.dockTangent, angle, out.heading);
  if (phase.headingPrepT > 0 && input.outgoingPath) {
    sampleWaterPathInto(input.outgoingPath, 0.01, mooringPathPointScratch, mooringPathHeadingScratch);
    if (mooringPathHeadingScratch.x !== 0 || mooringPathHeadingScratch.y !== 0) {
      normalizeHeadingInto(
        out.heading.x + (mooringPathHeadingScratch.x - out.heading.x) * phase.headingPrepT,
        out.heading.y + (mooringPathHeadingScratch.y - out.heading.y) * phase.headingPrepT,
        out.heading,
      );
    }
  }
  out.wakeIntensity = 0.05;
  writeZeroVelocityInto(out);
  writeMapVisibilityAlphaInto(out, mooredMapVisibilityAlpha(input.dwellProgress));
  out.mooringSubPhase = phase.subPhase;
  out.mooringSwayAmplitude = swayAmplitude;
  out.mooringTension = phase.tension;
  out.lanternAlpha = phase.lanternAlpha;
  out.fenderContact = 0;
  out.seaState = input.seaState;
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
  const riskSeconds = route.cycleSeconds * ZONE_DWELL[route.zone].riskDwell;
  const ledgerTransitSecondsEach = riskSeconds * (1 - idleShare) / 2;

  if (progress <= blendStart) {
    mooredRouteStopSampleInto(route, stop, timeSeconds, out);
    return;
  }

  const runtime = routeSamplingRuntime(route);

  // D2: blend window [0.55, 0.58] — smoothstep the orbit displacement toward
  // zero before transit takes over, preventing the ~0.14–0.20 tile position jump.
  if (progress < idleShare) {
    const routePathKey = routePathIdentityKey(route, "ledger-blend", stop.id);
    // Sample orbit (moored) into scratch.
    mooredRouteStopSampleInto(route, stop, timeSeconds, ledgerOrbitScratch);
    // Sample transit at patrolProgress=0 into scratch (start of outbound).
    transitSampleInto({
      route,
      path: patrol.outbound,
      progress: 0,
      transitSeconds: ledgerTransitSecondsEach,
      state: "sailing",
      routeStop: null,
      fromMooringStop: null,
      toMooringStop: null,
      timeSeconds,
      runtime,
    }, ledgerTransitScratch);
    // Blend factor: 0 at blendStart, 1 at idleShare.
    const easeOut = smoothstepRange(blendStart, idleShare, progress);
    beginRoutePathSample(route, routePathKey);
    out.shipId = route.shipId;
    clampMotionTileInto(
      ledgerOrbitScratch.tile.x * (1 - easeOut) + ledgerTransitScratch.tile.x * easeOut,
      ledgerOrbitScratch.tile.y * (1 - easeOut) + ledgerTransitScratch.tile.y * easeOut,
      out.tile,
    );
    // State: use orbit state until easeOut > 0.5, then transit.
    out.state = easeOut > 0.5 ? "sailing" : "moored";
    out.zone = route.zone;
    writeRouteContextInto(route, routePathKey, out);
    out.currentDockId = null;
    out.currentRouteStopId = easeOut > 0.5 ? null : ledgerOrbitScratch.currentRouteStopId;
    out.currentRouteStopKind = easeOut > 0.5 ? null : ledgerOrbitScratch.currentRouteStopKind;
    // Blend heading via component lerp then renormalize.
    const blendHx = ledgerOrbitScratch.heading.x * (1 - easeOut) + ledgerTransitScratch.heading.x * easeOut;
    const blendHy = ledgerOrbitScratch.heading.y * (1 - easeOut) + ledgerTransitScratch.heading.y * easeOut;
    normalizeHeadingInto(blendHx, blendHy, out.heading);
    out.wakeIntensity = ledgerOrbitScratch.wakeIntensity * (1 - easeOut) + ledgerTransitScratch.wakeIntensity * easeOut;
    writeVelocityInto(
      out,
      (ledgerOrbitScratch.velocity?.x ?? 0) * (1 - easeOut) + (ledgerTransitScratch.velocity?.x ?? 0) * easeOut,
      (ledgerOrbitScratch.velocity?.y ?? 0) * (1 - easeOut) + (ledgerTransitScratch.velocity?.y ?? 0) * easeOut,
    );
    writeMapVisibilityAlphaInto(out, 1);
    out.mooringSubPhase = null;
    out.mooringTension = 0;
    out.lanternAlpha = 0;
    out.fenderContact = 0;
    return;
  }

  const patrolProgress = (progress - idleShare) / Math.max(0.0001, 1 - idleShare);
  if (patrolProgress < 0.5) {
    transitSampleInto({
      route,
      path: patrol.outbound,
      progress: smoothstep(patrolProgress * 2),
      transitSeconds: ledgerTransitSecondsEach,
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
    transitSeconds: ledgerTransitSecondsEach,
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
  const routePathKey = routePathIdentityKey(route, "route-stop", stop.id);
  beginRoutePathSample(route, routePathKey);
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
  writeRouteContextInto(route, routePathKey, out);
  out.currentDockId = null;
  out.currentRouteStopId = stop.id;
  out.currentRouteStopKind = stop.kind;
  writeMooredHeading(stop.dockTangent, angle, out.heading);
  out.wakeIntensity = 0.03;
  writeZeroVelocityInto(out);
  writeMapVisibilityAlphaInto(out, 1);
  out.mooringSubPhase = null;
  out.mooringTension = 0;
  out.lanternAlpha = 0;
  out.fenderContact = 0;
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
  const routePathKey = routePathIdentityKey(route, "risk-drift");
  beginRoutePathSample(route, routePathKey);
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
  writeRouteContextInto(route, routePathKey, out);
  out.currentDockId = null;
  out.currentRouteStopId = null;
  out.currentRouteStopKind = null;
  normalizeHeadingInto(-Math.sin(angle), Math.cos(angle * 0.8), out.heading);
  writeVelocityInto(
    out,
    -Math.sin(angle) * radius.x * radiusScale * staleRadiusFactor * staleAngularFactor * 0.017,
    Math.cos(angle * 0.8) * radius.y * radiusScale * staleRadiusFactor * staleAngularFactor * 0.8 * 0.017,
  );
  writeMapVisibilityAlphaInto(out, 1);
  out.wakeIntensity = 0.08;
}

function clampMotionTileInto(x: number, y: number, out: { x: number; y: number }): void {
  out.x = Math.max(0, Math.min(MAX_TILE_X, x));
  out.y = Math.max(0, Math.min(MAX_TILE_Y, y));
}

function clampAroundPointInto(
  point: { x: number; y: number },
  center: { x: number; y: number },
  radius: number,
  out: { x: number; y: number },
): void {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= radius || distance === 0) {
    clampMotionTileInto(point.x, point.y, out);
    return;
  }
  const scale = radius / distance;
  clampMotionTileInto(center.x + dx * scale, center.y + dy * scale, out);
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
