import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { HullClass } from "../layout/types";
import { hash01 } from "./variants";
import { daysSinceDeath } from "../model/obituary";

/**
 * WRECK COVE v2 (P7 c): the pure half. The dead coins (readings.wrecks, ranked by peak market cap) become the
 * wreck kit v2 (public/harbour/kit, manifest `wreck_kit`) on the cove's strand, after its author's guide:
 *
 *   #1-2     great_hulk, full size (the second turned), near the tide line
 *   #3-4     schooner_sunk in the shallows; stern_section with her transom to the sea
 *   #5-10    capsized, burned, rib_cage ×2 each, 0.8-1.0
 *   #11-22   8 more of those at 0.55-0.7, and 4 mast stumps
 *   #23-88   skiffs, dinghies, mast stumps and rib cages at ~0.6 (the guide's 0.45 reads as debris), in the cove's clusters
 *
 * Within a tier the size follows log peak cap. The top 20 stand on the MEMORIAL: their own epitaph posts in a
 * gentle arc above the wrack line (2.2×, ~5 m apart), the bell at its middle and pennants at its ends, lanterns
 * lit at dusk; their wrecks keep no post. Every other wreck carries its own post beside it. Decorative layout,
 * data-honest content: one wreck and one nameboard per dead coin.
 */
export interface CoveDead {
  id: string; name: string; symbol: string; deathDate: string; peakMcap: number | null;
  /** Cause family (model/obituary.ts): picks the wreck's form. Absent: the slot's authored kit. */
  family?: string;
}
export interface CoveSlot {
  id: string; cls: HullClass; x: number; z: number; h: number;
  /** Authored by the island (layout zones.wreckCove, P7): the rank (1 = biggest peak cap) and its wreck. */
  rank?: number; kit?: string; scale?: number; sits?: "sand" | "water";
}
/** An authored memorial post (layout zones.wreckCove.memorialArc): rank 1..20. */
export interface CoveMemorialPost { rank: number; x: number; z: number; h: number; scale: number }
export interface CovePiece {
  item: string;
  x: number; z: number; h: number;
  scale: number;
  /** On the water (sunk in the shallows) rather than the sand. */
  water: boolean;
  /** The dead coin this piece remembers (null: memorial furniture). */
  coin: CoveDead | null;
  /** Wears its own epitaph post (with the coin's nameboard). */
  board: boolean;
  /** Its lantern is lit at dusk (memorial posts). */
  lit: boolean;
  rank: number;
}
export interface CoveEnv {
  /** Signed coast distance (m): > 0 water, < 0 land. */
  coast(x: number, z: number): number;
  /** Ground height (m). */
  ground(x: number, z: number): number;
  /** Inside the cove (its zone polygon): the memorial stays on the cove's own strand. */
  inside?(x: number, z: number): boolean;
  /** Ground direction toward the camera (the diorama's fixed yaw): boards are turned to be read. */
  toViewer?: readonly [number, number];
}

export const MEMORIAL_N = 20;
export const MEMORIAL_SCALE = 2.2;
const MEMORIAL_GAP = 5.2;

/** The kit's lengths (m, manifest loa_m): footprints for keeping the memorial clear of the wrecks. */
const ITEM_LOA: Record<string, number> = { wreck_great_hulk: 26, wreck_schooner_sunk: 18, wreck_stern_section: 8.5, wreck_capsized: 13, wreck_burned: 15, wreck_rib_cage: 16, wreck_mast_stump: 14, wreck_skiff: 5, wreck_dinghy: 3.4 };
const SIZE_RANK: Record<string, number> = { flagship: 0, large: 1, medium: 2, small: 3, boat: 4, skiff: 5 };

/**
 * WRECK FORM = CAUSE FAMILY (research/04 §3). Each family has one form, at every size: a death spiral lies
 * capsized, an exploit burned to her bilges, a counterparty failure broken in two, a coin drained of its liquidity
 * swallowed by the sand to her mast, a wind-down left to rot to her ribs, and a coin killed by decree laid up whole
 * (the great hulk). Where the slot is a small boat's (the long tail), the turned-over and the left-to-rot forms
 * take the small boats' own models (the dinghy keel-up, the skiff stove in and sanded up); in the shallows a
 * drained coin is the schooner gone down there. The size stays the slot's (the peak-cap rank).
 */
