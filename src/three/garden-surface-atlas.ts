import { ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RGBAFormat, SRGBColorSpace, UnsignedByteType, type IUniform } from "three";
import { GARDEN_SURFACE_GLSL as DETAIL_GLSL, type GardenSurfaceDetailSource } from "./garden-surfaces";

export const GARDEN_SURFACE_ATLAS_URLS = {
  albedo: "/pharosville/textures/garden-surface-albedo.png?v=603ffd39fe8d",
  normal: "/pharosville/textures/garden-surface-normal.png?v=39c285ae8d27",
  orm: "/pharosville/textures/garden-surface-orm.png?v=797afc8044b6",
} as const;
export const GARDEN_SURFACE_ATLAS_SIZE = 1024;
export const GARDEN_SURFACE_ATLAS_CELL = 128;
export const GARDEN_SURFACE_ATLAS_GUTTER = 2;
export const GARDEN_SURFACE_ATLAS_LEVELS = 11;
export const GARDEN_SURFACE_ATLAS_RGBA_BYTES = 16_777_212;

/** Relief fades before fractional gutters; diffuse survives on cell-clamped mips. */
export function gardenSurfaceFootprintFade(footprintTexels: number, channel: "normal" | "diffuse" = "normal"): number {
  if (!Number.isFinite(footprintTexels)) return 0;
  const start = channel === "diffuse" ? 16 : 1;
  const t = Math.max(0, Math.min(1, (footprintTexels - start) / start));
  return 1 - t * t * (3 - 2 * t);
}

