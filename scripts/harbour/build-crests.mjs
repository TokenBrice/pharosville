#!/usr/bin/env node
/**
 * Builds the Harbour's chain-identity atlases (P6, D17/D18). No browser: ImageMagick 7 (`magick`),
 * `rsvg-convert`, `cwebp` and python3 fontTools only.
 *
 *   public/harbour/crests.webp  2048×512 sRGB+alpha, lossless WebP (`-exact`; composed as a PNG in a temp dir and
 *                               verified pixel-exact against it when `sharp` is installed). Row 0: eight 256² facade crests (a heater shield in
 *                               the chain colour, a gilt rim, the chain mark in ivory, on a stone plaque) for
 *                               each harbour office's `crest_panel`. Row 1: eight 256×170 house-flag cloths
 *                               (chain field, ivory roundel, the mark in the field colour).
 *   public/harbour/crests.json  { chains: { slug: { color, rim, ink, panel:[u0,v0,u1,v1], flag:[u0,v0,u1,v1] } } }
 *                               UVs in three's convention (v = 0 at the bottom row of the image).
 *
 *   public/harbour/chart-lettering.png   1024×1120 single-channel signed-distance atlas (R = 0.5 + d / 2·spread)
 *   public/harbour/chart-lettering.json  glyph cells + advances for the chart lettering laid on the sea:
 *                               EB Garamond 600 upright caps (harbour names) and 400 italic caps (water features,
 *                               the classic hydrographic convention), plus a four-point compass star.
 *
 * Usage: node scripts/harbour/build-crests.mjs
 */
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const OUT = join(ROOT, "public/harbour");
const tmp = await mkdtemp(join(tmpdir(), "harbour-crests-"));

// ------------------------------------------------------------------ chain heraldry
// field = the cloth / shield colour, rim = the bordure, ink = the mark. Tasteful, recognisable tinctures.
const CHAINS = {
  ethereum: { color: "#4251A8", rim: "#D9B45A", ink: "#F3EBD8" },          // indigo
  tron: { color: "#B8262C", rim: "#E2C37A", ink: "#F6EEDD" },              // crimson
  bsc: { color: "#E1A915", rim: "#2B2420", ink: "#211C18" },               // gold, sable mark
  solana: { color: "#6A3CC9", rim: "#21CFAE", ink: "#F2ECFF" },            // violet, teal bordure
  "hyperliquid-l1": { color: "#58CDB4", rim: "#0F4A42", ink: "#0C3A34" },  // mint, deep-teal mark
  base: { color: "#1A55E8", rim: "#E8E2D2", ink: "#F7F4EC" },              // blue
  arbitrum: { color: "#1C3557", rim: "#2EA3F2", ink: "#EAF4FC" },          // navy, sky bordure
  polygon: { color: "#7A3FDC", rim: "#D9B45A", ink: "#F3ECFC" },           // purple
};
const SLUGS = Object.keys(CHAINS);
const PANEL = 256, FLAG_W = 256, FLAG_H = 170, CREST_W = PANEL * SLUGS.length, CREST_H = 512;

// Heraldic marks that differ from public/chains/*.svg. Base's current mark is a plain square, which on a shield
// reads as a blank panel: the crest carries Base's classic coin (a disc cut by a bar from the hoist) instead.
const MARK_SVG = {
  base: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 111 111"><path fill="#fff" d="M54.921 110.034C85.359 110.034 110.034 85.402 110.034 55.017C110.034 24.6319 85.359 0 54.921 0C26.0432 0 2.35281 22.1714 0.6 46.6H74.5V63.4H0.6C2.35281 87.8625 26.0432 110.034 54.921 110.034Z"/></svg>`,
};

