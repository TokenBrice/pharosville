import {
  BoxGeometry,
  Box3,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  MathUtils,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GARDEN_DOCK_ROOT_Y, GARDEN_WATER_Y as WATER_LEVEL } from "../systems/garden-observatory-slice";
import { quayMasonryHealth } from "../systems/dock-health";
import { HARBOR_PALETTE } from "../systems/palette";
import type { DockNode } from "../systems/world-types";
import { assignGardenChainFlagCell } from "./garden-chain-flag";
import { applyGardenHeightFog } from "./garden-height-fog";
import { setTilePosition, stableUnit } from "./garden-util";
import type { GardenHarborCalmMask } from "./garden-water-contract";

const scratchMatrix = new Matrix4();
const scratchScale = new Vector3();

export type StationType =
  | "boathouse-precinct"
  | "annex-pavilion"
  | "gate-landing"
  | "tea-house-quay"
  | "fishing-pier"
  | "stepped-inlet"
  | "reed-boathouse"
  | "storm-mole"
  | "salvage-slip"
  | "signal-jetty"
  | "pigeonnier-islet";
export type StationSignature =
  | "moon-viewing-deck"
  | "open-pavilion"
  | "gate-frame"
  | "engawa"
  | "net-racks"
  | "top-lanterns"
  | "reed-clump"
  | "lantern-tower"
  | "hauled-hull-frame"
  | "signal-mast"
  | "pigeonnier";
export type StationRoofline =
  | "deep-hip"
  | "pavilion-hip"
  | "lintel-cap"
  | "tea-hip"
  | "lean-to"
  | "stepped-canopy"
  | "thatch-gable"
  | "mole-tower-cap"
  | "slipway-shed"
  | "signal-butterfly"
  | "pigeonnier-cone";
export type StationFlagShape =
  | "swallowtail"
  | "notched"
  | "pennant"
  | "chamfered"
  | "forked"
  | "stepped"
  | "tapered"
  | "storm-split"
  | "dovetail"
  | "long-pennant"
  | "square";

export type StationSecondLevel =
  | "bell-tower"
  | "open-belvedere"
  | "torii-gate"
  | "moon-window-loft"
  | "net-drying-rack"
  | "lantern-crown"
  | "thatched-dome"
  | "lantern-tower"
  | "hauled-hull-frame"
  | "signal-mast"
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
  quayPlatform: HarborFeatureDimensions & { litEdge: boolean };
  warmWindowCount: number;
}

const STATION_TYPES: readonly StationType[] = [
  "boathouse-precinct", "annex-pavilion", "gate-landing", "tea-house-quay",
  "fishing-pier", "stepped-inlet", "reed-boathouse", "storm-mole",
  "salvage-slip", "signal-jetty", "pigeonnier-islet",
];
const STATION_IDENTITY: Record<StationType, Omit<HarborIdentity, "stationType">> = {
  "annex-pavilion": { flagShape: "notched", roofline: "pavilion-hip", secondLevel: "open-belvedere", signature: "open-pavilion" },
  "boathouse-precinct": { flagShape: "swallowtail", roofline: "deep-hip", secondLevel: "bell-tower", signature: "moon-viewing-deck" },
  "fishing-pier": { flagShape: "forked", roofline: "lean-to", secondLevel: "net-drying-rack", signature: "net-racks" },
  "gate-landing": { flagShape: "pennant", roofline: "lintel-cap", secondLevel: "torii-gate", signature: "gate-frame" },
  "pigeonnier-islet": { flagShape: "square", roofline: "pigeonnier-cone", secondLevel: "pigeonnier-cote", signature: "pigeonnier" },
  "reed-boathouse": { flagShape: "tapered", roofline: "thatch-gable", secondLevel: "thatched-dome", signature: "reed-clump" },
  "salvage-slip": { flagShape: "dovetail", roofline: "slipway-shed", secondLevel: "hauled-hull-frame", signature: "hauled-hull-frame" },
  "signal-jetty": { flagShape: "long-pennant", roofline: "signal-butterfly", secondLevel: "signal-mast", signature: "signal-mast" },
  "stepped-inlet": { flagShape: "stepped", roofline: "stepped-canopy", secondLevel: "lantern-crown", signature: "top-lanterns" },
  "storm-mole": { flagShape: "storm-split", roofline: "mole-tower-cap", secondLevel: "lantern-tower", signature: "lantern-tower" },
  "tea-house-quay": { flagShape: "chamfered", roofline: "tea-hip", secondLevel: "moon-window-loft", signature: "engawa" },
};

/** Standalone fallback until the systems branch supplies `dock.station`. */
const LEGACY_STATION_BY_CHAIN: Record<string, StationType> = {
  aptos: "gate-landing",
  arbitrum: "annex-pavilion",
  avalanche: "gate-landing",
  base: "annex-pavilion",
  bsc: "tea-house-quay",
  ethereum: "boathouse-precinct",
  hyperliquid: "reed-boathouse",
  "hyperliquid-l1": "reed-boathouse",
  polygon: "annex-pavilion",
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
  footprint: { length: number; span: number };
  features: HarborStationFeatures;
  identity: HarborIdentity;
  lampWorldPositions: { x: number; z: number }[];
  plan: HarborPlan;
  signature: HarborSignature;
  quayHealth: number;
  accentColor: Color;
}

