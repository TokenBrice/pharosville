import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";
import { Box3, Vector3 } from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  buildGlb, splitGlb, MESHOPT_OPTIONS, measureMeshoptDeviation,
  setGlbCompilationObserver,
} from "./glb-meshopt.mjs";
import { pngChunk, validatePublishedRgbaStrip } from "./png-rgba.mjs";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = resolve(root, "assets/pharosville/garden-assets.json");
const extension = "EXT_meshopt_compression";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const MODEL_GENERATORS = [
  "scripts/pharosville/generate-garden-lighthouse.mjs",
  "scripts/pharosville/generate-garden-heroes.mjs",
];
// These are reviewed validator limitations, not ignored geometry warnings.
// The reconstructed, decoded GLB is validated separately with no meshopt extension.
const REVIEWED_WARNINGS = { UNSUPPORTED_EXTENSION: true };

export async function decodeGardenGlb(bytes) {
  await MeshoptDecoder.ready;
  const { json, bin } = splitGlb(bytes);
  const blocks = [];
  let offset = 0;
  const quantizedViews = new Set();
  for (const [viewIndex, view] of (json.bufferViews ?? []).entries()) {
    const codec = view.extensions?.[extension];
    let data;
    if (codec) {
      if (codec.filter === "EXPONENTIAL") quantizedViews.add(viewIndex);
      data = Buffer.alloc(codec.count * codec.byteStride);
      MeshoptDecoder.decodeGltfBuffer(data, codec.count, codec.byteStride,
        bin.subarray(codec.byteOffset ?? 0, (codec.byteOffset ?? 0) + codec.byteLength),
        codec.mode, codec.filter);
      delete view.extensions[extension];
      if (Object.keys(view.extensions).length === 0) delete view.extensions;
    } else {
      if (view.buffer !== 0) throw new Error("Noncompressed view uses an external buffer.");
      data = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    }
    if (data.byteLength !== view.byteLength) throw new Error("Decoded bufferView length mismatch.");
    view.buffer = 0;
    view.byteOffset = offset;
    blocks.push(data, Buffer.alloc((4 - data.length % 4) % 4));
    offset += (data.length + 3) & ~3;
  }
  json.buffers = [{ byteLength: offset }];
  for (const key of ["extensionsUsed", "extensionsRequired"]) {
    if (json[key]) {
      json[key] = json[key].filter((value) => value !== extension);
      if (json[key].length === 0) delete json[key];
    }
  }
  const decodedBin = Buffer.concat(blocks);
  // Meshopt's bounded float rounding can move extrema beyond the source
  // accessor bounds. Reconstruct exact decoded bounds only after checking each
  // change against the same compression tolerance; shipped JSON stays intact.
  const positionAccessors = new Set((json.meshes ?? []).flatMap((mesh) =>
    mesh.primitives.map((primitive) => primitive.attributes.POSITION)));
  for (const index of positionAccessors) {
    const accessor = json.accessors[index];
    if (!quantizedViews.has(accessor.bufferView)) continue;
    if (accessor.componentType !== 5126 || accessor.type !== "VEC3" || accessor.sparse) {
      throw new Error("Decoded position bounds require nonsparse FLOAT VEC3.");
    }
    const view = json.bufferViews[accessor.bufferView];
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let vertex = 0; vertex < accessor.count; vertex++) {
      const at = view.byteOffset + (accessor.byteOffset ?? 0) + vertex * (view.byteStride ?? 12);
      for (let axis = 0; axis < 3; axis++) {
        const value = decodedBin.readFloatLE(at + axis * 4);
        if (!Number.isFinite(value)) throw new Error("Decoded POSITION is nonfinite.");
        min[axis] = Math.min(min[axis], value);
        max[axis] = Math.max(max[axis], value);
      }
    }
    for (let axis = 0; axis < 3; axis++) {
      if (!Number.isFinite(accessor.min?.[axis]) || !Number.isFinite(accessor.max?.[axis]) ||
          Math.abs(min[axis] - accessor.min[axis]) > MESHOPT_OPTIONS.maxPositionDeviation ||
          Math.abs(max[axis] - accessor.max[axis]) > MESHOPT_OPTIONS.maxPositionDeviation) {
        throw new Error("Decoded POSITION bounds exceed the compression deviation limit.");
      }
    }
    accessor.min = min;
    accessor.max = max;
  }
  return buildGlb(json, decodedBin);
}

