/**
 * Clearance field for hull paths: metres from a point of water to the nearest land, breakwater,
 * quay, pier deck or finger. Rasterised from the layout itself (coast minus bay, solids, pier
 * segments) on a 2 m grid with a chamfer distance transform, so it is pure and identical for every
 * viewer. Used to pick the open-water side of a turn and to ease paths off structures.
 */
import type { HarbourLayout, Vec2 } from "../layout/types";

export interface ObstacleField {
  minX: number; minZ: number; cell: number; nx: number; nz: number;
  /** Clearance in metres (0 inside obstacles). */
  dist: Float32Array;
  /** Fine signed coast distance (m, > 0 = sea) from the baked sea SDF, when the sim was given one. */
  coast: CoastGrid | null;
}

/**
 * The baked sea SDF's coast channel (layout.sea.sdf, R = 0.5 + coastDistance / 128), rows from minZ.
 * The rendered island's real coastline: the layout's coast polygon is only its outline sketch.
 */
export interface CoastGrid { data: Uint8Array; size: number; bounds: [number, number, number, number] }
export const COAST_RANGE = 128;

/** Signed coast distance (m, > 0 = sea), bilinear; open sea outside the grid. */
export function coastDistance(c: CoastGrid, x: number, z: number): number {
  const n = c.size, b = c.bounds;
  const u = ((x - b[0]) / (b[2] - b[0])) * n - 0.5, v = ((z - b[1]) / (b[3] - b[1])) * n - 0.5;
  if (u < 0 || v < 0 || u >= n - 1 || v >= n - 1) return COAST_RANGE / 2;
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * n + i, d = c.data;
  const r = (d[k] * (1 - fu) + d[k + 1] * fu) * (1 - fv) + (d[k + n] * (1 - fu) + d[k + n + 1] * fu) * fv;
  return (r / 255 - 0.5) * COAST_RANGE;
}

const CELL = 2;

function fillPolygon(mask: Uint8Array, nx: number, nz: number, poly: readonly Vec2[], f: ObstacleField, value: number): void {
  if (poly.length < 3) return;
  const px = poly.map((p) => (p[0] - f.minX) / f.cell), pz = poly.map((p) => (p[1] - f.minZ) / f.cell);
  let z0 = Infinity, z1 = -Infinity;
  for (const z of pz) { z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const xs: number[] = [];
  for (let j = Math.max(0, Math.floor(z0)); j <= Math.min(nz - 1, Math.ceil(z1)); j++) {
    const zc = j + 0.5;
    xs.length = 0;
    for (let k = 0, m = poly.length - 1; k < poly.length; m = k++) {
      const za = pz[m], zb = pz[k];
      if ((za <= zc && zb > zc) || (zb <= zc && za > zc)) xs.push(px[m] + ((zc - za) / (zb - za)) * (px[k] - px[m]));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let i = Math.max(0, Math.ceil(xs[k] - 0.5)); i <= Math.min(nx - 1, Math.floor(xs[k + 1] - 0.5)); i++) mask[j * nx + i] = value;
    }
  }
}

function stampCapsule(mask: Uint8Array, f: ObstacleField, a: Vec2, b: Vec2, radius: number): void {
  const r = radius / f.cell;
  const ax = (a[0] - f.minX) / f.cell, az = (a[1] - f.minZ) / f.cell, bx = (b[0] - f.minX) / f.cell, bz = (b[1] - f.minZ) / f.cell;
  const i0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1)), i1 = Math.min(f.nx - 1, Math.ceil(Math.max(ax, bx) + r + 1));
  const j0 = Math.max(0, Math.floor(Math.min(az, bz) - r - 1)), j1 = Math.min(f.nz - 1, Math.ceil(Math.max(az, bz) + r + 1));
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const cx = i + 0.5, cz = j + 0.5;
    const t = l2 > 0 ? Math.min(1, Math.max(0, ((cx - ax) * dx + (cz - az) * dz) / l2)) : 0;
    if (Math.hypot(cx - ax - dx * t, cz - az - dz * t) <= r + 0.35) mask[j * f.nx + i] = 1;
  }
}

/** Two-pass 3-4 chamfer distance (in cells) to the nearest set cell. */
function chamfer(mask: Uint8Array, nx: number, nz: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(nx * nz);
  for (let k = 0; k < d.length; k++) d[k] = mask[k] ? 0 : INF;
  const a = 1, b = Math.SQRT2;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + a);
    if (j > 0) {
      v = Math.min(v, d[k - nx] + a);
      if (i > 0) v = Math.min(v, d[k - nx - 1] + b);
      if (i < nx - 1) v = Math.min(v, d[k - nx + 1] + b);
    }
    d[k] = v;
  }
  for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i;
    let v = d[k];
    if (i < nx - 1) v = Math.min(v, d[k + 1] + a);
    if (j < nz - 1) {
      v = Math.min(v, d[k + nx] + a);
      if (i < nx - 1) v = Math.min(v, d[k + nx + 1] + b);
      if (i > 0) v = Math.min(v, d[k + nx - 1] + b);
    }
    d[k] = v;
  }
  return d;
}

