/**
 * Pure fleet logic (no three.js): which kit hull a boat sails, and the rig pose from heading + wind.
 */
import type { HullClass } from "../layout/types";

export type Family = "usd" | "eur" | "gold" | "fiat" | "other";

const CLASS_ORDER: readonly HullClass[] = ["skiff", "boat", "small", "medium", "large", "flagship"];

/** Kit variants available per family, by class (public/harbour/kit/manifest.json). */
export interface VariantIndex { [family: string]: Partial<Record<HullClass, string>> }

export function indexVariants(hulls: ReadonlyArray<{ id: string; family: string; class: string }>): VariantIndex {
  const out: VariantIndex = {};
  for (const h of hulls) (out[h.family] ??= {})[h.class as HullClass] = h.id;
  return out;
}

/**
 * The kit hull for (family, class): the family's own variant of that class, else the family's nearest
 * class (scaled to the class LOA by the caller), else the USD rig of that class. The silhouette keeps the
 * peg currency; the size keeps the supply class.
 */
export function pickVariant(index: VariantIndex, family: string, cls: HullClass): string | null {
  const fam = index[family] ?? index.other ?? index.usd;
  const own = fam?.[cls];
  if (own) return own;
  const ci = CLASS_ORDER.indexOf(cls);
  if (fam) {
    for (let d = 1; d < CLASS_ORDER.length; d++) {
      for (const j of [ci - d, ci + d]) {
        const c = CLASS_ORDER[j];
        if (c && fam[c]) return fam[c]!;
      }
    }
  }
  return index.usd?.[cls] ?? Object.values(index.usd ?? {})[0] ?? null;
}

export function wrapAngle(a: number): number {
  const t = (a + Math.PI) % (2 * Math.PI);
  return (t < 0 ? t + 2 * Math.PI : t) - Math.PI;
}

/**
 * Signed boom swing (rad) for a hull on `heading` with the wind blowing FROM `windFrom`
 * (both layout headings: bow along (sin h, cos h)). Negative = starboard tack (wind from starboard,
 * boom out to port, as modelled); positive = port tack (mirrored rig). Magnitude 0.25 close-hauled
 * … 0.9 running, × how much sail is set.
 */
export function targetSwing(heading: number, windFrom: number, sailSet: number): number {
  const rel = Math.abs(wrapAngle(windFrom - heading)); // 0 = head to wind … π = running
  const k = Math.min(1, Math.max(0, (rel - 0.6) / 2.2));
  const mag = (0.25 + 0.65 * k * k * (3 - 2 * k)) * sailSet;
  // starboard is (-cos h, sin h): wind from starboard ⇔ sin(h - windFrom) > 0
  return Math.sin(heading - windFrom) > 0 ? -mag : mag;
}

/** Rate-limited approach (rad/s) so a tack swings the boom across instead of snapping. */
export function approach(cur: number, target: number, maxStep: number): number {
  const d = target - cur;
  return Math.abs(d) <= maxStep ? target : cur + Math.sign(d) * maxStep;
}

/** Wreck scale within its slot class from the coin's peak market cap (log-scaled, 0.8 … 1.15). */
export function wreckScale(peakMcap: number | null): number {
  if (!peakMcap || peakMcap <= 0) return 0.85;
  const k = Math.min(1, Math.max(0, (Math.log10(peakMcap) - 7) / 3.5));
  return 0.8 + 0.35 * k;
}

/** Deterministic 0..1 hash of a string (FNV-1a): decorative per-coin choices. */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

/** Share of hulls WITH a peg reading that show an anchor light at a mooring or berth: a few, not a candle field. */
export const MOORED_LIT = 0.3;

/**
 * Whether her stern / anchor lamp is lit. Data truth: a lit lamp means a peg reading exists, so a coin
 * without one (nullPeg) never shows it, moored or under way. With a reading: always under way and at
 * anchor; at a mooring or berth only a deterministic minority (MOORED_LIT, chosen by id).
 * (Masthead and sidelights under way are navigation decoration, not a reading.)
 */
export function sternLampLit(boat: { id: string; nullPeg: boolean }, at: "under-way" | "anchored" | "moored"): boolean {
  if (boat.nullPeg) return false;
  return at !== "moored" || hash01(boat.id + "#lamp") < MOORED_LIT;
}
