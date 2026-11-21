import * as THREE from "three";
import type { WakeCollarService } from "../engine/services";
import { wavesGLSL } from "./waves";
import { SEA_PALETTE } from "./ocean-material";

/**
 * High-only 1-draw instanced hull waterline collars (`wakeCollars` service, seam S-3, D-7).
 *
 * Renders full-screen-resolution hull-local effects immune to the 0.498 m/texel wake RT:
 *  - crisp dark waterline contact AO meniscus hugging a pointed-bow / fuller-stern hull outline
 *  - curved foaming bow mustache and cutwater whiskers when under way (speed > 0.4 m/s)
 *  - gentle hbSwellPhase moored lap ring when slow / stationary
 *  - galley oar-splash ripple rings along port and starboard flanks (kind === 1, synced to hbOarStroke's catch cycle)
 *
 * Uses a subdivided per-instance XZ grid riding the exact `gerstnerDisp` + SDF coast damping as `OCEAN_VERT`,
 * drawn at `renderOrder = 61` with water-alpha-preserving `CustomBlending` (`ZeroFactor` / `OneFactor` on alpha)
 * so MirrorPass's water mask in the framebuffer alpha channel stays completely intact.
 */
const MAX_COLLARS = 1024;
const SEG_X = 6;
const SEG_Z = 4;

export interface WakeCollarUniforms {
  uTime: THREE.IUniform<number>;
  uCameraPos: THREE.IUniform<THREE.Vector3>;
  uSea: THREE.IUniform<THREE.Vector4>;
  uSdfBounds: THREE.IUniform<THREE.Vector4>;
  uSdf: THREE.IUniform<THREE.Texture>;
  uSceneCenter: THREE.IUniform<THREE.Vector2>;
  uNoise: THREE.IUniform<THREE.Texture>;
  uSunDir: THREE.IUniform<THREE.Vector3>;
  uSunColor: THREE.IUniform<THREE.Color>;
  uAmbient: THREE.IUniform<THREE.Color>;
  uNight: THREE.IUniform<number>;
}

