import type { ShaderMaterial } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssetStore } from "../engine/assets";
import { EmblemAtlas, EMBLEMS_JSON, type EmblemCoin } from "./emblems";
import type { WorldUniforms } from "../engine/uniforms";
import { HouseFlags } from "./house-flags";

function canvasHarness() {
  const drawImage = vi.fn();
  const g = { drawImage, save: vi.fn(), restore: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(), fillText: vi.fn() };
  const canvases: Array<{ width: number; height: number; getContext: () => typeof g }> = [];
  vi.stubGlobal("document", { createElement: () => {
    const canvas = { width: 0, height: 0, getContext: () => g };
    canvases.push(canvas);
    return canvas;
  } });
  return { canvases, drawImage, g };
}

function assets() {
  return { json: vi.fn().mockResolvedValue({ slot: 128, cols: 32, width: 4096, height: 2560, ids: Object.fromEntries(Array.from({ length: 620 }, (_, i) => [`logo-${i}`, i])) }) };
}

function decodedLogo() {
  const image = { width: 4096, height: 2560, close: vi.fn() };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, headers: { get: () => "image/avif" }, blob: async () => new Blob() }));
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(image));
  return image;
}

const coin = (id: string): EmblemCoin => ({ id, symbol: "COIN", brandColor: "#548AB3" });
afterEach(() => vi.unstubAllGlobals());

