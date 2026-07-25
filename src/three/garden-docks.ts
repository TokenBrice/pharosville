import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  GARDEN_DOCK_ROOT_Y,
  GARDEN_WATER_Y as WATER_LEVEL,
} from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import type { DockNode } from "../systems/world-types";
import {
  assignGardenChainFlagCell,
  gardenChainFlagAtlas,
  gardenChainFlagCellUv,
} from "./garden-chain-flag";
import { setTilePosition, stableUnit, TILE_SCALE } from "./garden-util";
import type { GardenHarborCalmMask } from "./garden-water-contract";

const scratchMatrix = new Matrix4();

/** One signature prop distinguishes each harbor at a glance. */
type SignatureKind = "arch" | "crane" | "net-racks" | "dinghy" | "crate-tower" | "derrick";
const SIGNATURE_KINDS: readonly SignatureKind[] = [
  "crane",
  "net-racks",
  "dinghy",
  "crate-tower",
  "derrick",
];

/**
 * N4: the harbour's *plan* — the shape of its stonework and piers. The
 * operator's note was that harbours are "barely noticeable and recognizable",
 * and a signature prop on an otherwise identical pier is not recognition. The
 * plan changes the footprint itself, so two harbours differ in silhouette
 * before any flag or prop is read.
 */
export type HarborPlan = "t-head" | "l-quay" | "double-finger" | "mole" | "wharf";
const HARBOR_PLANS: readonly HarborPlan[] = ["l-quay", "double-finger", "mole", "wharf"];

// The fixed camera's azimuth. Harbour roots yaw to face the island, so the
// flag counter-rotates by this to present its face to the viewer wherever its
// harbour ended up — a flag edge-on is not a flag.
const CAMERA_FACING_YAW = Math.PI / 4;

export interface DockVisual {
  dock: DockNode;
  fineDetail: Group;
  /** World-space lamp positions (post tops) for sea-lane registration. */
  lampWorldPositions: { x: number; z: number }[];
  plan: HarborPlan;
  root: Group;
  signature: SignatureKind;
}

export function createHarborLanterns(
  islandTile: { x: number; y: number },
): {
  lightMaterial: MeshStandardMaterial;
  root: Group;
} {
  const root = new Group();
  setTilePosition(root, islandTile, 0);
  const count = 12;
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
  const bodies = new InstancedMesh(
    new CylinderGeometry(0.12, 0.2, 0.42, 6),
    bodyMaterial,
    count,
  );
  const lights = new InstancedMesh(
    new SphereGeometry(0.16, 6, 4),
    lightMaterial,
    count,
  );
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2
      + stableUnit(`harbor-lantern-angle.${index}`) * 0.16;
    const radiusX = 22 + (index % 3) * 1.25;
    const radiusZ = 15.5 + (index % 2) * 1.15;
    const x = Math.cos(angle) * radiusX;
    const z = Math.sin(angle) * radiusZ;
    scratchMatrix.makeTranslation(x, WATER_LEVEL + 0.26, z);
    bodies.setMatrixAt(index, scratchMatrix);
    scratchMatrix.makeTranslation(x, WATER_LEVEL + 0.58, z);
    lights.setMatrixAt(index, scratchMatrix);
  }
  bodies.instanceMatrix.needsUpdate = true;
  lights.instanceMatrix.needsUpdate = true;
  root.add(bodies, lights);
  return { lightMaterial, root };
}

/**
 * Builds one chain harbour.
 *
 * Local +X points at the island (the root yaws to face it), so the quay and
 * its warehouses sit at the seaward end and the pier reaches inward to a head
 * carrying the crane and the chain flag.
 *
 * Draw budget: static structure is merged by material and repeated units are
 * instanced, so a harbour is ~14 draws regardless of how much is built into
 * it — roughly what the two-mesh pier cost before, for an order of magnitude
 * more harbour.
 */
