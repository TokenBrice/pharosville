import {
  AgXToneMapping,
  AmbientLight,
  BufferGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PCFSoftShadowMap,
  PointLight,
  Quaternion,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import type {
  CreateThreeWorldRendererInput,
  ThreeWorldRenderer,
  ThreeWorldRendererFrame,
  ThreeWorldRendererMetrics,
} from "../renderer/world-renderer-backend";
import type { PharosVilleRenderSchedulerTier } from "../renderer/render-types";
import { seaQualityTier } from "../renderer/render-scheduler";
import {
  GARDEN_HULL_SILHOUETTES,
  GARDEN_LIGHTHOUSE_BEACON_Y,
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
  GARDEN_SHIP_ROOT_Y,
  GARDEN_WATER_Y as WATER_LEVEL,
  gardenCameraViewHeight,
  gardenDockDisplayTile,
  gardenIslandDisplayTile,
  gardenSemanticView,
  resolveGardenShipDisplayTile,
  selectGardenDocks,
  selectGardenObservatorySlice,
  selectGardenTransientShip,
} from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE, zoneThemeForTerrain } from "../systems/palette";
import { screenToTile } from "../systems/projection";
import type { PharosVilleWorld } from "../systems/world-types";
import {
  worldRenderContentPartHashes,
  worldRenderContentSignature,
} from "../systems/world-render-content-signature";
import {
  createGardenCemetery,
  createGardenPigeonnier,
} from "./garden-landmarks";
import {
  createGardenFireflies,
  createGardenGullFlock,
  createGardenHarborDistricts,
  type GardenFireflies,
  type GardenGullFlock,
} from "./garden-harbor-life";
import { createGardenHorizon, type GardenHorizon } from "./garden-horizon";
import { createGardenSeaSigns, type GardenSeaSigns, type SeaSignSpec } from "./garden-sea-signs";
import { SEA_BODY_TERRAIN, seaBodyForArea } from "../systems/sea-bodies";
import { createGardenIslets, type GardenIslets } from "./garden-islets";
import {
  createGardenHeroReflections,
  type GardenHeroReflections,
} from "./garden-hero-reflections";
import {
  createGardenShipGulls,
  GARDEN_GULL_SHIP_COUNT,
  type GardenShipGulls,
} from "./garden-ship-gulls";
import {
  createGardenOverviewLod,
  type GardenOverviewLod,
} from "./garden-overview-lod";
import { createGardenModelLibrary } from "./garden-models";
import { createGardenWater, type GardenWater } from "./garden-water";
import type { GardenCloudShadowSource } from "./garden-water-contract";
import { dayCyclePhase, updateDayCycle, type DayCyclePhase } from "./garden-day-cycle";
import { createGardenSky, type GardenSky } from "./garden-sky";
import { createGardenEnvironment, type GardenEnvironment } from "./garden-environment";
import { createGardenCueMarker } from "./garden-cue-marker";
import { createGardenPost } from "./garden-post";
import {
  createDock,
  createHarborLanterns,
  gardenDockLampWorldPositions,
  type DockVisual,
} from "./garden-docks";
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
  createGardenTideLine,
  type GardenTideLine,
} from "./garden-tide-line";
import {
  createGardenLaneRegistry,
  type GardenLaneRegistry,
} from "./garden-lanterns";
import { CEMETERY_CENTER } from "../systems/world-layout";
import {
  createTerracedIsland,
  createWaterAccents,
  gardenIslandLanternWorldOffsets,
} from "./garden-island";
import {
  applyLighthouseRimLight,
  attachGardenLighthouseModel,
  updateLighthouseRimLight,
} from "./garden-lighthouse";
import { createGardenBeaconFire, type GardenBeaconFire } from "./garden-beacon-fire";
import { createGardenSignalMast, type GardenSignalMast } from "./garden-signal-mast";
import {
  createGardenCrossBearingBuoys,
  type CrossBearingBuoySpec,
  type GardenCrossBearingBuoys,
} from "./garden-cross-bearing-buoys";
import { createGardenTideStain, type GardenTideStain } from "./garden-tide-stain";
import { beamBearingTo, beamDwellRateScale, beamStaticBearing } from "./garden-beam-dwell";
import {
  createGardenSummitBirds,
  type GardenSummitBirds,
} from "./garden-summit-birds";
import {
  attachGardenHeroModel,
  createBatchedShip,
  createFleetBatchGeometry,
  createFleetLanterns,
  createPennantGeometry,
  createShip,
  createShipShadows,
  gardenShipMastheadOffset,
  gardenShipSailFurl,
  gardenShipUsesHeroModel,
  syncShipRippleRings,
  syncShipSailTextures,
  updateFleetLanterns,
  updateShipPennants,
  type FleetLanterns,
  type ShipVisual,
} from "./garden-ships";
import {
  beginFleetFrame,
  createFleetBatches,
  disposeFleetBatches,
  endFleetFrame,
  fleetDrawCallCount,
  GARDEN_FLEET_BATCH_CAPACITY,
  writeFleetInstance,
  type FleetBatches,
} from "./garden-fleet-batch";
import {
  assignGardenSailAtlasCells,
  createGardenSailAtlas,
  gardenSailAtlasCell,
  syncGardenSailAtlas,
  type GardenSailAtlas,
} from "./garden-sail-atlas";
import {
  countDrawableObjects,
  disposeThreeObjectTree,
  normalizedHeading,
  setTilePosition,
  stableUnit,
  TILE_SCALE,
  type GardenShipGeometryCache,
} from "./garden-util";
import {
  createDangerWeather,
  createZone,
  createZoneField,
  updateDangerWeather,
  updateZoneBuoys,
  type GardenWeatherVisual,
  type ZoneField,
  type ZoneVisual,
} from "./garden-zones";

export { disposeThreeObjectTree } from "./garden-util";

const MAX_THREE_DPR = 2;
const CAMERA_DISTANCE = 110;
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

const scratchMatrix = new Matrix4();
const scratchPosition = new Vector3();
// R8: reused per-frame scratch for the oriented ship contact shadow.
const scratchShadowPosition = new Vector3();
const scratchShadowScale = new Vector3();
const scratchShadowQuaternion = new Quaternion();
const SHADOW_UP = new Vector3(0, 1, 0);
// W6.4: the hull tint handed to a reflection instance, blended per frame.
const scratchReflectionColor = new Color();
// Reused argument records for the per-frame update calls below. Every callee
// destructures its input on entry and keeps nothing, so one record per call
// site is enough to keep the frame path free of the object literals it would
// otherwise mint — one per flock and mast per frame, and one per hero hull.
const scratchAmbientFrame = { reducedMotion: false, timeSeconds: 0, visible: false };
const scratchOverviewLodFrame = { deltaSeconds: 0, reducedMotion: false, zoom: 1 };
const scratchReflectionPlacement = {
  color: scratchReflectionColor,
  index: 0,
  mastheadHeight: 0,
  strength: 0,
  tileX: 0,
  tileY: 0,
  width: 0,
  worldX: 0,
  worldZ: 0,
};

