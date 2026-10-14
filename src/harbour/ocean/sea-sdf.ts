/**
 * Runtime fallback for public/harbour/sea-sdf.webp (lossless copy of the baked assets/harbour/sea-sdf.png) (pure, renderer-free, unit-tested).
 * Encoding (P2 brief), RGBA8 over bounds [minX, minZ, maxX, maxZ]; in memory row 0 = minZ, column 0 = minX
 * (the baked PNG stores the top row = maxZ, three's flipY convention; the loader flips it):
 *   R = clamp(0.5 + coastSignedDistance / 128)   (> 0.5 = sea)
 *   G = clamp(depthMetres / 40)                  (stylised bathymetry)
 *   B = clamp(distanceToStructure / 16)          (piles, quay walls, breakwater faces)
 *   A = 1
 */
import type { HarbourLayout, Vec2 } from "../layout/types";

export type Bounds4 = [number, number, number, number];

export interface SeaSdfInput {
  bounds: Bounds4;
  size: number;
  /** Land polygons (x, z). */
  land: Vec2[][];
  /** Water polygons carved out of land (bays). */
  water: Vec2[][];
  /** Solid polylines that count as land (breakwaters, moles): points + full width. */
  solids: Array<{ points: Vec2[]; width: number }>;
  /** Structure footprints for the B channel: solid segments and pile rows. */
  structures: Array<{ a: Vec2; b: Vec2; width: number; piles: boolean }>;
}

export const SDF_COAST_RANGE = 128;
export const SDF_DEPTH_RANGE = 40;
export const SDF_STRUCT_RANGE = 16;

/** Default sea bounds when the layout has no `sea` block: layout bounds padded to open water. */
export function defaultSeaBounds(layout: HarbourLayout, pad = 260): Bounds4 {
  const { min, max } = layout.bounds;
  return [min[0] - pad, min[2] - pad, max[0] + pad, max[2] + pad];
}

export function seaSdfInputFromLayout(layout: HarbourLayout, bounds: Bounds4, size: number): SeaSdfInput {
  const asPolys = (v: unknown): Vec2[][] => {
    if (!Array.isArray(v) || v.length === 0) return [];
    return Array.isArray((v as unknown[][])[0]?.[0]) ? (v as Vec2[][]) : [v as Vec2[]];
  };
  const isl = layout.island;
  const solids: SeaSdfInput["solids"] = [];
  for (const line of [isl.breakwater, isl.mole]) if (Array.isArray(line) && line.length > 1) solids.push({ points: line, width: 9 });
  const structures: SeaSdfInput["structures"] = [];
  for (const pier of layout.piers ?? []) {
    for (const s of pier.segments) {
      const solid = s.kind === "breakwater" || s.kind === "mole" || s.kind === "quay" || s.kind === "wall";
      structures.push({ a: s.a, b: s.b, width: Math.max(0.6, s.width), piles: !solid });
    }
  }
  for (const sl of solids) for (let i = 1; i < sl.points.length; i++) structures.push({ a: sl.points[i - 1], b: sl.points[i], width: sl.width, piles: false });
  return { bounds, size, land: asPolys(isl.coast), water: asPolys(isl.bay), solids, structures };
}

// ------------------------------------------------------------------ rasterisation

function fillPolygon(mask: Uint8Array, n: number, poly: Vec2[], toPx: (p: Vec2) => [number, number], value: number): void {
  if (poly.length < 3) return;
  const pts = poly.map(toPx);
  let y0 = Infinity, y1 = -Infinity;
  for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const xs: number[] = [];
  for (let j = Math.max(0, Math.floor(y0)); j <= Math.min(n - 1, Math.ceil(y1)); j++) {
    const yc = j + 0.5;
    xs.length = 0;
    for (let k = 0; k < pts.length; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[(k + 1) % pts.length];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil(xs[k] - 0.5)), i1 = Math.min(n - 1, Math.floor(xs[k + 1] - 0.5));
      for (let i = i0; i <= i1; i++) mask[j * n + i] = value;
    }
  }
}

function stampCapsule(mask: Uint8Array, n: number, a: [number, number], b: [number, number], r: number, value: number): void {
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - r - 1)), x1 = Math.min(n - 1, Math.ceil(Math.max(a[0], b[0]) + r + 1));
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - r - 1)), y1 = Math.min(n - 1, Math.ceil(Math.max(a[1], b[1]) + r + 1));
  const bax = b[0] - a[0], bay = b[1] - a[1], L2 = bax * bax + bay * bay || 1e-9;
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const px = i + 0.5 - a[0], py = j + 0.5 - a[1];
    const t = Math.min(1, Math.max(0, (px * bax + py * bay) / L2));
    const dx = px - bax * t, dy = py - bay * t;
    if (dx * dx + dy * dy <= r * r) mask[j * n + i] = value;
  }
}

// ------------------------------------------------------------------ exact Euclidean distance transform (Felzenszwalb)

function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}

/** Distance (texels) from each texel to the nearest texel where mask === on. */
export function distanceTransform(mask: Uint8Array, n: number, on = 1): Float32Array {
  const INF = 1e20, g = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) g[i] = mask[i] === on ? 0 : INF;
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < n; x++) { for (let y = 0; y < n; y++) f[y] = g[y * n + x]; edt1d(f, n, d, v, z); for (let y = 0; y < n; y++) g[y * n + x] = d[y]; }
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) { for (let x = 0; x < n; x++) f[x] = g[y * n + x]; edt1d(f, n, d, v, z); for (let x = 0; x < n; x++) out[y * n + x] = Math.sqrt(d[x]); }
  return out;
}

