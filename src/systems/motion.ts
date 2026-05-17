import { isShipMapVisible as isShipSemanticallyMapVisible } from "./motion-planning";
import type { ShipMotionSample } from "./motion-types";
import type { ShipNode } from "./world-types";

export const MAP_VISIBILITY_TARGET_ALPHA_THRESHOLD = 0.12;

export function shipMapVisibilityAlpha(ship: ShipNode, sample: ShipMotionSample | null | undefined): number {
  if (ship.visual.sizeTier === "titan" || ship.visual.sizeTier === "unique") return 1;
  if (!sample) return 1;
  const alpha = typeof sample.mapVisibilityAlpha === "number" && Number.isFinite(sample.mapVisibilityAlpha)
    ? sample.mapVisibilityAlpha
    : fallbackShipMapVisibilityAlpha(sample);
  return Math.max(0, Math.min(1, alpha));
}

export function isShipMapVisible(ship: ShipNode, sample: ShipMotionSample | null | undefined): boolean {
  if (ship.visual.sizeTier === "titan" || ship.visual.sizeTier === "unique") return true;
  if (!sample) return isShipSemanticallyMapVisible(ship, sample);
  return shipMapVisibilityAlpha(ship, sample) >= MAP_VISIBILITY_TARGET_ALPHA_THRESHOLD;
}

function fallbackShipMapVisibilityAlpha(sample: ShipMotionSample): number {
  if (sample.state === "moored" && sample.currentDockId) {
    return typeof sample.mooringTension === "number" && Number.isFinite(sample.mooringTension)
      ? 1 - sample.mooringTension
      : 0;
  }
  if (sample.state === "arriving") {
    return typeof sample.fenderContact === "number" && Number.isFinite(sample.fenderContact)
      ? 1 - sample.fenderContact
      : 1;
  }
  if (sample.state === "departing") {
    return typeof sample.mooringTension === "number" && Number.isFinite(sample.mooringTension)
      ? 1 - sample.mooringTension
      : 1;
  }
  return 1;
}

export {
  __testPathCacheSize,
  buildBaseMotionPlan,
  buildMotionPlan,
  BoundedShipWaterRouteCache,
  disposePathCacheForMap,
  getCurrentMapPathCacheStats,
  lighthouseFireFlickerSpeed,
  motionPlanSignature,
  stableMotionPhase,
} from "./motion-planning";
export { shipCycleTempo, precomputeShipTempos, SPEED_QUARTILE_SCALARS, CYCLE_TEMPO_LABELS } from "./ship-cycle-tempo";
export { buildShipWaterRoute } from "./motion-water";
export {
  clearShipHeadingMemory,
  createShipMotionSample,
  getShipWakeIntensityMemory,
  resolveShipMotionSample,
  resolveShipMotionSampleInto,
  sampleShipWaterPath,
  shipWaterPathKey,
} from "./motion-sampling";
export type {
  PharosVilleBaseMotionPlan,
  PharosVilleMotionPlan,
  ShipDockMotionStop,
  ShipLedgerMotionStop,
  ShipMotionRoute,
  ShipMotionRouteStop,
  ShipMotionSample,
  ShipMotionState,
  ShipMotionStopKind,
  ShipWaterPath,
} from "./motion-types";
