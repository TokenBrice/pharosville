import * as THREE from "three";

/**
 * Phase 4A — 7 zero-alpha-test opaque procedural ground-cover archetypes.
 *
 * Every archetype is an indexed `THREE.BufferGeometry` carrying:
 * - `position`   (vec3, metres, glTF Y-up, roots sunk -0.05..-0.08 m so nothing floats on slopes)
 * - `normal`     (vec3, unit length; `gc-maquis` and `gc-urban` puffs use spherical-radial smooth normals)
 * - `aBladeT`    (float, 0 at ground root -> 1 at swaying tip)
 * - `aPart`      (float, 0 = stem / rock / pine-needle mound / planter pot, 1 = foliage / petal / scree)
 * - `aColorHint` (vec3, linear shading / AO / material tint hint)
 */

export const GROUNDCOVER_ARCHETYPES = [
  "grass",
  "understory",
  "maquis",
  "flowers",
  "rocks",
  "coastal",
  "urban",
] as const;

export type GroundCoverArchetype = (typeof GROUNDCOVER_ARCHETYPES)[number];
export const ARCHETYPE_COUNT = GROUNDCOVER_ARCHETYPES.length;

interface IndexedBuilder {
  pos: number[];
  nor: number[];
  bladeT: number[];
  part: number[];
  hint: number[];
  idx: number[];
}

function createBuilder(): IndexedBuilder {
  return { pos: [], nor: [], bladeT: [], part: [], hint: [], idx: [] };
}

function addVert(
  b: IndexedBuilder,
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
  bladeT: number,
  part: number,
  hr: number,
  hg: number,
  hb: number,
): number {
  const i = b.pos.length / 3;
  const len = Math.hypot(nx, ny, nz) || 1;
  b.pos.push(x, y, z);
  b.nor.push(nx / len, ny / len, nz / len);
  b.bladeT.push(bladeT);
  b.part.push(part);
  b.hint.push(hr, hg, hb);
  return i;
}

function addTri(b: IndexedBuilder, a: number, c: number, d: number): void {
  b.idx.push(a, c, d);
}

function linearHex(hex: string): readonly [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

function finalizeGeometry(b: IndexedBuilder, name: string, computeSmoothNormals = false): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.name = name;
  g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(b.nor, 3));
  g.setAttribute("aBladeT", new THREE.Float32BufferAttribute(b.bladeT, 1));
  g.setAttribute("aPart", new THREE.Float32BufferAttribute(b.part, 1));
  g.setAttribute("aColorHint", new THREE.Float32BufferAttribute(b.hint, 3));
  g.setIndex(b.idx);
  if (computeSmoothNormals) {
    g.computeVertexNormals();
  }
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Add a 4-vertex, 3-triangle V-creased arched blade rooted at (cx, y0, cz) facing outward along `yaw`. */
function addVBlade(
  b: IndexedBuilder,
  cx: number,
  y0: number,
  cz: number,
  yaw: number,
  width: number,
  height: number,
  lean: number,
  crease: number,
  twist: number,
  part: number,
  baseT: number,
  baseHint: readonly [number, number, number],
  tipHint: readonly [number, number, number],
): void {
  const sx = Math.sin(yaw), czDir = Math.cos(yaw);
  const rx = czDir, rz = -sx; // right tangent perpendicular to outward direction (sx, czDir)
  const hw = width * 0.5;

  // Base-left & base-right pulled back by crease; mid-spine pulled outward so the blade has true 3D V-relief
  const bLx = cx - rx * hw - sx * crease;
  const bLz = cz - rz * hw - czDir * crease;
  const bRx = cx + rx * hw - sx * crease;
  const bRz = cz + rz * hw - czDir * crease;

  const midDist = lean * 0.44 + crease;
  const midX = cx + sx * midDist;
  const midY = y0 + (height - y0) * 0.54;
  const midZ = cz + czDir * midDist;

  const tipX = cx + sx * lean + rx * twist;
  const tipY = height;
  const tipZ = cz + czDir * lean + rz * twist;

  // Soft upward-biased normals flanking the V-spine so grazing sun highlights one half of each blade
  const nLx = -rx * 0.46 + sx * 0.34, nLy = 0.82, nLz = -rz * 0.46 + czDir * 0.34;
  const nRx = rx * 0.46 + sx * 0.34, nRy = 0.82, nRz = rz * 0.46 + czDir * 0.34;
  const nMx = sx * 0.42, nMy = 0.90, nMz = czDir * 0.42;
  const nTx = sx * 0.58, nTy = 0.81, nTz = czDir * 0.58;

  const midT = baseT + (1 - baseT) * 0.55;
  const mHr = (baseHint[0] + tipHint[0]) * 0.52;
  const mHg = (baseHint[1] + tipHint[1]) * 0.52;
  const mHb = (baseHint[2] + tipHint[2]) * 0.52;

  const v0 = addVert(b, bLx, y0, bLz, nLx, nLy, nLz, baseT, part, baseHint[0], baseHint[1], baseHint[2]);
  const v1 = addVert(b, bRx, y0, bRz, nRx, nRy, nRz, baseT, part, baseHint[0], baseHint[1], baseHint[2]);
  const v2 = addVert(b, midX, midY, midZ, nMx, nMy, nMz, midT, part, mHr, mHg, mHb);
  const v3 = addVert(b, tipX, tipY, tipZ, nTx, nTy, nTz, 1.0, part, tipHint[0], tipHint[1], tipHint[2]);

  addTri(b, v0, v1, v2);
  addTri(b, v0, v2, v3);
  addTri(b, v2, v1, v3);
}