const CAMERA_FACING_YAW = Math.PI / 4;
const PIER_DECK_TOP_Y = 0.21;
const QUAY_TOP_Y = 1.14;
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
  const precinct = station.type === "boathouse-precinct";
  const length = 6.1 * amountScale * (precinct ? 1.42 : 1);
  const width = (1.55 + amountScale * 0.34) * (precinct ? 1.35 : 1);
  const quayHealth = quayMasonryHealth(dock) ?? 0.58;
  const accent = dockAccentColor(dock);
  const stoneColor = new Color("#665f55").lerp(new Color("#a39d8c"), quayHealth);
  const quayLength = (2.9 + supply * 2.8) * (precinct ? 1.32 : 1);
  const quayWidth = width * (precinct ? 2.6 : 2.05);
  const quayX = -length * (precinct ? 0.27 : 0.32);

  const timber: BufferGeometry[] = [];
  const stone: BufferGeometry[] = [];
  const metal: BufferGeometry[] = [];
  const walls: BufferGeometry[] = [];
  const roofs: BufferGeometry[] = [];
  const windows: BufferGeometry[] = [];
  const accents: BufferGeometry[] = [];
  const props: HarborPropInstance[] = [];
  const featureGeometry: StationFeatureGeometry = {
    primaryMass: [],
    quayLitEdge: [],
    quayPlatform: [],
    secondLevel: [],
    warmWindows: [],
  };
  const stationContext: StationAuthorContext = {
    accents, featureGeometry, length, props, quayLength, quayWidth, quayX, roofs, stone, supply, timber, walls, width, windows,
  };
  authorStoneQuay(stationContext, station.type);
  authorStationType(station.type, stationContext);

  const parts: HarborBucketPart[] = [];
  pushMergedPart(parts, "timber", timber, HARBOR_PALETTE.timber_mid, false, true);
  pushMergedPart(parts, "stone", stone, stoneColor, false, true);
  pushMergedPart(parts, "metal", metal, "#3d3327", true, false);
  pushMergedPart(parts, "wall", walls, "#a99a79", false, true);
  pushMergedPart(parts, "roof", roofs, stationRoofColor(station.type), false, true);
  pushMergedPart(parts, "window", windows, HARBOR_PALETTE.lantern_glow, false, false);
  pushMergedPart(parts, "accent", accents, "#ad3f2f", false, true);
  if (quayHealth < 0.5) {
    const cracks: BufferGeometry[] = [];
    for (let index = 0; index < 3; index += 1) {
      const crack = new BoxGeometry(0.04, 0.34 + index * 0.1, 0.04);
      crack.rotateZ((index % 2 === 0 ? -1 : 1) * (0.4 + index * 0.12));
      crack.translate(quayX - quayLength * 0.27 + index * quayLength * 0.27, 0.05, quayWidth / 2 + 0.031);
      cracks.push(crack);
    }
    parts.push(harborPart("stone", mergeBucket(cracks), HARBOR_PALETTE.iron_dark, false, false));
  }

  const plankCount = Math.max(5, Math.round(5 + supply * 6));
  for (let index = 0; index < plankCount; index += 1) {
    const t = index / Math.max(1, plankCount - 1);
    scratchMatrix.makeRotationY((stableUnit(`station-plank.${dock.chainId}.${index}`) - 0.5) * 0.08);
    scratchMatrix.scale(scratchScale.set(1, 1, width * 0.88));
    scratchMatrix.setPosition(-length * 0.08 + t * length * 0.62, 0.235, 0);
    props.push(harborProp("plank", scratchMatrix, null, true));
  }
  const bollardCount = Math.max(2, Math.round(2 + supply * 4));
  for (let index = 0; index < bollardCount; index += 1) {
    const t = (index + 0.5) / bollardCount;
    scratchMatrix.makeRotationZ(index === 0 ? (1 - quayHealth) * MathUtils.degToRad(16) : 0);
    scratchMatrix.setPosition(-length * 0.08 + t * length * 0.58, 0.42, (index % 2 === 0 ? -1 : 1) * width * 0.48);
    props.push(harborProp("bollard", scratchMatrix, null, true));
  }

  const lamps = stationLampLocals(station.type, length, width, quayX, quayWidth);
  const staff = stationFlagPlacement(station.type, length, width, supply);
  for (const post of [
    { height: staff.height, radius: 0.075, x: staff.x, z: staff.z },
    ...lamps.map((lamp) => ({ ...lamp, radius: 0.085 })),
  ]) {
    scratchMatrix.makeScale(post.radius, post.height, post.radius);
    scratchMatrix.setPosition(post.x, post.height / 2 + QUAY_TOP_Y, post.z);
    props.push(harborProp("post", scratchMatrix, null, false));
  }
  for (const lamp of lamps) {
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

  return {
    accentColor: accent.clone(),
    anchorPosition: root.position.clone(),
    anchorRotationY: root.rotation.y,
    cargoTideLanes: cargoTideLanes(length, quayLength, quayWidth, quayX),
    dock,
    flag,
    features: stationFeatures(station.type, featureGeometry),
    footprint: { length, span: Math.max(quayWidth, stationSpan(station.type, width)) },
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
  featureGeometry: StationFeatureGeometry;
  length: number;
  props: HarborPropInstance[];
  quayLength: number;
  quayWidth: number;
  quayX: number;
  roofs: BufferGeometry[];
  stone: BufferGeometry[];
  supply: number;
  timber: BufferGeometry[];
  walls: BufferGeometry[];
  width: number;
  windows: BufferGeometry[];
}

function stationRoofColor(type: StationType): string {
  switch (type) {
    case "boathouse-precinct": return "#a95f43";
    case "annex-pavilion": return "#c58b55";
    case "gate-landing": return "#8a4d3c";
    case "tea-house-quay": return "#40515b";
    case "fishing-pier": return "#9c694c";
    case "stepped-inlet": return "#747a7c";
    case "reed-boathouse": return "#c7ae72";
    case "storm-mole": return "#354750";
    case "salvage-slip": return "#824e3c";
    case "signal-jetty": return "#b87845";
    case "pigeonnier-islet": return "#bc7455";
  }
}

interface StationFeatureGeometry {
  primaryMass: BufferGeometry[];
  quayLitEdge: BufferGeometry[];
  quayPlatform: BufferGeometry[];
  secondLevel: BufferGeometry[];
  warmWindows: BufferGeometry[];
}

function authorStationType(type: StationType, ctx: StationAuthorContext): void {
  switch (type) {
    case "boathouse-precinct": return authorBoathousePrecinct(ctx);
    case "annex-pavilion": return authorAnnexPavilion(ctx);
    case "gate-landing": return authorGateLanding(ctx);
    case "tea-house-quay": return authorTeaHouseQuay(ctx);
    case "fishing-pier": return authorFishingPier(ctx);
    case "stepped-inlet": return authorSteppedInlet(ctx);
    case "reed-boathouse": return authorReedBoathouse(ctx);
    case "storm-mole": return authorStormMole(ctx);
    case "salvage-slip": return authorSalvageSlip(ctx);
    case "signal-jetty": return authorSignalJetty(ctx);
    case "pigeonnier-islet": return authorPigeonnierLanding(ctx);
  }
}

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

function authorBoathousePrecinct(ctx: StationAuthorContext): void {
  const { length, props, quayWidth, quayX, roofs, stone, timber, walls, width } = ctx;
  const hallX = quayX - 3.1;
  const roofW = Math.max(16, length * 1.25);
  const roofD = Math.max(8, quayWidth * 1.35);
  const hallW = roofW * 0.86;
  const hallD = roofD * 0.78;
  const hallH = 2.55;
  pushGeometry(walls, new BoxGeometry(hallW, hallH, hallD), hallX, 2.22, 0);
  // The precinct's dominant read is deliberately broader than any ordinary
  // hull: a terracotta hip whose ridge clears the quay by more than four units.
  const hallRoof = deepHipGeometry(hallX, roofW, roofD, 3.5, 1.82);
  addFeatureGeometry(ctx, "primaryMass", roofs, hallRoof);
  for (const z of [-hallD * 0.28, 0, hallD * 0.28]) {
    pushWarmWindow(ctx, new BoxGeometry(hallW * 0.56, 0.5, 0.09), hallX, 2.28, z);
  }

  // A real campanile: square shaft, open belfry, visible bell, and capped roof.
  // It sits beyond the hall eave so the whole profile survives sail occlusion.
  // Pull the campanile toward the cove-facing shoulder: the former landward
  // corner sat inside the rim trees, turning the belfry into an anonymous cap
  // at the default camera even though its measured height was sufficient.
  const towerX = hallX + roofW * 0.2;
  const towerZ = -roofD * 0.42;
  pushFeatureGeometry(ctx, "secondLevel", stone, new BoxGeometry(2.7, 0.55, 2.7), towerX, 1.38, towerZ);
  pushFeatureGeometry(ctx, "secondLevel", walls, new BoxGeometry(2.5, 4.8, 2.5), towerX, 3.95, towerZ);
  for (const z of [-0.58, 0, 0.58]) {
    pushWarmWindow(ctx, new BoxGeometry(0.12, 0.64, 0.38), towerX + 1.27, 4.55, towerZ + z);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    pushFeatureGeometry(ctx, "secondLevel", timber, new BoxGeometry(0.28, 2.1, 0.28), towerX + sx * 1.02, 7.15, towerZ + sz * 1.02);
  }
  pushFeatureGeometry(ctx, "secondLevel", timber, new BoxGeometry(2.65, 0.28, 2.65), towerX, 6.08, towerZ);
  pushFeatureGeometry(ctx, "secondLevel", timber, new BoxGeometry(2.65, 0.28, 2.65), towerX, 8.12, towerZ);
  addFeatureGeometry(ctx, "secondLevel", roofs, deepHipGeometry(towerX, 4.35, 4.35, 8.26, 1.55));
  const bell = new ConeGeometry(0.88, 1.5, 10);
  bell.rotateX(Math.PI);
  pushFeatureGeometry(ctx, "secondLevel", timber, bell, towerX, 7.05, towerZ);

  // An intentionally empty moon-viewing deck reaches beyond the hall.
  pushGeometry(timber, new BoxGeometry(length * 0.58, 0.24, width * 2.05), length * 0.22, 0.1, 0);
  pushPierPilings(props, length * 0.6, width * 1.75, length * 0.22, 5);
}

function authorAnnexPavilion(ctx: StationAuthorContext): void {
  const { length, props, roofs, timber, width } = ctx;
  pushGeometry(timber, new BoxGeometry(length * 0.66, 0.22, width * 1.35), length * 0.08, 0.1, 0);
  const x = ctx.quayX - 2.7;
  const w = 10;
  const d = 6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    pushGeometry(timber, new BoxGeometry(0.22, 2.55, 0.22), x + sx * w * 0.38, 2.15, sz * d * 0.34);
  }
  addFeatureGeometry(ctx, "primaryMass", roofs, deepHipGeometry(x, w, d, 3.2, 1.18));

  // A roof-top open belvedere makes every L2 an obvious but subordinate
  // satellite of the Ethereum hall, sharing its hip vocabulary at half scale.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    pushFeatureGeometry(ctx, "secondLevel", timber, new BoxGeometry(0.18, 2.45, 0.18), x + sx * 0.85, 5.55, sz * 0.68);
  }
  addFeatureGeometry(ctx, "secondLevel", roofs, deepHipGeometry(x, 3.4, 2.8, 6.8, 1.05));
  pushWarmWindow(ctx, new BoxGeometry(1.15, 0.58, 0.09), x, 5.4, d * 0.14);
  pushPierPilings(props, length * 0.66, width * 1.2, length * 0.08, 4);
}

