import * as THREE from "three";
import type { WakeService } from "../ocean/wake";
import type { HarbourMaterials } from "../world/materials";
import { buildGeometry, chainedKitMaterial, newPartMesh, type PartMesh } from "./figure-kit";
import { rng } from "./walkways";

/**
 * DOLPHINS (09-L4) — declared decorative. Now and then (every 90–150 s, on a timer, NEVER on a data event) a pod of
 * three rolls through the harbour mouth between the Pharos and the breakwater head: each surfaces three times in
 * turn, an arching roll (back and fin, then gone), and about one pod in five has one that clears the water. Only in
 * the calm weather bands (DEWS CALM / WATCH): the honest sea has no dolphins in a storm, and an unknown reading
 * shows none. Hidden under reduced motion.
 *
 * Unmistakably animal, never a vessel (every hull on the water is a stablecoin): small, grey, no wake but a brief foam
 * ring where they break the surface (the wake service's still-hull ring).
 *
 * One instanced draw (3 instances). The whole roll is posed in the vertex shader from the pod clock; the CPU only
 * schedules the pod and mirrors the timing for the foam rings.
 */

const P_BODY = 0, P_TAIL = 1, P_RING_IN = 2, P_RING_OUT = 3;
const POD = 3;
/**
 * O7-I11 the splash ring (the decorative score, life/score.ts): when the score calls it, the next pod's lead clears
 * the water and a white ring spreads where it falls back in, thinning away. Drawn by a fourth instance of this draw
 * (the ring parts; the dolphins' instances collapse them).
 */
const RING_SEGS = 28, RING_S = 2.4;
/** seconds an armed splash waits for its pod before the call lapses */
const ARM_S = 60;
/** Drawn a little larger than life (≈ 3 m) so the roll reads at harbour zoom, the gulls' licence. */
const SCALE = 1.3;
const ROLL_D = 1.5, ROLL_GAP = 3.4, ROLLS = 3, SPEED = 5.2;
/** lateral offset (m), along-path offset (m), start delay (s) per dolphin */
const FORMATION: ReadonlyArray<readonly [number, number, number]> = [[0, 0, 0], [-3.2, -3.5, 0.55], [3.0, -6.5, 1.0]];
const EVENT_LEN = FORMATION[POD - 1][2] + ROLL_GAP * (ROLLS - 1) + ROLL_D + 0.5;
const BASE = -0.95, ROLL_A = 0.92, LEAP_A = 2.7;

function dolphinGeometry(): THREE.BufferGeometry {
  const m: PartMesh = newPartMesh();
  const back = new THREE.Color("#3A4650"), belly = new THREE.Color("#8E989E");
  const push = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, part: number) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const v of [a, b, c]) {
      const col = back.clone().lerp(belly, THREE.MathUtils.clamp(0.5 - v.y * 2.2, 0, 1));
      m.pos.push(v.x, v.y, v.z); m.nor.push(n.x, n.y, n.z); m.col.push(col.r, col.g, col.b); m.part.push(part);
    }
  };
  // a lofted spindle along +z (beak forward): rings of 6, slightly taller than wide
  const rings: Array<[number, number, number]> = [[1.3, 0.04, 0], [1.05, 0.1, 0.0], [0.82, 0.21, 0.02], [0.3, 0.27, 0.03], [-0.3, 0.24, 0.02], [-0.8, 0.13, 0.01], [-1.05, 0.06, 0.0]];
  const N = 6;
  const at = (k: number, j: number) => {
    const [z, r, dy] = rings[k];
    const a = (j / N) * Math.PI * 2;
    return new THREE.Vector3(Math.sin(a) * r * 0.82, Math.cos(a) * r + dy, z);
  };
  for (let k = 0; k < rings.length - 1; k++) {
    for (let j = 0; j < N; j++) {
      const a = at(k, j), b = at(k, j + 1), c = at(k + 1, j + 1), d = at(k + 1, j);
      push(a, d, c, P_BODY); push(a, c, b, P_BODY);
    }
  }
  const nose = new THREE.Vector3(0, 0, 1.38), tailEnd = new THREE.Vector3(0, 0, -1.1);
  for (let j = 0; j < N; j++) { push(nose, at(0, j), at(0, j + 1), P_BODY); push(tailEnd, at(rings.length - 1, j + 1), at(rings.length - 1, j), P_TAIL); }
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // dorsal fin, swept back; pectoral fins; the flukes (they beat)
  push(V(0, 0.29, 0.25), V(0, 0.62, -0.18), V(0, 0.27, -0.25), P_BODY);
  for (const s of [-1, 1]) {
    push(V(s * 0.2, -0.08, 0.55), V(s * 0.48, -0.2, 0.25), V(s * 0.2, -0.1, 0.32), P_BODY);
    push(V(0, 0, -0.95), V(s * 0.5, 0.0, -1.32), V(s * 0.12, 0.0, -1.22), P_TAIL);
  }
  // the splash ring: a flat band on the unit circle, inner and outer edges told apart by part (posed per frame)
  const white = new THREE.Color("#E8EFEE");
  const rim = (j: number, part: number) => {
    const a = (j / RING_SEGS) * Math.PI * 2;
    m.pos.push(Math.cos(a), 0, Math.sin(a)); m.nor.push(0, 1, 0); m.col.push(white.r, white.g, white.b); m.part.push(part);
  };
  for (let j = 0; j < RING_SEGS; j++) {
    rim(j, P_RING_IN); rim(j + 1, P_RING_OUT); rim(j, P_RING_OUT);
    rim(j, P_RING_IN); rim(j + 1, P_RING_IN); rim(j + 1, P_RING_OUT);
  }
  return buildGeometry(m);
}

