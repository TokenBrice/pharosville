import { describe, expect, it } from "vitest";
import { readAssetPack } from "./asset-pack";

function pack(rows: unknown[], payload: Uint8Array = new Uint8Array(20)): ArrayBuffer {
  const directory = new TextEncoder().encode(JSON.stringify(rows));
  const bytes = new Uint8Array(8 + directory.length + payload.length), header = new DataView(bytes.buffer);
  header.setUint32(0, 0x3150464e, true); header.setUint32(4, directory.length, true);
  bytes.set(directory, 8); bytes.set(payload, 8 + directory.length);
  return bytes.buffer;
}
function glb(): Uint8Array {
  const bytes = new Uint8Array(20), header = new DataView(bytes.buffer);
  header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, bytes.length, true);
  return bytes;
}

describe("NFP1 scoped packs", () => {
  const key = "/harbour/kit/test.glb";
  it("indexes exact intact GLB bytes", () => {
    const source = glb(), parsed = readAssetPack(pack([[key, 0, source.length]], source));
    const [offset, length] = parsed.entries[key];
    expect(new Uint8Array(parsed.bytes, offset, length)).toEqual(source);
  });
  it("rejects truncated, unsupported, missing, duplicate and overlapping entries", () => {
    expect(() => readAssetPack(new ArrayBuffer(7))).toThrow("size");
    expect(() => readAssetPack(new ArrayBuffer(20))).toThrow("Unsupported");
    expect(() => readAssetPack(pack([]))).toThrow("entries");
    expect(() => readAssetPack(pack([[key, 0, 21]], glb()))).toThrow("bounds");
    expect(() => readAssetPack(pack([[key, -1, 20]], glb()))).toThrow("bounds");
    expect(() => readAssetPack(pack([[key, 0, 20], [key, 0, 20]], glb()))).toThrow("duplicate");
    expect(() => readAssetPack(pack([[key, 1, 20]], glb()))).toThrow("bounds");
    expect(() => readAssetPack(pack([[key, 0, 20]], new Uint8Array(20)))).toThrow("GLB");
    const bytes = pack([[key, 0, 20]], glb());
    expect(() => readAssetPack(bytes.slice(0, -1))).toThrow("bounds");
    new DataView(bytes).setUint32(4, 0xffffffff, true);
    expect(() => readAssetPack(bytes)).toThrow("directory");
  });
});