function authorGateLanding(ctx: StationAuthorContext): void {
  const { accents, length, roofs, stone, walls, width } = ctx;
  pushGeometry(stone, new BoxGeometry(length * 0.58, 0.34, width * 1.45), length * 0.08, 0.03, 0);
  for (let step = 0; step < 3; step += 1) {
    pushGeometry(stone, new BoxGeometry(0.72, 0.18, width * (1.15 - step * 0.12)), length * 0.38 + step * 0.52, -0.1 - step * 0.14, 0);
  }
  const hallX = ctx.quayX - 2.7;
  const hallW = 10;
  const hallD = 6;
  pushGeometry(walls, new BoxGeometry(hallW * 0.84, 2.45, hallD * 0.76), hallX, 2.25, 0);
  pushFeatureGeometry(ctx, "primaryMass", roofs, new BoxGeometry(hallW, 0.32, hallD), hallX, 4.14, 0);
  pushWarmWindow(ctx, new BoxGeometry(0.09, 0.72, hallD * 0.5), hallX + hallW / 2 + 0.05, 2.38, 0);

  // A doubled lintel and broad oversailing cap make the seaward gate read as
  // a torii without borrowing the reserved danger vermilion.
  const gateX = ctx.quayX + 1.1;
  for (const z of [-2.15, 2.15]) {
    pushFeatureGeometry(ctx, "secondLevel", accents, new BoxGeometry(0.52, 6.1, 0.52), gateX, 4.05, z);
  }
  pushFeatureGeometry(ctx, "secondLevel", accents, new BoxGeometry(0.58, 0.42, 5.3), gateX, 6.52, 0);
  pushFeatureGeometry(ctx, "secondLevel", accents, new BoxGeometry(0.72, 0.46, 6.2), gateX, 7.18, 0);
  pushFeatureGeometry(ctx, "secondLevel", accents, new BoxGeometry(1.02, 0.28, 7.1), gateX, 7.68, 0);
}