export function createDock(
  dock: DockNode,
  displayTile: { x: number; y: number },
  islandTile: { x: number; y: number },
): DockVisual {
  const root = new Group();
  const fineDetail = new Group();
  fineDetail.name = "dock-fine-detail";
  root.add(fineDetail);
  setTilePosition(root, displayTile, GARDEN_DOCK_ROOT_Y);
  const toIslandX = (islandTile.x - displayTile.x) * TILE_SCALE;
  const toIslandZ = (islandTile.y - displayTile.y) * TILE_SCALE;
  root.rotation.y = -Math.atan2(toIslandZ, toIslandX);

  const amountScale = MathUtils.clamp(Math.log10(Math.max(1, dock.totalUsd)) / 11, 0.72, 1.18);
  const length = 7.2 * amountScale;
  const width = 1.65 + amountScale * 0.35;
  const accent = dockAccentColor(dock);
  const signature = signatureKind(dock);
  const plan = harborPlan(dock);
  // `dock.size` is the chain's supply band (1-10). It governs how much harbour
  // gets built: a big chain gets a longer quay, more warehouses, a crane, and
  // more berths, so scale reads as consequence rather than decoration.
  const size = MathUtils.clamp(dock.size, 1, 10);
  const supply = size / 10;

  const timber = new MeshStandardMaterial({
    color: HARBOR_PALETTE.timber_mid,
    roughness: 0.88,
  });
  const stone = new MeshStandardMaterial({
    color: "#8e8877",
    flatShading: true,
    roughness: 0.97,
  });
  const metal = new MeshStandardMaterial({
    color: "#6d5d49",
    metalness: 0.42,
    roughness: 0.62,
  });
  // Double-sided so the flat signal pennant can share this material (and this
  // draw) with the warehouse roofs instead of costing one of its own.
  const accentMaterial = new MeshStandardMaterial({
    color: accent,
    flatShading: true,
    roughness: 0.86,
    side: DoubleSide,
  });

  // ---- Piers --------------------------------------------------------------
  // The plan decides the deck footprint; everything downstream (bollards,
  // ropes, lamps, crane) is placed against these same numbers.
  const deckParts: BufferGeometry[] = [];
  const headX = length * 0.56;
  pushGeometry(deckParts, createPierDeckGeometry(length, width, 0.42), length * 0.2, 0, 0);
  switch (plan) {
    case "t-head":
      pushGeometry(deckParts, createPierDeckGeometry(1.25, width * 2.4, 0.36), headX, 0, 0);
      break;
    case "l-quay":
      pushGeometry(
        deckParts,
        createPierDeckGeometry(1.15, width * 1.9, 0.36),
        headX,
        0,
        width * 0.72,
      );
      break;
    case "double-finger": {
      // A second finger pier running parallel, joined at the root.
      const offset = width * 1.85;
      pushGeometry(deckParts, createPierDeckGeometry(length * 0.78, width * 0.82, 0.38), length * 0.16, 0, offset);
      pushGeometry(deckParts, createPierDeckGeometry(0.9, offset, 0.36), -length * 0.16, 0, offset / 2);
      break;
    }
    case "mole":
      // Short timber pier: the mole itself (stone, below) carries this harbour.
      pushGeometry(deckParts, createPierDeckGeometry(1.0, width * 1.5, 0.36), headX * 0.8, 0, 0);
      break;
    case "wharf":
      pushGeometry(deckParts, createPierDeckGeometry(length * 0.5, width * 0.8, 0.36), length * 0.1, 0, -width * 1.5);
      break;
  }
  const deck = new Mesh(mergeGeometries(deckParts, false)!, timber);
  deck.name = "dock-deck";
  deck.castShadow = true;
  deck.receiveShadow = true;
  root.add(deck);

  // R12: pilings. The deck sits above the waterline, so without legs reaching
  // down into it the outlying chain platforms read as hovering slabs. One
  // instanced mesh carries every pile on the pier.
  root.add(createPierPilings(length, width, plan));

  // ---- Quay wall ----------------------------------------------------------
  // Cut stone at the seaward root of the pier, with a coping course and a
  // stepped face down to the waterline: the thing that makes a harbour read as
  // built rather than as a jetty dropped on the sea.
  const quayLength = (2.6 + supply * 3.4) * (plan === "mole" || plan === "wharf" ? 1.45 : 1);
  const quayWidth = width * (plan === "wharf" ? 3.1 : 2.15);
  const quayX = -length * 0.34;
  const quayParts: BufferGeometry[] = [];
  pushGeometry(quayParts, new BoxGeometry(quayLength, 0.92, quayWidth), quayX, 0.02, 0);
  pushGeometry(quayParts, new BoxGeometry(quayLength + 0.28, 0.16, quayWidth + 0.28), quayX, 0.54, 0);
  // Stepped face on the water side, so the wall has a section not a silhouette.
  for (let step = 0; step < 3; step += 1) {
    pushGeometry(
      quayParts,
      new BoxGeometry(quayLength - step * 0.5, 0.3, 0.26),
      quayX,
      -0.28 - step * 0.3,
      quayWidth / 2 + 0.13 + step * 0.2,
    );
  }
  // Mooring rings set into the coping.
  const quayStone = new Mesh(mergeGeometries(quayParts, false)!, stone);
  quayStone.name = "dock-quay-wall";
  quayStone.castShadow = true;
  quayStone.receiveShadow = true;
  root.add(quayStone);

  // ---- Warehouses ---------------------------------------------------------
  const warehouseCount = size >= 8 ? 3 : size >= 5 ? 2 : 1;
  const wallParts: BufferGeometry[] = [];
  const roofParts: BufferGeometry[] = [];
  const windowParts: BufferGeometry[] = [];
  // Roof pitch is a per-chain constant, so a harbour's roofline is part of how
  // it is recognised.
  const pitch = 0.3 + stableUnit(`dock-roof.${dock.chainId}`) * 0.26;
  for (let index = 0; index < warehouseCount; index += 1) {
    const bay = quayLength / warehouseCount;
    const x = quayX - quayLength / 2 + bay * (index + 0.5);
    const w = bay * 0.82;
    const d = quayWidth * 0.62;
    const h = 0.95 + stableUnit(`dock-warehouse.${dock.chainId}.${index}`) * 0.5;
    pushGeometry(wallParts, new BoxGeometry(w, h, d), x, 0.62 + h / 2, 0);
    // Gable roof: two rafters leaning to a ridge.
    for (const side of [-1, 1]) {
      const slope = new BoxGeometry(w + 0.16, 0.12, d * 0.56);
      slope.rotateX(side * pitch);
      slope.translate(x, 0.62 + h + Math.sin(pitch) * d * 0.15, side * d * 0.24);
      roofParts.push(slope);
    }
    pushGeometry(roofParts, new BoxGeometry(w + 0.24, 0.1, 0.14), x, 0.62 + h + Math.sin(pitch) * d * 0.3, 0);
    // Loading door and a warm window: the harbour is worked, not abandoned.
    pushGeometry(windowParts, new BoxGeometry(0.26, 0.3, 0.05), x, 0.62 + h * 0.55, d / 2 + 0.02);
  }
  const warehouses = new Mesh(mergeGeometries(wallParts, false)!, new MeshStandardMaterial({
    color: "#9f8c68",
    flatShading: true,
    roughness: 0.96,
  }));
  warehouses.name = "dock-warehouses";
  warehouses.castShadow = true;
  warehouses.receiveShadow = true;
  const signalShape = new Shape();
  signalShape.moveTo(0, 0);
  signalShape.lineTo(0.9, -0.27);
  signalShape.lineTo(0, -0.57);
  signalShape.closePath();
  const signal = new ShapeGeometry(signalShape);
  signal.translate(length * 0.52, 2.2, -width * 0.34);
  roofParts.push(signal);
  const roofs = new Mesh(mergeGeometries(roofParts, false)!, accentMaterial);
  roofs.name = "dock-warehouse-roofs";
  roofs.castShadow = true;
  root.add(warehouses, roofs);

  // ---- Deck planking ------------------------------------------------------
  // Planks run ACROSS the pier (athwart), which is how a real deck is laid and
  // what gives the pier a direction the eye can follow to its head.
  const plankCount = Math.max(10, Math.round(length * 2.6));
  const planks = new InstancedMesh(
    new BoxGeometry(0.1, 0.06, width * 0.94),
    new MeshStandardMaterial({ color: HARBOR_PALETTE.timber_dark, roughness: 0.95 }),
    plankCount,
  );
  planks.name = "dock-plank-relief";
  for (let index = 0; index < plankCount; index += 1) {
    const t = index / (plankCount - 1);
    const x = -length * 0.28 + t * length * 0.94;
    const lift = 0.235 + (stableUnit(`dock-plank.${dock.chainId}.${index}`) - 0.5) * 0.016;
    scratchMatrix.makeTranslation(x, lift, 0);
    planks.setMatrixAt(index, scratchMatrix);
  }
  planks.instanceMatrix.needsUpdate = true;
  fineDetail.add(planks);

  const pylonSpecs: { x: number; z: number }[] = [];
  for (const x of [-length * 0.2, length * 0.05, length * 0.3, headX]) {
    for (const z of [-width * 0.55, width * 0.55]) pylonSpecs.push({ x, z });
  }
  const pylons = new InstancedMesh(
    new CylinderGeometry(0.16, 0.2, 2.25, 6),
    new MeshStandardMaterial({ color: HARBOR_PALETTE.timber_dark, roughness: 1 }),
    pylonSpecs.length,
  );
  pylons.name = "dock-pylons";
  pylonSpecs.forEach((spec, index) => {
    scratchMatrix.makeTranslation(spec.x, -0.85, spec.z);
    pylons.setMatrixAt(index, scratchMatrix);
  });
  pylons.instanceMatrix.needsUpdate = true;
  fineDetail.add(pylons);

  // ---- Bollards and mooring ropes ----------------------------------------
  // Berth count follows the chain's supply band, so a big harbour visibly
  // moors more. Each bollard trails a catenary line to the berth line beside
  // the pier — the ropes tie to the harbour, not to individual hulls, because
  // hull transforms live in the batched fleet this module never sees.
  const berths = Math.max(3, Math.round(3 + supply * 7));
  const bollardSpecs: { x: number; z: number }[] = [];
  for (let index = 0; index < berths; index += 1) {
    const t = (index + 0.5) / berths;
    const x = -length * 0.24 + t * length * 0.88;
    bollardSpecs.push({ x, z: (index % 2 === 0 ? -1 : 1) * width * 0.52 });
  }
  const bollards = new InstancedMesh(
    new CylinderGeometry(0.1, 0.14, 0.44, 6),
    metal,
    bollardSpecs.length,
  );
  bollards.name = "dock-bollards";
  bollardSpecs.forEach((spec, index) => {
    scratchMatrix.makeTranslation(spec.x, 0.42, spec.z);
    bollards.setMatrixAt(index, scratchMatrix);
  });
  bollards.instanceMatrix.needsUpdate = true;
  fineDetail.add(bollards);

  const ropeParts: BufferGeometry[] = [];
  for (const spec of bollardSpecs) {
    ropeParts.push(...mooringRopeGeometry(spec.x, spec.z, Math.sign(spec.z)));
  }
  const ropes = new Mesh(
    mergeGeometries(ropeParts, false)!,
    new MeshStandardMaterial({ color: "#3d3327", roughness: 1 }),
  );
  ropes.name = "dock-mooring-ropes";
  fineDetail.add(ropes);

  // ---- Cargo --------------------------------------------------------------
  const crateCount = Math.max(2, Math.round(2 + supply * 8))
    + (signature === "crate-tower" ? 4 : 0);
  const crates = new InstancedMesh(
    new BoxGeometry(0.44, 0.4, 0.44),
    new MeshStandardMaterial({ color: "#8d623a", flatShading: true, roughness: 1 }),
    crateCount,
  );
  crates.name = "dock-crates";
  for (let index = 0; index < crateCount; index += 1) {
    const tier = Math.floor(index / 4);
    const column = index % 4;
    scratchMatrix.makeTranslation(
      quayX + quayLength * 0.16 + column * 0.5,
      0.7 + tier * 0.42,
      quayWidth * 0.3 + (stableUnit(`dock-crate.${dock.chainId}.${index}`) - 0.5) * 0.3,
    );
    crates.setMatrixAt(index, scratchMatrix);
  }
  crates.instanceMatrix.needsUpdate = true;
  fineDetail.add(crates);

  const barrelCount = Math.max(3, Math.round(supply * 9));
  const barrels = new InstancedMesh(
    new CylinderGeometry(0.16, 0.16, 0.36, 8),
    new MeshStandardMaterial({ color: "#6f5233", flatShading: true, roughness: 1 }),
    barrelCount,
  );
  barrels.name = "dock-barrels";
  for (let index = 0; index < barrelCount; index += 1) {
    scratchMatrix.makeTranslation(
      quayX - quayLength * 0.28 + (index % 5) * 0.36,
      0.68,
      -quayWidth * 0.3 - Math.floor(index / 5) * 0.36,
    );
    barrels.setMatrixAt(index, scratchMatrix);
  }
  barrels.instanceMatrix.needsUpdate = true;
  fineDetail.add(barrels);

  // ---- Posts, lamps, flagstaff -------------------------------------------
  const lampCount = amountScale > 1.0 ? 3 : 2;
  const lampLocals: { x: number; z: number; height: number }[] = [];
  for (let index = 0; index < lampCount; index += 1) {
    const x = length * (0.16 + (index / Math.max(1, lampCount - 1)) * 0.44);
    const z = index % 2 === 0 ? 0 : width * 0.34 * (index % 4 === 1 ? 1 : -1);
    lampLocals.push({ height: 1.62, x, z });
  }
  // Quay lanterns light the stonework too. Only the pier lamps are registered
  // as sea lanes (see gardenDockLampWorldPositions): the lane registry caps at
  // 48 across the whole world and ten harbours would swamp it.
  const quayLampLocals: { x: number; z: number; height: number }[] = [];
  for (let index = 0; index < warehouseCount + 1; index += 1) {
    const bay = quayLength / (warehouseCount + 1);
    quayLampLocals.push({
      height: 1.35,
      x: quayX - quayLength / 2 + bay * (index + 0.5),
      z: quayWidth * 0.42,
    });
  }
  const flagstaffHeight = 5.2 + supply * 2.2;
  const postSpecs: { x: number; z: number; height: number; radius: number }[] = [
    { height: 2.25, radius: 0.08, x: length * 0.52, z: -width * 0.35 }, // signal mast
    { height: flagstaffHeight, radius: 0.075, x: headX, z: width * 0.1 }, // flagstaff
    // Truck at the staff head — a squat cylinder in the shared post instance
    // rather than a mesh of its own.
    { height: 0.16, radius: 0.11, x: headX, z: width * 0.1 },
    ...lampLocals.map((lamp) => ({ ...lamp, radius: 0.09 })),
    ...quayLampLocals.map((lamp) => ({ ...lamp, radius: 0.075 })),
    ...signaturePostSpecs(signature, length, width),
  ];
  const posts = new InstancedMesh(
    new CylinderGeometry(1, 1.2, 1, 6),
    new MeshStandardMaterial({ color: "#5c4d3c", metalness: 0.24, roughness: 0.78 }),
    postSpecs.length,
  );
  posts.name = "dock-posts";
  postSpecs.forEach((spec, index) => {
    scratchMatrix.makeScale(spec.radius, spec.height, spec.radius);
    scratchMatrix.setPosition(spec.x, spec.height / 2 + 0.24, spec.z);
    posts.setMatrixAt(index, scratchMatrix);
  });
  posts.instanceMatrix.needsUpdate = true;
  root.add(posts);

  const lampMaterial = new MeshStandardMaterial({
    color: HARBOR_PALETTE.lantern_glow,
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity: 1.5,
    roughness: 0.25,
    toneMapped: false,
  });
  const allLamps = [...lampLocals, ...quayLampLocals];
  const lamps = new InstancedMesh(new SphereGeometry(0.21, 6, 4), lampMaterial, allLamps.length);
  lamps.name = "dock-lamp-heads";
  allLamps.forEach((lamp, index) => {
    scratchMatrix.makeTranslation(lamp.x, lamp.height + 0.3, lamp.z);
    lamps.setMatrixAt(index, scratchMatrix);
  });
  lamps.instanceMatrix.needsUpdate = true;
  root.add(lamps);

  if (windowParts.length > 0) {
    const windows = new Mesh(
      mergeGeometries(windowParts, false)!,
      new MeshStandardMaterial({
        color: HARBOR_PALETTE.lantern_glow,
        emissive: HARBOR_PALETTE.lantern_warm,
        emissiveIntensity: 1.6,
        roughness: 0.5,
        toneMapped: false,
      }),
    );
    windows.name = "dock-warehouse-windows";
    root.add(windows);
  }

  // ---- The chain flag -----------------------------------------------------
  const flag = createChainFlag(dock, accent, {
    height: flagstaffHeight,
    scale: 0.72 + supply * 0.4,
    x: headX,
    yaw: CAMERA_FACING_YAW - root.rotation.y,
    z: width * 0.1,
  });
  root.add(flag);

  // ---- Cranes and signature props ----------------------------------------
  if (size >= 4) {
    const crane = createHarborCrane(headX, width, supply, timber, metal);
    root.add(crane);
  }
  const signatureAccent = createSignatureAccent(signature, length, width, accent);
  if (signatureAccent) root.add(signatureAccent);

  const lampWorldPositions = lampLocals.map((lamp) =>
    localToWorldXZ(root, lamp.x, lamp.z),
  );

  return { dock, fineDetail, lampWorldPositions, plan, root, signature };
}

