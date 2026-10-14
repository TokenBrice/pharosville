#!/usr/bin/env node
/**
 * Pre-compressed first-view assets (Cloudflare Pages serves model/gltf-binary uncompressed):
 *   public/harbour/ every .glb → <name>.glb.gz `gzip -9 -n` (no name, no mtime: deterministic bytes);
 *                                                the runtime fetches the .gz and inflates it (engine/assets.ts)
 *   assets/harbour/sea-sdf.png → public/harbour/sea-sdf.webp   lossless WebP, `-exact` (the RGBA channels are data, not colour);
 *                                                re-encoded when missing or with --webp, and always verified
 *                                                pixel-exact against the PNG when `sharp` is installed
 *
 * Usage: npm run harbour:compress [-- --webp]   (also runs before every `npm run build`; only --webp needs `cwebp`)
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const HARBOUR = join(ROOT, "public/harbour");
// the baked PNG is the source and is not deployed (assets/, not public/)
const SDF_PNG = join(ROOT, "assets/harbour/sea-sdf.png"), SDF_WEBP = join(HARBOUR, "sea-sdf.webp");

async function* glbs(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* glbs(p);
    else if (e.name.endsWith(".glb")) yield p;
  }
}

let wrote = 0, kept = 0;
for await (const glb of glbs(HARBOUR)) {
  const { stdout } = await run("gzip", ["-9", "-n", "-c", glb], { encoding: "buffer", maxBuffer: 1 << 30 });
  const out = `${glb}.gz`;
  if (existsSync(out) && Buffer.compare(await readFile(out), stdout) === 0) { kept++; continue; }
  await writeFile(out, stdout);
  wrote++;
  console.log(`gz  ${relative(ROOT, out)}  ${(stdout.length / 1024).toFixed(0)} KB`);
}
console.log(`glb.gz: ${wrote} written, ${kept} up to date`);

if (process.argv.includes("--webp") || !existsSync(SDF_WEBP)) {
  await run("cwebp", ["-quiet", "-lossless", "-exact", "-z", "9", "-metadata", "none", SDF_PNG, "-o", SDF_WEBP]);
  console.log(`webp ${relative(ROOT, SDF_WEBP)}`);
}
let sharp = null;
try { sharp = (await import("sharp")).default; } catch { /* optional: verification only */ }
if (sharp) {
  const [a, b] = await Promise.all([SDF_PNG, SDF_WEBP].map((p) => sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
  if (a.info.width !== b.info.width || a.info.height !== b.info.height || Buffer.compare(a.data, b.data) !== 0) {
    console.error("sea-sdf.webp does not decode to assets/harbour/sea-sdf.png's exact RGBA: run `npm run harbour:compress -- --webp`");
    process.exit(1);
  }
  console.log("sea-sdf.webp: pixel-exact against sea-sdf.png");
} else console.warn("sea-sdf.webp: not verified (sharp unavailable)");