export function createThreeWorldRenderer(input: CreateThreeWorldRendererInput): ThreeWorldRenderer {
  const { canvas, onAssetReady, onContextFailure } = input;
  const modelLibrary = createGardenModelLibrary();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
  // The renderer is built before the scene now: W6.5's sky probe bakes THROUGH
  // the renderer, so the scene cannot be assembled without one. Nothing in
  // `createGardenScene` reads renderer state, so the swap is order-only.
  const renderer = new WebGLRenderer({
    alpha: false,
    antialias: true,
    canvas,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = AgXToneMapping;
  renderer.toneMappingExposure = 1.12;
  // D3: soft island-only shadows. Shadow support is compiled once (enabled +
  // castShadow stay on); per-tier cost is driven at runtime via shadow.intensity
  // and mapSize (see updateShadows), which avoids material recompile stalls.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  // See the reset in `render` — the frame's totals are accumulated by hand
  // so the composer's passes do not clobber the scene's counts.
  renderer.info.autoReset = false;
  const scene = createGardenScene(renderer);
  const post = createGardenPost(renderer, scene.root, camera);

  let disposed = false;
  let lastDpr = 0;
  let lastHeight = 0;
  let lastWidth = 0;
  // C4: best scheduler tier reached this session (debug evidence surface).
  let sessionTierReached: PharosVilleRenderSchedulerTier = "constrained";
  let contentReplacementCount = 0;
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
    contextRestoreTimeoutId = setTimeout(() => {
      if (!contextLost || disposed) return;
      onContextFailure("The 3D rendering context was lost and could not be restored.");
    }, CONTEXT_RESTORE_GRACE_MS) as unknown as number;
  };
  const handleContextRestored = () => {
    if (!contextLost) return;
    contextLost = false;
    clearTimeout(contextRestoreTimeoutId);
    // The GPU-side surface is new: re-apply the size/pixel-ratio the renderer
    // thinks it already has, and re-render the static shadow map, which is
    // only written when `shadowNeedsRender` asks for it.
    lastDpr = 0;
    lastWidth = 0;
    lastHeight = 0;
    scene.shadowNeedsRender = true;
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
      // The GLB shell replaces the procedural one — refresh the shadow map.
      scene.shadowNeedsRender = true;
      onAssetReady?.();
    })
    .catch(() => {
      // The procedural shell is the intentional asset failure fallback.
    });

  // Titan/unique ships get bespoke hero GLB hulls once loaded. Each attach is
  // per-content: a clone that resolves after the world has moved on is dropped
  // (it still shares the cached geometry, so it must not be disposed).
  const loadHeroesForContent = (content: GardenContent | null): void => {
    if (!content) return;
    for (const visual of content.ships) {
      if (visual.heroModelId === null) continue;
      void modelLibrary.clone(visual.heroModelId)
        .then((model) => {
          if (disposed || scene.content !== content) return;
          attachGardenHeroModel(visual, model);
          // Ships move independently of the static island shadow map and own
          // their water-contact shadows. Keeping hero hulls out of the
          // directional pass avoids both a frozen shadow ghost and a full
          // island shadow redraw after every async hero attachment.
          onAssetReady?.();
        })
        .catch(() => {
          // The procedural hull stays visible — the asset-failure fallback.
        });
    }
  };

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(contextRestoreTimeoutId);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      canvas.removeEventListener("webglcontextcreationerror", handleContextCreationError);
      const detachedModel = scene.lighthouseModel?.parent ? null : scene.lighthouseModel;
      post.dispose();
      // Owns a live PMREM render target; the generic tree walk cannot see it
      // because it hangs off `Scene.environment`, not off a child.
      scene.environment.dispose();
      scene.laneRegistry.dispose();
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

      // W6.5: rebake the sky probe BEFORE the counters are reset, deliberately.
      //
      // A PMREM bake is a six-face cube render plus a mip chain, and this
      // renderer accumulates `renderer.info` by hand for the whole frame. Baking
      // after the reset would have added those passes to the frame's draw-call
      // total, so the frames that happen to cross a day-cycle step would report
      // a spike against the 700-call budget that has nothing to do with the
      // world being drawn. Baking here keeps the budget a measurement of the
      // scene. It costs nothing on the vast majority of frames, which do not
      // bake at all.
      const phase = dayCyclePhase(frame.wallClockHour);
      // Grade the dome for THIS phase before the probe reads it. The probe
      // renders `sky.domeMaterial` itself and caches the result under the phase
      // key, but the full sky update does not run until `updateSceneForFrame`
      // below — so without this the first bake of a session rendered the NIGHT
      // colours the uniforms are constructed with, stored them under a daytime
      // key, and lit every metal surface in the world with a night probe for as
      // long as that key held. At midday the key never moves again.
      scene.sky.applyPhase(phase);
      scene.environment.update(phase);

      // `renderer.info` auto-resets on every `render()` call, and the post
      // composer issues several. Reading it after `post.render()` therefore
      // reported only the final full-screen quad — calls: 1, triangles: 1 —
      // which silently made the D7 GPU budgets in the perf spec vacuous: they
      // were passing against a measurement of nothing.
      //
      // Manual reset here, with autoReset off at construction, accumulates
      // every pass of the frame into one honest total.
      renderer.info.reset();
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

      const transientSelectedDetailId = selectGardenTransientShip(
        frame.world,
        frame.selectedDetailId,
      )?.detailId ?? null;
      const contentSignature = worldRenderContentSignature(frame.world);
      if (
        scene.contentSignature !== contentSignature
        || scene.content?.transientSelectedDetailId !== transientSelectedDetailId
      ) {
        replaceWorldContent(scene, frame.world, frame.selectedDetailId);
        contentReplacementCount += 1;
        loadHeroesForContent(scene.content);
      } else {
        // The scene graph can stay, but frame-time semantic consumers must see
        // the latest world object (motion, sea state, hit targets, and DOM all
        // continue updating independently of baked GPU content).
        scene.world = frame.world;
      }
      if (scene.content) syncShipSailTextures(scene.content, frame);
      updateSceneForFrame(scene, camera, frame, phase);

      const tier = frame.renderScheduler.tier;
      if (SESSION_TIER_QUALITY[tier] > SESSION_TIER_QUALITY[sessionTierReached]) {
        sessionTierReached = tier;
      }
      const shadowMapSize = updateShadows(scene, frame);
      // The composer owns the frame's COLOR — AgX tone mapping moves into
      // OutputPass, and the day-cycle grade and vignette exist nowhere else —
      // so shedding it is not a quality step down, it is a different picture.
      // Crossing the `constrained` boundary swung the frame's brightness and
      // dropped the vignette outright, and because a zoom gesture flaps the
      // scheduler across that boundary repeatedly the whole view flickered
      // under the wheel. The grade and output passes are one full-screen quad
      // each; only the bloom pyramid's cost scales, so only bloom is shed.
      post.setEnabled(true);
      // W6.3: bloom runs at half resolution (see BLOOM_RESOLUTION_SCALE), so
      // it survives `recovery` — the warm beacon and lantern glow are the
      // night identity, and shedding them at the tier this machine usually
      // sits in meant they were almost never seen. `constrained` means the
      // machine is genuinely drowning, and a five-level mip pyramid is the
      // one pass worth the pop.
      post.setBloomEnabled(tier !== "constrained");
      post.setGrade(phase.daylight, phase.dusk);
      post.render();

      const content = scene.content;
      const renderInfo = renderer.info.render;
      const programCount = renderer.info.programs?.length ?? 0;
      const geometryCount = renderer.info.memory.geometries;
      const textureCount = renderer.info.memory.textures;
      lastMetrics = {
        gpuWarmupCount: Math.max(0, programCount - programsBefore)
          + Math.max(0, geometryCount - geometriesBefore)
          + Math.max(0, textureCount - texturesBefore),
        activeLaneCount: scene.laneRegistry.activeLaneCount,
        contentReplacementCount,
        contentSignaturePartHashes: worldRenderContentPartHashes(frame.world),
        composerEnabled: post.isComposerEnabled(),
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
          calls: renderInfo.calls,
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
        rendererBackend: "three",
        schedulerTier: frame.renderScheduler.tier,
        visibleShipCount: content?.visibleShipCount ?? 0,
      };
      return lastMetrics;
    },
  };
}

/** Zeroed metrics for frames that never reached the GPU (context lost). */
function emptyWorldRendererMetrics(): ThreeWorldRendererMetrics {
  return {
    gpu: { calls: 0, geometries: 0, lines: 0, points: 0, programs: 0, textures: 0, triangles: 0 },
    gpuWarmupCount: 0,
    movingShipCount: 0,
    objectCount: 0,
    rendererBackend: "three",
    visibleShipCount: 0,
  };
}

interface GardenScene {
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
  content: GardenContent | null;
  contentSignature: string | null;
  directionalLight: DirectionalLight;
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
  shadowActiveSize: number;
  shadowNeedsRender: boolean;
  sky: GardenSky;
  water: GardenWater;
  waterAccents: Group;
  world: PharosVilleWorld | null;
}

