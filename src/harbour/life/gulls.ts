import * as THREE from "three";
import type { HarbourMaterials } from "../world/materials";
import { buildGeometry, chainedKitMaterial, newPartMesh, prism } from "./figure-kit";
import { rng } from "./walkways";

/**
 * GULLS — declared decorative. A few wheel over the harbour mouth and the Pharos, glide across the town,
 * and settle on chimney pots, lamp heads and pier heads. Soft flaps posed in the vertex shader (inner and
 * outer wing panels, the outer lagging), wings folded when perched. One instanced draw.
 *
 * Gulls are drawn a little larger than life (≈ 2.4 m span) so they read as birds at harbour zoom, the same
 * licence the key art took.
 */

const P_BODY = 0, P_WING_IN_L = 1, P_WING_OUT_L = 2, P_WING_IN_R = 3, P_WING_OUT_R = 4;
const SPAN_IN = 0.55, SPAN_OUT = 1.2;
/** Drawn larger than life so a gull reads as a bird, not a speck, at harbour zoom (key-art licence). */
const GULL_SCALE = 1.35;

function gullGeometry(): THREE.BufferGeometry {
  const m = newPartMesh();
  // body: a slim spindle along +z (head forward), tail wedge behind
  prism(m, 0, 0, -0.22, 0.22, 0.13, 0.13, 6, "#F2EFE8", P_BODY, 1);
  // turn the prism's y axis onto z (a rotation about x, so the winding survives): the body lies along the flight line
  for (let i = 0; i < m.pos.length; i += 3) {
    const y = m.pos[i + 1], z = m.pos[i + 2];
    m.pos[i + 1] = -z * 0.8; m.pos[i + 2] = y * 1.9;
    const ny = m.nor[i + 1], nz = m.nor[i + 2];
    m.nor[i + 1] = -nz; m.nor[i + 2] = ny;
  }
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const col = (h: string) => new THREE.Color(h);
  const push = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, hex: string, part: number) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    if (n.y < 0) { n.negate(); [b, c] = [c, b]; }
    const cc = col(hex);
    for (const v of [a, b, c]) { m.pos.push(v.x, v.y, v.z); m.nor.push(n.x, n.y, n.z); m.col.push(cc.r, cc.g, cc.b); m.part.push(part); }
  };
  // head + beak
  push(V(-0.07, 0.04, 0.4), V(0.07, 0.04, 0.4), V(0, 0.02, 0.56), "#F7F4ED", P_BODY);
  push(V(-0.02, 0.02, 0.55), V(0.02, 0.02, 0.55), V(0, 0.0, 0.66), "#E0B23A", P_BODY);
  // tail
  push(V(-0.1, 0.03, -0.38), V(0.1, 0.03, -0.38), V(0, 0.05, -0.62), "#ECE8E0", P_BODY);
  for (const s of [-1, 1]) {
    const inner = s < 0 ? P_WING_IN_L : P_WING_IN_R, outer = s < 0 ? P_WING_OUT_L : P_WING_OUT_R;
    // inner panel: root chord 0.42 → elbow chord 0.36, light grey mantle
    const r0 = V(s * 0.08, 0.06, 0.2), r1 = V(s * 0.08, 0.06, -0.22), e0 = V(s * SPAN_IN, 0.06, 0.16), e1 = V(s * SPAN_IN, 0.06, -0.2);
    push(r0, r1, e1, "#B9C0C6", inner); push(r0, e1, e0, "#B9C0C6", inner);
    // outer panel tapering to a dark tip
    const t0 = V(s * (SPAN_IN + SPAN_OUT * 0.62), 0.06, 0.06), t1 = V(s * (SPAN_IN + SPAN_OUT * 0.55), 0.06, -0.2), tip = V(s * (SPAN_IN + SPAN_OUT), 0.06, -0.12);
    push(e0, e1, t1, "#AEB6BD", outer); push(e0, t1, t0, "#AEB6BD", outer);
    push(t0, t1, tip, "#2E3237", outer);
  }
  // single-sided wings would vanish from below: duplicate wing triangles with flipped winding
  const n0 = m.pos.length / 3;
  for (let v = 0; v < n0; v += 3) {
    if (m.part[v] === P_BODY) continue;
    for (const k of [0, 2, 1]) {
      const i = (v + k) * 3;
      m.pos.push(m.pos[i], m.pos[i + 1] - 0.005, m.pos[i + 2]); m.nor.push(-m.nor[i], -m.nor[i + 1], -m.nor[i + 2]);
      m.col.push(m.col[i] * 0.85, m.col[i + 1] * 0.85, m.col[i + 2] * 0.85); m.part.push(m.part[v + k]);
    }
  }
  return buildGeometry(m);
}

