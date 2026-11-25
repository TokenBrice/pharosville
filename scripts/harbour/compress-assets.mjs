#!/usr/bin/env node
/**
 * Pre-compressed first-view assets (Cloudflare Pages serves model/gltf-binary uncompressed):
 *   public/harbour/ every .glb → <name>.glb.gz `zopfli --gzip` when it is on PATH (~2 % smaller), else `gzip -9 -n`
 *                                                (no name, no mtime: deterministic bytes); an existing .gz that already
 *                                                inflates to the .glb is kept, so a runner without zopfli keeps the
 *                                                committed zopfli files. The runtime fetches the .gz and inflates it
 *                                                (engine/assets.ts)
 *   assets/harbour/sea-sdf.png → public/harbour/sea-sdf.webp   lossless WebP, `-exact` (the RGBA channels are data, not colour);
 *                                                re-encoded when missing or with --webp, and always verified
 *                                                pixel-exact against the PNG when `sharp` is installed
 *   Vite's asset/preload plugin then runs build-asset-registry.mjs: intact 49/17 scoped GLB packs,
 *   exact NSD1 sea transport and content-addressed media/fonts/shell CSS, with native HTTP Brotli.
 *   The gzip siblings remain the unbuilt-development transport; no JS Brotli decoder is shipped.
 *
 * Usage: npm run harbour:compress [-- --webp]   (also runs before every `npm run build`; only --webp needs `cwebp`)
 */
import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";

const run = promisify(execFile);
const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const HARBOUR = join(ROOT, "public/harbour");
// the baked PNGs are the sources and are not deployed (assets/, not public/)
const DATA_WEBPS = [
  ["sea-sdf.png", "sea-sdf.webp"],
  ["terrain-splat.png", "terrain-splat.webp"],
  ["terrain-topo.png", "terrain-topo.webp"],
].map(([png, webp]) => ({ name: webp, png: join(ROOT, "assets/harbour", png), webp: join(HARBOUR, webp) }));

async function* glbs(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* glbs(p);
    else if (e.name.endsWith(".glb")) yield p;
  }
}

let zopfli = true;
try { execFileSync("zopfli", ["-h"], { stdio: "ignore" }); } catch { zopfli = false; }
let wrote = 0, kept = 0;
for await (const glb of glbs(HARBOUR)) {
  const out = `${glb}.gz`;
  if (existsSync(out)) {
    let same = false;
    try { same = gunzipSync(await readFile(out)).equals(await readFile(glb)); } catch { /* not a valid gzip: rewrite it */ }
    if (same) { kept++; continue; }
  }
  const [cmd, args] = zopfli ? ["zopfli", ["--gzip", "-c", glb]] : ["gzip", ["-9", "-n", "-c", glb]];
  const { stdout } = await run(cmd, args, { encoding: "buffer", maxBuffer: 1 << 30 });
  await writeFile(out, stdout);
  wrote++;
  console.log(`gz  ${relative(ROOT, out)}  ${(stdout.length / 1024).toFixed(0)} KB`);
}
console.log(`glb.gz: ${wrote} written (${zopfli ? "zopfli" : "gzip -9"}), ${kept} up to date`);

let sharp = null;
try { sharp = (await import("sharp")).default; } catch { /* optional: verification only */ }
for (const entry of DATA_WEBPS) {
  if (!existsSync(entry.png)) continue;
  if (process.argv.includes("--webp") || !existsSync(entry.webp)) {
    await run("cwebp", ["-quiet", "-lossless", "-exact", "-z", "9", "-metadata", "none", entry.png, "-o", entry.webp]);
    console.log(`webp ${relative(ROOT, entry.webp)}`);
  }
  if (sharp) {
    const [a, b] = await Promise.all([entry.png, entry.webp].map((p) => sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
    if (a.info.width !== b.info.width || a.info.height !== b.info.height || Buffer.compare(a.data, b.data) !== 0) {
      console.error(`${entry.name} does not decode to ${relative(ROOT, entry.png)}'s exact RGBA: run \`npm run harbour:compress -- --webp\``);
      process.exit(1);
    }
    console.log(`${entry.name}: pixel-exact against ${relative(ROOT, entry.png)}`);
  } else console.warn(`${entry.name}: not verified (sharp unavailable)`);
}