/** The chain mark as a white alpha mask fitted in a side² square. */
async function markMask(slug, side) {
  const raster = join(tmp, `${slug}-r.png`), out = join(tmp, `${slug}-m${side}.png`);
  let src = join(ROOT, "public/chains", `${slug}.svg`);
  if (MARK_SVG[slug]) { src = join(tmp, `${slug}-mark.svg`); await writeFile(src, MARK_SVG[slug]); }
  await run("rsvg-convert", ["-w", String(side * 3), "-h", String(side * 3), "-a", "-b", "none", "-o", raster, src]);
  // every source colour → white, keep the alpha (so gradients and red/purple marks all read as one silhouette)
  await run("magick", [raster, "-trim", "+repage", "-resize", `${side}x${side}`, "-gravity", "center", "-background", "none", "-extent", `${side}x${side}`,
    "-channel", "RGB", "-evaluate", "set", "100%", "+channel", out]);
  return out;
}

async function tinted(mask, hex, name) {
  const out = join(tmp, name);
  await run("magick", [mask, "-fill", hex, "-colorize", "100", out]);
  return out;
}

async function crestPanel(slug) {
  const c = CHAINS[slug];
  const S = PANEL, out = join(tmp, `${slug}-panel.png`);
  // heater shield: straight top, sides curving to a point
  const shield = (inset) => {
    const x0 = 46 + inset, x1 = S - 46 - inset, y0 = 30 + inset, yMid = 132, yTip = S - 22 - inset * 1.4;
    const cx = S / 2;
    return `path 'M ${x0},${y0} L ${x1},${y0} L ${x1},${yMid} Q ${x1},${yTip - 40} ${cx},${yTip} Q ${x0},${yTip - 40} ${x0},${yMid} Z'`;
  };
  const mark = await tinted(await markMask(slug, 104), c.ink, `${slug}-panel-mark.png`);
  await run("magick", [
    "-size", `${S}x${S}`, "xc:#E6DCC4",
    // stone plaque: bevelled frame
    "-fill", "none", "-stroke", "#B9AC90", "-strokewidth", "10", "-draw", `rectangle 5,5 ${S - 6},${S - 6}`,
    "-stroke", "#F4EDDC", "-strokewidth", "3", "-draw", `rectangle 12,12 ${S - 13},${S - 13}`,
    // shield: dark outline, gilt bordure, field
    "-stroke", "none", "-fill", "#2A2522", "-draw", shield(-4),
    "-fill", c.rim, "-draw", shield(0),
    "-fill", c.color, "-draw", shield(9),
    // a subtle chief highlight
    "-fill", "rgba(255,255,255,0.10)", "-draw", `rectangle ${55},${39} ${S - 55},${58}`,
    mark, "-gravity", "center", "-geometry", "+0-6", "-composite",
    out,
  ]);
  return out;
}

async function houseFlag(slug) {
  const c = CHAINS[slug];
  const W = FLAG_W, H = FLAG_H, out = join(tmp, `${slug}-flag.png`);
  const R = 62, cx = W * 0.5, cy = H / 2;
  const mark = await tinted(await markMask(slug, 84), c.color, `${slug}-flag-mark.png`);
  await run("magick", [
    "-size", `${W}x${H}`, `xc:${c.color}`,
    // a bordure band in the rim colour along hoist and fly (reads as the chain's second tincture)
    "-fill", c.rim, "-draw", `rectangle 0,0 ${W},11`, "-draw", `rectangle 0,${H - 12} ${W},${H}`,
    // ivory roundel with a rim ring
    "-fill", c.rim, "-draw", `circle ${cx},${cy} ${cx},${cy - R - 5}`,
    "-fill", c.ink === "#211C18" || c.ink === "#0C3A34" ? "#F7F1E2" : c.ink, "-draw", `circle ${cx},${cy} ${cx},${cy - R}`,
    mark, "-gravity", "center", "-geometry", "+0+0", "-composite",
    out,
  ]);
  return out;
}

