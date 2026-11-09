import * as THREE from "three";
import type { PreparationService } from "../engine/types";
import type { ShaderMaterial } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssetStore } from "../engine/assets";
import { EmblemAtlas, EMBLEMS_JSON, type EmblemCoin } from "./emblems";
import type { WorldUniforms } from "../engine/uniforms";
import { HouseFlags } from "./house-flags";

function canvasHarness() {
  const drawImage = vi.fn();
  const g = { drawImage, save: vi.fn(), restore: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(), clip: vi.fn(), fillText: vi.fn() };
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
  it("does not start fallback logos or paint after lifetime cancellation", async () => {
    canvasHarness();
    const controller = new AbortController(), store = { ...assets(), signal: controller.signal };
    const atlas = await EmblemAtlas.load(store as unknown as AssetStore, 420);
    const fetcher = vi.fn(() => new Promise<Response>(() => {})); vi.stubGlobal("fetch", fetcher);
    const pending = atlas.loadLogos(); controller.abort(); await pending;
    expect(fetcher).toHaveBeenCalledOnce(); atlas.dispose();
  });
  it("keeps an awaiting-data atlas at one row rather than uploading blank logo rows", async () => {
    const { canvases } = canvasHarness();
    const store = assets();
    const atlas = await EmblemAtlas.load(store as unknown as AssetStore, 420);
    expect(store.json).toHaveBeenCalledWith(EMBLEMS_JSON);
    atlas.begin([]); atlas.end();
    expect(canvases).toHaveLength(1);
    expect(atlas.texture.image.height).toBe(96);
    atlas.dispose();
  });

  it("reserves once before painting, preserves logical slots with 96 px combined mip dimensions", async () => {
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
    expect(atlas.texture.image.height).toBe(23 * 96);
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
    expect(g.clearRect).toHaveBeenCalledWith(0, 0, 3072, 1920);
    expect(drawImage).toHaveBeenCalledWith(image, 0, 0, 4096, 2560, 0, 0, 3072, 1920);
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
    expect(atlas.texture.image.height).toBe(23 * 96);
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

// E04 (O5-I6, ruling V4): a coin without a logo carries sail lettering, not a brand-colour disc
describe("monograms as sail lettering", () => {
  it("draws a monogram slot as the letters alone (an alpha mask), from the first slot after the logo rows", async () => {
    const { g } = canvasHarness();
    const atlas = await EmblemAtlas.load(assets() as unknown as AssetStore, 420);
    expect(atlas.letterSlot).toBe(640);   // 620 logos fill 20 rows of 32
    atlas.begin([coin("new")]);
    const fills: string[] = [];
    g.fillText.mockImplementation(function (this: unknown) { fills.push(String((g as unknown as { fillStyle: string }).fillStyle)); });
    expect(atlas.slotFor(coin("new"))).toBe(640);
    atlas.end();
    expect(g.arc).not.toHaveBeenCalled();                  // no disc, no ring
    expect(g.clearRect).toHaveBeenCalledWith(0, 20 * 96, 96, 96);
    expect(g.fillText).toHaveBeenCalledWith("COIN", 48, 20 * 96 + 48 + 96 * 0.025, 96 * 0.78);
    expect(fills).toEqual(["#FFFFFF"]);                    // white ink: the shaders colour it from the cloth
    atlas.dispose();
  });

  it("keeps the brand-colour roundel for a logo slot until its logo arrives (or as its fallback)", async () => {
    const { g } = canvasHarness();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const atlas = await EmblemAtlas.load(assets() as unknown as AssetStore, 420);
    atlas.begin([coin("logo-3")]); atlas.slotFor(coin("logo-3")); atlas.end();
    expect(g.arc).toHaveBeenCalled();
    expect(g.fillText).not.toHaveBeenCalled();
    await atlas.loadLogos();
    expect(g.fillText).toHaveBeenCalledTimes(1);           // the failed logo's lettered roundel
    atlas.dispose();
  });
});

describe("staged atlas identity", () => {
  it("keeps the visible texture/grid unchanged until the complete painted upload can commit", async () => {
    canvasHarness();
    const atlas = await EmblemAtlas.load(assets() as unknown as AssetStore, 420);
    const original = atlas.texture, originalGrid = atlas.grid.clone();
    const submit = vi.fn(async (work: (deadline: number) => void) => work(-Infinity));
    const stageTexture = vi.fn(async () => {});
    const preparation = { submit, stageTexture } as unknown as PreparationService;
    const delta = await atlas.prepareCoins([coin("new")], preparation);
    expect(atlas.texture).toBe(original); expect(atlas.grid.equals(originalGrid)).toBe(true);
    expect(submit.mock.calls.length).toBeGreaterThan(1); expect(stageTexture).toHaveBeenCalledOnce();
    expect(delta.slots.get("new")).toBe(640);
    delta.commit(); delta.dispose();
    expect(atlas.uniform.value).toBe(atlas.texture); expect(atlas.texture).not.toBe(original);
    expect(atlas.texture.image).toMatchObject({ width: 3072, height: 21 * 96 });
    const flags = new HouseFlags({ uTime: { value: 0 } } as WorldUniforms, atlas, 1);
    expect((flags.mesh.material as ShaderMaterial).uniforms.uEmblems).toBe(atlas.uniform);
    flags.dispose(); atlas.dispose();
  });

  it("disposes a superseded detached atlas without consuming live slots or changing its version", async () => {
    canvasHarness();
    const atlas = await EmblemAtlas.load(assets() as unknown as AssetStore, 420), original = atlas.texture;
    const controller = new AbortController(), disposed = vi.fn();
    const preparation = {
      submit: async (work: (deadline: number) => void) => work(-Infinity),
      stageTexture: async (texture: THREE.Texture) => { texture.addEventListener("dispose", disposed); controller.abort(); },
    } as unknown as PreparationService;
    await expect(atlas.prepareCoins([coin("cancelled")], preparation, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(disposed).toHaveBeenCalledOnce(); expect(atlas.texture).toBe(original); expect(atlas.grid.y).toBe(1);
    expect(atlas.slotFor(coin("first"))).toBe(640); atlas.dispose();
  });

  it("restores hover and selection/search into two 256 px tiles with shared shader uniforms", async () => {
    const { g } = canvasHarness(); const image = decodedLogo();
    const atlas = await EmblemAtlas.load(assets() as unknown as AssetStore, 420);
    const logo = { ...coin("logo-1"), logo: "/logos/test.png" }, letters = coin("letters");
    atlas.begin([logo, letters]); atlas.slotFor(logo); atlas.slotFor(letters); atlas.end();
    const base = atlas.texture, stageTexture = vi.fn(async () => {});
    await atlas.setHeroes([logo, letters], { stageTexture } as unknown as PreparationService);
    expect(atlas.heroUniform.value.image).toMatchObject({ width: 512, height: 256 });
    expect(atlas.heroSlots.value.toArray()).toEqual([1, 640]); expect(atlas.texture).toBe(base);
    expect(stageTexture).toHaveBeenCalledOnce(); expect(image.close).toHaveBeenCalledOnce();
    expect(g.fillText).toHaveBeenLastCalledWith("COIN", 384, 128 + 256 * 0.025, 256 * 0.78);
    const flags = new HouseFlags({ uTime: { value: 0 } } as WorldUniforms, atlas, 1), u = (flags.mesh.material as ShaderMaterial).uniforms;
    expect(u.uHeroEmblems).toBe(atlas.heroUniform); expect(u.uHeroSlots).toBe(atlas.heroSlots);
    await atlas.setHeroes([logo, letters]); expect(stageTexture).toHaveBeenCalledOnce();
    await atlas.setHeroes([]); expect(atlas.heroSlots.value.toArray()).toEqual([-1, -1]);
    flags.dispose(); atlas.dispose();
  });

  it("closes a superseded inspection decode and never publishes its old coin", async () => {
    canvasHarness();
    const atlas = await EmblemAtlas.load(assets() as unknown as AssetStore, 420);
    atlas.begin([coin("logo-1"), coin("other")]); atlas.slotFor(coin("logo-1")); atlas.slotFor(coin("other")); atlas.end();
    const image = decodedLogo();
    let resolve!: (image: unknown) => void;
    vi.stubGlobal("createImageBitmap", vi.fn(() => new Promise((done) => { resolve = done; })));
    const old = atlas.setHeroes([{ ...coin("logo-1"), logo: "/logos/test.png" }]);
    for (let i = 0; i < 12; i++) await Promise.resolve();
    await atlas.setHeroes([coin("other")]); resolve(image); await old;
    for (let i = 0; i < 4; i++) await Promise.resolve();
    expect(image.close).toHaveBeenCalledOnce(); expect(atlas.heroSlots.value.x).toBe(640);
    atlas.dispose();
  });
});