interface GardenContent {
  logoGenerationKey: string | null;
  beacon: Mesh<SphereGeometry, MeshStandardMaterial>;
  beaconFire: GardenBeaconFire;
  beaconFireRoot: Group;
  beaconHalo: Mesh<SphereGeometry, MeshBasicMaterial>;
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
   * Entirely static — direction and magnitude are composed into the crates'
   * positions at build, so there is nothing for the frame loop to do.
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
  /**
   * Task 14: the weekly supply tide, as one banded plate per quay in a single
   * instanced draw. Static — the strandline is composed into the plate's vertex
   * colours, so the frame loop never touches it.
   */
  tideLine: GardenTideLine;
  decoration: Group;
  docks: DockVisual[];
  objectCount: number;
  entityCues: Map<string, EntityCue>;
  /** W1: the shared instanced fleet. Drawn instead of per-ship meshes. */
  fleetBatches: FleetBatches;
  fleetLanterns: FleetLanterns;
  fleetSailMaterial: MeshStandardMaterial | null;
  sailAtlas: GardenSailAtlas;
  harborLanternMaterial: MeshStandardMaterial;
  fireflies: GardenFireflies;
  gullFlock: GardenGullFlock;
  /** W6.4: one instanced draw call carrying every hero hull's mirror column. */
  heroReflections: GardenHeroReflections;
  /** The hulls that carry a reflection, in the reflection instances' order. */
  heroReflectionShips: ShipVisual[];
  /** Gulls over the three largest hulls; parented to those hulls' own roots. */
  shipGulls: GardenShipGulls;
  lighthouseLight: PointLight;
  lighthouseRoot: Group;
  lighthouseShell: Group;
  /** Tier 3 #15: sheds the props that cannot read at whole-map framing. */
  overviewLod: GardenOverviewLod;
  root: Group;
  routeLine: Line<BufferGeometry, LineBasicMaterial>;
  routeLineKey: string | null;
  shipLanternGlowMaterial: MeshBasicMaterial;
  shipLanternMaterial: MeshStandardMaterial;
  shipShadows: InstancedMesh<CircleGeometry, MeshBasicMaterial>;
  ships: ShipVisual[];
  signalMast: GardenSignalMast;
  statueGleamMaterials: MeshStandardMaterial[];
  tideStain: GardenTideStain;
  summitBirds: GardenSummitBirds;
  summitBirdsRoot: Group;
  transientSelectedDetailId: string | null;
  visibleShipCount: number;
  weather: GardenWeatherVisual[];
  seaSigns: GardenSeaSigns;
  zoneField: ZoneField;
  zones: ZoneVisual[];
}

interface EntityCue {
  radius: number;
  root: Object3D;
  y: number;
}

function createGardenScene(renderer: WebGLRenderer): GardenScene {
  const root = new Scene();
  const sky = createGardenSky();
  root.fog = sky.fog;

  const hemisphereLight = new HemisphereLight("#d7ece6", "#31483f", 1.15);
  root.add(hemisphereLight);
  const ambientLight = new AmbientLight("#fff0d1", 0.42);
  root.add(ambientLight);
  const directionalLight = new DirectionalLight("#ffe8b5", 2.3);
  // P4: day key sun lowered from y=55 to y=48 (elevation ~50°→46°) for longer
  // soft shadows. The 34-unit Pharos crown shadow reaches
  // 34·√(35²+30²)/48 ≈ 32.7 units along the ground from the island center —
  // ≈ 24 units once projected into the light's view plane, still inside the
  // ±30 shadow frustum below.
  directionalLight.position.set(-35, 48, -30);
  // Tight ortho frustum fitted to the island plus the L1 tower's long day
  // shadow (~60-unit box — the 34-unit crown would clip at the old ±22);
  // updateShadows re-centres it on the island each frame and toggles cost
  // per tier.
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.set(1024, 1024);
  directionalLight.shadow.bias = -0.0005;
  directionalLight.shadow.normalBias = 0.8;
  const shadowCamera = directionalLight.shadow.camera;
  shadowCamera.left = -30;
  shadowCamera.right = 30;
  shadowCamera.top = 30;
  shadowCamera.bottom = -30;
  shadowCamera.near = 1;
  shadowCamera.far = 140;
  shadowCamera.updateProjectionMatrix();
  root.add(directionalLight);

  // A single oversized surface plus same-color fog/background keeps the sea
  // full-bleed under pan and zoom without visible plane or sky seams.
  const water = createGardenWater(WATER_LEVEL);
  root.add(water.mesh);

  // Shared warm-light lane registry: the water shader samples its packed
  // DataTexture to lay reflection pools for the beacon, harbor lanterns, and
  // dock lamps. The registry owns the per-tier lane cap.
  const laneRegistry = createGardenLaneRegistry();

  const waterAccents = createWaterAccents();
  root.add(waterAccents);

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

  return {
    ambientLight,
    beamAngle: 0,
    beamClockSeconds: 0,
    content: null,
    contentSignature: null,
    directionalLight,
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
    shadowActiveSize: 0,
    shadowNeedsRender: true,
    sky,
    water,
    waterAccents,
    world: null,
  };
}

function replaceWorldContent(
  scene: GardenScene,
  world: PharosVilleWorld,
  selectedDetailId: string | null,
): void {
  if (scene.content) {
    scene.lighthouseModel?.removeFromParent();
    scene.root.remove(scene.content.root);
    // W1: the batches own merged geometry and the atlas texture, neither of
    // which the generic tree walk should double-dispose — release them
    // explicitly first, then let the walk take the rest of the content.
    disposeFleetBatches(scene.content.fleetBatches);
    scene.content.sailAtlas.dispose();
    scene.content.seaSigns.dispose();
    disposeThreeObjectTree(scene.content.root);
  }
  scene.content = createWorldContent(world, selectedDetailId, scene.water.cloudShadows);
  scene.contentSignature = worldRenderContentSignature(world);
  scene.root.add(scene.content.root);
  attachGardenLighthouseModel(scene.lighthouseModel, scene.content);
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
  scene.water.setZoneState(scene.content.zones.map((zone) => zone.tint));
  registerHarborWater(scene, world);
  registerLightLanes(
    scene.laneRegistry,
    world,
    islandTile,
    scene.content.docks,
    scene.content.zones,
  );
  scene.world = world;
  // New island geometry — re-render the static shadow map on the next frame.
  scene.shadowNeedsRender = true;
}

/**
 * C2 wiring for the harbor: registers karesansui ripple rings (W5) on the
 * composed docks' pylons and hands Lane W's shader the mirror-basin extents
 * (I2) as a calm mask centred on those docks. Only the two representative
 * docks get rings so the island/islet default rings and Lane S's ship-mooring
 * rings keep headroom under GARDEN_WATER_MAX_RIPPLE_RINGS.
 */
function registerHarborWater(scene: GardenScene, world: PharosVilleWorld): void {
  const content = scene.content;
  if (!content) return;
  const harborDockIds = new Set(selectGardenDocks(world.docks).map((dock) => dock.detailId));
  const harborDocks = content.docks.filter((dock) => harborDockIds.has(dock.dock.detailId));
  if (harborDocks.length === 0) return;
  let centerX = 0;
  let centerZ = 0;
  for (const dock of harborDocks) {
    centerX += dock.root.position.x;
    centerZ += dock.root.position.z;
    scene.water.rippleRings.setRing({
      id: `dock-pylon.${dock.dock.detailId}`,
      center: { x: dock.root.position.x, z: dock.root.position.z },
      radius: 4.5,
      bands: 2,
      periodSeconds: 12,
      strength: 0.18,
    });
  }
  // L6: offset onto the lee water, not the dock centroid.
  //
  // Averaging up to ten harbours ringing the island lands on the ISLAND, so the
  // glassy, normal-flattened mirror basin sat on the rock and only its
  // overspill showed as a pale ring on the water. Pushing it south-east puts it
  // on the sheltered water the harbours actually open onto.
  const islandCenterX = centerX / harborDocks.length;
  const islandCenterZ = centerZ / harborDocks.length;
  scene.water.setHarborCalmMask({
    center: { x: islandCenterX + 13, z: islandCenterZ + 10 },
    radiusX: 13,
    radiusZ: 9,
    calmStrength: 0.7,
  });
}

