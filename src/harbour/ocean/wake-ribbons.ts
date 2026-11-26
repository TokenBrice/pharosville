import * as THREE from "three";
import type { PreparationEntry } from "../engine/types";
import type { Bounds4 } from "./sea-sdf";

/**
 * Target-centered curved RGBA16F world-space wake ribbons (`wake-ribbons.ts`, Phase 2 §5.5, H1 / H2 / H4).
 *
 * Replaces `uWakeLive` (ocean fragment slot 3) on High (`1024² RGBA16F`, 128 tracks × 40 pts) and Medium
 * (`512² RGBA16F`, 64 tracks × 24 pts) using dedicated `uLiveBounds` centered on `rig.target` (never
 * `camera.position`, H1) quantized to `16 m` snaps (`0.23–0.47 m/texel` on High). Low tier disposes the RT
 * completely (`0 MB` VRAM) and exposes a 1×1 zero fallback.
 *
 * All active curved moving tracks render in ONE dynamic indexed draw using `blendEquationSeparate(MAX, ADD)` (H4):
 * - R: aerated white wake foam (bow plume + feathered 19.47° Kelvin V-arms + transverse peaks + stern wash)
 * - G: wider sub-surface turquoise bubble churn inside the V-wedge
 * - B: live moving hull footprint occlusion right at the head (`arcDist ∈ [-hl, +hl]`)
 * - A: raw signed Kelvin divergent + transverse wave height (metres, `[-0.35, +0.45]`) summed linearly across
 *      crossing wakes via `AddEquation` in `RGBA16F` alpha!
 *
 * Zero per-frame heap allocations: all track ring buffers, vertex attributes, index buffers, and scratch
 * vectors are pre-allocated once at construction.
 */
export const RIBBON_RES_HIGH = 1024;
export const RIBBON_RES_MED = 512;
export const MAX_RIBBONS_HIGH = 128;
export const MAX_RIBBONS_MED = 64;
export const RIBBON_PTS_HIGH = 40;
export const RIBBON_PTS_MED = 24;
export const RIBBON_SNAP_M = 16;

const PT_STRIDE = 7; // x, z, heading, speed, halfWidth, halfLength, age
const MAX_SECTIONS_PER_TRACK = RIBBON_PTS_HIGH + 1; // 1 bow-tip + 40 spine points
const MAX_VERTS = MAX_RIBBONS_HIGH * MAX_SECTIONS_PER_TRACK * 2;
const MAX_INDICES = MAX_RIBBONS_HIGH * RIBBON_PTS_HIGH * 6;
const TELEPORT_DIST_M = 45;
const MIN_MOVE_SPEED = 0.25;
const TAU = Math.PI * 2;

export type WakeRibbonTier = "high" | "medium" | "low";

export interface WakeRibbonUniforms {
  uLiveBounds: THREE.IUniform<THREE.Vector4>;
  uRibbonsOn: THREE.IUniform<number>;
}

/**
 * Target-centered world-XZ bounds for moving wake ribbons (H1), quantized to `16 m` world snaps.
 * Span adapts to camera distance (`240 / 480 / 960 m`), giving `0.23–0.47 m/texel` on High (`1024²`).
 */
export function wakeRibbonBoundsFor(
  targetX: number,
  targetZ: number,
  camDist: number,
  out: Bounds4 = [0, 0, 0, 0],
): Bounds4 {
  const span = camDist < 340 ? 240 : camDist < 720 ? 480 : 960;
  const half = span * 0.5;
  const cx = Math.round(targetX / RIBBON_SNAP_M) * RIBBON_SNAP_M || 0;
  const cz = Math.round(targetZ / RIBBON_SNAP_M) * RIBBON_SNAP_M || 0;
  out[0] = cx - half;
  out[1] = cz - half;
  out[2] = cx + half;
  out[3] = cz + half;
  return out;
}

export const WAKE_RIBBON_VERT = /* glsl */ `
uniform vec4 uLiveBounds;
attribute vec4 aRibbonA;
attribute vec4 aRibbonB;
varying vec4 vA;
varying vec4 vB;
void main() {
  vA = aRibbonA;
  vB = aRibbonB;
  vec2 uv = (position.xz - uLiveBounds.xy) / (uLiveBounds.zw - uLiveBounds.xy);
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
}`;