const VERTEX_HEAD = /* glsl */ `
attribute float aPart;
attribute vec4 aWing;   // x flap amplitude, y phase, z fold 0..1, w flap rate
uniform float uLifeT;
vec3 gRotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z); }
vec3 gullPose(vec3 p, float dir) {
  float part = aPart;
  if (part < 0.5) return p;
  float s = (part < 2.5) ? -1.0 : 1.0;
  bool outer = part > 1.5 && part < 2.5 || part > 3.5;
  float ph = uLifeT * aWing.w + aWing.y;
  float flap = aWing.x * sin(ph);
  float fold = aWing.z;
  // inner panel rotates about the body axis; the outer one about the elbow, lagging and adding a little
  float a1 = s * (flap + 0.12 - fold * 0.1);
  float a2 = s * (aWing.x * 0.7 * sin(ph - 0.9) - 0.05);
  // folded: the span collapses along the body (wings tucked to the flanks)
  vec3 q = p;
  if (fold > 0.0) {
    float t = abs(q.x);
    q.x = mix(q.x, s * (0.12 + 0.02 * t), fold);
    q.z = mix(q.z, q.z - t * 0.42, fold);
    q.y = mix(q.y, q.y + 0.05, fold);
  }
  vec3 elbow = vec3(s * ${SPAN_IN.toFixed(2)}, 0.06, 0.0) * (1.0 - dir);
  if (outer) q = elbow + gRotZ(q - elbow, a2 * (1.0 - fold));
  vec3 root = vec3(s * 0.08, 0.06, 0.0) * (1.0 - dir);
  q = root + gRotZ(q - root, a1 * (1.0 - fold));
  return q;
}
`;

type Mode = "circle" | "transit" | "perch";
interface Gull {
  mode: Mode;
  t: number;          // seconds left in this mode
  // circle
  cx: number; cz: number; cy: number; r: number; ang: number; dir: number;
  // transit (quadratic bezier p0 → c → p1)
  p0: THREE.Vector3; c: THREE.Vector3; p1: THREE.Vector3; dur: number; u: number; next: Mode;
  perch: number;      // perch index (when perched)
  pos: THREE.Vector3; prev: THREE.Vector3;
  yaw: number; roll: number; pitch: number;
  flap: number; fold: number; rate: number; phase: number;
  r01: () => number;
  visible: boolean;
}

export interface GullSites {
  /** wheel centres (x, y, z): the mouth, the Pharos, the bay */
  circles: THREE.Vector3[];
  /** perches (top surface point) */
  perches: THREE.Vector3[];
}

export class Gulls {
  readonly mesh: THREE.InstancedMesh;
  private readonly gulls: Gull[] = [];
  private readonly wing: THREE.InstancedBufferAttribute;
  readonly uniforms = { uLifeT: { value: 0 } };
  private readonly taken: Int8Array;
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly s = new THREE.Vector3();

