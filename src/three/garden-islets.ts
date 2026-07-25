import {
  Color,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from "three";
import type { PharosVilleRenderSchedulerTier } from "../renderer/render-types";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import type { GardenRippleRingEmitter } from "./garden-water-contract";
import { stableUnit, TILE_SCALE } from "./garden-util";
import { landWorldTile } from "../systems/map-scale";

/**
 * Z5 — Garden islets (Sakuteiki stone groupings in open water).
 *
 * Three small poetic islets break the open sea intentionally (composed ma,
 * not void), following the Sakuteiki rules: odd clusters, one dominant
 * vertical stone with subordinate horizontals, stones leaning toward each
 * other:
 * - "crane" (tile 28,8 — northern open water): a tall craggy dominant rock
 *   with two subordinate stones leaning in.
 * - "turtle" (tile 4,20 — western open water): a long low reef of five
 *   mostly-submerged backs in an arc.
 * - "lone" (tile 26,44 — the south-western quiet water between the Calm and
 *   Watch rings): one upright stone flanked by two low companions.
 *
 * All positions verified against the approved Z1 layout: open painted water,
 * clear of every zone ellipse, the island, and the harbor mirror basin.
 *
 * Rocks are clustered displaced icosahedra with a height-gradient vertex
 * color in the island rockwork style, but every color derives from
 * HARBOR_PALETTE (contract C1) — no hex literals. Two InstancedMesh batches
 * (crag + reef) = 2 draw calls. Purely decorative: no data semantics, no
 * labels, and hit-testing is DOM/projection-driven
 * (`src/renderer/hit-testing.ts`), so the islets are ignored by construction
 * (they register no hit targets and no entity cues).
 *
 * The islets are static; reduced motion needs no freeze. They join the tier
 * ladder at balanced+ (hidden at recovery/constrained). Each islet registers
 * a karesansui ripple ring through the C2(d) emitter — defensively, so the
 * module also works before Lane W's emitter is wired in.
 */

export interface GardenIsletSpec {
  /** Ripple-ring registration id (C2(d)). */
  id: string;
  /** Islet center in world XZ. */
  center: { x: number; z: number };
  /** Outer radius of the ripple train in world units. */
  ringRadius: number;
}

export interface GardenIsletsFrame {
  reducedMotion: boolean;
  tier: PharosVilleRenderSchedulerTier;
}

export interface GardenIslets {
  /** C4 evidence: instanced draw-call count (crag + reef batches). */
  drawCallCount: number;
  islets: readonly GardenIsletSpec[];
  root: Group;
  stoneCount: number;
  triangleCount: number;
  dispose: () => void;
  /** Defensive C2(d) registration: a no-op until the emitter is wired. */
  registerRippleRings: (emitter: GardenRippleRingEmitter | null | undefined) => void;
  removeRippleRings: (emitter: GardenRippleRingEmitter | null | undefined) => void;
  update: (frame: GardenIsletsFrame) => void;
}

// Wet-dark waterline stone climbing to a warm pale crown — the island
// rockwork ramp, re-derived from HARBOR_PALETTE instead of hex literals.
const STONE_WET = new Color(HARBOR_PALETTE.stone_dark).lerp(new Color(HARBOR_PALETTE.deep_sea_2), 0.35);
const STONE_MID = new Color(HARBOR_PALETTE.stone_mid);
const STONE_PALE = new Color(HARBOR_PALETTE.stone_pale).lerp(new Color(HARBOR_PALETTE.sun_day_warm), 0.28);

const scratchMatrix = new Matrix4();
const scratchPosition = new Vector3();
const scratchQuaternion = new Quaternion();
const scratchScale = new Vector3();
const Y_AXIS = new Vector3(0, 1, 0);

interface StonePlacement {
  /** World-space position (root stays at the origin). */
  position: [number, number, number];
  /** Lean toward the group's dominant stone (radians, Euler X/Z applied after Y). */
  leanX: number;
  leanZ: number;
  rotationY: number;
  scale: [number, number, number];
}

// N1: islet tiles are authored in design space; offset onto the enlarged grid
// so they track the same water the exclusion obstacles reserve for them.
const worldAt = (tileX: number, tileY: number): { x: number; z: number } => {
  const tile = landWorldTile({ x: tileX, y: tileY });
  return { x: tile.x * TILE_SCALE, z: tile.y * TILE_SCALE };
};

const CRANE = worldAt(28, 8);
const TURTLE = worldAt(4, 20);
const LONE = worldAt(26, 44);

export const GARDEN_ISLETS: readonly GardenIsletSpec[] = [
  { center: CRANE, id: "garden-islet.crane", ringRadius: 4.2 },
  { center: TURTLE, id: "garden-islet.turtle", ringRadius: 5.0 },
  { center: LONE, id: "garden-islet.lone", ringRadius: 3.6 },
];

// Sakuteiki groupings: the crane's subordinates lean toward the dominant
// stone; the turtle's backs arc and dip; the lone stone keeps two low
// companions so no grouping is even-numbered.
const CRAG_STONES: readonly StonePlacement[] = [
  // crane — dominant vertical
  { leanX: 0, leanZ: 0.06, position: [CRANE.x, GARDEN_WATER_Y - 0.6, CRANE.z], rotationY: 0.6, scale: [1.5, 3.4, 1.5] },
  // crane — subordinates leaning in
  { leanX: 0.1, leanZ: -0.22, position: [CRANE.x + 1.9, GARDEN_WATER_Y - 1.0, CRANE.z + 0.8], rotationY: 2.1, scale: [1.0, 1.6, 1.0] },
  { leanX: -0.08, leanZ: 0.26, position: [CRANE.x - 1.6, GARDEN_WATER_Y - 1.05, CRANE.z - 0.9], rotationY: 4.4, scale: [0.8, 1.2, 0.8] },
  // lone — upright companioned stone
  { leanX: 0.04, leanZ: -0.1, position: [LONE.x, GARDEN_WATER_Y - 0.8, LONE.z], rotationY: 1.3, scale: [1.1, 1.9, 1.1] },
];

const REEF_STONES: readonly StonePlacement[] = [
  // turtle — five low backs in an arc, the long horizontal counterweight;
  // y offsets keep the backs just breaking the surface (middle highest).
  { leanX: 0, leanZ: 0.04, position: [TURTLE.x - 3.1, GARDEN_WATER_Y - 0.3, TURTLE.z + 1.1], rotationY: 0.4, scale: [2.0, 0.55, 1.2] },
  { leanX: 0.03, leanZ: -0.05, position: [TURTLE.x - 1.5, GARDEN_WATER_Y - 0.22, TURTLE.z + 0.2], rotationY: 1.8, scale: [2.4, 0.72, 1.4] },
  { leanX: -0.02, leanZ: 0.03, position: [TURTLE.x + 0.1, GARDEN_WATER_Y - 0.18, TURTLE.z - 0.3], rotationY: 3.3, scale: [2.2, 0.8, 1.3] },
  { leanX: 0.05, leanZ: -0.04, position: [TURTLE.x + 1.8, GARDEN_WATER_Y - 0.26, TURTLE.z + 0.1], rotationY: 5.1, scale: [1.9, 0.62, 1.1] },
  { leanX: -0.04, leanZ: 0.05, position: [TURTLE.x + 3.2, GARDEN_WATER_Y - 0.34, TURTLE.z + 0.9], rotationY: 2.6, scale: [1.6, 0.5, 1.0] },
  // lone — two low companions
  { leanX: 0.06, leanZ: 0.12, position: [LONE.x + 1.7, GARDEN_WATER_Y - 0.28, LONE.z + 0.7], rotationY: 0.9, scale: [1.4, 0.55, 1.0] },
  { leanX: -0.05, leanZ: -0.1, position: [LONE.x - 1.5, GARDEN_WATER_Y - 0.32, LONE.z - 0.6], rotationY: 3.9, scale: [1.2, 0.5, 0.9] },
];

/**
 * Displaced icosahedron with a height-gradient vertex color: wet-dark base to
 * warm pale crown, matching the island rockwork technique
 * (`garden-island.ts`'s `displacedBoulderGeometry`). Deterministic via
 * `stableUnit`.
 */
function createStoneGeometry(seed: string, craggy: number): IcosahedronGeometry {
  const geometry = new IcosahedronGeometry(1, 1);
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const color = new Color();
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const displace = 1
      + (stableUnit(`${seed}.${Math.round(x * 20)}.${Math.round(y * 20)}.${Math.round(z * 20)}`) - 0.5) * craggy;
    positions.setX(index, x * displace);
    positions.setY(index, Math.max(y * displace, -0.72));
    positions.setZ(index, z * displace);
    const t = Math.max(0, Math.min(1, (y + 1) / 2));
    if (t < 0.5) color.copy(STONE_WET).lerp(STONE_MID, t / 0.5);
    else color.copy(STONE_MID).lerp(STONE_PALE, (t - 0.5) / 0.5);
    // Baked AO: the waterline reads darker than the crown.
    color.multiplyScalar(0.72 + 0.28 * t);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  positions.needsUpdate = true;
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createStoneBatch(stones: readonly StonePlacement[], seed: string, craggy: number): {
  mesh: InstancedMesh;
  triangles: number;
} {
  const geometry = createStoneGeometry(seed, craggy);
  const mesh = new InstancedMesh(
    geometry,
    new MeshStandardMaterial({ flatShading: true, roughness: 0.96, vertexColors: true }),
    stones.length,
  );
  for (const [index, stone] of stones.entries()) {
    scratchPosition.set(...stone.position);
    scratchQuaternion.setFromAxisAngle(Y_AXIS, stone.rotationY);
    scratchScale.set(...stone.scale);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    // Lean after the yaw: stones tip toward each other, not away.
    scratchMatrix.multiply(new Matrix4().makeRotationX(stone.leanX));
    scratchMatrix.multiply(new Matrix4().makeRotationZ(stone.leanZ));
    mesh.setMatrixAt(index, scratchMatrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  // IcosahedronGeometry is non-indexed: count triangles from positions.
  const geometryTriangles = (geometry.getIndex()?.count ?? geometry.getAttribute("position").count) / 3;
  return { mesh, triangles: geometryTriangles * stones.length };
}

export function createGardenIslets(): GardenIslets {
  const root = new Group();
  root.name = "garden-islets";

  const crag = createStoneBatch(CRAG_STONES, "islet-crag", 0.5);
  crag.mesh.name = "garden-islets-crag";
  const reef = createStoneBatch(REEF_STONES, "islet-reef", 0.42);
  reef.mesh.name = "garden-islets-reef";
  root.add(crag.mesh, reef.mesh);

  return {
    drawCallCount: 2,
    islets: GARDEN_ISLETS,
    root,
    stoneCount: CRAG_STONES.length + REEF_STONES.length,
    triangleCount: crag.triangles + reef.triangles,
    dispose() {
      crag.mesh.dispose();
      reef.mesh.dispose();
    },
    registerRippleRings(emitter) {
      if (!emitter || typeof emitter.setRing !== "function") return;
      for (const islet of GARDEN_ISLETS) {
        emitter.setRing({
          bands: 2,
          center: islet.center,
          id: islet.id,
          periodSeconds: 9 + stableUnit(`${islet.id}.period`) * 3,
          radius: islet.ringRadius,
          strength: 0.32,
        });
      }
    },
    removeRippleRings(emitter) {
      if (!emitter || typeof emitter.removeRing !== "function") return;
      for (const islet of GARDEN_ISLETS) emitter.removeRing(islet.id);
    },
    update(frame) {
      // Tier ladder: decorative beauty layer at balanced+; recovery and
      // constrained keep plain open water. The islets never animate, so
      // reduced motion needs no freeze (frame.reducedMotion is accepted for
      // contract symmetry with the other garden modules).
      void frame.reducedMotion;
      root.visible = frame.tier === "full" || frame.tier === "balanced";
    },
  };
}
