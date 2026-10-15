import * as THREE from "three";
import type { LightsService } from "../lights/lights-service";
import { MAX_CONES } from "./bind";

/**
 * THE STORM SIGNAL, flown by the Storm-signal Station (its own mast; the one home of the DEWS shapes): the
 * supply-weighted DEWS band, the same reading as the weather over the bay. Black canvas shapes on the halyard at the
 * station mast's left yardarm, top → down: nothing at Calm, a cone at Watch, two cones at Alert, two cones and a drum
 * at Warning, two cones and two drums at Danger plus a red pennant streaming from the masthead. Shapes run up one after
 * another (top slot first), come down in reverse and swing a little in the DEWS wind; each carries a red lantern at
 * night. Reduced motion: placed at once, no swing, no flutter.
 */
type Shape = "cone" | "drum";
/** The signal from the top: the first `level` shapes are hoisted. */
const SHAPES: readonly Shape[] = ["cone", "cone", "drum", "drum"];
const CONE_R = 1.5, CONE_H = 2.9;
const DRUM_R = 1.12, DRUM_H = 2.4;
const HOIST_SEC = 2.4;
const LANTERN_R = 0.34;  // the night signal: a red lantern on each hoisted shape
const LANTERN_HEX = "#FF4430";
const PENNANT_L = 7.5, PENNANT_H = 2.0, PENNANT_SEG = 14;

/** Where the station's rig puts the signal (plot frame, metres): halyard slot centres top first, the stowed foot, the masthead. */
export interface SignalRig { slots: ReadonlyArray<readonly [number, number, number]>; foot: readonly [number, number, number]; masthead: readonly [number, number, number] }

function shapeGeometry(kind: Shape): THREE.BufferGeometry {
  const g = kind === "cone" ? new THREE.ConeGeometry(CONE_R, CONE_H, 24, 1, false) : new THREE.CylinderGeometry(DRUM_R, DRUM_R, DRUM_H, 24, 1, false);
  const h = kind === "cone" ? CONE_H : DRUM_H;
  // woven wicker (PLAN Q5): weathered willow, darker toward the foot, kit pattern 1 (boards: the weave) in COLOR_0.a;
  // a drum's top hoop is a lighter bound rim
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const y = g.attributes.position.getY(i);
    const ny = g.attributes.normal.getY(i);
    const k = kind === "drum" && ny > 0.9 ? 1.25 : 0.7 + 0.3 * (y / h + 0.5);
    col.set([0.42 * k, 0.25 * k, 0.1 * k, 1 / 16], i * 4);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 4));
  return g;
}

/** Static per-shape vertex data: rest positions, normals, colours and indices (re-posed into the one draw each frame). */
interface ShapeData { pos: Float32Array; nrm: Float32Array; col: Float32Array; idx: ArrayLike<number> }

function shapeData(kind: Shape): ShapeData {
  const g = shapeGeometry(kind);
  const d = {
    pos: (g.attributes.position.array as Float32Array).slice(), nrm: (g.attributes.normal.array as Float32Array).slice(),
    col: (g.attributes.color.array as Float32Array).slice(), idx: Array.from(g.index!.array),
  };
  g.dispose();
  return d;
}

/**
 * ONE draw for the canvas (every hoisted shape and the pennant, re-posed on the CPU into a single dynamic kit
 * geometry: a few hundred vertices) and ONE instanced draw for the night lanterns.
 */
export class StormCones {
  private readonly shapes: ShapeData[] = [];
  /** Per shape: its first vertex in the merged geometry. */
  private readonly base: number[] = [];
  private readonly slotX: number[] = [];
  private readonly slotY: number[] = [];
  private readonly slotZ: number[] = [];
  /** Per shape: the lantern's distance from the axis toward the viewer (just proud of the canvas at mid-height). */
  private readonly lampOut: number[] = [];
  private readonly p = new Float32Array(MAX_CONES);
  private count = 0;
  private readonly footY: number;
  private readonly mastheadY: number;
  private readonly masthead: readonly [number, number, number];
  private readonly penBase: number;
  private readonly geo = new THREE.BufferGeometry();
  private readonly canvas: THREE.Mesh;
  private readonly lanterns: THREE.InstancedMesh;
  private readonly lanternGeo = new THREE.SphereGeometry(LANTERN_R, 12, 8);
  private readonly lightIds: number[] = [];
  private readonly tmp = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly n = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
  private readonly e = new THREE.Euler();
  private pennantUp = false;
  private pennantP = 0;
  private readonly qTmp = new THREE.Quaternion();
  private readonly qPar = new THREE.Quaternion();
  private readonly eTmp = new THREE.Euler();