export const FAMILY_KIT: Record<string, string> = {
  spiral: "wreck_capsized", exploit: "wreck_burned", counterparty: "wreck_stern_section",
  run: "wreck_mast_stump", "wind-down": "wreck_rib_cage", decree: "wreck_great_hulk",
};
const SMALL_KIT: Record<string, string> = { spiral: "wreck_dinghy", "wind-down": "wreck_skiff" };
/** A slot whose authored wreck is shorter than this (m) is a small boat's. */
const SMALL_SLOT_M = 3.5;
/** The least scale a form may shrink to (its nameboard and its shape still read). */
const FORM_FLOOR: Record<string, number> = {
  wreck_great_hulk: 0.3, wreck_schooner_sunk: 0.4, wreck_stern_section: 0.36, wreck_capsized: 0.22, wreck_burned: 0.26,
  wreck_rib_cage: 0.2, wreck_mast_stump: 0.3, wreck_skiff: 0.3, wreck_dinghy: 0.3,
};

/** …and the most it may grow to (a stern section stood on end looms like a house past this). */
const FORM_CEIL: Record<string, number> = { wreck_stern_section: 1.3, wreck_mast_stump: 1.4 };

/**
 * The form a dead coin takes in a slot authored for `kit` at `scale`: [kit, scale], the slot's footprint (its
 * authored length) kept. An unknown family keeps the authored wreck.
 */
export function formFor(family: string | undefined, kit: string, scale: number, water: boolean): [string, number] {
  const want = family && FAMILY_KIT[family];
  if (!want || !ITEM_LOA[kit]) return [kit, scale];
  const len = ITEM_LOA[kit] * scale;
  const item = water && family === "run" ? "wreck_schooner_sunk" : (len < SMALL_SLOT_M && SMALL_KIT[family!]) || want;
  if (item === kit) return [kit, scale];
  return [item, Math.min(FORM_CEIL[item] ?? 2.2, Math.max(FORM_FLOOR[item] ?? 0.2, len / ITEM_LOA[item]))];
}
const MID = ["wreck_capsized", "wreck_burned", "wreck_rib_cage"];

interface Tier { items: string[]; lo: number; hi: number }
/** The guide's tiers, rank by rank (index = rank). */
export function tierPlan(n: number): Array<{ item: string; lo: number; hi: number; tier: number }> {
  const out: Array<{ item: string; lo: number; hi: number; tier: number }> = [];
  const tiers: Tier[] = [
    { items: ["wreck_great_hulk", "wreck_great_hulk"], lo: 0.94, hi: 1.06 },
    { items: ["wreck_schooner_sunk", "wreck_stern_section"], lo: 0.92, hi: 1.04 },
    { items: [...MID, ...MID], lo: 0.8, hi: 1.0 },
    { items: [...MID, "wreck_mast_stump", ...MID, "wreck_mast_stump", "wreck_capsized", "wreck_mast_stump", "wreck_burned", "wreck_mast_stump"], lo: 0.55, hi: 0.7 },
  ];
  tiers.forEach((t, k) => { for (const item of t.items) out.push({ item, lo: t.lo, hi: t.hi, tier: k }); });
  // the long tail: 30 skiffs, 24 dinghies, 6 mast stumps, 6 rib cages, interleaved so every cluster mixes them
  const tail: string[] = [];
  for (let i = 0; tail.length < Math.max(0, n - out.length); i++) {
    const k = i % 11;
    tail.push(k === 3 ? "wreck_mast_stump" : k === 8 ? "wreck_rib_cage" : k % 2 ? "wreck_dinghy" : "wreck_skiff");
  }
  // (the guide's ~0.45 reads as debris at harbour zoom: a little bigger, still the smallest of the dead)
  for (const item of tail) out.push({ item, lo: 0.56, hi: 0.66, tier: 4 });
  return out.slice(0, n);
}

