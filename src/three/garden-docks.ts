import {
  BoxGeometry,
  Box3,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MathUtils,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { mergeGeometries, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  stationFootprint,
  stationNobori,
  harborAmountScale,
  HARBOR_QUAY_TOP_Y as QUAY_TOP_Y,
  stationScaleFor,
  type StationFootprint,
  type StationScale,
  type StationNobori,
  type StationType,
} from "../systems/dock-layout";
import { GARDEN_DOCK_ROOT_Y, GARDEN_WATER_Y as WATER_LEVEL } from "../systems/garden-observatory-slice";
import { quayMasonryHealth } from "../systems/dock-health";
import { HARBOR_PALETTE } from "../systems/palette";
import { REST_SEAT_EYE_LANDSCAPE } from "../systems/rest-seat";
import type { DockNode } from "../systems/world-types";
import { assignGardenChainFlagCell } from "./garden-chain-flag";
import { GARDEN_KINDLE_ORDER, patchGardenLanternKindling } from "./garden-lanterns";
import { setTilePosition, stableUnit } from "./garden-util";
export type { StationType } from "../systems/dock-layout";

const scratchMatrix = new Matrix4();
const scratchScale = new Vector3();

/** What each station is known by at ground level (harbour-1); the house itself is one vernacular. */
export type StationSignature =
  | "enclosed-basin"
  | "noren-stair"
  | "steelyard"
  | "engawa"
  | "net-racks"
  | "gangi-stairs"
  | "boat-mouth"
  | "ishigaki-mole"
  | "dove-holes";
export type StationRoofline =
  | "hip-hall"
  | "stacked-irimoya"
  | "mono-pitch"
  | "lean-to"
  | "irimoya"
  | "gable";

export interface HarborIdentity {
  stationType: StationType;
  roofline: StationRoofline;
  signature: StationSignature;
}
export type HarborPlan = StationType;
export type HarborSignature = StationSignature;

export interface HarborFeatureDimensions {
  footprint: { length: number; span: number };
  height: number;
}

/**
 * Measured recipe evidence for the vernacular contract. Keeping this beside
 * the geometry makes it testable without splitting the global material
 * buckets into per-station meshes merely to give their pieces names.
 */
export interface HarborStationFeatures {
  /**
   * The station's main roof: its eave footprint carries supply frontage, its
   * height is the ridge, and `eaveY` its lowest eave — so the roof's share of
   * the elevation above the quay is measurable.
   */
  roof: HarborFeatureDimensions & { eaveY: number };
  quayPlatform: HarborFeatureDimensions;
  /** Lit paper panels: one shoji per station (the Mole adds its portal pair). */
  warmWindowCount: number;
}

const STATION_TYPES: readonly StationType[] = [
  "ethereum-mole", "hatago-wharf", "uogashi", "stepped-inlet",
  "fishing-pier", "tea-house-quay", "reed-boathouse", "storm-mole",
  "pigeonnier-islet",
];
const STATION_IDENTITY: Record<StationType, Omit<HarborIdentity, "stationType">> = {
  "ethereum-mole": { roofline: "hip-hall", signature: "enclosed-basin" },
  "fishing-pier": { roofline: "lean-to", signature: "net-racks" },
  "hatago-wharf": { roofline: "stacked-irimoya", signature: "noren-stair" },
  "pigeonnier-islet": { roofline: "irimoya", signature: "dove-holes" },
  "reed-boathouse": { roofline: "gable", signature: "boat-mouth" },
  "stepped-inlet": { roofline: "irimoya", signature: "gangi-stairs" },
  "storm-mole": { roofline: "irimoya", signature: "ishigaki-mole" },
  "tea-house-quay": { roofline: "irimoya", signature: "engawa" },
  uogashi: { roofline: "mono-pitch", signature: "steelyard" },
};

/** Standalone fallback until the systems branch supplies `dock.station`. */
const LEGACY_STATION_BY_CHAIN: Record<string, StationType> = {
  arbitrum: "storm-mole",
  base: "hatago-wharf",
  bsc: "tea-house-quay",
  ethereum: "ethereum-mole",
  hyperliquid: "fishing-pier",
  "hyperliquid-l1": "fishing-pier",
  polygon: "reed-boathouse",
  solana: "uogashi",
  ton: "pigeonnier-islet",
  tron: "stepped-inlet",
};

/**
 * Harbour-3: the broad dark terrace arc (VISUAL_INVARIANTS: "leave a broad
 * dark terrace arc bare; neither lamps nor boats form an evenly spaced ring").
 * The three western coves keep no stone lantern; their stations still show
 * their one lit shoji, so no harbour is unfindable after dark.
 */
const HARBOR_DARK_COVES: Record<string, true> = { "ethereum-mole": true, "ledger-fog-hook": true, "wreck-shoal-east": true };

interface DockStationContract {
  coveId: string;
  type: StationType;
  shoreBearing: number;
}
type DockWithOptionalStation = DockNode & { station?: Partial<DockStationContract> };

export interface DockVisual { recipe: DockRecipe; fineDetail: Group; root: Group }
export type HarborBucket = "timber" | "stone" | "metal" | "accent" | "wall" | "window" | "roof";
export type HarborPropKind = "post" | "plank" | "bollard" | "piling" | "netRack" | "reedClump";
export interface HarborBucketPart {
  bucket: HarborBucket;
  geometry: BufferGeometry;
  color: Color;
  fineDetail: boolean;
  castShadow: boolean;
}
export interface HarborPropInstance {
  kind: HarborPropKind;
  matrix: Matrix4;
  color: Color | null;
  fineDetail: boolean;
}
export interface HarborFlagSpec {
  chainId: string;
  atlasCell: number;
  /** The station's nobori (plan K28): one banner, or the Mole's pair, all facing `placement.yaw`. */
  placement: StationNobori;
  /** Static per-chain phase of the travelling folds (harbour-2), radians. */
  wavePhase: number;
}
/**
 * A split doorway curtain (harbour-6): station-local top-centre, hanging
 * square to the seaward axis. It flies in the nobori cloth batch so it moves
 * in the same wind as the banners.
 */
export interface HarborNorenSpec {
  x: number;
  topY: number;
  z: number;
  width: number;
  height: number;
}

export const CARGO_TIDE_SLOTS = 6;
export interface CargoTideSlot { x: number; y: number; z: number }
export interface CargoTideLanes { aboard: CargoTideSlot[]; ashore: CargoTideSlot[] }
export interface DockTideFace { x: number; y: number; z: number; width: number }
export interface DockRecipe {
  dock: DockNode;
  station: DockStationContract;
  rootMatrix: Matrix4;
  anchorPosition: Vector3;
  anchorRotationY: number;
  parts: HarborBucketPart[];
  props: HarborPropInstance[];
  flag: HarborFlagSpec;
  noren: HarborNorenSpec[];
  /** Ridge chimney anchor for the three hearth archetypes; null elsewhere. */
  chimney: StationChimneyAnchor | null;
  cargoTideLanes: CargoTideLanes;
  tideFace: DockTideFace;
  footprint: StationFootprint;
  features: HarborStationFeatures;
  identity: HarborIdentity;
  /**
   * The station's one stone lantern (harbour-3), in world space: on the quay
   * nose, off-centre on the rest seat's side. Null in the dark terrace arc.
   */
  lantern: { x: number; y: number; z: number } | null;
  /**
   * The station's place in the evening's kindling (contract H-A): 0 kindles
   * first beside the beacon, 1 last. Distance from the Pharos, unevenly
   * jittered per chain; the station's shoji follows a step behind its lantern.
   */
  kindleOrder: { lantern: number; shoji: number };
  plan: HarborPlan;
  signature: HarborSignature;
  quayHealth: number;
  accentColor: Color;
}

const PIER_DECK_TOP_Y = 0.24;
/** Bamboo nobori pole (shared `post` instance). */
const NOBORI_POLE_RADIUS = 0.055;

/** One kindled stone lantern per lit station, on its quay nose (harbour-3). */
export function gardenHarborLanternWorldPositions(
  recipes: readonly DockRecipe[],
): { x: number; z: number }[] {
  return recipes.flatMap((recipe) => (recipe.lantern ? [{ x: recipe.lantern.x, z: recipe.lantern.z }] : []));
}

/**
 * The harbour's stone lanterns: a kasuga form (hexagonal base, shaft,
 * platform, kasa and hōju, ≈1.7 u) in one stone draw, and its fire-box as a
 * second, kindled instance draw. Each fire-box carries its station's kindle
 * order, so the ring lights in the evening's order (contract H-A).
 */
export function createHarborLanterns(
  recipes: readonly DockRecipe[],
): {
  lightMaterial: MeshStandardMaterial;
  root: Group;
} {
  const root = new Group();
  const lit = recipes.filter((recipe) => recipe.lantern !== null);
  const count = lit.length;
  const bodyMaterial = new MeshStandardMaterial({
    color: new Color(HARBOR_PALETTE.stone_mid).lerp(new Color(HARBOR_PALETTE.stone_pale), 0.45),
    roughness: 0.95,
  });
  const lightMaterial = new MeshStandardMaterial({
    color: HARBOR_PALETTE.lantern_glow,
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity: 0.25,
    roughness: 0.25,
  });
  patchGardenLanternKindling(lightMaterial, "attribute");
  const bodyParts = [
    new CylinderGeometry(0.34, 0.4, 0.18, 6).translate(0, 0.09, 0),
    new CylinderGeometry(0.12, 0.15, 0.72, 6).translate(0, 0.54, 0),
    new CylinderGeometry(0.32, 0.25, 0.12, 6).translate(0, 0.96, 0),
    new ConeGeometry(0.46, 0.26, 6).translate(0, 1.47, 0),
    new SphereGeometry(0.075, 6, 4).translate(0, 1.66, 0),
  ];
  const bodyGeometry = mergeGeometries(bodyParts, false)!;
  for (const part of bodyParts) part.dispose();
  const lightGeometry = new CylinderGeometry(0.17, 0.17, 0.3, 6).translate(0, 1.17, 0);
  lightGeometry.setAttribute(
    "aKindleOrder",
    new InstancedBufferAttribute(new Float32Array(lit.map((recipe) => recipe.kindleOrder.lantern)), 1),
  );
  const bodies = new InstancedMesh(bodyGeometry, bodyMaterial, count);
  bodies.name = "harbor-stone-lanterns";
  const lights = new InstancedMesh(lightGeometry, lightMaterial, count);
  lights.name = "harbor-stone-lantern-fire";
  lit.forEach((recipe, index) => {
    const { x, y, z } = recipe.lantern!;
    scratchMatrix.makeTranslation(x, y, z);
    bodies.setMatrixAt(index, scratchMatrix);
    lights.setMatrixAt(index, scratchMatrix);
  });
  bodies.instanceMatrix.needsUpdate = true;
  lights.instanceMatrix.needsUpdate = true;
  root.add(bodies, lights);
  return { lightMaterial, root };
}

/** Local +X points seaward; the quay is landward and each pier reaches +X. */
export function authorDock(
  dock: DockNode,
  displayTile: { x: number; y: number },
  islandTile: { x: number; y: number },
): DockRecipe {
  const fallbackBearing = Math.atan2(displayTile.y - islandTile.y, displayTile.x - islandTile.x);
  const station = resolveDockStation(dock, fallbackBearing);
  const root = new Object3D();
  setTilePosition(root, displayTile, GARDEN_DOCK_ROOT_Y);
  root.rotation.y = -station.shoreBearing;
  root.updateMatrix();

  const identity = identityForStation(station.type);
  const amountScale = harborAmountScale(dock.totalUsd);
  const supply = MathUtils.clamp(dock.size, 1, 10) / 10;
  const ethereumMole = station.type === "ethereum-mole";
  const stationScale = stationScaleFor(
    station.type,
    dock.frontageShare,
    dock.frontageMedianShare,
  );
  const footprint = stationFootprint(station.type, dock.totalUsd, dock.size);
  const length = 7.6 * amountScale * (ethereumMole ? 1.5 : 1.06);
  const width = (1.62 + amountScale * 0.36) * (ethereumMole ? 1.42 : 1.08);
  const quayHealth = quayMasonryHealth(dock) ?? 0.58;
  const accent = dockAccentColor(dock);
  const stoneColor = new Color("#665f55").lerp(new Color("#a39d8c"), quayHealth);
  const quayLength = (3.6 + supply * 3.5)
    * (ethereumMole ? 1.38 : 1.05)
    * stationScale.frontageScale;
  const quayWidth = width * (ethereumMole ? 2.7 : 2.15);
  const quayX = -length * (ethereumMole ? 0.27 : 0.3);
  // The rest seat's eye in the station's local frame: lantern and shoji take
  // the side of the quay and house that faces the authored view.
  const toEyeX = REST_SEAT_EYE_LANDSCAPE.world.x - root.position.x;
  const toEyeZ = REST_SEAT_EYE_LANDSCAPE.world.z - root.position.z;
  const bearingCos = Math.cos(station.shoreBearing);
  const bearingSin = Math.sin(station.shoreBearing);
  const eyeLocal = {
    x: toEyeX * bearingCos + toEyeZ * bearingSin,
    z: -toEyeX * bearingSin + toEyeZ * bearingCos,
  };

  const timber: BufferGeometry[] = [];
  const charred: BufferGeometry[] = [];
  const stone: BufferGeometry[] = [];
  const metal: BufferGeometry[] = [];
  const walls: BufferGeometry[] = [];
  const roofs: BufferGeometry[] = [];
  const roofTrim: BufferGeometry[] = [];
  const windows: BufferGeometry[] = [];
  const accents: BufferGeometry[] = [];
  const props: HarborPropInstance[] = [];
  const noren: HarborNorenSpec[] = [];
  const articulation: RoofArticulationProfile = {
    brackets: 0,
    fascias: 0,
    fieldShells: 0,
    finials: 0,
    gablePlates: 0,
    ridgeBeams: 0,
    ridgeCaps: 0,
    surfaceBreaks: 0,
  };

  const fineMetal: BufferGeometry[] = [];
  const featureGeometry: StationFeatureGeometry = {
    quayPlatform: [],
    roof: [],
    warmWindows: [],
  };
  const stationContext: StationAuthorContext = {
    accents, articulation, charred, eyeLocal, featureGeometry, fineMetal, house: null, length, metal, noren, props, quayLength, quayWidth, quayX, roofTrim, roofs, seed: dock.chainId, stationScale, stone, supply, timber, walls, width, windows,
  };
  authorStoneQuay(stationContext, station.type);
  STATION_AUTHORS[station.type](stationContext);
  authorStationFidelity(stationContext, station.type);
  authorStationApproach(stationContext, station.type);

  const parts: HarborBucketPart[] = [];
  pushMergedPart(parts, "timber", timber, HARBOR_PALETTE.timber_mid, false, true);
  pushMergedPart(parts, "timber", charred, TIMBER_CHARRED, false, true);
  pushMergedPart(parts, "stone", stone, stoneColor, false, true);
  pushMergedPart(parts, "metal", metal, HARBOR_PALETTE.iron_dark, false, false);
  pushMergedPart(parts, "metal", fineMetal, HARBOR_PALETTE.iron_dark, true, false);
  pushMergedPart(parts, "wall", walls, WALL_PLASTER, false, true);
  pushMergedPart(parts, "roof", roofs, STATION_ROOF_COLOR[station.type], false, true);
  pushMergedPart(parts, "roof", roofTrim, new Color(STATION_ROOF_COLOR[station.type]).multiplyScalar(0.66), false, true);
  // Openings are dark voids by day (§1.1 rule 2, as the Pharos apertures):
  // the bucket warms only through the day cycle's dusk/night emissive, in
  // the kindling order (contract H-A).
  pushMergedPart(parts, "window", windows, HARBOR_PALETTE.iron_dark, false, false);
  pushMergedPart(parts, "accent", accents, STATION_ACCENT_COLOR[station.type], false, true);
  if (!ethereumMole && quayHealth < 0.5) {
    const cracks: BufferGeometry[] = [];
    for (let index = 0; index < 3; index += 1) {
      const crack = new BoxGeometry(0.04, 0.34 + index * 0.1, 0.04);
      crack.rotateZ((index % 2 === 0 ? -1 : 1) * (0.4 + index * 0.12));
      crack.translate(quayX - quayLength * 0.27 + index * quayLength * 0.27, 0.05, quayWidth / 2 + 0.031);
      cracks.push(crack);
    }
    parts.push(harborPart("stone", mergeBucket(cracks), HARBOR_PALETTE.iron_dark, false, false));
  }

  if (!ethereumMole) {
    const plankCount = Math.max(5, Math.round(5 + supply * 6));
    for (let index = 0; index < plankCount; index += 1) {
      const t = index / Math.max(1, plankCount - 1);
      scratchMatrix.makeRotationY((stableUnit(`station-plank.${dock.chainId}.${index}`) - 0.5) * 0.08);
      scratchMatrix.scale(scratchScale.set(1, 1, width * 0.88));
      scratchMatrix.setPosition(-length * 0.14 + t * length * 0.58, 0.26, 0);
      props.push(harborProp("plank", scratchMatrix, null, true));
    }
    const bollardCount = Math.max(2, Math.round(2 + supply * 4));
    for (let index = 0; index < bollardCount; index += 1) {
      const t = (index + 0.5) / bollardCount;
      scratchMatrix.makeRotationZ(index === 0 ? (1 - quayHealth) * MathUtils.degToRad(16) : 0);
      scratchMatrix.setPosition(-length * 0.14 + t * length * 0.56, 0.46, (index % 2 === 0 ? -1 : 1) * width * 0.48);
      props.push(harborProp("bollard", scratchMatrix, null, true));
    }
  }

  const nobori = stationNobori({
    frontageMedianShare: dock.frontageMedianShare,
    frontageShare: dock.frontageShare,
    size: dock.size,
    station,
    totalUsd: dock.totalUsd,
  });
  for (const banner of nobori.banners) {
    const height = banner.poleTopY - banner.footY;
    scratchMatrix.makeScale(NOBORI_POLE_RADIUS, height, NOBORI_POLE_RADIUS);
    scratchMatrix.setPosition(banner.x, height / 2 + banner.footY, banner.z);
    props.push(harborProp("post", scratchMatrix, null, false));
  }
  const flag: HarborFlagSpec = {
    atlasCell: assignGardenChainFlagCell(dock, accent),
    chainId: dock.chainId,
    placement: nobori,
    wavePhase: (stableUnit(`dock-flag-wave.${dock.chainId}`) - 0.5) * 0.7,
  };
  attachRoofProfileTelemetry(parts, articulation);

  // Harbour-3: one stone lantern on the quay nose, off-centre toward the
  // rest seat and jittered per chain, so the ring never reads as a necklace.
  const lanternSide = eyeLocal.z >= 0 ? 1 : -1;
  const lanternAlong = stableUnit(`harbor-lantern-along.${dock.chainId}`);
  const lanternAcross = stableUnit(`harbor-lantern-across.${dock.chainId}`);
  const lanternLocalX = ethereumMole ? 8.6 - lanternAlong * 0.8 : quayX + quayLength / 2 - 0.55 - lanternAlong * 0.5;
  const lanternLocalZ = ethereumMole
    ? 8.8 + lanternSide * (1.25 + lanternAcross * 0.35)
    : lanternSide * (0.95 + lanternAcross * 0.5);
  const lantern = HARBOR_DARK_COVES[station.coveId] ? null : {
    x: root.position.x + lanternLocalX * bearingCos - lanternLocalZ * bearingSin,
    y: GARDEN_DOCK_ROOT_Y + QUAY_TOP_Y,
    z: root.position.z + lanternLocalX * bearingSin + lanternLocalZ * bearingCos,
  };
  // H-A: after the lantern catches, the ring kindles outward from the beacon,
  // unevenly (distance plus a per-chain stagger inside the station band).
  const ringTiles = Math.hypot(displayTile.x - islandTile.x, displayTile.y - islandTile.y);
  const band = GARDEN_KINDLE_ORDER.stationFarthest - GARDEN_KINDLE_ORDER.stationNearest;
  const lanternOrder = GARDEN_KINDLE_ORDER.stationNearest
    + band * (0.8 * MathUtils.clamp((ringTiles - 30) / 45, 0, 1) + 0.2 * stableUnit(`harbor-kindle.${dock.chainId}`));

  return {
    accentColor: accent.clone(),
    anchorPosition: root.position.clone(),
    anchorRotationY: root.rotation.y,
    chimney: stationChimneyLocal(station.type, stationScale, quayX),
    cargoTideLanes: cargoTideLanes(length, quayLength, quayWidth, quayX),
    dock,
    flag,
    features: stationFeatures(station.type, featureGeometry),
    footprint,
    identity,
    kindleOrder: { lantern: lanternOrder, shoji: lanternOrder + GARDEN_KINDLE_ORDER.shojiLag },
    lantern,
    noren,
    parts,
    plan: station.type,
    props,
    quayHealth,
    rootMatrix: root.matrix.clone(),
    signature: identity.signature,
    station,
    tideFace: { width: quayLength, x: quayX, y: WATER_LEVEL - GARDEN_DOCK_ROOT_Y, z: quayWidth / 2 + 0.03 },
  };
}

/** The house a station author stood: its ground-storey walls, for the facade, shoji and eaves. */
interface StationHouse {
  x: number;
  z: number;
  w: number;
  d: number;
  baseY: number;
  topY: number;
}

interface StationAuthorContext {
  accents: BufferGeometry[];
  articulation: RoofArticulationProfile;
  /** Charred-cedar (yakisugi) lower bands and dark joinery. */
  charred: BufferGeometry[];
  /** Direction toward the rest seat's eye, station-local (unnormalised). */
  eyeLocal: { x: number; z: number };
  featureGeometry: StationFeatureGeometry;
  house: StationHouse | null;
  length: number;
  fineMetal: BufferGeometry[];
  metal: BufferGeometry[];
  noren: HarborNorenSpec[];
  props: HarborPropInstance[];
  quayLength: number;
  quayWidth: number;
  quayX: number;
  roofTrim: BufferGeometry[];
  roofs: BufferGeometry[];
  /** The chain id: per-station jitter for authored unevenness. */
  seed: string;
  stone: BufferGeometry[];
  stationScale: StationScale;
  supply: number;
  timber: BufferGeometry[];
  walls: BufferGeometry[];
  width: number;
  windows: BufferGeometry[];
}

/**
 * Counts of the shared roof articulation (ridge, fascia, gable, brackets and
 * surface breaks). Surfaced through merged-part userData so the roof-profile
 * contract stays testable without per-station meshes.
 */
interface RoofArticulationProfile {
  brackets: number;
  fascias: number;
  fieldShells: number;
  finials: number;
  gablePlates: number;
  ridgeBeams: number;
  ridgeCaps: number;
  surfaceBreaks: number;
}

/**
 * Harbour-1 material ladder: three roof tones only. Grey kawara for the
 * houses, the darker storm slate for the working sheds, and one civic
 * exception — weathered copper on the Ethereum hall. The six retired station
 * rungs (terracotta, cedar shake, dressed stone, cote clay, tea-house slate
 * and straw thatch) were the loudest warm hues after vermillion.
 */
const STATION_ROOF_COLOR: Record<StationType, string> = {
  // Old copper, weathered most of the way to the kawara so the civic roof
  // reads as a patina, not a green field.
  "ethereum-mole": `#${new Color(HARBOR_PALETTE.roof_weathered_copper).lerp(new Color(HARBOR_PALETTE.roof_slate_kawara), 0.45).getHexString()}`,
  "fishing-pier": HARBOR_PALETTE.roof_storm_slate,
  "hatago-wharf": HARBOR_PALETTE.roof_slate_kawara,
  "pigeonnier-islet": HARBOR_PALETTE.roof_slate_kawara,
  "reed-boathouse": HARBOR_PALETTE.roof_storm_slate,
  "stepped-inlet": HARBOR_PALETTE.roof_slate_kawara,
  "storm-mole": HARBOR_PALETTE.roof_slate_kawara,
  "tea-house-quay": HARBOR_PALETTE.roof_slate_kawara,
  uogashi: HARBOR_PALETTE.roof_storm_slate,
};

const STATION_ACCENT_COLOR: Record<StationType, string> = {
  "ethereum-mole": HARBOR_PALETTE.stone_mid,
  "fishing-pier": HARBOR_PALETTE.aurora_green,
  "hatago-wharf": HARBOR_PALETTE.timber_warm,
  "pigeonnier-islet": HARBOR_PALETTE.moonlight,
  "reed-boathouse": HARBOR_PALETTE.timber_warm,
  "stepped-inlet": HARBOR_PALETTE.iron_dark,
  "storm-mole": HARBOR_PALETTE.fog_pale,
  "tea-house-quay": HARBOR_PALETTE.lantern_warm,
  uogashi: HARBOR_PALETTE.lantern_cold,
};

/**
 * One plaster for every station (harbour-1): `stone_pale` lifted 0.6 toward
 * `fog_day`, a pale warm shikkui. The per-archetype roof tint is retired —
 * the vernacular is one family, and identity lives at ground level.
 */
export const WALL_PLASTER = new Color(HARBOR_PALETTE.stone_pale).lerp(new Color(HARBOR_PALETTE.fog_day), 0.6);
/** Charred cedar (yakisugi): `timber_dark` burnt to 55 %, for lower wall bands and joinery. */
export const TIMBER_CHARRED = new Color(HARBOR_PALETTE.timber_dark).multiplyScalar(0.55);

function attachRoofProfileTelemetry(parts: HarborBucketPart[], articulation: RoofArticulationProfile): void {
  const roofParts = parts.filter((part) => part.bucket === "roof");
  const field = roofParts[0];
  if (field) {
    const geometry = field.geometry;
    const fieldTriangles = geometry.index
      ? geometry.index.count / 3
      : geometry.getAttribute("position").count / 3;
    geometry.userData.roofField = {
      fieldShells: articulation.fieldShells,
      fieldTriangles,
    };
  }
  const trim = roofParts[1];
  if (trim) trim.geometry.userData.roofTrim = { ...articulation };
  const timberPart = parts.find((part) => part.bucket === "timber");
  if (timberPart) {
    timberPart.geometry.userData.roofStructure = {
      brackets: articulation.brackets,
      ridgeBeams: articulation.ridgeBeams,
    };
  }
}

interface StationFeatureGeometry {
  quayPlatform: BufferGeometry[];
  roof: BufferGeometry[];
  warmWindows: BufferGeometry[];
}

/** One named author per archetype — the readable index of this file's stations. */
const STATION_AUTHORS: Record<StationType, (ctx: StationAuthorContext) => void> = {
  "ethereum-mole": authorEthereumMole,
  "fishing-pier": authorFishingPier,
  "hatago-wharf": authorHatagoWharf,
  "pigeonnier-islet": authorPigeonnierLanding,
  "reed-boathouse": authorReedBoathouse,
  "stepped-inlet": authorSteppedInlet,
  "storm-mole": authorStormMole,
  "tea-house-quay": authorTeaHouseQuay,
  uogashi: authorUogashi,
};

function pushFeatureGeometry(
  ctx: StationAuthorContext,
  feature: keyof StationFeatureGeometry,
  bucket: BufferGeometry[],
  geometry: BufferGeometry,
  x: number,
  y: number,
  z: number,
): void {
  pushGeometry(bucket, geometry, x, y, z);
  ctx.featureGeometry[feature].push(geometry);
}

/** Pushes into `bucket`, crediting the named feature; `null` credits nothing (subordinate roofs). */
function addFeatureGeometry(
  ctx: StationAuthorContext,
  feature: keyof StationFeatureGeometry | null,
  bucket: BufferGeometry[],
  geometry: BufferGeometry,
): void {
  bucket.push(geometry);
  if (feature) ctx.featureGeometry[feature].push(geometry);
}

/* ── Byte-budget authoring kit ──────────────────────────────────────────
 * DELIBERATE STYLE INVERSION, scoped to this file: the total-JS gzip budget
 * in scripts/check-bundle-size.mjs is a measured gate that cosmetic work may
 * not relax, and runs of literal `new BoxGeometry(w, h, d)` + translate
 * calls minify far worse than the same numbers driven through one call
 * site. So this file prefers a handful of tiny helpers called many times —
 * the opposite of the usual inline-over-micro-helper rule — and folds long
 * literal runs into flat stride-6 [w, h, d, x, y, z, …] tables. Every
 * helper below must preserve order, dimensions, positions, rotation and
 * bucket exactly; an offline digest of all nine stations (positions,
 * normals, uvs, colours, props, telemetry) is compared before/after any
 * change to this kit. */
function pushBox(bucket: BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number): void {
  pushGeometry(bucket, new BoxGeometry(w, h, d), x, y, z);
}

/** Flat stride-6 box table — [w, h, d, x, y, z, …] — into one bucket. */
function pushBoxes(bucket: BufferGeometry[], table: readonly number[]): void {
  for (let index = 0; index < table.length; index += 6) {
    pushBox(bucket, table[index]!, table[index + 1]!, table[index + 2]!, table[index + 3]!, table[index + 4]!, table[index + 5]!);
  }
}

/**
 * A one-strip chamfer for masonry hero edges. The eight-point section costs
 * 28 triangles rather than rounding every edge and keeps the broad faces hard.
 */
function chamferedBoxGeometry(w: number, h: number, d: number, bevel: number): BufferGeometry {
  const b = Math.min(bevel, h * 0.24, d * 0.24);
  return toCreasedNormals(prismGeometry([
    [-d / 2 + b, -h / 2],
    [d / 2 - b, -h / 2],
    [d / 2, -h / 2 + b],
    [d / 2, h / 2 - b],
    [d / 2 - b, h / 2],
    [-d / 2 + b, h / 2],
    [-d / 2, h / 2 - b],
    [-d / 2, -h / 2 + b],
  ], w), Math.PI / 5);
}

function pushChamferedBox(
  bucket: BufferGeometry[],
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  bevel = 0.08,
): void {
  pushGeometry(bucket, chamferedBoxGeometry(w, h, d, bevel), x, y, z);
}

function featureBox(
  ctx: StationAuthorContext,
  feature: keyof StationFeatureGeometry,
  bucket: BufferGeometry[],
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): void {
  pushFeatureGeometry(ctx, feature, bucket, new BoxGeometry(w, h, d), x, y, z);
}

/** Flat stride-6 feature-credited box table. */
function featureBoxes(
  ctx: StationAuthorContext,
  feature: keyof StationFeatureGeometry,
  bucket: BufferGeometry[],
  table: readonly number[],
): void {
  for (let index = 0; index < table.length; index += 6) {
    featureBox(ctx, feature, bucket, table[index]!, table[index + 1]!, table[index + 2]!, table[index + 3]!, table[index + 4]!, table[index + 5]!);
  }
}

/**
 * The one harbour wall (harbour-1): a charred-cedar lower band, 38 % of the
 * storey and a hair proud, under pale plaster that stops at the eave.
 */
function bandedWall(ctx: StationAuthorContext, x: number, z: number, w: number, d: number, baseY: number, topY: number): void {
  const band = (topY - baseY) * 0.38;
  pushBox(ctx.charred, w + 0.06, band, d + 0.06, x, baseY + band / 2, z);
  pushBox(ctx.walls, w, topY - baseY - band, d, x, (baseY + band + topY) / 2, z);
}

/** A station's ground-storey house: banded walls, recorded for its facade and its one shoji. */
function houseWalls(ctx: StationAuthorContext, x: number, z: number, w: number, d: number, baseY: number, topY: number): void {
  bandedWall(ctx, x, z, w, d, baseY, topY);
  ctx.house = { baseY, d, topY, w, x, z };
}

/** Warm-window box: the lit seam shared by the window bucket and telemetry. */
function warmBox(ctx: StationAuthorContext, w: number, h: number, d: number, x: number, y: number, z: number): void {
  pushFeatureGeometry(ctx, "warmWindows", ctx.windows, new BoxGeometry(w, h, d), x, y, z);
}

/** Trim box into the darker roof-trim bucket (caps, fascia, courses, ties). */
function trimBox(ctx: StationAuthorContext, w: number, h: number, d: number, x: number, y: number, z: number): void {
  pushGeometry(ctx.roofTrim, new BoxGeometry(w, h, d), x, y, z);
}

/** Pitched trim slab (a surface-break course) rotated about X, then placed. */
function trimCourse(ctx: StationAuthorContext, w: number, t: number, d: number, pitch: number, x: number, y: number, z: number): void {
  const course = new BoxGeometry(w, t, d);
  course.rotateX(pitch);
  pushGeometry(ctx.roofTrim, course, x, y, z);
}

function ridgeBeam(ctx: StationAuthorContext, w: number, h: number, d: number, x: number, y: number, z: number): void {
  pushGeometry(ctx.timber, new BoxGeometry(w, h, d), x, y, z);
  ctx.articulation.ridgeBeams += 1;
}

function ridgeCap(ctx: StationAuthorContext, w: number, h: number, d: number, x: number, y: number, z: number): void {
  trimBox(ctx, w, h, d, x, y, z);
  ctx.articulation.ridgeCaps += 1;
}

/** One bracket row under an eave: a pair at each span fraction, raked
 *  against the slope. Shared by the hip, gable and lean-to roofs so bracket
 *  mechanics cannot drift apart; a lean-to passes its per-side eave height. */
function eaveBracketRow(
  ctx: StationAuthorContext,
  cx: number,
  span: number,
  halfD: number,
  fractions: readonly number[],
  eaveYFor: (side: number) => number,
  h: number,
  d: number,
  cz = 0,
): void {
  for (const side of [-1, 1]) {
    for (const fraction of fractions) {
      const bracket = new BoxGeometry(0.55, h, d);
      bracket.rotateX(side * -0.6);
      bracket.translate(cx + fraction * span, eaveYFor(side), cz + side * (halfD - 0.12));
      ctx.timber.push(bracket);
      ctx.articulation.brackets += 1;
    }
  }
}

interface FacadeFidelity {
  bays: number;
  openingHeight: number;
  openingWidth: number;
}

/** Seaward-facade doorways per house; the open market hall and the boathouse carry none. */
const FACADE_FIDELITY: Record<Exclude<StationType, "ethereum-mole">, FacadeFidelity> = {
  "fishing-pier": { bays: 1, openingHeight: 1.7, openingWidth: 0.62 },
  "hatago-wharf": { bays: 4, openingHeight: 2.2, openingWidth: 0.58 },
  "pigeonnier-islet": { bays: 3, openingHeight: 1.25, openingWidth: 0.46 },
  "reed-boathouse": { bays: 0, openingHeight: 0, openingWidth: 0 },
  "stepped-inlet": { bays: 3, openingHeight: 1.35, openingWidth: 0.48 },
  "storm-mole": { bays: 2, openingHeight: 1.85, openingWidth: 0.68 },
  "tea-house-quay": { bays: 1, openingHeight: 1.55, openingWidth: 0.42 },
  uogashi: { bays: 0, openingHeight: 0, openingWidth: 0 },
};

/**
 * Overview geometry shared as a grammar, never as a silhouette: a battered
 * waterline seat, dark doorways in the house's seaward wall, one
 * chain-coloured plaque, and the station's one lit shoji.
 */
function authorStationFidelity(ctx: StationAuthorContext, type: StationType): void {
  if (type === "ethereum-mole") {
    authorMoleMasonry(ctx);
    pushChamferedBox(ctx.accents, 0.16, 0.62, 1.2, -2.91, 1.12, -5.1, 0.05);
    authorShoji(ctx, null);
    return;
  }
  // The submerged toe overlaps both land and water. Its chamfer is confined
  // to the exposed nosing instead of softening every plank and fitting.
  pushChamferedBox(
    ctx.stone,
    ctx.quayLength + 0.35,
    0.72,
    ctx.quayWidth + 0.3,
    ctx.quayX,
    0.12,
    0,
    0.11,
  );
  for (const z of [-ctx.quayWidth / 2 - 0.19, ctx.quayWidth / 2 + 0.19]) {
    pushBox(ctx.stone, ctx.quayLength + 0.5, 0.2, 0.16, ctx.quayX, 0.28, z);
  }
  pushChamferedBox(ctx.accents, 0.16, 0.58, 0.9, ctx.quayX + ctx.quayLength / 2 + 0.08, 1.08, -ctx.quayWidth * 0.3, 0.05);
  const house = ctx.house;
  if (!house) return;

  // Dark doorways stand just proud of the plaster, framed by posts and a
  // lintel. Bay counts and proportions are sparse and station-specific.
  const spec = FACADE_FIDELITY[type];
  const facadeX = house.x + house.w / 2;
  const bayRun = house.d / Math.max(1, spec.bays);
  for (let bay = 0; bay < spec.bays; bay += 1) {
    const z = house.z - house.d / 2 + bayRun * (bay + 0.5);
    const width = bayRun * spec.openingWidth * (bay === spec.bays - 1 && spec.bays > 1 ? 0.82 : 1);
    const height = spec.openingHeight * (bay % 2 === 0 ? 1 : 0.82);
    const y = house.baseY + height / 2 + 0.22;
    pushBox(ctx.metal, 0.06, height, width, facadeX + 0.03, y, z);
    pushChamferedBox(ctx.timber, 0.22, height + 0.34, 0.22, facadeX + 0.11, y, z - width / 2 - 0.13, 0.04);
    pushBox(ctx.timber, 0.2, 0.22, width + 0.45, facadeX + 0.12, house.baseY + height + 0.31, z);
  }
  if (spec.bays > 0) pushBox(ctx.timber, 0.2, 0.24, house.d * 0.86, facadeX + 0.12, house.baseY + 0.2, house.z);
  authorShoji(ctx, spec.bays > 0 ? house.z - house.d / 2 + bayRun * 0.5 : null);
}

/**
 * Harbour-3: one warm shoji per station, on the house face that looks toward
 * the rest seat — a lit paper door, never a window row. On the seaward
 * facade it stands in the first doorway (`facadeBayZ`).
 */
function authorShoji(ctx: StationAuthorContext, facadeBayZ: number | null): void {
  const house = ctx.house;
  if (!house) return;
  const width = 0.7;
  const height = 0.95;
  const y = house.baseY + 0.24 + height / 2;
  const jitter = stableUnit(`station-shoji.${ctx.seed}`) - 0.5;
  const { x: eyeX, z: eyeZ } = ctx.eyeLocal;
  if (Math.abs(eyeX) >= Math.abs(eyeZ)) {
    if (eyeX > 0 && facadeBayZ !== null) {
      warmBox(ctx, 0.1, height, width, house.x + house.w / 2 + 0.1, y, facadeBayZ);
      return;
    }
    const side = eyeX > 0 ? 1 : -1;
    warmBox(ctx, 0.1, height, width, house.x + side * (house.w / 2 + 0.05), y, house.z + jitter * Math.max(0, house.d - width - 0.6));
    return;
  }
  const side = eyeZ > 0 ? 1 : -1;
  warmBox(ctx, width, height, 0.1, house.x + jitter * Math.max(0, house.w - width - 0.6), y, house.z + side * (house.d / 2 + 0.05));
}

/** The Mole hall's seaward plaster face (walls stand 0.8 inside the eave). */
const MOLE_HALL_FACE_X = -3.8;

function authorMoleMasonry(ctx: StationAuthorContext): void {
  // Running-bond wet masonry on the two outer arm faces. Three fixed tide
  // courses retain the specified count; alternating joints keep them from
  // becoming ruler stripes.
  for (const [from, to, z] of [[-5, 17, -12.08], [-5, 10, 11.58]] as const) {
    for (let course = 0; course < 3; course += 1) {
      let x = from - (course % 2) * 0.7;
      let joint = 0;
      while (x < to) {
        const nominal = [1.25, 1.7, 1.45, 2.05, 1.55][joint % 5]!;
        const run = Math.min(nominal, to - x);
        if (run > 0.3) pushChamferedBox(ctx.stone, run - 0.05, 0.25, 0.24, x + run / 2, 0.12 + course * 0.31, z, 0.045);
        x += nominal;
        joint += 1;
      }
    }
  }

  // Chamfered apron setts stop the 26 × 10 court reading as one slab while
  // leaving a broad uninterrupted centre on the bent gate-to-hall axis.
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 12; column += 1) {
      if (row === 1 && column >= 4 && column <= 8) continue;
      const x = -21.9 + row * 2.35;
      const z = -11.8 + column * 2.05 + (row % 2) * 0.35;
      pushChamferedBox(ctx.stone, 2.08, 0.2, 1.82, x, 2.76, z, 0.065);
    }
  }

  // The one thick gateway compresses an empty centre. Bell and gate stay
  // coarse structural ironwork; civic bollards remain inspection greebles.
  pushChamferedBox(ctx.metal, 0.46, 3.7, 0.46, -22.2, 3.6, 1.15, 0.07);
  pushChamferedBox(ctx.metal, 0.46, 3.7, 0.46, -22.2, 3.6, 4.85, 0.07);
  pushChamferedBox(ctx.metal, 0.5, 0.62, 4.45, -22.2, 5.18, 3, 0.09);
}