export const WAKE_COLLAR_VERT = /* glsl */ `
attribute vec4 aColA; // x, z, fx, fz
attribute vec4 aColB; // hl, hb, speed, kind (0 hull, 1 galley)
attribute float aColC; // oarPhase

uniform float uTime;
uniform vec3 uCameraPos;
uniform vec4 uSea;
uniform vec4 uSdfBounds;
uniform sampler2D uSdf;
uniform vec2 uSceneCenter;

varying vec2 vLocal;    // metres in hull frame: x along bow (+), y to starboard (+)
varying vec2 vQuadUv;   // [-1, 1]^2 normalized quad coords for seamless edge fade
varying vec4 vMeta;     // hl, hb, speed, kind
varying vec3 vWorld;
varying float vOarPhase;
varying float vCamD;

${wavesGLSL()}

void main() {
  float hl = aColB.x;
  float hb = aColB.y;
  float spd = aColB.z;
  float kind = aColB.w;

  vec2 fwd = aColA.zw;
  float fl = length(fwd);
  fwd = fl > 1e-4 ? fwd / fl : vec2(0.0, 1.0);
  vec2 stbd = vec2(fwd.y, -fwd.x);

  float moveBoost = clamp(spd * 0.65, 0.0, 3.2);
  float xMin = -hl * 1.55;
  float xMax = hl * 1.55 + moveBoost;
  float yExt = hb * 2.15 + moveBoost * 1.35;
  if (kind > 0.5) yExt = max(yExt, hb * 2.95 + 2.6);

  vec2 t = position.xy * 0.5 + 0.5;
  vec2 local = vec2(mix(xMin, xMax, t.x), mix(-yExt, yExt, t.y));
  vec2 xz = aColA.xy + fwd * local.x + stbd * local.y;

  // Match OCEAN_VERT Gerstner displacement and SDF coast damping identically so collars never float or clip
  vec2 suv = (xz - uSdfBounds.xy) / (uSdfBounds.zw - uSdfBounds.xy);
  float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
  float coast = mix(200.0, (mix(textureLod(uSdf, clamp(suv, 0.0, 1.0), 0.0).r, 1.0, smoothstep(470.0, 560.0, length(xz - uSceneCenter))) - 0.5) * 128.0, inside);
  float damp = smoothstep(0.0, 34.0, coast) * 0.9 + 0.1 * smoothstep(-2.0, 2.0, coast);
  float camD = length(xz - uCameraPos.xz);
  float amp = uSea.x * damp * (1.0 - smoothstep(2500.0, 5000.0, camD));

  vec3 p = vec3(xz.x, 0.0, xz.y) + gerstnerDisp(xz, uTime, amp);
  // Subtle distance-scaled lift clears ocean triangle depth without visibly floating off the waterline
  p.y += 0.04 + clamp(camD * 0.00018, 0.0, 0.14);

  vLocal = local;
  vQuadUv = position.xy;
  vMeta = aColB;
  vWorld = p;
  vOarPhase = aColC;
  vCamD = camD;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

export const WAKE_COLLAR_FRAG = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uFoamCol;
uniform vec3 uFoamNight;
uniform sampler2D uNoise;

varying vec2 vLocal;
varying vec2 vQuadUv;
varying vec4 vMeta;
varying vec3 vWorld;
varying float vOarPhase;
varying float vCamD;

${wavesGLSL()}

void main() {
  float hl = max(vMeta.x, 0.4);
  float hb = max(vMeta.y, 0.25);
  float spd = vMeta.z;
  float kind = vMeta.w;

  // Fade out gracefully past the heart view toward overview so distant silhouettes stay clean
  float distFade = 1.0 - smoothstep(520.0, 1080.0, vCamD);
  // Seamless fade inside the instanced quad boundary so whiskers/ripples never clip against a quad edge
  float edgeFade = smoothstep(1.0, 0.72, abs(vQuadUv.x)) * smoothstep(1.0, 0.72, abs(vQuadUv.y));
  if (distFade * edgeFade <= 0.004) discard;

  vec2 q = vLocal;
  float u = q.x / hl;
  float v = q.y / hb;
  // Ship-hull planform: pointed cutwater bow (u > 0), fuller stern (u <= 0)
  float pExp = u > 0.0 ? 1.75 : 2.25;
  float e = sqrt(pow(abs(u), pExp) + v * v);
  float scaleM = min(hb, hl * 0.45);
  float dM = (e - 1.0) * scaleM;

  float fp = length(fwidth(vWorld.xz));
  float pxFade = 1.0 - smoothstep(0.55, 1.25, fp);

  vec4 nW = texture2D(uNoise, vWorld.xz * 0.14 + vec2(uTime * 0.012, -uTime * 0.009));
  vec4 nFine = texture2D(uNoise, vWorld.xz * 0.36 - vec2(uTime * 0.02, uTime * 0.015));
  float foamNoise = smoothstep(0.24, 0.78, nW.g * 0.58 + nFine.r * 0.52);

  // 1. Crisp dark waterline contact AO meniscus hugging the hull outline
  float menW = clamp(hb * 0.34, 0.24, 0.85);
  float meniscus = exp(-pow((dM - 0.05) / menW, 2.0)) * smoothstep(-0.42, -0.02, dM);
  float underBleed = (1.0 - smoothstep(-0.08, 0.22, dM)) * 0.42;
  float menA = clamp((meniscus * 0.52 + underBleed) * (0.82 + 0.18 * nW.r), 0.0, 0.56) * distFade * edgeFade;

  // 2. Curved foaming bow mustache & cutwater whiskers when under way (speed > 0.4 m/s)
  float moveK = smoothstep(0.35, 1.35, spd);
  float bowFoam = 0.0;
  if (moveK > 0.005) {
    float s = hl * 1.02 - q.x;
    float spread = 0.26 + 0.08 * smoothstep(1.0, 4.2, spd);
    float warp = (nW.r - 0.5) * 0.30 + (nFine.g - 0.5) * 0.14;
    float whiskerY = hb * (0.10 + 0.90 * smoothstep(-0.12, hl * 0.52, s)) + max(s - hl * 0.12, 0.0) * spread + warp;
    float dWhisk = abs(abs(q.y) - whiskerY);
    float wThick = mix(0.16, 0.62, clamp(s / max(hl * 1.35, 2.0), 0.0, 1.0)) * clamp(hb / 1.7, 0.65, 1.35);
    float aftFade = exp(-max(s, 0.0) / max(hl * 0.88, 2.5));
    float mainArm = exp(-pow(dWhisk / wThick, 2.0)) * smoothstep(-0.24, 0.14, s) * aftFade;
    // Secondary outer cutwater whisker at brisk cruise speeds
    float fastK = smoothstep(1.6, 3.6, spd);
    float outerY = whiskerY + (0.48 + max(s, 0.0) * 0.13) * clamp(hb / 1.8, 0.7, 1.3);
    float outerArm = exp(-pow((abs(q.y) - outerY) / (wThick * 0.9), 2.0)) * smoothstep(0.15, hl * 0.45, s) * aftFade * fastK * 0.46;
    // Frothy stem curl right at the cutwater nose
    vec2 nose = vec2((q.x - hl * 0.98) / max(hl * 0.15, 0.35), q.y / max(hb * 0.44, 0.34));
    float bowCurl = exp(-dot(nose, nose)) * 0.88;
    // Advect cellular foam texture aft along the hull with boat speed
    float advN = texture2D(uNoise, vec2(q.x * 0.30 + uTime * spd * 0.22, q.y * 0.38)).b;
    float lacy = 0.28 + 0.72 * smoothstep(0.28, 0.80, advN * 0.60 + nFine.g * 0.50);
    bowFoam = clamp((mainArm * 0.92 + outerArm + bowCurl) * lacy, 0.0, 1.0) * moveK;
  }

  // 3. Gentle broken hbSwellPhase moored lap ring when slow / stationary
  float stillK = 1.0 - smoothstep(0.25, 0.85, spd);
  float lapFoam = 0.0;
  if (stillK > 0.005 && pxFade > 0.01) {
    float sw = 0.5 + 0.5 * sin(hbSwellPhase(vWorld.xz, uTime) + vOarPhase * 0.7);
    float lapPos = 0.14 + 0.32 * sw + (nW.b - 0.5) * 0.14;
    float lapRing = exp(-pow((dM - lapPos) / 0.20, 2.0)) * (0.35 + 0.65 * sw);
    float broken = smoothstep(0.38, 0.84, foamNoise * 0.85 + nFine.b * 0.32);
    lapFoam = lapRing * broken * stillK * pxFade * 0.22;
  }

  // 4. Galley oar-splash ripple rings synced to hbOarStroke's catch cycle (kind == 1)
  float oarFoam = 0.0;
  float galleyK = step(0.5, kind) * smoothstep(0.15, 0.55, spd);
  if (galleyK > 0.005) {
    float uStart = -0.46;
    float uSpan = 0.86;
    float bankCount = 6.0;
    float bankPos = (u - uStart) / uSpan * bankCount;
    if (bankPos >= -0.35 && bankPos <= bankCount + 0.35) {
      float idx = clamp(floor(bankPos), 0.0, bankCount - 1.0);
      float sideSign = q.y >= 0.0 ? 1.0 : -1.0;
      float stHash = fract(sin(idx * 17.13 + sideSign * 31.7 + vOarPhase * 0.01) * 43758.5453);
      float xOar = (uStart + (idx + 0.5) / bankCount * uSpan) * hl + (stHash - 0.5) * 0.28;
      float oarReach = hb + clamp(hb * 0.88, 1.35, 3.0) + (fract(stHash * 7.3) - 0.5) * 0.32;
      // Match hbOarStroke phase + fore-to-aft wave offset (+ aPivot.x * 0.18)
      float ph = vOarPhase + xOar * 0.18 + (stHash - 0.5) * 0.22;
      float cyc = fract(ph / 6.2831853);
      float xBlade = xOar - cyc * 1.15;
      float rOar = length(vec2(q.x - xBlade, q.y - sideSign * oarReach));
      float rad = 0.26 + cyc * 1.85;
      float ringW = 0.11 + cyc * 0.15;
      float ring = exp(-pow((rOar - rad) / ringW, 2.0)) * smoothstep(0.0, 0.07, cyc) * pow(max(1.0 - cyc * 1.25, 0.0), 1.45);
      float catchSplash = exp(-pow(rOar / 0.38, 2.0)) * smoothstep(0.0, 0.04, cyc) * (1.0 - smoothstep(0.08, 0.28, cyc));
      float oarBreak = 0.35 + 0.65 * smoothstep(0.24, 0.80, foamNoise + 0.18 * nFine.b);
      oarFoam = clamp((ring * 0.58 + catchSplash * 0.82) * oarBreak * (0.72 + 0.28 * fract(stHash * 13.7)), 0.0, 1.0) * galleyK;
    }
  }

  float foamA = clamp(max(bowFoam * 0.82, max(lapFoam, oarFoam * 0.78)), 0.0, 0.86) * distFade * edgeFade;
  float outA = clamp(foamA + menA * (1.0 - foamA), 0.0, 0.90);
  if (outA < 0.005) discard;

  float ndl = max(uSunDir.y, 0.0);
  vec3 foamLit = mix(uFoamCol, uFoamNight, uNight * 0.6) * (uAmbient * 1.1 + uSunColor * (0.25 + 0.75 * ndl) * 0.3183);
  vec3 menCol = mix(vec3(0.015, 0.045, 0.072), vec3(0.004, 0.010, 0.022), uNight) * (0.45 + 0.55 * clamp(dot(uAmbient, vec3(0.3333)), 0.0, 1.5));
  vec3 outRgb = (foamLit * foamA + menCol * menA * (1.0 - foamA)) / max(outA, 1e-4);

  gl_FragColor = vec4(outRgb, outA);
}
`;

