import {
  BufferAttribute,
  BufferGeometry,
  Box3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
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
  patchGardenRootedWindSway,
  updateGardenRootedWindSway,
} from "./garden-flora";
import { patchGardenToroKindling } from "./garden-lanterns";
import {
  createAuthoredKuromatsuGeometry,
  type AuthoredKuromatsuOptions, type KuromatsuLimb,
} from "./garden-niwaki";
import type { SetStoneForm } from "./garden-set-stones";
import type { GardenSurfaceAtlasOwner } from "./garden-surface-atlas";
import {
  applyGardenSurface,
  GARDEN_SURFACE_ROLE_ATTRIBUTE,
  GARDEN_SURFACE_ROLE_CODES,
  GARDEN_SURFACE_WEIGHT_ATTRIBUTE,
  type GardenSurfaceDetailSource,
} from "./garden-surfaces";
import { disposeThreeObjectTree, stableUnit } from "./garden-util";

/**
 * The threshold (plan W1.5, ruling K2): the viewer's near garden at rest seat C.
 *
 * From the south-shore seat the bottom quarter of the frame used to look past
 * the plate edge at open ocean (≈35 / 42 / 27 / 12 % at 1600×1000 / 1200×640 /
 * 900×720 / 720×900). The threshold is the land you sit on: the engawa's
 * cedar deck edge across the bottom band, two unequal moss shelves flanking
 * an oblique recessed interval, a buried stone triad hiding the approach,
 * and an open branching pine across the upper-left corner. A small stone
 * tōrō stands past the deck edge. The offscreen eave, tea-house and small
 * cedar grove hold shade at the front corner; sun reaches the middle-near
 * garden through the visible pine's broken edge shade.
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
function browAt(bearing: number): { forward: number; height: number; undulation: number } {
  const below = Math.atan((2 * browRow(bearing) - 1) * TAN_HALF_VFOV) + REST_SEAT_PITCH_RAD;
  const framed = REST_SEAT_EYE_HEIGHT - BROW_FORWARD * Math.tan(below);
  const out = Math.min(1, Math.max(0, (bearing - 0.62) / 0.13));
  const undulation = (Math.sin(bearing * 19 + 0.6) * 0.17 + Math.sin(bearing * 47 + 2.1) * 0.1) * (1 - out);
  return {
    forward: BROW_FORWARD + (PROMONTORY_FORWARD - BROW_FORWARD) * out,
    // A soft, irregular brow: two slow undulations, ≤ ±0.3 u (≤ ±0.02 of the frame).
    height: framed + (PROMONTORY_HEIGHT - framed) * out + undulation,
    undulation,
  };
}

/**
 * A moss shoulder below the deck in front of the tall seat. From the tall eye
 * (10.95 u right) the brow alone would leave a sliver of outer sea between
 * the deck edge and the rim when the breath lowers the eye; this low swell
 * fills that band. It lies at bearings > 0.7, outside every landscape frame.
 */
const TALL_SHOULDER = { forward: 8.6, right: 9.3, rise: 0.8, radiusForward: 3, radiusRight: 2.6 } as const;

// A metric, horizontal reservation inside the gravel. Its trace is owned by
// S3; this module supplies only the substrate and root-local attachment plane.
const GRAVEL_INSET = { forward: 18.6, right: 1.9, width: 2.2, depth: 1.6 } as const;

function gravelInsetMask(forward: number, right: number): number {
  const gap = Math.max(0, Math.abs(forward - GRAVEL_INSET.forward) - GRAVEL_INSET.depth / 2,
    Math.abs(right - GRAVEL_INSET.right) - GRAVEL_INSET.width / 2);
  const t = Math.max(0, 1 - gap / 0.45);
  return t * t * (3 - 2 * t);
}

/** Two low shelves and the interval between them share one physical seat-space mask. */
function recessMask(forward: number, right: number): number {
  const along = softBankMask(((forward - 19) / 10) ** 2);
  const centre = 1.8 - (forward - 14) * 0.46;
  const width = Math.max(0.85, 1.45 - Math.max(0, forward - 18) * 0.06);
  return along * shelfMask(((right - centre) / width) ** 2);
}

function interiorMask(forward: number, right: number, browForward: number): number {
  const near = Math.min(1, Math.max(0, (forward - 9) / 4));
  const far = Math.min(1, Math.max(0, (browForward - forward) / 4));
  return near * near * (3 - 2 * near) * far * far * (3 - 2 * far)
    * shelfMask((right / 17) ** 2);
}


/**
 * The retained bank envelope protects the brow, deck and hull clearance.
 * Broad shelf sections replace the interior swells; the shallow interval
 * dies out before the brow, and the tall-seat shoulder is unchanged.
 */
