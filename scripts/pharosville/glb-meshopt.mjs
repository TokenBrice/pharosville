// Meshopt container compression for the GLBs emitted by the garden generators.
//
// `GLTFExporter` writes plain float/ubyte buffer views; this rewrites the GLB
// so every vertex and index view ships through `EXT_meshopt_compression`, which
// three decodes with the `MeshoptDecoder` bundled in `three/examples/jsm/libs`.
// No CDN and no new runtime dependency: the decoder is same-origin bundle code.
//
// POSITION keeps componentType FLOAT. The exponential filter quantizes the
// mantissa in place and the decoder expands it back to float32, so the
// base-center origin and the unit runtime scale that
// `validateGardenModelMetadata` enforces survive untouched — unlike
// `KHR_mesh_quantization` on POSITION, which needs a dequantization node
// transform. `POSITION_MANTISSA_BITS` is the only lossy knob in the pipeline;
// `measureMeshoptDeviation` is what proves what it actually costs, and the
// generators refuse to write a model whose deviation drifts past the ceiling.
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { MeshoptEncoder } from "meshoptimizer/encoder";

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const EXTENSION = "EXT_meshopt_compression";

/**
 * Mantissa bits kept for POSITION, and the deviation the generators refuse to
 * ship past. 18 of 24 holds every hull and the 34-unit tower inside 2.5e-4
 * model units — under 1% of the 0.035 mortar joint, the finest authored feature
 * in the lighthouse, and about 0.03 screen pixels at the closest the camera
 * ever gets. Deliberately short of the ratio ceiling: 12 bits would take
 * another 6 points off the total at 1.6e-2 units, and flat-shaded silhouettes
 * show a moved edge long before they show a moved face.
 */
const POSITION_MANTISSA_BITS = 18;
export const MAX_POSITION_DEVIATION = 2.5e-4;

/**
 * Rewrites a GLB so its vertex and index buffer views are meshopt-compressed.
 * Throws on any layout the garden generators do not produce, rather than
 * silently leaving bytes on the table.
 *
 * @param {Buffer} bytes Uncompressed GLB from `GLTFExporter`.
 * @returns {Promise<Buffer>} Compressed GLB.
 */
export async function compressGlbWithMeshopt(bytes) {
  await MeshoptEncoder.ready;

  const { json, bin } = splitGlb(bytes);
  const views = json.bufferViews ?? [];
  const indexComponentBytes = indexComponentBytesByView(json);

  const blocks = [];
  let compressedOffset = 0;
  let fallbackOffset = 0;

  for (const [index, view] of views.entries()) {
    if (view.buffer !== 0) {
      throw new Error(`bufferView ${index} does not reference the GLB buffer.`);
    }
    const source = bin.subarray(
      view.byteOffset ?? 0,
      (view.byteOffset ?? 0) + view.byteLength,
    );
    const { data, mode, stride, count, filter } = encodeView(
      index,
      view,
      source,
      indexComponentBytes.get(index),
    );

    const extension = {
      buffer: 0,
      byteLength: data.byteLength,
      byteOffset: compressedOffset,
      byteStride: stride,
      count,
      mode,
    };
    if (filter !== undefined) extension.filter = filter;

    view.buffer = 1;
    view.byteOffset = fallbackOffset;
    view.extensions = { ...view.extensions, [EXTENSION]: extension };

    blocks.push(data);
    compressedOffset += align4(data.byteLength);
    fallbackOffset += align4(view.byteLength);
  }

  json.buffers = [
    { byteLength: compressedOffset },
    { byteLength: fallbackOffset, extensions: { [EXTENSION]: { fallback: true } } },
  ];
  json.extensionsUsed = addOnce(json.extensionsUsed, EXTENSION);
  json.extensionsRequired = addOnce(json.extensionsRequired, EXTENSION);

  return buildGlb(json, concatAligned(blocks, compressedOffset));
}

