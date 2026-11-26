import * as THREE from "three";
import type { EngineContext } from "../engine/types";
import { OCEAN_DISP_GLSL } from "../ocean/shaders/ocean-disp";

/**
 * The route as a chart line (12-M3): when a circuit boat is selected, today's rounds under the plan are
 * pencilled on the water as a navigator would — the leg she is on in brass dashes that draw on once the
 * camera has landed (fading out behind her), later legs fainter and finer, a brass tick at each port of
 * call. Data-bound: the plan's dock time per chain is the coin's supply share (D11); the panel's circuit
 * list says the same in words ("today's rounds (from supply share)"). Static single-chain hulls have no
 * route and draw nothing.
 *
 * One draw (a screen-width ribbon expanded in the vertex shader), ≤ ~4k vertices, only while selected.
 */

/** Spacing (m) of the ribbon's samples (paths are sampled finer; this is plenty for a calm curve). */
export const ROUTE_STEP_M = 4;
/** Height above mean sea level (m): above the swell's usual troughs, so the line lies on the water. */
const LIFT_M = 0.8;
/** Dash length (m) on the current leg; later legs are dotted at half that. */
const DASH_M = 9;
/** Draw-on time (s) after the glide lands. */
const DRAW_S = 0.6;
/** Re-read the itinerary this often (s): she casts off for the next leg, or the plan changes. */
const REFRESH_S = 2;
/** Faster re-read in backing-line mode so dashed arcs smoothly track sailing backed core stablecoins. */
const BACKING_REFRESH_S = 0.5;

export interface Itinerary {
  legs: Array<{ pts: Float32Array; current: boolean }>;
  ports: Array<[number, number]>;
  /** Backing-line mode (selected tokenized fund → backed core stablecoins): draw full dashed arcs with no behind-boat fade. */
  backing?: boolean;
}

/**
 * Resample a polyline (x, z interleaved) to a fixed step, keeping both ends. Pure; unit-tested.
 */
export function resample(pts: Float32Array, step: number): number[] {
  const out: number[] = [];
  const n = pts.length >> 1;
  if (n === 0) return out;
  out.push(pts[0], pts[1]);
  let carry = 0;
  for (let i = 1; i < n; i++) {
    const ax = pts[i * 2 - 2], az = pts[i * 2 - 1], bx = pts[i * 2], bz = pts[i * 2 + 1];
    const len = Math.hypot(bx - ax, bz - az);
    let d = step - carry;
    while (d <= len) { const t = d / len; out.push(ax + (bx - ax) * t, az + (bz - az) * t); d += step; }
    carry = len - (d - step);
  }
  const lx = pts[n * 2 - 2], lz = pts[n * 2 - 1];
  if (out[out.length - 2] !== lx || out[out.length - 1] !== lz) out.push(lx, lz);
  return out;
}

const VERT = /* glsl */ `
attribute vec2 aSide;
attribute vec2 aNormal;
attribute float aS;
uniform float uWidth;
uniform float uOceanOn;
uniform float uTime;
uniform vec3 uCameraPos;
uniform vec4 uSea;
uniform vec4 uSdfBounds;
uniform sampler2D uSdf;
uniform vec2 uSceneCenter;
varying float vS;
varying float vKind;
${OCEAN_DISP_GLSL}
void main() {
  vS = aS;
  vKind = aSide.y;
  float w = uWidth * (aSide.y > 1.5 ? 1.4 : aSide.y > 0.5 ? 0.7 : 1.0);
  vec3 p = position + vec3(aNormal.x, 0.0, aNormal.y) * aSide.x * w;
  if (uOceanOn > 0.5) {
    vec2 suv = (p.xz - uSdfBounds.xy) / max(uSdfBounds.zw - uSdfBounds.xy, vec2(1.0));
    float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
    float mf = smoothstep(470.0, 560.0, length(p.xz - uSceneCenter));
    vec4 sd = textureLod(uSdf, clamp(suv, 0.0, 1.0), 0.0);
    float coast = mix(200.0, (mix(sd.r, 1.0, mf) - 0.5) * 128.0, inside);
    float depth = mix(40.0, mix(sd.g, 1.0, mf) * 40.0, inside);
    float damp = smoothstep(0.0, 34.0, coast) * 0.9 + 0.1 * smoothstep(-2.0, 2.0, coast);
    float camD = length(p.xz - uCameraPos.xz);
    float amp = uSea.x * damp * (1.0 - smoothstep(2500.0, 5000.0, camD));
    vec2 sn = uFftOn > 0.5 ? hbShoreNormal(uSdf, suv, coast, inside) : vec2(0.0);
    p.y += hbOceanDisp(p.xz, uTime, amp, damp, camD, depth, coast, sn).y;
  }
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uDraw;      // drawn up to this arc length (m)
uniform float uBoatS;     // her place on the current leg (m)
uniform float uK;         // presence 0..1
uniform float uDash;
varying float vS;
varying float vKind;
void main() {
  if (vS > uDraw) discard;
  float a;
  if (vKind > 1.5) a = 0.9;                                       // port tick
  else if (vKind > 0.5) {                                         // later legs: fine dots, faint
    if (fract(vS / (uDash * 0.5)) > 0.4) discard;
    a = 0.38;
  } else {                                                        // the leg she sails: dashes, fading out behind her
    if (fract(vS / uDash) > 0.58) discard;
    a = 0.85 * smoothstep(uBoatS - 40.0, uBoatS - 4.0, vS);
  }
  a *= uK;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}`;

