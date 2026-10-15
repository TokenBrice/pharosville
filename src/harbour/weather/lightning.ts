import * as THREE from "three";

/**
 * Lightning (DEWS Warning / Danger only): distant branching bolts on the horizon, a flash in the cloud
 * deck, a brief cold flash over the island (uLightning → the sky and the world light), and an event for
 * the audio (thunder delay ∝ distance: 343 m/s).
 *
 * Bolts are procedural polylines (midpoint displacement + a few forks) built on the CPU per strike, laid
 * out in the sky band's own angular space (th = azimuth relative to the view, e = elevation above the
 * pretend horizon, degrees) and placed on a camera-attached card just in front of the painted sky, so the
 * Pharos and the island stand in front of them (the bolt silhouettes the tower at night). One additive
 * ribbon draw with a hot core and a soft glow (the bloom does the rest), hidden between strikes.
 *
 * Photosensitivity: one main stroke plus at most one re-strike per strike (≤ 2 flashes in a second, then
 * seconds of dark), a moderate scene flash, and no lightning at all under reduced motion.
 */

export interface StrikeEvent {
  /** Distance of the strike (km). Thunder arrives `thunderDelaySec` later. */
  distanceKm: number;
  thunderDelaySec: number;
  /** 0..1 loudness / brightness (nearer = stronger). */
  intensity: number;
  /** World azimuth of the strike (rad, 0 = north/-z, +π/2 = east/+x — the sky's convention). */
  azimuth: number;
}

const MAX_SEG = 220;

interface Bolt { pts: Array<[number, number]>; width: number }

function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Midpoint-displaced polyline from a to b (degrees space), `depth` subdivisions. */
export function jagged(a: [number, number], b: [number, number], rough: number, depth: number, R: () => number): Array<[number, number]> {
  let pts: Array<[number, number]> = [a, b];
  let amp = rough;
  for (let d = 0; d < depth; d++) {
    const next: Array<[number, number]> = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const len = Math.hypot(dx, dy) || 1;
      const off = (R() - 0.5) * 2 * amp * len;
      next.push([(p[0] + q[0]) / 2 - (dy / len) * off, (p[1] + q[1]) / 2 + (dx / len) * off], q);
    }
    pts = next;
    amp *= 0.58;
  }
  return pts;
}

/** A bolt from the cloud base (top) to the horizon with a few forks; returns polylines and their widths. */
export function buildBolt(seed: number, th: number, top: number, R0?: () => number): Bolt[] {
  const R = R0 ?? rng(seed);
  const h = top;
  const end: [number, number] = [th + (R() - 0.5) * h * 0.5, -0.05];
  const main = jagged([th, top], end, 0.32, 6, R);
  const out: Bolt[] = [{ pts: main, width: 1 }];
  const forks = 2 + Math.floor(R() * 3);
  for (let f = 0; f < forks; f++) {
    const i = 2 + Math.floor(R() * (main.length * 0.6));
    const s = main[Math.min(i, main.length - 2)];
    const ang = -Math.PI / 2 + (R() < 0.5 ? -1 : 1) * (0.35 + R() * 0.6);
    const len = h * (0.18 + R() * 0.3);
    const e: [number, number] = [s[0] + Math.cos(ang) * len, Math.max(0.1, s[1] + Math.sin(ang) * len)];
    out.push({ pts: jagged(s, e, 0.35, 4, R), width: 0.45 });
  }
  // a cloud-to-cloud crawler along the base, now and then
  if (R() < 0.45) {
    const s: [number, number] = [th + (R() - 0.5) * 2, top - 0.1];
    out.push({ pts: jagged(s, [s[0] + (R() < 0.5 ? -1 : 1) * (2 + R() * 4), top - 0.2 - R() * 0.4], 0.3, 5, R), width: 0.4 });
  }
  return out;
}

const VERT = /* glsl */ `
attribute vec3 aBolt;        // th (deg), e (deg), across (-1..1)
uniform vec3 uCam;
uniform float uFwdAz, uR;
varying float vAcross;
varying float vE;
void main() {
  float u = tan(radians(aBolt.x));
  vec2 f = vec2(sin(uFwdAz), -cos(uFwdAz)), r = vec2(cos(uFwdAz), sin(uFwdAz));
  vec2 h = uCam.xz + (f + r * u) * uR;
  float y = uCam.y + uR * tan(atan(-uCam.y / uR) + radians(aBolt.y));
  vAcross = aBolt.z;
  vE = aBolt.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(h.x, y, h.y, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uBoltCol;
uniform float uBoltK;
varying float vAcross;
varying float vE;
void main() {
  float a = abs(vAcross);
  float core = exp(-a * a * 90.0);
  float glow = exp(-a * 4.5) * 0.22;
  float k = (core * 3.2 + glow) * uBoltK * smoothstep(-0.12, 0.25, vE);
  if (k < 0.002) discard;
  gl_FragColor = vec4(uBoltCol * k, 1.0);
}`;

export interface LightningFrame {
  dt: number;
  /** Strikes per minute (director). */
  rate: number;
  strikeKm: readonly [number, number];
  /** No strikes at all (reduced motion). */
  suppressed: boolean;
  camera: THREE.PerspectiveCamera;
  /** Sky card geometry from the sky service: horizon distance (m) and half field (deg) and visible band top (deg). */
  horizon: number;
  halfFovDeg: number;
  bandTopDeg: number;
  fwdAz: number;
  night: number;
}

