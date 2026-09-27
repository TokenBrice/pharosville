import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  IcosahedronGeometry,
  Vector3,
} from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { HARBOR_PALETTE } from "../systems/palette";
import { stableUnit } from "./garden-util";

/**
 * Niwaki kuromatsu: a black pine a gardener has shaped (plan W1.4, garden-2,
 * garden-master-4, art-director-7).
 *
 * Grey-black plated S-trunk with a root flare; every branch is a visible arm
 * that runs out level and turns up under its pad; every pad is a cluster of
 * 3–5 flattened ellipsoid lobes with a flat base and a soft dome (sy/sx
 * 0.25–0.42), larger low on the tree than at the apex; one long low limb
 * (sashi-eda) carries a run of pads. Value comes from authored planes — pad
 * undersides ×0.40–0.55 against lit crowns in vertex colour — not facets: the
 * whole tree is smooth-shaded, so it wants a `flatShading: false` material.
 *
 * One generator for every tree in the garden (W4.G1): the threshold and
 * island heroes, and — at the "rim" LOD — the rim, islet and deciduous
 * species of `garden-flora`. The geometry is local to the root (origin at
 * the trunk base, +y up), so it can be instanced or merged.
 */

/** Pads darken to this fraction of the needle colour on their flat undersides. */
export const NIWAKI_PAD_UNDERSIDE = 0.45;
/** Flattened lobes: pad thickness over half-width. */
export const NIWAKI_PAD_ASPECT_RANGE = [0.25, 0.42] as const;

export interface NiwakiBranchSpec {
  /** Where the arm leaves the trunk, as a fraction of the trunk curve (0 root … 1 apex). */
  at: number;
  /** Arm heading in the local xz-plane, radians (0 = +x, π/2 = +z). */
  azimuth: number;
  /** Horizontal reach from the trunk to the outermost pad, world units. */
  reach: number;
  /** Rise of the arm's upturn under the outermost pad, world units. */
  rise: number;
  /** Half-width of the outermost pad, world units. */
  padSize: number;
  /** Pads carried along the arm: 1 for a tier, 2–3 for the sashi-eda. */
  pads?: number;
  /**
   * Authored pads on short twigs off the arm, replacing `pads`: each pad
   * centre sits `forward` along the heading from the arm's start, `side`
   * across it (+ = heading turned +90° about y) and `up` above it, with
   * half-width `size`. A twig joins the arm to the pad's flat base, so a
   * sashi-eda can carry separate pads with sky between them.
   */
  padsAt?: readonly NiwakiPadPlacement[];
  /** Icosphere detail of this branch's pad lobes (default 1): 2 for pads seen close, 0 for pads that only cast shade. */
  detail?: number;
}

export interface NiwakiPadPlacement {
  forward: number;
  side: number;
  up: number;
  size: number;
}

export interface NiwakiPineOptions {
  /** Deterministic seed: the same seed always builds the same tree. */
  seed: string;
  /** Root-to-apex height, world units. */
  height: number;
  /**
   * Trunk nodes in local space, root first; the trunk is a centripetal
   * Catmull-Rom through them. Omit for the default S-bend leaning by `lean`.
   */
  trunk?: readonly (readonly [number, number, number])[];
  /** Net apex offset of the default S-bend (ignored when `trunk` is given). */
  lean?: { x: number; z: number };
  /** Trunk radius at the root, world units (default 3.4 % of height). */
  trunkRadius?: number;
  /** Explicit branch recipe; omit for the default chokkan tiers. */
  branches?: readonly NiwakiBranchSpec[];
  bark?: Color;
  needle?: Color;
  /**
   * Mesh density. "hero" (default) is the close threshold/island grade;
   * "rim" is the instanced planting grade (W4.G1): coarser tubes, three
   * roots and undivided icosahedron pad lobes, same silhouette.
   */
  lod?: "hero" | "rim";
  /** Pad lobe icosphere detail for branches without their own `detail`. */
  padDetail?: number;
}