/**
 * 0. `gc-grass` (18 tris / 24 verts):
 * 6 arched V-creased macro-proportion blades (10-16 cm wide, 0.35-0.75 m tall, sunk -0.06 m at base).
 */
export function buildGrassGeometry(): THREE.BufferGeometry {
  const b = createBuilder();
  const specs: ReadonlyArray<readonly [number, number, number, number, number, number, number]> = [
    // [yaw, radialOff, width, height, lean, crease, twist]
    [0.12, 0.05, 0.145, 0.72, 0.28, 0.035, 0.03],
    [1.18, 0.07, 0.130, 0.58, 0.32, 0.032, -0.025],
    [2.24, 0.06, 0.155, 0.66, 0.25, 0.036, 0.02],
    [3.35, 0.08, 0.115, 0.44, 0.29, 0.028, -0.02],
    [4.42, 0.06, 0.140, 0.62, 0.34, 0.034, 0.025],
    [5.48, 0.09, 0.110, 0.39, 0.24, 0.026, -0.015],
  ];
  for (let i = 0; i < specs.length; i++) {
    const [yaw, rad, width, height, lean, crease, twist] = specs[i];
    const cx = Math.sin(yaw) * rad;
    const cz = Math.cos(yaw) * rad;
    const tone = 0.94 + (i % 3) * 0.055;
    addVBlade(
      b,
      cx,
      -0.06,
      cz,
      yaw,
      width,
      height,
      lean,
      crease,
      twist,
      1.0,
      0.0,
      [0.80 * tone, 0.82 * tone, 0.78 * tone],
      [1.04 * tone, 1.03 * tone, 0.96 * tone],
    );
  }
  return finalizeGeometry(b, "gc-grass");
}

/**
 * 1. `gc-understory` (24 tris / 30 verts):
 * Low flattened russet pine-needle mound collar (`aPart=0, aBladeT=0`, 9 tris / 10 verts) beneath
 * 5 gracefully arching fern/rosemary fronds (`aPart=1`, 15 tris / 20 verts).
 */
export function buildUnderstoryGeometry(): THREE.BufferGeometry {
  const b = createBuilder();

  // Pine-needle mound collar (9-sided flattened organic apron, sunk -0.07 m at rim)
  const sides = 9;
  const apex = addVert(b, 0, 0.15, 0, 0, 1, 0, 0.0, 0.0, 0.98, 0.94, 0.90);
  const rimStart = b.pos.length / 3;
  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * Math.PI * 2 + 0.18;
    const r = 0.58 + 0.09 * Math.sin(k * 2.3 + 0.7);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    addVert(b, x, -0.07, z, Math.sin(a) * 0.35, 0.93, Math.cos(a) * 0.35, 0.0, 0.0, 0.76, 0.74, 0.72);
  }
  for (let k = 0; k < sides; k++) {
    addTri(b, apex, rimStart + k, rimStart + ((k + 1) % sides));
  }

  // 5 gracefully arching fern / shade-rosemary fronds emerging through the needle collar
  const fronds: ReadonlyArray<readonly [number, number, number, number, number]> = [
    // [yaw, width, height, reach, twist]
    [0.25, 0.27, 0.52, 0.68, 0.04],
    [1.52, 0.25, 0.46, 0.62, -0.03],
    [2.78, 0.28, 0.55, 0.72, 0.03],
    [4.05, 0.24, 0.42, 0.56, -0.04],
    [5.28, 0.26, 0.48, 0.64, 0.02],
  ];
  for (let i = 0; i < fronds.length; i++) {
    const [yaw, width, height, reach, twist] = fronds[i];
    const cx = Math.sin(yaw) * 0.09;
    const cz = Math.cos(yaw) * 0.09;
    const tone = 0.92 + (i % 3) * 0.06;
    addVBlade(
      b,
      cx,
      0.02,
      cz,
      yaw,
      width,
      height,
      reach,
      0.045,
      twist,
      1.0,
      0.06,
      [0.78 * tone, 0.84 * tone, 0.76 * tone],
      [1.02 * tone, 1.06 * tone, 0.96 * tone],
    );
  }

  return finalizeGeometry(b, "gc-understory");
}