const SAMPLING_GLSL = /* glsl */`
uniform sampler2D uGardenSurfaceAlbedo;
uniform sampler2D uGardenSurfaceNormal;
uniform sampler2D uGardenSurfaceOrm;
uniform float uGardenSurfaceAtlasReady;
struct GardenSurfacePlane { vec3 albedo; float roughness; vec2 slope; };
vec2 gardenSurfaceMipUv(vec2 repeatUv, float role, float level) {
  float scale = exp2(-level);
  float cell = 128.0 * scale;
  // Each integer mip's bilinear footprint is kept inside its own role cell.
  // Coarse fractional gutters are never allowed to fetch a neighbouring role.
  vec2 localUv = clamp((vec2(2.0) + fract(repeatUv) * 124.0) * scale,
    vec2(0.5), vec2(cell - 0.5));
  return (vec2(role * cell, 0.0) + localUv) / (1024.0 * scale);
}
GardenSurfacePlane gardenSurfacePlane(vec2 repeatUv, vec2 dx, vec2 dy, float role) {
  // Explicit gradients are derived from unwrapped coordinates at the call site.
  float footprint = max(length(dx), length(dy)) * 124.0;
  if (isnan(footprint) || isinf(footprint) || any(isnan(repeatUv)) || any(isinf(repeatUv))
    || isnan(role) || isinf(role))
    return GardenSurfacePlane(vec3(1.0), 0.0, vec2(0.0));
  float normalFade = 1.0 - smoothstep(1.0, 2.0, footprint);
  float diffuseFade = 1.0 - smoothstep(16.0, 32.0, footprint);
  if (diffuseFade <= 0.0 || uGardenSurfaceAtlasReady < 0.5)
    return GardenSurfacePlane(vec3(1.0), 0.0, vec2(0.0));
  float roleIndex = clamp(floor(role + 0.5), 0.0, 6.0);
  float lod = clamp(log2(max(1.0, footprint)), 0.0, 5.0);
  float lowerLevel = floor(lod), levelBlend = fract(lod);
  vec2 lowerUv = gardenSurfaceMipUv(repeatUv, roleIndex, lowerLevel);
  vec3 albedo = textureLod(uGardenSurfaceAlbedo, lowerUv, lowerLevel).rgb;
  vec3 orm = textureLod(uGardenSurfaceOrm, lowerUv, lowerLevel).rgb;
  if (levelBlend > 0.0) {
    float upperLevel = min(5.0, lowerLevel + 1.0);
    vec2 upperUv = gardenSurfaceMipUv(repeatUv, roleIndex, upperLevel);
    albedo = mix(albedo, textureLod(uGardenSurfaceAlbedo, upperUv, upperLevel).rgb, levelBlend);
    orm = mix(orm, textureLod(uGardenSurfaceOrm, upperUv, upperLevel).rgb, levelBlend);
  }
  albedo /= 0.723055;
  vec2 slope = vec2(0.0);
  if (normalFade > 0.0) {
    vec2 uv = gardenSurfaceMipUv(repeatUv, roleIndex, 0.0);
    vec2 gx = dx * (124.0 / 1024.0), gy = dy * (124.0 / 1024.0);
    vec3 relief = textureGrad(uGardenSurfaceNormal, uv, gx, gy).xyz;
    slope = (relief.xy * 255.0 - vec2(128.0)) / 127.0;
    slope *= normalFade / max(0.9, relief.z * 2.0 - 1.0);
  }
  return GardenSurfacePlane(mix(vec3(1.0), albedo * orm.r, diffuseFade),
    (orm.g - 128.0 / 255.0) * 0.2 * diffuseFade, slope);
}
// Convert tangent relief to a world-space offset, preserving the base normal.
vec3 gardenSurfaceReorient(vec2 slope, vec3 tangent, vec3 bitangent, vec3 n) {
  vec3 offset = tangent * slope.x + bitangent * slope.y;
  return offset - n * dot(n, offset);
}
GardenSurfaceDetail gardenSampleSurface(vec3 p, vec3 n, vec2 uvMetres, float role, float metresPerRepeat) {
  float scale = 1.0 / max(0.001, metresPerRepeat);
  vec3 q = p * scale, qx = dFdx(q), qy = dFdy(q);
  #ifdef GARDEN_SURFACE_UV
    vec2 uv = uvMetres * scale, ux = dFdx(uv), uy = dFdy(uv);
    GardenSurfacePlane sampleUv = gardenSurfacePlane(uv, ux, uy, role);
    // Derivative cotangent frame handles rotated/grain-oriented metric UVs.
    vec3 px = dFdx(p), py = dFdy(p);
    vec3 t = cross(py, n) * ux.x + cross(n, px) * uy.x;
    vec3 b = cross(py, n) * ux.y + cross(n, px) * uy.y;
    float frameScale = inversesqrt(max(1e-12, max(dot(t,t), dot(b,b))));
    return GardenSurfaceDetail(sampleUv.albedo, sampleUv.roughness,
      gardenSurfaceReorient(sampleUv.slope, t * frameScale, b * frameScale, n));
  #else
    GardenSurfacePlane ground = gardenSurfacePlane(q.xz, qx.xz, qy.xz, role);
    vec3 groundNormal = gardenSurfaceReorient(ground.slope, vec3(1,0,0), vec3(0,0,1), n);
    #ifdef GARDEN_SURFACE_TRIPLANAR
      // Only steep stone pays for side planes; ground and all other roles stay
      // one plane. Gradients above precede this branch as well as repeat/fract.
      if (abs(n.y) < 0.65 && abs(role - 1.0) < 0.5) {
        GardenSurfacePlane sideX = gardenSurfacePlane(q.zy, qx.zy, qy.zy, role);
        GardenSurfacePlane sideZ = gardenSurfacePlane(q.xy, qx.xy, qy.xy, role);
        vec3 weights = pow(abs(n), vec3(4.0));
        weights /= max(1e-6, weights.x + weights.y + weights.z);
        vec3 nx = gardenSurfaceReorient(sideX.slope, vec3(0,0,1), vec3(0,1,0), n);
        vec3 nz = gardenSurfaceReorient(sideZ.slope, vec3(1,0,0), vec3(0,1,0), n);
        return GardenSurfaceDetail(sideX.albedo * weights.x + ground.albedo * weights.y + sideZ.albedo * weights.z,
          dot(vec3(sideX.roughness, ground.roughness, sideZ.roughness), weights),
          nx * weights.x + groundNormal * weights.y + nz * weights.z);
      }
    #endif
    return GardenSurfaceDetail(ground.albedo, ground.roughness, groundNormal);
  #endif
}
`;
/** ShaderMaterial consumers include this and select a mapping define. */
export const GARDEN_SURFACE_GLSL = DETAIL_GLSL + SAMPLING_GLSL;
export type GardenSurfaceAtlasUniforms = Readonly<Record<string, IUniform>>;
type MapName = keyof typeof GARDEN_SURFACE_ATLAS_URLS;
interface AtlasState {
  textures: Record<MapName, DataTexture>;
  uniforms: GardenSurfaceAtlasUniforms;
  source: GardenSurfaceDetailSource;
  controller: AbortController;
  listeners: Set<() => void>;
  ready: Promise<boolean>;
  error: Error | null;
  leases: number;
  disposed: boolean;
  settled: boolean;
}
export interface GardenSurfaceAtlasLease {
  /** Values replace neutral placeholders on readiness; materials bind shared uniforms, not cached textures. */
  readonly textures: Readonly<Record<MapName, DataTexture>>;
  readonly uniforms: GardenSurfaceAtlasUniforms;
  readonly detailSource: GardenSurfaceDetailSource;
  readonly ready: Promise<boolean>;
  readonly error: Error | null;
  release(): void;
}
export interface GardenSurfaceAtlasOwner {
  /** Census/upload seam; null without a live consumer lease. */
  readonly textures: Readonly<Record<MapName, DataTexture>> | null;
  /** No load or residency until this method is called by a consumer. */
  lease(): GardenSurfaceAtlasLease | null;
  release(): void;
}
let shared: AtlasState | null = null;