const logCap = (c: CoveDead) => Math.log10(Math.max(1e5, c.peakMcap ?? 1e5));

/**
 * Wrecks on the cove's slots + the memorial. Slots are taken by size (the island's slot class) then nearness to
 * the cove's heart; the first ranks take the biggest. `env` is optional (tests): without it the shallows and the
 * memorial arc are skipped.
 */
export function composeCove(deadIn: readonly CoveDead[], slotsIn: readonly CoveSlot[], env: CoveEnv | null, arc: readonly CoveMemorialPost[] = []): CovePiece[] {
  const dead = [...deadIn].sort((a, b) => (b.peakMcap ?? 0) - (a.peakMcap ?? 0) || (a.id < b.id ? -1 : 1));
  if (!dead.length || !slotsIn.length) return [];
  if (slotsIn.every((sl) => sl.rank != null && sl.kit)) return authoredCove(dead, slotsIn, arc);
  // the heart: the centroid of the biggest slots
  const big = slotsIn.filter((s) => SIZE_RANK[s.cls] <= 2);
  const hs = big.length ? big : slotsIn;
  const hx = hs.reduce((a, s) => a + s.x, 0) / hs.length, hz = hs.reduce((a, s) => a + s.z, 0) / hs.length;
  const slots = [...slotsIn].sort((a, b) => (SIZE_RANK[a.cls] ?? 9) - (SIZE_RANK[b.cls] ?? 9) || Math.hypot(a.x - hx, a.z - hz) - Math.hypot(b.x - hx, b.z - hz));
  const plan = tierPlan(Math.min(dead.length, slots.length));
  // log peak cap normalised within each tier
  const span = new Map<number, [number, number]>();
  plan.forEach((p, i) => { const v = logCap(dead[i]); const s = span.get(p.tier) ?? [v, v]; span.set(p.tier, [Math.min(s[0], v), Math.max(s[1], v)]); });
  const out: CovePiece[] = [];
  const up = (x: number, z: number, fb: number) => {
    if (!env) return fb;
    const gx = env.coast(x + 1.5, z) - env.coast(x - 1.5, z), gz = env.coast(x, z + 1.5) - env.coast(x, z - 1.5);
    return Math.hypot(gx, gz) < 0.2 ? fb : Math.atan2(-gx, -gz); // bow heading pointing up the beach
  };
  plan.forEach((p, i) => {
    const c = dead[i], s = slots[i];
    const [a, b] = span.get(p.tier)!;
    const t = b > a ? (logCap(c) - a) / (b - a) : 0.5;
    const scale = p.lo + (p.hi - p.lo) * t;
    let x = s.x, z = s.z, h = s.h, water = false;
    if (p.item === "wreck_great_hulk" && i === 1) h += 2.4; // the second lies the other way round
    if (p.item === "wreck_stern_section") h = up(x, z, h) + (hash01(c.id + "#h") - 0.5) * 0.5; // transom to the sea
    if (p.item === "wreck_schooner_sunk" && env) {
      // sunk in the shallows: walk down the beach from her slot into 2-6 m of water
      const hu = up(x, z, h), dx = -Math.sin(hu), dz = -Math.cos(hu);
      for (let d = 0; d < 60; d += 1.5) {
        const px = x + dx * d, pz = z + dz * d;
        if (env.coast(px, pz) > 5) { x = px; z = pz; water = true; break; }
      }
      h = hu + Math.PI / 2 + (hash01(c.id + "#h") - 0.5) * 0.6; // lying along the shore, beam on to the surf
    }
    // her epitaph post stands on her +z side: lie her the other way round when that side faces away from the viewer
    const board = i >= MEMORIAL_N;
    if (board && env?.toViewer && p.item !== "wreck_stern_section" && -Math.cos(h) * env.toViewer[0] + Math.sin(h) * env.toViewer[1] < -0.15) h += Math.PI;
    out.push({ item: p.item, x, z, h, scale, water, coin: c, board, lit: false, rank: i });
  });
  if (env) out.push(...memorial(dead.slice(0, Math.min(MEMORIAL_N, out.length)), out, hx, hz, env));
  return out;
}