/** Add an organic open-bottomed flattened dome puff (1 apex + `seg` mid + `seg` sunk base = 1 + 2*seg verts, 3*seg tris). */
function addOrganicPuff(
  b: IndexedBuilder,
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
  seg: number,
  seed: number,
  part: number,
  ySink: number,
): void {
  const wobble = (k: number, ring: number) =>
    1 + 0.14 * Math.sin(k * 2.7 + seed + ring * 1.9) + 0.07 * Math.cos(k * 4.1 - seed * 1.3);

  const apexIdx = addVert(b, cx, cy + ry * 1.02, cz, 0, 1, 0, 1.0, part, 1.06, 1.05, 1.02);
  const midStart = b.pos.length / 3;
  for (let k = 0; k < seg; k++) {
    const a = (k / seg) * Math.PI * 2 + seed * 0.37;
    const w = wobble(k, 1);
    const x = cx + Math.sin(a) * rx * 0.78 * w;
    const y = cy + ry * (0.58 + 0.08 * Math.sin(k * 3.1 + seed));
    const z = cz + Math.cos(a) * rz * 0.78 * w;
    addVert(b, x, y, z, Math.sin(a) * 0.65, 0.76, Math.cos(a) * 0.65, 0.65, part, 0.94, 0.95, 0.93);
  }
  const baseStart = b.pos.length / 3;
  for (let k = 0; k < seg; k++) {
    const a = ((k + 0.5) / seg) * Math.PI * 2 + seed * 0.37;
    const w = wobble(k, 2);
    const x = cx + Math.sin(a) * rx * 1.0 * w;
    const z = cz + Math.cos(a) * rz * 1.0 * w;
    addVert(b, x, ySink, z, Math.sin(a) * 0.85, 0.52, Math.cos(a) * 0.85, 0.0, part, 0.70, 0.72, 0.70);
  }

  for (let k = 0; k < seg; k++) {
    const kn = (k + 1) % seg;
    // Top cap fan (CCW outward)
    addTri(b, apexIdx, midStart + k, midStart + kn);
    // Side skirt quads split into 2 tris
    addTri(b, midStart + k, baseStart + k, midStart + kn);
    addTri(b, midStart + kn, baseStart + k, baseStart + kn);
  }
}

/** Transfer smooth spherical-radial normals outward from `(0, -0.25 * h, 0)` across the given vertex index range. */
function applySphericalRadialNormals(b: IndexedBuilder, startVert = 0, endVert = b.pos.length / 3): void {
  let maxY = 0.2;
  for (let i = startVert; i < endVert; i++) {
    const y = b.pos[i * 3 + 1];
    if (y > maxY) maxY = y;
  }
  const originY = -0.25 * maxY;
  const minY = -0.08;
  const span = Math.max(maxY - minY, 0.1);
  for (let i = startVert; i < endVert; i++) {
    const x = b.pos[i * 3];
    const y = b.pos[i * 3 + 1];
    const z = b.pos[i * 3 + 2];
    const dx = x;
    const dy = y - originY;
    const dz = z;
    const len = Math.hypot(dx, dy, dz) || 1;
    b.nor[i * 3] = dx / len;
    b.nor[i * 3 + 1] = dy / len;
    b.nor[i * 3 + 2] = dz / len;
    // Continuous root-to-crown sway height and smooth vertical AO gradient
    const t = THREE.MathUtils.clamp((y - minY) / span, 0, 1);
    b.bladeT[i] = t;
    const ao = 0.68 + 0.38 * t;
    b.hint[i * 3] = ao;
    b.hint[i * 3 + 1] = ao * 1.01;
    b.hint[i * 3 + 2] = ao * 0.99;
  }
}