function authorEthereumMole(ctx: StationAuthorContext): void {
  const { metal, stone, timber } = ctx;
  // The Mole is laid out independently of supply. Local +X is seaward:
  // apron [-23,-13], hall [-13,-3], basin [-3,15], and arms [-5,17].
  // The hall's 24-unit axis therefore runs alongshore, opposite the Pharos.
  const hallX = -8;
  const hallZ = 0;
  const hallDepth = 10;
  const hallLength = 24;

  // Battered wet toes frame an 18 × 14 water void. Their inner faces remain
  // exactly at z=±7; only the masonry outside those faces is authored.
  for (const [armLength, armWidth, armX, armZ] of [
    [22, 5, 6, -9.5],
    [15, 4.5, 2.5, 9.25],
  ] as const) {
    const toe = prismGeometry([
      [-armWidth / 2 - 0.25, -0.2],
      [armWidth / 2 + 0.25, -0.2],
      [armWidth / 2, 0.75],
      [-armWidth / 2, 0.75],
    ], armLength);
    pushGeometry(stone, toe, armX, 0, armZ);
    featureBox(ctx, "quayPlatform", stone, armLength, 0.8, armWidth, armX, 1.15, armZ);
    for (const courseY of [0.05, 0.45, 0.9]) {
      pushBox(stone, armLength, 0.24, 0.18, armX, courseY, armZ + Math.sign(armZ) * (armWidth / 2 + 0.09));
    }
  }

  // Unequal capstones deliberately break their joints every fifth position.
  for (const [armEnd, z, side] of [[17, -7.28, -1], [10, 7.28, 1]] as const) {
    let x = -5;
    let joint = 0;
    while (x < armEnd - 0.01) {
      const nominal = [1.2, 1.65, 2.05, 1.45, 2.4][joint % 5]!;
      const run = joint % 5 === 4 ? Math.min(nominal * 1.45, armEnd - x) : Math.min(nominal, armEnd - x);
      pushBox(stone, run - 0.06, 0.25, 0.55, x + run / 2, 1.425, z + side * 0.275);
      x += run;
      joint += 1;
    }
  }
  // Squared hammerheads cap both termini without adding a tower.
  pushBoxes(stone, [
    2.2, 1.75, 7.2, 15.9, 0.675, -10.6,
    2.2, 1.75, 6.6, 8.9, 0.675, 10.3,
  ]);

  // Hall-side quay closes the bracket without filling the basin.
  featureBoxes(ctx, "quayPlatform", stone, [
    2, 1.75, 24, -4, 0.675, 0,
    2, 0.18, 24.4, -4, 1.46, 0,
  ]);

  // A 26 × 10 civic apron, with the stair and folded ramp cut into the same
  // stone bucket. The empty off-centre court is left as negative space.
  pushBoxes(stone, [
    10, 1.25, 26, -18, 2.175, 0,
    1.25, 0.32, 7, -13.62, 1.71, 3.1,
    2.5, 0.62, 7, -14.25, 1.86, 3.1,
    3.75, 0.94, 7, -14.88, 2.02, 3.1,
    5, 1.25, 7, -15.5, 2.175, 3.1,
    7.5, 0.42, 3, -18.25, 2.59, -9.5,
    3, 0.42, 5.5, -21.5, 2.59, -5.25,
  ]);

  // Podium (top 2.8) and the hall, its walls 0.8 inside a deep eave at 6.4.
  pushBox(stone, hallDepth, 1.25, hallLength, hallX, 2.175, hallZ);
  houseWalls(ctx, hallX, hallZ, hallDepth - 1.6, hallLength - 1.6, 2.8, 6.3);
  // Pilasters and a recessed seaward doorway give real relief.
  for (const z of [-9, -4.5, 4.5, 9]) pushBox(stone, 0.28, 3.3, 0.44, MOLE_HALL_FACE_X + 0.12, 4.45, z);
  pushBoxes(timber, [
    0.32, 3.2, 0.42, MOLE_HALL_FACE_X + 0.16, 4.4, 1.6,
    0.32, 3.2, 0.42, MOLE_HALL_FACE_X + 0.16, 4.4, 4.4,
    0.48, 0.5, 3.5, MOLE_HALL_FACE_X + 0.24, 5.85, 3,
  ]);
  authorMoleHallRoof(ctx, hallX, hallZ, hallDepth, hallLength);
  // Two shielded portal lamps share the ember bucket but are not apertures.
  for (const z of [1.1, 4.9]) {
    pushBoxes(timber, [
      0.3, 2.1, 0.3, -22.15, 3.85, z,
      0.65, 0.16, 0.65, -22.15, 4.92, z,
    ]);
    warmBox(ctx, 0.3, 0.34, 0.3, -22.15, 4.65, z);
  }

  // Harbour-1: the campanile becomes an open timber hinomi-yagura, the
  // ring's one vertical at 13.5 u — four posts, two braced stages and a small
  // hip cap, with the bell hung inside. It reads as structure, not mass.
  const towerX = -8;
  const towerZ = -14;
  const postTop = 12.5;
  pushBox(stone, 4.2, 0.55, 4.2, towerX, 3.075, towerZ);
  const frame = ctx.charred;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    pushBox(frame, 0.3, postTop - 3.35, 0.3, towerX + sx * 1.3, (postTop + 3.35) / 2, towerZ + sz * 1.3);
  }
  pushBoxes(frame, [
    3.1, 0.18, 3.1, towerX, 7.6, towerZ,
    3.0, 0.18, 3.0, towerX, 11.2, towerZ,
  ]);
  // Cross braces on all four faces of the lower stage.
  const braceRise = 7.6 - 3.35;
  const braceLength = Math.hypot(2.6, braceRise);
  const braceAngle = Math.atan2(braceRise, 2.6);
  for (const side of [-1, 1]) for (const lean of [-1, 1]) {
    const alongX = new BoxGeometry(braceLength, 0.12, 0.12);
    alongX.rotateZ(lean * braceAngle);
    pushGeometry(frame, alongX, towerX, (7.6 + 3.35) / 2, towerZ + side * 1.3);
    const alongZ = new BoxGeometry(0.12, 0.12, braceLength);
    alongZ.rotateX(lean * braceAngle);
    pushGeometry(frame, alongZ, towerX + side * 1.3, (7.6 + 3.35) / 2, towerZ);
  }
  const bell = new ConeGeometry(0.55, 0.9, 6);
  bell.rotateX(Math.PI);
  pushGeometry(metal, bell, towerX, 11.85, towerZ);
  articulatePyramidRoof(ctx, towerX, towerZ, postTop, 13.5, 1.75, 1.75);

  // Eight civic bollards at an authored rhythm: five long, three short.
  for (const [x, z] of [
    [-2.8, -7.55], [0.1, -7.55], [4.6, -7.55], [9.8, -7.55], [14.2, -7.55],
    [-2.1, 7.55], [2.4, 7.55], [7.7, 7.55],
  ]) {
    pushBox(ctx.fineMetal, 0.44, 0.72, 0.44, x, 1.91, z);
  }
}

