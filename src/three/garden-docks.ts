import {
  BoxGeometry,
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
  | "pigeonnier-islet";
export type StationSignature =
  | "moon-viewing-deck"
  | "open-pavilion"
  | "gate-frame"
  | "engawa"
  | "net-racks"
  | "top-lanterns"
  | "reed-clump"
  | "pigeonnier";
export type StationRoofline =
  | "deep-hip"
  | "pavilion-hip"
  | "lintel-cap"
  | "tea-hip"
  | "lean-to"
  | "stepped-canopy"
  | "thatch-gable"
  | "pigeonnier-cone";
export type StationFlagShape =
  | "swallowtail"
  | "notched"
  | "pennant"
  | "chamfered"
  | "forked"
  | "stepped"
  | "tapered"
  | "square";

export interface HarborIdentity {
  stationType: StationType;
  roofline: StationRoofline;
  signature: StationSignature;
  flagShape: StationFlagShape;
}
export type HarborPlan = StationType;
export type HarborSignature = StationSignature;

const STATION_TYPES: readonly StationType[] = [
  "boathouse-precinct", "annex-pavilion", "gate-landing", "tea-house-quay",
  "fishing-pier", "stepped-inlet", "reed-boathouse", "pigeonnier-islet",
];
const STATION_IDENTITY: Record<StationType, Omit<HarborIdentity, "stationType">> = {
  "annex-pavilion": { flagShape: "notched", roofline: "pavilion-hip", signature: "open-pavilion" },
  "boathouse-precinct": { flagShape: "swallowtail", roofline: "deep-hip", signature: "moon-viewing-deck" },
  "fishing-pier": { flagShape: "forked", roofline: "lean-to", signature: "net-racks" },
  "gate-landing": { flagShape: "pennant", roofline: "lintel-cap", signature: "gate-frame" },
  "pigeonnier-islet": { flagShape: "square", roofline: "pigeonnier-cone", signature: "pigeonnier" },
  "reed-boathouse": { flagShape: "tapered", roofline: "thatch-gable", signature: "reed-clump" },
  "stepped-inlet": { flagShape: "stepped", roofline: "stepped-canopy", signature: "top-lanterns" },
  "tea-house-quay": { flagShape: "chamfered", roofline: "tea-hip", signature: "engawa" },
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
  identity: HarborIdentity;
  lampWorldPositions: { x: number; z: number }[];
  plan: HarborPlan;
  signature: HarborSignature;
  quayHealth: number;
  accentColor: Color;
}

const CAMERA_FACING_YAW = Math.PI / 4;
const PIER_DECK_TOP_Y = 0.21;
const QUAY_TOP_Y = 0.62;

export function createHarborLanterns(islandTile: { x: number; y: number }): {
  lightMaterial: MeshStandardMaterial;
  root: Group;
} {
  const root = new Group();
  setTilePosition(root, islandTile, 0);
  const count = 12;
  const bodyMaterial = new MeshStandardMaterial({ color: "#766348", metalness: 0.38, roughness: 0.65 });
  const lightMaterial = new MeshStandardMaterial({
    color: HARBOR_PALETTE.lantern_glow,
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity: 0.25,
    roughness: 0.25,
  });
  const bodies = new InstancedMesh(new CylinderGeometry(0.12, 0.2, 0.42, 6), bodyMaterial, count);
  const lights = new InstancedMesh(new SphereGeometry(0.16, 6, 4), lightMaterial, count);
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + stableUnit(`harbor-lantern-angle.${index}`) * 0.16;
    const x = Math.cos(angle) * (22 + (index % 3) * 1.25);
    const z = Math.sin(angle) * (15.5 + (index % 2) * 1.15);
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
  authorStoneQuay(stone, quayLength, quayWidth, quayX, station.type);
  authorStationType(station.type, {
    length, props, quayWidth, quayX, roofs, stone, supply, timber, walls, width, windows,
  });

  const parts: HarborBucketPart[] = [];
  pushMergedPart(parts, "timber", timber, HARBOR_PALETTE.timber_mid, false, true);
  pushMergedPart(parts, "stone", stone, stoneColor, false, true);
  pushMergedPart(parts, "metal", metal, "#3d3327", true, false);
  pushMergedPart(parts, "wall", walls, "#a99a79", false, true);
  pushMergedPart(parts, "roof", roofs, accent, false, true);
  pushMergedPart(parts, "window", windows, HARBOR_PALETTE.lantern_glow, false, false);
  pushMergedPart(parts, "accent", accents, accent, false, true);
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
    scratchMatrix.setPosition(post.x, post.height / 2 + 0.24, post.z);
    props.push(harborProp("post", scratchMatrix, null, false));
  }
  for (const lamp of lamps) {
    scratchMatrix.makeTranslation(lamp.x, lamp.height + 0.3, lamp.z);
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
  length: number;
  props: HarborPropInstance[];
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

function authorStationType(type: StationType, ctx: StationAuthorContext): void {
  switch (type) {
    case "boathouse-precinct": return authorBoathousePrecinct(ctx);
    case "annex-pavilion": return authorAnnexPavilion(ctx);
    case "gate-landing": return authorGateLanding(ctx);
    case "tea-house-quay": return authorTeaHouseQuay(ctx);
    case "fishing-pier": return authorFishingPier(ctx);
    case "stepped-inlet": return authorSteppedInlet(ctx);
    case "reed-boathouse": return authorReedBoathouse(ctx);
    case "pigeonnier-islet": return authorPigeonnierLanding(ctx);
  }
}

function authorBoathousePrecinct(ctx: StationAuthorContext): void {
  const { length, props, quayWidth, quayX, roofs, stone, timber, walls, width, windows } = ctx;
  const hallX = quayX - 0.12;
  const hallW = length * 0.52;
  const hallD = quayWidth * 0.72;
  const hallH = 1.32;
  pushGeometry(walls, new BoxGeometry(hallW, hallH, hallD), hallX, 0.65 + hallH / 2, 0);
  // The precinct's single dominant read: one long, low, very deep hip.
  pushDeepHip(roofs, hallX, hallW * 1.14, hallD * 1.28, 0.65 + hallH, 0.72);
  for (const z of [-hallD * 0.28, 0, hallD * 0.28]) {
    pushGeometry(windows, new BoxGeometry(hallW * 0.5, 0.3, 0.045), hallX, 1.05, z);
  }

  // The only bell tower/campanile-equivalent in the station family.
  const towerX = quayX - hallW * 0.28;
  const towerZ = -quayWidth * 0.58;
  pushGeometry(stone, new BoxGeometry(1.25, 0.38, 1.25), towerX, 0.72, towerZ);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    pushGeometry(timber, new BoxGeometry(0.18, 4.7, 0.18), towerX + sx * 0.43, 3.08, towerZ + sz * 0.43);
  }
  pushGeometry(timber, new BoxGeometry(1.18, 0.18, 1.18), towerX, 3.3, towerZ);
  pushDeepHip(roofs, towerX, 1.65, 1.65, 5.3, 0.78);
  const bell = new ConeGeometry(0.32, 0.62, 8);
  bell.rotateX(Math.PI);
  pushGeometry(timber, bell, towerX, 4.05, towerZ);

  // An intentionally empty moon-viewing deck reaches beyond the hall.
  pushGeometry(timber, new BoxGeometry(length * 0.58, 0.24, width * 2.05), length * 0.22, 0.1, 0);
  pushPierPilings(props, length * 0.6, width * 1.75, length * 0.22, 5);
}

function authorAnnexPavilion(ctx: StationAuthorContext): void {
  const { length, props, roofs, timber, width } = ctx;
  pushGeometry(timber, new BoxGeometry(length * 0.66, 0.22, width * 1.35), length * 0.08, 0.1, 0);
  const x = -length * 0.12;
  const w = length * 0.42;
  const d = width * 1.4;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    pushGeometry(timber, new BoxGeometry(0.16, 1.65, 0.16), x + sx * w * 0.38, 1.04, sz * d * 0.34);
  }
  pushDeepHip(roofs, x, w, d, 1.86, 0.48);
  pushPierPilings(props, length * 0.66, width * 1.2, length * 0.08, 4);
}