function thresholdBaseHeight(forward: number, right: number): number {
  if (forward <= BANK_START) return PLATEAU;
  const brow = browAt(right / forward);
  // Extreme rest breath grazed this whole left-brow band. A 120-mm crest
  // across forward 29–31 / right −7.5…−4.5 leaves over 50 mm of margin
  // at the measured wide-gate ray, then tapers smoothly outside the band.
  // Benches, triad, record plane and the broader bank stay unchanged.
  const browLip = 0.12
    * shelfMask((Math.max(0, Math.abs(forward - BROW_FORWARD) - 1) / 1.5) ** 2)
    * shelfMask((Math.max(0, Math.abs(right + 6) - 1.5) / 1.5) ** 2);
  if (forward <= brow.forward) {
    const t = (forward - BANK_START) / (brow.forward - BANK_START);
    const envelope = (1 - t) * (1 - t);
    const leftShelf = shelfMask(((forward - 19) / 9) ** 2 + ((right + 5) / 8) ** 2);
    const rightShelf = shelfMask(((forward - 16) / 7) ** 2 + ((right - 5.5) / 5) ** 2);
    const interior = interiorMask(forward, right, brow.forward);
    const shoulder = Math.max(0, 1
      - ((forward - TALL_SHOULDER.forward) / TALL_SHOULDER.radiusForward) ** 2
      - ((right - TALL_SHOULDER.right) / TALL_SHOULDER.radiusRight) ** 2);
    // Irregularity belongs only to the retained silhouette, not to every
    // cross-bank section where noon's side-on key would print parallel bands.
    const browBase = brow.height - brow.undulation;
    const edge = Math.max(0, 1 - (brow.forward - forward) / 1.8);
    const baseline = browBase + (PLATEAU - browBase) * envelope
      + brow.undulation * edge * edge * (3 - 2 * edge);
    const recess = recessMask(forward, right);
    // The guard only bounds the distant silhouette. Inside it, world-space
    // benches must be shallower than the sight rays: a ray-aligned terrace
    // collapses to a thin screen band and sends atlas footprints to infinity.
    const guardRow = browRow(right / forward) + 0.035 + 0.03 * leftShelf * (1 - recess);
    const guard = REST_SEAT_EYE_HEIGHT - forward
      * Math.tan(Math.atan((2 * guardRow - 1) * TAN_HALF_VFOV) + REST_SEAT_PITCH_RAD);
    const terrace = Math.min(guard, 10.6 - (forward - 18) * 0.08
      + 0.18 * leftShelf + 0.1 * rightShelf) - 0.24 * recess;
    // A physical rounded crest closes the shelf-to-brow dip under rest
    // breathing. It ends at the retained brow and starts beyond the triad,
    // leaving the near sampling benches and stone contacts unchanged.
    const crestAlong = Math.max(0, Math.min(1, (forward - 24) / 3, (brow.forward - forward) / 3));
    const crest = crestAlong * crestAlong * (3 - 2 * crestAlong)
      * shelfMask(((right + 5) / 6) ** 2);
    return baseline + (terrace - baseline) * interior
      + 0.5 * crest + browLip + TALL_SHOULDER.rise * shoulder * shoulder * (3 - 2 * shoulder);
  }
  const beyond = forward - brow.forward;
  return Math.max(-1.5, brow.height - 0.35 * beyond * beyond) + browLip;
}

// Anchor the record plane at its centre, not at the lowest distant corner:
// the latter excavated a hidden pocket and swallowed a step on the approach.
const GRAVEL_INSET_HEIGHT = thresholdBaseHeight(GRAVEL_INSET.forward, GRAVEL_INSET.right) - 0.012;

function thresholdHeight(forward: number, right: number): number {
  const base = thresholdBaseHeight(forward, right);
  return base + (GRAVEL_INSET_HEIGHT - base) * gravelInsetMask(forward, right);
}

export interface GardenThresholdGroundSample {
  height: number;
  moss: number;
  gravel: number;
  earth: number;
  inset: number;
}

/** Construction/station sampling only; callers reuse their output object. */
export function writeGardenThresholdGround(forward: number, right: number, out: GardenThresholdGroundSample): void {
  const browForward = forward > BANK_START ? browAt(right / forward).forward : BANK_START;
  out.height = thresholdHeight(forward, right);
  out.inset = gravelInsetMask(forward, right);
  out.earth = Math.min(1, Math.max(0, (forward - browForward - 0.5) / 2));
  const gravel = Math.max(out.inset, recessMask(forward, right) * interiorMask(forward, right, browForward));
  out.gravel = gravel * (1 - out.earth);
  out.moss = (1 - out.earth) * (1 - gravel);
}

// Warm olive/earth pigments retain their land identity under the shared cool
// shade ink; atlas detail supplies fibres/mineral grains, not a bright lawn.
const MOSS_OLIVE = new Color().setRGB(0.034, 0.05, 0.028);
const STONE_MOSS = MOSS_OLIVE.clone().multiplyScalar(0.64);
const EARTH_SHADE = new Color().setRGB(0.055, 0.038, 0.023);
const GRAVEL = new Color().setRGB(0.13, 0.12, 0.10);
const SET_STONE = new Color().setRGB(0.065, 0.065, 0.06);
const STONE_CONTACT = new Color().setRGB(0.018, 0.02, 0.009);
const STONE_CROWN = new Color().setRGB(0.145, 0.14, 0.125);
const STEP_WORN = new Color().setRGB(0.16, 0.15, 0.135);
const CEDAR_NEEDLE = new Color().setRGB(0.025, 0.033, 0.009);
const CEDAR_BARK = new Color().setRGB(0.037, 0.03, 0.022);
const DECK_BOARD = new Color().setRGB(0.15, 0.12, 0.075);
const DECK_EDGE = DECK_BOARD.clone().multiplyScalar(0.8);
const DECK_SEAM = DECK_BOARD.clone().multiplyScalar(0.35);
const EAVE = new Color().setRGB(0.065, 0.065, 0.065);
const TORO_STONE = new Color().setRGB(0.05, 0.047, 0.035);
const TORO_HOLLOW = EARTH_SHADE.clone().multiplyScalar(0.32);
const LANTERN_EMBER = new Color(HARBOR_PALETTE.lantern_warm);
const THRESHOLD_NIGHT_FLOOR = 0.5;
const THRESHOLD_NEEDLE = CEDAR_NEEDLE;
const THRESHOLD_BARK = CEDAR_BARK;

// Land grid: rows tighten toward the seat so the near bank stays smooth on
// screen; columns are finest across the framed arc.
function landRows(): number[] {
  const rows = [-16, -11, -7, -4, -1.5, 1, 3];
  for (let forward = 3; forward < 52;) {
    forward += 0.3 + forward * 0.035;
    rows.push(forward);
  }
  if (!rows.includes(BROW_FORWARD)) rows.push(BROW_FORWARD);
  const near = GRAVEL_INSET.forward - GRAVEL_INSET.depth / 2;
  const far = GRAVEL_INSET.forward + GRAVEL_INSET.depth / 2;
  if (!rows.includes(near)) rows.push(near);
  if (!rows.includes(far)) rows.push(far);
  rows.sort((a, b) => a - b);
  return rows;
}
function landColumns(): number[] {
  const columns: number[] = [];
  for (let right = -40; right < -24; right += 4) columns.push(right);
  for (let right = -24; right < 28; right += 0.75) columns.push(right);
  for (let right = 28; right <= 48; right += 4) columns.push(right);
  const left = GRAVEL_INSET.right - GRAVEL_INSET.width / 2;
  const right = GRAVEL_INSET.right + GRAVEL_INSET.width / 2;
  if (!columns.includes(left)) columns.push(left);
  if (!columns.includes(right)) columns.push(right);
  columns.sort((a, b) => a - b);
  return columns;
}

