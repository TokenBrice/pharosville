// Re-exported for backwards-compatibility with existing consumers
// (`use-asset-loading-pipeline.ts`, `ships.test.ts`). New code should import
// from `../ship-visual-config` directly.
export {
  PROCEDURAL_SHIP_PENNANT_MARK,
  SHIP_PENNANT_MARKS,
  SHIP_SAIL_EMBLEM_OVERRIDES,
  SHIP_SAIL_EMBLEM_PAINTED,
  SHIP_SAIL_MARKS,
  SHIP_TRIM_COLOR_STORIES,
  SHIP_TRIM_MARKS,
  TITAN_SPRITE_IDS,
} from "../../ship-visual-config";

export {
  drawShipBody,
  drawShipOverlay,
  drawShipWake,
  drawSquadIdentityAccent,
  planShipRenderLod,
  resetPlanCache,
  resolveShipVisualOrientation,
  shipMastTopScreenPoint,
  type ShipRenderFrame,
  type ShipRenderLodPlan,
  type ShipRenderState,
  type ShipVisualOrientation,
  type TitanPoseBucket,
} from "./draw-ship";

export {
  resetTitanPathCache,
  resolveTitanBowSprayStrands,
  titanPathCacheStats,
  wakePersonalityForHull,
  type TitanBowSprayStrand,
  type TitanPathCacheStats,
  type WakePersonality,
} from "./wake";
