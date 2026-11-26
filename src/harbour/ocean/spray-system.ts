import * as THREE from "three";
import type { PreparationEntry } from "../engine/types";
import type { SceneCaptureUniforms } from "./scene-capture";
import { SWELL_DIR, swellPhase } from "./waves";

/**
 * Unified 1-Draw SoA Ocean Spray System (`hb_ocean_spray`, Phase 3 Workstream 3-B).
 *
 * Consolidates three physical marine spray emitters into a single zero-allocation SoA CPU simulation
 * rendered in ONE camera-facing instanced billboard draw at `renderOrder = 63`:
 *  1. Bow spray bursts from the top 32 nearest moving vessels/Titans (`kind = 0`), scaled by speed,
 *     bow slam impact (`prevHBow` impact speed), and sea state.
 *  2. Windward Shoals / breakwater crest mist plumes (`kind = 1`), phase-locked to `swellPhase(x, z, time)`
 *     and gated to `seaAmp > 0.14`.
 *  3. Close galley oar-catch splash droplets (`kind = 2`), strictly gated to `camDist < 140 m`.
 *
 * M12 zero-depth-feedback contract: soft-fades particle contacts exclusively against `SceneCapture`'s
 * standalone `uCapDepth` (`uCapDepth`, `uCapNearFar`, `uCapSize`, `uCapReady`) using
 * `gl_FragCoord.xy / max(uCapSize, vec2(1.0))` (exact on both High full-res and Medium half-res captures)
 * and never samples the live composer depth attachment.
 *
 * B07/C04 arithmetic contract: strictly ascending `smoothstep(lo, hi, x)` and squaring by multiplication.
 */

export type SprayTier = "high" | "medium" | "low";

export const SPRAY_BUDGET: Record<SprayTier, number> = {
  high: 1800,
  medium: 600,
  low: 0,
};

export const SPRAY_CAPACITY = SPRAY_BUDGET.high;
export const MAX_SPRAY_BOWS = 32;
export const MAX_SPRAY_REEFS = 512;
export const MAX_SPRAY_OARS = 64;
export const OAR_SPRAY_MAX_DIST = 140;
export const REEF_SPRAY_MIN_AMP = 0.14;

const GRAVITY = 9.8;
const KILL_Y = -0.35;
const MIN_BOW_SPEED = 0.25;
const MIN_OAR_SPEED_SQ = 0.04;

export interface SprayCaptureUniforms {
  uCapDepth: THREE.IUniform<THREE.Texture>;
  uCapNearFar: THREE.IUniform<THREE.Vector2>;
  uCapSize: THREE.IUniform<THREE.Vector2>;
  uCapReady: THREE.IUniform<number>;
}

export interface SpraySystemOptions {
  capture?: Partial<SprayCaptureUniforms> | undefined;
}

export type SpraySystemInit = SpraySystemOptions | Partial<SprayCaptureUniforms> | SceneCaptureUniforms;

export interface SprayService {
  readonly enabled: boolean;
  readonly activeCount: number;
  readonly maxParticles: number;
  beginFrame(): void;
  pushBow(
    x: number,
    z: number,
    vx: number,
    vz: number,
    bowLen: number,
    speed: number,
    impact: number,
    focusX: number,
    focusZ: number,
  ): void;
  pushOar(
    x: number,
    z: number,
    vx: number,
    vz: number,
    beam: number,
    camDist: number,
    oarPhase?: number,
  ): void;
  setReefAnchors(points: ReadonlyArray<readonly [number, number, number, number]>): void;
  /** Advance physics & upload instance buffers right before `composer.render()` (0-frame fleet latency, same-frame visibility). */
  flush?(): void;
}

export const SPRAY_VERT = /* glsl */ `
attribute vec4 aPosSize; // world xyz, radius (m)
attribute vec4 aMeta;    // ageNorm (0..1), alpha, kind (0 bow, 1 reef, 2 oar), seed
attribute float aWaterY; // local displaced ocean surface height (m) at particle (x, z)

varying vec2 vUv;
varying vec4 vMeta;
varying vec3 vWorld;
varying float vWaterY;

void main() {
  vec2 corner = position.xy;
  float radius = aPosSize.w;
  float ageNorm = aMeta.x;
  float kind = aMeta.z;
  float seed = aMeta.w;

  // Deterministic per-particle billboard spin so droplets and plumes never read as axis-aligned cards
  float spinRate = kind > 0.5 && kind < 1.5 ? 0.55 : 0.25;
  float ang = seed * 6.2831853 + ageNorm * spinRate;
  float cs = cos(ang);
  float sn = sin(ang);
  vec2 rot = vec2(corner.x * cs - corner.y * sn, corner.x * sn + corner.y * cs);

  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = aPosSize.xyz + (right * rot.x + up * rot.y) * radius;

  vUv = corner;
  vMeta = aMeta;
  vWorld = wp;
  vWaterY = aWaterY;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const SPRAY_FRAG = /* glsl */ `