/** Scene instances, not mesh definitions, determine primitives/draws and bounds. */
export async function censusGardenGlb(bytes) {
  const { json } = splitGlb(bytes);
  const decoded = await decodeGardenGlb(bytes);
  const gltf = await new GLTFLoader().parseAsync(new Uint8Array(decoded).buffer, "");
  const materials = new Set();
  const maps = new Set();
  const anchors = {};
  let primitives = 0;
  let triangles = 0;
  let vertices = 0;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((object) => {
    if (object.userData.role && !object.isMesh) {
      anchors[object.name] = {
        role: object.userData.role,
        position: object.getWorldPosition(new Vector3()).toArray(),
      };
    }
    if (!object.isMesh) return;
    if (object.isSkinnedMesh || object.isInstancedMesh) throw new Error("Unsupported garden mesh instance.");
    const geometry = object.geometry;
    const count = geometry.index?.count ?? geometry.getAttribute("position").count;
    if (count % 3 !== 0) throw new Error("Garden primitive is not a triangle list.");
    triangles += count / 3;
    vertices += geometry.getAttribute("position").count;
    primitives += Array.isArray(object.material) ? geometry.groups.length : 1;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) maps.add(value);
    }
  });
  const bounds = new Box3().setFromObject(gltf.scene);
  const result = {
    primitives, triangles, vertices, materials: materials.size, maps: maps.size,
    images: json.images?.length ?? 0,
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    anchors, extensions: [...(json.extensionsUsed ?? [])].sort(),
    bytes: bytes.byteLength, decodedBytes: decoded.byteLength,
  };
  const geometries = new Set();
  gltf.scene.traverse((object) => { if (object.isMesh) geometries.add(object.geometry); });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const map of maps) map.dispose();
  return result;
}

export async function validateGlb(bytes, phase = "asset") {
  const validator = require("gltf-validator");
  const report = await validator.validateBytes(new Uint8Array(bytes), { maxIssues: 0 });
  const messages = report.issues.messages.map(({ code, severity, pointer, message }) => ({
    code, severity, pointer: pointer ?? "", message,
  }));
  const unreviewed = messages.filter((issue) => issue.severity === 1 &&
    !(REVIEWED_WARNINGS[issue.code] && issue.message.includes(extension)));
  if (report.issues.numErrors > 0 || unreviewed.length > 0) {
    throw new Error(`${phase} glTF validation failed: ${JSON.stringify(messages)}`);
  }
  return { errors: report.issues.numErrors, warnings: report.issues.numWarnings, messages };
}

const powerOfTwo = (value) => Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
/** Atlas data is already independently guttered by its generator; no GPU mip baking. */
export function validateAtlasStrip(map, { gutter = 2, levelCount = map.levels?.length } = {}) {
  if (!["albedo", "normal", "orm"].includes(map.name)) throw new Error("Unknown atlas map.");
  const colorSpace = map.name === "albedo" ? "srgb" : "linear";
  if (map.colorSpace !== colorSpace) throw new Error(`Atlas ${map.name} needs ${colorSpace}.`);
  if (!powerOfTwo(map.cell) || !powerOfTwo(map.cells)) throw new Error("Atlas cells must be powers of two.");
  if (!Number.isInteger(gutter) || gutter < 1 || gutter * 2 >= map.cell) throw new Error("Invalid atlas gutter width.");
  if (!Array.isArray(map.levels) || !Number.isInteger(levelCount) || levelCount < 1 || map.levels.length !== levelCount) {
    throw new Error("Atlas level count mismatch.");
  }
  const base = map.levels[0];
  if (!base || !powerOfTwo(base.width) || !powerOfTwo(base.height)) throw new Error("Atlas base must be power-of-two.");
  if (levelCount > 1 + Math.floor(Math.log2(Math.max(base.width, base.height)))) throw new Error("Too many atlas levels.");
  for (const [index, level] of map.levels.entries()) {
    if (level.width !== Math.max(1, base.width >> index) || level.height !== Math.max(1, base.height >> index)) {
      throw new Error("Atlas levels must halve without skipped mips.");
    }
    if (!(level.data instanceof Uint8Array) || level.data.length !== level.width * level.height * 4) {
      throw new Error("Atlas mip must be RGBA8.");
    }
  }
  return { colorSpace, gutter, cell: map.cell, cells: map.cells,
    levels: map.levels.map(({ width, height }) => ({ width, height })),
    width: map.levels.reduce((sum, level) => sum + level.width, 0), height: base.height };
}