/**
 * Decodes every compressed view with the same `MeshoptDecoder` the browser
 * ships and diffs it against the uncompressed GLB. Colours must come back
 * byte-identical and every triangle must keep its three vertices and its
 * winding; positions are allowed the exponential filter's rounding and nothing
 * more.
 *
 * @param {Buffer} original Uncompressed GLB.
 * @param {Buffer} compressed Output of `compressGlbWithMeshopt`.
 * @returns {Promise<number>} Largest absolute POSITION deviation, in model units.
 */
export async function measureMeshoptDeviation(original, compressed) {
  await MeshoptDecoder.ready;

  const before = splitGlb(original);
  const after = splitGlb(compressed);
  let deviation = 0;

  for (const [index, view] of after.json.bufferViews.entries()) {
    const extension = view.extensions[EXTENSION];
    const plain = before.json.bufferViews[index];
    const expected = before.bin.subarray(
      plain.byteOffset ?? 0,
      (plain.byteOffset ?? 0) + plain.byteLength,
    );
    const actual = new Uint8Array(extension.count * extension.byteStride);
    MeshoptDecoder.decodeGltfBuffer(
      actual,
      extension.count,
      extension.byteStride,
      after.bin.subarray(
        extension.byteOffset,
        extension.byteOffset + extension.byteLength,
      ),
      extension.mode,
      extension.filter,
    );

    if (extension.mode === "TRIANGLES") {
      assertSameTriangles(index, expected, actual, extension.byteStride);
      continue;
    }
    if (extension.filter === undefined) {
      if (!Buffer.from(actual).equals(expected)) {
        throw new Error(`bufferView ${index} did not round-trip losslessly.`);
      }
      continue;
    }
    const want = new Float32Array(
      expected.buffer.slice(
        expected.byteOffset,
        expected.byteOffset + expected.byteLength,
      ),
    );
    const got = new Float32Array(actual.buffer);
    for (let i = 0; i < want.length; i += 1) {
      deviation = Math.max(deviation, Math.abs(want[i] - got[i]));
    }
  }

  if (deviation > MAX_POSITION_DEVIATION) {
    throw new Error(
      `Meshopt position deviation ${deviation} exceeds ${MAX_POSITION_DEVIATION}.`,
    );
  }
  return deviation;
}

/**
 * The meshopt index codec is free to rotate a triangle's three indices — same
 * three corners, same winding, different starting vertex — so compare triangles
 * with each one rotated to start at its smallest index.
 */
function assertSameTriangles(index, expected, actual, stride) {
  const want = indexArray(expected, stride);
  const got = indexArray(actual, stride);
  if (want.length !== got.length) {
    throw new Error(`bufferView ${index} changed index count.`);
  }
  for (let i = 0; i < want.length; i += 3) {
    const a = rotateTriangle(want, i);
    const b = rotateTriangle(got, i);
    if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) {
      throw new Error(`bufferView ${index} changed triangle ${i / 3}.`);
    }
  }
}

function indexArray(bytes, stride) {
  const copy = Uint8Array.from(bytes);
  return stride === 2
    ? new Uint16Array(copy.buffer)
    : new Uint32Array(copy.buffer);
}

function rotateTriangle(indices, at) {
  const triangle = [indices[at], indices[at + 1], indices[at + 2]];
  const start = triangle.indexOf(Math.min(...triangle));
  return [
    triangle[start],
    triangle[(start + 1) % 3],
    triangle[(start + 2) % 3],
  ];
}