/**
 * The island's own composition (layout zones.wreckCove, P7): slot rank r holds the r-th dead coin by peak cap, in
 * the authored kit at its tier scale × the 0.8-1.15 log-peak-cap spread within the tier; the memorial posts stand
 * where the island put them (its bell, pennants and props are baked into island.glb).
 */
function authoredCove(dead: readonly CoveDead[], slotsIn: readonly CoveSlot[], arc: readonly CoveMemorialPost[]): CovePiece[] {
  const slots = [...slotsIn].sort((a, b) => a.rank! - b.rank!);
  // more dead than the island has slots for (the register grows between island bakes): every one still gets its
  // wreck, beside one of the long tail's small boats, a boat's length along her keel line
  const tail0 = Math.min(22, slots.length - 1), have = slots.length, bases = have - tail0 - 1;
  for (let i = have; i < dead.length && bases > 0; i++) {
    const k = i - have, b = slots[tail0 + 1 + (k * 7) % bases];
    const d = ((ITEM_LOA[b.kit!] ?? 5) * (b.scale ?? 1) + 1.8) * (1 + Math.floor(k / bases));
    slots.push({ ...b, id: `${b.id}+${i}`, rank: i + 1, x: b.x + Math.sin(b.h) * d, z: b.z + Math.cos(b.h) * d, h: b.h + 0.6, sits: "sand" });
  }
  const n = Math.min(dead.length, slots.length);
  // tiers: runs of the same tier scale (the guide's bands), spread by log peak cap within each
  const tierOf = (i: number) => (i < 2 ? 0 : i < 4 ? 1 : i < 10 ? 2 : i < 22 ? 3 : 4);
  const span = new Map<number, [number, number]>();
  for (let i = 0; i < n; i++) { const v = logCap(dead[i]), k = tierOf(i); const s = span.get(k) ?? [v, v]; span.set(k, [Math.min(s[0], v), Math.max(s[1], v)]); }
  const out: CovePiece[] = [];
  for (let i = 0; i < n; i++) {
    const sl = slots[i], c = dead[i];
    const [a, b] = span.get(tierOf(i))!;
    const t = b > a ? (logCap(c) - a) / (b - a) : 0.5;
    const water = sl.sits === "water";
    const [item, scale] = formFor(c.family, sl.kit!, sl.scale ?? 1, water);
    out.push({ item, x: sl.x, z: sl.z, h: sl.h, scale: scale * (0.8 + 0.35 * t), water, coin: c, board: i >= Math.min(MEMORIAL_N, arc.length), lit: false, rank: i });
  }
  for (const m of [...arc].sort((p, q) => p.rank - q.rank)) {
    const c = dead[m.rank - 1];
    if (!c || m.rank > n) continue;
    out.push({ item: "wreck_cove_epitaph", x: m.x, z: m.z, h: m.h, scale: m.scale, water: false, coin: c, board: true, lit: true, rank: m.rank - 1 });
  }
  return out;
}

/**
 * The memorial arc: posts along one contour of the beach above the tide line, MEMORIAL_GAP apart, the bell at the
 * middle and pennants at both ends, every board facing the sea. The contour (9-25 m up from the water) and the
 * arc's centre along the shore are chosen so the most posts stand clear of the wrecks in the tightest arc; where a
 * wreck lies across it, the arc simply steps past her (a wider gap), so it stays one smooth line.
 */
