import type { HullClass, RigFamily } from "./types";

/** FNV-1a 32-bit (same as the P1 grey-box occupancy model). */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic [0, 1) from a string. */
export function u01(s: string): number {
  return fnv1a(s) / 4294967296;
}

export const HULL_CLASSES: readonly HullClass[] = ["flagship", "large", "medium", "small", "boat", "skiff"];

/** Hull class by supply decade (BRIEF scale ladder). */
export function hullClassFor(usd: number): HullClass {
  if (usd >= 1e10) return "flagship";
  if (usd >= 1e9) return "large";
  if (usd >= 1e8) return "medium";
  if (usd >= 1e7) return "small";
  if (usd >= 1e6) return "boat";
  return "skiff";
}

/** Rig family by peg currency (D9). */
export function rigFor(pegType: string): RigFamily {
  const p = pegType.replace(/^pegged/, "");
  if (p === "USD") return "usd";
  if (p === "EUR") return "eur";
  if (p === "GOLD" || p === "SILVER") return "gold";
  if (p === "VAR" || p === "") return "other";
  return "fiat";
}

/**
 * Hash-stable pleasant colour for coins without an extracted brand colour: a muted
 * mid-lightness hue that sits inside the palette's saturated-only-for-brand rule.
 */
export function hashColor(id: string): string {
  const h = u01(id + "#hue") * 360;
  const s = 0.42 + u01(id + "#sat") * 0.2;
  const l = 0.4 + u01(id + "#lum") * 0.14;
  return hslToHex(h, s, l);
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const hex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function pierIdFor(chain: string): string {
  return "pier-" + chain.toLowerCase().replace(/\s+/g, "-");
}
