import { BufferGeometry, Float32BufferAttribute } from "three";
import {
  GARDEN_SURFACE_ROLE_ATTRIBUTE,
  GARDEN_SURFACE_ROLE_CODES,
  type GardenSurfaceRole,
} from "./garden-surfaces";

export type GardenArchitectureRole = Extract<GardenSurfaceRole, "timber" | "plaster" | "roofTile" | "stone">;
export type GardenRoofProfile = "irimoya" | "hip" | "gable" | "mono-pitch";
type Point = readonly [number, number, number];
export interface GardenArchitecturePart {
  bucket: "timber" | "plaster" | "roof" | "stone";
  role: GardenArchitectureRole;
  name: string;
  geometry: BufferGeometry;
}
export interface GardenArchitectureKit {
  /** Fresh, caller-owned geometries; dispose each after merging or on teardown. No shared cache. */
  parts: GardenArchitecturePart[];
  anchors: { deck?: Point; eaves: Point[]; chamber?: Point; door?: Point; ridge?: Point };
  bays?: { from: number; to: number; fitted: boolean }[];
  apertures: { kind: "door" | "chamber"; min: Point; max: Point }[];
}
export interface GardenRoofOptions {
  /** Metres: X is length, Z is span, Y is up. Heights never depend on footprint. */
  length: number;
  span: number;
  eaveY: number;
  ridgeY: number;
  profile?: GardenRoofProfile;
  thickness?: number;
  rafters?: boolean;
  /** Fixed authoring density in metres; omitted keeps the original 0.8 m spacing. */
  rafterSpacing?: number;
  /** Embed the rafter back into the shell and omit only that occluded face. */
  buriedRafterBack?: boolean;
  /** Coarse course width in metres; a stone cap can use a smaller module. */
  courseSize?: number;
}
export interface GardenTimberBayOptions {
  length: number;
  span: number;
  floorY: number;
  eaveY: number;
  bayLength?: number;
  postSize?: number;
  /** Front (+Z) opening in a selected bay; absent selects the middle bay. */
  door?: false | { bay?: number; width: number; height: number };
}
export interface GardenVerandaOptions extends GardenRoofOptions {
  deckY: number;
  bayLength?: number;
}
export interface GardenOkiDoroOptions { width?: number; height?: number; baseY?: number }

const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Point, k: number): Point => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Point): Point => mul(a, 1 / Math.hypot(...a));
function positive(...values: number[]): void {
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) throw new RangeError("Architecture dimensions must be finite and positive");
}
function heights(...values: number[]): void {
  if (values.some((value) => !Number.isFinite(value))) throw new RangeError("Architecture heights must be finite");
}

