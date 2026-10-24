/**
 * Hull livery: the painted topsides, sheer stripe, deck tone and coachroof of each hull, chosen
 * deterministically from the coin id (a hash). DECORATIVE ONLY: no colour here carries data. The brand
 * colour stays on the boot-top, pennant, sail covers and the sails' dye (sailDye, fleet-material); this is the
 * harbour's paint pot, a curated Nordic / Mediterranean range that sits inside style C's restraint (no saturated hue).
 */
import * as THREE from "three";
import type { Family } from "./variants";

/** Topside paints (sRGB). */
export const TOPSIDE = {
  white: "#E9E6DD",
  cream: "#DDD0B0",
  tar: "#22272B",
  forest: "#2E5A45",
  navy: "#26425F",
  oxblood: "#7A2C24",
  ochre: "#B88A3A",
  paleBlue: "#86A9BC",
} as const;
export type Topside = keyof typeof TOPSIDE;

/** Trim (sheer stripe, inside bulwarks, name-board letters) paints (sRGB). */
export const TRIM = {
  white: "#EEEBE3",
  cream: "#E3D7B9",
  tar: "#1F2326",
  forest: "#2F5D49",
  navy: "#284866",
  oxblood: "#8A3328",
  gilt: "#C99A3E",
  paleBlue: "#9BBCCB",
} as const;
export type Trim = keyof typeof TRIM;

/** Deck tones (sRGB): scrubbed, honey, oiled and weathered timber, and two painted working decks. */
export const DECK = ["#C4A272", "#D2BE97", "#A99F8D", "#94714D", "#C8B387", "#9AA09A"] as const;
const DECK_W = [24, 16, 20, 16, 12, 12];

/** Topside odds by peg family: the silhouette keeps the currency, so does the paint pot's bias. */
const TOPSIDE_W: Record<Family, Partial<Record<Topside, number>>> = {
  usd: { white: 12, cream: 7, tar: 11, forest: 15, navy: 15, oxblood: 15, ochre: 11, paleBlue: 14 },
  eur: { tar: 18, forest: 22, navy: 16, oxblood: 16, white: 10, paleBlue: 10, ochre: 8 },
  gold: { tar: 34, oxblood: 26, navy: 22, forest: 18 },
  fiat: { tar: 22, navy: 18, forest: 16, oxblood: 16, ochre: 14, white: 14 },
  other: { forest: 16, paleBlue: 16, white: 16, cream: 12, oxblood: 14, navy: 14, ochre: 12 },
};

/** The stripe that reads against each topside (light on dark, dark or warm on light). */
const STRIPE: Record<Topside, Trim[]> = {
  white: ["navy", "forest", "oxblood", "paleBlue", "gilt"],
  cream: ["forest", "oxblood", "navy"],
  tar: ["white", "gilt", "cream", "oxblood"],
  forest: ["white", "cream", "gilt"],
  navy: ["white", "cream", "gilt"],
  oxblood: ["white", "cream", "tar"],
  ochre: ["tar", "white", "forest"],
  paleBlue: ["white", "navy", "cream"],
};

/** The coachroof: a pale painted top (white / cream / buff) or the hull's own stripe colour. */
const ROOF: Trim[] = ["white", "cream", "cream", "white", "paleBlue"];

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