/**
 * World-space positions of a dock's lamp heads. The orchestrator registers
 * these with the sea-lane registry so each pier lamp lays a warm reflection.
 *
 * Deliberately only the 2-3 pier lamps, not the quay lanterns: the registry
 * caps at 48 lanes for the whole world, and ten harbours' worth of quay
 * lighting would evict the beacon and the island path.
 */
export function gardenDockLampWorldPositions(dock: DockVisual): { x: number; z: number }[] {
  return dock.lampWorldPositions;
}

/**
 * A gantry crane over the pier head: two raking legs, a jib, a counterweight,
 * and a hook block on its fall. Merged to one draw; the whole thing is static.
 */
function createHarborCrane(
  headX: number,
  width: number,
  supply: number,
  timberMaterial: MeshStandardMaterial,
  metalMaterial: MeshStandardMaterial,
): Group {
  const group = new Group();
  group.name = "dock-crane";
  const height = 2.9 + supply * 1.4;
  const frame: BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const leg = new BoxGeometry(0.14, height, 0.14);
    leg.rotateZ(side * 0.13);
    leg.translate(headX - side * 0.28, height / 2 + 0.24, side * width * 0.3);
    frame.push(leg);
  }
  // Cross brace and the head beam the jib pivots on.
  pushGeometry(frame, new BoxGeometry(0.11, 0.11, width * 0.66), headX, height * 0.52, 0);
  pushGeometry(frame, new BoxGeometry(0.16, 0.16, width * 0.72), headX, height + 0.24, 0);
  const jib = new BoxGeometry(2.3 + supply * 0.9, 0.14, 0.14);
  jib.rotateZ(-0.3);
  jib.translate(headX + 0.95, height + 0.5, 0);
  frame.push(jib);
  const crane = new Mesh(mergeGeometries(frame, false)!, timberMaterial);
  crane.castShadow = true;
  group.add(crane);

  const fittings: BufferGeometry[] = [];
  // Counterweight aft of the mast, hook block on its fall forward of it.
  pushGeometry(fittings, new BoxGeometry(0.34, 0.3, 0.34), headX - 0.62, height + 0.02, 0);
  pushGeometry(fittings, new BoxGeometry(0.03, 1.05, 0.03), headX + 1.85, height + 0.1, 0);
  pushGeometry(fittings, new BoxGeometry(0.22, 0.2, 0.22), headX + 1.85, height - 0.46, 0);
  const hook = new Mesh(mergeGeometries(fittings, false)!, metalMaterial);
  hook.castShadow = true;
  group.add(hook);
  return group;
}

