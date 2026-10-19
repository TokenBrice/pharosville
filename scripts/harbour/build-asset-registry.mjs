#!/usr/bin/env node
/** One lossless registry for build-time URLs, manifests, preload hints and runtime transport. */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";
import sharp from "sharp";
import { readAssetPack } from "../../src/harbour/engine/asset-pack.ts";
import { decodeSdfBytes } from "../../src/harbour/ocean/sdf-codec.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const br = (bytes) => brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
async function walk(dir) {
  return (await Promise.all((await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => e.isDirectory() ? walk(resolve(dir, e.name)) : [resolve(dir, e.name)]))).flat();
}

export async function buildAssetRegistry(output) {
  const registry = { version: 1, release: "", urls: {}, models: {}, preloads: [], files: [] };
  const emit = async (name, bytes, encoding = null, type = null) => {
    const digest = sha(bytes), url = `/harbour/_immutable/${digest.slice(0, 24)}/${name}`;
    const path = resolve(output, `.${url}`);
    await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes);
    if (!registry.files.some((f) => f.url === url)) registry.files.push({ url, sha256: digest, bytes: bytes.length, encoding, type });
    return url;
  };
  const emitBr = async (name, bytes, type) => {
    const encoded = br(bytes);
    if (!brotliDecompressSync(encoded).equals(bytes)) throw new Error(`Brotli roundtrip failed: ${name}`);
    return emit(name + ".br", encoded, "br", type);
  };
  const kit = JSON.parse(await readFile(resolve(root, "public/harbour/kit/manifest.json"), "utf8"));
  const civic = JSON.parse(await readFile(resolve(root, "public/harbour/civic/manifest.json"), "utf8"));
  const layout = JSON.parse(await readFile(resolve(root, "src/harbour/data/layout.json"), "utf8"));
  const kitFiles = [...kit.hulls.flatMap((h) => [h.file, h.lod].filter(Boolean)), ...kit.props.map((p) => p.file)]
    .map((file) => `/harbour/kit/${file}`);
  const civicFiles = [...new Set(layout.civic.map((p) => `/harbour/civic/${civic.kinds[p.kind].file}`))];
  if (kitFiles.length !== 49 || new Set(kitFiles).size !== 49 || civicFiles.length !== 17) throw new Error("Unexpected eager pack membership");
  for (const [name, files] of [["kit.pack", kitFiles], ["civic.pack", civicFiles]]) {
    const parts = [], rows = []; let offset = 0;
    for (const url of files) {
      const bytes = await readFile(resolve(root, "public" + url));
      rows.push([url, offset, bytes.length]); parts.push(bytes); offset += bytes.length;
    }
    const directory = Buffer.from(JSON.stringify(rows)), header = Buffer.alloc(8);
    header.write("NFP1"); header.writeUInt32LE(directory.length, 4);
    const bytes = Buffer.concat([header, directory, ...parts]);
    const parsed = readAssetPack(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    for (let i = 0; i < files.length; i++) {
      const [start, length] = parsed.entries[files[i]];
      if (!Buffer.from(parsed.bytes, start, length).equals(parts[i])) throw new Error(`Pack roundtrip failed: ${files[i]}`);
    }
    const url = await emitBr(name, bytes, "application/octet-stream");
    for (const file of files) registry.models[file] = { url, entry: file };
  }
  const publicFiles = [...await walk(resolve(root, "public/harbour")), ...await walk(resolve(root, "public/fonts"))];
  // Do not deploy authoring GLBs, gzip siblings or the superseded image in the immutable set.
  for (const file of publicFiles) {
    const original = "/" + relative(resolve(root, "public"), file).split("\\").join("/");
    if (original.endsWith(".gz") || original.endsWith(".json") || original.endsWith("/sea-sdf.webp")) continue;
    if (original.endsWith(".glb")) {
      if (!registry.models[original]) registry.models[original] = { url: await emitBr(original.slice(1), await readFile(file), "model/gltf-binary") };
    } else registry.urls[original] = await emit(original.slice(1), await readFile(file));
  }
  const { data: rgba, info } = await sharp(resolve(root, "assets/harbour/sea-sdf.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const webp = await sharp(resolve(root, "public/harbour/sea-sdf.webp")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== webp.info.width || info.height !== webp.info.height || !rgba.equals(webp.data)) throw new Error("Sea source/WebP differ");
  const count = info.width * info.height, sea = Buffer.alloc(12 + count * 3);
  sea.write("NSD1"); sea.writeUInt32LE(info.width, 4); sea.writeUInt32LE(info.height, 8);
  for (let channel = 0; channel < 3; channel++) for (let y = 0; y < info.height; y++) {
    let previous = 0;
    for (let x = 0; x < info.width; x++) {
      const i = y * info.width + x, value = rgba[i * 4 + channel];
      if (rgba[i * 4 + 3] !== 255) throw new Error("Sea alpha must be opaque");
      sea[12 + channel * count + i] = (value - previous) & 255; previous = value;
    }
  }
  const decoded = decodeSdfBytes(sea.buffer.slice(sea.byteOffset, sea.byteOffset + sea.byteLength));
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const a = (y * info.width + x) * 4, b = ((info.height - 1 - y) * info.width + x) * 4;
    for (let c = 0; c < 4; c++) if (decoded.data[b + c] !== rgba[a + c]) throw new Error("Sea RGBA roundtrip failed");
    if (decoded.coast[b / 4] !== rgba[a]) throw new Error("Sea coast roundtrip failed");
  }
  registry.urls["/harbour/sea-sdf.webp"] = await emitBr("sea-sdf.bin", sea, "application/octet-stream");
  // Rewrite references before hashing JSON. Original file/node fields remain the authoring/parser contract;
  // transport names the same hashed objects selected by AssetStore, including packed LODs.
  for (const [manifest, base] of [[kit, "/harbour/kit/"], [civic, "/harbour/civic/"]]) {
    for (const spec of [...(manifest.hulls ?? []), ...(manifest.lods ?? []), ...(manifest.props ?? []), ...Object.values(manifest.kinds ?? {}), ...Object.values(manifest.wreck_kit?.items ?? {})]) {
      if (spec.file && registry.models[base + spec.file]) spec.transport = registry.models[base + spec.file];
      if (spec.lod) spec.lodTransport = registry.models[base + spec.lod];
    }
    registry.urls[base + "manifest.json"] = await emit((base + "manifest.json").slice(1), Buffer.from(JSON.stringify(manifest)));
  }
  for (const file of publicFiles.filter((file) => file.endsWith(".json") && !file.endsWith("/manifest.json"))) {
    const original = "/" + relative(resolve(root, "public"), file).split("\\").join("/");
    let text = await readFile(file, "utf8");
    for (const [from, to] of Object.entries(registry.urls)) text = text.replaceAll(JSON.stringify(from), JSON.stringify(to));
    registry.urls[original] = await emit(original.slice(1), Buffer.from(text));
  }
  let css = await readFile(resolve(root, "public/arrival-shell.css"), "utf8");
  for (const [from, to] of Object.entries(registry.urls)) css = css.replaceAll(from, to);
  registry.urls["/arrival-shell.css"] = await emit("arrival-shell.css", Buffer.from(css));
  registry.preloads = [layout.sea.sdf, "/harbour/island.glb", "/harbour/lighthouse.glb",
    "/harbour/civic/manifest.json", "/harbour/kit/manifest.json"].map((original) => ({
    url: registry.models[original]?.url ?? registry.urls[original],
    ...(original === "/harbour/island.glb" ? { fetchpriority: "low" } : {}),
  }));
  if (registry.preloads.some((entry) => !entry.url)) throw new Error("Missing first-frame registry transport");
  registry.release = sha(Buffer.from(JSON.stringify({ urls: registry.urls, models: registry.models }))).slice(0, 24);
  await writeFile(resolve(output, "asset-registry.json"), JSON.stringify(registry));
  return registry;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[process.argv.indexOf("--output") + 1];
  if (!process.argv.includes("--output") || !output) throw new Error("Usage: node scripts/harbour/build-asset-registry.mjs --output DIR");
  await mkdir(resolve(output), { recursive: true });
  const registry = await buildAssetRegistry(resolve(output));
  console.log(`asset registry ${registry.release}: ${registry.files.length} objects; exact 49/17 packs and sea RGBA/coast verified`);
}