async function buildCrests() {
  const args = ["-size", `${CREST_W}x${CREST_H}`, "xc:none"];
  const chains = {};
  for (let i = 0; i < SLUGS.length; i++) {
    const slug = SLUGS[i];
    const p = await crestPanel(slug), f = await houseFlag(slug);
    const x = i * PANEL;
    args.push(p, "-geometry", `+${x}+0`, "-composite", f, "-geometry", `+${x}+${PANEL}`, "-composite");
    const u = (px) => +(px / CREST_W).toFixed(6), v = (py) => +(1 - py / CREST_H).toFixed(6);
    chains[slug] = {
      ...CHAINS[slug],
      panel: [u(x), v(PANEL), u(x + PANEL), v(0)],
      flag: [u(x + 0.5), v(PANEL + FLAG_H - 0.5), u(x + FLAG_W - 0.5), v(PANEL + 0.5)],
    };
  }
  const png = join(tmp, "crests.png"), webp = join(OUT, "crests.webp");
  args.push("-define", "png:compression-level=9", png);
  await run("magick", args);
  await run("cwebp", ["-quiet", "-lossless", "-exact", "-z", "9", "-metadata", "none", png, "-o", webp]);
  let sharp = null;
  try { sharp = (await import("sharp")).default; } catch { /* optional: verification only */ }
  if (sharp) {
    const [a, b] = await Promise.all([png, webp].map((p) => sharp(p).ensureAlpha().raw().toBuffer()));
    if (Buffer.compare(a, b) !== 0) throw new Error("crests.webp does not decode to the composed PNG's exact RGBA");
  }
  await writeFile(join(OUT, "crests.json"), JSON.stringify({ version: 1, width: CREST_W, height: CREST_H, chains }, null, 1) + "\n");
}

// ------------------------------------------------------------------ chart lettering (SDF)
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789&'.,-·";
const SRC_CELL = 224, EM = 128, ORIGIN_X = 44, BASELINE = 164, SPREAD = 16;  // source px
const DOWN = 2, CELL = SRC_CELL / DOWN, ATLAS = 1024, ROWS = 10, COLS = Math.floor(ATLAS / CELL), ATLAS_H = ROWS * CELL;

/** 1-D squared distance transform (Felzenszwalb & Huttenlocher). */
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
}
function edt(grid, w, h) {
  const INF = 1e20, n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x] ? 0 : INF;
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = Math.sqrt(d[x]);
  }
  return grid;
}

/** Coverage (0..255) → signed distance field (px, + inside), downsampled ×DOWN. */
function sdfCell(cov) {
  const S = SRC_CELL, inside = new Float64Array(S * S), outside = new Float64Array(S * S);
  for (let i = 0; i < S * S; i++) { inside[i] = cov[i] >= 128 ? 1 : 0; outside[i] = cov[i] >= 128 ? 0 : 1; }
  const dOut = edt(inside, S, S), dIn = edt(outside, S, S);    // distance to nearest inside / outside pixel
  const out = new Uint8Array(CELL * CELL);
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    let s = 0;
    for (let j = 0; j < DOWN; j++) for (let i = 0; i < DOWN; i++) {
      const k = (y * DOWN + j) * S + (x * DOWN + i);
      // sub-pixel refinement from the antialiased coverage
      s += (dIn[k] > 0 ? dIn[k] - 0.5 : 0) - (dOut[k] > 0 ? dOut[k] - 0.5 : 0) + (cov[k] / 255 - 0.5) * 0.9;
    }
    s /= DOWN * DOWN;
    out[y * CELL + x] = Math.max(0, Math.min(255, Math.round((0.5 + s / (2 * SPREAD)) * 255)));
  }
  return out;
}

async function rasterGlyph(ttf, ch) {
  const { stdout } = await run("magick", ["-size", `${SRC_CELL}x${SRC_CELL}`, "xc:black", "-font", ttf, "-pointsize", String(EM), "-fill", "white",
    "-annotate", `+${ORIGIN_X}+${BASELINE}`, ch, "-depth", "8", "gray:-"], { encoding: "buffer", maxBuffer: 1 << 24 });
  return new Uint8Array(stdout);
}