/**
 * The pier-head flag. The cloth is a waved plane whose UVs are remapped onto
 * the chain's cell in the shared flag atlas, so ten harbours fly ten different
 * logos through one texture and one material.
 */
function createChainFlag(
  dock: DockNode,
  accent: Color,
  placement: { height: number; scale: number; x: number; yaw: number; z: number },
): Group {
  const group = new Group();
  group.name = "dock-chain-flag";
  const cell = assignGardenChainFlagCell(dock, accent);
  const texture = gardenChainFlagAtlas().texture;

  const flagWidth = 1.5 * placement.scale;
  const flagHeight = 1.0 * placement.scale;
  const geometry = new PlaneGeometry(flagWidth, flagHeight, 8, 3);
  // Cloth: a standing wave that deepens toward the fly, plus a slight droop,
  // so the flag reads as fabric at overview zoom rather than as a decal.
  const position = geometry.getAttribute("position");
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const along = (x + flagWidth / 2) / flagWidth;
    position.setZ(index, Math.sin(along * Math.PI * 1.7) * 0.13 * placement.scale * along);
    position.setY(index, position.getY(index) - along * along * 0.1 * placement.scale);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();

  if (cell >= 0 && texture) {
    const uv = geometry.getAttribute("uv");
    const { offsetX, offsetY, scale } = gardenChainFlagCellUv(cell);
    for (let index = 0; index < uv.count; index += 1) {
      uv.setXY(index, offsetX + uv.getX(index) * scale, offsetY + uv.getY(index) * scale);
    }
    uv.needsUpdate = true;
  }

  const material = new MeshStandardMaterial({
    color: cell >= 0 && texture ? "#ffffff" : accent,
    map: cell >= 0 ? texture : null,
    roughness: 0.82,
    side: DoubleSide,
  });
  const cloth = new Mesh(geometry, material);
  // Hoist edge against the staff, cloth flying to +X of it.
  cloth.position.set(flagWidth / 2 + 0.06, 0, 0);
  cloth.castShadow = true;

  const pivot = new Group();
  pivot.add(cloth);
  pivot.position.set(placement.x, placement.height - flagHeight * 0.75, placement.z);
  pivot.rotation.y = placement.yaw;
  group.add(pivot);

  return group;
}