  /**
   * `parent` = the station plot root (the rig's frame). `lantern` = an emissive (× uLamp) material.
   * `downwind` = heading the wind blows toward (layout convention: along (sin h, cos h)).
   */
  constructor(private readonly parent: THREE.Object3D, rig: SignalRig, material: THREE.Material, lantern: THREE.Material,
    private readonly lights?: LightsService, private readonly downwind = 2.14) {
    this.footY = rig.foot[1];
    this.mastheadY = rig.masthead[1];
    this.masthead = rig.masthead;
    const kinds = new Map<Shape, ShapeData>();
    let verts = 0;
    const idx: number[] = [];
    rig.slots.slice(0, MAX_CONES).forEach((slot, i) => {
      const kind = SHAPES[i] ?? "cone";
      let d = kinds.get(kind);
      if (!d) kinds.set(kind, d = shapeData(kind));
      this.shapes.push(d);
      this.base.push(verts);
      for (let k = 0; k < d.idx.length; k++) idx.push(d.idx[k] + verts);
      verts += d.pos.length / 3;
      this.slotX.push(slot[0]); this.slotY.push(slot[1]); this.slotZ.push(slot[2]);
      this.lampOut.push((kind === "cone" ? CONE_R * 0.5 : DRUM_R) + 0.2);
      if (lights) {
        const id = lights.add("riding", [0, -100, 0], LANTERN_HEX);
        lights.setOn(id, false);
        this.lightIds.push(id);
      }
    });
    // the pennant: a long red ribbon, two vertices per station (double-sided kit, plain pattern)
    this.penBase = verts;
    const n = PENNANT_SEG + 1;
    for (let i = 0; i < PENNANT_SEG; i++) {
      const a = verts + i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    verts += n * 2;
    const col = new Float32Array(verts * 4);
    this.shapes.forEach((d, i) => col.set(d.col, this.base[i] * 4));
    const red = new THREE.Color("#C8231B");
    for (let i = 0; i < n * 2; i++) col.set([red.r, red.g, red.b, 0], (this.penBase + i) * 4);
    const pos = new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const nrm = new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("position", pos);
    this.geo.setAttribute("normal", nrm);
    this.geo.setAttribute("color", new THREE.BufferAttribute(col, 4));
    this.geo.setIndex(idx);
    this.canvas = new THREE.Mesh(this.geo, material);
    this.canvas.name = "storm_signal";
    this.canvas.castShadow = true;
    this.canvas.receiveShadow = true;
    this.canvas.frustumCulled = false;
    this.canvas.visible = false;
    parent.add(this.canvas);
    this.lanterns = new THREE.InstancedMesh(this.lanternGeo, lantern, Math.max(1, this.shapes.length));
    this.lanterns.name = "storm_signal_lanterns";
    this.lanterns.frustumCulled = false;
    this.lanterns.count = 0;
    this.lanterns.visible = false;
    parent.add(this.lanterns);
  }

  setCount(n: number | null, pennant = false): void {
    this.count = Math.max(0, Math.min(this.shapes.length, n ?? 0));
    this.pennantUp = pennant;
  }

  update(dt: number, time: number, wind: number, reduced: boolean, camera: THREE.Vector3): void {
    const step = dt / HOIST_SEC;
    const n = this.shapes.length;
    for (let i = 0; i < n; i++) {
      const up = i < this.count;
      if (reduced) { this.p[i] = up ? 1 : 0; continue; }
      if (up) {
        // the next cone follows once the one above is a third of the way up
        if (i === 0 || this.p[i - 1] > 0.35) this.p[i] = Math.min(1, this.p[i] + step);
      } else if (i === n - 1 || this.p[i + 1] < 0.65) {
        this.p[i] = Math.max(0, this.p[i] - step);
      }
    }
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const nrm = this.geo.attributes.normal as THREE.BufferAttribute;
    const P = pos.array as Float32Array, N = nrm.array as Float32Array;
    this.parent.updateMatrixWorld();
    let any = false, lamps = 0;
    for (let i = 0; i < n; i++) {
      const p = this.p[i], d = this.shapes[i], b0 = this.base[i] * 3;
      const shown = p > 0.002;
      if (!shown) {
        // stowed: collapse to a point (degenerate triangles draw nothing)
        P.fill(0, b0, b0 + d.pos.length);
        if (this.lights) this.lights.setOn(this.lightIds[i], false);
        continue;
      }
      any = true;
      const e = p * p * (3 - 2 * p);
      const y = this.footY + (this.slotY[i] - this.footY) * e;
      // a hoisted cone swings on its halyard; harder in a stronger (DEWS) wind
      const sw = reduced ? 0 : (0.03 + 0.09 * wind) * e;
      this.m.makeRotationFromEuler(this.e.set(Math.sin(time * 1.3 + i * 1.7) * sw, 0, Math.sin(time * 0.9 + i * 2.3) * sw * 0.7));
      this.m.setPosition(this.slotX[i], y, this.slotZ[i]);
      const me = this.m.elements;
      for (let k = 0; k < d.pos.length; k += 3) {
        const x = d.pos[k], yy = d.pos[k + 1], z = d.pos[k + 2];
        P[b0 + k] = me[0] * x + me[4] * yy + me[8] * z + me[12];
        P[b0 + k + 1] = me[1] * x + me[5] * yy + me[9] * z + me[13];
        P[b0 + k + 2] = me[2] * x + me[6] * yy + me[10] * z + me[14];
        const nx = d.nrm[k], ny = d.nrm[k + 1], nz = d.nrm[k + 2];
        N[b0 + k] = me[0] * nx + me[4] * ny + me[8] * nz;
        N[b0 + k + 1] = me[1] * nx + me[5] * ny + me[9] * nz;
        N[b0 + k + 2] = me[2] * nx + me[6] * ny + me[10] * nz;
      }
      // each lantern hangs on the viewer's side of its cone at mid-height: from the 3/4 view the cone
      // above would hide a lantern at the apex. The bloomed glow (lights service) rides with it.
      const w = this.parent.localToWorld(this.tmp.set(this.slotX[i], y, this.slotZ[i]));
      const dx = camera.x - w.x, dz = camera.z - w.z, dd = Math.hypot(dx, dz) || 1;
      const out = this.lampOut[i];
      w.set(w.x + (dx / dd) * out, w.y - 0.15, w.z + (dz / dd) * out);
      if (this.lights) { this.lights.setPosition(this.lightIds[i], w); this.lights.setOn(this.lightIds[i], true); }
      this.lanterns.setMatrixAt(lamps++, this.m.makeTranslation(this.parent.worldToLocal(w)));
    }
    if (this.updatePennant(dt, time, wind, reduced, camera, P, N)) any = true;
    pos.needsUpdate = true;
    nrm.needsUpdate = true;
    this.canvas.visible = any;
    this.lanterns.count = lamps;
    this.lanterns.visible = lamps > 0;
    if (lamps > 0) this.lanterns.instanceMatrix.needsUpdate = true;
  }

  private updatePennant(dt: number, time: number, wind: number, reduced: boolean, camera: THREE.Vector3, P: Float32Array, N: Float32Array): boolean {
    const n = this.shapes.length;
    const b0 = this.penBase * 3, len = (PENNANT_SEG + 1) * 6;
    // hoisted after the last cone is up; lowered first
    const ready = n === 0 || this.p[n - 1] > 0.6;
    const goal = this.pennantUp && ready ? 1 : 0;
    this.pennantP = reduced ? goal : goal > this.pennantP ? Math.min(1, this.pennantP + dt / HOIST_SEC) : Math.max(0, this.pennantP - dt / HOIST_SEC);
    const p = this.pennantP;
    if (p <= 0.002) { P.fill(0, b0, b0 + len); return false; }
    const e = p * p * (3 - 2 * p);
    const py = this.footY + (this.mastheadY - this.footY) * e;
    // stream downwind, turned a little toward the viewer so the cloth shows a face (as the house flags)
    const w = this.parent.localToWorld(this.tmp.set(this.masthead[0], py, this.masthead[2]));
    const toCam = Math.atan2(camera.x - w.x, camera.z - w.z);
    const side = Math.sin(toCam - this.downwind);
    const yaw = this.downwind - Math.PI / 2 + 0.45 * Math.sign(side) * (1 - Math.abs(side));
    this.qTmp.setFromEuler(this.eTmp.set(0, yaw, 0, "YXZ"));
    this.parent.getWorldQuaternion(this.qPar).invert();
    this.m.makeRotationFromQuaternion(this.qPar.multiply(this.qTmp)).setPosition(this.masthead[0], py, this.masthead[2]);
    // flutter: a travelling wave down the fly, harder and faster in the wind; the tip droops in a lull
    const amp = reduced ? 0 : 0.25 + 0.55 * wind;
    const k = 1.25, om = 5 + 6 * wind;
    const droop = (1 - wind) * 0.9;
    const at = (t: number, out: THREE.Vector3) => {
      const x = t * PENNANT_L * (0.96 + 0.04 * wind);
      const z = Math.sin(k * x - om * time) * amp * t + Math.sin(2.3 * x - om * 1.7 * time) * amp * 0.25 * t;
      return out.set(x, -droop * t * t * 1.4, z);
    };
    for (let i = 0; i <= PENNANT_SEG; i++) {
      const t = i / PENNANT_SEG;
      const hh = (1 - t) * PENNANT_H * 0.5;
      // the cloth's normal: across the fly tangent and the hoist (y)
      const t0 = Math.max(0, t - 0.5 / PENNANT_SEG), t1 = Math.min(1, t + 0.5 / PENNANT_SEG);
      const tan = at(t1, this.n).sub(at(t0, this.v));
      this.n.set(-tan.z, 0, tan.x).normalize().transformDirection(this.m);
      const c = at(t, this.v);
      for (let r = 0; r < 2; r++) {
        this.tmp.set(c.x, c.y + (r === 0 ? hh : -hh), c.z).applyMatrix4(this.m);
        const o = b0 + (i * 2 + r) * 3;
        P[o] = this.tmp.x; P[o + 1] = this.tmp.y; P[o + 2] = this.tmp.z;
        N[o] = this.n.x; N[o + 1] = this.n.y; N[o + 2] = this.n.z;
      }
    }
    return true;
  }

  dispose(): void {
    this.canvas.removeFromParent();
    this.lanterns.removeFromParent();
    this.lanterns.dispose();
    if (this.lights) for (const id of this.lightIds) this.lights.remove(id);
    this.geo.dispose();
    this.lanternGeo.dispose();
  }
}