function authorTeaHouseQuay(ctx: StationAuthorContext): void {
  const { length, props, roofs, timber, walls } = ctx;
  const x = ctx.quayX - 2.7;
  const w = 8.4;
  const d = 4.8;
  pushGeometry(walls, new BoxGeometry(w, 2.35, d), x, 2.28, 0);
  addFeatureGeometry(ctx, "primaryMass", roofs, deepHipGeometry(x, 10, 6, 3.38, 1.25));
  pushWarmWindow(ctx, new BoxGeometry(0.09, 0.76, d * 0.58), x + w / 2 + 0.05, 2.45, 0);

  // The moon-window loft rises above the engawa as one quiet square lantern;
  // a compact hip keeps it in the tea-house family rather than reading tower.
  pushFeatureGeometry(ctx, "secondLevel", walls, new BoxGeometry(2.5, 2.35, 2.3), x, 5.6, 0);
  pushWarmWindow(ctx, new BoxGeometry(1.15, 1.15, 0.09), x, 5.72, 1.2);
  addFeatureGeometry(ctx, "secondLevel", roofs, deepHipGeometry(x, 3.8, 3.5, 6.78, 1.05));
  // One engawa shelf over the water is this station's signature.
  pushGeometry(timber, new BoxGeometry(length * 0.56, 0.18, d * 1.18), length * 0.13, 0.2, 0);
  pushPierPilings(props, length * 0.5, d, length * 0.14, 4);
}