export const WAKE_RIBBON_FRAG = /* glsl */ `
varying vec4 vA;
varying vec4 vB;
void main() {
  float arc = vA.x;
  float lat = vA.y;
  float hb = max(vA.z, 0.45);
  float hl = max(vA.w, 1.2);
  float spd = vB.x;
  float ageFrac = clamp(vB.y, 0.0, 1.0);
  float str = vB.z;
  float seed = vB.w;

  float sp = smoothstep(0.35, 1.25, spd) * (0.48 + 0.52 * smoothstep(1.25, 3.8, spd)) * clamp(hl / 4.5, 0.62, 1.0);
  float ageFade = 1.0 - smoothstep(0.55, 1.0, ageFrac);
  float u = arc + hl * 0.75;
  float uPos = max(u, 0.0);
  float wl = hl * (3.2 + 4.4 * smoothstep(1.2, 6.0, spd));
  float armR = hb * 0.60 + uPos * 0.3536;
  float absLat = abs(lat);
  float arm = abs(absLat - armR);
  float armW = 0.56 + uPos * 0.025;
  float fall = exp(-uPos / max(wl * 0.54, 2.4)) * smoothstep(0.0, hl * 0.35, u) * ageFade;
  float span = hb * 1.6 + uPos * 0.56 + 2.0;
  float edgeFade = 1.0 - smoothstep(span * 0.80, span * 0.98, absLat);

  float ec = u / max(1.2, hb * 1.3) - absLat * 0.2069;
  float cj = floor(ec + 0.25);
  float cr = fract(sin(cj * 12.9898 + seed * 78.233) * 43758.5453);
  float ech = smoothstep(-0.1, 0.7, sin((ec - (cr - 0.5) * 0.2) * 6.2831853)) * (0.8 + 0.4 * fract(cr * 7.13));
  float armFoam = exp(-(arm * arm) / (armW * armW)) * fall * (0.46 + 0.54 * ech) * 1.18;

  float insideWedge = smoothstep(0.0, 1.0, armR - absLat) * step(0.0, u);
  float transPhase = u * 6.2831853 / max(2.2, hl * 0.92);
  float tCos = 0.5 + 0.5 * cos(transPhase);
  float t2 = tCos * tCos;
  float transFoam = insideWedge * (t2 * t2 * t2) * fall * 0.20;

  float headLive = 1.0 - smoothstep(0.06, 0.24, ageFrac);
  float bx = (arc + hl * 0.92) / max(hl * 0.18, 0.45);
  float by = lat / max(hb * 1.05, 0.50);
  float bowFoam = exp(-(bx * bx + by * by)) * 0.55 * headLive;

  float sw = max(hb * 0.48, 0.40) + max(arc - hl * 0.6, 0.0) * 0.075;
  float sy = lat / sw;
  float sternWash = exp(-sy * sy) * smoothstep(hl * 0.35, hl * 1.05, arc) * exp(-max(arc - hl * 0.8, 0.0) / max(wl * 0.48, 2.8)) * ageFade * 0.42;
  float foam = clamp((armFoam + transFoam + bowFoam + sternWash) * sp * str * edgeFade, 0.0, 2.0);

  float cw = max(hb * 0.95, 0.65) + max(arc - hl * 0.3, 0.0) * 0.16;
  float cy = lat / cw;
  float churnCore = exp(-cy * cy) * smoothstep(-hl * 0.2, hl * 0.95, arc) * exp(-max(arc, 0.0) / max(wl * 0.78, 4.0));
  float churnW = armW * 2.1;
  float churnArms = exp(-(arm * arm) / (churnW * churnW)) * fall * 0.55;
  float churn = clamp((churnCore * 0.55 + churnArms * 0.72) * sp * str * ageFade * ageFade * edgeFade, 0.0, 1.2);

  float ex = arc / hl;
  float ey = lat / hb;
  float e = sqrt(ex * ex + ey * ey);
  float headGate = 1.0 - smoothstep(0.05, 0.25, ageFrac);
  float hullOcc = (1.0 - smoothstep(0.72, 1.32, e)) * headGate * min(str, 1.0);

  float dArm = (absLat - armR) / max(armW * 1.35, 0.65);
  float divWave = cos(dArm * 2.2) * exp(-dArm * dArm * 0.55) * fall * (0.65 + 0.35 * ech);
  float transWave = insideWedge * cos(transPhase) * fall * 0.36;
  float bowSurge = exp(-(bx * bx + by * by)) * 0.42 * headLive;
  float hullTrough = -exp(-(ex * ex * 1.4 + ey * ey * 0.9)) * 0.16 * headGate;
  float hAmp = clamp(0.20 + 0.24 * smoothstep(2.0, 12.0, hl), 0.20, 0.46) * sp * min(str, 1.25);
  float signedKelvinH = clamp((divWave * 0.85 + transWave + bowSurge + hullTrough) * hAmp * edgeFade, -0.35, 0.45);

  gl_FragColor = vec4(foam, churn, hullOcc, signedKelvinH);
}`;

function wrapAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= TAU;
  while (r < -Math.PI) r += TAU;
  return r;
}

function createRibbonTarget(res: number, name: string): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(res, res, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
  });
  rt.texture.name = name;
  return rt;
}

export class WakeRibbons {
  readonly uniforms: WakeRibbonUniforms;
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private tier: WakeRibbonTier = "low";
  private maxTracks = 0;
  private maxPts = 0;
  private activeTracks = 0;
  private rt: THREE.WebGLRenderTarget | null = null;
  private readonly fallback: THREE.DataTexture;
  private readonly compilationTarget: THREE.WebGLRenderTarget;
  private readonly geo: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly scene = new THREE.Scene();
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly boundsScratch: Bounds4 = [0, 0, 0, 0];
  private readonly prevClear = new THREE.Color();

  // Pre-allocated SoA ring-buffer pool (zero per-frame heap allocations)
  private readonly trackId = new Int32Array(MAX_RIBBONS_HIGH).fill(-1);
  private readonly trackSeen = new Uint8Array(MAX_RIBBONS_HIGH);
  private readonly trackPts = new Uint16Array(MAX_RIBBONS_HIGH);
  private readonly trackHead = new Uint16Array(MAX_RIBBONS_HIGH);
  private readonly trackStrength = new Float32Array(MAX_RIBBONS_HIGH);
  private readonly trackSeed = new Float32Array(MAX_RIBBONS_HIGH);
  private readonly trackCost = new Float32Array(MAX_RIBBONS_HIGH);
  private readonly trackUnseenAge = new Float32Array(MAX_RIBBONS_HIGH);
  private readonly trackMaxAge = new Float32Array(MAX_RIBBONS_HIGH);
  private readonly pts = new Float32Array(MAX_RIBBONS_HIGH * RIBBON_PTS_HIGH * PT_STRIDE);
  private readonly idToSlot = new Map<number, number>();

  // Pre-allocated dynamic ribbon geometry buffers
  private readonly posBuf = new Float32Array(MAX_VERTS * 3);
  private readonly ribABuf = new Float32Array(MAX_VERTS * 4);
  private readonly ribBBuf = new Float32Array(MAX_VERTS * 4);
  private readonly idxBuf = new Uint16Array(MAX_INDICES);
  private readonly posAttr: THREE.BufferAttribute;
  private readonly ribAAttr: THREE.BufferAttribute;
  private readonly ribBAttr: THREE.BufferAttribute;
  private readonly idxAttr: THREE.BufferAttribute;

  // Scratch spine arrays for current track during mesh emission
  private readonly spineX = new Float32Array(RIBBON_PTS_HIGH);
  private readonly spineZ = new Float32Array(RIBBON_PTS_HIGH);
  private readonly spineArc = new Float32Array(RIBBON_PTS_HIGH);
  private readonly spineIdx = new Int32Array(RIBBON_PTS_HIGH);

  constructor(initialTier: WakeRibbonTier = "low") {
    this.fallback = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    this.fallback.minFilter = THREE.LinearFilter;
    this.fallback.magFilter = THREE.LinearFilter;
    this.fallback.wrapS = THREE.ClampToEdgeWrapping;
    this.fallback.wrapT = THREE.ClampToEdgeWrapping;
    this.fallback.needsUpdate = true;

    this.compilationTarget = createRibbonTarget(1, "WakeRibbons.Compile");

    this.uniforms = {
      uLiveBounds: { value: new THREE.Vector4(-240, -240, 240, 240) },
      uRibbonsOn: { value: 0 },
    };

    this.posAttr = new THREE.BufferAttribute(this.posBuf, 3).setUsage(THREE.DynamicDrawUsage);
    this.ribAAttr = new THREE.BufferAttribute(this.ribABuf, 4).setUsage(THREE.DynamicDrawUsage);
    this.ribBAttr = new THREE.BufferAttribute(this.ribBBuf, 4).setUsage(THREE.DynamicDrawUsage);
    this.idxAttr = new THREE.BufferAttribute(this.idxBuf, 1).setUsage(THREE.DynamicDrawUsage);

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", this.posAttr);
    this.geo.setAttribute("aRibbonA", this.ribAAttr);
    this.geo.setAttribute("aRibbonB", this.ribBAttr);
    this.geo.setIndex(this.idxAttr);
    this.geo.setDrawRange(0, 0);

    this.material = new THREE.ShaderMaterial({
      name: "hb_wake_ribbon",
      vertexShader: WAKE_RIBBON_VERT,
      fragmentShader: WAKE_RIBBON_FRAG,
      uniforms: { uLiveBounds: this.uniforms.uLiveBounds },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.MaxEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
    });

    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.name = "ocean-wake-ribbons";
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    if (initialTier !== "low") this.setTier(initialTier);
  }