function authorGateLanding(ctx: StationAuthorContext): void {
  const { length, roofs, stone, timber, width } = ctx;
  pushGeometry(stone, new BoxGeometry(length * 0.58, 0.34, width * 1.45), length * 0.08, 0.03, 0);
  for (let step = 0; step < 3; step += 1) {
    pushGeometry(stone, new BoxGeometry(0.72, 0.18, width * (1.15 - step * 0.12)), length * 0.38 + step * 0.52, -0.1 - step * 0.14, 0);
  }
  // A straight capped frame, deliberately without torii flare or vermilion.
  const gateX = -length * 0.05;
  for (const z of [-width * 0.5, width * 0.5]) {
    pushGeometry(timber, new BoxGeometry(0.3, 2.9, 0.3), gateX, 1.78, z);
  }
  pushGeometry(timber, new BoxGeometry(0.42, 0.34, width * 1.52), gateX, 3.28, 0);
  pushGeometry(roofs, new BoxGeometry(0.82, 0.16, width * 1.7), gateX, 3.54, 0);
}

function authorTeaHouseQuay(ctx: StationAuthorContext): void {
  const { length, props, roofs, timber, walls, width, windows } = ctx;
  const x = -length * 0.18;
  const w = length * 0.36;
  const d = width * 1.36;
  pushGeometry(walls, new BoxGeometry(w, 1.48, d), x, 1.34, 0);
  pushDeepHip(roofs, x, w * 1.2, d * 1.25, 2.08, 0.7);
  pushGeometry(windows, new BoxGeometry(0.04, 0.56, d * 0.5), x + w / 2 + 0.025, 1.38, 0);
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
  const roof = new BoxGeometry(length * 0.3, 0.12, width * 0.95);
  roof.rotateX(-0.34);
  roof.translate(-length * 0.25, 1.66, 0);
  roofs.push(roof);
  for (const z of [-width * 0.36, width * 0.36]) {
    pushGeometry(timber, new BoxGeometry(0.13, 1.45, 0.13), -length * 0.25, 0.92, z);
  }
  // Exactly one instanced works prop: the net racks.
  scratchMatrix.makeScale(1.12, 1.12, Math.max(0.8, width));
  scratchMatrix.setPosition(length * 0.48, 0.24, 0);
  props.push(harborProp("netRack", scratchMatrix, null, false));
}

