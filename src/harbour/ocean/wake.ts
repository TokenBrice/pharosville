import * as THREE from "three";
import { FullscreenPass } from "./gpu-bake";
import type { Bounds4 } from "./sea-sdf";
import { SWELL_DIR } from "./waves";
import type { PreparationEntry } from "../engine/types";

/**
 * WAKE service ('wake'): a world-space wake/foam field over the sea bounds that every hull stamps into.
 *
 * Supports two storage modes:
 *  - `"r16f"` (Low tier / default fallback):
 *    - `texture` (history, R16F ping-pong): turbulent trail left behind moving hulls; diffuses and decays
 *      (~4.5 s half-life), so a turning boat leaves a curved foam trail.
 *    - `live` (RGBA8, rebuilt every frame): R = Kelvin wedge arms + bow wave, G = hull contact ring,
 *      B = hull occlusion (darker water under the hull) + a thin dark waterline meniscus round a still hull,
 *      A = lee slick (03-O4, decorative): a glassy satin patch trailing downwind (`lee`) of every still hull, where the
 *      ocean drops its ripple roughness; G also carries a thin bright lip on the swell-facing side of a still hull.
 *      A storm (contact strength ≥ ~1) or a hull aground keeps only the rings: no slick, no lip.
 *  - `"rgba16f"` (Phase 2 High `2048²` / Medium `1024²`):
 *    - `texture` (history, RGBA16F ping-pong):
 *      - R = persistent moving wake trail (advected downwind + slow decay ~7.5 s + diffusion)
 *      - G = persistent FFT Jacobian breaking foam (injected from `uFftAtlas` `J_det`, advected downwind +
 *            exponential decay τ ≈ 2.8 s calm → 4.8 s storm) + stationary hull contact/Shoals reef-surf foam
 *      - B = advected lee slick behind moored/anchored hulls (τ ≈ 0.35 s)
 *      - A = stationary hull contact occlusion + dark waterline meniscus (τ ≈ 0.25 s; vanishes cleanly on departure)
 *    - `liveRT` is disposed (0 MB extra VRAM; `live` returns a 1×1 zero fallback while `WakeRibbons` owns slot 3).
 *
 * Callers stamp every frame they want to be seen: stamp(x, z, vx, vz, halfWidth, strength[, halfLength[, seed]]).
 * Zero velocity = moored hull (contact ring + occlusion only). Stamps queued during frame N are drawn at
 * the start of frame N+1 (one frame of latency, invisible at harbour speeds). E12: `seed` (any number, default 0;
 * a hull passes its own, stable frame to frame) jitters where her Kelvin arms' crests fall, so no two wakes share
 * one evenly dotted pattern.
 */
export type WakeMode = "r16f" | "rgba16f";

export interface WakeService {
  clear(renderer: THREE.WebGLRenderer): void;
  preparationEntries(): PreparationEntry[];
  stamp(x: number, z: number, vx: number, vz: number, halfWidth: number, strength: number, halfLength?: number, seed?: number, ringScale?: number): void;
  readonly texture: THREE.Texture;
  readonly live: THREE.Texture;
  /** [minX, minZ, maxX, maxZ] */
  readonly bounds: Bounds4;
}

const MAX_STAMPS = 2048;

const STAMP_VERT = /* glsl */ `
attribute vec4 sA;
attribute vec4 sB;
attribute float sRing;
uniform vec4 uBounds; uniform float uTrail; uniform vec2 uLee;
varying vec2 vL; varying vec4 vS; varying vec2 vW; varying float vSeed; varying float vRing;
void main() {
  float hl = sA.w, hb = sB.x, spd = sB.y;
  float moving = step(0.25, spd);
  float wl = hl * (3.0 + 4.0 * smoothstep(1.2, 6.0, spd));
  vec2 lo, hi;
  if (uTrail > 0.5) { lo = vec2(-hl * 1.6, -hb * 1.6); hi = vec2(hl * 1.2, hb * 1.6); }
  else { lo = vec2(-hl - wl * 1.1, -(wl * 0.42 + hb * 2.0)); hi = vec2(hl * 1.3, wl * 0.42 + hb * 2.0); }
  vec2 t = position.xy * 0.5 + 0.5;
  float s = sin(sA.z), c = cos(sA.z);
  vec2 l, w;
  if (uTrail < 0.5 && moving < 0.5) {
    float r0 = max(hl, hb) * 1.45;
    float wd = max(r0, 2.0 * (hb * 1.5 + hl * 2.6 * 0.18));
    vec2 a = mix(vec2(-r0, -wd), vec2(max(r0, hl * 2.6), wd), t);
    vec2 lp = vec2(-uLee.y, uLee.x);
    w = sA.xy + uLee * a.x + lp * a.y;
    vec2 d = w - sA.xy;
    l = vec2(dot(d, vec2(s, c)), dot(d, vec2(c, -s)));
  } else {
    l = mix(lo, hi, t);
    w = sA.xy + vec2(s, c) * l.x + vec2(c, -s) * l.y;
  }
  vL = l; vS = vec4(hl, hb, spd, sB.z);
  vW = w - sA.xy; vSeed = sB.w; vRing = sRing;
  vec2 uv = (w - uBounds.xy) / (uBounds.zw - uBounds.xy);
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
  if (uTrail > 0.5 && moving < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const STAMP_FRAG = /* glsl */ `
