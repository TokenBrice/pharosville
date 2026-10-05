import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateSync, inflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { generateGardenSurfaceAtlas, GARDEN_SURFACE_ATLAS_SEED } from "./generate-garden-surface-atlas.mjs";
import { findGardenSurfaceStripProblems } from "./validate-runtime-media.mjs";
import {
  censusGardenGlb, decodeGardenGlb, describeAtlasEntry, encodeAtlasStrip,
  validateAtlasStrip, validateGlb, validatePublishedAtlasStrip,
} from "./compile-garden-assets.mjs";
import {
  buildGlb, compressGlbWithMeshopt, measureMeshoptDeviation, splitGlb,
} from "./glb-meshopt.mjs";

function fixture({ image = false } = {}) {
  const positions = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  const indices = Buffer.from(new Uint16Array([0, 1, 2]).buffer);
  const json = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0, 1, 2] }],
    nodes: [{ name: "garden-fixture", mesh: 0 }, { mesh: 0, translation: [2, 0, 0] },
      { name: "fixture-anchor", translation: [0, 2, 0], extras: { role: "label" } }],
    meshes: [{ primitives: [
      { attributes: { POSITION: 0 }, indices: 1, material: 0 },
      { attributes: { POSITION: 0 }, indices: 1, material: 1 },
    ] }],
    materials: [{ name: "stone" }, { name: "wood" }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36, byteStride: 12, target: 34962 },
      { buffer: 0, byteOffset: 36, byteLength: 6, target: 34963 }],
    buffers: [{ byteLength: 44 }],
  };
  const blocks = [positions, indices, Buffer.alloc(2)];
  if (image) {
    const png = encodeAtlasStrip(atlasMap("albedo"));
    json.bufferViews.push({ buffer: 0, byteOffset: 44, byteLength: png.length });
    json.images = [{ bufferView: 2, mimeType: "image/png" }];
    blocks.push(png);
    json.buffers[0].byteLength += png.length;
  }
  return buildGlb(json, Buffer.concat(blocks));
}
function atlasMap(name) {
  return { name, colorSpace: name === "albedo" ? "srgb" : "linear", cell: 8, cells: 1,
    levels: [{ width: 4, height: 4, data: new Uint8Array(64).fill(100) },
      { width: 2, height: 2, data: new Uint8Array(16).fill(200) },
      { width: 1, height: 1, data: new Uint8Array(4).fill(250) }] };
}

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const header = Buffer.alloc(4); header.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, body, checksum]);
}

// Independently re-encode the compiler's Up-filtered fixture, including CRCs.
function reencodeStrip(bytes, { filter = 2, editHeader, editPixels, metadata = [] } = {}) {
  const header = Buffer.from(bytes.subarray(16, 29));
  const width = header.readUInt32BE(0), height = header.readUInt32BE(4);
  const length = bytes.readUInt32BE(33);
  const pixels = inflateSync(bytes.subarray(41, 41 + length));
  const stride = width * 4 + 1;
  for (let y = 1; y < height; y++) {
    for (let x = 1; x < stride; x++) {
      pixels[y * stride + x] = (pixels[y * stride + x] + pixels[(y - 1) * stride + x]) & 255;
    }
  }
  editPixels?.(pixels, stride);
  const filtered = Buffer.alloc(pixels.length);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    filtered[row] = filter;
    for (let x = 1; x < stride; x++) {
      const left = x > 4 ? pixels[row + x - 4] : 0;
      const up = y > 0 ? pixels[row + x - stride] : 0;
      const upperLeft = y > 0 && x > 4 ? pixels[row + x - stride - 4] : 0;
      const p = left + up - upperLeft;
      const distances = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upperLeft)];
      const paeth = [left, up, upperLeft][distances.indexOf(Math.min(...distances))];
      const predictor = [0, left, up, Math.floor((left + up) / 2), paeth][filter];
      filtered[row + x] = (pixels[row + x] - predictor) & 255;
    }
  }
  editHeader?.(header);
  const compressed = deflateSync(filtered, { level: 1 });
  const split = Math.floor(compressed.length / 2);
  return Buffer.concat([bytes.subarray(0, 8), pngChunk("IHDR", header),
    ...metadata.map(([type, data]) => pngChunk(type, data)),
    pngChunk("IDAT", compressed.subarray(0, split)), pngChunk("IDAT", compressed.subarray(split)),
    pngChunk("IEND", Buffer.alloc(0))]);
}