function authorSteppedInlet(ctx: StationAuthorContext): void {
  const { length, roofs, stone, timber, width } = ctx;
  for (let index = 0; index < 6; index += 1) {
    const t = index / 5;
    pushGeometry(stone, new BoxGeometry(length * 0.18, 0.26, width * (1.65 - t * 0.48)), -length * 0.34 + index * length * 0.13, 0.48 - index * 0.17, 0);
  }
  for (let level = 0; level < 3; level += 1) {
    pushGeometry(roofs, new BoxGeometry(0.78 + level * 0.18, 0.11, width * (1.15 - level * 0.14)), -length * 0.28 + level * 0.16, 2.05 + level * 0.18, 0);
  }
  for (const z of [-width * 0.52, width * 0.52]) {
    pushGeometry(timber, new BoxGeometry(0.14, 1.65, 0.14), -length * 0.25, 1.2, z);
  }
}

function authorReedBoathouse(ctx: StationAuthorContext): void {
  const { length, props, roofs, timber, walls, width } = ctx;
  const x = -length * 0.05;
  const w = length * 0.5;
  const d = width * 1.32;
  pushGeometry(timber, new BoxGeometry(length * 0.7, 0.2, width * 1.05), length * 0.06, 0.08, 0);
  for (const z of [-d * 0.42, d * 0.42]) pushGeometry(walls, new BoxGeometry(w, 1.28, 0.12), x, 1.0, z);
  // The only high, sharp A-frame: two deep thatch slopes.
  for (const side of [-1, 1]) {
    const slope = new BoxGeometry(w * 1.1, 0.2, d * 0.72);
    slope.rotateX(side * 0.72);
    slope.translate(x, 2.14, side * d * 0.25);
    roofs.push(slope);
  }
  pushPierPilings(props, length * 0.62, width, length * 0.04, 5);
  scratchMatrix.makeScale(1.25, 1.2, 1.25);
  scratchMatrix.setPosition(length * 0.4, 0, width * 0.7);
  props.push(harborProp("reedClump", scratchMatrix, null, false));
}