function memorial(top: readonly CoveDead[], wrecks: readonly CovePiece[], hx: number, hz: number, env: CoveEnv): CovePiece[] {
  const n = top.length;
  const grad = (x: number, z: number) => {
    const gx = env.coast(x + 1.5, z) - env.coast(x - 1.5, z), gz = env.coast(x, z + 1.5) - env.coast(x, z - 1.5);
    const l = Math.hypot(gx, gz) || 1;
    return [gx / l, gz / l] as const;
  };
  // clear of every wreck's footprint (her keel line, a beam and a little either side)
  const clearOf = (x: number, z: number) => wrecks.every((w) => {
    const L = (ITEM_LOA[w.item] ?? 6) * w.scale, ax = Math.sin(w.h), az = Math.cos(w.h);
    const t = Math.max(-L / 2, Math.min(L / 2, (x - w.x) * ax + (z - w.z) * az));
    return Math.hypot(x - (w.x + ax * t), z - (w.z + az * t)) > L * 0.15 + 1.6;
  });
  const ok = (x: number, z: number) => clearOf(x, z) && dryFlat(env, x, z) && (env.inside?.(x, z) ?? true);
  const snap = (x: number, z: number, d: number): [number, number] => {
    for (let it = 0; it < 5; it++) { const e = env.coast(x, z) - d; const [ux, uz] = grad(x, z); x -= ux * e; z -= uz * e; }
    return [x, z];
  };
  /** Walk the contour from (x, z), 1 m a step, taking clear spots MEMORIAL_GAP apart, up to `want` of them. */
  const walk = (x: number, z: number, d: number, dir: number, want: number, reach: number) => {
    const got: Array<[number, number]> = [];
    let lx = x, lz = z, run = 0;
    for (let k = 0; k < reach && got.length < want; k++) {
      const [gx, gz] = grad(x, z);
      [x, z] = snap(x - gz * dir, z + gx * dir, d);
      run++;
      if (Math.hypot(x - lx, z - lz) >= MEMORIAL_GAP && ok(x, z)) { got.push([x, z]); lx = x; lz = z; }
    }
    return { got, run };
  };
  /** The tightest run of `W` consecutive spots along the line: [start, length]. */
  const tightest = (line: ReadonlyArray<[number, number]>, W: number): [number, number] => {
    if (line.length <= W) return [0, arcLen(line, 0, line.length - 1)];
    let bs = 0, bl = Infinity;
    for (let s0 = 0; s0 + W <= line.length; s0++) { const l = arcLen(line, s0, s0 + W - 1); if (l < bl) { bl = l; bs = s0; } }
    return [bs, bl];
  };
  const W = n + 1; // the posts and the bell
  let best: { line: Array<[number, number]>; start: number; score: number } | null = null;
  for (let d = -10; d >= -25; d -= 3) {
    // the contour point nearest the heart, then centres shifted along the shore
    let c0: [number, number] | null = null, bd = Infinity;
    for (let z = hz - 100; z <= hz + 100; z += 2) for (let x = hx - 100; x <= hx + 100; x += 2) {
      if (Math.abs(env.coast(x, z) - d) > 1.2) continue;
      const dd = Math.hypot(x - hx, z - hz);
      if (dd < bd) { bd = dd; c0 = [x, z]; }
    }
    if (!c0) continue;
    for (const shift of [0, -20, 20, -40, 40]) {
      let [cx, cz] = snap(c0[0], c0[1], d);
      const dir = Math.sign(shift);
      for (let k = 0; k < Math.abs(shift); k++) { const [gx, gz] = grad(cx, cz); [cx, cz] = snap(cx - gz * dir, cz + gx * dir, d); }
      const L = walk(cx, cz, d, 1, W + 1, 140), R = walk(cx, cz, d, -1, W + 1, 140);
      const line: Array<[number, number]> = [...L.got.reverse(), ...(ok(cx, cz) ? [[cx, cz] as [number, number]] : []), ...R.got];
      const [start, len] = tightest(line, W);
      const score = Math.min(W, line.length) * 100 - len * 0.6 + d * 0.8; // the most posts, the tightest arc, nearest the tide line
      if (!best || score > best.score) best = { line, start, score };
    }
  }
  if (!best || best.line.length < 3) return [];
  const { line, start } = best;
  const end = Math.min(line.length, start + W) - 1;
  const bi = start + Math.floor((end - start) / 2);
  const out: CovePiece[] = [];
  // the board (+z) turned to the viewer when there is one (the diorama's fixed yaw), else to the sea
  const face = (x: number, z: number) => { const [sx, sz] = env.toViewer ?? grad(x, z); return Math.atan2(sz, -sx); };
  out.push({ item: "wreck_cove_bell", x: line[bi][0], z: line[bi][1], h: face(line[bi][0], line[bi][1]), scale: 1.2, water: false, coin: null, board: false, lit: false, rank: -1 });
  // posts outward from the bell by rank, alternating sides while each side has spots
  const order: number[] = [];
  for (let k = 1; order.length < n && (bi - k >= start || bi + k <= end); k++) {
    if (bi - k >= start) order.push(bi - k);
    if (order.length < n && bi + k <= end) order.push(bi + k);
  }
  order.forEach((li, rank) => {
    const [x, z] = line[li];
    out.push({ item: "wreck_cove_epitaph", x, z, h: face(x, z) + (hash01(top[rank].id + "#m") - 0.5) * 0.16, scale: MEMORIAL_SCALE, water: false, coin: top[rank], board: true, lit: true, rank });
  });
  // pennants just past the arc's two ends (on the next spot along, else a step on from the last post)
  for (const [li, last, prev] of [[start - 1, start, start + 1], [end + 1, end, end - 1]] as const) {
    let p: [number, number] | null = line[li] ?? null;
    if (!p && line[last] && line[prev]) {
      const dx = line[last][0] - line[prev][0], dz = line[last][1] - line[prev][1], dl = Math.hypot(dx, dz) || 1;
      const q: [number, number] = [line[last][0] + (dx / dl) * MEMORIAL_GAP * 0.8, line[last][1] + (dz / dl) * MEMORIAL_GAP * 0.8];
      if (ok(q[0], q[1])) p = q;
    }
    if (p) out.push({ item: "wreck_cove_pennants", x: p[0], z: p[1], h: face(p[0], p[1]), scale: 1.15, water: false, coin: null, board: false, lit: false, rank: -1 });
  }
  return out;
}

