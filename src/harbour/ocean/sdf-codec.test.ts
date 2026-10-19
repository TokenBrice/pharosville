import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { decodeSdfBytes } from "./sdf-codec";

function encode(data: Uint8Array, width: number, height: number): ArrayBuffer {
  const buffer = new ArrayBuffer(12 + width * height * 3), header = new DataView(buffer);
  header.setUint32(0, 0x3144534e, true); header.setUint32(4, width, true); header.setUint32(8, height, true);
  const bytes = new Uint8Array(buffer, 12), count = width * height;
  for (let c = 0; c < 3; c++) for (let y = 0; y < height; y++) {
    let previous = 0;
    for (let x = 0; x < width; x++) {
      const i = y * width + x, value = data[i * 4 + c];
      bytes[c * count + i] = (value - previous) & 255; previous = value;
    }
  }
  return buffer;
}

describe("exact planar-delta sea", () => {
  it("matches every authored WebP RGBA/coast byte, including flipped rows and opaque alpha", async () => {
    const source = await readFile(new URL("../../../public/harbour/sea-sdf.webp", import.meta.url));
    const { data: rgba, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const decoded = decodeSdfBytes(encode(rgba, info.width, info.height));
    const expected = new Uint8Array(rgba.length), coast = new Uint8Array(info.width * info.height);
    for (let y = 0; y < info.height; y++) expected.set(rgba.subarray(y * info.width * 4, (y + 1) * info.width * 4), (info.height - 1 - y) * info.width * 4);
    for (let i = 0; i < coast.length; i++) coast[i] = expected[i * 4];
    expect(Buffer.from(decoded.data).equals(Buffer.from(expected))).toBe(true);
    expect(Buffer.from(decoded.coast).equals(Buffer.from(coast))).toBe(true);
    expect(decoded.width).toBe(2048); expect(decoded.height).toBe(2048);
    // No canvas/bitmap or intermediate RGBA copy: exactly 12 MiB encoded and 20 MiB final arrays.
    expect(decoded.data.byteLength + decoded.coast.byteLength).toBe(20 * 1024 * 1024);
  });

  it("resets predictors each row and rejects malformed inputs before allocating outputs", () => {
    const rgba = new Uint8Array([255, 0, 1, 255, 1, 255, 0, 255, 2, 3, 4, 255, 7, 8, 9, 255]);
    expect([...decodeSdfBytes(encode(rgba, 2, 2)).data]).toEqual([...rgba.slice(8), ...rgba.slice(0, 8)]);
    expect(() => decodeSdfBytes(new ArrayBuffer(11))).toThrow("Truncated");
    expect(() => decodeSdfBytes(new ArrayBuffer(12))).toThrow("Unsupported");
    const excessive = encode(new Uint8Array(4), 1, 1); new DataView(excessive).setUint32(4, 0xffffffff, true);
    expect(() => decodeSdfBytes(excessive)).toThrow("dimensions");
    expect(() => decodeSdfBytes(encode(rgba, 2, 2).slice(0, -1))).toThrow("dimensions");
  });
});