  get texture(): THREE.Texture {
    return this.rt ? this.rt.texture : this.fallback;
  }

  get target(): THREE.WebGLRenderTarget | null {
    return this.rt;
  }

  get active(): boolean {
    return this.rt !== null && this.tier !== "low";
  }

  get trackCount(): number {
    return this.activeTracks;
  }

  /** High: 1024² / 128×40; Medium: 512² / 64×24; Low: disposes RT (0 MB VRAM). */
  setTier(tier: WakeRibbonTier): void {
    if (tier === this.tier) return;
    this.tier = tier;
    if (tier === "low") {
      this.maxTracks = 0;
      this.maxPts = 0;
      this.uniforms.uRibbonsOn.value = 0;
      this.resetTracks();
      const old = this.rt;
      this.rt = null;
      old?.dispose();
      return;
    }
    const nextRes = tier === "high" ? RIBBON_RES_HIGH : RIBBON_RES_MED;
    const nextTracks = tier === "high" ? MAX_RIBBONS_HIGH : MAX_RIBBONS_MED;
    const nextPts = tier === "high" ? RIBBON_PTS_HIGH : RIBBON_PTS_MED;
    if (nextTracks < this.maxTracks) this.compactTracks(nextTracks, nextPts);
    else if (nextPts < this.maxPts) {
      for (let s = 0; s < MAX_RIBBONS_HIGH; s++) {
        if (this.trackId[s] >= 0 && this.trackPts[s] > nextPts) this.trackPts[s] = nextPts;
      }
    }
    this.maxTracks = nextTracks;
    this.maxPts = nextPts;
    if (!this.rt || this.rt.width !== nextRes) {
      const old = this.rt;
      this.rt = createRibbonTarget(nextRes, "WakeRibbons.Target");
      old?.dispose();
    }
    this.uniforms.uRibbonsOn.value = 1;
  }

  /** Mark all tracks unseen for the new frame (zero allocation). */
  beginFrame(): void {
    this.trackSeen.fill(0);
  }

