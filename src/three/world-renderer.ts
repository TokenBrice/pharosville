import { emptyTextureStorageEstimate, textureOwnerCensus } from "./texture-owner-census";
import {
  AgXToneMapping,
  AmbientLight,
  Box3,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  HemisphereLight,
  InstancedMesh,
  Line,
  Light,
  LineBasicMaterial,
  Material,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import type {
  CreateThreeWorldRendererInput,
  ThreeWorldRenderer,
  ThreeWorldRendererFrame,
  ThreeWorldRendererMetrics,
} from "../renderer/world-renderer-backend";
import type {
  PharosVilleRenderSchedulerTier,
  TextureOwnerCensus,
  TextureOwnerManifestEntry,
} from "../renderer/render-types";
import { isRenderSchedulerIdle, seaQualityTier } from "../renderer/render-scheduler";
import {
  GARDEN_HULL_SILHOUETTES,
  GARDEN_SILHOUETTE_FOR_HULL,
  GARDEN_LIGHTHOUSE_BEACON_Y,
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
  GARDEN_SHIP_ROOT_Y,
  gardenShipVisualScale,
  GARDEN_WATER_Y as WATER_LEVEL,
  gardenDockDisplayTile,
  gardenIslandDisplayTile,
  resolveGardenShipDisplayTile,
  selectGardenDocks,
  selectGardenObservatorySlice,
  selectGardenTransientShip,
} from "../systems/garden-observatory-slice";
import {
  gardenFleetThinningShips,
  type GardenFleetThinningShip,
} from "../systems/garden-fleet-thinning";
import { placeGardenFleet } from "../systems/garden-fleet-placement";
import { HARBOR_PALETTE, zoneThemeForTerrain } from "../systems/palette";
import {
  gardenShipWaterMarginTiles,
} from "../systems/garden-water-exclusion";
import {
  cameraPlateHaze,
  cameraView,
  CAMERA_FOV_DEG,
  CAMERA_NEAR,
  CAMERA_FAR,
  TILE_SCALE,
} from "../systems/projection";
import { setGardenAerialPlateHaze, setGardenAerialVeil } from "./garden-aerial";
import {
  advanceEpistemicHaze,
  deriveEpistemicHaze,
  type EpistemicFogBank,
  type EpistemicFogSource,
} from "../systems/epistemic-haze";
import { psiSkyClarity, type PsiSkyClarity } from "../systems/psi-sky";
import { seasonFromDate, worldCalendarDate, type GardenSeason } from "../systems/season";
import { isDebugChromeEnabled } from "../lib/pharosville-debug";
import { createGardenAlmanacDressing, type GardenAlmanacDressing } from "./garden-almanac-dressing";
import { createGardenKeeper, type GardenKeeper } from "./garden-keeper";
import {
  createDrawOwnerRecorder,
  shouldRequestDrawCensus,
  type DrawOwnerCensus,
  type DrawRecorderTarget,
} from "./garden-draw-census";
import {
  GARDEN_BREATH_PHASE,
  gardenBreathAt,
  writeWeatherPlan,
  type WeatherPlan,
} from "../systems/weather";
import { writeAudioSceneFrame, writeAudioSceneView } from "../lib/pharosville-audio/scene-snapshot";
import {
  advanceLampStatus,
  initialLampStatusState,
  lampStatusMixForStatus,
  lampStatusModulationForMix,
  LAMP_STATUS_TRANSITION_SECONDS,
  type LampStatusModulation,
  type LampStatusHysteresisState,
} from "../systems/lamp-status";
import type { ShipWaterPath } from "../systems/motion-types";
import { createSourceStatuses, type PharosVilleWorld, type ShipNode } from "../systems/world-types";
import {
  worldRenderContentPartHashes,
} from "../systems/world-render-content-signature";
import {
  createGardenPigeonnier,
  type GardenPigeonnierLandmark,
} from "./garden-landmarks";
import { createGardenStoneGarden, type GardenStoneGarden } from "./garden-stone-garden";
import {
  createGardenFireflies,
  type GardenFireflies,
} from "./garden-harbor-life";
import { createGardenHorizon, type GardenHorizon } from "./garden-horizon";
import { createGardenSeaSigns, type GardenSeaSigns, type SeaSignSpec } from "./garden-sea-signs";
import { createGardenSeaEdges, type GardenSeaEdges } from "./garden-sea-edges";
import { SEA_BODY_TERRAIN, seaBodyForArea, type SeaBodyName } from "../systems/sea-bodies";
import { createGardenIslets, type GardenIslets } from "./garden-islets";
import {
  createGardenHeroReflectionPass,
  GARDEN_HERO_REFLECTION_LAYER,
} from "./garden-hero-reflection-pass";
import {
  createGardenOverviewLod,
  type GardenOverviewLod,
} from "./garden-overview-lod";
import {
  createGardenRimMesh,
  type GardenRimMesh,
} from "./garden-rim-mesh";
import { createGardenThreshold, type GardenThreshold } from "./garden-threshold";
import { createGardenModelLibrary } from "./garden-models";
import { createGardenWater, type GardenWater } from "./garden-water";
import type { GardenCloudShadowSource } from "./garden-water-contract";
import { dayCycleBeats, dayCycleExposure, dayCyclePhase, updateDayCycle, type DayCyclePhase } from "./garden-day-cycle";
import { applyGardenPrintInksToTree, updateGardenPrintInks } from "./garden-print-inks";
import { setGardenFloraNightValue } from "./garden-flora";
import { createGardenSky, type GardenSky } from "./garden-sky";
import {
  createGardenSeasonalDressing,
  type GardenSeasonalDressing,
} from "./garden-seasonal-dressing";
import { createGardenWakes, type GardenWakes } from "./garden-wakes";
import {
  createGardenWaterfall,
  GARDEN_WATERFALL_DISPLACEMENT,
  type GardenWaterfall,
} from "./garden-waterfall";
import {
  assignGardenWakeSlots,
  createGardenWakeBatch,
  type GardenWakeBatch,
} from "./garden-wake-batch";
import { createGardenEnvironment, type GardenEnvironment } from "./garden-environment";
import { createGardenCueMarker } from "./garden-cue-marker";
import { createGardenPost, GARDEN_TONE_MAPPING } from "./garden-post";
import {
  authorDock,
  createHarborLanterns,
  gardenHarborLanternWorldPositions,
  type DockVisual,
} from "./garden-docks";
import {
  createGardenHarborBatch,
  type GardenHarborBatch,
} from "./garden-harbor-batch";
import {
  cargoTideSpecs,
  createGardenCargoTide,
  type GardenCargoTide,
} from "./garden-cargo-tide";
import {
  createGardenFlightTenders,
  flightTenderTitans,
  type GardenFlightTenders,
} from "./garden-flight-tenders";
import {
  createGardenShipIssuanceWorksets,
  issuanceWorksetShips as selectIssuanceWorksetShips,
  shipIssuanceWorksetSpecs,
  type GardenShipIssuanceWorksets,
} from "./garden-ship-issuance";
import { createGardenTidalFlat, type GardenTidalFlat } from "./garden-tidal-flat";
import { gardenLastVisitTide } from "../systems/garden-last-visit";
import {
  createGardenLaneRegistry,
  patchGardenLanternKindling,
  updateGardenLanternKindling,
  type GardenLaneRegistry,
} from "./garden-lanterns";
import { registerRitual } from "../systems/garden-director";
import { GARDEN_FIREFLY_REED_BED } from "../systems/garden-sea-edge-sites";
import { cancelGardenRituals, tickGardenScore } from "../systems/garden-score";
import {
  CEMETERY_CENTER,
} from "../systems/world-layout";
import {
  createTerracedIsland,
  GARDEN_CRAG_HEADLAND_NAME,
  createWaterAccents,
  gardenIslandLanternMaterial,
  gardenIslandLanternWorldOffsets,
  updateGardenNiwakiWind,
  type GardenPondReflection,
} from "./garden-island";
import { applyGardenMonthRecord } from "./garden-month-record";
import {
  applyLighthouseRimLight,
  attachGardenLighthouseModel,
  collectLighthouseGlowMaterials,
  createLanternSwell,
  gardenLanternCatch,
  type LanternSwell,
  updateLighthouseAir,
  updateLighthouseLampStatus,
  updateLighthouseLanternGlass,
  updateLighthouseRimLight,
} from "./garden-lighthouse";
import { gardenKeyLightPose, type GardenLightPose } from "./garden-sun";
import { createGardenBeaconFire, type GardenBeaconFire } from "./garden-beacon-fire";
import {
  createGardenStationSmoke,
  stationSmokeSpecs,
  type GardenStationSmoke,
} from "./garden-station-smoke";
import { createGardenSignalMast, type GardenSignalMast } from "./garden-signal-mast";
import {
  createGardenCrossBearingBuoys,
  type CrossBearingBuoySpec,
  type GardenCrossBearingBuoys,
} from "./garden-cross-bearing-buoys";
import { beamBearingTo, beamDwellRateScale, beamStaticBearing } from "./garden-beam-dwell";
import { createGardenGullFlock, type GardenGullFlock } from "./garden-summit-birds";
import { createGardenHeron, type GardenHeron } from "./garden-heron";
import { createGardenSkein, type GardenSkein } from "./garden-skein";
import { createGardenFishRings, type GardenFishRings } from "./garden-fish-rings";
import {
  assignGardenHeroSailAtlas,
  attachGardenHeroModel,
  createBatchedShip,
  createFleetBatchGeometry,
  createFleetLanterns,
  createPennantGeometry,
  createShip,
  createShipShadows,
  gardenShipUsesHeroModel,
  resetFleetSailAttention,
  syncShipSailTextures,
  type FleetLanterns,
  type ShipVisual,
} from "./garden-ships";
import {
  createFleetBatches,
  disposeFleetBatches,
  FLEET_SAIL_ATLAS_CELLS,
  fleetDrawCallCount,
  GARDEN_FLEET_BATCH_CAPACITY,
  setFleetLightHour,
  type FleetBatches,
} from "./garden-fleet-batch";
import {
  assignGardenSailAtlasCells,
  createGardenSailAtlas,
  gardenSailAtlasCell,
  type GardenSailAtlas,
} from "./garden-sail-atlas";
import {
  cachedShipGeometry,
  countDrawableObjects,
  disposeThreeObjectTree,
  stableUnit,
  type GardenShipGeometryCache,
} from "./garden-util";
import { setGardenQuayEpistemicHaze } from "./garden-height-fog";
import {
  createZone,
  createZoneField,
  type ZoneField,
  type ZoneVisual,
} from "./garden-zones";
import {
  createTextureUploadScheduler,
  type TextureUploadScheduler,
} from "./texture-upload-scheduler";
import {
  GARDEN_MASS_TRANSITION_SNAP_RATIO,
  GARDEN_SCALAR_TRANSITION_SECONDS,
  GARDEN_SHIP_CROSS_MAP_TILES,
  GARDEN_SHIP_TRANSITION_MAX_SECONDS,
  GARDEN_SHIP_TRANSITION_MIN_SECONDS,
  GARDEN_YOUNG_WORLD_SNAP_SECONDS,
  gardenMistBoundaryTile,
  gardenTransitionWaveReady,
  sampleGardenShipTransition,
  type GardenShipTransitionKind,
  type GardenShipTransitionSpec,
  type GardenTransitionTile,
} from "./renderer-transitions";
import {
  captureGardenShadowView,
  configureGardenShadowRenderer,
  createGardenShadowRig,
  flagStaticShadowUsers,
  updateGardenShadows,
  type GardenShadowRig,
} from "./renderer-shadow-rig";
import {
  advanceGardenOverviewDetail,
  createRendererDetailPolicy,
  gardenFineDetailVisible,
  resolveRendererDetailPolicy,
  updateGardenZoneBuoyDetail,
  type RendererDetailPolicy,
} from "./renderer-semantic-view";
import {
  createGardenShipFrameInput,
  disposeDepartingVisual,
  updateGardenShipFrame,
  type GardenShipFrameInput,
} from "./renderer-ship-frame";

export { disposeThreeObjectTree } from "./garden-util";

const MAX_THREE_DPR = 2;
const cameraViewTarget = new Vector3();
let cameraViewHeight = 0;
/** How long a lost WebGL context has to come back before the world gives up. */
const CONTEXT_RESTORE_GRACE_MS = 5000;

// C4: quality ranking used to track the best load tier reached this session.
// "interaction" is a transient camera-gesture mode, ranked below balanced.
const SESSION_TIER_QUALITY: Record<PharosVilleRenderSchedulerTier, number> = {
  constrained: 0,
  recovery: 1,
  interaction: 2,
  balanced: 3,
  full: 4,
};

/**
 * G3/W4.12: the two feeds that can go stale each own one bounded fog bank —
 * the peg summary over the risk waters, the chains feed over the harbour
 * ring. Centres are the centroids of what each feed paints; the bank never
 * covers the island. Scratch objects: sources are rebuilt every frame.
 */
const scratchFogSources: [EpistemicFogSource, EpistemicFogSource] = [
  { id: "peg-summary", feed: "Peg summary", stale: false, centre: { x: 0, z: 0 }, radius: 24, lastGood: null },
  { id: "chains", feed: "Chains", stale: false, centre: { x: 0, z: 0 }, radius: 24, lastGood: null },
];
let asOfCacheKey: number | null | undefined;
let asOfIso: string | null = null;
let pegFogAsOfKey: number | null | undefined;
let chainsFogAsOfKey: number | null | undefined;
/** ISO for the scene snapshot, formatted once per snapshot. */
function syncWorldAsOf(generatedAt: number | null): void {
  if (generatedAt === asOfCacheKey) return;
  asOfCacheKey = generatedAt;
  asOfIso = generatedAt === null ? null : new Date(generatedAt).toISOString();
}
function epistemicFogSources(
  world: PharosVilleWorld,
  out: [EpistemicFogSource, EpistemicFogSource],
): readonly EpistemicFogSource[] {
  const pegAsOf = world.freshness.pegSummary.observedAt ?? world.freshness.pegSummary.publishedAt;
  const chainsAsOf = world.freshness.chains.observedAt ?? world.freshness.chains.publishedAt;
  let riskX = 0;
  let riskZ = 0;
  let riskCount = 0;
  for (const area of world.areas) {
    if (!area.band) continue;
    riskX += area.tile.x;
    riskZ += area.tile.y;
    riskCount += 1;
  }
  let dockX = 0;
  let dockZ = 0;
  for (const dock of world.docks) {
    dockX += dock.tile.x;
    dockZ += dock.tile.y;
  }
  const peg = out[0];
  peg.stale = world.freshness.pegSummary.state !== "current";
  peg.centre.x = (riskCount ? riskX / riskCount : world.lighthouse.tile.x) * TILE_SCALE;
  peg.centre.z = (riskCount ? riskZ / riskCount : world.lighthouse.tile.y) * TILE_SCALE;
  if (pegAsOf !== pegFogAsOfKey) {
    pegFogAsOfKey = pegAsOf;
    peg.lastGood = pegAsOf === null ? null : new Date(pegAsOf).toISOString();
  }
  const chains = out[1];
  chains.stale = world.freshness.chains.state !== "current";
  chains.centre.x = (world.docks.length ? dockX / world.docks.length : world.lighthouse.tile.x) * TILE_SCALE;
  chains.centre.z = (world.docks.length ? dockZ / world.docks.length : world.lighthouse.tile.y) * TILE_SCALE;
  if (chainsAsOf !== chainsFogAsOfKey) {
    chainsFogAsOfKey = chainsAsOf;
    chains.lastGood = chainsAsOf === null ? null : new Date(chainsAsOf).toISOString();
  }
  return out;
}
const scratchPosition = new Vector3();
/** Key-light pose for the tower rim (sun by day, moon at night), rewritten every frame. */
const scratchRimKeyPose: GardenLightPose = { direction: new Vector3(0, 1, 0), elevation: Math.PI / 2 };
/**
 * G2/W2.9: the day cycle normalises ship lantern cores to a linear luminance
 * (2.7) on `lantern_glow`; the winter swap to `lantern_warm` below must not
 * drop them under the bloom threshold, so the intensity is rescaled by the
 * two colours' luminance ratio. Computed once — both are palette constants.
 */
const WINTER_LANTERN_INTENSITY_SCALE = (() => {
  const luma = (hex: string) => {
    const c = new Color(hex);
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  };
  return luma(HARBOR_PALETTE.lantern_glow) / luma(HARBOR_PALETTE.lantern_warm);
})();
// Reused argument records for the per-frame update calls below. Every callee
// destructures its input on entry and keeps nothing, so one record per call
// site is enough to keep the frame path free of the object literals it would
// otherwise mint — one per flock and mast per frame, and one per hero hull.
const scratchAmbientFrame = { reducedMotion: false, timeSeconds: 0, visible: false };
// Phase 2 god rays: per-frame scratch for the beam's forward-scattering dot.
const scratchViewDirection = new Vector3();
const scratchBeamDirection = new Vector3();

function collectObjectTextures(model: Object3D): Texture[] {
  const textures = new Set<Texture>();
  model.traverse((object) => {
    if (!(object as Mesh).isMesh) return;
    const { material } = object as Mesh;
    const materials = Array.isArray(material) ? material : [material];
    for (const entry of materials) {
      for (const value of Object.values(entry)) {
        if (value instanceof Texture) textures.add(value);
      }
      const uniforms = (entry as ShaderMaterial).uniforms;
      if (!uniforms) continue;
      for (const uniform of Object.values(uniforms)) {
        if (uniform.value instanceof Texture) textures.add(uniform.value);
      }
    }
  });
  return [...textures];
}

function scheduleModelTextureUploads(input: {
  isOwnerValid: () => boolean;
  model: Object3D;
  onReady: () => void;
  owner: object;
  ownerName: string;
  scheduler: TextureUploadScheduler;
}): void {
  const textures = collectObjectTextures(input.model);
  if (textures.length === 0) {
    input.onReady();
    return;
  }
  input.model.visible = false;
  for (const texture of textures) {
    input.scheduler.schedule({
      isOwnerValid: input.isOwnerValid,
      key: `${input.ownerName}.${texture.uuid}`,
      onOwnerDrained: () => {
        if (!input.isOwnerValid()) return;
        input.model.visible = true;
        input.onReady();
      },
      owner: input.owner,
      ownerName: input.ownerName,
      texture,
    });
  }
}

function sceneTextureManifest(scene: GardenScene): readonly TextureOwnerManifestEntry[] {
  const entries: TextureOwnerManifestEntry[] = [
    ...(scene.wakes.getTextureManifest?.() ?? []),
    ...(scene.laneRegistry.getTextureManifest?.() ?? []),
    ...(scene.environment.getTextureManifest?.() ?? []),
  ];
  const shadowMap = scene.directionalLight.shadow.map;
  if (shadowMap) {
    entries.push({ owner: "garden-shadows.color", texture: shadowMap.texture });
    if (shadowMap.depthTexture) {
      entries.push({ owner: "garden-shadows.depth", texture: shadowMap.depthTexture });
    }
  }
  return entries;
}

export function createThreeWorldRenderer(
  input: CreateThreeWorldRendererInput,
): ThreeWorldRenderer {
  const renderer = new WebGLRenderer({
    alpha: false,
    antialias: false,
    canvas: input.canvas,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = SRGBColorSpace;
  // Warm-village B5: the ONE tone-mapping decision lives in garden-post's
  // GARDEN_TONE_MAPPING; the renderer constant and the post ToneMappingEffect
  // both derive from it, so flipping the string is the whole A/B. Exposure is
  // authored per beat (W2.1 `dayCycleExposure`) and written every frame.
  renderer.toneMapping = GARDEN_TONE_MAPPING === "neutral" ? NeutralToneMapping : AgXToneMapping;
  configureGardenShadowRenderer(renderer);
  // See the reset in `render` — the frame's totals are accumulated by hand
  // so the composer's passes do not clobber the scene's counts.
  renderer.info.autoReset = false;
  const uploadScheduler = createTextureUploadScheduler(renderer);
  const { canvas, onAssetReady, onContextFailure } = input;
  const modelLibrary = createGardenModelLibrary();
  const camera = new PerspectiveCamera(CAMERA_FOV_DEG, 1, CAMERA_NEAR, CAMERA_FAR);
  // The renderer is built before the scene now: W6.5's sky probe bakes THROUGH
  // the renderer, so the scene cannot be assembled without one. Nothing in
  // `createGardenScene` reads renderer state, so the swap is order-only.
  const scene = createGardenScene(
    renderer,
    uploadScheduler,
    input.calendarDate ?? worldCalendarDate(),
  );
  // W5.1: the dark-moon meteor is the day score's "meteor" ritual.
  const unregisterMeteor = registerRitual("meteor", scene.almanacDressing.ritual);
  const visitorRitual = scene.seasonalDressing.ritual;
  const unregisterVisitor = visitorRitual ? registerRitual("seasonal-visitor", visitorRitual) : null;
  // X5: the island maple's one scored afternoon of letting go.
  const unregisterLetsGo = registerRitual("tree-lets-go", scene.seasonalDressing.letsGoRitual);
  // @types/three still narrows the r185 runtime's null scene/group arguments;
  // the recorder's structural target matches the implementation's actual calls.
  const drawRecorder = createDrawOwnerRecorder(renderer as unknown as DrawRecorderTarget, scene.root);
  let drawCensusRequested = false;
  const handleAssetReady = () => {
    drawCensusRequested = true;
    onAssetReady?.();
  };
  const detailPolicy = createRendererDetailPolicy();
  const shipFrame = createGardenShipFrameInput(uploadScheduler, handleAssetReady);
  const debugDrawCensus = isDebugChromeEnabled();
  const post = createGardenPost(renderer, scene.root, camera);
  const heroReflectionPass = createGardenHeroReflectionPass(renderer);
  // Capture validity follows applied appearance, not hour buckets or world identity.
  // Light values use the GPU's float precision; the other owners retain exact scalars.
  const reflectionAppearance = new Float64Array(15);
  const previousReflectionAppearance = new Float64Array(15);
  const reflectionLights: Light[] = [];
  let reflectionLightBuild = -1;
  let reflectionLightValues = new Float32Array(0);
  let previousReflectionLightValues = new Float32Array(0);
  let reflectionAppearanceValid = false;
  const reflectionLightPosition = new Vector3();
  const reflectionLightTarget = new Vector3();
  Object.assign(scene.water.mesh.material.uniforms, heroReflectionPass.uniforms);

  let disposed = false;
  let lastDpr = 0;
  let lastHeight = 0;
  let lastWidth = 0;
  // C4: best scheduler tier reached this session (debug evidence surface).
  let sessionTierReached: PharosVilleRenderSchedulerTier = "constrained";
  let contentReplacementCount = 0;
  // W4.1: parts actually rebuilt (a refresh only rebuilds what changed).
  let contentPartRebuildCount = 0;
  let lastCensusReplacementCount = -1;
  let lastCensusTextureCount = -1;
  let lastCensusWidth = -1;
  let lastCensusHeight = -1;
  let lastTextureOwnerCensus: TextureOwnerCensus = {
    byteEstimates: emptyTextureStorageEstimate(),
    attributedLiveTextures: null,
    owners: [],
    referencedTextures: 0,
    attributedTextures: 0,
    rendererTextures: 0,
    minimumUnattributedRendererTextures: 0,
  };
  let lastDrawOwnerCensus: DrawOwnerCensus | null = null;
  let frameCounter = 0;
  let aoTierWeight: number | null = null;
  let aoWeightClockSeconds = 0;
  // Wave 1's wider landing composition no longer needs close-range screen-space
  // contact AO. Keep those seven render-target textures cold until the visitor
  // sails in; this value eases so the AO never snaps during a camera move.
  let aoFramingDetail: number | null = null;
  // W1.5: the environment's own clock. The probe's bake cadence and the ambient
  // crossfade it runs between bakes are both real-time eases, and this is the
  // only frame-time delta available before `updateSceneForFrame` advances the
  // scene's own clocks further down.
  let environmentClockSeconds = 0;
  let activeAOQuality: "full" | "balanced" = "balanced";
  let lastMetrics: ThreeWorldRendererMetrics = emptyWorldRendererMetrics();

  // Context loss is usually TRANSIENT — a driver reset, a GPU-process restart,
  // the compositor reclaiming resources — and the browser hands the context
  // back a moment later. Treating the first `webglcontextlost` as a permanent
  // failure meant one of those blips retired the whole 3D world to the DOM
  // overview for the rest of the session, with a reload as the only way back.
  //
  // `preventDefault()` is what makes the browser willing to restore at all, and
  // three's own listeners (registered in the WebGLRenderer constructor, so they
  // run before these) re-initialise its GL state on restore. So: hold the
  // frame, wait, and only give up if the context never comes back.
  let contextLost = false;
  let contextRestoreTimeoutId = 0;
  const handleContextLost = (event: Event) => {
    event.preventDefault();
    if (contextLost) return;
    contextLost = true;
    uploadScheduler.pause();
    contextRestoreTimeoutId = setTimeout(() => {
      if (!contextLost || disposed) return;
      onContextFailure("The 3D rendering context was lost and could not be restored.");
    }, CONTEXT_RESTORE_GRACE_MS) as unknown as number;
  };
  const handleContextRestored = () => {
    if (!contextLost) return;
    contextLost = false;
    uploadScheduler.resume();
    clearTimeout(contextRestoreTimeoutId);
    // The GPU-side surface is new: re-apply the size/pixel-ratio the renderer
    // thinks it already has, and re-render the static shadow map, which is
    // only written when `shadowNeedsRender` asks for it.
    lastDpr = 0;
    lastWidth = 0;
    lastHeight = 0;
    scene.shadowNeedsRender = true;
    heroReflectionPass.invalidate();
    onAssetReady?.();
  };
  const handleContextCreationError = () => {
    onContextFailure("This browser could not create a 3D rendering context.");
  };
  canvas.addEventListener("webglcontextlost", handleContextLost);
  canvas.addEventListener("webglcontextrestored", handleContextRestored);
  canvas.addEventListener("webglcontextcreationerror", handleContextCreationError);

  void modelLibrary.clone("garden-lighthouse-shell")
    .then((model) => {
      if (disposed) {
        disposeThreeObjectTree(model);
        return;
      }
      scene.lighthouseModel = model;
      attachGardenLighthouseModel(model, scene.content);
      model.traverse(enableHeroReflectionLayer);
      heroReflectionPass.invalidate();
      reflectionLightBuild = -1;
      applyGardenPrintInksToTree(model);
      drawCensusRequested = true;
      scheduleModelTextureUploads({
        isOwnerValid: () => !disposed && scene.lighthouseModel === model,
        model,
        onReady: () => {
          // The GLB shell replaces the procedural one — refresh the shadow map.
          scene.shadowNeedsRender = true;
          drawCensusRequested = true;
          heroReflectionPass.invalidate();
          onAssetReady?.();
        },
        owner: scene,
        ownerName: "model.lighthouse",
        scheduler: uploadScheduler,
      });
    })
    .catch(() => {
      // The procedural shell is the intentional asset failure fallback.
    });

  // Titan/unique ships get bespoke hero GLB hulls once loaded. Each attach is
  // per-ships-part-epoch: a clone that resolves after the fleet has been
  // rebuilt is dropped (it still shares the cached geometry, so it must not be
  // disposed).
  const loadHeroesForShips = (content: GardenContent): void => {
    const part = content.parts.ships;
    const epoch = part.epoch;
    const owner = part.owner;
    for (const visual of content.ships) {
      if (visual.heroModelId === null) continue;
      void modelLibrary.clone(visual.heroModelId)
        .then((model) => {
          if (disposed || scene.content !== content || part.epoch !== epoch) return;
          attachGardenHeroModel(visual, model);
          applyGardenPrintInksToTree(model);
          drawCensusRequested = true;
          scheduleModelTextureUploads({
            isOwnerValid: () => !disposed && scene.content === content && part.epoch === epoch,
            model,
            onReady: () => {
              // Ships move independently of the static island shadow map and
              // own their water-contact shadows. Keeping hero hulls out of the
              // directional pass avoids a frozen shadow ghost and redraw.
              drawCensusRequested = true;
              onAssetReady?.();
            },
            owner,
            ownerName: `model.hero.${visual.heroModelId}`,
            scheduler: uploadScheduler,
          });
        })
        .catch(() => {
          // The procedural hull stays visible — the asset-failure fallback.
        });
    }
  };

  return {
    getSeaSignScale() {
      const scale = scene.content?.seaSigns.scale ?? 0;
      return Number.isFinite(scale) && scale > 0 ? scale : null;
    },
    warmup: async () => {
      if (disposed) throw new Error("Cannot warm a disposed Three.js world renderer.");
      // A normal render may compile a material between `compile()` collecting
      // its set and `compileAsync()` polling it (async hero/seasonal content
      // can attach in that window). Three r185 then observes a material whose
      // currentProgram is still undefined and throws from program.isReady().
      // Serial compile remains a complete shader warmup without that polling
      // race; yield once so the arrival veil still releases asynchronously.
      renderer.compile(scene.root, camera);
      await Promise.resolve();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unregisterMeteor();
      unregisterVisitor?.();
      unregisterLetsGo();
      scene.content?.unregisterStoneGardenRitual?.();
      cancelGardenRituals();
      uploadScheduler.dispose();
      clearTimeout(contextRestoreTimeoutId);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      canvas.removeEventListener("webglcontextcreationerror", handleContextCreationError);
      const detachedModel = scene.lighthouseModel?.parent ? null : scene.lighthouseModel;
      // The attention memo is module state in garden-ships; a new renderer in
      // the same session must not inherit this one's hover/selection.
      resetFleetSailAttention();
      post.dispose();
      heroReflectionPass.dispose();
      // Owns a live PMREM render target; the generic tree walk cannot see it
      // because it hangs off `Scene.environment`, not off a child.
      scene.environment.dispose();
      scene.wakes.dispose();
      scene.laneRegistry.dispose();
      scene.water.dispose();
      // W4.1: the shared fleet batches, sail atlas and pennant cache are
      // scene-owned (they survive every content rebuild). If a world was built
      // they are also reachable from the tree walk below — dispose is
      // idempotent — but a renderer disposed before its first world would
      // otherwise leak them.
      disposeFleetBatches(scene.fleetBatches);
      scene.sailAtlas.dispose();
      scene.fleetSharedCache.wakeFillMaterial.dispose();
      for (const geometry of scene.fleetSharedCache.geometries.values()) geometry.dispose();
      // The harbour batch also owns the off-tree source geometries retained by
      // DockRecipe. Its disposer releases both those recipes and the mounted
      // merged/instanced buffers before the generic scene walk below.
      scene.content?.harborBatch?.dispose();
      if (scene.content) scene.content.harborBatch = null;
      // Unregisters the kindling ritual and hands the kindle clock back to the sun.
      scene.keeper.dispose();
      // Releases the heron's two ritual handlers.
      scene.heron.dispose();
      // X5: releases the dawn-skein and fish-rings ritual handlers.
      scene.skein.dispose();
      scene.fishRings.dispose();
      disposeThreeObjectTree(scene.root);
      if (detachedModel) disposeThreeObjectTree(detachedModel);
      modelLibrary.clear();
      renderer.renderLists.dispose();
      renderer.dispose();
    },
    render(frame) {
      if (disposed) throw new Error("Cannot render a disposed Three.js world renderer.");
      // No GL surface to draw into while the context is gone. Report the last
      // frame's numbers so the scheduler and the debug surface see a hold
      // rather than a collapse, and wait for `webglcontextrestored`.
      if (contextLost) return lastMetrics;
      frameCounter += 1;
      // requestIdleCallback is the normal upload lane. This bounded fallback
      // runs at the between-frame boundary so a continuously animated tab (or
      // a browser without rIC) cannot starve pending work until first draw.
      uploadScheduler.flushBetweenFrames();
      // Every camera-keyed detail decision, resolved once for this frame
      // (renderer-semantic-view.ts); everything below reads the record.
      resolveRendererDetailPolicy(frame, detailPolicy);

      // W4.1: per-part reconciliation. Unchanged parts keep their scene
      // subtrees and pending uploads untouched; a ship-only refresh reduces to
      // an in-place data swap plus the per-frame instance restamp the fleet
      // already pays; genuinely-changed heavy parts rebuild at most one per
      // frame so no single frame carries the whole cost.
      if (!scene.content) {
        const content = createWorldContentShell(scene);
        content.lampStatusState = initialLampStatusState(frame.world.freshness);
        content.lampStatusMix = lampStatusMixForStatus(content.lampStatusState.status);
        content.lampStatusTargetMix = content.lampStatusMix;
        scene.content = content;
        reflectionAppearanceValid = false;
        scene.root.add(content.root);
        const keys = worldContentPartKeys(frame.world);
        for (const name of WORLD_CONTENT_PART_ORDER) {
          rebuildWorldContentPart(scene, content, name, frame.world, keys, uploadScheduler);
          contentPartRebuildCount += 1;
        }
        content.shipsPoseKey = keys.shipsPose;
        content.shipsFirstBuiltSeconds = frame.timeSeconds;
        refreshContentIndexes(content, null);
        syncSceneToContent(scene, frame.world);
        scene.world = frame.world;
        contentReplacementCount += 1;
        loadHeroesForShips(content);
      } else {
        const content = scene.content;
        if (scene.world !== frame.world) {
          const snapShipRefresh = shouldSnapShipRefresh(
            content,
            frame.timeSeconds,
            frame.reducedMotion,
          );
          const keys = worldContentPartKeys(frame.world);
          let newlyQueued = 0;
          for (const name of WORLD_CONTENT_PART_ORDER) {
            if (content.parts[name].appliedKey === keys[name]) continue;
            if (content.rebuildQueue.has(name)) continue;
            content.rebuildQueue.add(name);
            newlyQueued += 1;
          }
          if (newlyQueued > 0) contentReplacementCount += 1;
          if (content.rebuildQueue.has("ships")) {
            const snapStructuralShips = snapShipRefresh
              || structuralShipRefreshIsMass(content, frame.world);
            content.snapQueuedShipsRefresh ||= snapStructuralShips;
            if (snapStructuralShips) clearShipTransitionState(scene, content);
          }
          if (!content.rebuildQueue.has("ships") && content.shipsPoseKey !== keys.shipsPose) {
            // The common refresh: berths, offsets or the beam-dwell target
            // moved, but nothing baked into GPU resources did. Swap the data
            // the frame loop reads and let the per-frame restamp carry it.
            applyShipsPoseUpdate(
              scene,
              content,
              frame.world,
              frame.timeSeconds,
              snapShipRefresh,
            );
            content.shipsPoseKey = keys.shipsPose;
            // The pending stamps belong to the previous placements. Clear them
            // before the offscreen pass can composite them.
            scene.wakes.reset();
          }
          content.lampStatusState = advanceLampStatus(content.lampStatusState, frame.world.freshness);
          content.pendingLampStatusTargetMix = lampStatusMixForStatus(
            content.lampStatusState.status,
          );
          // W4.2 TRUTH IMMEDIACY: the detail panel and accessibility ledger
          // read `frame.world`, which becomes authoritative NOW. Only the
          // renderer-side pose/scalar targets above wait for garden time. The
          // transition layer is deliberately not serialized; a reload may
          // snap to current truth rather than resume an old journey.
          adoptFreshWorldData(content, frame.world);
          registerLightLanes(
            scene.laneRegistry,
            frame.world,
            gardenIslandDisplayTile(frame.world.lighthouse.tile),
            content.docks,
            content.zones,
          );
          scene.world = frame.world;
          content.hasReconciledWorld = true;
        }
        if (content.rebuildQueue.size > 0) {
          const keys = worldContentPartKeys(frame.world);
          // Amortize: at most one heavy part per animated frame. The single
          // static frame a reduced-motion visitor gets must be complete, so a
          // reduced-motion frame drains the whole queue deterministically.
          let budget = frame.reducedMotion ? content.rebuildQueue.size : 1;
          let rebuilt = 0;
          for (const name of WORLD_CONTENT_PART_ORDER) {
            if (budget <= 0) break;
            if (!content.rebuildQueue.has(name)) continue;
            content.rebuildQueue.delete(name);
            // A later refresh reverted this part while it waited its turn.
            if (content.parts[name].appliedKey === keys[name]) continue;
            if (name === "ships") scene.wakes.reset();
            if (name === "ships") {
              stageShipsRebuild(
                scene,
                content,
                frame.world,
                content.snapQueuedShipsRefresh || frame.reducedMotion,
              );
              content.snapQueuedShipsRefresh = false;
            }
            rebuildWorldContentPart(
              scene,
              content,
              name,
              frame.world,
              keys,
              uploadScheduler,
              frame.reducedMotion,
            );
            contentPartRebuildCount += 1;
            budget -= 1;
            rebuilt += 1;
            if (name === "ships") {
              content.shipsPoseKey = keys.shipsPose;
              loadHeroesForShips(content);
            }
          }
          if (rebuilt > 0) {
            mergeContentCues(content);
            syncSceneToContent(scene, frame.world);
            content.indexesStale = true;
          }
          // The heavy cross-part scans wait for the LAST part of the batch,
          // so an amortized drain pays them once, not once per frame. The owed
          // flag (rather than `rebuilt > 0`) covers the frame that empties the
          // queue purely by skipping reverted parts.
          if (content.indexesStale && content.rebuildQueue.size === 0) {
            refreshContentIndexes(content, {
              reducedMotion: frame.reducedMotion,
              zoom: detailPolicy.overviewLodZoom,
            });
            content.indexesStale = false;
          }
        }
      }
      // Selecting an outsider ship adds or removes ONLY the transient content
      // it needs — it never triggers a content rebuild (W4.1 item 3).
      reconcileTransientSelection(scene, frame.world, frame.selectedDetailId);

      if (scene.content) {
        startGardenTransitionWave(
          scene,
          scene.content,
          frame.timeSeconds,
          frame.reducedMotion,
        );
      }

      const phase = dayCyclePhase(frame.wallClockHour);
      const beats = dayCycleBeats(frame.wallClockHour);
      renderer.toneMappingExposure = dayCycleExposure(beats);
      updateGardenPrintInks(frame.wallClockHour, beats);
      // Phase 2: the frame's weather plan — one pure function of the world
      // clock and the sea state's PSI stress / base wind, consumed below by
      // the sky, water, rain, fleet, gulls, post, and the shadow light. Under
      // reduced motion the clock pins at 0 and the whole plan (lightning
      // included) freezes into the deterministic static frame.
      writeWeatherPlan({
        timeSeconds: frame.reducedMotion ? 0 : frame.timeSeconds,
        wallClockHour: frame.wallClockHour,
        reducedMotion: frame.reducedMotion,
        psiStress: frame.seaState.source.psiStress,
        baseWind: frame.seaState.wind,
      }, scene.weather);
      // W7.2: the sound engine's clock and sea inputs (scalar stores only).
      writeAudioSceneFrame(frame, beats);
      // D15 channel treaty: PSI owns clarity aloft (cover and haze, never
      // colour); stale sources own bounded local fog; the wall clock owns
      // illumination. Both readings remember their previous value, so they
      // live on the scene. Clarity lands before the phase grade so the probe
      // bakes the sky the frame will actually show.
      syncWorldAsOf(frame.world.generatedAt);
      scene.psiSky = psiSkyClarity({
        lighthouse: frame.world.lighthouse,
        freshness: frame.world.freshness,
        timeSeconds: frame.timeSeconds,
        asOf: asOfIso,
      }, scene.psiSky);
      scene.sky.setClarity(scene.psiSky.clarity, scene.psiSky.band !== "UNAVAILABLE");
      scene.epistemicBanks = advanceEpistemicHaze(
        epistemicFogSources(frame.world, scratchFogSources),
        scene.epistemicBanks,
        frame.timeSeconds,
        frame.reducedMotion,
      );
      // Grade the dome for THIS phase before the probe reads it. The probe
      // renders `sky.domeMaterial` itself and caches the result under the phase
      // key, but the full sky update does not run until `updateSceneForFrame`
      // below — so without this the first bake of a session rendered the NIGHT
      // colours the uniforms are constructed with, stored them under a daytime
      // key, and lit every metal surface in the world with a night probe for as
      // long as that key held. At midday the key never moves again.
      scene.sky.applyPhase(phase, frame.wallClockHour);
      // A PMREM bake is episodic rather than recurring frame work. Measure it
      // in its own reset window so it remains visible without contaminating
      // either the scene subtotal or the recurring total.
      renderer.info.reset();
      const environmentBakeCountBefore = scene.environment.bakeCount;
      const environmentDeltaSeconds = MathUtils.clamp(
        frame.timeSeconds - environmentClockSeconds,
        0,
        0.25,
      );
      environmentClockSeconds = frame.timeSeconds;
      // W1.5: a bake is episodic GPU work, so it waits for a frame that can
      // spare it — an idle duty cycle, or a load tier the ladder reads as
      // healthy — and never lands inside a camera gesture, which is the one
      // input in the app that most wants the budget left alone. The environment
      // bounds its own wait, so a machine that never leaves `recovery` still
      // rebakes; this only decides WHICH frame pays when there is a choice.
      const environmentTier = seaQualityTier(frame.renderScheduler);
      scene.environment.update(phase, beats, scene.weather.stormLevel, {
        bakeAllowed: frame.renderScheduler.tier !== "interaction"
          && (environmentTier === "full" || environmentTier === "balanced"),
        deltaSeconds: environmentDeltaSeconds,
        reducedMotion: frame.reducedMotion,
      });
      const environmentBakeCountChange = scene.environment.bakeCount - environmentBakeCountBefore;
      const environmentBakeCalls = environmentBakeCountChange > 0
        ? renderer.info.render.calls
        : 0;
      renderer.info.reset();
      // Phase 3 (item 2): advance the wake field BEFORE the counters reset,
      // but record its feedback/stamp passes as recurring offscreen work.
      // Stamps consumed here were collected by LAST frame's ship loop (one
      // frame of latency is invisible against an 8-second decay).
      updateCamera(camera, frame);
      {
        const wakeCenterTile = cameraViewTarget;
        scene.wakes.update({
          deltaSeconds: MathUtils.clamp(frame.timeSeconds - scene.beamClockSeconds, 0, 0.25),
          reducedMotion: frame.reducedMotion,
          targetX: wakeCenterTile.x,
          targetZ: wakeCenterTile.z,
          viewHalfWidth: cameraViewHeight * camera.aspect / 2,
          tier: seaQualityTier(frame.renderScheduler),
          visibleStrength: scene.water.wakeStrength(),
        });
      }
      let recurringOffscreenCalls = renderer.info.render.calls;

      // `renderer.info` auto-resets on every `render()` call, and the post
      // composer issues several. Reading it after `post.render()` therefore
      // reported only the final full-screen quad — calls: 1, triangles: 1 —
      // which silently made the D7 GPU budgets in the perf spec vacuous: they
      // were passing against a measurement of nothing.
      //
      // Manual reset here, with autoReset off at construction, accumulates
      // every pass of the frame into one honest total.
      renderer.info.reset();
      if (shouldRequestDrawCensus({
        debug: debugDrawCensus,
        framesSinceSample: frameCounter - (lastDrawOwnerCensus?.sampledAtFrame ?? 0),
        topologyChanged: drawCensusRequested,
      })) {
        drawCensusRequested = false;
        drawRecorder.arm();
      }
      // Counts of GPU resources that already exist. Anything created between
      // here and the end of the frame is first-use warm-up work — see
      // `gpuWarmupCount`.
      const programsBefore = renderer.info.programs?.length ?? 0;
      const geometriesBefore = renderer.info.memory.geometries;
      const texturesBefore = renderer.info.memory.textures;

      const dpr = Math.max(1, Math.min(MAX_THREE_DPR, frame.dpr));
      const dprChanged = dpr !== lastDpr;
      if (dprChanged) {
        renderer.setPixelRatio(dpr);
        lastDpr = dpr;
      }
      if (frame.width !== lastWidth || frame.height !== lastHeight || dprChanged) {
        renderer.setSize(frame.width, frame.height, false);
        post.setSize(frame.width, frame.height, dpr);
        lastWidth = frame.width;
        lastHeight = frame.height;
      }

      if (scene.content) syncShipSailTextures(scene.content, frame);
      updateSceneForFrame(scene, camera, frame, phase, detailPolicy, shipFrame);
      // W5: under reduced motion the hulls' contact footprints are drawn into
      // the (otherwise empty) wake field after this frame's ship loop, so the
      // water reads them this frame. Offscreen work, counted as such.
      let staticContactCalls = 0;
      if (frame.reducedMotion) {
        const callsBefore = renderer.info.render.calls;
        scene.wakes.renderStaticContact();
        staticContactCalls = renderer.info.render.calls - callsBefore;
        recurringOffscreenCalls += staticContactCalls;
      }

      const tier = frame.renderScheduler.tier;
      if (SESSION_TIER_QUALITY[tier] > SESSION_TIER_QUALITY[sessionTierReached]) {
        sessionTierReached = tier;
      }
      const shadowMapSize = updateGardenShadows(scene, camera, frame, phase, visibleGardenThresholdShadowBounds(scene.content));
      // The composer owns the frame's COLOR — AgX tone mapping lives in the
      // fused grade/tone-map pass, and the day-cycle grade and vignette exist
      // nowhere else — so shedding it is not a quality step down, it is a
      // different picture. Crossing the `constrained` boundary swung the
      // frame's brightness and dropped the vignette outright, and because a
      // zoom gesture flaps the scheduler across that boundary repeatedly the
      // whole view flickered under the wheel. The grade and SMAA passes are
      // one full-screen quad each; only the bloom pyramid's cost scales, so
      // only bloom is shed.
      post.setEnabled(true);
      // The pmndrs mipmap-blur bloom downsamples geometrically by
      // construction (see garden-post), so it survives `recovery` — the warm
      // beacon and lantern glow are the night identity, and shedding them at
      // the tier this machine usually sits in meant they were almost never
      // seen. `constrained` means the machine is genuinely drowning, and the
      // mip pyramid is the one pass worth the pop.
      post.setBloomEnabled(tier !== "constrained");
      // N8AO is a local grounding fidelity. The invariant is the semantic
      // palette, hue, AgX curve, grade, and vignette; bounded local AO/bloom
      // luminance changes are allowed. Ease its weight across load tiers so
      // full/balanced -> recovery never flashes, and only disable the pass once
      // the post owner receives an exact zero.
      const aoTier = seaQualityTier(frame.renderScheduler);
      const aoTarget = aoTier === "full" || aoTier === "balanced" ? 1 : 0;
      const aoDeltaSeconds = MathUtils.clamp(
        frame.timeSeconds - aoWeightClockSeconds,
        0,
        0.25,
      );
      aoWeightClockSeconds = frame.timeSeconds;
      if (aoTarget > 0) {
        activeAOQuality = aoTier === "full" ? "full" : "balanced";
      }
      if (aoTierWeight === null || frame.reducedMotion) {
        aoTierWeight = aoTarget;
      } else {
        const alpha = 1 - Math.exp(-aoDeltaSeconds / 0.18);
        aoTierWeight += (aoTarget - aoTierWeight) * alpha;
        if (Math.abs(aoTierWeight - aoTarget) < 0.002) aoTierWeight = aoTarget;
      }
      post.setIdleProfile?.(
        isRenderSchedulerIdle(frame.renderScheduler),
        frame.reducedMotion,
      );
      post.setAOQuality(activeAOQuality);
      post.setAOTierWeight(aoTierWeight);
      // N8AO is close-view grounding; the framing ramp is part of the
      // renderer detail policy (renderer-semantic-view.ts).
      const aoFramingTarget = detailPolicy.aoFramingTarget;
      if (aoFramingDetail === null || frame.reducedMotion) {
        aoFramingDetail = aoFramingTarget;
      } else {
        const alpha = 1 - Math.exp(-aoDeltaSeconds * 12);
        aoFramingDetail += (aoFramingTarget - aoFramingDetail) * alpha;
        if (Math.abs(aoFramingDetail - aoFramingTarget) < 0.001) {
          aoFramingDetail = aoFramingTarget;
        }
      }
      post.setAOZoomDetail(aoFramingDetail);
      post.setGrade(
        frame.wallClockHour,
        scene.weather.stormLevel,
        scene.weather.lightning,
        scene.season === "winter" ? 1 : 0,
      );
      if (scene.content) {
        if (reflectionLightBuild !== contentPartRebuildCount) {
          reflectionLights.length = 0;
          scene.root.traverse((object) => {
            if (object instanceof Light) reflectionLights.push(object);
          });
          const length = reflectionLights.length * 13;
          if (reflectionLightValues.length !== length) {
            reflectionLightValues = new Float32Array(length);
            previousReflectionLightValues = new Float32Array(length);
            reflectionAppearanceValid = false;
          }
          reflectionLightBuild = contentPartRebuildCount;
        }
        for (let index = 0; index < reflectionLights.length; index += 1) {
          const light = reflectionLights[index]!;
          const offset = index * 13;
          light.getWorldPosition(reflectionLightPosition);
          // Directional and spot lights use a target; other lights do not.
          const target = (light as Light & { target?: Object3D }).target;
          if (target) target.getWorldPosition(reflectionLightTarget);
          else reflectionLightTarget.set(0, 0, 0);
          reflectionLightValues[offset] = light.color.r;
          reflectionLightValues[offset + 1] = light.color.g;
          reflectionLightValues[offset + 2] = light.color.b;
          const ground = light instanceof HemisphereLight ? light.groundColor : null;
          reflectionLightValues[offset + 3] = ground?.r ?? 0;
          reflectionLightValues[offset + 4] = ground?.g ?? 0;
          reflectionLightValues[offset + 5] = ground?.b ?? 0;
          reflectionLightValues[offset + 6] = light.intensity;
          reflectionLightValues[offset + 7] = reflectionLightPosition.x;
          reflectionLightValues[offset + 8] = reflectionLightPosition.y;
          reflectionLightValues[offset + 9] = reflectionLightPosition.z;
          reflectionLightValues[offset + 10] = reflectionLightTarget.x;
          reflectionLightValues[offset + 11] = reflectionLightTarget.y;
          reflectionLightValues[offset + 12] = reflectionLightTarget.z;
        }
        const cloud = scene.water.cloudShadows.uniforms;
        const transform = cloud.uCloudShadowTransform.value;
        reflectionAppearance[0] = scene.content.parts.island.epoch;
        reflectionAppearance[1] = frame.seaState.source.psiStress;
        reflectionAppearance[2] = scene.content.lampStatusMix;
        reflectionAppearance[3] = gardenLanternCatch();
        reflectionAppearance[4] = scene.environment.bakeCount;
        reflectionAppearance[5] = scene.root.environmentIntensity;
        reflectionAppearance[6] = scene.weather.stormLevel;
        reflectionAppearance[7] = scene.weather.lightning;
        reflectionAppearance[8] = scene.floraNightValue;
        reflectionAppearance[9] = cloud.uCloudShadowStrength.value;
        reflectionAppearance[10] = transform[0];
        reflectionAppearance[11] = transform[1];
        reflectionAppearance[12] = transform[2];
        reflectionAppearance[13] = transform[3];
        reflectionAppearance[14] = detailPolicy.overviewLodZoom;
        let appearanceChanged = !reflectionAppearanceValid;
        for (let index = 0; index < reflectionAppearance.length; index += 1) {
          if (reflectionAppearance[index] !== previousReflectionAppearance[index]) appearanceChanged = true;
        }
        for (let index = 0; index < reflectionLightValues.length; index += 1) {
          if (reflectionLightValues[index] !== previousReflectionLightValues[index]) appearanceChanged = true;
        }
        if (appearanceChanged) {
          heroReflectionPass.invalidate();
          previousReflectionAppearance.set(reflectionAppearance);
          previousReflectionLightValues.set(reflectionLightValues);
          reflectionAppearanceValid = true;
        }
        heroReflectionPass.render(
          scene.root, camera, scene.content.parts.island.root,
          scene.content.lighthouseRoot, frame.reducedMotion,
        );
      }
      // garden-post's GPU timer has no public wrap hook for the reflection pass.
      // Carry the real frame delta into the post chain so its 180 ms hero
      // fades stay 180 ms at the idle 30 fps duty cycle as well as when awake.
      post.render(aoDeltaSeconds);

      const sampled = drawRecorder.finish(frameCounter);
      if (sampled) {
        lastDrawOwnerCensus = sampled;
        if (sampled.attributedCalls !== sampled.rendererCalls) {
          console.warn("[pharosville] draw census did not reconcile", sampled.attributedCalls, sampled.rendererCalls);
        }
      }
      const content = scene.content;
      const renderInfo = renderer.info.render;
      const sceneCalls = renderInfo.calls - staticContactCalls;
      const programCount = renderer.info.programs?.length ?? 0;
      const geometryCount = renderer.info.memory.geometries;
      const textureCount = renderer.info.memory.textures;
      if (
        renderer.domElement.width !== lastCensusWidth
        || renderer.domElement.height !== lastCensusHeight
        || textureCount !== lastCensusTextureCount
        || contentReplacementCount !== lastCensusReplacementCount
      ) {
        lastTextureOwnerCensus = textureOwnerCensus(scene.root, textureCount, [
          ...(post.getTextureManifest?.() ?? []),
          ...sceneTextureManifest(scene),
        ], renderer);
        drawCensusRequested = true;
        lastCensusWidth = renderer.domElement.width;
        lastCensusHeight = renderer.domElement.height;
        lastCensusTextureCount = textureCount;
        lastCensusReplacementCount = contentReplacementCount;
      }
      lastMetrics = {
        gpuWarmupCount: Math.max(0, programCount - programsBefore)
          + Math.max(0, geometryCount - geometriesBefore)
          + Math.max(0, textureCount - texturesBefore),
        activeLaneCount: scene.laneRegistry.activeLaneCount,
        contentReplacementCount,
        contentPartRebuildCount,
        contentRebuildQueueDepth: content?.rebuildQueue.size ?? 0,
        contentSignaturePartHashes: worldRenderContentPartHashes(frame.world),
        composerEnabled: post.isComposerEnabled(),
        gpuTimings: post.getGpuTimings(),
        environmentBakeCalls,
        environmentBakeCount: scene.environment.bakeCount,
        environmentBakeCountChange,
        // C4 evidence: live water-system state via contract C2 (cloud-shadow
        // sampler, ripple-ring emitter). zoneRadii is live data from the
        // zone field.
        cloudShadowsOn: scene.water.cloudShadowsOn(),
        rippleRingCount: scene.water.rippleRings.ringCount(),
        zoneRadii: content?.zones.map((zone) => ({
          id: zone.area.id,
          radiusX: zone.tint.radiusX,
          radiusZ: zone.tint.radiusZ,
        })) ?? [],
        sessionTierReached,
        objectCount: content?.objectCount ?? 0,
        postPassList: post.getPassList(),
        shadowMapSize,
        gpu: {
          calls: sceneCalls + recurringOffscreenCalls,
          offscreenCalls: recurringOffscreenCalls,
          sceneCalls,
          geometries: geometryCount,
          lines: renderInfo.lines,
          points: renderInfo.points,
          programs: programCount,
          textures: textureCount,
          triangles: renderInfo.triangles,
        },
        movingShipCount: content?.ships.reduce((count, ship) => (
          ship.sampleState === "sailing" || ship.sampleState === "departing" || ship.sampleState === "arriving"
            ? count + 1
            : count
        ), 0) ?? 0,
        fleetDrawCallCount: content ? fleetDrawCallCount(content.fleetBatches) : 0,
        logoAssetsExpected: frame.logos.getExpectedLogoCount?.() ?? 0,
        logoAssetsLoaded: frame.logos.getLoadedLogoCount?.() ?? 0,
        rendererBackend: "three",
        schedulerTier: frame.renderScheduler.tier,
        drawOwnerCensus: lastDrawOwnerCensus,
        textureOwnerCensus: lastTextureOwnerCensus,
        textureUploads: uploadScheduler.metrics(),
        visibleShipCount: content?.visibleShipCount ?? 0,
      };
      return lastMetrics;
    },
  };
}

/** Zeroed metrics for frames that never reached the GPU (context lost). */
function emptyWorldRendererMetrics(): ThreeWorldRendererMetrics {
  return {
    gpu: {
      calls: 0,
      geometries: 0,
      lines: 0,
      offscreenCalls: 0,
      points: 0,
      programs: 0,
      sceneCalls: 0,
      textures: 0,
      triangles: 0,
    },
    gpuWarmupCount: 0,
    drawOwnerCensus: null,
    logoAssetsExpected: 0,
    logoAssetsLoaded: 0,
    movingShipCount: 0,
    objectCount: 0,
    rendererBackend: "three",
    visibleShipCount: 0,
  };
}

export interface GardenScene extends GardenShadowRig {
  almanacDressing: GardenAlmanacDressing;
  /** W5.4 (K20, O19): the evening keeper and the `kindling` ritual; seated at the island root. */
  keeper: GardenKeeper;
  /** W5.2: the one heron and her two rituals (heron-arrives / heron-departs); seated at the island root. */
  heron: GardenHeron;
  /** X5: the seasonal dawn skein (`dawn-skein` ritual); world-space, off the scene root. */
  skein: GardenSkein;
  /** X5: a fish rising on the inlet (`fish-rings` ritual), through the water's one-shot ring. */
  fishRings: GardenFishRings;
  ambientLight: AmbientLight;
  /**
   * The beam's swept angle, integrated rather than derived from the clock.
   *
   * `timeSeconds * sweepRate` looks equivalent and is not: the rate carries the
   * fleet's PSI stress, so every data refresh that nudged the stress
   * teleported the light by `timeSeconds * delta` radians — minutes into a
   * session that is many whole turns in one frame. Integrating keeps the sweep
   * continuous through rate changes and through world rebuilds, and keeps the
   * angle bounded instead of growing without limit.
   */
  beamAngle: number;
  /** World-clock reading the beam angle was last integrated to. */
  beamClockSeconds: number;
  /**
   * G3/D15 data cues with memory. PSI clarity carries 60 s band hysteresis
   * and freezes on stale; fog banks ramp over 45 s on a freshness edge. Both
   * are renderer state because their previous reading is their input.
   */
  psiSky: PsiSkyClarity | null;
  epistemicBanks: readonly EpistemicFogBank[];
  content: GardenContent | null;
  /**
   * W4.1: the shared instanced fleet, its sail atlas and the pennant-geometry
   * cache are SCENE-scope. Their GPU buffers are allocated once per renderer
   * (grow-only capacity, D1) and survive every content rebuild — a data
   * refresh restamps instances, it never reallocates them.
   */
  fleetBatches: FleetBatches;
  fleetSharedCache: GardenShipGeometryCache;
  sailAtlas: GardenSailAtlas;
  /**
   * W6.5: the cached sky probe that lights the scene's standard materials.
   *
   * Scene-scope, not content-scope: it depends only on the hour, so a data
   * refresh must not throw away a bake and pay for a new one.
   */
  environment: GardenEnvironment;
  hemisphereLight: HemisphereLight;
  horizon: GardenHorizon;
  hoverMarker: ReturnType<typeof createGardenCueMarker>;
  islets: GardenIslets;
  laneRegistry: GardenLaneRegistry;
  lighthouseModel: Group | null;
  root: Scene;
  selectedMarker: ReturnType<typeof createGardenCueMarker>;
  /** Last night beat pushed to vegetation materials; the traverse runs only on change. */
  floraNightValue: number;
  season: GardenSeason;
  /** The world calendar day the scene was built for (flora phenology, W4.G5). */
  calendarDate: Date;
  seasonalDressing: GardenSeasonalDressing;
  sky: GardenSky;
  water: GardenWater;
  waterAccents: Group;
  /**
   * Phase 3 (item 2): the persistent wake field. Scene-scope like the sky
   * probe — it depends on the camera and the fleet, not on world content, so
   * a data refresh must not throw the field away.
   */
  wakes: GardenWakes;
  /**
   * Phase 2: the frame's weather plan (wind + storm + lightning), written once
   * per frame from the world clock and the sea state's analytic signals, and
   * consumed by water, sky, rain, fleet, gulls and post. Scene-scope scratch
   * like `beamAngle` — never reallocated.
   */
  weather: WeatherPlan;
  world: PharosVilleWorld | null;
}

interface GardenContent {
  logoGenerationKey: string | null;
  beacon: Mesh<SphereGeometry, MeshStandardMaterial>;
  beaconFire: GardenBeaconFire;
  beaconFireRoot: Group;
  beaconHalo: Mesh<SphereGeometry, MeshBasicMaterial>;
  /** W2.10 (K9): the lantern glass swell, at most once a minute. */
  lanternSwell: LanternSwell;
  /** W6.4: stable data status and its slow render-side transition position. */
  lampStatusState: LampStatusHysteresisState;
  lampStatusMix: number;
  /** Target admitted by the last coalesced W4.2 wave. */
  lampStatusTargetMix: number;
  /** Latest truth waiting for the next visible wave. */
  pendingLampStatusTargetMix: number | null;
  /** Baked cargo/tide states crossfade in this small, draw-call-safe lane. */
  scalarTransitions: GardenScalarTransition[];
  /** Roof-band accents retain their old colour until the coalesced wave. */
  dockAccentTransitions: GardenDockAccentTransition[];
  lampModulation: LampStatusModulation;
  beam: Group;
  /**
   * 3d: the bearing from the beacon to the largest PSI contributor's berth, in
   * `beam.rotation.y` units, or null when there is no contributor to watch.
   *
   * Taken once at compose time from the ship's composed berth rather than per
   * frame from its live position: the ship wanders a couple of tiles around
   * that berth, so a per-frame bearing would make the beam hunt, and the berth
   * is the address the rest of the world already places the ship at.
   */
  beamDwellBearing: number | null;
  crossBearingBuoys: GardenCrossBearingBuoys;
  /**
   * The hulls that have a buoy, in the buoys' own instance order — usually a
   * handful, occasionally none. Kept as its own short list so the per-frame
   * sync costs one pass over the crossed ships rather than a lookup on all
   * ~205 of them.
   */
  crossBearingBuoyShips: ShipVisual[];
  /**
   * Tier 3 #3: every harbour's mint/burn cargo run, in one instanced draw.
   * Direction and magnitude are composed into the crates' positions at build;
   * W4.2 only crossfades old/new baked targets after a refresh.
   */
  cargoTide: GardenCargoTide;
  /**
   * The flight-to-quality flotilla, in one instanced draw. Empty — nothing
   * built at all — whenever the gauge is absent or reads false.
   */
  flightTenders: GardenFlightTenders;
  /**
   * The titan hulls those tenders work, in the flotillas' own anchor order, so
   * the per-frame sync costs one pass over three ships rather than a lookup on
   * all ~205. Empty whenever there is no flight to show.
   */
  flightTenderShips: ShipVisual[];
  /** W7.1: per-coin lighters, davits, cargo, and largest-event lift. */
  issuanceWorksets: GardenShipIssuanceWorksets;
  /** Hulls anchoring issuance worksets, in instance order. */
  issuanceWorksetShips: ShipVisual[];
  /**
   * X2: the weekly supply tide as the tidal flat — how much of one sheltered
   * shore lies bare — with the last visit's wrack line. Eases per frame.
   */
  tidalFlat: GardenTidalFlat;
  decoration: Group;
  docks: DockVisual[];
  /** World-wide quay bucket, prop and flag batches; dock roots are anchors only. */
  harborBatch: GardenHarborBatch | null;
  /**
   * D3: the three hearth chimneys' instanced smoke, one unlit draw for the
   * whole ring. Null only before the first docks build; the cargo-tide gate
   * is read live each frame, so no rebuild follows a tide refresh.
   */
  stationSmoke: GardenStationSmoke | null;
  objectCount: number;
  entityCues: Map<string, EntityCue>;
  /** W1: the shared instanced fleet. Drawn instead of per-ship meshes. */
  fleetBatches: FleetBatches;
  /** Two draw calls carrying every moving hull's local wake quads. */
  wakeBatch: GardenWakeBatch;
  /** Reserved final slot for the selected ship beyond the base fleet cap. */
  wakeOutsiderSlot: number;
  fleetLanterns: FleetLanterns;
  fleetSailMaterial: MeshStandardMaterial | null;
  sailAtlas: GardenSailAtlas;
  /** Placement hierarchy consumed by the reversible wide-frame thinning pass. */
  fleetThinningShips: GardenFleetThinningShip[];
  /** Last frame's display presence, shared by hull-adjacent instance updates. */
  fleetDisplayPresenceByShipId: Map<string, number>;
  harborLanternMaterial: MeshStandardMaterial;
  fireflies: GardenFireflies;
  gullFlock: GardenGullFlock;
  lighthouseLight: PointLight;
  lighthouseRoot: Group;
  lighthouseShell: Group;
  /** W5.2: the single-draw analytical tower-and-moon image in the still pond. */
  pondReflection: GardenPondReflection;
  /** Tier 3 #15: sheds the props that cannot read at whole-map framing. */
  overviewLod: GardenOverviewLod;
  /** Wave 1: the finite garden's authored enclosing land and stroll route. */
  rim: GardenRimMesh;
  /** W1.5: the seat-C threshold (bank, engawa edge, rooted pine) shown only at rest. */
  threshold: GardenThreshold;
  /** Wave 7: one opaque rim-to-Calm cascade, sharing the persistent wake field. */
  waterfall: GardenWaterfall;
  pigeonnier: GardenPigeonnierLandmark;
  pigeonnierMoverPositions: Array<{ x: number; y: number; z: number }>;
  pigeonnierMoverShips: Array<ShipVisual | null>;
  /** X1: the stone garden of the fallen and its anniversary lantern (landmarks part). */
  stoneGarden?: GardenStoneGarden;
  unregisterStoneGardenRitual?: () => void;
  root: Group;
  routeLine: Line<BufferGeometry, LineBasicMaterial>;
  routeLineKey: string | null;
  /** The water path the route line was last built from (identity, not shape). */
  routeLinePath: ShipWaterPath | null;
  shipLanternGlowMaterial: MeshBasicMaterial;
  shipLanternMaterial: MeshStandardMaterial;
  shipShadows: InstancedMesh<CircleGeometry, MeshBasicMaterial>;
  ships: ShipVisual[];
  /** Old records retained only long enough to sail to the mist line. */
  departingShips: ShipVisual[];
  /** Active clock-pure journeys, keyed by stable ship id. */
  shipTransitions: Map<string, GardenShipTransitionSpec>;
  /** Latest target per ship; refresh bursts overwrite rather than scatter. */
  pendingShipTransitions: Map<string, GardenShipTransitionSpec>;
  /** Shared cadence for ship and scalar transition starts. */
  lastTransitionWaveSeconds: number;
  /** Session clock of the first fleet build; drives the first-impression guard. */
  shipsFirstBuiltSeconds: number;
  /** No world-object replacement has been reconciled yet. */
  hasReconciledWorld: boolean;
  /** A delayed ships-part drain retains the refresh-time snap decision. */
  snapQueuedShipsRefresh: boolean;
  /** Seeds captured before a ships-part rebuild and consumed by its builder. */
  stagedShipRebuild: StagedShipRebuild | null;
  signalMast: GardenSignalMast;
  /**
   * T0.2 (2026-09-07): every "lighthouse-window-glow" aperture in this island
   * build — the tower's window rows and the precinct gatehouse light, which
   * share one material name. VISUAL_INVARIANTS.md:115 has promised that these
   * glow at dusk/night since before the renderer could do it; nothing read this
   * material until now, so every building aperture in the world was a frozen
   * constant. The GLB attach appends its own clones to the same array.
   */
  lighthouseWindowMaterials: MeshStandardMaterial[];
  /**
   * T0.2 remainder (2026-09-07): the island's two stone path lanterns share one
   * lamp material, frozen at 1.15 until now. Per-build, so it cannot leak.
   */
  islandLanternMaterial: MeshStandardMaterial | null;
  statueGleamMaterials: MeshStandardMaterial[];
  /** W4.1 reconciliation bookkeeping — one record per rebuildable part. */
  parts: Record<WorldContentPartName, GardenContentPartState>;
  /** Changed parts waiting for their amortized one-per-frame rebuild. */
  rebuildQueue: Set<WorldContentPartName>;
  /** True while a drain owes the deferred cross-part index scans. */
  indexesStale: boolean;
  /** Applied ships POSE key (berths/offsets/beam-dwell); see worldContentPartKeys. */
  shipsPoseKey: string | null;
  /** Per-ships-build geometry/material cache (wakes, hero procedural parts). */
  shipsGeometryCache: GardenShipGeometryCache;
  /** The selected outsider ship drawn on top of the base slice, if any. */
  transient: GardenTransientSelection | null;
  /** Persistent wrapper the transient visual mounts into (stable child order). */
  transientRoot: Group;
  visibleShipCount: number;
  seaSigns: GardenSeaSigns;
  /** Wave 2b: static, decorative geography at the seven named-water edges. */
  seaEdges: GardenSeaEdges | null;
  zoneField: ZoneField;
  zones: ZoneVisual[];
}

interface EntityCue {
  radius: number;
  root: Object3D;
  y: number;
}

/**
 * W4.1: the rebuildable families world content splits into, in build order.
 *
 * The order is also the drain order of the amortized rebuild queue, and it
 * encodes the one build-time dependency between parts: `cargoTide` reads the
 * composed dock visuals, and `tenders` reads the composed ship visuals, so
 * each must sit after the part it consumes.
 */
const WORLD_CONTENT_PART_ORDER = [
  "island",
  "landmarks",
  "zones",
  "rim",
  "seaEdges",
  "docks",
  "harborLife",
  "cargoTide",
  "ships",
  "tenders",
] as const;
type WorldContentPartName = (typeof WORLD_CONTENT_PART_ORDER)[number];

interface GardenContentPartState {
  /** Content key this part was last built for; null before the first build. */
  appliedKey: string | null;
  /** This part's contribution to the merged entity-cue map. */
  cues: Map<string, EntityCue>;
  /** Bumped on every rebuild; guards async work belonging to an old build. */
  epoch: number;
  /** Texture-upload owner for the current epoch — cancels with the part. */
  owner: object;
  /** Persistent wrapper group, so rebuilds never disturb sibling order. */
  root: Group;
}

interface GardenTransientSelection {
  cue: EntityCue;
  detailId: string;
  shipId: string;
  visual: ShipVisual;
}

interface ShipDepartureSeed {
  displayOffset: { x: number; y: number };
  from: GardenTransitionTile;
  representative: boolean;
  ship: ShipVisual["ship"];
}

interface StagedShipRebuild {
  oldBerthById: Map<string, GardenTransitionTile>;
  oldIds: Set<string>;
  oldPositionById: Map<string, GardenTransitionTile>;
  departureSeeds: ShipDepartureSeed[];
  reducedMotion: boolean;
}

interface ScalarMaterialState {
  depthWrite: boolean;
  material: Material;
  opacity: number;
  transparent: boolean;
}

interface GardenScalarTransition {
  active: boolean;
  incoming: ScalarMaterialState[];
  mix: number;
  outgoing: ScalarMaterialState[];
  outgoingRoot: Group;
}

interface GardenDockAccentTransition {
  active: boolean;
  chainId: string;
  color: Color;
  target: Color;
}

/** Per-part content keys for one world (see worldContentPartKeys). */
type WorldContentPartKeys = Record<WorldContentPartName, string> & {
  /**
   * The ships data that moves on a routine refresh WITHOUT invalidating any
   * GPU resource: berth tiles, display offsets, and the beam-dwell target.
   * A pose-only change is applied in place; only the structural `ships` key
   * forces a rebuild.
   */
  shipsPose: string;
};

function createGardenScene(
  renderer: WebGLRenderer,
  uploadScheduler: TextureUploadScheduler,
  calendarDate: Date,
): GardenScene {
  const season = seasonFromDate(calendarDate);
  const root = new Scene();
  const sky = createGardenSky(season);
  root.fog = sky.fog;

  const hemisphereLight = new HemisphereLight("#d7ece6", "#31483f", 1.15);
  root.add(hemisphereLight);
  const ambientLight = new AmbientLight("#fff0d1", 0.42);
  root.add(ambientLight);
  const shadowRig = createGardenShadowRig();
  const directionalLight = shadowRig.directionalLight;
  root.add(directionalLight);

  // A single oversized surface plus same-color fog/background keeps the sea
  // full-bleed under pan and zoom without visible plane or sky seams.
  const water = createGardenWater(WATER_LEVEL);
  root.add(water.mesh);
  // Queue the big static fields before the first frame. The between-frame
  // fallback drains both before scene drawing even when rIC has not fired.
  for (const [name, texture] of Object.entries(water.regionTextures)) {
    uploadScheduler.schedule({
      isOwnerValid: () => true,
      key: `water.region.${name}`,
      owner: water,
      ownerName: `water.region.${name}`,
      texture,
    });
  }

  // Shared warm-light lane registry: the water shader samples its packed
  // DataTexture to lay reflection pools for the beacon, harbor lanterns, and
  // dock lamps. The registry owns the per-tier lane cap.
  const laneRegistry = createGardenLaneRegistry();

  const waterAccents = createWaterAccents();
  root.add(waterAccents);
  const almanacDressing = createGardenAlmanacDressing();
  const keeper = createGardenKeeper();
  const heron = createGardenHeron({ registerRitual, rippleRings: water.rippleRings });
  const skein = createGardenSkein({ registerRitual });
  const fishRings = createGardenFishRings({ emitter: water.rippleRings, registerRitual });
  const seasonalDressing = createGardenSeasonalDressing(calendarDate);

  const hoverMarker = createGardenCueMarker("#d8eee7", 0.4);
  const selectedMarker = createGardenCueMarker(HARBOR_PALETTE.lantern_glow, 0.78);
  root.add(hoverMarker, selectedMarker);
  // The shadow target rides after the markers so water/accents keep the child
  // indices the renderer tests assert; content is still appended last.
  root.add(directionalLight.target);

  // Sky dome/stars/moon are added last so lights and water keep the child
  // indices the renderer tests assert against; world content is appended after.
  root.add(sky.root);

  // The geometry-free horizon lifecycle anchor and the islets live at scene
  // scope so world refreshes never churn them. Ripple rings register once and
  // both roots remain covered by scene disposal.
  const horizon = createGardenHorizon();
  const islets = createGardenIslets();
  islets.registerRippleRings(water.rippleRings);
  root.add(horizon.root, islets.root);
  // W5.1: the meteor (placed about the camera) and the seasonal layer (petals,
  // leaf fall) are world-space, so they hang off the scene root — appended
  // after the long-standing children, whose indices hit/cue owners and tests
  // rely on — rather than off the island-offset water accents.
  root.add(almanacDressing.root, seasonalDressing.root);
  // W5.4: the keeper, seated at the island root on each island build.
  root.add(keeper.root);
  // W5.2: the heron likewise: one bird for the renderer's life, so a flight in
  // progress survives a content swap.
  root.add(heron.root);
  root.add(skein.root);
  applyGardenPrintInksToTree(root);

  // W4.1: the instanced fleet's GPU buffers, the sail atlas texture and the
  // shared pennant geometry are allocated ONCE per renderer. World content
  // borrows them; rebuilding the ships part restamps instances and repaints
  // atlas cells but never reallocates any of this.
  const fleetSharedCache: GardenShipGeometryCache = {
    geometries: new Map(),
    wakeFillMaterial: new MeshBasicMaterial({
      color: HARBOR_PALETTE.foam_white,
      depthWrite: false,
      opacity: 0.08,
      side: DoubleSide,
      transparent: true,
    }),
  };
  const sailAtlas = createGardenSailAtlas();
  const fleetBatches = createFleetBatches({
    cache: fleetSharedCache,
    // Grow-only capacity with headroom over the ~205-ship world plus the
    // transient outsider, so a data refresh never reallocates instance
    // buffers (D1).
    capacity: GARDEN_FLEET_BATCH_CAPACITY,
    geometryFor: (silhouette) => createFleetBatchGeometry(silhouette),
    pennantGeometry: createPennantGeometry(),
    sailTexture: sailAtlas.texture,
    silhouettes: GARDEN_HULL_SILHOUETTES,
  });

  return {
    almanacDressing,
    keeper,
    heron,
    skein,
    fishRings,
    ambientLight,
    beamAngle: 0,
    beamClockSeconds: 0,
    psiSky: null,
    epistemicBanks: [],
    content: null,
    ...shadowRig,
    fleetBatches,
    fleetSharedCache,
    sailAtlas,
    // W6.5: the probe shares the dome's material instance, so the sky the
    // world is LIT BY and the sky it is SEEN AGAINST are the same uniforms.
    environment: createGardenEnvironment(renderer, root, sky.domeMaterial),
    hemisphereLight,
    horizon,
    hoverMarker,
    islets,
    laneRegistry,
    lighthouseModel: null,
    root,
    selectedMarker,
    floraNightValue: -1,
    season,
    calendarDate,
    seasonalDressing,
    sky,
    water,
    waterAccents,
    wakes: createGardenWakes(renderer),
    weather: {
      wind: { x: -0.855, y: 0.519, speed: 0, gust: 0 },
      breath: 0,
      stormLevel: 0,
      lightning: 0,
    },
    world: null,
  };
}

/** Cached per world object — key computation must stay refresh-cheap. */
const worldContentPartKeysCache = new WeakMap<PharosVilleWorld, WorldContentPartKeys>();

/**
 * W4.1: per-part content keys, derived from the SAME fields the render-content
 * signature already bakes (`worldRenderContentPartHashes`) but regrouped by the
 * part that actually consumes each field, so a routine refresh dirties only the
 * families whose GPU resources genuinely changed:
 *
 * - a supply tick that moves `change24hPct` dirties `harborLife` (the gull
 *   flock and fireflies — light instanced systems), never the dock masonry;
 * - a berth or beam-dwell move lands in `shipsPose` and is applied in place;
 * - the flight gauge dirties `tenders`, never the whole fleet.
 */
function worldContentPartKeys(world: PharosVilleWorld): WorldContentPartKeys {
  const cached = worldContentPartKeysCache.get(world);
  if (cached) return cached;
  const hashes = worldRenderContentPartHashes(world);
  const slice = selectGardenObservatorySlice(world, null);
  const islandTileKey = `${world.lighthouse.tile.x},${world.lighthouse.tile.y}`;
  // Everything authorDock consumes. `change24hPct` and `cargoTide` are data
  // that other parts read; sub-band supply noise is already banded out by the
  // signature's `size`.
  const dockStructure = JSON.stringify(world.docks.map((dock) => [
    dock.chainId,
    dock.detailId,
    dock.healthBand,
    dock.id,
    dock.label,
    dock.logoPath ?? null,
    dock.size,
    dock.station,
    dock.tile,
  ]));
  const shipEntries = slice.ships
    .toSorted((left, right) => left.ship.id.localeCompare(right.ship.id));
  // Structural: every signature ship field EXCEPT tile/displayOffset. These
  // are the inputs to built geometry, colors, atlas cells, buoys, lanterns.
  const shipsStructural = JSON.stringify(shipEntries.map(({ ship }) => [
    ship.dexCrossCheck?.agrees === false,
    ship.dominantChainId,
    ship.id,
    ship.logoSrc,
    ship.safetyGrade?.grade ?? null,
    ship.riskZone,
    ship.symbol,
    ship.visual,
  ]));
  const shipsPose = JSON.stringify(shipEntries.map(({ displayOffset, ship }) => [
    ship.id,
    ship.tile,
    displayOffset,
  ]));
  // The island key is the lighthouse family MINUS the beam-dwell target: the
  // dwell is a cheap bearing recompute (pose path), not a reason to rebuild
  // the rock.
  const islandKey = JSON.stringify({
    detailId: world.lighthouse.detailId,
    signalPennants: world.lighthouse.signalMast?.pennantCount ?? 0,
    stormCone: world.lighthouse.signalMast?.stormCone ?? false,
    tile: world.lighthouse.tile,
  });
  const keys: WorldContentPartKeys = {
    island: islandKey,
    landmarks: `${hashes.graves}|${hashes.pigeonnier}`,
    zones: hashes.areas ?? "",
    // Pure authored terrain, but a map-size key makes an eventual design-span
    // change invalidate this part explicitly rather than by accident.
    rim: `${world.map.width}x${world.map.height}|garden-rim-v2-waterfall`,
    // Placement is a compile-time systems field, independent of live data.
    seaEdges: "garden-sea-edges.v1",
    docks: `${dockStructure}|${islandTileKey}`,
    harborLife: `${hashes.docks}|${islandTileKey}`,
    cargoTide: `${JSON.stringify(world.docks.map((dock) => [
      dock.detailId,
      dock.cargoTide ?? null,
    ]))}|${hashes.supplyTide}|${dockStructure}`,
    ships: `${shipsStructural}|${hashes.heroRank}|${islandTileKey}`,
    tenders: `${hashes.fleetIssuance}|${shipsStructural}|${hashes.heroRank}|${JSON.stringify(world.ships.map((ship) => [ship.id, ship.issuance ?? null]))}`,
    shipsPose: `${shipsPose}|${world.lighthouse.beamDwell?.shipId ?? ""}|${islandTileKey}`,
  };
  worldContentPartKeysCache.set(world, keys);
  return keys;
}

/**
 * The persistent skeleton every part builds into. Created once per renderer
 * session; after that, data refreshes only ever touch the wrappers' children.
 * Part products (typed non-null on GardenContent) are filled by the builders
 * immediately after — see the initial-build path in `render`.
 */
function createWorldContentShell(scene: GardenScene): GardenContent {
  const root = new Group();
  const parts = {} as Record<WorldContentPartName, GardenContentPartState>;
  for (const name of WORLD_CONTENT_PART_ORDER) {
    const wrapper = new Group();
    wrapper.name = `content-part-${name}`;
    root.add(wrapper);
    parts[name] = {
      appliedKey: null,
      cues: new Map(),
      epoch: 0,
      owner: {},
      root: wrapper,
    };
  }
  // The shared instanced fleet mounts OUTSIDE the part wrappers: its buffers
  // are scene-owned and survive every rebuild.
  root.add(scene.fleetBatches.root);
  const routeLine = new Line(
    new BufferGeometry(),
    new LineBasicMaterial({
      color: HARBOR_PALETTE.lantern_glow,
      depthWrite: false,
      opacity: 0.44,
      transparent: true,
    }),
  );
  routeLine.visible = false;
  routeLine.renderOrder = 4;
  root.add(routeLine);
  const transientRoot = new Group();
  transientRoot.name = "content-transient";
  root.add(transientRoot);

  const content = {
    logoGenerationKey: null,
    entityCues: new Map<string, EntityCue>(),
    fleetBatches: scene.fleetBatches,
    fleetSailMaterial: scene.fleetBatches.materials[1] ?? null,
    fleetDisplayPresenceByShipId: new Map<string, number>(),
    fleetThinningShips: [],
    lampStatusMix: 0,
    lampStatusTargetMix: 0,
    pendingLampStatusTargetMix: null,
    lampModulation: lampStatusModulationForMix(0),
    scalarTransitions: [],
    dockAccentTransitions: [],
    harborBatch: null,
    seaEdges: null,
    lampStatusState: initialLampStatusState(createSourceStatuses()),
    sailAtlas: scene.sailAtlas,
    objectCount: 0,
    parts,
    rebuildQueue: new Set<WorldContentPartName>(),
    departingShips: [],
    indexesStale: false,
    hasReconciledWorld: false,
    lastTransitionWaveSeconds: Number.NEGATIVE_INFINITY,
    pendingShipTransitions: new Map<string, GardenShipTransitionSpec>(),
    pigeonnierMoverPositions: [],
    pigeonnierMoverShips: [],
    root,
    routeLine,
    routeLineKey: null,
    routeLinePath: null,
    shipsPoseKey: null,
    shipsFirstBuiltSeconds: Number.POSITIVE_INFINITY,
    shipTransitions: new Map<string, GardenShipTransitionSpec>(),
    snapQueuedShipsRefresh: false,
    stagedShipRebuild: null,
    transient: null,
    transientRoot,
    visibleShipCount: 0,
  } as unknown as GardenContent;
  // The remaining fields are definite-assigned by the part builders before the
  // shell is ever rendered; the initial build runs every builder in order.
  return content;
}

/** Rebuilds one part from the current world and records its applied key. */
function rebuildWorldContentPart(
  scene: GardenScene,
  content: GardenContent,
  name: WorldContentPartName,
  world: PharosVilleWorld,
  keys: WorldContentPartKeys,
  uploadScheduler: TextureUploadScheduler,
  reducedMotion = true,
): void {
  const dockAccentsBefore = name === "docks"
    && content.parts[name].appliedKey !== null
    && !reducedMotion
    ? dockAccentColors(content.docks)
    : null;
  if (name === "docks") content.dockAccentTransitions = [];
  const scalarOutgoing = name === "cargoTide"
    && content.parts[name].appliedKey !== null
    && !reducedMotion
    ? detachScalarPart(content, content.parts[name].root)
    : null;
  disposeWorldContentPart(scene, content, name, uploadScheduler);
  switch (name) {
    case "island":
      buildIslandPart(scene, content, world);
      attachGardenLighthouseModel(scene.lighthouseModel, content);
      // New static casters — re-render the shadow map on the next frame.
      scene.shadowNeedsRender = true;
      break;
    case "landmarks":
      buildLandmarksPart(content, world);
      break;
    case "zones":
      buildZonesPart(content, world);
      break;
    case "rim":
      buildRimPart(scene, content);
      scene.shadowNeedsRender = true;
      break;
    case "seaEdges":
      buildSeaEdgesPart(content);
      scene.shadowNeedsRender = true;
      break;
    case "docks":
      buildDocksPart(scene, content, world);
      scene.shadowNeedsRender = true;
      break;
    case "harborLife":
      buildHarborLifePart(content, world);
      break;
    case "cargoTide":
      buildCargoTidePart(content, world);
      break;
    case "ships":
      buildShipsPart(scene, content, world);
      break;
    case "tenders":
      buildTendersPart(content, world);
      break;
  }
  content.parts[name].appliedKey = keys[name];
  if (dockAccentsBefore) stageDockAccentTransitions(content, dockAccentsBefore);
  if (scalarOutgoing) {
    const incoming = scalarMaterialStates(content.parts[name].root);
    setScalarMaterialMix(incoming, 0);
    content.scalarTransitions.push({
      active: false,
      incoming,
      mix: 0,
      outgoing: scalarOutgoing.materials,
      outgoingRoot: scalarOutgoing.root,
    });
  }
}

function dockAccentColors(docks: readonly DockVisual[]): Map<string, Color> {
  const colors = new Map<string, Color>();
  for (const visual of docks) {
    colors.set(visual.recipe.dock.chainId, visual.recipe.accentColor.clone());
  }
  return colors;
}

function stageDockAccentTransitions(
  content: GardenContent,
  previous: ReadonlyMap<string, Color>,
): void {
  for (const visual of content.docks) {
    const chainId = visual.recipe.dock.chainId;
    const oldColor = previous.get(chainId);
    const target = visual.recipe.accentColor.clone();
    if (!oldColor || oldColor.equals(target)) continue;
    content.harborBatch?.setDockAccent(chainId, oldColor);
    content.dockAccentTransitions.push({ active: false, chainId, color: oldColor.clone(), target });
  }
}

function scalarMaterialStates(root: Object3D): ScalarMaterialState[] {
  const seen = new Set<Material>();
  const states: ScalarMaterialState[] = [];
  root.traverse((object) => {
    const material = (object as Mesh).material;
    if (!material) return;
    for (const entry of Array.isArray(material) ? material : [material]) {
      if (seen.has(entry)) continue;
      seen.add(entry);
      states.push({
        depthWrite: entry.depthWrite,
        material: entry,
        opacity: entry.opacity,
        transparent: entry.transparent,
      });
      entry.transparent = true;
      entry.depthWrite = false;
    }
  });
  return states;
}

function setScalarMaterialMix(states: readonly ScalarMaterialState[], mix: number): void {
  for (const state of states) state.material.opacity = state.opacity * mix;
}

function detachScalarPart(
  content: GardenContent,
  root: Group,
): { materials: ScalarMaterialState[]; root: Group } | null {
  if (root.children.length === 0) return null;
  const outgoing = new Group();
  outgoing.name = "content-transition-cargo-tide";
  for (const child of [...root.children]) outgoing.add(child);
  content.root.add(outgoing);
  return { materials: scalarMaterialStates(outgoing), root: outgoing };
}

/**
 * Disposes one part's scene subtree and cancels its pending uploads — and
 * nothing else's. Unchanged parts keep their resources and upload queue
 * entries untouched; that is the entire point of W4.1.
 */
function disposeWorldContentPart(
  scene: GardenScene,
  content: GardenContent,
  name: WorldContentPartName,
  uploadScheduler: TextureUploadScheduler,
): void {
  const part = content.parts[name];
  uploadScheduler.cancelOwner(part.owner);
  if (name === "island") {
    // The GLB shell survives the island rebuild — detach before the walk.
    scene.lighthouseModel?.removeFromParent();
  }
  if (name === "zones" && content.seaSigns) {
    content.seaSigns.dispose();
  }
  if (name === "seaEdges" && content.seaEdges) {
    content.seaEdges.dispose();
    content.seaEdges = null;
  }
  if (name === "ships") {
    // The transient outsider rides the ships build's cache and materials, so
    // it cannot outlive them; selection re-adds it against the new build.
    removeTransientSelection(scene, content);
    // The attention memo bridges hover/selection to atlas cells, which are
    // reassigned by the rebuild.
    resetFleetSailAttention();
    // Hero identity sails are fresh materials — repaint on the next logo sync.
    content.logoGenerationKey = null;
    content.wakeBatch?.dispose();
  }
  if (name === "docks") {
    content.harborBatch?.dispose();
    content.harborBatch = null;
    content.stationSmoke?.dispose();
    content.stationSmoke = null;
  }
  const children = [...part.root.children];
  part.root.clear();
  for (const child of children) disposeThreeObjectTree(child);
  part.cues.clear();
  part.epoch += 1;
  part.owner = {};
}

/**
 * Rebuilds the merged entity-cue map. Cheap (a few hundred map inserts), so it
 * runs after EVERY part rebuild — hover, selection and hit anchors must track
 * the new subtrees immediately, even while heavier parts still amortize.
 */
function mergeContentCues(content: GardenContent): void {
  const cues = new Map<string, EntityCue>();
  for (const name of WORLD_CONTENT_PART_ORDER) {
    for (const [detailId, cue] of content.parts[name].cues) cues.set(detailId, cue);
  }
  if (content.transient) cues.set(content.transient.detailId, content.transient.cue);
  content.entityCues = cues;
}

/**
 * Re-derives the cross-part indexes that are too heavy for every drain frame:
 * the drawable census and the overview-LOD scan (which walks the whole
 * composed world and captures authored transforms as baselines). Runs once
 * when the rebuild queue empties rather than once per amortized part.
 */
function refreshContentIndexes(
  content: GardenContent,
  view: { reducedMotion: boolean; zoom: number } | null,
): void {
  mergeContentCues(content);
  content.objectCount = countDrawableObjects(content.root);
  // W2.11: every rebuilt part is re-inked once here (idempotent per material).
  applyGardenPrintInksToTree(content.root);
  // The scan must see AUTHORED transforms. Surviving parts may be mid-shed at
  // overview framing, so snap the outgoing policy back to full detail first,
  // rescan, then snap the new policy straight to the current framing's target
  // (an infinite delta takes the ease's endpoint — no visible pop).
  content.overviewLod?.update({ deltaSeconds: 0, reducedMotion: true, zoom: 1 });
  content.overviewLod = createGardenOverviewLod(content.root);
  if (view) {
    content.overviewLod.update({
      deltaSeconds: Number.POSITIVE_INFINITY,
      reducedMotion: view.reducedMotion,
      zoom: view.zoom,
    });
  }
}

/**
 * Re-anchors the scene-scope water/lane systems to the composed content after
 * a rebuild batch. All of these are cheap sets over small registries.
 */
function syncSceneToContent(scene: GardenScene, world: PharosVilleWorld): void {
  const content = scene.content;
  if (!content) return;
  const islandTile = gardenIslandDisplayTile(world.lighthouse.tile);
  scene.water.setIslandCenter(
    islandTile.x * TILE_SCALE,
    islandTile.y * TILE_SCALE,
  );
  scene.waterAccents.position.set(
    islandTile.x * TILE_SCALE,
    0,
    islandTile.y * TILE_SCALE,
  );
  scene.water.setIsletCenters(
    { x: CEMETERY_CENTER.x * TILE_SCALE, z: CEMETERY_CENTER.y * TILE_SCALE },
    { x: world.pigeonnier.tile.x * TILE_SCALE, z: world.pigeonnier.tile.y * TILE_SCALE },
  );
  scene.water.setZoneState(content.zones.map((zone) => zone.tint));
  registerHarborWater(scene, world);
  registerLightLanes(
    scene.laneRegistry,
    world,
    islandTile,
    content.docks,
    content.zones,
  );
}

function shipBerthTile(visual: ShipVisual): GardenTransitionTile {
  return resolveGardenShipDisplayTile({
    displayOffset: visual.displayOffset,
    representative: visual.representative,
    sample: null,
    ship: visual.ship,
  });
}

function shipTransitionMarginTiles(ship: ShipNode): number {
  return gardenShipWaterMarginTiles(
    gardenShipVisualScale(ship.visual.scale || 1),
    GARDEN_SILHOUETTE_FOR_HULL[ship.visual.hull],
  );
}

function gardenShipTransition(
  shipId: string,
  from: GardenTransitionTile,
  to: GardenTransitionTile,
  kind: GardenShipTransitionKind,
  marginTiles: number,
): GardenShipTransitionSpec {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const actualKind = kind === "reanchor" && distance > GARDEN_SHIP_CROSS_MAP_TILES
    ? "mist"
    : kind;
  const durationUnit = stableUnit(
    `garden-transition.duration.${shipId}.${to.x.toFixed(3)},${to.y.toFixed(3)}`,
  );
  return {
    bend: stableUnit(`garden-transition.bend.${shipId}`) < 0.5 ? -1 : 1,
    durationSeconds: GARDEN_SHIP_TRANSITION_MIN_SECONDS
      + durationUnit * (GARDEN_SHIP_TRANSITION_MAX_SECONDS - GARDEN_SHIP_TRANSITION_MIN_SECONDS),
    from: { ...from },
    kind: actualKind,
    marginTiles,
    shipId,
    // Pending transitions render their `from` point until a wave admits them.
    startSeconds: Number.POSITIVE_INFINITY,
    to: { ...to },
  };
}

function renderedTransitionBerth(
  content: GardenContent,
  shipId: string,
  fallback: GardenTransitionTile,
  timeSeconds: number,
): GardenTransitionTile {
  const active = content.shipTransitions.get(shipId);
  if (active) {
    const sample = sampleGardenShipTransition(active, timeSeconds);
    return { x: sample.x, y: sample.y };
  }
  return content.pendingShipTransitions.get(shipId)?.from ?? fallback;
}

function queueShipTransition(
  content: GardenContent,
  transition: GardenShipTransitionSpec,
): void {
  if (Math.hypot(
    transition.to.x - transition.from.x,
    transition.to.y - transition.from.y,
  ) < 0.01 && transition.kind === "reanchor") {
    content.pendingShipTransitions.delete(transition.shipId);
    content.shipTransitions.delete(transition.shipId);
    return;
  }
  // A newer truth coalesces the old journey too: freeze at the sampled `from`
  // point until the next shared wave, then leave once for the latest target.
  content.shipTransitions.delete(transition.shipId);
  content.pendingShipTransitions.set(transition.shipId, transition);
}

function shouldSnapShipRefresh(
  content: GardenContent,
  timeSeconds: number,
  reducedMotion: boolean,
): boolean {
  return reducedMotion
    || !content.hasReconciledWorld
    || timeSeconds - content.shipsFirstBuiltSeconds < GARDEN_YOUNG_WORLD_SNAP_SECONDS;
}

// Mass migration includes hulls still sailing toward an earlier refresh's
// target, not just newly changed berths. Otherwise successive small refreshes
// can cross the fleet-share threshold without ever clearing their journeys.
function isMassShipTransition(changedShips: number, fleetSize: number): boolean {
  return fleetSize > 0
    && changedShips / fleetSize >= GARDEN_MASS_TRANSITION_SNAP_RATIO;
}

function structuralShipRefreshIsMass(
  content: GardenContent,
  world: PharosVilleWorld,
): boolean {
  const oldById = new Map(content.ships
    .filter((visual) => !content.transient || visual !== content.transient.visual)
    .map((visual) => [visual.ship.id, shipBerthTile(visual)]));
  const next = selectGardenObservatorySlice(world, null).ships;
  const nextIds = new Set(next.map((entry) => entry.ship.id));
  let changedShips = 0;
  for (const entry of next) {
    const oldBerth = oldById.get(entry.ship.id);
    if (!oldBerth) {
      changedShips += 1;
      continue;
    }
    const nextBerth = resolveGardenShipDisplayTile({ ...entry, sample: null });
    if (content.shipTransitions.has(entry.ship.id)
      || content.pendingShipTransitions.has(entry.ship.id)
      || Math.hypot(nextBerth.x - oldBerth.x, nextBerth.y - oldBerth.y) >= 0.01) {
      changedShips += 1;
    }
  }
  for (const oldId of oldById.keys()) {
    if (!nextIds.has(oldId)) changedShips += 1;
  }
  return isMassShipTransition(changedShips, Math.max(oldById.size, next.length));
}

function clearShipTransitionState(scene: GardenScene, content: GardenContent): void {
  content.shipTransitions.clear();
  content.pendingShipTransitions.clear();
  for (let index = content.departingShips.length - 1; index >= 0; index -= 1) {
    disposeDepartingVisual(scene, content.departingShips[index]!);
  }
  content.departingShips.length = 0;
  content.lastTransitionWaveSeconds = Number.NEGATIVE_INFINITY;
}

/**
 * The ship-only fast path: semantic pointers swap immediately, while this
 * render-only layer records old and target berths. Starting a journey is only
 * Map writes; the existing per-frame fleet restamp samples it later.
 */
function applyShipsPoseUpdate(
  scene: GardenScene,
  content: GardenContent,
  world: PharosVilleWorld,
  timeSeconds: number,
  forceSnap: boolean,
): void {
  const slice = selectGardenObservatorySlice(world, null);
  const entryByShipId = new Map(slice.ships.map((entry) => [entry.ship.id, entry]));
  let changedShips = 0;
  for (const visual of content.ships) {
    if (content.transient && visual === content.transient.visual) continue;
    const entry = entryByShipId.get(visual.ship.id);
    if (!entry) continue;
    const oldBerth = shipBerthTile(visual);
    const newBerth = resolveGardenShipDisplayTile({
      displayOffset: entry.displayOffset,
      representative: entry.representative,
      sample: null,
      ship: entry.ship,
    });
    if (content.shipTransitions.has(entry.ship.id)
      || content.pendingShipTransitions.has(entry.ship.id)
      || Math.hypot(newBerth.x - oldBerth.x, newBerth.y - oldBerth.y) >= 0.01) {
      changedShips += 1;
    }
  }
  const snap = forceSnap || isMassShipTransition(changedShips, content.ships.length);
  if (snap) clearShipTransitionState(scene, content);
  for (const visual of content.ships) {
    if (content.transient && visual === content.transient.visual) continue;
    const entry = entryByShipId.get(visual.ship.id);
    // The structural key matching guarantees the same fleet membership; a
    // missing entry would mean the keys lied, so keep the old data visible
    // rather than corrupt the visual.
    if (!entry) continue;
    const oldBerth = shipBerthTile(visual);
    visual.ship = entry.ship;
    visual.displayOffset = entry.displayOffset;
    visual.representative = entry.representative;
    const newBerth = shipBerthTile(visual);
    // Beam-dwell changes share the pose key but move no hull. Keep the hot
    // refresh proportional to ACTUALLY moved ships: no journey objects or Map
    // writes for the other ~185 records.
    if (Math.hypot(newBerth.x - oldBerth.x, newBerth.y - oldBerth.y) < 0.01) continue;
    const from = renderedTransitionBerth(content, visual.ship.id, oldBerth, timeSeconds);
    if (snap) {
      content.pendingShipTransitions.delete(visual.ship.id);
      content.shipTransitions.delete(visual.ship.id);
    } else {
      queueShipTransition(
        content,
        gardenShipTransition(
          visual.ship.id,
          from,
          newBerth,
          "reanchor",
          shipTransitionMarginTiles(visual.ship),
        ),
      );
    }
  }
  content.beamDwellBearing = computeBeamDwellBearing(world, slice);
}

/** Capture old hulls before a structural ships rebuild disposes their roots. */
function stageShipsRebuild(
  scene: GardenScene,
  content: GardenContent,
  world: PharosVilleWorld,
  forceSnap: boolean,
): void {
  const nextIds = new Set(
    selectGardenObservatorySlice(world, null).ships.map((entry) => entry.ship.id),
  );
  const oldIds = new Set<string>();
  const oldBerthById = new Map<string, GardenTransitionTile>();
  const oldPositionById = new Map<string, GardenTransitionTile>();
  const departureSeeds: ShipDepartureSeed[] = [];
  let changedShips = 0;
  const capture = (visual: ShipVisual, alreadyDeparting: boolean): void => {
    const from = {
      x: visual.root.position.x / TILE_SCALE,
      y: visual.root.position.z / TILE_SCALE,
    };
    if (!alreadyDeparting || nextIds.has(visual.ship.id)) {
      oldIds.add(visual.ship.id);
      oldBerthById.set(visual.ship.id, shipBerthTile(visual));
      oldPositionById.set(visual.ship.id, from);
    }
    if (alreadyDeparting && nextIds.has(visual.ship.id)) return;
    if (alreadyDeparting || !nextIds.has(visual.ship.id)) {
      departureSeeds.push({
        displayOffset: visual.displayOffset,
        from,
        representative: visual.representative,
        ship: visual.ship,
      });
    }
  };
  for (const visual of content.ships) {
    if (content.transient && visual === content.transient.visual) continue;
    capture(visual, false);
  }
  for (const visual of content.departingShips) capture(visual, true);
  const nextSlice = selectGardenObservatorySlice(world, null);
  const oldBerthByShipId = oldBerthById;
  for (const entry of nextSlice.ships) {
    const oldBerth = oldBerthByShipId.get(entry.ship.id);
    if (!oldBerth) {
      changedShips += 1;
      continue;
    }
    const nextBerth = resolveGardenShipDisplayTile({ ...entry, sample: null });
    if (content.shipTransitions.has(entry.ship.id)
      || content.pendingShipTransitions.has(entry.ship.id)
      || Math.hypot(nextBerth.x - oldBerth.x, nextBerth.y - oldBerth.y) >= 0.01) {
      changedShips += 1;
    }
  }
  for (const oldId of oldIds) {
    if (!nextIds.has(oldId)) changedShips += 1;
  }
  const snap = forceSnap || isMassShipTransition(
    changedShips,
    Math.max(oldIds.size, nextIds.size),
  );
  if (snap) clearShipTransitionState(scene, content);
  content.stagedShipRebuild = {
    departureSeeds: snap ? [] : departureSeeds,
    oldBerthById,
    oldIds,
    oldPositionById,
    reducedMotion: snap,
  };
}

function startGardenTransitionWave(
  scene: GardenScene,
  content: GardenContent,
  timeSeconds: number,
  reducedMotion: boolean,
): void {
  if (reducedMotion) {
    clearShipTransitionState(scene, content);
    content.lampStatusTargetMix = content.pendingLampStatusTargetMix
      ?? lampStatusMixForStatus(content.lampStatusState.status);
    content.pendingLampStatusTargetMix = null;
    for (const transition of content.scalarTransitions) transition.active = true;
    for (const transition of content.dockAccentTransitions) transition.active = true;
    return;
  }
  const scalarPending = content.pendingLampStatusTargetMix !== null
    && content.pendingLampStatusTargetMix !== content.lampStatusTargetMix;
  const bakedScalarPending = content.scalarTransitions.some((transition) => !transition.active);
  const dockAccentPending = content.dockAccentTransitions.some((transition) => !transition.active);
  if (
    content.pendingShipTransitions.size === 0
    && !scalarPending
    && !bakedScalarPending
    && !dockAccentPending
  ) return;
  if (!gardenTransitionWaveReady(content.lastTransitionWaveSeconds, timeSeconds)) return;
  for (const [shipId, pending] of content.pendingShipTransitions) {
    pending.startSeconds = timeSeconds;
    content.shipTransitions.set(shipId, pending);
  }
  content.pendingShipTransitions.clear();
  if (content.pendingLampStatusTargetMix !== null) {
    content.lampStatusTargetMix = content.pendingLampStatusTargetMix;
    content.pendingLampStatusTargetMix = null;
  }
  for (const transition of content.scalarTransitions) transition.active = true;
  for (const transition of content.dockAccentTransitions) transition.active = true;
  content.lastTransitionWaveSeconds = timeSeconds;
}

/**
 * Refreshes the world-data pointers baked content carries for frame-time and
 * registry reads (dock totals for route-pulse lanes, the transient's detail
 * record). Purely reference swaps keyed on stable ids.
 */
function adoptFreshWorldData(content: GardenContent, world: PharosVilleWorld): void {
  const dockById = new Map(world.docks.map((dock) => [dock.detailId, dock]));
  for (const visual of content.docks) {
    const node = dockById.get(visual.recipe.dock.detailId);
    if (node) visual.recipe.dock = node;
  }
  if (content.transient) {
    const entity = world.entityById[content.transient.detailId];
    if (entity?.kind === "ship") content.transient.visual.ship = entity;
  }
}

/** First atlas cell no base-slice ship occupies, or 0 when the atlas is full. */
function nextFreeSailAtlasCell(atlas: GardenSailAtlas): number {
  let highest = 0;
  for (const cell of atlas.cellByShipId.values()) {
    if (cell > highest) highest = cell;
  }
  const next = highest + 1;
  return next < FLEET_SAIL_ATLAS_CELLS ? next : 0;
}

/**
 * W4.1 item 3: transient-outsider selection adds or removes ONLY the content
 * it needs — one batched ShipVisual, its cue, and an atlas cell — instead of
 * forcing a full world rebuild the way it used to.
 */
function reconcileTransientSelection(
  scene: GardenScene,
  world: PharosVilleWorld,
  selectedDetailId: string | null,
): void {
  const content = scene.content;
  if (!content) return;
  const ship = selectGardenTransientShip(world, selectedDetailId);
  const current = content.transient;
  if (ship && current && current.detailId === ship.detailId) {
    current.visual.ship = ship;
    return;
  }
  if (!ship && !current) return;
  if (current) removeTransientSelection(scene, content);
  if (!ship) {
    content.objectCount = countDrawableObjects(content.root);
    return;
  }
  const cell = nextFreeSailAtlasCell(content.sailAtlas);
  const visual = createBatchedShip(ship, { x: 0, y: 0 }, false, cell);
  visual.wakeSlot = content.wakeOutsiderSlot;
  if (cell !== 0) {
    content.sailAtlas.cellByShipId.set(ship.detailId, cell);
    // Invalidate the paint generation: the existing per-frame check schedules
    // the repaint and re-upload through the texture-upload lane, so the mark
    // arrives calmly instead of stalling this frame.
    content.sailAtlas.logoGenerationKey = null;
  }
  const cue: EntityCue = {
    radius: visual.selectionRadius,
    root: visual.root,
    y: -visual.root.position.y + 0.08,
  };
  content.transient = { cue, detailId: ship.detailId, shipId: ship.id, visual };
  content.ships.push(visual);
  content.transientRoot.add(visual.root);
  content.entityCues.set(ship.detailId, cue);
  applyGardenPrintInksToTree(visual.root);
  content.objectCount = countDrawableObjects(content.root);
}

/**
 * Removes the transient visual without touching any shared resource: its
 * geometries and materials all come from the ships build's cache, so only the
 * per-visual instance buffers (wake quads) are released.
 */
function removeTransientSelection(scene: GardenScene, content: GardenContent): void {
  const current = content.transient;
  if (!current) return;
  const index = content.ships.indexOf(current.visual);
  if (index >= 0) content.ships.splice(index, 1);
  current.visual.root.removeFromParent();
  current.visual.root.traverse((object) => {
    if (object instanceof InstancedMesh) object.dispose();
  });
  content.sailAtlas.cellByShipId.delete(current.detailId);
  content.entityCues.delete(current.detailId);
  // The per-frame systems key these on the ship id and only clean up ids they
  // still iterate — release the stragglers explicitly.
  scene.laneRegistry.remove(`ship-lantern.${current.shipId}`);
  scene.water.rippleRings.removeRing(`ship-mooring.${current.shipId}`);
  content.transient = null;
}

/**
 * C2 wiring for the harbor: every composed dock gets a karesansui pylon
 * ripple (W5), while the shader's one calm mask belongs only to the enclosed
 * Ethereum Mole basin (I2). Distant ring mouths must never be joined by one
 * lake-flattening ellipse.
 */
function registerHarborWater(scene: GardenScene, world: PharosVilleWorld): void {
  const content = scene.content;
  if (!content) return;
  const harborDockIds = new Set(selectGardenDocks(world.docks).map((dock) => dock.detailId));
  const harborDocks = content.docks.filter((dock) => harborDockIds.has(dock.recipe.dock.detailId));
  for (const dock of harborDocks) {
    scene.water.rippleRings.setRing({
      id: `dock-pylon.${dock.recipe.dock.detailId}`,
      center: { x: dock.root.position.x, z: dock.root.position.z },
      radius: 4.5,
      bands: 2,
      periodSeconds: 12,
      strength: 0.18,
    });
  }
  const mole = harborDocks.find((dock) => dock.recipe.station.type === "ethereum-mole");
  if (!mole) {
    // A sparse feed has no civic basin. Explicitly clear a prior world frame's
    // mask instead of moving it onto whichever unrelated harbor ranks first.
    scene.water.setHarborCalmMask({
      center: { x: 0, z: 0 },
      radiusX: 9,
      radiusZ: 7,
      calmStrength: 0,
    });
    return;
  }
  const bearing = mole.recipe.station.shoreBearing;
  // The basin is 18 × 14 world units and begins at the mouth: its centre sits
  // one 9-unit radius seaward, clear of the landward civic hall.
  scene.water.setHarborCalmMask({
    center: {
      x: mole.root.position.x + Math.cos(bearing) * 9,
      z: mole.root.position.z + Math.sin(bearing) * 9,
    },
    radiusX: 9,
    radiusZ: 7,
    calmStrength: 0.7,
  });
}

/**
 * Registers every warm light that should lay a reflection pool on the sea. The
 * beacon keeps its own sweeping lane (water uBeacon* uniforms); these are the
 * omnidirectional pools. Lane world positions mirror the geometry each module
 * builds. The registry caps them per tier; callers register all of them.
 */

export function gardenStationRouteEndpoints(
  stationRoot: { x: number; z: number },
  shoreBearing: number,
): { openWater: { x: number; z: number }; station: { x: number; z: number } } {
  const x = Math.cos(shoreBearing);
  const z = Math.sin(shoreBearing);
  return {
    openWater: { x: stationRoot.x + x * 30, z: stationRoot.z + z * 30 },
    station: { x: stationRoot.x + x * 4, z: stationRoot.z + z * 4 },
  };
}

function registerLightLanes(
  registry: GardenLaneRegistry,
  world: PharosVilleWorld,
  islandTile: { x: number; y: number },
  docks: readonly DockVisual[],
  zones: readonly ZoneVisual[],
): void {
  registry.clear();
  registry.set({
    color: HARBOR_PALETTE.lantern_glow,
    id: "beacon",
    intensity: 1,
    kind: "beacon",
    worldX: islandTile.x * TILE_SCALE,
    worldZ: islandTile.y * TILE_SCALE,
  });
  // One stone lantern per lit station (harbour-3). Both the geometry and this
  // registry consume the same station-root helper, so remote cove lights never
  // fall back to the former island ellipse.
  const islandX = islandTile.x * TILE_SCALE;
  const islandZ = islandTile.y * TILE_SCALE;
  for (const [index, lantern] of gardenHarborLanternWorldPositions(
    docks.map((dock) => dock.recipe),
  ).entries()) {
    registry.set({
      color: HARBOR_PALETTE.lantern_glow,
      id: `harbor-lantern.${index}`,
      intensity: 0.62,
      kind: "lantern",
      // A kindled stone lantern: its pool stands down until the night beat.
      kindledAtNight: true,
      worldX: lantern.x,
      worldZ: lantern.z,
    });
  }
  for (const [index, offset] of gardenIslandLanternWorldOffsets().entries()) {
    registry.set({
      color: HARBOR_PALETTE.lantern_warm,
      id: `island-path-lantern.${index}`,
      intensity: 0.34,
      kind: "lantern",
      worldX: islandX + offset.x,
      worldZ: islandZ + offset.z,
    });
  }
  registry.set({
    color: HARBOR_PALETTE.lantern_glow,
    id: "pigeonnier-lamp",
    intensity: 0.42,
    kind: "lantern",
    worldX: world.pigeonnier.tile.x * TILE_SCALE,
    worldZ: world.pigeonnier.tile.y * TILE_SCALE,
  });
  // Marker buoys lay a band-coloured reflection on the sea (danger a touch
  // brighter). Their kind lets the registry cap them alongside lanterns.
  for (const zone of zones) {
    for (const [index, buoy] of zone.buoys.entries()) {
      registry.set({
        color: `#${buoy.color.getHexString()}`,
        id: `zone-buoy.${zone.area.id}.${index}`,
        intensity: buoy.danger ? 0.6 : 0.48,
        kind: "buoy",
        worldX: buoy.worldX,
        worldZ: buoy.worldZ,
      });
    }
  }
  // Data-pulse lanes on every rendered trade route. The lane registry admits
  // only the per-tier simultaneous quota and rotates the rest, so registration
  // must not pre-truncate the set or quieter harbours never get a turn.
  const routes = docks
    .filter((dock) => Number.isFinite(dock.recipe.dock.totalUsd) && dock.recipe.dock.totalUsd > 0)
    .toSorted((left, right) => (
      right.recipe.dock.totalUsd - left.recipe.dock.totalUsd
      || left.recipe.dock.id.localeCompare(right.recipe.dock.id)
    ));
  const busiestUsd = routes[0]?.recipe.dock.totalUsd ?? 1;
  for (const dock of routes) {
    const endpoints = gardenStationRouteEndpoints(
      dock.root.position,
      dock.recipe.station.shoreBearing,
    );
    registry.set({
      color: HARBOR_PALETTE.lantern_glow,
      id: `route-pulse.${dock.recipe.dock.detailId}`,
      intensity: 0.35 + 0.45 * Math.sqrt(dock.recipe.dock.totalUsd / busiestUsd),
      kind: "route",
      worldX: endpoints.openWater.x,
      worldZ: endpoints.openWater.z,
      route: {
        x: endpoints.station.x,
        z: endpoints.station.z,
      },
    });
  }
}

function enableHeroReflectionLayer(object: Object3D): void {
  object.layers.enable(GARDEN_HERO_REFLECTION_LAYER);
}

/**
 * The island part: terraces, the lighthouse (procedural shell until the GLB
 * lands), beacon fire, summit birds and signal mast. Rebuilds only
 * when the lighthouse family — minus the beam-dwell target, which is a cheap
 * bearing recompute on the pose path — changes.
 */
function buildIslandPart(
  scene: GardenScene,
  content: GardenContent,
  world: PharosVilleWorld,
): void {
  const part = content.parts.island;
  // C2(c): Lane W's shared cloud-shadow sampler, forwarded to the island
  // factory (I3) so light weather sweeps the land coherently with the sea.
  const cloudShadows: GardenCloudShadowSource = scene.water.cloudShadows;
  const island = createTerracedIsland(world, cloudShadows, scene.calendarDate);
  applyGardenMonthRecord(island.root, world.lighthouse.gardenMonthRecord);
  scene.seasonalDressing.setLetsGoTree(island.letsGoTree);
  part.root.add(island.root);
  scene.keeper.root.position.copy(island.root.position);
  scene.heron.root.position.copy(island.root.position);
  // The island stone/timber (and lighthouse, inside island.root) cast and
  // receive. The flat MeshBasicMaterial shoal is excluded so its transparent
  // disc never stamps a hard shadow; the harbour is flagged in its own part.
  flagStaticShadowUsers(island.root);
  island.lighthouseShell.traverse(enableHeroReflectionLayer);
  island.root.traverse((object) => {
    if (
      object.name === "island-shoin-precinct"
      || object.name === "island-niwaki"
      || object.name === "island-karikomi"
      || object.name.startsWith("island-planted-shelf-")
      // W3.2 (water-2 f): the rock foot meets its own inverted foot.
      || object.name === GARDEN_CRAG_HEADLAND_NAME
      || (object instanceof Mesh && object.parent === island.root
        && object.name === "" && object.material instanceof MeshStandardMaterial
        && object.material.vertexColors && object.material.roughnessMap !== null)
    ) object.traverse(enableHeroReflectionLayer);
  });
  part.cues.set(world.lighthouse.detailId, {
    // Pharos Wonder D1: scaled for the 34-unit three-tier tower (was 4.5 for
    // the 30-unit v3 shell) so the selection ring spans the battered square
    // base and its terrace steps.
    radius: 5.2,
    root: island.lighthouseRoot,
    y: 0.12,
  });

  // W4: the living fire at the brazier. W7: the summit bird flock. Both roots
  // anchor at the beacon and are re-anchored by attachGardenLighthouseModel.
  const beaconFire = createGardenBeaconFire();
  beaconFire.root.position.set(0, GARDEN_LIGHTHOUSE_BEACON_Y, 0);
  island.lighthouseRoot.add(beaconFire.root);
  // W7 rim light, chained onto the I3 cloud-shadow hook (already applied
  // inside createTerracedIsland) — compose, never clobber.
  applyLighthouseRimLight(island.lighthouseRoot);
  // The procedural shell's gilt is per-build (fresh materials each rebuild),
  // so the statue gleam can drive it directly; the GLB path clones first.
  // T0.2: the tower's window rows and the precinct gatehouse light share one
  // material NAME, so a single traverse of the island collects both. Built
  // per-island so it cannot leak across rebuilds.
  const lighthouseWindowMaterials: MeshStandardMaterial[] = [];
  collectLighthouseGlowMaterials(island.root, lighthouseWindowMaterials);
  const statueGleamMaterials: MeshStandardMaterial[] = [];
  island.lighthouseShell.traverse((object) => {
    if (
      object instanceof Mesh
      && object.material instanceof MeshStandardMaterial
      && object.material.name === "bronze-gilt"
    ) {
      statueGleamMaterials.push(object.material);
    }
  });

  // 3a: the storm-signal hoist, standing on the planted shelf just east of the
  // observatory pavilion (garden-island's `createObservatoryPavilion`, root at
  // x 4.4 with a 2.4-unit base) — clear of its footprint, on the same terrace,
  // so the instrument and the signal read as one station. The height is the
  // shelf cap (`islandTerrainHeight` is private to garden-island, and every
  // other prop on this terrace is seated by hand the same way). Yawed to the
  // fixed camera azimuth so the cloth is never seen edge-on.
  const signalMast = createGardenSignalMast();
  signalMast.root.position.set(7.2, 0.98, 3.2);
  signalMast.root.rotation.y = Math.PI / 4;
  signalMast.setState({
    pennantCount: world.lighthouse.signalMast?.pennantCount ?? 0,
    stormCone: world.lighthouse.signalMast?.stormCone ?? false,
  });
  island.root.add(signalMast.root);

  content.beacon = island.beacon;
  content.beaconFire = beaconFire;
  content.beaconFireRoot = beaconFire.root;
  content.beaconHalo = island.beaconHalo;
  content.lanternSwell = createLanternSwell();
  content.beam = island.beam;
  content.decoration = island.decoration;
  content.lighthouseLight = island.lighthouseLight;
  content.lighthouseRoot = island.lighthouseRoot;
  content.lighthouseShell = island.lighthouseShell;
  content.pondReflection = island.pondReflection;
  content.signalMast = signalMast;
  content.lighthouseWindowMaterials = lighthouseWindowMaterials;
  content.islandLanternMaterial = gardenIslandLanternMaterial(island.decoration);
  // H-A: the island's path lanterns kindle first, beside the beacon.
  if (content.islandLanternMaterial) patchGardenLanternKindling(content.islandLanternMaterial, "attribute");
  content.statueGleamMaterials = statueGleamMaterials;
}

/** The stone garden of the fallen and the pigeonnier islet, keyed on their own world families. */
function buildLandmarksPart(content: GardenContent, world: PharosVilleWorld): void {
  const part = content.parts.landmarks;
  const stoneGarden = createGardenStoneGarden(world.graves);
  content.stoneGarden?.dispose();
  content.unregisterStoneGardenRitual?.();
  content.stoneGarden = stoneGarden;
  content.unregisterStoneGardenRitual = registerRitual("anniversary-lantern", stoneGarden.ritual);
  const pigeonnier = createGardenPigeonnier(world.pigeonnier);
  content.pigeonnier = pigeonnier;
  content.pigeonnierMoverPositions = pigeonnier.moverDetailIds.map(() => ({ x: 0, y: 0, z: 0 }));
  syncPigeonnierMoverShips(content);
  part.root.add(stoneGarden.root, pigeonnier.root);
  for (const [detailId, anchor] of stoneGarden.anchors) {
    part.cues.set(detailId, {
      radius: anchor.userData.selectionRadius,
      root: anchor,
      y: 0.08,
    });
  }
  part.cues.set(world.pigeonnier.detailId, {
    radius: pigeonnier.anchor.userData.selectionRadius,
    root: pigeonnier.anchor,
    y: 0.08,
  });
}

function syncPigeonnierMoverShips(content: GardenContent): void {
  const ships = content.ships ?? [];
  content.pigeonnierMoverShips = [];
  for (const detailId of content.pigeonnier.moverDetailIds) {
    let match: ShipVisual | null = null;
    for (const visual of ships) {
      if (visual.ship.detailId !== detailId) continue;
      match = visual;
      break;
    }
    content.pigeonnierMoverShips.push(match);
  }
}

/** Risk-water bodies, their buoy field, and the sea signs. */
function buildZonesPart(content: GardenContent, world: PharosVilleWorld): void {
  const part = content.parts.zones;
  const zones = world.areas.map((area) => createZone(area));
  for (const zone of zones) {
    part.root.add(zone.root);
    // Zones-v2 review: the selection ring tracks the zone's base radius
    // (tint.radiusX / ELLIPSE_X=1.25 → ×0.8), not the old hardcoded 5.2, so
    // the cue scales with the recomposed per-band zone bodies (~7–50 units).
    part.cues.set(zone.area.detailId, {
      radius: zone.tint.radiusX * 0.8,
      root: zone.root,
      y: 0.08,
    });
  }
  const zoneField = createZoneField(zones);
  part.root.add(zoneField.root);
  // W2a: the sea's place-names, carved into low stone steles standing at the
  // water. Copy comes from the same area records the detail panels read, so
  // the two surfaces cannot drift.
  const seaSigns = createGardenSeaSigns(seaSignSpecs(world.areas));
  part.root.add(seaSigns.root);
  content.seaSigns = seaSigns;
  content.zoneField = zoneField;
  content.zones = zones;
}

/**
 * The authored perimeter field made tangible as one nine-draw static body.
 *
 * (Said "five-draw" until 2026-09-07; it had been seven for some time and the
 * vegetation pass took it to nine — rim land, pines, broadleaves, understory,
 * the two foreground silhouette masses and the path furniture.)
 */
function buildRimPart(scene: GardenScene, content: GardenContent): void {
  const rim = createGardenRimMesh(scene.calendarDate);
  content.parts.rim.root.add(rim.root);
  content.rim = rim;
  // W1.5: the threshold is the ground under the rest seat. It rides in the rim
  // part so part disposal frees it, and follows the breathed eye per frame.
  const threshold = createGardenThreshold();
  content.parts.rim.root.add(threshold.root);
  content.threshold = threshold;
  // The night-beat materials (rim and threshold flora dimming, the threshold
  // tōrō's kindling) are born at 0; re-push the current beat on the next frame.
  scene.floraNightValue = -1;
  const waterfall = createGardenWaterfall();
  content.parts.rim.root.add(waterfall.mesh);
  content.waterfall = waterfall;
  // Shed-list: one authored event replaces the map-wide random silver arcs.
  const displaced = scene.waterAccents.getObjectByName(GARDEN_WATERFALL_DISPLACEMENT);
  if (displaced) displaced.visible = false;
}

/** Static decorative geography, built and disposed beside the zone field. */
function buildSeaEdgesPart(content: GardenContent): void {
  const part = content.parts.seaEdges;
  const seaEdges = createGardenSeaEdges();
  part.root.add(seaEdges.root);
  // Every form is static and lit. The part owns no emissive/source materials,
  // so every surface may participate in the cached directional shadow map.
  flagStaticShadowUsers(seaEdges.root);
  content.seaEdges = seaEdges;
}

/** The nine shore stations and their approach lanterns. */
function buildDocksPart(scene: GardenScene, content: GardenContent, world: PharosVilleWorld): void {
  const part = content.parts.docks;
  const islandTile = gardenIslandDisplayTile(world.lighthouse.tile);
  const recipes = world.docks.map((dock) => (
    authorDock(dock, gardenDockDisplayTile(dock.tile), islandTile)
  ));
  const batch = createGardenHarborBatch(recipes);
  part.root.add(batch.root);
  for (const dock of batch.docks) {
    part.root.add(dock.root);
    part.cues.set(dock.recipe.dock.detailId, { radius: 2.5, root: dock.root, y: 0.08 });
  }
  // Every shore station joins the island in the static map. The
  // batch marks flag cloth, lights and LOD detail as non-casters by name.
  flagStaticShadowUsers(batch.root);
  const harborLanterns = createHarborLanterns(recipes);
  part.root.add(harborLanterns.root);
  // The station lanterns are static quay furniture too. Their glass heads share one
  // material with no name to exclude, so they are skipped by identity: a lamp
  // is a source, not an occluder.
  harborLanterns.root.traverse((object) => {
    if (!(object instanceof Mesh) && !(object instanceof InstancedMesh)) return;
    object.castShadow = object.material !== harborLanterns.lightMaterial;
    object.receiveShadow = true;
  });

  // D3: one instanced, unlit smoke plume for the three hearth archetypes,
  // reusing the beacon fire's own plume vocabulary. Anchors are ridge points
  // from the recipes; the cargo-tide gate is read live each frame below, so a
  // data refresh re-kettles the chimneys without this part rebuilding.
  const stationSmoke = createGardenStationSmoke(
    stationSmokeSpecs(batch.docks),
    scene.water.cloudShadows.texture,
  );
  part.root.add(stationSmoke.root);

  content.docks = batch.docks;
  content.harborBatch = batch;
  content.harborLanternMaterial = harborLanterns.lightMaterial;
  content.stationSmoke = stationSmoke;
}

/**
 * The light instanced life around the harbour — the gull flock, fireflies.
 * Keyed on the dock family as well as the island tile, so a routine supply
 * tick rebuilds this cheap part and never the masonry beside it.
 */
function buildHarborLifePart(content: GardenContent, world: PharosVilleWorld): void {
  const part = content.parts.harborLife;
  const gullFlock = createGardenGullFlock(world.lighthouse.tile);
  // X5 (life-7): the fireflies rise over the reed bed the seat sees (the west grove shore).
  const reedBed = GARDEN_FIREFLY_REED_BED;
  const fireflies = createGardenFireflies(
    { x: reedBed.tile.x * TILE_SCALE, y: WATER_LEVEL, z: reedBed.tile.y * TILE_SCALE },
    {
      alongX: Math.abs(Math.cos(reedBed.bearing)) >= Math.SQRT1_2,
      halfLength: reedBed.length * 0.47,
      halfWidth: reedBed.width * 0.42,
    },
  );
  part.root.add(gullFlock.root, fireflies.root);

  content.fireflies = fireflies;
  content.gullFlock = gullFlock;
}

/**
 * The mint/burn cargo run and the weekly supply tide's tidal flat. The cargo
 * reads the composed dock visuals, so this part sits after `docks` in the
 * build order and its key includes the dock structure.
 */
function buildCargoTidePart(content: GardenContent, world: PharosVilleWorld): void {
  const part = content.parts.cargoTide;
  // Tier 3 #3: the world's first FLOW cue. Built after the harbours are placed
  // because each crate's berth is a harbour-local slot resolved through that
  // harbour's own yaw and position — one mesh for the ring, not one per quay.
  const cargoTide = createGardenCargoTide(cargoTideSpecs(content.docks));
  part.root.add(cargoTide.root);
  // X2: the one honest tide signal — see garden-tidal-flat.ts.
  const tidalFlat = createGardenTidalFlat(world.supplyTide);
  part.root.add(tidalFlat.root);

  content.cargoTide = cargoTide;
  content.tidalFlat = tidalFlat;
}

/**
 * The fleet: per-ship visuals, contact shadows, lanterns, cross-bearing
 * buoys and hero reflections. The instanced batches and the sail
 * atlas are scene-owned and NOT touched here beyond cell reassignment — a
 * rebuild restamps instances and repaints atlas cells through the upload lane.
 */
function buildShipsPart(
  scene: GardenScene,
  content: GardenContent,
  world: PharosVilleWorld,
): void {
  const part = content.parts.ships;
  const staged = content.stagedShipRebuild;
  content.stagedShipRebuild = null;
  // The base slice only: the transient outsider is reconciled separately
  // (reconcileTransientSelection) so selection never rebuilds the fleet.
  const slice = selectGardenObservatorySlice(world, null);
  const fleetPlacement = placeGardenFleet(
    slice.ships.map(({ ship }) => ship),
    world.lighthouse.tile,
  );
  const shipGeometryCache: GardenShipGeometryCache = {
    geometries: new Map(),
    wakeFillMaterial: new MeshBasicMaterial({
      color: HARBOR_PALETTE.foam_white,
      depthWrite: false,
      opacity: 0.08,
      side: DoubleSide,
      transparent: true,
    }),
  };
  content.shipsGeometryCache = shipGeometryCache;
  const wakeQuadGeometry = cachedShipGeometry(shipGeometryCache, "wake.quad", () => {
    const geometry = new PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  });

  // W1 (decision D2): the fleet splits in two. Hero ships (titans and uniques,
  // ~18 of ~205) keep their own scene graph because a bespoke GLB hull, the
  // grade shield and the identity sail all need real meshes — they are also
  // the ships the eye actually lands on. Everything else is drawn from the
  // shared instanced batches at 9 draw calls total, however many there are.
  //
  // Cells are assigned now (the batch reads them per instance); the paint pass
  // runs from the frame loop once logos resolve. Assignment resets the paint
  // generation, so the repaint schedules itself through the upload lane.
  const sailAtlas = scene.sailAtlas;
  assignGardenSailAtlasCells(sailAtlas, slice.ships.map(({ ship }) => ship));

  const ships = slice.ships.map(({ displayOffset, representative, ship }) => {
    const atlasCell = gardenSailAtlasCell(sailAtlas, ship);
    if (gardenShipUsesHeroModel(ship)) {
      const visual = createShip(ship, displayOffset, representative, shipGeometryCache);
      assignGardenHeroSailAtlas(visual, sailAtlas.texture, atlasCell);
      return visual;
    }
    return createBatchedShip(ship, displayOffset, representative, atlasCell);
  });

  // Departures are renderer ghosts, never world records. Recreate them from
  // the NEW part's shared cache so disposal remains epoch-local. The normal
  // live fleet leaves ample headroom under the 320-instance scene batch. In
  // the pathological full-cap churn case, overflow departures use procedural
  // roots rather than popping or reallocating the scene-scope batch.
  const departureCapacity = staged?.reducedMotion
    ? 0
    : Math.max(0, GARDEN_FLEET_BATCH_CAPACITY - ships.length);
  const departingShips = (staged?.reducedMotion ? [] : (staged?.departureSeeds ?? []))
    .map((seed, index) => {
      const visual = index < departureCapacity
        ? createBatchedShip(seed.ship, seed.displayOffset, seed.representative, 0)
        : createShip(
            seed.ship,
            seed.displayOffset,
            seed.representative,
            {
              geometries: new Map(),
              wakeFillMaterial: shipGeometryCache.wakeFillMaterial.clone(),
            },
          );
      visual.root.position.set(
        seed.from.x * TILE_SCALE,
        GARDEN_SHIP_ROOT_Y,
        seed.from.y * TILE_SCALE,
      );
      return visual;
    });
  // Wake slots are world-global and stable in content order. Fleet silhouette
  // slots are local to each family and therefore must never be reused here.
  // The final slot is reserved for the transient selected outsider.
  const wakeSlots = assignGardenWakeSlots(ships, departingShips);
  const wakeBatch = createGardenWakeBatch(
    wakeSlots.capacity,
    shipGeometryCache.wakeFillMaterial,
    wakeQuadGeometry,
  );

  // +1: a spare instance slot for the transient outsider, so selecting one
  // never reallocates the contact-shadow buffer. The live count is clamped to
  // the ship list every frame; unwritten slots hold zero-scale matrices.
  const shipShadows = createShipShadows(ships.length + departingShips.length + 1);
  shipShadows.count = ships.length + departingShips.length;
  part.root.add(shipShadows, wakeBatch.root);
  for (const ship of ships) {
    // Batched roots carry no drawable children — they exist so entity cues,
    // follow-selected, the wake and the lane registry keep the same anchor
    // they had when every ship owned its meshes.
    part.root.add(ship.root);
    part.cues.set(ship.ship.detailId, {
      radius: ship.selectionRadius,
      root: ship.root,
      y: -ship.root.position.y + 0.08,
    });
  }
  for (const ship of departingShips) part.root.add(ship.root);
  // Fleet-wide lantern instances (two shared draw calls); positions are driven
  // per frame from each ship's world transform in the ship loop.
  const fleetLanterns = createFleetLanterns(ships, shipGeometryCache);
  part.root.add(fleetLanterns.root);

  // 3b: one buoy per ship whose two price bearings cross. `agrees === false` is
  // the ONLY state that moors one — an absent check leaves the water empty and
  // claims nothing, which is the whole point of the signal.
  //
  // The buoys ride WITH their hulls rather than sitting at the berth: a ship
  // sails away from its anchor, so a buoy nailed
  // to the berth would spend most of its time nowhere near the ship it is
  // describing, and a cue you cannot associate with its subject is not a cue.
  const buoyShips = ships.filter((visual) => visual.ship.dexCrossCheck?.agrees === false);
  const buoySpecs: CrossBearingBuoySpec[] = buoyShips.map((visual) => ({
    detailId: visual.ship.detailId,
    hullRadius: visual.selectionRadius,
  }));
  const crossBearingBuoys = createGardenCrossBearingBuoys(buoySpecs);
  part.root.add(crossBearingBuoys.root);

  // 3d: the bearing the beam will settle on. Null when the index named no
  // contributor, or when the coin it named is not in the rendered fleet — the
  // sweep then keeps the even turn it has always had.
  content.beamDwellBearing = computeBeamDwellBearing(world, slice);
  content.fleetThinningShips = gardenFleetThinningShips(
    slice.ships.map(({ ship }) => ship),
    fleetPlacement.mooringByShipId,
  );
  content.crossBearingBuoyShips = buoyShips;
  content.crossBearingBuoys = crossBearingBuoys;
  content.fleetLanterns = fleetLanterns;
  content.wakeBatch = wakeBatch;
  content.wakeOutsiderSlot = wakeSlots.outsiderSlot;
  content.shipLanternGlowMaterial = fleetLanterns.glowMaterial;
  content.shipLanternMaterial = fleetLanterns.coreMaterial;
  content.shipShadows = shipShadows;
  content.ships = ships;
  syncPigeonnierMoverShips(content);
  content.departingShips = departingShips;
  content.visibleShipCount = ships.length + departingShips.length;

  if (staged && !staged.reducedMotion) {
    for (const visual of ships) {
      const target = shipBerthTile(visual);
      const previous = staged.oldPositionById.get(visual.ship.id);
      const oldBerth = staged.oldBerthById.get(visual.ship.id);
      if (
        oldBerth
        && Math.hypot(target.x - oldBerth.x, target.y - oldBerth.y) < 0.01
      ) continue;
      const from = previous ?? gardenMistBoundaryTile(
        target,
        stableUnit(`garden-transition.arrival-edge.${visual.ship.id}`),
        shipTransitionMarginTiles(visual.ship),
      );
      queueShipTransition(
        content,
        gardenShipTransition(
          visual.ship.id,
          from,
          target,
          staged.oldIds.has(visual.ship.id) ? "reanchor" : "arrival",
          shipTransitionMarginTiles(visual.ship),
        ),
      );
    }
    for (let index = 0; index < departingShips.length; index += 1) {
      const visual = departingShips[index]!;
      const seed = staged.departureSeeds[index]!;
      queueShipTransition(
        content,
        gardenShipTransition(
          visual.ship.id,
          seed.from,
          gardenMistBoundaryTile(
            seed.from,
            stableUnit(`garden-transition.departure-edge.${visual.ship.id}`),
            shipTransitionMarginTiles(visual.ship),
          ),
          "departure",
          shipTransitionMarginTiles(visual.ship),
        ),
      );
    }
  }
}

/**
 * Flight to quality: tenders making for the biggest hulls, for as long as the
 * mint/burn gauge reports capital concentrating into them. Its own part: the
 * gauge's continuous intensity moves on routine refreshes, and rebuilding a
 * handful of instanced boats must never drag the whole fleet with it. Sits
 * after `ships` in the order because each flotilla's stand-off is scaled to
 * its titan's own footprint. `flightTenderTitans` returns nothing when the
 * gauge is absent or false, and a spec-less flotilla builds no mesh and costs
 * no draw call.
 */
function buildTendersPart(content: GardenContent, world: PharosVilleWorld): void {
  const part = content.parts.tenders;
  const baseShips = content.transient
    ? content.ships.filter((visual) => visual !== content.transient?.visual)
    : content.ships;
  const flightTenderShips = flightTenderTitans(baseShips, world.fleetIssuance);
  const flightTenders = createGardenFlightTenders(
    flightTenderShips.map((visual) => ({
      hullRadius: visual.selectionRadius,
      shipId: visual.ship.id,
    })),
    world.fleetIssuance?.flightIntensity ?? 0,
  );
  const issuanceNodeById = new Map(world.ships.map((ship) => [ship.id, ship]));
  const issuanceCandidates = baseShips.map((visual) => {
    const node = issuanceNodeById.get(visual.ship.id);
    return node ? { ...visual, ship: node } : visual;
  });
  const issuanceWorksetShips = selectIssuanceWorksetShips(issuanceCandidates);
  const issuanceWorksets = createGardenShipIssuanceWorksets(
    shipIssuanceWorksetSpecs(issuanceWorksetShips),
    content.hasReconciledWorld ? 0 : 1,
  );
  part.root.add(flightTenders.root, issuanceWorksets.root);

  content.flightTenderShips = flightTenderShips;
  content.flightTenders = flightTenders;
  content.issuanceWorksetShips = issuanceWorksetShips;
  content.issuanceWorksets = issuanceWorksets;
}

/**
 * 3d needs one ship's composed berth in world XZ to take a bearing on.
 * Resolved with a null motion sample, which is the berth before any patrol
 * displaces it — the same address `entityCues` and the lane registry use, and
 * a fixed one, so the beam holds a steady bearing instead of hunting the
 * hull around its circuit. Taken at compose/pose-adoption time rather than per
 * frame for the same reason.
 */
function computeBeamDwellBearing(
  world: PharosVilleWorld,
  slice: ReturnType<typeof selectGardenObservatorySlice>,
): number | null {
  const dwellShipId = world.lighthouse.beamDwell?.shipId ?? null;
  const dwellEntry = dwellShipId === null
    ? undefined
    : slice.ships.find((entry) => entry.ship.id === dwellShipId);
  if (!dwellEntry) return null;
  const islandTile = gardenIslandDisplayTile(world.lighthouse.tile);
  const tile = resolveGardenShipDisplayTile({
    displayOffset: dwellEntry.displayOffset,
    representative: dwellEntry.representative,
    sample: null,
    ship: dwellEntry.ship,
  });
  return beamBearingTo(
    {
      x: islandTile.x * TILE_SCALE + GARDEN_LIGHTHOUSE_ROOT_OFFSET.x,
      z: islandTile.y * TILE_SCALE + GARDEN_LIGHTHOUSE_ROOT_OFFSET.z,
    },
    { x: tile.x * TILE_SCALE, z: tile.y * TILE_SCALE },
  );
}

/**
 * The boundary steles to raise, and what they say.
 *
 * Every named body gets one — including Calm Anchorage and Ledger Mooring,
 * and Wreck Shoal. These steles are the sea's in-world place-name display;
 * the old DOM chip layer was removed as a UI intrusion on the world.
 */
function seaSignSpecs(areas: PharosVilleWorld["areas"]): SeaSignSpec[] {
  const specs: SeaSignSpec[] = [];
  for (const area of areas) {
    const body = seaBodyForArea(area);
    if (!body) continue;
    const count = typeof area.count === "number" ? area.count : null;
    specs.push({
      body,
      label: area.label,
      reading: count === null ? null : `${count} ${count === 1 ? "ship" : "ships"}`,
      accent: zoneThemeForTerrain(SEA_BODY_TERRAIN[body]).label.accent,
    });
  }
  return specs;
}

function seaSignBodyForDetail(
  world: PharosVilleWorld,
  detailId: string | null,
): SeaBodyName | null {
  if (!detailId) return null;
  for (const area of world.areas) {
    if (area.detailId === detailId) return seaBodyForArea(area);
  }
  // Inspecting any lifecycle wreck also activates its named body's stele.
  for (const grave of world.graves) {
    if (grave.detailId === detailId) return "wreck";
  }
  return null;
}

/** Debug-only visual suppression; the ledger and hit semantics are unchanged. */
function seaSignsDebugVisible(): boolean {
  if (typeof window === "undefined") return true;
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  return !/(?:^|&)signs=0(?:&|$)/.test(hash);
}

function updateSceneForFrame(
  scene: GardenScene,
  camera: PerspectiveCamera,
  frame: ThreeWorldRendererFrame,
  phase: DayCyclePhase,
  detailPolicy: RendererDetailPolicy,
  shipFrame: GardenShipFrameInput,
): void {
  const weather = scene.weather;
  // Advance the beam's own clock before any early return, so a frame drawn
  // without world content cannot leave a gap for the next one to jump across.
  const beamElapsedSeconds = Math.max(0, frame.timeSeconds - scene.beamClockSeconds);
  scene.beamClockSeconds = frame.timeSeconds;
  scene.sky.update(phase, {
    reducedMotion: frame.reducedMotion,
    wallClockHour: frame.wallClockHour,
    targetX: cameraViewTarget.x,
    targetY: cameraViewTarget.y,
    targetZ: cameraViewTarget.z,
    cameraPosition: camera.position,
    timeSeconds: frame.timeSeconds,
    // Phase 2 billboard atmosphere (mist banks + cumulus): full/balanced only,
    // resolved through the sea tier (S1) so a camera drag never blinks them.
    billboards: ["full", "balanced"].includes(seaQualityTier(frame.renderScheduler)),
    wind: weather.wind,
    epistemicBanks: scene.epistemicBanks,
    viewAspect: camera.aspect,
  });
  // W5.1: the day score's driver — runs, admits and reserves the rituals once
  // per frame, before their owners draw.
  tickGardenScore({
    director: frame.gardenDirector,
    directorSeconds: frame.epochSeconds ?? frame.timeSeconds,
    clockHour: frame.wallClockHour,
    reducedMotion: frame.reducedMotion,
  });
  scene.almanacDressing.update({ cameraPosition: camera.position, reducedMotion: frame.reducedMotion });
  scene.seasonalDressing.update({
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
    weather,
  });
  scene.content?.waterfall.update({
    night: phase.night,
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
  }, scene.wakes);
  scene.content?.rim.updateWind(weather, frame.reducedMotion);
  updateGardenThreshold(scene, camera, frame, weather);
  scene.content?.seaEdges?.updateWind(weather, frame.reducedMotion);
  if (scene.content) updateGardenNiwakiWind(scene.content.decoration, weather, frame.reducedMotion);
  updateDayCycle(scene, frame, phase);
  setFleetLightHour(frame.wallClockHour);
  const floraNight = Math.round(dayCycleBeats(frame.wallClockHour).night * 256) / 256;
  if (floraNight !== scene.floraNightValue) {
    scene.floraNightValue = floraNight;
    setGardenFloraNightValue(scene.root, floraNight);
  }
  scene.keeper.update({ deltaSeconds: beamElapsedSeconds, hour: frame.wallClockHour, reducedMotion: frame.reducedMotion });
  updateGardenLanternKindling(frame.wallClockHour, beamElapsedSeconds, frame.reducedMotion);
  scene.content?.stoneGarden?.update({ deltaSeconds: beamElapsedSeconds, hour: frame.wallClockHour, reducedMotion: frame.reducedMotion });
  const epistemicHaze = deriveEpistemicHaze(frame.world.freshness);
  scene.water.setPegSummaryEpistemicHaze(epistemicHaze.riskWaters);
  setGardenQuayEpistemicHaze(epistemicHaze.quays);
  scene.content?.pondReflection.update(phase, frame.wallClockHour, camera.position);
  // Phase 2 lightning: the strike's flash doubles through the existing
  // shadow-casting key light for its ~0.3 s envelope. No new lights; the
  // day-cycle intensity above remains the base this multiplies, and the
  // reduced-motion plan holds the flash at 0.
  if (weather.lightning > 0) {
    scene.directionalLight.intensity *= 1 + weather.lightning * 2.2;
  }
  updateLighthouseRimLight(phase, gardenKeyLightPose(frame.wallClockHour, phase, scratchRimKeyPose));
  updateLighthouseLanternGlass(phase);
  // Phase 3: bind the wake field's front texture and window before the water
  // samples them (the field itself advanced at the top of render()).
  scene.water.setWakeState(scene.wakes.texture, scene.wakes.centerX, scene.wakes.centerY, scene.wakes.halfSize);
  scene.water.update(frame, weather);
  // Balanced+ beauty layers: the horizon re-anchors to the camera target the
  // same way the sky dome does; the islets are static (no reduced-motion
  // work) and only gate visibility on the tier.
  scene.horizon.update(frame.wallClockHour, {
    cameraPosition: camera.position,
    clarity: scene.sky.signedClarity,
    tier: frame.renderScheduler.tier,
  });
  scene.islets.update({
    reducedMotion: frame.reducedMotion,
    tier: frame.renderScheduler.tier,
  });
  const content = scene.content;
  // Reflection pools stay secondary to hulls and risk water. Forty-plus full
  // tier lanes otherwise merge into pale discs at dusk/night, so the water
  // lane is deliberately dimmer than the visible lantern sprites.
  const breathTime = frame.reducedMotion ? 0 : frame.timeSeconds;
  const lanternBreath = gardenBreathAt(breathTime, GARDEN_BREATH_PHASE.lanterns);
  const winterLanternScale = scene.season === "winter" ? 1.08 : 1;
  const lanternBreathScale = (0.92 + lanternBreath * 0.16) * winterLanternScale;
  const laneGlowScale = (
    phase.night * 0.45 + phase.dusk * 0.3 + phase.daylight * 0.05
  ) * lanternBreathScale;
  if (!content) {
    // No fleet lanes to add — pack the base (beacon/harbor/dock) lanes only.
    const laneCount = scene.laneRegistry.sync(frame.renderScheduler.tier, laneGlowScale, {
      night: phase.night,
      reducedMotion: frame.reducedMotion,
      timeSeconds: frame.timeSeconds,
    });
    scene.water.setLaneState(
      scene.laneRegistry.texture,
      laneCount,
      scene.laneRegistry.fieldBounds(),
    );
    return;
  }

  // W6.4: status changes are held by the pure two-observation hysteresis
  // state machine above, then eased here at garden tempo. Clamp the elapsed
  // step so a hidden tab never catches up with a teleporting lamp.
  const lampTargetMix = content.lampStatusTargetMix;
  if (frame.reducedMotion) {
    content.lampStatusMix = lampTargetMix;
  } else {
    const lampDeltaSeconds = MathUtils.clamp(beamElapsedSeconds, 0, 0.25);
    const lampAlpha = 1 - Math.exp(-lampDeltaSeconds / LAMP_STATUS_TRANSITION_SECONDS);
    content.lampStatusMix += (lampTargetMix - content.lampStatusMix) * lampAlpha;
  }
  const lampModulation = lampStatusModulationForMix(content.lampStatusMix, content.lampModulation);
  updateLighthouseLampStatus(content, lampModulation);
  updateScalarTransitions(content, beamElapsedSeconds, frame.reducedMotion);
  // W3.2: shared breath on the two scene-owned lantern material families.
  // Day-cycle authored the phase bases earlier this frame; this ±8% modulation
  // sits on top and cannot become a competing light vocabulary.
  content.harborLanternMaterial.emissiveIntensity *= lanternBreathScale;
  content.shipLanternMaterial.emissiveIntensity *= lanternBreathScale;
  content.shipLanternGlowMaterial.opacity *= lanternBreathScale;
  if (scene.season === "winter") {
    content.shipLanternMaterial.emissive.set(HARBOR_PALETTE.lantern_warm);
    content.shipLanternMaterial.emissiveIntensity *= WINTER_LANTERN_INTENSITY_SCALE;
  } else {
    content.shipLanternMaterial.emissive.set(HARBOR_PALETTE.lantern_glow);
  }

  const constrained = frame.renderScheduler.tier === "constrained";
  // R13: ambient life survives `recovery`.
  //
  // Gulls and summit birds were gated to full/balanced
  // only. On this hardware the app sits in `recovery` almost permanently, so
  // in practice NONE of it was ever seen — the world was populated but never
  // alive. They are small instanced systems already sized for a tier ladder;
  // only `constrained`, which means the machine is genuinely drowning, still
  // sheds them.
  const ambientAlive = !constrained;
  content.decoration.visible = true;
  scene.waterAccents.visible = true;
  scene.waterAccents.rotation.y = 0;
  content.tidalFlat.update({
    lastVisitOffset: gardenLastVisitTide(),
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
  });
  content.gullFlock.update({
    constrained,
    keeperRitual: scene.keeper.ritual,
    night: phase.night,
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
    weather,
  });
  content.fireflies.update({
    // Nine additive quads: kept on every decorative tier so a camera gesture
    // or a busy GPU does not blink them out (garden-islets' rule).
    beautyTier: ["full", "balanced", "interaction"].includes(frame.renderScheduler.tier),
    // W5.6 (K24): fireflies only in their early-summer kō, risen by the score.
    night: phase.night * scene.seasonalDressing.fireflyPresence(frame.wallClockHour),
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
    weather,
  });

  // W4: the flame is the beacon now. One deterministic flicker (computed once
  // per frame, PSI-stress-scaled — D5) drives the fire's shared uniforms and
  // breathes through the halo and PointLight on top of the day-cycle base.
  const flicker = content.beaconFire.update({
    lampModulation,
    psiStress: frame.seaState.source.psiStress,
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
  });
  content.beaconFire.setTier(frame.renderScheduler.tier);
  content.beaconHalo.scale.multiplyScalar(1 + (flicker - 0.5) * 0.1);
  content.beaconHalo.material.opacity *= 0.92 + flicker * 0.16;
  content.lighthouseLight.intensity *= 1 + (flicker - 0.5) * 0.3;
  // D3: the station chimneys ride the same route clock and the shared
  // day-cycle ladder. Smoke is data-gated per harbour by the cargo
  // tide (the crates' own reading), so this reads the live dock nodes rather
  // than waiting for a docks-part rebuild.
  content.stationSmoke?.update({
    docks: content.docks,
    phase,
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
    tier: frame.renderScheduler.tier,
    wind: weather.wind,
  });
  // W5.2: the heron's arrival and departure are score rituals the driver
  // runs; between them she stands or is absent by the local hour.
  scene.heron.update({
    clockSeconds: frame.epochSeconds ?? frame.timeSeconds,
    reducedMotion: frame.reducedMotion,
    visible: ambientAlive,
    wallClockHour: frame.wallClockHour,
  });
  // The hoist's shared ambient frame: the same gate as the island's small
  // life, and the same clock.
  scratchAmbientFrame.reducedMotion = frame.reducedMotion;
  scratchAmbientFrame.timeSeconds = frame.timeSeconds;
  scratchAmbientFrame.visible = ambientAlive;
  // 3a: the hoist rides the same `ambientAlive` gate as the rest of the
  // island's small life — it survives `recovery` and is shed only at
  // `constrained`. What is flying was fixed at compose time; this call only
  // lifts the cloth, so the tier decides whether the mast is drawn, never what
  // it reports.
  content.signalMast.update(scratchAmbientFrame);
  // 3b's buoys are placed after the ship loop below,
  // where the hull transforms they ride on are final.
  // Every tier above constrained draws the single breath cone; constrained
  // swaps to the flat semantic fallback. Unlit additive pieces are culled
  // instead of rasterizing zero-alpha geometry.
  const beamUsePlane = frame.renderScheduler.tier === "constrained";
  const beamPieceLit = (child: typeof content.beam.children[number]): boolean => {
    const material = (child as Mesh).material as ShaderMaterial;
    return (material.uniforms.uOpacity?.value ?? 1) > 0.0005;
  };
  // The cone's mist and storm terms are uniform-gated, so the recovery cone
  // is the plain breath (one material, no tier-transition compile).
  // seaQualityTier keeps a camera drag (interaction) from blinking the mist
  // mid-gesture. beamScatter (cos² of the beam axis against the view axis)
  // tells the lantern swell when the beam swings through the eye-line.
  camera.getWorldDirection(scratchViewDirection);
  scratchBeamDirection.set(
    Math.cos(content.beam.rotation.y),
    0,
    -Math.sin(content.beam.rotation.y),
  );
  const beamScatter = Math.pow(
    Math.max(0, -scratchBeamDirection.dot(scratchViewDirection)),
    2,
  );
  const beamQualityTier = seaQualityTier(frame.renderScheduler);
  const beamVolumetric = !beamUsePlane
    && (beamQualityTier === "full" || beamQualityTier === "balanced") ? 1 : 0;
  for (const child of content.beam.children) {
    if (child.name === "lighthouse-beam-cone") {
      child.visible = !beamUsePlane && beamPieceLit(child);
      const coneUniforms = ((child as Mesh).material as ShaderMaterial).uniforms;
      coneUniforms.uVolumetric.value = beamVolumetric;
      coneUniforms.uStorm.value = weather.stormLevel;
    } else if (child.name === "lighthouse-beam") child.visible = beamUsePlane;
  }
  // W2.10 (K9): the lantern glass swells as the beam swings through the eye
  // line — at most once a minute, never paced by the PSI sweep rate — and the
  // corona breathes with it. pharos-8: the beacon lights its own mist.
  const lanternSwell = content.lanternSwell.update({
    beamFacing: beamScatter,
    caught: gardenLanternCatch(),
    glow: phase.night * Math.min(1, lampModulation.intensityScale),
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
  });
  content.beaconHalo.material.opacity *= 1 + lanternSwell * 0.8;
  updateLighthouseAir(content, phase, flicker, lampModulation.intensityScale);
  // R14: the sweep RATE carries the fleet's PSI stress.
  //
  // The beam is the monument's one motion beat, and it was a constant rotation
  // — movement that said nothing. A calm fleet now turns the light slowly and
  // a stressed one quickens it, so the thing your eye is drawn to is also the
  // thing telling you how the market is doing. The beam's COLOUR still carries
  // the PSI band, unchanged; this adds tempo, not a second colour channel.
  //
  // Bounded to 0.2-0.42 rad/s: fast enough to feel urgent at full stress, slow
  // enough that the world stays somewhere you can sit.
  const psiStress = MathUtils.clamp(frame.seaState.source.psiStress ?? 0, 0, 1);
  // 3d: the sweep slows across the largest PSI contributor's bearing and speeds
  // back up over open water, so the light lingers on the ship the index is most
  // moved by. A rate well, not an easing target — the beam never reverses,
  // stalls, or jumps, and an absent contributor scales by exactly 1, restoring
  // the plain even sweep with no branch here.
  const sweepRate = (0.2 + psiStress * 0.22)
    * lampModulation.rotationScale
    * beamDwellRateScale(scene.beamAngle, content.beamDwellBearing);
  // Only reduced motion freezes the sweep, and that is a policy, not a budget.
  //
  // `constrained` used to freeze it too, which cost nothing to run — the sweep
  // is one `rotation.y` write on a group that is drawn either way — and cost a
  // great deal to look at: entering the tier snapped the light to -0.55 and
  // leaving it snapped back to `timeSeconds * sweepRate`, so every load spike
  // read as the lighthouse jamming and then jumping. The beam is the
  // monument's one motion beat; the tier ladder sheds the beam's GEOMETRY
  // (cone -> flat plane, below), not its life.
  if (!frame.reducedMotion) {
    scene.beamAngle = (scene.beamAngle + beamElapsedSeconds * sweepRate) % (Math.PI * 2);
  }
  // 3d under reduced motion: the sweep is gone, so the cue survives as a
  // BEARING. The beam parks pointing at the contributor and the lighthouse
  // panel's Beam bearing row names the ship it is holding on; with no
  // contributor it keeps the composed pose it has always used.
  const beamBearing = frame.reducedMotion
    ? beamStaticBearing(content.beamDwellBearing)
    : scene.beamAngle;
  content.beam.rotation.y = beamBearing;
  content.beacon.getWorldPosition(scratchPosition);
  // W7.2: the eye's height over the water, the frame's width for gust travel,
  // and how squarely the beam faces the eye (scalar stores only).
  writeAudioSceneView(
    camera.position,
    camera.matrixWorld.elements[0],
    camera.matrixWorld.elements[2],
    cameraViewTarget,
    cameraViewHeight * camera.aspect / 2,
    scratchPosition.x,
    scratchPosition.z,
    beamBearing,
    WATER_LEVEL,
  );
  // The water road and its terminal pool take this exact post-dwell bearing on
  // every frame. One angle therefore owns cone, fallback and landing; reduced
  // motion parks all three on the same analytical bearing.
  scene.water.setBeaconState(
    scratchPosition.x,
    scratchPosition.z,
    beamBearing,
    // Keyed to the W0.7 light curve (0.95 day → 3.35 night): the road keeps
    // its faint day and full night ends now that the PointLight no longer
    // floods the tower, and still dims with the lamp-status modulation.
    MathUtils.clamp(0.156 + (content.lighthouseLight.intensity - 0.95) / 2.85, 0, 1),
    // W6: the water lane, caustic glow, and streaks breathe with the same
    // flame flicker driving the halo and PointLight above.
    flicker,
  );

  // Tier 3 #15: the eased far half of the zoom policy (see
  // advanceGardenOverviewDetail); the fleet pass reads it below.
  const overviewDetail = advanceGardenOverviewDetail(
    content.overviewLod,
    detailPolicy,
    beamElapsedSeconds,
    frame.reducedMotion,
  );
  // W2a: steles keep true world scale and whisper until the body is hovered or
  // inspected. Stone place-name UP; camera-compensated board label DOWN.
  // D9: boards are inspection-only — the selected body, else the hovered one.
  content.seaSigns.setInspected(
    seaSignBodyForDetail(frame.world, frame.selectedDetailId)
      ?? seaSignBodyForDetail(frame.world, frame.hoveredDetailId),
  );
  content.seaSigns.update({
    // W0.7 follow-up: the frame's own clock and motion policy, so the D6 rung
    // settle runs on the same delta as every other eased system instead of the
    // module keeping a second `performance.now()` and a second matchMedia
    // watcher of its own.
    deltaSeconds: beamElapsedSeconds,
    night: phase.night,
    reducedMotion: frame.reducedMotion,
    visible: seaSignsDebugVisible(),
    zoom: detailPolicy.seaSignZoom,
  });
  let showAnyDockDetail = detailPolicy.showWorldDetail;
  content.harborBatch?.updateFlagWind(breathTime, weather, frame.reducedMotion);
  for (const visual of content.docks) {
    visual.fineDetail.visible = gardenFineDetailVisible(detailPolicy, visual.recipe.dock.detailId, frame);
    showAnyDockDetail ||= visual.fineDetail.visible;
  }
  content.harborBatch?.setFineDetailVisible(showAnyDockDetail);

  // The fleet pass (renderer-ship-frame.ts): poses, batches, wakes, contact
  // shadows and hull-anchored instances. It sets this frame's ship lanes, so
  // the lane texture is re-packed right after it.
  shipFrame.breathTime = breathTime;
  shipFrame.constrained = constrained;
  shipFrame.deltaSeconds = beamElapsedSeconds;
  shipFrame.overviewDetail = overviewDetail;
  updateGardenShipFrame(scene, content, camera, frame, detailPolicy, shipFrame);
  const activeLaneCount = scene.laneRegistry.sync(frame.renderScheduler.tier, laneGlowScale, {
    night: phase.night,
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
  });
  scene.water.setLaneState(
    scene.laneRegistry.texture,
    activeLaneCount,
    scene.laneRegistry.fieldBounds(),
  );

  updateGardenZoneBuoyDetail(content, frame, detailPolicy, breathTime);

  updateSelectedRoute(content, frame);
  updateCueMarker(scene.hoverMarker, content, frame.hoveredDetailId, frame, 0.94);
  updateCueMarker(scene.selectedMarker, content, frame.selectedDetailId, frame, 1.08);
}

function updateScalarTransitions(
  content: GardenContent,
  deltaSeconds: number,
  reducedMotion: boolean,
): void {
  const alpha = reducedMotion
    ? 1
    : 1 - Math.exp(
        -MathUtils.clamp(deltaSeconds, 0, 0.25) / GARDEN_SCALAR_TRANSITION_SECONDS,
      );
  for (let index = content.scalarTransitions.length - 1; index >= 0; index -= 1) {
    const transition = content.scalarTransitions[index]!;
    if (!transition.active && !reducedMotion) continue;
    transition.mix += (1 - transition.mix) * alpha;
    if (transition.mix > 0.999) transition.mix = 1;
    setScalarMaterialMix(transition.outgoing, 1 - transition.mix);
    setScalarMaterialMix(transition.incoming, transition.mix);
    if (transition.mix < 1) continue;
    for (const state of transition.incoming) {
      state.material.opacity = state.opacity;
      state.material.transparent = state.transparent;
      state.material.depthWrite = state.depthWrite;
    }
    transition.outgoingRoot.removeFromParent();
    disposeThreeObjectTree(transition.outgoingRoot);
    content.scalarTransitions.splice(index, 1);
  }
  for (let index = content.dockAccentTransitions.length - 1; index >= 0; index -= 1) {
    const transition = content.dockAccentTransitions[index]!;
    if (!transition.active && !reducedMotion) continue;
    transition.color.lerp(transition.target, alpha);
    content.harborBatch?.setDockAccent(transition.chainId, transition.color);
    const distance = Math.max(
      Math.abs(transition.color.r - transition.target.r),
      Math.abs(transition.color.g - transition.target.g),
      Math.abs(transition.color.b - transition.target.b),
    );
    if (distance > 0.001) continue;
    transition.color.copy(transition.target);
    content.harborBatch?.setDockAccent(transition.chainId, transition.target);
    content.dockAccentTransitions.splice(index, 1);
  }
}

// View geometry is derived only here, from the shared projection contract:
// the W1.0 pose (rig, rest ShotSpec or their hand-off blend) with the K16
// breath the frame's camera state carries — the same view hit-testing reads.
function updateCamera(camera: PerspectiveCamera, frame: ThreeWorldRendererFrame): void {
  const viewport = { x: frame.width, y: frame.height };
  const view = cameraView(frame.camera, viewport);
  // W3.10: the whole-map chart's plate edge dissolves in the Sky lane's haze.
  setGardenAerialPlateHaze(cameraPlateHaze(frame.camera, viewport));
  // K17: the arrival's air veil thins with the eye's rise (1 outside the arrival).
  setGardenAerialVeil(frame.airVeil ?? 1);
  camera.aspect = frame.width / Math.max(1, frame.height);
  camera.fov = view.vFovDeg;
  camera.position.set(view.eye.x, view.eye.y, view.eye.z);
  camera.lookAt(view.target.x, view.target.y, view.target.z);
  cameraViewTarget.set(view.target.x, view.target.y, view.target.z);
  cameraViewHeight = 2 * Math.hypot(view.eye.x - view.target.x, view.eye.y - view.target.y, view.eye.z - view.target.z)
    * Math.tan(view.vFovDeg * Math.PI / 360);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  captureGardenShadowView(camera);
}

/** Live eye − unbreathed rest eye: the threshold's breath + hand-off offset. */
const gardenThresholdEyeOffset = new Vector3();
const gardenThresholdShadowBounds = new Box3();

/**
 * W1.5: the threshold is the ground under the rest seat, so it is shown only
 * while the rest pose is present and rides the eye's offset from that
 * viewport's unbreathed rest eye; the corner composition then holds through
 * breath and the hand-off. Reduced motion holds the breath at 0, so the
 * offset is 0 and the threshold sits exactly at the seat.
 */
function updateGardenThreshold(
  scene: GardenScene,
  camera: PerspectiveCamera,
  frame: ThreeWorldRendererFrame,
  weather: WeatherPlan,
): void {
  const threshold = scene.content?.threshold;
  if (!threshold) return;
  const rest = frame.camera.rest;
  const show = rest !== undefined && rest.presence > 0;
  if (threshold.root.visible !== show) {
    threshold.root.visible = show;
    scene.shadowNeedsRender = true;
  }
  if (!rest || !show) return;
  gardenThresholdEyeOffset.set(
    camera.position.x - rest.view.eye.x,
    camera.position.y - rest.view.eye.y,
    camera.position.z - rest.view.eye.z,
  );
  threshold.setEyeOffset(gardenThresholdEyeOffset.x, gardenThresholdEyeOffset.y, gardenThresholdEyeOffset.z);
  threshold.updateWind(weather, frame.reducedMotion);
}

/** The shown threshold's caster/receiver bounds at its current placement, else null. */
function visibleGardenThresholdShadowBounds(content: GardenContent | null): Box3 | null {
  const threshold = content?.threshold;
  if (!threshold?.root.visible) return null;
  return gardenThresholdShadowBounds.copy(threshold.shadowBounds).translate(gardenThresholdEyeOffset);
}

function updateSelectedRoute(content: GardenContent, frame: ThreeWorldRendererFrame): void {
  const selectedShip = frame.selectedDetailId
    ? content.ships.find((entry) => entry.ship.detailId === frame.selectedDetailId)
    : undefined;
  // The sample carries the exact path its transit follows, so a W1.6
  // crossing-token arrival draws its inlet crossing, not the routed leg.
  const path = selectedShip ? frame.shipMotionSamples.get(selectedShip.ship.id)?.routePath ?? null : null;
  const nextKey = selectedShip && path
    ? `${selectedShip.ship.id}|${selectedShip.displayOffset.x},${selectedShip.displayOffset.y}`
    : null;
  if (nextKey !== content.routeLineKey || path !== content.routeLinePath) {
    content.routeLine.geometry.dispose();
    content.routeLine.geometry = path
      ? new BufferGeometry().setFromPoints(path.points.map((point) => {
        const displayTile = resolveGardenShipDisplayTile({
          displayOffset: selectedShip!.displayOffset,
          representative: selectedShip!.representative,
          sample: { tile: point },
          ship: selectedShip!.ship,
        });
        return new Vector3(
          displayTile.x * TILE_SCALE,
          WATER_LEVEL + 0.12,
          displayTile.y * TILE_SCALE,
        );
      }))
      : new BufferGeometry();
    content.routeLineKey = nextKey;
    content.routeLinePath = path;
  }
  content.routeLine.visible = path !== null;
}

function updateCueMarker(
  marker: ReturnType<typeof createGardenCueMarker>,
  content: GardenContent,
  detailId: string | null,
  frame: ThreeWorldRendererFrame,
  pulseScale: number,
): void {
  const cue = detailId ? content.entityCues.get(detailId) : undefined;
  if (!cue) {
    marker.visible = false;
    return;
  }
  cue.root.getWorldPosition(scratchPosition);
  marker.position.set(scratchPosition.x, scratchPosition.y + cue.y, scratchPosition.z);
  const pulse = frame.reducedMotion
    ? 1
    : 1 + Math.sin(frame.timeSeconds * 2.1) * 0.06;
  marker.scale.setScalar(cue.radius * pulse * pulseScale);
  marker.visible = true;
}