/**
 * 2. `gc-maquis` (42 tris / 31 verts):
 * 3 overlapping organic flattened dome puffs with spherical-radial transferred smooth vertex normals
 * from `(0, -0.25 * h, 0)` outward (zero flat facets).
 */
export function buildMaquisGeometry(): THREE.BufferGeometry {
  const b = createBuilder();
  // Main central cushion (6-seg: 13 verts, 18 tris)
  addOrganicPuff(b, 0.0, 0.0, 0.0, 0.56, 0.62, 0.50, 6, 1.1, 1.0, -0.08);
  // Two asymmetric flanking cushions (4-seg each: 9 verts, 12 tris each)
  addOrganicPuff(b, -0.34, -0.02, 0.22, 0.42, 0.46, 0.38, 4, 2.7, 1.0, -0.08);
  addOrganicPuff(b, 0.33, -0.03, -0.18, 0.40, 0.42, 0.36, 4, 4.3, 1.0, -0.08);
  applySphericalRadialNormals(b);
  return finalizeGeometry(b, "gc-maquis");
}

/**
 * 3. `gc-flowers` (16 tris / 28 verts):
 * 4 leaning thin stems (`aPart=0`) topped with tilted 3-tri cupped blossom heads (`aPart=1`).
 */
export function buildFlowersGeometry(): THREE.BufferGeometry {
  const b = createBuilder();
  const stalks: ReadonlyArray<readonly [number, number, number, number, number]> = [
    // [yaw, baseR, height, lean, cupR]
    [0.35, 0.08, 0.56, 0.16, 0.135],
    [1.92, 0.12, 0.46, 0.19, 0.120],
    [3.48, 0.10, 0.52, 0.17, 0.130],
    [5.02, 0.14, 0.40, 0.14, 0.115],
  ];

  for (let i = 0; i < stalks.length; i++) {
    const [yaw, baseR, height, lean, cupR] = stalks[i];
    const sx = Math.sin(yaw), czDir = Math.cos(yaw);
    const rx = czDir, rz = -sx;
    const bx = sx * baseR, bz = czDir * baseR;
    const tx = bx + sx * lean, tz = bz + czDir * lean;

    // Tapered 1-tri thin stem (aPart=0, sunk -0.06 m at base)
    const sw = 0.028;
    const s0 = addVert(b, bx - rx * sw, -0.06, bz - rz * sw, sx * 0.3, 0.95, czDir * 0.3, 0.0, 0.0, 0.80, 0.84, 0.78);
    const s1 = addVert(b, bx + rx * sw, -0.06, bz + rz * sw, sx * 0.3, 0.95, czDir * 0.3, 0.0, 0.0, 0.80, 0.84, 0.78);
    const s2 = addVert(b, tx, height - 0.015, tz, sx * 0.4, 0.91, czDir * 0.4, 0.92, 0.0, 0.96, 0.98, 0.92);
    addTri(b, s0, s1, s2);

    // Tilted 3-tri cupped blossom head (aPart=1, 4 verts / 3 tris per blossom)
    // Tilt blossom slightly outward while facing mostly skyward so aerial diorama camera reads full petal color
    const tilt = 0.28;
    const upX = sx * Math.sin(tilt), upY = Math.cos(tilt), upZ = czDir * Math.sin(tilt);
    // Tangent basis perpendicular to blossom axis (upX, upY, upZ)
    const uX = rx, uY = 0, uZ = rz;
    const vX = upY * uZ - upZ * uY;
    const vY = upZ * uX - upX * uZ;
    const vZ = upX * uY - upY * uX;

    const cupCenter = addVert(
      b,
      tx - upX * 0.02,
      height - upY * 0.02,
      tz - upZ * 0.02,
      upX,
      upY,
      upZ,
      0.96,
      1.0,
      0.86,
      0.84,
      0.82,
    );
    const pStart = b.pos.length / 3;
    for (let k = 0; k < 3; k++) {
      const a = yaw + k * ((Math.PI * 2) / 3) + 0.4;
      const ca = Math.cos(a), sa = Math.sin(a);
      const px = tx + (uX * ca + vX * sa) * cupR + upX * 0.032;
      const py = height + (uY * ca + vY * sa) * cupR + upY * 0.032;
      const pz = tz + (uZ * ca + vZ * sa) * cupR + upZ * 0.032;
      const pnx = upX * 0.82 + (uX * ca + vX * sa) * 0.55;
      const pny = upY * 0.82 + (uY * ca + vY * sa) * 0.55;
      const pnz = upZ * 0.82 + (uZ * ca + vZ * sa) * 0.55;
      addVert(b, px, py, pz, pnx, pny, pnz, 1.0, 1.0, 1.06, 1.04, 1.02);
    }
    addTri(b, cupCenter, pStart, pStart + 1);
    addTri(b, cupCenter, pStart + 1, pStart + 2);
    addTri(b, cupCenter, pStart + 2, pStart);
  }

  return finalizeGeometry(b, "gc-flowers");
}

