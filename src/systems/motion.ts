import type { ShipMotionSample } from "./motion-types";
import type { ShipNode } from "./world-types";

export const MAP_VISIBILITY_TARGET_ALPHA_THRESHOLD = 0.12;

export function shipMapVisibilityAlpha(ship: ShipNode, sample: ShipMotionSample | null | undefined): number {
  if (ship.visual.sizeTier === "titan" || ship.visual.sizeTier === "unique") return 1;
  if (!sample) return 1;
  return Math.max(0, Math.min(1, sample.mapVisibilityAlpha));
}

export function isShipMapVisible(ship: ShipNode, sample: ShipMotionSample | null | undefined): boolean {
  if (ship.visual.sizeTier === "titan" || ship.visual.sizeTier === "unique") return true;
  if (!sample) return true;
  return shipMapVisibilityAlpha(ship, sample) >= MAP_VISIBILITY_TARGET_ALPHA_THRESHOLD;
}

export {
  __testPathCacheSize,
  buildBaseMotionPlan,
  buildMotionPlan,
  BoundedShipWaterRouteCache,
  disposePathCacheForMap,
  getCurrentMapPathCacheStats,
  motionPlanSignature,
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
