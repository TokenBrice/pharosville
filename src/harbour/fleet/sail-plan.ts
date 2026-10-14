/**
 * Sail plan, measured once at bake time from a hull's set sails (no Blender re-export):
 *
 *  - EMBLEMS. The kit's TEXCOORD_1 puts a modest emblem square on sail_main. Its linear fit gives the emblem
 *    plane's axes (u along the sail, v head → foot, read on the front face); the roundel is then re-sized to the
 *    largest circle inscribed in the sail's outline (small margin), and a second, slightly smaller roundel goes on
 *    the next biggest lower sail (schooner foresail, brig / ship fore course, lugger mizzen; every course of a
 *    barque or clipper), wound to read the same way. The emblem square is sized so the LOGO (LOGO_R) fills that circle: the white disc and its brand ring
 *    are bigger than the circle, so the shader clamps them to the sail outline with a small margin (fleet-material).
 *  - ROLES (aMeta.z on sail corners): how the brand dye takes on each cloth (fleet-material):
 *    body (dyed), headsail (jib / staysails: a light tint with a brand edge band), upper sail (topsails: lighter),
 *    band (a titan's painted head band: a deeper shade).
 */
export const ROLE_BODY = 0, ROLE_HEAD = 1, ROLE_UPPER = 2, ROLE_BAND = 3;
/** Radius of the logo itself in emblem space (scripts/harbour/build-emblems.mjs LOGO_R / slot, through the 0.97 inset). */
export const LOGO_R = 0.42;
/** Share of the inscribed circle the logo fills: main sail, second sail. */
const FILL_MAIN = 0.97, FILL_SECOND = 0.85;
const NO_EMBLEM: [number, number] = [-1, -1];

export interface SailMeshIn {
  name: string;
  /** Set-shape corner positions in the hull frame (xyz). */
  pos: ArrayLike<number>;
  /** Triangle corners. */
  index: ArrayLike<number>;
  /** The kit's TEXCOORD_1 (emblem square), when present. */
  uv1: ArrayLike<number> | null;
  /** COLOR_0 rgb per corner, when present. */
  color: ArrayLike<number> | null;
}
export interface SailMeshOut { emb: Float32Array; role: Float32Array }

interface Comp { mesh: number; verts: number[]; tris: number[]; area: number; minX: number; maxX: number; minY: number; maxY: number; band: boolean; upper: boolean }

const SKIP_SECOND = new Set(["sail_main", "sail_jib", "sail_spanker"]);