function softBankMask(distanceSquared: number): number {
  const t = Math.max(0, 1 - distanceSquared);
  return t * t * (3 - 2 * t);
}

/** A broad, nearly level shelf with a narrow rounded shoulder, not a swell. */
function shelfMask(distanceSquared: number): number {
  const t = Math.min(1, Math.max(0, (1 - distanceSquared) / 0.42));
  return t * t * (3 - 2 * t);
}

function groundColor(sample: GardenThresholdGroundSample, forward: number, right: number, out: Color): Color {
  const shoulder = 1 - 0.24 * 4 * sample.gravel * (1 - sample.gravel);
  const moss = sample.moss * shoulder * (sample.moss === 0 ? 1
    : 0.88 + 0.16 * Math.sin(forward * 0.64 + Math.cos(right * 0.31) * 0.75)
      * Math.cos(right * 0.44 - forward * 0.12));
  return out.setRGB(
    MOSS_OLIVE.r * moss + GRAVEL.r * sample.gravel + EARTH_SHADE.r * sample.earth,
    MOSS_OLIVE.g * moss + GRAVEL.g * sample.gravel + EARTH_SHADE.g * sample.earth,
    MOSS_OLIVE.b * moss + GRAVEL.b * sample.gravel + EARTH_SHADE.b * sample.earth,
  );
}

interface CedarSpec {
  forward: number;
  right: number;
  top: number;
}

/**
 * A small grove behind the veranda shades its front corner, not the entire
 * near garden. The middle shelves and approach receive the noon key directly;
 * the visible pine supplies the broken shade at their edges.
 */
const CEDARS: readonly CedarSpec[] = [
  { forward: -16, right: 28, top: 24 },
  { forward: -14, right: 18, top: 24 },
];

function dye(geometry: BufferGeometry, color: Color): BufferGeometry {
  const colors = new Float32Array(geometry.getAttribute("position").count * 3);
  for (let index = 0; index < colors.length; index += 3) color.toArray(colors, index);
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  if (geometry.getAttribute("uv")) geometry.deleteAttribute("uv");
  return geometry;
}