/**
 * A mooring line: a catenary of short segments from a bollard out to the berth
 * line beside the pier, where a hull would take it up.
 */
function mooringRopeGeometry(x: number, z: number, side: number): BufferGeometry[] {
  const segments = 5;
  const reach = 1.5;
  const parts: BufferGeometry[] = [];
  const from = new Vector3(x, 0.6, z);
  const to = new Vector3(x + 0.35, WATER_LEVEL - GARDEN_DOCK_ROOT_Y + 0.28, z + side * reach);
  for (let index = 0; index < segments; index += 1) {
    const t0 = index / segments;
    const t1 = (index + 1) / segments;
    const a = catenaryPoint(from, to, t0);
    const b = catenaryPoint(from, to, t1);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const span = b.clone().sub(a);
    const segment = new BoxGeometry(0.035, 0.035, span.length());
    segment.rotateX(Math.atan2(-span.y, Math.hypot(span.x, span.z)));
    segment.rotateY(Math.atan2(span.x, span.z));
    segment.translate(mid.x, mid.y, mid.z);
    parts.push(segment);
  }
  return parts;
}

function catenaryPoint(from: Vector3, to: Vector3, t: number): Vector3 {
  const point = from.clone().lerp(to, t);
  point.y -= Math.sin(t * Math.PI) * 0.22;
  return point;
}

