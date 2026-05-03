export {
  __testPathCacheSize,
  buildBaseMotionPlan,
  buildMotionPlan,
  BoundedShipWaterRouteCache,
  disposePathCacheForMap,
  getCurrentMapPathCacheStats,
  isShipMapVisible,
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