export interface NiwakiPad {
  /** Pad centre in local space. */
  center: Vector3;
  /** Pad half-extents (x, y, z) before the arm's heading rotation. */
  halfSize: Vector3;
  /** Index of the branch carrying the pad. */
  branch: number;
}

export interface NiwakiPine {
  geometry: BufferGeometry;
  /** Every pad, ordered lowest first. */
  pads: readonly NiwakiPad[];
  /** Local-space trunk curve, for placement tests and scans. */
  trunk: CatmullRomCurve3;
  triangleCount: number;
  /**
   * Per vertex of `geometry`: the index into `pads` of the pad it belongs to,
   * or −1 for bark (trunk, roots, arms, twigs). Lets instanced planting and
   * the month record address foliage without re-deriving it from colour.
   */
  padOfVertex: Int16Array;
}

const TUBES = {
  hero: { trunk: [24, 10], root: [4, 6], roots: 4, arm: [8, 6], twig: [5, 5], padDetail: 1 },
  rim: { trunk: [8, 6], root: [2, 4], roots: 3, arm: [3, 4], twig: [3, 4], padDetail: 0 },
} as const;

const DEFAULT_BARK = new Color(HARBOR_PALETTE.stone_dark).lerp(new Color(HARBOR_PALETTE.timber_dark), 0.35);
const DEFAULT_NEEDLE = new Color(HARBOR_PALETTE.aurora_green).multiplyScalar(0.58);
const COOL_SHADE = new Color(HARBOR_PALETTE.fog_blue);
const WARM_RIM = new Color(HARBOR_PALETTE.sun_day_warm);

/**
 * Default chokkan tiers: pads 1.0 / 0.85 / 0.7 / 0.55 of the crown width,
 * bottom to top, turning by a jittered golden angle, a small apex pad, and one
 * sashi-eda at 1.6× the crown width on the lowest tier.
 */
export function niwakiDefaultBranches(height: number, seed: string): NiwakiBranchSpec[] {
  const crown = height * 0.26;
  const tiers = [1, 0.85, 0.7, 0.55];
  const branches: NiwakiBranchSpec[] = tiers.map((size, index) => ({
    at: 0.36 + index * 0.15,
    azimuth: index * 2.4 + (stableUnit(`${seed}.tier.${index}`) - 0.5) * 0.6,
    reach: crown * size * 0.9,
    rise: height * 0.035,
    padSize: crown * size * 0.62,
  }));
  branches.push({ at: 1, azimuth: stableUnit(`${seed}.apex`) * Math.PI * 2, reach: crown * 0.08, rise: height * 0.01, padSize: crown * 0.4 });
  branches.push({ at: 0.3, azimuth: branches[0]!.azimuth + Math.PI * 0.85, reach: crown * 1.6, rise: height * 0.05, padSize: crown * 0.6, pads: 3 });
  return branches;
}

function defaultTrunk(height: number, lean: { x: number; z: number }, seed: string): Array<[number, number, number]> {
  const side = stableUnit(`${seed}.bend`) < 0.5 ? -1 : 1;
  const across = { x: -lean.z, z: lean.x };
  const acrossLength = Math.hypot(across.x, across.z) || 1;
  const bend = (fraction: number) => ({ x: across.x / acrossLength * fraction * height * side, z: across.z / acrossLength * fraction * height * side });
  const nodes: Array<[number, number, number]> = [[0, 0, 0]];
  for (const [t, wobble] of [[0.25, 0.08], [0.5, -0.06], [0.75, 0.05], [1, 0]] as const) {
    const b = bend(wobble);
    nodes.push([lean.x * t * t + b.x, height * t, lean.z * t * t + b.z]);
  }
  return nodes;
}

function writeColor(colors: Float32Array, index: number, color: Color): void {
  colors[index * 3] = color.r;
  colors[index * 3 + 1] = color.g;
  colors[index * 3 + 2] = color.b;
}

/**
 * A tapered tube along `curve` with explicit smooth normals. Bark plates are
 * vertex-colour tiles (rings × radial pairs), not geometry.
 */