/** Applies a translation to a geometry and pushes it into a merge bucket. */
function pushGeometry(
  parts: BufferGeometry[],
  geometry: BufferGeometry,
  x: number,
  y: number,
  z: number,
): void {
  geometry.translate(x, y, z);
  parts.push(geometry);
}

// I2 mirror-basin extents (C2(b)): the calm mask spans the water between the
// composed harbor docks. The centre is their midpoint; the radii derive from
// the actual spread (half-spread + a berth margin) clamped so a single dock
// still gets a readable basin and a far-flung pair never stills the open sea.
const HARBOR_CALM_MARGIN_X = 5.5;
const HARBOR_CALM_MARGIN_Z = 4.5;
const HARBOR_CALM_MIN_RADIUS_X = 9;
const HARBOR_CALM_MIN_RADIUS_Z = 7;
const HARBOR_CALM_MAX_RADIUS_X = 18;
const HARBOR_CALM_MAX_RADIUS_Z = 13;
const HARBOR_CALM_STRENGTH = 0.75;

/**
 * Computes the harbor mirror-basin calm mask from the composed dock visuals.
 * Returns null when no harbor dock is composed (the water then keeps Lane W's
 * island-side default). The integrator feeds this to
 * `water.setHarborCalmMask(...)` in `registerHarborWater`.
 */