async function rasterStar(capPx) {
  // four-point compass star centred on mid cap-height, plus a fine ring
  const cx = ORIGIN_X + capPx * 0.7, cy = BASELINE - capPx * 0.5, R = capPx * 0.75, r = capPx * 0.17;
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2, rr = i % 2 ? r : R;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  const { stdout } = await run("magick", ["-size", `${SRC_CELL}x${SRC_CELL}`, "xc:black", "-fill", "white", "-draw", `polygon ${pts.join(" ")}`,
    "-fill", "none", "-stroke", "white", "-strokewidth", String(Math.max(3, capPx * 0.05)), "-draw", `circle ${cx},${cy} ${cx},${cy - R * 0.62}`,
    "-depth", "8", "gray:-"], { encoding: "buffer", maxBuffer: 1 << 24 });
  return new Uint8Array(stdout);
}

async function buildLettering() {
  const faces = [
    { id: "upright", woff2: "eb-garamond-600-latin.woff2" },
    { id: "italic", woff2: "eb-garamond-400-italic-latin.woff2" },
  ];
  const py = `
import json, sys
from fontTools.ttLib import TTFont
out = {}
for src, dst in zip(sys.argv[1::2], sys.argv[2::2]):
    f = TTFont(src); f.flavor = None; f.save(dst)
    cm = f.getBestCmap(); hm = f['hmtx']; upm = f['head'].unitsPerEm
    out[dst] = { 'cap': f['OS/2'].sCapHeight / upm, 'adv': { chr(c): hm[cm[c]][0] / upm for c in cm if c < 0x2000 } }
print(json.dumps(out))`;
  const argv = [];
  for (const f of faces) { f.ttf = join(tmp, f.woff2.replace(".woff2", ".ttf")); argv.push(join(ROOT, "public/fonts", f.woff2), f.ttf); }
  const { stdout } = await run("python3", ["-I", "-c", py, ...argv], { maxBuffer: 1 << 24 });
  const metrics = JSON.parse(stdout);

  const atlas = new Uint8Array(ATLAS * ATLAS_H);
  const glyphs = {};
  let slot = 0;
  const place = (cell) => {
    const cx = (slot % COLS) * CELL, cy = Math.floor(slot / COLS) * CELL;
    for (let y = 0; y < CELL; y++) atlas.set(cell.subarray(y * CELL, (y + 1) * CELL), (cy + y) * ATLAS + cx);
    return slot++;
  };
  for (const f of faces) {
    const m = metrics[f.ttf];
    glyphs[f.id] = { cap: m.cap, chars: {} };
    for (const ch of CHARS) {
      if (!(ch in m.adv)) continue;
      glyphs[f.id].chars[ch] = { slot: place(sdfCell(await rasterGlyph(f.ttf, ch))), adv: +m.adv[ch].toFixed(4) };
    }
  }
  const star = { slot: place(sdfCell(await rasterStar(EM * metrics[faces[0].ttf].cap))), adv: 1.1 };
  const raw = join(tmp, "atlas.gray");
  await writeFile(raw, atlas);
  await run("magick", ["-size", `${ATLAS}x${ATLAS_H}`, "-depth", "8", `gray:${raw}`, "-define", "png:compression-level=9", join(OUT, "chart-lettering.png")]);
  // cell geometry in em units (glyph origin on the baseline): the quad spans [x0, x1] × [y0, y1]
  const em = EM / DOWN, cell = CELL;
  const json = {
    version: 1, atlas: [ATLAS, ATLAS_H], cell, cols: COLS, spreadPx: SPREAD / DOWN, emPx: em,
    quad: { x0: -(ORIGIN_X / DOWN) / em, x1: (cell - ORIGIN_X / DOWN) / em, y0: -(cell - BASELINE / DOWN) / em, y1: (BASELINE / DOWN) / em },
    faces: glyphs, star,
  };
  await writeFile(join(OUT, "chart-lettering.json"), JSON.stringify(json) + "\n");
}

try {
  await buildCrests();
  await buildLettering();
  console.log("crests.webp/json + chart-lettering.png/json written to public/harbour/");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
