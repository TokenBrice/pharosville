import * as THREE from "three";
import { FullscreenPass } from "./gpu-bake";
import type { Bounds4 } from "./sea-sdf";
import { SWELL_DIR } from "./waves";
import type { PreparationEntry } from "../engine/types";

/**
 * WAKE service ('wake'): a world-space wake/foam field over the sea bounds that every hull stamps into.
 *
 *  - `texture` (history, R16F ping-pong): turbulent trail left behind moving hulls; diffuses and decays
 *    (~4.5 s half-life), so a turning boat leaves a curved foam trail.
 *  - `live` (RGBA8, rebuilt every frame): R = Kelvin wedge arms + bow wave, G = hull contact ring,
 *    B = hull occlusion (darker water under the hull) + a thin dark waterline meniscus round a still hull,
 *    A = lee slick (03-O4, decorative): a glassy satin patch trailing downwind (`lee`) of every still hull, where the
 *    ocean drops its ripple roughness; G also carries a thin bright lip on the swell-facing side of a still hull.
 *    A storm (contact strength ≥ ~1) or a hull aground keeps only the rings: no slick, no lip.
 *
 * Callers stamp every frame they want to be seen: stamp(x, z, vx, vz, halfWidth, strength[, halfLength]).
 * Zero velocity = moored hull (contact ring + occlusion only). Stamps queued during frame N are drawn at
 * the start of frame N+1 (one frame of latency, invisible at harbour speeds).
 */
export interface WakeService {
  stamp(x: number, z: number, vx: number, vz: number, halfWidth: number, strength: number, halfLength?: number): void;
  readonly texture: THREE.Texture;
  readonly live: THREE.Texture;
  /** [minX, minZ, maxX, maxZ] */
  readonly bounds: Bounds4;
}

const MAX_STAMPS = 2048;

const STAMP_VERT = /* glsl */ `
attribute vec4 sA; // x, z, heading (rad, bow along (sin h, cos h)), halfLength
attribute vec4 sB; // halfBeam, speed (m/s), strength, -
uniform vec4 uBounds; uniform float uTrail; uniform vec2 uLee;
varying vec2 vL; varying vec4 vS; varying vec2 vW;
void main() {
  float hl = sA.w, hb = sB.x, spd = sB.y;
  float moving = step(0.25, spd);
  float wl = hl * (3.0 + 4.0 * smoothstep(1.2, 6.0, spd));         // Kelvin wedge length behind the stern
  vec2 lo, hi;
  if (uTrail > 0.5) { lo = vec2(-hl * 1.6, -hb * 1.6); hi = vec2(hl * 1.2, hb * 1.6); }
  else { lo = vec2(-hl - wl * 1.1, -(wl * 0.42 + hb * 2.0)); hi = vec2(hl * 1.3, wl * 0.42 + hb * 2.0); }
  vec2 t = position.xy * 0.5 + 0.5;
  float s = sin(sA.z), c = cos(sA.z);
  vec2 l, w;
  if (uTrail < 0.5 && moving < 0.5) {
    // still: a quad in the LEE frame (along uLee, across it) holding the hull's rings (any heading) and the
    // slick lobe trailing downwind (zero past 2.6 hl, lateral gaussian ~e^-4 at the edge): ~2.5x fewer
    // fragments than a square round the hull
    float r0 = max(hl, hb) * 1.45;
    float wd = max(r0, 2.0 * (hb * 1.5 + hl * 2.6 * 0.18));
    vec2 a = mix(vec2(-r0, -wd), vec2(max(r0, hl * 2.6), wd), t);
    vec2 lp = vec2(-uLee.y, uLee.x);
    w = sA.xy + uLee * a.x + lp * a.y;
    vec2 d = w - sA.xy;
    l = vec2(dot(d, vec2(s, c)), dot(d, vec2(c, -s)));
  } else {
    l = mix(lo, hi, t);
    w = sA.xy + vec2(s, c) * l.x + vec2(c, -s) * l.y;                 // l.x along bow, l.y to starboard
  }
  vL = l; vS = vec4(hl, hb, spd, sB.z);
  vW = w - sA.xy;
  vec2 uv = (w - uBounds.xy) / (uBounds.zw - uBounds.xy);
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
  if (uTrail > 0.5 && moving < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // moored hulls leave no trail
}`;