/** Add a faceted angular limestone slab/wedge sunk to `yBase = -0.08` with warm #C2B59A top / #8F846F side hints. */
function addLimestoneBlock(
  b: IndexedBuilder,
  cx: number,
  cz: number,
  rx: number,
  rz: number,
  h: number,
  sides: number,
  yaw: number,
  tiltX: number,
  tiltZ: number,
  part: number,
  topCenter: boolean,
  seed: number,
): void {
  const topCol = linearHex("#C2B59A");
  const sideCol = linearHex("#8F846F");
  const baseCol: readonly [number, number, number] = [sideCol[0] * 0.84, sideCol[1] * 0.84, sideCol[2] * 0.84];

  const baseStart = b.pos.length / 3;
  const topStart = baseStart + sides;
  const c = Math.cos(yaw), s = Math.sin(yaw);

  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * Math.PI * 2 + seed * 0.5;
    const j = 1 + 0.16 * Math.sin(k * 2.9 + seed);
    const lx = Math.cos(a) * rx * j;
    const lz = Math.sin(a) * rz * j;
    const x = cx + lx * c - lz * s;
    const z = cz + lx * s + lz * c;
    const nx = lx / Math.max(rx, 0.05);
    const nz = lz / Math.max(rz, 0.05);
    addVert(b, x, -0.08, z, nx * c - nz * s, 0.22, nx * s + nz * c, 0.0, part, baseCol[0], baseCol[1], baseCol[2]);
  }

  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * Math.PI * 2 + seed * 0.5 + 0.12;
    const j = 0.72 + 0.14 * Math.cos(k * 2.3 + seed);
    const lx = Math.cos(a) * rx * j;
    const lz = Math.sin(a) * rz * j;
    const x = cx + lx * c - lz * s;
    const z = cz + lx * s + lz * c;
    const y = Math.max(0.06, h + lx * tiltX + lz * tiltZ + 0.03 * Math.sin(k * 3.7 + seed));
    const nx = (lx / Math.max(rx, 0.05)) * 0.35 - tiltX;
    const nz = (lz / Math.max(rz, 0.05)) * 0.35 - tiltZ;
    addVert(b, x, y, z, nx * c - nz * s, 0.92, nx * s + nz * c, 0.0, part, topCol[0], topCol[1], topCol[2]);
  }

  // Side wall quads
  for (let k = 0; k < sides; k++) {
    const kn = (k + 1) % sides;
    addTri(b, baseStart + k, topStart + k, baseStart + kn);
    addTri(b, topStart + k, topStart + kn, baseStart + kn);
  }

  // Top tabular deck
  if (topCenter) {
    const crown = addVert(
      b,
      cx,
      h + 0.045,
      cz,
      -tiltX * c + tiltZ * s,
      0.98,
      -tiltX * s - tiltZ * c,
      0.0,
      part,
      topCol[0] * 1.04,
      topCol[1] * 1.04,
      topCol[2] * 1.03,
    );
    for (let k = 0; k < sides; k++) {
      addTri(b, crown, topStart + ((k + 1) % sides), topStart + k);
    }
  } else {
    for (let k = 1; k < sides - 1; k++) {
      addTri(b, topStart, topStart + k + 1, topStart + k);
    }
  }
}

/**
 * 4. `gc-rocks` (32 tris / 25 verts):
 * Warm Alexandrian limestone 3-stone geological cluster: 1 angled tabular limestone slab (`aPart=0`) +
 * 2 satellite scree wedges (`aPart=1`), sunk -0.08 m, warm `#C2B59A` top / `#8F846F` side.
 */
