// Renderer spike: shared, renderer-agnostic world data + geometry.
// Both scene A (WebGLRenderer/GLSL) and scene B (WebGPURenderer/TSL) build from this,
// so the two paths render the same island, piers, hulls, lights and textures.
// Everything takes the THREE namespace as an argument so `three` and `three/webgpu`
// never share object instances.

export const SEA = 1200;              // detailed sea extent (m), shore SDF covers it
export const SHORE_RES = 1024;
export const CONTACT_RES = 1024;
export const WAKE_RES = 1024;
const S2 = Math.SQRT1_2;
// (a, b) = screen-aligned plan coords: a = screen right, b = away from camera (up-screen).
export const toWorld = (a, b) => [(a - b) * S2, (-a - b) * S2];
export const toAB = (x, z) => [(x - z) * S2, (-x - z) * S2];
const YAW_A = Math.atan2(-(-S2), S2); // world yaw of the +a axis (rotation about Y)

export function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iy, s = 0) {
  let h = (ix * 374761393 + iy * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
export function fbm(x, y, oct = 4, s = 0) {
  let v = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { v += amp * vnoise(x * f, y * f, s + i); norm += amp; amp *= 0.5; f *= 2.03; }
  return v / norm;
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); };
const smax = (a, b, k) => -smin(-a, -b, k);
const sdCircle = (a, b, ca, cb, r) => Math.hypot(a - ca, b - cb) - r;
function sdBox(a, b, ca, cb, ha, hb, r) {
  const qx = Math.abs(a - ca) - ha + r, qy = Math.abs(b - cb) - hb + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
function sdCapsule(a, b, a1, b1, a2, b2, r) {
  const pa = a - a1, pb = b - b1, ba = a2 - a1, bb = b2 - b1;
  const h = clamp((pa * ba + pb * bb) / (ba * ba + bb * bb), 0, 1);
  return Math.hypot(pa - ba * h, pb - bb * h) - r;
}
const sdEllipse = (a, b, ca, cb, ra, rb) => (Math.hypot((a - ca) / ra, (b - cb) / rb) - 1) * Math.min(ra, rb);

export const BAY = { ca: 0, cb: 52, ha: 228, hb: 162, r: 70 };
export const QUAY_B = BAY.cb - BAY.hb; // -110
export const LIGHTHOUSE_AB = [-122, 300];
export const BAY_CENTER_AB = [0, 60];

// Analytic land SDF in plan (a,b): negative on land.
export function landSdf(a, b) {
  let d = sdEllipse(a, b, 0, -60, 395, 318);
  d = smin(d, sdCapsule(a, b, -250, 80, -122, 296, 56), 40);
  d = smin(d, sdCapsule(a, b, 250, 80, 135, 268, 44), 40);
  d = smax(d, -sdBox(a, b, BAY.ca, BAY.cb, BAY.ha, BAY.hb, BAY.r), 14);
  d = smax(d, -sdBox(a, b, 0, 300, 68, 110, 20), 10);
  const quiet = (1 - smooth(-96, -70, b)) * (1 - smooth(165, 205, Math.abs(a)));
  const w = 1 - quiet;
  d += ((fbm(a * 0.011, b * 0.011, 3, 11) - 0.5) * 40 + (fbm(a * 0.05, b * 0.05, 2, 23) - 0.5) * 9) * w;
  d = Math.min(d, sdCircle(a, b, 64, 396, 9), sdCircle(a, b, -34, 432, 6), sdCircle(a, b, 146, 414, 7), sdCircle(a, b, -116, 372, 5), sdCircle(a, b, 12, 452, 4));
  return d;
}

// Exact Euclidean distance transform (Felzenszwalb) on a boolean grid.
function edt1d(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
function edt(mask, n) { // distance (texels) to nearest texel where mask=1
  const INF = 1e20, g = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) g[i] = mask[i] ? 0 : INF;
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < n; x++) { for (let y = 0; y < n; y++) f[y] = g[y * n + x]; edt1d(f, n, d, v, z); for (let y = 0; y < n; y++) g[y * n + x] = d[y]; }
  for (let y = 0; y < n; y++) { for (let x = 0; x < n; x++) f[x] = g[y * n + x]; edt1d(f, n, d, v, z); for (let x = 0; x < n; x++) g[y * n + x] = Math.sqrt(d[x]); }
  return g;
}

// Signed shore distance (m): + over water, - on land, over [-SEA/2, SEA/2]^2 in WORLD x,z.
export function buildShoreField() {
  const n = SHORE_RES, cell = SEA / n, land = new Uint8Array(n * n), water = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -SEA / 2 + (i + 0.5) * cell, z = -SEA / 2 + (j + 0.5) * cell;
    const [a, b] = toAB(x, z);
    const isLand = landSdf(a, b) < 0;
    land[j * n + i] = isLand ? 1 : 0; water[j * n + i] = isLand ? 0 : 1;
  }
  const dl = edt(land, n), dw = edt(water, n), out = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) out[k] = (land[k] ? -(dw[k] - 0.5) : (dl[k] - 0.5)) * cell;
  return { data: out, n, cell, size: SEA };
}
export function sampleField(field, x, z) {
  const { data, n, size } = field;
  const fx = clamp((x + size / 2) / size * n - 0.5, 0, n - 1.001), fz = clamp((z + size / 2) / size * n - 0.5, 0, n - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
  const a = data[j * n + i], b = data[j * n + i + 1], c = data[(j + 1) * n + i], d = data[(j + 1) * n + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

// Terrain height (m) from plan coords + signed shore distance.
export function heightAt(a, b, sd) {
  const dl = -sd;
  if (dl < 0) return Math.max(-14, dl * 0.45);
  const bayD = sdBox(a, b, BAY.ca, BAY.cb, BAY.ha, BAY.hb, BAY.r);
  const inner = 1 - smooth(14, 70, bayD);
  const n1 = fbm(a * 0.006, b * 0.006, 3, 5), n2 = fbm(a * 0.03, b * 0.03, 2, 7);
  const beach = 1.3 * smooth(0, 9, dl);
  const cliff = (5.5 + 5 * n2) * smooth(0, 5, dl);
  let h = beach * inner + cliff * (1 - inner);
  const quay = (1 - smooth(-112, -92, b)) * (1 - smooth(175, 200, Math.abs(a)));
  h = h * (1 - quay) + 1.8 * smooth(0, 1.2, dl) * quay;
  const hillStart = quay > 0.5 ? 18 : 8;
  h += 30 * Math.pow(smooth(hillStart, 200, dl), 1.25) * (0.65 + 0.7 * n1) * (1 - 0.45 * quay);
  const [la, lb] = LIGHTHOUSE_AB;
  h += 12 * Math.exp(-((a - la) ** 2 + (b - lb) ** 2) / (55 * 55)) * smooth(0, 10, dl);
  h += (n2 - 0.5) * 1.2 * smooth(4, 20, dl);
  return h;
}

export const PAL = {
  sand: 0xD8C49A, grass: 0x87995A, grass2: 0x9DAA66, grassDark: 0x6F8450, rock: 0x8E857A, rockDark: 0x6B655D,
  stone: 0xB8AE9C, quay: 0xA49A8A, wet: 0x5A5650,
};

function hexToLin(THREE, hex) { return new THREE.Color(hex); } // Color() converts sRGB hex to linear working space

// ---------------------------------------------------------------- terrain mesh
export function buildTerrain(THREE, shore) {
  const ext = 1080, N = 300, step = ext / N, x0 = -ext / 2;
  const H = new Float32Array((N + 1) * (N + 1));
  const AB = new Float32Array((N + 1) * (N + 1) * 2);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const x = x0 + i * step, z = x0 + j * step, [a, b] = toAB(x, z);
    AB[(j * (N + 1) + i) * 2] = a; AB[(j * (N + 1) + i) * 2 + 1] = b;
    H[j * (N + 1) + i] = heightAt(a, b, sampleField(shore, x, z));
  }
  const pos = [], col = [], idx = [], map = new Int32Array((N + 1) * (N + 1)).fill(-1);
  const c = {}; for (const k in PAL) c[k] = hexToLin(THREE, PAL[k]);
  const tmp = new THREE.Color();
  const vert = (i, j) => {
    const k = j * (N + 1) + i; if (map[k] >= 0) return map[k];
    const h = H[k], a = AB[k * 2], b = AB[k * 2 + 1];
    const hx = (H[j * (N + 1) + Math.min(N, i + 1)] - H[j * (N + 1) + Math.max(0, i - 1)]) / (2 * step);
    const hz = (H[Math.min(N, j + 1) * (N + 1) + i] - H[Math.max(0, j - 1) * (N + 1) + i]) / (2 * step);
    const slope = Math.hypot(hx, hz);
    const n = fbm(a * 0.02, b * 0.02, 3, 3), n2 = fbm(a * 0.09, b * 0.09, 2, 9);
    const quay = (1 - smooth(-112, -96, b)) * (1 - smooth(175, 195, Math.abs(a))) * (1 - smooth(1.9, 3.0, h));
    tmp.copy(c.grass).lerp(c.grass2, smooth(0.35, 0.7, n)).lerp(c.grassDark, smooth(0.55, 0.8, n2) * 0.5);
    tmp.lerp(c.sand, 1 - smooth(1.0, 2.2, h));
    tmp.lerp(c.rock, smooth(0.55, 0.95, slope)).lerp(c.rockDark, smooth(1.2, 2.0, slope) * 0.6);
    tmp.lerp(c.wet, (1 - smooth(-0.3, 0.6, h)) * 0.7);
    tmp.lerp(c.quay, quay);
    const v = 0.92 + 0.16 * n2; tmp.multiplyScalar(v);
    map[k] = pos.length / 3; pos.push(x0 + i * step, h, x0 + j * step); col.push(tmp.r, tmp.g, tmp.b);
    return map[k];
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * (N + 1) + i;
    const hs = [H[k], H[k + 1], H[k + N + 1], H[k + N + 2]];
    if (Math.max(...hs) < -0.8) continue;
    const a = vert(i, j), b = vert(i + 1, j), c2 = vert(i, j + 1), d = vert(i + 1, j + 1);
    idx.push(a, c2, b, b, c2, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return { geometry: g, heightAtWorld: (x, z) => { const [a, b] = toAB(x, z); return heightAt(a, b, sampleField(shore, x, z)); } };
}

// ---------------------------------------------------------------- hulls
// Class table (LOA m). Counts scaled from today's 625 to the spike's ~700.
export const CLASSES = [
  { name: 'flagship', loa: 26, beam: 6.4, free: 2.0, draft: 2.4, masts: 3, count: 2, movers: 0, color: 0x23384F },
  { name: 'large', loa: 18, beam: 4.9, free: 1.6, draft: 1.8, masts: 2, count: 22, movers: 0, color: 0x2E4A68 },
  { name: 'medium', loa: 13, beam: 3.9, free: 1.25, draft: 1.4, masts: 1, cutter: true, count: 90, movers: 8 },
  { name: 'small', loa: 10, beam: 3.2, free: 1.05, draft: 1.1, masts: 1, count: 190, movers: 14 },
  { name: 'boat', loa: 7.5, beam: 2.6, free: 0.85, draft: 0.8, masts: 1, cat: true, count: 160, movers: 12 },
  { name: 'skiff', loa: 5, beam: 1.85, free: 0.6, draft: 0.5, masts: 1, cat: true, count: 236, movers: 6 },
];
const HULL_PAINT = [0x2E4A68, 0x2D6E69, 0xECE3CF, 0xA9473B, 0x2B3036, 0x3F5E4A, 0xD9C7A0, 0x6B3A2E];
const BRANDS = [0x26A17B, 0x2775CA, 0xF5AC37, 0xE84142, 0x8247E5, 0x1BA27A, 0xF0B90B, 0x00A3FF, 0xC2A633, 0xFF007A, 0x627EEA, 0x14B8A6, 0xD97706, 0x9333EA, 0x0EA5E9, 0xDC2626];
// aMat codes: 0 fixed vertex colour, 1 hull paint (instance), 2 brand stripe, 3 sail canvas, 4 main sail w/ emblem

function hullBuilder(cls) {
  const P = [], C = [], M = [], U = [], F = [], I = [];
  const add = (p, c, m, u = [0, 0], f = null) => { P.push(...p); C.push(...c); M.push(m); U.push(...u); F.push(...(f ?? p)); return P.length / 3 - 1; };
  const tri = (a, b, c) => I.push(a, b, c);
  const quad = (a, b, c, d) => { I.push(a, b, c, a, c, d); };
  return { P, C, M, U, F, I, add, tri, quad };
}

const lin = (hex) => { const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255; const f = (x) => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; return [f(r), f(g), f(b)]; };

export function buildHullGeometry(THREE, cls) {
  const B = hullBuilder(cls);
  const { loa, beam, free, draft } = cls;
  const NS = cls.loa > 15 ? 18 : 15, NJ = 8, L2 = loa / 2;
  const WHITE = [1, 1, 1], ANTI = lin(0x5B2F2A), DECK = lin(0xB89566), WOOD = lin(0x56412D), MAST = lin(0x7E5D3E), RAIL = lin(0x4A3828);
  const sheer = (s) => free + 0.35 * free * Math.max(0, s) ** 2 + 0.12 * free * Math.max(0, -s) ** 2;
  const halfB = (s) => beam / 2 * (s >= 0 ? Math.sqrt(Math.max(0, 1 - s ** 2.3)) : (1 - 0.32 * (-s) ** 2.6));
  const keel = (s) => -draft * (1 - 0.55 * Math.abs(s) ** 2);
  const st = []; // stations: rings of points (port j=0..NJ, starboard mirrored)
  for (let i = 0; i <= NS; i++) {
    const s = -1 + 2 * i / NS, x = s * L2 * (s > 0 ? 1 : 0.98), hb = Math.max(0.02, halfB(s)), k = keel(s), g = sheer(s);
    const ring = [];
    for (let j = 0; j <= NJ; j++) {
      const th = j / NJ * Math.PI / 2;
      const y = k + (g - k) * (1 - Math.cos(th)) ** 0.85, zz = hb * Math.pow(Math.sin(th), 0.6);
      ring.push([x, y, zz]);
    }
    st.push(ring);
  }
  for (const side of [1, -1]) {
    const ids = st.map((ring) => ring.map(([x, y, z]) => {
      const m = y < 0.02 ? 0 : (y > free * 0.82 + 0.0 ? 2 : 1);
      return B.add([x, y, z * side], m === 0 ? ANTI : WHITE, m);
    }));
    for (let i = 0; i < NS; i++) for (let j = 0; j < NJ; j++) {
      const a = ids[i][j], b = ids[i + 1][j], c = ids[i + 1][j + 1], d = ids[i][j + 1];
      if (side > 0) B.quad(a, b, c, d); else B.quad(a, d, c, b);
    }
  }
  // transom
  { const r = st[0], ids = [], ids2 = [];
    for (let j = 0; j <= NJ; j++) { ids.push(B.add([r[j][0], r[j][1], r[j][2]], WOOD, 0)); ids2.push(B.add([r[j][0], r[j][1], -r[j][2]], WOOD, 0)); }
    for (let j = 0; j < NJ; j++) B.quad(ids[j], ids2[j], ids2[j + 1], ids[j + 1]); }
  // deck
  { const dp = [], ds = [];
    for (let i = 0; i <= NS; i++) { const [x, y, z] = st[i][NJ]; dp.push(B.add([x, y - 0.06, z * 0.96], DECK, 0)); ds.push(B.add([x, y - 0.06, -z * 0.96], DECK, 0)); }
    for (let i = 0; i < NS; i++) B.quad(dp[i], ds[i], ds[i + 1], dp[i + 1]); }
  // bulwark rail (outer strip up + top)
  for (const side of [1, -1]) {
    const lo = [], hi = [];
    for (let i = 0; i <= NS; i++) { const [x, y, z] = st[i][NJ]; lo.push(B.add([x, y, z * side], RAIL, 0)); hi.push(B.add([x, y + 0.22 * free, z * side * 0.97], RAIL, 0)); }
    for (let i = 0; i < NS; i++) { if (side > 0) B.quad(lo[i], lo[i + 1], hi[i + 1], hi[i]); else B.quad(lo[i], hi[i], hi[i + 1], lo[i + 1]); }
  }
  // box helper (with optional colour)
  const box = (cx, cy, cz, sx, sy, sz, c, m = 0) => {
    const v = [];
    for (const dx of [-1, 1]) for (const dy of [-1, 1]) for (const dz of [-1, 1]) v.push(B.add([cx + dx * sx / 2, cy + dy * sy / 2, cz + dz * sz / 2], c, m));
    const f = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
    for (const [a, b, c2, d] of f) B.quad(v[a], v[b], v[c2], v[d]);
  };
  const cyl = (x, y0, z, r0, r1, h, seg, c, dir = 'y') => {
    const lo = [], hi = [];
    for (let k = 0; k < seg; k++) {
      const t = k / seg * Math.PI * 2, cx = Math.cos(t), sz = Math.sin(t);
      if (dir === 'y') { lo.push(B.add([x + cx * r0, y0, z + sz * r0], c, 0)); hi.push(B.add([x + cx * r1, y0 + h, z + sz * r1], c, 0)); }
      else { lo.push(B.add([x, y0 + cx * r0, z + sz * r0], c, 0)); hi.push(B.add([x + h, y0 + cx * r1, z + sz * r1], c, 0)); }
    }
    for (let k = 0; k < seg; k++) { const k2 = (k + 1) % seg; B.quad(lo[k], hi[k], hi[k2], lo[k2]); }
  };
  if (loa >= 9) box(-L2 * 0.22, free + 0.25, 0, loa * 0.22, 0.6, beam * 0.45, lin(0xCDBB98));
  // rig
  const mastH = loa * (cls.masts > 1 ? 1.05 : 1.15) + 2;
  const masts = cls.masts === 3 ? [0.38, 0.02, -0.34] : cls.masts === 2 ? [0.22, -0.18] : [cls.cat ? 0.32 : 0.12];
  const sails = [];
  masts.forEach((mx, mi) => {
    const x = mx * L2 * 2 * 0.5 + 0, h = mastH * (mi === 0 && cls.masts === 2 ? 0.86 : 1) * (cls.masts === 3 && mi === 2 ? 0.88 : 1);
    cyl(x, free - 0.1, 0, 0.09 * Math.sqrt(loa / 6), 0.05 * Math.sqrt(loa / 6), h, 6, MAST);
    const boomY = free + 1.1 + loa * 0.02, boomL = cls.masts === 3 ? loa * 0.22 : cls.cat ? loa * 0.78 : loa * 0.52;
    if (cls.masts !== 3) cyl(x, boomY, 0, 0.06 * Math.sqrt(loa / 6), 0.05 * Math.sqrt(loa / 6), -boomL, 5, MAST, 'x');
    sails.push({ x, h, boomY, boomL, main: mi === (cls.masts === 3 ? 1 : cls.masts - 1) });
  });
  if (!cls.cat) cyl(L2 * 0.92, free + 0.2, 0, 0.06 * Math.sqrt(loa / 6), 0.04 * Math.sqrt(loa / 6), loa * 0.22, 5, MAST, 'x'); // bowsprit
  const CANVAS = [1, 1, 1];
  // gaff/bermudan main sail as a grid; uv in emblem space so emblem square maps to [0,1]
  const sailGrid = (corners, nu, nv, m, emblem, furlY, furlX0, furlX1, belly) => {
    // corners: tack (fore-low), clew (aft-low), peak (aft-high), head (fore-high) in x,y
    const [tk, cl, pk, hd] = corners, ids = [];
    for (let v = 0; v <= nv; v++) for (let u = 0; u <= nu; u++) {
      const fu = u / nu, fv = v / nv;
      const lx = tk[0] + (hd[0] - tk[0]) * fv, ly = tk[1] + (hd[1] - tk[1]) * fv;
      const rx = cl[0] + (pk[0] - cl[0]) * fv, ry = cl[1] + (pk[1] - cl[1]) * fv;
      const x = lx + (rx - lx) * fu, y = ly + (ry - ly) * fu;
      const z = belly * Math.sin(Math.PI * fu) * Math.sin(Math.PI * Math.min(1, fv * 1.1 + 0.1));
      const fx = furlX0 + (furlX1 - furlX0) * fu, fz = 0.25 * Math.sin(Math.PI * fu) * (0.4 + 0.6 * (1 - fv));
      const furl = [fx, furlY + 0.18 + 0.22 * Math.sin(Math.PI * fu) * (0.5 + 0.5 * fv), fz];
      let uvE = [0, 0];
      if (emblem) { const ex = (x - emblem.cx) / emblem.s + 0.5, ey = (y - emblem.cy) / emblem.s + 0.5; uvE = [ex, ey]; }
      ids.push(B.add([x, y, z], CANVAS, m, uvE, furl));
    }
    for (let v = 0; v < nv; v++) for (let u = 0; u < nu; u++) {
      const a = v * (nu + 1) + u, b = a + 1, c = a + nu + 2, d = a + nu + 1;
      B.quad(ids[a], ids[b], ids[c], ids[d]);
    }
  };
  for (const s of sails) {
    if (cls.masts === 3) {
      // square sails on three yards
      for (let k = 0; k < 3; k++) {
        const y0 = s.boomY + k * s.h * 0.26, y1 = y0 + s.h * 0.24, w = beam * (1.35 - 0.22 * k);
        const corners = [[s.x, y0, 0], [s.x, y0, 0], [s.x, y1, 0], [s.x, y1, 0]];
        // build in z-plane: x stays at mast, sail spans z
        const ids = [];
        const nu = 4, nv = 3;
        for (let v = 0; v <= nv; v++) for (let u = 0; u <= nu; u++) {
          const fu = u / nu, fv = v / nv, z = (fu - 0.5) * w, y = y0 + (y1 - y0) * fv;
          const bx = 0.45 * Math.sin(Math.PI * fu) * Math.sin(Math.PI * (0.15 + 0.85 * fv));
          const isMain = s.main && k === 1;
          const uvE = isMain ? [(z) / (w * 0.62) + 0.5, (y - (y0 + y1) / 2) / (w * 0.62) + 0.5] : [0, 0];
          ids.push(B.add([s.x + bx, y, z], CANVAS, isMain ? 4 : 3, uvE, [s.x + 0.15, y1 - 0.1, z * 0.95]));
        }
        for (let v = 0; v < nv; v++) for (let u = 0; u < nu; u++) {
          const a = v * (nu + 1) + u, b = a + 1, c = a + nu + 2, d = a + nu + 1; B.quad(ids[a], ids[b], ids[c], ids[d]);
        }
        void corners;
      }
      cyl(s.x - 0.0, s.boomY - 0.05, -beam * 0.7, 0.05, 0.05, 0, 4, MAST); // stub (keeps tri count honest)
    } else {
      const tk = [s.x, s.boomY + 0.05], cl = [s.x - s.boomL, s.boomY + 0.05];
      const gaff = cls.name !== 'small';
      const pk = gaff ? [s.x - s.boomL * 0.92, s.h * 0.95 + free] : [s.x - 0.3, free + s.h * 0.98];
      const hd = [s.x, free + s.h * (gaff ? 0.8 : 0.98)];
      const cx = s.x - s.boomL * 0.46, cy = s.boomY + (pk[1] - s.boomY) * 0.38, es = Math.min(s.boomL * 0.5, (hd[1] - s.boomY) * 0.42);
      sailGrid([tk, cl, pk, hd], 7, 6, s.main ? 4 : 3, s.main ? { cx, cy, s: es } : null, s.boomY, s.x, s.x - s.boomL, 0.06 * loa);
    }
  }
  // jib / staysails
  if (!cls.cat) {
    const fx = sails[sails.length - 1].x, fh = free + sails[0].h * 0.86, bow = L2 + (cls.masts === 3 ? loa * 0.2 : loa * 0.2);
    const ids = []; const nv = 5;
    for (let v = 0; v <= nv; v++) {
      const fv = v / nv;
      const ax = bow + (fx + 0.3 - bow) * fv, ay = free + 0.4 + (fh - free - 0.4) * fv; // luff along forestay
      const bx = bow - (bow - fx) * 0.65 + (fx + 0.3 - (bow - (bow - fx) * 0.65)) * fv, by = free + 0.6 + (fh - free - 0.6) * fv;
      const z = 0.25 * Math.sin(Math.PI * fv);
      ids.push(B.add([ax, ay, 0], CANVAS, 3, [0, 0], [ax, ay, 0]), B.add([bx, by, z], CANVAS, 3, [0, 0], [ax - 0.15, ay, 0.12]));
    }
    for (let v = 0; v < nv; v++) B.quad(ids[v * 2], ids[v * 2 + 1], ids[v * 2 + 3], ids[v * 2 + 2]);
    if (cls.masts >= 2) {
      for (let k = 1; k < sails.length; k++) { // fore staysails between masts
        const a = sails[k - 1], b = sails[k];
        const top = free + b.h * 0.8;
        const ids2 = []; for (let v = 0; v <= 4; v++) { const fv = v / 4; ids2.push(B.add([a.x + (b.x - a.x) * (1 - fv) * 0.95, free + 1 + (top - free - 1) * fv, 0], CANVAS, 3, [0, 0], [a.x, free + 1, 0]), B.add([a.x + 0.4, free + 1 + (top - free - 1) * fv * 0.85, 0.15], CANVAS, 3, [0, 0], [a.x, free + 1, 0])); }
        for (let v = 0; v < 4; v++) B.quad(ids2[v * 2], ids2[v * 2 + 1], ids2[v * 2 + 3], ids2[v * 2 + 2]);
      }
    }
  }
  // flag at the masthead
  { const s = sails[0], y = free + s.h, x = s.x; const a = B.add([x, y, 0], WHITE, 2), b = B.add([x - 0.9 * Math.sqrt(loa / 7), y - 0.15, 0], WHITE, 2), c = B.add([x, y - 0.6 * Math.sqrt(loa / 7), 0], WHITE, 2); B.tri(a, b, c); }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(B.P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(B.C, 3));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(B.M, 1));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(B.U, 2));
  g.setAttribute('aFurl', new THREE.Float32BufferAttribute(B.F, 3));
  g.setIndex(B.I);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.boundingSphere.radius += 2;
  return { geometry: g, mastTop: [sails[0].x, free + sails[0].h + 0.2, 0], tris: B.I.length / 3 };
}

// ---------------------------------------------------------------- harbour layout
export function buildHarbour(shore) {
  const R = rng(42);
  const shoreAB = (a, b) => { const [x, z] = toWorld(a, b); return sampleField(shore, x, z); };
  const cls = Object.fromEntries(CLASSES.map((c) => [c.name, c]));
  const docked = { flagship: 2, large: 22, medium: 82, small: 176, boat: 148, skiff: 230 };
  // pier specs, left (-a) to right (+a)
  const specs = [
    ['medium', 150], ['medium', 150], ['small', 165], ['small', 165], ['grand', 150], ['small', 165], ['boat', 165], ['boat', 165], ['skiff', 140], ['skiff', 140], ['skiff', 140],
  ];
  const spacingOf = (c) => c.beam + (c.loa > 12 ? 2.6 : c.loa > 8 ? 1.9 : 1.4);
  const halfOf = (name) => name === 'grand' ? 3 + 0.6 + cls.large.loa : 1.2 + 0.6 + cls[name].loa;
  const fair = 9;
  let total = 0; specs.forEach(([n], i) => { total += halfOf(n) * 2 + (i ? fair : 0); });
  let cursor = -total / 2;
  const piers = [], berths = [], decks = [], piles = [], lamps = [];
  for (const [name, len] of specs) {
    const hw = halfOf(name); const a = cursor + hw; cursor += hw * 2 + fair;
    let b0 = QUAY_B - 30; while (shoreAB(a, b0) < 1.5 && b0 < 60) b0 += 1;
    b0 -= 3;
    const w = name === 'grand' ? 6 : name === 'skiff' ? 2.0 : 2.4;
    const p = { name, a, b0, b1: b0 + len, w };
    piers.push(p);
    decks.push({ a, b: b0 + len / 2, la: w, lb: len, h: 1.2, t: 0.35 });
    for (let s = b0 + 2; s <= b0 + len; s += 4.5) for (const side of [-1, 1]) piles.push({ a: a + side * (w / 2 - 0.15), b: s, r: name === 'grand' ? 0.32 : 0.22, top: 1.0 });
    for (let s = b0 + 14, k = 0; s < b0 + len; s += 26, k++) lamps.push({ a: a + (k % 2 ? 1 : -1) * (w / 2 - 0.2), b: s, h: 1.2 + 3.4, kind: 'lamp' });
    lamps.push({ a, b: b0 + len - 0.8, h: 1.2 + 3.4, kind: 'lamp' });
    if (name === 'grand') {
      // T-head
      decks.push({ a, b: b0 + len + 3.5, la: 72, lb: 7, h: 1.25, t: 0.4 });
      for (let s = -35; s <= 35; s += 4.5) for (const side of [0, 7]) piles.push({ a: a + s, b: b0 + len + side, r: 0.32, top: 1.0 });
      lamps.push({ a: a - 34, b: b0 + len + 6.5, h: 5, kind: 'lamp' }, { a: a + 34, b: b0 + len + 6.5, h: 5, kind: 'lamp' });
      // flagships alongside the T-head's far side, broadside to camera
      for (const s of [-1, 1]) berths.push({ cls: 'flagship', a: a + s * 16, b: b0 + len + 7 + 0.8 + cls.flagship.beam / 2, yaw: s > 0 ? 0 : Math.PI });
      // large hulls perpendicular to the grand pier, both sides
      const c = cls.large, sp = (len - 12) / 11;
      for (let k = 0; k < 11; k++) for (const side of [-1, 1]) {
        const b = b0 + 8 + k * sp; berths.push({ cls: 'large', a: a + side * (w / 2 + 0.6 + c.loa / 2), b, yaw: side < 0 ? 0 : Math.PI });
      }
      continue;
    }
    const c = cls[name], sp = spacingOf(c), nSide = Math.floor((len - 8) / sp);
    for (let k = 0; k < nSide; k++) for (const side of [-1, 1]) {
      const b = b0 + 6 + k * sp + sp / 2;
      berths.push({ cls: name, a: a + side * (w / 2 + 0.6 + c.loa / 2), b, yaw: side < 0 ? 0 : Math.PI });
      if (k % 2 === 0) { // finger pier between pairs
        const fl = c.loa * 0.62, fa = a + side * (w / 2 + fl / 2);
        decks.push({ a: fa, b: b + sp / 2, la: fl, lb: 0.75, h: 1.0, t: 0.18 });
        piles.push({ a: a + side * (w / 2 + fl - 0.2), b: b + sp / 2, r: 0.16, top: 0.85 });
      }
    }
  }
  // quay wall + quay lamps
  for (let a = -195; a <= 195; a += 22) lamps.push({ a, b: QUAY_B - 3.5, h: 1.8 + 4, kind: 'lamp' });
  // assign hulls to berths (fill per class; empties remain)
  const byClass = {}; for (const bt of berths) (byClass[bt.cls] ??= []).push(bt);
  const hulls = [];
  for (const c of CLASSES) {
    const list = byClass[c.name] ?? [], need = docked[c.name];
    const pick = list.map((v) => [R(), v]).sort((x, y) => x[0] - y[0]).slice(0, need).map((x) => x[1]);
    for (const bt of pick) hulls.push({ cls: c.name, a: bt.a, b: bt.b, yaw: bt.yaw, moving: false });
    if (pick.length < need) console.warn('berths short', c.name, need - pick.length);
  }
  return { piers, decks, piles, lamps, hulls, berths };
}

// Mover loops (plan coords) — closed Catmull-Rom curves through water.
export const LOOPS = [
  { pts: [[-170, 120], [-90, 82], [0, 74], [95, 84], [175, 122], [165, 182], [60, 196], [-60, 194], [-160, 176]], n: 14 },
  { pts: [[-30, 110], [-34, 210], [-42, 300], [-90, 420], [-10, 510], [120, 486], [200, 400], [100, 338], [36, 270], [36, 180], [20, 116]], n: 12 },
  { pts: [[-240, 372], [-330, 300], [-420, 170], [-470, 30], [-520, 160], [-470, 320], [-360, 420]], n: 8 },
  { pts: [[230, 330], [330, 260], [430, 120], [480, 220], [420, 360], [320, 420]], n: 6 },
];

export function catmull(pts, t) { // closed, t in [0,1)
  const n = pts.length, f = ((t % 1) + 1) % 1 * n, i = Math.floor(f), u = f - i;
  const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
  const c = (k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u * u + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u * u * u);
  return [c(0), c(1)];
}
export function loopLength(pts) { let L = 0, prev = catmull(pts, 0); for (let i = 1; i <= 400; i++) { const p = catmull(pts, i / 400); L += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p; } return L; }

export function buildMovers() {
  const R = rng(7), order = [];
  for (const c of CLASSES) for (let k = 0; k < c.movers; k++) order.push(c.name);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const movers = []; let oi = 0;
  LOOPS.forEach((loop, li) => {
    const L = loopLength(loop.pts);
    for (let k = 0; k < loop.n; k++) {
      const name = order[oi++ % order.length], c = CLASSES.find((x) => x.name === name);
      movers.push({ cls: name, loop: li, len: L, phase: (k + R() * 0.4) / loop.n, speed: 3.2 + c.loa * 0.12 + R() * 0.6, moving: true });
    }
  });
  return movers;
}

// ---------------------------------------------------------------- town + trees
export function buildTown(heightAtWorld, shore) {
  const R = rng(99), houses = [], trees = [], lanterns = [];
  for (let b = -128; b > -360; b -= 12.5) {
    const street = Math.round((b + 128) / 12.5) % 4 === 3;
    if (street) continue;
    for (let a = -270; a <= 270; a += 11.5) {
      const ja = a + (R() - 0.5) * 3, jb = b + (R() - 0.5) * 2.5;
      const [x, z] = toWorld(ja, jb), sd = sampleField(shore, x, z);
      if (sd > -9) continue;
      const density = 0.92 - smooth(-200, -340, jb) * 0.6 - smooth(180, 270, Math.abs(ja)) * 0.6 + (fbm(ja * 0.02, jb * 0.02, 2, 4) - 0.5) * 0.8;
      if (R() > density) { if (R() < 0.5) trees.push({ x, z, s: 0.8 + R() * 0.7 }); continue; }
      const h0 = Math.min(heightAtWorld(x - 3, z - 3), heightAtWorld(x + 3, z + 3), heightAtWorld(x + 3, z - 3), heightAtWorld(x - 3, z + 3));
      houses.push({ x, y: h0, z, w: 6 + R() * 2.5, d: 7 + R() * 2.5, h: 4.8 + R() * 2.4, yaw: YAW_A + (R() - 0.5) * 0.12 + (R() < 0.2 ? Math.PI / 2 : 0), wall: Math.floor(R() * 6), roof: Math.floor(R() * 3), lit: R() });
      if (R() < 0.09) lanterns.push({ x: x + 5, z: z + 3 });
    }
  }
  // trees on the hills and headland outside town
  for (let i = 0; i < 2600 && trees.length < 520; i++) {
    const a = (R() - 0.5) * 760, b = -380 + R() * 720;
    const [x, z] = toWorld(a, b), sd = sampleField(shore, x, z);
    if (sd > -8) continue;
    if (b < -125 && b > -360 && Math.abs(a) < 265) continue; // town
    const n = fbm(a * 0.015, b * 0.015, 3, 17);
    if (n < 0.5) continue;
    trees.push({ x, z, s: 0.8 + R() * 0.9 });
  }
  for (const t of trees) t.y = heightAtWorld(t.x, t.z);
  for (const l of lanterns) l.y = heightAtWorld(l.x, l.z);
  return { houses, trees, lanterns };
}
export const WALLS = [0xEDE4D2, 0xE6D3A8, 0xD9A98A, 0xC9D3D6, 0xF2EDE4, 0xBFAE95];
export const ROOFS = [0x4C5F7C, 0x9C4A36, 0x5E5A57];

export function buildHouseGeometry(THREE) {
  // unit house: footprint 1x1 centred, walls y in [-3, 1], roof ridge at 1.55; scaled per instance
  const P = [], C = [], M = [], I = [];
  const add = (p, m) => { P.push(...p); M.push(m); return P.length / 3 - 1; };
  const quad = (a, b, c, d) => I.push(a, b, c, a, c, d);
  const v = (x, y, z, m) => add([x, y, z], m);
  // walls (part 0)
  const W = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  for (let k = 0; k < 4; k++) { const [x0, z0] = W[k], [x1, z1] = W[(k + 1) % 4]; quad(v(x0, -3, z0, 0), v(x0, 1, z0, 0), v(x1, 1, z1, 0), v(x1, -3, z1, 0)); }
  // gables (part 0)
  I.push(v(-0.5, 1, -0.5, 0), v(-0.5, 1.6, 0, 0), v(-0.5, 1, 0.5, 0));
  I.push(v(0.5, 1, 0.5, 0), v(0.5, 1.6, 0, 0), v(0.5, 1, -0.5, 0));
  // roof with eaves overhang (part 1), plus thickness edge
  const o = 0.08;
  quad(v(-0.5 - o, 0.94, -0.5 - o, 1), v(0.5 + o, 0.94, -0.5 - o, 1), v(0.5 + o, 1.62, 0, 1), v(-0.5 - o, 1.62, 0, 1));
  quad(v(0.5 + o, 0.94, 0.5 + o, 1), v(-0.5 - o, 0.94, 0.5 + o, 1), v(-0.5 - o, 1.62, 0, 1), v(0.5 + o, 1.62, 0, 1));
  // windows (part 2) on long sides z=±0.5, two each, and gable ends one each; door (part 3)
  const win = (x, z, nx, nz, w, h, y, m = 2) => {
    const e = 0.012, tx = -nz, tz = nx;
    quad(v(x + nx * e - tx * w, y - h, z + nz * e - tz * w, m), v(x + nx * e + tx * w, y - h, z + nz * e + tz * w, m), v(x + nx * e + tx * w, y + h, z + nz * e + tz * w, m), v(x + nx * e - tx * w, y + h, z + nz * e - tz * w, m));
  };
  for (const s of [-1, 1]) { win(-0.25, s * 0.5, 0, s, 0.07, 0.11, 0.55); win(0.25, s * 0.5, 0, s, 0.07, 0.11, 0.55); win(s * 0.5, 0.0, s, 0, 0.07, 0.11, 0.6); }
  win(0.02, 0.5, 0, 1, 0.08, 0.2, 0.2, 3);
  // chimney (part 4)
  const ch = (x, z) => { const s = 0.07, y0 = 1.1, y1 = 1.85; const c = [[x - s, z - s], [x + s, z - s], [x + s, z + s], [x - s, z + s]]; for (let k = 0; k < 4; k++) { const [a0, b0] = c[k], [a1, b1] = c[(k + 1) % 4]; quad(v(a0, y0, b0, 4), v(a0, y1, b0, 4), v(a1, y1, b1, 4), v(a1, y0, b1, 4)); } };
  ch(0.3, 0.18);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(M, 1));
  g.setIndex(I); g.computeVertexNormals();
  return g;
}

export function buildTreeGeometry(THREE) {
  const crown = new THREE.IcosahedronGeometry(3.2, 1); crown.scale(1, 1.15, 1); crown.translate(0, 6.2, 0);
  const crown2 = new THREE.IcosahedronGeometry(2.2, 0); crown2.translate(1.2, 8.2, 0.6);
  const trunk = new THREE.CylinderGeometry(0.35, 0.5, 4.5, 6, 1, true); trunk.translate(0, 2.0, 0);
  const parts = [crown, crown2, trunk].map((g) => g.toNonIndexed());
  const cols = [0x5E8044, 0x73934C, 0x6A4E35].map((h) => lin(h));
  const P = [], C = [];
  parts.forEach((g, k) => { const p = g.attributes.position.array; for (let i = 0; i < p.length; i += 3) { P.push(p[i], p[i + 1], p[i + 2]); const j = 0.9 + 0.2 * ((i * 7919) % 13) / 13; C.push(cols[k][0] * j, cols[k][1] * j, cols[k][2] * j); } });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- lighthouse (placeholder, ~0.6k tris)
export function buildLighthouse(THREE, heightAtWorld) {
  const [la, lb] = LIGHTHOUSE_AB, [x, z] = toWorld(la, lb), y = heightAtWorld(x, z);
  const geos = [];
  const push = (g, hex, ty = 0) => { g.translate(0, ty, 0); const c = lin(hex), n = g.attributes.position.count, arr = new Float32Array(n * 3); for (let i = 0; i < n; i++) arr.set(c, i * 3); g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); if (g.index) g = g.toNonIndexed(); geos.push(g); };
  push(new THREE.BoxGeometry(10, 7, 10), 0x9C958A, 0.5);
  push(new THREE.BoxGeometry(11, 0.7, 11), 0x847D73, 4.2);
  push(new THREE.CylinderGeometry(3.3, 4.0, 13, 8), 0xB4ADA2, 4.5 + 6.5);
  push(new THREE.CylinderGeometry(3.6, 3.6, 0.6, 8), 0x8C857B, 17.3);
  push(new THREE.CylinderGeometry(2.7, 3.1, 8, 20), 0xC2BBB0, 17.6 + 4);
  push(new THREE.CylinderGeometry(3.9, 3.0, 1.0, 20), 0x8C857B, 26.0);
  push(new THREE.CylinderGeometry(3.7, 3.7, 1.0, 24, 1, true), 0x22262B, 27.0);
  push(new THREE.CylinderGeometry(2.25, 2.25, 0.5, 16), 0x2A2E33, 26.8);
  push(new THREE.ConeGeometry(2.6, 2.0, 16), 0x2A2E33, 31.3);
  push(new THREE.SphereGeometry(0.35, 8, 6), 0xB08A4A, 32.5);
  // keeper's cottage
  const cot = new THREE.BoxGeometry(9, 4.5, 6); cot.translate(11, 2.25, 4); push(cot, 0xE8DFCC);
  const roof = new THREE.CylinderGeometry(0.01, 4.6, 3, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(1.4, 1, 0.95); roof.translate(11, 5.9, 4); push(roof, 0x4C5F7C);
  const merged = mergeNonIndexed(THREE, geos);
  merged.computeVertexNormals();
  const glass = new THREE.CylinderGeometry(2.05, 2.05, 2.6, 16, 1, true); glass.translate(0, 28.8, 0);
  return { geometry: merged, glass, x, y, z, lantern: [x, y + 28.8, z] };
}
function mergeNonIndexed(THREE, geos) {
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), C = new Float32Array(n * 3); let o = 0;
  for (const g of geos) { P.set(g.attributes.position.array, o * 3); C.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(P, 3)); m.setAttribute('color', new THREE.BufferAttribute(C, 3)); return m;
}

// ---------------------------------------------------------------- textures (CPU generated)
export function buildDetailNormal(size = 512) {
  // tileable sum of integer-frequency sines, wind-biased; RGBA8 normal map (xy in rg, height in a)
  const R = rng(3), waves = [];
  for (let k = 0; k < 44; k++) {
    const ang = (R() - 0.5) * Math.PI * 1.1 + 0.6, f = 3 + Math.floor(R() ** 1.6 * 26);
    const fx = Math.round(Math.cos(ang) * f), fy = Math.round(Math.sin(ang) * f);
    if (!fx && !fy) continue;
    waves.push({ fx, fy, amp: 1 / Math.pow(Math.hypot(fx, fy), 1.25), ph: R() * Math.PI * 2 });
  }
  const out = new Uint8Array(size * size * 4), TAU = Math.PI * 2;
  let maxS = 0; const tmp = new Float32Array(size * size * 3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let h = 0, dx = 0, dy = 0;
    for (const w of waves) { const p = TAU * (w.fx * x + w.fy * y) / size + w.ph; const s = Math.sin(p), c = Math.cos(p); const sh = 1 - Math.abs(s); h += w.amp * sh * sh; const ds = -2 * sh * Math.sign(s) * c * w.amp * TAU / size; dx += ds * w.fx; dy += ds * w.fy; }
    const i = (y * size + x) * 3; tmp[i] = dx; tmp[i + 1] = dy; tmp[i + 2] = h; maxS = Math.max(maxS, Math.abs(dx), Math.abs(dy));
  }
  let maxH = 0; for (let i = 2; i < tmp.length; i += 3) maxH = Math.max(maxH, tmp[i]);
  for (let i = 0, j = 0; i < tmp.length; i += 3, j += 4) {
    const sx = -tmp[i] / maxS, sy = -tmp[i + 1] / maxS;
    out[j] = Math.round((sx * 0.5 + 0.5) * 255); out[j + 1] = Math.round((sy * 0.5 + 0.5) * 255); out[j + 2] = 255; out[j + 3] = Math.round(tmp[i + 2] / maxH * 255);
  }
  return { data: out, size };
}
export function buildNoise(size = 256) {
  const out = new Uint8Array(size * size * 4);
  // tileable value-noise fbm per channel (periodic hash)
  const per = (x, y, p, s) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const h = (i, j) => hash2(((i % p) + p) % p, ((j % p) + p) % p, s);
    const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  for (let ch = 0; ch < 4; ch++) {
    const base = [4, 8, 16, 32][ch];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let v = 0, amp = 0.5, f = base, norm = 0;
      for (let o = 0; o < 4; o++) { v += amp * per(x / size * f, y / size * f, f, ch * 17 + o); norm += amp; amp *= 0.5; f *= 2; }
      out[(y * size + x) * 4 + ch] = Math.round(v / norm * 255);
    }
  }
  return { data: out, size };
}
export function buildContactField(piles) {
  // distance (m) to nearest pile surface, over the bay region (world-aligned square)
  const [cx, cz] = toWorld(0, 40), size = 620, n = CONTACT_RES, cell = size / n, MAX = 6;
  const data = new Float32Array(n * n).fill(MAX);
  for (const p of piles) {
    const [px, pz] = toWorld(p.a, p.b);
    const fi = (px - (cx - size / 2)) / cell - 0.5, fj = (pz - (cz - size / 2)) / cell - 0.5, rr = Math.ceil(MAX / cell);
    for (let j = Math.max(0, Math.floor(fj - rr)); j <= Math.min(n - 1, Math.ceil(fj + rr)); j++)
      for (let i = Math.max(0, Math.floor(fi - rr)); i <= Math.min(n - 1, Math.ceil(fi + rr)); i++) {
        const d = Math.hypot((i - fi) * cell, (j - fj) * cell) - p.r;
        if (d < data[j * n + i]) data[j * n + i] = d;
      }
  }
  return { data, n, size, center: [cx, cz] };
}
export function buildEmblemAtlas(size = 4096) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), slot = size / 16, R = rng(5);
  g.clearRect(0, 0, size, size);
  const letters = ['T', 'C', 'D', 'U', 'E', 'P', 'F', 'G', 'L', 'R', 'S', 'B', 'M', 'A', 'X', 'Y', 'Z', 'O', 'H', 'K'];
  for (let k = 0; k < 256; k++) {
    const x = (k % 16) * slot, y = Math.floor(k / 16) * slot, cx = x + slot / 2, cy = y + slot / 2;
    const col = '#' + BRANDS[k % BRANDS.length].toString(16).padStart(6, '0');
    g.fillStyle = col; g.beginPath(); g.arc(cx, cy, slot * 0.42, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = slot * 0.04; g.beginPath(); g.arc(cx, cy, slot * 0.34, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#ffffff'; g.font = `bold ${Math.round(slot * 0.36)}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(letters[k % letters.length] + (k >= 20 ? letters[Math.floor(R() * letters.length)].toLowerCase() : ''), cx, cy + slot * 0.02);
  }
  return c;
}

// ---------------------------------------------------------------- scene assembly data
export function buildWorld(THREE) {
  const t0 = performance.now();
  const shore = buildShoreField();
  const terrain = buildTerrain(THREE, shore);
  const harbour = buildHarbour(shore);
  const movers = buildMovers();
  const town = buildTown(terrain.heightAtWorld, shore);
  const lighthouse = buildLighthouse(THREE, terrain.heightAtWorld);
  const hullGeos = CLASSES.map((c) => buildHullGeometry(THREE, c));
  const contact = buildContactField(harbour.piles);
  const normal = buildDetailNormal(512), noise = buildNoise(256);
  const atlas = buildEmblemAtlas(4096);
  // instance tables per class
  const R = rng(1234);
  const perClass = CLASSES.map(() => []);
  for (const h of harbour.hulls) perClass[CLASSES.findIndex((c) => c.name === h.cls)].push(h);
  for (const m of movers) perClass[CLASSES.findIndex((c) => c.name === m.cls)].push(m);
  for (const list of perClass) for (const h of list) {
    h.phase0 = R() * Math.PI * 2; h.emblem = Math.floor(R() * 256); h.family = R() < 0.78 ? 0 : R() < 0.5 ? 1 : 2;
    h.paint = lin(HULL_PAINT[Math.floor(R() * HULL_PAINT.length)]); h.brand = lin(BRANDS[h.emblem % BRANDS.length]);
    if (!h.moving) { const [x, z] = toWorld(h.a, h.b); h.x = x; h.z = z; h.wyaw = YAW_A + h.yaw; }
  }
  // lights
  const lights = [];
  for (const l of harbour.lamps) { const [x, z] = toWorld(l.a, l.b); const g = Math.max(1.25, terrain.heightAtWorld(x, z)); const y = Math.max(l.h, g + 3.4); lights.push({ x, y, z, col: [1.0, 0.62, 0.30], size: 1.4, k: 4, pillar: true, kind: 0, pool: [g + 0.05, 9] }); }
  for (const l of town.lanterns) lights.push({ x: l.x, y: l.y + 3.2, z: l.z, col: [1.0, 0.66, 0.32], size: 1.2, k: 5, pillar: false, kind: 0, pool: [l.y + 0.1, 8] });
  const dockedRiding = harbour.hulls.filter(() => R() < 0.04);
  for (const h of dockedRiding) { const g = hullGeos[CLASSES.findIndex((c) => c.name === h.cls)]; lights.push({ x: h.x, y: g.mastTop[1], z: h.z, col: [1.0, 0.9, 0.7], size: 0.7, k: 5, pillar: true, kind: 0 }); }
  const buoys = [[40, 372], [100, 380], [-74, 350], [-10, 456], [180, 402], [-150, 360]];
  buoys.forEach(([a, b], i) => { const [x, z] = toWorld(a, b); lights.push({ x, y: 2.2, z, col: i % 2 ? [0.3, 1.0, 0.45] : [1.0, 0.25, 0.18], size: 1.1, k: 8, pillar: true, kind: 1 }); });
  const lhl = lighthouse.lantern; lights.push({ x: lhl[0], y: lhl[1], z: lhl[2], col: [1.0, 0.82, 0.55], size: 7, k: 10, pillar: true, kind: 0 });
  const moverLight0 = lights.length;
  for (let i = 0; i < movers.length; i++) lights.push({ x: 0, y: 8, z: 0, col: [1.0, 0.92, 0.75], size: 0.8, k: 6, pillar: true, kind: 0 });
  return {
    shore, terrain, harbour, movers, town, lighthouse, hullGeos, contact, normal, noise, atlas, perClass, lights, moverLight0,
    genMs: performance.now() - t0,
  };
}

// Advance a mover along its loop; returns world x,z,yaw,heel,shelter
export function moverState(m, t) {
  const loop = LOOPS[m.loop], u = m.phase + (t * m.speed) / m.len;
  const p = catmull(loop.pts, u), p2 = catmull(loop.pts, u + 2 / m.len), p0 = catmull(loop.pts, u - 2 / m.len);
  const [x, z] = toWorld(p[0], p[1]), [x2, z2] = toWorld(p2[0], p2[1]), [x0, z0] = toWorld(p0[0], p0[1]);
  const hx = x2 - x0, hz = z2 - z0, yaw = Math.atan2(-hz, hx);
  const cross = (x - x0) * (z2 - z) - (z - z0) * (x2 - x);
  const heel = 0.16 + clamp(cross * 0.6, -0.12, 0.12);
  return { x, z, yaw, heel };
}

// Gerstner swell (shared constants, mirrored in GLSL & TSL)
export const WAVES = [
  // dirX, dirZ, wavelength, amplitude, steepness
  [0.83, 0.56, 64, 0.55, 0.55],
  [0.98, -0.2, 37, 0.32, 0.55],
  [0.45, 0.89, 23, 0.18, 0.5],
  [0.7, -0.71, 14, 0.09, 0.45],
];

export const TOD = {
  golden: { sunEl: 13, sunAz: 290, sun: 0xFFB27A, sunI: 3.2, hemiSky: 0x9DB4D0, hemiGround: 0x6A5A48, hemiI: 1.0, zenith: 0x5D82B0, horizon: 0xF0C3A0, haze: 0xE6C6AE, night: 0.12, exposure: 1.0 },
  day: { sunEl: 48, sunAz: 215, sun: 0xFFF3E2, sunI: 3.0, hemiSky: 0xA8C6E6, hemiGround: 0x6E6450, hemiI: 1.1, zenith: 0x4A82C4, horizon: 0xC4DCEE, haze: 0xD2E2EE, night: 0.0, exposure: 1.0 },
  night: { sunEl: 28, sunAz: 250, sun: 0xA9BFEA, sunI: 0.55, hemiSky: 0x3A5280, hemiGround: 0x1A1D24, hemiI: 0.75, zenith: 0x0A1430, horizon: 0x2A3A60, haze: 0x223256, night: 1.0, exposure: 1.15 },
};
export function sunDir(tod) {
  const el = tod.sunEl * Math.PI / 180, az = tod.sunAz * Math.PI / 180;
  return [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
}
export function params() {
  const q = new URLSearchParams(location.search);
  return { cam: q.get('cam') ?? 'iso', tod: q.get('tod') ?? 'night', still: q.has('still'), t: q.has('t') ? Number(q.get('t')) : null };
}
export const CAMS = {
  iso: { target: BAY_CENTER_AB, dist: 1000, pitch: 35, yaw: 45 },
  harbour: { target: [-40, -30], dist: 330, pitch: 35, yaw: 45 },
  hero: { target: [0, 60], dist: 900, pitch: 8, yaw: 45 },
  lh: { target: [-110, 240], dist: 260, pitch: 30, yaw: 45 },
  bay: { target: [0, 150], dist: 300, pitch: 35, yaw: 45 },
};
export function camPose(name) {
  const c = CAMS[name] ?? CAMS.iso, [tx, tz] = toWorld(c.target[0], c.target[1]);
  const p = c.pitch * Math.PI / 180, y = c.yaw * Math.PI / 180;
  return { pos: [tx + c.dist * Math.cos(p) * Math.sin(y), c.dist * Math.sin(p), tz + c.dist * Math.cos(p) * Math.cos(y)], target: [tx, 0, tz] };
}
export const WAKE = (() => { const [cx, cz] = toWorld(BAY_CENTER_AB[0], BAY_CENTER_AB[1] + 60); return { cx, cz, size: 760 }; })();

// WebGPU allows only 8 vertex buffers per pipeline by default, so hull attributes are interleaved:
// one per-vertex buffer (position, normal, color, aMat, uv, aFurl) + one per-instance buffer
// (iData vec4, iMove vec4, iPaint vec3, iBrand vec3, iX vec4) + instanceMatrix. Used by A and B alike.
export const INST_STRIDE = 18;
export const INST_OFF = { iData: [0, 4], iMove: [4, 4], iPaint: [8, 3], iBrand: [11, 3], iX: [14, 4] };
export function packHull(THREE, src, n) {
  const names = ['position', 'normal', 'color', 'aMat', 'uv', 'aFurl'];
  const sizes = names.map((k) => src.attributes[k].itemSize), stride = sizes.reduce((a, b) => a + b, 0), count = src.attributes.position.count;
  const arr = new Float32Array(count * stride);
  let off = 0;
  names.forEach((k, j) => { const a = src.attributes[k].array, sz = sizes[j]; for (let i = 0; i < count; i++) for (let c = 0; c < sz; c++) arr[i * stride + off + c] = a[i * sz + c]; off += sz; });
  const ib = new THREE.InterleavedBuffer(arr, stride), g = new THREE.BufferGeometry();
  off = 0; names.forEach((k, j) => { g.setAttribute(k, new THREE.InterleavedBufferAttribute(ib, sizes[j], off)); off += sizes[j]; });
  g.setIndex(src.index); g.boundingSphere = src.boundingSphere;
  const inst = new Float32Array(n * INST_STRIDE), iib = new THREE.InstancedInterleavedBuffer(inst, INST_STRIDE, 1);
  iib.setUsage(THREE.DynamicDrawUsage);
  for (const [k, [o, sz]] of Object.entries(INST_OFF)) g.setAttribute(k, new THREE.InterleavedBufferAttribute(iib, sz, o));
  return { geometry: g, inst, iib };
}