function barkTube(
  curve: CatmullRomCurve3,
  radii: readonly [number, number],
  segments: number,
  radial: number,
  bark: Color,
  seed: string,
): BufferGeometry {
  const frames = curve.computeFrenetFrames(segments, false);
  const count = (segments + 1) * (radial + 1);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const point = new Vector3();
  const normal = new Vector3();
  const plate = new Color();
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    curve.getPointAt(t, point);
    const radius = radii[0] + (radii[1] - radii[0]) * t;
    for (let j = 0; j <= radial; j += 1) {
      const angle = j / radial * Math.PI * 2;
      normal.copy(frames.normals[i]!).multiplyScalar(Math.cos(angle))
        .addScaledVector(frames.binormals[i]!, Math.sin(angle)).normalize();
      const index = i * (radial + 1) + j;
      positions[index * 3] = point.x + normal.x * radius;
      positions[index * 3 + 1] = point.y + normal.y * radius;
      positions[index * 3 + 2] = point.z + normal.z * radius;
      normals[index * 3] = normal.x;
      normals[index * 3 + 1] = normal.y;
      normals[index * 3 + 2] = normal.z;
      // Plated bark: each plate spans two rings and two radial steps; the
      // crack between plates is the darker ring.
      const tile = stableUnit(`${seed}.plate.${i >> 1}.${(j % radial) >> 1}`);
      writeColor(colors, index, plate.copy(bark).multiplyScalar((i & 1 ? 0.82 : 1) * (0.84 + tile * 0.32)));
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < segments; i += 1) {
    for (let j = 0; j < radial; j += 1) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * One cloud pad: 3–5 icosphere lobes offset ±0.45, clamped flat underneath,
 * domed on top, then fitted to `half` (base at local y 0, crown at 2·half.y).
 * Smooth normals per lobe; underside ×0.40–0.55 cooled toward fog blue, lit
 * crown ×1.0, a faint warm band on the outer crown rim.
 */
export function createNiwakiPadGeometry(seed: string, half: Vector3, needle: Color = DEFAULT_NEEDLE, detail = 1): BufferGeometry {
  const lobeCount = 3 + Math.floor(stableUnit(`${seed}.lobes`) * 3);
  const lobes: BufferGeometry[] = [];
  for (let lobe = 0; lobe < lobeCount; lobe += 1) {
    const raw = new IcosahedronGeometry(1, detail);
    raw.deleteAttribute("normal");
    raw.deleteAttribute("uv");
    const geometry = mergeVertices(raw);
    raw.dispose();
    const core = lobe === 0;
    const radius = core ? 0.78 : 0.52 + stableUnit(`${seed}.r.${lobe}`) * 0.22;
    const angle = lobe * 2.4 + stableUnit(`${seed}.a.${lobe}`) * 0.8;
    const offset = core ? 0 : 0.3 + stableUnit(`${seed}.o.${lobe}`) * 0.15;
    const position = geometry.getAttribute("position") as BufferAttribute;
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const y = position.getY(index);
      const z = position.getZ(index);
      // Gentle lumps keep the dome a cloud rather than a lens.
      const lump = 1 + (stableUnit(`${seed}.lump.${lobe}.${index}`) - 0.5) * 0.12;
      position.setXYZ(
        index,
        x * radius * lump + Math.cos(angle) * offset,
        Math.max(-0.2, y * radius * lump + (core ? 0 : 0.06)),
        z * radius * lump + Math.sin(angle) * offset,
      );
    }
    lobes.push(geometry);
  }
  const geometry = mergeGeometries(lobes, false)!;
  lobes.forEach((lobe) => lobe.dispose());
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const position = geometry.getAttribute("position") as BufferAttribute;
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  const hx = (box.max.x - box.min.x) / 2;
  const hz = (box.max.z - box.min.z) / 2;
  const hy = box.max.y - box.min.y;
  const colors = new Float32Array(position.count * 3);
  const color = new Color();
  for (let index = 0; index < position.count; index += 1) {
    const x = (position.getX(index) - cx) / hx;
    const t = (position.getY(index) - box.min.y) / hy;
    const z = (position.getZ(index) - cz) / hz;
    position.setXYZ(index, x * half.x, t * half.y * 2, z * half.z);
    // Only the upper crown is lit; the flat base and flanks keep the shade value.
    const lit = t <= 0.5 ? 0 : t >= 0.92 ? 1 : ((t - 0.5) / 0.42) ** 2 * (3 - 2 * (t - 0.5) / 0.42);
    color.copy(needle).multiplyScalar(NIWAKI_PAD_UNDERSIDE + (1 - NIWAKI_PAD_UNDERSIDE) * lit)
      .lerp(COOL_SHADE, 0.08 * (1 - lit));
    if (Math.hypot(x, z) > 0.85 && t > 0.5) color.lerp(WARM_RIM, 0.08);
    writeColor(colors, index, color);
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Builds one niwaki kuromatsu in root-local space. */
export function createNiwakiPine(options: NiwakiPineOptions): NiwakiPine {
  const { seed, height } = options;
  const bark = options.bark ?? DEFAULT_BARK;
  const needle = options.needle ?? DEFAULT_NEEDLE;
  const tubes = TUBES[options.lod ?? "hero"];
  const padDetail = options.padDetail ?? tubes.padDetail;
  const rootRadius = options.trunkRadius ?? height * 0.034;
  const nodes = options.trunk ?? defaultTrunk(height, options.lean ?? { x: height * 0.12, z: 0 }, seed);
  const trunk = new CatmullRomCurve3(nodes.map(([x, y, z]) => new Vector3(x, y, z)), false, "centripetal");
  const pieces: BufferGeometry[] = [barkTube(trunk, [rootRadius, rootRadius * 0.22], tubes.trunk[0], tubes.trunk[1], bark, `${seed}.trunk`)];
  // Parallel to `pieces`: the pad a piece is, or −1 for bark.
  const owners: number[] = [-1];

  // Root flare: short splayed roots gripping the ground.
  for (let root = 0; root < tubes.roots; root += 1) {
    const angle = root * Math.PI * 2 / tubes.roots + stableUnit(`${seed}.root.${root}`) * 0.7;
    const reach = rootRadius * (2.2 + stableUnit(`${seed}.root-reach.${root}`) * 0.8);
    const curve = new CatmullRomCurve3([
      new Vector3(0, rootRadius * 1.4, 0),
      new Vector3(Math.cos(angle) * reach * 0.45, rootRadius * 0.45, Math.sin(angle) * reach * 0.45),
      new Vector3(Math.cos(angle) * reach, -rootRadius * 0.3, Math.sin(angle) * reach),
    ], false, "centripetal");
    pieces.push(barkTube(curve, [rootRadius * 0.62, rootRadius * 0.2], tubes.root[0], tubes.root[1], bark, `${seed}.root.${root}`));
    owners.push(-1);
  }

  const branches = options.branches ?? niwakiDefaultBranches(height, seed);
  const pads: NiwakiPad[] = [];
  const armRadius = Math.max(0.06, rootRadius * 0.34);
  branches.forEach((branch, index) => {
    const start = trunk.getPointAt(Math.min(1, Math.max(0, branch.at)));
    const heading = new Vector3(Math.cos(branch.azimuth), 0, Math.sin(branch.azimuth));
    const end = start.clone().addScaledVector(heading, branch.reach).add(new Vector3(0, branch.rise, 0));
    const count = Math.max(1, branch.pads ?? 1);
    const aspectFor = (pad: number) => NIWAKI_PAD_ASPECT_RANGE[0]
      + (NIWAKI_PAD_ASPECT_RANGE[1] - NIWAKI_PAD_ASPECT_RANGE[0]) * stableUnit(`${seed}.aspect.${index}.${pad}`);
    const placePad = (pad: number, centre: Vector3, half: Vector3) => {
      const geometry = createNiwakiPadGeometry(`${seed}.pad.${index}.${pad}`, half, needle, branch.detail ?? padDetail);
      geometry.rotateY(-branch.azimuth);
      geometry.translate(centre.x, centre.y - half.y, centre.z);
      pieces.push(geometry);
      owners.push(pads.length);
      pads.push({ branch: index, center: centre, halfSize: half });
    };
    let arm: CatmullRomCurve3 | null = null;
    if (branch.reach > armRadius * 2) {
      // Level run out, then the upturn under the pad.
      const elbow = start.clone().addScaledVector(heading, branch.reach * 0.82).add(new Vector3(0, branch.rise * 0.12, 0));
      arm = new CatmullRomCurve3([start, start.clone().lerp(elbow, 0.5), elbow, end], false, "centripetal");
      const multi = count > 1 || (branch.padsAt?.length ?? 0) > 1;
      pieces.push(barkTube(arm, [armRadius * (multi ? 1.35 : 1), armRadius * 0.5], tubes.arm[0], tubes.arm[1], bark, `${seed}.arm.${index}`));
      owners.push(-1);
    }
    if (branch.padsAt) {
      const across = new Vector3(-heading.z, 0, heading.x);
      branch.padsAt.forEach((placement, pad) => {
        const half = new Vector3(placement.size, placement.size * aspectFor(pad), placement.size * 0.72);
        const centre = start.clone().addScaledVector(heading, placement.forward)
          .addScaledVector(across, placement.side).add(new Vector3(0, placement.up, 0));
        const seat = centre.clone().add(new Vector3(0, -half.y * 0.6, 0));
        const from = arm ? arm.getPointAt(Math.min(1, Math.max(0, placement.forward / branch.reach))) : start.clone();
        if (from.distanceTo(seat) > armRadius) {
          // The twig runs out of the arm and turns up into the pad's base.
          const knee = from.clone().lerp(seat, 0.7);
          knee.y = from.y + (seat.y - from.y) * 0.25;
          const twig = new CatmullRomCurve3([from, knee, seat], false, "centripetal");
          pieces.push(barkTube(twig, [armRadius * 0.75, armRadius * 0.4], tubes.twig[0], tubes.twig[1], bark, `${seed}.twig.${index}.${pad}`));
          owners.push(-1);
        }
        placePad(pad, centre, half);
      });
      return;
    }
    for (let pad = 0; pad < count; pad += 1) {
      // Along a sashi-eda the outermost pad is the largest (garden-1: 2.8 /
      // 2.2 / 1.6), inner pads sit higher on the upturning limb.
      const along = count === 1 ? 1 : 0.42 + 0.58 * pad / (count - 1);
      const scale = count === 1 ? 1 : 0.57 + 0.43 * pad / (count - 1);
      const base = start.clone().addScaledVector(heading, branch.reach * along)
        .add(new Vector3(0, branch.rise * along + (count > 1 ? (1 - along) * branch.rise * 0.6 : 0), 0));
      const half = new Vector3(branch.padSize * scale, branch.padSize * scale * aspectFor(pad), branch.padSize * scale * 0.72);
      // The pad rests on the upturned arm: its flat base a little below the tip.
      placePad(pad, new Vector3(base.x, base.y + half.y * 0.65, base.z), half);
    }
  });

  const vertexCounts = pieces.map((piece) => piece.getAttribute("position").count);
  const geometry = mergeGeometries(pieces, false)!;
  pieces.forEach((piece) => piece.dispose());
  geometry.computeBoundingSphere();
  const order = pads.map((_, index) => index).sort((a, b) => pads[a]!.center.y - pads[b]!.center.y);
  const sortedIndex = new Int16Array(pads.length);
  order.forEach((original, sorted) => { sortedIndex[original] = sorted; });
  const padOfVertex = new Int16Array(geometry.getAttribute("position").count);
  let cursor = 0;
  vertexCounts.forEach((count, piece) => {
    const owner = owners[piece]!;
    padOfVertex.fill(owner < 0 ? -1 : sortedIndex[owner]!, cursor, cursor + count);
    cursor += count;
  });
  return {
    geometry,
    pads: order.map((index) => pads[index]!),
    trunk,
    triangleCount: geometry.index!.count / 3,
    padOfVertex,
  };
}