const VERTEX_HEAD = /* glsl */ `
attribute float aPart;
attribute vec4 aDol;          // x lateral offset, y along offset, z start delay, w leaps (1 = clears the water on its 2nd roll)
uniform float uDolT;          // pod clock (s), < 0 = no pod
uniform vec4 uDolA;           // start x, z; heading unit x, z
uniform vec4 uDolB;           // speed, sea level, scale, -
uniform vec4 uDolR;           // splash ring: centre x, z, start (pod clock, s), on (1)
varying float vDolY;
vec3 dlRotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }
vec3 dlRotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }
vec3 dolPose(vec3 p, float dir) {
  // the splash ring: its parts, drawn by the ring instance only (aDol.w 2), spreading fast then slowing, thinning away
  if (aPart > 1.5 || aDol.w > 1.5) {
    float age = uDolT - uDolR.z;
    if (aPart < 1.5 || aDol.w < 1.5 || uDolR.w < 0.5 || age < 0.0 || age > ${RING_S.toFixed(2)}) return dir > 0.5 ? p : vec3(uDolA.x, -60.0, uDolA.y);
    if (dir > 0.5) return p;
    float k = age / ${RING_S.toFixed(2)};
    float r = 0.8 + 3.8 * (1.0 - (1.0 - k) * (1.0 - k));
    // foam, not a drawn circle: the band beads thick and thin round the ring and the rim wanders
    float a = atan(p.z, p.x);
    float w = 0.75 * (1.0 - k) * (0.3 + 0.7 * (0.5 + 0.5 * sin(7.0 * a + 1.3)) + 0.15 * sin(11.0 * a));
    float rr = (aPart > 2.5 ? r + w : max(0.0, r - w)) * (1.0 + 0.08 * sin(3.0 * a + 0.6) + 0.04 * sin(5.0 * a + 2.1));
    return vec3(uDolR.x + p.x * rr, uDolB.y + 0.05 + 0.12 * (1.0 - k), uDolR.y + p.z * rr);
  }
  float t = uDolT - aDol.z;
  float k = floor(t / ${ROLL_GAP.toFixed(2)});
  float u = (t - k * ${ROLL_GAP.toFixed(2)}) / ${ROLL_D.toFixed(2)};
  if (uDolT < 0.0 || t < 0.0 || k > ${(ROLLS - 1).toFixed(1)} || u > 1.0) return dir > 0.5 ? p : vec3(uDolA.x, -60.0, uDolA.y);
  float A = (aDol.w > 0.5 && abs(k - 1.0) < 0.5) ? ${LEAP_A.toFixed(2)} : ${ROLL_A.toFixed(2)};
  float pi = 3.14159265;
  // nose up as it rises, down as it dives (the arc's own slope), the flukes beating
  float pitch = atan(A * pi * cos(pi * u) / ${ROLL_D.toFixed(2)}, uDolB.x);
  vec3 q = p * (dir > 0.5 ? 1.0 : uDolB.z);
  if (aPart > 0.5) {
    vec3 piv = vec3(0.0, 0.0, -0.95 * uDolB.z) * (1.0 - dir);
    q = piv + dlRotX(q - piv, 0.35 * sin(uDolT * 7.0 + aDol.z * 3.0));
  }
  float yaw = atan(uDolA.z, uDolA.w);
  q = dlRotY(dlRotX(q, -pitch), yaw);
  if (dir > 0.5) return q;
  float s = uDolB.x * t + aDol.y;
  vec2 d = uDolA.zw, n = vec2(-d.y, d.x);
  vec2 xz = uDolA.xy + d * s + n * aDol.x;
  return vec3(xz.x, uDolB.y + ${BASE.toFixed(2)} + A * sin(pi * u), xz.y) + q;
}
`;