function arcLen(pts: ReadonlyArray<[number, number]>, a: number, b: number): number {
  let s = 0;
  for (let i = a + 1; i <= b; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}

function dryFlat(env: CoveEnv, x: number, z: number): boolean {
  const h = env.ground(x, z);
  if (h < 0.2 || h > 6) return false;
  for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) if (Math.abs(env.ground(x + dx, z + dz) - h) > 0.9) return false;
  return true;
}

// ------------------------------------------------------------------ nameboards

/**
 * The epitaph nameboards: one canvas atlas, a cell per dead coin (symbol, then name and the year she died),
 * dark ink, transparent ground (the board's own weathered cream shows through). Board aspect 1.1 : 0.34.
 */
export class EpitaphBoards {
  readonly texture: THREE.CanvasTexture;
  /** (cols, rows, 1/cols, 1/rows) */
  readonly grid: THREE.Vector4;
  private readonly slots = new Map<string, number>();
  private constructor(readonly canvas: HTMLCanvasElement, cols: number, rows: number) {
    this.grid = new THREE.Vector4(cols, rows, 1 / cols, 1 / rows);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.NoColorSpace;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 8;
    this.texture = t;
  }

  static CELL_W = 352;
  static CELL_H = 108;

  static build(coins: readonly CoveDead[]): EpitaphBoards {
    const cols = 5, rows = Math.max(1, Math.ceil(coins.length / cols));
    const cv = document.createElement("canvas");
    cv.width = cols * EpitaphBoards.CELL_W; cv.height = rows * EpitaphBoards.CELL_H;
    const b = new EpitaphBoards(cv, cols, rows);
    const g = cv.getContext("2d")!;
    coins.forEach((c, i) => { b.slots.set(c.id, i); drawBoard(g, (i % cols) * EpitaphBoards.CELL_W, Math.floor(i / cols) * EpitaphBoards.CELL_H, c); });
    b.texture.needsUpdate = true;
    return b;
  }

  slotOf(id: string): number { return this.slots.get(id) ?? -1; }
  dispose(): void { this.texture.dispose(); }
}