uniform highp sampler2D uCapDepth;
uniform vec2 uCapNearFar;
uniform vec2 uCapSize;
uniform float uCapReady;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform float uNight;

varying vec2 vUv;
varying vec4 vMeta;
varying vec3 vWorld;
varying float vWaterY;

float spLinearDepth(float d, vec2 nf) {
  return (2.0 * nf.x * nf.y) / max(nf.y + nf.x - (d * 2.0 - 1.0) * (nf.y - nf.x), 1e-4);
}

float spHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float spVNoise(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(spHash(i), spHash(i + vec2(1.0, 0.0)), u.x),
    mix(spHash(i + vec2(0.0, 1.0)), spHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  float r2 = dot(vUv, vUv);
  if (r2 >= 1.0) discard;
  float r = sqrt(r2);

  float ageNorm = vMeta.x;
  float baseAlpha = vMeta.y;
  float kind = vMeta.z;
  float seed = vMeta.w;

  // M12: soft-fade against standalone SceneCapture depth (never samples live composer depth)
  float softFade = 1.0;
  if (uCapReady > 0.5) {
    vec2 capUv = clamp(gl_FragCoord.xy / max(uCapSize, vec2(1.0)), vec2(0.001), vec2(0.999));
    float sceneRawD = textureLod(uCapDepth, capUv, 0.0).r;
    if (sceneRawD < 0.9999) {
      float sceneLinZ = spLinearDepth(sceneRawD, uCapNearFar);
      float fragLinZ = spLinearDepth(gl_FragCoord.z, uCapNearFar);
      softFade = smoothstep(0.0, 1.4, sceneLinZ - fragLinZ);
    }
  }

  // Feather cleanly relative to the local displaced wave surface so falling droplets match moving crests/troughs
  float waterFade = smoothstep(-0.32, 0.22, vWorld.y - vWaterY);

  // Procedural mist / multi-droplet breakup keyed by particle kind and seed
  vec2 nCoord = vUv * (kind > 0.5 && kind < 1.5 ? 2.4 : 3.2) + vec2(seed * 19.3, seed * 11.7 + ageNorm * 0.65);
  float n1 = spVNoise(nCoord);
  float n2 = spVNoise(nCoord * 2.15 + vec2(4.7, -3.1));
  float grain = n1 * 0.62 + n2 * 0.38;

  float edgeMask = 1.0 - r2;
  float shape;
  if (kind > 0.5 && kind < 1.5) {
    // Windward reef mist plume: airy billowy wisp
    float billow = 1.0 - smoothstep(0.15, 0.98, r + (grain - 0.5) * 0.42);
    shape = billow * edgeMask * (0.58 + 0.42 * smoothstep(0.22, 0.80, grain));
  } else {
    // Bow spray & close galley oar splash: crisp beaded droplet cluster with soft mist halo
    float sA = fract(seed * 13.7) * 6.2831853;
    vec2 d1 = vUv - vec2(cos(sA), sin(sA)) * 0.26;
    vec2 d2 = vUv - vec2(cos(sA + 2.1), sin(sA + 2.1)) * 0.32;
    vec2 d3 = vUv - vec2(cos(sA + 4.3), sin(sA + 4.3)) * 0.22;
    float beads =
      exp(-dot(d1, d1) * 14.0) * 0.72 +
      exp(-dot(d2, d2) * 18.0) * 0.58 +
      exp(-dot(d3, d3) * 16.0) * 0.52;
    float halo = (1.0 - smoothstep(0.10, 0.95, r)) * (0.32 + 0.48 * smoothstep(0.28, 0.82, grain));
    float crispMix = kind > 1.5 ? 0.78 : 0.62;
    shape = clamp(halo * (1.0 - crispMix * 0.35) + beads * crispMix, 0.0, 1.0) * edgeMask;
  }

  float alpha = clamp(shape * baseAlpha * softFade * waterFade, 0.0, 0.76);
  if (alpha < 0.003) discard;

  // Soft marine foam/mist palette: crisp day white, natural golden dusk from uSunColor, cool silver-blue at night
  float topShade = 0.86 + 0.22 * clamp(vUv.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 tint = mix(vec3(0.92, 0.96, 0.99), vec3(0.58, 0.70, 0.84), uNight);
  vec3 rawL = uAmbient * mix(1.08, 0.86, uNight) + uSunColor * mix(0.42, 0.14, uNight);
  vec3 softL = rawL / (1.0 + rawL * 0.38);
  vec3 col = tint * (softL + vec3(0.035, 0.045, 0.055) * (1.0 - uNight * 0.65)) * topShade;

  gl_FragColor = vec4(col, alpha);
}
`;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function smooth01(lo: number, hi: number, x: number): number {
  const t = clamp01((x - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
}

function resolveCapture(init?: SpraySystemInit): Partial<SprayCaptureUniforms> | undefined {
  if (!init) return undefined;
  if ("capture" in init) return init.capture;
  if ("uCapDepth" in init || "uCapReady" in init || "uCapNearFar" in init || "uCapSize" in init) {
    return init as Partial<SprayCaptureUniforms>;
  }
  return undefined;
}

export class SpraySystem implements SprayService {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private readonly attrPosSize: THREE.InstancedBufferAttribute;
  private readonly attrMeta: THREE.InstancedBufferAttribute;
  private readonly attrWaterY: THREE.InstancedBufferAttribute;
  private readonly bufPosSize: Float32Array;
  private readonly bufMeta: Float32Array;
  private readonly bufWaterY: Float32Array;
  private readonly posRange = { start: 0, count: 0 };
  private readonly metaRange = { start: 0, count: 0 };
  private readonly waterRange = { start: 0, count: 0 };
  private readonly fallbackDepth: THREE.DataTexture;
  private readonly prepCamera = new THREE.PerspectiveCamera();

  // Pre-allocated SoA CPU particle pool (capacity = 1800, zero per-frame allocations)
  private readonly posX = new Float32Array(SPRAY_CAPACITY);
  private readonly posY = new Float32Array(SPRAY_CAPACITY);
  private readonly posZ = new Float32Array(SPRAY_CAPACITY);
  private readonly velX = new Float32Array(SPRAY_CAPACITY);
  private readonly velY = new Float32Array(SPRAY_CAPACITY);
  private readonly velZ = new Float32Array(SPRAY_CAPACITY);
  private readonly age = new Float32Array(SPRAY_CAPACITY);
  private readonly life = new Float32Array(SPRAY_CAPACITY);
  private readonly size = new Float32Array(SPRAY_CAPACITY);
  private readonly kind = new Uint8Array(SPRAY_CAPACITY);
  private readonly seed = new Float32Array(SPRAY_CAPACITY);
  private readonly baseAlpha = new Float32Array(SPRAY_CAPACITY);
  private readonly waterY = new Float32Array(SPRAY_CAPACITY);

  // Pre-allocated top-32 nearest moving bow collector
  private readonly bowX = new Float32Array(MAX_SPRAY_BOWS);
  private readonly bowZ = new Float32Array(MAX_SPRAY_BOWS);
  private readonly bowVx = new Float32Array(MAX_SPRAY_BOWS);
  private readonly bowVz = new Float32Array(MAX_SPRAY_BOWS);
  private readonly bowLen = new Float32Array(MAX_SPRAY_BOWS);
  private readonly bowSpeed = new Float32Array(MAX_SPRAY_BOWS);
  private readonly bowImpact = new Float32Array(MAX_SPRAY_BOWS);
  private readonly bowDistSq = new Float32Array(MAX_SPRAY_BOWS);
  private bowCount = 0;
  private bowMaxDistSq = -1;
  private bowMaxDistIdx = 0;

  // Pre-allocated reef anchor store
  private readonly reefX = new Float32Array(MAX_SPRAY_REEFS);
  private readonly reefZ = new Float32Array(MAX_SPRAY_REEFS);
  private readonly reefNx = new Float32Array(MAX_SPRAY_REEFS);
  private readonly reefNz = new Float32Array(MAX_SPRAY_REEFS);
  private reefCount = 0;

  // Pre-allocated close galley oar emitter queue (strictly camDist < 140 m)
  private readonly oarX = new Float32Array(MAX_SPRAY_OARS);
  private readonly oarZ = new Float32Array(MAX_SPRAY_OARS);
  private readonly oarVx = new Float32Array(MAX_SPRAY_OARS);
  private readonly oarVz = new Float32Array(MAX_SPRAY_OARS);
  private readonly oarBeam = new Float32Array(MAX_SPRAY_OARS);
  private readonly oarCamDist = new Float32Array(MAX_SPRAY_OARS);
  private readonly oarPhase = new Float32Array(MAX_SPRAY_OARS);
  private oarCount = 0;

  private tier: SprayTier = "high";
  private maxParticlesCount = SPRAY_BUDGET.high;
  private enabledFlag = true;
  private disposed = false;
  private aliveCount = 0;
  private ringCursor = 0;
  private bowEmitCarry = 0.5;
  private reefEmitCarry = 0.5;
  private oarEmitCarry = 0.5;
  private oarSideCursor = 0;
  private rngState = 0x51a7c39d;

  constructor(init?: SpraySystemInit) {
    const capture = resolveCapture(init);

    this.fallbackDepth = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.fallbackDepth.needsUpdate = true;

    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]), 3),
    );
    this.geo.setIndex([0, 1, 2, 2, 1, 3]);

    this.bufPosSize = new Float32Array(SPRAY_CAPACITY * 4);
    this.bufMeta = new Float32Array(SPRAY_CAPACITY * 4);
    this.bufWaterY = new Float32Array(SPRAY_CAPACITY);
    this.attrPosSize = new THREE.InstancedBufferAttribute(this.bufPosSize, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrMeta = new THREE.InstancedBufferAttribute(this.bufMeta, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrWaterY = new THREE.InstancedBufferAttribute(this.bufWaterY, 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("aPosSize", this.attrPosSize);
    this.geo.setAttribute("aMeta", this.attrMeta);
    this.geo.setAttribute("aWaterY", this.attrWaterY);
    this.geo.instanceCount = 0;

    this.mat = new THREE.ShaderMaterial({
      name: "hb_ocean_spray",
      vertexShader: SPRAY_VERT,
      fragmentShader: SPRAY_FRAG,
      uniforms: {
        uCapDepth: capture?.uCapDepth ?? { value: this.fallbackDepth },
        uCapNearFar: capture?.uCapNearFar ?? { value: new THREE.Vector2(1, 10000) },
        uCapSize: capture?.uCapSize ?? { value: new THREE.Vector2(1, 1) },
        uCapReady: capture?.uCapReady ?? { value: 0 },
        uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
        uAmbient: { value: new THREE.Color(0.35, 0.4, 0.5) },
        uNight: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: false,
      side: THREE.FrontSide,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquationAlpha: THREE.AddEquation,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    });

    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.name = "ocean-spray";
    this.mesh.renderOrder = 63;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.visible = false;
    this.mesh.raycast = () => {};
  }

  get enabled(): boolean {
    return this.enabledFlag && this.maxParticlesCount > 0 && !this.disposed;
  }

  get activeCount(): number {
    return this.aliveCount;
  }

  get maxParticles(): number {
    return this.maxParticlesCount;
  }

  get currentTier(): SprayTier {
    return this.tier;
  }

  /** Number of moving bows currently buffered in the top-32 frame collector (diagnostics/tests). */
  get queuedBowCount(): number {
    return this.bowCount;
  }

  /** Number of close galley oar emitters currently buffered for this frame (diagnostics/tests). */
  get queuedOarCount(): number {
    return this.oarCount;
  }

  /** Number of configured windward reef/breakwater anchors. */
  get reefAnchorCount(): number {
    return this.reefCount;
  }

  /** Read buffered bow slot distance squared (diagnostics/tests). */
  getQueuedBowDistSq(index: number): number {
    return index >= 0 && index < this.bowCount ? this.bowDistSq[index] : NaN;
  }

  /** Bind standalone SceneCapture depth uniforms lazily (zero live composer depth feedback). */
  bindCapture(capture: Partial<SprayCaptureUniforms>): void {
    if (this.disposed) return;
    const u = this.mat.uniforms;
    if (capture.uCapDepth) u.uCapDepth = capture.uCapDepth;
    if (capture.uCapNearFar) u.uCapNearFar = capture.uCapNearFar;
    if (capture.uCapSize) u.uCapSize = capture.uCapSize;
    if (capture.uCapReady) u.uCapReady = capture.uCapReady;
  }

  setTier(tier: SprayTier): void {
    this.tier = tier;
    this.maxParticlesCount = SPRAY_BUDGET[tier];
    if (tier === "low" || this.maxParticlesCount <= 0) {
      this.clearLive();
      return;
    }
    if (this.aliveCount > this.maxParticlesCount) {
      this.aliveCount = this.maxParticlesCount;
      this.ringCursor = this.ringCursor % this.maxParticlesCount;
      this.geo.instanceCount = Math.min(this.geo.instanceCount, this.aliveCount);
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabledFlag = enabled;
    if (!enabled) this.clearLive();
  }

  beginFrame(): void {
    this.bowCount = 0;
    this.bowMaxDistSq = -1;
    this.bowMaxDistIdx = 0;
    this.oarCount = 0;
  }

  /**
   * Collect up to 32 nearest moving vessel bows relative to `(focusX, focusZ)` in O(1) fast-reject
   * using fixed pre-allocated scratch typed arrays (zero heap allocations).
   */
  pushBow(
    x: number,
    z: number,
    vx: number,
    vz: number,
    bowLen: number,
    speed: number,
    impact: number,
    focusX: number,
    focusZ: number,
  ): void {
    if (!this.enabled || speed < MIN_BOW_SPEED || bowLen <= 0) return;
    const dx = x - focusX;
    const dz = z - focusZ;
    const distSq = dx * dx + dz * dz;

    let slot: number;
    if (this.bowCount < MAX_SPRAY_BOWS) {
      slot = this.bowCount++;
      if (distSq > this.bowMaxDistSq) {
        this.bowMaxDistSq = distSq;
        this.bowMaxDistIdx = slot;
      }
    } else {
      if (distSq >= this.bowMaxDistSq) return;
      slot = this.bowMaxDistIdx;
    }

    this.bowX[slot] = x;
    this.bowZ[slot] = z;
    this.bowVx[slot] = vx;
    this.bowVz[slot] = vz;
    this.bowLen[slot] = bowLen;
    this.bowSpeed[slot] = speed;
    this.bowImpact[slot] = Math.max(0, impact);
    this.bowDistSq[slot] = distSq;

    if (this.bowCount === MAX_SPRAY_BOWS && slot === this.bowMaxDistIdx) {
      let maxD = -1;
      let maxI = 0;
      for (let i = 0; i < MAX_SPRAY_BOWS; i++) {
        const d = this.bowDistSq[i];
        if (d > maxD) {
          maxD = d;
          maxI = i;
        }
      }
      this.bowMaxDistSq = maxD;
      this.bowMaxDistIdx = maxI;
    }
  }

  /** Configure windward Shoals / breakwater crest spray anchors `[x, z, nx, nz]`. */
  setReefAnchors(points: ReadonlyArray<readonly [number, number, number, number]>): void {
    const n = Math.min(MAX_SPRAY_REEFS, points.length);
    for (let i = 0; i < n; i++) {
      const p = points[i];
      this.reefX[i] = p[0];
      this.reefZ[i] = p[1];
      const nl = Math.hypot(p[2], p[3]);
      this.reefNx[i] = nl > 1e-4 ? p[2] / nl : 0;
      this.reefNz[i] = nl > 1e-4 ? p[3] / nl : 1;
    }
    this.reefCount = n;
  }

  /**
   * Queue a close moving galley oar emitter. Strictly skips when `camDist >= 140 m` or stationary.
   */
  pushOar(
    x: number,
    z: number,
    vx: number,
    vz: number,
    beam: number,
    camDist: number,
    oarPhase = 0,
  ): void {
    if (!this.enabled || camDist >= OAR_SPRAY_MAX_DIST || beam <= 0) return;
    if (vx * vx + vz * vz < MIN_OAR_SPEED_SQ) return;
    if (this.oarCount >= MAX_SPRAY_OARS) return;
    const slot = this.oarCount++;
    this.oarX[slot] = x;
    this.oarZ[slot] = z;
    this.oarVx[slot] = vx;
    this.oarVz[slot] = vz;
    this.oarBeam[slot] = beam;
    this.oarCamDist[slot] = camDist;
    this.oarPhase[slot] = oarPhase;
  }

  /**
   * Advance ballistic spray physics (`-9.8 m/s²` gravity + wind drag), cull expired / submerged (`y < waterY - 0.35`)
   * particles, emit wave-relative bow/reef/oar particles, and pack live particles tightly into dynamic GPU buffers.
   * `reducedMotion` accepts either a boolean (`true` = frozen) or a `MotionClock.live` scalar in `[0..1]`.
   */
  step(
    dt: number,
    time: number,
    seaAmp: number,
    windX: number,
    windZ: number,
    sunColor: THREE.Color,
    ambient: THREE.Color,
    night: number,
    reducedMotion: boolean | number,
    heightAt?: (x: number, z: number) => number,
  ): void {
    if (this.disposed) return;

    const u = this.mat.uniforms;
    (u.uSunColor.value as THREE.Color).copy(sunColor);
    (u.uAmbient.value as THREE.Color).copy(ambient);
    u.uNight.value = clamp01(night);

    if (!this.enabled) {
      this.clearLive();
      return;
    }

    const liveScale = typeof reducedMotion === "boolean" ? (reducedMotion ? 0 : 1) : clamp01(reducedMotion);
    if (liveScale <= 1e-4) {
      this.beginFrame();
      this.geo.instanceCount = this.aliveCount;
      this.mesh.visible = this.aliveCount > 0;
      return;
    }

    const stepDt = Math.min(Math.max(dt, 0), 0.1) * liveScale;
    if (stepDt > 0) {
      // 1. Advance existing particles with ballistic gravity & wind drag, swap-removing dead / submerged slots
      const targetWindVx = windX * 7.5;
      const targetWindVz = windZ * 7.5;
      const dragBow = 1 - Math.exp(-1.15 * stepDt);
      const dragReef = 1 - Math.exp(-1.75 * stepDt);
      const dragOar = 1 - Math.exp(-1.45 * stepDt);
      const halfG = 0.5 * GRAVITY * stepDt;

      let i = 0;
      while (i < this.aliveCount) {
        const nextAge = this.age[i] + stepDt;
        if (nextAge >= this.life[i]) {
          this.removeAt(i);
          continue;
        }
        const k = this.kind[i];
        const drag = k === 1 ? dragReef : k === 2 ? dragOar : dragBow;
        const gravScale = k === 1 ? 0.62 : 1.0;

        const vx = this.velX[i] + (targetWindVx - this.velX[i]) * drag;
        const vz = this.velZ[i] + (targetWindVz - this.velZ[i]) * drag;
        const vy0 = this.velY[i];
        const vy = vy0 - GRAVITY * gravScale * stepDt;

        const px = this.posX[i] + vx * stepDt;
        const py = this.posY[i] + (vy0 - halfG * gravScale) * stepDt;
        const pz = this.posZ[i] + vz * stepDt;
        const wy = heightAt ? heightAt(px, pz) : 0;
        if (py < wy + KILL_Y) {
          this.removeAt(i);
          continue;
        }

        this.age[i] = nextAge;
        this.velX[i] = vx;
        this.velY[i] = vy;
        this.velZ[i] = vz;
        this.posX[i] = px;
        this.posY[i] = py;
        this.posZ[i] = pz;
        this.waterY[i] = wy;
        i++;
      }

      // 2. Emit from all three physical sources relative to local displaced wave surface
      const budgetScale = this.maxParticlesCount / SPRAY_CAPACITY;
      this.emitBows(stepDt, seaAmp, budgetScale, heightAt);
      this.emitReefs(stepDt, time, seaAmp, windX, windZ, budgetScale, heightAt);
      this.emitOars(stepDt, budgetScale, heightAt);
    }

    this.beginFrame();
    this.packGpuBuffers();
  }

  preparationEntries(): PreparationEntry[] {
    return [{ root: this.mesh, camera: this.prepCamera, target: () => null }];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearLive();
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
    this.fallbackDepth.dispose();
  }

  private clearLive(): void {
    this.aliveCount = 0;
    this.ringCursor = 0;
    this.beginFrame();
    this.geo.instanceCount = 0;
    this.mesh.visible = false;
  }

  private nextRand(): number {
    const s = (this.rngState + 0x6d2b79f5) | 0;
    this.rngState = s;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private removeAt(index: number): void {
    const last = --this.aliveCount;
    if (index < last) {
      this.posX[index] = this.posX[last];
      this.posY[index] = this.posY[last];
      this.posZ[index] = this.posZ[last];
      this.velX[index] = this.velX[last];
      this.velY[index] = this.velY[last];
      this.velZ[index] = this.velZ[last];
      this.age[index] = this.age[last];
      this.life[index] = this.life[last];
      this.size[index] = this.size[last];
      this.kind[index] = this.kind[last];
      this.seed[index] = this.seed[last];
      this.baseAlpha[index] = this.baseAlpha[last];
      this.waterY[index] = this.waterY[last];
    }
  }

  private spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    kind: 0 | 1 | 2,
    alpha: number,
    waterY: number,
  ): void {
    const cap = this.maxParticlesCount;
    if (cap <= 0) return;
    let slot: number;
    if (this.aliveCount < cap) {
      slot = this.aliveCount++;
    } else {
      slot = this.ringCursor % cap;
      this.ringCursor = (slot + 1) % cap;
    }
    this.posX[slot] = x;
    this.posY[slot] = y;
    this.posZ[slot] = z;
    this.velX[slot] = vx;
    this.velY[slot] = vy;
    this.velZ[slot] = vz;
    this.age[slot] = 0;
    this.life[slot] = life;
    this.size[slot] = size;
    this.kind[slot] = kind;
    this.seed[slot] = this.nextRand();
    this.baseAlpha[slot] = alpha;
    this.waterY[slot] = waterY;
  }

  private emitBows(dt: number, seaAmp: number, budgetScale: number, heightAt?: (x: number, z: number) => number): void {
    const seaK = 0.45 + 0.9 * clamp01(seaAmp);
    for (let b = 0; b < this.bowCount; b++) {
      const spd = this.bowSpeed[b];
      const imp = this.bowImpact[b];
      const len = this.bowLen[b];
      const vx = this.bowVx[b];
      const vz = this.bowVz[b];
      const vl = Math.hypot(vx, vz);
      const fx = vl > 1e-4 ? vx / vl : 0;
      const fz = vl > 1e-4 ? vz / vl : 1;
      const sx = fz;
      const sz = -fx;

      const spdK = Math.min(1.5, Math.max(0, (spd - MIN_BOW_SPEED) / 2.6));
      const impK = 0.45 + 0.75 * Math.min(2.0, imp);
      const intensity = spdK * impK * seaK;
      if (intensity <= 0.01) continue;

      this.bowEmitCarry += intensity * dt * 34 * budgetScale;
      const count = Math.min(8, Math.floor(this.bowEmitCarry));
      if (count <= 0) continue;
      this.bowEmitCarry -= count;

      const tipX = this.bowX[b] + fx * len * 0.88;
      const tipZ = this.bowZ[b] + fz * len * 0.88;
      const sizeScale = Math.min(1.65, Math.max(0.65, len / 7.5));
      const alpha = Math.min(0.72, 0.30 + 0.30 * intensity);

      for (let j = 0; j < count; j++) {
        const side = this.nextRand() < 0.5 ? -1 : 1;
        const rA = this.nextRand();
        const rB = this.nextRand();
        const rC = this.nextRand();
        const alongOff = -rA * Math.min(len * 0.25, 2.6);
        const latOff = side * (0.25 + rB * Math.min(len * 0.16, 1.4));
        const px = tipX + fx * alongOff + sx * latOff;
        const pz = tipZ + fz * alongOff + sz * latOff;
        const wy = heightAt ? heightAt(px, pz) : 0;
        const py = wy + 0.24 + rC * 0.48;

        const latSpd = side * (1.25 + rB * 2.55) * (0.65 + 0.45 * intensity);
        const fwdCarry = 0.42 + 0.22 * rA;
        const pvx = vx * fwdCarry + sx * latSpd;
        const pvz = vz * fwdCarry + sz * latSpd;
        const pvy = 1.85 + (1.85 + rC * 2.65) * Math.min(1.5, 0.55 + 0.55 * intensity);
        const pLife = 0.52 + rA * 0.62;
        const pSize = (0.36 + rB * 0.46) * sizeScale;
        this.spawn(px, py, pz, pvx, pvy, pvz, pLife, pSize, 0, alpha, wy);
      }
    }
  }

  private emitReefs(
    dt: number,
    time: number,
    seaAmp: number,
    windX: number,
    windZ: number,
    budgetScale: number,
    heightAt?: (x: number, z: number) => number,
  ): void {
    if (this.reefCount <= 0 || seaAmp <= REEF_SPRAY_MIN_AMP) return;
    const ampK = smooth01(REEF_SPRAY_MIN_AMP, 0.85, seaAmp);
    const windLen = Math.hypot(windX, windZ);
    const wdx = windLen > 1e-4 ? windX / windLen : SWELL_DIR[0];
    const wdz = windLen > 1e-4 ? windZ / windLen : SWELL_DIR[1];

    for (let r = 0; r < this.reefCount; r++) {
      const ax = this.reefX[r];
      const az = this.reefZ[r];
      const crest = Math.sin(swellPhase(ax, az, time));
      if (crest <= 0.52) continue;

      const nx = this.reefNx[r];
      const nz = this.reefNz[r];
      const swDot = -(nx * SWELL_DIR[0] + nz * SWELL_DIR[1]);
      const wdDot = -(nx * wdx + nz * wdz);
      const exposure = 0.45 + 0.55 * clamp01((Math.max(swDot, wdDot) + 0.35) / 1.2);
      const crestK = (crest - 0.52) / 0.48;

      this.reefEmitCarry += crestK * crestK * ampK * exposure * dt * 6.5 * budgetScale;
      const count = Math.min(4, Math.floor(this.reefEmitCarry));
      if (count <= 0) continue;
      this.reefEmitCarry -= count;

      const alpha = Math.min(0.62, 0.22 + 0.36 * ampK * exposure);
      for (let j = 0; j < count; j++) {
        const rA = this.nextRand();
        const rB = this.nextRand();
        const rC = this.nextRand();
        const tx = -nz;
        const tz = nx;
        const spread = (rA - 0.5) * 4.2;
        const px = ax + nx * (1.2 + rB * 1.4) + tx * spread;
        const pz = az + nz * (1.2 + rB * 1.4) + tz * spread;
        const wy = heightAt ? heightAt(px, pz) : 0;
        const py = Math.max(0, wy) + 0.35 + rC * 0.85;

        const seaward = 1.2 + rB * 2.1;
        const pvx = nx * seaward + windX * (2.6 + rA * 3.4);
        const pvz = nz * seaward + windZ * (2.6 + rA * 3.4);
        const pvy = (3.1 + rC * 4.2) * (0.55 + 0.65 * ampK);
        const pLife = 0.9 + rA * 0.9;
        const pSize = (0.95 + rB * 1.2) * (0.7 + 0.55 * ampK);
        this.spawn(px, py, pz, pvx, pvy, pvz, pLife, pSize, 1, alpha, wy);
      }
    }
  }

  private emitOars(dt: number, budgetScale: number, heightAt?: (x: number, z: number) => number): void {
    for (let o = 0; o < this.oarCount; o++) {
      const camD = this.oarCamDist[o];
      if (camD >= OAR_SPRAY_MAX_DIST) continue;
      const distK = 1 - smooth01(90, OAR_SPRAY_MAX_DIST, camD);
      const vx = this.oarVx[o];
      const vz = this.oarVz[o];
      const spd = Math.hypot(vx, vz);
      if (spd < 0.2) continue;

      const fx = vx / spd;
      const fz = vz / spd;
      const sx = fz;
      const sz = -fx;
      const beam = this.oarBeam[o];
      const reach = beam * 0.5 + Math.min(2.8, Math.max(1.1, beam * 0.44));

      const spdK = Math.min(1.4, spd / 2.2);
      const phase = this.oarPhase[o];
      const catchK = phase !== 0 ? 0.35 + 1.05 * smooth01(0.15, 0.95, Math.sin(phase)) : 1.0;
      this.oarEmitCarry += spdK * distK * catchK * dt * 28 * budgetScale;
      const count = Math.min(6, Math.floor(this.oarEmitCarry));
      if (count <= 0) continue;
      this.oarEmitCarry -= count;

      const alpha = Math.min(0.64, 0.34 + 0.28 * distK);
      for (let j = 0; j < count; j++) {
        // Persistent side alternation guarantees balanced port (-1) and starboard (+1) splashes even when count === 1
        const side = (this.oarSideCursor++ & 1) === 0 ? 1 : -1;
        const rA = this.nextRand();
        const rB = this.nextRand();
        const rC = this.nextRand();
        const along = (rA - 0.52) * Math.min(beam * 2.1, 9.0);
        const px = this.oarX[o] + fx * along + sx * (side * (reach + (rB - 0.5) * 0.45));
        const pz = this.oarZ[o] + fz * along + sz * (side * (reach + (rB - 0.5) * 0.45));
        const wy = heightAt ? heightAt(px, pz) : 0;
        const py = wy + 0.14 + rC * 0.22;

        const pvx = sx * (side * (0.95 + rB * 1.45)) - fx * (0.75 + rA * 1.15);
        const pvz = sz * (side * (0.95 + rB * 1.45)) - fz * (0.75 + rA * 1.15);
        const pvy = 1.45 + rC * 1.95;
        const pLife = 0.36 + rA * 0.32;
        const pSize = 0.22 + rB * 0.22;
        this.spawn(px, py, pz, pvx, pvy, pvz, pLife, pSize, 2, alpha, wy);
      }
    }
  }

  private packGpuBuffers(): void {
    const n = this.aliveCount;
    if (n <= 0) {
      this.geo.instanceCount = 0;
      this.mesh.visible = false;
      return;
    }
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const ageNorm = clamp01(this.age[i] / Math.max(this.life[i], 1e-4));
      const k = this.kind[i];
      const grow = k === 1 ? 0.68 + 0.92 * ageNorm : k === 2 ? 0.65 + 0.45 * ageNorm : 0.72 + 0.62 * ageNorm;
      const fadeIn = smooth01(0, 0.08, ageNorm);
      const rem = 1 - ageNorm;
      const fadeOut = rem * rem;

      this.bufPosSize[o] = this.posX[i];
      this.bufPosSize[o + 1] = this.posY[i];
      this.bufPosSize[o + 2] = this.posZ[i];
      this.bufPosSize[o + 3] = this.size[i] * grow;

      this.bufMeta[o] = ageNorm;
      this.bufMeta[o + 1] = this.baseAlpha[i] * fadeIn * fadeOut;
      this.bufMeta[o + 2] = k;
      this.bufMeta[o + 3] = this.seed[i];

      this.bufWaterY[i] = this.waterY[i];
    }

    this.geo.instanceCount = n;
    // Reuse pre-allocated updateRange objects so the per-frame hot path performs zero heap allocations.
    this.posRange.start = 0;
    this.posRange.count = n * 4;
    this.attrPosSize.updateRanges.length = 1;
    this.attrPosSize.updateRanges[0] = this.posRange;
    this.attrPosSize.needsUpdate = true;

    this.metaRange.start = 0;
    this.metaRange.count = n * 4;
    this.attrMeta.updateRanges.length = 1;
    this.attrMeta.updateRanges[0] = this.metaRange;
    this.attrMeta.needsUpdate = true;

    this.waterRange.start = 0;
    this.waterRange.count = n;
    this.attrWaterY.updateRanges.length = 1;
    this.attrWaterY.updateRanges[0] = this.waterRange;
    this.attrWaterY.needsUpdate = true;
    this.mesh.visible = true;
  }
}