  /**
   * Push a moving vessel sample into the curved ring-buffer pool.
   * Ignores stationary hulls (`speed <= 0.25 m/s`), resets on teleport (`> 45 m`), and evicts stale/furthest
   * tracks when full so the nearest/fastest 128 (High) / 64 (Med) moving vessels always retain ribbons.
   */
  pushMoving(
    id: number,
    x: number,
    z: number,
    vx: number,
    vz: number,
    halfWidth: number,
    halfLength: number,
    strength: number,
    focusX: number,
    focusZ: number,
  ): void {
    if (!this.active || this.maxTracks === 0) return;
    const speed = Math.hypot(vx, vz);
    if (!(speed > MIN_MOVE_SPEED) || !(strength > 0)) return;
    const heading = Math.atan2(vx, vz);
    const dxF = x - focusX;
    const dzF = z - focusZ;
    const cost = (dxF * dxF + dzF * dzF) / (1 + speed * 0.5);

    let slot = this.idToSlot.get(id);
    if (slot === undefined) {
      slot = this.acquireSlot(cost);
      if (slot < 0) return;
      this.trackId[slot] = id;
      this.trackPts[slot] = 0;
      this.trackHead[slot] = 0;
      this.trackUnseenAge[slot] = 0;
      this.trackSeed[slot] = Math.abs((id * 1.6180339887) % TAU);
      this.idToSlot.set(id, slot);
      this.activeTracks++;
    }

    this.trackSeen[slot] = 1;
    this.trackStrength[slot] = strength;
    this.trackCost[slot] = cost;
    this.trackUnseenAge[slot] = 0;
    this.trackMaxAge[slot] = Math.max(7.0, Math.min(14.0, 6.0 + halfLength * 0.45));

    const count = this.trackPts[slot];
    if (count < 2) {
      this.seedTrack(slot, x, z, heading, speed, halfWidth, halfLength);
      return;
    }

    const head = this.trackHead[slot];
    const headBase = (slot * RIBBON_PTS_HIGH + head) * PT_STRIDE;
    const hx = this.pts[headBase];
    const hz = this.pts[headBase + 1];
    if (Math.hypot(x - hx, z - hz) > TELEPORT_DIST_M) {
      this.seedTrack(slot, x, z, heading, speed, halfWidth, halfLength);
      return;
    }

    const prevRing = (head + RIBBON_PTS_HIGH - 1) % RIBBON_PTS_HIGH;
    const prevBase = (slot * RIBBON_PTS_HIGH + prevRing) * PT_STRIDE;
    const segDist = Math.hypot(x - this.pts[prevBase], z - this.pts[prevBase + 1]);
    const dHead = Math.abs(wrapAngle(heading - this.pts[prevBase + 2]));
    const minStep = Math.max(1.2, halfLength * 0.22);

    if (segDist >= minStep || (segDist >= 0.45 && dHead > 0.08)) {
      const nextHead = (head + 1) % RIBBON_PTS_HIGH;
      this.trackHead[slot] = nextHead;
      this.trackPts[slot] = Math.min(count + 1, this.maxPts);
      this.writePoint(slot, nextHead, x, z, heading, speed, halfWidth, halfLength, 0);
    } else {
      this.writePoint(slot, head, x, z, heading, speed, halfWidth, halfLength, 0);
    }
  }

  /**
   * Age/prune tracks, rebuild dynamic ribbon geometry, clear the RGBA16F target to `(0, 0, 0, 0)`,
   * and render all active wakes in 1 indexed draw call (restoring renderer state in `finally`).
   */
  render(renderer: THREE.WebGLRenderer, targetX: number, targetZ: number, camDist: number, dt: number): void {
    const b = wakeRibbonBoundsFor(targetX, targetZ, camDist, this.boundsScratch);
    this.uniforms.uLiveBounds.value.set(b[0], b[1], b[2], b[3]);
    if (!this.active || !this.rt) return;

    const stepDt = Math.max(0, dt);
    this.ageAndPrune(stepDt);
    const idxCount = this.buildMesh();

    const prevTarget = renderer.getRenderTarget();
    const prevAuto = renderer.autoClear;
    const prevClear = renderer.getClearColor(this.prevClear);
    const prevAlpha = renderer.getClearAlpha();
    try {
      renderer.autoClear = false;
      renderer.setRenderTarget(this.rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, false, false);
      if (idxCount > 0) renderer.render(this.scene, this.cam);
    } finally {
      renderer.setClearColor(prevClear, prevAlpha);
      renderer.autoClear = prevAuto;
      renderer.setRenderTarget(prevTarget);
    }
  }

  /** Clear all tracks and (if active and renderer provided) zero the RGBA16F render target (e.g. tab resume). */
  clear(renderer?: THREE.WebGLRenderer): void {
    this.resetTracks();
    if (!renderer || !this.rt) return;
    const prevTarget = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(this.prevClear);
    const prevAlpha = renderer.getClearAlpha();
    try {
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(this.rt);
      renderer.clear(true, false, false);
    } finally {
      renderer.setClearColor(prevClear, prevAlpha);
      renderer.setRenderTarget(prevTarget);
    }
  }

  preparationEntries(): PreparationEntry[] {
    return [{ root: this.mesh, camera: this.cam, target: () => this.rt ?? this.compilationTarget, scene: this.scene }];
  }

  dispose(): void {
    this.setTier("low");
    this.fallback.dispose();
    this.compilationTarget.dispose();
    this.geo.dispose();
    this.material.dispose();
  }

  private writePoint(
    slot: number,
    ringIdx: number,
    x: number,
    z: number,
    heading: number,
    speed: number,
    halfWidth: number,
    halfLength: number,
    age: number,
  ): void {
    const o = (slot * RIBBON_PTS_HIGH + ringIdx) * PT_STRIDE;
    this.pts[o] = x;
    this.pts[o + 1] = z;
    this.pts[o + 2] = heading;
    this.pts[o + 3] = speed;
    this.pts[o + 4] = halfWidth;
    this.pts[o + 5] = halfLength;
    this.pts[o + 6] = age;
  }