export function describeAtlasEntry({ generator, seed, maps, gutter = 2 }) {
  if (generator !== "scripts/pharosville/generate-garden-surface-atlas.mjs" || !Number.isSafeInteger(seed)) {
    throw new Error("Atlas requires the checked local generator and an integer seed.");
  }
  if (maps.length !== 3 || new Set(maps.map((map) => map.name)).size !== 3) throw new Error("Atlas requires three unique maps.");
  const descriptions = maps.map((map) => ({ name: map.name, ...validateAtlasStrip(map, { gutter }),
    output: `public/pharosville/textures/garden-surface-${map.name}.png` }));
  if (descriptions.some((map) => JSON.stringify(map.levels) !== JSON.stringify(descriptions[0].levels))) {
    throw new Error("Atlas maps must share mip dimensions.");
  }
  return { id: "garden-surface-atlas", kind: "atlas", generator, seed, gutter, maps: descriptions };
}

export function encodeAtlasStrip(map, options) {
  const { width, height } = validateAtlasStrip(map, options);
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  let x = 0;
  for (const level of map.levels) {
    for (let y = 0; y < level.height; y++) {
      pixels.set(level.data.subarray(y * level.width * 4, (y + 1) * level.width * 4),
        y * (width * 4 + 1) + 1 + x * 4);
    }
    x += level.width;
  }
  // PNG Up filtering compresses shallow authored gradients without changing
  // any pixel or mip. Walk backwards so the previous row is still unfiltered.
  const stride = width * 4 + 1;
  for (let y = height - 1; y > 0; y--) {
    pixels[y * stride] = 2;
    for (let x = 1; x < stride; x++) {
      const i = y * stride + x;
      pixels[i] = (pixels[i] - pixels[i - stride]) & 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(pixels, { level: 9 })), pngChunk("IEND", Buffer.alloc(0))]);
}

/** Untagged strips use the manifest's colour space, as the runtime does. */
export function validatePublishedAtlasStrip(bytes, map, options) {
  const { width, height, colorSpace } = validateAtlasStrip(map, options);
  validatePublishedRgbaStrip(bytes, {
    width, height, colorSpace, levels: map.levels, label: `Atlas ${map.name}`,
  });
}

async function sourceRecords(paths) {
  return Promise.all([...new Set(paths)].sort().map(async (path) => ({ path, sha256: sha256(await readFile(resolve(root, path))) })));
}
async function compileModels() {
  const assets = [];
  const previousArgv = process.argv;
  process.argv = [...previousArgv, "--check"];
  try {
    for (const generator of MODEL_GENERATORS) {
      const passes = [];
      for (let pass = 0; pass < 2; pass++) {
        const results = [];
        setGlbCompilationObserver(async (raw, compressed) => {
          const { json } = splitGlb(raw);
          const id = json.nodes.find((node) => node.name?.startsWith("garden-") && !node.name.endsWith("-scene"))?.name;
          if (!id) throw new Error("Generated asset has no named garden root.");
          results.push({ id, kind: "model", generator,
            sources: await sourceRecords([generator, "scripts/pharosville/glb-meshopt.mjs"]),
            author: "TokenBrice / agent-authored", license: "MIT", units: "metres",
            options: { exporter: { binary: true, animations: [], onlyVisible: true, trs: false, includeCustomExtensions: false },
              meshopt: MESHOPT_OPTIONS,
              decodedValidation: { positionBounds: "recomputed-from-decoded-values", maxBoundsDeviation: MESHOPT_OPTIONS.maxPositionDeviation } },
            output: { path: `public/pharosville/models/${id}.glb`, sha256: sha256(compressed), bytes: compressed.length },
            sourceGlbSha256: sha256(raw),
            positionDeviation: await measureMeshoptDeviation(raw, compressed),
            validation: { source: await validateGlb(raw, "source"),
              compressed: await validateGlb(compressed, "compressed"),
              decoded: await validateGlb(await decodeGardenGlb(compressed), "decoded") },
            census: await censusGardenGlb(compressed) });
        });
        await import(`${pathToFileURL(resolve(root, generator)).href}?compiler-pass=${pass}`);
        passes.push(results);
      }
      if (JSON.stringify(passes[0]) !== JSON.stringify(passes[1])) throw new Error(`${generator} is nondeterministic.`);
      assets.push(...passes[0]);
    }
  } finally {
    setGlbCompilationObserver(null);
    process.argv = previousArgv;
  }
  return assets;
}

