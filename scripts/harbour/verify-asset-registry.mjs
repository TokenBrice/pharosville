#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, brotliDecompressSync } from "node:zlib";
import sharp from "sharp";
import { PropertyBinding } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { readAssetPack } from "../../src/harbour/engine/asset-pack.ts";
import { decodeSdfBytes } from "../../src/harbour/ocean/sdf-codec.ts";
import { retainAssets } from "./retain-assets.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url)), dist = resolve(process.argv[2] ?? "dist");
const registry = JSON.parse(await readFile(resolve(dist, "asset-registry.json"), "utf8"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const packs = new Map(), loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
for (const file of registry.files) {
  const stored = await readFile(resolve(dist, `.${file.url}`));
  assert.equal(hash(stored), file.sha256, file.url); assert.equal(stored.length, file.bytes);
  if (file.url.endsWith(".pack.br")) {
    const raw = brotliDecompressSync(stored), bytes = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length);
    packs.set(file.url, readAssetPack(bytes));
    assert.throws(() => readAssetPack(bytes.slice(0, -1)), /bounds|GLB|Unindexed/);
    const invalid = bytes.slice(0); new DataView(invalid).setUint32(4, 0xffffffff, true);
    assert.throws(() => readAssetPack(invalid), /directory/);
  }
}
assert.deepEqual([...packs.values()].map((p) => Object.keys(p.entries).length).sort((a, b) => a - b), [17, 49]);
assert.equal(Object.keys(registry.models).length, 89);
let parsed = 0;
for (const [original, transport] of Object.entries(registry.models)) {
  let bytes;
  if (transport.entry) {
    const pack = packs.get(transport.url), [offset, length] = pack.entries[transport.entry];
    bytes = Buffer.from(pack.bytes, offset, length);
  } else bytes = brotliDecompressSync(await readFile(resolve(dist, `.${transport.url}`)));
  assert.ok(bytes.equals(await readFile(resolve(root, "public" + original))), original);
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), "");
  const jsonLength = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const actualNames = new Set(); gltf.scene.traverse((node) => actualNames.add(node.name));
  for (const node of json.nodes ?? []) if (node.name) assert.ok(actualNames.has(PropertyBinding.sanitizeNodeName(node.name)), `${original}: ${node.name}`);
  parsed++;
}
const seaStored = await readFile(resolve(dist, `.${registry.urls["/harbour/sea-sdf.webp"]}`));
const seaRaw = brotliDecompressSync(seaStored), sea = decodeSdfBytes(seaRaw.buffer.slice(seaRaw.byteOffset, seaRaw.byteOffset + seaRaw.length));
const { data: rgba, info } = await sharp(resolve(root, "public/harbour/sea-sdf.webp")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const flipped = Buffer.alloc(rgba.length), coast = Buffer.alloc(info.width * info.height);
for (let y = 0; y < info.height; y++) rgba.copy(flipped, (info.height - 1 - y) * info.width * 4, y * info.width * 4, (y + 1) * info.width * 4);
for (let i = 0; i < coast.length; i++) coast[i] = flipped[i * 4];
assert.ok(Buffer.from(sea.data).equals(flipped)); assert.ok(Buffer.from(sea.coast).equals(coast));
assert.equal(sea.data.byteLength + sea.coast.byteLength, 20 * 1024 * 1024);
assert.throws(() => decodeSdfBytes(seaRaw.buffer.slice(seaRaw.byteOffset, seaRaw.byteOffset + 11)), /Truncated/);

// Two-release deploy, cold old-tab lazy request, bounded third release, and rollback republish.
const fixture = await mkdtemp(resolve(tmpdir(), "pv-retention-"));
const bodies = new Map(); let live;
const makeRelease = async (letter) => {
  const stored = brotliCompressSync(Buffer.from(`never-fetched lazy model ${letter}`)), digest = hash(stored);
  const file = { url: `/harbour/_immutable/${digest.slice(0, 24)}/lazy.glb.br`, sha256: digest, bytes: stored.length, encoding: "br", type: "model/gltf-binary" };
  bodies.set(file.url, stored);
  const value = { version: 1, release: letter.repeat(24), files: [file] }, dir = resolve(fixture, letter);
  await mkdir(dirname(resolve(dir, `.${file.url}`)), { recursive: true });
  await writeFile(resolve(dir, `.${file.url}`), stored); await writeFile(resolve(dir, "asset-registry.json"), JSON.stringify(value));
  return { dir, registry: value };
};
const server = createServer((req, res) => {
  if (req.url === "/asset-registry.json") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(live)); return; }
  const file = [...live.files, ...(live.previous?.files ?? [])].find((f) => f.url === req.url);
  if (!file) { res.statusCode = 404; res.end(); return; }
  res.setHeader("content-encoding", "br"); res.end(bodies.get(file.url));
});
try {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const a = await makeRelease("a"), b = await makeRelease("b"), c = await makeRelease("c");
  live = a.registry; await retainAssets(b.dir, origin);
  assert.ok((await readFile(resolve(b.dir, `.${a.registry.files[0].url}`))).equals(bodies.get(a.registry.files[0].url)));
  live = JSON.parse(await readFile(resolve(b.dir, "asset-registry.json"), "utf8"));
  // Fresh artifact of B redeployed over live B (A→B→B): A stays retained and A-only lazy assets stay served.
  const b2 = await makeRelease("b");
  await retainAssets(b2.dir, origin);
  const redeployed = JSON.parse(await readFile(resolve(b2.dir, "asset-registry.json"), "utf8"));
  assert.equal(redeployed.previous.release, a.registry.release); assert.equal(redeployed.previous.previous, undefined);
  assert.ok((await readFile(resolve(b2.dir, `.${a.registry.files[0].url}`))).equals(bodies.get(a.registry.files[0].url)));
  live = redeployed;
  await retainAssets(c.dir, origin);
  const third = JSON.parse(await readFile(resolve(c.dir, "asset-registry.json"), "utf8"));
  assert.equal(third.previous.release, b.registry.release); assert.equal(third.previous.previous, undefined);
  await assert.rejects(readFile(resolve(c.dir, `.${a.registry.files[0].url}`)), { code: "ENOENT" });
  // Roll A back over B by republishing A with B retained, not selecting immutable old deployment A.
  await retainAssets(a.dir, origin);
  assert.ok((await readFile(resolve(a.dir, `.${b.registry.files[0].url}`))).equals(bodies.get(b.registry.files[0].url)));
} finally { server.closeAllConnections(); await new Promise((done) => server.close(done)); await rm(fixture, { recursive: true, force: true }); }
console.log(`Verified ${registry.files.length} hashed objects, ${parsed} exact GLBs with shipped parser, 49/17 pack bounds, exact RGBA/coast, 32 MiB sea decode bound and two-release/rollback retention`);