/** Deep hipped copper hall roof, rotated so its long ridge follows the shore: eave 6.4, ridge 10.4. */
function authorMoleHallRoof(ctx: StationAuthorContext, cx: number, cz: number, depth: number, length: number): void {
  const hx = depth / 2;
  const hz = length / 2;
  const eave = 6.4;
  const ridge = 10.4;
  const ridgeHalf = 7.4;
  const triangles: number[] = [];
  const quad = (a: XYZ, b: XYZ, c: XYZ, d: XYZ) => triangles.push(...a, ...b, ...c, ...a, ...c, ...d);
  quad([cx - hx, eave, cz - hz], [cx + hx, eave, cz - hz], [cx, ridge, cz - ridgeHalf], [cx, ridge, cz + ridgeHalf]);
  quad([cx + hx, eave, cz + hz], [cx - hx, eave, cz + hz], [cx, ridge, cz + ridgeHalf], [cx, ridge, cz - ridgeHalf]);
  triangles.push(
    cx - hx, eave, cz - hz, cx, ridge, cz + ridgeHalf, cx, ridge, cz - ridgeHalf,
    cx - hx, eave, cz + hz, cx, ridge, cz + ridgeHalf, cx - hx, eave, cz - hz,
    cx + hx, eave, cz - hz, cx, ridge, cz - ridgeHalf, cx, ridge, cz + ridgeHalf,
    cx + hx, eave, cz - hz, cx, ridge, cz + ridgeHalf, cx + hx, eave, cz + hz,
  );
  addFeatureGeometry(ctx, "roof", ctx.roofs, triangleGeometry(triangles));
  ctx.articulation.fieldShells += 1;
  pushBox(ctx.timber, 0.34, 0.2, ridgeHalf * 2 + 0.6, cx, ridge - 0.18, cz);
  ctx.articulation.ridgeBeams += 1;
  trimBox(ctx, 0.52, 0.14, ridgeHalf * 2 + 0.35, cx, ridge - 0.07, cz);
  ctx.articulation.ridgeCaps += 1;
  pushBoxes(ctx.roofTrim, [
    depth + 0.3, 0.24, 0.18, cx, eave - 0.04, cz - hz,
    depth + 0.3, 0.24, 0.18, cx, eave - 0.04, cz + hz,
    0.18, 0.24, length + 0.3, cx - hx, eave - 0.04, cz,
    0.18, 0.24, length + 0.3, cx + hx, eave - 0.04, cz,
    0.2, 0.15, length * 0.72, cx - hx * 0.55, (eave + ridge) / 2 + 0.05, cz,
    0.2, 0.15, length * 0.72, cx + hx * 0.55, (eave + ridge) / 2 + 0.05, cz,
  ]);
  ctx.articulation.fascias += 4;
  ctx.articulation.surfaceBreaks += 1;
  const gable = prismGeometry([[-2.1, eave + 0.05], [2.1, eave + 0.05], [0, ridge - 0.08]], 0.4);
  gable.rotateY(Math.PI / 2);
  gable.translate(cx, 0, cz - hz + (hz - ridgeHalf) * 0.4);
  ctx.roofTrim.push(gable);
  ctx.articulation.gablePlates += 1;
  for (const z of [-8, -2.6, 2.6, 8]) {
    for (const x of [-hx + 1.0, hx - 1.0]) pushBox(ctx.timber, 0.5, 0.16, 0.58, cx + x, eave - 0.3, cz + z);
  }
  ctx.articulation.brackets += 8;
}