function encodeView(index, view, source, indexBytes) {
  if (view.target === ELEMENT_ARRAY_BUFFER) {
    if (indexBytes === undefined) {
      throw new Error(`bufferView ${index} has no index accessor.`);
    }
    const count = view.byteLength / indexBytes;
    if (!Number.isInteger(count) || count % 3 !== 0) {
      throw new Error(`bufferView ${index} is not a whole triangle list.`);
    }
    return {
      count,
      data: MeshoptEncoder.encodeGltfBuffer(source, count, indexBytes, "TRIANGLES"),
      mode: "TRIANGLES",
      stride: indexBytes,
    };
  }

  if (view.target !== ARRAY_BUFFER) {
    throw new Error(`bufferView ${index} has no GPU target; refusing to guess.`);
  }
  const stride = view.byteStride;
  if (stride === undefined || stride % 4 !== 0) {
    throw new Error(`bufferView ${index} needs a 4-byte-aligned byteStride.`);
  }
  const count = view.byteLength / stride;
  if (!Number.isInteger(count)) {
    throw new Error(`bufferView ${index} length is not a multiple of its stride.`);
  }

  // Float attributes (POSITION) go through the exponential filter; the
  // normalized-ubyte COLOR_0 views are already byte-tight and encode losslessly.
  const floats = floatViewOrNull(source, view);
  if (floats === null) {
    return {
      count,
      data: MeshoptEncoder.encodeGltfBuffer(source, count, stride, "ATTRIBUTES"),
      mode: "ATTRIBUTES",
      stride,
    };
  }
  const filtered = MeshoptEncoder.encodeFilterExp(
    floats,
    count,
    stride,
    POSITION_MANTISSA_BITS,
  );
  return {
    count,
    data: MeshoptEncoder.encodeGltfBuffer(filtered, count, stride, "ATTRIBUTES"),
    filter: "EXPONENTIAL",
    mode: "ATTRIBUTES",
    stride,
  };
}

function floatViewOrNull(source, view) {
  if (view.__componentType !== 5126) return null;
  return new Float32Array(
    source.buffer.slice(
      source.byteOffset,
      source.byteOffset + source.byteLength,
    ),
  );
}

/**
 * Index views carry no `byteStride`, so their element size comes from the
 * accessors that use them. Attribute views get their component type stamped on
 * the same pass so `encodeView` can tell float from normalized byte.
 */
function indexComponentBytesByView(json) {
  const byView = new Map();
  for (const accessor of json.accessors ?? []) {
    const view = json.bufferViews?.[accessor.bufferView];
    if (view === undefined) continue;
    if (accessor.byteOffset) {
      throw new Error("accessors sharing a bufferView are not supported.");
    }
    const bytes = COMPONENT_BYTES[accessor.componentType];
    if (bytes === undefined) {
      throw new Error(`unknown componentType ${accessor.componentType}.`);
    }
    if (view.target === ELEMENT_ARRAY_BUFFER) {
      byView.set(accessor.bufferView, bytes);
    } else {
      view.__componentType = accessor.componentType;
    }
  }
  return byView;
}

function splitGlb(bytes) {
  if (bytes.readUInt32LE(0) !== GLB_MAGIC) throw new Error("not a GLB.");
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < bytes.byteLength) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === CHUNK_JSON) json = JSON.parse(chunk.toString("utf8"));
    if (type === CHUNK_BIN) bin = chunk;
    offset += 8 + length;
  }
  if (json === null || bin === null) throw new Error("GLB is missing a chunk.");
  return { bin, json };
}

function buildGlb(json, bin) {
  for (const view of json.bufferViews ?? []) delete view.__componentType;
  const jsonChunk = padTo4(Buffer.from(JSON.stringify(json), "utf8"), 0x20);
  const binChunk = padTo4(bin, 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.byteLength + 8 + binChunk.byteLength, 8);
  return Buffer.concat([
    header,
    chunkHeader(jsonChunk.byteLength, CHUNK_JSON),
    jsonChunk,
    chunkHeader(binChunk.byteLength, CHUNK_BIN),
    binChunk,
  ]);
}

function chunkHeader(length, type) {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(length, 0);
  header.writeUInt32LE(type, 4);
  return header;
}

function padTo4(buffer, fill) {
  const padding = align4(buffer.byteLength) - buffer.byteLength;
  return padding === 0
    ? buffer
    : Buffer.concat([buffer, Buffer.alloc(padding, fill)]);
}

function concatAligned(blocks, total) {
  const out = Buffer.alloc(total);
  let offset = 0;
  for (const block of blocks) {
    out.set(block, offset);
    offset += align4(block.byteLength);
  }
  return out;
}

function align4(value) {
  return (value + 3) & ~3;
}

function addOnce(list, value) {
  const next = list ?? [];
  return next.includes(value) ? next : [...next, value];
}
