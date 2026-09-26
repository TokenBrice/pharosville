import {
  BufferAttribute,
  BufferGeometry,
  Box3,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { HARBOR_PALETTE } from "../systems/palette";
import {
  REST_SEAT_EYE_HEIGHT,
  REST_SEAT_EYE_LANDSCAPE,
  REST_SEAT_PITCH_RAD,
  REST_SEAT_VFOV_DEG,
  REST_SEAT_YAW_RAD,
} from "../systems/rest-seat";
import type { WeatherPlan } from "../systems/weather";
import {
  patchGardenFloraNight,
  patchGardenInstancedWindSway,
  updateGardenInstancedWindSway,
} from "./garden-flora";
import { patchGardenToroKindling } from "./garden-lanterns";
import { createNiwakiPine, type NiwakiBranchSpec } from "./garden-niwaki";
import { disposeThreeObjectTree, stableUnit } from "./garden-util";

/**
 * The threshold (plan W1.5, ruling K2): the viewer's near garden at rest seat C.
 *
 * From the south-shore seat the bottom quarter of the frame used to look past
 * the plate edge at open ocean (≈35 / 42 / 27 / 12 % at 1600×1000 / 1200×640 /
 * 900×720 / 720×900). The threshold is the land you sit on: the engawa's
 * cedar deck edge across the bottom band, a dark moss bank falling away to a
 * brow that lands on the south rim beyond, a rooted kuromatsu at the lower
 * left whose lowest pad crosses the upper-left edge above eye height (seen
 * from below), a small stone tōrō past the deck edge, and — off frame — the
 * eave and tea-house behind the seat and a cedar grove behind-right of it
 * that keep the threshold in shade from 10:00 to sunset.
 *
 * Authored in the seat frame: x = right, y = world height, −z = forward, the
 * origin on the water plane under the landscape rest eye; the geometry is
 * turned to world axes once (yaw 31°) and `root` sits at the seat, so the
 * whole threshold follows the eye with one `setEyeOffset` write while the
 * rest pose breathes (the corner composition then moves only by the breath's
 * rotation). The tall 720×900 eye sits 10.95 u to the right on the same deck
 * and sees its own companion pine.
 *
 * Decorative only: carries no meaning (visual-cue-registry `engawaForeground`),
 * is never raycast, and its bank silhouette stays below the lowest navigable
 * water in every rest frame so it covers no hull.
 */

export const GARDEN_THRESHOLD_NAME = "garden-threshold";
const GARDEN_THRESHOLD_LAND_NAME = "garden-threshold-land";
const GARDEN_THRESHOLD_ENGAWA_NAME = "garden-threshold-engawa";
const GARDEN_THRESHOLD_PINES_NAME = "garden-threshold-pines";

/** Deck top: the seated eye is 1.28 u above the boards; the edge fills the bottom ≈ 6 % of the frame. */
const DECK_TOP = REST_SEAT_EYE_HEIGHT - 1.28;
/** Forward distance of the deck's front edge from the landscape eye. */
const DECK_EDGE_FORWARD = 4.3;
const DECK_BACK = -2.5;
const DECK_LEFT = -4.5;
const DECK_RIGHT = 16;
/** Ground under and around the veranda. */
const PLATEAU = DECK_TOP - 0.4;
/** The bank starts to fall just past the deck edge. */
const BANK_START = 4.9;

/** Seat-frame (forward, right) → world xz. */
function seatToWorld(forward: number, right: number, y: number, target = new Vector3()): Vector3 {
  const sin = Math.sin(REST_SEAT_YAW_RAD);
  const cos = Math.cos(REST_SEAT_YAW_RAD);
  return target.set(
    REST_SEAT_EYE_LANDSCAPE.world.x - forward * sin + right * cos,
    y,
    REST_SEAT_EYE_LANDSCAPE.world.z - forward * cos - right * sin,
  );
}

// Brow of the bank. The brow is the bank's silhouette from the seat, and it is
// authored where it must land on screen: for each bearing a = right/forward
// from the landscape eye (the 1600×1000 column u = ½ + a / 2·tan(hfov/2)), the
// frame row the brow projects to. Each knot sits as high as the nearest
// navigable water allows (the bank hides no 3 u hull at any gate or breath
// extreme, so as little lit rim shore as possible shows between brow and sea)
// and above the first ray past the plate edge (no outer ocean in the bottom
// quarter), measured at 1600×1000, 1200×640 and 900×720 from the landscape
// eye; the tall eye's frame is checked against the same land.
const BROW_ROW_KNOTS: ReadonlyArray<readonly [bearing: number, row: number]> = [
  [-1.2, 0.62], [-0.54, 0.672], [-0.459, 0.7], [-0.367, 0.717], [-0.275, 0.75], [-0.184, 0.762],
  [-0.092, 0.775], [0, 0.795], [0.092, 0.804], [0.184, 0.825], [0.275, 0.85], [0.367, 0.87], [0.46, 0.89], [1.4, 0.93],
];
/** Forward distance of the brow from the landscape eye across the framed arc. */
const BROW_FORWARD = 30;
/** Beyond every rest frame on the right the bank runs out as a promontory under the grove. */
const PROMONTORY_FORWARD = 52;
const PROMONTORY_HEIGHT = 7;
const TAN_HALF_VFOV = Math.tan((REST_SEAT_VFOV_DEG * Math.PI) / 360);

function browRow(bearing: number): number {
  for (let index = 1; index < BROW_ROW_KNOTS.length; index += 1) {
    const [b1, v1] = BROW_ROW_KNOTS[index]!;
    if (bearing <= b1) {
      const [b0, v0] = BROW_ROW_KNOTS[index - 1]!;
      return v0 + (v1 - v0) * Math.max(0, (bearing - b0) / (b1 - b0));
    }
  }
  return BROW_ROW_KNOTS[BROW_ROW_KNOTS.length - 1]![1];
}

/**
 * The brow on `bearing`: the framed arc puts it at `browRow` from the rest eye
 * and pitch; past bearing 0.62 (outside every rest frame, both eyes) it runs
 * out to the grove's promontory.
 */
function browAt(bearing: number): { forward: number; height: number } {
  const below = Math.atan((2 * browRow(bearing) - 1) * TAN_HALF_VFOV) + REST_SEAT_PITCH_RAD;
  const framed = REST_SEAT_EYE_HEIGHT - BROW_FORWARD * Math.tan(below);
  const out = Math.min(1, Math.max(0, (bearing - 0.62) / 0.13));
  return {
    forward: BROW_FORWARD + (PROMONTORY_FORWARD - BROW_FORWARD) * out,
    // A soft, irregular brow: two slow undulations, ≤ ±0.3 u (≤ ±0.02 of the frame).
    height: framed + (PROMONTORY_HEIGHT - framed) * out
      + (Math.sin(bearing * 19 + 0.6) * 0.17 + Math.sin(bearing * 47 + 2.1) * 0.1) * (1 - out),
  };
}

/**
 * A moss shoulder below the deck in front of the tall seat. From the tall eye
 * (10.95 u right) the brow alone would leave a sliver of outer sea between
 * the deck edge and the rim when the breath lowers the eye; this low swell
 * fills that band. It lies at bearings > 0.7, outside every landscape frame.
 */
const TALL_SHOULDER = { forward: 8.6, right: 9.3, rise: 0.8, radiusForward: 3, radiusRight: 2.6 } as const;

/**
 * Threshold ground height in the seat frame. Level under the veranda; past
 * the deck edge the bank falls steeply, then eases (concave) onto the brow so
 * the brow, not the near slope, is the silhouette; past the brow it rolls
 * over and drops out of sight to the water.
 */
function thresholdHeight(forward: number, right: number): number {
  if (forward <= BANK_START) return PLATEAU;
  const brow = browAt(right / forward);
  if (forward <= brow.forward) {
    const t = (forward - BANK_START) / (brow.forward - BANK_START);
    // Low swells across the bank, pinned to zero at the deck and the brow.
    const swell = Math.sin(forward * 0.33 + right * 0.19) * 0.18 * 4 * t * (1 - t);
    const shoulder = Math.max(0, 1
      - ((forward - TALL_SHOULDER.forward) / TALL_SHOULDER.radiusForward) ** 2
      - ((right - TALL_SHOULDER.right) / TALL_SHOULDER.radiusRight) ** 2);
    return brow.height + (PLATEAU - brow.height) * (1 - t) * (1 - t) + swell
      + TALL_SHOULDER.rise * shoulder * shoulder * (3 - 2 * shoulder);
  }
  const beyond = forward - brow.forward;
  return Math.max(-1.5, brow.height - 0.35 * beyond * beyond);
}

// The threshold is the darkest plane of the print: two deep mosses mottled
// together (a cool blue-green and an olive), dark earth where the bank breaks.
const MOSS_COOL = new Color(HARBOR_PALETTE.aurora_green)
  .lerp(new Color(HARBOR_PALETTE.deep_sea_1), 0.35)
  .multiplyScalar(0.15);
const MOSS_OLIVE = new Color(HARBOR_PALETTE.aurora_green)
  .lerp(new Color(HARBOR_PALETTE.stone_mid), 0.45)
  .multiplyScalar(0.14);
const EARTH_SHADE = new Color(HARBOR_PALETTE.stone_dark).multiplyScalar(0.62);
const SET_STONE = new Color(HARBOR_PALETTE.stone_mid).lerp(new Color(HARBOR_PALETTE.fog_blue), 0.2).multiplyScalar(0.5);
const CEDAR_NEEDLE = new Color(HARBOR_PALETTE.aurora_green).lerp(new Color(HARBOR_PALETTE.timber_dark), 0.55).multiplyScalar(0.42);
const CEDAR_BARK = new Color(HARBOR_PALETTE.timber_dark).multiplyScalar(0.7);
/** Weathered cedar: silver-brown boards, darker seams and sill. */
const DECK_BOARD = new Color(HARBOR_PALETTE.stone_mid)
  .lerp(new Color(HARBOR_PALETTE.timber_dark), 0.4)
  .lerp(new Color(HARBOR_PALETTE.fog_blue), 0.1);
const DECK_EDGE = DECK_BOARD.clone().multiplyScalar(0.8);
const DECK_SEAM = DECK_BOARD.clone().multiplyScalar(0.35);
const EAVE = new Color(HARBOR_PALETTE.stone_dark).multiplyScalar(0.5);
const TORO_STONE = new Color(HARBOR_PALETTE.stone_mid)
  .lerp(new Color(HARBOR_PALETTE.fog_blue), 0.15)
  .lerp(MOSS_OLIVE, 0.2)
  .multiplyScalar(0.72);
const TORO_HOLLOW = new Color(HARBOR_PALETTE.stone_dark).multiplyScalar(0.32);
const LANTERN_EMBER = new Color(HARBOR_PALETTE.lantern_warm);
/** Threshold kuromatsu dyes: a deep cool pine green far below the rim pine, never a new hue. */
const THRESHOLD_NEEDLE = new Color(HARBOR_PALETTE.aurora_green)
  .lerp(new Color(HARBOR_PALETTE.deep_sea_1), 0.4)
  .multiplyScalar(0.16);
const THRESHOLD_BARK = new Color(HARBOR_PALETTE.stone_dark)
  .lerp(new Color(HARBOR_PALETTE.timber_dark), 0.35).multiplyScalar(0.85);

// Land grid: rows tighten toward the seat so the near bank stays smooth on
// screen; columns are finest across the framed arc.
function landRows(): number[] {
  const rows = [-16, -11, -7, -4, -1.5, 1, 3];
  for (let forward = 3; forward < 52;) {
    forward += 0.4 + forward * 0.055;
    rows.push(forward);
  }
  return rows;
}
function landColumns(): number[] {
  const columns: number[] = [];
  for (let right = -40; right < -24; right += 4) columns.push(right);
  for (let right = -24; right < 28; right += 1.4) columns.push(right);
  for (let right = 28; right <= 48; right += 4) columns.push(right);
  return columns;
}

function landColor(forward: number, right: number, height: number): Color {
  // Two-scale mottle between the cool and the olive moss, plus a value wobble.
  const broad = Math.sin(forward * 0.29 + Math.sin(right * 0.17) * 2.2) * Math.cos(right * 0.23 - forward * 0.11);
  const fine = Math.sin(forward * 1.13 + right * 0.71) * Math.sin(right * 1.37 - forward * 0.53);
  const mix = Math.min(1, Math.max(0, 0.5 + broad * 0.45 + fine * 0.2));
  const color = MOSS_COOL.clone().lerp(MOSS_OLIVE, mix).multiplyScalar(0.86 + fine * 0.14);
  // The fall past the brow shows dark earth.
  const past = forward - (forward > BANK_START ? browAt(right / forward).forward : Number.POSITIVE_INFINITY);
  if (past > 0.5) color.lerp(EARTH_SHADE, Math.min(1, (past - 0.5) / 2));
  if (height < PLATEAU - 0.05 && forward < BANK_START + 1) color.lerp(EARTH_SHADE, 0.3);
  return color;
}

interface CedarSpec {
  forward: number;
  right: number;
  top: number;
}

/**
 * Behind-right of the seat: a sugi grove whose crowns shade the bank and the
 * pine from the side-lit noon through the low sunset key. Every crown stays
 * outside every rest frame (≥ 31° off the 1200×640 edge ray).
 */
const CEDARS: readonly CedarSpec[] = [
  { forward: -16, right: 28, top: 40 },
  { forward: -14, right: 18, top: 38 },
  { forward: -6, right: 31, top: 42 },
  { forward: -8, right: 22, top: 40 },
  { forward: -2, right: 25.5, top: 43 },
  { forward: 4, right: 23, top: 41 },
  { forward: 10, right: 27, top: 44 },
  { forward: 16, right: 25, top: 42 },
  { forward: 22, right: 29, top: 44 },
  { forward: 28, right: 27.5, top: 42 },
  { forward: 34, right: 31, top: 44 },
  { forward: 40, right: 30.5, top: 43 },
  { forward: 46, right: 33, top: 44 },
];

function dye(geometry: BufferGeometry, color: Color): BufferGeometry {
  const colors = new Float32Array(geometry.getAttribute("position").count * 3);
  for (let index = 0; index < colors.length; index += 3) color.toArray(colors, index);
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  if (geometry.getAttribute("uv")) geometry.deleteAttribute("uv");
  return geometry;
}

function buildLand(): BufferGeometry {
  const rows = landRows();
  const columns = landColumns();
  const positions = new Float32Array(rows.length * columns.length * 3);
  const colors = new Float32Array(rows.length * columns.length * 3);
  rows.forEach((forward, i) => {
    columns.forEach((right, j) => {
      const index = i * columns.length + j;
      const height = thresholdHeight(forward, right);
      positions[index * 3] = right;
      positions[index * 3 + 1] = height;
      positions[index * 3 + 2] = -forward;
      landColor(forward, right, height).toArray(colors, index * 3);
    });
  });
  const indices: number[] = [];
  for (let i = 0; i < rows.length - 1; i += 1) {
    for (let j = 0; j < columns.length - 1; j += 1) {
      const a = i * columns.length + j;
      const b = a + columns.length;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const pieces: BufferGeometry[] = [geometry];
  for (const [index, cedar] of CEDARS.entries()) {
    const ground = thresholdHeight(cedar.forward, cedar.right);
    const height = cedar.top - ground;
    const crownBase = ground + height * 0.32;
    const trunk = dye(new CylinderGeometry(0.32, 0.55, crownBase - ground + 1, 7, 1, true), CEDAR_BARK);
    trunk.translate(cedar.right, (crownBase + ground + 1) / 2 - 0.5, -cedar.forward);
    pieces.push(trunk);
    const radius = 3.8 + stableUnit(`threshold.cedar.${index}`) * 1.2;
    const profile = [
      new Vector2(0.01, 0), new Vector2(radius * 0.72, 0.02), new Vector2(radius, 0.12),
      new Vector2(radius * 0.86, 0.36), new Vector2(radius * 0.6, 0.62), new Vector2(radius * 0.3, 0.86), new Vector2(0.01, 1),
    ].map((point) => new Vector2(point.x, point.y * (cedar.top - crownBase)));
    const crown = dye(new LatheGeometry(profile, 9), CEDAR_NEEDLE);
    crown.translate(cedar.right, crownBase, -cedar.forward);
    pieces.push(crown);
  }
  for (const [index, stone] of SET_STONES.entries()) pieces.push(setStone(index, stone));
  const merged = mergeGeometries(pieces, false)!;
  pieces.forEach((piece) => piece.dispose());
  return merged;
}

interface StoneSpec {
  forward: number;
  right: number;
  /** Half-extents: across, height, along. */
  size: readonly [number, number, number];
  yaw: number;
}

/**
 * Set stones (a triad by the tōrō, two on the bank) and a run of flat
 * stepping stones from the deck edge down the moss. All sit low on the bank,
 * below the brow's silhouette.
 */
const SET_STONES: readonly StoneSpec[] = [
  { forward: 11.1, right: -3.8, size: [0.55, 0.38, 0.45], yaw: 0.4 },
  { forward: 10, right: -4.4, size: [0.32, 0.22, 0.28], yaw: 1.2 },
  { forward: 11.6, right: -1.6, size: [0.26, 0.16, 0.22], yaw: 2.1 },
  { forward: 16, right: 5.2, size: [0.8, 0.42, 0.55], yaw: 0.9 },
  { forward: 19.5, right: -7.5, size: [0.9, 0.36, 0.6], yaw: 2.6 },
  { forward: 5.4, right: 2.8, size: [0.34, 0.07, 0.26], yaw: 0.2 },
  { forward: 6.5, right: 2.2, size: [0.3, 0.07, 0.24], yaw: 0.9 },
  { forward: 7.7, right: 2.9, size: [0.32, 0.07, 0.25], yaw: 1.7 },
  { forward: 9, right: 2.3, size: [0.3, 0.07, 0.23], yaw: 0.5 },
  { forward: 10.4, right: 2.9, size: [0.31, 0.07, 0.24], yaw: 2.4 },
];

function setStone(index: number, stone: StoneSpec): BufferGeometry {
  const raw = new IcosahedronGeometry(1, 1);
  raw.deleteAttribute("normal");
  raw.deleteAttribute("uv");
  const geometry = mergeVertices(raw);
  raw.dispose();
  const position = geometry.getAttribute("position") as BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const color = new Color();
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const lump = 1 + (stableUnit(`threshold.stone.${index}.${vertex}`) - 0.5) * 0.18;
    const y = Math.max(-0.35, position.getY(vertex));
    position.setXYZ(vertex, position.getX(vertex) * lump, y, position.getZ(vertex) * lump);
    // Moss creeps over the crown of each stone; the flanks stay grey.
    color.copy(SET_STONE).lerp(MOSS_COOL, Math.max(0, y - 0.35) * 0.9);
    color.toArray(colors, vertex * 3);
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.scale(stone.size[0], stone.size[1], stone.size[2]);
  geometry.rotateY(stone.yaw);
  geometry.translate(stone.right, thresholdHeight(stone.forward, stone.right) + stone.size[1] * 0.2, -stone.forward);
  geometry.computeVertexNormals();
  return geometry;
}

interface BoxBuilder {
  colors: number[];
  indices: number[];
  normals: number[];
  positions: number[];
}

/** Axis-aligned box in the seat frame with per-face normals (planar architecture, no facets). */
function addBox(builder: BoxBuilder, min: readonly [number, number, number], max: readonly [number, number, number], color: Color): void {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const faces: Array<[number[], [number, number, number][]]> = [
    [[0, 1, 0], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]],
    [[0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
    [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
    [[0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]],
    [[1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]],
    [[-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
  ];
  for (const [normal, corners] of faces) {
    const start = builder.positions.length / 3;
    for (const corner of corners) {
      builder.positions.push(...corner);
      builder.normals.push(...normal);
      builder.colors.push(color.r, color.g, color.b);
    }
    builder.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
}

/** Seat-frame box helper: forward/right ranges map to −z/x. */
function seatBox(
  builder: BoxBuilder,
  forward: readonly [number, number],
  right: readonly [number, number],
  y: readonly [number, number],
  color: Color,
): void {
  addBox(builder, [right[0], y[0], -forward[1]], [right[1], y[1], -forward[0]], color);
}

/** Where the tōrō stands: on the bank below the deck, left of the sight line. */
const TORO_SEAT = { forward: 10.5, right: -2.6 } as const;
/** The fire chamber's core: a small cylinder, so its bounds hold under any turn. */
const TORO_CORE = { radius: 0.07, bottom: 0.68, top: 0.84 } as const;

function buildEngawa(): { chamberCentre: Vector3; geometry: BufferGeometry } {
  const builder: BoxBuilder = { colors: [], indices: [], normals: [], positions: [] };
  const top = DECK_TOP;
  const edge = DECK_EDGE_FORWARD;
  // Sill under the boards: its top shows as the seams between them.
  seatBox(builder, [DECK_BACK, edge - 0.3], [DECK_LEFT, DECK_RIGHT], [PLATEAU - 0.2, top - 0.06], DECK_SEAM);
  // Kiri-en boards run from the house to the edge, so their seams draw
  // converging lines across the edge band; each board's weathering differs.
  for (let board = 0, right = DECK_LEFT; right < DECK_RIGHT - 0.05; board += 1, right += 0.38) {
    const shade = 0.82 + stableUnit(`threshold.board.${board}`) * 0.3;
    seatBox(builder, [DECK_BACK, edge - 0.3], [right + 0.02, Math.min(DECK_RIGHT, right + 0.36)], [top - 0.06, top], DECK_BOARD.clone().multiplyScalar(shade));
  }
  // The front edge beam (engawa-gamachi): the one line across the bottom band.
  seatBox(builder, [edge - 0.3, edge], [DECK_LEFT - 0.1, DECK_RIGHT + 0.1], [PLATEAU - 0.25, top + 0.02], DECK_EDGE);
  // Posts, eave and the tea-house body behind the seat: off frame above,
  // beside and behind every rest view. Their shadow holds the boards dark from
  // late morning, and the body throws the bank into shade once the low
  // evening key comes from behind the viewer.
  for (const right of [DECK_LEFT + 0.3, 6, DECK_RIGHT - 0.3]) {
    for (const forward of [DECK_BACK + 0.3, edge - 0.55]) {
      if (right === 6 && forward > 0) continue;
      seatBox(builder, [forward - 0.18, forward + 0.18], [right - 0.18, right + 0.18], [top, 18.5], DECK_EDGE);
    }
  }
  const eaveFront = 6.4;
  const houseBack = -12;
  seatBox(builder, [houseBack, DECK_BACK], [DECK_LEFT - 1, DECK_RIGHT + 9], [PLATEAU - 0.2, 18.4], EAVE);
  seatBox(builder, [houseBack - 0.8, DECK_BACK], [DECK_RIGHT + 4.5, DECK_RIGHT + 9.5], [18.4, 18.9], EAVE);
  seatBox(builder, [houseBack - 0.8, eaveFront], [DECK_LEFT - 2, DECK_RIGHT + 4.5], [18.4, 18.9], EAVE);
  seatBox(builder, [houseBack - 0.5, eaveFront - 3], [DECK_LEFT - 1.5, DECK_RIGHT + 4], [18.9, 20.4], EAVE);

  // A small oki-dōrō on the bank: hexagonal foot, post, platform, a closed
  // stone fire chamber with one small window toward the seat, a hexagonal
  // roof and a jewel. Only the core inside kindles (patchGardenToroKindling),
  // so at night the ember shows through the window alone.
  const { forward: tf, right: tr } = TORO_SEAT;
  const ground = thresholdHeight(tf, tr) - 0.03;
  const parts: BufferGeometry[] = [];
  const put = (geometry: BufferGeometry, y: number, color: Color, dx = 0, dz = 0) => {
    geometry.translate(tr + dx, ground + y, -tf + dz);
    parts.push(dye(geometry, color));
  };
  put(new CylinderGeometry(0.28, 0.34, 0.12, 6), 0.06, TORO_STONE);
  put(new CylinderGeometry(0.075, 0.09, 0.42, 8), 0.33, TORO_STONE);
  put(new CylinderGeometry(0.24, 0.15, 0.1, 6), 0.59, TORO_STONE);
  put(new CylinderGeometry(TORO_CORE.radius, TORO_CORE.radius, TORO_CORE.top - TORO_CORE.bottom, 8), (TORO_CORE.top + TORO_CORE.bottom) / 2, TORO_HOLLOW);
  // Chamber walls (seat frame; the seat looks along −z): inner faces 0.13
  // from the core's axis, so no wall lies inside the core's kindling box.
  const wall = (x: readonly [number, number], y: readonly [number, number], z: readonly [number, number]) => {
    addBox(builder, [tr + x[0], ground + y[0], -tf + z[0]], [tr + x[1], ground + y[1], -tf + z[1]], TORO_STONE);
  };
  const [c0, c1] = [0.64, 0.88];
  wall([-0.165, -0.13], [c0, c1], [-0.165, 0.165]);
  wall([0.13, 0.165], [c0, c1], [-0.165, 0.165]);
  wall([-0.13, 0.13], [c0, c1], [-0.165, -0.13]);
  // The seat-side wall, framing a 0.1 × 0.1 window.
  wall([-0.13, -0.05], [c0, c1], [0.13, 0.165]);
  wall([0.05, 0.13], [c0, c1], [0.13, 0.165]);
  wall([-0.05, 0.05], [c0, 0.72], [0.13, 0.165]);
  wall([-0.05, 0.05], [0.82, c1], [0.13, 0.165]);
  put(new CylinderGeometry(0.3, 0.3, 0.035, 6), 0.9, TORO_STONE);
  put(new ConeGeometry(0.4, 0.2, 6), 1.015, TORO_STONE);
  put(new SphereGeometry(0.055, 8, 6), 1.15, TORO_STONE);
  const boxes = new BufferGeometry();
  boxes.setAttribute("position", new BufferAttribute(new Float32Array(builder.positions), 3));
  boxes.setAttribute("normal", new BufferAttribute(new Float32Array(builder.normals), 3));
  boxes.setAttribute("color", new BufferAttribute(new Float32Array(builder.colors), 3));
  boxes.setIndex(builder.indices);
  parts.unshift(boxes);
  const geometry = mergeGeometries(parts, false)!;
  parts.forEach((part) => part.dispose());
  geometry.computeBoundingSphere();
  return { chamberCentre: new Vector3(tr, ground + (TORO_CORE.top + TORO_CORE.bottom) / 2, -tf), geometry };
}

/** A limb pad authored where it must land in a rest frame. */
interface ScreenPad {
  /** Frame position of the pad centre (0..1, y down). */
  u: number;
  v: number;
  /** Horizontal distance ahead of the eye, world units. */
  depth: number;
  /** Pad half-width, world units. */
  size: number;
}

/**
 * The sashi-eda for a rest frame, solved from where its pads must appear:
 * each pad centre is placed on its frame target at its depth, seen from the
 * seat eye `eyeRight` (seat-frame right offset) at the frame's aspect; the arm
 * leaves the trunk at `at` and runs to the outermost pad, and every pad sits
 * on a short twig off it. So the pads' screen composition — three separate
 * flat pads with sky between them — is authored directly, like the brow.
 */
function screenLimb(
  root: { forward: number; right: number },
  trunk: ReadonlyArray<readonly [number, number, number]>,
  at: number,
  eyeRight: number,
  aspect: number,
  targets: readonly ScreenPad[],
): NiwakiBranchSpec {
  const curve = new CatmullRomCurve3(trunk.map(([x, y, z]) => new Vector3(x, y, z)), false, "centripetal");
  const local = curve.getPointAt(at);
  const rootY = thresholdHeight(root.forward, root.right) - 0.1;
  const start = { right: root.right + local.x, y: rootY + local.y, forward: root.forward - local.z };
  const cosP = Math.cos(REST_SEAT_PITCH_RAD);
  const sinP = Math.sin(REST_SEAT_PITCH_RAD);
  const pads = targets.map((target) => {
    const ndcY = 1 - 2 * target.v;
    const dy = target.depth * (ndcY * TAN_HALF_VFOV * cosP - sinP) / (cosP + ndcY * TAN_HALF_VFOV * sinP);
    const viewDepth = -dy * sinP + target.depth * cosP;
    return {
      right: eyeRight + (2 * target.u - 1) * TAN_HALF_VFOV * aspect * viewDepth,
      y: REST_SEAT_EYE_HEIGHT + dy,
      forward: target.depth,
      size: target.size,
    };
  });
  // Pine-local axes: +x = seat right, +z = seat backward.
  const outer = pads.reduce((far, pad) => (pad.forward > far.forward ? pad : far));
  const azimuth = Math.atan2(-(outer.forward - start.forward), outer.right - start.right);
  const heading = { x: Math.cos(azimuth), z: Math.sin(azimuth) };
  const placements = pads.map((pad) => {
    const dx = pad.right - start.right;
    const dz = -(pad.forward - start.forward);
    return {
      forward: dx * heading.x + dz * heading.z,
      side: -dx * heading.z + dz * heading.x,
      up: pad.y - start.y,
      size: pad.size,
    };
  });
  const tip = placements.reduce((far, pad) => (pad.forward > far.forward ? pad : far));
  return {
    at,
    azimuth,
    reach: tip.forward,
    rise: tip.up - tip.size * 0.3,
    padSize: tip.size,
    padsAt: placements,
  };
}

/**
 * The hero kuromatsu, rooted just past the deck's front-left corner. Its
 * plated trunk rises out of the lower-left corner and sweeps away left over
 * the bank (leaving the frame below the lowest navigable water), then climbs
 * out of view; its one long low limb (sashi-eda) runs back in above eye
 * height and carries three separate flat pads across the upper-left edge,
 * seen from below. Trunk nodes are root-local (+x = seat right, −z = seat
 * forward); the upper tiers turn left and back, out of every rest frame.
 */
const HERO_ROOT = { forward: 5.8, right: -2 } as const;
const HERO_TRUNK: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0], [-0.9, 0.45, -0.3], [-2.1, 1, -0.9], [-3.3, 2.2, -1.6], [-4, 4.6, -2.6], [-4.2, 7.4, -3.4], [-4, 9.2, -3.8],
];
/** 1600×1000 targets: one pad crossing the left edge, two stepping out along the limb. */
const HERO_LIMB_PADS: readonly ScreenPad[] = [
  { u: -0.03, v: 0.105, depth: 13.5, size: 0.95 },
  { u: 0.045, v: 0.205, depth: 12, size: 0.58 },
  { u: 0.12, v: 0.15, depth: 14, size: 0.5 },
];
const HERO_BRANCHES: readonly NiwakiBranchSpec[] = [
  { ...screenLimb(HERO_ROOT, HERO_TRUNK, 0.443, 0, 1.6, HERO_LIMB_PADS), detail: 2 },
  // Upper tiers: out of every frame, they only cast shade on the bank.
  { at: 0.66, azimuth: 2.7, reach: 2.4, rise: 0.4, padSize: 1.5, detail: 0 },
  { at: 0.8, azimuth: 1.7, reach: 2, rise: 0.35, padSize: 1.3, detail: 0 },
  { at: 0.9, azimuth: 3.3, reach: 1.6, rise: 0.3, padSize: 1.1, detail: 0 },
  { at: 1, azimuth: 2.2, reach: 0.4, rise: 0.15, padSize: 0.9, detail: 0 },
];
/**
 * The companion pine for the tall 720×900 seat (10.95 u to the right on the
 * same deck). It stands in the wedge between the landscape frames' right edge
 * and the tall frame's left edge, so only its sashi-eda's pads enter the tall
 * frame at the upper left; no landscape frame sees any of it.
 */
const TALL_EYE_RIGHT = 10.95;
const COMPANION_ROOT = { forward: 5.1, right: 6.4 } as const;
const COMPANION_TRUNK: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0], [0.25, 1.6, 0.2], [0.12, 3.4, 0.45], [0.45, 5.2, 0.6], [0.35, 7, 0.8],
];
const COMPANION_LIMB_PADS: readonly ScreenPad[] = [
  { u: -0.03, v: 0.13, depth: 12, size: 0.7 },
  { u: 0.1, v: 0.22, depth: 11, size: 0.45 },
  { u: 0.21, v: 0.15, depth: 13, size: 0.36 },
];
const COMPANION_BRANCHES: readonly NiwakiBranchSpec[] = [
  { ...screenLimb(COMPANION_ROOT, COMPANION_TRUNK, 0.372, TALL_EYE_RIGHT, 0.8, COMPANION_LIMB_PADS), detail: 2 },
  { at: 0.558, azimuth: 1.9, reach: 1.6, rise: 0.3, padSize: 0.95, detail: 0 },
  { at: 0.716, azimuth: 0.6, reach: 1.5, rise: 0.3, padSize: 0.85, detail: 0 },
  { at: 0.858, azimuth: 1.2, reach: 1.2, rise: 0.25, padSize: 0.7, detail: 0 },
  { at: 1, azimuth: 0.4, reach: 0.3, rise: 0.1, padSize: 0.55, detail: 0 },
];
/** Pines sway by their height above this base (the veranda ground). */
const PINE_BASE = PLATEAU;

export interface GardenThreshold {
  root: Group;
  drawCallCount: number;
  triangleCount: number;
  /** World-space bounds of every threshold caster and receiver (rest placement). */
  shadowBounds: Box3;
  /** Hero sashi-eda pad centres in world space at rest, innermost first. */
  heroLimbPadCentres: readonly Vector3[];
  /**
   * Follow the breathed eye: pass live eye − rest eye for the current aspect
   * class. The threshold is where the viewer sits, so it moves with the eye
   * and the corner holds through breath and the arrival rise.
   */
  setEyeOffset(x: number, y: number, z: number): void;
  updateWind(weather: WeatherPlan, reducedMotion: boolean): void;
  dispose(): void;
}

function plantPine(
  seed: string,
  root: { forward: number; right: number },
  trunk: ReadonlyArray<readonly [number, number, number]>,
  branches: readonly NiwakiBranchSpec[],
  height: number,
  trunkRadius: number,
): { geometry: BufferGeometry; limbPads: Vector3[] } {
  const pine = createNiwakiPine({ seed, height, trunk, trunkRadius, branches, bark: THRESHOLD_BARK, needle: THRESHOLD_NEEDLE });
  const offset = new Vector3(root.right, thresholdHeight(root.forward, root.right) - 0.1 - PINE_BASE, -root.forward);
  pine.geometry.translate(offset.x, offset.y, offset.z);
  const limbPads = pine.pads
    .filter((pad) => pad.branch === 0)
    .map((pad) => pad.center.clone().add(offset))
    .sort((a, b) => b.z - a.z);
  return { geometry: pine.geometry, limbPads };
}

export function createGardenThreshold(): GardenThreshold {
  const root = new Group();
  root.name = GARDEN_THRESHOLD_NAME;
  const seat = seatToWorld(0, 0, 0);
  root.position.copy(seat);
  // Geometry is authored in the seat frame and turned to world axes once, so
  // the pines' instance matrix stays world-aligned for the shared wind patch.
  const toWorldAxes = new Matrix4().makeRotationY(REST_SEAT_YAW_RAD);

  const landMaterial = new MeshStandardMaterial({ flatShading: false, roughness: 0.98, vertexColors: true });
  patchGardenFloraNight(landMaterial);
  const land = new Mesh(buildLand().applyMatrix4(toWorldAxes), landMaterial);
  land.name = GARDEN_THRESHOLD_LAND_NAME;

  const engawaParts = buildEngawa();
  const engawaMaterial = new MeshStandardMaterial({ flatShading: false, roughness: 0.72, vertexColors: true, envMapIntensity: 0.3 });
  // The chamber test is an axis-aligned box in geometry space: the core is a
  // cylinder, so its box is the same under the turn, and the chamber walls
  // (≥ 0.13 out) and the platform and roof (0.04 u clear) stay outside.
  const core = engawaParts.chamberCentre.applyMatrix4(toWorldAxes);
  const halfCore = new Vector3(TORO_CORE.radius + 0.002, (TORO_CORE.top - TORO_CORE.bottom) / 2, TORO_CORE.radius + 0.002);
  patchGardenToroKindling(engawaMaterial, new Box3(core.clone().sub(halfCore), core.clone().add(halfCore)), LANTERN_EMBER);
  const engawa = new Mesh(engawaParts.geometry.applyMatrix4(toWorldAxes), engawaMaterial);
  engawa.name = GARDEN_THRESHOLD_ENGAWA_NAME;

  const hero = plantPine("threshold.hero", HERO_ROOT, HERO_TRUNK, HERO_BRANCHES, 9.6, 0.36);
  const companion = plantPine("threshold.companion", COMPANION_ROOT, COMPANION_TRUNK, COMPANION_BRANCHES, 7, 0.24);
  const pineGeometry = mergeGeometries([hero.geometry, companion.geometry], false)!;
  hero.geometry.dispose();
  companion.geometry.dispose();
  pineGeometry.applyMatrix4(toWorldAxes);
  const pineMaterial = new MeshStandardMaterial({ flatShading: false, roughness: 0.96, vertexColors: true });
  patchGardenFloraNight(pineMaterial);
  patchGardenInstancedWindSway(pineMaterial, 9.6, 0.02);
  // One instance: both trees share the draw and the world-aligned wind.
  const pines = new InstancedMesh(pineGeometry, pineMaterial, 1);
  pines.name = GARDEN_THRESHOLD_PINES_NAME;
  const pineMatrix = new Matrix4().makeTranslation(0, PINE_BASE, 0);
  pines.setMatrixAt(0, pineMatrix);
  pines.instanceMatrix.needsUpdate = true;
  // Near the eye a full rim-pine sway would swing tens of pixels: a third.
  pineGeometry.setAttribute("aGardenSway", new InstancedBufferAttribute(new Float32Array([0.34]), 1));

  const drawables = [land, engawa, pines];
  for (const mesh of drawables) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.raycast = () => {};
  }
  root.add(...drawables);
  root.updateMatrixWorld(true);

  const shadowBounds = new Box3();
  for (const mesh of drawables) {
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!.clone();
    if (mesh === pines) box.applyMatrix4(pineMatrix);
    shadowBounds.union(box.applyMatrix4(mesh.matrixWorld));
  }
  const padToWorld = root.matrixWorld.clone().multiply(pineMatrix).multiply(toWorldAxes);
  const heroLimbPadCentres = hero.limbPads.map((pad) => pad.applyMatrix4(padToWorld));

  let disposed = false;
  return {
    root,
    drawCallCount: drawables.length,
    triangleCount: drawables.reduce((sum, mesh) => sum + mesh.geometry.index!.count / 3, 0),
    shadowBounds,
    heroLimbPadCentres,
    setEyeOffset(x, y, z) {
      root.position.set(seat.x + x, seat.y + y, seat.z + z);
    },
    updateWind(weather, reducedMotion) {
      updateGardenInstancedWindSway(pineMaterial, weather, reducedMotion);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      disposeThreeObjectTree(root);
      root.clear();
    },
  };
}