test("decoded census counts scene primitives, triangles and vertices rather than mesh definitions", async () => {
  const source = fixture();
  const compressed = await compressGlbWithMeshopt(source);
  assert.deepEqual(compressed, await compressGlbWithMeshopt(source));
  assert.equal(await measureMeshoptDeviation(source, compressed), 0);
  const census = await censusGardenGlb(compressed);
  assert.equal(splitGlb(compressed).json.meshes.length, 1);
  assert.equal(census.primitives, 4);
  assert.equal(census.triangles, 4);
  assert.equal(census.vertices, 12);
  assert.equal(census.materials, 2);
  assert.equal(census.maps, 0);
  assert.deepEqual(census.bounds, { min: [0, 0, 0], max: [3, 1, 0] });
  assert.deepEqual(census.anchors["fixture-anchor"], { role: "label", position: [0, 2, 0] });
  assert.deepEqual(census.extensions, ["EXT_meshopt_compression"]);
  assert.equal(census.bytes, compressed.length);
});

test("decoded POSITION extrema are reconstructed within the existing compression tolerance", async () => {
  const { json, bin } = splitGlb(fixture());
  bin.writeFloatLE(1.00001234, 12);
  json.accessors[0].max[0] = bin.readFloatLE(12);
  const source = buildGlb(json, bin);
  assert.equal((await validateGlb(source)).errors, 0);
  const compressed = await compressGlbWithMeshopt(source);
  const decodedBytes = await decodeGardenGlb(compressed);
  const decoded = splitGlb(decodedBytes);
  const accessor = decoded.json.accessors[0];
  const view = decoded.json.bufferViews[accessor.bufferView];
  const actual = decoded.bin.readFloatLE(view.byteOffset + 12);
  assert.equal(accessor.max[0], actual);
  assert.ok(Math.abs(actual - json.accessors[0].max[0]) <= 2.5e-4);
  assert.equal((await validateGlb(decodedBytes)).errors, 0);
  assert.deepEqual(splitGlb(compressed).json.accessors[0].max, json.accessors[0].max);
  const invalid = splitGlb(compressed);
  invalid.json.accessors[0].max[0] -= 0.1;
  await assert.rejects(decodeGardenGlb(buildGlb(invalid.json, invalid.bin)), /deviation limit/);
});

test("compression preserves and rebases embedded image views without vertex compression", async () => {
  const raw = fixture({ image: true });
  const compressed = await compressGlbWithMeshopt(raw);
  assert.equal(await measureMeshoptDeviation(raw, compressed), 0);
  const before = splitGlb(raw);
  const after = splitGlb(compressed);
  const view = after.json.bufferViews[2];
  assert.equal(view.buffer, 0);
  assert.equal(view.extensions, undefined);
  assert.deepEqual(after.bin.subarray(view.byteOffset, view.byteOffset + view.byteLength),
    before.bin.subarray(44, 44 + view.byteLength));
  const decoded = splitGlb(await decodeGardenGlb(compressed));
  assert.equal(decoded.json.buffers.length, 1);
  assert.equal(decoded.json.extensionsRequired, undefined);
  assert.deepEqual(decoded.json.images, before.json.images);
});

test("Khronos validation rejects malformed geometry instead of suppressing errors", async () => {
  const raw = fixture();
  assert.equal((await validateGlb(raw)).errors, 0);
  const { json, bin } = splitGlb(raw);
  json.accessors[0].count = 999;
  await assert.rejects(validateGlb(buildGlb(json, bin)), /validation failed/);
});

