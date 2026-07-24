import {
  BoxGeometry,
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
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
} from "three";
import {
  GARDEN_DOCK_ROOT_Y,
  GARDEN_WATER_Y as WATER_LEVEL,
} from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import type { DockNode } from "../systems/world-types";
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

export interface DockVisual {
  dock: DockNode;
  fineDetail: Group;
  /** World-space lamp positions (post tops) for sea-lane registration. */
  lampWorldPositions: { x: number; z: number }[];
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

  const timber = new MeshStandardMaterial({
    color: HARBOR_PALETTE.timber_mid,
    roughness: 0.88,
  });
  const pier = new Mesh(createPierDeckGeometry(length, width, 0.42), timber);
  pier.position.x = length * 0.2;
  root.add(pier);
  const crossPier = new Mesh(
    createPierDeckGeometry(1.25, width * 2.25, 0.36),
    timber,
  );
  crossPier.position.x = length * 0.56;
  root.add(crossPier);

  // Thin instanced plank strips give the deck relief without a per-plank draw.
  const plankCount = 6;
  const planks = new InstancedMesh(
    new BoxGeometry(0.12, 0.05, width * 0.9),
    new MeshStandardMaterial({ color: HARBOR_PALETTE.timber_dark, roughness: 0.95 }),
    plankCount,
  );
  planks.name = "dock-plank-relief";
  for (let index = 0; index < plankCount; index += 1) {
    const x = -length * 0.28 + (index / (plankCount - 1)) * length * 0.92;
    scratchMatrix.makeTranslation(x, 0.235, 0);
    planks.setMatrixAt(index, scratchMatrix);
  }
  planks.instanceMatrix.needsUpdate = true;
  fineDetail.add(planks);

  const pylons = new InstancedMesh(
    new CylinderGeometry(0.16, 0.2, 2.25, 6),
    new MeshStandardMaterial({ color: HARBOR_PALETTE.timber_dark, roughness: 1 }),
    6,
  );
  let pylonIndex = 0;
  for (const x of [-length * 0.2, length * 0.18, length * 0.55]) {
    for (const z of [-width * 0.55, width * 0.55]) {
      scratchMatrix.makeTranslation(x, -0.85, z);
      pylons.setMatrixAt(pylonIndex, scratchMatrix);
      pylonIndex += 1;
    }
  }
  pylons.instanceMatrix.needsUpdate = true;
  fineDetail.add(pylons);

  const bollards = new InstancedMesh(
    new CylinderGeometry(0.1, 0.14, 0.44, 6),
    new MeshStandardMaterial({
      color: "#6d5d49",
      metalness: 0.42,
      roughness: 0.62,
    }),
    4,
  );
  let bollardIndex = 0;
  for (const x of [-length * 0.18, length * 0.54]) {
    for (const z of [-width * 0.52, width * 0.52]) {
      scratchMatrix.makeTranslation(x, 0.42, z);
      bollards.setMatrixAt(bollardIndex, scratchMatrix);
      bollardIndex += 1;
    }
  }
  bollards.instanceMatrix.needsUpdate = true;
  fineDetail.add(bollards);