function buildLand(): { geometry: BufferGeometry; heightAt(forward: number, right: number): number } {
  const rows = landRows();
  const columns = landColumns();
  const count = rows.length * columns.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const weights = new Float32Array(count * 3);
  const sample: GardenThresholdGroundSample = { height: 0, moss: 0, gravel: 0, earth: 0, inset: 0 };
  const color = new Color();
  rows.forEach((forward, i) => {
    columns.forEach((right, j) => {
      const index = i * columns.length + j;
      writeGardenThresholdGround(forward, right, sample);
      positions[index * 3] = right;
      positions[index * 3 + 1] = sample.height;
      positions[index * 3 + 2] = -forward;
      groundColor(sample, forward, right, color).toArray(colors, index * 3);
      weights[index * 3] = sample.moss;
      weights[index * 3 + 1] = sample.gravel;
      weights[index * 3 + 2] = sample.earth;
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
  const grid = new BufferGeometry();
  grid.setAttribute("position", new BufferAttribute(positions, 3));
  grid.setIndex(indices);
  grid.computeVertexNormals();
  const normal = grid.getAttribute("normal");
  const vertexPool = new Map<number, number>();
  const split = { positions: [] as number[], normals: [] as number[], colors: [] as number[],
    roles: [] as number[], weights: [] as number[], uv: [] as number[], indices: [] as number[] };
  for (let face = 0; face < indices.length; face += 3) {
    const a = indices[face]!;
    const b = indices[face + 1]!;
    const c = indices[face + 2]!;
    writeGardenThresholdGround(-(positions[a * 3 + 2]! + positions[b * 3 + 2]! + positions[c * 3 + 2]!) / 3,
      (positions[a * 3]! + positions[b * 3]! + positions[c * 3]!) / 3, sample);
    const role = sample.gravel > 0.5 ? GARDEN_SURFACE_ROLE_CODES.gravel
      : sample.earth > 0.5 ? GARDEN_SURFACE_ROLE_CODES.earth : GARDEN_SURFACE_ROLE_CODES.moss;
    const channel = role === GARDEN_SURFACE_ROLE_CODES.gravel ? 1 : role === GARDEN_SURFACE_ROLE_CODES.earth ? 2 : 0;
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = indices[face + corner]!;
      const key = vertex * 4 + role;
      let next = vertexPool.get(key);
      if (next === undefined) {
        next = split.roles.length;
        vertexPool.set(key, next);
        const offset = vertex * 3;
        split.positions.push(positions[offset]!, positions[offset + 1]!, positions[offset + 2]!);
        split.normals.push(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex));
        split.colors.push(colors[offset]!, colors[offset + 1]!, colors[offset + 2]!);
        split.roles.push(role);
        split.weights.push(weights[offset + channel]!);
        split.uv.push(positions[offset]!, positions[offset + 2]!);
      }
      split.indices.push(next);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(split.positions), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(split.normals), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(split.colors), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(split.uv), 2));
  geometry.setAttribute(GARDEN_SURFACE_ROLE_ATTRIBUTE, new BufferAttribute(new Float32Array(split.roles), 1));
  geometry.setAttribute(GARDEN_SURFACE_WEIGHT_ATTRIBUTE, new BufferAttribute(new Float32Array(split.weights), 1));
  geometry.setIndex(split.indices);
  grid.dispose();
  return { geometry, heightAt(forward, right) {
    let row = 1;
    let column = 1;
    while (row < rows.length - 1 && rows[row]! < forward) row += 1;
    while (column < columns.length - 1 && columns[column]! < right) column += 1;
    const x = Math.min(1, Math.max(0, (right - columns[column - 1]!) / (columns[column]! - columns[column - 1]!)));
    const y = Math.min(1, Math.max(0, (forward - rows[row - 1]!) / (rows[row]! - rows[row - 1]!)));
    const a = (row - 1) * columns.length + column - 1;
    const h00 = positions[a * 3 + 1]!;
    const h10 = positions[(a + 1) * 3 + 1]!;
    const h01 = positions[(a + columns.length) * 3 + 1]!;
    const h11 = positions[(a + columns.length + 1) * 3 + 1]!;
    return x + y <= 1 ? h00 + (h10 - h00) * x + (h01 - h00) * y
      : h11 + (h01 - h11) * (1 - x) + (h10 - h11) * (1 - y);
  } };
}

function buildShadeCasters(): BufferGeometry {
  const pieces: BufferGeometry[] = [];
  for (const [index, cedar] of CEDARS.entries()) {
    const ground = thresholdHeight(cedar.forward, cedar.right);
    const height = cedar.top - ground;
    const crownBase = ground + height * 0.32;
    const trunk = dye(new CylinderGeometry(0.32, 0.55, crownBase - ground + 1, 7, 1, true), CEDAR_BARK);
    trunk.translate(cedar.right, (crownBase + ground + 1) / 2 - 0.5, -cedar.forward);
    pieces.push(trunk);
    const radius = 1.6 + stableUnit(`threshold.cedar.${index}`) * 0.6;
    const profile = [
      new Vector2(0.01, 0), new Vector2(radius * 0.72, 0.02), new Vector2(radius, 0.12),
      new Vector2(radius * 0.86, 0.36), new Vector2(radius * 0.6, 0.62), new Vector2(radius * 0.3, 0.86), new Vector2(0.01, 1),
    ].map((point) => new Vector2(point.x, point.y * (cedar.top - crownBase)));
    const crown = dye(new LatheGeometry(profile, 9), CEDAR_NEEDLE);
    crown.translate(cedar.right, crownBase, -cedar.forward);
    pieces.push(crown);
  }
  const merged = mergeGeometries(pieces, false)!;
  pieces.forEach((piece) => piece.dispose());
  return merged;
}

interface StoneSpec {
  forward: number;
  right: number;
  form: Exclude<SetStoneForm, "arching">;
  scale: readonly [number, number, number];
  yaw: number;
}

// The unequal triad belongs to the larger left shelf. The reclining stone
// occludes the far steps: the approach continues behind it, not to a dead end.
const SET_STONES: readonly StoneSpec[] = [
  { forward: 22, right: -3.9, form: "reclining", scale: [1.6, 2.25, 1.3], yaw: 0.1 },
  { forward: 24, right: -6.8, form: "tall", scale: [0.8, 1.35, 0.75], yaw: 0.5 },
  { forward: 21.2, right: -6.3, form: "low", scale: [1.05, 0.85, 0.95], yaw: 1.1 },
  { forward: 17, right: 1, form: "flat", scale: [0.65, 1.2, 0.7], yaw: 0.1 },
  { forward: 19, right: 0.2, form: "flat", scale: [0.7, 1.2, 0.65], yaw: 0.3 },
  { forward: 21, right: -0.7, form: "flat", scale: [0.75, 1.2, 0.7], yaw: -0.2 },
  { forward: 22.5, right: -1.45, form: "flat", scale: [0.65, 1.2, 0.7], yaw: 0.3 },
  { forward: 24.7, right: -4.45, form: "flat", scale: [0.65, 1.2, 0.7], yaw: 0.2 },
];

function setStone(index: number, stone: StoneSpec, ground: number): BufferGeometry {
  const shell = new SphereGeometry(0.5, 14, 10);
  shell.deleteAttribute("normal");
  shell.deleteAttribute("uv");
  const geometry = mergeVertices(shell);
  shell.dispose();
  const position = geometry.getAttribute("position");
  const proportions = stone.form === "tall" ? [0.82, 1.7, 0.72]
    : stone.form === "reclining" ? [1.7, 0.72, 0.85]
      : stone.form === "flat" ? [1.55, 0.5, 1.2] : [1.05, 0.95, 0.9];
  const phase = stableUnit(`threshold.stone.${index}.weathering`) * Math.PI * 2;
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const x = position.getX(vertex), y = position.getY(vertex), z = position.getZ(vertex);
    const weathering = 1 + 0.09 * Math.sin(x * 7 + phase) * Math.cos(z * 6 - phase)
      + 0.025 * Math.sin(y * 13 + phase);
    const shoulder = 1 - 0.18 * Math.max(0, y * 2);
    // One gently tilted bedding plane; the weathered ellipsoid supplies broad
    // feet and rounded shoulders instead of a box's straight extruded walls.
    const bedding = 0.28 + x * 0.045 - z * 0.035;
    position.setXYZ(vertex, x * weathering * shoulder * proportions[0]!,
      Math.min(y * weathering, bedding) * proportions[1]!,
      z * weathering * shoulder * proportions[2]!);
  }
  geometry.computeVertexNormals();
  dye(geometry, SET_STONE);
  geometry.scale(...stone.scale);
  geometry.rotateY(stone.yaw);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  // Seat 48% of the actual weathered bounds below the rendered local terrain.
  const burial = bounds.min.y + (bounds.max.y - bounds.min.y) * 0.48;
  const colors = geometry.getAttribute("color") as BufferAttribute;
  const normal = geometry.getAttribute("normal");
  const color = new Color();
  const height = bounds.max.y - bounds.min.y;
  const roles = new Float32Array(position.count).fill(GARDEN_SURFACE_ROLE_CODES.stone);
  const detail = new Float32Array(position.count);
  const uv = new Float32Array(position.count * 2);
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const aboveContact = (position.getY(vertex) - burial) / height;
    const lift = Math.min(1, Math.max(0, aboveContact / 0.22));
    color.copy(STONE_CONTACT).lerp(SET_STONE, lift);
    const up = Math.max(0, normal.getY(vertex));
    if (stone.form === "flat") color.lerp(STEP_WORN, up * lift);
    else {
      color.lerp(STONE_CROWN, up * 0.85 * lift);
      if (stone.form === "reclining") {
        const cap = Math.max(0, Math.sin(position.getX(vertex) * 2 + 0.8) * Math.cos(position.getZ(vertex) * 2));
        color.lerp(STONE_MOSS, up * cap * 0.48 * lift);
      }
    }
    color.toArray(colors.array, vertex * 3);
    detail[vertex] = lift * (1 - up * 0.24);
    uv[vertex * 2] = position.getX(vertex);
    uv[vertex * 2 + 1] = position.getZ(vertex);
  }
  geometry.setAttribute(GARDEN_SURFACE_ROLE_ATTRIBUTE, new BufferAttribute(roles, 1));
  geometry.setAttribute(GARDEN_SURFACE_WEIGHT_ATTRIBUTE, new BufferAttribute(detail, 1));
  geometry.setAttribute("uv", new BufferAttribute(uv, 2));
  geometry.translate(stone.right, ground - burial, -stone.forward);
  return geometry;
}

