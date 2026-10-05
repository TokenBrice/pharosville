// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { LinearMipmapLinearFilter, MeshStandardMaterial, NoColorSpace, ShaderLib, SRGBColorSpace, Texture, UniformsUtils } from "three";
import {
  acquireGardenSurfaceAtlas, createGardenSurfaceAtlasOwner, gardenSurfaceFootprintFade,
  GARDEN_SURFACE_ATLAS_RGBA_BYTES, GARDEN_SURFACE_ATLAS_URLS, GARDEN_SURFACE_GLSL,
  unpackGardenSurfaceMipStrip, type GardenSurfaceAtlasLease, type GardenSurfaceAtlasOwner,
} from "./garden-surface-atlas";
import { applyGardenSurface, type GardenSurfaceMapping } from "./garden-surfaces";

const leases: GardenSurfaceAtlasLease[] = [];
const owners: GardenSurfaceAtlasOwner[] = [];
afterEach(() => {
  for (const owner of owners.splice(0)) owner.release();
  for (const lease of leases.splice(0)) lease.release();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function lease(onReady: () => void = () => {}) {
  const result = acquireGardenSurfaceAtlas(onReady);
  if (!result) throw new Error("Expected a DOM atlas lease.");
  leases.push(result);
  return result;
}
function decoder() {
  const pixels = new Uint8ClampedArray(2047 * 1024 * 4);
  const close = vi.fn();
  const bitmap = vi.fn(async () => ({ width: 2047, height: 1024, close }));
  vi.stubGlobal("createImageBitmap", bitmap);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(), getImageData: () => ({ data: pixels }),
  } as unknown as CanvasRenderingContext2D);
  const fetcher = vi.fn(async (url: string) => ({ ok: true, url, blob: async () => new Blob() }));
  vi.stubGlobal("fetch", fetcher);
  return { bitmap, close, fetcher };
}

