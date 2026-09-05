import { describe, expect, it } from "vitest";
import { CubeTexture, Data3DTexture, DataArrayTexture, DepthTexture, FloatType, HalfFloatType, Mesh, MeshBasicMaterial, PlaneGeometry, RGBAFormat, Scene, Texture, UnsignedByteType, UnsignedShortType, WebGLRenderTarget, type TextureDataType, type WebGLRenderer } from "three";
import { estimateRenderTargetExtraBytes, estimateTextureBytes } from "./texture-byte-estimate";
import { textureOwnerCensus } from "./texture-owner-census";

function colorTexture(type: TextureDataType = UnsignedByteType) {
  const texture = new Texture({ width: 4, height: 4 });
  texture.type = type;
  texture.format = RGBAFormat;
  texture.generateMipmaps = false;
  return texture;
}

describe("logical storage estimates", () => {
  it("accounts for rgba8, half-float, exact mip levels, cube faces, and depth formats", () => {
    const color = colorTexture();
    expect(estimateTextureBytes(color)).toBe(64);
    color.generateMipmaps = true;
    expect(estimateTextureBytes(color)).toBe((16 + 4 + 1) * 4);
    expect(estimateTextureBytes(colorTexture(HalfFloatType))).toBe(128);
    const cube = new CubeTexture(Array.from({ length: 6 }, () => ({ width: 4, height: 4 })));
    cube.generateMipmaps = false;
    expect(estimateTextureBytes(cube)).toBe(6 * 64);
    expect(estimateTextureBytes(new DepthTexture(4, 4, UnsignedShortType))).toBe(32);
    expect(estimateTextureBytes(new DepthTexture(4, 4, FloatType))).toBe(64);
    expect(estimateTextureBytes(new Texture())).toBeNull();
  });

  it("includes a volume's depth in its full mip chain while array layers stay constant", () => {
    const volume = new Data3DTexture(new Uint8Array(2 * 2 * 8 * 4), 2, 2, 8);
    volume.generateMipmaps = true;
    expect(estimateTextureBytes(volume)).toBe((2 * 2 * 8 + 1 * 1 * 4 + 1 * 1 * 2 + 1) * 4);
    const array = new DataArrayTexture(new Uint8Array(2 * 2 * 8 * 4), 2, 2, 8);
    array.generateMipmaps = true;
    expect(estimateTextureBytes(array)).toBe((2 * 2 + 1) * 8 * 4);
    volume.dispose(); array.dispose();
  });

  it("adds separate MSAA color/depth storage once, clamps sample support, and excludes resolved depth textures", () => {
    const target = new WebGLRenderTarget(4, 4, { type: HalfFloatType, samples: 4 });
    expect(estimateTextureBytes(target.texture)).toBe(128);
    expect(estimateRenderTargetExtraBytes(target)).toBe(4 * 128 + 4 * 64 + 64);
    expect(estimateRenderTargetExtraBytes(target, 2)).toBe(2 * 128 + 2 * 64 + 64);
    target.depthTexture = new DepthTexture(4, 4, UnsignedShortType);
    expect(estimateRenderTargetExtraBytes(target)).toBe(4 * 128 + 4 * 32);
    target.dispose();
  });

  it("deduplicates scene references, targets, and live handles while exposing unknown allocations", () => {
    const scene = new Scene();
    const target = new WebGLRenderTarget(4, 4, { samples: 4 });
    target.depthTexture = new DepthTexture(4, 4, UnsignedShortType);
    const shared = colorTexture();
    const alias = shared.clone();
    const unknown = new Texture();
    const geometry = new PlaneGeometry();
    const material = new MeshBasicMaterial({ map: target.texture });
    scene.add(new Mesh(geometry, material), new Mesh(geometry, material));
    const properties = new Map<object, Record<string, unknown>>();
    const sharedHandle = {};
    properties.set(target.texture, { __webglTexture: {} });
    properties.set(target.depthTexture, { __webglTexture: {} });
    properties.set(target, { __webglFramebuffer: {}, __webglMultisampledFramebuffer: {} });
    properties.set(shared, { __webglTexture: sharedHandle });
    properties.set(alias, { __webglTexture: sharedHandle });
    const renderer = { properties: { get: (object: object) => properties.get(object) ?? {} }, capabilities: { maxSamples: 4 } } as unknown as WebGLRenderer;
    const manifest = [
      { owner: "target", texture: target.texture }, { owner: "target duplicate", texture: target.texture },
      { owner: "shared", texture: shared }, { owner: "alias", texture: alias }, { owner: "unknown", texture: unknown },
    ];
    const census = textureOwnerCensus(scene, 5, manifest, renderer);
    expect(census.referencedTextures).toBe(1);
    expect(census.attributedTextures).toBe(5); // Includes the native target's depth attachment.
    expect(census.attributedLiveTextures).toBe(3);
    expect(census.minimumUnattributedRendererTextures).toBe(2);
    expect(census.byteEstimates).toEqual({
      textureBytes: 64 + 32 + 64 + 64,
      liveTextureBytes: 64 + 32 + 64,
      renderbufferBytes: 4 * 64 + 4 * 32,
      liveRenderbufferBytes: 4 * 64 + 4 * 32,
      unknownTextureCount: 1, unknownLiveTextureCount: 0, unknownRenderTargetCount: 0,
    });
    properties.set(target, { __webglFramebuffer: {} });
    expect(textureOwnerCensus(scene, 5, manifest, renderer).byteEstimates.unknownRenderTargetCount).toBe(1);
    target.dispose(); geometry.dispose(); material.dispose(); shared.dispose(); alias.dispose(); unknown.dispose();
  });
});
