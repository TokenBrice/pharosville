import * as THREE from "three";
import type { HarbourMaterials } from "../world/materials";
import { ball, box, buildGeometry, chainedKitMaterial, newPartMesh, posedDepthMaterial, prism } from "../life/figure-kit";

/**
 * Workers — mint hands and shipwrights. Tiny figures in work clothes (leather apron, cap), one instanced draw.
 * The CPU places each (instance matrix); the vertex shader poses them: a walking gait, or a hammer swung in a
 * rhythm (shipwrights at a hull, minters at a bench). Their number and tempo carry the yard's / the mint's
 * activity; the figures themselves are decorative.
 */

const P_LEG_L = 0, P_LEG_R = 1, P_BODY = 2, P_ARM_L = 3, P_ARM_R = 4, P_HEAD = 5, P_CAP = 6, P_TOOL = 7;
const HIP = 0.86, SHOULDER = 1.38, LEG_X = 0.095, ARM_X = 0.27;

function workerGeometry(): THREE.BufferGeometry {
  const m = newPartMesh();
  for (const [s, part] of [[-1, P_LEG_L], [1, P_LEG_R]] as const) {
    const x = s * LEG_X;
    box(m, x - 0.07, 0.1, -0.075, x + 0.07, HIP + 0.02, 0.075, "#FFFFFF", part);
    box(m, x - 0.07, 0, -0.085, x + 0.07, 0.11, 0.13, "#3A2E26", part);
  }
  prism(m, 0, 0, 0.7, 1.44, 0.24, 0.2, 6, "#FFFFFF", P_BODY, 0.8);
  box(m, -0.23, 1.34, -0.12, 0.23, 1.45, 0.12, "#FFFFFF", P_BODY);
  // leather apron over the front
  box(m, -0.17, 0.62, 0.15, 0.17, 1.28, 0.2, "#6B4A30", P_BODY);
  for (const [s, part] of [[-1, P_ARM_L], [1, P_ARM_R]] as const) {
    const x = s * ARM_X;
    box(m, x - 0.055, 0.86, -0.06, x + 0.055, SHOULDER + 0.05, 0.06, "#FFFFFF", part);
  }
  ball(m, 0, 1.6, 0, 0.145, "#E0B896", P_HEAD, 1.08);
  prism(m, 0, 0, 1.68, 1.8, 0.16, 0.13, 7, "#FFFFFF", P_CAP);
  // the hammer / mallet in the right hand (hangs at rest, swung by the arm)
  box(m, ARM_X - 0.02, 0.62, -0.02, ARM_X + 0.02, 0.92, 0.02, "#7A5A3A", P_TOOL);
  box(m, ARM_X - 0.07, 0.58, -0.05, ARM_X + 0.07, 0.66, 0.05, "#4A4A4E", P_TOOL);
  return buildGeometry(m);
}

const HEAD = /* glsl */ `
attribute float aPart;
attribute vec3 aTint;
attribute vec4 aAnim;          // x phase, y gait 0..1, z hammer 0..1, w tempo (strikes / s)
uniform float uWorkT;
vec3 wkRotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }
vec3 wkPose(vec3 p, float dir) {
  float gait = aAnim.y, ham = aAnim.z;
  float ph = uWorkT * 5.4 + aAnim.x * 6.2831;
  float sw = sin(ph);
  // hammer: a quick strike, then a slow lift (sawtooth eased), offset per worker
  float hp = fract(uWorkT * aAnim.w + aAnim.x);
  float lift = hp < 0.78 ? smoothstep(0.0, 0.78, hp) : 1.0 - smoothstep(0.78, 0.9, hp);
  float stoop = ham * (0.18 + 0.06 * lift);
  vec3 piv;
  if (aPart < 1.5) {
    float s = aPart < 0.5 ? 1.0 : -1.0;
    piv = vec3(0.0, ${HIP.toFixed(2)}, 0.0) * (1.0 - dir);
    p = piv + wkRotX(p - piv, -0.5 * gait * sw * s - ham * 0.12 * s);
  } else if (aPart > 2.5 && aPart < 4.5 || aPart > 6.5) {
    bool right = aPart > 3.5;
    float a = 0.42 * gait * sw * (right ? -1.0 : 1.0);
    if (right) a = mix(a, -0.4 - 2.3 * lift, ham);           // the hammer arm: raised high, brought down
    else a = mix(a, -0.65, ham);                              // the other hand steadies the work
    piv = vec3(right ? ${ARM_X.toFixed(2)} : -${ARM_X.toFixed(2)}, ${SHOULDER.toFixed(2)}, 0.0) * (1.0 - dir);
    p = piv + wkRotX(p - piv, a);
  }
  // a stoop over the work: the upper body leans forward about the hips
  if (aPart > 1.5) { piv = vec3(0.0, ${HIP.toFixed(2)}, 0.0) * (1.0 - dir); p = piv + wkRotX(p - piv, stoop); }
  if (dir < 0.5) p.y += gait * 0.03 * (0.5 - 0.5 * cos(2.0 * ph));
  return p;
}`;