function authorHatagoWharf(ctx: StationAuthorContext): void {
  const { length, props, stationScale, timber } = ctx;
  const hallX = ctx.quayX - 3.4;
  const hallW = stationScale.length;
  const hallD = stationScale.span;
  const pentEave = 4.4;
  const upperEave = 7.05;
  // The inn is two storeys under one stacked irimoya: a pent roof over the
  // ground floor carries the full frontage, and the guest floor stands back
  // beneath the main roof, so the roofs — not the walls — make the mass.
  const outset = hallD * 0.188;
  const halfW = hallW / 2 - outset;
  const halfD = hallD / 2 - outset * 0.85;
  houseWalls(ctx, hallX, 0, hallW * 0.84, hallD * 0.78, QUAY_TOP_Y, pentEave - 0.1);
  pushBox(ctx.walls, 2 * halfW - 1.8, upperEave - pentEave, 2 * halfD - 1.1, hallX, (pentEave + upperEave) / 2 - 0.05, 0);
  articulateIrimoya(ctx, hallX, upperEave, stationScale.silhouetteTop, halfW, halfD, {
    course: true,
    skirt: { drop: upperEave - pentEave, outset },
  });

  // A stepped water stair under its own subordinate roof; the paired noren
  // hang in the nobori cloth batch and move in the harbour's one wind.
  const stairX = hallX + hallW / 2 + 1.45;
  for (let step = 0; step < 4; step += 1) {
    pushBox(ctx.stone, 0.72, 0.28 + step * 0.3, 2.7, stairX + step * 0.68, 0.14 + step * 0.15, 0);
  }
  for (const z of [-1.15, 1.15]) pushBox(timber, 0.18, 3.4, 0.18, stairX, 3.25, z);
  pushBox(timber, 0.16, 0.16, 2.6, stairX + 0.1, 4.8, 0);
  articulateIrimoya(ctx, stairX + 0.45, 5.05, 6.25, 2.35, 1.65, { course: true }, null);
  for (const z of [-0.62, 0.62]) ctx.noren.push({ height: 1.38, topY: 4.74, width: 1.12, x: stairX + 0.12, z });
  pushBox(timber, length * 0.62, 0.24, hallD * 0.92, length * 0.1, 0.1, 0);
  pushPierPilings(props, length * 0.58, hallD * 0.84, length * 0.1, 5);
}