/**
 * Registers every warm light that should lay a reflection pool on the sea. The
 * beacon keeps its own sweeping lane (water uBeacon* uniforms); these are the
 * omnidirectional pools. Lane world positions mirror the geometry each module
 * builds. The registry caps them per tier; callers register all of them.
 */
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
  // Ring of harbor lanterns around the island (mirrors createHarborLanterns).
  const islandX = islandTile.x * TILE_SCALE;
  const islandZ = islandTile.y * TILE_SCALE;
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2
      + stableUnit(`harbor-lantern-angle.${index}`) * 0.16;
    const radiusX = 22 + (index % 3) * 1.25;
    const radiusZ = 15.5 + (index % 2) * 1.15;
    registry.set({
      color: HARBOR_PALETTE.lantern_glow,
      id: `harbor-lantern.${index}`,
      intensity: 0.62,
      kind: "lantern",
      worldX: islandX + Math.cos(angle) * radiusX,
      worldZ: islandZ + Math.sin(angle) * radiusZ,
    });
  }
  for (const dock of docks) {
    for (const [lampIndex, lamp] of gardenDockLampWorldPositions(dock).entries()) {
      registry.set({
        color: HARBOR_PALETTE.lantern_glow,
        id: `dock-lamp.${dock.dock.detailId}.${lampIndex}`,
        intensity: lampIndex === 0 ? 0.7 : 0.42,
        kind: "lantern",
        worldX: lamp.x,
        worldZ: lamp.z,
      });
    }
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
    color: HARBOR_PALETTE.lantern_warm,
    id: "cemetery-lantern",
    intensity: 0.4,
    kind: "lantern",
    worldX: CEMETERY_CENTER.x * TILE_SCALE,
    worldZ: CEMETERY_CENTER.y * TILE_SCALE,
  });
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
}

