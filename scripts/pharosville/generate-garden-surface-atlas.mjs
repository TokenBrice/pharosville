#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const GARDEN_SURFACE_ATLAS_SEED = 20261005;
const CELL = 128, CELLS = 8, GUTTER = 2, TAU = Math.PI * 2;
const meanAlbedo = 0.72;
const srgb = (linear) => linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
const byte = (value) => Math.round(Math.max(0, Math.min(1, value)) * 255);

// Integer Fourier frequencies keep every role periodic. Optional authored
// phase turns break coherent stripes without introducing a shared noise pack.
// Near-ground fibres and aggregate carry most energy below four cycles, so
// their structure survives 8–16 texel role cells; unresolved fine terms vanish.
const terms = [
  [[2, 0, .32, .13], [3, 1, .24, .57], [3, -1, .18, .31],
    [1, 2, .12, .79], [7, 1, .09, .43], [11, 2, .05, .03]], // elongated moss tufts
  [[1, 2, .4], [4, 1, .35], [7, 3, .25]], // bedded mineral
  [[1, 0, .25, .17], [0, 1, .25, .61], [1, 1, .14, .38], [1, -1, .14, .89],
    [2, 1, .055, .05], [1, -2, .055, .73], [5, 4, .04, .28], [4, -5, .04, .47],
    [9, 7, .015, .81], [7, -9, .015, .12]], // isotropic coarse aggregate + fine grains
  [[2, 3, .55], [5, -2, .3], [8, 7, .15]],
  [[1, 5, .55], [1, 11, .3], [2, 17, .15]], // grain along metric U
  [[2, 2, .6], [5, -4, .4]],
  [[1, 4, .6], [0, 8, .25], [3, 1, .15]],
  [], // neutral reserve cell
];
const amplitudes = [.24, .05, .22, .04, .045, .018, .035, 0];
function field(role, u, v, resolution, seed) {
  let value = 0, du = 0, dv = 0;
  for (const [x, y, weight, phaseTurns = 0] of terms[role]) {
    const frequency = Math.hypot(x, y);
    const filter = Math.max(0, Math.min(1, (resolution / 2 - frequency) / Math.max(1, frequency)));
    const phase = (((seed + role * 7919 + x * 313 + y * 97) >>> 0) / 4294967296 + phaseTurns) * TAU;
    const angle = TAU * (x * u + y * v) + phase;
    const w = weight * filter;
    // Stone uses shallow triangular mineral beds, not soft clay-like waves.
    const wave = role === 1 ? Math.asin(Math.sin(angle)) * (2 / Math.PI) : Math.sin(angle);
    const slope = role === 1 ? Math.sign(Math.cos(angle)) * (2 / Math.PI) : Math.cos(angle);
    value += wave * w;
    du += slope * w * x;
    dv += slope * w * y;
  }
  return [value, du, dv];
}
function coordinate(index, cell) {
  return ((index + .5) / cell - GUTTER / CELL) / (1 - 2 * GUTTER / CELL);
}
function groundFieldMeans(cell, seed) {
  const means = new Float64Array(CELLS);
  if (cell < 1) return means;
  // Stronger ground structure must not change its linear mean at any mip.
  // Subtract only the sampled field's constant component; slopes stay authored.
  for (const role of [0, 2]) {
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++)
      means[role] += field(role, coordinate(x, cell), coordinate(y, cell),
        Math.max(1, cell * (1 - 2 * GUTTER / CELL)), seed)[0];
    means[role] /= cell * cell;
  }
  return means;
}

/** Independently authored RGBA8 mip levels; never downsample adjacent roles. */
export function generateGardenSurfaceAtlas({ seed = GARDEN_SURFACE_ATLAS_SEED } = {}) {
  if (!Number.isSafeInteger(seed)) throw new Error("Surface atlas seed must be an integer.");
  const maps = ["albedo", "normal", "orm"].map((name) => ({ name,
    colorSpace: name === "albedo" ? "srgb" : "linear", cell: CELL, cells: CELLS, levels: [] }));
  for (let size = CELL * CELLS; size >= 1; size >>= 1) {
    const data = maps.map(() => new Uint8Array(size * size * 4));
    const cell = size / CELLS;
    const fieldMeans = groundFieldMeans(cell, seed);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      // Seven role cells plus a reserve occupy the first row. Unused atlas
      // space is neutral, not duplicate noise or extra material variants.
      const role = size >= CELLS && y < cell ? Math.floor(x / cell) : 7;
      // Fixed normalized inset at every level: gutters remain periodic even
      // when their width becomes fractional. Sampling fades before that limit.
      const u = coordinate(x % cell, cell), v = coordinate(y % cell, cell);
      // Match the fractional gutter used by coordinates at this actual level.
      // A fixed four-texel subtraction would erase resolvable coarse detail.
      const [raw, du, dv] = field(role, u, v, Math.max(1, cell * (1 - 2 * GUTTER / CELL)), seed);
      const f = raw - fieldMeans[role];
      const i = (y * size + x) * 4;
      const albedo = byte(srgb(meanAlbedo + amplitudes[role] * f));
      data[0].set([albedo, albedo, albedo, 255], i);
      const relief = role === 0 ? .006 : role === 5 ? .003 : .008;
      const nx = -du * relief, ny = -dv * relief;
      const length = Math.hypot(nx, ny, 1);
      data[1].set([byte(nx / length * .5 + .5), byte(ny / length * .5 + .5), byte(1 / length * .5 + .5), 255], i);
      data[2].set([255, byte(.5 + f * .15), 0, 255], i);
    }
    maps.forEach((map, i) => map.levels.push({ width: size, height: size, data: data[i] }));
  }
  return { maps };
}

// Publishing goes through the compiler's descriptor/encoder hook; this command
// updates only the atlas registration, never regenerates unrelated model GLBs.
async function publish() {
  // Keep generation importable by the compiler while its CLI is awaiting this
  // module: only direct publishing imports the compiler hooks, avoiding a TLA cycle.
  const { describeAtlasEntry, encodeAtlasStrip } = await import("./compile-garden-assets.mjs");
  const generator = "scripts/pharosville/generate-garden-surface-atlas.mjs";
  const seed = GARDEN_SURFACE_ATLAS_SEED;
  const first = generateGardenSurfaceAtlas({ seed }), second = generateGardenSurfaceAtlas({ seed });
  const entry = describeAtlasEntry({ generator, seed, gutter: GUTTER, maps: first.maps });
  const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
  for (const description of entry.maps) {
    const bytes = encodeAtlasStrip(first.maps.find((map) => map.name === description.name), { gutter: GUTTER });
    const repeated = encodeAtlasStrip(second.maps.find((map) => map.name === description.name), { gutter: GUTTER });
    if (!bytes.equals(repeated)) throw new Error("Surface atlas is nondeterministic.");
    await writeFile(resolve(root, description.output), bytes);
    Object.assign(description, { sha256: sha256(bytes), bytes: bytes.length });
  }
  const sources = await Promise.all([generator, "scripts/pharosville/compile-garden-assets.mjs"].sort().map(async (path) =>
    ({ path, sha256: sha256(await readFile(resolve(root, path))) })));
  Object.assign(entry, { author: "TokenBrice / agent-authored", license: "MIT", sources });
  const manifestPath = resolve(root, "assets/pharosville/garden-assets.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.compiler = sources.find((source) => source.path === "scripts/pharosville/compile-garden-assets.mjs");
  manifest.assets = [...manifest.assets.filter((asset) => asset.id !== entry.id), entry].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(entry, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error("Surface atlas generator takes no CLI options.");
  await publish();
}
