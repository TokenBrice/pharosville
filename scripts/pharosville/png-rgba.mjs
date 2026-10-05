import { inflateSync } from "node:zlib";

/** Compare authored horizontal RGBA8 strips, independent of PNG compression/filtering.
 * Untagged images inherit the caller's colour space, as they do at runtime.
 */
export function validatePublishedRgbaStrip(bytes, { width, height, colorSpace, levels, label }) {
  const fail = (message) => { throw new Error(`${label} ${message}.`); };
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    fail("must be a PNG");
  }
  const chunks = [];
  const seen = new Set();
  let ended = false;
  let dataEnded = false;
  for (let offset = 8; offset < bytes.length;) {
    if (offset + 12 > bytes.length) fail("has a truncated PNG chunk");
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) fail("has a truncated PNG chunk");
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, end - 4);
    if (pngCrc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) {
      fail(`PNG ${type} CRC mismatch`);
    }
    if (offset === 8 && type !== "IHDR") fail("must begin with IHDR");
    if (type === "IHDR") {
      if (seen.has(type) || length !== 13 || data.readUInt32BE(0) !== width ||
          data.readUInt32BE(4) !== height) fail("dimensions differ from its generator");
      if (data[8] !== 8 || data[9] !== 6 || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) {
        fail("must use non-interlaced RGBA8 channels");
      }
    } else if (type === "IDAT") {
      if (dataEnded) fail("has non-contiguous PNG image data");
      chunks.push(data);
    } else if (type === "IEND") {
      if (length !== 0 || chunks.length === 0 || end !== bytes.length) fail("has an invalid PNG end");
      ended = true;
    } else {
      if (seen.has("IDAT")) dataEnded = true;
      if (["sRGB", "gAMA"].includes(type)) {
        if (seen.has(type) || seen.has("IDAT")) fail("has invalid PNG colour metadata");
        if (type === "sRGB" && (colorSpace !== "srgb" || length !== 1 || data[0] > 3)) {
          fail("colour space differs from its generator");
        }
        if (type === "gAMA" && (length !== 4 ||
            data.readUInt32BE(0) !== (colorSpace === "srgb" ? 45455 : 100000))) {
          fail("colour space differs from its generator");
        }
      } else if (["iCCP", "cHRM", "cICP", "mDCV", "cLLI", "tRNS", "sBIT",
        "acTL", "fcTL", "fdAT"].includes(type) || (bytes[offset + 4] & 32) === 0) {
        fail(`has unsupported PNG ${type} metadata`);
      }
    }
    seen.add(type);
    offset = end;
  }
  if (!ended) fail("has no PNG end");
  const stride = width * 4 + 1;
  const pixels = inflateSync(Buffer.concat(chunks), { maxOutputLength: stride * height });
  if (pixels.length !== stride * height) fail("decoded pixel count differs from its generator");
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    const filter = pixels[row];
    if (filter > 4) fail("has an invalid PNG row filter");
    for (let x = 1; x < stride; x++) {
      const left = x > 4 ? pixels[row + x - 4] : 0;
      const up = y > 0 ? pixels[row + x - stride] : 0;
      const upperLeft = y > 0 && x > 4 ? pixels[row + x - stride - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upperLeft;
        const a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - upperLeft);
        predictor = a <= b && a <= c ? left : b <= c ? up : upperLeft;
      }
      pixels[row + x] = (pixels[row + x] + predictor) & 255;
    }
    let stripX = 0;
    for (const [mip, level] of levels.entries()) {
      for (let x = 0; x < level.width * 4; x++) {
        const expected = y < level.height ? level.data[y * level.width * 4 + x] : 0;
        if (pixels[row + 1 + stripX * 4 + x] !== expected) {
          fail(`mip ${mip} pixels differ from its generator`);
        }
      }
      stripX += level.width;
    }
  }
}

export function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = pngCrc32(body);
  const header = Buffer.alloc(4); header.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc);
  return Buffer.concat([header, body, checksum]);
}

function pngCrc32(body) {
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