export function buildObstacleField(layout: HarbourLayout, coast: CoastGrid | null = null): ObstacleField | null {
  const isl = layout.island;
  const hasGeometry = coast != null || (isl?.coast?.length ?? 0) >= 3 || (layout.piers ?? []).some((p) => (p.segments ?? []).length > 0);
  if (!hasGeometry || !layout.bounds) return null;
  const pad = 160;
  const minX = layout.bounds.min[0] - pad, minZ = layout.bounds.min[2] - pad;
  const nx = Math.ceil((layout.bounds.max[0] + pad - minX) / CELL), nz = Math.ceil((layout.bounds.max[2] + pad - minZ) / CELL);
  const f: ObstacleField = { minX, minZ, cell: CELL, nx, nz, dist: new Float32Array(0), coast };
  const mask = new Uint8Array(nx * nz);
  if (coast) {
    // the real coast (quay walls, moles and breakwaters are coast in the SDF)
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      if (coastDistance(coast, minX + (i + 0.5) * CELL, minZ + (j + 0.5) * CELL) < 0.5) mask[j * nx + i] = 1;
    }
  } else {
    const polys = (v: unknown): Vec2[][] => (!Array.isArray(v) || v.length === 0 ? [] : Array.isArray((v as unknown[][])[0]?.[0]) ? (v as Vec2[][]) : [v as Vec2[]]);
    for (const poly of polys(isl?.coast)) fillPolygon(mask, nx, nz, poly, f, 1);
    for (const poly of polys(isl?.bay)) fillPolygon(mask, nx, nz, poly, f, 0);
    for (const line of [isl?.breakwater, isl?.mole]) {
      if (!Array.isArray(line)) continue;
      for (let i = 1; i < line.length; i++) stampCapsule(mask, f, line[i - 1], line[i], 4.5);
    }
  }
  // decks over water: arms, T-heads, fingers (a quay is coast when the SDF is known)
  for (const p of layout.piers ?? []) for (const s of p.segments ?? []) if (!(coast && s.kind === "quay")) stampCapsule(mask, f, s.a, s.b, Math.max(0.6, s.width / 2));
  // Far Ports pontoons
  for (const row of layout.zones?.farPorts?.rows ?? []) for (let i = 1; i < (row.line?.length ?? 0); i++) stampCapsule(mask, f, row.line[i - 1], row.line[i], 1.4);
  const d = chamfer(mask, nx, nz);
  for (let k = 0; k < d.length; k++) d[k] = mask[k] ? 0 : (d[k] - 0.5) * CELL;
  f.dist = d;
  return f;
}

/** Bilinear clearance (metres) at (x, z); far outside the grid counts as open water. */
export function clearance(f: ObstacleField, x: number, z: number): number {
  const u = (x - f.minX) / f.cell - 0.5, v = (z - f.minZ) / f.cell - 0.5;
  if (u < 0 || v < 0 || u >= f.nx - 1 || v >= f.nz - 1) return 1e3;
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * f.nx + i, d = f.dist;
  return (d[k] * (1 - fu) + d[k + 1] * fu) * (1 - fv) + (d[k + f.nx] * (1 - fu) + d[k + f.nx + 1] * fu) * fv;
}

/** Half-width of a hull (× beam) at station t along it (t = -0.5 stern … 0.5 bow): fine bow, fuller transom. */
export function hullHalfWidth(t: number): number {
  return 0.5 * (1 - (t > 0 ? 0.75 : 0.3) * (2 * t) ** 2);
}
/**
 * Least clearance (m) of a hull's outline (bow and stern tips, both sides at least every 1.5 m) at
 * (x, z), bow on heading h, to whatever `hard` measures (< 0: part of the hull is aground or over a
 * deck; a distance field, so nothing between two outline points reaches in deeper than 0.75 m past what
 * they read). `out`, when given, receives the outline point that is worst off.
 */
export function hullClearance(hard: (x: number, z: number) => number, x: number, z: number, h: number, loa: number, beam: number, out?: Float64Array): number {
  const fx = Math.sin(h), fz = Math.cos(h);
  const nk = Math.max(8, Math.ceil(loa / 1.5));
  let worst = Infinity, wx = x, wz = z;
  for (let k = 0; k <= nk; k++) {
    const t = k / nk - 0.5, w = beam * hullHalfWidth(t);
    const cx = x + fx * loa * t, cz = z + fz * loa * t;
    const tip = k === 0 || k === nk;
    for (let side = -1; side <= 1; side += tip ? 1 : 2) {
      const px = cx - fz * w * side, pz = cz + fx * w * side;
      const c = hard(px, pz);
      if (c < worst) { worst = c; wx = px; wz = pz; }
    }
  }
  if (out) { out[0] = wx; out[1] = wz; }
  return worst;
}

/** Open-water speed factor: 1 near land and structures (harbour speed), up to 1.5 well offshore (sea speed). */
export const OPEN_WATER_MAX = 1.5;
export function openWaterFactor(f: ObstacleField | null, x: number, z: number): number {
  if (!f) return 1;
  const c = clearance(f, x, z);
  const t = Math.min(1, Math.max(0, (c - 25) / 45));
  return 1 + (OPEN_WATER_MAX - 1) * t * t * (3 - 2 * t);
}

/**
 * A second clearance field for hull paths: distance to the hulls that lie still (mooring swing
 * circles, Far Ports rows, Shoals anchorages) and to no-go zones (Wreck Cove, the Shoals reef).
 * Lanes and leg interiors keep off it; slot approaches may enter it.
 */
export function buildKeepOffField(base: ObstacleField, disks: ReadonlyArray<[number, number, number]>, polys: ReadonlyArray<readonly Vec2[]>): ObstacleField {
  const { nx, nz } = base;
  const f: ObstacleField = { minX: base.minX, minZ: base.minZ, cell: base.cell, nx, nz, dist: new Float32Array(0), coast: null };
  const mask = new Uint8Array(nx * nz);
  for (const poly of polys) fillPolygon(mask, nx, nz, poly, f, 1);
  for (const [x, z, r] of disks) stampCapsule(mask, f, [x, z], [x, z], r);
  const d = chamfer(mask, nx, nz);
  for (let k = 0; k < d.length; k++) d[k] = mask[k] ? 0 : (d[k] - 0.5) * base.cell;
  f.dist = d;
  return f;
}