function authorFishingPier(ctx: StationAuthorContext): void {
  const { length, props, roofs, timber, width } = ctx;
  const pierLength = length * 1.08;
  pushGeometry(timber, new BoxGeometry(pierLength, 0.22, width * 0.62), length * 0.18, 0.1, 0);
  pushPierPilings(props, pierLength, width * 0.55, length * 0.18, 7);
  // The only lean-to roof, kept at the root so the thin pier remains legible.
  const shelterX = ctx.quayX - 2.7;
  const roof = new BoxGeometry(10, 0.28, 6.4);
  roof.rotateX(-0.34);
  roof.translate(shelterX, 4.0, 0);
  addFeatureGeometry(ctx, "primaryMass", roofs, roof);
  for (const z of [-2.35, 2.35]) {
    pushGeometry(timber, new BoxGeometry(0.22, 2.85, 0.22), shelterX, 2.35, z);
  }
  // A tall, forked drying rack is a second skyline above the low lean-to.
  const rackX = ctx.quayX + 0.9;
  for (const z of [-1.7, 1.7]) {
    pushFeatureGeometry(ctx, "secondLevel", timber, new BoxGeometry(0.25, 6.2, 0.25), rackX, 4.35, z);
  }
  pushFeatureGeometry(ctx, "secondLevel", timber, new BoxGeometry(0.25, 0.25, 4.2), rackX, 7.35, 0);
  pushWarmWindow(ctx, new BoxGeometry(1.1, 0.64, 0.09), shelterX, 2.55, 3.03);
  // Exactly one instanced works prop adds the visible net web inside that frame.
  scratchMatrix.makeScale(1.3, 1.7, Math.max(1.1, width));
  scratchMatrix.setPosition(rackX, 0.28, 0);
  props.push(harborProp("netRack", scratchMatrix, null, false));
}

function authorSteppedInlet(ctx: StationAuthorContext): void {
  const { length, roofs, stone, timber, width } = ctx;
  for (let index = 0; index < 6; index += 1) {
    const t = index / 5;
    pushGeometry(stone, new BoxGeometry(length * 0.18, 0.26, width * (1.65 - t * 0.48)), -length * 0.34 + index * length * 0.13, 0.48 - index * 0.17, 0);
  }
  const canopyX = ctx.quayX - 2.5;
  for (let level = 0; level < 3; level += 1) {
    pushFeatureGeometry(
      ctx,
      "primaryMass",
      roofs,
      new BoxGeometry(10 + level * 0.24, 0.18, 6 - level * 0.32),
      canopyX + level * 0.18,
      3.92 + level * 0.2,
      0,
    );
  }
  for (const z of [-2.25, 2.25]) {
    pushGeometry(timber, new BoxGeometry(0.22, 2.85, 0.22), canopyX, 2.45, z);
  }
  // Three warm crown lanterns echo the stair rhythm above the canopy.
  for (const [index, z] of [-0.72, 0, 0.72].entries()) {
    const y = 6.55 + index * 0.18;
    pushFeatureGeometry(ctx, "secondLevel", timber, new BoxGeometry(0.18, 3.0, 0.18), canopyX, y - 1.28, z * 1.45);
    pushWarmWindow(ctx, new BoxGeometry(0.72, 0.68, 0.72), canopyX, y, z * 1.45);
    pushFeatureGeometry(ctx, "secondLevel", roofs, new ConeGeometry(0.64, 0.58, 4), canopyX, y + 0.62, z * 1.45);
  }
}

function authorReedBoathouse(ctx: StationAuthorContext): void {
  const { length, props, roofs, timber, walls, width } = ctx;
  const x = ctx.quayX - 2.7;
  const w = 8.4;
  const d = 4.8;
  const roofW = 10;
  const roofD = 6;
  pushGeometry(timber, new BoxGeometry(length * 0.7, 0.2, width * 1.05), length * 0.06, 0.08, 0);
  for (const z of [-d * 0.42, d * 0.42]) pushGeometry(walls, new BoxGeometry(w, 2.5, 0.2), x, 2.3, z);
  // The only high, sharp A-frame: two deep thatch slopes.
  for (const side of [-1, 1]) {
    const slope = new BoxGeometry(roofW, 0.28, roofD * 0.74);
    slope.rotateX(side * 0.72);
    slope.translate(x, 3.82, side * roofD * 0.24);
    addFeatureGeometry(ctx, "primaryMass", roofs, slope);
  }
  pushWarmWindow(ctx, new BoxGeometry(0.09, 0.8, roofD * 0.48), x + roofW / 2 + 0.05, 2.45, 0);
  // A half-round thatch dome above the ridge stays soft against the reeds and
  // cannot be mistaken for the gate, mast, or lantern-tower silhouettes.
  const dome = new SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1.9, 1.35, 1.72);
  dome.translate(x, 8.0, 0);
  addFeatureGeometry(ctx, "secondLevel", roofs, dome);
  pushPierPilings(props, length * 0.62, width, length * 0.04, 5);
  scratchMatrix.makeScale(1.25, 1.2, 1.25);
  scratchMatrix.setPosition(length * 0.4, 0, width * 0.7);
  props.push(harborProp("reedClump", scratchMatrix, null, false));
}

