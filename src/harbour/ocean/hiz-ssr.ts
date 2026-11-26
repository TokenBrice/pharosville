import * as THREE from "three";
import type { PreparationEntry } from "../engine/types";

/**
 * Medium-tier Same-Frame `R32F` Hi-Z SSR + Motion-Clamped Temporal Denoise (`PLAN.md` §5.6, H9 / M6).
 *
 * Replaces the legacy 1-frame lagging post-`RenderPass` `MirrorPass` and its `alpha = 0.05..0.5` water-mask hack:
 * - Runs inside `ocean.onBeforeRender` immediately after `SceneCapture`, reading the same-frame mipped `uCapColor`
 *   and hardware `uCapDepth` with ZERO 1-frame camera-pan lag.
 * - Stage 1 (`hb_hiz_init` + `hb_hiz_mip`): builds a 5-level (`L0..L4`) conservative min-depth pyramid in separate
 *   `R32F` targets (probing `EXT_color_buffer_float` with automatic `R16F` fallback) so there are zero read-write
 *   feedback loops, zero fp16 depth-quantization errors, and conservative odd-dimension min reductions.
 * - Stage 2 (`hb_ssr_trace`): analytical water-plane visibility early-out rejects sky and dry above-water pixels
 *   before launching a 20-step coarse-to-fine hierarchical ray march + 3 binary refinements with rotating IGN jitter,
 *   sampling roughness-mipped `uCapColor` and emitting premultiplied HDR reflection + confidence.
 * - Stage 3 (`hb_ssr_denoise`): reprojects `Y = 0` water points via `uPrevVP` into a ping-pong `RGBA16F` history
 *   pair with 3×3 neighborhood AABB clamping and divergence-adaptive blending (`0.22` static → `0.85` on moving
 *   hulls / disocclusions) so boats leave zero ghost trails.
 * - Strictly preserves Three.js r186 FBO, `READ_FRAMEBUFFER`, scissor test, autoClear, and clear color/alpha in
 *   `finally` without calling `renderer.state.reset()` or touching `renderer.shadowMap.enabled`.
 */
export const HIZ_LEVELS = 5;
export const SSR_RAY = 320;
export const SSR_STRENGTH = 0.66;
export const SSR_WOBBLE = 0.036;
export const SSR_FADE = 0.6;

/** Half-CSS target dimensions (minimum 1×1, never scaled by DPR). */
export function ssrTargetSize(cssWidth: number, cssHeight: number): { width: number; height: number } {
  return {
    width: Math.max(1, Math.ceil(cssWidth / 2)),
    height: Math.max(1, Math.ceil(cssHeight / 2)),
  };
}

/** Per-level conservative Hi-Z pyramid dimensions (`ceil(w / 2^k)`). */
export function hizLevelSize(baseWidth: number, baseHeight: number, level: number): { width: number; height: number } {
  const div = 1 << level;
  return {
    width: Math.max(1, Math.ceil(baseWidth / div)),
    height: Math.max(1, Math.ceil(baseHeight / div)),
  };
}

export const HIZ_FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const HIZ_INIT_FRAG = /* glsl */ `
uniform highp sampler2D uCapDepth;
uniform vec2 uSrcSize;
uniform vec2 uDstSize;
varying vec2 vUv;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 maxC = max(ivec2(uSrcSize) - ivec2(1), ivec2(0));
  vec2 scale = uSrcSize / max(uDstSize, vec2(1.0));
  ivec2 lo = min(ivec2(floor(vec2(p) * scale + 1e-4)), maxC);
  ivec2 hi = min(ivec2(ceil(vec2(p + ivec2(1)) * scale - 1e-4)) - ivec2(1), maxC);
  hi = max(hi, lo);
  float d = 1.0;
  for (int y = 0; y < 4; y++) {
    int sy = lo.y + y;
    if (sy > hi.y) break;
    for (int x = 0; x < 4; x++) {
      int sx = lo.x + x;
      if (sx > hi.x) break;
      d = min(d, texelFetch(uCapDepth, ivec2(sx, sy), 0).r);
    }
  }
  gl_FragColor = vec4(d, 0.0, 0.0, 1.0);
}
`;