export function planSails(meshes: SailMeshIn[]): SailMeshOut[] {
  const out = meshes.map((m) => {
    const n = m.pos.length / 3;
    const emb = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { emb[i * 2] = NO_EMBLEM[0]; emb[i * 2 + 1] = NO_EMBLEM[1]; }
    return { emb, role: new Float32Array(n).fill(m.name === "sail_jib" ? ROLE_HEAD : ROLE_BODY) };
  });
  // painted bands: corners off the mesh's own (majority) cloth colour
  meshes.forEach((m, mi) => {
    if (!m.color || m.name === "sail_jib") return;
    const key = (i: number) => `${m.color![i * 3].toFixed(2)},${m.color![i * 3 + 1].toFixed(2)},${m.color![i * 3 + 2].toFixed(2)}`;
    const count = new Map<string, number>();
    const n = m.pos.length / 3;
    for (let i = 0; i < n; i++) count.set(key(i), (count.get(key(i)) ?? 0) + 1);
    const major = [...count].sort((a, b) => b[1] - a[1])[0][0].split(",").map(Number);
    for (let i = 0; i < n; i++) {
      const d = Math.abs(m.color[i * 3] - major[0]) + Math.abs(m.color[i * 3 + 1] - major[1]) + Math.abs(m.color[i * 3 + 2] - major[2]);
      if (d > 0.15) out[mi].role[i] = ROLE_BAND;
    }
  });

  const comps: Comp[] = [];
  meshes.forEach((m, mi) => { for (const c of components(m, mi)) comps.push(c); });
  for (const c of comps) c.band = c.verts.every((v) => out[c.mesh].role[v] === ROLE_BAND);
  // upper sails: another (lower) sail of the rig under them on the same mast
  const rig = comps.filter((c) => meshes[c.mesh].name !== "sail_jib" && !c.band);
  for (const a of rig) {
    const h = a.maxY - a.minY;
    a.upper = rig.some((b) => b !== a && b.minY < a.minY && b.maxY <= a.minY + 0.5 * h
      && Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) >= 0.3 * Math.min(a.maxX - a.minX, b.maxX - b.minX));
    if (a.upper) for (const v of a.verts) if (out[a.mesh].role[v] !== ROLE_BAND) out[a.mesh].role[v] = ROLE_UPPER;
  }

  // the emblem plane, from the kit's own TEXCOORD_1 on sail_main
  const mainIdx = meshes.findIndex((m) => m.name === "sail_main");
  if (mainIdx < 0) return out;
  const main = meshes[mainIdx];
  if (!main.uv1) return out;
  const valid: number[] = [];
  for (let i = 0; i < main.pos.length / 3; i++) if (main.uv1[i * 2] > -3 && main.uv1[i * 2 + 1] < 4) valid.push(i);
  if (valid.length < 3) return out;
  const gu = fitLinear(main.pos, valid, (i) => main.uv1![i * 2]);
  const gv = fitLinear(main.pos, valid, (i) => main.uv1![i * 2 + 1]);
  if (!gu || !gv) return out;
  const du = unit(gu), dv = unit(gv);
  const nrm = cross(du, dv);
  const mainComp = comps.filter((c) => c.mesh === mainIdx).sort((a, b) => overlap(b.verts, valid) - overlap(a.verts, valid))[0];
  if (!mainComp) return out;
  const wind = (c: Comp) => Math.sign(dot(windingNormal(meshes[c.mesh], c), nrm)) || 1;
  const mainWind = wind(mainComp);
  // the second sail, and its twins (a barque's or clipper's other courses, as big): all carry the roundel
  const lower = rig.filter((c) => !c.upper && !SKIP_SECOND.has(meshes[c.mesh].name)).sort((a, b) => b.area - a.area);
  const seconds = lower.filter((c) => c.area >= lower[0].area * 0.8);
  for (const [c, fill] of [[mainComp, FILL_MAIN] as const, ...seconds.map((x) => [x, FILL_SECOND] as const)]) {
    const m = meshes[c.mesh];
    const st = c.verts.map((v) => [dot3(m.pos, v, du), dot3(m.pos, v, dv)] as [number, number]);
    const circle = inscribedCircle(hull2d(st));
    if (!circle) continue;
    const D = (circle.r * fill) / LOGO_R;
    const mirror = c !== mainComp && wind(c) !== mainWind;
    c.verts.forEach((v, k) => {
      const u = (st[k][0] - circle.x) / D + 0.5;
      out[c.mesh].emb[v * 2] = mirror ? 1 - u : u;
      out[c.mesh].emb[v * 2 + 1] = (st[k][1] - circle.y) / D + 0.5;
    });
  }
  return out;
}