  private seedTrack(
    slot: number,
    x: number,
    z: number,
    heading: number,
    speed: number,
    halfWidth: number,
    halfLength: number,
  ): void {
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const tailOffset = Math.max(0.8, halfLength * 0.8);
    this.writePoint(slot, 0, x - fx * tailOffset, z - fz * tailOffset, heading, speed, halfWidth, halfLength, 0.05);
    this.writePoint(slot, 1, x, z, heading, speed, halfWidth, halfLength, 0);
    this.trackHead[slot] = 1;
    this.trackPts[slot] = 2;
  }

  private acquireSlot(newCost: number): number {
    // 1. Free slot
    for (let s = 0; s < this.maxTracks; s++) {
      if (this.trackId[s] < 0) return s;
    }
    // 2. Stale/unseen track from previous frame(s)
    let staleSlot = -1;
    let worstStaleAge = 0;
    let worstStaleCost = -1;
    for (let s = 0; s < this.maxTracks; s++) {
      const uAge = this.trackUnseenAge[s];
      if (uAge > 0 && (uAge > worstStaleAge || (uAge === worstStaleAge && this.trackCost[s] > worstStaleCost))) {
        staleSlot = s;
        worstStaleAge = uAge;
        worstStaleCost = this.trackCost[s];
      }
    }
    if (staleSlot >= 0) {
      this.releaseSlot(staleSlot);
      return staleSlot;
    }
    // 3. Furthest/slowest active track strictly worse than newcomer
    let worstSlot = -1;
    let worstCost = newCost;
    for (let s = 0; s < this.maxTracks; s++) {
      if (this.trackCost[s] > worstCost) {
        worstCost = this.trackCost[s];
        worstSlot = s;
      }
    }
    if (worstSlot >= 0) {
      this.releaseSlot(worstSlot);
      return worstSlot;
    }
    return -1;
  }

  private releaseSlot(slot: number): void {
    const id = this.trackId[slot];
    if (id < 0) return;
    this.idToSlot.delete(id);
    this.trackId[slot] = -1;
    this.trackPts[slot] = 0;
    this.trackSeen[slot] = 0;
    this.trackUnseenAge[slot] = 0;
    this.activeTracks = Math.max(0, this.activeTracks - 1);
  }

  private resetTracks(): void {
    this.idToSlot.clear();
    this.trackId.fill(-1);
    this.trackPts.fill(0);
    this.trackHead.fill(0);
    this.trackSeen.fill(0);
    this.trackUnseenAge.fill(0);
    this.activeTracks = 0;
    this.geo.setDrawRange(0, 0);
  }

  private compactTracks(nextMaxTracks: number, nextMaxPts: number): void {
    for (let s = 0; s < nextMaxTracks; s++) {
      if (this.trackId[s] >= 0 && this.trackPts[s] > nextMaxPts) this.trackPts[s] = nextMaxPts;
    }
    for (let s = nextMaxTracks; s < MAX_RIBBONS_HIGH; s++) {
      const id = this.trackId[s];
      if (id < 0) continue;
      let dst = -1;
      for (let k = 0; k < nextMaxTracks; k++) {
        if (this.trackId[k] < 0) { dst = k; break; }
      }
      if (dst >= 0) {
        const srcOff = s * RIBBON_PTS_HIGH * PT_STRIDE;
        const dstOff = dst * RIBBON_PTS_HIGH * PT_STRIDE;
        this.pts.copyWithin(dstOff, srcOff, srcOff + RIBBON_PTS_HIGH * PT_STRIDE);
        this.trackId[dst] = id;
        this.trackSeen[dst] = this.trackSeen[s];
        this.trackPts[dst] = Math.min(this.trackPts[s], nextMaxPts);
        this.trackHead[dst] = this.trackHead[s];
        this.trackStrength[dst] = this.trackStrength[s];
        this.trackSeed[dst] = this.trackSeed[s];
        this.trackCost[dst] = this.trackCost[s];
        this.trackUnseenAge[dst] = this.trackUnseenAge[s];
        this.trackMaxAge[dst] = this.trackMaxAge[s];
        this.idToSlot.set(id, dst);
        this.trackId[s] = -1;
        this.trackPts[s] = 0;
        this.trackSeen[s] = 0;
        this.trackUnseenAge[s] = 0;
      } else {
        this.releaseSlot(s);
      }
    }
  }