  constructor(private readonly sites: GullSites, mats: HarbourMaterials, n: number, seed = 31) {
    const r = rng(seed);
    this.taken = new Int8Array(sites.perches.length);
    const geo = gullGeometry();
    const wing = new Float32Array(n * 4);
    this.wing = new THREE.InstancedBufferAttribute(wing, 4);
    this.wing.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aWing", this.wing);
    for (let i = 0; i < n; i++) {
      const gr = rng(seed * 733 + i * 97);
      const g: Gull = {
        mode: "circle", t: 0, cx: 0, cz: 0, cy: 0, r: 0, ang: gr() * Math.PI * 2, dir: gr() < 0.5 ? -1 : 1,
        p0: new THREE.Vector3(), c: new THREE.Vector3(), p1: new THREE.Vector3(), dur: 1, u: 0, next: "circle",
        perch: -1, pos: new THREE.Vector3(), prev: new THREE.Vector3(), yaw: 0, roll: 0, pitch: 0,
        flap: 0, fold: 0, rate: 7 + gr() * 2, phase: gr() * 6.28, r01: gr, visible: true,
      };
      // a third start perched, the rest on the wing
      if (i % 3 === 2 && this.perchAt(g)) { g.mode = "perch"; g.t = 10 + gr() * 50; g.pos.copy(sites.perches[g.perch]); g.fold = 1; }
      else this.startCircle(g, true);
      g.prev.copy(g.pos);
      this.gulls.push(g);
    }
    void r;
    const mat = chainedKitMaterial(mats, "gull", { vertexHead: VERTEX_HEAD, vertexPose: "transformed = gullPose(transformed, 0.0);", normalPose: "objectNormal = normalize(gullPose(objectNormal, 1.0));", uniforms: this.uniforms }, THREE.FrontSide);
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.name = "life-gulls";
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
  }

  private perchAt(g: Gull): boolean {
    const P = this.sites.perches;
    if (!P.length) return false;
    for (let k = 0; k < 6; k++) {
      const i = Math.floor(g.r01() * P.length);
      if (!this.taken[i]) { this.taken[i] = 1; g.perch = i; return true; }
    }
    return false;
  }

  private startCircle(g: Gull, place: boolean): void {
    const C = this.sites.circles;
    const c = C[Math.floor(g.r01() * C.length)];
    g.cx = c.x + (g.r01() - 0.5) * 30; g.cz = c.z + (g.r01() - 0.5) * 30; g.cy = c.y + g.r01() * 16;
    g.r = 18 + g.r01() * 30;
    g.t = 18 + g.r01() * 40;
    if (place) { g.mode = "circle"; g.pos.set(g.cx + Math.cos(g.ang) * g.r, g.cy, g.cz + Math.sin(g.ang) * g.r); }
  }

  /** Fly from where the gull is to `to`, arching up, then switch to `next`. */
  private transit(g: Gull, to: THREE.Vector3, next: Mode): void {
    g.mode = "transit"; g.next = next;
    g.p0.copy(g.pos); g.p1.copy(to);
    const d = g.p0.distanceTo(g.p1);
    g.c.copy(g.p0).add(g.p1).multiplyScalar(0.5);
    g.c.y = Math.max(g.p0.y, g.p1.y) + 6 + d * 0.08;
    g.dur = Math.max(3, d / 10.5);
    g.u = 0;
  }

  private night = 0;