function authorStormMole(ctx: StationAuthorContext): void {
  const { length, roofs, stone, walls, width, windows } = ctx;
  const radius = Math.max(3.2, length * 0.48);
  for (let index = 0; index < 7; index += 1) {
    const angle = -0.72 + index * 0.24;
    const block = new BoxGeometry(Math.max(1.35, length * 0.2), 0.72, Math.max(1.45, width * 0.84));
    block.rotateY(-angle);
    block.translate(-length * 0.3 + Math.cos(angle) * radius, 0.18, Math.sin(angle) * radius);
    stone.push(block);
  }
  const houseX = ctx.quayX - 2.7;
  pushGeometry(walls, new BoxGeometry(8.4, 2.4, 4.8), houseX, 2.25, 0);
  addFeatureGeometry(ctx, "primaryMass", roofs, deepHipGeometry(houseX, 10, 6, 3.3, 1.28));
  pushWarmWindow(ctx, new BoxGeometry(0.09, 0.72, 1.5), houseX + 4.25, 2.42, 0);

  // One broad lantern tower terminates the weather-facing curve.
  const towerX = ctx.quayX + 1.4;
  pushFeatureGeometry(ctx, "secondLevel", walls, new BoxGeometry(2.8, 5.6, 2.8), towerX, 4.0, 0);
  const lanternBand = new BoxGeometry(3.1, 0.78, 3.1);
  pushGeometry(windows, lanternBand, towerX, 6.45, 0);
  ctx.featureGeometry.warmWindows.push(lanternBand);
  addFeatureGeometry(ctx, "secondLevel", roofs, deepHipGeometry(towerX, 4.4, 4.1, 6.86, 1.15));
}

function authorSalvageSlip(ctx: StationAuthorContext): void {
  const { length, props, roofs, timber, width } = ctx;
  const slipLength = length * 0.92;
  for (const z of [-width * 0.32, width * 0.32]) {
    const rail = new BoxGeometry(slipLength, 0.16, 0.2);
    rail.rotateZ(-0.1);
    rail.translate(length * 0.08, 0.18, z);
    timber.push(rail);
  }
  pushPierPilings(props, slipLength, width * 0.75, length * 0.08, 5);
  // A single hauled-out hull frame: one keel with repeated ribs, all in the timber bucket.
  const shelterX = ctx.quayX - 2.7;
  const frameX = ctx.quayX + 0.8;
  pushFeatureGeometry(ctx, "secondLevel", timber, new BoxGeometry(5.2, 0.24, 0.28), frameX, 2.0, 0);
  for (let rib = 0; rib < 5; rib += 1) {
    const x = frameX - 2 + rib;
    for (const side of [-1, 1]) {
      const frame = new BoxGeometry(0.2, 7.2, 0.2);
      frame.rotateX(side * 0.72);
      frame.translate(x, 5.15, side * 0.82);
      addFeatureGeometry(ctx, "secondLevel", timber, frame);
    }
  }
  // A shallow paired gable shelters the head of the slip.
  for (const side of [-1, 1]) {
    const slope = new BoxGeometry(10, 0.28, 3.75);
    slope.rotateX(side * 0.45);
    slope.translate(shelterX, 3.72, side * 1.28);
    addFeatureGeometry(ctx, "primaryMass", roofs, slope);
  }
  pushWarmWindow(ctx, new BoxGeometry(1.1, 0.7, 0.09), shelterX, 2.45, 3.02);
}

function authorSignalJetty(ctx: StationAuthorContext): void {
  const { length, props, roofs, timber, width } = ctx;
  const jettyLength = length * 1.04;
  pushGeometry(timber, new BoxGeometry(jettyLength, 0.2, Math.max(0.82, width * 0.5)), length * 0.17, 0.1, 0);
  pushPierPilings(props, jettyLength, Math.max(0.7, width * 0.42), length * 0.17, 6);
  // The butterfly canopy is the sole roofline; its tall mast carries the station pennant.
  const canopyX = ctx.quayX - 2.7;
  for (const side of [-1, 1]) {
    const wing = new BoxGeometry(10, 0.26, 3.65);
    wing.rotateX(side * -0.24);
    wing.translate(canopyX, 3.86, side * 1.2);
    addFeatureGeometry(ctx, "primaryMass", roofs, wing);
  }
  const mastX = ctx.quayX + 0.9;
  pushFeatureGeometry(ctx, "secondLevel", timber, new BoxGeometry(0.28, 8.1, 0.28), mastX, 5.15, 0);
  pushFeatureGeometry(ctx, "secondLevel", timber, new BoxGeometry(0.22, 0.22, 3.2), mastX, 8.55, 0);
  pushWarmWindow(ctx, new BoxGeometry(0.82, 0.72, 0.09), canopyX, 2.45, 3.02);
}

function authorPigeonnierLanding(ctx: StationAuthorContext): void {
  const { length, props, roofs, timber, walls, width } = ctx;
  // The detached data landmark remains owned by garden-islets; this cote is
  // the chain station at its wharf and repeats that conical vocabulary at a
  // smaller scale so TON's landing is not the only roofless recipe.
  pushGeometry(timber, new BoxGeometry(length * 0.52, 0.2, width * 0.72), length * 0.02, 0.08, 0);
  const houseX = ctx.quayX - 2.7;
  pushGeometry(walls, new BoxGeometry(8.2, 2.3, 4.7), houseX, 2.25, 0);
  const houseRoof = new ConeGeometry(1, 1, 8);
  houseRoof.scale(5, 1.35, 3);
  houseRoof.translate(houseX, 3.48, 0);
  addFeatureGeometry(ctx, "primaryMass", roofs, houseRoof);
  pushWarmWindow(ctx, new BoxGeometry(0.09, 0.72, 1.4), houseX + 4.15, 2.42, 0);

  const coteX = houseX - 2.6;
  pushFeatureGeometry(ctx, "secondLevel", walls, new CylinderGeometry(1.35, 1.65, 4.8, 8), coteX, 5.25, 0);
  for (const z of [-0.68, 0, 0.68]) {
    pushWarmWindow(ctx, new BoxGeometry(0.28, 0.42, 0.1), coteX + 1.35, 5.55, z);
  }
  const coteRoof = new ConeGeometry(2.05, 1.55, 8);
  pushFeatureGeometry(ctx, "secondLevel", roofs, coteRoof, coteX, 8.42, 0);
  pushPierPilings(props, length * 0.48, width * 0.62, length * 0.02, 4);
}