function createWorldContent(
  world: PharosVilleWorld,
  selectedDetailId: string | null,
  // C2(c): Lane W's shared cloud-shadow sampler, forwarded to the island
  // factory (I3) so light weather sweeps the land coherently with the sea.
  cloudShadows: GardenCloudShadowSource,
): GardenContent {
  const root = new Group();
  const entityCues = new Map<string, EntityCue>();
  const slice = selectGardenObservatorySlice(world, selectedDetailId);
  const islandTile = gardenIslandDisplayTile(world.lighthouse.tile);

  const island = createTerracedIsland(world, cloudShadows);
  root.add(island.root);
  // Only the island stone/timber (and lighthouse, inside island.root) cast and
  // receive shadows. The flat MeshBasicMaterial shoal is excluded so its
  // transparent disc never stamps a hard shadow; ships/docks/zones get no flags.
  island.root.traverse((object) => {
    if (!(object instanceof Mesh) && !(object instanceof InstancedMesh)) return;
    const material = object.material;
    object.castShadow = Array.isArray(material)
      ? material.some((entry) => entry instanceof MeshStandardMaterial)
      : material instanceof MeshStandardMaterial;
    object.receiveShadow = true;
  });
  entityCues.set(world.lighthouse.detailId, {
    // Pharos Wonder D1: scaled for the 34-unit three-tier tower (was 4.5 for
    // the 30-unit v3 shell) so the selection ring spans the battered square
    // base and its terrace steps.
    radius: 5.2,
    root: island.lighthouseRoot,
    y: 0.12,
  });

  // W4: the living fire at the brazier. The smoke samples the SAME cloud-noise
  // texture object the water shader binds (C2(c) source), so one noise field
  // serves sea, land, and sky. W7: the summit bird flock. Both roots anchor
  // at the beacon and are re-anchored by attachGardenLighthouseModel.
  const beaconFire = createGardenBeaconFire(cloudShadows.texture);
  beaconFire.root.position.set(0, GARDEN_LIGHTHOUSE_BEACON_Y, 0);
  island.lighthouseRoot.add(beaconFire.root);
  const summitBirds = createGardenSummitBirds();
  summitBirds.root.position.set(0, GARDEN_LIGHTHOUSE_BEACON_Y, 0);
  island.lighthouseRoot.add(summitBirds.root);
  // W7 rim light, chained onto the I3 cloud-shadow hook (already applied
  // inside createTerracedIsland) — compose, never clobber.
  applyLighthouseRimLight(island.lighthouseRoot);
  // The procedural shell's gilt is per-content (fresh materials each world),
  // so the statue gleam can drive it directly; the GLB path clones first.
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

  // 3c: the high-water mark, banded onto the tower's own terrace steps. It
  // rides `lighthouseRoot` rather than the island so it stays with the tower
  // whether the procedural shell or the loaded GLB is standing — both are
  // parented there and both were cut to `LIGHTHOUSE_TERRACE_STEPS`.
  const tideStain = createGardenTideStain();
  tideStain.setMark(world.lighthouse.highWaterMark?.severity ?? null);
  island.lighthouseRoot.add(tideStain.root);

  const cemetery = createGardenCemetery(world.graves);
  const pigeonnier = createGardenPigeonnier(world.pigeonnier);
  root.add(cemetery.root, pigeonnier.root);
  for (const [detailId, anchor] of cemetery.anchors) {
    entityCues.set(detailId, {
      radius: anchor.userData.selectionRadius,
      root: anchor,
      y: 0.08,
    });
  }
  entityCues.set(world.pigeonnier.detailId, {
    radius: pigeonnier.anchor.userData.selectionRadius,
    root: pigeonnier.anchor,
    y: 0.08,
  });

  const zones = world.areas.map((area) => createZone(area));
  for (const zone of zones) {
    root.add(zone.root);
    // Zones-v2 review: the selection ring tracks the zone's base radius
    // (tint.radiusX / ELLIPSE_X=1.25 → ×0.8), not the old hardcoded 5.2, so
    // the cue scales with the recomposed per-band zone bodies (~7–50 units).
    entityCues.set(zone.area.detailId, {
      radius: zone.tint.radiusX * 0.8,
      root: zone.root,
      y: 0.08,
    });
  }
  const zoneField = createZoneField(zones);
  root.add(zoneField.root);
  // N (Sea Master): the sea's place-names, as carved boards standing in the
  // water. Copy comes from the same area records the detail panels read, so
  // the two surfaces cannot drift.
  const seaSigns = createGardenSeaSigns(seaSignSpecs(world.areas));
  root.add(seaSigns.root);
  const weather = world.areas
    .filter((area) => area.band === "DANGER")
    .map((area) => createDangerWeather(area));
  for (const effect of weather) root.add(effect.root);

  const docks = world.docks.map((dock) => (
    createDock(dock, gardenDockDisplayTile(dock.tile), islandTile)
  ));
  const harborDistricts = createGardenHarborDistricts(
    world.docks,
    world.lighthouse.tile,
  );
  root.add(harborDistricts.root);
  for (const dock of docks) {
    root.add(dock.root);
    entityCues.set(dock.dock.detailId, { radius: 2.5, root: dock.root, y: 0.08 });
  }
  // Tier 3 #3: the world's first FLOW cue. Built after the harbours are placed
  // because each crate's berth is a harbour-local slot resolved through that
  // harbour's own yaw and position — one mesh for the ring, not one per quay.
  const cargoTide = createGardenCargoTide(cargoTideSpecs(docks));
  root.add(cargoTide.root);
  // The tide is one global reading, so every quay's plate is identical and the
  // whole ring shares one geometry — see garden-tide-line.ts.
  const tideLine = createGardenTideLine(
    docks.map((visual) => ({
      detailId: visual.dock.detailId,
      width: visual.tideFace.width,
      x: visual.root.position.x + visual.tideFace.x * Math.cos(visual.root.rotation.y)
        + visual.tideFace.z * Math.sin(visual.root.rotation.y),
      y: visual.root.position.y + visual.tideFace.y,
      yaw: visual.root.rotation.y,
      z: visual.root.position.z - visual.tideFace.x * Math.sin(visual.root.rotation.y)
        + visual.tideFace.z * Math.cos(visual.root.rotation.y),
    })),
    world.supplyTide,
  );
  root.add(tideLine.root);
  const harborLanterns = createHarborLanterns(islandTile);
  // The flock works the quays as well as the island, so it needs the same dock
  // list the harbour districts got — that is what carries harbour tempo.
  const gullFlock = createGardenGullFlock(world.lighthouse.tile, {
    docks: world.docks,
  });
  const fireflies = createGardenFireflies(
    gardenIslandLanternWorldOffsets(),
    islandTile,
  );
  root.add(harborLanterns.root, gullFlock.root, fireflies.root);

  const shipGeometryCache: GardenShipGeometryCache = {
    geometries: new Map(),
    wakeFillMaterial: new MeshBasicMaterial({
      color: HARBOR_PALETTE.foam_white,
      depthWrite: false,
      opacity: 0.08,
      side: DoubleSide,
      transparent: true,
    }),
    wakeMaterial: new LineBasicMaterial({
      color: HARBOR_PALETTE.foam_white,
      depthWrite: false,
      opacity: 0.38,
      transparent: true,
    }),
  };
  // W1 (decision D2): the fleet splits in two. Hero ships (titans and uniques,
  // ~18 of ~205) keep their own scene graph because a bespoke GLB hull, the
  // grade shield and the identity sail all need real meshes — they are also
  // the ships the eye actually lands on. Everything else is drawn from the
  // shared instanced batches at 9 draw calls total, however many there are.
  const sailAtlas = createGardenSailAtlas();
  // Cells are assigned now (the batch needs them at construction); the paint
  // pass runs from the frame loop once logos resolve.
  assignGardenSailAtlasCells(sailAtlas, slice.ships.map(({ ship }) => ship));

  const ships = slice.ships.map(({ displayOffset, representative, ship }) => (
    gardenShipUsesHeroModel(ship)
      ? createShip(ship, displayOffset, representative, shipGeometryCache)
      : createBatchedShip(
          ship,
          displayOffset,
          representative,
          shipGeometryCache,
          gardenSailAtlasCell(sailAtlas, ship),
        )
  ));

  const fleetBatches = createFleetBatches({
    cache: shipGeometryCache,
    // Grow-only capacity with headroom over the ~205-ship world, so a data
    // refresh never reallocates instance buffers (D1).
    capacity: GARDEN_FLEET_BATCH_CAPACITY,
    geometryFor: (silhouette) => createFleetBatchGeometry(silhouette),
    pennantGeometry: createPennantGeometry(),
    sailTexture: sailAtlas.texture,
    silhouettes: GARDEN_HULL_SILHOUETTES,
  });
  root.add(fleetBatches.root);

  const shipShadows = createShipShadows(ships.length);
  root.add(shipShadows);
  for (const ship of ships) {
    // Batched roots carry no drawable children — they exist so entity cues,
    // follow-selected, the wake and the lane registry keep the same anchor
    // they had when every ship owned its meshes.
    root.add(ship.root);
    entityCues.set(ship.ship.detailId, {
      radius: ship.selectionRadius,
      root: ship.root,
      y: -ship.root.position.y + 0.08,
    });
  }
  // Fleet-wide lantern instances (two shared draw calls); positions are driven
  // per frame from each ship's world transform in the ship loop.
  const fleetLanterns = createFleetLanterns(ships, shipGeometryCache);
  root.add(fleetLanterns.root);

  // 3d needs one ship's composed berth in world XZ to take a bearing on.
  // Resolved with a null motion sample, which is the berth before any patrol
  // displaces it — the same address `entityCues` and the lane registry use, and
  // a fixed one, so the beam holds a steady bearing instead of hunting the
  // hull around its circuit.
  const berthWorldXZ = (entry: typeof slice.ships[number]): { x: number; z: number } => {
    const tile = resolveGardenShipDisplayTile({
      displayOffset: entry.displayOffset,
      representative: entry.representative,
      sample: null,
      ship: entry.ship,
    });
    return { x: tile.x * TILE_SCALE, z: tile.y * TILE_SCALE };
  };

  // 3b: one buoy per ship whose two price bearings cross. `agrees === false` is
  // the ONLY state that moors one — an absent check leaves the water empty and
  // claims nothing, which is the whole point of the signal.
  //
  // The buoys ride WITH their hulls rather than sitting at the berth: a ship
  // patrols up to `GARDEN_MAX_MOTION_TILES` from its anchor, so a buoy nailed
  // to the berth would spend most of its time nowhere near the ship it is
  // describing, and a cue you cannot associate with its subject is not a cue.
  const buoyShips = ships.filter((visual) => visual.ship.dexCrossCheck?.agrees === false);
  const buoySpecs: CrossBearingBuoySpec[] = buoyShips.map((visual) => ({
    detailId: visual.ship.detailId,
    hullRadius: visual.selectionRadius,
  }));
  const crossBearingBuoys = createGardenCrossBearingBuoys(buoySpecs);
  root.add(crossBearingBuoys.root);

  // W6.4: the mirror column, extended from the Pharos to the fleet. Only the
  // hero hulls get one — they are the ships with a silhouette worth reflecting,
  // and the batched fleet is a shared instance whose per-ship colour lives in a
  // buffer rather than on a visual.
  const heroReflectionShips = ships.filter((visual) => !visual.batched);
  const heroReflections = createGardenHeroReflections(heroReflectionShips.length);
  root.add(heroReflections.mesh);

  // Gulls over the biggest hulls in the fleet. Ranked by the same market cap
  // the hull scale already encodes, so the traffic agrees with the size.
  const shipGulls = createGardenShipGulls(
    [...heroReflectionShips]
      .sort((left, right) => (right.ship.marketCapUsd ?? 0) - (left.ship.marketCapUsd ?? 0))
      .slice(0, GARDEN_GULL_SHIP_COUNT),
  );

  // Flight to quality: tenders making for the biggest hulls, for as long as the
  // mint/burn gauge reports capital concentrating into them. Ranked off the
  // whole fleet by the same market cap the hull scale already encodes, so the
  // boats gather where the eye already reads "largest". Built here, after the
  // hulls exist, because each flotilla's stand-off is scaled to its titan's own
  // footprint. `flightTenderTitans` returns nothing when the gauge is absent or
  // false, and a spec-less flotilla builds no mesh and costs no draw call.
  const flightTenderShips = flightTenderTitans(ships, world.fleetIssuance);
  const flightTenders = createGardenFlightTenders(
    flightTenderShips.map((visual) => ({
      hullRadius: visual.selectionRadius,
      shipId: visual.ship.id,
    })),
    world.fleetIssuance?.flightIntensity ?? 0,
  );
  root.add(flightTenders.root);

  // 3d: the bearing the beam will settle on. Null when the index named no
  // contributor, or when the coin it named is not in the rendered fleet — the
  // sweep then keeps the even turn it has always had.
  const dwellShipId = world.lighthouse.beamDwell?.shipId ?? null;
  const dwellEntry = dwellShipId === null
    ? undefined
    : slice.ships.find((entry) => entry.ship.id === dwellShipId);
  const beamDwellBearing = dwellEntry
    ? beamBearingTo(
        {
          x: islandTile.x * TILE_SCALE + GARDEN_LIGHTHOUSE_ROOT_OFFSET.x,
          z: islandTile.y * TILE_SCALE + GARDEN_LIGHTHOUSE_ROOT_OFFSET.z,
        },
        berthWorldXZ(dwellEntry),
      )
    : null;

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

  const objectCount = countDrawableObjects(root);
  // Scanned once, after the world is assembled and before anything animates:
  // the policy captures each shed prop's authored transform as its baseline.
  const overviewLod = createGardenOverviewLod(root);
  return {
    logoGenerationKey: null,
    beacon: island.beacon,
    beaconFire,
    beaconFireRoot: beaconFire.root,
    beaconHalo: island.beaconHalo,
    beam: island.beam,
    beamDwellBearing,
    cargoTide,
    flightTenders,
    flightTenderShips,
    tideLine,
    crossBearingBuoys,
    crossBearingBuoyShips: buoyShips,
    decoration: island.decoration,
    docks,
    objectCount,
    entityCues,
    fireflies,
    fleetBatches,
    fleetLanterns,
    fleetSailMaterial: fleetBatches.materials[1] ?? null,
    gullFlock,
    heroReflections,
    heroReflectionShips,
    shipGulls,
    sailAtlas,
    harborLanternMaterial: harborLanterns.lightMaterial,
    lighthouseLight: island.lighthouseLight,
    lighthouseRoot: island.lighthouseRoot,
    lighthouseShell: island.lighthouseShell,
    overviewLod,
    root,
    routeLine,
    routeLineKey: null,
    shipLanternGlowMaterial: fleetLanterns.glowMaterial,
    shipLanternMaterial: fleetLanterns.coreMaterial,
    shipShadows,
    ships,
    signalMast,
    statueGleamMaterials,
    tideStain,
    summitBirds,
    summitBirdsRoot: summitBirds.root,
    transientSelectedDetailId: slice.transientSelectedDetailId,
    visibleShipCount: ships.length,
    weather,
    seaSigns,
    zoneField,
    zones,
  };
}