const POSE = /* glsl */ `transformed = wkPose(transformed, 0.0);`;
const NORMAL = /* glsl */ `objectNormal = normalize(wkPose(objectNormal, 1.0));`;
const COLOR = /* glsl */ `
  #ifdef USE_COLOR
  if (aPart < 1.5) vColor.rgb *= vec3(0.32, 0.3, 0.3);
  else if (aPart < 4.5) vColor.rgb *= aTint;
  else if (aPart > 5.5 && aPart < 6.5) vColor.rgb *= aTint * 0.6;
  #endif`;

const COATS = ["#E9E4DE", "#8DA0B0", "#C9B79A", "#7E8F76", "#B5A48C", "#D8CFC2", "#9B7E64"];

export interface WorkerSlot {
  /** World position of the feet and heading (layout convention: facing along (sin h, cos h)). */
  x: number; y: number; z: number; h: number;
  /** 0 standing … 1 walking. */
  gait: number;
  /** 0 … 1 hammering. */
  hammer: number;
  /** Strikes per second. */
  tempo: number;
  visible: boolean;
}

export class Workers {
  readonly mesh: THREE.InstancedMesh;
  readonly slots: WorkerSlot[];
  private readonly anim: THREE.InstancedBufferAttribute;
  private readonly u = { uWorkT: { value: 0 } };
  private t = 0;
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(mats: HarbourMaterials, count: number, seed = 3) {
    const g = workerGeometry();
    const tint = new Float32Array(count * 3), anim = new Float32Array(count * 4);
    let a = seed >>> 0;
    const r = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      c.set(COATS[Math.floor(r() * COATS.length)]);
      tint.set([c.r, c.g, c.b], i * 3);
      anim.set([r(), 0, 0, 1], i * 4);
    }
    g.setAttribute("aTint", new THREE.InstancedBufferAttribute(tint, 3));
    this.anim = new THREE.InstancedBufferAttribute(anim, 4);
    this.anim.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("aAnim", this.anim);
    const hooks = { vertexHead: HEAD, vertexPose: POSE, normalPose: NORMAL, colorPose: COLOR, uniforms: this.u };
    this.mesh = new THREE.InstancedMesh(g, chainedKitMaterial(mats, "civic_worker", hooks), count);
    this.mesh.customDepthMaterial = posedDepthMaterial("civic_worker", hooks);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.name = "civic-workers";
    this.slots = Array.from({ length: count }, () => ({ x: 0, y: 0, z: 0, h: 0, gait: 0, hammer: 0, tempo: 1, visible: false }));
    for (let i = 0; i < count; i++) this.mesh.setMatrixAt(i, this.zero);
  }

  /** Push the slots to the GPU; `moving` false holds every pose still. */
  update(dt: number, moving: boolean): void {
    if (moving) this.t += dt;
    this.u.uWorkT.value = this.t;
    const A = this.anim.array as Float32Array;
    for (let i = 0; i < this.slots.length; i++) {
      const w = this.slots[i];
      if (!w.visible) { this.mesh.setMatrixAt(i, this.zero); continue; }
      this.q.setFromAxisAngle(this.up, w.h);
      this.m4.compose(this.p.set(w.x, w.y, w.z), this.q, this.s);
      this.mesh.setMatrixAt(i, this.m4);
      A[i * 4 + 1] = w.gait; A[i * 4 + 2] = w.hammer; A[i * 4 + 3] = w.tempo;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.anim.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.customDepthMaterial?.dispose();
  }
}