export function buildRocksGeometry(): THREE.BufferGeometry {
  const b = createBuilder();
  // Primary angled tabular limestone slab (6-sided + crown = 13 verts, 18 tris)
  addLimestoneBlock(b, -0.04, 0.02, 0.56, 0.44, 0.34, 6, 0.25, 0.22, -0.10, 0.0, true, 1.3);
  // Satellite scree wedge 1 (3-sided = 6 verts, 7 tris)
  addLimestoneBlock(b, 0.52, 0.22, 0.30, 0.24, 0.21, 3, 1.15, -0.18, 0.14, 1.0, false, 2.9);
  // Satellite scree wedge 2 (3-sided = 6 verts, 7 tris)
  addLimestoneBlock(b, -0.44, -0.34, 0.24, 0.20, 0.16, 3, 3.85, 0.15, 0.18, 1.0, false, 4.7);
  return finalizeGeometry(b, "gc-rocks");
}

/**
 * 5. `gc-coastal` (28 tris / 29 verts):
 * Sculptural curved-blade sea-sage agave rosette: 7 keeled splayed blades in 2 whorls +
 * 7 basal core triangles uniting the rosette heart (zero hollow center).
 */
export function buildCoastalGeometry(): THREE.BufferGeometry {
  const b = createBuilder();
  // 7 blades ordered monotonically by azimuth so basal core fan stays clean and non-overlapping
  const blades: ReadonlyArray<readonly [number, number, number, number, number]> = [
    // [yaw, width, height, reach, innerFlag]
    [0.08, 0.17, 0.40, 0.64, 0],
    [0.98, 0.14, 0.58, 0.36, 1],
    [1.88, 0.17, 0.38, 0.62, 0],
    [2.78, 0.14, 0.62, 0.33, 1],
    [3.68, 0.16, 0.41, 0.60, 0],
    [4.58, 0.14, 0.56, 0.37, 1],
    [5.48, 0.17, 0.37, 0.63, 0],
  ];

  const baseIndices: number[] = [];
  for (let i = 0; i < blades.length; i++) {
    const [yaw, width, height, reach, inner] = blades[i];
    const startIdx = b.pos.length / 3;
    const rad = inner ? 0.05 : 0.09;
    const cx = Math.sin(yaw) * rad;
    const cz = Math.cos(yaw) * rad;
    const shade = inner ? 0.90 : 1.0;
    addVBlade(
      b,
      cx,
      -0.06,
      cz,
      yaw,
      width,
      height,
      reach,
      0.042,
      0.0,
      1.0,
      0.0,
      [0.78 * shade, 0.84 * shade, 0.82 * shade],
      [1.04 * shade, 1.06 * shade, 1.03 * shade],
    );
    baseIndices.push(startIdx); // baseL = startIdx, baseR = startIdx + 1
  }

  // Basal rosette heart uniting the 7 blade roots (1 heart vertex + 7 tris -> total 29 verts, 28 tris)
  const heart = addVert(b, 0, 0.12, 0, 0, 1, 0, 0.05, 1.0, 0.72, 0.78, 0.76);
  for (let i = 0; i < baseIndices.length; i++) {
    const next = (i + 1) % baseIndices.length;
    addTri(b, heart, baseIndices[i] + 1, baseIndices[next]);
  }

  return finalizeGeometry(b, "gc-coastal");
}

/**
 * 6. `gc-urban` (36 tris / 32 verts):
 * Mediterranean terracotta planter / stone curb pot (`aPart=0`, 18 verts / 24 tris) with
 * overflowing rosemary / bougainvillea puff (`aPart=1`, 14 verts / 12 tris, spherical-radial smooth normals).
 */