test("atlas registration records tagged maps, contiguous mip dimensions and local outputs", () => {
  const entry = describeAtlasEntry({ generator: "scripts/pharosville/generate-garden-surface-atlas.mjs",
    seed: 17, gutter: 2, maps: [atlasMap("albedo"), atlasMap("normal"), atlasMap("orm")] });
  assert.equal(entry.kind, "atlas");
  assert.equal(entry.seed, 17);
  assert.deepEqual(entry.maps[0].levels, [{ width: 4, height: 4 }, { width: 2, height: 2 }, { width: 1, height: 1 }]);
  assert.equal(entry.maps[0].output, "public/pharosville/textures/garden-surface-albedo.png");
  assert.equal(entry.maps[0].width, 7);
  assert.equal(entry.maps[0].height, 4);
  assert.throws(() => validateAtlasStrip({ ...atlasMap("normal"), colorSpace: "srgb" }), /linear/);
  assert.throws(() => validateAtlasStrip(atlasMap("normal"), { gutter: 4 }), /gutter/);
  assert.throws(() => validateAtlasStrip(atlasMap("orm"), { levelCount: 4 }), /count/);
  assert.throws(() => validateAtlasStrip({ ...atlasMap("orm"), cell: 7 }), /powers/);
  const skipped = atlasMap("orm"); skipped.levels[1].width = 1;
  assert.throws(() => validateAtlasStrip(skipped), /halve/);
  const bad = atlasMap("orm"); bad.levels[0].width = 3;
  assert.throws(() => validateAtlasStrip(bad), /power-of-two/);
});

test("tiny synthetic mip strip encodes deterministic RGBA PNG with left-to-right levels", () => {
  const map = atlasMap("albedo");
  const bytes = encodeAtlasStrip(map);
  assert.deepEqual(bytes, encodeAtlasStrip(map));
  assert.equal(bytes.readUInt32BE(16), 7);
  assert.equal(bytes.readUInt32BE(20), 4);
  const length = bytes.readUInt32BE(33);
  assert.equal(bytes.toString("ascii", 37, 41), "IDAT");
  const pixels = inflateSync(bytes.subarray(41, 41 + length));
  assert.equal(pixels[0], 0);
  assert.equal(pixels[1], 100);
  assert.equal(pixels[17], 200);
  assert.equal(pixels[25], 250);
  assert.equal(pixels[29], 2); // compiler's lossless PNG Up filter
  assert.equal(pixels[3 * 29 + 17], 0); // unused rows stay transparent
});

test("published atlas checks decoded pixels across all maps, filters and authored mip levels", () => {
  for (const name of ["albedo", "normal", "orm"]) {
    const map = atlasMap(name);
    const bytes = encodeAtlasStrip(map);
    for (const filter of [0, 1, 2, 3, 4]) {
      const reencoded = reencodeStrip(bytes, { filter });
      assert.notDeepEqual(reencoded, bytes);
      assert.notEqual(reencoded[42], bytes[42]); // zlib header records level 1 rather than level 9
      assert.doesNotThrow(() => validatePublishedAtlasStrip(reencoded, map));
    }
    for (let mip = 0; mip < map.levels.length; mip++) {
      const changed = atlasMap(name);
      changed.levels[mip].data[0] ^= 1;
      const wrongPixel = reencodeStrip(encodeAtlasStrip(changed));
      assert.throws(() => validatePublishedAtlasStrip(wrongPixel, map),
        new RegExp(`mip ${mip} pixels differ`));
    }
    const wrongPadding = reencodeStrip(bytes, { editPixels: (pixels, stride) => { pixels[stride + 25] = 1; } });
    assert.throws(() => validatePublishedAtlasStrip(wrongPadding, map), /mip 2 pixels differ/);
    assert.throws(() => validatePublishedAtlasStrip(reencodeStrip(bytes, {
      editHeader: (header) => header.writeUInt32BE(8, 0),
    }), map), /dimensions differ/);
    assert.throws(() => validatePublishedAtlasStrip(reencodeStrip(bytes, {
      editHeader: (header) => { header[9] = 2; },
    }), map), /RGBA8 channels/);
    const gamma = Buffer.alloc(4);
    gamma.writeUInt32BE(name === "albedo" ? 100000 : 45455);
    assert.throws(() => validatePublishedAtlasStrip(reencodeStrip(bytes, {
      metadata: [["gAMA", gamma]],
    }), map), /colour space differs/);
    if (name !== "albedo") {
      assert.throws(() => validatePublishedAtlasStrip(reencodeStrip(bytes, {
        metadata: [["sRGB", Buffer.from([0])]],
      }), map), /colour space differs/);
    }
    const corrupt = Buffer.from(bytes); corrupt[45] ^= 1;
    assert.throws(() => validatePublishedAtlasStrip(corrupt, map), /CRC mismatch/);
    assert.throws(() => validatePublishedAtlasStrip(bytes.subarray(0, -12), map), /no PNG end/);
  }
});