export function gardenHarborCalmMask(
  docks: readonly Pick<DockVisual, "root">[],
): GardenHarborCalmMask | null {
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
    center: { x: centerX / docks.length, z: centerZ / docks.length },
    radiusX: MathUtils.clamp((maxX - minX) / 2 + HARBOR_CALM_MARGIN_X, HARBOR_CALM_MIN_RADIUS_X, HARBOR_CALM_MAX_RADIUS_X),
    radiusZ: MathUtils.clamp((maxZ - minZ) / 2 + HARBOR_CALM_MARGIN_Z, HARBOR_CALM_MIN_RADIUS_Z, HARBOR_CALM_MAX_RADIUS_Z),
    calmStrength: HARBOR_CALM_STRENGTH,
  };
}

function signaturePostSpecs(
  signature: SignatureKind,
  length: number,
  width: number,
): { x: number; z: number; height: number; radius: number }[] {
  const head = length * 0.66;
  switch (signature) {
    case "derrick":
      return [
        { height: 2.7, radius: 0.1, x: head, z: -width * 0.32 },
        { height: 2.7, radius: 0.1, x: head, z: width * 0.32 },
      ];
    case "net-racks":
      return [
        { height: 1.5, radius: 0.08, x: head, z: -width * 0.4 },
        { height: 1.5, radius: 0.08, x: head, z: width * 0.4 },
      ];
    default:
      return [];
  }
}