function authorStoneQuay(
  ctx: StationAuthorContext,
  type: StationType,
): void {
  const { quayLength, quayWidth, quayX, stone } = ctx;
  const depth = type === "fishing-pier" || type === "pigeonnier-islet" ? 1.55 : 1.8;
  pushFeatureGeometry(ctx, "quayPlatform", stone, new BoxGeometry(quayLength, depth, quayWidth), quayX, 0.2, 0);
  pushFeatureGeometry(ctx, "quayPlatform", stone, new BoxGeometry(quayLength + 0.34, 0.22, quayWidth + 0.34), quayX, 1.02, 0);
  for (let course = 0; course < 2; course += 1) {
    pushFeatureGeometry(ctx, "quayPlatform", stone, new BoxGeometry(quayLength - course * 0.42, 0.34, 0.28), quayX, -0.22 - course * 0.32, quayWidth / 2 + 0.15 + course * 0.18);
  }
  // One continuous ember edge survives the overview without creating a lamp
  // forest. It shares the station-window draw and registers no new water lane.
  pushFeatureGeometry(
    ctx,
    "quayLitEdge",
    ctx.windows,
    new BoxGeometry(quayLength + 0.44, 0.24, 0.1),
    quayX,
    1.03,
    quayWidth / 2 + 0.22,
  );
}