export const HIZ_MIP_FRAG = /* glsl */ `
uniform highp sampler2D uPrevHiZ;
uniform vec2 uPrevSize;
uniform vec2 uDstSize;
varying vec2 vUv;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 maxC = max(ivec2(uPrevSize) - ivec2(1), ivec2(0));
  vec2 scale = uPrevSize / max(uDstSize, vec2(1.0));
  ivec2 lo = min(ivec2(floor(vec2(p) * scale + 1e-4)), maxC);
  ivec2 hi = min(ivec2(ceil(vec2(p + ivec2(1)) * scale - 1e-4)) - ivec2(1), maxC);
  hi = max(hi, lo);
  ivec2 mid = min(lo + ivec2(1), hi);
  float d = min(
    min(texelFetch(uPrevHiZ, ivec2(lo.x, lo.y), 0).r, texelFetch(uPrevHiZ, ivec2(mid.x, lo.y), 0).r),
    min(texelFetch(uPrevHiZ, ivec2(lo.x, mid.y), 0).r, texelFetch(uPrevHiZ, ivec2(mid.x, mid.y), 0).r)
  );
  bool extraX = hi.x > mid.x;
  bool extraY = hi.y > mid.y;
  if (extraX) {
    d = min(d, min(texelFetch(uPrevHiZ, ivec2(hi.x, lo.y), 0).r, texelFetch(uPrevHiZ, ivec2(hi.x, mid.y), 0).r));
  }
  if (extraY) {
    d = min(d, min(texelFetch(uPrevHiZ, ivec2(lo.x, hi.y), 0).r, texelFetch(uPrevHiZ, ivec2(mid.x, hi.y), 0).r));
  }
  if (extraX && extraY) {
    d = min(d, texelFetch(uPrevHiZ, ivec2(hi.x, hi.y), 0).r);
  }
  gl_FragColor = vec4(d, 0.0, 0.0, 1.0);
}
`;

