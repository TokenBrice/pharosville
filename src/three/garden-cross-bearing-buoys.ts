import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { HARBOR_PALETTE } from "../systems/palette";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import { stableUnit } from "./garden-util";

/**
 * 3b — the cross-bearing buoy.
 *
 * `pegSummary.coins[].dexPriceCheck` has been arriving in the browser and
 * driving nothing at all — not even a panel row. It is the fleet's only second
 * opinion on a price: the consensus feed says one thing, the coin's own DEX
 * pools say another, and when the two cross, one of them is behind. That is
 * what the first minutes of a depeg look like from the outside, and until now
 * it was invisible everywhere.
 *
 * In surveying, taking a second bearing on the same object from a different
 * station is called a cross-bearing, and where the two lines fail to meet you
 * mark the water rather than pick a winner. So: a small striped can-buoy at the
 * berth, with a crossed topmark. It reports a disagreement between instruments.
 * It does not accuse the coin of anything, which is why nothing here is red,
 * amber, or lit — black and bone-white, the colours of a survey mark.
 *
 * ## Cost
 *
 * One InstancedMesh over one merged, vertex-coloured geometry: ONE draw call
 * for the whole fleet's buoys, however many cross. At the measured 620-693
 * calls against a 700 ceiling that is the only shape this feature could take —
 * a mesh per ship at ~187 hulls was never on the table. Nothing is built at all
 * when no coin's bearings cross, which is the ordinary case.
 *
 * Static in every respect: the buoy is moored, so there is no motion to freeze
 * under reduced motion and no per-frame work of any kind.
 */

/** One buoy: which ship it belongs to, and how far off that hull it rides. */
export interface CrossBearingBuoySpec {
  /** Ship detail id — carried so a future hit-target pass can find these. */
  detailId: string;
  /**
   * The ship's own selection radius. A titan's footprint is nearly three times
   * a skiff's, so a fixed stand-off would either bury the buoy inside the big
   * hulls or leave it adrift beside the small ones.
   */
  hullRadius: number;
}

export interface GardenCrossBearingBuoys {
  readonly root: Group;
  /** How many buoys are actually moored. */
  readonly count: number;
  dispose(): void;
  /**
   * Put buoy `index` alongside a hull at `worldX`/`worldZ`. The stand-off
   * bearing and distance are fixed per ship; only the hull's position moves.
   */
  place(index: number, worldX: number, worldZ: number): void;
  /** One buffer upload for every buoy placed since the last flush. */
  flush(): void;
}

/**
 * Buoy proportions. The silhouette law says a feature under ~0.7 units of
 * clearance does not read at overview zoom, so the body alone clears that and
 * the topmark carries it past 1.6 — a buoy that cannot be seen beside a hull
 * is not a cue, it is a rounding error in the draw-call budget.
 */
const BODY_RADIUS = 0.3;
const BODY_HEIGHT = 0.95;
const BAND_HEIGHT = 0.26;
const STAFF_RADIUS = 0.055;
const STAFF_HEIGHT = 0.6;
const TOPMARK_ARM = 0.34;
const TOPMARK_THICKNESS = 0.075;
/** Clear of the hull's own footprint, so the buoy reads as moored beside the
    ship rather than sitting on it or drifting off into open water. */
const HULL_CLEARANCE = 0.9;

// Survey-mark colours: iron for the body, bone-white for the bands. Nothing
// from the warning end of the palette — a crossed bearing is an instrument
// disagreement, and the moment this goes amber it starts reading as a verdict
// on the coin.
const IRON = new Color(HARBOR_PALETTE.iron_dark);
const BONE = new Color(HARBOR_PALETTE.foam_white);

/**
 * The buoy, as one geometry.
 *
 * Stripes are baked as vertex colours rather than drawn from a texture: a
 * texture would be a second material and therefore a second draw call, and at
 * this size the bands are three flat rings, which is exactly what vertex
 * colours are for.
 */
function createBuoyGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  const paint = (geometry: BufferGeometry, color: Color): BufferGeometry => {
    const count = geometry.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    return geometry;
  };

  // Three courses: iron, bone, iron. The banding is the read — an unbanded can
  // at this size is indistinguishable from the zone marker buoys already in the
  // water, and those mean something else entirely.
  const courses: Array<[number, number, Color]> = [
    [0, BAND_HEIGHT, IRON],
    [BAND_HEIGHT, BAND_HEIGHT, BONE],
    [BAND_HEIGHT * 2, BODY_HEIGHT - BAND_HEIGHT * 2, IRON],
  ];
  for (const [base, height, color] of courses) {
    const course = new CylinderGeometry(BODY_RADIUS, BODY_RADIUS, height, 8, 1, true);
    course.translate(0, base + height / 2, 0);
    parts.push(paint(course, color));
  }
  // Closed cap, so the can does not read as an open pipe from the fixed high
  // camera — which is the angle it is always seen from.
  const cap = new CylinderGeometry(BODY_RADIUS, BODY_RADIUS, 0.06, 8);
  cap.translate(0, BODY_HEIGHT, 0);
  parts.push(paint(cap, BONE));

  const staff = new CylinderGeometry(STAFF_RADIUS, STAFF_RADIUS, STAFF_HEIGHT, 6);
  staff.translate(0, BODY_HEIGHT + STAFF_HEIGHT / 2, 0);
  parts.push(paint(staff, IRON));

  // The topmark: two slats crossed into an X — the surveyor's mark for a
  // bearing taken twice, and a silhouette nothing else in this world uses.
  for (const turn of [Math.PI / 4, -Math.PI / 4]) {
    const slat = new CylinderGeometry(TOPMARK_THICKNESS, TOPMARK_THICKNESS, TOPMARK_ARM * 2, 4);
    slat.rotateZ(turn);
    slat.translate(0, BODY_HEIGHT + STAFF_HEIGHT, 0);
    parts.push(paint(slat, BONE));
  }

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error("cross-bearing buoy geometry failed to merge");
  return merged;
}

export function createGardenCrossBearingBuoys(
  specs: readonly CrossBearingBuoySpec[],
): GardenCrossBearingBuoys {
  const root = new Group();
  root.name = "garden-cross-bearing-buoys";
  if (specs.length === 0) {
    // Nothing built at all, so an ordinary afternoon where every coin's two
    // bearings line up costs exactly zero draw calls.
    return { root, count: 0, dispose() {}, place() {}, flush() {} };
  }

  const geometry = createBuoyGeometry();
  const material = new MeshStandardMaterial({
    flatShading: true,
    roughness: 0.82,
    vertexColors: true,
  });
  const mesh = new InstancedMesh(geometry, material, specs.length);
  mesh.name = "cross-bearing-buoys";
  mesh.castShadow = true;

  // Stand-off per buoy, fixed at build time. The bearing is derived from the
  // ship's id, so two ships sharing a stretch of water never stack their buoys
  // on the same side, and a data refresh puts each buoy back exactly where it
  // was instead of teleporting it round its hull.
  const standOff = specs.map((spec) => {
    const bearing = stableUnit(`cross-bearing-buoy.${spec.detailId}`) * Math.PI * 2;
    const distance = spec.hullRadius + HULL_CLEARANCE;
    return {
      bearing,
      dx: Math.cos(bearing) * distance,
      dz: Math.sin(bearing) * distance,
    };
  });

  const dummy = new Object3D();
  let dirty = false;
  const place = (index: number, worldX: number, worldZ: number): void => {
    const offset = standOff[index];
    if (!offset) return;
    dummy.position.set(worldX + offset.dx, GARDEN_WATER_Y, worldZ + offset.dz);
    // A moored can leans on its chain; a perfectly upright one reads as a post.
    dummy.rotation.set(0.07, offset.bearing, 0.05);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    dirty = true;
  };

  // Composed once so every instance has a valid matrix before the first frame;
  // the renderer overwrites them from the hulls' own positions each frame.
  for (let index = 0; index < specs.length; index += 1) place(index, 0, 0);
  mesh.instanceMatrix.needsUpdate = true;
  // Instances are scattered across the whole map, so the geometry-derived
  // bounding sphere would cull them all the moment the origin left frame.
  mesh.frustumCulled = false;
  root.add(mesh);

  return {
    root,
    count: specs.length,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
    place,
    flush() {
      if (!dirty) return;
      mesh.instanceMatrix.needsUpdate = true;
      dirty = false;
    },
  };
}