uniform float uTrail, uDt;
uniform vec2 uLee, uSwell;
varying vec2 vL; varying vec4 vS; varying vec2 vW; varying float vSeed; varying float vRing;
void main() {
  float hl = vS.x, hb = vS.y, spd = vS.z, k = vS.w;
  vec2 q = vL;
  if (uTrail > 0.5) {
    float sternL = max(hl * 0.32, 0.72);
    vec2 st = vec2((q.x + hl * 0.9) / sternL, q.y / max(hb * 0.48, 0.42));
    float stern = exp(-dot(st, st));
    float sd = (abs(q.y) - hb * 1.0) / max(hb * 0.22, 0.28);
    float sides = exp(-sd * sd) * (1.0 - smoothstep(0.0, hl * 1.05, abs(q.x))) * 0.1;
    float rate = spd / (sternL * 1.77);
    float sK = smoothstep(0.45, 1.35, spd) * (0.48 + 0.52 * smoothstep(1.35, 3.8, spd)) * clamp(hl / 4.5, 0.62, 1.0);
    gl_FragColor = vec4((stern + sides) * rate * k * sK * uDt * 0.85, 0.0, 0.0, 0.0);
    return;
  }
  float e = length(vec2(q.x / hl, q.y / hb));
  float re = (e - 1.08) / 0.16;
  float ring = exp(-re * re);
  float occl = 1.0 - smoothstep(0.72, 1.38, e);
  float kel = 0.0;
  if (spd > 0.25) {
    float sp = smoothstep(0.45, 1.35, spd) * (0.48 + 0.52 * smoothstep(1.35, 3.8, spd)) * clamp(hl / 4.5, 0.62, 1.0);
    float u = hl * 0.75 - q.x;
    float wl = hl * (3.0 + 4.0 * smoothstep(1.2, 6.0, spd));
    float arm = abs(abs(q.y) - (hb * 0.6 + u * 0.354));
    float w = 0.5 + u * 0.018;
    float fall = exp(-u / (wl * 0.42)) * smoothstep(0.0, hl * 0.4, u);
    float ec = u / max(1.2, hb * 1.3) - abs(q.y) * 0.2069;
    float cj = floor(ec + 0.25);
    float cr = fract(sin(cj * 12.9898 + vSeed * 78.233) * 43758.5453);
    float ech = smoothstep(-0.1, 0.7, sin((ec - (cr - 0.5) * 0.2) * 6.2831853)) * (0.8 + 0.4 * fract(cr * 7.13));
    kel = exp(-(arm * arm) / (w * w)) * fall * (0.4 + 0.6 * ech);
    float inside = smoothstep(0.0, 1.0, (hb * 0.6 + u * 0.354) - abs(q.y)) * step(0.0, u);
    kel += inside * pow(0.5 + 0.5 * cos(u * 6.2831 / max(2.0, hl * 0.9)), 6.0) * fall * 0.18;
    vec2 bq = vec2((q.x - hl * 0.9) / max(hl * 0.14, 0.42), q.y / max(hb * 1.05, 0.5));
    float bow = exp(-dot(bq, bq));
    kel = (kel + bow * 0.45) * sp;
  }
  float meni = 0.0, lip = 0.0, slick = 0.0;
  if (spd <= 0.25) {
    float calm = 1.0 - smoothstep(0.5, 1.0, k);
    float me = (e - 1.0) / 0.09;
    meni = exp(-me * me) * 0.62;
    float rw = length(vW) + 1e-4;
    float face = smoothstep(0.0, 0.7, dot(vW / rw, -uSwell));
    float le = (e - 1.13) / 0.1;
    lip = exp(-le * le) * face * 0.75 * calm;
    float along = dot(vW, uLee), lat = abs(vW.x * uLee.y - vW.y * uLee.x);
    float len = hl * 2.6;
    float sl = lat / (hb * 1.5 + max(along, 0.0) * 0.18);
    slick = exp(-sl * sl) * smoothstep(-hl * 0.6, hl * 0.2, along)
          * (1.0 - smoothstep(len * 0.4, len, along)) * calm;
  }
  gl_FragColor = vec4(kel * k, (ring * k * (spd > 0.25 ? 0.45 : 0.7) + lip) * vRing, occl * min(k, 1.0) + meni, slick);
}`;

/** Stationary hull stamp vertex shader for RGBA16F mode: culls moving stamps and uses the compact LEE quad. */
export const WAKE_STATIONARY_VERT = /* glsl */ `
attribute vec4 sA;
attribute vec4 sB;
attribute float sRing;
uniform vec4 uBounds;
uniform vec2 uLee;
varying vec2 vL;
varying vec4 vS;
varying vec2 vW;
varying float vRing;
void main() {
  float hl = sA.w, hb = sB.x, spd = sB.y;
  if (spd > 0.25) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 t = position.xy * 0.5 + 0.5;
  float s = sin(sA.z), c = cos(sA.z);
  float r0 = max(hl, hb) * 1.45;
  float wd = max(r0, 2.0 * (hb * 1.5 + hl * 2.6 * 0.18));
  vec2 a = mix(vec2(-r0, -wd), vec2(max(r0, hl * 2.6), wd), t);
  vec2 lp = vec2(-uLee.y, uLee.x);
  vec2 w = sA.xy + uLee * a.x + lp * a.y;
  vec2 d = w - sA.xy;
  vL = vec2(dot(d, vec2(s, c)), dot(d, vec2(c, -s)));
  vS = vec4(hl, hb, spd, sB.z);
  vW = d;
  vRing = sRing;
  vec2 uv = (w - uBounds.xy) / (uBounds.zw - uBounds.xy);
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Stationary hull stamp fragment shader for RGBA16F mode (MAX blended): R=0, G=contact+Shoals surf, B=slick, A=hullOcc. */
export const WAKE_STATIONARY_FRAG = /* glsl */ `
uniform vec2 uLee, uSwell;
varying vec2 vL;
varying vec4 vS;
varying vec2 vW;
varying float vRing;
void main() {
  float hl = vS.x, hb = vS.y, k = vS.w;
  vec2 q = vL;
  float e = length(vec2(q.x / hl, q.y / hb));
  float re = (e - 1.08) / 0.16;
  float ring = exp(-re * re);
  float occl = 1.0 - smoothstep(0.72, 1.38, e);
  float calm = 1.0 - smoothstep(0.5, 1.0, k);
  float me = (e - 1.0) / 0.09;
  float meni = exp(-me * me) * 0.62;
  float rw = length(vW) + 1e-4;
  float face = smoothstep(0.0, 0.7, dot(vW / rw, -uSwell));
  float le = (e - 1.13) / 0.1;
  float lip = exp(-le * le) * face * 0.75 * calm;
  float along = dot(vW, uLee), lat = abs(vW.x * uLee.y - vW.y * uLee.x);
  float len = hl * 2.6;
  float sl = lat / (hb * 1.5 + max(along, 0.0) * 0.18);
  float slick = exp(-sl * sl) * smoothstep(-hl * 0.6, hl * 0.2, along)
              * (1.0 - smoothstep(len * 0.4, len, along)) * calm;
  float contactFoam = (ring * k * 0.7 + lip) * vRing;
  float hullOcc = occl * min(k, 1.0) + meni;
  gl_FragColor = vec4(0.0, contactFoam, slick, hullOcc);
}`;

const DECAY_FRAG = /* glsl */ `
uniform sampler2D uPrev; uniform float uDecay, uSpread; uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  float c = texture2D(uPrev, vUv).r;
  float s = texture2D(uPrev, vUv + vec2(uTexel.x, 0.0)).r + texture2D(uPrev, vUv - vec2(uTexel.x, 0.0)).r
          + texture2D(uPrev, vUv + vec2(0.0, uTexel.y)).r + texture2D(uPrev, vUv - vec2(0.0, uTexel.y)).r;
  float v = mix(c, s * 0.25, uSpread) * uDecay;
  gl_FragColor = vec4(min(v, 4.0), 0.0, 0.0, 1.0);
}`;

/**
 * 4-channel RGBA16F decay, downwind advection, and FFT Jacobian breaking-foam injection pass (`hb_wake_decay_rgba`).
 * R = moving wake trail; G = persistent FFT Jacobian breaking foam + stationary surf; B = lee slick; A = stationary hullOcc.
 */
export const WAKE_DECAY_RGBA_FRAG = /* glsl */ `
uniform sampler2D uPrev;
uniform vec4 uBounds;
uniform vec2 uTexel, uAdvect;
uniform float uDt, uDecayTrail, uDecayFoam, uDecaySlick, uDecayOcc, uSpread;
uniform highp sampler2DArray uFftAtlas;
uniform vec4 uFftScales, uFftParams;
uniform sampler2D uSdf;
uniform vec4 uSdfBounds;
uniform vec2 uSceneCenter;
uniform float uSdfOn;
varying vec2 vUv;
void main() {
  vec2 tUvRaw = vUv - uAdvect * 0.35;
  float tIn = step(0.0, tUvRaw.x) * step(tUvRaw.x, 1.0) * step(0.0, tUvRaw.y) * step(tUvRaw.y, 1.0);
  vec2 tUv = clamp(tUvRaw, vec2(0.001), vec2(0.999));
  vec4 prevT = texture2D(uPrev, tUv) * tIn;
  float tN = texture2D(uPrev, clamp(tUv + vec2(uTexel.x, 0.0), vec2(0.001), vec2(0.999))).r
           + texture2D(uPrev, clamp(tUv - vec2(uTexel.x, 0.0), vec2(0.001), vec2(0.999))).r
           + texture2D(uPrev, clamp(tUv + vec2(0.0, uTexel.y), vec2(0.001), vec2(0.999))).r
           + texture2D(uPrev, clamp(tUv - vec2(0.0, uTexel.y), vec2(0.001), vec2(0.999))).r;
  float trail = min(mix(prevT.r, tN * 0.25 * tIn, uSpread) * uDecayTrail, 4.0);
  vec2 fUvRaw = vUv - uAdvect;
  float fIn = step(0.0, fUvRaw.x) * step(fUvRaw.x, 1.0) * step(0.0, fUvRaw.y) * step(fUvRaw.y, 1.0);
  vec2 fUv = clamp(fUvRaw, vec2(0.001), vec2(0.999));
  float prevF = texture2D(uPrev, fUv).g * fIn;
  float fN = texture2D(uPrev, clamp(fUv + vec2(uTexel.x, 0.0), vec2(0.001), vec2(0.999))).g
           + texture2D(uPrev, clamp(fUv - vec2(uTexel.x, 0.0), vec2(0.001), vec2(0.999))).g
           + texture2D(uPrev, clamp(fUv + vec2(0.0, uTexel.y), vec2(0.001), vec2(0.999))).g
           + texture2D(uPrev, clamp(fUv - vec2(0.0, uTexel.y), vec2(0.001), vec2(0.999))).g;
  float foam = mix(prevF, fN * 0.25 * fIn, uSpread * 0.65) * uDecayFoam;
  if (uFftParams.x > 0.5) {
    vec2 xz = mix(uBounds.xy, uBounds.zw, vUv);
    float openMask = 1.0;
    if (uSdfOn > 0.5) {
      vec2 suv = (xz - uSdfBounds.xy) / (uSdfBounds.zw - uSdfBounds.xy);
      float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
      float r = mix(texture2D(uSdf, clamp(suv, 0.0, 1.0)).r, 1.0, smoothstep(470.0, 560.0, length(xz - uSceneCenter)));
      float coast = mix(200.0, (r - 0.5) * 128.0, inside);
      openMask = smoothstep(3.0, 22.0, coast);
    }
    float j0 = textureLod(uFftAtlas, vec3(xz * uFftScales.x, 0.0), 0.0).w;
    float j1 = textureLod(uFftAtlas, vec3(xz * uFftScales.y, 1.0), 0.0).w;
    float j2 = textureLod(uFftAtlas, vec3(xz * uFftScales.z, 2.0), 1.5).w;
    float jMin = min(j0, min(j1, j2));
    float storm = clamp(uFftParams.z, 0.0, 1.0);
    float foldLo = mix(0.05, 0.10, storm);
    float foldHi = mix(0.45, 0.62, storm);
    float energy = smoothstep(0.10, 0.48, uFftParams.y) * (0.45 + 0.55 * storm);
    float inject = (1.0 - smoothstep(foldLo, foldHi, jMin)) * energy * openMask;
    foam = min(max(foam, inject) + inject * clamp(uDt * 1.4, 0.0, 0.5), 2.5);
  }
  float slick = clamp(prevT.b * uDecaySlick, 0.0, 1.0);
  float occ = clamp(texture2D(uPrev, vUv).a * uDecayOcc, 0.0, 2.0);
  gl_FragColor = vec4(trail, min(foam, 2.5), slick, occ);
}`;

const WAKE_COPY_FRAG = /* glsl */ `
uniform sampler2D uSource;
uniform vec4 uMask;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(uSource, vUv) * uMask; }`;

function rtOpts(type: THREE.TextureDataType, format: THREE.PixelFormat): THREE.RenderTargetOptions {
  return {
    type,
    format,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
  };
}

function makeNeutralFftArray(): THREE.DataArrayTexture {
  const data = new Uint8Array(6 * 4);
  for (let i = 0; i < 6; i++) {
    data[i * 4] = 128;
    data[i * 4 + 1] = 128;
    data[i * 4 + 2] = 128;
    data[i * 4 + 3] = 255; // J_det = 1.0 (no breaking)
  }
  const tex = new THREE.DataArrayTexture(data, 1, 1, 6);
  tex.format = THREE.RGBAFormat;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

export class WakeField implements WakeService {
  readonly bounds: Bounds4;
  private mode: WakeMode;
  private hist: THREE.WebGLRenderTarget[];
  private liveRT: THREE.WebGLRenderTarget | null;
  private idx = 0;
  private count = 0;
  /** PERF: the history decays/diffuses every other frame (on the summed dt); stamps still land every frame */
  private decayDt = 0;
  private frameN = 0;
  private storm = 0;
  private readonly spanX: number;
  private readonly spanZ: number;
  private readonly prevClear = new THREE.Color();
  private readonly attrA: THREE.InstancedBufferAttribute;
  private readonly attrB: THREE.InstancedBufferAttribute;
  private readonly attrRing: THREE.InstancedBufferAttribute;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly trailMat: THREE.ShaderMaterial;
  private readonly liveMat: THREE.ShaderMaterial;
  private readonly stationaryMat: THREE.ShaderMaterial;
  private readonly scene = new THREE.Scene();
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly mesh: THREE.Mesh;
  private readonly decay: FullscreenPass;
  private readonly decayRgba: FullscreenPass;
  private readonly copy: FullscreenPass;
  private readonly liveFallback: THREE.DataTexture;
  private readonly fftFallback: THREE.DataArrayTexture;
  private readonly sdfFallback: THREE.DataTexture;
  private readonly rgbaCompileRT: THREE.WebGLRenderTarget;
  private readonly liveCompileRT: THREE.WebGLRenderTarget;
  private readonly bufA: Float32Array;
  private readonly bufB: Float32Array;
  private readonly bufRing: Float32Array;
  /** Downwind direction (world xz, unit) for lee slicks and foam advection; the ocean system sets it from weather. */
  readonly lee = new THREE.Vector2(0.8, -0.6);
  /** Baseline downwind foam drift speed (m/s, scaled up in storms). */
  windSpeed = 1.8;

  constructor(bounds: Bounds4, histRes = 2048, liveRes = 2048, mode: WakeMode = "r16f") {
    this.bounds = bounds;
    this.mode = mode;
    this.spanX = Math.max(1, bounds[2] - bounds[0]);
    this.spanZ = Math.max(1, bounds[3] - bounds[1]);

    const histFormat = mode === "rgba16f" ? THREE.RGBAFormat : THREE.RedFormat;
    this.hist = [0, 1].map((n) => {
      const rt = new THREE.WebGLRenderTarget(histRes, histRes, rtOpts(THREE.HalfFloatType, histFormat));
      rt.texture.name = `WakeField.Hist${n}`;
      return rt;
    });
    if (mode === "r16f") {
      this.liveRT = new THREE.WebGLRenderTarget(liveRes, liveRes, rtOpts(THREE.UnsignedByteType, THREE.RGBAFormat));
      this.liveRT.texture.name = "WakeField.Live";
    } else {
      this.liveRT = null;
    }

    this.liveFallback = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    this.liveFallback.minFilter = THREE.LinearFilter;
    this.liveFallback.magFilter = THREE.LinearFilter;
    this.liveFallback.wrapS = THREE.ClampToEdgeWrapping;
    this.liveFallback.wrapT = THREE.ClampToEdgeWrapping;
    this.liveFallback.needsUpdate = true;

    this.fftFallback = makeNeutralFftArray();
    this.sdfFallback = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    this.sdfFallback.minFilter = THREE.LinearFilter;
    this.sdfFallback.magFilter = THREE.LinearFilter;
    this.sdfFallback.wrapS = THREE.ClampToEdgeWrapping;
    this.sdfFallback.wrapT = THREE.ClampToEdgeWrapping;
    this.sdfFallback.needsUpdate = true;

    this.rgbaCompileRT = new THREE.WebGLRenderTarget(1, 1, rtOpts(THREE.HalfFloatType, THREE.RGBAFormat));
    this.rgbaCompileRT.texture.name = "WakeField.RgbaCompile";
    this.liveCompileRT = new THREE.WebGLRenderTarget(1, 1, rtOpts(THREE.UnsignedByteType, THREE.RGBAFormat));
    this.liveCompileRT.texture.name = "WakeField.LiveCompile";

    this.bufA = new Float32Array(MAX_STAMPS * 4);
    this.bufB = new Float32Array(MAX_STAMPS * 4);
    this.bufRing = new Float32Array(MAX_STAMPS);
    this.attrA = new THREE.InstancedBufferAttribute(this.bufA, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrB = new THREE.InstancedBufferAttribute(this.bufB, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrRing = new THREE.InstancedBufferAttribute(this.bufRing, 1).setUsage(THREE.DynamicDrawUsage);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.geo.setAttribute("sA", this.attrA);
    this.geo.setAttribute("sB", this.attrB);
    this.geo.setAttribute("sRing", this.attrRing);
    this.geo.instanceCount = 0;

    const uBounds = { value: new THREE.Vector4(...bounds) };
    const uSwell = { value: new THREE.Vector2(SWELL_DIR[0], SWELL_DIR[1]).normalize() };
    const common = {
      vertexShader: STAMP_VERT,
      fragmentShader: STAMP_FRAG,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendEquation: THREE.AddEquation,
    } as const;
    this.trailMat = new THREE.ShaderMaterial({ ...common, uniforms: { uBounds, uTrail: { value: 1 }, uDt: { value: 0.016 } } });
    this.liveMat = new THREE.ShaderMaterial({
      ...common,
      uniforms: { uBounds, uTrail: { value: 0 }, uDt: { value: 0.016 }, uLee: { value: this.lee }, uSwell },
    });
    this.stationaryMat = new THREE.ShaderMaterial({
      name: "hb_wake_stationary",
      vertexShader: WAKE_STATIONARY_VERT,
      fragmentShader: WAKE_STATIONARY_FRAG,
      uniforms: { uBounds, uLee: { value: this.lee }, uSwell },
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      transparent: true,
      fog: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.MaxEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.MaxEquation,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
    });

    this.mesh = new THREE.Mesh(this.geo, this.trailMat);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    this.decay = new FullscreenPass(DECAY_FRAG, {
      uPrev: { value: null },
      uDecay: { value: 1 },
      uSpread: { value: 0 },
      uTexel: { value: new THREE.Vector2(1 / histRes, 1 / histRes) },
    });
    this.decayRgba = new FullscreenPass(
      WAKE_DECAY_RGBA_FRAG,
      {
        uPrev: { value: null },
        uBounds,
        uTexel: { value: new THREE.Vector2(1 / histRes, 1 / histRes) },
        uAdvect: { value: new THREE.Vector2(0, 0) },
        uDt: { value: 0.016 },
        uDecayTrail: { value: 1 },
        uDecayFoam: { value: 1 },
        uDecaySlick: { value: 1 },
        uDecayOcc: { value: 1 },
        uSpread: { value: 0 },
        uFftAtlas: { value: this.fftFallback },
        uFftScales: { value: new THREE.Vector4(1 / 509, 1 / 97, 1 / 17.3, 0) },
        uFftParams: { value: new THREE.Vector4(0, 0.24, 0, 0) },
        uSdf: { value: this.sdfFallback },
        uSdfBounds: { value: new THREE.Vector4(...bounds) },
        uSceneCenter: { value: new THREE.Vector2(0, 0) },
        uSdfOn: { value: 0 },
      },
      { name: "hb_wake_decay_rgba" },
    );
    this.copy = new FullscreenPass(
      WAKE_COPY_FRAG,
      { uSource: { value: null }, uMask: { value: new THREE.Vector4(1, 1, 1, 1) } },
      { name: "hb_wake_resize" },
    );
  }

  preparationEntries(): PreparationEntry[] {
    // Separate proxies retain all stamp/decay materials without touching history, count or the ping-pong index.
    return [
      this.copy.preparationEntry(() => this.hist[this.idx]),
      this.copy.preparationEntry(() => this.liveRT ?? this.liveCompileRT),
      this.decay.preparationEntry(() => this.hist[1 - this.idx]),
      { root: new THREE.Mesh(this.geo, this.trailMat), camera: this.cam, target: () => this.hist[1 - this.idx] },
      { root: new THREE.Mesh(this.geo, this.liveMat), camera: this.cam, target: () => this.liveRT ?? this.liveCompileRT },
      this.decayRgba.preparationEntry(() => (this.mode === "rgba16f" ? this.hist[1 - this.idx] : this.rgbaCompileRT)),
      { root: new THREE.Mesh(this.geo, this.stationaryMat), camera: this.cam, target: () => (this.mode === "rgba16f" ? this.hist[1 - this.idx] : this.rgbaCompileRT) },
    ];
  }

  get wakeMode(): WakeMode { return this.mode; }
  get texture(): THREE.Texture { return this.hist[this.idx].texture; }
  get live(): THREE.Texture { return this.liveRT ? this.liveRT.texture : this.liveFallback; }

  /** Bind live 3-cascade FFT displacement/Jacobian atlas for persistent breaking-foam injection in RGBA16F mode. */
  bindFft(atlas: THREE.DataArrayTexture | null, scales: THREE.Vector4 | null, on: number, seaAmp: number, storm: number): void {
    const u = this.decayRgba.material.uniforms;
    u.uFftAtlas.value = atlas ?? this.fftFallback;
    if (scales) (u.uFftScales.value as THREE.Vector4).copy(scales);
    this.storm = Math.max(0, Math.min(1, storm));
    (u.uFftParams.value as THREE.Vector4).set(atlas && on > 0.5 ? 1 : 0, seaAmp, this.storm, 0);
  }

  /** Optional coast SDF binding so persistent FFT breaking foam masks cleanly to open water. */
  bindSdf(sdf: THREE.Texture | null, bounds?: Bounds4, scx?: number, scz?: number): void {
    const u = this.decayRgba.material.uniforms;
    u.uSdf.value = sdf ?? this.sdfFallback;
    if (bounds) (u.uSdfBounds.value as THREE.Vector4).set(bounds[0], bounds[1], bounds[2], bounds[3]);
    if (scx !== undefined && scz !== undefined) (u.uSceneCenter.value as THREE.Vector2).set(scx, scz);
    u.uSdfOn.value = sdf ? 1 : 0;
  }

  /**
   * Switch storage mode (`"r16f"` ↔ `"rgba16f"`) and/or resolution atomically, resampling existing history
   * before rebind and disposal. Disposes `liveRT` on `"rgba16f"` (returning the 1×1 zero fallback from `live`).
   */
  setMode(renderer: THREE.WebGLRenderer, mode: WakeMode, size: number, rebind: () => void): void {
    if (this.mode === mode && this.hist[0].width === size && (mode === "rgba16f" || (this.liveRT !== null && this.liveRT.width === size))) {
      return;
    }
    const previous: THREE.WebGLRenderTarget[] = this.liveRT ? [...this.hist, this.liveRT] : [...this.hist];
    const histFormat = mode === "rgba16f" ? THREE.RGBAFormat : THREE.RedFormat;
    const nextHist = [0, 1].map((n) => {
      const rt = new THREE.WebGLRenderTarget(size, size, rtOpts(THREE.HalfFloatType, histFormat));
      rt.texture.name = `WakeField.Hist${n}`;
      return rt;
    });
    const nextLive = mode === "r16f" ? new THREE.WebGLRenderTarget(size, size, rtOpts(THREE.UnsignedByteType, THREE.RGBAFormat)) : null;
    if (nextLive) nextLive.texture.name = "WakeField.Live";
    const nextAll = nextLive ? [...nextHist, nextLive] : nextHist;
    const uCopy = this.copy.material.uniforms;
    const uMask = uCopy.uMask.value as THREE.Vector4;
    try {
      // Switching R16F -> RGBA16F must zero GBA because sampling a RedFormat texture reads alpha = 1.0.
      if (this.mode === "r16f" && mode === "rgba16f") uMask.set(1, 0, 0, 0);
      else uMask.set(1, 1, 1, 1);
      for (let i = 0; i < 2; i++) {
        uCopy.uSource.value = this.hist[i].texture;
        this.copy.render(renderer, nextHist[i], false);
      }
      if (nextLive) {
        if (this.liveRT) {
          uMask.set(1, 1, 1, 1);
          uCopy.uSource.value = this.liveRT.texture;
        } else {
          uMask.set(0, 0, 0, 0);
          uCopy.uSource.value = this.liveFallback;
        }
        this.copy.render(renderer, nextLive, false);
      }
    } catch (error) {
      for (const target of nextAll) target.dispose();
      throw error;
    } finally {
      uCopy.uSource.value = null;
      uMask.set(1, 1, 1, 1);
    }
    this.mode = mode;
    this.hist = nextHist;
    this.liveRT = nextLive;
    this.decay.material.uniforms.uPrev.value = this.texture;
    (this.decay.material.uniforms.uTexel.value as THREE.Vector2).set(1 / size, 1 / size);
    this.decayRgba.material.uniforms.uPrev.value = this.texture;
    (this.decayRgba.material.uniforms.uTexel.value as THREE.Vector2).set(1 / size, 1 / size);
    rebind();
    for (const target of previous) target.dispose();
  }

  /** Publish all resampled layers together, before releasing any texture a consumer held. */
  resize(renderer: THREE.WebGLRenderer, size: number, rebind: () => void): void {
    this.setMode(renderer, this.mode, size, rebind);
  }

  stamp(x: number, z: number, vx: number, vz: number, halfWidth: number, strength: number, halfLength?: number, seed = 0, ringScale = 1): void {
    if (this.count >= MAX_STAMPS) return;
    const spd = Math.hypot(vx, vz);
    const i = this.count++;
    this.bufA[i * 4] = x; this.bufA[i * 4 + 1] = z;
    this.bufA[i * 4 + 2] = spd > 1e-3 ? Math.atan2(vx, vz) : 0;
    this.bufA[i * 4 + 3] = halfLength ?? halfWidth * 3.1;
    this.bufB[i * 4] = halfWidth; this.bufB[i * 4 + 1] = spd; this.bufB[i * 4 + 2] = strength; this.bufB[i * 4 + 3] = seed;
    this.bufRing[i] = ringScale;
  }

  /**
   * Advance the field: decay+diffuse history, add trail stamps, rebuild live (r16f) or stamp stationary hulls (rgba16f).
   * PERF: the full-field decay pass runs every other frame on the summed dt; stamps still land every frame.
   */
  update(renderer: THREE.WebGLRenderer, dt: number): void {
    this.decayDt += dt;
    const decayNow = (++this.frameN & 1) === 0 || this.decayDt > 0.2;
    const src = this.hist[this.idx], dst = decayNow ? this.hist[1 - this.idx] : src;
    if (decayNow) {
      if (this.mode === "rgba16f") {
        const u = this.decayRgba.material.uniforms;
        const ddt = this.decayDt;
        const tauFoam = 2.8 + 2.0 * this.storm;
        const drift = this.windSpeed * (1 + 1.4 * this.storm) * ddt;
        u.uPrev.value = src.texture;
        u.uDt.value = ddt;
        u.uDecayTrail.value = Math.exp(-ddt / 7.5);
        u.uDecayFoam.value = Math.exp(-ddt / tauFoam);
        u.uDecaySlick.value = Math.exp(-ddt / 0.35);
        u.uDecayOcc.value = Math.exp(-ddt / 0.25);
        u.uSpread.value = Math.min(0.28, ddt * 1.8);
        (u.uAdvect.value as THREE.Vector2).set((this.lee.x * drift) / this.spanX, (this.lee.y * drift) / this.spanZ);
        this.decayRgba.render(renderer, dst, false);
      } else {
        const u = this.decay.material.uniforms;
        u.uPrev.value = src.texture;
        u.uDecay.value = Math.exp(-this.decayDt / 8.0);
        u.uSpread.value = Math.min(0.28, this.decayDt * 1.8);
        // The decay triangle writes every history texel (no discard/blending); initialization/live clears stay intact.
        this.decay.render(renderer, dst, false);
      }
      this.decayDt = 0;
    }

    this.geo.instanceCount = this.count;
    if (this.count > 0) {
      this.attrA.clearUpdateRanges(); this.attrA.addUpdateRange(0, this.count * 4); this.attrA.needsUpdate = true;
      this.attrB.clearUpdateRanges(); this.attrB.addUpdateRange(0, this.count * 4); this.attrB.needsUpdate = true;
      this.attrRing.clearUpdateRanges(); this.attrRing.addUpdateRange(0, this.count); this.attrRing.needsUpdate = true;
    }
    const prevTarget = renderer.getRenderTarget(), prevAuto = renderer.autoClear;
    const prevClear = renderer.getClearColor(this.prevClear), prevAlpha = renderer.getClearAlpha();
    try {
      renderer.autoClear = false;
      if (this.count > 0) {
        this.trailMat.uniforms.uDt.value = dt;
        this.mesh.material = this.trailMat;
        renderer.setRenderTarget(dst);
        renderer.render(this.scene, this.cam);
        if (this.mode === "rgba16f") {
          this.mesh.material = this.stationaryMat;
          renderer.render(this.scene, this.cam);
        }
      }
      if (this.liveRT) {
        renderer.setRenderTarget(this.liveRT);
        renderer.setClearColor(0x000000, 0);
        renderer.clear(true, false, false);
        if (this.count > 0) {
          this.mesh.material = this.liveMat;
          renderer.render(this.scene, this.cam);
        }
      }
    } finally {
      renderer.setClearColor(prevClear, prevAlpha);
      renderer.autoClear = prevAuto;
      renderer.setRenderTarget(prevTarget);
    }
    if (decayNow) this.idx = 1 - this.idx;
    this.count = 0;
  }

  /** Tab return: no orphaned trails survive a UTC pose reconciliation. */
  clear(renderer: THREE.WebGLRenderer): void {
    const target = renderer.getRenderTarget(), alpha = renderer.getClearAlpha();
    renderer.getClearColor(this.prevClear);
    try {
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(this.hist[0]); renderer.clear(true, false, false);
      renderer.setRenderTarget(this.hist[1]); renderer.clear(true, false, false);
      if (this.liveRT) { renderer.setRenderTarget(this.liveRT); renderer.clear(true, false, false); }
    } finally {
      renderer.setClearColor(this.prevClear, alpha);
      renderer.setRenderTarget(target);
    }
    this.count = 0; this.decayDt = 0;
  }

  dispose(): void {
    for (const rt of this.hist) rt.dispose();
    this.liveRT?.dispose();
    this.liveRT = null;
    this.liveFallback.dispose();
    this.fftFallback.dispose();
    this.sdfFallback.dispose();
    this.rgbaCompileRT.dispose();
    this.liveCompileRT.dispose();
    this.geo.dispose();
    this.trailMat.dispose();
    this.liveMat.dispose();
    this.stationaryMat.dispose();
    this.decay.dispose();
    this.decayRgba.dispose();
    this.copy.dispose();
  }
}
