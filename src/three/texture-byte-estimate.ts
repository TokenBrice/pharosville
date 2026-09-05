import { DepthFormat, DepthStencilFormat, FloatType, TextureUtils, UnsignedShortType, type RenderTarget, type Texture } from "three";

// Logical storage estimates, never driver VRAM: excludes alignment, pooling,
// default-framebuffer storage, and allocations unreachable from the census.
// DEPTH24 uses a conventional four-byte storage estimate; driver packing can differ.
function levelBytes(texture: Texture, width: number, height: number): number | null {
  if (texture.internalFormat !== null) return null; // A driver-format override needs its own accounting.
  if (texture.format === DepthFormat) return width * height * (texture.type === UnsignedShortType ? 2 : 4);
  if (texture.format === DepthStencilFormat) return width * height * (texture.type === FloatType ? 8 : 4);
  try { return TextureUtils.getByteLength(width, height, texture.format, texture.type); }
  catch { return null; }
}

export function estimateTextureBytes(texture: Texture, baseLevelOnly = false): number | null {
  const cube = "isCubeTexture" in texture && texture.isCubeTexture;
  const source = texture.image as { width?: number; height?: number; depth?: number; videoWidth?: number; videoHeight?: number; naturalWidth?: number; naturalHeight?: number; mipmaps?: unknown[] } | undefined;
  const face = Array.isArray(source) ? source[0] : undefined;
  const image = (cube ? face?.image ?? face : source) as typeof source;
  const width = image?.videoWidth || image?.naturalWidth || image?.width;
  const height = image?.videoHeight || image?.naturalHeight || image?.height;
  const depth = image?.depth ?? 1;
  if (!width || !height || ![width, height, depth].every((n) => typeof n === "number" && Number.isInteger(n) && n > 0)) return null;
  const volume = "isData3DTexture" in texture && texture.isData3DTexture;
  const explicitMipmaps = texture.mipmaps.length || image?.mipmaps?.length || 0;
  const levels = baseLevelOnly ? 1 : texture.generateMipmaps
    ? Math.floor(Math.log2(Math.max(width, height, volume ? depth : 1))) + 1 : Math.max(1, explicitMipmaps);
  let bytes = 0;
  for (let level = 0; level < levels; level += 1) {
    const size = levelBytes(texture, Math.max(1, Math.floor(width / 2 ** level)), Math.max(1, Math.floor(height / 2 ** level)));
    if (size === null) return null;
    const layers = volume ? Math.max(1, Math.floor(depth / 2 ** level)) : depth;
    bytes += size * layers * (cube ? 6 : 1);
  }
  return bytes;
}

/** Extra renderbuffer storage alongside resolved textures, for Three's ordinary
 * separate-MSAA path. Implicit multisampled-render-to-texture storage is unknown.
 */
export function estimateRenderTargetExtraBytes(target: RenderTarget, maxSamples = target.samples): number | null {
  const samples = Math.min(target.samples, maxSamples);
  const cubeFaces = "isWebGLCubeRenderTarget" in target && target.isWebGLCubeRenderTarget ? 6 : 1;
  const depthBytes = target.width * target.height * cubeFaces * (target.stencilBuffer
    ? target.depthTexture?.type === FloatType ? 8 : 4
    : target.depthTexture?.type === UnsignedShortType ? 2 : 4);
  let bytes = target.depthBuffer && !target.depthTexture ? depthBytes : 0;
  if (samples > 0) {
    for (const texture of target.textures) {
      const colorBytes = estimateTextureBytes(texture, true);
      if (colorBytes === null) return null;
      bytes += colorBytes * samples;
    }
    if (target.depthBuffer) bytes += depthBytes * samples;
  }
  return bytes;
}
