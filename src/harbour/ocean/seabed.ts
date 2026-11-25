import * as THREE from "three";
import { CLOUD_SHADOW_GLSL, cloudShadowUniforms } from "../sky/cloud-shadow";
import { SUN_SHADOW_GLSL, sunShadowUniforms } from "../world/sun-shadow";
import type { WorldUniforms } from "../engine/uniforms";
import {
  SDF_COAST_RANGE,
  SDF_DEPTH_RANGE,
  SDF_ISLAND_RADII,
  SDF_STRUCT_RANGE,
  sdfMainlandFade,
  type Bounds4,
  type HeightField,
} from "./sea-sdf";
import { SWELL_DIR } from "./waves";

/**
 * Procedural runtime seabed mesh (`hb_seabed`, Phase 1 WS1.2 — lazy-loaded runtime chunk).
 *
 * Generates a `256 × 256` adaptive `BufferGeometry` over `uSdfBounds` with higher vertex density inside the
 * `±520 m` island/harbour footprint and finite-difference vertex normals so sloping shoals and quay drop-offs
 * shade volumetrically under downwelling sun + ambient light.
 *
 * Depth & safety invariants (H6):
 * - Mainland fade: applies `sdfMainlandFade` (470..560 m) identically to `ocean-system.ts`, dropping cleanly to
 *   deep open ocean (`-28.0 m`) beyond the island so the retired mainland never creates a phantom shelf.
 * - Coastline continuity: enforces `y <= groundY - 0.30` wherever `groundY > -6.0` and tucks smoothly to `-4.3 m`
 *   under elevated quays/cliffs (zero beach pop-through, zero Z-fighting).
 * - Storm-trough clearance: clamps open-water seabed (`coastM > 1.0`) to `y <= -Math.max(0.95, 1.35 * dampOf(coastM))`
 *   so Shoals sandbars never poke through storm wave troughs before Phase 2 bathymetric shoaling lands.
 * - Shading contract: outputs clean linear-HDR underwater seabed reflectance (warm calcareous Mediterranean sand
 *   with swell-aligned ripples, submerged limestone reef ledges, Posidonia oceanica seagrass meadows, quay-footing
 *   mossy silt, sun/cloud shadows) with NO Beer–Lambert extinction and NO caustics — the water pass (`OCEAN_FRAG`)
 *   applies exact 2-leg RGB Beer–Lambert extinction and shadow-occluded caustics on top of `uCapColor`.
 * - Never registers in `StaticDepthRegistry` (`StaticDepthPass` early-Z occludes land over the tucked seabed).
 */
export interface SeabedOptions {
  bounds: Bounds4;
  sdfData: Uint8Array;      // RGBA8 row-0 = minZ (width * height * 4)
  sdfSize: number;
  sceneCenter: readonly [number, number];
  ground?: HeightField | null;
  uSdf: THREE.IUniform<THREE.Texture>;
  uSdfBounds: THREE.IUniform<THREE.Vector4>;
  uZones: THREE.IUniform<THREE.Texture>;
  uNoise: THREE.IUniform<THREE.Texture>;
  uniforms: WorldUniforms;
}

const GRID_N = 256;
const INNER_HALF = 520;
const INNER_FRAC = 0.78;
const OPEN_SEABED_Y = -28.0;
const QUAY_TUCK_Y = -4.3;
const GROUND_VALID_MIN = -6.0; // ground.ts empty fill is -8.0; keep all exported stone down to -4.3 m

