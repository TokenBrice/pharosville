import * as THREE from "three";
import { BlendFunction, Effect, EffectAttribute } from "postprocessing";
import type { TimeOfDay } from "../time-of-day";

export type GtaoQuality = "high" | "medium" | "off";

/** Horizon slice count per quality tier (2 symmetric directions per slice). */
export function gtaoDirsFor(q: GtaoQuality): number {
  return q === "high" ? 4 : q === "medium" ? 2 : 0;
}

/** Raymarch steps per half-slice per quality tier. */
export function gtaoStepsFor(q: GtaoQuality): number {
  return q === "high" ? 3 : q === "medium" ? 2 : 0;
}

export const GTAO_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/**
 * Half-resolution Ground-Truth Ambient Occlusion (Jimenez et al. 2016) tuned for PharosVille's
 * telephoto architectural diorama camera (fov ~25°, distances 120..1050 m).
 *
 * Key properties:
 *  - Reuses the composer's existing depth texture (zero extra geometry pass).
 *  - Reconstructs edge-preserving view-space normals via minimum-difference depth neighbors
 *    so silhouettes (Pharos tower, ship masts, rooftops) never develop dark halos.
 *  - Normalizes each slice's cosine-weighted hemisphere integral by its exact analytic unoccluded
 *    value (cos(n) + n * sin(n)), guaranteeing flat grazing planes (sea, plazas) return 1.0 even
 *    at 2 slices on Medium quality.
 *  - Uses static spatial Interleaved Gradient Noise (shimmer-free without TAA, reduced-motion safe).
 */
export const GTAO_AO_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDepth;
uniform vec4 uProjInfo; // (2*tanHalfFov*aspect, 2*tanHalfFov, -tanHalfFov*aspect, -tanHalfFov)
uniform vec4 uClip;     // (near*far, far-near, far, near)
uniform vec4 uTexel;    // (1/fullW, 1/fullH, halfW, halfH)
uniform float uDirs;
uniform float uSteps;
varying vec2 vUv;

const float PI = 3.14159265;
const float HALF_PI = 1.57079633;