export interface GardenThresholdStoneSite {
  readonly form: SetStoneForm;
  /** Root-local, world-aligned geometric bounds; these are not record IDs. */
  readonly bounds: Box3;
  readonly contactHeight: number;
  readonly firstTriangle: number;
  readonly triangleCount: number;
  readonly surfacePoint: Vector3;
}

function buildStones(toWorldAxes: Matrix4, heightAt: (forward: number, right: number) => number): { geometry: BufferGeometry; sites: GardenThresholdStoneSite[] } {
  const pieces: BufferGeometry[] = [];
  const sites: GardenThresholdStoneSite[] = [];
  let firstTriangle = 0;
  for (const [index, stone] of SET_STONES.entries()) {
    const contactHeight = heightAt(stone.forward, stone.right);
    const geometry = setStone(index, stone, contactHeight).applyMatrix4(toWorldAxes);
    geometry.computeBoundingBox();
    const triangleCount = geometry.index!.count / 3;
    const bounds = geometry.boundingBox!.clone();
    sites.push({ form: stone.form, bounds, contactHeight,
      firstTriangle, triangleCount,
      surfacePoint: new Vector3(stone.right, bounds.max.y, -stone.forward).applyMatrix4(toWorldAxes) });
    firstTriangle += triangleCount;
    pieces.push(geometry);
  }
  const geometry = mergeGeometries(pieces, false)!;
  pieces.forEach((piece) => piece.dispose());
  return { geometry, sites };
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
  seatBox(builder, [edge - 0.1, edge + 0.045], [DECK_LEFT - 0.1, DECK_RIGHT + 0.1],
    [PLATEAU - 0.31, PLATEAU - 0.25], DECK_SEAM);
  // Posts, eave and the tea-house body behind the seat: off frame above,
  // beside and behind every rest view. The shallow eave holds the front
  // corner in shade without blacking out the middle-near garden at noon.
  for (const right of [DECK_LEFT + 0.3, 6, DECK_RIGHT - 0.3]) {
    for (const forward of [DECK_BACK + 0.3, edge - 0.55]) {
      if (right === 6 && forward > 0) continue;
      seatBox(builder, [forward - 0.18, forward + 0.18], [right - 0.18, right + 0.18], [top, 18.5], DECK_EDGE);
    }
  }
  const eaveFront = 1;
  const houseBack = -12;
  seatBox(builder, [houseBack, DECK_BACK], [DECK_LEFT - 1, DECK_RIGHT + 9], [PLATEAU - 0.2, 18.4], EAVE);
  seatBox(builder, [houseBack - 0.8, DECK_BACK], [DECK_RIGHT + 4.5, DECK_RIGHT + 9.5], [18.4, 18.9], EAVE);
  seatBox(builder, [houseBack - 0.8, eaveFront], [DECK_LEFT - 2, DECK_RIGHT + 0.5], [18.4, 18.9], EAVE);
  seatBox(builder, [houseBack - 0.5, DECK_BACK - 1], [DECK_LEFT - 1.5, DECK_RIGHT], [18.9, 20.4], EAVE);
  const woodVertexCount = builder.positions.length / 3;

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
  for (const part of parts) {
    const position = part.getAttribute("position");
    const normal = part.getAttribute("normal");
    const roles = new Float32Array(position.count).fill(GARDEN_SURFACE_ROLE_CODES.stone);
    const weights = new Float32Array(position.count);
    const uv = new Float32Array(position.count * 2);
    if (part === boxes) {
      for (let vertex = 0; vertex < woodVertexCount; vertex += 1) {
        roles[vertex] = GARDEN_SURFACE_ROLE_CODES.timber;
        weights[vertex] = 1;
        const top = Math.abs(normal.getY(vertex)) > 0.5;
        const front = Math.abs(normal.getZ(vertex)) > 0.5;
        uv[vertex * 2] = front ? position.getX(vertex) : -position.getZ(vertex);
        uv[vertex * 2 + 1] = top ? position.getX(vertex) : position.getY(vertex);
      }
    }
    // The tōrō keeps zero surface weight: its chamber emission, stone pigment
    // and authored normals are not modified by the timber atlas finish.
    part.setAttribute(GARDEN_SURFACE_ROLE_ATTRIBUTE, new BufferAttribute(roles, 1));
    part.setAttribute(GARDEN_SURFACE_WEIGHT_ATTRIBUTE, new BufferAttribute(weights, 1));
    part.setAttribute("uv", new BufferAttribute(uv, 2));
  }
  const geometry = mergeGeometries(parts, false)!;
  parts.forEach((part) => part.dispose());
  geometry.computeBoundingSphere();
  return { chamberCentre: new Vector3(tr, ground + (TORO_CORE.top + TORO_CORE.bottom) / 2, -tf), geometry };
}