  private ageAndPrune(dt: number): void {
    for (let s = 0; s < this.maxTracks; s++) {
      if (this.trackId[s] < 0) continue;
      const seen = this.trackSeen[s] !== 0;
      if (seen) this.trackUnseenAge[s] = 0;
      else this.trackUnseenAge[s] += dt;

      let count = this.trackPts[s];
      const head = this.trackHead[s];
      const maxAge = this.trackMaxAge[s];
      const startAgeIdx = seen ? 1 : 0;
      for (let k = startAgeIdx; k < count; k++) {
        const r = (head - k + RIBBON_PTS_HIGH) % RIBBON_PTS_HIGH;
        const o = (s * RIBBON_PTS_HIGH + r) * PT_STRIDE;
        this.pts[o + 6] += dt;
      }
      while (count > 0) {
        const tailRing = (head - (count - 1) + RIBBON_PTS_HIGH) % RIBBON_PTS_HIGH;
        const tailAge = this.pts[(s * RIBBON_PTS_HIGH + tailRing) * PT_STRIDE + 6];
        if (tailAge > maxAge) count--;
        else break;
      }
      if (count < 2) {
        this.releaseSlot(s);
      } else {
        this.trackPts[s] = count;
      }
    }
  }

  private buildMesh(): number {
    let vertCount = 0;
    let idxCount = 0;

    for (let s = 0; s < this.maxTracks; s++) {
      if (this.trackId[s] < 0) continue;
      const count = this.trackPts[s];
      if (count < 2) continue;

      const head = this.trackHead[s];
      const maxAge = this.trackMaxAge[s];
      const str = this.trackStrength[s];
      const seed = this.trackSeed[s];
      const baseSlot = s * RIBBON_PTS_HIGH;

      // Gather spine points newest (0) -> oldest (count - 1) and cumulative arc distances
      let arc = 0;
      for (let k = 0; k < count; k++) {
        const ring = (head - k + RIBBON_PTS_HIGH) % RIBBON_PTS_HIGH;
        const o = (baseSlot + ring) * PT_STRIDE;
        const px = this.pts[o];
        const pz = this.pts[o + 1];
        if (k > 0) arc += Math.hypot(px - this.spineX[k - 1], pz - this.spineZ[k - 1]);
        this.spineX[k] = px;
        this.spineZ[k] = pz;
        this.spineArc[k] = arc;
        this.spineIdx[k] = o;
      }

      const o0 = this.spineIdx[0];
      const h0 = this.pts[o0 + 2];
      const spd0 = this.pts[o0 + 3];
      const hb0 = this.pts[o0 + 4];
      const hl0 = this.pts[o0 + 5];
      const age0 = this.pts[o0 + 6] / maxAge;
      const fx0 = Math.sin(h0);
      const fz0 = Math.cos(h0);
      const rx0 = fz0;
      const rz0 = -fx0;

      // Section 0: virtual bow-tip ahead of head center (covers bow wave + forward hullOcc cleanly)
      const bowLead = hl0 * 1.35;
      const bowX = this.spineX[0] + fx0 * bowLead;
      const bowZ = this.spineZ[0] + fz0 * bowLead;
      const bowSpan = hb0 * 1.6 + hl0 * 0.42 + 2.0;
      const startVert = vertCount;
      vertCount = this.emitSection(vertCount, bowX, bowZ, rx0, rz0, bowSpan, -bowLead, hb0, hl0, spd0, age0, str, seed);

      // Sections 1..count: spine points along curved track
      let prevTx = fx0;
      let prevTz = fz0;
      for (let k = 0; k < count; k++) {
        const o = this.spineIdx[k];
        const px = this.spineX[k];
        const pz = this.spineZ[k];
        const hd = this.pts[o + 2];
        const spd = this.pts[o + 3];
        const hb = this.pts[o + 4];
        const hl = this.pts[o + 5];
        const spineFrac = count > 1 ? k / (count - 1) : 1;
        const ageFrac = Math.min(1, Math.max(this.pts[o + 6] / maxAge, spineFrac));

        let tx: number;
        let tz: number;
        if (k === 0) {
          tx = fx0;
          tz = fz0;
        } else {
          const prevK = k - 1;
          const nextK = k + 1 < count ? k + 1 : k;
          tx = this.spineX[prevK] - this.spineX[nextK];
          tz = this.spineZ[prevK] - this.spineZ[nextK];
          const len = Math.hypot(tx, tz);
          if (len > 1e-4) {
            tx /= len;
            tz /= len;
          } else {
            tx = Math.sin(hd);
            tz = Math.cos(hd);
          }
        }
        const rx = tz;
        const rz = -tx;
        const arcD = this.spineArc[k];
        const uPos = arcD + hl * 0.75;
        let halfSpan = hb * 1.6 + uPos * 0.56 + 2.0;
        if (k > 0) {
          // Guard against inner-edge quad self-overlap on tight turns (keeps additive Kelvin alpha single-counted).
          const turnDot = prevTx * tx + prevTz * tz;
          const segLen = Math.max(0.5, arcD - this.spineArc[k - 1]);
          if (turnDot < 0.995) {
            const turnAngle = Math.acos(Math.max(-1, Math.min(1, turnDot)));
            const maxSafeSpan = segLen / Math.max(Math.tan(Math.min(turnAngle * 0.5, 1.35)), 0.05);
            if (halfSpan > maxSafeSpan) halfSpan = Math.max(hb * 1.5, maxSafeSpan);
          }
        }
        prevTx = tx;
        prevTz = tz;
        vertCount = this.emitSection(vertCount, px, pz, rx, rz, halfSpan, arcD, hb, hl, spd, ageFrac, str, seed);

        const prevV = startVert + k * 2;
        const currV = prevV + 2;
        this.idxBuf[idxCount++] = prevV;
        this.idxBuf[idxCount++] = prevV + 1;
        this.idxBuf[idxCount++] = currV;
        this.idxBuf[idxCount++] = prevV + 1;
        this.idxBuf[idxCount++] = currV + 1;
        this.idxBuf[idxCount++] = currV;
      }
    }

    this.geo.setDrawRange(0, idxCount);
    if (vertCount > 0) {
      this.posAttr.clearUpdateRanges(); this.posAttr.addUpdateRange(0, vertCount * 3); this.posAttr.needsUpdate = true;
      this.ribAAttr.clearUpdateRanges(); this.ribAAttr.addUpdateRange(0, vertCount * 4); this.ribAAttr.needsUpdate = true;
      this.ribBAttr.clearUpdateRanges(); this.ribBAttr.addUpdateRange(0, vertCount * 4); this.ribBAttr.needsUpdate = true;
      this.idxAttr.clearUpdateRanges(); this.idxAttr.addUpdateRange(0, idxCount); this.idxAttr.needsUpdate = true;
    }
    return idxCount;
  }