function drawBoard(g: CanvasRenderingContext2D, x0: number, y0: number, c: CoveDead): void {
  const W = EpitaphBoards.CELL_W, H = EpitaphBoards.CELL_H, mx = W * 0.07;
  const sym = (c.symbol || c.name || c.id).toUpperCase();
  const year = /^\d{4}/.test(c.deathDate ?? "") ? c.deathDate.slice(0, 4) : "";
  g.save();
  g.fillStyle = "#000";
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  // the symbol, carved large
  let size = H * 0.5;
  g.font = `700 ${size}px Georgia, "Times New Roman", serif`;
  while (g.measureText(sym).width > W - mx * 2 && size > 18) { size -= 2; g.font = `700 ${size}px Georgia, "Times New Roman", serif`; }
  g.fillText(sym, x0 + W / 2, y0 + H * 0.56, W - mx * 2);
  // a rule, then the name and the year she went down
  g.fillRect(x0 + W * 0.3, y0 + H * 0.64, W * 0.4, Math.max(1.5, H * 0.018));
  const line = [c.name && c.name.toUpperCase() !== sym ? c.name : "", year ? `† ${year}` : ""].filter(Boolean).join("  ·  ");
  let s2 = H * 0.2;
  g.font = `italic 400 ${s2}px Georgia, "Times New Roman", serif`;
  while (g.measureText(line).width > W - mx * 2 && s2 > 11) { s2 -= 1; g.font = `italic 400 ${s2}px Georgia, "Times New Roman", serif`; }
  g.fillText(line, x0 + W / 2, y0 + H * 0.87, W - mx * 2);
  g.restore();
}

// ------------------------------------------------------------------ the 'cove' service

/** One placed piece that remembers a dead coin: its wreck, or its memorial post (world position, top height). */
export interface CoveMark {
  id: string;
  inst: number;
  item: string;
  x: number; y: number; z: number;
  /** Heading (the kit's +x along (sin h, cos h); its board faces h − π/2) and scale. */
  h: number; scale: number;
  /** Height of its highest point above `y` (m). */
  top: number;
  /** Its length on the ground (m). */
  len: number;
  memorial: boolean;
  /** Its highest point (world): where a gull stands on her (wrecks big enough to perch on). */
  perch: [number, number, number] | null;
  /** Its epitaph lantern's centre (world), when it carries a post. */
  lamp: [number, number, number] | null;
  /** Lit at dusk (a memorial post), and its nameboard slot (-1: none). */
  lit: boolean;
  board: number;
}

/**
 * 'cove' service: where each dead coin lies (for picking, tags and camera flights) and the focus the UI puts on
 * one (hover: a warm rim; selected: the rim and its lantern lit bright, day or night). `write` re-writes a
 * piece's per-instance data with the given highlight.
 */
export class CoveService {
  marks: CoveMark[] = [];
  private byId = new Map<string, CoveMark[]>();
  private hoverId: string | null = null;
  private selectedId: string | null = null;
  /** `glow`: the selected coin's lantern (its memorial post's, else its own post's), or null when none is selected. */
  constructor(private readonly write: (m: CoveMark, hi: number) => void, private readonly glow?: (lamp: [number, number, number] | null) => void) {}

  set(marks: CoveMark[]): void {
    this.marks = marks;
    this.byId = new Map();
    for (const m of marks) { const a = this.byId.get(m.id); if (a) a.push(m); else this.byId.set(m.id, [m]); }
    this.apply(new Set([this.hoverId, this.selectedId]));
    this.relight();
  }

  /** The wreck itself when it lies here (else its memorial post). */
  mark(id: string): CoveMark | null {
    const a = this.byId.get(id);
    return a ? a.find((m) => !m.memorial) ?? a[0] : null;
  }
  /** The selected coin's wreck (else its post), or null. */
  selectedMark(): CoveMark | null { return this.selectedId ? this.mark(this.selectedId) : null; }
  /** Every piece for a coin (wreck and memorial post). */
  marksOf(id: string): readonly CoveMark[] { return this.byId.get(id) ?? []; }

  focus(hover: string | null, selected: string | null): void {
    if (hover === this.hoverId && selected === this.selectedId) return;
    const touched = new Set([this.hoverId, this.selectedId, hover, selected]);
    const reglow = selected !== this.selectedId;
    this.hoverId = hover; this.selectedId = selected;
    this.apply(touched);
    if (reglow) this.relight();
  }

