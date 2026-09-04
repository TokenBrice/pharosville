import {
  BoxGeometry,
  Box3,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  MathUtils,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { mergeGeometries, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  stationFootprint,
  stationScaleFor,
  type StationFootprint,
  type StationScale,
  type StationType,
} from "../systems/dock-layout";
import { GARDEN_DOCK_ROOT_Y, GARDEN_WATER_Y as WATER_LEVEL } from "../systems/garden-observatory-slice";
import { quayMasonryHealth } from "../systems/dock-health";
import { HARBOR_PALETTE } from "../systems/palette";
import type { DockNode } from "../systems/world-types";
import { assignGardenChainFlagCell } from "./garden-chain-flag";
import { applyGardenHeightFog } from "./garden-height-fog";
import { setTilePosition, stableUnit } from "./garden-util";
export type { StationType } from "../systems/dock-layout";

const scratchMatrix = new Matrix4();
const scratchScale = new Vector3();

export type StationSignature =
  | "enclosed-basin"
  | "guest-lantern-row"
  | "steelyard"
  | "engawa"
  | "net-racks"
  | "top-lanterns"
  | "reed-clump"
  | "lantern-tower"
  | "pigeonnier";
export type StationRoofline =
  | "deep-hip"
  | "hatago-stacked"
  | "market-monopitch"
  | "tea-hip"
  | "lean-to"
  | "stepped-canopy"
  | "thatch-gable"
  | "mole-tower-cap"
  | "pigeonnier-cone";
export type StationFlagShape =
  | "swallowtail"
  | "nobori"
  | "twin-tail"
  | "chamfered"
  | "forked"
  | "stepped"
  | "tapered"
  | "storm-split"
  | "square";

export type StationSecondLevel =
  | "bell-tower"
  | "inn-gallery"
  | "scale-beam"
  | "moon-window-loft"
  | "net-drying-rack"
  | "lantern-crown"
  | "thatched-dome"
  | "lantern-tower"
  | "pigeonnier-cote";

export interface HarborIdentity {
  stationType: StationType;
  roofline: StationRoofline;
  signature: StationSignature;
  secondLevel: StationSecondLevel;
  flagShape: StationFlagShape;
}
export type HarborPlan = StationType;
export type HarborSignature = StationSignature;

export interface HarborFeatureDimensions {
  footprint: { length: number; span: number };
  height: number;
}

/**
 * Measured recipe evidence for the features that must survive the overview
 * camera. Keeping this beside the geometry makes the silhouette contract
 * testable without splitting the global material buckets into per-station
 * meshes merely to give their pieces names.
 */
export interface HarborStationFeatures {
  primaryMass: HarborFeatureDimensions;
  secondLevel: HarborFeatureDimensions & { name: StationSecondLevel };
  quayPlatform: HarborFeatureDimensions & { litEdge: boolean; litEdgeCount: number };
  warmWindowCount: number;
}

const STATION_TYPES: readonly StationType[] = [
  "ethereum-mole", "hatago-wharf", "uogashi", "stepped-inlet",
  "fishing-pier", "tea-house-quay", "reed-boathouse", "storm-mole",
  "pigeonnier-islet",
];
const STATION_IDENTITY: Record<StationType, Omit<HarborIdentity, "stationType">> = {
  "ethereum-mole": { flagShape: "swallowtail", roofline: "deep-hip", secondLevel: "bell-tower", signature: "enclosed-basin" },
  "fishing-pier": { flagShape: "forked", roofline: "lean-to", secondLevel: "net-drying-rack", signature: "net-racks" },
  "hatago-wharf": { flagShape: "nobori", roofline: "hatago-stacked", secondLevel: "inn-gallery", signature: "guest-lantern-row" },
  "pigeonnier-islet": { flagShape: "square", roofline: "pigeonnier-cone", secondLevel: "pigeonnier-cote", signature: "pigeonnier" },
  "reed-boathouse": { flagShape: "tapered", roofline: "thatch-gable", secondLevel: "thatched-dome", signature: "reed-clump" },
  "stepped-inlet": { flagShape: "stepped", roofline: "stepped-canopy", secondLevel: "lantern-crown", signature: "top-lanterns" },
  "storm-mole": { flagShape: "storm-split", roofline: "mole-tower-cap", secondLevel: "lantern-tower", signature: "lantern-tower" },
  "tea-house-quay": { flagShape: "chamfered", roofline: "tea-hip", secondLevel: "moon-window-loft", signature: "engawa" },
  uogashi: { flagShape: "twin-tail", roofline: "market-monopitch", secondLevel: "scale-beam", signature: "steelyard" },
};

/** Standalone fallback until the systems branch supplies `dock.station`. */
const LEGACY_STATION_BY_CHAIN: Record<string, StationType> = {
  arbitrum: "storm-mole",
  base: "hatago-wharf",
  bsc: "tea-house-quay",
  ethereum: "ethereum-mole",
  hyperliquid: "uogashi",
  "hyperliquid-l1": "uogashi",
  polygon: "reed-boathouse",
  solana: "fishing-pier",
  ton: "pigeonnier-islet",
  tron: "stepped-inlet",
};

interface DockStationContract {
  coveId: string;
  type: StationType;
  shoreBearing: number;
}
type DockWithOptionalStation = DockNode & { station?: Partial<DockStationContract> };

export interface DockVisual { recipe: DockRecipe; fineDetail: Group; root: Group }
export type HarborBucket = "timber" | "stone" | "metal" | "accent" | "wall" | "window" | "roof";
export type HarborPropKind = "post" | "lampHead" | "plank" | "bollard" | "piling" | "netRack" | "reedClump";
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
  accent: Color;
  shape: StationFlagShape;
  placement: { x: number; y: number; z: number; yaw: number; scale: number };
  scaleMultiplier: number;
  sag: number;
  wavePhase: number;
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
  cargoTideLanes: CargoTideLanes;
  tideFace: DockTideFace;
  footprint: StationFootprint;
  features: HarborStationFeatures;
  identity: HarborIdentity;
  lampWorldPositions: { x: number; z: number }[];
  plan: HarborPlan;
  signature: HarborSignature;
  quayHealth: number;
  accentColor: Color;
}

const CAMERA_FACING_YAW = Math.PI / 4;
const PIER_DECK_TOP_Y = 0.24;
const QUAY_TOP_Y = 1.55;
export const HARBOR_FLAG_SCALE_MULTIPLIER = 1.6;

/** Two approach lanterns rooted at each station mouth, just seaward of the quay. */
export function gardenHarborLanternWorldPositions(
  recipes: readonly DockRecipe[],
): { x: number; z: number }[] {
  return recipes.flatMap((recipe) => {
    const bearing = recipe.station.shoreBearing;
    const seawardX = Math.cos(bearing);
    const seawardZ = Math.sin(bearing);
    const tangentX = -seawardZ;
    const tangentZ = seawardX;
    return [-1, 1].map((side) => ({
      x: recipe.anchorPosition.x + seawardX * 1.25 + tangentX * side * 1.8,
      z: recipe.anchorPosition.z + seawardZ * 1.25 + tangentZ * side * 1.8,
    }));
  });
}