function authorPigeonnierLanding(ctx: StationAuthorContext): void {
  const { length, props, timber, width } = ctx;
  // The detached tower/islet stays owned by garden-islets and is unchanged.
  pushGeometry(timber, new BoxGeometry(length * 0.52, 0.2, width * 0.72), length * 0.02, 0.08, 0);
  pushPierPilings(props, length * 0.48, width * 0.62, length * 0.02, 4);
}

function authorStoneQuay(
  stone: BufferGeometry[],
  quayLength: number,
  quayWidth: number,
  quayX: number,
  type: StationType,
): void {
  const depth = type === "fishing-pier" || type === "pigeonnier-islet" ? 0.62 : 0.9;
  pushGeometry(stone, new BoxGeometry(quayLength, depth, quayWidth), quayX, 0.02, 0);
  pushGeometry(stone, new BoxGeometry(quayLength + 0.26, 0.15, quayWidth + 0.26), quayX, 0.54, 0);
  for (let course = 0; course < 2; course += 1) {
    pushGeometry(stone, new BoxGeometry(quayLength - course * 0.42, 0.24, 0.22), quayX, -0.28 - course * 0.24, quayWidth / 2 + 0.12 + course * 0.16);
  }
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
    const deck = new BoxGeometry(span + 0.08, 0.14, 0.78);
    deck.rotateY(yaw);
    deck.translate(mx, 0.24, mz);
    timber.push(deck);
    const pair = {
      left: { x: mx + Math.sin(yaw) * -0.31, z: mz + Math.cos(yaw) * -0.31 },
      right: { x: mx + Math.sin(yaw) * 0.31, z: mz + Math.cos(yaw) * 0.31 },
      yaw,
    };
    postPairs.push(pair);
    for (const side of [-1, 1]) {
      const px = mx + Math.sin(yaw) * side * 0.31;
      const pz = mz + Math.cos(yaw) * side * 0.31;
      pushGeometry(timber, new BoxGeometry(0.1, 1.62, 0.1), px, 1.05, pz);
      const slope = new BoxGeometry(span + 0.16, 0.1, 0.52);
      slope.rotateX(side * 0.35);
      slope.rotateY(yaw);
      slope.translate(mx, 1.94, mz);
      roofs.push(slope);
    }
  }
  const timberGeometry = mergeBucket(timber);
  timberGeometry.userData.precinctBridgePostPairs = postPairs;
  return [
    harborPart("timber", timberGeometry, HARBOR_PALETTE.timber_mid, false, true),
    harborPart("roof", mergeBucket(roofs), from.accentColor, false, true),
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
  const height = (type === "boathouse-precinct" ? 6.4 : type === "pigeonnier-islet" ? 4.4 : 4.8) + supply * 1.25;
  return {
    height,
    scale: (type === "boathouse-precinct" ? 1.05 : 0.72) + supply * 0.24,
    x: type === "stepped-inlet" ? -length * 0.2 : length * 0.4,
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
    case "pigeonnier-islet": return width;
  }
}

function pushDeepHip(parts: BufferGeometry[], x: number, w: number, d: number, eaves: number, rise: number): void {
  const hip = new ConeGeometry(1, 1, 4);
  hip.rotateY(Math.PI / 4);
  hip.scale(w * Math.SQRT1_2, rise, d * Math.SQRT1_2);
  hip.translate(x, eaves + rise / 2, 0);
  parts.push(hip);
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
      y: placement.height - placement.scale * 0.75,
      yaw: placement.yaw,
      z: placement.z,
    },
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
