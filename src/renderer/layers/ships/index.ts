// Re-exported for backwards-compatibility with existing consumers
// (`use-asset-loading-pipeline.ts`, `ships.test.ts`). New code should import
// from `../ship-visual-config` directly.
export { HERITAGE_NAMEPLATE_MIN_ZOOM } from "../../visual-scales";

export {
  PROCEDURAL_SHIP_PENNANT_MARK,
  SHIP_HERITAGE_NAMEPLATES,
  SHIP_PENNANT_MARKS,
  SHIP_SAIL_EMBLEM_OVERRIDES,
  SHIP_SAIL_EMBLEM_PAINTED,
  SHIP_SAIL_MARKS,
  SHIP_TRIM_COLOR_STORIES,
  SHIP_TRIM_MARKS,
  TITAN_SPRITE_IDS,
} from "../../ship-visual-config";

export {
  drawRiskZoneHullWeathering,
  drawShipBody,
  drawShipOverlay,
  drawShipWake,
  drawSquadIdentityAccent,
  hullWeatheringLevelForZone,
  planShipRenderLod,
  resetPlanCache,
  resolveSailTrimShear,
  resolveShipVisualOrientation,
  shipMastTopScreenPoint,
  type HullWeatheringLevel,
  type ShipRenderFrame,
  type ShipRenderLodPlan,
  type ShipRenderState,
  type ShipVisualOrientation,
  type TitanPoseBucket,
} from "./draw-ship";

export {
  resetTitanPathCache,
  resetWakeTrails,
  resolveTitanBowSprayStrands,
  titanPathCacheStats,
  wakePersonalityForHull,
  type TitanBowSprayStrand,
  type TitanPathCacheStats,
  type WakePersonality,
} from "./wake";

export {
  drawHeritageNameplate,
  getSailEmblemSpriteCacheStats,
  getSailLogoSpriteCacheStats,
} from "./sail";

export { drawShipNameplates } from "./nameplates";

export {
  getShipSailTintCacheStats,
  type CacheStats,
} from "./livery";