export async function compileGardenAssets({ writeManifest = false } = {}) {
  const registration = JSON.parse(await readFile(manifestPath, "utf8"));
  if (registration.schemaVersion !== 1) throw new Error("Unsupported asset manifest schema.");
  if (!Array.isArray(registration.assets) ||
      registration.assets.some((asset) => !["model", "atlas"].includes(asset.kind)) ||
      new Set(registration.assets.map((asset) => asset.id)).size !== registration.assets.length) {
    throw new Error("Invalid or duplicate registered assets.");
  }
  const assets = await compileModels();
  const registeredModels = registration.assets.filter((asset) => asset.kind === "model");
  if (registeredModels.length !== assets.length || registeredModels.some((entry) =>
    !assets.some((asset) => asset.id === entry.id && asset.generator === entry.generator))) {
    throw new Error("Model registrations disagree with the checked generators.");
  }
  for (const entry of registration.assets.filter((asset) => asset.kind === "atlas")) {
    if (entry.generator !== "scripts/pharosville/generate-garden-surface-atlas.mjs") {
      throw new Error("Atlas generator must be the checked local surface-atlas module.");
    }
    const generator = await import(pathToFileURL(resolve(root, entry.generator)).href);
    const first = generator.generateGardenSurfaceAtlas({ seed: entry.seed });
    const second = generator.generateGardenSurfaceAtlas({ seed: entry.seed });
    const descriptor = describeAtlasEntry({ ...entry, maps: first.maps });
    if (JSON.stringify(descriptor) !== JSON.stringify(describeAtlasEntry({ ...entry, maps: second.maps }))) {
      throw new Error("Atlas generator is nondeterministic.");
    }
    const maps = [];
    for (const description of descriptor.maps) {
      const map = first.maps.find((item) => item.name === description.name);
      const repeated = second.maps.find((item) => item.name === description.name);
      if (map.levels.some((level, i) => {
        const other = repeated.levels[i].data;
        return !Buffer.from(level.data.buffer, level.data.byteOffset, level.data.byteLength)
          .equals(Buffer.from(other.buffer, other.byteOffset, other.byteLength));
      })) {
        throw new Error("Atlas generator is nondeterministic.");
      }
      let published;
      if (writeManifest) {
        published = encodeAtlasStrip(map, { gutter: entry.gutter });
        await writeFile(resolve(root, description.output), published);
      } else {
        published = await readFile(resolve(root, description.output));
        validatePublishedAtlasStrip(published, map, { gutter: entry.gutter });
      }
      maps.push({ ...description, sha256: sha256(published), bytes: published.length });
    }
    assets.push({ ...descriptor, maps, author: "TokenBrice / agent-authored", license: "MIT",
      sources: await sourceRecords([entry.generator, "scripts/pharosville/compile-garden-assets.mjs",
        "scripts/pharosville/png-rgba.mjs"]) });
  }
  const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  // Node/zlib identify the publishing toolchain, not the machine checking it.
  const tools = { node: writeManifest ? process.version : registration.tools.node,
    zlib: writeManifest ? process.versions.zlib : registration.tools.zlib,
    three: JSON.parse(await readFile(resolve(root, "node_modules/three/package.json"), "utf8")).version,
    meshoptimizer: JSON.parse(await readFile(resolve(root, "node_modules/meshoptimizer/package.json"), "utf8")).version,
    gltfValidator: require("gltf-validator").version(),
    validatorPackage: packageJson.devDependencies["gltf-validator"] };
  const manifest = { schemaVersion: 1, tools,
    compiler: (await sourceRecords(["scripts/pharosville/compile-garden-assets.mjs"]))[0],
    assets: assets.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) };
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  if (writeManifest) await writeFile(manifestPath, text);
  else if (text !== await readFile(manifestPath, "utf8")) throw new Error("garden-assets.json is stale; run compile:garden-assets.");
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const unknown = process.argv.slice(2).filter((arg) => !["--check", "--write-manifest"].includes(arg));
    if (unknown.length) throw new Error(`Unknown compiler options: ${unknown.join(", ")}`);
    const manifest = await compileGardenAssets({ writeManifest: process.argv.includes("--write-manifest") });
    console.log(JSON.stringify({ assets: manifest.assets.map(({ id, census, maps }) => ({ id, census, maps })), tools: manifest.tools }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
