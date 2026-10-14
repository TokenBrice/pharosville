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

export function buildObstacleField(layout: HarbourLayout): ObstacleField | null {
  const isl = layout.island;
  const hasGeometry = (isl?.coast?.length ?? 0) >= 3 || (layout.piers ?? []).some((p) => (p.segments ?? []).length > 0);
  if (!hasGeometry || !layout.bounds) return null;
  const pad = 120;
  const minX = layout.bounds.min[0] - pad, minZ = layout.bounds.min[2] - pad;
  const nx = Math.ceil((layout.bounds.max[0] + pad - minX) / CELL), nz = Math.ceil((layout.bounds.max[2] + pad - minZ) / CELL);
  const f: ObstacleField = { minX, minZ, cell: CELL, nx, nz, dist: new Float32Array(0) };
  const mask = new Uint8Array(nx * nz);
  const polys = (v: unknown): Vec2[][] => (!Array.isArray(v) || v.length === 0 ? [] : Array.isArray((v as unknown[][])[0]?.[0]) ? (v as Vec2[][]) : [v as Vec2[]]);
  for (const poly of polys(isl?.coast)) fillPolygon(mask, nx, nz, poly, f, 1);
  for (const poly of polys(isl?.bay)) fillPolygon(mask, nx, nz, poly, f, 0);
  for (const line of [isl?.breakwater, isl?.mole]) {
    if (!Array.isArray(line)) continue;
    for (let i = 1; i < line.length; i++) stampCapsule(mask, f, line[i - 1], line[i], 4.5);
  }
  for (const p of layout.piers ?? []) for (const s of p.segments ?? []) stampCapsule(mask, f, s.a, s.b, Math.max(0.6, s.width / 2));
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

/** Speed factor for open water: 1 near land and structures, up to 1.9 well offshore (harbour speed vs sea speed). */
export function openWaterFactor(f: ObstacleField | null, x: number, z: number): number {
  if (!f) return 1;
  const c = clearance(f, x, z);
  const t = Math.min(1, Math.max(0, (c - 25) / 45));
  return 1 + 0.9 * t * t * (3 - 2 * t);
}
