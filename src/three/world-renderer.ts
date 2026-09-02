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
  Material,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PCFShadowMap,
  PlaneGeometry,
  PointLight,
  Quaternion,
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
  GARDEN_LIGHTHOUSE_BEACON_Y,
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
  GARDEN_SHIP_ROOT_Y,
  gardenShipVisualScale,
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
import { deriveEpistemicHaze } from "../systems/epistemic-haze";
import { seasonFromDate, type GardenSeason } from "../systems/season";
import { isDebugChromeEnabled } from "../lib/pharosville-debug";
import { createGardenAlmanacDressing, type GardenAlmanacDressing } from "./garden-almanac-dressing";
import {
  createDrawOwnerRecorder,
  shouldRequestDrawCensus,
  type DrawOwnerCensus,
  type DrawRecorderTarget,
} from "./garden-draw-census";
import {
  GARDEN_BREATH_PHASE,
  gardenBreathAt,
  gardenGustAtWorldPosition,
  writeWeatherPlan,
  type WeatherPlan,
} from "../systems/weather";
import {
  advanceLampStatus,
  initialLampStatusState,
  lampStatusMixForStatus,
  lampStatusModulationForMix,
  LAMP_STATUS_TRANSITION_SECONDS,
  type LampStatusModulation,
  type LampStatusHysteresisState,
} from "../systems/lamp-status";
import type { PharosVilleWorld } from "../systems/world-types";
import {
  worldRenderContentPartHashes,
} from "../systems/world-render-content-signature";
import {
  createGardenCemetery,
  createGardenPigeonnier,
  type GardenPigeonnierLandmark,
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
import { createGardenSeaEdges, type GardenSeaEdges } from "./garden-sea-edges";
import { SEA_BODY_TERRAIN, seaBodyForArea, type SeaBodyName } from "../systems/sea-bodies";
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
  overviewLodTargetDetail,
  type GardenOverviewLod,
} from "./garden-overview-lod";
import { createGardenModelLibrary } from "./garden-models";
import { createGardenWater, type GardenWater } from "./garden-water";
import type { GardenCloudShadowSource } from "./garden-water-contract";
import { dayCyclePhase, updateDayCycle, type DayCyclePhase } from "./garden-day-cycle";
import { gardenKeyLightPose, type GardenLightPose } from "./garden-sun";
import { createGardenSky, type GardenSky } from "./garden-sky";
import {
  createGardenSeasonalDressing,
  type GardenSeasonalDressing,
} from "./garden-seasonal-dressing";
import { createGardenWakes, type GardenWakes } from "./garden-wakes";
import {
  assignGardenWakeSlots,
  createGardenWakeBatch,
  type GardenWakeBatch,
} from "./garden-wake-batch";
import { createGardenEnvironment, type GardenEnvironment } from "./garden-environment";
import { createGardenCueMarker } from "./garden-cue-marker";
import { createGardenPost } from "./garden-post";
import {
  authorDock,
  createHarborLanterns,
  gardenHarborLanternWorldPositions,
  gardenDockLampWorldPositions,
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
import { shipIssuanceDraft } from "../systems/ship-issuance";
import {
  createGardenTideLine,
  type GardenTideLine,
} from "./garden-tide-line";
import {
  createGardenLaneRegistry,
  type GardenLaneRegistry,
} from "./garden-lanterns";
import {
  CEMETERY_CENTER,
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
} from "../systems/world-layout";
import {
  createTerracedIsland,
  createWaterAccents,
  gardenIslandLanternWorldOffsets,
  type GardenPondReflection,
} from "./garden-island";
import { applyGardenMonthRecord } from "./garden-month-record";
import {
  applyLighthouseRimLight,
  attachGardenLighthouseModel,
  updateLighthouseLampStatus,
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
  assignGardenHeroSailAtlas,
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
  resetFleetSailAttention,
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
  FLEET_SAIL_ATLAS_CELLS,
  fleetDrawCallCount,
  GARDEN_FLEET_BATCH_CAPACITY,
  setFleetAerialPerspective,
  setFleetWeather,
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
  cachedShipGeometry,
  countDrawableObjects,
  disposeThreeObjectTree,
  normalizedHeading,
  setTilePosition,
  stableUnit,
  TILE_SCALE,
  type GardenShipGeometryCache,
} from "./garden-util";
import { setGardenQuayEpistemicHaze } from "./garden-height-fog";
import {
  createZone,
  createZoneField,
  updateZoneBuoys,
  type ZoneField,
  type ZoneVisual,
} from "./garden-zones";
import {
  createTextureUploadScheduler,
  type TextureUploadScheduler,
} from "./texture-upload-scheduler";

export { disposeThreeObjectTree } from "./garden-util";

const MAX_THREE_DPR = 2;
const CAMERA_DISTANCE = 110;
/**
 * Peak chroma the fleet loses at the far end of the haze ramp.
 *
 * Deliberately partial: the operator asked for a GENTLE recession, where a
 * distant hull is still identifiable to someone who looks for it and merely
 * stops competing for attention. Full desaturation would make the far fleet a
 * monochrome band and turn a depth cue into a wall.
 *
 * Lowered from 0.62 once the scene fog was repaired (garden-sky.ts, 2026-08-13
 * — the reference view height had switched aerial perspective off entirely at
 * the default framing). While fog was inert this term was carrying the whole
 * depth cue alone and needed to be strong; now that the haze itself grades the
 * midground, the two compound, and the far fleet was losing its colour twice
 * over.
 */
const GARDEN_FLEET_AERIAL_STRENGTH = 0.4;

/** The Pharos crown — the tallest thing that casts, and so what sizes the frustum. */
const SHADOW_CASTER_HEIGHT = 34;
/** Allowance around island/station roots for static architecture and foliage. */
export const GARDEN_SHADOW_STATIC_FOOTPRINT_ALLOWANCE = 28;

export interface GardenStaticShadowBounds {
  centerX: number;
  centerZ: number;
  radius: number;
}

/**
 * Square shadow fit shared by the island, stations, and Wave B1's rim casters.
 * Ships stay out because moving casters would force a per-frame map redraw.
 */
export function gardenStaticShadowBounds(
  points: readonly { x: number; z: number }[],
  footprintAllowance = GARDEN_SHADOW_STATIC_FOOTPRINT_ALLOWANCE,
): GardenStaticShadowBounds {
  if (points.length === 0) {
    return { centerX: 0, centerZ: 0, radius: Math.max(0, footprintAllowance) };
  }
  let minX = points[0]!.x;
  let maxX = minX;
  let minZ = points[0]!.z;
  let maxZ = minZ;
  for (const point of points.slice(1)) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  return {
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    radius: Math.max(maxX - minX, maxZ - minZ) / 2 + Math.max(0, footprintAllowance),
  };
}

/** Conservative bootstrap until the first world-derived fit is applied. */
const GARDEN_SHADOW_INITIAL_RADIUS = 128;
/**
 * Ground reach cap for the frustum offset. At the key light's floor elevation
 * the tower's true reach is ~280 units, far past anything the eye can follow
 * across water; capping it keeps the frustum near the island where the shadow
 * actually reads.
 */
const SHADOW_MAX_REACH = 150;
/**
 * How far back along its own direction the shadow light sits.
 *
 * The fit now spans the remote station roots as well as the island. 260 clears
 * the 75-unit low-sun recenter, the measured ~114-unit static half-extent, and
 * the 34-unit Pharos caster with margin. Ortho projection means that extra
 * distance costs no texture density; it only widens the depth range that bias
 * is expressed in (see createGardenScene).
 */
const SHADOW_LIGHT_DISTANCE = 260;
/**
 * How far the sun must swing before the static-caster shadow map is redrawn.
 *
 * ~0.6°, comfortably finer than the softest shadow edge a 2048² map over a
 * ±61 frustum can resolve, so the re-steer is never visible as a step.
 */
const SHADOW_RESTEER_RADIANS = 0.01;

/** Reused across frames so the shadow rig allocates nothing in the hot path. */
const scratchKeyPose: GardenLightPose = {
  direction: new Vector3(0, 1, 0),
  elevation: Math.PI / 2,
};
/** How long a lost WebGL context has to come back before the world gives up. */
const CONTEXT_RESTORE_GRACE_MS = 5000;

/** W4.2: visible refresh waves cannot begin more often than this. */
export const GARDEN_TRANSITION_WAVE_SECONDS = 20;
/** Refresh truth snaps while a newly-mounted world is still forming. */
export const GARDEN_YOUNG_WORLD_SNAP_SECONDS = 30;
/** At or above this fleet share, migration snaps instead of choreographing. */
export const GARDEN_MASS_TRANSITION_SNAP_RATIO = 0.2;
/** Ships take between one and two garden minutes to weigh anchor and settle. */
export const GARDEN_SHIP_TRANSITION_MIN_SECONDS = 60;
export const GARDEN_SHIP_TRANSITION_MAX_SECONDS = 120;
/**
 * A longer route risks cutting across the island. Those moves use two mist
 * legs with a fully-hidden hand-off at the map edge instead of a chord.
 */
export const GARDEN_SHIP_CROSS_MAP_TILES = 46;
/** Cargo/tide and dock accent render targets settle on this time constant. */
export const GARDEN_SCALAR_TRANSITION_SECONDS = 45;

export function gardenTransitionWaveReady(
  lastStartSeconds: number,
  timeSeconds: number,
): boolean {
  return !Number.isFinite(lastStartSeconds)
    || timeSeconds - lastStartSeconds >= GARDEN_TRANSITION_WAVE_SECONDS;
}

export type GardenShipTransitionKind = "arrival" | "departure" | "reanchor" | "mist";
export interface GardenTransitionTile { x: number; y: number }
export interface GardenShipTransitionSpec {
  bend: number;
  durationSeconds: number;
  from: GardenTransitionTile;
  kind: GardenShipTransitionKind;
  shipId: string;
  startSeconds: number;
  to: GardenTransitionTile;
}
export interface GardenShipTransitionSample {
  complete: boolean;
  headingX: number;
  headingY: number;
  progress: number;
  visibility: number;
  x: number;
  y: number;
}

const MIST_MIN_TILE = 0.5;
const MIST_MAX_TILE_X = PHAROSVILLE_MAP_WIDTH - 1.5;
const MIST_MAX_TILE_Y = PHAROSVILLE_MAP_HEIGHT - 1.5;
const MIST_CENTER_TILE_X = (PHAROSVILLE_MAP_WIDTH - 1) / 2;
const MIST_CENTER_TILE_Y = (PHAROSVILLE_MAP_HEIGHT - 1) / 2;

/**
 * The mist line is the playable-water edge used by garden-water's `uMapEdge`:
 * half the 140-tile region span, inset half a tile so a hull never samples
 * outside the detailed sea. `garden-sky`'s FOG_NEAR/FOG_FAR are camera-depth
 * planes, not a radial world boundary, so they cannot safely site a hull.
 * Arrivals begin on this edge and departures end on it, already inside the
 * sea/aerial blend where the detailed map gives way to open ocean.
 */
export function gardenMistBoundaryTile(
  toward: GardenTransitionTile,
  salt = 0,
  out: GardenTransitionTile = { x: 0, y: 0 },
): GardenTransitionTile {
  let dx = toward.x - MIST_CENTER_TILE_X;
  let dy = toward.y - MIST_CENTER_TILE_Y;
  if (Math.abs(dx) + Math.abs(dy) < 1e-6) {
    const angle = salt * Math.PI * 2;
    dx = Math.cos(angle);
    dy = Math.sin(angle);
  }
  const scaleX = dx > 0
    ? (MIST_MAX_TILE_X - MIST_CENTER_TILE_X) / dx
    : (MIST_MIN_TILE - MIST_CENTER_TILE_X) / dx;
  const scaleY = dy > 0
    ? (MIST_MAX_TILE_Y - MIST_CENTER_TILE_Y) / dy
    : (MIST_MIN_TILE - MIST_CENTER_TILE_Y) / dy;
  const scale = Math.min(Math.abs(scaleX), Math.abs(scaleY));
  out.x = MathUtils.clamp(MIST_CENTER_TILE_X + dx * scale, MIST_MIN_TILE, MIST_MAX_TILE_X);
  out.y = MathUtils.clamp(MIST_CENTER_TILE_Y + dy * scale, MIST_MIN_TILE, MIST_MAX_TILE_Y);
  return out;
}

function transitionEase(value: number): number {
  const t = MathUtils.clamp(value, 0, 1);
  // smootherstep: zero velocity at both berths, with no spring/overshoot.
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function curvedTransitionPoint(
  from: GardenTransitionTile,
  to: GardenTransitionTile,
  bend: number,
  progress: number,
  out: GardenTransitionTile,
): GardenTransitionTile {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const curve = Math.min(6, distance * 0.16) * bend;
  const normalX = distance > 1e-6 ? -dy / distance : 0;
  const normalY = distance > 1e-6 ? dx / distance : 0;
  const controlX = (from.x + to.x) * 0.5 + normalX * curve;
  const controlY = (from.y + to.y) * 0.5 + normalY * curve;
  const inverse = 1 - progress;
  out.x = inverse * inverse * from.x + 2 * inverse * progress * controlX
    + progress * progress * to.x;
  out.y = inverse * inverse * from.y + 2 * inverse * progress * controlY
    + progress * progress * to.y;
  // Curvature near a corner can otherwise put the keel a fraction beyond the
  // playable sea. Clamp is a last-line invariant, not a path-shape device.
  out.x = MathUtils.clamp(out.x, MIST_MIN_TILE, MIST_MAX_TILE_X);
  out.y = MathUtils.clamp(out.y, MIST_MIN_TILE, MIST_MAX_TILE_Y);
  return out;
}

const transitionPointScratch = { x: 0, y: 0 };
const transitionAheadScratch = { x: 0, y: 0 };
const transitionOldEdgeScratch = { x: 0, y: 0 };
const transitionNewEdgeScratch = { x: 0, y: 0 };
const transitionFrameSample: GardenShipTransitionSample = {
  complete: false,
  headingX: 0,
  headingY: 0,
  progress: 0,
  visibility: 1,
  x: 0,
  y: 0,
};

function transitionPointAt(
  transition: GardenShipTransitionSpec,
  amount: number,
  point: GardenTransitionTile,
): GardenTransitionTile {
  if (transition.kind !== "mist") {
    return curvedTransitionPoint(
      transition.from,
      transition.to,
      transition.bend,
      amount,
      point,
    );
  }
  const oldEdge = gardenMistBoundaryTile(
    transition.from,
    0.17,
    transitionOldEdgeScratch,
  );
  const newEdge = gardenMistBoundaryTile(
    transition.to,
    0.83,
    transitionNewEdgeScratch,
  );
  return amount < 0.5
    ? curvedTransitionPoint(transition.from, oldEdge, transition.bend, amount * 2, point)
    : curvedTransitionPoint(newEdge, transition.to, -transition.bend, amount * 2 - 1, point);
}

/** Clock-pure transition sampling; reload persistence is intentionally absent. */
export function sampleGardenShipTransition(
  transition: GardenShipTransitionSpec,
  timeSeconds: number,
  out: GardenShipTransitionSample = {
    complete: false,
    headingX: 0,
    headingY: 0,
    progress: 0,
    visibility: 1,
    x: 0,
    y: 0,
  },
): GardenShipTransitionSample {
  const raw = MathUtils.clamp(
    (timeSeconds - transition.startSeconds) / Math.max(1, transition.durationSeconds),
    0,
    1,
  );
  const eased = transitionEase(raw);
  // Cross-map moves never draw a chord through the island. `transitionPointAt`
  // sails to the old edge, disappears into aerial mist, then emerges at the
  // new edge; the midpoint hand-off is fully hidden.
  const point = transitionPointAt(transition, eased, transitionPointScratch);
  const ahead = transitionPointAt(
    transition,
    Math.min(1, eased + 0.002),
    transitionAheadScratch,
  );
  const headingLength = Math.hypot(ahead.x - point.x, ahead.y - point.y);
  out.x = point.x;
  out.y = point.y;
  out.headingX = headingLength > 1e-6 ? (ahead.x - point.x) / headingLength : 0;
  out.headingY = headingLength > 1e-6 ? (ahead.y - point.y) / headingLength : 0;
  out.progress = raw;
  out.complete = raw >= 1;
  if (transition.kind === "arrival") out.visibility = transitionEase(Math.min(1, raw / 0.16));
  else if (transition.kind === "departure") {
    out.visibility = 1 - transitionEase(Math.max(0, (raw - 0.84) / 0.16));
  } else if (transition.kind === "mist") {
    out.visibility = transitionEase(Math.min(1, Math.abs(raw - 0.5) * 2));
  } else out.visibility = 1;
  return out;
}

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
const scratchWakePose = { headingY: 0, hullScale: 1, x: 0, y: 0, z: 0 };
// W6.4: the hull tint handed to a reflection instance, blended per frame.
const scratchReflectionColor = new Color();
// Reused argument records for the per-frame update calls below. Every callee
// destructures its input on entry and keeps nothing, so one record per call
// site is enough to keep the frame path free of the object literals it would
// otherwise mint — one per flock and mast per frame, and one per hero hull.
const scratchAmbientFrame = { reducedMotion: false, timeSeconds: 0, visible: false };
const scratchOverviewLodFrame = { deltaSeconds: 0, reducedMotion: false, zoom: 1 };
// Phase 2 god rays: per-frame scratch for the beam's forward-scattering dot.
const scratchViewDirection = new Vector3();
const scratchBeamDirection = new Vector3();
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
const scratchIssuanceHullForm = {
  agePatina: -1,
  beam: 1,
  fittingCode: 0,
  height: 1,
  hullValue: 1,
  length: 1,
  propRotation: 0,
  ropeSag: 0,
  waterline: 0,
};

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

function textureOwnerName(object: Object3D, root: Object3D): string {
  let current: Object3D | null = object;
  while (current && current !== root) {
    if (current.name) return current.name;
    current = current.parent;
  }
  return object.type;
}

function textureOwnerCensus(
  root: Scene,
  rendererTextures: number,
  manifest: readonly TextureOwnerManifestEntry[] = [],
  renderer?: WebGLRenderer,
): TextureOwnerCensus {
  const ownerByTexture = new Map<Texture, string>();
  const sceneTextures = new Set<Texture>();
  // Explicit owners take precedence over the nearest mesh name. Water's
  // material samples the wake/lane/environment textures, but those resources
  // belong to their scene-scope systems; the post chain is not in the scene at
  // all. Seeding the map also makes the census useful for renderer allocations
  // that have no object/material edge to follow.
  for (const entry of manifest) {
    if (!ownerByTexture.has(entry.texture)) ownerByTexture.set(entry.texture, entry.owner);
  }
  root.traverse((object) => {
    if (!(object as Mesh).isMesh) return;
    const owner = textureOwnerName(object, root);
    const { material } = object as Mesh;
    const materials = Array.isArray(material) ? material : [material];
    for (const entry of materials) {
      for (const value of Object.values(entry)) {
        if (value instanceof Texture) {
          sceneTextures.add(value);
          if (!ownerByTexture.has(value)) ownerByTexture.set(value, owner);
        }
      }
      const uniforms = (entry as ShaderMaterial).uniforms;
      if (!uniforms) continue;
      for (const uniform of Object.values(uniforms)) {
        if (uniform.value instanceof Texture) {
          sceneTextures.add(uniform.value);
          if (!ownerByTexture.has(uniform.value)) ownerByTexture.set(uniform.value, owner);
        }
      }
    }
  });
  if (root.environment) {
    sceneTextures.add(root.environment);
    if (!ownerByTexture.has(root.environment)) {
      ownerByTexture.set(root.environment, "environment.pmrem");
    }
  }
  const ownerCounts = new Map<string, {
    liveTextureCount: number;
    liveTextureNames: string[];
    textureCount: number;
  }>();
  for (const [texture, owner] of ownerByTexture) {
    const stats = ownerCounts.get(owner) ?? {
      liveTextureCount: 0,
      liveTextureNames: [],
      textureCount: 0,
    };
    stats.textureCount += 1;
    if (renderer) {
      const properties = (renderer as unknown as {
        properties?: { get: (resource: object) => { __webglTexture?: unknown } };
      }).properties;
      const webglTexture = properties?.get(texture).__webglTexture;
      if (webglTexture !== undefined && webglTexture !== null) {
        stats.liveTextureCount += 1;
        stats.liveTextureNames.push(texture.name || texture.uuid);
      }
    }
    ownerCounts.set(owner, stats);
  }
  return {
    owners: [...ownerCounts]
      .map(([owner, stats]) => ({ owner, ...stats }))
      .sort((left, right) => (
        right.textureCount - left.textureCount
        || left.owner.localeCompare(right.owner)
      )),
    referencedTextures: sceneTextures.size,
    attributedTextures: ownerByTexture.size,
    rendererTextures,
    minimumUnattributedRendererTextures: Math.max(
      0,
      rendererTextures - ownerByTexture.size,
    ),
  };
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
  renderer.toneMapping = AgXToneMapping;
  renderer.toneMappingExposure = 1.12;
  // D3 / W2.2: soft harbour-wide static shadows. Shadow support is compiled once
  // (enabled + castShadow stay on); per-tier cost is driven at runtime via
  // shadow.intensity and mapSize (see updateShadows), which avoids material
  // recompile stalls.
  //
  // W2.2 correction: this said `PCFSoftShadowMap`, which three 0.185 rewrites to
  // `PCFShadowMap` on the first shadow render while logging a deprecation
  // warning (WebGLShadowMap.js:99). So the world has been drawing PCF all along
  // and the softness knob is `shadow.radius` (Vogel-disk sample radius in
  // texels, hardware-PCF filtered — 5 taps ≈ 20 filtered taps), not the map
  // type. Naming the type we actually get makes that knob findable and drops
  // the warning.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  // See the reset in `render` — the frame's totals are accumulated by hand
  // so the composer's passes do not clobber the scene's counts.
  renderer.info.autoReset = false;
  const uploadScheduler = createTextureUploadScheduler(renderer);
  const { canvas, onAssetReady, onContextFailure } = input;
  const modelLibrary = createGardenModelLibrary();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
  // The renderer is built before the scene now: W6.5's sky probe bakes THROUGH
  // the renderer, so the scene cannot be assembled without one. Nothing in
  // `createGardenScene` reads renderer state, so the swap is order-only.
  const scene = createGardenScene(
    renderer,
    uploadScheduler,
    seasonFromDate(input.calendarDate),
  );
  // @types/three still narrows the r185 runtime's null scene/group arguments;
  // the recorder's structural target matches the implementation's actual calls.
  const drawRecorder = createDrawOwnerRecorder(renderer as unknown as DrawRecorderTarget, scene.root);
  let drawCensusRequested = false;
  const handleAssetReady = () => {
    drawCensusRequested = true;
    onAssetReady?.();
  };
  const debugDrawCensus = isDebugChromeEnabled();
  const post = createGardenPost(renderer, scene.root, camera);

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
  let lastTextureOwnerCensus: TextureOwnerCensus = {
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
  // A fresh whole-map session must not warm N8AO while the scene LOD eases
  // from its construction value of 1. Once that initial settle is complete
  // (or the user first zooms in), every later crossing follows the eased scene
  // detail so contact shading fades with the props it grounds.
  let initialOverviewAOSuppression: "pending" | "active" | "complete" = "pending";
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
      drawCensusRequested = true;
      scheduleModelTextureUploads({
        isOwnerValid: () => !disposed && scene.lighthouseModel === model,
        model,
        onReady: () => {
          // The GLB shell replaces the procedural one — refresh the shadow map.
          scene.shadowNeedsRender = true;
          drawCensusRequested = true;
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
      scene.fleetSharedCache.wakeMaterial.dispose();
      for (const geometry of scene.fleetSharedCache.geometries.values()) geometry.dispose();
      // The harbour batch also owns the off-tree source geometries retained by
      // DockRecipe. Its disposer releases both those recipes and the mounted
      // merged/instanced buffers before the generic scene walk below.
      scene.content?.harborBatch?.dispose();
      if (scene.content) scene.content.harborBatch = null;
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
              zoom: frame.camera.zoom,
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
      // Phase 2: the frame's weather plan — one pure function of the world
      // clock and the sea state's PSI stress / base wind, consumed below by
      // the sky, water, rain, fleet, gulls, post, and the shadow light. Under
      // reduced motion the clock pins at 0 and the whole plan (lightning
      // included) freezes into the deterministic static frame.
      writeWeatherPlan({
        timeSeconds: frame.reducedMotion ? 0 : frame.timeSeconds,
        psiStress: frame.seaState.source.psiStress,
        baseWind: frame.seaState.wind,
      }, scene.weather);
      // Grade the dome for THIS phase before the probe reads it. The probe
      // renders `sky.domeMaterial` itself and caches the result under the phase
      // key, but the full sky update does not run until `updateSceneForFrame`
      // below — so without this the first bake of a session rendered the NIGHT
      // colours the uniforms are constructed with, stored them under a daytime
      // key, and lit every metal surface in the world with a night probe for as
      // long as that key held. At midday the key never moves again.
      scene.sky.applyPhase(phase, frame.wallClockHour, scene.weather.stormLevel);
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
      scene.environment.update(phase, scene.weather.stormLevel, {
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
      {
        const wakeCenterTile = screenToTile(
          { x: frame.width / 2, y: frame.height / 2 },
          frame.camera,
        );
        const wakeViewHeight = gardenCameraViewHeight(frame.height, frame.camera.zoom);
        scene.wakes.update({
          deltaSeconds: MathUtils.clamp(frame.timeSeconds - scene.beamClockSeconds, 0, 0.25),
          reducedMotion: frame.reducedMotion,
          targetX: wakeCenterTile.x * TILE_SCALE,
          targetZ: wakeCenterTile.y * TILE_SCALE,
          viewHalfWidth: (wakeViewHeight * (frame.width / Math.max(1, frame.height))) / 2,
          tier: seaQualityTier(frame.renderScheduler),
          visibleStrength: scene.water.wakeStrength(),
        });
      }
      const recurringOffscreenCalls = renderer.info.render.calls;

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
      updateSceneForFrame(scene, camera, frame, phase, uploadScheduler, handleAssetReady);

      const tier = frame.renderScheduler.tier;
      if (SESSION_TIER_QUALITY[tier] > SESSION_TIER_QUALITY[sessionTierReached]) {
        sessionTierReached = tier;
      }
      const shadowMapSize = updateShadows(scene, frame, phase);
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
      // Content is populated asynchronously and the overview LOD eases its
      // detail value from 1. Suppress that construction ease only when this
      // renderer's first framing is already whole-map; otherwise later zoom
      // crossings must forward the eased detail so AO and props fade together.
      const overviewTargetDetail = overviewLodTargetDetail(frame.camera.zoom);
      const overviewDetail = scene.content?.overviewLod.detail ?? overviewTargetDetail;
      if (initialOverviewAOSuppression === "pending") {
        initialOverviewAOSuppression = overviewTargetDetail <= 0 ? "active" : "complete";
      } else if (
        initialOverviewAOSuppression === "active"
        && (overviewTargetDetail > 0 || overviewDetail <= 0)
      ) {
        initialOverviewAOSuppression = "complete";
      }
      post.setAOZoomDetail(initialOverviewAOSuppression === "active" ? 0 : overviewDetail);
      post.setGrade(
        phase.daylight,
        phase.dusk,
        scene.weather.stormLevel,
        scene.weather.lightning,
        scene.season === "winter" ? 1 : 0,
      );
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
      const sceneCalls = renderInfo.calls;
      const programCount = renderer.info.programs?.length ?? 0;
      const geometryCount = renderer.info.memory.geometries;
      const textureCount = renderer.info.memory.textures;
      if (
        textureCount !== lastCensusTextureCount
        || contentReplacementCount !== lastCensusReplacementCount
      ) {
        lastTextureOwnerCensus = textureOwnerCensus(scene.root, textureCount, [
          ...(post.getTextureManifest?.() ?? []),
          ...sceneTextureManifest(scene),
        ], renderer);
        drawCensusRequested = true;
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

export interface GardenScene {
  almanacDressing: GardenAlmanacDressing;
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
  directionalLight: DirectionalLight;
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
  season: GardenSeason;
  seasonalDressing: GardenSeasonalDressing;
  shadowActiveSize: number;
  /** Sun bearing the current shadow map was drawn for; drives the re-steer. */
  shadowLightDirection: Vector3;
  shadowNeedsRender: boolean;
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
  /** Renderer-side 45s draft state; DOM truth stays on the world nodes. */
  issuanceDraftById: Map<string, number>;
  issuanceDraftTargetById: Map<string, number>;
  /**
   * Task 14: the weekly supply tide, as one banded plate per quay in a single
   * instanced draw. The strandline is baked into vertex colours; W4.2
   * crossfades the old/new plates rather than inventing an intra-week rate.
   */
  tideLine: GardenTideLine;
  decoration: Group;
  docks: DockVisual[];
  /** World-wide quay bucket, prop and flag batches; dock roots are anchors only. */
  harborBatch: GardenHarborBatch | null;
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
  /** W5.2: the single-draw analytical tower-and-moon image in the still pond. */
  pondReflection: GardenPondReflection;
  /** Tier 3 #15: sheds the props that cannot read at whole-map framing. */
  overviewLod: GardenOverviewLod;
  pigeonnier: GardenPigeonnierLandmark;
  pigeonnierMoverPositions: Array<{ x: number; y: number; z: number }>;
  pigeonnierMoverShips: Array<ShipVisual | null>;
  root: Group;
  routeLine: Line<BufferGeometry, LineBasicMaterial>;
  routeLineKey: string | null;
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
  statueGleamMaterials: MeshStandardMaterial[];
  tideStain: GardenTideStain;
  summitBirds: GardenSummitBirds;
  summitBirdsRoot: Group;
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
  season: GardenSeason,
): GardenScene {
  const root = new Scene();
  const sky = createGardenSky(season);
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
  // The bootstrap is replaced before drawing by updateShadows' island + station
  // root fit, then extended for the Pharos tower's long day shadow.
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.set(2048, 2048);
  // W2.2 bias hygiene. The old pair (-0.0005 / 0.8) was fitted to a 1024 map
  // over the island alone — one texel was ~0.06 units there, so a 0.8-unit
  // normal offset was ~13 texels of slop, which the island's chunky terraces
  // hid but the harbour's thin dock planks and quay copings would not (offsets
  // that large slide a plank's shadow off the plank — peter-panning). At
  // At the dense station fit one texel is ~0.11 world units at noon, so the
  // offset remains a few texels while clearing acne on the terraces.
  //
  // `bias` is in normalized depth, so it scales with the ortho depth range:
  // -0.00015 over the ~389-unit near/far span is ~0.058 world units, preserving
  // the old world-space slop after extending the light for remote stations.
  directionalLight.shadow.bias = -0.00015;
  directionalLight.shadow.normalBias = 0.35;
  // Vogel-disk PCF radius, in texels (see the shadowMap.type note above). 4
  // texels ≈ 0.17 world units of penumbra at the full-tier fit: soft enough
  // that a crane leg reads as light rather than as a decal, tight enough that
  // a bollard still touches the deck it stands on.
  directionalLight.shadow.radius = 4;
  const shadowCamera = directionalLight.shadow.camera;
  shadowCamera.left = -GARDEN_SHADOW_INITIAL_RADIUS;
  shadowCamera.right = GARDEN_SHADOW_INITIAL_RADIUS;
  shadowCamera.top = GARDEN_SHADOW_INITIAL_RADIUS;
  shadowCamera.bottom = -GARDEN_SHADOW_INITIAL_RADIUS;
  shadowCamera.near = 1;
  shadowCamera.far = SHADOW_LIGHT_DISTANCE + GARDEN_SHADOW_INITIAL_RADIUS + 2;
  shadowCamera.updateProjectionMatrix();
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
  waterAccents.add(almanacDressing.root);
  const seasonalDressing = createGardenSeasonalDressing(season);
  // Keep the scene's long-standing root child order stable for hit/cue owners;
  // this decorative water layer belongs with the existing water accents.
  waterAccents.add(seasonalDressing.root);

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
    wakeMaterial: new LineBasicMaterial({
      color: HARBOR_PALETTE.foam_white,
      depthWrite: false,
      opacity: 0.38,
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
    ambientLight,
    beamAngle: 0,
    beamClockSeconds: 0,
    content: null,
    directionalLight,
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
    season,
    seasonalDressing,
    shadowActiveSize: 0,
    // Deliberately not a legal light direction, so the first frame always
    // re-steers and draws the map for wherever the sun actually is.
    shadowLightDirection: new Vector3(0, 0, 0),
    shadowNeedsRender: true,
    sky,
    water,
    waterAccents,
    wakes: createGardenWakes(renderer),
    weather: {
      windDirX: -0.855,
      windDirZ: 0.519,
      windAngle: 2.592,
      windSpeed: 0,
      gust: 0,
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
 * - a supply tick that moves `change24hPct` dirties `harborLife` (quay tempo,
 *   gull traffic — light instanced systems), never the dock masonry;
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
    ship.reportCard?.overallGrade ?? null,
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
    highWaterSeverity: world.lighthouse.highWaterMark?.severity ?? null,
    signalPennants: world.lighthouse.signalMast?.pennantCount ?? 0,
    stormCone: world.lighthouse.signalMast?.stormCone ?? false,
    tile: world.lighthouse.tile,
  });
  const keys: WorldContentPartKeys = {
    island: islandKey,
    landmarks: `${hashes.graves}|${hashes.pigeonnier}`,
    zones: hashes.areas ?? "",
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
    lampStatusMix: 0,
    lampStatusTargetMix: 0,
    pendingLampStatusTargetMix: null,
    lampModulation: lampStatusModulationForMix(0),
    scalarTransitions: [],
    dockAccentTransitions: [],
    harborBatch: null,
    seaEdges: null,
    lampStatusState: initialLampStatusState({}),
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
    issuanceDraftById: new Map<string, number>(),
    issuanceDraftTargetById: new Map<string, number>(),
    root,
    routeLine,
    routeLineKey: null,
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
    case "seaEdges":
      buildSeaEdgesPart(content);
      scene.shadowNeedsRender = true;
      break;
    case "docks":
      buildDocksPart(content, world);
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

function gardenShipTransition(
  shipId: string,
  from: GardenTransitionTile,
  to: GardenTransitionTile,
  kind: GardenShipTransitionKind,
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
    if (Math.hypot(nextBerth.x - oldBerth.x, nextBerth.y - oldBerth.y) >= 0.01) {
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
    if (Math.hypot(newBerth.x - oldBerth.x, newBerth.y - oldBerth.y) >= 0.01) {
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
        gardenShipTransition(visual.ship.id, from, newBerth, "reanchor"),
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
    if (Math.hypot(nextBerth.x - oldBerth.x, nextBerth.y - oldBerth.y) >= 0.01) {
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
  const nextShipIds = new Set<string>();
  for (const ship of world.ships) {
    nextShipIds.add(ship.id);
    content.issuanceDraftTargetById.set(ship.id, shipIssuanceDraft(ship.issuance));
  }
  for (const shipId of content.issuanceDraftTargetById.keys()) {
    if (!nextShipIds.has(shipId)) content.issuanceDraftTargetById.delete(shipId);
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
  const visual = createBatchedShip(
    ship,
    { x: 0, y: 0 },
    false,
    content.shipsGeometryCache,
    cell,
  );
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

function removeCompletedDepartures(
  scene: GardenScene,
  content: GardenContent,
  timeSeconds: number,
): void {
  for (let index = content.departingShips.length - 1; index >= 0; index -= 1) {
    const visual = content.departingShips[index]!;
    const transition = content.shipTransitions.get(visual.ship.id);
    if (
      !transition
      || !sampleGardenShipTransition(transition, timeSeconds, transitionFrameSample).complete
    ) continue;
    disposeDepartingVisual(scene, visual);
    content.departingShips.splice(index, 1);
    content.shipTransitions.delete(visual.ship.id);
  }
}

function disposeDepartingVisual(scene: GardenScene, visual: ShipVisual): void {
  visual.root.removeFromParent();
  scene.laneRegistry.remove(`ship-lantern.${visual.ship.id}`);
  scene.water.rippleRings.removeRing(`ship-mooring.${visual.ship.id}`);
  // Batched departure roots own only their wake instance buffers; hull/sail
  // geometry and materials belong to the scene-scope fleet cache. Overflow
  // procedural ghosts own their temporary cache and can dispose the full tree.
  if (visual.batched) {
    visual.root.traverse((object) => {
      if (object instanceof InstancedMesh) object.dispose();
    });
  } else disposeThreeObjectTree(visual.root);
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
  const harborDocks = content.docks.filter((dock) => harborDockIds.has(dock.recipe.dock.detailId));
  if (harborDocks.length === 0) return;
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
  // One shader mask cannot cover distant shore stations without flattening the
  // entire lake between them. Seat it just seaward of the largest represented
  // station; every selected station still gets its own pylon ripple above.
  const primary = harborDocks.toSorted((left, right) => (
    right.recipe.dock.totalUsd - left.recipe.dock.totalUsd
  ))[0]!;
  const bearing = primary.recipe.station.shoreBearing;
  scene.water.setHarborCalmMask({
    center: {
      x: primary.root.position.x + Math.cos(bearing) * 5,
      z: primary.root.position.z + Math.sin(bearing) * 5,
    },
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
/** How many of the busiest harbours get a route pulse lane (Phase 4). */
const GARDEN_ROUTE_PULSE_LANES = 4;

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
  // Paired approach lanterns at each station mouth. Both the geometry and this
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
      worldX: lantern.x,
      worldZ: lantern.z,
    });
  }
  for (const dock of docks) {
    for (const [lampIndex, lamp] of gardenDockLampWorldPositions(dock).entries()) {
      registry.set({
        color: HARBOR_PALETTE.lantern_glow,
        id: `dock-lamp.${dock.recipe.dock.detailId}.${lampIndex}`,
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
  // Phase 4 (item 3): data-pulse lanes on the busiest trade routes. The top
  // harbours by held value — the same traffic sizing the docks themselves
  // wear — get one segment each, from open water into the quay, so route
  // activity reads as glints flowing in off the sea. The pulse speed/phase
  // are seeded from the lane id inside the registry (never Math.random); the
  // lanes ride the same per-tier cap and day-cycle gate as every other lane.
  const busiest = docks
    .filter((dock) => Number.isFinite(dock.recipe.dock.totalUsd) && dock.recipe.dock.totalUsd > 0)
    .toSorted((left, right) => (
      right.recipe.dock.totalUsd - left.recipe.dock.totalUsd
      || left.recipe.dock.id.localeCompare(right.recipe.dock.id)
    ))
    .slice(0, GARDEN_ROUTE_PULSE_LANES);
  const busiestUsd = busiest[0]?.recipe.dock.totalUsd ?? 1;
  for (const dock of busiest) {
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

/**
 * Named harbour meshes that are static and lit but must never enter the shadow
 * map: they ARE the light. A lamp head or a lit warehouse window dropping its
 * own shadow reads as a bug at any hour, and at low sun it reads as a smear.
 */
const SHADOW_CASTER_EXCLUDED_NAMES = new Set([
  "dock-chain-flag-cloth",
  "dock-chain-flag",
  "dock-lamp-heads",
  "dock-warehouse-windows",
]);

/**
 * Flags one static subtree for the directional map: every lit surface casts,
 * every surface receives.
 *
 * Casting is keyed on MeshStandardMaterial because that is what "a real lit
 * surface" means in this world — the flat MeshBasicMaterial discs (island
 * shoal, harbour district pads, zone tints) are transparent paint on the water
 * and would stamp hard-edged silhouettes if they were ever allowed in.
 *
 * `castsShadows` lets a caller keep a subtree as a receiver only. That is what
 * the docks' LOD-toggled fine detail needs: the map is rendered on re-steer and
 * content change, NOT per frame (updateShadows), so anything whose `visible`
 * flips with zoom or hover would leave its shadow behind — or lose it — until
 * the next re-steer. Receiving has no such hazard: it is sampled per frame by
 * the material.
 */
function flagStaticShadowUsers(root: Object3D, castsShadows = true): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh) && !(object instanceof InstancedMesh)) return;
    const material = object.material;
    const lit = Array.isArray(material)
      ? material.some((entry) => entry instanceof MeshStandardMaterial)
      : material instanceof MeshStandardMaterial;
    object.castShadow = castsShadows
      && lit
      && !object.name.startsWith("harbor-fine-")
      && !SHADOW_CASTER_EXCLUDED_NAMES.has(object.name);
    object.receiveShadow = true;
  });
}

/**
 * The island part: terraces, the lighthouse (procedural shell until the GLB
 * lands), beacon fire, summit birds, signal mast and tide stain. Rebuilds only
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
  const island = createTerracedIsland(world, cloudShadows, scene.season);
  applyGardenMonthRecord(island.root, world.lighthouse.gardenMonthRecord);
  part.root.add(island.root);
  // The island stone/timber (and lighthouse, inside island.root) cast and
  // receive. The flat MeshBasicMaterial shoal is excluded so its transparent
  // disc never stamps a hard shadow; the harbour is flagged in its own part.
  flagStaticShadowUsers(island.root);
  part.cues.set(world.lighthouse.detailId, {
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
  // The procedural shell's gilt is per-build (fresh materials each rebuild),
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

  content.beacon = island.beacon;
  content.beaconFire = beaconFire;
  content.beaconFireRoot = beaconFire.root;
  content.beaconHalo = island.beaconHalo;
  content.beam = island.beam;
  content.decoration = island.decoration;
  content.lighthouseLight = island.lighthouseLight;
  content.lighthouseRoot = island.lighthouseRoot;
  content.lighthouseShell = island.lighthouseShell;
  content.pondReflection = island.pondReflection;
  content.signalMast = signalMast;
  content.statueGleamMaterials = statueGleamMaterials;
  content.summitBirds = summitBirds;
  content.summitBirdsRoot = summitBirds.root;
  content.tideStain = tideStain;
}

/** The cemetery and pigeonnier islets, keyed on their own world families. */
function buildLandmarksPart(content: GardenContent, world: PharosVilleWorld): void {
  const part = content.parts.landmarks;
  const cemetery = createGardenCemetery(world.graves);
  const pigeonnier = createGardenPigeonnier(world.pigeonnier);
  content.pigeonnier = pigeonnier;
  content.pigeonnierMoverPositions = pigeonnier.moverDetailIds.map(() => ({ x: 0, y: 0, z: 0 }));
  syncPigeonnierMoverShips(content);
  part.root.add(cemetery.root, pigeonnier.root);
  for (const [detailId, anchor] of cemetery.anchors) {
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

/** Shore stations, the Ethereum/L2 precinct bridges, and approach lanterns. */
function buildDocksPart(content: GardenContent, world: PharosVilleWorld): void {
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

  content.docks = batch.docks;
  content.harborBatch = batch;
  content.harborLanternMaterial = harborLanterns.lightMaterial;
}

/**
 * The light instanced life around the harbour — district pads, the gull
 * flock, fireflies. Keyed on the FULL dock family (including `change24hPct`,
 * which drives quay tempo), so the routine supply tick rebuilds this cheap
 * part and never the masonry it decorates.
 */
function buildHarborLifePart(content: GardenContent, world: PharosVilleWorld): void {
  const part = content.parts.harborLife;
  const islandTile = gardenIslandDisplayTile(world.lighthouse.tile);
  const harborDistricts = createGardenHarborDistricts(
    world.docks,
    world.lighthouse.tile,
  );
  // The flock works the quays as well as the island, so it needs the same dock
  // list the harbour districts got — that is what carries harbour tempo.
  const gullFlock = createGardenGullFlock(world.lighthouse.tile, {
    docks: world.docks,
  });
  const fireflies = createGardenFireflies(
    gardenIslandLanternWorldOffsets(),
    islandTile,
  );
  part.root.add(harborDistricts.root, gullFlock.root, fireflies.root);

  content.fireflies = fireflies;
  content.gullFlock = gullFlock;
}

/**
 * The mint/burn cargo run and the weekly supply-tide plates. Both read the
 * composed dock visuals, so this part sits after `docks` in the build order
 * and its key includes the dock structure.
 */
function buildCargoTidePart(content: GardenContent, world: PharosVilleWorld): void {
  const part = content.parts.cargoTide;
  // Tier 3 #3: the world's first FLOW cue. Built after the harbours are placed
  // because each crate's berth is a harbour-local slot resolved through that
  // harbour's own yaw and position — one mesh for the ring, not one per quay.
  const cargoTide = createGardenCargoTide(cargoTideSpecs(content.docks));
  part.root.add(cargoTide.root);
  // The tide is one global reading, so every quay's plate is identical and the
  // whole ring shares one geometry — see garden-tide-line.ts.
  const tideLine = createGardenTideLine(
    content.docks.map((visual) => ({
      detailId: visual.recipe.dock.detailId,
      width: visual.recipe.tideFace.width,
      x: visual.root.position.x + visual.recipe.tideFace.x * Math.cos(visual.root.rotation.y)
        + visual.recipe.tideFace.z * Math.sin(visual.root.rotation.y),
      y: visual.root.position.y + visual.recipe.tideFace.y,
      yaw: visual.root.rotation.y,
      z: visual.root.position.z - visual.recipe.tideFace.x * Math.sin(visual.root.rotation.y)
        + visual.recipe.tideFace.z * Math.cos(visual.root.rotation.y),
    })),
    world.supplyTide,
  );
  part.root.add(tideLine.root);

  content.cargoTide = cargoTide;
  content.tideLine = tideLine;
}

/**
 * The fleet: per-ship visuals, contact shadows, lanterns, cross-bearing
 * buoys, hero reflections and hero gulls. The instanced batches and the sail
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
    return createBatchedShip(
      ship,
      displayOffset,
      representative,
      shipGeometryCache,
      atlasCell,
    );
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
        ? createBatchedShip(
            seed.ship,
            seed.displayOffset,
            seed.representative,
            shipGeometryCache,
            0,
          )
        : createShip(
            seed.ship,
            seed.displayOffset,
            seed.representative,
            {
              geometries: new Map(),
              wakeFillMaterial: shipGeometryCache.wakeFillMaterial.clone(),
              wakeMaterial: shipGeometryCache.wakeMaterial.clone(),
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
  // patrols up to `GARDEN_MAX_MOTION_TILES` from its anchor, so a buoy nailed
  // to the berth would spend most of its time nowhere near the ship it is
  // describing, and a cue you cannot associate with its subject is not a cue.
  const buoyShips = ships.filter((visual) => visual.ship.dexCrossCheck?.agrees === false);
  const buoySpecs: CrossBearingBuoySpec[] = buoyShips.map((visual) => ({
    detailId: visual.ship.detailId,
    hullRadius: visual.selectionRadius,
  }));
  const crossBearingBuoys = createGardenCrossBearingBuoys(buoySpecs);
  part.root.add(crossBearingBuoys.root);

  // W6.4: the mirror column, extended from the Pharos to the fleet. Only the
  // hero hulls get one — they are the ships with a silhouette worth reflecting,
  // and the batched fleet is a shared instance whose per-ship colour lives in a
  // buffer rather than on a visual.
  const heroReflectionShips = ships.filter((visual) => !visual.batched);
  const heroReflections = createGardenHeroReflections(heroReflectionShips.length);
  part.root.add(heroReflections.mesh);

  // Gulls over the biggest hulls in the fleet. Ranked by the same market cap
  // the hull scale already encodes, so the traffic agrees with the size.
  const shipGulls = createGardenShipGulls(
    [...heroReflectionShips]
      .sort((left, right) => (right.ship.marketCapUsd ?? 0) - (left.ship.marketCapUsd ?? 0))
      .slice(0, GARDEN_GULL_SHIP_COUNT),
  );

  // 3d: the bearing the beam will settle on. Null when the index named no
  // contributor, or when the coin it named is not in the rendered fleet — the
  // sweep then keeps the even turn it has always had.
  content.beamDwellBearing = computeBeamDwellBearing(world, slice);
  content.crossBearingBuoyShips = buoyShips;
  content.crossBearingBuoys = crossBearingBuoys;
  content.fleetLanterns = fleetLanterns;
  content.wakeBatch = wakeBatch;
  content.wakeOutsiderSlot = wakeSlots.outsiderSlot;
  content.heroReflectionShips = heroReflectionShips;
  content.heroReflections = heroReflections;
  content.shipGulls = shipGulls;
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
      );
      queueShipTransition(
        content,
        gardenShipTransition(
          visual.ship.id,
          from,
          target,
          staged.oldIds.has(visual.ship.id) ? "reanchor" : "arrival",
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
          ),
          "departure",
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
  for (const ship of world.ships) {
    const target = shipIssuanceDraft(ship.issuance);
    content.issuanceDraftTargetById.set(ship.id, target);
    if (!content.issuanceDraftById.has(ship.id)) {
      content.issuanceDraftById.set(ship.id, content.hasReconciledWorld ? 0 : target);
    }
  }
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
 * and the wreck shoals, which have no area record at all but are a place with
 * a name like any other. These steles are the sea's in-world place-name display;
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

function seaSignBodyForDetail(
  world: PharosVilleWorld,
  detailId: string | null,
): SeaBodyName | null {
  if (!detailId) return null;
  for (const area of world.areas) {
    if (area.detailId === detailId) return seaBodyForArea(area);
  }
  // Wreck Shoal has no area detail record. Inspecting any of its lifecycle
  // wrecks activates the body stele while the ledger keeps every grave's DOM
  // record intact.
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

/**
 * Re-centres the directional light's shadow frustum on the island and remote
 * station roots and sets the per-tier cost, returning the active shadow-map size
 * (0 when off).
 * Shadow support stays compiled (enabled + castShadow never change); cost is
 * toggled via `shadow.intensity`/`autoUpdate` and the map is only reallocated
 * on a tier change, so no material recompile stalls occur.
 */
function updateShadows(
  scene: GardenScene,
  frame: ThreeWorldRendererFrame,
  phase: DayCyclePhase,
): number {
  const light = scene.directionalLight;
  const islandTile = gardenIslandDisplayTile(frame.world.lighthouse.tile);
  const staticBounds = gardenStaticShadowBounds([
    { x: islandTile.x * TILE_SCALE, z: islandTile.y * TILE_SCALE },
    ...frame.world.docks.map((dock) => {
      const tile = gardenDockDisplayTile(dock.tile);
      return { x: tile.x * TILE_SCALE, z: tile.y * TILE_SCALE };
    }),
  ]);

  // The key light rides the day's arc (garden-sun.ts) instead of sitting at a
  // fixed bearing, so shadow DIRECTION and LENGTH now say what time it is.
  const pose = gardenKeyLightPose(frame.wallClockHour, phase, scratchKeyPose);
  const direction = pose.direction;

  // A low sun throws a long shadow, and a frustum centred on the island would
  // simply clip it. Push the frustum downstream by half the tower's reach so
  // the whole shadow stays inside the map.
  //
  // The arithmetic is kinder than it looks. A caster of height h at elevation e
  // reaches L = h/tan(e) along the ground, and a ground distance d projects to
  // d·sin(e) in the light's image plane — so the shadow always spans exactly
  // h·cos(e) there, never more than h however low the sun gets. Centring on
  // half of that costs a ground offset of L/2 and buys a frustum that only has
  // to grow by h·cos(e)/2.
  const groundLength = Math.hypot(direction.x, direction.z) || 1;
  const reach = Math.min(
    SHADOW_CASTER_HEIGHT / Math.max(Math.tan(pose.elevation), 1e-3),
    SHADOW_MAX_REACH,
  );
  const frustumX = staticBounds.centerX - (direction.x / groundLength) * reach * 0.5;
  const frustumZ = staticBounds.centerZ - (direction.z / groundLength) * reach * 0.5;
  light.target.position.set(frustumX, 3, frustumZ);
  light.position.set(
    frustumX + direction.x * SHADOW_LIGHT_DISTANCE,
    3 + direction.y * SHADOW_LIGHT_DISTANCE,
    frustumZ + direction.z * SHADOW_LIGHT_DISTANCE,
  );

  const halfSize = staticBounds.radius
    + (SHADOW_CASTER_HEIGHT * Math.cos(pose.elevation)) / 2;
  const shadowCamera = light.shadow.camera;
  if (Math.abs(shadowCamera.right - halfSize) > 0.25) {
    shadowCamera.left = -halfSize;
    shadowCamera.right = halfSize;
    shadowCamera.top = halfSize;
    shadowCamera.bottom = -halfSize;
    shadowCamera.updateProjectionMatrix();
    scene.shadowNeedsRender = true;
  }

  // The map is still not re-rendered per frame — see below — but "the light
  // direction is fixed" is no longer one of the reasons why. It is re-rendered
  // when the sun has actually MOVED past a threshold finer than the softest
  // shadow edge. At the fastest the arc ever swings (the dusk handover, ~5° per
  // three real minutes) that is one extra static-caster pass every ~20 s.
  if (direction.angleTo(scene.shadowLightDirection) > SHADOW_RESTEER_RADIANS) {
    scene.shadowLightDirection.copy(direction);
    scene.shadowNeedsRender = true;
  }

  // W6.2 (Grand Scale Revamp): shadows survive down to `recovery`.
  //
  // The casters (island, lighthouse, and shore stations) are static and the light
  // direction moves only on the re-steer threshold above, so
  // `autoUpdate = false` means the map is rendered on scene change and on
  // re-steer, not per frame — the recurring cost is still just the PCF taps in
  // the receiving materials.
  //
  // Dropping that at `recovery` bought almost nothing
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
  //
  // The map dimensions stay fixed while the world-derived frustum grows to the
  // rim. In the dense fixture the static radius is 114.27 world units: 8.96
  // texels/world at full, 4.48 at balanced, and 3.36 at recovery before the
  // time-of-day shadow-reach allowance. Cost remains episodic: this pass runs
  // on re-steer/content change, while recurring PCF sampling is unchanged.
  const shadowTier = seaQualityTier(frame.renderScheduler);
  const size = shadowTier === "full"
    ? 2048
    : shadowTier === "balanced"
      ? 1024
      : shadowTier === "constrained"
        ? 0
        : 768;
  if (size === 0) {
    light.shadow.intensity = 0;
    light.shadow.autoUpdate = false;
    scene.shadowActiveSize = 0;
    return 0;
  }
  light.shadow.intensity = 1;
  // The casters (island, lighthouse, and all shore stations) are
  // static, so the shadow map only needs re-rendering when the scene, the
  // frustum size, or the sun's bearing changes — not every frame. This keeps
  // the extra pass near-zero cost. Ships stay out of the map for exactly this
  // reason: one moving caster would make it a per-frame pass again.
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
  uploadScheduler: TextureUploadScheduler,
  onAssetReady?: () => void,
): void {
  updateCamera(camera, frame);
  const weather = scene.weather;
  // Advance the beam's own clock before any early return, so a frame drawn
  // without world content cannot leave a gap for the next one to jump across.
  const beamElapsedSeconds = Math.max(0, frame.timeSeconds - scene.beamClockSeconds);
  scene.beamClockSeconds = frame.timeSeconds;
  scene.sky.update(phase, {
    reducedMotion: frame.reducedMotion,
    wallClockHour: frame.wallClockHour,
    viewHeight: gardenCameraViewHeight(frame.height, frame.camera.zoom),
    targetX: camera.position.x - CAMERA_DISTANCE,
    targetZ: camera.position.z - CAMERA_DISTANCE,
    timeSeconds: frame.timeSeconds,
    stormLevel: weather.stormLevel,
    // Phase 2 billboard atmosphere (mist banks + cumulus): full/balanced only,
    // resolved through the sea tier (S1) so a camera drag never blinks them.
    billboards: ["full", "balanced"].includes(seaQualityTier(frame.renderScheduler)),
    wind: weather,
  });
  const seasonalIslandTile = gardenIslandDisplayTile(frame.world.lighthouse.tile);
  scene.almanacDressing.update({
    activeEvent: frame.almanacEvent ?? null,
    deltaSeconds: beamElapsedSeconds,
    islandX: seasonalIslandTile.x * TILE_SCALE,
    islandZ: seasonalIslandTile.y * TILE_SCALE,
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
  });
  scene.seasonalDressing.update({
    islandX: seasonalIslandTile.x * TILE_SCALE,
    islandZ: seasonalIslandTile.y * TILE_SCALE,
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
    weather,
  });
  updateDayCycle(scene, frame, phase);
  const epistemicHaze = deriveEpistemicHaze(frame.world.freshness);
  scene.water.setPegSummaryEpistemicHaze(epistemicHaze.riskWaters);
  setGardenQuayEpistemicHaze(epistemicHaze.quays);
  scene.content?.pondReflection.update(phase);
  // Phase 2 lightning: the strike's flash doubles through the existing
  // shadow-casting key light for its ~0.3 s envelope. No new lights; the
  // day-cycle intensity above remains the base this multiplies, and the
  // reduced-motion plan holds the flash at 0.
  if (weather.lightning > 0) {
    scene.directionalLight.intensity *= 1 + weather.lightning * 2.2;
  }
  updateLighthouseRimLight(phase);
  // Phase 3: bind the wake field's front texture and window before the water
  // samples them (the field itself advanced at the top of render()).
  scene.water.setWakeState(scene.wakes.texture, scene.wakes.centerX, scene.wakes.centerY, scene.wakes.halfSize);
  scene.water.update(frame, weather);
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
  content.shipLanternMaterial.emissive.set(
    scene.season === "winter"
      ? HARBOR_PALETTE.lantern_warm
      : HARBOR_PALETTE.lantern_glow,
  );

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
  content.gullFlock.update({
    constrained,
    night: phase.night,
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
    weather,
  });
  content.fireflies.update({
    fullTier: frame.renderScheduler.tier === "full",
    night: phase.night,
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
  // Phase 2 god rays: the cone's volumetric terms are uniform-gated, so the
  // recovery cone stays the pre-Phase-2 shader bit-exact (one material, no
  // tier-transition compile). Full/balanced shade mist noise, a storm-driven
  // density/lift, and a forward-scattering flare — which under the fixed
  // ortho view collapses to one exact dot of beam axis vs view axis, so the
  // beam blooms as it sweeps toward the camera. seaQualityTier keeps a
  // camera drag (interaction) from blinking the volumetric look mid-gesture.
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
      coneUniforms.uScatter.value = beamScatter;
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
  // W2a: steles keep true world scale and whisper until the body is hovered or
  // inspected. Stone place-name UP; camera-compensated board label DOWN.
  content.seaSigns.update({
    // W0.7 follow-up: the frame's own clock and motion policy, so the D6 rung
    // settle runs on the same delta as every other eased system instead of the
    // module keeping a second `performance.now()` and a second matchMedia
    // watcher of its own.
    activeBody: seaSignBodyForDetail(frame.world, frame.selectedDetailId)
      ?? seaSignBodyForDetail(frame.world, frame.hoveredDetailId),
    deltaSeconds: beamElapsedSeconds,
    night: phase.night,
    reducedMotion: frame.reducedMotion,
    visible: seaSignsDebugVisible(),
    zoom: frame.camera.zoom,
  });
  let showAnyDockDetail = showWorldDetail;
  const flagBreath = gardenBreathAt(breathTime, GARDEN_BREATH_PHASE.sails);
  for (const visual of content.docks) {
    const chainId = visual.recipe.dock.chainId;
    const flagRoll = frame.reducedMotion
      ? 0
      : (gardenGustAtWorldPosition(
        breathTime,
        visual.root.position.x,
        visual.root.position.z,
        weather,
      ) - 0.35) * 0.055 + (flagBreath - 0.5) * 0.025;
    content.harborBatch?.setFlagPose(
      chainId,
      frame.reducedMotion
        ? visual.recipe.flag.placement.yaw
        : -visual.root.rotation.y - weather.windAngle,
      flagRoll,
    );
    visual.fineDetail.visible = showWorldDetail
      || visual.recipe.dock.detailId === frame.hoveredDetailId
      || visual.recipe.dock.detailId === frame.selectedDetailId;
    showAnyDockDetail ||= visual.fineDetail.visible;
  }
  content.harborBatch?.setFineDetailVisible(showAnyDockDetail);

  // W1: the batched fleet is restamped from scratch each frame. Counts reset
  // here, poses are written in the ship loop, and every touched buffer is
  // flushed once at the end — one upload per buffer, not one per ship.
  // Phase 2: one weather write moves every sail and pennant in the fleet.
  setFleetWeather({
    breath: gardenBreathAt(breathTime, GARDEN_BREATH_PHASE.sails),
    gust: weather.gust,
    timeSeconds: frame.timeSeconds,
    windAngle: weather.windAngle,
    windDirX: weather.windDirX,
    windDirZ: weather.windDirZ,
    windSpeed: weather.windSpeed,
  });
  // ...and one aerial write gives the whole fleet its recession. Reads the fog
  // planes the sky already view-scaled above (scene.sky.update runs earlier in
  // this same function), so the chroma ramp and the haze can never disagree
  // about where the distance begins.
  setFleetAerialPerspective({
    fogNear: scene.sky.fog.near,
    fogFar: scene.sky.fog.far,
    strength: GARDEN_FLEET_AERIAL_STRENGTH,
    zoom: frame.camera.zoom,
  });
  removeCompletedDepartures(scene, content, frame.timeSeconds);
  beginFleetFrame(content.fleetBatches);
  const sailTexture = content.sailAtlas.texture;
  const logoGeneration = frame.logos.getLogoGenerationKey();
  if (sailTexture && content.sailAtlas.logoGenerationKey !== logoGeneration) {
    const ships = content.ships.map((visual) => visual.ship);
    const logos = frame.logos;
    // W4.1: the atlas paint belongs to the current ships build. A ships
    // rebuild replaces the part owner, which cancels this task and lets the
    // rebuild's own repaint supersede it.
    const shipsPart = content.parts.ships;
    const owner = shipsPart.owner;
    // Defer BOTH repaint and upload. Painting here would increment the
    // CanvasTexture version and let Three auto-upload the 2048² atlas during
    // the hot scene draw before the queue had a chance to run.
    uploadScheduler.schedule({
      isOwnerValid: () => scene.content === content && shipsPart.owner === owner,
      key: `sail-atlas.${sailTexture.uuid}`,
      onOwnerDrained: () => {
        if (scene.content === content) onAssetReady?.();
      },
      owner,
      ownerName: "fleet.sail-atlas",
      prepare: () => syncGardenSailAtlas(
        content.sailAtlas,
        ships,
        logos,
      ),
      texture: sailTexture,
    });
  }

  let visibleShipCount = 0;
  const issuanceAlpha = frame.reducedMotion
    ? 1
    : 1 - Math.exp(-MathUtils.clamp(beamElapsedSeconds, 0, 0.25) / GARDEN_SCALAR_TRANSITION_SECONDS);
  for (const visual of content.ships) {
    const target = content.issuanceDraftTargetById.get(visual.ship.id)
      ?? shipIssuanceDraft(visual.ship.issuance);
    const current = content.issuanceDraftById.get(visual.ship.id) ?? target;
    content.issuanceDraftById.set(visual.ship.id, current + (target - current) * issuanceAlpha);
  }
  // Indexed rather than `entries()`: the iterator mints an `[index, value]` pair
  // per hull per frame, and this loop runs over the whole fleet. Same below.
  const renderedShipCount = content.ships.length + content.departingShips.length;
  for (let index = 0; index < renderedShipCount; index += 1) {
    const departing = index >= content.ships.length;
    const visual = departing
      ? content.departingShips[index - content.ships.length]!
      : content.ships[index]!;
    const sample = departing ? undefined : frame.shipMotionSamples.get(visual.ship.id);
    const targetTile = resolveGardenShipDisplayTile({
      displayOffset: visual.displayOffset,
      representative: visual.representative,
      sample,
      ship: visual.ship,
    });
    const transition = content.shipTransitions.get(visual.ship.id)
      ?? content.pendingShipTransitions.get(visual.ship.id);
    let tile = targetTile;
    let transitionVisibility = 1;
    let transitionHeadingX = 0;
    let transitionHeadingY = 0;
    if (transition) {
      const transitionSample = sampleGardenShipTransition(
        transition,
        frame.timeSeconds,
        transitionFrameSample,
      );
      if (transitionSample.complete && !departing) {
        content.shipTransitions.delete(visual.ship.id);
      } else {
        const targetBerth = transition.to;
        // Existing within-berth patrol motion remains live, but its ANCHOR is
        // the easing path. Departures have no new-world motion sample.
        tile = {
          x: transitionSample.x + (departing ? 0 : targetTile.x - targetBerth.x),
          y: transitionSample.y + (departing ? 0 : targetTile.y - targetBerth.y),
        };
        transitionVisibility = transitionSample.visibility;
        transitionHeadingX = transitionSample.headingX;
        transitionHeadingY = transitionSample.headingY;
      }
    }
    const dependency = !transition && !departing ? visual.ship.dependencyFormation : null;
    if (dependency) {
      const parent = content.ships.find((entry) => entry.ship.id === dependency.parentId);
      if (parent) {
        const side = stableUnit(`dependency-formation.${visual.ship.id}`) < 0.5 ? -1 : 1;
        const spacing = 1.6 + dependency.weight * 1.4;
        const parentTile = resolveGardenShipDisplayTile({
          displayOffset: parent.displayOffset,
          representative: parent.representative,
          sample: frame.shipMotionSamples.get(parent.ship.id),
          ship: parent.ship,
        });
        tile = {
          x: parentTile.x + side * spacing,
          y: parentTile.y + spacing * 0.55,
        };
      }
    }
    visual.root.visible = true;
    visibleShipCount += 1;
    visual.root.scale.setScalar(
      gardenShipVisualScale(visual.ship.visual.scale || 1) * transitionVisibility,
    );
    setTilePosition(visual.root, tile, GARDEN_SHIP_ROOT_Y);

    const heading = Math.hypot(transitionHeadingX, transitionHeadingY) > 0.5
      ? { x: transitionHeadingX, y: transitionHeadingY }
      : normalizedHeading(sample?.heading);
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
    const bobBreath = gardenBreathAt(breathTime, GARDEN_BREATH_PHASE.bob);
    const bobAmplitude = frame.reducedMotion
      ? 0
      : (0.035 + frame.seaState.swell * 0.055)
        * visual.motionAmplitudeScale
        * (0.92 + bobBreath * 0.16);
    visual.root.position.y += Math.sin(
      frame.timeSeconds * (0.72 + frame.seaState.tempo * 0.25) / visual.motionPeriodScale
      + visual.bobPhase,
    ) * bobAmplitude;
    const issuanceDraft = departing ? 0 : content.issuanceDraftById.get(visual.ship.id) ?? 0;
    // Hero hulls are their own scene graph, so their whole root takes draft.
    // Batched hulls take the same offset through aHullForm.w below.
    if (!visual.batched) visual.root.position.y += issuanceDraft;
    visual.sampleState = transition
      ? (departing ? "departing" : transition.kind === "arrival" ? "arriving" : "sailing")
      : (sample?.state ?? "idle");
    // Lay a warm reflection lane on the sea under each ship's lantern(s).
    scene.laneRegistry.set({
      color: HARBOR_PALETTE.lantern_glow,
      id: `ship-lantern.${visual.ship.id}`,
      intensity: visual.laneIntensity,
      kind: "lantern",
      worldX: visual.root.position.x,
      worldZ: visual.root.position.z,
    });
    const wakeBreath = gardenBreathAt(breathTime, GARDEN_BREATH_PHASE.wakes);
    const wakeIntensityBase = transition && !frame.reducedMotion
      ? Math.max(sample?.wakeIntensity ?? 0, 0.68 * transitionVisibility)
      : (sample?.wakeIntensity ?? 0);
    const wakeIntensity = wakeIntensityBase * (0.94 + wakeBreath * 0.12);
    const showShipDetail = showWorldDetail
      || visual.ship.detailId === frame.hoveredDetailId
      || visual.ship.detailId === frame.selectedDetailId;
    // Wakes remain a fleet-motion cue in overview/explore. In analyze, where a
    // selection already owns the hierarchy, retain only the focused hull's
    // wake so unrelated foam cannot compete with its ring, route, or panel.
    const wakeVisible = !frame.reducedMotion
      && !constrained
      && wakeIntensity > 0.08
      && overviewDetail > 0
      && (semanticView !== "analyze" || showShipDetail);
    const wakeScaleX = (0.7 + Math.min(1.5, wakeIntensity) * 0.85) * overviewDetail;
    visual.wake.visible = wakeVisible;
    // The close-range line detail stays under its ship-local anchor and keeps
    // the same longitudinal intensity stretch as before the quad cutover.
    visual.wake.scale.x = wakeScaleX;
    scratchWakePose.x = visual.root.position.x;
    scratchWakePose.y = visual.root.position.y;
    scratchWakePose.z = visual.root.position.z;
    scratchWakePose.headingY = visual.root.rotation.y;
    scratchWakePose.hullScale = visual.root.scale.x;
    content.wakeBatch.setShip(
      visual.wakeSlot,
      scratchWakePose,
      wakeVisible,
      wakeScaleX,
    );
    // Phase 3 (item 2): stamp the persistent wake field for every hull making
    // way. The pose is final for this frame and the heading already
    // normalized — the field consumes these at the top of next frame.
    if (heading && wakeIntensity > 0.12 && !frame.reducedMotion) {
      scene.wakes.stamp(
        visual.root.position.x,
        visual.root.position.z,
        heading.x,
        heading.y,
        Math.min(1, wakeIntensity),
        visual.ship.visual.hullForm?.length ?? 1,
      );
    }
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
      const authoredHullForm = visual.ship.visual.hullForm;
      scratchIssuanceHullForm.beam = authoredHullForm.beam;
      scratchIssuanceHullForm.agePatina = authoredHullForm.agePatina ?? -1;
      scratchIssuanceHullForm.fittingCode = authoredHullForm.fittingCode ?? 0;
      scratchIssuanceHullForm.height = authoredHullForm.height;
      scratchIssuanceHullForm.hullValue = authoredHullForm.hullValue ?? 1;
      scratchIssuanceHullForm.length = authoredHullForm.length;
      scratchIssuanceHullForm.propRotation = authoredHullForm.propRotation ?? 0;
      scratchIssuanceHullForm.ropeSag = authoredHullForm.ropeSag ?? 0;
      scratchIssuanceHullForm.waterline = (authoredHullForm.waterline ?? 0) + issuanceDraft;
      writeFleetInstance(content.fleetBatches, {
        atlasCell: visual.atlasCell,
        headingAngle: visual.root.rotation.y,
        heel: visual.root.rotation.z,
        hullColor: visual.hullColor,
        hullForm: scratchIssuanceHullForm,
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
  content.wakeBatch.commit();
  endFleetFrame(content.fleetBatches);
  // W4.1: the shadow buffer holds a spare slot for the transient outsider;
  // clamp the live count so slots beyond the fleet are never drawn.
  content.shipShadows.count = renderedShipCount;
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
  for (let index = 0; index < content.issuanceWorksetShips.length; index += 1) {
    const visual = content.issuanceWorksetShips[index]!;
    content.issuanceWorksets.place(
      index,
      visual.root.position.x,
      GARDEN_SHIP_ROOT_Y,
      visual.root.position.z,
      visual.root.rotation.y,
    );
  }
  content.issuanceWorksets.flush({
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
  for (let index = 0; index < content.pigeonnier.moverDetailIds.length; index += 1) {
    const visual = content.pigeonnierMoverShips[index];
    const position = content.pigeonnierMoverPositions[index]!;
    if (visual) {
      position.x = visual.root.position.x;
      position.y = visual.root.position.y;
      position.z = visual.root.position.z;
    }
  }
  content.pigeonnier.update({
    moverPositions: content.pigeonnierMoverPositions,
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
  });
  syncShipRippleRings(scene.water.rippleRings, content.ships, {
    reducedMotion: frame.reducedMotion,
    tier: seaQualityTier(frame.renderScheduler),
  });
  updateFleetLanterns(
    content.fleetLanterns,
    camera.quaternion,
    frame.reducedMotion ? 0 : frame.timeSeconds,
    frame.reducedMotion,
    {
      hoveredDetailId: frame.hoveredDetailId,
      selectedDetailId: frame.selectedDetailId,
    },
  );
  const activeLaneCount = scene.laneRegistry.sync(frame.renderScheduler.tier, laneGlowScale, {
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
  });
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
    gardenBreathAt(breathTime, GARDEN_BREATH_PHASE.bob),
  );

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