  private emitSection(
    v: number,
    cx: number,
    cz: number,
    rx: number,
    rz: number,
    halfSpan: number,
    arcDist: number,
    hb: number,
    hl: number,
    spd: number,
    ageFrac: number,
    str: number,
    seed: number,
  ): number {
    // Port vertex (-halfSpan)
    let p3 = v * 3;
    let p4 = v * 4;
    this.posBuf[p3] = cx - rx * halfSpan;
    this.posBuf[p3 + 1] = 0;
    this.posBuf[p3 + 2] = cz - rz * halfSpan;
    this.ribABuf[p4] = arcDist;
    this.ribABuf[p4 + 1] = -halfSpan;
    this.ribABuf[p4 + 2] = hb;
    this.ribABuf[p4 + 3] = hl;
    this.ribBBuf[p4] = spd;
    this.ribBBuf[p4 + 1] = ageFrac;
    this.ribBBuf[p4 + 2] = str;
    this.ribBBuf[p4 + 3] = seed;
    v++;

    // Starboard vertex (+halfSpan)
    p3 = v * 3;
    p4 = v * 4;
    this.posBuf[p3] = cx + rx * halfSpan;
    this.posBuf[p3 + 1] = 0;
    this.posBuf[p3 + 2] = cz + rz * halfSpan;
    this.ribABuf[p4] = arcDist;
    this.ribABuf[p4 + 1] = halfSpan;
    this.ribABuf[p4 + 2] = hb;
    this.ribABuf[p4 + 3] = hl;
    this.ribBBuf[p4] = spd;
    this.ribBBuf[p4 + 1] = ageFrac;
    this.ribBBuf[p4 + 2] = str;
    this.ribBBuf[p4 + 3] = seed;
    return v + 1;
  }
}
