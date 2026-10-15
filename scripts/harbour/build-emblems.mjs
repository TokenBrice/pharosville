#!/usr/bin/env node
/**
 * Builds the sail-emblem atlas for the Harbour fleet:
 *   public/harbour/emblems.png  — 4096 px wide, rows of 128² slots (32 per row), sRGB + alpha
 *   public/harbour/emblems.avif — the same atlas, AVIF 4:4:4 q70 (what the runtime loads; premultiplied PSNR checked here)
 *   public/harbour/emblems.webp — the same atlas, lossy RGB + lossless alpha (the runtime's fallback when AVIF fails)
 *   public/harbour/emblems.json — { slot, cols, width, height, ids: { coinId: slotIndex } }
 *
 * Every coin logo (data/logos.json → public/logos/*) is set on a WHITE ROUNDEL with a thin warm rim
 * (dark logos vanish on tanbark/ochre cloth without one) and clipped to a circle so square logos read
 * as roundels too. Coins without a logo get a generated monogram at runtime (fleet/emblems.ts) in the
 * free slots after these.
 *
 * Usage: node scripts/harbour/build-emblems.mjs
 * Needs only the `sharp` devDependency (libvips + librsvg are bundled), so the sync workflow rebuilds
 * the atlas on a stock runner and a local build matches it.
 */
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import sharp from "sharp";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const SLOT = 128, COLS = 32, WIDTH = SLOT * COLS;
const ROUNDEL_R = 61;      // white disc radius (px)
const LOGO_R = 52;         // logo clip radius (px)
const RIM = "#BDB2A0";     // warm grey rim so the roundel still reads on white cloth
const SIDE = LOGO_R * 2;
const NONE = { r: 0, g: 0, b: 0, alpha: 0 };
const svg = (w, h, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`);
// roundel: rim ring then white disc, centred on the slot
const ROUNDEL = await sharp(svg(SLOT, SLOT,
  `<circle cx="${SLOT / 2}" cy="${SLOT / 2}" r="${ROUNDEL_R + 1.6}" fill="${RIM}"/><circle cx="${SLOT / 2}" cy="${SLOT / 2}" r="${ROUNDEL_R - 1.4}" fill="#fff"/>`)).png().toBuffer();
const CLIP = svg(SIDE, SIDE, `<circle cx="${LOGO_R}" cy="${LOGO_R}" r="${LOGO_R}" fill="#fff"/>`);

const logos = JSON.parse(await readFile(join(ROOT, "data/logos.json"), "utf8"));
const ids = Object.keys(logos).sort((a, b) => (a.length - b.length) || (a < b ? -1 : a > b ? 1 : 0));
// one tile per logo FILE (a coin listed under its llama id and its registry slug shares one slot)
const paths = [...new Set(ids.map((id) => logos[id]))];

/** The logo rasterised at twice the clip square (first frame of an animated file), as a PNG buffer. */
async function raster(src) {
  if (extname(src).toLowerCase() === ".svg") {
    // render the vector at the density that makes its longer side 2 × SIDE, not upscaled from 72 dpi
    const { width = SIDE, height = SIDE } = await sharp(src).metadata();
    const density = Math.min(2400, 72 * (SIDE * 2) / Math.max(width, height));
    return sharp(src, { density }).resize(SIDE * 2, SIDE * 2, { fit: "inside" }).png().toBuffer();
  }
  return sharp(src, { pages: 1 }).resize(SIDE * 2, SIDE * 2, { fit: "inside", kernel: "mitchell" }).png().toBuffer();
}

async function tile(path) {
  let img = await raster(join(ROOT, "public", path));
  // trim the logo's own margin (a blank image has nothing to trim and keeps its frame)
  img = await sharp(img).trim().png().toBuffer().catch(() => img);
  // logo fitted into the clip circle's square, then its alpha multiplied by a circular mask (dest-in)
  const logo = await sharp(img).ensureAlpha()
    .resize(SIDE, SIDE, { fit: "contain", background: NONE, kernel: "mitchell" })
    .composite([{ input: CLIP, blend: "dest-in" }]).png().toBuffer();
  return sharp(ROUNDEL).composite([{ input: logo, gravity: "center" }]).png().toBuffer();
}

const tiles = new Array(paths.length);
let next = 0;
const failed = [];
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < paths.length) {
    const i = next++;
    try { tiles[i] = await tile(paths[i]); } catch (e) { failed.push(paths[i]); console.warn(`[emblems] ${paths[i]}: ${String(e.message ?? e).slice(0, 160)}`); }
  }
}));

const kept = paths.map((p, i) => [p, tiles[i]]).filter(([, t]) => t);
const rows = Math.ceil(kept.length / COLS);
const atlas = await sharp({ create: { width: WIDTH, height: rows * SLOT, channels: 4, background: NONE } })
  .composite(kept.map(([, t], i) => ({ input: t, left: (i % COLS) * SLOT, top: Math.floor(i / COLS) * SLOT })))
  .png().toBuffer();
await sharp(atlas).png({ compressionLevel: 9 }).toFile(join(ROOT, "public/harbour/emblems.png"));
await sharp(atlas).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(join(ROOT, "public/harbour/emblems.webp"));
await sharp(atlas).avif({ quality: 70, effort: 6, chromaSubsampling: "4:4:4" }).toFile(join(ROOT, "public/harbour/emblems.avif"));
// the lossy copies against the lossless atlas, on premultiplied RGBA (what the sail samples: colour under alpha 0 is moot)
const ref = await sharp(atlas).ensureAlpha().raw().toBuffer();
for (const ext of ["avif", "webp"]) {
  const d = await sharp(join(ROOT, `public/harbour/emblems.${ext}`)).ensureAlpha().raw().toBuffer();
  let se = 0;
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) { const e = (d[i + c] * d[i + 3] - ref[i + c] * ref[i + 3]) / 255; se += e * e; }
    se += (d[i + 3] - ref[i + 3]) ** 2;
  }
  const psnr = 10 * Math.log10(255 * 255 / (se / d.length));
  console.log(`[emblems] ${ext}: PSNR ${psnr.toFixed(2)} dB (premultiplied RGBA)`);
  if (ext === "avif" && psnr < 40) { console.error("[emblems] emblems.avif PSNR below 40 dB: check the encoder"); process.exitCode = 1; }
}
const slotOf = new Map(kept.map(([p], i) => [p, i]));
const map = Object.fromEntries(ids.filter((id) => slotOf.has(logos[id])).map((id) => [id, slotOf.get(logos[id])]));
await writeFile(join(ROOT, "public/harbour/emblems.json"), JSON.stringify({ slot: SLOT, cols: COLS, width: WIDTH, height: rows * SLOT, ids: map }) + "\n");
console.log(`[emblems] ${Object.keys(map).length} coins, ${kept.length} logos → ${COLS}×${rows} slots (${WIDTH}×${rows * SLOT})${failed.length ? `, ${failed.length} failed: ${failed.join(", ")}` : ""}`);