const STAMP_FRAG = /* glsl */ `
uniform float uTrail, uDt;
uniform vec2 uLee, uSwell;
varying vec2 vL; varying vec4 vS; varying vec2 vW;
void main() {
  float hl = vS.x, hb = vS.y, spd = vS.z, k = vS.w;
  vec2 q = vL;
  if (uTrail > 0.5) {
    // churned water at the stern: deposit normalised by the time a texel spends under the stamp,
    // so the trail settles at ~1 right behind the hull whatever the speed
    // a slow hull barely stirs the water: speed^2-ish and hull length scale the churn
    float sternL = hl * 0.3;
    float stern = exp(-(pow((q.x + hl * 0.9) / sternL, 2.0) + pow(q.y / (hb * 0.45), 2.0)));
    float sides = exp(-pow((abs(q.y) - hb * 1.0) / (hb * 0.22), 2.0)) * smoothstep(hl * 1.05, 0.0, abs(q.x)) * 0.08;
    float rate = spd / (sternL * 1.77);
    float sK = smoothstep(0.8, 1.6, spd) * (0.3 + 0.7 * smoothstep(1.6, 5.0, spd)) * clamp(hl / 7.0, 0.5, 1.0);
    gl_FragColor = vec4((stern + sides) * rate * k * sK * uDt * 0.75, 0.0, 0.0, 1.0);
    return;
  }
  float e = length(vec2(q.x / hl, q.y / hb));
  float ring = exp(-pow((e - 1.08) / 0.16, 2.0));
  float occl = 1.0 - smoothstep(0.75, 1.35, e);
  float kel = 0.0;
  if (spd > 0.25) {
    // speed^2-ish and hull length: a harbour hull at ~4 m/s draws thin lines; nothing below ~1.5 m/s
    float sp = smoothstep(0.8, 1.6, spd) * (0.35 + 0.65 * smoothstep(1.6, 5.0, spd)) * clamp(hl / 7.0, 0.5, 1.0);
    float u = hl * 0.75 - q.x;                                        // distance aft of the bow shoulder
    float wl = hl * (3.0 + 4.0 * smoothstep(1.2, 6.0, spd));
    float arm = abs(abs(q.y) - (hb * 0.6 + u * 0.354));               // Kelvin half-angle 19.47 deg
    float w = 0.5 + u * 0.018;                                        // thin lines (>= 1 texel: 0.47 m)
    float fall = exp(-u / (wl * 0.5)) * smoothstep(0.0, hl * 0.4, u);
    // echelon: the arm breaks into short feathered crests with gaps
    float ech = smoothstep(-0.1, 0.7, sin(u * 6.2831 / max(1.2, hb * 1.3) - abs(q.y) * 1.3));
    kel = exp(-(arm * arm) / (w * w)) * fall * (0.25 + 0.75 * ech);
    // transverse waves inside the wedge
    float inside = smoothstep(0.0, 1.0, (hb * 0.6 + u * 0.354) - abs(q.y)) * step(0.0, u);
    kel += inside * pow(0.5 + 0.5 * cos(u * 6.2831 / max(2.0, hl * 0.9)), 6.0) * fall * 0.18;
    float bow = exp(-(pow((q.x - hl * 0.9) / (hl * 0.12), 2.0) + pow(q.y / (hb * 1.05), 2.0)));
    kel = (kel + bow * 0.45) * sp;
  }
  // a still hull sits IN the water: a dark meniscus at the waterline, a thin bright lip where the swell meets her,
  // and a glassy lee slick trailing downwind (fades out as contact strength rises toward storm / aground)
  float meni = 0.0, lip = 0.0, slick = 0.0;
  if (spd <= 0.25) {
    float calm = 1.0 - smoothstep(0.5, 1.0, k);
    meni = exp(-pow((e - 1.0) / 0.09, 2.0)) * 0.55;
    float rw = length(vW) + 1e-4;
    float face = smoothstep(0.0, 0.7, dot(vW / rw, -uSwell));
    lip = exp(-pow((e - 1.13) / 0.1, 2.0)) * face * 0.75 * calm;
    float along = dot(vW, uLee), lat = abs(vW.x * uLee.y - vW.y * uLee.x);
    float len = hl * 2.6;
    slick = exp(-pow(lat / (hb * 1.5 + max(along, 0.0) * 0.18), 2.0)) * smoothstep(-hl * 0.6, hl * 0.2, along)
          * (1.0 - smoothstep(len * 0.4, len, along)) * calm;
  }
  gl_FragColor = vec4(kel * k, ring * k * (spd > 0.25 ? 0.45 : 0.7) + lip, occl * min(k, 1.0) + meni, slick);
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

export class WakeField implements WakeService {
  readonly bounds: Bounds4;
  private readonly hist: THREE.WebGLRenderTarget[];
  private readonly liveRT: THREE.WebGLRenderTarget;
  private idx = 0;
  private count = 0;
  /** PERF: the history decays/diffuses every other frame (on the summed dt); stamps still land every frame */
  private decayDt = 0;
  private frameN = 0;
  private readonly prevClear = new THREE.Color();
  private readonly attrA: THREE.InstancedBufferAttribute;
  private readonly attrB: THREE.InstancedBufferAttribute;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly trailMat: THREE.ShaderMaterial;
  private readonly liveMat: THREE.ShaderMaterial;
  private readonly scene = new THREE.Scene();
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly mesh: THREE.Mesh;
  private readonly decay: FullscreenPass;
  private readonly bufA: Float32Array;
  private readonly bufB: Float32Array;
  /** Downwind direction (world xz, unit) for the lee slicks; the ocean system sets it from the weather. */
  readonly lee = new THREE.Vector2(0.8, -0.6);

  constructor(bounds: Bounds4, histRes = 2048, liveRes = 2048) {
    this.bounds = bounds;
    const opts = (type: THREE.TextureDataType, format: THREE.PixelFormat): THREE.RenderTargetOptions => ({
      type, format, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    });
    this.hist = [0, 1].map(() => new THREE.WebGLRenderTarget(histRes, histRes, opts(THREE.HalfFloatType, THREE.RedFormat)));
    this.liveRT = new THREE.WebGLRenderTarget(liveRes, liveRes, opts(THREE.UnsignedByteType, THREE.RGBAFormat));

    this.bufA = new Float32Array(MAX_STAMPS * 4);
    this.bufB = new Float32Array(MAX_STAMPS * 4);
    this.attrA = new THREE.InstancedBufferAttribute(this.bufA, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrB = new THREE.InstancedBufferAttribute(this.bufB, 4).setUsage(THREE.DynamicDrawUsage);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.geo.setAttribute("sA", this.attrA);
    this.geo.setAttribute("sB", this.attrB);
    this.geo.instanceCount = 0;
    const uBounds = { value: new THREE.Vector4(...bounds) };
    const common = {
      vertexShader: STAMP_VERT, fragmentShader: STAMP_FRAG, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
    } as const;
    this.trailMat = new THREE.ShaderMaterial({ ...common, uniforms: { uBounds, uTrail: { value: 1 }, uDt: { value: 0.016 } } });
    this.liveMat = new THREE.ShaderMaterial({ ...common, uniforms: {
      uBounds, uTrail: { value: 0 }, uDt: { value: 0.016 }, uLee: { value: this.lee }, uSwell: { value: new THREE.Vector2(SWELL_DIR[0], SWELL_DIR[1]).normalize() },
    } });
    this.mesh = new THREE.Mesh(this.geo, this.trailMat);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    this.decay = new FullscreenPass(DECAY_FRAG, {
      uPrev: { value: null }, uDecay: { value: 1 }, uSpread: { value: 0 }, uTexel: { value: new THREE.Vector2(1 / histRes, 1 / histRes) },
    });
  }

  preparationEntries(): PreparationEntry[] {
    // Separate proxies retain both stamp materials without touching history, count or the ping-pong index.
    return [
      this.decay.preparationEntry(() => this.hist[1 - this.idx]),
      { root: new THREE.Mesh(this.geo, this.trailMat), camera: this.cam, target: () => this.hist[1 - this.idx] },
      { root: new THREE.Mesh(this.geo, this.liveMat), camera: this.cam, target: () => this.liveRT },
    ];
  }

  get texture(): THREE.Texture { return this.hist[this.idx].texture; }
  get live(): THREE.Texture { return this.liveRT.texture; }

  stamp(x: number, z: number, vx: number, vz: number, halfWidth: number, strength: number, halfLength?: number): void {
    if (this.count >= MAX_STAMPS) return;
    const spd = Math.hypot(vx, vz);
    const i = this.count++;
    this.bufA[i * 4] = x; this.bufA[i * 4 + 1] = z;
    this.bufA[i * 4 + 2] = spd > 1e-3 ? Math.atan2(vx, vz) : 0;
    this.bufA[i * 4 + 3] = halfLength ?? halfWidth * 3.1;
    this.bufB[i * 4] = halfWidth; this.bufB[i * 4 + 1] = spd; this.bufB[i * 4 + 2] = strength; this.bufB[i * 4 + 3] = 0;
  }

  /**
   * Advance the field: decay+diffuse history, add trail stamps, rebuild the live layer. PERF: the full-field decay
   * pass (the field's every texel, 5 taps) runs every other frame on the summed dt (a ~6.5 s decay and a slow
   * spread: indistinguishable); between, the trail stamps add into the current history in place.
   */
  update(renderer: THREE.WebGLRenderer, dt: number): void {
    this.decayDt += dt;
    const decayNow = (++this.frameN & 1) === 0 || this.decayDt > 0.2;
    const src = this.hist[this.idx], dst = decayNow ? this.hist[1 - this.idx] : src;
    if (decayNow) {
      const u = this.decay.material.uniforms;
      u.uPrev.value = src.texture;
      u.uDecay.value = Math.exp(-this.decayDt / 6.5);
      u.uSpread.value = Math.min(1, this.decayDt * 7);
      // The decay triangle writes every history texel (no discard/blending); initialization/live clears stay intact.
      this.decay.render(renderer, dst, false);
      this.decayDt = 0;
    }

    this.geo.instanceCount = this.count;
    if (this.count > 0) {
      this.attrA.clearUpdateRanges(); this.attrA.addUpdateRange(0, this.count * 4); this.attrA.needsUpdate = true;
      this.attrB.clearUpdateRanges(); this.attrB.addUpdateRange(0, this.count * 4); this.attrB.needsUpdate = true;
    }
    const prevTarget = renderer.getRenderTarget(), prevAuto = renderer.autoClear;
    const prevClear = renderer.getClearColor(this.prevClear), prevAlpha = renderer.getClearAlpha();
    renderer.autoClear = false;
    if (this.count > 0) {
      this.trailMat.uniforms.uDt.value = dt;
      this.mesh.material = this.trailMat;
      renderer.setRenderTarget(dst);
      renderer.render(this.scene, this.cam);
    }
    renderer.setRenderTarget(this.liveRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    if (this.count > 0) {
      this.mesh.material = this.liveMat;
      renderer.render(this.scene, this.cam);
    }
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.autoClear = prevAuto;
    renderer.setRenderTarget(prevTarget);
    if (decayNow) this.idx = 1 - this.idx;
    this.count = 0;
  }

  dispose(): void {
    for (const rt of this.hist) rt.dispose();
    this.liveRT.dispose();
    this.geo.dispose(); this.trailMat.dispose(); this.liveMat.dispose(); this.decay.dispose();
  }
}