/**
 * The hero kuromatsu, rooted just past the deck's front-left corner. Its
 * plated trunk rises out of the lower-left corner and sweeps away left over
 * the bank (leaving the frame below the lowest navigable water), then climbs
 * out of view; its one long low limb (sashi-eda) runs back in above eye
 * height and carries separate porous sprays across the upper-left edge,
 * seen from below. Trunk nodes are root-local (+x = seat right, −z = seat
 * forward); the upper tiers turn left and back, out of every rest frame.
 */
const HERO_ROOT = { forward: 5.8, right: -2 } as const;
const HERO_TRUNK: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0], [-0.9, 0.45, -0.3], [-2.1, 1, -0.9], [-3.3, 2.2, -1.6], [-4, 4.6, -2.6], [-4.2, 7.4, -3.4], [-4, 9.2, -3.8],
];
const NEAR_NEEDLES = { needles: 96, length: 0.34, spread: 1.1 } as const;
const UPPER_NEEDLES = { needles: 64, length: 0.3, spread: 1.05 } as const;
const HERO_LIMBS: readonly KuromatsuLimb[] = [
  // One long primary, three unequal secondary forks, then individual twigs.
  { parent: 0, at: 0.443, order: "primary", points: [[-3.8, 2.8, -4.6], [-3.1, 3, -7], [-2.1, 3.95, -8.2]], radii: [0.18, 0.028] },
  { parent: 1, at: 0.5, order: "secondary", points: [[-4.2, 3.4, -6.8], [-4, 4.1, -7.7]], radii: [0.045, 0.014] },
  { parent: 2, at: 0.55, order: "twig", points: [[-4.45, 4.3, -7.5], [-4.55, 4.4, -7.8]], radii: [0.012, 0.004], spray: NEAR_NEEDLES },
  { parent: 2, at: 0.8, order: "twig", points: [[-3.75, 4.35, -8.05]], radii: [0.01, 0.003], spray: NEAR_NEEDLES },
  { parent: 2, at: 1, order: "twig", points: [[-4.12, 4.2, -8.15]], radii: [0.009, 0.003], spray: NEAR_NEEDLES },
  { parent: 1, at: 0.72, order: "secondary", points: [[-2.7, 3.1, -6.6], [-2.3, 3.25, -6.2]], radii: [0.035, 0.011] },
  { parent: 6, at: 0.6, order: "twig", points: [[-2.6, 3.45, -5.95]], radii: [0.01, 0.003], spray: NEAR_NEEDLES },
  { parent: 6, at: 0.82, order: "twig", points: [[-1.95, 3.4, -6.45]], radii: [0.009, 0.003], spray: NEAR_NEEDLES },
  { parent: 6, at: 1, order: "twig", points: [[-2.35, 3.65, -6.55]], radii: [0.008, 0.0025], spray: NEAR_NEEDLES },
  { parent: 1, at: 0.94, order: "secondary", points: [[-2.05, 4.03, -8.15], [-2.15, 4.17, -8.4]], radii: [0.028, 0.01] },
  { parent: 10, at: 0.5, order: "twig", points: [[-1.82, 4.35, -8.2]], radii: [0.009, 0.0025], spray: NEAR_NEEDLES },
  { parent: 10, at: 0.8, order: "twig", points: [[-2.5, 4.28, -8.55]], radii: [0.008, 0.0025], spray: NEAR_NEEDLES },
  { parent: 10, at: 1, order: "twig", points: [[-2.05, 4.5, -8.75]], radii: [0.007, 0.002], spray: NEAR_NEEDLES },
  // Upper arms stay outside the seated picture but retain porous corner shade.
  { parent: 0, at: 0.7, order: "primary", points: [[-5.2, 5.1, -4], [-6.1, 5.5, -4.2]], radii: [0.09, 0.02] },
  { parent: 14, at: 0.8, order: "secondary", points: [[-6.4, 5.8, -4.5]], radii: [0.025, 0.007] },
  { parent: 15, at: 0.9, order: "twig", points: [[-6.5, 6.05, -4.9]], radii: [0.006, 0.002], spray: UPPER_NEEDLES },
  { parent: 0, at: 0.86, order: "primary", points: [[-3.5, 7, -4.7], [-3, 7.4, -5.8]], radii: [0.08, 0.018] },
  { parent: 17, at: 0.8, order: "twig", points: [[-2.7, 7.8, -6]], radii: [0.009, 0.003], spray: UPPER_NEEDLES },
  { parent: 0, at: 0.97, order: "primary", points: [[-4.6, 9.05, -4.5]], radii: [0.05, 0.013] },
  { parent: 19, at: 0.9, order: "twig", points: [[-4.8, 9.5, -4.8]], radii: [0.004, 0.0015], spray: UPPER_NEEDLES },
];
/**
 * The companion pine for the tall 720×900 seat (10.95 u to the right on the
 * same deck). It stands in the wedge between the landscape frames' right edge
 * and the tall frame's left edge, so only its sashi-eda's sprays enter the tall
 * frame at the upper left; no landscape frame sees any of it.
 */