test("checked garden atlas is deterministic, independently periodic and within the RGBA8 residency ceiling", async () => {
  const options = { seed: GARDEN_SURFACE_ATLAS_SEED };
  const first = generateGardenSurfaceAtlas(options), second = generateGardenSurfaceAtlas(options);
  const descriptor = describeAtlasEntry({ generator: "scripts/pharosville/generate-garden-surface-atlas.mjs",
    ...options, gutter: 2, maps: first.maps });
  let residentBytes = 0;
  for (const [i, map] of first.maps.entries()) {
    assert.equal(map.cell, 128); assert.equal(map.cells, 8); assert.equal(map.levels.length, 11);
    const bytes = encodeAtlasStrip(map);
    assert.deepEqual(bytes, encodeAtlasStrip(second.maps[i]));
    const published = await readFile(new URL(`../../${descriptor.maps[i].output}`, import.meta.url));
    assert.doesNotThrow(() => validatePublishedAtlasStrip(published, map));
    const description = { ...descriptor.maps[i], bytes: published.length,
      sha256: createHash("sha256").update(published).digest("hex") };
    assert.deepEqual(findGardenSurfaceStripProblems(published, description), []);
    assert.match(findGardenSurfaceStripProblems(published, { ...description, colorSpace: "wrong" })[0], /descriptor/);
    assert.match(findGardenSurfaceStripProblems(published, { ...description, sha256: "wrong" })[0], /SHA/);
    const corrupt = Buffer.from(published); corrupt[45] ^= 1;
    assert.match(findGardenSurfaceStripProblems(corrupt, description)[0], /CRC/);
    for (const level of map.levels) residentBytes += level.data.byteLength;
    // Lowest mips are authored averages, not blended adjacent-role imagery.
    assert.deepEqual([...map.levels.at(-1).data], map.name === "albedo" ? [221, 221, 221, 255]
      : map.name === "normal" ? [128, 128, 255, 255] : [255, 128, 0, 255]);
  }
  // Both near-seat mip footprints retain visible grayscale structure without
  // changing pigment/linear mean. Distance quieting remains the runtime fade.
  for (const mip of [3, 4]) {
    const patterns = [];
    for (const role of [0, 2]) {
      const level = first.maps[0].levels[mip], cell = 128 >> mip;
      let minimum = 255, maximum = 0;
      const linear = [];
      for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
        const i = (y * level.width + role * cell + x) * 4;
        const value = level.data[i];
        assert.equal(value, level.data[i + 1]);
        assert.equal(value, level.data[i + 2]); // modulation adds no pigment chroma
        minimum = Math.min(minimum, value); maximum = Math.max(maximum, value);
        const encoded = value / 255;
        linear.push(encoded <= .04045 ? encoded / 12.92 : ((encoded + .055) / 1.055) ** 2.4);
      }
      const mean = linear.reduce((sum, value) => sum + value, 0) / linear.length;
      const rms = Math.sqrt(linear.reduce((sum, value) => sum + (value - mean) ** 2, 0) / linear.length) / .72;
      assert.ok(Math.abs(mean - .72) < .004, `Role ${role} mip ${mip} changed its neutral mean.`);
      assert.ok(rms >= .045 && rms <= .18, `Role ${role} mip ${mip} lost its quiet resolved contrast: ${rms}.`);
      assert.ok(maximum - minimum >= 12, `Role ${role} mip ${mip} lost its authored diffuse envelope.`);
      patterns.push(linear);
    }
    assert.notDeepEqual(patterns[0], patterns[1], `Moss fibres and granular gravel coincide at mip ${mip}.`);
  }
  assert.equal(residentBytes, 16_777_212);
  assert.ok(residentBytes <= 16 * 1024 * 1024);
});

test("atlas generator import remains independent while the compiler CLI awaits it", async () => {
  const compilerPath = fileURLToPath(new URL("./compile-garden-assets.mjs", import.meta.url));
  const generatorUrl = new URL("./generate-garden-surface-atlas.mjs", import.meta.url).href;
  // A static generator→compiler import would activate the compiler CLI here,
  // then deadlock when it awaits this still-pending generator module (exit 13).
  const code = `process.argv[1] = ${JSON.stringify(compilerPath)};
    const generator = await import(${JSON.stringify(generatorUrl)});
    console.log(generator.GARDEN_SURFACE_ATLAS_SEED);`;
  const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "--eval", code]);
  assert.equal(stdout.trim(), String(GARDEN_SURFACE_ATLAS_SEED));
});