  // Above-deck timber posts: signal mast, lamp posts, and any signature-prop
  // uprights share one instanced draw. Each entry carries its own height/radius
  // scale so a single unit cylinder covers every pole.
  const lampCount = amountScale > 1.0 ? 3 : 2;
  const lampLocals: { x: number; z: number; height: number }[] = [];
  for (let index = 0; index < lampCount; index += 1) {
    const x = length * (0.16 + (index / Math.max(1, lampCount - 1)) * 0.44);
    const z = index % 2 === 0 ? 0 : width * 0.34 * (index % 4 === 1 ? 1 : -1);
    lampLocals.push({ height: 1.62, x, z });
  }
  const postSpecs: { x: number; z: number; height: number; radius: number }[] = [
    { height: 2.25, radius: 0.08, x: length * 0.52, z: -width * 0.35 }, // signal mast
    ...lampLocals.map((lamp) => ({ ...lamp, radius: 0.09 })),
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

  // Warm lamp heads — one instanced draw, blooms at night.
  const lampMaterial = new MeshStandardMaterial({
    color: HARBOR_PALETTE.lantern_glow,
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity: 1.5,
    roughness: 0.25,
    toneMapped: false,
  });
  const lamps = new InstancedMesh(new SphereGeometry(0.21, 6, 4), lampMaterial, lampCount);
  lamps.name = "dock-lamp-heads";
  lampLocals.forEach((lamp, index) => {
    scratchMatrix.makeTranslation(lamp.x, lamp.height + 0.3, lamp.z);
    lamps.setMatrixAt(index, scratchMatrix);
  });
  lamps.instanceMatrix.needsUpdate = true;
  root.add(lamps);

  // Signal pennant carries the per-dock accent (health band + per-chain hue).
  const signalShape = new Shape();
  signalShape.moveTo(0, 0);
  signalShape.lineTo(0.9, -0.27);
  signalShape.lineTo(0, -0.57);
  signalShape.closePath();
  const signal = new Mesh(
    new ShapeGeometry(signalShape),
    new MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 0.12,
      side: DoubleSide,
    }),
  );
  signal.position.set(length * 0.52, 2.2, -width * 0.34);
  root.add(signal);

  const storehouse = new Group();
  storehouse.position.set(-length * 0.2, 0.3, 0);
  const storehouseWalls = new Mesh(
    new BoxGeometry(1.7, 0.88, Math.max(1.35, width * 0.86)),
    new MeshStandardMaterial({
      color: "#9f8c68",
      flatShading: true,
      roughness: 0.96,
    }),
  );
  storehouseWalls.position.y = 0.44;
  const storehouseRoof = new Mesh(
    new BoxGeometry(2, 0.2, Math.max(1.58, width)),
    new MeshStandardMaterial({
      color: accent,
      flatShading: true,
      roughness: 0.88,
    }),
  );
  storehouseRoof.position.y = 0.98;
  storehouseRoof.rotation.z = -0.06;
  // Small warm window, lit from within — a bloom source at night.
  const storehouseWindow = new Mesh(
    new BoxGeometry(0.3, 0.34, 0.06),
    new MeshStandardMaterial({
      color: HARBOR_PALETTE.lantern_glow,
      emissive: HARBOR_PALETTE.lantern_warm,
      emissiveIntensity: 1.6,
      roughness: 0.5,
      toneMapped: false,
    }),
  );
  storehouseWindow.position.set(0.86, 0.46, 0);
  storehouse.add(storehouseWalls, storehouseRoof, storehouseWindow);
  root.add(storehouse);

  // Crate density reads backing diversity; a crate-tower signature stacks more.
  const baseCrateCount = dock.backingDiversity == null
    ? 0
    : dock.backingDiversity < 0.35
      ? 3
      : dock.backingDiversity < 0.55
        ? 2
        : 0;
  const crateCount = signature === "crate-tower"
    ? Math.max(4, baseCrateCount + 3)
    : baseCrateCount;
  if (crateCount > 0) {
    const crates = new InstancedMesh(
      new BoxGeometry(0.46, 0.4, 0.46),
      new MeshStandardMaterial({
        color: "#8d623a",
        flatShading: true,
        roughness: 1,
      }),
      crateCount,
    );
    crates.name = "dock-crates";
    for (let index = 0; index < crateCount; index += 1) {
      const tier = signature === "crate-tower" ? Math.floor(index / 3) : 0;
      const column = signature === "crate-tower" ? index % 3 : index;
      scratchMatrix.makeTranslation(
        length * 0.22 + column * 0.48,
        0.42 + tier * 0.42,
        width * 0.3,
      );
      crates.setMatrixAt(index, scratchMatrix);
    }
    crates.instanceMatrix.needsUpdate = true;
    fineDetail.add(crates);
  }

  const signatureAccent = createSignatureAccent(signature, length, width, accent);
  if (signatureAccent) root.add(signatureAccent);

  const lampWorldPositions = lampLocals.map((lamp) =>
    localToWorldXZ(root, lamp.x, lamp.z),
  );

  return { dock, fineDetail, lampWorldPositions, root, signature };
}

/**
 * World-space positions of a dock's lamp heads. The orchestrator registers
 * these with the sea-lane registry so each pier lamp lays a warm reflection.
 */
export function gardenDockLampWorldPositions(dock: DockVisual): { x: number; z: number }[] {
  return dock.lampWorldPositions;
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
    case "crane":
      return [{ height: 3.1, radius: 0.13, x: head, z: 0 }];
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
    case "crane": {
      const jib = new Mesh(
        new BoxGeometry(1.9, 0.16, 0.16),
        new MeshStandardMaterial({ color: HARBOR_PALETTE.timber_warm, flatShading: true, roughness: 0.9 }),
      );
      jib.position.set(head + 0.62, 3.02, 0);
      jib.rotation.z = -0.32;
      return jib;
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