const COMPANION_ROOT = { forward: 5.1, right: 6.4 } as const;
const COMPANION_TRUNK: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0], [0.25, 1.6, 0.2], [0.12, 3.4, 0.45], [0.45, 5.2, 0.6], [0.35, 7, 0.8],
];
const COMPANION_NEEDLES = { needles: 88, length: 0.26, spread: 1.1 } as const;
const COMPANION_LIMBS: readonly KuromatsuLimb[] = [
  { parent: 0, at: 0.372, order: "primary", points: [[0.55, 2.7, -1], [1.9, 2.85, -5], [2.8, 3.55, -7.8]], radii: [0.13, 0.018] },
  { parent: 1, at: 0.55, order: "secondary", points: [[1.4, 3.35, -6], [1.72, 3.8, -6.9]], radii: [0.03, 0.01] },
  { parent: 2, at: 0.55, order: "twig", points: [[1.38, 3.95, -6.6]], radii: [0.008, 0.0025], spray: COMPANION_NEEDLES },
  { parent: 2, at: 0.8, order: "twig", points: [[1.94, 4.05, -7.1]], radii: [0.007, 0.002], spray: COMPANION_NEEDLES },
  { parent: 2, at: 1, order: "twig", points: [[1.65, 3.95, -7.25]], radii: [0.006, 0.002], spray: COMPANION_NEEDLES },
  { parent: 1, at: 0.75, order: "secondary", points: [[2.25, 2.95, -5.8], [2.55, 3.05, -5.9]], radii: [0.024, 0.008] },
  { parent: 6, at: 0.55, order: "twig", points: [[2.2, 3.2, -5.65]], radii: [0.007, 0.002], spray: COMPANION_NEEDLES },
  { parent: 6, at: 0.8, order: "twig", points: [[2.85, 3.3, -6.1]], radii: [0.006, 0.002], spray: COMPANION_NEEDLES },
  { parent: 6, at: 1, order: "twig", points: [[2.45, 3.45, -6.25]], radii: [0.005, 0.0015], spray: COMPANION_NEEDLES },
  { parent: 1, at: 0.95, order: "secondary", points: [[2.7, 3.75, -7.8], [2.85, 3.85, -8.1]], radii: [0.018, 0.006] },
  { parent: 10, at: 0.6, order: "twig", points: [[2.55, 4.05, -7.95]], radii: [0.005, 0.0015], spray: COMPANION_NEEDLES },
  { parent: 10, at: 0.85, order: "twig", points: [[3.1, 4, -8.2]], radii: [0.0045, 0.0015], spray: COMPANION_NEEDLES },
  { parent: 10, at: 1, order: "twig", points: [[2.8, 4.2, -8.4]], radii: [0.004, 0.001], spray: COMPANION_NEEDLES },
  { parent: 0, at: 0.7, order: "primary", points: [[-0.6, 4.8, 0.9], [-1.2, 5.1, 1.1]], radii: [0.075, 0.012] },
  { parent: 14, at: 0.85, order: "twig", points: [[-1.5, 5.4, 1.3]], radii: [0.008, 0.002], spray: UPPER_NEEDLES },
  { parent: 0, at: 0.88, order: "primary", points: [[1.1, 6.4, 1.7]], radii: [0.05, 0.009] },
  { parent: 16, at: 0.85, order: "twig", points: [[1.3, 6.75, 2]], radii: [0.005, 0.0015], spray: UPPER_NEEDLES },
];
/** Shared instance offset; flex is baked relative to each tree's own root. */
const PINE_BASE = PLATEAU;

export interface GardenThreshold {
  root: Group;
  drawCallCount: number;
  triangleCount: number;
  /** World-space bounds of every threshold caster and receiver (rest placement). */
  shadowBounds: Box3;
  readonly stoneSites: readonly GardenThresholdStoneSite[];
  /** Cached world-space roots at rest, hero then companion; stable across breath. */
  readonly pineRestRoots: readonly [Vector3, Vector3];
  /** Root-local metric reservation; attach S3's record to root to follow breath. */
  readonly gravelInset: { centre: Vector3; right: Vector3; forward: Vector3; normal: Vector3; width: number; depth: number; pigment: Color };
  /**
   * Follow the breathed eye: pass live eye − rest eye for the current aspect
   * class. The threshold is where the viewer sits, so it moves with the eye
   * and the corner holds through rest breath and the camera hand-off.
   */
  setEyeOffset(x: number, y: number, z: number): void;
  updateWind(weather: WeatherPlan, reducedMotion: boolean, rootGust0: number, rootGust1: number): void;
  dispose(): void;
}

function plantKuromatsu(position: Vector3, options: AuthoredKuromatsuOptions): BufferGeometry {
  return createAuthoredKuromatsuGeometry(options)
    .translate(position.x, position.y - PINE_BASE, position.z);
}


