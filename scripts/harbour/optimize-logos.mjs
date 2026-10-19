#!/usr/bin/env node
/** Regenerate exact, smaller runtime WebPs; never resize or modify build sources. */
import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { losslessLogo } from "./sync-logos.mjs";

const root = resolve(import.meta.dirname, "../..");
const previous = JSON.parse(await readFile(join(root, "public/logos/lossless.json"), "utf8").catch(() => "{}"));
const map = {};
let checked = 0, converted = 0, sourceBytes = 0, runtimeBytes = 0;
for (const directory of ["logos", "chains"]) {
  const folder = join(root, "public", directory);
  const files = (await readdir(folder)).filter((name) => /\.(?:png|jpe?g|webp)$/i.test(name) && !name.endsWith(".lossless.webp")).sort();
  for (const file of files) {
    const path = `/${directory}/${file}`;
    const bytes = await readFile(join(folder, file));
    const alternate = await losslessLogo(path, bytes);
    checked++;
    sourceBytes += bytes.length;
    runtimeBytes += alternate?.bytes.length ?? bytes.length;
    if (alternate) {
      await writeFile(join(root, "public", alternate.path), alternate.bytes);
      map[path] = alternate.path;
      converted++;
    }
    console.log(JSON.stringify({ path, sourceBytes: bytes.length, runtimeBytes: alternate?.bytes.length ?? bytes.length, result: alternate ? "exact-rgba-webp" : "keep-original" }));
  }
}
const kept = new Set(Object.values(map));
for (const path of Object.values(previous)) {
  if (/^\/(?:logos|chains)\/[^/]+\.lossless\.webp$/.test(path) && !kept.has(path)) await unlink(join(root, "public", path)).catch((error) => { if (error.code !== "ENOENT") throw error; });
}
await writeFile(join(root, "public/logos/lossless.json"), `${JSON.stringify(map, null, 2)}\n`);
console.log(JSON.stringify({ checked, converted, sourceBytes, runtimeBytes, savedBytes: sourceBytes - runtimeBytes }));