export class Lightning {
  readonly mesh: THREE.Mesh;
  private readonly geo = new THREE.BufferGeometry();
  private readonly attr: THREE.BufferAttribute;
  private readonly mat: THREE.ShaderMaterial;
  /** Decorative within the band: each visit sees its own strikes. */
  private readonly R = rng((Date.now() & 0x7fffffff) ^ 0x7a11);
  private readonly listeners = new Set<(e: StrikeEvent) => void>();
  /** Seconds to the next strike. */
  private wait = 3;
  private age = 1e9;
  private strength = 0;
  private restrike = 0.11;
  private th = 0;
  private az = 0;
  /** Current flash (0..1): the sky and the scene read it. */
  flash = 0;
  /** Flash position on the band (deg, relative to the view at the strike). */
  flashTh = 0;
  flashE = 2;
  forced = false;

  constructor() {
    this.attr = new THREE.BufferAttribute(new Float32Array(MAX_SEG * 6 * 3), 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("aBolt", this.attr);
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      name: "hb_weather_bolt", vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        uCam: { value: new THREE.Vector3() }, uFwdAz: { value: 0 }, uR: { value: 1500 },
        uBoltCol: { value: new THREE.Color(0.78, 0.84, 1.0) }, uBoltK: { value: 0 },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 55;
    this.mesh.name = "weather-lightning";
    this.mesh.visible = false;
  }

  onStrike(cb: (e: StrikeEvent) => void): () => void { this.listeners.add(cb); return () => this.listeners.delete(cb); }

  /** Strike now (dev / tests). */
  strikeNow(): void { this.wait = 0; }

  private strike(f: LightningFrame): void {
    const R = this.R;
    const span = Math.max(4, f.halfFovDeg * 0.85);
    this.th = (R() * 2 - 1) * span;
    this.az = f.fwdAz + THREE.MathUtils.degToRad(this.th);
    const km = f.strikeKm[0] + (f.strikeKm[1] - f.strikeKm[0]) * R();
    // nearer strikes are brighter and taller (they reach higher into the visible band)
    const near = 1 - THREE.MathUtils.clamp((km - 2) / 16, 0, 1);
    this.strength = 0.45 + 0.55 * near;
    const top = Math.min(Math.max(1.6, f.bandTopDeg * (0.55 + 0.4 * near)), 9);
    this.flashTh = this.th; this.flashE = top * 0.8;
    this.restrike = R() < 0.65 ? 0.08 + R() * 0.07 : -1;
    this.build(buildBolt(0, this.th, top, R), 0.06 + 0.05 * near);
    this.age = 0;
    const ev: StrikeEvent = { distanceKm: km, thunderDelaySec: (km * 1000) / 343, intensity: this.strength, azimuth: this.az };
    for (const cb of this.listeners) cb(ev);
  }

  private build(bolts: Bolt[], halfW: number): void {
    const arr = this.attr.array as Float32Array;
    let v = 0;
    const put = (x: number, y: number, a: number) => { arr[v * 3] = x; arr[v * 3 + 1] = y; arr[v * 3 + 2] = a; v++; };
    for (const b of bolts) {
      const w = halfW * b.width * 2.6;       // ribbon half width (deg): the glow reaches this far
      for (let i = 1; i < b.pts.length && v + 6 <= MAX_SEG * 6; i++) {
        const p = b.pts[i - 1], q = b.pts[i];
        const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * w, ny = (dx / len) * w;
        const taper = 1 - (i / b.pts.length) * 0.5;
        put(p[0] - nx, p[1] - ny, -1); put(p[0] + nx, p[1] + ny, 1); put(q[0] - nx * taper, q[1] - ny * taper, -1);
        put(q[0] - nx * taper, q[1] - ny * taper, -1); put(p[0] + nx, p[1] + ny, 1); put(q[0] + nx * taper, q[1] + ny * taper, 1);
      }
    }
    this.attr.needsUpdate = true;
    this.attr.clearUpdateRanges();
    this.attr.addUpdateRange(0, v * 3);
    this.geo.setDrawRange(0, v);
  }

  update(f: LightningFrame): void {
    this.age += f.dt;
    if (!f.suppressed && (f.rate > 0.05 || this.forced)) {
      this.wait -= f.dt;
      if (this.wait <= 0) {
        this.strike(f);
        const mean = 60 / Math.max(f.rate, this.forced ? 6 : 0.05);
        // Poisson-ish spacing with a floor (never a strobe)
        this.wait = Math.max(3.5, -Math.log(1 - this.R() * 0.95) * mean);
      }
    } else if (this.wait < 2) this.wait = 2 + this.R() * 4;
    const t = this.age;
    let env = t < 0 ? 0 : Math.exp(-t / 0.07);
    if (this.restrike > 0 && t >= this.restrike) env = Math.max(env, 0.7 * Math.exp(-(t - this.restrike) / 0.08));
    const after = Math.exp(-t / 0.45) * 0.12;
    if (f.suppressed) env = 0;
    this.flash = Math.min(1, (env + after) * this.strength);
    const boltK = (env * 1.0 + after * 0.6) * this.strength;
    this.mesh.visible = boltK > 0.01 && !f.suppressed;
    const u = this.mat.uniforms;
    // a strike stays where it struck (relative to the view it was seen in)
    u.uCam.value.copy(f.camera.position);
    u.uFwdAz.value = this.az - THREE.MathUtils.degToRad(this.th);
    u.uR.value = f.horizon * 0.985;
    u.uBoltK.value = boltK * (5.0 + 3.0 * f.night);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
    this.listeners.clear();
  }
}