  /** @param night 0 day … 1 night: by night most gulls settle and stay settled */
  update(dt: number, moving: boolean, visibleShare: number, night = 0): void {
    this.night = night;
    if (moving) this.uniforms.uLifeT.value += dt;
    const w = this.wing.array as Float32Array;
    const e = this.mesh.instanceMatrix.array as Float32Array;
    const T = this.uniforms.uLifeT.value;
    for (let i = 0; i < this.gulls.length; i++) {
      const g = this.gulls[i];
      g.visible = i < Math.ceil(this.gulls.length * visibleShare);
      if (moving && g.visible) this.step(g, dt, T);
      if (!moving) {
        // reduced motion: everyone perches (the ones without a free perch rest where they are, wings folded)
        if (g.mode !== "perch") { if (g.perch < 0) this.perchAt(g); if (g.perch >= 0) { g.pos.copy(this.sites.perches[g.perch]); g.mode = "perch"; g.t = 30; } }
        g.fold = 1; g.flap = 0; g.roll = 0; g.pitch = 0;
      }
      w[i * 4] = g.flap; w[i * 4 + 1] = g.phase; w[i * 4 + 2] = g.fold; w[i * 4 + 3] = g.rate;
      const sc = g.visible ? GULL_SCALE : 0;
      this.e.set(g.pitch, g.yaw, g.roll, "YXZ");
      this.q.setFromEuler(this.e);
      this.s.set(sc, sc, sc);
      this.m4.compose(g.pos, this.q, this.s);
      this.m4.toArray(e, i * 16);
    }
    this.wing.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private step(g: Gull, dt: number, T: number): void {
    g.t -= dt;
    g.prev.copy(g.pos);
    if (g.mode === "circle") {
      const v = 8.5;
      g.ang += (g.dir * v / g.r) * dt;
      // a slow breathing of the circle and the height: thermals, not rails
      const rr = g.r * (1 + 0.12 * Math.sin(T * 0.13 + g.phase));
      g.pos.set(g.cx + Math.cos(g.ang) * rr, g.cy + 2.5 * Math.sin(T * 0.21 + g.phase), g.cz + Math.sin(g.ang) * rr);
      // mostly gliding; a few flaps now and then
      const burst = Math.max(0, Math.sin(T * 0.37 + g.phase * 3)) ** 6;
      g.flap += ((0.08 + 0.55 * burst) - g.flap) * Math.min(1, dt * 3);
      g.fold += (0 - g.fold) * Math.min(1, dt * 4);
      g.roll += ((g.dir * 0.32) - g.roll) * Math.min(1, dt * 2);
      if (g.t <= 0) {
        const roll = g.r01();
        if (roll < 0.45 + 0.45 * this.night && this.perchAt(g)) this.transit(g, this.sites.perches[g.perch], "perch");
        else if (roll < 0.75) { const from = g.pos.clone(); this.startCircle(g, false); const to = new THREE.Vector3(g.cx + Math.cos(g.ang) * g.r, g.cy, g.cz + Math.sin(g.ang) * g.r); g.pos.copy(from); this.transit(g, to, "circle"); }
        else g.t = 10 + g.r01() * 20;
      }
    } else if (g.mode === "transit") {
      g.u = Math.min(1, g.u + dt / g.dur);
      const u = g.u, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      g.pos.set(a * g.p0.x + b * g.c.x + c * g.p1.x, a * g.p0.y + b * g.c.y + c * g.p1.y, a * g.p0.z + b * g.c.z + c * g.p1.z);
      const landing = g.next === "perch" ? Math.max(0, (u - 0.8) / 0.2) : 0;
      const takeoff = Math.max(0, 1 - u / 0.15);
      g.flap += ((0.25 + 0.45 * Math.max(landing, takeoff)) - g.flap) * Math.min(1, dt * 4);
      g.fold += (0 - g.fold) * Math.min(1, dt * 5);
      g.roll *= 1 - Math.min(1, dt * 1.5);
      if (u >= 1) {
        if (g.next === "perch") { g.mode = "perch"; g.t = (25 + g.r01() * 70) * (1 + 3 * this.night); }
        else { g.mode = "circle"; g.ang = Math.atan2(g.pos.z - g.cz, g.pos.x - g.cx); }
      }
    } else {
      g.flap += (0 - g.flap) * Math.min(1, dt * 6);
      g.fold += (1 - g.fold) * Math.min(1, dt * 3);
      g.roll *= 1 - Math.min(1, dt * 4);
      g.pitch *= 1 - Math.min(1, dt * 4);
      // a perched gull turns its body now and then
      if (g.r01() < dt * 0.15) g.yaw += (g.r01() - 0.5) * 1.6;
      if (g.t <= 0) {
        if (g.perch >= 0) this.taken[g.perch] = 0;
        g.perch = -1;
        const from = g.pos.clone();
        this.startCircle(g, false);
        g.pos.copy(from);
        this.transit(g, new THREE.Vector3(g.cx + Math.cos(g.ang) * g.r, g.cy, g.cz + Math.sin(g.ang) * g.r), "circle");
      }
      return;
    }
    const dx = g.pos.x - g.prev.x, dz = g.pos.z - g.prev.z, dy = g.pos.y - g.prev.y;
    const h = Math.hypot(dx, dz);
    if (h > 1e-4) {
      const ty = Math.atan2(dx, dz);
      g.yaw += Math.atan2(Math.sin(ty - g.yaw), Math.cos(ty - g.yaw)) * Math.min(1, dt * 6);
      g.pitch += (-Math.atan2(dy, h) * 0.8 - g.pitch) * Math.min(1, dt * 3);
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