export const SSR_TRACE_FRAG = /* glsl */ `
uniform sampler2D uCapColor;
uniform highp sampler2D uCapDepth;
uniform highp sampler2D uHiZ0;
uniform highp sampler2D uHiZ1;
uniform highp sampler2D uHiZ2;
uniform highp sampler2D uHiZ3;
uniform highp sampler2D uHiZ4;
uniform mat4 uProj;
uniform mat4 uInvProj;
uniform mat4 uInvVP;
uniform mat4 uView;
uniform vec3 uCamPos;
uniform vec3 uUp;
uniform vec3 uRay;
uniform float uSeaAmp;
uniform float uFrameJitter;
varying vec2 vUv;

float hbViewZ(float d) {
  return (uRay.x * uRay.y) / ((uRay.y - uRay.x) * d - uRay.y);
}
vec3 hbViewPos(vec2 uv, float d) {
  vec4 p = uInvProj * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
vec3 hbToNdc(vec3 q) {
  vec4 c = uProj * vec4(q, 1.0);
  return c.xyz / c.w;
}
float hbIgn(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
float hbSampleHiZ(vec2 uv, int lv) {
  if (lv <= 0) return textureLod(uHiZ0, uv, 0.0).r;
  if (lv == 1) return textureLod(uHiZ1, uv, 0.0).r;
  if (lv == 2) return textureLod(uHiZ2, uv, 0.0).r;
  if (lv == 3) return textureLod(uHiZ3, uv, 0.0).r;
  return textureLod(uHiZ4, uv, 0.0).r;
}

void main() {
  vec4 farClip = uInvVP * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 V_ray = normalize(farClip.xyz / farClip.w - uCamPos);
  if (V_ray.y >= -1e-4) { gl_FragColor = vec4(0.0); return; }
  float tW = -uCamPos.y / V_ray.y;
  if (tW <= 0.0 || tW > uRay.z * 12.0) { gl_FragColor = vec4(0.0); return; }

  float dOp = textureLod(uCapDepth, vUv, 0.0).r;
  if (dOp < 0.99999) {
    vec4 opClip = uInvVP * vec4(vUv * 2.0 - 1.0, dOp * 2.0 - 1.0, 1.0);
    vec3 P_op = opClip.xyz / opClip.w;
    if (P_op.y > uSeaAmp * 1.8 + 0.35 && distance(uCamPos, P_op) < tW - 0.5) {
      gl_FragColor = vec4(0.0);
      return;
    }
  }

  vec3 P_world = uCamPos + V_ray * tW;
  vec3 P_view = (uView * vec4(P_world, 1.0)).xyz;
  vec3 R_view = reflect(normalize(P_view), uUp);
  float facing = 1.0 - smoothstep(-0.15, 0.2, R_view.z);
  if (facing <= 0.0) { gl_FragColor = vec4(0.0); return; }

  float jit = fract(hbIgn(gl_FragCoord.xy) + uFrameJitter);
  float s = (0.20 + 0.80 * jit) / 24.0;
  float lastS = 0.0;
  float refineS = 0.0;
  float lastT = 0.0;
  float hitT = -1.0;
  float thick = 2.2;
  float occZ = -1e9;
  int lv = 1;
  vec2 uv = vUv;

  for (int i = 0; i < 24; i++) {
    float t = uRay.z * pow(max(s, 0.0), 1.65);
    vec3 q = P_view + R_view * t;
    if (q.z > -uRay.x) break;
    vec3 ndc = hbToNdc(q);
    uv = ndc.xy * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    float rayD = ndc.z * 0.5 + 0.5;
    float hizD = hbSampleHiZ(uv, lv);

    if (rayD < hizD) {
      lastT = t;
      lastS = s;
      float stride = (1.0 / 24.0) * (s < refineS ? (1.0 + 0.2 * float(lv)) : (1.0 + 0.35 * float(lv)));
      s += stride;
      if (s >= refineS) lv = min(lv + 1, 4);
      if (s > 1.0) break;
    } else if (lv > 0) {
      refineS = max(refineS, s);
      s = mix(lastS, s, 0.5);
      lv -= 1;
    } else {
      float surfZ = hbViewZ(hizD);
      float dz = surfZ - q.z;
      thick = max(2.2, (t - lastT) * 1.85);
      if (hizD < 0.9999 && dz > 0.0 && dz < thick) {
        hitT = t;
        break;
      }
      if (hizD < 0.9999) {
        vec3 surfP = hbViewPos(uv, hizD);
        float surfH = dot(surfP - P_view, uUp);
        if (dz >= thick && surfH > 1.5) break;
        if (surfH > 2.2) occZ = max(occZ, surfZ);
      }
      lastT = t;
      lastS = s;
      s += 1.0 / 24.0;
      if (s > 1.0) break;
    }
  }

  if (hitT < 0.0) { gl_FragColor = vec4(0.0); return; }

  float a = lastT;
  float b = hitT;
  for (int j = 0; j < 3; j++) {
    float m = 0.5 * (a + b);
    vec3 mq = P_view + R_view * m;
    vec2 muv = hbToNdc(mq).xy * 0.5 + 0.5;
    float md = textureLod(uHiZ0, clamp(muv, vec2(0.0), vec2(1.0)), 0.0).r;
    if (md < 0.9999 && (hbViewZ(md) - mq.z) > 0.0) b = m; else a = m;
  }

  vec3 hitQ = P_view + R_view * b;
  uv = hbToNdc(hitQ).xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0); return; }

  float hitD = textureLod(uHiZ0, uv, 0.0).r;
  if (hitD >= 0.9999) { gl_FragColor = vec4(0.0); return; }
  float hitSurfZ = hbViewZ(hitD);
  float dz = hitSurfZ - hitQ.z;
  if (occZ > -1e8 && (occZ - hitSurfZ) > 38.0 && b > 95.0) { gl_FragColor = vec4(0.0); return; }

  vec3 hitSurfP = hbViewPos(uv, hitD);
  if (dot(hitSurfP - P_view, uUp) < -0.25) { gl_FragColor = vec4(0.0); return; }

  float roughLod = clamp(b / 110.0, 0.0, 2.5);
  vec3 hitRgb = textureLod(uCapColor, uv, roughLod).rgb;
  float edge = smoothstep(0.0, 0.05, uv.x) * smoothstep(0.0, 0.05, 1.0 - uv.x)
    * smoothstep(0.0, 0.12, 1.0 - uv.y) * smoothstep(0.0, 0.02, uv.y);
  float conf = edge * facing
    * (1.0 - smoothstep(0.5, 1.0, max(dz, 0.0) / thick))
    * (1.0 - smoothstep(0.65, 1.0, b / uRay.z));
  bool ok = hitRgb.r >= 0.0 && hitRgb.r <= 65000.0
    && hitRgb.g >= 0.0 && hitRgb.g <= 65000.0
    && hitRgb.b >= 0.0 && hitRgb.b <= 65000.0
    && conf >= 0.0 && conf <= 1.0;
  gl_FragColor = ok ? vec4(min(hitRgb, vec3(32.0)) * conf, conf) : vec4(0.0);
}
`;