/** The market hall's mono-pitch: low open-side eave, high closed side, exact silhouette top. */
function uogashiRoof(stationScale: StationScale): { lowY: number; highY: number; halfD: number } {
  const lowY = 4.3;
  let halfD = stationScale.span / 2;
  let highY = leanToHighYForTop(stationScale.silhouetteTop, lowY, halfD);
  halfD = roofHalfSpanForOuterSpan(stationScale.span, highY - lowY, true);
  highY = leanToHighYForTop(stationScale.silhouetteTop, lowY, halfD);
  return { halfD, highY, lowY };
}

function authorUogashi(ctx: StationAuthorContext): void {
  const { metal, props, stationScale, timber } = ctx;
  const hallX = ctx.quayX - 3.2;
  const hallW = stationScale.length;
  const hallD = stationScale.span;
  pushBox(timber, hallW, 0.26, hallD, hallX, 1.68, 0);
  pushPierPilings(props, hallW, hallD * 0.9, hallX, 7);
  // The working hall is closed only on its high side; its broad market face
  // stays open under one deep mono-pitch roof.
  const { halfD, highY, lowY } = uogashiRoof(stationScale);
  articulateLeanToRoof(ctx, hallX, 0, highY, lowY, halfD, hallW, -1, { course: true });
  const riseRate = (highY - lowY) / (2 * halfD);
  const wallZ = -halfD + 0.75;
  bandedWall(ctx, hallX, wallZ, hallW * 0.92, 0.28, QUAY_TOP_Y, highY - 0.75 * riseRate - 0.3);
  const postTop = lowY + 0.7 * riseRate - 0.15;
  for (const fraction of [-0.45, -0.225, 0, 0.225, 0.45]) {
    pushBox(timber, 0.24, postTop - QUAY_TOP_Y, 0.24, hallX + fraction * hallW, (postTop + QUAY_TOP_Y) / 2, halfD - 0.7);
  }
  // Tally boards repeat down the closed wall like a restrained ledger.
  for (const fraction of [-0.34, -0.17, 0, 0.17, 0.34]) {
    pushBox(timber, hallW * 0.1, 1.4, 0.12, hallX + fraction * hallW, 3.3, wallZ - 0.2);
  }
  const shojiJitter = stableUnit(`station-shoji.${ctx.seed}`);
  warmBox(ctx, 0.7, 0.95, 0.1, hallX + hallW * (0.12 + shojiJitter * 0.24), QUAY_TOP_Y + 0.72, wallZ + 0.19);

  // The steelyard stands at ground level in the open market face — post,
  // pivoting beam, counterweight and hanging pan — under the roof it once
  // broke.
  const scaleX = hallX + hallW * 0.08;
  const scaleZ = hallD * 0.12;
  const deckTop = 1.81;
  pushBox(metal, 0.24, 4.1 - deckTop, 0.24, scaleX, (4.1 + deckTop) / 2, scaleZ);
  const beam = new BoxGeometry(3.2, 0.14, 0.14);
  beam.rotateZ(-0.12);
  pushGeometry(metal, beam, scaleX + 1.0, 3.9, scaleZ);
  const pivot = new CylinderGeometry(0.22, 0.22, 0.4, 10);
  pivot.rotateX(Math.PI / 2);
  pushGeometry(metal, pivot, scaleX, 3.95, scaleZ);
  pushBox(metal, 0.3, 0.36, 0.3, scaleX - 0.5, 3.55, scaleZ);
  pushBox(metal, 0.06, 1.1, 0.06, scaleX + 2.4, 3.2, scaleZ);
  pushGeometry(metal, new CylinderGeometry(0.6, 0.42, 0.14, 12), scaleX + 2.4, 2.6, scaleZ);
}

function authorTeaHouseQuay(ctx: StationAuthorContext): void {
  const { length, props, stationScale, timber } = ctx;
  const x = ctx.quayX - 3.2;
  const w = stationScale.length;
  const d = stationScale.span;
  const eave = 4.65;
  houseWalls(ctx, x, 0, w * 0.8, d * 0.74, QUAY_TOP_Y, eave - 0.1);
  articulateIrimoya(ctx, x, eave, stationScale.silhouetteTop, w / 2, d / 2, { course: true });
  // The moon window sits low in the ground-floor wall: a dark round opening
  // behind a thin ring and kumiko mullions — never lit glass (harbour-3: a
  // solid lit disc read as a clock face).
  const face = x + w * 0.4;
  const moonY = 3.05;
  const moonZ = d * 0.74 * 0.3;
  const ring = new TorusGeometry(0.62, 0.07, 6, 16);
  ring.rotateY(Math.PI / 2);
  pushGeometry(ctx.charred, ring, face + 0.06, moonY, moonZ);
  for (const offset of [-0.21, 0.21]) {
    pushBox(ctx.charred, 0.05, 1.18, 0.05, face + 0.06, moonY, moonZ + offset);
    pushBox(ctx.charred, 0.05, 0.05, 1.18, face + 0.06, moonY + offset, moonZ);
  }
  const moonOpening = new CylinderGeometry(0.58, 0.58, 0.04, 16);
  moonOpening.rotateZ(Math.PI / 2);
  pushGeometry(ctx.metal, moonOpening, face + 0.02, moonY, moonZ);
  // One engawa shelf over the water, with its railing.
  pushBox(timber, length * 0.56, 0.22, d * 1.05, length * 0.13, 0.12, 0);
  for (const side of [-1, 1]) {
    for (const step of [0, 1, 2]) {
      pushBox(timber, 0.13, 0.85, 0.13, length * (0.02 + step * 0.24), 0.55, side * d * 0.5);
    }
    pushBox(timber, length * 0.52, 0.11, 0.11, length * 0.14, 0.98, side * d * 0.5);
  }
  pushPierPilings(props, length * 0.5, d, length * 0.14, 4);
}

