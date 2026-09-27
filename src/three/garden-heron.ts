import {
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { dayCycleBeats } from "./garden-day-cycle";
import { chainGardenMaterialPatch } from "./garden-aerial";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import type { GardenRitualHandler } from "../systems/garden-director";
import { HARBOR_PALETTE } from "../systems/palette";
import { REST_SEAT_YAW_RAD } from "../systems/rest-seat";

/**
 * W5.2 (life-2, K22): one grey heron, told in full.
 *
 * She comes down in the morning — out of the haze on the left, low over the
 * inlet, slow deep strokes and long flat glides, a backward flare — into the
 * shallows at the island's camera-side foot. Then she stands, neck in an S, for
 * hours; once or twice an hour she leans and strikes. At golden hour she
 * lifts, legs trailing, crosses the frame to the right and is gone.
 *
 * The arrival and the departure are the score's `heron-arrives` /
 * `heron-departs` rituals (contract S-A): the score driver calls the handlers
 * this module hands out. Between them she is simply present or absent for the
 * day, a pure function of the local hour, so a missed or refused arrival
 * still leaves a heron standing at midday (from `GARDEN_HERON_STAND_FROM_HOUR`).
 * Reduced motion: the standing pose during the day, never a flight.
 *
 * One smooth-shaded, vertex-coloured mesh (~230 triangles) whose two poses —
 * standing and flying — are both authored; the vertex shader blends them and
 * hinges the wings (shoulder and wrist) and the neck strike. No texture.
 */

/**
 * Island-local station: wading in the shallows just off the crag's waterline
 * (`GARDEN_ISLAND_OBSTACLE`), left of the tower foot as seen from the rest
 * seat, so her pale neck stands against the dark rock of the island's base.
 */
export const GARDEN_HERON_STATION = { x: -11.4, y: GARDEN_WATER_Y + 0.08, z: 13.6 } as const;
/** Standing height of the stylised heron, world units (~30 px at the rest seat). */
export const GARDEN_HERON_HEIGHT = 2.5;
/** If the arrival never flew, she is simply standing from this local hour. */
export const GARDEN_HERON_STAND_FROM_HOUR = 10.5;
export const GARDEN_HERON_ARRIVAL_SECONDS = 26;
export const GARDEN_HERON_DEPARTURE_SECONDS = 22;
/** Strikes: at most one per half-hour window, and not in every window. */
const STRIKE_WINDOW_SECONDS = 1800;
const STRIKE_CHANCE = 0.8;
const STRIKE_OUT = 0.35;
const STRIKE_HOLD = 0.3;
const STRIKE_BACK = 1.2;
/** Heron wingbeat: one slow deep stroke every 1.1 s. */
const STROKE_SECONDS = 1.1;

// Model space: +x beak, +y up, z lateral; standing feet at y = 0.
const MODEL_SCALE = GARDEN_HERON_HEIGHT / 2.45;
const SHOULDER_Y = 1.46;
const SHOULDER_Z = 0.2;
const WRIST_SPAN = 0.85;
const WING_SPAN = 1.85;
const BODY_CENTER = new Vector3(0.02, 1.38, 0);
/** A standing heron holds her body tipped up, tail low. */
const STAND_BODY_PITCH = 0.32;

const ASH = new Color(HARBOR_PALETTE.foam_white).lerp(new Color(HARBOR_PALETTE.stone_dark), 0.6)
  .lerp(new Color(HARBOR_PALETTE.fog_blue), 0.18);
const ASH_DARK = ASH.clone().lerp(new Color(HARBOR_PALETTE.iron_dark), 0.55);
const NECK_WHITE = new Color(HARBOR_PALETTE.foam_white).lerp(ASH, 0.25);
const CREST = new Color(HARBOR_PALETTE.iron_dark);
const BILL = new Color("#b99a52").lerp(new Color(HARBOR_PALETTE.stone_dark), 0.25);
const LEG = new Color("#8a7a58").lerp(new Color(HARBOR_PALETTE.stone_dark), 0.45);

type Pose = "stand" | "fly";
interface HeronPart {
  build: (pose: Pose) => BufferGeometry;
  bone: 0 | 1 | 2;
  colour: (position: Vector3, pose: Pose, index: number) => Color;
  /** 0..1 strike weight per vertex (neck base 0 → head/bill 1). */
  neck?: (index: number, count: number) => number;
  /** Signed span fraction for wing vertices (+ port / − starboard). */
  span?: (position: Vector3) => number;
}

const scratchStand = new Vector3();

function rotateAbout(geometry: BufferGeometry, center: Vector3, pitch: number): void {
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.rotateZ(pitch);
  geometry.translate(center.x, center.y, center.z);
}

/** A tapered tube along points, `sides` around, same topology for every pose. */
function taperedTube(points: readonly Vector3[], radii: readonly number[], sides: number): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const up = new Vector3(0, 0, 1);
  for (let ring = 0; ring < points.length; ring += 1) {
    const here = points[ring]!;
    const next = points[Math.min(points.length - 1, ring + 1)]!;
    const previous = points[Math.max(0, ring - 1)]!;
    const tangent = next.clone().sub(previous).normalize();
    const side = up.clone().cross(tangent).normalize();
    const normal = tangent.clone().cross(side).normalize();
    for (let step = 0; step < sides; step += 1) {
      const angle = (step / sides) * Math.PI * 2;
      const offset = side.clone().multiplyScalar(Math.cos(angle) * radii[ring]!)
        .add(normal.clone().multiplyScalar(Math.sin(angle) * radii[ring]!));
      positions.push(here.x + offset.x, here.y + offset.y, here.z + offset.z);
    }
  }
  for (let ring = 0; ring < points.length - 1; ring += 1) {
    for (let step = 0; step < sides; step += 1) {
      const a = ring * sides + step;
      const b = ring * sides + ((step + 1) % sides);
      indices.push(a, b, a + sides, b, b + sides, a + sides);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

function curvePoints(control: readonly [number, number][], stations: number): Vector3[] {
  const curve = new CatmullRomCurve3(control.map(([x, y]) => new Vector3(x, y, 0)));
  return Array.from({ length: stations }, (_, index) => curve.getPoint(index / (stations - 1)));
}

const NECK_STATIONS = 7;
const NECK_STAND: readonly [number, number][] = [[0.42, 1.52], [0.62, 1.8], [0.42, 2.04], [0.5, 2.3]];
const NECK_FLY: readonly [number, number][] = [[0.5, 1.44], [0.72, 1.36], [0.7, 1.52], [0.9, 1.5]];
const NECK_RADII = [0.11, 0.095, 0.08, 0.07, 0.065, 0.065, 0.07];

function neckEnd(pose: Pose): Vector3 {
  const points = curvePoints(pose === "stand" ? NECK_STAND : NECK_FLY, NECK_STATIONS);
  return points[points.length - 1]!;
}

/** Wing panel: span stations × chord stations, flat along ±z in the flying pose. */
function wingGeometry(side: 1 | -1, pose: Pose): BufferGeometry {
  const spanStations = [0, 0.3, WRIST_SPAN / WING_SPAN, 0.72, 0.88, 1];
  const chordStations = [0, 0.5, 1];
  const positions: number[] = [];
  const indices: number[] = [];
  for (const s of spanStations) {
    // Broad inner wing, rounded fingered tip, a little sweep behind the wrist.
    const chord = 0.62 * (1 - 0.45 * s * s) * (s > 0.9 ? 0.75 : 1);
    const lead = 0.22 - 0.18 * Math.max(0, s - 0.45);
    for (const t of chordStations) {
      if (pose === "fly") {
        positions.push(lead - t * chord, SHOULDER_Y + 0.02 * (1 - t), side * (SHOULDER_Z + s * WING_SPAN));
      } else {
        // Folded along the flank: span runs aft, chord runs down.
        positions.push(0.3 - s * 0.82 - t * 0.08, SHOULDER_Y - 0.04 - t * 0.2 + s * 0.02, side * (0.24 + 0.03 * (1 - s)));
      }
    }
  }
  const across = chordStations.length;
  for (let row = 0; row < spanStations.length - 1; row += 1) {
    for (let column = 0; column < across - 1; column += 1) {
      const a = row * across + column;
      const b = a + 1;
      const c = a + across;
      const d = c + 1;
      if (side > 0) indices.push(a, c, b, b, c, d);
      else indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  if (pose === "stand") rotateAbout(geometry, BODY_CENTER, STAND_BODY_PITCH);
  return geometry;
}

const PARTS: readonly HeronPart[] = [
  {
    // Body: a long ellipsoid, tipped up when she stands.
    bone: 0,
    build: (pose) => {
      const geometry = new SphereGeometry(1, 8, 6);
      geometry.scale(0.6, 0.27, 0.24);
      geometry.translate(BODY_CENTER.x, BODY_CENTER.y, BODY_CENTER.z);
      if (pose === "stand") rotateAbout(geometry, BODY_CENTER, STAND_BODY_PITCH);
      return geometry;
    },
    colour: (position) => (position.y < BODY_CENTER.y - 0.12 ? NECK_WHITE.clone().lerp(ASH, 0.5) : ASH),
  },
  {
    // The S-neck: extended when standing, retracted into the shoulders in flight.
    bone: 1,
    build: (pose) => taperedTube(curvePoints(pose === "stand" ? NECK_STAND : NECK_FLY, NECK_STATIONS), NECK_RADII, 5),
    colour: () => NECK_WHITE,
    neck: (index) => Math.floor(index / 5) / (NECK_STATIONS - 1),
  },
  {
    // Head, with the dark crest stroke on its crown and nape.
    bone: 1,
    build: (pose) => {
      const geometry = new SphereGeometry(1, 6, 4);
      geometry.scale(0.15, 0.085, 0.075);
      const end = neckEnd(pose);
      geometry.translate(end.x + 0.06, end.y + 0.03, 0);
      return geometry;
    },
    colour: (position, pose) => {
      const end = neckEnd(pose);
      return position.y > end.y + 0.05 || position.x < end.x - 0.02 ? CREST : NECK_WHITE;
    },
    neck: () => 1,
  },
  {
    // Crest plume trailing from the nape.
    bone: 1,
    build: (pose) => {
      const end = neckEnd(pose);
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute([
        end.x - 0.02, end.y + 0.08, 0,
        end.x - 0.05, end.y + 0.02, 0,
        end.x - 0.34, end.y - 0.02, 0,
      ], 3));
      geometry.setIndex([0, 1, 2]);
      return geometry;
    },
    colour: () => CREST,
    neck: () => 1,
  },
  {
    // Dagger bill.
    bone: 1,
    build: (pose) => {
      const end = neckEnd(pose);
      const base = new Vector3(end.x + 0.17, end.y + 0.02, 0);
      const tip = base.clone().add(new Vector3(0.4, pose === "stand" ? -0.05 : -0.02, 0));
      return taperedTube([base, base.clone().lerp(tip, 0.5), tip], [0.035, 0.022, 0.002], 4);
    },
    colour: () => BILL,
    neck: () => 1,
  },
  ...([1, -1] as const).map((side): HeronPart => ({
    // Legs: straight down to the stone when standing, trailing aft in flight.
    bone: 0,
    build: (pose) => {
      const z = side * 0.07;
      const points = pose === "stand"
        ? [new Vector3(0.02, 1.2, z), new Vector3(0.0, 0.6, z), new Vector3(0.04, 0.0, z)]
        : [new Vector3(-0.3, 1.25, z), new Vector3(-0.85, 1.22, z), new Vector3(-1.35, 1.2, z)];
      return taperedTube(points, [0.035, 0.028, 0.024], 4);
    },
    colour: () => LEG,
  })),
  ...([1, -1] as const).map((side): HeronPart => ({
    bone: 2,
    build: (pose) => wingGeometry(side, pose),
    colour: (_position, _pose, index) => {
      // Slate primaries toward the tip and the trailing edge.
      const spanRow = Math.floor(index / 3);
      const trailing = index % 3 === 2;
      if (spanRow >= 4) return ASH_DARK;
      return trailing ? ASH.clone().lerp(ASH_DARK, 0.45) : ASH;
    },
    span: (position) => side * MathUtils.clamp((Math.abs(position.z) - SHOULDER_Z) / WING_SPAN, 0, 1),
  })),
];

/**
 * Builds the heron: `position`/`normal` are the flying pose, `aStand` /
 * `aStandNormal` the standing pose, `aBone` (0 body, 1 neck, 2 wing),
 * `aWing` the signed span fraction, `aNeck` the strike weight.
 */
export function createGardenHeronGeometry(): BufferGeometry {
  const merged: BufferGeometry[] = [];
  for (const part of PARTS) {
    const fly = part.build("fly");
    const stand = part.build("stand");
    const flyIndexed = fly.index ? fly.toNonIndexed() : fly;
    const standIndexed = stand.index ? stand.toNonIndexed() : stand;
    // Per-vertex tags are read from the indexed source, then expanded.
    const sourceCount = fly.getAttribute("position").count;
    const sourceIndex = fly.index ? Array.from(fly.index.array) : Array.from({ length: sourceCount }, (_, i) => i);
    const flyPosition = fly.getAttribute("position");
    flyIndexed.computeVertexNormals();
    standIndexed.computeVertexNormals();
    const count = flyIndexed.getAttribute("position").count;
    const colours = new Float32Array(count * 3);
    const bones = new Float32Array(count).fill(part.bone);
    const wings = new Float32Array(count);
    const necks = new Float32Array(count);
    for (let vertex = 0; vertex < count; vertex += 1) {
      const source = sourceIndex[vertex]!;
      scratchStand.fromBufferAttribute(flyPosition, source);
      part.colour(scratchStand, "fly", source).toArray(colours, vertex * 3);
      if (part.span) wings[vertex] = part.span(scratchStand);
      if (part.neck) necks[vertex] = part.neck(source, sourceCount);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", flyIndexed.getAttribute("position"));
    geometry.setAttribute("normal", flyIndexed.getAttribute("normal"));
    geometry.setAttribute("aStand", standIndexed.getAttribute("position"));
    geometry.setAttribute("aStandNormal", standIndexed.getAttribute("normal"));
    geometry.setAttribute("color", new Float32BufferAttribute(colours, 3));
    geometry.setAttribute("aBone", new Float32BufferAttribute(bones, 1));
    geometry.setAttribute("aWing", new Float32BufferAttribute(wings, 1));
    geometry.setAttribute("aNeck", new Float32BufferAttribute(necks, 1));
    merged.push(geometry);
    for (const disposable of new Set([fly, stand, flyIndexed, standIndexed])) disposable.dispose();
  }
  const geometry = mergeGeometries(merged, false);
  for (const part of merged) part.dispose();
  if (!geometry) throw new Error("garden-heron: merge failed");
  geometry.scale(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
  const stand = geometry.getAttribute("aStand");
  for (let vertex = 0; vertex < stand.count; vertex += 1) {
    stand.setXYZ(vertex, stand.getX(vertex) * MODEL_SCALE, stand.getY(vertex) * MODEL_SCALE, stand.getZ(vertex) * MODEL_SCALE);
  }
  return geometry;
}

const HERON_VERTEX_PARS = /* glsl */`
attribute vec3 aStand;
attribute vec3 aStandNormal;
attribute float aBone;
attribute float aWing;
attribute float aNeck;
uniform float uPose;
uniform float uFlapInner;
uniform float uFlapOuter;
uniform float uStrike;
vec2 heronRotate(vec2 v, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(v.x * c + v.y * s, -v.x * s + v.y * c);
}
`;

/** Wing hinge in (y, lateral) about the shoulder, the outer panel lagging at the wrist. */
const HERON_WING = /* glsl */`
  float heronSide = aWing < 0.0 ? -1.0 : 1.0;
  float heronOuter = step(${(WRIST_SPAN / WING_SPAN).toFixed(4)} + 0.001, abs(aWing));
`;

const HERON_BEGIN_NORMAL = /* glsl */`
  ${HERON_WING}
  vec3 heronFlyNormal = objectNormal;
  if (aBone > 1.5) {
    vec2 n = heronRotate(vec2(heronFlyNormal.y, heronFlyNormal.z * heronSide), uFlapInner + uFlapOuter * heronOuter);
    heronFlyNormal = vec3(heronFlyNormal.x, n.x, n.y * heronSide);
  }
  objectNormal = normalize(mix(aStandNormal, heronFlyNormal, uPose));
`;

const HERON_BEGIN_VERTEX = /* glsl */`
  vec3 heronFly = transformed;
  if (aBone > 1.5) {
    float shoulderY = ${(SHOULDER_Y * MODEL_SCALE).toFixed(4)};
    float shoulderZ = ${(SHOULDER_Z * MODEL_SCALE).toFixed(4)};
    float wrist = ${(WRIST_SPAN * MODEL_SCALE).toFixed(4)};
    vec2 arm = vec2(heronFly.y - shoulderY, abs(heronFly.z) - shoulderZ);
    vec2 bent = arm.y > wrist
      ? heronRotate(vec2(0.0, wrist), uFlapInner) + heronRotate(arm - vec2(0.0, wrist), uFlapInner + uFlapOuter)
      : heronRotate(arm, uFlapInner);
    heronFly.y = shoulderY + bent.x;
    heronFly.z = heronSide * (shoulderZ + bent.y);
  }
  vec3 heronStand = aStand + aNeck * uStrike * vec3(${(0.55 * MODEL_SCALE).toFixed(4)}, ${(-0.42 * MODEL_SCALE).toFixed(4)}, 0.0);
  transformed = mix(heronStand, heronFly, uPose);
`;

export type GardenHeronRitualKind = "heron-arrives" | "heron-departs";

export interface GardenHeronUpdate {
  /** Director clock (wall epoch seconds), the rituals' `t`. */
  clockSeconds: number;
  reducedMotion: boolean;
  /** Ambient life allowed (tier, constrained, overview detail). */
  visible: boolean;
  /** Local wall-clock hour, 0–24. */
  wallClockHour: number;
}

export type GardenHeronState = "absent" | "arriving" | "standing" | "departing";

export interface GardenHeron {
  mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
  /** Island-anchored: the renderer seats it at the island root on each build. */
  root: Group;
  dispose: () => void;
  /** The S-A ritual handler for one of the heron's two rituals. */
  ritual: (kind: GardenHeronRitualKind) => GardenRitualHandler;
  update: (input: GardenHeronUpdate) => void;
  /** For tests and the debug seam: what she is doing right now. */
  state: () => GardenHeronState;
}

/** Island-local point from (screen-right, toward-camera, up) at the rest seat. */
function seatLocal(right: number, toward: number, up: number): Vector3 {
  const rx = Math.cos(REST_SEAT_YAW_RAD);
  const rz = -Math.sin(REST_SEAT_YAW_RAD);
  const tx = Math.sin(REST_SEAT_YAW_RAD);
  const tz = Math.cos(REST_SEAT_YAW_RAD);
  return new Vector3(right * rx + toward * tx, up, right * rz + toward * tz);
}

function stationSeat(): { right: number; toward: number } {
  const rx = Math.cos(REST_SEAT_YAW_RAD);
  const rz = -Math.sin(REST_SEAT_YAW_RAD);
  const tx = Math.sin(REST_SEAT_YAW_RAD);
  const tz = Math.cos(REST_SEAT_YAW_RAD);
  return {
    right: GARDEN_HERON_STATION.x * rx + GARDEN_HERON_STATION.z * rz,
    toward: GARDEN_HERON_STATION.x * tx + GARDEN_HERON_STATION.z * tz,
  };
}

/**
 * The two flights, island-local. In: out of the haze upper-left, low over the
 * inlet, the last leg aligned with her standing heading (screen-right, a
 * little toward the viewer) so the flare lands her facing it. Out: the same
 * heading, low across the island's foot, climbing away off the right.
 */
function heronFlights(): { arrival: CatmullRomCurve3; departure: CatmullRomCurve3; heading: Vector3 } {
  const { right, toward } = stationSeat();
  const y = GARDEN_HERON_STATION.y;
  const heading = seatLocal(0.94, 0.34, 0).normalize();
  const station = new Vector3(GARDEN_HERON_STATION.x, y, GARDEN_HERON_STATION.z);
  const approach = station.clone().addScaledVector(heading, -4.5).setY(y + 1.4);
  const arrival = new CatmullRomCurve3([
    seatLocal(right - 72, toward + 4, y + 22),
    seatLocal(right - 44, toward + 22, y + 10),
    seatLocal(right - 22, toward + 14, y + 4),
    approach,
    station,
  ], false, "centripetal");
  const lift = station.clone().addScaledVector(heading, 3.5).setY(y + 1.6);
  const departure = new CatmullRomCurve3([
    station,
    lift,
    seatLocal(right + 18, toward + 14, y + 5),
    seatLocal(right + 46, toward + 10, y + 9),
    seatLocal(right + 92, toward - 14, y + 16),
  ], false, "centripetal");
  return { arrival, departure, heading };
}

function strikeEnvelope(clockSeconds: number): number {
  const window = Math.floor(clockSeconds / STRIKE_WINDOW_SECONDS);
  const hash = (n: number) => {
    const value = Math.sin(n) * 43758.5453123;
    return value - Math.floor(value);
  };
  if (hash(window * 1.93 + 0.41) > STRIKE_CHANCE) return 0;
  const start = window * STRIKE_WINDOW_SECONDS + 120 + hash(window * 7.17 + 2.3) * (STRIKE_WINDOW_SECONDS - 240);
  const age = clockSeconds - start;
  if (age < 0 || age > STRIKE_OUT + STRIKE_HOLD + STRIKE_BACK) return 0;
  if (age < STRIKE_OUT) {
    const t = age / STRIKE_OUT;
    return 1 - (1 - t) * (1 - t);
  }
  if (age < STRIKE_OUT + STRIKE_HOLD) return 1;
  const t = (age - STRIKE_OUT - STRIKE_HOLD) / STRIKE_BACK;
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Wing hinge angles at `age` seconds into a flight: slow deep strokes in sets,
 * long flat glides on bowed wings between them. `strokes` of 1.1 s each, then
 * `glide` seconds; returns [inner, outer] in radians (+ = tips up).
 */
export function gardenHeronWingbeat(age: number, strokes = 3, glide = 2.6): [number, number] {
  const cycle = strokes * STROKE_SECONDS + glide;
  const inCycle = ((age % cycle) + cycle) % cycle;
  if (inCycle >= strokes * STROKE_SECONDS) return [-0.1, -0.12];
  const phase = (inCycle / STROKE_SECONDS) * Math.PI * 2;
  const lagged = phase - 0.18 * Math.PI * 2;
  // The downstroke is the deep one; the wings come back up bowed.
  return [0.62 * (0.85 * Math.cos(phase) + 0.15), 0.38 * Math.cos(lagged)];
}

export interface GardenHeronOptions {
  /**
   * Registers the two ritual handlers with the score driver (S-A
   * `registerRitual`); `dispose` releases them. Omit in tests.
   */
  registerRitual?: (kind: GardenHeronRitualKind, handler: GardenRitualHandler) => () => void;
}

/**
 * One heron for the renderer's life, like the keeper: island rebuilds only
 * re-seat her root (at the island root), so a flight in progress survives a
 * content swap and the rituals stay registered to the bird on screen.
 */
export function createGardenHeron(options: GardenHeronOptions = {}): GardenHeron {
  const geometry = createGardenHeronGeometry();
  const material = new MeshStandardMaterial({
    roughness: 0.92,
    side: DoubleSide,
    vertexColors: true,
  });
  const uniforms = {
    uFlapInner: { value: 0 },
    uFlapOuter: { value: 0 },
    uPose: { value: 0 },
    uStrike: { value: 0 },
  };
  chainGardenMaterialPatch(material, {
    key: "garden-heron-pose-v1",
    compile: (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${HERON_VERTEX_PARS}`)
        .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>\n${HERON_BEGIN_NORMAL}`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>\n${HERON_BEGIN_VERTEX}`);
    },
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = "garden-heron";
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const root = new Group();
  root.name = "garden-heron-root";
  root.visible = false;
  const bird = new Group();
  bird.name = "garden-heron-bird";
  bird.add(mesh);
  root.add(bird);

  const { arrival, departure, heading } = heronFlights();
  const standYaw = Math.atan2(-heading.z, heading.x);
  const point = new Vector3();
  const tangent = new Vector3();
  const ahead = new Vector3();

  /**
   * `start` is on the ritual clock the driver hands `update`; `age` is the
   * flight time the last driver update measured, which the render reads — so
   * the flight never depends on the frame clock agreeing with the driver's.
   */
  let flight: { age: number; kind: GardenHeronRitualKind; start: number } | null = null;
  let arrivedDay: number | null = null;
  let departedDay: number | null = null;
  let lastDay = -1;
  let lastClock = 0;
  let lastHour = 12;

  const dayOf = (clock: number, hour: number) => Math.round((clock - hour * 3600) / 86400);
  const standingWindow = (hour: number, day: number): boolean => {
    if (departedDay === day) return false;
    const beats = dayCycleBeats(hour);
    // Gone once the blue hour and the night take the frame, whatever happened.
    if (beats.blue + beats.night > 0.4 && hour > 12) return false;
    if (hour < 4) return false;
    return arrivedDay === day || hour >= GARDEN_HERON_STAND_FROM_HOUR;
  };

  const place = (curve: CatmullRomCurve3, u: number) => {
    curve.getPointAt(u, point);
    curve.getTangentAt(u, tangent);
    curve.getTangentAt(Math.min(1, u + 0.02), ahead);
    bird.position.copy(point);
    const yaw = Math.atan2(-tangent.z, tangent.x);
    const turn = Math.atan2(-ahead.z, ahead.x) - yaw;
    const wrapped = Math.atan2(Math.sin(turn), Math.cos(turn));
    bird.rotation.set(
      MathUtils.clamp(-wrapped * 6, -0.45, 0.45),
      yaw,
      Math.atan2(tangent.y, Math.hypot(tangent.x, tangent.z)) * 0.5,
      "YXZ",
    );
  };

  const standStill = (clock: number, reducedMotion: boolean) => {
    bird.position.set(GARDEN_HERON_STATION.x, GARDEN_HERON_STATION.y, GARDEN_HERON_STATION.z);
    bird.rotation.set(0, standYaw, 0, "YXZ");
    uniforms.uPose.value = 0;
    uniforms.uFlapInner.value = 0;
    uniforms.uFlapOuter.value = 0;
    uniforms.uStrike.value = reducedMotion ? 0 : strikeEnvelope(clock);
  };

  const state = (): GardenHeronState => {
    if (flight) return flight.kind === "heron-arrives" ? "arriving" : "departing";
    return root.visible && standingWindow(lastHour, lastDay) ? "standing" : "absent";
  };

  const ritual = (kind: GardenHeronRitualKind): GardenRitualHandler => ({
    start(t) {
      const day = dayOf(t, lastHour);
      const standing = standingWindow(lastHour, day);
      // She cannot arrive while she is already standing, nor leave when she
      // never came: the ritual resolves at once and the day stays truthful.
      if (kind === "heron-arrives" && standing) return;
      if (kind === "heron-departs" && !standing) {
        departedDay = day;
        return;
      }
      flight = { age: 0, kind, start: t };
    },
    update(t) {
      if (!flight || flight.kind !== kind) return true;
      // A start stamped on another clock (more than a minute off) re-anchors
      // on the first update rather than finishing at once or never.
      if (Math.abs(t - flight.start) > 60) flight.start = t;
      flight.age = Math.max(0, t - flight.start);
      const duration = kind === "heron-arrives" ? GARDEN_HERON_ARRIVAL_SECONDS : GARDEN_HERON_DEPARTURE_SECONDS;
      if (flight.age < duration) return false;
      const day = dayOf(t, lastHour);
      if (kind === "heron-arrives") arrivedDay = day;
      else departedDay = day;
      flight = null;
      return true;
    },
    cancel() {
      if (!flight || flight.kind !== kind) return;
      const day = dayOf(lastClock, lastHour);
      // Interrupted: settle into the outcome, never hang mid-air.
      if (kind === "heron-arrives") arrivedDay = day;
      else departedDay = day;
      flight = null;
    },
  });

  const update = ({ clockSeconds, reducedMotion, visible, wallClockHour }: GardenHeronUpdate): void => {
    lastClock = clockSeconds;
    lastHour = wallClockHour;
    lastDay = dayOf(clockSeconds, wallClockHour);
    if (!visible) {
      root.visible = false;
      return;
    }
    if (flight && !reducedMotion) {
      root.visible = true;
      const age = flight.age;
      if (flight.kind === "heron-arrives") {
        const t = Math.min(1, age / GARDEN_HERON_ARRIVAL_SECONDS);
        // Slows into the landing: ease-out on arc length.
        const u = 1 - (1 - t) * (1 - t);
        place(arrival, u);
        const flare = MathUtils.smoothstep(t, 0.9, 1);
        const [inner, outer] = gardenHeronWingbeat(age, 3, 2.8);
        // Final approach: a flat glide, then the backward flare — wings up and
        // cupped, body pitched up, legs down.
        const glide = MathUtils.smoothstep(t, 0.72, 0.8);
        uniforms.uFlapInner.value = MathUtils.lerp(MathUtils.lerp(inner, -0.08, glide), 0.75, flare);
        uniforms.uFlapOuter.value = MathUtils.lerp(MathUtils.lerp(outer, -0.14, glide), -0.35, flare);
        uniforms.uPose.value = 1 - MathUtils.smoothstep(t, 0.95, 1);
        bird.rotation.z += flare * 0.44;
      } else {
        const t = Math.min(1, age / GARDEN_HERON_DEPARTURE_SECONDS);
        // A heavy take-off, then cruising: ease-in on arc length.
        const u = t * t * (1.6 - 0.6 * t);
        place(departure, u);
        const [inner, outer] = gardenHeronWingbeat(age, age < 6 ? 99 : 3, 2.4);
        uniforms.uFlapInner.value = inner;
        uniforms.uFlapOuter.value = outer;
        uniforms.uPose.value = MathUtils.smoothstep(age, 0, 0.9);
        root.visible = t < 1;
      }
      uniforms.uStrike.value = 0;
      return;
    }
    root.visible = standingWindow(wallClockHour, lastDay);
    if (!root.visible) return;
    standStill(clockSeconds, reducedMotion);
  };

  const releases = options.registerRitual
    ? (["heron-arrives", "heron-departs"] as const).map((kind) => options.registerRitual!(kind, ritual(kind)))
    : [];

  return {
    dispose() {
      for (const release of releases) release();
      geometry.dispose();
      material.dispose();
    },
    mesh,
    ritual,
    root,
    state,
    update,
  };
}
