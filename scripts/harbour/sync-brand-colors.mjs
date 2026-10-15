/**
 * BRAND COLOURS (unified into `npm run sync:pharos-watch`): slug-keyed logos → data/brand-colors.json "#primary|#secondary".
 * The heuristic is scripts/pharosville/extract-brand-colors.mjs's (saturation-weighted hue histogram, grey fallback,
 * livery-safe lightness clamp, OKLab distance guard, data/brand-color-overrides.json wins), but it decodes with sharp
 * instead of a browser, and it is INCREMENTAL: only ids that are new, whose logo moved, or whose logo bytes changed in
 * this sync are (re)derived. Every other entry is kept verbatim, so a sync never churns colours it did not need to touch.
 * A library step of scripts/harbour/sync-pharos-watch.mjs; it writes nothing itself.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const SAMPLE_SIZE = 48;
const PRIMARY_LIGHTNESS_MIN = 0.24;
const PRIMARY_LIGHTNESS_MAX = 0.58;
const MIN_OKLAB_DISTANCE = 0.055;
const GUARD_LIGHTNESS_STEP = 0.05;
const GUARD_MAX_ATTEMPTS = 8;
const HUE_BUCKETS = 12;
export const BRAND_ENTRY = /^#[0-9a-f]{6}\|#[0-9a-f]{6}$/;

function rgbToHsl(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t) => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };
  return { r: Math.round(channel(h + 1 / 3) * 255), g: Math.round(channel(h) * 255), b: Math.round(channel(h - 1 / 3) * 255) };
}

const rgbToHex = ({ r, g, b }) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
const hexToRgb = (hex) => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) });
const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };

function rgbToOklab({ r, g, b }) {
  const lr = lin(r), lg = lin(g), lb = lin(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklabDistance(x, y) {
  const a = rgbToOklab(hexToRgb(x)), b = rgbToOklab(hexToRgb(y));
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
}

function dominantColors(pixels) {
  const buckets = Array.from({ length: HUE_BUCKETS }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
  const grey = { weight: 0, r: 0, g: 0, b: 0 };
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 200) continue;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const { h, s, l } = rgbToHsl(r, g, b);
    if (l > 0.93 || l < 0.07) continue; // ignore white/black framing
    if (s < 0.18) {
      const w = 1 - Math.abs(l - 0.45);
      grey.weight += w; grey.r += r * w; grey.g += g * w; grey.b += b * w;
      continue;
    }
    const bucket = buckets[Math.min(HUE_BUCKETS - 1, Math.floor(h * HUE_BUCKETS))];
    const w = s * (1 - Math.abs(l - 0.5) * 0.8);
    bucket.weight += w; bucket.r += r * w; bucket.g += g * w; bucket.b += b * w;
  }
  const ranked = buckets.filter((k) => k.weight > 0).sort((a, b) => b.weight - a.weight);
  const toHex = (acc) => rgbToHex({ r: acc.r / acc.weight, g: acc.g / acc.weight, b: acc.b / acc.weight });
  if (ranked.length === 0) {
    if (grey.weight <= 0) return null;
    const g = toHex(grey);
    return { primary: g, secondary: g };
  }
  const primary = toHex(ranked[0]);
  const second = ranked.find((k, i) => i > 0 && k.weight >= ranked[0].weight * 0.25);
  if (second) return { primary, secondary: toHex(second) };
  if (grey.weight >= ranked[0].weight * 0.25) return { primary, secondary: toHex(grey) };
  return { primary, secondary: primary };
}

function withLightness(hex, f) {
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  return rgbToHex(hslToRgb(h, s, f(l)));
}
const clampPrimary = (hex) => withLightness(hex, (l) => Math.max(PRIMARY_LIGHTNESS_MIN, Math.min(PRIMARY_LIGHTNESS_MAX, l)));
const nudgeLightness = (hex, delta) => withLightness(hex, (l) => Math.max(0.14, Math.min(0.72, l + delta)));

async function pixelsOf(buf) {
  const { default: sharp } = await import("sharp");
  return sharp(buf).resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: "fill" }).ensureAlpha().raw().toBuffer();
}

/**
 * @param {{ root: string, before: Record<string, string>, logos: Record<string, string>, writes: Map<string, Buffer> }} o
 * @returns {Promise<{ before: Record<string, string>, colors: Record<string, string>, derived: string[], skipped: string[] }>}
 */
export async function planBrandColors({ root, before, logos, writes }) {
  const current = JSON.parse(await readFile(join(root, "data/brand-colors.json"), "utf8"));
  const overrides = JSON.parse(await readFile(join(root, "data/brand-color-overrides.json"), "utf8").catch(() => "{}"));
  const ids = Object.keys(logos).filter((id) => !/^\d+$/.test(id)).sort();
  const todo = ids.filter((id) => !current[id] || before[id] !== logos[id] || writes.has(logos[id]));

  const fresh = {};
  const skipped = [];
  for (const id of todo) {
    if (overrides[id]) { fresh[id] = overrides[id]; continue; }
    const p = logos[id];
    const buf = writes.get(p) ?? await readFile(join(root, "public", p)).catch(() => null);
    if (!buf) { skipped.push(`${id} (missing file ${p})`); continue; }
    const px = await pixelsOf(buf).catch(() => null);
    if (!px) { skipped.push(`${id} (decode failed)`); continue; }
    const c = dominantColors(px);
    if (!c) { skipped.push(`${id} (no usable pixels)`); continue; }
    fresh[id] = `${clampPrimary(c.primary)}|${c.secondary}`;
  }

  // distance guard, for the freshly derived only: clear every kept primary and every earlier fresh one
  const accepted = Object.entries(current).filter(([id]) => !(id in fresh)).map(([, v]) => v.split("|")[0]);
  for (const id of Object.keys(fresh).sort()) {
    const [initial, secondary] = fresh[id].split("|");
    let primary = initial;
    if (!overrides[id]) {
      for (let attempt = 1; attempt <= GUARD_MAX_ATTEMPTS && accepted.some((o) => oklabDistance(primary, o) < MIN_OKLAB_DISTANCE); attempt++) {
        primary = nudgeLightness(initial, (attempt % 2 === 1 ? 1 : -1) * Math.ceil(attempt / 2) * GUARD_LIGHTNESS_STEP);
      }
    }
    fresh[id] = `${primary}|${secondary}`;
    accepted.push(primary);
  }

  const merged = { ...current, ...fresh };
  const colors = Object.fromEntries(Object.keys(merged).sort().map((id) => [id, merged[id]]));
  return { before: current, colors, derived: Object.keys(fresh).sort(), skipped };
}