function createSignatureAccent(
  signature: SignatureKind,
  length: number,
  width: number,
  accent: Color,
): Mesh | null {
  const head = length * 0.66;
  switch (signature) {
    case "arch": {
      // Banner arch standing across the pier head — the grand Ethereum gateway.
      const arch = new Mesh(
        new TorusGeometry(width * 0.72, 0.14, 5, 12, Math.PI),
        new MeshStandardMaterial({
          color: accent,
          emissive: accent,
          emissiveIntensity: 0.28,
          flatShading: true,
          roughness: 0.7,
        }),
      );
      arch.position.set(head, 0.26, 0);
      arch.rotation.y = Math.PI / 2;
      return arch;
    }
    case "derrick": {
      const beam = new Mesh(
        new BoxGeometry(0.16, 0.16, width * 0.72),
        new MeshStandardMaterial({ color: HARBOR_PALETTE.timber_warm, flatShading: true, roughness: 0.9 }),
      );
      beam.position.set(head, 2.66, 0);
      return beam;
    }
    case "net-racks": {
      const net = new Mesh(
        new BoxGeometry(0.06, 1.1, width * 0.78),
        new MeshStandardMaterial({
          color: HARBOR_PALETTE.sail_teal,
          flatShading: true,
          opacity: 0.55,
          roughness: 1,
          transparent: true,
        }),
      );
      net.position.set(head, 1.05, 0);
      return net;
    }
    case "dinghy": {
      const hull = new Mesh(
        new SphereGeometry(0.55, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
        new MeshStandardMaterial({ color: HARBOR_PALETTE.timber_warm, flatShading: true, roughness: 0.85 }),
      );
      hull.position.set(length * 0.3, 0.32, width * 0.85);
      hull.rotation.x = Math.PI;
      hull.rotation.z = 0.12;
      hull.scale.set(0.7, 0.6, 1.5);
      return hull;
    }
    default:
      return null;
  }
}

/** Deterministic per-harbor signature prop; Ethereum flies the grand arch. */
function signatureKind(dock: DockNode): SignatureKind {
  if (dock.chainId === "ethereum") return "arch";
  const index = Math.floor(stableUnit(`dock-signature.${dock.chainId}`) * SIGNATURE_KINDS.length);
  return SIGNATURE_KINDS[Math.min(index, SIGNATURE_KINDS.length - 1)] ?? "net-racks";
}

/** Deterministic per-harbor plan; Ethereum keeps the grand T-head. */
export function harborPlan(dock: DockNode): HarborPlan {
  if (dock.chainId === "ethereum") return "t-head";
  const index = Math.floor(stableUnit(`dock-plan.${dock.chainId}`) * HARBOR_PLANS.length);
  return HARBOR_PLANS[Math.min(index, HARBOR_PLANS.length - 1)] ?? "t-head";
}

/**
 * Blends the dock's health-band accent with a stable per-chain hue shift so
 * neighbouring harbors of the same health still read as different districts.
 */
function dockAccentColor(dock: DockNode): Color {
  const color = new Color(dockHealthAccent(dock.healthBand));
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  const shift = (stableUnit(`dock-hue.${dock.chainId}`) - 0.5) * 0.1;
  color.setHSL(
    (hsl.h + shift + 1) % 1,
    MathUtils.clamp(hsl.s * (0.75 + stableUnit(`dock-sat.${dock.chainId}`) * 0.5), 0.2, 0.85),
    // Lightness carries most of the per-chain identity so neighbouring docks of
    // the same health band still read as distinct districts at the overview.
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

/**
 * R12: the piles a pier stands on — paired down each side, following the deck
 * run, reaching from under the deck to below the waterline so the structure is
 * visibly supported rather than floating.
 *
 * One InstancedMesh for the whole pier: piles are the most repeated element in
 * a harbour and must not cost a draw call each.
 */
function createPierPilings(
  length: number,
  width: number,
  plan: HarborPlan,
): InstancedMesh<CylinderGeometry, MeshStandardMaterial> {
  const specs: { x: number; z: number }[] = [];
  const bays = Math.max(3, Math.round(length / 1.15));
  for (let bay = 0; bay <= bays; bay += 1) {
    const t = bay / bays;
    const x = -length * 0.28 + t * length * 0.96;
    specs.push({ x, z: -width * 0.34 });
    specs.push({ x, z: width * 0.34 });
  }
  if (plan === "double-finger") {
    const offset = width * 1.85;
    const fingerBays = Math.max(2, Math.round((length * 0.78) / 1.25));
    for (let bay = 0; bay <= fingerBays; bay += 1) {
      const x = -length * 0.22 + (bay / fingerBays) * length * 0.74;
      specs.push({ x, z: offset - width * 0.3 });
      specs.push({ x, z: offset + width * 0.3 });
    }
  }

  // Long enough to pass through the waterline and disappear into the shadow
  // under the deck; the exact depth is never seen, only the fact of it.
  const pileHeight = 2.6;
  const piles = new InstancedMesh(
    new CylinderGeometry(0.075, 0.095, pileHeight, 6),
    new MeshStandardMaterial({
      color: new Color(HARBOR_PALETTE.timber_dark).lerp(new Color(HARBOR_PALETTE.iron_dark), 0.45),
      flatShading: true,
      roughness: 0.95,
    }),
    specs.length,
  );
  piles.name = "dock-pilings";
  piles.castShadow = true;
  const matrix = new Matrix4();
  specs.forEach((spec, index) => {
    matrix.makeTranslation(spec.x, -pileHeight / 2 - 0.1, spec.z);
    piles.setMatrixAt(index, matrix);
  });
  piles.instanceMatrix.needsUpdate = true;
  return piles;
}

/** Rounded-end pier deck: one extruded rounded rectangle, one draw. */
function createPierDeckGeometry(
  length: number,
  width: number,
  thickness: number,
): ExtrudeGeometry {
  const radius = Math.min(width * 0.4, length * 0.18, 0.6);
  const shape = roundedRectShape(length, width, radius);
  const geometry = new ExtrudeGeometry(shape, {
    bevelEnabled: false,
    curveSegments: 1,
    depth: thickness,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -thickness / 2, 0);
  return geometry;
}

function roundedRectShape(w: number, h: number, r: number): Shape {
  const shape = new Shape();
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

function localToWorldXZ(root: Group, localX: number, localZ: number): { x: number; z: number } {
  const cos = Math.cos(root.rotation.y);
  const sin = Math.sin(root.rotation.y);
  return {
    x: root.position.x + localX * cos + localZ * sin,
    z: root.position.z - localX * sin + localZ * cos,
  };
}