const clamp01 = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x);
const smooth01 = (x: number, e0: number, e1: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const dampOf = (coast: number): number => smooth01(coast, 0, 34) * 0.9 + 0.1 * smooth01(coast, -2, 2);
/** C1 polynomial smooth minimum (strictly <= min(a, b)), eliminating flat shelf terrace kinks. */
const smin = (a: number, b: number, k: number): number => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

function hash2(ix: number, iy: number): number {
  let h = (ix * 374761393 + iy * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function shelfNoise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/**
 * Pure CPU seabed elevation (m) at world `(x, z)` enforcing H6 mainland fade, coastline ground clearance,
 * quay/harbour basin depth (so newly exported stone courses down to `-4.3 m` are never buried),
 * Shoals shelf undulation, and smooth storm-trough clearance.
 */
export function seabedHeightAt(
  x: number,
  z: number,
  coastM: number,
  depthM: number,
  sceneCenterX: number,
  sceneCenterZ: number,
  groundY: number | null,
  shoalsWeight: number,
  sdistM = SDF_STRUCT_RANGE,
  harbourWeight = 0,
): number {
  const fade = sdfMainlandFade(x, z, sceneCenterX, sceneCenterZ);
  if (fade >= 1) return OPEN_SEABED_Y;

  const effCoast = fade > 0 ? coastM + (SDF_COAST_RANGE * 0.5 - coastM) * fade : coastM;
  const rawDepth = Math.max(0, depthM);
  const effDepth = fade > 0 ? rawDepth + (-OPEN_SEABED_Y - rawDepth) * fade : rawDepth;

  // Open-water bathymetry: gentle coastal slope transitioning smoothly to full SDF bathymetry,
  // while vertical quays, breakwaters, piers and harbour basins drop cleanly to >= 3.2 m so submerged
  // stone courses, water-stairs and hulls stay fully exposed (Opus #2).
  const posCoast = Math.max(0, effCoast);
  const sw = clamp01(shoalsWeight);
  const hw = clamp01(harbourWeight);
  const quayWall = Math.max(
    1 - smooth01(sdistM, 1.2, 5.2),
    hw * (1 - smooth01(posCoast, 2.0, 10.0)),
  ) * (1 - sw);
  const shallowCoast = Math.max(0.35, Math.min(effDepth, 0.35 + posCoast * 0.28));
  const offshoreT = smooth01(posCoast, 2.0, 22.0);
  let waterDepth = shallowCoast + (Math.max(shallowCoast, effDepth) - shallowCoast) * offshoreT;
  const quayBasinDepth = Math.max(waterDepth, Math.max(effDepth, 3.4));
  waterDepth += (quayBasinDepth - waterDepth) * quayWall;

  // Gently undulating calcareous sand & reef benches in The Shoals
  if (sw > 0) {
    const n = shelfNoise(x * 0.014, z * 0.014) * 0.65 + shelfNoise(x * 0.042 + 17.3, z * 0.042 - 9.1) * 0.35;
    const bench = 1.45 + (1 - n) * 2.8;
    waterDepth += (Math.min(waterDepth, bench) - waterDepth) * sw * 0.55;
  }
  const waterY = -waterDepth;

  // Inside land / under quays: tuck cleanly below terrain and quay footings (-4.3 m deep inland or under quays)
  const deepInland = 1 - smooth01(effCoast, -4.0, -0.5);
  const highGround = groundY !== null ? smooth01(groundY, 0.35, 1.2) : 1;
  const tuckWeight = Math.max(deepInland, highGround, quayWall * 0.85);
  const shallowLandY = groundY !== null ? Math.min(-0.6, groundY - 0.35) : QUAY_TUCK_Y;
  const deepLandY = groundY !== null ? Math.min(QUAY_TUCK_Y, groundY - 4.3, shallowLandY) : QUAY_TUCK_Y;
  const landY = shallowLandY + (deepLandY - shallowLandY) * tuckWeight;

  // Smooth transition across coastline [-2.0, +1.5]
  const coastT = smooth01(effCoast, -2.0, 1.5);
  let y = landY + (waterY - landY) * coastT;

  // Zero beach pop-through / zero Z-fighting wherever static island geometry exists down to -6.0 m (Astra #7)
  if (groundY !== null && groundY > GROUND_VALID_MIN) {
    y = Math.min(y, groundY - 0.30);
  }

  // Mainland fade (470..560 m): drop smoothly to deep open seabed (-28.0 m)
  if (fade > 0) {
    y += (OPEN_SEABED_Y - y) * fade;
  }

  // Smooth storm-trough clearance (H6 & Opus #3): strictly <= -max(0.95, 1.35 * dampOf(coast)) without flat kinks
  if (effCoast > 0) {
    const minDepth = Math.max(0.95, 1.35 * dampOf(effCoast));
    const ramp = effCoast >= 1.0 ? 1.0 : smooth01(effCoast, 0.0, 1.0);
    const clearDepth = 0.35 + (minDepth - 0.35) * ramp;
    y = smin(y, -clearDepth, 0.45);
  }

  return y;
}

/** Adaptive 1D axis mapping concentrating `INNER_FRAC` of vertices inside `center ± INNER_HALF`. */
function mapAxis(u: number, minV: number, maxV: number, center: number): number {
  const c = Math.min(maxV, Math.max(minV, center));
  if (u >= 0) {
    const coreMax = Math.min(maxV, c + INNER_HALF);
    if (coreMax >= maxV - 1e-3) return c + u * (maxV - c);
    if (u <= INNER_FRAC) return c + (u / INNER_FRAC) * (coreMax - c);
    const s = (u - INNER_FRAC) / (1 - INNER_FRAC);
    return coreMax + (maxV - coreMax) * (s * (0.35 + 0.65 * s));
  }
  const au = -u;
  const coreMin = Math.max(minV, c - INNER_HALF);
  if (coreMin <= minV + 1e-3) return c - au * (c - minV);
  if (au <= INNER_FRAC) return c - (au / INNER_FRAC) * (c - coreMin);
  const s = (au - INNER_FRAC) / (1 - INNER_FRAC);
  return coreMin - (coreMin - minV) * (s * (0.35 + 0.65 * s));
}

function sampleSdfBilinear(
  data: Uint8Array,
  size: number,
  u: number,
  v: number,
  out: [number, number, number],
): void {
  const fx = clamp01(u) * size - 0.5;
  const fy = clamp01(v) * size - 0.5;
  const x0 = Math.max(0, Math.min(size - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(size - 1, Math.floor(fy)));
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = clamp01(fx - x0), ty = clamp01(fy - y0);
  const o00 = (y0 * size + x0) * 4, o10 = (y0 * size + x1) * 4;
  const o01 = (y1 * size + x0) * 4, o11 = (y1 * size + x1) * 4;
  const r = (data[o00] * (1 - tx) + data[o10] * tx) * (1 - ty) + (data[o01] * (1 - tx) + data[o11] * tx) * ty;
  const g = (data[o00 + 1] * (1 - tx) + data[o10 + 1] * tx) * (1 - ty) + (data[o01 + 1] * (1 - tx) + data[o11 + 1] * tx) * ty;
  const b = (data[o00 + 2] * (1 - tx) + data[o10 + 2] * tx) * (1 - ty) + (data[o01 + 2] * (1 - tx) + data[o11 + 2] * tx) * ty;
  out[0] = (r / 255 - 0.5) * SDF_COAST_RANGE;
  out[1] = (g / 255) * SDF_DEPTH_RANGE;
  out[2] = (b / 255) * SDF_STRUCT_RANGE;
}

function sampleZonesBilinear(tex: THREE.Texture | null | undefined, u: number, v: number, out: [number, number]): void {
  const img = tex?.image as { data?: Uint8Array | Uint8ClampedArray; width?: number; height?: number } | undefined;
  if (!img?.data || !img.width || !img.height) {
    out[0] = 0; out[1] = 0;
    return;
  }
  const w = img.width, h = img.height, d = img.data;
  const fx = clamp01(u) * w - 0.5;
  const fy = clamp01(v) * h - 0.5;
  const x0 = Math.max(0, Math.min(w - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(h - 1, Math.floor(fy)));
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = clamp01(fx - x0), ty = clamp01(fy - y0);
  const o00 = (y0 * w + x0) * 4, o10 = (y0 * w + x1) * 4;
  const o01 = (y1 * w + x0) * 4, o11 = (y1 * w + x1) * 4;
  out[0] = ((d[o00] * (1 - tx) + d[o10] * tx) * (1 - ty) + (d[o01] * (1 - tx) + d[o11] * tx) * ty) / 255;
  out[1] = ((d[o00 + 2] * (1 - tx) + d[o10 + 2] * tx) * (1 - ty) + (d[o01 + 2] * (1 - tx) + d[o11 + 2] * tx) * ty) / 255;
}

function sampleGround(ground: HeightField | null | undefined, x: number, z: number): number | null {
  if (!ground) return null;
  const [gx0, gz0, gx1, gz1] = ground.bounds;
  if (x < gx0 || x > gx1 || z < gz0 || z > gz1) return null;
  const gn = ground.size, h = ground.heights;
  const fx = ((x - gx0) / (gx1 - gx0)) * gn - 0.5;
  const fy = ((gz1 - z) / (gz1 - gz0)) * gn - 0.5;
  const x0 = Math.max(0, Math.min(gn - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(gn - 1, Math.floor(fy)));
  const x1 = Math.min(gn - 1, x0 + 1);
  const y1 = Math.min(gn - 1, y0 + 1);
  const tx = clamp01(fx - x0), ty = clamp01(fy - y0);
  const a = h[y0 * gn + x0], b = h[y0 * gn + x1], c = h[y1 * gn + x0], d = h[y1 * gn + x1];
  const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
  let wSum = 0, hSum = 0;
  if (a > GROUND_VALID_MIN) { wSum += w00; hSum += a * w00; }
  if (b > GROUND_VALID_MIN) { wSum += w10; hSum += b * w10; }
  if (c > GROUND_VALID_MIN) { wSum += w01; hSum += c * w01; }
  if (d > GROUND_VALID_MIN) { wSum += w11; hSum += d * w11; }
  return wSum > 0.2 ? hSum / wSum : null;
}

export const SEABED_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const SEABED_FRAG = /* glsl */ `
uniform sampler2D uSdf;
uniform vec4 uSdfBounds;
uniform sampler2D uZones;
uniform sampler2D uNoise;
uniform vec2 uSceneCenter;
uniform vec3 uSunDir, uSunColor, uAmbient;
uniform float uNight;
varying vec3 vWorld;
varying vec3 vNormalW;
${SUN_SHADOW_GLSL}
${CLOUD_SHADOW_GLSL}
uniform highp sampler2DShadow uKeyShadowDepth;
uniform mat4 uKeyShadowDirect;
uniform float uKeyShadowDirectOn;
const vec2 SB_SWELL = vec2(${SWELL_DIR[0].toFixed(5)}, ${SWELL_DIR[1].toFixed(5)});

// Cast shadow on the seabed: uses the resolved SeaShadowMask on High/Medium and falls back to the
// already-rendered key shadow depth map on Low (where SeaShadowMask stays suspended, Astra #2).
float hbSeabedShadow(vec3 wp) {
  if (uKeyShadowP.x >= 0.5) return hbSeaSunShadow(wp);
  if (uKeyShadowDirectOn < 0.5) return 1.0;
  vec3 c = (uKeyShadowDirect * vec4(wp, 1.0)).xyz;
  vec2 m = min(c.xy, 1.0 - c.xy);
  float fade = smoothstep(0.0, 0.06, min(m.x, m.y));
  if (fade <= 0.0 || c.z >= 1.0) return 1.0;
  return mix(1.0, texture(uKeyShadowDepth, vec3(c.xy, c.z - 0.0012)), fade * uKeyShadowP.w);
}

vec3 hbPosidonia(vec3 bed, vec2 xz, float dep, float zr, float sdist) {
  float p = texture2D(uNoise, xz * 0.011 + 0.43).r * 0.68 + texture2D(uNoise, xz * 0.047 + 0.11).g * 0.32;
  float band = smoothstep(1.2, 2.5, dep) * (1.0 - smoothstep(9.0, 13.5, dep));
  float k = smoothstep(0.62, 0.75, p) * band * (1.0 - zr) * smoothstep(1.8, 5.0, sdist);
  return mix(bed, vec3(0.042, 0.072, 0.048), k * 0.85);
}

void main() {
  vec2 xz = vWorld.xz;
  vec2 suv = (xz - uSdfBounds.xy) / (uSdfBounds.zw - uSdfBounds.xy);
  float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
  vec4 sdf = texture2D(uSdf, clamp(suv, 0.0, 1.0));
  sdf.rg = mix(sdf.rg, vec2(1.0), smoothstep(${SDF_ISLAND_RADII[0].toFixed(1)}, ${SDF_ISLAND_RADII[1].toFixed(1)}, length(xz - uSceneCenter)));
  float coast = mix(200.0, (sdf.r - 0.5) * ${SDF_COAST_RANGE.toFixed(1)}, inside);
  float sdist = mix(${SDF_STRUCT_RANGE.toFixed(1)}, sdf.b * ${SDF_STRUCT_RANGE.toFixed(1)}, inside);
  vec4 zm = texture2D(uZones, clamp(suv, 0.0, 1.0)) * inside;
  float dep = max(-vWorld.y, 0.0);
  float camD = length(vWorld.xz - cameraPosition.xz);

  vec4 nA = texture2D(uNoise, xz * 0.013);
  vec4 nB = texture2D(uNoise, xz * 0.067 + 0.29);
  vec4 nC = texture2D(uNoise, xz * 0.23 + 0.61);

  float ripFade = (1.0 - smoothstep(110.0, 420.0, camD)) * (1.0 - smoothstep(5.5, 16.0, dep));
  float ripPh = dot(xz, SB_SWELL) * 2.35 + nB.g * 4.2 + nA.r * 1.8;
  float ripH = 0.5 + 0.5 * sin(ripPh);
  float ripSlope = cos(ripPh) * 0.22 * ripFade;

  vec3 sand = mix(vec3(0.46, 0.40, 0.27), vec3(0.68, 0.61, 0.43), clamp(nB.g * 0.64 + ripH * 0.24 + nA.b * 0.12, 0.0, 1.0));
  sand *= 0.90 + 0.20 * nC.g;

  float slopeRock = 1.0 - smoothstep(0.66, 0.93, vNormalW.y);
  float coastRock = (1.0 - smoothstep(2.0, 14.0, max(coast, 0.0))) * smoothstep(0.42, 0.74, nA.r * 0.55 + nB.b * 0.45);
  float shoalReef = smoothstep(0.18, 0.78, zm.r) * smoothstep(0.44, 0.76, nB.r * 0.60 + nC.b * 0.40);
  float rockW = clamp(slopeRock * 0.85 + coastRock * 0.75 + shoalReef * 0.80, 0.0, 1.0);
  vec3 limestone = mix(vec3(0.24, 0.25, 0.20), vec3(0.45, 0.42, 0.32), smoothstep(0.25, 0.80, nB.r * 0.6 + nC.r * 0.4));
  limestone *= 0.78 + 0.34 * nC.b;

  vec3 alb = mix(sand, limestone, rockW);
  alb = hbPosidonia(alb, xz, dep, zm.r, sdist);

  float quaySilt = (1.0 - smoothstep(0.5, 4.2, sdist)) * (0.45 + 0.55 * zm.b);
  float harbourSed = zm.b * (1.0 - zm.r) * smoothstep(2.2, 8.5, dep) * 0.28;
  vec3 mossSilt = mix(vec3(0.24, 0.27, 0.21), vec3(0.18, 0.23, 0.18), smoothstep(0.32, 0.74, nB.r)) * (0.84 + 0.28 * nC.r);
  alb = mix(alb, mossSilt, clamp(quaySilt * 0.58 + harbourSed, 0.0, 0.74));
  float quayAo = 1.0 - 0.22 * (1.0 - smoothstep(0.0, 2.4, sdist)) * (1.0 - zm.r * 0.8);
  alb *= quayAo;

  vec3 N = normalize(vNormalW + vec3(SB_SWELL.x * ripSlope, 0.0, SB_SWELL.y * ripSlope) * (1.0 - rockW * 0.75));
  float sunSh = hbSeabedShadow(vWorld);
  float cSh = hbCloudShadow(xz);
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 direct = uSunColor * (0.31831 * (ndl * 0.86 + 0.14 * max(N.y, 0.0))) * sunSh * cSh * (1.0 - 0.88 * uNight);
  vec3 hemi = uAmbient * (0.58 + 0.42 * max(N.y, 0.0)) * mix(0.85, 0.42, uNight);
  gl_FragColor = vec4(alb * (direct + hemi), 1.0);
}
`;

export class Seabed {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly bounds: Bounds4;
  private readonly sceneCenter: readonly [number, number];
  private readonly uZones: THREE.IUniform<THREE.Texture>;
  private readonly xs: Float32Array;
  private readonly zs: Float32Array;
  private readonly sdfSample: [number, number, number] = [0, 0, SDF_STRUCT_RANGE];
  private readonly zoneSample: [number, number] = [0, 0];

  constructor(opts: SeabedOptions) {
    this.bounds = opts.bounds;
    this.sceneCenter = opts.sceneCenter;
    this.uZones = opts.uZones;

    const verts = GRID_N + 1;
    const count = verts * verts;
    this.xs = new Float32Array(verts);
    this.zs = new Float32Array(verts);
    const [minX, minZ, maxX, maxZ] = this.bounds;
    for (let i = 0; i <= GRID_N; i++) {
      const u = -1 + (2 * i) / GRID_N;
      this.xs[i] = mapAxis(u, minX, maxX, this.sceneCenter[0]);
      this.zs[i] = mapAxis(u, minZ, maxZ, this.sceneCenter[1]);
    }

    const pos = new Float32Array(count * 3);
    const norm = new Float32Array(count * 3);
    const idx = new Uint32Array(GRID_N * GRID_N * 6);
    let ptr = 0;
    for (let j = 0; j < GRID_N; j++) {
      for (let i = 0; i < GRID_N; i++) {
        const a = j * verts + i, b = a + 1, c = a + verts, d = c + 1;
        idx[ptr++] = a; idx[ptr++] = c; idx[ptr++] = b;
        idx[ptr++] = b; idx[ptr++] = c; idx[ptr++] = d;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(norm, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const cx = (minX + maxX) * 0.5, cz = (minZ + maxZ) * 0.5;
    const rad = Math.hypot(maxX - minX, maxZ - minZ) * 0.6 + 64;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, -10, cz), rad);

    const mat = new THREE.ShaderMaterial({
      name: "hb_seabed",
      vertexShader: SEABED_VERT,
      fragmentShader: SEABED_FRAG,
      uniforms: {
        uSdf: opts.uSdf,
        uSdfBounds: opts.uSdfBounds,
        uZones: opts.uZones,
        uNoise: opts.uNoise,
        uSceneCenter: { value: new THREE.Vector2(opts.sceneCenter[0], opts.sceneCenter[1]) },
        uSunDir: opts.uniforms.uSunDir,
        uSunColor: opts.uniforms.uSunColor,
        uAmbient: opts.uniforms.uAmbient,
        uNight: opts.uniforms.uNight,
        ...sunShadowUniforms,
        ...cloudShadowUniforms,
      },
      transparent: false,
      depthWrite: true,
      depthTest: true,
      side: THREE.FrontSide,
      fog: false,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = "ocean-seabed";
    this.mesh.renderOrder = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.raycast = () => {};

    this.rebuild(opts.sdfData, opts.sdfSize, opts.ground);
  }

  /** Recompute vertex elevations and finite-difference normals in-place (zero geometry reallocation). */
  rebuild(sdfData: Uint8Array, sdfSize: number, ground?: HeightField | null): void {
    const geo = this.mesh.geometry;
    const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
    const normAttr = geo.getAttribute("normal") as THREE.BufferAttribute;
    const pos = posAttr.array as Float32Array;
    const norm = normAttr.array as Float32Array;

    const [minX, minZ, maxX, maxZ] = this.bounds;
    const invW = 1 / Math.max(maxX - minX, 1e-6);
    const invH = 1 / Math.max(maxZ - minZ, 1e-6);
    const [scx, scz] = this.sceneCenter;
    const verts = GRID_N + 1;
    const zonesTex = this.uZones.value;
    const sample = this.sdfSample;
    const zSample = this.zoneSample;

    for (let j = 0; j < verts; j++) {
      const z = this.zs[j];
      const v = (z - minZ) * invH;
      const row = j * verts;
      for (let i = 0; i < verts; i++) {
        const x = this.xs[i];
        const u = (x - minX) * invW;
        sampleSdfBilinear(sdfData, sdfSize, u, v, sample);
        const gy = sampleGround(ground, x, z);
        sampleZonesBilinear(zonesTex, u, v, zSample);
        const y = seabedHeightAt(x, z, sample[0], sample[1], scx, scz, gy, zSample[0], sample[2], zSample[1]);
        const k = (row + i) * 3;
        pos[k] = x;
        pos[k + 1] = y;
        pos[k + 2] = z;
      }
    }

    // Finite-difference upward normals: N = normalize((-dy/dx, 1, -dy/dz))
    for (let j = 0; j < verts; j++) {
      const j0 = j > 0 ? j - 1 : 0;
      const j1 = j < GRID_N ? j + 1 : GRID_N;
      const dz = Math.max(this.zs[j1] - this.zs[j0], 1e-4);
      const row = j * verts, row0 = j0 * verts, row1 = j1 * verts;
      for (let i = 0; i < verts; i++) {
        const i0 = i > 0 ? i - 1 : 0;
        const i1 = i < GRID_N ? i + 1 : GRID_N;
        const dx = Math.max(this.xs[i1] - this.xs[i0], 1e-4);
        const nx = -(pos[(row + i1) * 3 + 1] - pos[(row + i0) * 3 + 1]) / dx;
        const nz = -(pos[(row1 + i) * 3 + 1] - pos[(row0 + i) * 3 + 1]) / dz;
        const invL = 1 / Math.hypot(nx, 1, nz);
        const k = (row + i) * 3;
        norm[k] = nx * invL;
        norm[k + 1] = invL;
        norm[k + 2] = nz * invL;
      }
    }

    posAttr.needsUpdate = true;
    normAttr.needsUpdate = true;
  }

  setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