function stationFeatures(
  type: StationType,
  geometry: StationFeatureGeometry,
): HarborStationFeatures {
  return {
    primaryMass: measureFeature(geometry.primaryMass),
    quayPlatform: {
      ...measureFeature(geometry.quayPlatform),
      litEdge: geometry.quayLitEdge.length > 0,
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

/**
 * Covered corridor between Ethereum and a nearby L2 annex. Geometry is in the
 * precinct's local space, ready for its normal global-batch transform.
 */
export function authorPrecinctBridge(from: DockRecipe, to: DockRecipe): HarborBucketPart[] {
  if (from.station.type !== "boathouse-precinct" || to.station.type !== "annex-pavilion") return [];
  const tileDistance = Math.hypot(to.dock.tile.x - from.dock.tile.x, to.dock.tile.y - from.dock.tile.y);
  if (tileDistance > 20.5 || tileDistance < 1) return [];

  const dx = to.anchorPosition.x - from.anchorPosition.x;
  const dz = to.anchorPosition.z - from.anchorPosition.z;
  const cos = Math.cos(from.anchorRotationY);
  const sin = Math.sin(from.anchorRotationY);
  const end = { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
  const distance = Math.hypot(end.x, end.z);
  const normal = { x: -end.z / distance, z: end.x / distance };
  const bow = Math.min(2.2, distance * 0.1);
  const control = { x: end.x * 0.5 + normal.x * bow, z: end.z * 0.5 + normal.z * bow };
  const segments = MathUtils.clamp(Math.ceil(distance / 2.2), 4, 12);
  const deckWidth = 1.18;
  const deckThickness = 0.26;
  const railHalfSpan = 0.5;
  const railHeight = 0.86;
  const timber: BufferGeometry[] = [];
  const roofs: BufferGeometry[] = [];
  const postPairs: Array<{
    left: { x: number; z: number };
    right: { x: number; z: number };
    yaw: number;
  }> = [];
  for (let index = 0; index < segments; index += 1) {
    const a = quadraticPoint(end, control, index / segments);
    const b = quadraticPoint(end, control, (index + 1) / segments);
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const sx = b.x - a.x;
    const sz = b.z - a.z;
    const span = Math.hypot(sx, sz);
    const yaw = -Math.atan2(sz, sx);
    const deck = new BoxGeometry(span + 0.08, deckThickness, deckWidth);
    deck.rotateY(yaw);
    deck.translate(mx, 0.29, mz);
    timber.push(deck);
    const pair = {
      left: { x: mx + Math.sin(yaw) * -railHalfSpan, z: mz + Math.cos(yaw) * -railHalfSpan },
      right: { x: mx + Math.sin(yaw) * railHalfSpan, z: mz + Math.cos(yaw) * railHalfSpan },
      yaw,
    };
    postPairs.push(pair);
    for (const side of [-1, 1]) {
      const px = mx + Math.sin(yaw) * side * railHalfSpan;
      const pz = mz + Math.cos(yaw) * side * railHalfSpan;
      pushGeometry(timber, new BoxGeometry(0.1, 1.62, 0.1), px, 1.05, pz);
      const rail = new BoxGeometry(span + 0.1, 0.13, 0.13);
      rail.rotateY(yaw);
      rail.translate(px, railHeight, pz);
      timber.push(rail);
      const slope = new BoxGeometry(span + 0.16, 0.1, 0.52);
      slope.rotateX(side * 0.35);
      slope.rotateY(yaw);
      slope.translate(mx, 1.94, mz);
      roofs.push(slope);
    }
  }
  const timberGeometry = mergeBucket(timber);
  timberGeometry.userData.precinctBridgePostPairs = postPairs;
  timberGeometry.userData.precinctBridgeProfile = {
    deckThickness,
    deckWidth,
    railHeight,
  };
  return [
    harborPart("timber", timberGeometry, HARBOR_PALETTE.timber_mid, false, true),
    harborPart("roof", mergeBucket(roofs), stationRoofColor(from.station.type), false, true),
  ];
}

function quadraticPoint(end: { x: number; z: number }, control: { x: number; z: number }, t: number) {
  const inverse = 1 - t;
  return {
    x: 2 * inverse * t * control.x + t * t * end.x,
    z: 2 * inverse * t * control.z + t * t * end.z,
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
  const options: readonly StationType[] = ["gate-landing", "tea-house-quay", "fishing-pier", "stepped-inlet", "reed-boathouse"];
  return options[Math.min(options.length - 1, Math.floor(stableUnit(`station-type.${chainId}`) * options.length))]!;
}

function stationFlagPlacement(type: StationType, length: number, width: number, supply: number) {
  const height = (
    type === "boathouse-precinct" ? 6.4
      : type === "signal-jetty" ? 5.4
        : type === "pigeonnier-islet" ? 4.4
          : 4.8
  ) + supply * 1.25;
  return {
    height,
    scale: ((type === "boathouse-precinct" ? 1.05 : 0.72) + supply * 0.24)
      * HARBOR_FLAG_SCALE_MULTIPLIER,
    x: type === "stepped-inlet" ? -length * 0.2
      : type === "storm-mole" ? length * 0.18
        : length * 0.4,
    z: type === "annex-pavilion" ? width * 0.62 : -width * 0.3,
  };
}

function stationLampLocals(type: StationType, length: number, width: number, quayX: number, quayWidth: number) {
  if (type === "pigeonnier-islet") return [{ height: 1.45, x: length * 0.3, z: 0 }];
  if (type === "stepped-inlet") return [
    { height: 1.72, x: -length * 0.22, z: -width * 0.58 },
    { height: 1.72, x: -length * 0.22, z: width * 0.58 },
  ];
  if (type === "boathouse-precinct") return [
    { height: 1.72, x: length * 0.18, z: -width * 0.58 },
    { height: 1.72, x: length * 0.18, z: width * 0.58 },
    { height: 1.55, x: quayX, z: quayWidth * 0.42 },
  ];
  return [
    { height: 1.52, x: length * 0.12, z: -width * 0.42 },
    { height: 1.52, x: length * 0.12, z: width * 0.42 },
  ];
}

function stationSpan(type: StationType, width: number): number {
  switch (type) {
    case "boathouse-precinct": return width * 3.5;
    case "annex-pavilion": return width * 1.7;
    case "gate-landing": return width * 1.8;
    case "tea-house-quay": return width * 1.85;
    case "fishing-pier": return width * 1.05;
    case "stepped-inlet": return width * 1.8;
    case "reed-boathouse": return width * 1.65;
    case "storm-mole": return width * 3.2;
    case "salvage-slip": return width * 1.8;
    case "signal-jetty": return width * 1.55;
    case "pigeonnier-islet": return width;
  }
}

function deepHipGeometry(x: number, w: number, d: number, eaves: number, rise: number): BufferGeometry {
  const hip = new ConeGeometry(1, 1, 4);
  hip.rotateY(Math.PI / 4);
  hip.scale(w * Math.SQRT1_2, rise, d * Math.SQRT1_2);
  hip.translate(x, eaves + rise / 2, 0);
  return hip;
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
  return 0.62 + MathUtils.clamp(decades, 0, 1) * 0.92;
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
    wavePhase: (stableUnit(`dock-flag-wave.${dock.chainId}`) - 0.5) * 0.7,
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

const HARBOR_CALM_MARGIN_X = 5.5;
const HARBOR_CALM_MARGIN_Z = 4.5;
const HARBOR_CALM_MIN_RADIUS_X = 9;
const HARBOR_CALM_MIN_RADIUS_Z = 7;
const HARBOR_CALM_MAX_RADIUS_X = 18;
const HARBOR_CALM_MAX_RADIUS_Z = 13;
const HARBOR_CALM_STRENGTH = 0.75;

export function gardenHarborCalmMask(docks: readonly Pick<DockVisual, "root">[]): GardenHarborCalmMask | null {
  if (docks.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let centerX = 0;
  let centerZ = 0;
  for (const dock of docks) {
    const { x, z } = dock.root.position;
    centerX += x;
    centerZ += z;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return {
    calmStrength: HARBOR_CALM_STRENGTH,
    center: { x: centerX / docks.length, z: centerZ / docks.length },
    radiusX: MathUtils.clamp((maxX - minX) / 2 + HARBOR_CALM_MARGIN_X, HARBOR_CALM_MIN_RADIUS_X, HARBOR_CALM_MAX_RADIUS_X),
    radiusZ: MathUtils.clamp((maxZ - minZ) / 2 + HARBOR_CALM_MARGIN_Z, HARBOR_CALM_MIN_RADIUS_Z, HARBOR_CALM_MAX_RADIUS_Z),
  };
}