/**
 * The boards to raise, and what they say.
 *
 * Every named body gets one — including Calm Anchorage and Ledger Mooring,
 * and the wreck shoals, which have no area record at all but are a place with
 * a name like any other. These boards are the sea's only place-name display;
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
  specs.push({
    body: "wreck",
    label: "Wreck Shoals",
    reading: null,
    accent: zoneThemeForTerrain("wreck-water").label.accent,
  });
  return specs;
}

/**
 * Re-centres the directional light's tight shadow frustum on the island and
 * sets the per-tier cost, returning the active shadow-map size (0 when off).
 * Shadow support stays compiled (enabled + castShadow never change); cost is
 * toggled via `shadow.intensity`/`autoUpdate` and the map is only reallocated
 * on a tier change, so no material recompile stalls occur.
 */
function updateShadows(scene: GardenScene, frame: ThreeWorldRendererFrame): number {
  const light = scene.directionalLight;
  const islandTile = gardenIslandDisplayTile(frame.world.lighthouse.tile);
  const centerX = islandTile.x * TILE_SCALE;
  const centerZ = islandTile.y * TILE_SCALE;
  light.position.set(centerX - 35, 48, centerZ - 30);
  light.target.position.set(centerX, 3, centerZ);

  // W6.2 (Grand Scale Revamp): shadows survive down to `recovery`.
  //
  // The casters (island + lighthouse) are static and the light direction is
  // fixed, so `autoUpdate = false` means the map is rendered once per scene
  // change, not per frame — the recurring cost is just the PCF taps in the
  // receiving materials. Dropping that at `recovery` bought almost nothing
  // while removing the single strongest cue that the island has form, and on
  // an integrated GPU at 1080p the app sits in `recovery` most of the time, so
  // in practice the monument was ALWAYS flat-lit (plan finding F1).
  //
  // `constrained` still drops them: that tier means the machine is genuinely
  // drowning and every pass has to go.
  // S1: resolved through seaQualityTier. Keying the map size on the raw tier
  // meant a camera drag reallocated the shadow map 1024 -> 384 and back on
  // release — a visible softening of the island's shadow on every pan, plus a
  // GPU reallocation per drag, for a tier that says nothing about load.
  const shadowTier = seaQualityTier(frame.renderScheduler);
  const size = shadowTier === "full"
    ? 1024
    : shadowTier === "balanced"
      ? 512
      : shadowTier === "constrained"
        ? 0
        : 384;
  if (size === 0) {
    light.shadow.intensity = 0;
    light.shadow.autoUpdate = false;
    scene.shadowActiveSize = 0;
    return 0;
  }
  light.shadow.intensity = 1;
  // The casters (island + lighthouse) are static and the light direction is
  // fixed, so the shadow map only needs re-rendering when the scene or frustum
  // size changes — not every frame. This keeps the extra pass near-zero cost.
  light.shadow.autoUpdate = false;
  if (light.shadow.mapSize.width !== size) {
    light.shadow.mapSize.set(size, size);
    // Force a reallocation at the new size (three only builds the map when null).
    light.shadow.map?.dispose();
    light.shadow.map = null;
    scene.shadowNeedsRender = true;
  }
  if (scene.shadowActiveSize !== size) scene.shadowNeedsRender = true;
  scene.shadowActiveSize = size;
  if (scene.shadowNeedsRender) {
    light.shadow.needsUpdate = true;
    scene.shadowNeedsRender = false;
  }
  return size;
}