describe("renderer-owned garden surface atlas", () => {
  it("does not request or allocate atlas maps until a desktop consumer leases", async () => {
    const { fetcher, bitmap, close } = decoder();
    const ready = vi.fn();
    const owner = createGardenSurfaceAtlasOwner(ready);
    owners.push(owner);
    expect(fetcher).not.toHaveBeenCalled();
    expect(owner.textures).toBeNull();
    const first = owner.lease();
    if (!first) throw new Error("Expected an owner lease.");
    expect(owner.textures).toBe(first.textures);
    const second = lease();
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual(Object.values(GARDEN_SURFACE_ATLAS_URLS));
    expect(second.textures).toBe(first.textures);
    expect(second.uniforms).toBe(first.uniforms);
    expect(await first.ready).toBe(true);
    expect(bitmap).toHaveBeenCalledTimes(3);
    expect(close).toHaveBeenCalledTimes(3);
    expect(ready).toHaveBeenCalledOnce();
    expect(first.uniforms.uGardenSurfaceAtlasReady.value).toBe(1);
    for (const [name, texture] of Object.entries(first.textures)) {
      expect(texture.colorSpace).toBe(name === "albedo" ? SRGBColorSpace : NoColorSpace);
      expect(texture.generateMipmaps).toBe(false);
      expect(texture.flipY).toBe(false);
      expect(texture.minFilter).toBe(LinearMipmapLinearFilter);
      expect(texture.mipmaps).toHaveLength(11);
      expect(texture.image.width).toBe(1024);
    }
    const disposers = Object.values(first.textures).map((texture) => vi.spyOn(texture, "dispose"));
    owner.release(); owner.release();
    expect(owner.textures).toBeNull();
    for (const dispose of disposers) expect(dispose).not.toHaveBeenCalled();
    second.release(); second.release();
    for (const dispose of disposers) expect(dispose).toHaveBeenCalledOnce();
    expect(owner.lease()).toBeNull();
    const later = lease();
    expect(later.textures.albedo).not.toBe(first.textures.albedo);
    await later.ready;
  });

  it("keeps surviving readiness listeners even when owners reuse a callback", async () => {
    decoder();
    const ready = vi.fn();
    const first = lease(ready), second = lease(ready);
    first.release();
    expect(await second.ready).toBe(true);
    expect(ready).toHaveBeenCalledOnce();
  });

  it("aborts the last lease and closes late bitmaps without resurrecting disposed maps", async () => {
    decoder();
    let resolveBitmap!: (value: { width: number; height: number; close: () => void }) => void;
    const pending = new Promise<{ width: number; height: number; close: () => void }>((resolve) => { resolveBitmap = resolve; });
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn(() => pending));
    const ready = vi.fn(), atlas = lease(ready);
    const dispose = vi.spyOn(atlas.textures.albedo, "dispose");
    atlas.release();
    resolveBitmap({ width: 2047, height: 1024, close });
    expect(await atlas.ready).toBe(false);
    expect(close).toHaveBeenCalledTimes(3);
    expect(dispose).toHaveBeenCalledOnce();
    expect(ready).not.toHaveBeenCalled();
    expect(atlas.textures.albedo.mipmaps).toHaveLength(0);
    expect(atlas.uniforms.uGardenSurfaceAtlasReady.value).toBe(0);
  });

  it("retains neutral static recipes and exposes a failed strip request", async () => {
    decoder();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    const ready = vi.fn(), atlas = lease(ready);
    expect(await atlas.ready).toBe(false);
    expect(atlas.error?.message).toContain("404");
    expect(atlas.uniforms.uGardenSurfaceAtlasReady.value).toBe(0);
    expect(ready).toHaveBeenCalledOnce();
  });

  it("returns no lease and makes zero requests without a DOM", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("document", undefined);
    expect(acquireGardenSurfaceAtlas()).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("binds every garden-owned composed sampler to a complete Texture before and after decode", async () => {
    decoder();
    const atlas = lease();
    const placeholders = { ...atlas.textures };
    const disposers = Object.values(placeholders).map((texture) => vi.spyOn(texture, "dispose"));
    const uniformEntries = { ...atlas.uniforms };
    const samplerNames = { albedo: "uGardenSurfaceAlbedo", normal: "uGardenSurfaceNormal", orm: "uGardenSurfaceOrm" } as const;
    const compiled: { material: MeshStandardMaterial; version: number; key: string; uniforms: typeof atlas.uniforms }[] = [];
    for (const mapping of ["worldXZ", "triplanar", "uv"] as GardenSurfaceMapping[]) {
      const material = new MeshStandardMaterial();
      applyGardenSurface(material, { role: "stone", mapping, metresPerRepeat: 1, detailStrength: .5, detailSource: atlas.detailSource });
      const shader = {
        vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader,
        uniforms: UniformsUtils.clone(ShaderLib.standard.uniforms),
      };
      material.onBeforeCompile(shader as never, null as never);
      // Built-in optional maps are guarded by three's defines; inspect only the
      // atlas namespace, whose three samplers are active for every mapping.
      const names = [...shader.fragmentShader.matchAll(/\buniform\s+[iu]?sampler\w+\s+(uGardenSurface\w+)\s*;/g)].map((match) => match[1]);
      expect(names.sort()).toEqual(["uGardenSurfaceAlbedo", "uGardenSurfaceNormal", "uGardenSurfaceOrm"]);
      for (const name of names) {
        const texture = shader.uniforms[name]?.value;
        expect(texture).toBeInstanceOf(Texture);
        expect(texture.image.width).toBe(1);
        expect(texture.image.height).toBe(1);
        expect(texture.image.data).toHaveLength(4);
        expect(texture.mipmaps).toHaveLength(1);
        expect(texture.version).toBeGreaterThan(0);
      }
      compiled.push({ material, version: material.version, key: material.customProgramCacheKey(), uniforms: shader.uniforms });
    }
    expect(await atlas.ready).toBe(true);
    for (const name of ["albedo", "normal", "orm"] as const) {
      const texture = atlas.textures[name], uniformName = samplerNames[name];
      expect(texture).not.toBe(placeholders[name]);
      expect(texture.source).not.toBe(placeholders[name].source);
      expect(placeholders[name].image.width).toBe(1); // old immutable storage was never resized
      expect(atlas.uniforms[uniformName]).toBe(uniformEntries[uniformName]);
      expect(atlas.uniforms[uniformName].value).toBe(texture);
    }
    for (const dispose of disposers) expect(dispose).toHaveBeenCalledOnce();
    for (const entry of compiled) {
      expect(entry.material.version).toBe(entry.version);
      expect(entry.material.customProgramCacheKey()).toBe(entry.key);
      for (const name of Object.values(samplerNames)) {
        expect(entry.uniforms[name]).toBe(uniformEntries[name]);
        expect(entry.uniforms[name].value).toBe(atlas.uniforms[name].value);
      }
      entry.material.dispose();
    }
    for (const match of GARDEN_SURFACE_GLSL.matchAll(/\buniform\s+[iu]?sampler\w+\s+(uGardenSurface\w+)\s*;/g)) {
      const texture = atlas.uniforms[match[1]].value;
      expect(texture).toBeInstanceOf(Texture);
      expect(texture.image.width).toBe(1024);
      expect(texture.mipmaps).toHaveLength(11);
    }
  });
});

