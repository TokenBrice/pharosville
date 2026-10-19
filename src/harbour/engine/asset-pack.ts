export interface AssetPack { bytes: ArrayBuffer; entries: Record<string, readonly [number, number]> }

/** Validate the complete NFP1 directory once before exposing any intact GLB entry. */
export function readAssetPack(bytes: ArrayBuffer): AssetPack {
  if (bytes.byteLength < 8 || bytes.byteLength > 16 * 1024 * 1024) throw new Error("Invalid asset pack size");
  const header = new DataView(bytes);
  if (header.getUint32(0, true) !== 0x3150464e) throw new Error("Unsupported asset pack");
  const length = header.getUint32(4, true), start = 8 + length;
  if (!length || length > 64 * 1024 || start > bytes.byteLength) throw new Error("Invalid asset pack directory");
  const rows: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes, 8, length)));
  if (!Array.isArray(rows) || !rows.length || rows.length > 128) throw new Error("Invalid asset pack entries");
  const entries: AssetPack["entries"] = Object.create(null) as AssetPack["entries"];
  let end = 0;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 3) throw new Error("Invalid asset pack entry");
    const [name, offset, size] = row as unknown[];
    if (typeof name !== "string" || !name.startsWith("/harbour/") || !name.endsWith(".glb")
      || typeof offset !== "number" || typeof size !== "number" || Object.hasOwn(entries, name)
      || !Number.isSafeInteger(offset) || !Number.isSafeInteger(size)
      || offset !== end || size < 20 || start + offset + size > bytes.byteLength) {
      throw new Error("Invalid asset pack bounds or duplicate entry");
    }
    const absolute = start + offset, glb = new DataView(bytes, absolute, size);
    if (glb.getUint32(0, true) !== 0x46546c67 || glb.getUint32(4, true) !== 2 || glb.getUint32(8, true) !== size) {
      throw new Error("Invalid packed GLB");
    }
    entries[name] = [absolute, size];
    end += size;
  }
  if (start + end !== bytes.byteLength) throw new Error("Unindexed asset pack bytes");
  return { bytes, entries };
}