function updateSceneForFrame(
  scene: GardenScene,
  camera: OrthographicCamera,
  frame: ThreeWorldRendererFrame,
  phase: DayCyclePhase,
): void {
  updateCamera(camera, frame);
  // Advance the beam's own clock before any early return, so a frame drawn
  // without world content cannot leave a gap for the next one to jump across.
  const beamElapsedSeconds = Math.max(0, frame.timeSeconds - scene.beamClockSeconds);
  scene.beamClockSeconds = frame.timeSeconds;
  scene.sky.update(phase, {
    reducedMotion: frame.reducedMotion,
    viewHeight: gardenCameraViewHeight(frame.height, frame.camera.zoom),
    targetX: camera.position.x - CAMERA_DISTANCE,
    targetZ: camera.position.z - CAMERA_DISTANCE,
    timeSeconds: frame.timeSeconds,
  });
  updateDayCycle(scene, frame, phase);
  updateLighthouseRimLight(phase);
  scene.water.update(frame);
  // Balanced+ beauty layers: the horizon re-anchors to the camera target the
  // same way the sky dome does; the islets are static (no reduced-motion
  // work) and only gate visibility on the tier.
  scene.horizon.update(phase, {
    targetX: camera.position.x - CAMERA_DISTANCE,
    targetZ: camera.position.z - CAMERA_DISTANCE,
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
  const laneGlowScale = phase.night * 0.45 + phase.dusk * 0.3 + phase.daylight * 0.05;
  if (!content) {
    // No fleet lanes to add — pack the base (beacon/harbor/dock) lanes only.
    const laneCount = scene.laneRegistry.sync(frame.renderScheduler.tier, laneGlowScale);
    scene.water.setLaneState(
      scene.laneRegistry.texture,
      laneCount,
      scene.laneRegistry.fieldBounds(),
    );
    return;
  }

  const constrained = frame.renderScheduler.tier === "constrained";
  // R13: ambient life survives `recovery`.
  //
  // Gulls, summit birds and the danger weather were gated to full/balanced
  // only. On this hardware the app sits in `recovery` almost permanently, so
  // in practice NONE of it was ever seen — the world was populated but never
  // alive. They are small instanced systems already sized for a tier ladder;
  // only `constrained`, which means the machine is genuinely drowning, still
  // sheds them.
  const ambientAlive = !constrained;
  content.decoration.visible = true;
  scene.waterAccents.visible = true;
  scene.waterAccents.rotation.y = 0;
  for (const effect of content.weather) {
    effect.root.visible = ambientAlive;
    updateDangerWeather(
      effect,
      frame.timeSeconds,
      frame.reducedMotion,
      frame.renderScheduler.tier === "full",
    );
  }
  content.gullFlock.update({
    constrained,
    night: phase.night,
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
  });
  content.fireflies.update({
    fullTier: frame.renderScheduler.tier === "full",
    night: phase.night,
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
  });

  // W4: the flame is the beacon now. One deterministic flicker (computed once
  // per frame, PSI-stress-scaled — D5) drives the fire's shared uniforms and
  // breathes through the halo and PointLight on top of the day-cycle base.
  const flicker = content.beaconFire.update({
    psiStress: frame.seaState.source.psiStress,
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
  });
  content.beaconFire.setTier(frame.renderScheduler.tier);
  content.beaconHalo.scale.multiplyScalar(1 + (flicker - 0.5) * 0.1);
  content.beaconHalo.material.opacity *= 0.92 + flicker * 0.16;
  content.lighthouseLight.intensity *= 1 + (flicker - 0.5) * 0.3;
  content.summitBirds.update({
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
    visible: ambientAlive,
  });
  // The hero gulls ride the same gate as the island's small life, and the same
  // clock. Placement needs nothing here: each flock is a child of the hull it
  // belongs to, so it already has that hull's pose.
  scratchAmbientFrame.reducedMotion = frame.reducedMotion;
  scratchAmbientFrame.timeSeconds = frame.timeSeconds;
  scratchAmbientFrame.visible = ambientAlive;
  content.shipGulls.update(scratchAmbientFrame);
  // 3a: the hoist rides the same `ambientAlive` gate as the rest of the
  // island's small life — it survives `recovery` and is shed only at
  // `constrained`. What is flying was fixed at compose time; this call only
  // lifts the cloth, so the tier decides whether the mast is drawn, never what
  // it reports.
  content.signalMast.update(scratchAmbientFrame);
  // 3c has no call here on purpose: the tide stain is composed once, never
  // moves, and is not tier gated — it is one draw call (zero when the mark is
  // bare), and a reading that vanishes when the machine gets busy is worse than
  // the call it costs. Its state changes only when the world does, in
  // `createWorldContent`. 3b's buoys are placed after the ship loop below,
  // where the hull transforms they ride on are final.
  // Balanced through recovery use the single cone; full adds only dust and
  // constrained swaps to the flat semantic fallback. Unlit additive pieces
  // are culled instead of rasterizing zero-alpha geometry.
  const beamUsePlane = frame.renderScheduler.tier === "constrained";
  const beamPieceLit = (child: typeof content.beam.children[number]): boolean => {
    const material = (child as Mesh).material as ShaderMaterial;
    return (material.uniforms.uOpacity?.value ?? 1) > 0.0005;
  };
  for (const child of content.beam.children) {
    if (child.name === "lighthouse-beam-cone") {
      child.visible = !beamUsePlane && beamPieceLit(child);
    } else if (child.name === "lighthouse-beam") child.visible = beamUsePlane;
    else if (child.name === "lighthouse-beam-dust") {
      child.visible = frame.renderScheduler.tier === "full" && !frame.reducedMotion
        && beamPieceLit(child);
    }
  }
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
  content.beam.rotation.y = frame.reducedMotion
    ? beamStaticBearing(content.beamDwellBearing)
    : scene.beamAngle;
  content.beacon.getWorldPosition(scratchPosition);
  scene.water.setBeaconState(
    scratchPosition.x,
    scratchPosition.z,
    content.beam.rotation.y,
    MathUtils.clamp(0.09 + (content.lighthouseLight.intensity - 0.45) / 7.6, 0, 1),
    // W6: the water lane, caustic glow, and streaks breathe with the same
    // flame flicker driving the halo and PointLight above.
    flicker,
  );

  const semanticView = gardenSemanticView(frame.camera.zoom, frame.selectedDetailId);
  const showWorldDetail = semanticView === "explore";
  // Tier 3 #15: the far half of the same zoom policy. `showWorldDetail` reveals
  // inspection detail on the way IN (explore, zoom >= 1.05); this sheds the
  // props that stop resolving on the way OUT, easing them away between 0.62 and
  // 0.44 so nothing pops. Default framing (0.7776) is above the band and pays
  // nothing for either.
  scratchOverviewLodFrame.deltaSeconds = beamElapsedSeconds;
  scratchOverviewLodFrame.reducedMotion = frame.reducedMotion;
  scratchOverviewLodFrame.zoom = frame.camera.zoom;
  content.overviewLod.update(scratchOverviewLodFrame);
  const overviewDetail = content.overviewLod.detail;
  // N (D6): the boards hold a roughly constant on-screen size as the camera
  // pulls back, so the sea's place-names stay readable at whole-map framing —
  // the framing that most wants them, and the one where a true-scale board is
  // about four pixels tall. They stand down when a detail panel owns the frame.
  content.seaSigns.update({
    night: phase.night,
    visible: semanticView !== "analyze",
    zoom: frame.camera.zoom,
  });
  for (const visual of content.docks) {
    visual.fineDetail.visible = showWorldDetail
      || visual.dock.detailId === frame.hoveredDetailId
      || visual.dock.detailId === frame.selectedDetailId;
  }

  // W1: the batched fleet is restamped from scratch each frame. Counts reset
  // here, poses are written in the ship loop, and every touched buffer is
  // flushed once at the end — one upload per buffer, not one per ship.
  beginFleetFrame(content.fleetBatches);
  syncGardenSailAtlas(
    content.sailAtlas,
    content.ships.map((visual) => visual.ship),
    frame.logos,
  );

  let visibleShipCount = 0;
  // Indexed rather than `entries()`: the iterator mints an `[index, value]` pair
  // per hull per frame, and this loop runs over the whole fleet. Same below.
  for (let index = 0; index < content.ships.length; index += 1) {
    const visual = content.ships[index]!;
    const sample = frame.shipMotionSamples.get(visual.ship.id);
    const tile = resolveGardenShipDisplayTile({
      displayOffset: visual.displayOffset,
      representative: visual.representative,
      sample,
      ship: visual.ship,
    });
    visual.root.visible = true;
    visibleShipCount += 1;
    setTilePosition(visual.root, tile, GARDEN_SHIP_ROOT_Y);

    const heading = normalizedHeading(sample?.heading);
    let heel = 0;
    if (heading) {
      const headingAngle = Math.atan2(heading.y, heading.x);
      visual.root.rotation.y = -headingAngle;
      // Gentle heel into turns: roll proportional to the frame's heading change,
      // clamped and frozen under reduced motion (D7 motion hierarchy).
      if (!frame.reducedMotion && visual.prevHeadingAngle !== null) {
        let delta = headingAngle - visual.prevHeadingAngle;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        heel = MathUtils.clamp(delta * 2.4, -0.16, 0.16);
      }
      visual.prevHeadingAngle = headingAngle;
    } else {
      visual.prevHeadingAngle = null;
    }
    visual.root.rotation.z = heel;
    // Larger hulls bob slower and shallower (titans slowest); standard as-is.
    const bobAmplitude = frame.reducedMotion
      ? 0
      : (0.035 + frame.seaState.swell * 0.055) * visual.motionAmplitudeScale;
    visual.root.position.y += Math.sin(
      frame.timeSeconds * (0.72 + frame.seaState.tempo * 0.25) / visual.motionPeriodScale
      + visual.bobPhase,
    ) * bobAmplitude;
    visual.sampleState = sample?.state ?? "idle";
    // Lay a warm reflection lane on the sea under each ship's lantern(s).
    scene.laneRegistry.set({
      color: HARBOR_PALETTE.lantern_glow,
      id: `ship-lantern.${visual.ship.id}`,
      intensity: visual.laneIntensity,
      kind: "lantern",
      worldX: visual.root.position.x,
      worldZ: visual.root.position.z,
    });
    const wakeIntensity = sample?.wakeIntensity ?? 0;
    const showShipDetail = showWorldDetail
      || visual.ship.detailId === frame.hoveredDetailId
      || visual.ship.detailId === frame.selectedDetailId;
    // Wakes remain a fleet-motion cue in overview/explore. In analyze, where a
    // selection already owns the hierarchy, retain only the focused hull's
    // wake so unrelated foam cannot compete with its ring, route, or panel.
    visual.wake.visible = !frame.reducedMotion
      && !constrained
      && wakeIntensity > 0.08
      && overviewDetail > 0
      && (semanticView !== "analyze" || showShipDetail);
    visual.wake.scale.x = (0.7 + Math.min(1.5, wakeIntensity) * 0.85) * overviewDetail;
    visual.fineDetail.visible = showShipDetail;
    visual.wakeDetail.visible = showShipDetail;

    // R8 grounding: the shadow is THIS ship's shadow.
    //
    // It used to be an axis-aligned ellipse, so a hull pointing north-south
    // cast an east-west shadow and every ship read as a sticker laid on the
    // surface. It now rotates with the heading and takes the ship's own
    // length and beam from `hullForm` (N5), so a long lean clipper throws a
    // long lean shadow and a beamy bullion barge throws a wide one.
    const shadowRadius = Math.max(1.15, visual.selectionRadius * 1.25);
    const hullForm = visual.ship.visual.hullForm;
    scratchShadowScale.set(
      shadowRadius * 1.65 * (hullForm?.length ?? 1),
      1,
      shadowRadius * 0.72 * (hullForm?.beam ?? 1),
    );
    scratchShadowQuaternion.setFromAxisAngle(
      SHADOW_UP,
      visual.root.rotation.y,
    );
    scratchShadowPosition.set(
      // A short offset along the light direction reads as a cast shadow while
      // still overlapping the hull, so the ship sits IN the water rather than
      // floating beside its own shape.
      visual.root.position.x + 0.7,
      WATER_LEVEL + 0.028,
      visual.root.position.z + 0.85,
    );
    scratchMatrix.compose(scratchShadowPosition, scratchShadowQuaternion, scratchShadowScale);
    content.shipShadows.setMatrixAt(index, scratchMatrix);

    // The ship's transform is final for this frame — hand it to the batch.
    // Hero ships skip this: they carry their own meshes under `root`.
    if (visual.batched) {
      writeFleetInstance(content.fleetBatches, {
        atlasCell: visual.atlasCell,
        headingAngle: visual.root.rotation.y,
        heel: visual.root.rotation.z,
        hullColor: visual.hullColor,
        hullForm: visual.ship.visual.hullForm,
        sailColor: visual.sailColor,
        pennantColor: visual.pennantColor,
        pitch: visual.root.rotation.x,
        scale: visual.root.scale.x,
        mastheadOffset: gardenShipMastheadOffset(visual.silhouette),
        sailFurl: gardenShipSailFurl(visual.ship.id, visual.sampleState),
        silhouette: visual.silhouette,
        trimColor: visual.trimColor,
        x: visual.root.position.x,
        y: visual.root.position.y,
        z: visual.root.position.z,
      });
    }
  }
  endFleetFrame(content.fleetBatches);
  content.shipShadows.instanceMatrix.needsUpdate = true;
  content.visibleShipCount = visibleShipCount;

  // 3b: the cross-bearing buoys ride alongside their hulls, so they are placed
  // once the ship transforms are final. One pass over the crossed ships only —
  // usually a handful, and none at all on an ordinary afternoon — then a single
  // buffer upload, the same discipline the shadows and the batches use.
  // Nothing here is tier or reduced-motion gated: the buoy has no motion of its
  // own, and it stops moving exactly when the ship it is moored to does.
  for (let index = 0; index < content.crossBearingBuoyShips.length; index += 1) {
    const visual = content.crossBearingBuoyShips[index]!;
    content.crossBearingBuoys.place(index, visual.root.position.x, visual.root.position.z);
  }
  content.crossBearingBuoys.flush();

  // The flight-to-quality flotilla, anchored on the same final hull transforms.
  // Its boats have no motion sample of their own and no clock of their own: each
  // one is an offset from its titan's position, which the loop above wrote from
  // `frame.shipMotionSamples`, advanced along its run by the frame's own
  // `timeSeconds`. `detail` is the overview policy's value, applied per instance
  // because these matrices are world-space — the same gate the wakes use.
  // Nothing runs when the gauge reported no flight: the list is empty.
  for (let index = 0; index < content.flightTenderShips.length; index += 1) {
    const visual = content.flightTenderShips[index]!;
    content.flightTenders.place(index, visual.root.position.x, visual.root.position.z);
  }
  content.flightTenders.flush({
    detail: overviewDetail,
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
  });

  // W6.4: the hero hulls' mirror columns, placed once the transforms above are
  // final. One pass over ~29 heroes, one buffer upload, one draw call.
  //
  // At whole-map framing they are shed outright: a reflection is a soft image
  // of a hull that is itself thirty pixels there, so it costs fill for nothing.
  // That is the SAME gate the rest of the overview policy rides.
  const reflectionsVisible = semanticView !== "analyze"
    && overviewDetail > 0
    && !constrained;
  content.heroReflections.mesh.visible = reflectionsVisible;
  if (reflectionsVisible) {
    for (let index = 0; index < content.heroReflectionShips.length; index += 1) {
      const visual = content.heroReflectionShips[index]!;
      // How wide the hull PRESENTS: the same footprint ellipse the contact
      // shadow uses, measured along the screen horizontal (world (1,0,-1)/√2).
      // A galleon lying broadside throws a broad reflection and the same hull
      // seen bow-on throws a narrow one, which is what makes the column read as
      // that ship rather than as a generic stripe.
      const shadowRadius = Math.max(1.15, visual.selectionRadius * 1.25);
      const hullForm = visual.ship.visual.hullForm;
      const alongHull = shadowRadius * 1.65 * (hullForm?.length ?? 1);
      const acrossHull = shadowRadius * 0.72 * (hullForm?.beam ?? 1);
      const yaw = visual.root.rotation.y;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      const footprint = Math.SQRT2 * Math.sqrt(
        alongHull * alongHull * (cos + sin) * (cos + sin)
        + acrossHull * acrossHull * (sin - cos) * (sin - cos),
      );
      // A hull's image on the water is its timber and its canvas together,
      // canvas-weighted: the sails are most of what a ship presents from this
      // angle, and they are the part that reads against open water.
      scratchReflectionColor.copy(visual.hullColor).lerp(visual.sailColor, 0.6);
      scratchReflectionPlacement.index = index;
      scratchReflectionPlacement.mastheadHeight = visual.mastheadHeight * visual.root.scale.x;
      scratchReflectionPlacement.strength = overviewDetail;
      scratchReflectionPlacement.tileX = visual.root.position.x / TILE_SCALE;
      scratchReflectionPlacement.tileY = visual.root.position.z / TILE_SCALE;
      scratchReflectionPlacement.width = footprint;
      scratchReflectionPlacement.worldX = visual.root.position.x;
      scratchReflectionPlacement.worldZ = visual.root.position.z;
      content.heroReflections.place(scratchReflectionPlacement);
    }
    // Reduced motion freezes the band drift at a composed pose, like every
    // other time-driven surface in this renderer.
    content.heroReflections.flush(frame.reducedMotion ? 0 : frame.timeSeconds);
  }

  // Ship transforms are final — flutter the pennants (S8), ground moored
  // ships with karesansui ripple rings (S7 via contract C2 (d)), restamp the
  // fleet lantern instances, and re-pack the lane texture now that this
  // frame's ship lanes are set.
  updateShipPennants(content.ships, frame.timeSeconds, frame.reducedMotion);
  syncShipRippleRings(scene.water.rippleRings, content.ships, {
    reducedMotion: frame.reducedMotion,
    tier: seaQualityTier(frame.renderScheduler),
  });
  updateFleetLanterns(
    content.fleetLanterns,
    camera.quaternion,
    frame.reducedMotion ? 0 : frame.timeSeconds,
    frame.reducedMotion,
  );
  const activeLaneCount = scene.laneRegistry.sync(frame.renderScheduler.tier, laneGlowScale);
  scene.water.setLaneState(
    scene.laneRegistry.texture,
    activeLaneCount,
    scene.laneRegistry.fieldBounds(),
  );

  // Boundary buoys are inspectable landmarks, not ambient scenery: hide them
  // at overview and isolate them to the focused risk body during analyze.
  const focusedAreaDetailId = content.zones.find(({ area }) => (
    area.detailId === frame.selectedDetailId
    || area.detailId === frame.hoveredDetailId
  ))?.area.detailId ?? null;
  const buoysVisible = semanticView === "explore"
    || (semanticView === "analyze" && focusedAreaDetailId !== null);
  content.zoneField.buoyBodies.visible = buoysVisible;
  content.zoneField.buoyLamps.visible = buoysVisible;
  updateZoneBuoys(
    content.zoneField,
    frame.timeSeconds,
    frame.reducedMotion,
    // Camera interaction is not load pressure; resolve the scheduler through
    // the sea tier so markers do not freeze mid-swell during a pan.
    seaQualityTier(frame.renderScheduler),
    semanticView === "analyze" ? focusedAreaDetailId : null,
  );

  updateSelectedRoute(content, frame);
  updateCueMarker(scene.hoverMarker, content, frame.hoveredDetailId, frame, 0.94);
  updateCueMarker(scene.selectedMarker, content, frame.selectedDetailId, frame, 1.08);
}

function updateCamera(camera: OrthographicCamera, frame: ThreeWorldRendererFrame): void {
  const viewportCenter = { x: frame.width / 2, y: frame.height / 2 };
  const centerTile = screenToTile(viewportCenter, frame.camera);
  const viewHeight = gardenCameraViewHeight(frame.height, frame.camera.zoom);
  const viewWidth = viewHeight * (frame.width / Math.max(1, frame.height));
  const targetX = centerTile.x * TILE_SCALE;
  const targetZ = centerTile.y * TILE_SCALE;

  camera.left = -viewWidth / 2;
  camera.right = viewWidth / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.position.set(
    targetX + CAMERA_DISTANCE,
    CAMERA_DISTANCE * Math.sqrt(2 / 3),
    targetZ + CAMERA_DISTANCE,
  );
  camera.lookAt(targetX, 0, targetZ);
  camera.updateProjectionMatrix();
}

function updateSelectedRoute(content: GardenContent, frame: ThreeWorldRendererFrame): void {
  const selectedShip = frame.selectedDetailId
    ? content.ships.find((entry) => entry.ship.detailId === frame.selectedDetailId)
    : undefined;
  const sample = selectedShip ? frame.shipMotionSamples.get(selectedShip.ship.id) : undefined;
  const routePathKey = sample?.routePathKey;
  const route = selectedShip ? frame.motionPlan.shipRoutes.get(selectedShip.ship.id) : undefined;
  const path = routePathKey ? route?.waterPaths.get(routePathKey) : undefined;
  const nextKey = selectedShip && path
    ? `${selectedShip.ship.id}|${routePathKey}|${path.points.length}|${selectedShip.displayOffset.x},${selectedShip.displayOffset.y}`
    : null;
  if (nextKey !== content.routeLineKey) {
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
  }
  content.routeLine.visible = Boolean(path);
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
