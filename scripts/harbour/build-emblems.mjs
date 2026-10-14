#!/usr/bin/env node
/**
 * Builds the sail-emblem atlas for the Harbour fleet:
 *   public/harbour/emblems.png  — 4096 px wide, rows of 128² slots (32 per row), sRGB + alpha
 *   public/harbour/emblems.webp — the same atlas, lossy RGB + lossless alpha (~40 % of the PNG; what the runtime loads)
 *   public/harbour/emblems.json — { slot, cols, width, height, ids: { coinId: slotIndex } }
 *
 * Every coin logo (data/logos.json → public/logos/*) is set on a WHITE ROUNDEL with a thin warm rim
 * (dark logos vanish on tanbark/ochre cloth without one) and clipped to a circle so square logos read
 * as roundels too. Coins without a logo get a generated monogram at runtime (fleet/emblems.ts) in the
 * free slots after these.
 *
 * Usage: node scripts/harbour/build-emblems.mjs   (needs ImageMagick 7 `magick` + `rsvg-convert`)
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const SLOT = 128, COLS = 32, WIDTH = SLOT * COLS;
const ROUNDEL_R = 61;      // white disc radius (px)
const LOGO_R = 52;         // logo clip radius (px)
const RIM = "#BDB2A0";     // warm grey rim so the roundel still reads on white cloth

const logos = JSON.parse(await readFile(join(ROOT, "data/logos.json"), "utf8"));
const ids = Object.keys(logos).sort((a, b) => (a.length - b.length) || (a < b ? -1 : a > b ? 1 : 0));
const tmp = await mkdtemp(join(tmpdir(), "harbour-emblems-"));

async function tile(id, i) {
  const src = join(ROOT, "public", logos[id]);
  const raster = join(tmp, `r${i}.png`);
  const out = join(tmp, `t${String(i).padStart(4, "0")}.png`);
  const side = LOGO_R * 2;
  if (extname(src).toLowerCase() === ".svg") {
    await run("rsvg-convert", ["-w", String(side * 2), "-h", String(side * 2), "-a", "-b", "none", "-o", raster, src]);
  } else {
    await run("magick", [`${src}[0]`, "-background", "none", "-filter", "Mitchell", "-resize", `${side * 2}x${side * 2}`, raster]);
  }
  const c = SLOT / 2;
  await run("magick", [
    "-size", `${SLOT}x${SLOT}`, "xc:none",
    // roundel: rim ring then white disc
    "-fill", RIM, "-draw", `circle ${c - 0.5},${c - 0.5} ${c - 0.5},${c - 0.5 - ROUNDEL_R - 1.6}`,
    "-fill", "white", "-draw", `circle ${c - 0.5},${c - 0.5} ${c - 0.5},${c - 0.5 - ROUNDEL_R + 1.4}`,
    // logo fitted into the clip circle's square, then clipped to the circle
    "(", raster, "-trim", "+repage", "-resize", `${side}x${side}`, "-gravity", "center", "-background", "none", "-extent", `${side}x${side}`,
    // keep the logo's own transparency: multiply its alpha by a circular mask (DstIn)
    "(", "-size", `${side}x${side}`, "xc:none", "-fill", "white", "-draw", `circle ${LOGO_R - 0.5},${LOGO_R - 0.5} ${LOGO_R - 0.5},0`, ")",
    "-compose", "DstIn", "-composite", ")",
    "-gravity", "center", "-compose", "Over", "-composite",
    out,
  ]);
  return out;
}

const tiles = new Array(ids.length);
let next = 0;
const failed = [];
await Promise.all(Array.from({ length: 12 }, async () => {
  while (next < ids.length) {
    const i = next++;
    try { tiles[i] = await tile(ids[i], i); } catch (e) { failed.push(ids[i]); console.warn(`[emblems] ${ids[i]}: ${String(e.stderr ?? e).slice(0, 160)}`); }
  }
}));

const kept = ids.map((id, i) => [id, tiles[i]]).filter(([, t]) => t);
const rows = Math.ceil(kept.length / COLS);
const outPng = join(ROOT, "public/harbour/emblems.png");
await run("magick", ["montage", ...kept.map(([, t]) => t), "-tile", `${COLS}x`, "-geometry", `${SLOT}x${SLOT}+0+0`, "-background", "none", "-depth", "8", `PNG32:${outPng}`]);
await run("magick", [outPng, "-quality", "90", "-define", "webp:alpha-quality=100", join(ROOT, "public/harbour/emblems.webp")]);
const map = Object.fromEntries(kept.map(([id], i) => [id, i]));
await writeFile(join(ROOT, "public/harbour/emblems.json"), JSON.stringify({ slot: SLOT, cols: COLS, width: WIDTH, height: rows * SLOT, ids: map }) + "\n");
await rm(tmp, { recursive: true, force: true });
console.log(`[emblems] ${kept.length} logos → ${COLS}×${rows} slots (${WIDTH}×${rows * SLOT})${failed.length ? `, ${failed.length} failed: ${failed.join(", ")}` : ""}`);