function authorFishingPier(ctx: StationAuthorContext): void {
  const { length, props, stationScale, timber, width } = ctx;
  const pierLength = length * 1.08;
  pushBox(timber, pierLength, 0.26, width * 0.64, length * 0.18, 0.11, 0);
  pushPierPilings(props, pierLength, width * 0.55, length * 0.18, 7);
  // The only lean-to roof, kept at the root so the thin pier remains legible;
  // a small net store stands under its high side.
  const shelterX = ctx.quayX - 3.2;
  const roofLow = 3.2;
  const roofHalfD = roofHalfSpanForOuterSpan(stationScale.span, stationScale.silhouetteTop - roofLow, true);
  const roofHigh = leanToHighYForTop(stationScale.silhouetteTop, roofLow, roofHalfD);
  articulateLeanToRoof(ctx, shelterX, 0, roofHigh, roofLow, roofHalfD, stationScale.length, 1, { course: true });
  for (const z of [-stationScale.span * 0.45, stationScale.span * 0.45]) {
    pushBox(timber, 0.26, 4.3, 0.26, shelterX + stationScale.length * 0.31, QUAY_TOP_Y + 2.15, z);
    pushBox(timber, 0.26, 1.6, 0.26, shelterX - stationScale.length * 0.31, QUAY_TOP_Y + 0.8, z);
  }
  houseWalls(
    ctx,
    shelterX - stationScale.length * 0.08,
    stationScale.span * 0.2,
    stationScale.length * 0.5,
    stationScale.span * 0.34,
    QUAY_TOP_Y,
    4.3,
  );
  // The drying rack stands on the quay at ground level, nets hung low.
  const rackX = ctx.quayX + 1.0;
  const rackTop = 4.0;
  for (const z of [-2.0, 2.0]) {
    pushBox(timber, 0.24, rackTop - QUAY_TOP_Y, 0.24, rackX, (rackTop + QUAY_TOP_Y) / 2, z);
  }
  pushBox(timber, 0.26, 0.26, 4.9, rackX, rackTop - 0.1, 0);
  for (const z of [-1.5, 0, 1.5]) {
    const net = new BoxGeometry(1.5, 1.1, 0.06);
    net.translate(rackX + 0.1, rackTop - 0.85, z);
    timber.push(net);
  }
  // Stacked crates on the pier plus a winch drum at its head.
  for (const [offsetX, offsetY] of [[0, 0], [1.05, 0], [0.5, 0.6], [1.55, 0.6]] as const) {
    pushBox(timber, 0.95, 0.6, 0.95, length * 0.05 + offsetX, 0.54 + offsetY, -width * 0.22);
  }
  const winch = new CylinderGeometry(0.5, 0.5, 0.85, 10);
  winch.rotateZ(Math.PI / 2);
  winch.translate(length * 0.32, 0.78, width * 0.45);
  ctx.fineMetal.push(winch);
  for (const side of [-1, 1]) {
    const winchPost = new BoxGeometry(0.1, 0.75, 0.1);
    winchPost.translate(length * 0.32, 0.62, width * 0.45 + side * 0.55);
    ctx.fineMetal.push(winchPost);
  }
  // Exactly one instanced works prop adds the visible net web inside that frame.
  scratchMatrix.makeScale(1.45, 1.9, Math.max(1.2, width));
  scratchMatrix.setPosition(rackX, 0.28, 0);
  props.push(harborProp("netRack", scratchMatrix, null, false));
}

function authorSteppedInlet(ctx: StationAuthorContext): void {
  const { length, stationScale, stone, width } = ctx;
  // Gangi: stone stairs stepping down into the water, the inlet's signature.
  for (let index = 0; index < 6; index += 1) {
    const t = index / 5;
    pushBox(stone, length * 0.2, 0.34, width * (1.72 - t * 0.5), -length * 0.36 + index * length * 0.14, 0.62 - index * 0.22, 0);
  }
  // Mooring rings set into the stone steps.
  for (const index of [1, 3, 5]) {
    const t = index / 5;
    const ring = new TorusGeometry(0.24, 0.055, 5, 8);
    ring.rotateX(Math.PI / 2 - 0.35);
    ring.translate(-length * 0.36 + index * length * 0.14, 0.82 - index * 0.22, width * (1.72 - t * 0.5) / 2 - 0.15);
    ctx.metal.push(ring);
  }
  const x = ctx.quayX - 2.8;
  const eave = 4.5;
  houseWalls(ctx, x, 0, stationScale.length * 0.78, stationScale.span * 0.72, QUAY_TOP_Y, eave - 0.1);
  // The eave stops 0.2 inside the span so its fascia stays in the precinct.
  articulateIrimoya(ctx, x, eave, stationScale.silhouetteTop, stationScale.length / 2, stationScale.span / 2 - 0.2, { course: true });
}

function authorReedBoathouse(ctx: StationAuthorContext): void {
  const { length, props, stationScale, timber, width } = ctx;
  const x = ctx.quayX - 3.2;
  const w = stationScale.length;
  const eaveY = 3.6;
  const apexY = stationScale.silhouetteTop;
  const halfD = roofHalfSpanForOuterSpan(stationScale.span, apexY - eaveY, false);
  pushBox(timber, length * 0.7, 0.24, width * 1.1, length * 0.06, 0.1, 0);
  for (const z of [-halfD * 0.84, halfD * 0.84]) bandedWall(ctx, x, z, w * 0.86, 0.22, QUAY_TOP_Y, eaveY);
  // The only high, sharp A-frame: two deep slate slopes bound at the ridge.
  articulateGableRoof(ctx, x, eaveY, apexY, w, halfD, { course: true });
  // Open boat-bay mouth cut into the seaward gable: the boathouse's signature.
  const mouth = new BoxGeometry(0.55, 2.3, 2.7);
  mouth.translate(x + w * 0.43, 2.75, 0);
  ctx.metal.push(mouth);
  for (const z of [-1.45, 1.45]) {
    pushBox(timber, 0.18, 2.5, 0.18, x + w * 0.43, 2.8, z);
  }
  pushBox(timber, 0.2, 0.2, 3.1, x + w * 0.43, 4.1, 0);
  warmBox(ctx, 0.1, 0.95, 0.7, x + w * 0.43 + 0.28, 2.75, -halfD * 0.74);
  pushPierPilings(props, length * 0.62, width, length * 0.04, 5);
  scratchMatrix.makeScale(1.45, 1.4, 1.45);
  scratchMatrix.setPosition(length * 0.4, 0, width * 0.7);
  props.push(harborProp("reedClump", scratchMatrix, null, false));
}