describe("combined emblem atlas", () => {
  it("keeps an awaiting-data atlas at one row rather than uploading blank logo rows", async () => {
    const { canvases } = canvasHarness();
    const store = assets();
    const atlas = await EmblemAtlas.load(store as unknown as AssetStore, 420);
    expect(store.json).toHaveBeenCalledWith(EMBLEMS_JSON);
    atlas.begin([]); atlas.end();
    expect(canvases).toHaveLength(1);
    expect(atlas.texture.image.height).toBe(128);
    atlas.dispose();
  });

  it("reserves once before painting, preserves logical slots and the original combined mip dimensions", async () => {
    const { canvases, drawImage } = canvasHarness();
    const atlas = await EmblemAtlas.load(assets() as unknown as AssetStore, 420);
    const coins = [coin("logo-619"), ...Array.from({ length: 70 }, (_, i) => coin(`new-${i}`))];
    const version = atlas.texture.version;
    atlas.begin([...coins, coins[1]]);
    expect(atlas.slotFor(coins[0])).toBe(619);
    for (let i = 1; i < coins.length; i++) expect(atlas.slotFor(coins[i])).toBe(640 + i - 1);
    expect(atlas.texture.version).toBe(version);
    atlas.end();
    expect(atlas.texture.version).toBe(version + 1);
    expect(canvases).toHaveLength(2);
    expect(drawImage).not.toHaveBeenCalled();
    expect(atlas.grid.toArray()).toEqual([32, 23, 1 / 32, 1 / 23]);
    expect(atlas.texture.image.height).toBe(23 * 128);
    const later = Array.from({ length: 60 }, (_, i) => coin(`later-${i}`));
    atlas.begin(later); later.forEach((c) => atlas.slotFor(c)); atlas.end();
    expect(canvases).toHaveLength(3);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(atlas.slotFor(coins[1])).toBe(640);
    expect(atlas.slotFor(later[0])).toBe(710);
    atlas.dispose();
  });

  it("copies early logos through the original canvas upload path and preserves them during later growth", async () => {
    const { drawImage, g } = canvasHarness();
    const image = decodedLogo();
    const atlas = await EmblemAtlas.load(assets() as unknown as AssetStore, 420);
    const texture = atlas.texture, version = texture.version;
    await atlas.loadLogos();
    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), { premultiplyAlpha: "none" });
    expect(g.clearRect).toHaveBeenCalledWith(0, 0, 4096, 2560);
    expect(drawImage).toHaveBeenCalledWith(image, 0, 0);
    expect(image.close).toHaveBeenCalledTimes(1);
    expect(atlas.texture).toBe(texture);
    expect(atlas.texture.version).toBe(version + 1);
    expect(atlas.grid.toArray()).toEqual([32, 21, 1 / 32, 1 / 21]);
    const canvas = atlas.texture.image;
    const coins = Array.from({ length: 70 }, (_, i) => coin(`new-${i}`));
    atlas.begin([coin("logo-619"), ...coins]);
    expect(atlas.slotFor(coin("logo-619"))).toBe(619);
    coins.forEach((c) => atlas.slotFor(c)); atlas.end();
    expect(drawImage).toHaveBeenCalledWith(canvas, 0, 0);
    expect(atlas.grid.y).toBe(23);
    expect(atlas.texture.image.height).toBe(23 * 128);
    atlas.dispose();
    expect(image.close).toHaveBeenCalledTimes(1);
  });

  it("shares the combined texture and live grid with already-created house flags", async () => {
    canvasHarness(); decodedLogo();
    const atlas = await EmblemAtlas.load(assets() as unknown as AssetStore, 420);
    const flags = new HouseFlags({ uTime: { value: 0 } } as WorldUniforms, atlas, 1);
    const material = flags.mesh.material as ShaderMaterial;
    expect(material.uniforms.uEmblems.value).toBe(atlas.texture);
    expect(material.uniforms.uEmblemGrid.value).toBe(atlas.grid);
    expect(material.fragmentShader).toContain("texture2D(uEmblems, uv)");
    expect(material.fragmentShader).not.toContain("textureGrad");
    await atlas.loadLogos();
    expect(material.uniforms.uEmblems.value.image).toBe(atlas.texture.image);
    expect(material.uniforms.uEmblemGrid.value.y).toBe(21);
    flags.dispose(); atlas.dispose();
  });

  it("only uploads logos once and does not repaint an identical fleet refresh", async () => {
    const { drawImage, g } = canvasHarness(); decodedLogo();
    const atlas = await EmblemAtlas.load(assets() as unknown as AssetStore, 420);
    const coins = [coin("logo-619"), coin("new")];
    atlas.begin(coins); const slots = coins.map((c) => atlas.slotFor(c)); atlas.end();
    const canvas = atlas.texture.image, version = atlas.texture.version, paints = g.arc.mock.calls.length;
    await atlas.loadLogos();
    expect(atlas.texture.image).toBe(canvas);
    expect(atlas.texture.version).toBe(version + 1);
    expect(g.arc).toHaveBeenCalledTimes(paints);
    const publishedVersion = atlas.texture.version, copies = drawImage.mock.calls.length;
    await atlas.loadLogos();
    atlas.begin(coins.map((c) => ({ ...c })));
    expect(coins.map((c) => atlas.slotFor(c))).toEqual(slots); atlas.end();
    expect(atlas.texture.version).toBe(publishedVersion);
    expect(drawImage).toHaveBeenCalledTimes(copies);
    atlas.begin([{ ...coins[1], symbol: "NEXT", brandColor: "#AA7755" }]);
    expect(atlas.slotFor({ ...coins[1], symbol: "NEXT", brandColor: "#AA7755" })).toBe(slots[1]); atlas.end();
    expect(atlas.texture.version).toBe(publishedVersion + 1);
    expect(g.fillText).toHaveBeenLastCalledWith("NEXT", expect.any(Number), expect.any(Number), expect.any(Number));
    atlas.dispose();
  });

  it("finishes pending and later logo slots as monograms on failure", async () => {
    const { g } = canvasHarness();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const atlas = await EmblemAtlas.load(assets() as unknown as AssetStore, 420);
    atlas.begin([coin("logo-1")]); atlas.slotFor(coin("logo-1")); atlas.end();
    expect(g.fillText).not.toHaveBeenCalled();
    await atlas.loadLogos(); expect(g.fillText).toHaveBeenCalledTimes(1);
    atlas.begin([coin("logo-619")]); atlas.slotFor(coin("logo-619")); atlas.end();
    expect(g.fillText).toHaveBeenCalledTimes(2);
    expect(atlas.slotFor(coin("logo-1"))).toBe(1);
    atlas.dispose();
  });

  it("closes a bitmap that finishes decoding after disposal without painting it", async () => {
    const { drawImage } = canvasHarness();
    const image = decodedLogo();
    const atlas = await EmblemAtlas.load(assets() as unknown as AssetStore, 420);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => { atlas.dispose(); return image; }));
    const version = atlas.texture.version;
    await atlas.loadLogos();
    expect(image.close).toHaveBeenCalledTimes(1);
    expect(drawImage).not.toHaveBeenCalled();
    expect(atlas.texture.version).toBe(version);
  });
});