/** Connected sails of one mesh: triangles joined through shared corners or coincident positions (split seams). */
function components(m: SailMeshIn, mi: number): Comp[] {
  const n = m.pos.length / 3;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const join = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  for (let k = 0; k + 2 < m.index.length; k += 3) { join(m.index[k], m.index[k + 1]); join(m.index[k], m.index[k + 2]); }
  const at = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(m.pos[i * 3] * 200)},${Math.round(m.pos[i * 3 + 1] * 200)},${Math.round(m.pos[i * 3 + 2] * 200)}`;
    const j = at.get(key);
    if (j == null) at.set(key, i); else join(i, j);
  }
  const by = new Map<number, Comp>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let c = by.get(r);
    if (!c) by.set(r, c = { mesh: mi, verts: [], tris: [], area: 0, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, band: false, upper: false });
    c.verts.push(i);
    const x = m.pos[i * 3], y = m.pos[i * 3 + 1];
    c.minX = Math.min(c.minX, x); c.maxX = Math.max(c.maxX, x); c.minY = Math.min(c.minY, y); c.maxY = Math.max(c.maxY, y);
  }
  for (let k = 0; k + 2 < m.index.length; k += 3) {
    const c = by.get(find(m.index[k]))!;
    c.tris.push(m.index[k], m.index[k + 1], m.index[k + 2]);
    c.area += 0.5 * len(triNormal(m.pos, m.index[k], m.index[k + 1], m.index[k + 2]));
  }
  return [...by.values()];
}

type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dot3 = (p: ArrayLike<number>, i: number, d: V3) => p[i * 3] * d[0] + p[i * 3 + 1] * d[1] + p[i * 3 + 2] * d[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const overlap = (a: number[], b: number[]) => { const s = new Set(b); return a.filter((x) => s.has(x)).length; };

function triNormal(p: ArrayLike<number>, a: number, b: number, c: number): V3 {
  const e1: V3 = [p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]];
  const e2: V3 = [p[c * 3] - p[a * 3], p[c * 3 + 1] - p[a * 3 + 1], p[c * 3 + 2] - p[a * 3 + 2]];
  return cross(e1, e2);
}

/** Area-weighted normal of a sail as wound (its GL front face). */
function windingNormal(m: SailMeshIn, c: Comp): V3 {
  const s: V3 = [0, 0, 0];
  for (let k = 0; k < c.tris.length; k += 3) { const t = triNormal(m.pos, c.tris[k], c.tris[k + 1], c.tris[k + 2]); s[0] += t[0]; s[1] += t[1]; s[2] += t[2]; }
  return s;
}

/** Least-squares gradient of f over positions (f ≈ g·p + b); null when degenerate. */
function fitLinear(p: ArrayLike<number>, idx: number[], f: (i: number) => number): V3 | null {
  const M = Array.from({ length: 4 }, () => new Array<number>(5).fill(0));
  for (const i of idx) {
    const r = [p[i * 3], p[i * 3 + 1], p[i * 3 + 2], 1], y = f(i);
    for (let a = 0; a < 4; a++) { M[a][4] += r[a] * y; for (let b = 0; b < 4; b++) M[a][b] += r[a] * r[b]; }
  }
  for (let a = 0; a < 4; a++) M[a][a] += 1e-6;
  for (let c = 0; c < 4; c++) {
    let piv = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-9) return null;
    for (let r = 0; r < 4; r++) if (r !== c) { const k = M[r][c] / M[c][c]; for (let q = c; q < 5; q++) M[r][q] -= k * M[c][q]; }
  }
  const g: V3 = [M[0][4] / M[0][0], M[1][4] / M[1][1], M[2][4] / M[2][2]];
  return len(g) > 1e-6 ? g : null;
}

/** Convex hull (counter-clockwise, monotone chain). */
export function hull2d(pts: Array<[number, number]>): Array<[number, number]> {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Array<[number, number]> = [], up: Array<[number, number]> = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/**
 * Largest circle inside a convex CCW polygon. Exact: the optimum touches three edges, so every edge triple is
 * solved for its equidistant point and the feasible one with the biggest radius wins. Where the optimum is not
 * unique (a band between two parallel edges, e.g. a square sail) the tied centres are averaged, so it centres.
 */
export function inscribedCircle(poly: Array<[number, number]>): { x: number; y: number; r: number } | null {
  if (poly.length < 3) return null;
  const E = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l;
    return { nx, ny, c: nx * a[0] + ny * a[1] };
  });
  const depth = (x: number, y: number) => { let d = Infinity; for (const e of E) d = Math.min(d, e.nx * x + e.ny * y - e.c); return d; };
  const cands: Array<{ x: number; y: number; r: number }> = [];
  let best = 0;
  for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) for (let k = j + 1; k < E.length; k++) {
    // nx x + ny y - r = c for the three edges (Cramer)
    const a = E[i], b = E[j], c = E[k];
    const det = a.nx * (b.ny * -1 - -1 * c.ny) - a.ny * (b.nx * -1 - -1 * c.nx) + -1 * (b.nx * c.ny - b.ny * c.nx);
    if (Math.abs(det) < 1e-12) continue;
    const x = (a.c * (b.ny * -1 - -1 * c.ny) - a.ny * (b.c * -1 - -1 * c.c) + -1 * (b.c * c.ny - b.ny * c.c)) / det;
    const y = (a.nx * (b.c * -1 - -1 * c.c) - a.c * (b.nx * -1 - -1 * c.nx) + -1 * (b.nx * c.c - b.c * c.nx)) / det;
    const r = (a.nx * (b.ny * c.c - b.c * c.ny) - a.ny * (b.nx * c.c - b.c * c.nx) + a.c * (b.nx * c.ny - b.ny * c.nx)) / det;
    if (!(r > 0) || depth(x, y) < r - 1e-6) continue;
    cands.push({ x, y, r });
    best = Math.max(best, r);
  }
  const top = cands.filter((q) => q.r >= best * 0.995);
  if (!top.length) return null;
  return { x: top.reduce((s, q) => s + q.x, 0) / top.length, y: top.reduce((s, q) => s + q.y, 0) / top.length, r: best };
}
