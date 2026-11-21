/**
 * Hull livery: the oiled timber topsides, mineral-pigment sheer stripe, deck tone and coachroof of each hull, chosen
 * deterministically from the coin id (a hash). DECORATIVE ONLY: no colour here carries data. The brand
 * colour stays on the boot-top, pennant, sail covers and the sails' dye (sailDye, fleet-material); this is the
 * harbour's paint pot, a curated Classical Mediterranean timber and earth-pigment range that sits inside style C's
 * restraint (oiled cedar, dark oak, honey pine, pitch and mineral earth hues; no bright plastic hulls).
 */
import * as THREE from "three";
import type { Family } from "./variants";

/** Topside oiled timbers & Classical Mediterranean mineral pigments (sRGB). */
export const TOPSIDE = {
  cedar: "#865A38",
  oak: "#6B4A30",
  pine: "#A47E52",
  pitch: "#282421",
  oxblood: "#7D3428",
  egyptBlue: "#304A63",
  ochre: "#B0833A",
  limewash: "#DDD4C0",
} as const;
export type Topside = keyof typeof TOPSIDE;

/** Trim (sheer stripe, inside bulwarks, name-board letters, coachroofs) paints (sRGB). */
export const TRIM = {
  cream: "#E0D4B8",
  ochre: "#C49540",
  gilt: "#C99A3E",
  pitch: "#24201D",
  oxblood: "#8A382A",
  egyptBlue: "#365470",
  cedar: "#7B5030",
  terracotta: "#A45338",
} as const;
export type Trim = keyof typeof TRIM;

/** Deck tones (sRGB): deepened weathered and oiled Mediterranean timber (#7A5D3E–#B09268). */
export const DECK = ["#A1835B", "#B09268", "#8F785B", "#7A5D3E", "#A68A62", "#87765E"] as const;
const DECK_W = [24, 16, 20, 18, 12, 10];

/** Topside odds by peg family: heavily weighted toward oiled timber, with rare 4% aged limewash. */
const TOPSIDE_W: Record<Family, Partial<Record<Topside, number>>> = {
  usd: { cedar: 22, oak: 18, pine: 14, pitch: 12, oxblood: 12, egyptBlue: 10, ochre: 8, limewash: 4 },
  eur: { cedar: 18, oak: 18, pitch: 16, oxblood: 16, egyptBlue: 14, pine: 8, ochre: 6, limewash: 4 },
  gold: { pitch: 38, oak: 26, oxblood: 22, egyptBlue: 14 },
  fiat: { pitch: 22, cedar: 20, oxblood: 18, oak: 16, egyptBlue: 12, ochre: 8, limewash: 4 },
  other: { cedar: 22, oak: 18, pine: 16, pitch: 12, oxblood: 12, egyptBlue: 8, ochre: 8, limewash: 4 },
};

/** The stripe that reads against each topside (light/warm on dark, dark or mineral on light). */
const STRIPE: Record<Topside, Trim[]> = {
  cedar: ["cream", "ochre", "pitch", "egyptBlue"],
  oak: ["cream", "ochre", "gilt", "oxblood"],
  pine: ["pitch", "oxblood", "egyptBlue", "cedar"],
  pitch: ["cream", "gilt", "oxblood", "ochre"],
  oxblood: ["cream", "ochre", "pitch", "gilt"],
  egyptBlue: ["cream", "ochre", "gilt", "terracotta"],
  ochre: ["pitch", "oxblood", "egyptBlue", "cream"],
  limewash: ["egyptBlue", "oxblood", "pitch", "cedar", "gilt"],
};

/** The coachroof: warm aged cream, terracotta, oiled cedar or mineral trim (no stark white). */
const ROOF: Trim[] = ["cream", "terracotta", "cedar", "ochre", "egyptBlue"];

export interface Livery {
  topside: Topside;
  stripe: Trim;
  /** Index into DECK. */
  deck: number;
  /** Coachroof paint, or null to keep the varnished roof of the kit. */
  roof: Trim | null;
  /** Shows a name board at the bow quarter (most do). */
  nameBoard: boolean;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  // final avalanche so neighbouring ids decorrelate
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

function weighted<T>(items: readonly T[], weights: readonly number[], r: number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r * total;
  for (let i = 0; i < items.length; i++) { x -= weights[i]; if (x < 0) return items[i]; }
  return items[items.length - 1];
}

/** The livery of one coin's hull: stable across sessions and reloads, independent of its data. */
export function liveryFor(id: string, family: string): Livery {
  const r = (salt: string) => hash(`${id}#${salt}`) / 4294967296;
  const fam = (family in TOPSIDE_W ? family : "usd") as Family;
  const w = TOPSIDE_W[fam];
  const keys = Object.keys(w) as Topside[];
  const topside = weighted(keys, keys.map((k) => w[k]!), r("top"));
  const stripes = STRIPE[topside];
  const stripe = stripes[Math.floor(r("stripe") * stripes.length)];
  const deck = weighted(DECK.map((_, i) => i), DECK_W, r("deck"));
  const rr = r("roof");
  const roof = rr < 0.3 ? null : rr < 0.5 ? stripe : ROOF[Math.floor(r("roofc") * ROOF.length)];
  return { topside, stripe, deck, roof, nameBoard: r("board") < 0.85 };
}

/** sRGB hex → linear [r, g, b] (the fleet shader works in linear). */
export function linear(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)];
}

/**
/**
 * Earth pigments (01-A3, decorative): the dye's chroma is capped against the built palette (limewash, terracotta,
 * olive), so the fleet and the town read as one painting; the hue is kept, so the brand stays the brand. The
 * hovered / selected hull is shown at full chroma by the fleet shader (fleet-far.ts hbDyeChroma).
 */
export const DYE_MAX_SAT = 0.5;
const DYE_L: [number, number] = [0.38, 0.62];

/**
 * E04 (O5-I5, ruling V3): her colours on a flag in the same earth pigment as her dyed cloth: the brand hue and
 * lightness kept, its chroma capped at DYE_MAX_SAT (linear rgb into `out`). The hovered / selected / searched hull's
 * flag flies the brand itself.
 */
export function flagPigment(hex: string, out = new THREE.Color()): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(hex).getHSL(hsl, THREE.SRGBColorSpace);
  return out.setHSL(hsl.h, Math.min(hsl.s, DYE_MAX_SAT), hsl.l, THREE.SRGBColorSpace);
}

/**
 * The sails' dye from the coin's brand colour (sRGB hex) → linear rgb + mode for the fleet shader:
 *   1 = dyed canvas: the brand hue at earth-pigment chroma (DYE_MAX_SAT), never neon, and lifted when very dark so the sails still read at night and
 *       in shadow (the lift is toward a lighter shade of the same hue, so it stays the brand);
 *   2 = a near-white brand: the canvas stays, banded in a deeper shade of the brand at the foot and leech.
 */
export function sailDye(hex: string): { rgb: [number, number, number]; mode: 1 | 2 } {
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(hex).getHSL(hsl, THREE.SRGBColorSpace);
  const out = new THREE.Color();
  if (hsl.l > 0.8) {
    out.setHSL(hsl.h, Math.min(hsl.s, DYE_MAX_SAT), 0.42, THREE.SRGBColorSpace);
    return { rgb: [out.r, out.g, out.b], mode: 2 };
  }
  out.setHSL(hsl.h, Math.min(hsl.s, DYE_MAX_SAT), THREE.MathUtils.clamp(hsl.l, DYE_L[0], DYE_L[1]), THREE.SRGBColorSpace);
  return { rgb: [out.r, out.g, out.b], mode: 1 };
}