export function buildUrbanGeometry(): THREE.BufferGeometry {
  const b = createBuilder();

  // 6-sided tapered terracotta planter with flared collar rim (3 rings × 6 = 18 verts, 24 tris)
  const sides = 6;
  const rings: ReadonlyArray<readonly [number, number, number, readonly [number, number, number]]> = [
    [-0.05, 0.21, 0.0, [0.76, 0.74, 0.72]],
    [0.37, 0.31, 0.0, [1.0, 0.99, 0.97]],
    [0.42, 0.27, 0.0, [1.06, 1.04, 1.01]],
  ];
  const ringStarts: number[] = [];
  for (let r = 0; r < rings.length; r++) {
    ringStarts.push(b.pos.length / 3);
    const [y, rad, bt, hint] = rings[r];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2 + 0.25;
      const sx = Math.sin(a), cz = Math.cos(a);
      const ny = r === 2 ? 0.84 : 0.26;
      const nh = r === 2 ? 0.54 : 0.96;
      addVert(b, sx * rad, y, cz * rad, sx * nh, ny, cz * nh, bt, 0.0, hint[0], hint[1], hint[2]);
    }
  }
  for (let r = 0; r < 2; r++) {
    const r0 = ringStarts[r], r1 = ringStarts[r + 1];
    for (let k = 0; k < sides; k++) {
      const kn = (k + 1) % sides;
      addTri(b, r0 + k, r0 + kn, r1 + k);
      addTri(b, r1 + k, r0 + kn, r1 + kn);
    }
  }

  // Overflowing rosemary / bougainvillea crown: 2 overlapping organic dome puffs (2 × 7 verts = 14 verts, 12 tris)
  const puffStart = b.pos.length / 3;
  const puffs: ReadonlyArray<readonly [number, number, number, number, number, number, number]> = [
    // [cx, baseY, cz, rx, ry, rz, seed]
    [0.0, 0.37, 0.0, 0.36, 0.37, 0.34, 1.7],
    [0.18, 0.31, 0.14, 0.28, 0.26, 0.26, 3.4],
  ];
  for (const [cx, baseY, cz, rx, ry, rz, seed] of puffs) {
    const apex = addVert(b, cx, baseY + ry, cz, 0, 1, 0, 1.0, 1.0, 1.05, 1.05, 1.03);
    const skirt = b.pos.length / 3;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + seed * 0.4;
      const w = 1 + 0.13 * Math.sin(k * 2.5 + seed);
      const x = cx + Math.sin(a) * rx * w;
      const z = cz + Math.cos(a) * rz * w;
      const y = baseY - 0.02 * Math.cos(k * 1.9 + seed);
      addVert(b, x, y, z, Math.sin(a) * 0.72, 0.69, Math.cos(a) * 0.72, 0.42, 1.0, 0.84, 0.86, 0.82);
    }
    for (let k = 0; k < 6; k++) {
      addTri(b, apex, skirt + k, skirt + ((k + 1) % 6));
    }
  }

  // Smooth spherical-radial normals on the overflowing foliage puff (rooted at rim center y = 0.28)
  const puffEnd = b.pos.length / 3;
  for (let i = puffStart; i < puffEnd; i++) {
    const x = b.pos[i * 3];
    const y = b.pos[i * 3 + 1];
    const z = b.pos[i * 3 + 2];
    const dx = x - 0.05;
    const dy = y - 0.26;
    const dz = z - 0.04;
    const len = Math.hypot(dx, dy, dz) || 1;
    b.nor[i * 3] = dx / len;
    b.nor[i * 3 + 1] = dy / len;
    b.nor[i * 3 + 2] = dz / len;
    const t = THREE.MathUtils.clamp((y - 0.28) / 0.46, 0.25, 1.0);
    b.bladeT[i] = t;
    const ao = 0.78 + 0.28 * t;
    b.hint[i * 3] = ao;
    b.hint[i * 3 + 1] = ao;
    b.hint[i * 3 + 2] = ao;
  }

  return finalizeGeometry(b, "gc-urban");
}

/** Build one procedural ground-cover archetype geometry by name. */
export function buildArchetypeGeometry(kind: GroundCoverArchetype): THREE.BufferGeometry {
  switch (kind) {
    case "grass": return buildGrassGeometry();
    case "understory": return buildUnderstoryGeometry();
    case "maquis": return buildMaquisGeometry();
    case "flowers": return buildFlowersGeometry();
    case "rocks": return buildRocksGeometry();
    case "coastal": return buildCoastalGeometry();
    case "urban": return buildUrbanGeometry();
  }
}

/** Build all 7 opaque procedural ground-cover archetype geometries. */
export function buildGroundCoverKit(): Record<GroundCoverArchetype, THREE.BufferGeometry> {
  return {
    grass: buildGrassGeometry(),
    understory: buildUnderstoryGeometry(),
    maquis: buildMaquisGeometry(),
    flowers: buildFlowersGeometry(),
    rocks: buildRocksGeometry(),
    coastal: buildCoastalGeometry(),
    urban: buildUrbanGeometry(),
  };
}