export function createHarborLanterns(
  recipes: readonly DockRecipe[],
): {
  lightMaterial: MeshStandardMaterial;
  root: Group;
} {
  const root = new Group();
  const positions = gardenHarborLanternWorldPositions(recipes);
  const count = positions.length;
  const bodyMaterial = new MeshStandardMaterial({
    color: "#766348",
    metalness: 0.38,
    roughness: 0.65,
  });
  const lightMaterial = new MeshStandardMaterial({
    color: HARBOR_PALETTE.lantern_glow,
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity: 0.25,
    roughness: 0.25,
  });
  const bodies = new InstancedMesh(new CylinderGeometry(0.12, 0.2, 0.42, 6), bodyMaterial, count);
  const lights = new InstancedMesh(new SphereGeometry(0.16, 6, 4), lightMaterial, count);
  for (let index = 0; index < count; index += 1) {
    const { x, z } = positions[index]!;
    scratchMatrix.makeTranslation(x, WATER_LEVEL + 0.26, z);
    bodies.setMatrixAt(index, scratchMatrix);
    scratchMatrix.makeTranslation(x, WATER_LEVEL + 0.58, z);
    lights.setMatrixAt(index, scratchMatrix);
  }
  bodies.instanceMatrix.needsUpdate = true;
  lights.instanceMatrix.needsUpdate = true;
  root.add(bodies, lights);
  applyGardenHeightFog(root);
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
  const flagWavePhase = dockFlagWavePhase(dock.chainId);
  const ethereumMole = station.type === "ethereum-mole";
  const stationScale = stationScaleFor(station.type, dock.totalUsd);
  const footprint = stationFootprint(station.type, dock.totalUsd, dock.size);
  const length = 7.6 * amountScale * (ethereumMole ? 1.5 : 1.06);
  const width = (1.62 + amountScale * 0.36) * (ethereumMole ? 1.42 : 1.08);
  const quayHealth = quayMasonryHealth(dock) ?? 0.58;
  const accent = dockAccentColor(dock);
  const stoneColor = new Color("#665f55").lerp(new Color("#a39d8c"), quayHealth);
  const quayLength = (3.6 + supply * 3.5) * (ethereumMole ? 1.38 : 1.05);
  const quayWidth = width * (ethereumMole ? 2.7 : 2.15);
  const quayX = -length * (ethereumMole ? 0.27 : 0.3);

  const timber: BufferGeometry[] = [];
  const stone: BufferGeometry[] = [];
  const metal: BufferGeometry[] = [];
  const walls: BufferGeometry[] = [];
  const roofs: BufferGeometry[] = [];
  const roofTrim: BufferGeometry[] = [];
  const windows: BufferGeometry[] = [];
  const accents: BufferGeometry[] = [];
  const props: HarborPropInstance[] = [];
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
    primaryMass: [],
    quayLitEdge: [],
    quayPlatform: [],
    secondLevel: [],
    warmWindows: [],
  };
  const stationContext: StationAuthorContext = {
    accents, articulation, featureGeometry, fineMetal, flagWavePhase, length, metal, props, quayLength, quayWidth, quayX, roofTrim, roofs, stationScale, stone, supply, timber, walls, width, windows,
  };
  authorStoneQuay(stationContext, station.type);
  STATION_AUTHORS[station.type](stationContext);
  authorStationFidelity(stationContext, station.type);

  const parts: HarborBucketPart[] = [];
  pushMergedPart(parts, "timber", timber, HARBOR_PALETTE.timber_mid, false, true);
  pushMergedPart(parts, "stone", stone, stoneColor, false, true);
  pushMergedPart(parts, "metal", metal, HARBOR_PALETTE.iron_dark, false, false);
  pushMergedPart(parts, "metal", fineMetal, HARBOR_PALETTE.iron_dark, true, false);
  pushMergedPart(parts, "wall", walls, "#a99a79", false, true);
  pushMergedPart(parts, "roof", roofs, STATION_ROOF_COLOR[station.type], false, true);
  pushMergedPart(parts, "roof", roofTrim, roofTrimColor(station.type), false, true);
  pushMergedPart(parts, "window", windows, HARBOR_PALETTE.lantern_glow, false, false);
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

  const lamps = stationLampLocals(station.type, length, width);
  const staff = stationFlagPlacement(station.type, length, width, supply);
  const stationPosts = ethereumMole
    ? [{ height: staff.height, radius: 0.075, x: staff.x, z: staff.z }]
    : [
        { height: staff.height, radius: 0.075, x: staff.x, z: staff.z },
        ...lamps.map((lamp) => ({ ...lamp, radius: 0.085 })),
      ];
  for (const post of stationPosts) {
    scratchMatrix.makeScale(post.radius, post.height, post.radius);
    scratchMatrix.setPosition(post.x, post.height / 2 + QUAY_TOP_Y, post.z);
    props.push(harborProp("post", scratchMatrix, null, false));
  }
  if (!ethereumMole) for (const lamp of lamps) {
    scratchMatrix.makeTranslation(lamp.x, lamp.height + QUAY_TOP_Y + 0.06, lamp.z);
    props.push(harborProp("lampHead", scratchMatrix, null, false));
  }
  const flag = authorChainFlag(dock, accent, identity.flagShape, {
    height: staff.height,
    scale: staff.scale,
    x: staff.x,
    yaw: CAMERA_FACING_YAW - root.rotation.y,
    z: staff.z,
  });
  attachRoofProfileTelemetry(parts, articulation);

  return {
    accentColor: accent.clone(),
    anchorPosition: root.position.clone(),
    anchorRotationY: root.rotation.y,
    cargoTideLanes: cargoTideLanes(length, quayLength, quayWidth, quayX),
    dock,
    flag,
    features: stationFeatures(station.type, featureGeometry),
    footprint,
    identity,
    lampWorldPositions: lamps.slice(0, 3).map((lamp) => localToWorldXZ(root, lamp.x, lamp.z)),
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

interface StationAuthorContext {
  accents: BufferGeometry[];
  articulation: RoofArticulationProfile;
  featureGeometry: StationFeatureGeometry;
  flagWavePhase: number;
  length: number;
  fineMetal: BufferGeometry[];
  metal: BufferGeometry[];
  props: HarborPropInstance[];
  quayLength: number;
  quayWidth: number;
  quayX: number;
  roofTrim: BufferGeometry[];
  roofs: BufferGeometry[];
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

/** The station's own palette-governed roof rung, one per archetype. */
const STATION_ROOF_COLOR: Record<StationType, string> = {
  "ethereum-mole": HARBOR_PALETTE.roof_clay,
  "fishing-pier": HARBOR_PALETTE.roof_timber_shake,
  "hatago-wharf": HARBOR_PALETTE.roof_slate_kawara,
  "pigeonnier-islet": HARBOR_PALETTE.roof_cote_clay,
  "reed-boathouse": HARBOR_PALETTE.roof_thatch,
  "stepped-inlet": HARBOR_PALETTE.roof_dressed_stone,
  "storm-mole": HARBOR_PALETTE.roof_storm_slate,
  "tea-house-quay": HARBOR_PALETTE.roof_tea_house_slate,
  uogashi: HARBOR_PALETTE.roof_weathered_copper,
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

/** The ridge/fascia trim is the station's own roof hex scaled down, never a new tone. */
function roofTrimColor(type: StationType): Color {
  return new Color(STATION_ROOF_COLOR[type]).multiplyScalar(0.66);
}


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
  primaryMass: BufferGeometry[];
  quayLitEdge: BufferGeometry[];
  quayPlatform: BufferGeometry[];
  secondLevel: BufferGeometry[];
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

function addFeatureGeometry(
  ctx: StationAuthorContext,
  feature: keyof StationFeatureGeometry,
  bucket: BufferGeometry[],
  geometry: BufferGeometry,
): void {
  bucket.push(geometry);
  ctx.featureGeometry[feature].push(geometry);
}

function pushWarmWindow(
  ctx: StationAuthorContext,
  geometry: BufferGeometry,
  x: number,
  y: number,
  z: number,
): void {
  pushFeatureGeometry(ctx, "warmWindows", ctx.windows, geometry, x, y, z);
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

/** secondLevel shorthand — the most-credited feature in the file. */
function secondBox(ctx: StationAuthorContext, bucket: BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number): void {
  featureBox(ctx, "secondLevel", bucket, w, h, d, x, y, z);
}

/** Flat stride-6 secondLevel box table. */
function secondBoxes(ctx: StationAuthorContext, bucket: BufferGeometry[], table: readonly number[]): void {
  for (let index = 0; index < table.length; index += 6) {
    secondBox(ctx, bucket, table[index]!, table[index + 1]!, table[index + 2]!, table[index + 3]!, table[index + 4]!, table[index + 5]!);
  }
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
  xOffset: number;
}

const FACADE_FIDELITY: Record<Exclude<StationType, "ethereum-mole">, FacadeFidelity> = {
  "fishing-pier": { bays: 2, openingHeight: 1.7, openingWidth: 0.62, xOffset: -3.2 },
  "hatago-wharf": { bays: 4, openingHeight: 2.2, openingWidth: 0.58, xOffset: -3.4 },
  "pigeonnier-islet": { bays: 3, openingHeight: 1.25, openingWidth: 0.46, xOffset: -3.2 },
  "reed-boathouse": { bays: 1, openingHeight: 2.65, openingWidth: 0.52, xOffset: -3.2 },
  "stepped-inlet": { bays: 3, openingHeight: 1.35, openingWidth: 0.48, xOffset: -2.8 },
  "storm-mole": { bays: 2, openingHeight: 1.85, openingWidth: 0.68, xOffset: -3.2 },
  "tea-house-quay": { bays: 2, openingHeight: 1.55, openingWidth: 0.42, xOffset: -3.2 },
  uogashi: { bays: 5, openingHeight: 2.35, openingWidth: 0.7, xOffset: -3.2 },
};

/**
 * Overview geometry shared as a grammar, never as a silhouette: a battered
 * waterline seat, one recessed working face, and a single chain-coloured
 * plaque. The opposite wall and most of every roof stay deliberately calm.
 */
function authorStationFidelity(ctx: StationAuthorContext, type: StationType): void {
  if (type === "ethereum-mole") {
    authorMoleMasonry(ctx);
    pushChamferedBox(ctx.accents, 0.16, 0.62, 1.2, -2.91, 1.12, -5.1, 0.05);
    return;
  }
  const spec = FACADE_FIDELITY[type];
  const hallX = ctx.quayX + spec.xOffset;
  const facadeX = hallX + ctx.stationScale.length / 2;
  const span = ctx.stationScale.span;
  const bayRun = span / spec.bays;

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

  // Dark infill sits 0.14 behind the pilaster/lintel plane. Bay counts and
  // proportions are intentionally sparse and station-specific.
  for (let bay = 0; bay < spec.bays; bay += 1) {
    const z = -span / 2 + bayRun * (bay + 0.5);
    const width = bayRun * spec.openingWidth * (bay === spec.bays - 1 ? 0.82 : 1);
    const height = spec.openingHeight * (bay % 2 === 0 ? 1 : 0.82);
    pushBox(ctx.metal, 0.1, height, width, facadeX - 0.13, QUAY_TOP_Y + height / 2 + 0.22, z);
    pushChamferedBox(ctx.timber, 0.22, height + 0.34, 0.22, facadeX + 0.01, QUAY_TOP_Y + height / 2 + 0.22, z - width / 2 - 0.13, 0.04);
    pushBox(ctx.timber, 0.2, 0.22, width + 0.45, facadeX + 0.02, QUAY_TOP_Y + height + 0.31, z);
  }
  pushBox(ctx.timber, 0.2, 0.24, span * 0.86, facadeX + 0.02, QUAY_TOP_Y + 0.2, 0);
  pushChamferedBox(ctx.accents, 0.16, 0.58, 0.9, ctx.quayX + ctx.quayLength / 2 + 0.08, 1.08, -ctx.quayWidth * 0.3, 0.05);
}

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

  // Ashlar bay rhythm only on the seaward hall face; the opposite 24-unit
  // wall and the central roof fields remain calm.
  for (let course = 0; course < 4; course += 1) {
    let z = -11.7 - (course % 2) * 0.62;
    let joint = 0;
    while (z < 11.7) {
      const nominal = [1.18, 1.52, 1.36, 1.82, 2.1][joint % 5]!;
      const run = Math.min(nominal, 11.7 - z);
      if (run > 0.28) pushChamferedBox(ctx.stone, 0.24, 0.62, run - 0.05, -3.13, 3.35 + course * 0.7, z + run / 2, 0.055);
      z += nominal;
      joint += 1;
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
  const { metal, roofs, stone, timber, walls } = ctx;
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
  // Squared hammerheads cap both termini without adding a lantern tower.
  pushBoxes(stone, [
    2.2, 1.75, 7.2, 15.9, 0.675, -10.6,
    2.2, 1.75, 6.6, 8.9, 0.675, 10.3,
  ]);

  // Hall-side quay closes the bracket without filling the basin. Its single
  // warm edge is the monument's only continuous emissive line.
  featureBoxes(ctx, "quayPlatform", stone, [
    2, 1.75, 24, -4, 0.675, 0,
    2, 0.18, 24.4, -4, 1.46, 0,
  ]);
  featureBox(ctx, "quayLitEdge", ctx.windows, 0.12, 0.18, 14, -2.94, 1.42, 0);

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

  // Podium and ashlar hall: top 2.8, wall cornice 7.0.
  featureBox(ctx, "primaryMass", stone, hallDepth, 1.25, hallLength, hallX, 2.175, hallZ);
  featureBox(ctx, "primaryMass", walls, hallDepth - 0.4, 4.2, hallLength - 0.4, hallX, 4.9, hallZ);
  // Pilasters and a recessed seaward doorway give real 0.20-depth relief.
  for (const z of [-9, -4.5, 4.5, 9]) pushBox(stone, 0.28, 4.05, 0.44, -3.18, 4.78, z);
  pushBoxes(timber, [
    0.32, 3.2, 0.42, -3.02, 4.4, 1.6,
    0.32, 3.2, 0.42, -3.02, 4.4, 4.4,
    0.48, 0.55, 3.5, -2.94, 6.1, 3,
  ]);
  for (const z of [-7.2, -2.4, 7.1]) warmBox(ctx, 0.1, 0.72, 0.8, -3.76, 5.05, z);
  authorMoleHallRoof(ctx, hallX, hallZ, hallDepth, hallLength);
  // Two shielded portal lamps share the ember bucket but are not apertures.
  for (const z of [1.1, 4.9]) {
    pushBoxes(timber, [
      0.3, 2.1, 0.3, -22.15, 3.85, z,
      0.65, 0.16, 0.65, -22.15, 4.92, z,
    ]);
    pushBox(ctx.windows, 0.3, 0.34, 0.3, -22.15, 4.65, z);
  }

  // Offset 3.8-square campanile, wholly beyond one hall eave. Its shaft ends
  // at 15.0; four piers leave the belfry centre visibly empty through 19.0.
  const towerX = -8;
  const towerZ = -14;
  secondBox(ctx, stone, 4.2, 0.55, 4.2, towerX, 3.075, towerZ);
  secondBox(ctx, walls, 3.8, 11.65, 3.8, towerX, 9.175, towerZ);
  secondBox(ctx, stone, 4.05, 0.35, 4.05, towerX, 14.825, towerZ);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    secondBox(ctx, stone, 0.48, 4, 0.48, towerX + sx * 1.42, 17, towerZ + sz * 1.42);
  }
  secondBox(ctx, timber, 3.45, 0.28, 3.45, towerX, 18.86, towerZ);
  const bell = new ConeGeometry(0.72, 1.35, 10);
  bell.rotateX(Math.PI);
  pushFeatureGeometry(ctx, "secondLevel", metal, bell, towerX, 17.15, towerZ);
  const cap = new ConeGeometry(1, 2.5, 4);
  cap.rotateY(Math.PI / 4);
  cap.scale(2.35 * Math.SQRT2, 1, 2.35 * Math.SQRT2);
  cap.translate(towerX, 20.25, towerZ);
  addFeatureGeometry(ctx, "secondLevel", roofs, cap);
  pushEaveFascia(ctx, towerX, 19, 2.35, 2.35, towerZ);
  trimBox(ctx, 2.7, 0.13, 0.34, towerX, 20.3, towerZ);
  ctx.articulation.ridgeCaps += 1;
  ctx.articulation.surfaceBreaks += 1;

  // Eight civic bollards at an authored rhythm: five long, three short.
  for (const [x, z] of [
    [-2.8, -7.55], [0.1, -7.55], [4.6, -7.55], [9.8, -7.55], [14.2, -7.55],
    [-2.1, 7.55], [2.4, 7.55], [7.7, 7.55],
  ]) {
    pushBox(ctx.fineMetal, 0.44, 0.72, 0.44, x, 1.91, z);
  }
}

/** Deep hipped hall roof, rotated so its long ridge follows the shore. */
function authorMoleHallRoof(ctx: StationAuthorContext, cx: number, cz: number, depth: number, length: number): void {
  const hx = depth / 2;
  const hz = length / 2;
  const ridgeHalf = 8.2;
  const triangles: number[] = [];
  const quad = (a: XYZ, b: XYZ, c: XYZ, d: XYZ) => triangles.push(...a, ...b, ...c, ...a, ...c, ...d);
  quad([cx - hx, 7, cz - hz], [cx + hx, 7, cz - hz], [cx, 9.2, cz - ridgeHalf], [cx, 9.2, cz + ridgeHalf]);
  quad([cx + hx, 7, cz + hz], [cx - hx, 7, cz + hz], [cx, 9.2, cz + ridgeHalf], [cx, 9.2, cz - ridgeHalf]);
  triangles.push(
    cx - hx, 7, cz - hz, cx, 9.2, cz + ridgeHalf, cx, 9.2, cz - ridgeHalf,
    cx - hx, 7, cz + hz, cx, 9.2, cz + ridgeHalf, cx - hx, 7, cz - hz,
    cx + hx, 7, cz - hz, cx, 9.2, cz - ridgeHalf, cx, 9.2, cz + ridgeHalf,
    cx + hx, 7, cz - hz, cx, 9.2, cz + ridgeHalf, cx + hx, 7, cz + hz,
  );
  addFeatureGeometry(ctx, "primaryMass", ctx.roofs, triangleGeometry(triangles));
  ctx.articulation.fieldShells += 1;
  pushBox(ctx.timber, 0.34, 0.2, ridgeHalf * 2 + 0.6, cx, 9.02, cz);
  ctx.articulation.ridgeBeams += 1;
  trimBox(ctx, 0.52, 0.14, ridgeHalf * 2 + 0.35, cx, 9.13, cz);
  ctx.articulation.ridgeCaps += 1;
  pushBoxes(ctx.roofTrim, [
    depth + 0.3, 0.24, 0.18, cx, 6.96, cz - hz,
    depth + 0.3, 0.24, 0.18, cx, 6.96, cz + hz,
    0.18, 0.24, length + 0.3, cx - hx, 6.96, cz,
    0.18, 0.24, length + 0.3, cx + hx, 6.96, cz,
    0.2, 0.15, length * 0.72, cx - hx * 0.55, 8.05, cz,
    0.2, 0.15, length * 0.72, cx + hx * 0.55, 8.05, cz,
  ]);
  ctx.articulation.fascias += 4;
  ctx.articulation.surfaceBreaks += 1;
  const gable = prismGeometry([[-2.1, 7.05], [2.1, 7.05], [0, 9.12]], 0.4);
  gable.rotateY(Math.PI / 2);
  gable.translate(cx, 0, cz - hz - 0.06);
  ctx.roofTrim.push(gable);
  ctx.articulation.gablePlates += 1;
  for (const z of [-8, -2.6, 2.6, 8]) {
    for (const x of [-hx + 0.22, hx - 0.22]) pushBox(ctx.timber, 0.5, 0.16, 0.58, cx + x, 6.66, cz + z);
  }
  ctx.articulation.brackets += 8;
}

function authorHatagoWharf(ctx: StationAuthorContext): void {
  const { accents, flagWavePhase, length, props, stationScale, timber, walls } = ctx;
  const hallX = ctx.quayX - 3.4;
  const hallW = stationScale.length;
  const hallD = stationScale.span;
  const lowerTop = 5.5 * stationScale.heightScale;
  const roofTop = stationScale.secondLevelTop;
  const roofEave = roofTop - 2.2 * stationScale.heightScale;
  // The inn keeps a taller closed lodging floor beneath an open upper engawa;
  // its length and roof height both carry supply while its authored span holds.
  featureBox(ctx, "primaryMass", walls, hallW, lowerTop - QUAY_TOP_Y, hallD, hallX, (lowerTop + QUAY_TOP_Y) / 2, 0);
  secondBox(ctx, walls, hallW * 0.9, roofEave - lowerTop, hallD * 0.58, hallX - 0.25, (roofEave + lowerTop) / 2, -hallD * 0.18);
  secondBox(ctx, timber, 2.0, 0.24, hallD * 1.06, hallX + hallW * 0.48, lowerTop + 0.15, 0);
  for (const z of [-0.41, -0.14, 0.14, 0.41].map((fraction) => fraction * hallD)) {
    secondBox(ctx, timber, 0.22, roofEave - lowerTop + 0.3, 0.22, hallX + hallW * 0.52, (roofEave + lowerTop) / 2, z);
  }
  secondBoxes(ctx, timber, [
    0.18, 0.18, hallD * 1.06, hallX + hallW * 0.52, roofEave - 0.4, 0,
    0.14, 0.14, hallD * 1.06, hallX + hallW * 0.52, lowerTop + 0.7, 0,
  ]);
  // A full irimoya crowns the guest floor. Supply may occupy one more room,
  // but the row stays sparse and uneven so it never becomes a bright barcode.
  articulateIrimoya(ctx, hallX, roofEave, roofTop, hallW / 2, hallD / 2, { course: true }, "secondLevel");
  const guestWindows = 2 + Math.round(ctx.supply * 2);
  const windowFractions = [-0.36, -0.1, 0.17, 0.39];
  for (let index = 0; index < guestWindows; index += 1) {
    warmBox(ctx, 0.1, index % 2 === 0 ? 0.82 : 0.66, 0.42, hallX + hallW / 2 + 0.07, 7.55, windowFractions[index]! * hallD);
  }

  // A stepped water stair gets its own subordinate roof and paired noren.
  const stairX = hallX + hallW / 2 + 1.45;
  for (let step = 0; step < 4; step += 1) {
    pushBox(ctx.stone, 0.72, 0.28 + step * 0.3, 2.7, stairX + step * 0.68, 0.14 + step * 0.15, 0);
  }
  for (const z of [-1.15, 1.15]) pushBox(timber, 0.18, 3.4, 0.18, stairX, 3.25, z);
  articulateIrimoya(ctx, stairX, 5.05, 6.25, 2.35, 1.65, { course: true }, "secondLevel");
  for (const z of [-0.62, 0.62]) {
    const curtain = new PlaneGeometry(1.12, 1.38, 2, 2);
    const position = curtain.getAttribute("position");
    for (let index = 0; index < position.count; index += 1) {
      const along = position.getX(index) / 1.12 + 0.5;
      position.setZ(index, Math.sin(along * Math.PI * 1.7 + flagWavePhase) * 0.08 * along);
    }
    position.needsUpdate = true;
    curtain.computeVertexNormals();
    curtain.rotateY(Math.PI / 2);
    curtain.translate(stairX + 0.12, 4.05, z);
    accents.push(curtain);
  }
  pushBox(timber, length * 0.62, 0.24, hallD * 0.92, length * 0.1, 0.1, 0);
  pushPierPilings(props, length * 0.58, hallD * 0.84, length * 0.1, 5);
}

function authorUogashi(ctx: StationAuthorContext): void {
  const { metal, props, stationScale, timber, walls } = ctx;
  const hallX = ctx.quayX - 3.2;
  const hallW = stationScale.length;
  const hallD = stationScale.span;
  const primaryTop = 5.5 * stationScale.heightScale;
  featureBox(ctx, "primaryMass", timber, hallW, 0.26, hallD, hallX, 1.68, 0);
  pushPierPilings(props, hallW, hallD * 0.9, hallX, 7);
  // The working hall is closed only landward; its broad market face stays
  // open between a regular line of stall posts under one mono-pitch roof.
  featureBox(ctx, "primaryMass", walls, hallW, primaryTop - QUAY_TOP_Y, 0.28, hallX, (primaryTop + QUAY_TOP_Y) / 2, -hallD / 2 + 0.14);
  for (const fraction of [-0.45, -0.225, 0, 0.225, 0.45]) {
    pushBox(timber, 0.24, primaryTop - QUAY_TOP_Y, 0.24, hallX + fraction * hallW, (primaryTop + QUAY_TOP_Y) / 2, hallD / 2 - 0.18);
  }
  const roofLow = primaryTop - 0.1;
  articulateLeanToRoof(
    ctx,
    hallX,
    0,
    leanToHighYForTop(stationScale.secondLevelTop, roofLow, hallD / 2),
    roofLow,
    hallD / 2,
    hallW,
    -1,
    { course: true },
    "secondLevel",
  );
  // Tally boards repeat down the landward wall like a restrained ledger.
  for (const fraction of [-0.34, -0.17, 0, 0.17, 0.34]) {
    pushBox(timber, hallW * 0.1, 1.65, 0.12, hallX + fraction * hallW, primaryTop - 1.1, -hallD / 2 - 0.07);
  }
  warmBox(ctx, hallW * 0.15, 0.55, 0.1, hallX + hallW * 0.34, primaryTop - 0.5, -hallD / 2 - 0.13);

  // One oversized five-piece steelyard — post, pivoting beam, hanging pan —
  // breaks the roofline without competing with the Pharos or Mole towers.
  const scaleX = hallX + hallW * 0.27;
  const scaleZ = hallD * 0.26;
  secondBox(ctx, metal, 0.28, stationScale.secondLevelTop - QUAY_TOP_Y - 0.4, 0.28, scaleX, (stationScale.secondLevelTop + QUAY_TOP_Y - 0.4) / 2, scaleZ);
  const beam = new BoxGeometry(4.8, 0.18, 0.18);
  beam.rotateZ(-0.12);
  pushFeatureGeometry(ctx, "secondLevel", metal, beam, scaleX + 1.65, stationScale.secondLevelTop - 0.45, scaleZ);
  const pivot = new CylinderGeometry(0.27, 0.27, 0.5, 10);
  pivot.rotateX(Math.PI / 2);
  pushFeatureGeometry(ctx, "secondLevel", metal, pivot, scaleX, stationScale.secondLevelTop - 0.48, scaleZ);
  secondBox(ctx, metal, 0.1, 1.75, 0.1, scaleX + 3.35, stationScale.secondLevelTop - 1.48, scaleZ);
  const pan = new CylinderGeometry(0.72, 0.5, 0.16, 12);
  pushFeatureGeometry(ctx, "secondLevel", metal, pan, scaleX + 3.35, stationScale.secondLevelTop - 2.38, scaleZ);
}


function authorTeaHouseQuay(ctx: StationAuthorContext): void {
  const { length, props, stationScale, timber, walls } = ctx;
  const x = ctx.quayX - 3.2;
  const w = stationScale.length;
  const d = stationScale.span;
  const primaryTop = 6.35 * stationScale.heightScale;
  pushBox(walls, w * 0.88, 3.1 * stationScale.heightScale, d * 0.84, x, QUAY_TOP_Y + 1.55 * stationScale.heightScale, 0);
  articulateIrimoya(ctx, x, 4.65 * stationScale.heightScale, primaryTop, w / 2, d / 2, { course: true });
  warmBox(ctx, 0.1, 0.95, d * 0.5, x + w * 0.44 + 0.05, 3.1, 0);

  // The moon-window loft rises above the engawa as one quiet square lantern;
  // a compact hip keeps it in the tea-house family rather than reading tower.
  const loftEave = stationScale.secondLevelTop - 0.6 * stationScale.heightScale;
  secondBox(ctx, walls, 3.1, loftEave - primaryTop, 2.8, x, (loftEave + primaryTop) / 2, 0);
  // Framed moon window with mullions: the tea-house's signature.
  const moonY = (loftEave + primaryTop) / 2;
  const moonZ = 1.46;
  pushFeatureGeometry(ctx, "secondLevel", timber, new TorusGeometry(0.95, 0.13, 6, 14), x, moonY, moonZ);
  for (const barX of [-0.34, 0.34]) {
    secondBox(ctx, timber, 0.08, 1.9, 0.08, x + barX, moonY, moonZ);
  }
  secondBox(ctx, timber, 1.9, 0.08, 0.08, x, moonY, moonZ);
  const moonGlass = new CylinderGeometry(0.84, 0.84, 0.08, 12);
  moonGlass.rotateX(Math.PI / 2);
  pushWarmWindow(ctx, moonGlass, x, moonY, moonZ - 0.03);
  articulateIrimoya(ctx, x, loftEave, stationScale.secondLevelTop, 1.9, 1.75, { brackets: false }, "secondLevel");
  // One engawa shelf over the water, now with its railing.
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
  // The only lean-to roof, kept at the root so the thin pier remains legible.
  const shelterX = ctx.quayX - 3.2;
  const primaryTop = 5.9 * stationScale.heightScale;
  const roofLow = 3.2 * stationScale.heightScale;
  const roofHalfD = roofHalfSpanForOuterSpan(stationScale.span, primaryTop - roofLow, true);
  articulateLeanToRoof(ctx, shelterX, 0, primaryTop, roofLow, roofHalfD, stationScale.length, 1, { course: true });
  for (const z of [-stationScale.span * 0.45, stationScale.span * 0.45]) {
    pushBox(timber, 0.26, 4.3, 0.26, shelterX + stationScale.length * 0.31, QUAY_TOP_Y + 2.15, z);
    pushBox(timber, 0.26, 1.6, 0.26, shelterX - stationScale.length * 0.31, QUAY_TOP_Y + 0.8, z);
  }
  // A tall, forked drying rack is a second skyline above the low lean-to.
  const rackX = ctx.quayX + 1.0;
  const rackTop = stationScale.secondLevelTop;
  for (const z of [-2.0, 2.0]) {
    secondBox(ctx, timber, 0.28, rackTop - QUAY_TOP_Y - 0.3, 0.28, rackX, (rackTop + QUAY_TOP_Y - 0.3) / 2, z);
  }
  secondBox(ctx, timber, 0.3, 0.3, 4.9, rackX, rackTop - 0.15, 0);
  // Hung drying nets slung from the rack crossbar: part of the signature.
  for (const z of [-1.5, 0, 1.5]) {
    const net = new BoxGeometry(1.5, 1.1, 0.06);
    net.translate(rackX + 0.1, 6.25, z);
    timber.push(net);
  }
  warmBox(ctx, 1.2, 0.7, 0.1, shelterX, 3.6, 3.35);
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
  const { length, roofs, stationScale, stone, timber, width } = ctx;
  for (let index = 0; index < 6; index += 1) {
    const t = index / 5;
    pushBox(stone, length * 0.2, 0.34, width * (1.72 - t * 0.5), -length * 0.36 + index * length * 0.14, 0.62 - index * 0.22, 0);
  }
  // Mooring rings set into the stone steps: part of the signature.
  for (const index of [1, 3, 5]) {
    const t = index / 5;
    const ring = new TorusGeometry(0.24, 0.055, 5, 8);
    ring.rotateX(Math.PI / 2 - 0.35);
    ring.translate(-length * 0.36 + index * length * 0.14, 0.82 - index * 0.22, width * (1.72 - t * 0.5) / 2 - 0.15);
    ctx.metal.push(ring);
  }
  const canopyX = ctx.quayX - 2.8;
  const primaryTop = 5.6 * stationScale.heightScale;
  // Stepped canopy: two lower courses are the surface break, then a shallow
  // irimoya cap carries the ridge, fascia, gable and brackets.
  featureBoxes(ctx, "primaryMass", roofs, [
    stationScale.length, 0.24, stationScale.span, canopyX, 4.35 * stationScale.heightScale, 0,
    stationScale.length * 0.91, 0.24, stationScale.span * 0.89, canopyX + 0.2, 4.68 * stationScale.heightScale, 0,
  ]);
  ctx.articulation.fieldShells += 2;
  ctx.articulation.surfaceBreaks += 1;
  articulateIrimoya(ctx, canopyX + 0.35, 4.92 * stationScale.heightScale, primaryTop, stationScale.length * 0.425, stationScale.span * 0.41);
  for (const z of [-stationScale.span / 3, stationScale.span / 3]) {
    pushBox(timber, 0.26, 2.9, 0.26, canopyX, 3.0, z);
  }
  // Crown lanterns raised clear of the taller canopy: part of the signature.
  for (const [index, z] of [-0.9, 0, 0.9].entries()) {
    const crownTop = stationScale.secondLevelTop - (2 - index) * 0.28;
    const y = crownTop - 0.955;
    secondBox(ctx, timber, 0.22, 1.3, 0.22, canopyX + 0.35, y - 0.5, z * 1.6);
    warmBox(ctx, 0.85, 0.8, 0.85, canopyX + 0.35, y, z * 1.6);
    pushFeatureGeometry(ctx, "secondLevel", roofs, new ConeGeometry(0.72, 0.55, 4), canopyX + 0.35, y + 0.68, z * 1.6);
  }
}

function authorReedBoathouse(ctx: StationAuthorContext): void {
  const { length, props, stationScale, timber, walls, width } = ctx;
  const x = ctx.quayX - 3.2;
  const w = stationScale.length;
  const halfD = roofHalfSpanForOuterSpan(
    stationScale.span,
    (6.1 - 3.6) * stationScale.heightScale,
    false,
  );
  const eaveY = 3.6 * stationScale.heightScale;
  const apexY = 6.1 * stationScale.heightScale;
  pushBox(timber, length * 0.7, 0.24, width * 1.1, length * 0.06, 0.1, 0);
  for (const z of [-halfD * 0.84, halfD * 0.84]) pushBox(walls, w * 0.86, 2.05, 0.22, x, QUAY_TOP_Y + 1.025, z);
  // The only high, sharp A-frame: two deep thatch slopes bound at the ridge.
  articulateGableRoof(ctx, x, eaveY, apexY, w, halfD, { course: true, ridgeTies: true });
  // Open boat-bay mouth cut into the seaward gable: the boathouse's signature.
  const mouth = new BoxGeometry(0.55, 2.3, 2.7);
  mouth.translate(x + w * 0.43, 2.75, 0);
  ctx.metal.push(mouth);
  for (const z of [-1.45, 1.45]) {
    pushBox(timber, 0.18, 2.5, 0.18, x + w * 0.43, 2.8, z);
  }
  pushBox(timber, 0.2, 0.2, 3.1, x + w * 0.43, 4.1, 0);
  warmBox(ctx, 0.1, 0.9, 1.6, x + w * 0.43 + 0.28, 2.9, -halfD * 0.74);
  // A thatch dome on a reed drum stays soft against the reeds and cannot be
  // mistaken for the gate, mast, or lantern-tower silhouettes.
  const domeHeight = 1.5 * stationScale.heightScale;
  pushFeatureGeometry(ctx, "secondLevel", walls, new CylinderGeometry(2.0, 2.3, 2.6, 8), x, stationScale.secondLevelTop - domeHeight - 1.3, 0);
  const dome = new SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(2.4, domeHeight, 2.1);
  dome.translate(x, stationScale.secondLevelTop - domeHeight, 0);
  addFeatureGeometry(ctx, "secondLevel", ctx.roofs, dome);
  pushPierPilings(props, length * 0.62, width, length * 0.04, 5);
  scratchMatrix.makeScale(1.45, 1.4, 1.45);
  scratchMatrix.setPosition(length * 0.4, 0, width * 0.7);
  props.push(harborProp("reedClump", scratchMatrix, null, false));
}

function authorStormMole(ctx: StationAuthorContext): void {
  const { length, stationScale, stone, timber, walls, width } = ctx;
  const radius = Math.min(5.2, Math.max(4.0, length * 0.48));
  for (let index = 0; index < 8; index += 1) {
    const angle = -0.78 + index * 0.22;
    const blockW = Math.max(1.55, length * 0.2);
    const blockX = -length * 0.32 + Math.cos(angle) * radius;
    const blockZ = Math.sin(angle) * radius;
    const block = new BoxGeometry(blockW, 0.8, Math.max(1.7, width * 0.84));
    block.rotateY(-angle);
    block.translate(blockX, 0.4, blockZ);
    stone.push(block);
    // Crenellated merlons crown every mole block: part of the signature.
    for (const offset of [-blockW * 0.28, blockW * 0.28]) {
      const merlon = new BoxGeometry(blockW * 0.34, 0.42, Math.max(0.5, width * 0.3));
      merlon.rotateY(-angle);
      merlon.translate(blockX + offset * Math.cos(angle), 1.0, blockZ + offset * Math.sin(angle));
      stone.push(merlon);
    }
  }
  const houseX = ctx.quayX - 3.2;
  const primaryTop = 6.2 * stationScale.heightScale;
  pushBox(walls, stationScale.length * 0.85, 3.0, stationScale.span * 0.83, houseX, QUAY_TOP_Y + 1.5, 0);
  articulateIrimoya(ctx, houseX, 4.55 * stationScale.heightScale, primaryTop, stationScale.length / 2, stationScale.span / 2, { course: true });
  warmBox(ctx, 0.1, 0.9, 1.8, houseX + stationScale.length * 0.425 + 0.05, 3.1, 0);

  // One broad lantern tower terminates the weather-facing curve, girdled by a
  // gallery railing: the storm station's signature.
  const towerX = ctx.quayX + 1.5;
  const towerRoofBase = stationScale.secondLevelTop - 0.88 * stationScale.heightScale;
  secondBox(ctx, stone, 3.4, 0.5, 3.4, towerX, 1.8, 0);
  secondBox(ctx, walls, 3.0, towerRoofBase - 2.0, 3.0, towerX, (towerRoofBase + 2.0) / 2, 0);
  secondBox(ctx, timber, 4.1, 0.22, 4.1, towerX, towerRoofBase - 1.02, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    secondBox(ctx, timber, 0.13, 0.9, 0.13, towerX + sx * 1.86, towerRoofBase - 0.55, sz * 1.86);
  }
  secondBoxes(ctx, timber, [
    4.0, 0.12, 0.12, towerX, towerRoofBase - 0.1, 1.95,
    4.0, 0.12, 0.12, towerX, towerRoofBase - 0.1, -1.95,
    0.12, 0.12, 4.0, towerX + 1.95, towerRoofBase - 0.1, 0,
    0.12, 0.12, 4.0, towerX - 1.95, towerRoofBase - 0.1, 0,
  ]);
  warmBox(ctx, 2.5, 0.95, 2.5, towerX, towerRoofBase - 0.65, 0);
  articulatePyramidRoof(ctx, towerX, 0, towerRoofBase, stationScale.secondLevelTop, 2.05, 2.05, "secondLevel");
}


function authorPigeonnierLanding(ctx: StationAuthorContext): void {
  const { length, props, stationScale, timber, walls, width } = ctx;
  // The detached data landmark remains owned by garden-islets; this cote is
  // the chain station at its wharf and repeats that conical vocabulary at a
  // smaller scale so TON's landing is not the only roofless recipe.
  pushBox(timber, length * 0.52, 0.24, width * 0.78, length * 0.02, 0.1, 0);
  const houseX = ctx.quayX - 3.2;
  const primaryTop = 6.55 * stationScale.heightScale;
  pushBox(walls, stationScale.length * 0.84, 3.0, stationScale.span * 0.98, houseX, QUAY_TOP_Y + 1.5, 0);
  articulateConeRoof(ctx, houseX, 4.6 * stationScale.heightScale, primaryTop, stationScale.length / 2, stationScale.span / 2, "primaryMass");
  warmBox(ctx, 0.1, 0.9, 1.7, houseX + stationScale.length * 0.42 + 0.05, 3.1, 0);

  const coteX = houseX - 3.1;
  const coteRoofHeight = 1.4 * stationScale.heightScale;
  const coteRoofCenter = stationScale.secondLevelTop - coteRoofHeight / 2;
  pushFeatureGeometry(ctx, "secondLevel", walls, new CylinderGeometry(1.5, 1.85, 5.6, 8), coteX, 4.35, 0);
  for (const z of [-0.7, 0, 0.7]) {
    warmBox(ctx, 0.3, 0.46, 0.12, coteX + 1.52, 5.6, z);
  }
  // Dark entry holes with perch ledges: the cote's signature.
  for (const [holeY, holeZ] of [[4.6, -0.55], [6.4, 0.55]] as const) {
    const hole = new BoxGeometry(0.34, 0.4, 0.12);
    hole.translate(coteX + 1.52, holeY, holeZ);
    ctx.metal.push(hole);
    pushBox(timber, 0.55, 0.09, 0.3, coteX + 1.78, holeY - 0.28, holeZ);
  }
  pushFeatureGeometry(ctx, "secondLevel", ctx.roofs, new ConeGeometry(2.35, coteRoofHeight, 8), coteX, coteRoofCenter, 0);
  const coteFinial = new ConeGeometry(0.13, 0.55, 6);
  coteFinial.translate(coteX, stationScale.secondLevelTop + 0.3, 0);
  ctx.roofTrim.push(coteFinial);
  ctx.articulation.finials += 1;
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
  // One continuous ember edge survives the overview without creating a lamp
  // forest. It shares the station-window draw and registers no new water lane.
  featureBox(ctx, "quayLitEdge", ctx.windows, quayLength + 0.5, 0.24, 0.11, quayX, QUAY_TOP_Y - 0.11, quayWidth / 2 + 0.26);
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
  feature: "primaryMass" | "secondLevel" = "primaryMass",
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
  feature: "primaryMass" | "secondLevel",
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
  feature: "primaryMass" | "secondLevel" = "primaryMass",
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
  feature: "primaryMass" | "secondLevel" = "primaryMass",
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

/** Square hip cap over a tower: cone field, eave fascia, waist band, giboshi
 *  corner knobs and apex spike.
 *  Args: cx, cz, baseY, apexY, halfW, halfD, feature credit. */
function articulatePyramidRoof(
  ctx: StationAuthorContext,
  cx: number,
  cz: number,
  baseY: number,
  apexY: number,
  halfW: number,
  halfD: number,
  feature: "primaryMass" | "secondLevel",
): void {
  const pyramid = new ConeGeometry(1, 1, 4);
  pyramid.rotateY(Math.PI / 4);
  pyramid.scale(halfW * Math.SQRT2, apexY - baseY, halfD * Math.SQRT2);
  pyramid.translate(cx, baseY + (apexY - baseY) / 2, cz);
  addFeatureGeometry(ctx, feature, ctx.roofs, pyramid);
  ctx.articulation.fieldShells += 1;
  pushEaveFascia(ctx, cx, baseY, halfD, halfW, cz);
  // A course band around the waist breaks the pyramid plane.
  const bandScale = 0.55;
  for (const side of [-1, 1]) {
    trimBox(ctx, 2 * halfW * bandScale + 0.35, 0.14, 0.16, cx, baseY + (apexY - baseY) * 0.45, cz + side * (halfD * bandScale + 0.1));
    trimBox(ctx, 0.16, 0.14, 2 * halfD * bandScale + 0.35, cx + side * (halfW * bandScale + 0.1), baseY + (apexY - baseY) * 0.45, cz);
  }
  ctx.articulation.surfaceBreaks += 1;
  // Ridge finials: a giboshi knob at each hip corner plus the apex spike.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const knob = new SphereGeometry(0.17, 6, 4);
    knob.translate(cx + sx * (halfW - 0.08), baseY + 0.18, cz + sz * (halfD - 0.08));
    ctx.roofTrim.push(knob);
    ctx.articulation.finials += 1;
  }
  const spike = new ConeGeometry(0.15, 0.85, 6);
  spike.translate(cx, apexY + 0.42, cz);
  ctx.roofTrim.push(spike);
  ctx.articulation.finials += 1;
}

/** Round cone roof: field cone, base ring, waist course, landward gablet
 *  dormer with its own ridge, finials, radial brackets.
 *  Args: cx, baseY, apexY, radiusX, radiusZ, feature credit. */
function articulateConeRoof(
  ctx: StationAuthorContext,
  cx: number,
  baseY: number,
  apexY: number,
  radiusX: number,
  radiusZ: number,
  feature: "primaryMass" | "secondLevel",
): void {
  const cone = new ConeGeometry(1, 1, 8);
  cone.scale(radiusX, apexY - baseY, radiusZ);
  cone.translate(cx, baseY + (apexY - baseY) / 2, 0);
  addFeatureGeometry(ctx, feature, ctx.roofs, cone);
  ctx.articulation.fieldShells += 1;
  const ring = new TorusGeometry(1, 0.11, 5, 12);
  ring.rotateX(Math.PI / 2);
  ring.scale(radiusX * 1.04, 1, radiusZ * 1.04);
  ring.translate(cx, baseY + 0.06, 0);
  ctx.roofTrim.push(ring);
  ctx.articulation.fascias += 4;
  const course = new TorusGeometry(1, 0.09, 5, 12);
  course.rotateX(Math.PI / 2);
  course.scale(radiusX * 0.62, 1, radiusZ * 0.62);
  course.translate(cx, baseY + (apexY - baseY) * 0.45, 0);
  ctx.roofTrim.push(course);
  ctx.articulation.surfaceBreaks += 1;
  // A landward gablet dormer plate keeps the gable contract on round roofs.
  const gabletX = cx - radiusX * 0.52;
  const gabletApexY = baseY + 1.35;
  const gablet = prismGeometry([
    [-0.62, baseY + 0.35],
    [0.62, baseY + 0.35],
    [0, gabletApexY],
  ], 0.55);
  gablet.translate(gabletX, 0, 0);
  ctx.roofTrim.push(gablet);
  ctx.articulation.gablePlates += 1;
  ridgeBeam(ctx, 0.85, 0.18, 0.3, gabletX, gabletApexY - 0.16, 0);
  ridgeCap(ctx, 0.7, 0.13, 0.44, gabletX, gabletApexY + 0.07, 0);
  const knob = new SphereGeometry(0.17, 6, 4);
  knob.translate(cx, apexY + 0.18, 0);
  ctx.roofTrim.push(knob);
  const spike = new ConeGeometry(0.15, 0.8, 6);
  spike.translate(cx, apexY + 0.55, 0);
  ctx.roofTrim.push(spike);
  ctx.articulation.finials += 2;
  for (let corner = 0; corner < 4; corner += 1) {
    const angle = corner * Math.PI / 2 + Math.PI / 4;
    const bracket = new BoxGeometry(0.55, 0.15, 0.55);
    bracket.rotateY(-angle);
    bracket.translate(cx + Math.cos(angle) * radiusX * 0.78, baseY - 0.32, Math.sin(angle) * radiusZ * 0.78);
    ctx.timber.push(bracket);
    ctx.articulation.brackets += 1;
  }
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
  const primaryMass = measureFeature(geometry.primaryMass);
  if (type === "ethereum-mole") {
    const longAxis = Math.max(primaryMass.footprint.length, primaryMass.footprint.span);
    const shortAxis = Math.min(primaryMass.footprint.length, primaryMass.footprint.span);
    primaryMass.footprint = { length: longAxis, span: shortAxis };
  }
  return {
    primaryMass,
    quayPlatform: {
      ...measureFeature(geometry.quayPlatform),
      litEdge: geometry.quayLitEdge.length > 0,
      litEdgeCount: geometry.quayLitEdge.length,
    },
    secondLevel: {
      ...measureFeature(geometry.secondLevel),
      name: STATION_IDENTITY[type].secondLevel,
    },
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

function stationFlagPlacement(type: StationType, length: number, width: number, supply: number) {
  const height = (
    type === "ethereum-mole" ? 6.4
      : type === "pigeonnier-islet" ? 4.4
        : 4.8
  ) + supply * 1.25;
  return {
    height,
    scale: ((type === "ethereum-mole" ? 1.05 : 0.72) + supply * 0.24)
      * HARBOR_FLAG_SCALE_MULTIPLIER,
    x: type === "ethereum-mole" ? -9.5
      : type === "stepped-inlet" ? -length * 0.2
        : type === "storm-mole" ? length * 0.18
          : length * 0.4,
    z: type === "ethereum-mole" ? -11
      : type === "hatago-wharf" ? width * 0.62
        : -width * 0.3,
  };
}

function stationLampLocals(type: StationType, length: number, width: number) {
  if (type === "pigeonnier-islet") return [{ height: 1.45, x: length * 0.3, z: 0 }];
  if (type === "stepped-inlet") return [
    { height: 1.72, x: -length * 0.22, z: -width * 0.58 },
    { height: 1.72, x: -length * 0.22, z: width * 0.58 },
  ];
  if (type === "ethereum-mole") return [
    { height: 1.72, x: -22.15, z: 1.1 },
    { height: 1.72, x: -22.15, z: 4.9 },
  ];
  return [
    { height: 1.52, x: length * 0.12, z: -width * 0.42 },
    { height: 1.52, x: length * 0.12, z: width * 0.42 },
  ];
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

function harborAmountScale(totalUsd: number): number {
  const decades = (Math.log10(Math.max(1, totalUsd)) - 8.5) / 3.2;
  return 0.82 + MathUtils.clamp(decades, 0, 1) * 1.13;
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

function dockFlagWavePhase(chainId: string): number {
  return (stableUnit(`dock-flag-wave.${chainId}`) - 0.5) * 0.7;
}

function authorChainFlag(
  dock: DockNode,
  accent: Color,
  shape: StationFlagShape,
  placement: { height: number; scale: number; x: number; yaw: number; z: number },
): HarborFlagSpec {
  return {
    accent: accent.clone(),
    atlasCell: assignGardenChainFlagCell(dock, accent),
    chainId: dock.chainId,
    placement: {
      scale: placement.scale,
      x: placement.x,
      y: placement.height + QUAY_TOP_Y - placement.scale * 0.75,
      yaw: placement.yaw,
      z: placement.z,
    },
    scaleMultiplier: HARBOR_FLAG_SCALE_MULTIPLIER,
    sag: 0.07 + stableUnit(`dock-flag-sag.${dock.chainId}`) * 0.06,
    shape,
    wavePhase: dockFlagWavePhase(dock.chainId),
  };
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

function localToWorldXZ(root: Object3D, localX: number, localZ: number): { x: number; z: number } {
  const cos = Math.cos(root.rotation.y);
  const sin = Math.sin(root.rotation.y);
  return {
    x: root.position.x + localX * cos + localZ * sin,
    z: root.position.z - localX * sin + localZ * cos,
  };
}

export function gardenDockLampWorldPositions(dock: DockVisual): { x: number; z: number }[] {
  return dock.recipe.lampWorldPositions;
}