export interface DolphinSite {
  /** where the pod may roll: the mouth's centre (x, z) and how far from it (m) */
  x: number; z: number; r: number;
  /** open water at least this far from any coast (the ocean SDF) */
  clear?: ((x: number, z: number) => boolean) | undefined;
}

export class Dolphins {
  readonly mesh: THREE.InstancedMesh;
  readonly uniforms = {
    uDolT: { value: -1 },
    uDolA: { value: new THREE.Vector4(0, 0, 0, 1) },
    uDolB: { value: new THREE.Vector4(SPEED, 0, SCALE, 0) },
    uDolR: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
  /** seconds left for an armed splash (the score's call), 0 = none */
  private armed = 0;
  private readonly r: () => number;
  private readonly leap = new Float32Array(POD);
  private readonly dol: THREE.InstancedBufferAttribute;
  /** seconds to the next pod */
  private wait: number;
  private t = -1;

  /**
   * @param force dev `?dolphins=`: "now" = a pod every 20 s from 2 s in; a number = one pod frozen at that clock (s)
   */
  constructor(private readonly site: DolphinSite, mats: HarbourMaterials, private readonly force: string | null = null, seed = 53) {
    this.r = rng(seed);
    this.wait = force === "now" ? 2 : 40 + this.r() * 80;
    const geo = dolphinGeometry();
    const a = new Float32Array((POD + 1) * 4);
    FORMATION.forEach(([lat, along, delay], i) => { a[i * 4] = lat; a[i * 4 + 1] = along; a[i * 4 + 2] = delay; });
    a[POD * 4 + 3] = 2;                                  // the ring instance
    this.dol = new THREE.InstancedBufferAttribute(a, 4);
    geo.setAttribute("aDol", this.dol);
    const mat = chainedKitMaterial(mats, "dolphin", {
      vertexHead: VERTEX_HEAD,
      vertexPose: "transformed = dolPose(transformed, 0.0); vDolY = transformed.y - uDolB.y;",
      // the sea is drawn see-through: what is under the surface is simply not there (the roll shows back and fin only)
      fragmentHead: "varying float vDolY;",
      emissive: "if (vDolY < -0.04) discard;",
      normalPose: "objectNormal = normalize(dolPose(objectNormal, 1.0));",
      uniforms: this.uniforms,
    }, THREE.DoubleSide);
    this.mesh = new THREE.InstancedMesh(geo, mat, POD + 1);
    this.mesh.name = "life-dolphins";
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    // the pose builds world positions itself: identity instance matrices
    const id = new THREE.Matrix4();
    for (let i = 0; i <= POD; i++) this.mesh.setMatrixAt(i, id);
    this.mesh.visible = false;
  }

  /** Choose a line through the mouth in clear water (a few tries; none found = no pod this time). */
  private plan(): boolean {
    const S = this.site, A = this.uniforms.uDolA.value;
    const len = SPEED * EVENT_LEN + 8;
    for (let k = 0; k < 8; k++) {
      const ang = this.r() * Math.PI * 2, rr = Math.sqrt(this.r()) * S.r, h = this.r() * Math.PI * 2;
      const cx = S.x + Math.cos(ang) * rr, cz = S.z + Math.sin(ang) * rr;
      const dx = Math.sin(h), dz = Math.cos(h);
      const x0 = cx - dx * len / 2, z0 = cz - dz * len / 2;
      let ok = true;
      for (let s = 0; s <= len && ok; s += 6) for (const o of [-5, 0, 5]) if (S.clear && !S.clear(x0 + dx * s - dz * o, z0 + dz * s + dx * o)) ok = false;
      if (!ok) continue;
      A.set(x0, z0, dx, dz);
      // about one pod in five has one dolphin that clears the water on its second roll (the score's splash: the lead)
      const splash = this.armed > 0;
      const leaper = splash ? 0 : this.r() < 0.2 ? Math.floor(this.r() * POD) : -1;
      for (let i = 0; i < POD; i++) this.leap[i] = i === leaper ? 1 : 0;
      for (let i = 0; i < POD; i++) (this.dol.array as Float32Array)[i * 4 + 3] = this.leap[i];
      this.dol.needsUpdate = true;
      const R = this.uniforms.uDolR.value;
      R.w = 0;
      if (splash) {
        // where (and when, on the pod clock) the lead falls back in: the body crosses the surface on the way down
        this.armed = 0;
        const [lat, along, delay] = FORMATION[0];
        const uc = Math.asin(Math.min(1, -BASE / LEAP_A)) / Math.PI;
        const t = ROLL_GAP + ROLL_D * (1 - uc), s = SPEED * t + along;
        R.set(x0 + dx * s - dz * lat, z0 + dz * s + dx * lat, delay + t - 0.05, 1);
      }
      return true;
    }
    return false;
  }

  /** O7-I11: the score calls the splash: the next pod (soon) has its lead clear the water, and a white ring where it falls. */
  armSplash(): void {
    this.armed = ARM_S;
    if (this.t < 0) this.wait = Math.min(this.wait, 4);
  }

  /**
   * @param allowed calm weather (DEWS CALM / WATCH) with a reading; false = no new pod (a pod under way finishes)
   * @param moving false under reduced motion: hidden
   */
  update(dt: number, allowed: boolean, moving: boolean, seaY: number, wake?: WakeService): void {
    const U = this.uniforms;
    U.uDolB.value.y = seaY;
    const frozen = this.force !== null && this.force !== "now" && Number.isFinite(Number(this.force));
    if (!moving) { this.mesh.visible = false; this.armed = 0; if (!frozen) { this.t = -1; U.uDolT.value = -1; } return; }
    this.armed = Math.max(0, this.armed - dt);
    if (frozen) {
      // (an armed splash re-plans the frozen pod, so captures can hold the ring at an age)
      if ((this.t < 0 || this.armed > 0) && allowed && this.plan()) this.t = Number(this.force);
    } else if (this.t >= 0) {
      this.t += dt;
      if (this.t > EVENT_LEN) { this.t = -1; this.wait = this.armed > 0 ? 4 : this.force === "now" ? 20 : 80 + this.r() * 60; }
    } else {
      this.wait -= dt;
      if (this.wait <= 0) {
        if (allowed && this.plan()) this.t = 0;
        else this.wait = 15 + this.r() * 20;      // look again a little later
      }
    }
    U.uDolT.value = this.t;
    this.mesh.visible = this.t >= 0;
    if (this.t >= 0 && wake) this.rings(wake);
  }

  /** A brief foam ring where each dolphin breaks the surface and where it dives (CPU mirror of dolPose). */
  private rings(wake: WakeService): void {
    const A = this.uniforms.uDolA.value;
    for (let i = 0; i < POD; i++) {
      const [lat, along, delay] = FORMATION[i];
      const t = this.t - delay;
      if (t < 0) continue;
      const k = Math.floor(t / ROLL_GAP);
      const u = (t - k * ROLL_GAP) / ROLL_D;
      if (k >= ROLLS || u > 1) continue;
      const amp = this.leap[i] && k === 1 ? LEAP_A : ROLL_A;
      // the body is at the surface where BASE + A sin(pi u) crosses 0
      const uc = Math.asin(Math.min(1, -BASE / amp)) / Math.PI;
      if (Math.abs(u - uc) > 0.12 && Math.abs(u - (1 - uc)) > 0.12) continue;
      const s = SPEED * t + along;
      wake.stamp(A.x + A.z * s - A.w * lat, A.y + A.w * s + A.z * lat, A.z * 0.002, A.w * 0.002, 0.55 * SCALE, 0.8, 1.2 * SCALE);
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