float gtaoIgn(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

float linDepth(float z) {
  return uClip.x / max(uClip.z - z * uClip.y, 1e-4);
}

vec3 viewPos(vec2 uv, float d) {
  return vec3((uv * uProjInfo.xy + uProjInfo.zw) * d, -d);
}

void main() {
  float zC = texture2D(tDepth, vUv).r;
  if (zC >= 0.9999) { gl_FragColor = vec4(1.0); return; }
  float dC = linDepth(zC);
  if (dC > 1100.0) { gl_FragColor = vec4(1.0); return; }

  vec3 pC = viewPos(vUv, dC);
  vec3 V = normalize(-pC);

  // Edge-preserving normals from minimum-depth-difference full-res neighbors
  vec2 tx = uTexel.xy;
  float dL = linDepth(texture2D(tDepth, clamp(vUv - vec2(tx.x, 0.0), 0.0, 1.0)).r);
  float dR = linDepth(texture2D(tDepth, clamp(vUv + vec2(tx.x, 0.0), 0.0, 1.0)).r);
  float dD = linDepth(texture2D(tDepth, clamp(vUv - vec2(0.0, tx.y), 0.0, 1.0)).r);
  float dU = linDepth(texture2D(tDepth, clamp(vUv + vec2(0.0, tx.y), 0.0, 1.0)).r);
  vec3 pL = viewPos(vUv - vec2(tx.x, 0.0), dL);
  vec3 pR = viewPos(vUv + vec2(tx.x, 0.0), dR);
  vec3 pD = viewPos(vUv - vec2(0.0, tx.y), dD);
  vec3 pU = viewPos(vUv + vec2(0.0, tx.y), dU);
  vec3 dX = abs(dR - dC) < abs(dC - dL) ? (pR - pC) : (pC - pL);
  vec3 dY = abs(dU - dC) < abs(dC - dD) ? (pU - pC) : (pC - pD);
  vec3 rawN = cross(dX, dY);
  float nl = length(rawN);
  vec3 N = nl > 1e-6 ? rawN / nl : V;
  if (dot(N, V) < 0.0) N = -N;

  // Adaptive architectural world radius (m) projected to half-res pixels
  float R = clamp(3.6 + 0.0055 * dC, 3.6, 8.2);
  float pxPerM = uTexel.w / max(uProjInfo.y * dC, 1e-3);
  float rPx = clamp(R * pxPerM, 2.5, 34.0);
  vec2 uvRad = rPx / max(uTexel.zw, vec2(1.0));

  float noiseA = gtaoIgn(gl_FragCoord.xy);
  float noiseS = gtaoIgn(gl_FragCoord.xy + vec2(19.31, 7.13));

  float aoNum = 0.0;
  float aoDen = 0.0;

  for (int d = 0; d < 4; d++) {
    if (float(d) >= uDirs) break;
    float phi = (PI / max(uDirs, 1.0)) * (float(d) + noiseA);
    vec2 omega = vec2(cos(phi), sin(phi));

    vec3 dirV = vec3(omega.x, omega.y, 0.0);
    vec3 ortho = dirV - dot(dirV, V) * V;
    float ol = length(ortho);
    vec3 T = ol > 1e-5 ? ortho / ol : vec3(1.0, 0.0, 0.0);
    vec3 axis = cross(T, V);
    vec3 projN = N - axis * dot(N, axis);
    float projLen = length(projN);
    if (projLen < 1e-4) continue;

    float n = atan(dot(projN, T), max(dot(projN, V), 1e-5));
    float c1 = -1.0;
    float c2 = -1.0;

    for (int s = 1; s <= 3; s++) {
      if (float(s) > uSteps) break;
      float t = clamp((float(s) - 0.5 + (noiseS - 0.5) * 0.72) / max(uSteps, 1.0), 0.12, 1.0);
      float frac = t * t * 0.62 + t * 0.38;
      vec2 delta = omega * uvRad * frac;

      vec2 uv1 = vUv + delta;
      if (uv1.x >= 0.0 && uv1.x <= 1.0 && uv1.y >= 0.0 && uv1.y <= 1.0) {
        float z1 = texture2D(tDepth, uv1).r;
        if (z1 < 0.9999) {
          vec3 H1 = viewPos(uv1, linDepth(z1)) - pC;
          float l1 = length(H1);
          float w1 = 1.0 - smoothstep(R * 0.42, R * 1.12, l1);
          c1 = max(c1, mix(-1.0, dot(H1, V) / max(l1, 1e-4), w1));
        }
      }

      vec2 uv2 = vUv - delta;
      if (uv2.x >= 0.0 && uv2.x <= 1.0 && uv2.y >= 0.0 && uv2.y <= 1.0) {
        float z2 = texture2D(tDepth, uv2).r;
        if (z2 < 0.9999) {
          vec3 H2 = viewPos(uv2, linDepth(z2)) - pC;
          float l2 = length(H2);
          float w2 = 1.0 - smoothstep(R * 0.42, R * 1.12, l2);
          c2 = max(c2, mix(-1.0, dot(H2, V) / max(l2, 1e-4), w2));
        }
      }
    }

    // Small horizon bias (+0.065 rad) eliminates flat/sloped roof self-occlusion
    float h1 = clamp(acos(clamp(c1, -1.0, 1.0)) + 0.065, 0.0, n + HALF_PI);
    float h2 = clamp(acos(clamp(c2, -1.0, 1.0)) + 0.065, 0.0, HALF_PI - n);
    float sinN = sin(n);
    float cosN = cos(n);
    float i1 = 0.25 * (-cos(2.0 * h1 - n) + cosN + 2.0 * h1 * sinN);
    float i2 = 0.25 * (-cos(2.0 * h2 + n) + cosN - 2.0 * h2 * sinN);
    float unocc = max(cosN + n * sinN, 1e-4);
    aoNum += projLen * clamp((i1 + i2) / unocc, 0.0, 1.0);
    aoDen += projLen;
  }

  float ao = aoDen > 1e-4 ? aoNum / aoDen : 1.0;
  // Gently deepen architectural crevices while keeping unoccluded planes cleanly at 1.0
  ao = clamp(ao * ao * 0.35 + ao * 0.65, 0.0, 1.0);
  gl_FragColor = vec4(ao, ao, ao, 1.0);
}`;

/** Separable 7-tap depth-aware bilateral blur at half resolution (stops cleanly on building/hull edges). */
export const GTAO_BLUR_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tAo;
uniform sampler2D tDepth;
uniform vec2 uDir;
uniform vec4 uClip;
varying vec2 vUv;

float linDepth(float z) {
  return uClip.x / max(uClip.z - z * uClip.y, 1e-4);
}

void main() {
  float zC = texture2D(tDepth, vUv).r;
  if (zC >= 0.9999) { gl_FragColor = vec4(1.0); return; }
  float dC = linDepth(zC);
  float sigmaZ = max(0.75, dC * 0.011);
  float invSig2 = 1.0 / (sigmaZ * sigmaZ);

  float sum = texture2D(tAo, vUv).r * 0.2146;
  float wSum = 0.2146;

  float w1 = 0.1899;
  float w2 = 0.1315;
  float w3 = 0.0713;

  for (int i = 1; i <= 3; i++) {
    float gw = i == 1 ? w1 : (i == 2 ? w2 : w3);
    vec2 off = uDir * float(i);

    vec2 uvP = clamp(vUv + off, 0.0, 1.0);
    float zP = texture2D(tDepth, uvP).r;
    if (zP < 0.9999) {
      float dz = linDepth(zP) - dC;
      float w = gw * exp(-(dz * dz) * invSig2);
      sum += texture2D(tAo, uvP).r * w;
      wSum += w;
    }

    vec2 uvM = clamp(vUv - off, 0.0, 1.0);
    float zM = texture2D(tDepth, uvM).r;
    if (zM < 0.9999) {
      float dz = linDepth(zM) - dC;
      float w = gw * exp(-(dz * dz) * invSig2);
      sum += texture2D(tAo, uvM).r * w;
      wSum += w;
    }
  }

  float ao = sum / max(wSum, 1e-4);
  gl_FragColor = vec4(ao, ao, ao, 1.0);
}`;

/**
 * Full-res scene-linear composite (merged into PostChain's main EffectPass before bloom/AgX):
 * fades cleanly to 1.0 on sky, distant aerial haze, and bright emissive highlights, while tinting
 * crevices softly with per-hour shadow chromaticity (never flat muddy black).
 */
export const GTAO_COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D uAoTex;
uniform float uAoStrength;
uniform vec3 uAoPower;
uniform vec2 uAoFade;

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  outputColor = inputColor;
  if (uAoStrength < 0.001 || depth >= 0.9999) return;
  float viewZ = -perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
  float distFade = 1.0 - smoothstep(uAoFade.x, uAoFade.y, viewZ);
  if (distFade < 0.001) return;
  float ao = texture2D(uAoTex, uv).r;
  float lum = dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float emissiveKeep = 1.0 - smoothstep(1.05, 2.6, lum);
  float vis = clamp(mix(1.0, ao, uAoStrength * distFade * emissiveKeep), 0.12, 1.0);
  outputColor = vec4(inputColor.rgb * pow(vec3(vis), uAoPower), inputColor.a);
}`;

/**
 * Zero-bloat half-res GTAO effect for PostChain:
 *  - Runs 3 tiny half-res passes (AO + separable H/V bilateral blur) inside Effect.update()
 *  - Composites for free inside the merged main EffectPass before bloom & AgX
 *  - Zero shader recompiles across High / Medium / Low tier switches
 */
export class GtaoEffect extends Effect {
  readonly aoTargetA: THREE.WebGLRenderTarget;
  readonly aoTargetB: THREE.WebGLRenderTarget;
  readonly aoScene = new THREE.Scene();
  readonly blurScene = new THREE.Scene();
  readonly passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly aoMat: THREE.ShaderMaterial;
  readonly blurMat: THREE.ShaderMaterial;
  private readonly quadGeo: THREE.BufferGeometry;
  private readonly fallbackDepth: THREE.DataTexture;
  private depthTexture: THREE.Texture | null = null;
  private quality: GtaoQuality = "high";
  private baseStrength = 0.8;
  private fullW = 2;
  private fullH = 2;

  constructor(private readonly sceneCamera: THREE.PerspectiveCamera) {
    const targetOpts: THREE.RenderTargetOptions = {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };
    const aoTargetA = new THREE.WebGLRenderTarget(1, 1, targetOpts);
    aoTargetA.texture.name = "GTAO.TargetA";
    const aoTargetB = new THREE.WebGLRenderTarget(1, 1, targetOpts);
    aoTargetB.texture.name = "GTAO.TargetB";

    super("HbGtaoEffect", GTAO_COMPOSITE_FRAG, {
      blendFunction: BlendFunction.SET,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>([
        ["uAoTex", new THREE.Uniform(aoTargetA.texture)],
        ["uAoStrength", new THREE.Uniform(0.8)],
        ["uAoPower", new THREE.Uniform(new THREE.Vector3(1.22, 1.07, 0.87))],
        ["uAoFade", new THREE.Uniform(new THREE.Vector2(600, 1050))],
      ]),
    });

    this.aoTargetA = aoTargetA;
    this.aoTargetB = aoTargetB;
    this.fallbackDepth = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.fallbackDepth.needsUpdate = true;

    this.quadGeo = new THREE.BufferGeometry();
    this.quadGeo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));

    const clip = new THREE.Vector4(
      sceneCamera.near * sceneCamera.far,
      sceneCamera.far - sceneCamera.near,
      sceneCamera.far,
      sceneCamera.near,
    );
    const projInfo = new THREE.Vector4(1, 1, -0.5, -0.5);
    const texel = new THREE.Vector4(0.5, 0.5, 1, 1);

    this.aoMat = new THREE.ShaderMaterial({
      name: "hb_gtao_ao",
      vertexShader: GTAO_VERT,
      fragmentShader: GTAO_AO_FRAG,
      uniforms: {
        tDepth: { value: this.fallbackDepth },
        uProjInfo: { value: projInfo },
        uClip: { value: clip },
        uTexel: { value: texel },
        uDirs: { value: gtaoDirsFor("high") },
        uSteps: { value: gtaoStepsFor("high") },
      },
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      blending: THREE.NoBlending,
    });

    this.blurMat = new THREE.ShaderMaterial({
      name: "hb_gtao_blur",
      vertexShader: GTAO_VERT,
      fragmentShader: GTAO_BLUR_FRAG,
      uniforms: {
        tAo: { value: aoTargetA.texture },
        tDepth: { value: this.fallbackDepth },
        uDir: { value: new THREE.Vector2(1, 0) },
        uClip: { value: clip },
      },
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      blending: THREE.NoBlending,
    });

    const aoMesh = new THREE.Mesh(this.quadGeo, this.aoMat);
    aoMesh.frustumCulled = false;
    this.aoScene.add(aoMesh);

    const blurMesh = new THREE.Mesh(this.quadGeo, this.blurMat);
    blurMesh.frustumCulled = false;
    this.blurScene.add(blurMesh);

    this.syncProjection(sceneCamera);
  }

  get active(): boolean { return this.quality !== "off"; }

  setQuality(q: GtaoQuality): void {
    this.quality = q;
    this.aoMat.uniforms.uDirs.value = gtaoDirsFor(q);
    this.aoMat.uniforms.uSteps.value = gtaoStepsFor(q);
    this.uniforms.get("uAoStrength")!.value = q === "off" ? 0 : this.baseStrength;
  }

  /** Sync perspective projection & per-hour shadow tint / strength from TimeOfDay. */
  syncTimeOfDay(camera: THREE.PerspectiveCamera, tod: TimeOfDay): void {
    this.syncProjection(camera);
    const h = tod.hour;
    // Golden/dawn windows carry warmer Mediterranean umber-indigo crevices; midday carries luminous cerulean sky fill; night carries velvet indigo.
    const golden = Math.exp(-Math.pow((h - 18.8) / 1.35, 2)) + Math.exp(-Math.pow((h - 6.1) / 1.15, 2));
    const night = h < 5.2 || h > 20.4 ? 1 : h < 6.4 ? 1 - THREE.MathUtils.smoothstep(h, 5.2, 6.4) : h > 19.3 ? THREE.MathUtils.smoothstep(h, 19.3, 20.4) : 0;
    const warm = Math.min(1, golden);
    // Exponents for pow(vis, uAoPower): higher exponent = deeper attenuation of that channel in crevices
    const pR = THREE.MathUtils.lerp(THREE.MathUtils.lerp(1.24, 1.14, warm), 1.18, night);
    const pG = THREE.MathUtils.lerp(THREE.MathUtils.lerp(1.08, 1.06, warm), 1.07, night);
    const pB = THREE.MathUtils.lerp(THREE.MathUtils.lerp(0.86, 0.93, warm), 0.87, night);
    (this.uniforms.get("uAoPower")!.value as THREE.Vector3).set(pR, pG, pB);
    this.baseStrength = THREE.MathUtils.lerp(0.82, 0.66, night);
    this.uniforms.get("uAoStrength")!.value = this.quality === "off" ? 0 : this.baseStrength;
  }

  private syncProjection(camera: THREE.PerspectiveCamera): void {
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
    const aspect = Math.max(camera.aspect, 1e-3);
    (this.aoMat.uniforms.uProjInfo.value as THREE.Vector4).set(
      2 * tanHalfFov * aspect,
      2 * tanHalfFov,
      -tanHalfFov * aspect,
      -tanHalfFov,
    );
    (this.aoMat.uniforms.uClip.value as THREE.Vector4).set(
      camera.near * camera.far,
      camera.far - camera.near,
      camera.far,
      camera.near,
    );
  }

  private ensureSize(width: number, height: number): void {
    const fw = Math.max(1, Math.floor(width));
    const fh = Math.max(1, Math.floor(height));
    const hw = Math.max(1, Math.floor(fw * 0.5));
    const hh = Math.max(1, Math.floor(fh * 0.5));
    if (fw === this.fullW && fh === this.fullH && this.aoTargetA.width === hw && this.aoTargetA.height === hh) return;
    this.fullW = fw;
    this.fullH = fh;
    this.aoTargetA.setSize(hw, hh);
    this.aoTargetB.setSize(hw, hh);
    (this.aoMat.uniforms.uTexel.value as THREE.Vector4).set(1 / fw, 1 / fh, hw, hh);
  }

  override setDepthTexture(depthTexture: THREE.Texture | null): void {
    this.depthTexture = depthTexture;
    const tex = depthTexture ?? this.fallbackDepth;
    this.aoMat.uniforms.tDepth.value = tex;
    this.blurMat.uniforms.tDepth.value = tex;
  }

  override setSize(width: number, height: number): void {
    this.ensureSize(width, height);
  }

  override update(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget): void {
    if (this.quality === "off" || !this.depthTexture) return;
    this.ensureSize(inputBuffer.width, inputBuffer.height);
    this.syncProjection(this.sceneCamera);
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      // 1. Half-res horizon-based GTAO → aoTargetA
      renderer.setRenderTarget(this.aoTargetA);
      renderer.render(this.aoScene, this.passCamera);

      // 2. Separable depth-aware bilateral blur H: aoTargetA → aoTargetB
      this.blurMat.uniforms.tAo.value = this.aoTargetA.texture;
      (this.blurMat.uniforms.uDir.value as THREE.Vector2).set(1 / this.aoTargetA.width, 0);
      renderer.setRenderTarget(this.aoTargetB);
      renderer.render(this.blurScene, this.passCamera);

      // 3. Separable depth-aware bilateral blur V: aoTargetB → aoTargetA
      this.blurMat.uniforms.tAo.value = this.aoTargetB.texture;
      (this.blurMat.uniforms.uDir.value as THREE.Vector2).set(0, 1 / this.aoTargetA.height);
      renderer.setRenderTarget(this.aoTargetA);
      renderer.render(this.blurScene, this.passCamera);
    } finally {
      renderer.autoClear = prevAutoClear;
      renderer.setRenderTarget(prevTarget);
    }
  }

  override dispose(): void {
    this.aoTargetA.dispose();
    this.aoTargetB.dispose();
    this.aoMat.dispose();
    this.blurMat.dispose();
    this.quadGeo.dispose();
    this.fallbackDepth.dispose();
    super.dispose();
  }
}