export const SSR_DENOISE_FRAG = /* glsl */ `
uniform sampler2D uRawSsr;
uniform sampler2D uHistory;
uniform mat4 uInvVP;
uniform mat4 uPrevVP;
uniform vec3 uCamPos;
uniform vec2 uTexel;
uniform float uHasHistory;
varying vec2 vUv;

void main() {
  vec4 cur = textureLod(uRawSsr, vUv, 0.0);
  if (uHasHistory < 0.5) { gl_FragColor = cur; return; }

  vec4 farClip = uInvVP * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 V_ray = normalize(farClip.xyz / farClip.w - uCamPos);
  if (V_ray.y >= -1e-4) { gl_FragColor = cur; return; }
  float tW = -uCamPos.y / V_ray.y;
  if (tW <= 0.0) { gl_FragColor = cur; return; }

  vec3 P_water = uCamPos + V_ray * tW;
  vec4 prevClip = uPrevVP * vec4(P_water, 1.0);
  if (prevClip.w <= 1e-4) { gl_FragColor = cur; return; }
  vec2 prevUv = prevClip.xy / prevClip.w * 0.5 + 0.5;
  if (prevUv.x < 0.01 || prevUv.x > 0.99 || prevUv.y < 0.01 || prevUv.y > 0.99) {
    gl_FragColor = cur;
    return;
  }

  vec4 nMin = cur;
  vec4 nMax = cur;
  vec4 nSum = cur;
  float nW = 1.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      if (dx == 0 && dy == 0) continue;
      vec2 suv = clamp(vUv + vec2(float(dx), float(dy)) * uTexel, vec2(0.0), vec2(1.0));
      vec4 s = textureLod(uRawSsr, suv, 0.0);
      nMin = min(nMin, s);
      nMax = max(nMax, s);
      float w = (dx == 0 || dy == 0) ? 0.65 : 0.35;
      nSum += s * w;
      nW += w;
    }
  }
  vec4 nAvg = nSum / nW;
  float holeFill = (1.0 - smoothstep(0.05, 0.28, cur.a)) * smoothstep(0.22, 0.55, nMax.a) * 0.62;
  vec4 curClean = mix(cur, nAvg, holeFill);

  vec4 hist = textureLod(uHistory, prevUv, 0.0);
  vec4 clamped = clamp(hist, nMin, nMax);
  float lumCur = dot(curClean.rgb, vec3(0.2126, 0.7152, 0.0722));
  float lumHist = dot(hist.rgb, vec3(0.2126, 0.7152, 0.0722));
  float denom = max(max(lumCur, lumHist), 0.15);
  float clampDelta = length(hist.rgb - clamped.rgb) / denom;
  float colorDelta = length(curClean.rgb - hist.rgb) / denom;
  float covDelta = abs(curClean.a - hist.a);
  float div = clamp(max(max(clampDelta * 0.65, colorDelta * 0.55), covDelta * 1.8), 0.0, 1.0);
  float alpha = mix(0.22, 0.85, smoothstep(0.08, 0.55, div));
  gl_FragColor = mix(clamped, curClean, alpha);
}
`;

export interface HiZSSRUniforms {
  uMirrorTex: THREE.IUniform<THREE.Texture>;
  uMirror: THREE.IUniform<THREE.Vector4>;
}

function createFullscreenTri(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  return g;
}

export class HiZSSR {
  readonly uniforms: HiZSSRUniforms;

  private readonly fallback: THREE.DataTexture;
  private readonly fallbackDepth: THREE.DataTexture;
  private readonly geo: THREE.BufferGeometry;
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  private readonly initMat: THREE.ShaderMaterial;
  private readonly mipMat: THREE.ShaderMaterial;
  private readonly traceMat: THREE.ShaderMaterial;
  private readonly denoiseMat: THREE.ShaderMaterial;

  private readonly initMesh: THREE.Mesh;
  private readonly mipMesh: THREE.Mesh;
  private readonly traceMesh: THREE.Mesh;
  private readonly denoiseMesh: THREE.Mesh;

  private readonly initScene = new THREE.Scene();
  private readonly mipScene = new THREE.Scene();
  private readonly traceScene = new THREE.Scene();
  private readonly denoiseScene = new THREE.Scene();

  private readonly compileHizRT: THREE.WebGLRenderTarget;
  private readonly compileColorRT: THREE.WebGLRenderTarget;

  private hizRT: Array<THREE.WebGLRenderTarget | null> = Array.from({ length: HIZ_LEVELS }, () => null);
  private rawRT: THREE.WebGLRenderTarget | null = null;
  private histRT: [THREE.WebGLRenderTarget | null, THREE.WebGLRenderTarget | null] = [null, null];
  private readIdx = 0;

  private hizType: THREE.TextureDataType = THREE.FloatType;
  private floatProbed = false;
  private cssW = 1;
  private cssH = 1;
  private _strength = SSR_STRENGTH;
  private active = false;
  private _enabled = false;
  private _ready = false;
  private shown = 0;
  private visibility = 1;
  private hasHistory = false;
  private frameIndex = 0;
  private disposed = false;

  private readonly vpScratch = new THREE.Matrix4();
  private readonly invVpScratch = new THREE.Matrix4();
  private readonly prevVP = new THREE.Matrix4();
  private readonly prevCamPos = new THREE.Vector3();
  private readonly prevCamDir = new THREE.Vector3(0, 0, -1);
  private readonly curCamDir = new THREE.Vector3();
  private readonly cssSize = new THREE.Vector2(1, 1);
  private readonly prevClear = new THREE.Color();

