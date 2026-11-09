import { describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import { freezeCapture } from "../../scripts/perf/golden-controls.mjs";

function verifyTile({ slot, last = 95, cols = 32, runtimeSize = 96, expected = [30, 80, 150, 255], actual = expected }) {
  const rows = Math.ceil((last + 1) / cols);
  const meta = { slot: 128, width: cols * 128, height: rows * 128, cols, ids: { canary: slot, last } };
  const referenceContext = { drawImage: vi.fn(), getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(expected) })) };
  const atlasContext = { getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(actual) })) };
  const reference = { getContext: () => referenceContext };
  // Spare monogram rows must not influence the source-to-logo-row scaling.
  const canvas = { width: cols * runtimeSize, height: (rows + 3) * runtimeSize, getContext: () => atlasContext };
  const systems = [{ name: "data" }, { name: "fleet", atlas: { meta, logos: "done", texture: { image: canvas } } },
    { name: "identity", system: { dresser: { complete: true }, flags: { flags: { count: 1 } } } }];
  const services = new Map([["feed", { payloads: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i, {}])) }], ["readiness", { prepared: true }]]);
  const image = { close: vi.fn() }, verified = new Error("tile verified; stop before world capture");
  const promise = runInNewContext(`(${freezeCapture.toString()})({})`, {
    window: { __harbour: { systems, ready: new Set(systems), ctx: { services } } }, performance: { now: () => 0 },
    document: { createElement: () => reference, get fonts() { throw verified; } },
    fetch: async () => ({ ok: true, headers: { get: () => "image/avif" }, blob: async () => ({}) }),
    createImageBitmap: async () => image,
  });
  return { promise, verified, image, reference, referenceContext, atlasContext };
}

describe("golden decoded emblem verification", () => {
  it.each([0, 31, 32, 35, 65])("compares source row and runtime tile for slot %i", async (slot) => {
    const result = verifyTile({ slot });
    await expect(result.promise).rejects.toBe(result.verified);
    const x = slot % 32 * 96, row = Math.floor(slot / 32);
    expect(result.reference).toMatchObject({ width: 3072, height: 96 });
    expect(result.referenceContext.drawImage).toHaveBeenCalledWith(result.image, 0, row * 128, 4096, 128, 0, 0, 3072, 96);
    expect(result.referenceContext.getImageData).toHaveBeenCalledWith(x, 0, 96, 96);
    expect(result.atlasContext.getImageData).toHaveBeenCalledWith(x, row * 96, 96, 96);
    expect(result.image.close).toHaveBeenCalledOnce();
  });
  it.each([96, 128])("uses the canvas slot width with a partial last row at %i px", async (runtimeSize) => {
    const result = verifyTile({ slot: 5, last: 9, cols: 4, runtimeSize });
    await expect(result.promise).rejects.toBe(result.verified);
    expect(result.referenceContext.drawImage).toHaveBeenCalledWith(result.image, 0, 128, 512, 128, 0, 0, 4 * runtimeSize, runtimeSize);
    expect(result.atlasContext.getImageData).toHaveBeenCalledWith(runtimeSize, runtimeSize, runtimeSize, runtimeSize);
  });
  it.each([
    { actual: [31, 80, 150, 255] },
    { actual: [255, 255, 255, 255] },
    { expected: [0, 0, 0, 0], actual: [0, 0, 0, 0] },
  ])("still rejects differing/fallback or empty tiles: %j", async (pixels) => {
    const result = verifyTile({ slot: 35, ...pixels });
    await expect(result.promise).rejects.toThrow("Golden atlas does not contain the decoded logo tile");
    expect(result.image.close).toHaveBeenCalledOnce();
  });
});