function authorStormMole(ctx: StationAuthorContext): void {
  const { length, stationScale, stone, width } = ctx;
  // An ishigaki mole: battered stone blocks along the weather-facing curve,
  // no merlons — "not a fort".
  const radius = Math.min(5.2, Math.max(4.0, length * 0.48));
  for (let index = 0; index < 8; index += 1) {
    const angle = -0.78 + index * 0.22;
    const blockW = Math.max(1.55, length * 0.2);
    const blockD = Math.max(1.7, width * 0.84);
    const block = prismGeometry([
      [-blockD / 2 + 0.1, -0.2],
      [blockD / 2 - 0.1, -0.2],
      [blockD / 2 - 0.3, 0.8],
      [-blockD / 2 + 0.3, 0.8],
    ], blockW);
    block.rotateY(-angle);
    block.translate(-length * 0.32 + Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    stone.push(block);
  }
  // One low kura under a heavy hip-and-gable roof.
  const houseX = ctx.quayX - 3.2;
  const eave = 4.55;
  houseWalls(ctx, houseX, 0, stationScale.length * 0.74, stationScale.span * 0.7, QUAY_TOP_Y, eave - 0.1);
  articulateIrimoya(ctx, houseX, eave, stationScale.silhouetteTop, stationScale.length / 2, stationScale.span / 2, { course: true });
}

function authorPigeonnierLanding(ctx: StationAuthorContext): void {
  const { length, props, stationScale, timber, width } = ctx;
  // The detached data landmark (the pigeonnier islet) owns the cote
  // silhouette; TON's landing is a plain house whose landward wall keeps
  // two dark dove holes with perch ledges.
  pushBox(timber, length * 0.52, 0.24, width * 0.78, length * 0.02, 0.1, 0);
  const houseX = ctx.quayX - 3.2;
  const eave = 4.6;
  const houseW = stationScale.length * 0.78;
  houseWalls(ctx, houseX, 0, houseW, stationScale.span * 0.72, QUAY_TOP_Y, eave - 0.1);
  articulateIrimoya(ctx, houseX, eave, stationScale.silhouetteTop, stationScale.length / 2, stationScale.span / 2, { course: true });
  const wallX = houseX - houseW / 2;
  for (const [holeY, holeZ] of [[3.9, -0.55], [3.5, 0.55]] as const) {
    pushBox(ctx.metal, 0.12, 0.4, 0.34, wallX - 0.04, holeY, holeZ);
    pushBox(timber, 0.3, 0.09, 0.55, wallX - 0.16, holeY - 0.28, holeZ);
  }
  pushPierPilings(props, length * 0.48, width * 0.66, length * 0.02, 4);
}

function authorStoneQuay(
  ctx: StationAuthorContext,
  type: StationType,
): void {
  if (type === "ethereum-mole") return;
  const { quayLength, quayWidth, quayX, stone } = ctx;
  const depth = type === "fishing-pier" || type === "pigeonnier-islet" ? 2.15 : 2.4;
  featureBoxes(ctx, "quayPlatform", stone, [
    quayLength, depth, quayWidth, quayX, QUAY_TOP_Y - depth / 2, 0,
    quayLength + 0.4, 0.26, quayWidth + 0.4, quayX, QUAY_TOP_Y - 0.13, 0,
  ]);
  for (let course = 0; course < 2; course += 1) {
    featureBox(ctx, "quayPlatform", stone, quayLength - course * 0.5, 0.34, 0.3, quayX, QUAY_TOP_Y - 0.35 - course * 0.34, quayWidth / 2 + 0.2 + course * 0.2);
  }
}

/**
 * A working threshold, not another pier: three short quay courses lead from
 * the raised landward platform toward berth water. The Mole uses its short
 * arm so the navigable basin stays empty. All fittings share the existing
 * coarse post draw; tapered post instances also form the barrel stack.
 */
function authorStationApproach(ctx: StationAuthorContext, type: StationType): void {
  const timber = type === "hatago-wharf" || type === "fishing-pier"
    || type === "reed-boathouse" || type === "pigeonnier-islet";
  const startX = type === "ethereum-mole" ? 10 : ctx.quayX + ctx.quayLength / 2 + 0.2;
  const z = type === "ethereum-mole" ? 8.8 : 0;
  const length = 2.4;
  const width = 2.0;
  const bucket = timber ? ctx.timber : ctx.stone;
  const courses = timber ? 8 : 3;
  for (let index = 0; index < courses; index += 1) {
    pushBox(bucket, length / courses - 0.025, 0.28, width,
      startX + (index + 0.5) * length / courses, QUAY_TOP_Y - 0.14, z);
  }
  const post = (x: number, y: number, localZ: number, radius: number, height: number, color: Color | null = null) => {
    scratchMatrix.makeScale(radius, height, radius);
    scratchMatrix.setPosition(x, y + height / 2, localZ);
    ctx.props.push(harborProp("post", scratchMatrix, color, false));
  };
  // Four full-depth mooring piles anchor the apron and remain at overview LOD.
  for (const x of [startX + 0.25, startX + length - 0.25]) {
    for (const side of [-1, 1]) post(x, -0.6, z + side * 0.78, 0.12, QUAY_TOP_Y + 0.95);
  }
  const barrelColor = new Color(HARBOR_PALETTE.timber_mid);
  const hoopColor = new Color(HARBOR_PALETTE.iron_dark);
  for (const [x, y, localZ] of [
    [startX + 0.4, QUAY_TOP_Y, z + 0.4],
    [startX + 0.95, QUAY_TOP_Y, z + 0.4],
    [startX + 0.67, QUAY_TOP_Y + 0.6, z + 0.4],
  ] as const) {
    post(x, y, localZ, 0.22, 0.6, barrelColor);
    for (const hoopY of [0.12, 0.48]) {
      post(x, y + hoopY, localZ, 0.24, 0.05, hoopColor);
    }
  }
}

type XYZ = [number, number, number];

/** Shared roof articulation: every primary roof gets ridge, fascia, gable,
 *  brackets and a surface break by going through one of these helpers, so the
 *  plane never reads as a single unbroken quad at overview zoom. All trim
 *  pushes into the existing roof bucket (darker vertex colour) — zero new
 *  draw calls, zero new materials.
 *
 *  Byte-budget note: the articulate* helpers take positional numbers, not
 *  spec objects — object property names survive minification and there are
 *  ~19 call sites between them. Each doc comment spells the arg order. */
interface ArticulateOptions {
  brackets?: boolean;
  course?: boolean;
  skirt?: { drop: number; outset: number };
}

/** Irimoya (hip-and-gable) roof: field shell, ridge beam + cap, eave fascia,
 *  landward gable plate, bracket row, optional slope courses and pent skirt.
 *  Args: cx, eaveY, ridgeY, halfW (eave half-width, X), halfD (eave
 *  half-depth, Z), options, feature credit, hipInset. */
function articulateIrimoya(
  ctx: StationAuthorContext,
  cx: number,
  eaveY: number,
  ridgeY: number,
  halfW: number,
  halfD: number,
  options: ArticulateOptions = {},
  feature: "roof" | null = "roof",
  hipInset = 0.34,
): void {
  const ridgeFrom = cx - halfW;
  const ridgeTo = cx + halfW * (1 - hipInset);
  irimoyaShell(ctx, cx, eaveY, halfD, halfW, ridgeFrom, ridgeTo, ridgeY, feature);
  const ridgeMidX = (ridgeFrom + ridgeTo) / 2;
  const ridgeLength = ridgeTo - ridgeFrom;
  ridgeBeam(ctx, ridgeLength + 0.6, 0.2, 0.34, ridgeMidX, ridgeY - 0.18, 0);
  ridgeCap(ctx, ridgeLength + 0.35, 0.14, 0.52, ridgeMidX, ridgeY + 0.07, 0);
  pushEaveFascia(ctx, cx, eaveY, halfD, halfW);
  pushGablePlate(ctx, cx - halfW, eaveY, halfD, ridgeY, -1);
  if (options.brackets !== false) {
    eaveBracketRow(ctx, cx, halfW, halfD, [-0.46, 0.26], () => eaveY - 0.36, 0.16, 0.6);
  }
  if (options.course) pushSlopeCourses(ctx, eaveY, halfD, ridgeFrom, ridgeTo, ridgeY);
  if (options.skirt) {
    const { drop, outset } = options.skirt;
    const skirtHalfW = halfW + outset;
    const skirtHalfD = halfD + outset * 0.85;
    irimoyaShell(ctx, cx, eaveY - drop, skirtHalfD, skirtHalfW, ridgeFrom - outset, ridgeTo + outset * 0.4, eaveY, feature);
    pushEaveFascia(ctx, cx, eaveY - drop, skirtHalfD, skirtHalfW);
    pushGablePlate(ctx, ridgeFrom - outset, eaveY - drop, skirtHalfD, eaveY, -1);
    if (options.brackets !== false) {
      eaveBracketRow(ctx, cx, skirtHalfW, skirtHalfD, [-0.46, 0.26], () => eaveY - drop - 0.36, 0.16, 0.6);
    }
    ctx.articulation.surfaceBreaks += 1;
  }
}

/** The hipped field shell itself: two quad slopes plus the hip and gable ends. */
function irimoyaShell(
  ctx: StationAuthorContext,
  cx: number,
  eaveY: number,
  halfD: number,
  halfW: number,
  ridgeFrom: number,
  ridgeTo: number,
  ridgeY: number,
  feature: "roof" | null,
): void {
  const triangles: number[] = [];
  const quad = (a: XYZ, b: XYZ, c: XYZ, d: XYZ) => {
    triangles.push(...a, ...b, ...c, ...a, ...c, ...d);
  };
  quad([cx - halfW, eaveY, halfD], [cx + halfW, eaveY, halfD], [ridgeTo, ridgeY, 0], [ridgeFrom, ridgeY, 0]);
  quad([cx - halfW, eaveY, -halfD], [ridgeFrom, ridgeY, 0], [ridgeTo, ridgeY, 0], [cx + halfW, eaveY, -halfD]);
  if (ridgeTo < cx + halfW - 1e-4) {
    triangles.push(cx + halfW, eaveY, halfD, cx + halfW, eaveY, -halfD, ridgeTo, ridgeY, 0);
  }
  triangles.push(cx - halfW, eaveY, halfD, ridgeFrom, ridgeY, 0, cx - halfW, eaveY, -halfD);
  addFeatureGeometry(ctx, feature, ctx.roofs, triangleGeometry(triangles));
  ctx.articulation.fieldShells += 1;
}

function pushEaveFascia(ctx: StationAuthorContext, cx: number, eaveY: number, halfD: number, halfW: number, cz = 0): void {
  for (const side of [1, -1]) {
    trimBox(ctx, 2 * halfW + 0.3, 0.24, 0.18, cx, eaveY - 0.04, cz + side * (halfD + 0.04));
  }
  for (const side of [1, -1]) {
    trimBox(ctx, 0.18, 0.24, 2 * halfD + 0.3, cx + side * (halfW + 0.04), eaveY - 0.04, cz);
  }
  ctx.articulation.fascias += 4;
}

/** Triangular gable plate (prism) closing the roof end. */
function pushGablePlate(ctx: StationAuthorContext, gableX: number, eaveY: number, halfD: number, ridgeY: number, facing: number): void {
  const plate = prismGeometry([
    [-halfD * 0.92, eaveY + 0.05],
    [halfD * 0.92, eaveY + 0.05],
    [0, ridgeY - 0.04],
  ], 0.42);
  plate.translate(gableX + facing * 0.08, 0, 0);
  ctx.roofTrim.push(plate);
  ctx.articulation.gablePlates += 1;
}

/** Surface-break courses laid parallel to the ridge on both slopes. */
function pushSlopeCourses(
  ctx: StationAuthorContext,
  eaveY: number,
  halfD: number,
  ridgeFrom: number,
  ridgeTo: number,
  ridgeY: number,
): void {
  const rise = ridgeY - eaveY;
  const pitch = Math.atan2(rise, halfD);
  const slopeLength = Math.hypot(rise, halfD);
  const courseX = (ridgeFrom + ridgeTo) / 2;
  for (const side of [-1, 1]) {
    trimCourse(ctx, (ridgeTo - ridgeFrom) * 0.9, 0.15, slopeLength * 0.34, side * pitch, courseX, eaveY + rise * 0.46 + 0.08, side * halfD * 0.55);
  }
  ctx.articulation.surfaceBreaks += 1;
}

/** Compensate for the lean-to slab's thickness so its rendered top is authored. */
function leanToHighYForTop(targetTop: number, lowY: number, halfD: number): number {
  let highY = targetTop - 0.13;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const pitch = Math.atan2(highY - lowY, 2 * halfD);
    highY = targetTop - Math.cos(pitch) * 0.13;
  }
  return highY;
}

/** Keep a pitched slab's outer eave on the ladder span despite its thickness. */
function roofHalfSpanForOuterSpan(targetSpan: number, rise: number, fullRun: boolean): number {
  let halfSpan = targetSpan / 2;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const pitch = Math.atan2(rise, halfSpan * (fullRun ? 2 : 1));
    halfSpan = targetSpan / 2 - Math.sin(pitch) * 0.13;
  }
  return halfSpan;
}

/** Sharp A-frame gable: two slab slopes, ridge beam + cap, optional thatch
 *  ridge ties, fascia ring, gable plate, bracket row, optional courses.
 *  Args: cx, eaveY, apexY, w, eaveHalfD, options ({course, ridgeTies}),
 *  feature credit. */
function articulateGableRoof(
  ctx: StationAuthorContext,
  cx: number,
  eaveY: number,
  apexY: number,
  w: number,
  eaveHalfD: number,
  options: { course?: boolean; ridgeTies?: boolean } = {},
  feature: "roof" | null = "roof",
): void {
  const rise = apexY - eaveY;
  const pitch = Math.atan2(rise, eaveHalfD);
  const slopeLength = Math.hypot(rise, eaveHalfD);
  for (const side of [-1, 1]) {
    const slope = new BoxGeometry(w, 0.26, slopeLength);
    slope.rotateX(side * pitch);
    slope.translate(cx, (eaveY + apexY) / 2, side * eaveHalfD / 2);
    addFeatureGeometry(ctx, feature, ctx.roofs, slope);
    ctx.articulation.fieldShells += 1;
  }
  ridgeBeam(ctx, w + 0.55, 0.2, 0.36, cx, apexY - 0.22, 0);
  ridgeCap(ctx, w + 0.3, 0.15, 0.55, cx, apexY + 0.09, 0);
  if (options.ridgeTies) {
    // Thatch binding: cross ties lashed over the apex.
    for (const fraction of [-0.34, 0.02, 0.38]) {
      trimBox(ctx, 0.2, 0.14, eaveHalfD * 2.24, cx + fraction * w, apexY + 0.05, 0);
    }
    ctx.articulation.surfaceBreaks += 1;
  }
  for (const side of [-1, 1]) {
    trimBox(ctx, w + 0.25, 0.24, 0.18, cx, eaveY - 0.05, side * (eaveHalfD + 0.04));
    trimBox(ctx, 0.2, 0.24, 2 * eaveHalfD + 0.25, cx + side * (w / 2 + 0.04), eaveY - 0.05, 0);
  }
  ctx.articulation.fascias += 4;
  pushGablePlate(ctx, cx - w / 2, eaveY, eaveHalfD, apexY, -1);
  eaveBracketRow(ctx, cx, w, eaveHalfD, [-0.42, 0.26], () => eaveY - 0.34, 0.15, 0.55);
  if (options.course) {
    for (const side of [-1, 1]) {
      trimCourse(ctx, w * 0.86, 0.15, slopeLength * 0.24, side * pitch, cx, eaveY + rise * 0.52 + 0.14, side * eaveHalfD * 0.5);
    }
    ctx.articulation.surfaceBreaks += 1;
  }
}

/** Mono-pitch slab: field slab, ridge beam + cap at the high side, fascia,
 *  landward gablet, bracket row, optional course.
 *  Args: cx, cz, highY, lowY, halfD, w, highSide (±1), options ({course}),
 *  feature credit. */