export class RouteLine {
  private mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> | null = null;
  private readonly mat: THREE.ShaderMaterial;
  private id: string | null = null;
  private itinerary: Itinerary | null | undefined;
  private backing = false;
  private refresh = 0;
  private total = 0;
  /** The current leg's resampled points (for her place along it). */
  private cur: number[] = [];
  private drawT = 0;
  private k = 0;

  private fallbackFft: THREE.DataArrayTexture | null = null;
  private fallbackSdf: THREE.DataTexture | null = null;

  constructor(private readonly ctx: EngineContext, private readonly read: (id: string) => Itinerary | null) {
    const oc = ctx.services?.get("ocean")?.shared;
    if (!oc) {
      const fd = new Uint8Array(6 * 4);
      for (let i = 0; i < 3; i++) fd[i * 4 + 3] = 255;
      this.fallbackFft = Object.assign(new THREE.DataArrayTexture(fd, 1, 1, 6), { needsUpdate: true });
      this.fallbackSdf = Object.assign(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1), { needsUpdate: true });
    }
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(0.72, 0.5, 0.18) }, uDraw: { value: 0 }, uBoatS: { value: 0 },
        uK: { value: 0 }, uDash: { value: DASH_M }, uWidth: { value: 0.6 },
        uOceanOn: { value: oc ? 1 : 0 },
        uTime: oc?.uTime ?? { value: 0 },
        uCameraPos: ctx.uniforms?.uCameraPos ?? { value: new THREE.Vector3() },
        uSea: oc?.uSea ?? { value: new THREE.Vector4() },
        uSdfBounds: oc?.uSdfBounds ?? { value: new THREE.Vector4(-1, -1, 1, 1) },
        uSdf: oc?.uSdf ?? { value: this.fallbackSdf },
        uSceneCenter: oc?.uSceneCenter ?? { value: new THREE.Vector2() },
        uFftAtlas: { value: null },
        uFftOn: oc?.uFftOn ?? { value: 0 },
        uFftScales: oc?.uFftScales ?? { value: new THREE.Vector4(1 / 509, 1 / 97, 1 / 17.3, 0.55) },
        uFftWeights: oc?.uFftWeights ?? { value: new THREE.Vector4(1, 1, 1, 1) },
      },
      transparent: true, depthWrite: false, depthTest: true, fog: false,
      blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    this.mat.uniforms.uFftAtlas = oc?.uFftAtlas ?? { value: this.fallbackFft };
  }

  /** Show a boat's rounds (null hides). */
  show(id: string | null): void {
    if (id === this.id) return;
    this.id = id;
    this.itinerary = undefined;
    this.refresh = 0;
    if (id !== null) this.drawT = 0;
  }

  /** Per frame. `landed`: the camera has finished its glide (the line draws on only then). */
  update(dt: number, landed: boolean, reduced: boolean, boat: [number, number] | null): void {
    const want = this.id && boat ? 1 : 0;
    this.k += (want - this.k) * (reduced ? 1 : 1 - Math.exp(-dt * 6));
    if (!want && this.k < 0.01) {
      this.k = 0;
      this.disposeMesh();
      this.backing = false;
      this.itinerary = undefined;
      return;
    }
    if (this.id && (this.refresh -= dt) <= 0) {
      this.rebuild(this.read(this.id));
      this.refresh = this.backing ? BACKING_REFRESH_S : REFRESH_S;
    }
    const m = this.mesh;
    if (!m) return;
    m.visible = true;
    if (landed || this.drawT > 0) this.drawT += dt;
    const u = this.mat.uniforms;
    u.uDraw.value = reduced || this.drawT >= DRAW_S ? this.total + 1 : this.total * (this.drawT / DRAW_S) ** 0.7;
    u.uK.value = this.k;
    u.uBoatS.value = this.backing ? -1e6 : boat ? this.placeOf(boat[0], boat[1]) : 0;
    // about 1.6 px wide at any zoom
    const cam = this.ctx.camera, h = this.ctx.renderer.domElement.clientHeight || innerHeight;
    const dist = cam.position.distanceTo(this.ctx.rig.target);
    u.uWidth.value = Math.max(0.25, (dist * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * 2 / h) * 0.8);
    const night = this.ctx.uniforms.uNight.value;
    if (this.backing) u.uColor.value.setRGB(0.8, 0.64, 0.34).multiplyScalar(1 - 0.5 * night);
    else u.uColor.value.setRGB(0.72, 0.5, 0.18).multiplyScalar(1 - 0.55 * night);
  }

  /** Her arc length on the current leg: the nearest resampled point. */
  private placeOf(x: number, z: number): number {
    const c = this.cur;
    let best = 0, bd = Infinity;
    for (let i = 0; i < c.length; i += 2) {
      const d = (c[i] - x) ** 2 + (c[i + 1] - z) ** 2;
      if (d < bd) { bd = d; best = i >> 1; }
    }
    return best * ROUTE_STEP_M;
  }

  private rebuild(it: Itinerary | null): void {
    if (it === this.itinerary) return;
    this.itinerary = it;
    this.backing = Boolean(it?.backing);
    this.disposeMesh();
    if (!it || !it.legs.length) { this.cur = []; this.total = 0; return; }
    const pos: number[] = [], side: number[] = [], nrm: number[] = [], sArr: number[] = [], idx: number[] = [];
    let s = 0, maxS = 0, v = 0;
    const quad = () => { idx.push(v - 4, v - 3, v - 2, v - 3, v - 1, v - 2); };
    it.legs.forEach((leg, li) => {
      if (this.backing) s = 0;
      const pts = resample(leg.pts, ROUTE_STEP_M);
      if (li === 0) this.cur = pts;
      const kind = leg.current ? 0 : 1;
      const n = pts.length >> 1;
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
        let tx = pts[b * 2] - pts[a * 2], tz = pts[b * 2 + 1] - pts[a * 2 + 1];
        const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        if (i > 0) s += Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
        for (const sd of [-1, 1]) {
          pos.push(pts[i * 2], LIFT_M, pts[i * 2 + 1]); side.push(sd, kind); nrm.push(-tz, tx); sArr.push(s);
        }
        v += 2;
        if (i > 0) idx.push(v - 4, v - 3, v - 2, v - 3, v - 1, v - 2);
      }
      if (s > maxS) maxS = s;
    });
    this.total = this.backing ? maxS : s;
    // port ticks: a small brass cross at each port of call (shown from the start: the stops are known)
    for (const [x, z] of it.ports) {
      for (const [dx, dz] of [[1, 0], [0, 1]] as const) {
        for (const e of [-1, 1]) for (const sd of [-1, 1]) {
          pos.push(x + dx * e * 2.2, LIFT_M + 0.05, z + dz * e * 2.2); side.push(sd, 2); nrm.push(-dz, dx); sArr.push(0);
        }
        v += 4;
        quad();
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aSide", new THREE.Float32BufferAttribute(side, 2));
    g.setAttribute("aNormal", new THREE.Float32BufferAttribute(nrm, 2));
    g.setAttribute("aS", new THREE.Float32BufferAttribute(sArr, 1));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.name = "route-line";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 61; // just after the water (60), before the transparent fleet dressing
    this.ctx.scene.add(this.mesh);
  }

  private disposeMesh(): void {
    if (!this.mesh) return;
    this.ctx.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh = null;
  }

  dispose(): void { this.disposeMesh(); this.mat.dispose(); this.fallbackFft?.dispose(); this.fallbackSdf?.dispose(); }
}