function createCollarGrid(): THREE.InstancedBufferGeometry {
  const geo = new THREE.InstancedBufferGeometry();
  const cols = SEG_X + 1;
  const rows = SEG_Z + 1;
  const pos = new Float32Array(cols * rows * 3);
  let k = 0;
  for (let j = 0; j < rows; j++) {
    const y = -1 + (2 * j) / SEG_Z;
    for (let i = 0; i < cols; i++) {
      const x = -1 + (2 * i) / SEG_X;
      pos[k++] = x;
      pos[k++] = y;
      pos[k++] = 0;
    }
  }
  const indices: number[] = [];
  // +i is along fwd, +j is along stbd -> (b - a) x (c - a) = fwd x stbd = +Y (upward FrontSide)
  for (let j = 0; j < SEG_Z; j++) {
    for (let i = 0; i < SEG_X; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(indices);
  return geo;
}

export class WakeCollars implements WakeCollarService {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private readonly attrA: THREE.InstancedBufferAttribute;
  private readonly attrB: THREE.InstancedBufferAttribute;
  private readonly attrC: THREE.InstancedBufferAttribute;
  private readonly bufA: Float32Array;
  private readonly bufB: Float32Array;
  private readonly bufC: Float32Array;
  private active = false;
  private count = 0;
  private dirty = false;

  constructor(shared: WakeCollarUniforms) {
    this.geo = createCollarGrid();
    this.bufA = new Float32Array(MAX_COLLARS * 4);
    this.bufB = new Float32Array(MAX_COLLARS * 4);
    this.bufC = new Float32Array(MAX_COLLARS);
    this.attrA = new THREE.InstancedBufferAttribute(this.bufA, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrB = new THREE.InstancedBufferAttribute(this.bufB, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrC = new THREE.InstancedBufferAttribute(this.bufC, 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("aColA", this.attrA);
    this.geo.setAttribute("aColB", this.attrB);
    this.geo.setAttribute("aColC", this.attrC);
    this.geo.instanceCount = 0;

    this.mat = new THREE.ShaderMaterial({
      name: "hb_wake_collars",
      vertexShader: WAKE_COLLAR_VERT,
      fragmentShader: WAKE_COLLAR_FRAG,
      uniforms: {
        ...shared,
        uFoamCol: { value: new THREE.Color(SEA_PALETTE.foam) },
        uFoamNight: { value: new THREE.Color(SEA_PALETTE.foamNight) },
      },
      transparent: true,
      depthTest: true,
      depthWrite: false,
      fog: false,
      side: THREE.FrontSide,
      // Water-alpha-preserving CustomBlending: never disturbs MirrorPass's water mask in framebuffer alpha
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquationAlpha: THREE.AddEquation,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    });

    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.name = "ocean-wake-collars";
    this.mesh.renderOrder = 61;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.visible = false;
    this.mesh.raycast = () => {};
    // Zero-latency flush right before Three.js draws the collars (after FleetSystem.update has pushed frame N's hulls)
    this.mesh.onBeforeRender = () => { this.flush(); };
  }

  get enabled(): boolean { return this.active; }
  get instances(): number { return this.count; }

  /** High-only gate (D-7): completely disabled with 0 draws on Medium and Low. */
  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.beginFrame();
  }

  /** Called at start of frame (before FleetSystem pushes frame N's hulls). */
  beginFrame(): void {
    this.count = 0;
    this.dirty = false;
    this.geo.instanceCount = 0;
    this.mesh.visible = false;
  }

  push(x: number, z: number, fx: number, fz: number, loa: number, beam: number, speed: number, kind: 0 | 1, oarPhase: number): void {
    if (!this.active || this.count >= MAX_COLLARS || loa <= 0 || beam <= 0) return;
    const i = this.count++;
    const o = i * 4;
    this.bufA[o] = x;
    this.bufA[o + 1] = z;
    this.bufA[o + 2] = fx;
    this.bufA[o + 3] = fz;
    this.bufB[o] = loa * 0.5;
    this.bufB[o + 1] = beam * 0.5;
    this.bufB[o + 2] = Math.max(0, speed);
    this.bufB[o + 3] = kind;
    this.bufC[i] = oarPhase;
    this.dirty = true;
    this.mesh.visible = true;
  }

  /** Upload all instances pushed this frame immediately before draw. */
  flush(): void {
    if (!this.active || this.count === 0) {
      this.geo.instanceCount = 0;
      this.mesh.visible = false;
      this.dirty = false;
      return;
    }
    if (!this.dirty) return;
    const n = this.count;
    this.geo.instanceCount = n;
    this.attrA.clearUpdateRanges(); this.attrA.addUpdateRange(0, n * 4); this.attrA.needsUpdate = true;
    this.attrB.clearUpdateRanges(); this.attrB.addUpdateRange(0, n * 4); this.attrB.needsUpdate = true;
    this.attrC.clearUpdateRanges(); this.attrC.addUpdateRange(0, n); this.attrC.needsUpdate = true;
    this.dirty = false;
  }

  dispose(): void {
    this.active = false;
    this.beginFrame();
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