/** Extract left-to-right authored mips from an RGBA strip without resampling. */
export function unpackGardenSurfaceMipStrip(data: Uint8ClampedArray, width: number, height: number) {
  if (width !== 2047 || height !== 1024 || data.length !== width * height * 4)
    throw new Error("Invalid garden surface mip strip dimensions.");
  const levels: { data: Uint8Array; width: number; height: number }[] = [];
  let x = 0;
  for (let size = GARDEN_SURFACE_ATLAS_SIZE; size >= 1; size >>= 1) {
    const pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      const start = (y * width + x) * 4;
      pixels.set(data.subarray(start, start + size * 4), y * size * 4);
    }
    levels.push({ data: pixels, width: size, height: size });
    x += size;
  }
  return levels;
}
async function decodeStrip(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal, credentials: "same-origin", mode: "same-origin" });
  if (!response.ok) throw new Error(`Garden surface atlas request failed: ${response.status} ${url}`);
  const bitmap = await createImageBitmap(await response.blob(), {
    colorSpaceConversion: "none", premultiplyAlpha: "none", imageOrientation: "none",
  });
  try {
    if (signal.aborted) throw new Error("Garden surface atlas owner released.");
    if (bitmap.width !== 2047 || bitmap.height !== 1024) throw new Error(`Invalid garden surface atlas: ${url}`);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Garden surface atlas decoder needs a 2D context.");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const levels = unpackGardenSurfaceMipStrip(pixels.data, canvas.width, canvas.height);
    canvas.width = canvas.height = 0;
    return levels;
  } finally { bitmap.close(); }
}
type AtlasMip = { data: Uint8Array; width: number; height: number };

function createAtlasTexture(name: MapName, levels: AtlasMip[]): DataTexture {
  const base = levels[0]!;
  const texture = new DataTexture(base.data, base.width, base.height, RGBAFormat, UnsignedByteType);
  texture.name = `garden-surface-${name}`;
  texture.colorSpace = name === "albedo" ? SRGBColorSpace : NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = LinearMipmapLinearFilter; texture.magFilter = LinearFilter;
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
  texture.flipY = false;
  texture.mipmaps = levels;
  texture.needsUpdate = true;
  return texture;
}