  constructor() {
    this.fallback = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    this.fallback.minFilter = THREE.LinearFilter;
    this.fallback.magFilter = THREE.LinearFilter;
    this.fallback.wrapS = THREE.ClampToEdgeWrapping;
    this.fallback.wrapT = THREE.ClampToEdgeWrapping;
    this.fallback.needsUpdate = true;

    this.fallbackDepth = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    this.fallbackDepth.minFilter = THREE.NearestFilter;
    this.fallbackDepth.magFilter = THREE.NearestFilter;
    this.fallbackDepth.wrapS = THREE.ClampToEdgeWrapping;
    this.fallbackDepth.wrapT = THREE.ClampToEdgeWrapping;
    this.fallbackDepth.needsUpdate = true;

    this.uniforms = {
      uMirrorTex: { value: this.fallback },
      uMirror: { value: new THREE.Vector4(0, SSR_WOBBLE, 0, 0) },
    };

    this.geo = createFullscreenTri();

    this.compileHizRT = new THREE.WebGLRenderTarget(1, 1, {
      format: THREE.RedFormat,
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    this.compileHizRT.texture.name = "HiZSSR.CompileHiZ";

    this.compileColorRT = new THREE.WebGLRenderTarget(1, 1, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    this.compileColorRT.texture.name = "HiZSSR.CompileColor";

    const passOpts = {
      vertexShader: HIZ_FULLSCREEN_VERT,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    } as const;

    this.initMat = new THREE.ShaderMaterial({
      ...passOpts,
      name: "hb_hiz_init",
      fragmentShader: HIZ_INIT_FRAG,
      uniforms: {
        uCapDepth: { value: this.fallbackDepth },
        uSrcSize: { value: new THREE.Vector2(1, 1) },
        uDstSize: { value: new THREE.Vector2(1, 1) },
      },
    });

    this.mipMat = new THREE.ShaderMaterial({
      ...passOpts,
      name: "hb_hiz_mip",
      fragmentShader: HIZ_MIP_FRAG,
      uniforms: {
        uPrevHiZ: { value: this.fallbackDepth },
        uPrevSize: { value: new THREE.Vector2(1, 1) },
        uDstSize: { value: new THREE.Vector2(1, 1) },
      },
    });

    this.traceMat = new THREE.ShaderMaterial({
      ...passOpts,
      name: "hb_ssr_trace",
      fragmentShader: SSR_TRACE_FRAG,
      uniforms: {
        uCapColor: { value: this.fallback },
        uCapDepth: { value: this.fallbackDepth },
        uHiZ0: { value: this.fallbackDepth },
        uHiZ1: { value: this.fallbackDepth },
        uHiZ2: { value: this.fallbackDepth },
        uHiZ3: { value: this.fallbackDepth },
        uHiZ4: { value: this.fallbackDepth },
        uProj: { value: new THREE.Matrix4() },
        uInvProj: { value: new THREE.Matrix4() },
        uInvVP: { value: new THREE.Matrix4() },
        uView: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uUp: { value: new THREE.Vector3(0, 1, 0) },
        uRay: { value: new THREE.Vector3(5, 9000, SSR_RAY) },
        uSeaAmp: { value: 0.25 },
        uFrameJitter: { value: 0 },
      },
    });

    this.denoiseMat = new THREE.ShaderMaterial({
      ...passOpts,
      name: "hb_ssr_denoise",
      fragmentShader: SSR_DENOISE_FRAG,
      uniforms: {
        uRawSsr: { value: this.fallback },
        uHistory: { value: this.fallback },
        uInvVP: { value: new THREE.Matrix4() },
        uPrevVP: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uHasHistory: { value: 0 },
      },
    });

    this.initMesh = new THREE.Mesh(this.geo, this.initMat);
    this.mipMesh = new THREE.Mesh(this.geo, this.mipMat);
    this.traceMesh = new THREE.Mesh(this.geo, this.traceMat);
    this.denoiseMesh = new THREE.Mesh(this.geo, this.denoiseMat);
    for (const m of [this.initMesh, this.mipMesh, this.traceMesh, this.denoiseMesh]) {
      m.frustumCulled = false;
    }
    this.initScene.add(this.initMesh);
    this.mipScene.add(this.mipMesh);
    this.traceScene.add(this.traceMesh);
    this.denoiseScene.add(this.denoiseMesh);
  }

  get texture(): THREE.Texture {
    if (this._ready && this.histRT[this.readIdx]) {
      return this.histRT[this.readIdx]!.texture;
    }
    return this.fallback;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  get ready(): boolean {
    return this._ready;
  }

  get strength(): number {
    return this._strength;
  }

  set strength(v: number) {
    this._strength = v;
    this.updateStrength();
  }

  /** Exposes internal targets for inspection/testing (`null` when inactive). */
  get targets(): {
    hiz: readonly (THREE.WebGLRenderTarget | null)[];
    raw: THREE.WebGLRenderTarget | null;
    hist: readonly (THREE.WebGLRenderTarget | null)[];
  } {
    return { hiz: this.hizRT, raw: this.rawRT, hist: this.histRT };
  }

  /** D-2 visibility gating: matches `MirrorPass` & `PlanarMirror`. */
  setConditions(fogAmount: number, precipitation: number): void {
    this.visibility = (1 - fogAmount) * (1 - THREE.MathUtils.smoothstep(precipitation, 0.08, 0.3));
    this.updateStrength();
  }

  /**
   * Allocates half-CSS `HiZ.L0..L4`, `HiZSSR.Raw`, and ping-pong `HiZSSR.Hist0/1` on Medium entry.
   * Leaving Medium fades out over `SSR_FADE` (or cuts immediately when `immediate === true`) and disposes all RTs.
   */
  setActive(active: boolean, immediate = false): void {
    if (this.disposed) return;
    if (active === this.active && !(immediate && this.rawRT && !active)) return;
    this.active = active;
    if (!active) {
      if (immediate) this.release();
      return;
    }
    this._enabled = true;
    if (this.rawRT) return;
    this.allocateTargets(this.cssW, this.cssH);
  }

  /** Resizes all half-CSS targets and resets temporal history if dimensions changed. */
  resize(cssWidth: number, cssHeight: number): void {
    this.cssW = cssWidth;
    this.cssH = cssHeight;
    if (!this.rawRT) return;
    const { width, height } = ssrTargetSize(cssWidth, cssHeight);
    if (this.rawRT.width === width && this.rawRT.height === height) return;
    this.resizeTargets(width, height);
  }

  /**
   * Executes the 4-stage same-frame Hi-Z SSR + temporal denoise pipeline inside `ocean.onBeforeRender`.
   * Strictly restores `prevTarget`, `READ_FRAMEBUFFER`, scissor test, autoClear, and clear color/alpha in `finally`.
   */
  render(
    renderer: THREE.WebGLRenderer,
    capColor: THREE.Texture,
    capDepth: THREE.Texture,
    camera: THREE.PerspectiveCamera,
    seaAmp: number,
    dt = 1 / 60,
  ): void {
    if (this.disposed || !this.rawRT) return;

    const step = Math.min(Math.max(dt, 0), 0.25) / SSR_FADE;
    this.shown = this.active ? Math.min(1, this.shown + step) : Math.max(0, this.shown - step);
    if (!this.active && this.shown <= 0) {
      this.release();
      return;
    }

    if (this.visibility <= 0.001) {
      this.hasHistory = false;
      this.updateStrength();
      return;
    }

    const gl = typeof renderer.getContext === "function"
      ? (renderer.getContext() as WebGL2RenderingContext | null)
      : null;

    if (!this.floatProbed && gl && typeof gl.getExtension === "function") {
      this.floatProbed = true;
      const extFloat = gl.getExtension("EXT_color_buffer_float");
      const wantType = extFloat ? THREE.FloatType : THREE.HalfFloatType;
      if (wantType !== this.hizType) {
        this.hizType = wantType;
        this.rebuildHizTargets(this.rawRT.width, this.rawRT.height);
      }
    }

    if (typeof renderer.getSize === "function") {
      renderer.getSize(this.cssSize);
      this.resize(this.cssSize.x, this.cssSize.y);
    }

    const l0 = this.hizRT[0];
    const writeIdx = 1 - this.readIdx;
    const writeHist = this.histRT[writeIdx];
    const readHist = this.histRT[this.readIdx];
    if (!l0 || !writeHist || !readHist) return;

    const w = this.rawRT.width;
    const h = this.rawRT.height;

    // Detect large camera jumps/snaps so temporal history resets cleanly without ghosting (M6).
    camera.getWorldDirection(this.curCamDir);
    const camJump =
      !this.hasHistory ||
      camera.position.distanceToSquared(this.prevCamPos) > 1600 ||
      this.curCamDir.dot(this.prevCamDir) < 0.92;

    this.vpScratch.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.invVpScratch.copy(this.vpScratch).invert();

    // Stage 1a uniforms: conservative footprint min-reduction uCapDepth -> HiZ.L0
    const depthImg = capDepth.image as { width?: number; height?: number } | undefined;
    const srcW = depthImg && typeof depthImg.width === "number" ? depthImg.width : w;
    const srcH = depthImg && typeof depthImg.height === "number" ? depthImg.height : h;
    this.initMat.uniforms.uCapDepth.value = capDepth;
    (this.initMat.uniforms.uSrcSize.value as THREE.Vector2).set(srcW, srcH);
    (this.initMat.uniforms.uDstSize.value as THREE.Vector2).set(w, h);

    // Stage 2 uniforms: hierarchical SSR trace
    const tu = this.traceMat.uniforms;
    tu.uCapColor.value = capColor;
    tu.uCapDepth.value = capDepth;
    tu.uHiZ0.value = this.hizRT[0]!.texture;
    tu.uHiZ1.value = this.hizRT[1]!.texture;
    tu.uHiZ2.value = this.hizRT[2]!.texture;
    tu.uHiZ3.value = this.hizRT[3]!.texture;
    tu.uHiZ4.value = this.hizRT[4]!.texture;
    (tu.uProj.value as THREE.Matrix4).copy(camera.projectionMatrix);
    (tu.uInvProj.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    (tu.uInvVP.value as THREE.Matrix4).copy(this.invVpScratch);
    (tu.uView.value as THREE.Matrix4).copy(camera.matrixWorldInverse);
    (tu.uCamPos.value as THREE.Vector3).copy(camera.position);
    (tu.uUp.value as THREE.Vector3).set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
    (tu.uRay.value as THREE.Vector3).set(camera.near, camera.far, SSR_RAY);
    tu.uSeaAmp.value = seaAmp;
    tu.uFrameJitter.value = (this.frameIndex % 16) * 0.61803399;

    // Stage 3 uniforms: motion-clamped temporal denoise
    const du = this.denoiseMat.uniforms;
    du.uRawSsr.value = this.rawRT.texture;
    du.uHistory.value = readHist.texture;
    (du.uInvVP.value as THREE.Matrix4).copy(this.invVpScratch);
    (du.uPrevVP.value as THREE.Matrix4).copy(this.prevVP);
    (du.uCamPos.value as THREE.Vector3).copy(camera.position);
    (du.uTexel.value as THREE.Vector2).set(1 / w, 1 / h);
    du.uHasHistory.value = camJump ? 0 : 1;

    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevClearColor = renderer.getClearColor(this.prevClear);
    const prevClearAlpha = renderer.getClearAlpha();
    const prevScissor = gl && typeof gl.isEnabled === "function" ? gl.isEnabled(gl.SCISSOR_TEST) : false;

    try {
      renderer.autoClear = false;
      if (prevScissor && typeof renderer.state?.setScissorTest === "function") {
        renderer.state.setScissorTest(false);
      } else if (prevScissor && gl && typeof gl.disable === "function") {
        gl.disable(gl.SCISSOR_TEST);
      }

      // Stage 1a: HiZ L0
      renderer.setRenderTarget(l0);
      renderer.render(this.initScene, this.cam);

      // Stage 1b: HiZ L1..L4
      const mu = this.mipMat.uniforms;
      for (let k = 1; k < HIZ_LEVELS; k++) {
        const prevLevel = this.hizRT[k - 1]!;
        const dstLevel = this.hizRT[k]!;
        mu.uPrevHiZ.value = prevLevel.texture;
        (mu.uPrevSize.value as THREE.Vector2).set(prevLevel.width, prevLevel.height);
        (mu.uDstSize.value as THREE.Vector2).set(dstLevel.width, dstLevel.height);
        renderer.setRenderTarget(dstLevel);
        renderer.render(this.mipScene, this.cam);
      }

      // Stage 2: Same-frame hierarchical SSR trace -> HiZSSR.Raw
      renderer.setRenderTarget(this.rawRT);
      renderer.render(this.traceScene, this.cam);

      // Stage 3: Motion-clamped temporal denoise -> HiZSSR.Hist[writeIdx]
      renderer.setRenderTarget(writeHist);
      renderer.render(this.denoiseScene, this.cam);
    } finally {
      renderer.setClearColor(prevClearColor, prevClearAlpha);
      renderer.autoClear = prevAutoClear;
      renderer.setRenderTarget(prevTarget);
      if (gl) {
        if ((renderer.state?.bindFramebuffer?.(gl.READ_FRAMEBUFFER, null) as unknown as boolean | undefined) === false) {
          gl.bindFramebuffer?.(gl.READ_FRAMEBUFFER, null);
        }
        if (typeof renderer.state?.setScissorTest === "function") {
          renderer.state.setScissorTest(prevScissor);
        } else if (typeof gl.enable === "function" && typeof gl.disable === "function") {
          if (prevScissor) gl.enable(gl.SCISSOR_TEST);
          else gl.disable(gl.SCISSOR_TEST);
        }
      }
    }

    this.readIdx = writeIdx;
    this.prevVP.copy(this.vpScratch);
    this.prevCamPos.copy(camera.position);
    this.prevCamDir.copy(this.curCamDir);
    this.hasHistory = true;
    this.frameIndex = (this.frameIndex + 1) & 0x3fffffff;
    this._ready = true;
    this.uniforms.uMirrorTex.value = writeHist.texture;
    this.updateStrength();
  }

  /**
   * Returns 4 off-screen preparation entries (`hb_hiz_init`, `hb_hiz_mip`, `hb_ssr_trace`, `hb_ssr_denoise`)
   * backed by 1×1 compilation targets off-Medium so tier switches never stall.
   */
  preparationEntries(): PreparationEntry[] {
    return [
      { root: this.initMesh, camera: this.cam, target: () => this.hizRT[0] ?? this.compileHizRT, scene: this.initScene },
      { root: this.mipMesh, camera: this.cam, target: () => this.hizRT[1] ?? this.compileHizRT, scene: this.mipScene },
      { root: this.traceMesh, camera: this.cam, target: () => this.rawRT ?? this.compileColorRT, scene: this.traceScene },
      { root: this.denoiseMesh, camera: this.cam, target: () => this.histRT[0] ?? this.compileColorRT, scene: this.denoiseScene },
    ];
  }

  private allocateTargets(cssW: number, cssH: number): void {
    const { width, height } = ssrTargetSize(cssW, cssH);
    this.rebuildHizTargets(width, height);

    const colorOpts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    };

    this.rawRT = new THREE.WebGLRenderTarget(width, height, colorOpts);
    this.rawRT.texture.name = "HiZSSR.Raw";

    for (let i = 0; i < 2; i++) {
      const rt = new THREE.WebGLRenderTarget(width, height, colorOpts);
      rt.texture.name = `HiZSSR.Hist${i}`;
      this.histRT[i] = rt;
    }

    this.readIdx = 0;
    this.hasHistory = false;
    this._ready = false;
    this.uniforms.uMirror.value.set(0, SSR_WOBBLE, 1, 1.5 / height);
    this.uniforms.uMirrorTex.value = this.fallback;
  }

  private rebuildHizTargets(baseW: number, baseH: number): void {
    for (let k = 0; k < HIZ_LEVELS; k++) {
      this.hizRT[k]?.dispose();
      const { width, height } = hizLevelSize(baseW, baseH, k);
      const rt = new THREE.WebGLRenderTarget(width, height, {
        type: this.hizType,
        format: THREE.RedFormat,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
      });
      rt.texture.name = `HiZ.L${k}`;
      this.hizRT[k] = rt;
    }
  }

  private resizeTargets(width: number, height: number): void {
    for (let k = 0; k < HIZ_LEVELS; k++) {
      const rt = this.hizRT[k];
      if (!rt) continue;
      const sz = hizLevelSize(width, height, k);
      rt.setSize(sz.width, sz.height);
    }
    this.rawRT?.setSize(width, height);
    this.histRT[0]?.setSize(width, height);
    this.histRT[1]?.setSize(width, height);
    this.hasHistory = false;
    this._ready = false;
    this.uniforms.uMirrorTex.value = this.fallback;
    this.uniforms.uMirror.value.x = 0;
    this.uniforms.uMirror.value.w = 1.5 / height;
  }

  private updateStrength(): void {
    const eased = this.shown * this.shown * (3 - 2 * this.shown);
    this.uniforms.uMirror.value.x = this._ready ? this._strength * eased * this.visibility : 0;
  }

  private release(): void {
    this._enabled = false;
    this._ready = false;
    this.shown = 0;
    this.hasHistory = false;
    // Restore fallback BEFORE disposing RTs so live uniforms never reference freed textures.
    this.uniforms.uMirrorTex.value = this.fallback;
    this.uniforms.uMirror.value.set(0, SSR_WOBBLE, 0, 0);
    this.initMat.uniforms.uCapDepth.value = this.fallbackDepth;
    this.mipMat.uniforms.uPrevHiZ.value = this.fallbackDepth;
    this.traceMat.uniforms.uCapColor.value = this.fallback;
    this.traceMat.uniforms.uCapDepth.value = this.fallbackDepth;
    this.traceMat.uniforms.uHiZ0.value = this.fallbackDepth;
    this.traceMat.uniforms.uHiZ1.value = this.fallbackDepth;
    this.traceMat.uniforms.uHiZ2.value = this.fallbackDepth;
    this.traceMat.uniforms.uHiZ3.value = this.fallbackDepth;
    this.traceMat.uniforms.uHiZ4.value = this.fallbackDepth;
    this.denoiseMat.uniforms.uRawSsr.value = this.fallback;
    this.denoiseMat.uniforms.uHistory.value = this.fallback;

    for (let k = 0; k < HIZ_LEVELS; k++) {
      this.hizRT[k]?.dispose();
      this.hizRT[k] = null;
    }
    if (this.rawRT) {
      this.rawRT.dispose();
      this.rawRT = null;
    }
    for (let i = 0; i < 2; i++) {
      this.histRT[i]?.dispose();
      this.histRT[i] = null;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.active = false;
    this.release();
    this.compileHizRT.dispose();
    this.compileColorRT.dispose();
    this.fallback.dispose();
    this.fallbackDepth.dispose();
    this.geo.dispose();
    this.initMat.dispose();
    this.mipMat.dispose();
    this.traceMat.dispose();
    this.denoiseMat.dispose();
  }
}