  private relight(): void {
    const ms = this.selectedId ? this.byId.get(this.selectedId) ?? [] : [];
    this.glow?.((ms.find((m) => m.memorial && m.lamp) ?? ms.find((m) => m.lamp))?.lamp ?? null);
  }

  private apply(ids: Set<string | null>): void {
    for (const id of ids) {
      if (!id) continue;
      const hi = id === this.selectedId ? 1 : id === this.hoverId ? 0.5 : 0;
      for (const m of this.byId.get(id) ?? []) this.write(m, hi);
    }
  }
}

// ------------------------------------------------------------------ the fresh wreath

/** A death this recent (days) still has a fresh wreath laid at its post. */
export const WREATH_DAYS = 90;

/** The newest death when it is within WREATH_DAYS of `now` (data: deathDate; a month-only date counts from its last day). */
export function freshDeath<T extends { deathDate: string }>(dead: readonly T[], now: number, days = WREATH_DAYS): T | null {
  let best: T | null = null;
  for (const d of dead) if (!best || d.deathDate > best.deathDate) best = d;
  if (!best) return null;
  const age = daysSinceDeath(best.deathDate, now);
  return age != null && age >= -31 && age <= days ? best : null;
}

/**
 * A laurel wreath (evergreen ring, a red ribbon bow and its tails), 1 m across, standing in the xy plane facing +z;
 * vertex colours, one mesh. Made only while a death is fresh.
 */
export function buildWreath(): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const paint = (g: THREE.BufferGeometry, hex: string, jitter = 0) => {
    const c = new THREE.Color(hex), n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const k = 1 + (jitter ? (hash01(`w${i}`) - 0.5) * jitter : 0);
      col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g.index ? g.toNonIndexed() : g;
  };
  // the ring: a fat torus of leaves (faceted, two greens)
  parts.push(paint(new THREE.TorusGeometry(0.4, 0.12, 5, 18), "#2f5a2a", 0.5));
  // leaf tufts round it
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const g = new THREE.IcosahedronGeometry(0.1, 0);
    g.translate(Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0.06);
    parts.push(paint(g, k % 3 ? "#3f7434" : "#5d8a3c", 0.3));
  }
  // the bow at the foot and two ribbon tails
  const bow = new THREE.SphereGeometry(0.1, 6, 4); bow.scale(1.6, 0.9, 0.7); bow.translate(0, -0.42, 0.1);
  parts.push(paint(bow, "#b3262a"));
  for (const sx of [-1, 1]) {
    const t = new THREE.BoxGeometry(0.06, 0.34, 0.02); t.rotateZ(sx * 0.32); t.translate(sx * 0.07, -0.6, 0.11);
    parts.push(paint(t, "#9e1f24"));
  }
  const geo = mergeGeometries(parts.map((p) => { p.deleteAttribute("uv"); return p; }))!;
  for (const p of parts) p.dispose();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, flatShading: true }));
  mesh.name = "cove-wreath";
  mesh.castShadow = true;
  return mesh;
}

const TOPS = new WeakMap<THREE.BufferGeometry, THREE.Vector3>();
/** A geometry's highest vertex (item frame), cached: a hulk's masthead, a capsized hull's keel. */
export function topVertex(g: THREE.BufferGeometry): THREE.Vector3 {
  let t = TOPS.get(g);
  if (!t) {
    const p = g.attributes.position;
    t = new THREE.Vector3(0, -Infinity, 0);
    for (let i = 0; i < p.count; i++) if (p.getY(i) > t.y) t.set(p.getX(i), p.getY(i), p.getZ(i));
    TOPS.set(g, t);
  }
  return t;
}
/** Wrecks a gull may stand on (big enough, and with a high point that is hull or spar, not rag). */
export const PERCH_ITEMS = new Set(["wreck_great_hulk", "wreck_capsized", "wreck_stern_section", "wreck_burned", "wreck_schooner_sunk", "wreck_mast_stump"]);
