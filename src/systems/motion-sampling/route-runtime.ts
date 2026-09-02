import { stableHash, stableUnit } from "../stable-random";
import { pathKey, positiveModulo } from "../motion-utils";
import { ZONE_DWELL } from "../motion-config";
import type { ShipMotionRoute, ShipWaterPath } from "../motion-types";
import type { ShipWaterZone } from "../world-types";

export interface RouteSamplingRuntime {
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

export function routeSamplingRuntime(route: ShipMotionRoute): RouteSamplingRuntime {
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
  // Keep the schedule's weighted repeats: weightedDockStopSchedule encodes
  // chain deployment share by repeating high-weight dockIds, and the per-cycle
  // rotation in scheduledDockStopAt walks this multiset so higher-share docks
  // are visited proportionally more often across cycles. Deduping here would
  // flatten every dock back to a uniform cadence.
  const scheduledNonHomeStops = route.dockStopSchedule
    .filter((dockId) => dockId !== homeStop?.dockId)
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
    zoneDwell: dockedShipZoneDwell(route.zone),
  };
  routeSamplingRuntimeCache.set(route, runtime);
  return runtime;
}

export function activeStopCountForCycle(runtime: RouteSamplingRuntime): number {
  return runtime.scheduledStopCount <= 0 ? 0 : 1;
}

export function scheduledDockStopAt(
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
  const dwellShare = base.dockDwell;
  const transit = Math.min(base.transit, 1 - dwellShare - 0.08);
  return {
    dockDwell: dwellShare,
    riskDwell: 1 - dwellShare - transit,
    transit,
  };
}