function articulateLeanToRoof(
  ctx: StationAuthorContext,
  cx: number,
  cz: number,
  highY: number,
  lowY: number,
  halfD: number,
  w: number,
  highSide: -1 | 1,
  options: { course?: boolean } = {},
  feature: "roof" | null = "roof",
): void {
  const rise = highY - lowY;
  const pitch = Math.atan2(rise, 2 * halfD);
  const slabLength = Math.hypot(2 * halfD, rise);
  const slab = new BoxGeometry(w, 0.26, slabLength);
  slab.rotateX(-highSide * pitch);
  slab.translate(cx, (highY + lowY) / 2, cz);
  addFeatureGeometry(ctx, feature, ctx.roofs, slab);
  ctx.articulation.fieldShells += 1;
  ridgeBeam(ctx, w + 0.5, 0.2, 0.34, cx, highY - 0.22, cz + highSide * halfD);
  ridgeCap(ctx, w + 0.3, 0.16, 0.5, cx, highY + 0.09, cz + highSide * (halfD + 0.05));
  for (const side of [-1, 1]) {
    trimBox(ctx, w + 0.25, 0.24, 0.18, cx, (side === highSide ? highY : lowY) - 0.05, cz + side * (halfD + 0.04));
  }
  for (const side of [-1, 1]) {
    trimBox(ctx, 0.2, 0.24, 2 * halfD + 0.25, cx + side * (w / 2 + 0.04), lowY - 0.05, cz);
  }
  ctx.articulation.fascias += 4;
  const plate = prismGeometry([
    [-halfD * 0.92, lowY + 0.05],
    [halfD * 0.92, lowY + 0.05],
    [halfD * 0.92 * highSide, highY - 0.04],
  ], 0.42);
  plate.translate(cx - w / 2 - 0.04, 0, cz);
  ctx.roofTrim.push(plate);
  ctx.articulation.gablePlates += 1;
  eaveBracketRow(ctx, cx, w, halfD, [-0.42, 0.26], (side) => (side === highSide ? highY : lowY) - 0.34, 0.15, 0.55, cz);
  if (options.course) {
    trimCourse(ctx, w * 0.88, 0.15, slabLength * 0.22, -highSide * pitch, cx, lowY + rise * 0.55 + 0.14, cz + highSide * halfD * 0.1);
    ctx.articulation.surfaceBreaks += 1;
  }
}

/** Small square hip cap (the fire-watch frame's): cone field and eave fascia,
 *  no finials, so the apex is the silhouette top.
 *  Args: cx, cz, baseY, apexY, halfW, halfD. */
function articulatePyramidRoof(
  ctx: StationAuthorContext,
  cx: number,
  cz: number,
  baseY: number,
  apexY: number,
  halfW: number,
  halfD: number,
): void {
  const pyramid = new ConeGeometry(1, 1, 4);
  pyramid.rotateY(Math.PI / 4);
  pyramid.scale(halfW * Math.SQRT2, apexY - baseY, halfD * Math.SQRT2);
  pyramid.translate(cx, baseY + (apexY - baseY) / 2, cz);
  ctx.roofs.push(pyramid);
  ctx.articulation.fieldShells += 1;
  pushEaveFascia(ctx, cx, baseY, halfD, halfW, cz);
}

function triangleGeometry(triangles: number[]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(triangles, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(new Array<number>((triangles.length / 3) * 2).fill(0), 2));
  geometry.computeVertexNormals();
  return geometry;
}

/** Extrudes a (z, y) profile along x — used for gable plates and gablets. */
function prismGeometry(profile: ReadonlyArray<readonly [number, number]>, length: number): BufferGeometry {
  const triangles: number[] = [];
  const half = length / 2;
  const point = (side: number, index: number): XYZ => {
    const [z, y] = profile[index]!;
    return [side * half, y, z];
  };
  for (let index = 1; index < profile.length - 1; index += 1) {
    triangles.push(...point(1, 0), ...point(1, index), ...point(1, index + 1));
    triangles.push(...point(-1, 0), ...point(-1, index + 1), ...point(-1, index));
  }
  for (let index = 0; index < profile.length; index += 1) {
    const next = (index + 1) % profile.length;
    triangles.push(...point(1, index), ...point(1, next), ...point(-1, next));
    triangles.push(...point(1, index), ...point(-1, next), ...point(-1, index));
  }
  return triangleGeometry(triangles);
}

function stationFeatures(
  type: StationType,
  geometry: StationFeatureGeometry,
): HarborStationFeatures {
  const roof = measureFeature(geometry.roof);
  if (type === "ethereum-mole") {
    const longAxis = Math.max(roof.footprint.length, roof.footprint.span);
    const shortAxis = Math.min(roof.footprint.length, roof.footprint.span);
    roof.footprint = { length: longAxis, span: shortAxis };
  }
  let eaveY = Infinity;
  for (const shell of geometry.roof) eaveY = Math.min(eaveY, shell.boundingBox?.min.y ?? Infinity);
  return {
    quayPlatform: measureFeature(geometry.quayPlatform),
    roof: { ...roof, eaveY: Number.isFinite(eaveY) ? eaveY : 0 },
    warmWindowCount: geometry.warmWindows.length,
  };
}

function measureFeature(geometries: readonly BufferGeometry[]): HarborFeatureDimensions {
  const bounds = new Box3();
  bounds.makeEmpty();
  for (const geometry of geometries) {
    geometry.computeBoundingBox();
    if (geometry.boundingBox) bounds.union(geometry.boundingBox);
  }
  if (bounds.isEmpty()) return { footprint: { length: 0, span: 0 }, height: 0 };
  return {
    footprint: {
      length: bounds.max.x - bounds.min.x,
      span: bounds.max.z - bounds.min.z,
    },
    // The dock root is y=0; top elevation is the silhouette-height contract,
    // not the roof slab's own thickness.
    height: bounds.max.y,
  };
}


export function harborIdentity(dock: DockNode): HarborIdentity {
  return identityForStation(resolveDockStation(dock, 0).type);
}

export function harborPlan(dock: DockNode): HarborPlan {
  return harborIdentity(dock).stationType;
}

function resolveDockStation(dock: DockNode, fallbackBearing: number): DockStationContract {
  const candidate = (dock as DockWithOptionalStation).station;
  if (candidate && isStationType(candidate.type) && Number.isFinite(candidate.shoreBearing)) {
    return {
      coveId: typeof candidate.coveId === "string" ? candidate.coveId : `station.${dock.chainId}`,
      shoreBearing: candidate.shoreBearing!,
      type: candidate.type,
    };
  }
  const type = LEGACY_STATION_BY_CHAIN[dock.chainId] ?? fallbackStationType(dock.chainId);
  return { coveId: `legacy.${dock.chainId}`, shoreBearing: fallbackBearing, type };
}

function identityForStation(stationType: StationType): HarborIdentity {
  return { stationType, ...STATION_IDENTITY[stationType] };
}

function isStationType(value: unknown): value is StationType {
  return typeof value === "string" && STATION_TYPES.includes(value as StationType);
}

function fallbackStationType(chainId: string): StationType {
  const options: readonly StationType[] = ["hatago-wharf", "uogashi", "tea-house-quay", "fishing-pier", "stepped-inlet", "reed-boathouse"];
  return options[Math.min(options.length - 1, Math.floor(stableUnit(`station-type.${chainId}`) * options.length))]!;
}

/**
 * Chimney anchor for the three hearth archetypes (warm-village D3), in the
 * station's local frame. Each sits ON the archetype's own ridge, at the hearth
 * the smoke belongs to: the uogashi kitchen's mono-pitch ridge, the hatago
 * inn's main irimoya ridge, and the tea-house hearth on the landward ridge
 * run. Every other archetype returns null — no chimney, no smoke. Consumers
 * transform this through the recipe's anchor pose the way `cargoTideSpecs`
 * does for crate slots.
 */
export interface StationChimneyAnchor { x: number; y: number; z: number }

function stationChimneyLocal(
  type: StationType,
  stationScale: StationScale,
  quayX: number,
): StationChimneyAnchor | null {
  if (type === "uogashi") {
    // authorUogashi's mono-pitch: high closed side at z = −halfD.
    const { halfD, highY } = uogashiRoof(stationScale);
    return { x: quayX - 3.2 + stationScale.length * 0.2, y: highY, z: -halfD };
  }
  if (type === "hatago-wharf") {
    // authorHatagoWharf's main irimoya ridge runs along x at z = 0.
    return { x: quayX - 3.4 + stationScale.length * 0.1, y: stationScale.silhouetteTop, z: 0 };
  }
  if (type === "tea-house-quay") {
    // authorTeaHouseQuay's irimoya ridge at z = 0, on its landward run.
    return { x: quayX - 3.2 - stationScale.length * 0.28, y: stationScale.silhouetteTop, z: 0 };
  }
  return null;
}

function pushPierPilings(
  props: HarborPropInstance[],
  length: number,
  width: number,
  centerX: number,
  bays: number,
): void {
  for (let bay = 0; bay <= bays; bay += 1) {
    const x = centerX - length / 2 + (bay / bays) * length;
    for (const z of [-width / 2, width / 2]) {
      scratchMatrix.makeTranslation(x, -1.4, z);
      props.push(harborProp("piling", scratchMatrix, null, false));
    }
  }
}

function cargoTideLanes(length: number, quayLength: number, quayWidth: number, quayX: number): CargoTideLanes {
  const aboard: CargoTideSlot[] = [];
  const ashore: CargoTideSlot[] = [];
  for (let index = 0; index < CARGO_TIDE_SLOTS; index += 1) {
    const t = index / (CARGO_TIDE_SLOTS - 1);
    aboard.push({ x: -length * 0.12 + t * length * 0.58, y: PIER_DECK_TOP_Y, z: 0 });
    ashore.push({ x: quayX + quayLength * (0.4 - t * 0.8), y: QUAY_TOP_Y, z: quayWidth * 0.46 });
  }
  return { aboard, ashore };
}


function dockAccentColor(dock: DockNode): Color {
  const color = new Color(dockHealthAccent(dock.healthBand));
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(
    (hsl.h + (stableUnit(`dock-hue.${dock.chainId}`) - 0.5) * 0.1 + 1) % 1,
    MathUtils.clamp(hsl.s * (0.75 + stableUnit(`dock-sat.${dock.chainId}`) * 0.5), 0.2, 0.85),
    MathUtils.clamp(hsl.l * (0.78 + stableUnit(`dock-light.${dock.chainId}`) * 0.42), 0.28, 0.72),
  );
  return color;
}

function dockHealthAccent(healthBand: DockNode["healthBand"]): string {
  if (healthBand === "robust" || healthBand === "healthy") return "#78b689";
  if (healthBand === "mixed") return "#dfb95a";
  if (healthBand === "fragile") return "#d98b54";
  return "#c9675c";
}

function mergeBucket(parts: BufferGeometry[]): BufferGeometry {
  const indexed = parts.filter((part) => part.index !== null).length;
  const normalized = indexed === 0 || indexed === parts.length
    ? parts
    : parts.map((part) => (part.index === null ? part : part.toNonIndexed()));
  return mergeGeometries(normalized, false)!;
}

function pushMergedPart(
  target: HarborBucketPart[],
  bucket: HarborBucket,
  geometries: BufferGeometry[],
  color: Color | string,
  fineDetail: boolean,
  castShadow: boolean,
): void {
  if (geometries.length === 0) return;
  target.push(harborPart(bucket, mergeBucket(geometries), color, fineDetail, castShadow));
}

function harborPart(
  bucket: HarborBucket,
  geometry: BufferGeometry,
  color: Color | string,
  fineDetail: boolean,
  castShadow: boolean,
): HarborBucketPart {
  return {
    bucket,
    castShadow,
    color: color instanceof Color ? color.clone() : new Color(color),
    fineDetail,
    geometry,
  };
}

function harborProp(kind: HarborPropKind, matrix: Matrix4, color: Color | null, fineDetail: boolean): HarborPropInstance {
  return { color: color?.clone() ?? null, fineDetail, kind, matrix: matrix.clone() };
}

function pushGeometry(parts: BufferGeometry[], geometry: BufferGeometry, x: number, y: number, z: number): void {
  geometry.translate(x, y, z);
  parts.push(geometry);
}