describe("authored atlas filtering", () => {
  it("extracts every mip at its own strip offset without resampling or cross-cell GPU mips", () => {
    const pixels = new Uint8ClampedArray(2047 * 1024 * 4);
    for (let size = 1024, x = 0, i = 0; size >= 1; x += size, size >>= 1, i++) pixels[(2047 + x) * 4] = i + 1;
    const levels = unpackGardenSurfaceMipStrip(pixels, 2047, 1024);
    expect(levels).toHaveLength(11);
    expect(levels.reduce((sum, level) => sum + level.data.byteLength, 0) * 3).toBe(GARDEN_SURFACE_ATLAS_RGBA_BYTES);
    expect(GARDEN_SURFACE_ATLAS_RGBA_BYTES).toBeLessThanOrEqual(16 * 1024 * 1024);
    for (const [i, level] of levels.entries()) {
      expect(level.width).toBe(1024 >> i);
      expect(level.height).toBe(level.width);
      if (level.height > 1) expect(level.data[level.width * 4]).toBe(i + 1);
    }
    expect(() => unpackGardenSurfaceMipStrip(pixels, 1024, 1024)).toThrow(/dimensions/);
  });

  it("fades completely before a footprint can exceed the first mip's gutter", () => {
    expect(gardenSurfaceFootprintFade(0)).toBe(1);
    expect(gardenSurfaceFootprintFade(1)).toBe(1);
    expect(gardenSurfaceFootprintFade(1.5)).toBe(.5);
    expect(gardenSurfaceFootprintFade(2)).toBe(0);
    expect(gardenSurfaceFootprintFade(1000)).toBe(0);
    let previous = 1;
    for (let footprint = 0; footprint <= 4; footprint += .125) {
      const fade = gardenSurfaceFootprintFade(footprint);
      expect(fade).toBeLessThanOrEqual(previous);
      previous = fade;
    }
    expect(GARDEN_SURFACE_GLSL).toContain("textureGrad(");
    expect(GARDEN_SURFACE_GLSL).toContain("qx = dFdx(q), qy = dFdy(q)");
    expect(GARDEN_SURFACE_GLSL).toContain("fract(repeatUv)");
    expect(GARDEN_SURFACE_GLSL).toContain("abs(n.y) < 0.65 && abs(role - 1.0) < 0.5");
    expect(GARDEN_SURFACE_GLSL).not.toMatch(/uTime|texture2D\(/);
  });

  it("retains diffuse grain beyond neutral relief with bounded, cell-safe authored mips", () => {
    expect(gardenSurfaceFootprintFade(2)).toBe(0);
    expect(gardenSurfaceFootprintFade(2, "diffuse")).toBe(1);
    expect(gardenSurfaceFootprintFade(16, "diffuse")).toBe(1);
    expect(gardenSurfaceFootprintFade(24, "diffuse")).toBe(.5);
    expect(gardenSurfaceFootprintFade(32, "diffuse")).toBe(0);
    for (const channel of ["normal", "diffuse"] as const) {
      for (const invalid of [NaN, Infinity, -Infinity]) expect(gardenSurfaceFootprintFade(invalid, channel)).toBe(0);
      let previous = 1;
      for (let footprint = 0; footprint <= 64; footprint += .125) {
        const fade = gardenSurfaceFootprintFade(footprint, channel);
        expect(fade).toBeGreaterThanOrEqual(0);
        expect(fade).toBeLessThanOrEqual(previous);
        previous = fade;
      }
    }
    // Mirror the shader's per-integer-mip coordinates: both bilinear taps must
    // remain inside the chosen role even at repeat seams and fractional gutters.
    for (let role = 0; role < 7; role++) for (let level = 0; level <= 5; level++) {
      const scale = 2 ** -level, cell = 128 * scale, atlas = 1024 * scale;
      for (const repeat of [-.00001, 0, .00001, .5, .99999, 1, 1000.99999]) {
        const local = Math.max(.5, Math.min(cell - .5, (2 + (repeat - Math.floor(repeat)) * 124) * scale));
        const x = (role * cell + local) / atlas * atlas;
        const y = local / atlas * atlas;
        expect(x - .5).toBeGreaterThanOrEqual(role * cell);
        expect(x + .5).toBeLessThanOrEqual((role + 1) * cell);
        expect(y - .5).toBeGreaterThanOrEqual(0);
        expect(y + .5).toBeLessThanOrEqual(cell);
      }
    }
    expect(GARDEN_SURFACE_GLSL).toContain("clamp(log2(max(1.0, footprint)), 0.0, 5.0)");
    expect(GARDEN_SURFACE_GLSL).toContain("textureLod(uGardenSurfaceAlbedo");
    expect(GARDEN_SURFACE_GLSL).toContain("textureLod(uGardenSurfaceOrm");
    expect(GARDEN_SURFACE_GLSL).toContain("vec2(0.5), vec2(cell - 0.5)");
    expect(GARDEN_SURFACE_GLSL).toContain("isnan(footprint) || isinf(footprint)");
  });
});