export function createGardenThreshold(surfaceAtlas?: GardenSurfaceAtlasOwner): GardenThreshold {
  const root = new Group();
  root.name = GARDEN_THRESHOLD_NAME;
  const seat = seatToWorld(0, 0, 0);
  root.position.copy(seat);
  // Geometry is authored in the seat frame and turned to world axes once, so
  // the pines' instance matrix stays world-aligned for the shared wind patch.
  const toWorldAxes = new Matrix4().makeRotationY(REST_SEAT_YAW_RAD);
  const surfaceLease = surfaceAtlas?.lease();
  // The shared lease still owns every uniform and texture. Only this seat's
  // material recipe changes: mineral grains are small, relief is shallow and
  // atlas pigments do not turn the olive substrate into a saturated lawn.
  const thresholdDetail: GardenSurfaceDetailSource | undefined = surfaceLease ? {
    key: `${surfaceLease.detailSource.key}:threshold-grain-v1`,
    uniforms: surfaceLease.detailSource.uniforms,
    glsl: /* glsl */`
#define gardenSampleSurface gardenSampleThresholdSurface
${surfaceLease.detailSource.glsl}
#undef gardenSampleSurface
GardenSurfaceDetail gardenSampleSurface(vec3 p, vec3 n, vec2 uv, float role, float metresPerRepeat) {
  bool mineral = role > 1.5 && role < 3.5;
  GardenSurfaceDetail detail = gardenSampleThresholdSurface(p, n, uv, role, mineral ? 0.45 : metresPerRepeat);
  detail.normalOffset *= mineral ? 0.1 : 0.3;
  float value = dot(detail.albedo, vec3(0.2126, 0.7152, 0.0722));
  detail.albedo = mix(vec3(value), detail.albedo, 0.25);
  return detail;
}`,
  } : undefined;

  const landMaterial = new MeshStandardMaterial({ flatShading: false, roughness: 1, vertexColors: true, envMapIntensity: 0 });
  patchGardenFloraNight(landMaterial, { nightFloor: THRESHOLD_NIGHT_FLOOR });
  applyGardenSurface(landMaterial, { role: "moss", mapping: "worldXZ", metresPerRepeat: 2.6,
    detailStrength: 0.78, vertexRoles: true, vertexWeights: true, ...(thresholdDetail ? { detailSource: thresholdDetail } : {}) });
  const landParts = buildLand();
  const land = new Mesh(landParts.geometry.applyMatrix4(toWorldAxes), landMaterial);
  land.name = GARDEN_THRESHOLD_LAND_NAME;

  const casterMaterial = new MeshStandardMaterial({ flatShading: false, roughness: 0.98, vertexColors: true });
  patchGardenFloraNight(casterMaterial, { nightFloor: THRESHOLD_NIGHT_FLOOR });
  const casters = new Mesh(buildShadeCasters().applyMatrix4(toWorldAxes), casterMaterial);
  casters.name = "garden-threshold-shade-casters";

  const stoneParts = buildStones(toWorldAxes, landParts.heightAt);
  const stoneMaterial = new MeshStandardMaterial({ flatShading: false, roughness: 0.9, vertexColors: true, envMapIntensity: 0.3 });
  patchGardenFloraNight(stoneMaterial, { nightFloor: THRESHOLD_NIGHT_FLOOR });
  applyGardenSurface(stoneMaterial, { role: "stone", mapping: "triplanar", metresPerRepeat: 2.2,
    detailStrength: 0.55, vertexRoles: true, vertexWeights: true, ...(thresholdDetail ? { detailSource: thresholdDetail } : {}) });
  const stones = new Mesh(stoneParts.geometry, stoneMaterial);
  stones.name = "garden-threshold-set-stones";

  const engawaParts = buildEngawa();
  const engawaMaterial = new MeshStandardMaterial({ flatShading: false, roughness: 0.72, vertexColors: true, envMapIntensity: 0.3 });
  // The chamber test is an axis-aligned box in geometry space: the core is a
  // cylinder, so its box is the same under the turn, and the chamber walls
  // (≥ 0.13 out) and the platform and roof (0.04 u clear) stay outside.
  const core = engawaParts.chamberCentre.applyMatrix4(toWorldAxes);
  const halfCore = new Vector3(TORO_CORE.radius + 0.002, (TORO_CORE.top - TORO_CORE.bottom) / 2, TORO_CORE.radius + 0.002);
  patchGardenToroKindling(engawaMaterial, new Box3(core.clone().sub(halfCore), core.clone().add(halfCore)), LANTERN_EMBER);
  applyGardenSurface(engawaMaterial, { role: "timber", mapping: "uv", metresPerRepeat: 0.8,
    detailStrength: 0.65, vertexRoles: true, vertexWeights: true, ...(thresholdDetail ? { detailSource: thresholdDetail } : {}) });
  const engawa = new Mesh(engawaParts.geometry.applyMatrix4(toWorldAxes), engawaMaterial);
  engawa.name = GARDEN_THRESHOLD_ENGAWA_NAME;

  const heroRoot = new Vector3(HERO_ROOT.right, thresholdHeight(HERO_ROOT.forward, HERO_ROOT.right) - 0.1, -HERO_ROOT.forward);
  const companionRoot = new Vector3(COMPANION_ROOT.right, thresholdHeight(COMPANION_ROOT.forward, COMPANION_ROOT.right) - 0.1, -COMPANION_ROOT.forward);
  const hero = plantKuromatsu(heroRoot, { seed: "threshold.hero", rootIndex: 0, trunk: HERO_TRUNK,
    radii: [0.36, 0.055], limbs: HERO_LIMBS, bark: THRESHOLD_BARK, needle: THRESHOLD_NEEDLE });
  const companion = plantKuromatsu(companionRoot, { seed: "threshold.companion", rootIndex: 1, trunk: COMPANION_TRUNK,
    radii: [0.24, 0.035], limbs: COMPANION_LIMBS, bark: THRESHOLD_BARK, needle: THRESHOLD_NEEDLE });
  const pineGeometry = mergeGeometries([hero, companion], false)!;
  hero.dispose();
  companion.dispose();
  pineGeometry.applyMatrix4(toWorldAxes);
  const pineRestRoots = [
    heroRoot.applyMatrix4(toWorldAxes).add(root.position),
    companionRoot.applyMatrix4(toWorldAxes).add(root.position),
  ] as const;
  const pineMaterial = new MeshStandardMaterial({ flatShading: false, roughness: 0.96, vertexColors: true });
  patchGardenFloraNight(pineMaterial, { nightFloor: THRESHOLD_NIGHT_FLOOR });
  patchGardenRootedWindSway(pineMaterial);
  // One instance: both trees share the draw and the world-aligned wind.
  const pines = new InstancedMesh(pineGeometry, pineMaterial, 1);
  pines.name = GARDEN_THRESHOLD_PINES_NAME;
  const pineMatrix = new Matrix4().makeTranslation(0, PINE_BASE, 0);
  pines.setMatrixAt(0, pineMatrix);
  pines.instanceMatrix.needsUpdate = true;

  const drawables = [land, stones, casters, engawa, pines];
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

  let disposed = false;
  return {
    root,
    drawCallCount: drawables.length,
    triangleCount: drawables.reduce((sum, mesh) => sum + mesh.geometry.index!.count / 3, 0),
    shadowBounds,
    stoneSites: stoneParts.sites,
    pineRestRoots,
    gravelInset: {
      centre: new Vector3(GRAVEL_INSET.right, GRAVEL_INSET_HEIGHT, -GRAVEL_INSET.forward).applyMatrix4(toWorldAxes),
      right: new Vector3(1, 0, 0).applyMatrix4(toWorldAxes),
      forward: new Vector3(0, 0, -1).applyMatrix4(toWorldAxes),
      normal: new Vector3(0, 1, 0),
      width: GRAVEL_INSET.width,
      depth: GRAVEL_INSET.depth,
      pigment: GRAVEL.clone(),
    },
    setEyeOffset(x, y, z) {
      root.position.set(seat.x + x, seat.y + y, seat.z + z);
    },
    updateWind(weather, reducedMotion, rootGust0, rootGust1) {
      updateGardenRootedWindSway(pineMaterial, weather, reducedMotion, rootGust0, rootGust1);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      disposeThreeObjectTree(root);
      root.clear();
      surfaceLease?.release();
    },
  };
}