function hash2(ix: number, iy: number): number {
  let h = (ix * 374761393 + iy * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Stylised bathymetry (m) from coast distance (m, + over sea) and world position. */
export function stylisedDepth(coastDist: number, x: number, z: number): number {
  if (coastDist <= 0) return 0;
  const n = vnoise(x * 0.012, z * 0.012) * 0.65 + vnoise(x * 0.04 + 17, z * 0.04) * 0.35;
  // a gentle shelf near the coast, then a steeper drop to the deep
  const cove = vnoise(x * 0.006 + 41, z * 0.006 - 7);         // sandy coves vs steep rocky shores
  const shelf = 4.5 * (1 - Math.exp(-coastDist / (2.5 + 16 * cove * cove)));
  const drop = 34 * (1 - Math.exp(-Math.max(0, coastDist - 10) / (70 + 60 * n)));
  return (shelf + drop) * (0.85 + 0.3 * n);
}

export interface HeightField {
  heights: Float32Array;
  size: number;
  /** [minX, minZ, maxX, maxZ]; row 0 = world z max (the island 'ground' service layout). */
  bounds: Bounds4;
}

/**
 * Land mask from the rendered island height field (exactly matches the meshes): land where the top
 * surface stands above the sea, except pier decks on piles (those stay water with pile foam).
 */
export function landMaskFromHeights(input: SeaSdfInput, ground: HeightField, deckY: number): Uint8Array {
  const { bounds: [minX, minZ, maxX, maxZ], size: n } = input;
  const sx = (maxX - minX) / n, sz = (maxZ - minZ) / n;
  const [gx0, gz0, gx1, gz1] = ground.bounds, gn = ground.size;
  const toPx = (p: Vec2): [number, number] => [(p[0] - minX) / sx, (p[1] - minZ) / sz];
  const piers = new Uint8Array(n * n);
  const cell = Math.sqrt(sx * sz);
  for (const st of input.structures) if (st.piles) stampCapsule(piers, n, toPx(st.a), toPx(st.b), (st.width / 2 + 0.8) / cell, 1);
  const land = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    const z = minZ + (j + 0.5) * sz;
    const gv = (gz1 - z) / (gz1 - gz0);
    if (gv < 0 || gv >= 1) continue;
    const gj = Math.min(gn - 1, Math.floor(gv * gn));
    for (let i = 0; i < n; i++) {
      const x = minX + (i + 0.5) * sx;
      const gu = (x - gx0) / (gx1 - gx0);
      if (gu < 0 || gu >= 1) continue;
      const h = ground.heights[gj * gn + Math.min(gn - 1, Math.floor(gu * gn))];
      const k = j * n + i;
      land[k] = h > 0.25 && !(piers[k] && h < deckY + 0.45) ? 1 : 0;
    }
  }
  return land;
}

export function buildSeaSdf(input: SeaSdfInput, landOverride?: Uint8Array): Uint8Array {
  const { bounds: [minX, minZ, maxX, maxZ], size: n } = input;
  const sx = (maxX - minX) / n, sz = (maxZ - minZ) / n;
  const cell = Math.sqrt(sx * sz);
  const toPx = (p: Vec2): [number, number] => [(p[0] - minX) / sx, (p[1] - minZ) / sz];
  let land = landOverride;
  if (!land) {
    land = new Uint8Array(n * n);
    for (const poly of input.land) fillPolygon(land, n, poly, toPx, 1);
    for (const poly of input.water) fillPolygon(land, n, poly, toPx, 0);
    for (const s of input.solids) for (let i = 1; i < s.points.length; i++) stampCapsule(land, n, toPx(s.points[i - 1]), toPx(s.points[i]), s.width / 2 / cell, 1);
  }

  const struct = new Uint8Array(n * n);
  for (const s of input.structures) {
    const a = toPx(s.a), b = toPx(s.b);
    if (!s.piles) { stampCapsule(struct, n, a, b, s.width / 2 / cell, 1); continue; }
    // pile rows along both long edges, every ~3.5 m
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], len = Math.hypot(dx, dz) || 1e-6;
    const nx = -dz / len, nz = dx / len, steps = Math.max(1, Math.round(len / 3.5));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      for (const side of [-1, 1]) {
        const off = side * (s.width / 2 - 0.2);
        const p = toPx([s.a[0] + dx * t + nx * off, s.a[1] + dz * t + nz * off]);
        stampCapsule(struct, n, p, p, Math.max(0.6, 0.35 / cell), 1);
      }
    }
  }

  const toLand = distanceTransform(land, n, 1);   // for sea texels: distance to land
  const toSea = distanceTransform(land, n, 0);    // for land texels: distance to sea
  const toStruct = distanceTransform(struct, n, 1);
  const out = new Uint8Array(n * n * 4);
  const c01 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    const sd = land[k] ? -(toSea[k] - 0.5) * cell : (toLand[k] - 0.5) * cell;
    const x = minX + (i + 0.5) * sx, z = minZ + (j + 0.5) * sz;
    out[k * 4] = c01(0.5 + sd / SDF_COAST_RANGE);
    out[k * 4 + 1] = c01(stylisedDepth(sd, x, z) / SDF_DEPTH_RANGE);
    out[k * 4 + 2] = c01((toStruct[k] * cell) / SDF_STRUCT_RANGE);
    out[k * 4 + 3] = 255;
  }
  return out;
}