function createAtlasState(): AtlasState {
  const textures = {} as Record<MapName, DataTexture>;
  for (const name of Object.keys(GARDEN_SURFACE_ATLAS_URLS) as MapName[]) {
    const neutral = name === "albedo" ? [221, 221, 221, 255] : name === "normal" ? [128, 128, 255, 255] : [255, 128, 0, 255];
    textures[name] = createAtlasTexture(name, [{ data: new Uint8Array(neutral), width: 1, height: 1 }]);
  }
  const uniforms = { uGardenSurfaceAlbedo: { value: textures.albedo }, uGardenSurfaceNormal: { value: textures.normal },
    uGardenSurfaceOrm: { value: textures.orm }, uGardenSurfaceAtlasReady: { value: 0 } };
  const samplerUniforms = { albedo: uniforms.uGardenSurfaceAlbedo, normal: uniforms.uGardenSurfaceNormal, orm: uniforms.uGardenSurfaceOrm };
  const state: AtlasState = { textures, uniforms, source: { key: "garden-atlas-png-v2", glsl: SAMPLING_GLSL, uniforms },
    controller: new AbortController(), listeners: new Set(), ready: Promise.resolve(false), error: null,
    leases: 0, disposed: false, settled: false };
  state.ready = Promise.all((Object.keys(textures) as MapName[]).map(async (name) => ({
    name, levels: await decodeStrip(GARDEN_SURFACE_ATLAS_URLS[name], state.controller.signal),
  }))).then((decoded) => {
    if (state.disposed) return false;
    for (const { name, levels } of decoded) {
      // r186 uses immutable GPU storage: a 1×1 Texture/Source cannot be resized
      // by changing its image. Retire it before creating full-size storage.
      textures[name].dispose();
      const texture = createAtlasTexture(name, levels);
      textures[name] = texture;
      // Keep the IUniform identity already installed on every compiled material.
      samplerUniforms[name].value = texture;
    }
    uniforms.uGardenSurfaceAtlasReady.value = 1;
    return true;
  }, (error: unknown) => {
    state.error = error instanceof Error ? error : new Error(String(error));
    state.controller.abort();
    return false;
  }).then((ready) => {
    state.settled = true;
    if (!state.disposed) for (const listener of state.listeners) listener();
    state.listeners.clear();
    return ready;
  });
  return state;
}
export function acquireGardenSurfaceAtlas(onReady: () => void = () => {}): GardenSurfaceAtlasLease | null {
  if (typeof document === "undefined") return null;
  shared ??= createAtlasState();
  const state = shared;
  state.leases++;
  // Each lease owns its listener even when several share the same callback.
  const listener = () => onReady();
  if (state.settled) listener(); else state.listeners.add(listener);
  let released = false;
  return { textures: state.textures, uniforms: state.uniforms, detailSource: state.source, ready: state.ready,
    get error() { return state.error; },
    release() {
      if (released) return;
      released = true;
      state.listeners.delete(listener);
      if (--state.leases > 0) return;
      state.disposed = true;
      state.controller.abort();
      state.listeners.clear();
      state.uniforms.uGardenSurfaceAtlasReady.value = 0;
      for (const texture of Object.values(state.textures)) {
        texture.dispose();
        texture.mipmaps = [];
        texture.image = { data: new Uint8Array(0), width: 0, height: 0 };
      }
      if (shared === state) shared = null;
    } };
}
/** Renderer ownership, passed explicitly through build contexts; never userData. */
export function createGardenSurfaceAtlasOwner(onReady: () => void): GardenSurfaceAtlasOwner {
  const leases = new Set<GardenSurfaceAtlasLease>();
  let released = false;
  return { get textures() {
    for (const lease of leases) return lease.textures;
    return null;
  }, lease() {
    if (released) return null;
    const lease = acquireGardenSurfaceAtlas(() => {
      // Even a previously decoded family notifies after the owned lease is
      // installed, so renderer upload/census callbacks see its live textures.
      queueMicrotask(() => { if (!released && leases.size > 0) onReady(); });
    });
    if (!lease) return null;
    const owned: GardenSurfaceAtlasLease = { ...lease, get error() { return lease.error; }, release() {
      if (!leases.delete(owned)) return;
      lease.release();
    } };
    leases.add(owned);
    return owned;
  }, release() {
    if (released) return;
    released = true;
    for (const lease of leases) lease.release();
    leases.clear();
  } };
}