/** Non-indexed hard faces retain role boundaries and metric UVs through canonical merging. */
class PartWriter {
  private positions: number[] = [];
  private uvs: number[] = [];
  constructor(readonly role: GardenArchitectureRole, readonly name: string) {}
  face(points: Point[], grain: Point = [1, 0, 0]): void {
    const n = cross(sub(points[1], points[0]), sub(points[2], points[0]));
    if (dot(n, n) < 1e-16) return;
    const normal = unit(n);
    let u = sub(grain, mul(normal, dot(grain, normal)));
    if (dot(u, u) < 1e-12) u = sub(points[1], points[0]);
    u = unit(u);
    const v = cross(normal, u);
    for (let i = 1; i < points.length - 1; i += 1) {
      for (const p of [points[0], points[i], points[i + 1]]) {
        this.positions.push(...p);
        this.uvs.push(dot(p, u), dot(p, v));
      }
    }
  }
  beam(a: Point, b: Point, width: number, depth = width): void {
    const grain = unit(sub(b, a));
    const across = unit(Math.abs(grain[1]) > 0.99 ? [0, 0, 1] : [-grain[2], 0, grain[0]]);
    const up = cross(grain, across);
    const corners = [a, b].flatMap((p) => [-1, 1].flatMap((s) => [-1, 1].map((t) => add(add(p, mul(across, s * width / 2)), mul(up, t * depth / 2)))));
    const centre = mul(add(a, b), 0.5);
    for (const indices of [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]) {
      const face = indices.map((index) => corners[index]);
      if (dot(cross(sub(face[1], face[0]), sub(face[2], face[0])), sub(face[0], centre)) < 0) face.reverse();
      this.face(face, grain);
    }
  }
  /** Continuous three-point rafter: exposed sides, underside and both end caps. */
  buriedRafter(points: Point[], width: number, depth: number): void {
    const grain = unit(sub(points[points.length - 1], points[0]));
    const lower = points.map((p): Point => [p[0], p[1] - depth, p[2]]);
    for (const side of [-1, 1]) for (let i = 0; i < points.length - 1; i += 1) {
      const face = [points[i], points[i + 1], lower[i + 1], lower[i]].map((p): Point => [p[0] + side * width / 2, p[1], p[2]]);
      if (cross(sub(face[1], face[0]), sub(face[2], face[0]))[0] * side < 0) face.reverse();
      this.face(face, grain);
    }
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = lower[i], b = lower[i + 1];
      const face: Point[] = [[a[0] - width / 2, a[1], a[2]], [b[0] - width / 2, b[1], b[2]], [b[0] + width / 2, b[1], b[2]], [a[0] + width / 2, a[1], a[2]]];
      if (cross(sub(face[1], face[0]), sub(face[2], face[0]))[1] > 0) face.reverse();
      this.face(face, grain);
    }
    const centerZ = (points[0][2] + points[points.length - 1][2]) / 2;
    for (const i of [0, points.length - 1]) {
      const a = points[i], b = lower[i];
      const face: Point[] = [[a[0] - width / 2, a[1], a[2]], [b[0] - width / 2, b[1], b[2]], [b[0] + width / 2, b[1], b[2]], [a[0] + width / 2, a[1], a[2]]];
      if (cross(sub(face[1], face[0]), sub(face[2], face[0]))[2] * (a[2] - centerZ) < 0) face.reverse();
      this.face(face, grain);
    }
  }
  box(x: number, y: number, z: number, length: number, height: number, span: number, grain: "x" | "y" | "z" = "x"): void {
    if (grain === "x") this.beam([x - length / 2, y, z], [x + length / 2, y, z], span, height);
    else if (grain === "y") this.beam([x, y - height / 2, z], [x, y + height / 2, z], span, length);
    else this.beam([x, y, z - span / 2], [x, y, z + span / 2], length, height);
  }
  shell(points: Point[], thickness: number): void {
    if (cross(sub(points[1], points[0]), sub(points[2], points[0]))[1] < 0) points.reverse();
    const lower = points.map((p): Point => [p[0], p[1] - thickness, p[2]]);
    this.face(points);
    this.face([...lower].reverse());
    for (let i = 0; i < points.length; i += 1) {
      const j = (i + 1) % points.length;
      this.face([points[i], lower[i], lower[j], points[j]]);
    }
  }
  finish(): GardenArchitecturePart {
    const geometry = new BufferGeometry();
    geometry.name = this.name;
    geometry.setAttribute("position", new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute(GARDEN_SURFACE_ROLE_ATTRIBUTE, new Float32BufferAttribute(new Float32Array(this.positions.length / 3).fill(GARDEN_SURFACE_ROLE_CODES[this.role]), 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    return { name: this.name, role: this.role, bucket: this.role === "roofTile" ? "roof" : this.role, geometry };
  }
}

/** Full interior bays and two equal fitted end bays; the joinery and heights remain fixed. */
function fitBays(length: number, post: number, nominal: number): NonNullable<GardenArchitectureKit["bays"]> {
  positive(length - post, nominal);
  const clear = length - post;
  const count = clear <= nominal ? 0 : Math.max(0, Math.floor(clear / nominal) - 1);
  const widths = clear <= nominal ? [clear] : [(clear - count * nominal) / 2, ...Array<number>(count).fill(nominal), (clear - count * nominal) / 2];
  let from = -clear / 2;
  return widths.map((width, index) => {
    const to = index === widths.length - 1 ? clear / 2 : from + width;
    const bay = { from, to, fitted: Math.abs(width - nominal) > 1e-9 };
    from = to;
    return bay;
  });
}

export function buildGardenRoof(options: GardenRoofOptions): GardenArchitectureKit {
  const { length, span, eaveY, ridgeY, profile = "irimoya", thickness = 0.14, courseSize: c = 0.1 } = options;
  positive(length, span, ridgeY - eaveY, thickness, c, length - c * 2, span - c * 2);
  heights(eaveY, ridgeY);
  if (options.rafterSpacing !== undefined) positive(options.rafterSpacing);
  const roof = new PartWriter("roofTile", "roof-field");
  const courses = new PartWriter("roofTile", "ridge-end-courses");
  const rafters = new PartWriter("timber", "underside-rafters");
  const hx = length / 2, hz = span / 2, rise = ridgeY - eaveY;
  const hip = profile === "gable" || profile === "mono-pitch" ? 0 : Math.min(span * 0.36, length * 0.24);
  const sag = Math.min(0.045, rise * 0.035);
  const level = (t: number) => eaveY + rise * t - sag * Math.sin(Math.PI * t);
  // Three sampled rings give a shallow concave field, not an upturned corner motif.
  const rings: Point[][] = [0, 0.48, 1].map((t) => {
    const x = hx - hip * (profile === "irimoya" ? Math.min(t / 0.48, 1) : t);
    const z = hz * (1 - t);
    return [[-x, level(t), -z], [x, level(t), -z], [x, level(t), z], [-x, level(t), z]];
  });
  if (profile === "mono-pitch") {
    const rows = [0, 0.5, 1].map((t): Point[] => [[-hx, level(t), hz - span * t], [hx, level(t), hz - span * t]]);
    for (let i = 0; i < 2; i += 1) roof.shell([rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]], thickness);
    for (const x of [-hx + c / 2, hx - c / 2]) courses.beam([x, eaveY + c / 4, hz - c], [x, ridgeY + c / 4, -hz + c], c * 0.9, c * 0.6);
  } else {
    for (let ring = 0; ring < 2; ring += 1) {
      for (let side = 0; side < 4; side += 1) {
        if (side % 2 === 1 && (profile === "gable" || (ring === 1 && profile !== "hip"))) continue;
        const next = (side + 1) % 4;
        const a = rings[ring], b = rings[ring + 1];
        const points = [a[side], a[next], b[next], b[side]];
        // Hip tips terminate as triangles, avoiding duplicate/zero-area ridge vertices.
        roof.shell(ring === 1 && side % 2 === 1 ? [a[side], a[next], b[side]] : points, thickness);
      }
    }
    for (const end of [-1, 1]) {
      for (const side of [-1, 1]) {
        const edge = [0, 0.48, 1].map((t): Point => [
          end * (hx - hip * (profile === "irimoya" ? Math.min(t / 0.48, 1) : t) - c),
          level(t) + c / 4,
          side * (hz - c) * (1 - t),
        ]);
        for (let j = 0; j < 2; j += 1) courses.beam(edge[j], edge[j + 1], c * 0.9, c * 0.6);
      }
    }
  }
  const ridgeZ = profile === "mono-pitch" ? -hz + c * 0.7 : 0;
  courses.beam([-hx + hip, ridgeY + c * 0.35, ridgeZ], [hx - hip, ridgeY + c * 0.35, ridgeZ], c * 1.4, c * 0.9);
  for (const z of profile === "mono-pitch" ? [hz - c / 2] : [-hz + c / 2, hz - c / 2]) courses.box(0, eaveY + c * 0.2, z, length, c * 0.6, c);
  if (options.rafters !== false) {
    const count = Math.min(12, Math.max(2, Math.ceil(length / (options.rafterSpacing ?? 0.8))));
    for (let i = 0; i < count; i += 1) {
      const x = (i / (count - 1) - 0.5) * (length - hip * 2) * 0.94;
      for (const side of profile === "mono-pitch" ? [1] : [-1, 1]) {
        if (options.buriedRafterBack) {
          const knee = profile === "mono-pitch" ? 0.5 : 0.48;
          const points = [0.002, knee, 0.998].map((t): Point => {
            const y = t <= knee
              ? level(0) + (level(knee) - level(0)) * t / knee
              : level(knee) + (level(1) - level(knee)) * (t - knee) / (1 - knee);
            return [x, y - thickness + 0.02, profile === "mono-pitch" ? hz * (1 - 2 * t) : side * hz * (1 - t)];
          });
          rafters.buriedRafter(points, 0.075, 0.09);
        } else {
          const points = [0, 0.48, 1].map((t): Point => [x, level(t) - thickness - 0.045, profile === "mono-pitch" ? (hz - 0.07) * (1 - 2 * t) : side * (hz - 0.07) * (1 - t)]);
          for (let j = 0; j < 2; j += 1) rafters.beam(points[j], points[j + 1], 0.075, 0.09);
        }
      }
    }
  }
  return {
    parts: [roof.finish(), courses.finish(), ...(options.rafters === false ? [] : [rafters.finish()])],
    anchors: {
      eaves: [[-hx, profile === "mono-pitch" ? ridgeY : eaveY, -hz], [hx, profile === "mono-pitch" ? ridgeY : eaveY, -hz], [hx, eaveY, hz], [-hx, eaveY, hz]],
      ridge: [0, ridgeY + c * 0.8, ridgeZ],
    },
    apertures: [],
  };
}

export function buildGardenTimberBay(options: GardenTimberBayOptions): GardenArchitectureKit {
  const { length, span, floorY, eaveY, postSize: p = 0.16, bayLength = 3 } = options;
  positive(length, span - p * 2, eaveY - floorY - p * 2, p, bayLength);
  heights(floorY, eaveY);
  const bays = fitBays(length, p, bayLength);
  if (bays.some((bay) => bay.to - bay.from <= p)) throw new RangeError("Bay must clear fixed joinery");
  const timber = new PartWriter("timber", "structural-bays"), plaster = new PartWriter("plaster", "recessed-plaster");
  const z = (span - p) / 2, wallThickness = Math.min(0.055, p / 3);
  const xs = [bays[0].from, ...bays.map((bay) => bay.to)];
  for (const x of xs) for (const side of [-1, 1]) timber.box(x, (floorY + eaveY) / 2, side * z, p, eaveY - floorY, p, "y");
  const doorBay = options.door === false ? -1 : options.door?.bay ?? Math.floor(bays.length / 2);
  if (doorBay < -1 || doorBay >= bays.length || !Number.isInteger(doorBay)) throw new RangeError("Door bay is outside the frame");
  for (const side of [-1, 1]) timber.box(0, eaveY - p / 2, side * z, length, p, p);
  for (const x of [xs[0], xs[xs.length - 1]]) timber.box(x, eaveY - p / 2, 0, p, p, span - p * 2, "z");
  const apertures: GardenArchitectureKit["apertures"] = [];
  let door: Point | undefined;
  for (let i = 0; i < bays.length; i += 1) {
    const { from, to } = bays[i], left = from + p / 2, right = to - p / 2;
    const bottom = floorY + p, top = eaveY - p;
    for (const side of [-1, 1]) {
      const wallZ = side * (z - p / 2 + wallThickness / 2);
      if (side === 1 && i === doorBay) {
        const width = options.door === false ? 0 : options.door?.width ?? Math.min(0.8, (right - left - p * 2) * 0.85);
        const height = options.door === false ? 0 : options.door?.height ?? Math.min(1.8, (top - floorY - p) * 0.9);
        positive(width, height, right - left - width - p * 2, top - floorY - height - p);
        const cx = (from + to) / 2, y = floorY + height;
        door = [cx, floorY, span / 2];
        apertures.push({ kind: "door", min: [cx - width / 2, floorY, z - p], max: [cx + width / 2, y, span / 2] });
        for (const sign of [-1, 1]) {
          const edge = cx + sign * width / 2;
          timber.box(edge + sign * p / 2, floorY + height / 2, z, p, height, p, "y");
          const a = sign < 0 ? left : edge + p, b = sign < 0 ? edge - p : right;
          plaster.box((a + b) / 2, (bottom + top) / 2, wallZ, b - a, top - bottom, wallThickness);
          const sillA = sign < 0 ? from - p / 2 : cx + width / 2;
          const sillB = sign < 0 ? cx - width / 2 : to + p / 2;
          timber.box((sillA + sillB) / 2, floorY + p / 2, z, sillB - sillA, p, p);
        }
        timber.box(cx, y + p / 2, z, width + p * 2, p, p);
        plaster.box(cx, (y + p + top) / 2, wallZ, width + p * 2, top - y - p, wallThickness);
      } else {
        timber.box((from + to) / 2, floorY + p / 2, side * z, to - from + p, p, p);
        plaster.box((left + right) / 2, (bottom + top) / 2, wallZ, right - left, top - bottom, wallThickness);
      }
    }
  }
  for (const x of [xs[0], xs[xs.length - 1]]) plaster.box(x, (floorY + eaveY) / 2, 0, wallThickness, eaveY - floorY - p * 2, span - p * 2);
  return { parts: [timber.finish(), plaster.finish()], anchors: { deck: [0, floorY, 0], eaves: [[0, eaveY, -span / 2], [0, eaveY, span / 2]], ...(door ? { door } : {}) }, bays, apertures };
}

export function buildGardenVeranda(options: GardenVerandaOptions): GardenArchitectureKit {
  const { length, span, deckY, eaveY } = options;
  positive(length, span, eaveY - deckY - 0.2);
  heights(deckY);
  const p = 0.14, bays = fitBays(length, p, options.bayLength ?? 3);
  positive(length - p * 2, span - p * 2);
  if (bays.some((bay) => bay.to - bay.from <= p)) throw new RangeError("Bay must clear fixed joinery");
  const roof = buildGardenRoof(options), deck = new PartWriter("timber", "veranda-deck-frame");
  const stepSpan = Math.min(0.42, span * 0.2);
  const boards = 2 * Math.ceil((span - stepSpan) / 0.64) + 1;
  const pitch = (span - stepSpan) / boards, gap = Math.min(0.018, pitch * 0.08);
  for (let i = 0; i < boards; i += 1) deck.box(0, deckY - 0.06, -span / 2 + pitch * (i + 0.5), length, 0.12, pitch - gap);
  // Edge beams preserve the requested envelope despite the boarded gaps.
  for (const z of [-(span - p) / 2, (span - p) / 2]) {
    deck.box(0, deckY - (z > 0 ? 0.29 : 0.15), z, length, 0.18, p);
    deck.box(0, eaveY - 0.18, z, length, 0.16, p);
    for (const x of [bays[0].from, ...bays.map((bay) => bay.to)]) deck.box(x, (deckY + eaveY - 0.2) / 2, z, p, eaveY - deckY - 0.2, p, "y");
  }
  deck.box(0, deckY - 0.2, span / 2 - stepSpan / 2, length, 0.12, stepSpan);
  const entry = bays[Math.floor(bays.length / 2)];
  return { parts: [...roof.parts, deck.finish()], anchors: { ...roof.anchors, deck: [0, deckY, -stepSpan / 2], door: [(entry.from + entry.to) / 2, deckY, -span / 2] }, bays, apertures: [] };
}

export function buildGardenOkiDoro(options: GardenOkiDoroOptions = {}): GardenArchitectureKit {
  const { width = 0.8, height = 1.15, baseY = 0 } = options;
  positive(width, height);
  heights(baseY);
  const stone = new PartWriter("stone", "oki-doro-base-chamber");
  const y = (t: number) => baseY + height * t;
  for (const [bottom, top, size] of [[0, 0.12, 0.82], [0.12, 0.43, 0.34], [0.43, 0.52, 0.66], [0.78, 0.84, 0.66]]) stone.box(0, y((bottom + top) / 2), 0, width * size, height * (top - bottom), width * size);
  for (const x of [-1, 1]) for (const z of [-1, 1]) stone.box(x * width * 0.26, y(0.65), z * width * 0.26, width * 0.1, height * 0.26, width * 0.1, "y");
  const cap = buildGardenRoof({ length: width, span: width, eaveY: y(0.84), ridgeY: y(0.96), thickness: height * 0.055, courseSize: height * 0.05, profile: "hip", rafters: false });
  for (const part of cap.parts) {
    part.role = "stone";
    part.bucket = "stone";
    part.name = `oki-doro-${part.name}`;
    part.geometry.name = part.name;
    (part.geometry.getAttribute(GARDEN_SURFACE_ROLE_ATTRIBUTE) as Float32BufferAttribute).array.fill(GARDEN_SURFACE_ROLE_CODES.stone);
  }
  return {
    parts: [stone.finish(), ...cap.parts],
    anchors: { ...cap.anchors, chamber: [0, y(0.65), 0], deck: [0, baseY, 0] },
    apertures: [{ kind: "chamber", min: [-width * 0.21, y(0.52), -width * 0.33], max: [width * 0.21, y(0.78), width * 0.33] }],
  };
}
