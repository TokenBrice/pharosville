import * as THREE from "three";
import type { LightsService } from "../lights/lights-service";
import { MAX_CONES } from "./bind";

/**
 * THE STORM-SIGNAL MAST: the supply-weighted DEWS band, the same reading as the weather over the bay:
 * no cone at Calm, one at Watch, two at Alert, three at Warning, four at Danger plus a red pennant
 * streaming from the masthead. Cones hang on the mast's north halyard (island.glb empties
 * storm_mast_cone_n0..3, top → down; apex up, the traditional north cone), run up one after another
 * (top slot first), come down in reverse, and swing a little in the DEWS wind; the pennant follows the
 * last cone up and flies harder in a stronger wind. Reduced motion: placed at once, no swing, no flutter.
 */
const CONE_R = 0.95, CONE_H = 1.9;
const HOIST_SEC = 2.4;
const FOOT_Y = 1.2;      // stowed at the foot of the halyard (mast-local)
const LANTERN_R = 0.24;  // the night signal: a red lantern on each hoisted cone
const LANTERN_HEX = "#FF4430";
const LANTERN_OUT = 0.85;  // m from the cone axis toward the viewer
const PENNANT_Y = 23.9;    // masthead (mast-local), just under the truck
const PENNANT_L = 7.0, PENNANT_H = 1.9, PENNANT_SEG = 14;

function coneGeometry(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(CONE_R, CONE_H, 24, 1, false);
  // tarred canvas: near-black, a touch warm, kit pattern 0 (plain) in COLOR_0.a
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const y = g.attributes.position.getY(i);
    const k = 0.016 + 0.01 * (y / CONE_H + 0.5);
    col.set([k * 1.05, k, k * 0.92, 0], i * 4);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 4));
  return g;
}

/** A long red triangle: fly along +x, hoist along y, two rows of vertices per station. */
function pennantGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const n = PENNANT_SEG + 1;
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
  const idx: number[] = [];
  for (let i = 0; i < PENNANT_SEG; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  g.setIndex(idx);
  return g;
}

export class StormCones {
  private readonly cones: THREE.Mesh[] = [];
  private readonly slotY: number[] = [];
  private readonly p = new Float32Array(MAX_CONES);
  private count = 0;
  private readonly geometry = coneGeometry();
  private readonly lanternGeo = new THREE.SphereGeometry(LANTERN_R, 12, 8);
  private readonly lamps: THREE.Mesh[] = [];
  private readonly lightIds: number[] = [];
  private readonly tmp = new THREE.Vector3();
  private pennantUp = false;
  private pennantP = 0;
  private readonly pennant: THREE.Mesh | null = null;
  private readonly pennantMat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#C8231B"), roughness: 0.75, side: THREE.DoubleSide });
  private readonly qTmp = new THREE.Quaternion();
  private readonly qPar = new THREE.Quaternion();
  private readonly eTmp = new THREE.Euler();

  /**
   * `slots` = the north-halyard empties, top first. `lantern` = an emissive (× uLamp) material.
   * `downwind` = heading the wind blows toward (layout convention: along (sin h, cos h)).
   */
  constructor(slots: THREE.Object3D[], material: THREE.Material, lantern: THREE.Material, private readonly lights?: LightsService,
    private readonly downwind = 2.14) {
    slots.slice(0, MAX_CONES).forEach((slot, i) => {
      const m = new THREE.Mesh(this.geometry, material);
      m.name = `storm_cone_${i}`;
      m.castShadow = true;
      m.receiveShadow = true;
      m.visible = false;
      slot.parent!.add(m);
      m.position.set(slot.position.x, FOOT_Y, slot.position.z);
      const lamp = new THREE.Mesh(this.lanternGeo, lantern);
      m.add(lamp);
      this.lamps.push(lamp);
      if (lights) {
        const id = lights.add("riding", [0, -100, 0], LANTERN_HEX);
        lights.setOn(id, false);
        this.lightIds.push(id);
      }
      this.slotY.push(slot.position.y);
      this.cones.push(m);
    });
    const mast = slots[0]?.parent;
    if (mast) {
      const p = new THREE.Mesh(pennantGeometry(), this.pennantMat);
      p.name = "storm_pennant";
      p.castShadow = true;
      p.frustumCulled = false;
      p.visible = false;
      p.position.set(0, FOOT_Y, 0);
      mast.add(p);
      this.pennant = p;
    }
  }

  setCount(n: number | null, pennant = false): void {
    this.count = Math.max(0, Math.min(this.cones.length, n ?? 0));
    this.pennantUp = pennant;
  }

  update(dt: number, time: number, wind: number, reduced: boolean, camera: THREE.Vector3): void {
    const step = dt / HOIST_SEC;
    const n = this.cones.length;
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
    for (let i = 0; i < n; i++) {
      const m = this.cones[i], p = this.p[i];
      m.visible = p > 0.002;
      if (!m.visible) continue;
      const e = p * p * (3 - 2 * p);
      m.position.y = FOOT_Y + (this.slotY[i] - FOOT_Y) * e;
      // a hoisted cone swings on its halyard; harder in a stronger (DEWS) wind
      const sw = reduced ? 0 : (0.03 + 0.09 * wind) * e;
      m.rotation.set(Math.sin(time * 1.3 + i * 1.7) * sw, 0, Math.sin(time * 0.9 + i * 2.3) * sw * 0.7);
    }
    this.updatePennant(dt, time, wind, reduced, camera);
    // each lantern hangs on the viewer's side of its cone at mid-height: from the 3/4 view the cone
    // above would hide a lantern at the apex. The bloomed glow (lights service) rides with it.
    for (let i = 0; i < n; i++) {
      const cone = this.cones[i];
      if (cone.visible) {
        cone.updateMatrixWorld(true);
        const w = cone.getWorldPosition(this.tmp);
        const dx = camera.x - w.x, dz = camera.z - w.z, d = Math.hypot(dx, dz) || 1;
        w.set(w.x + (dx / d) * LANTERN_OUT, w.y - 0.15, w.z + (dz / d) * LANTERN_OUT);
        if (this.lights) this.lights.setPosition(this.lightIds[i], w);
        this.lamps[i].position.copy(cone.worldToLocal(w));
      }
      if (this.lights) this.lights.setOn(this.lightIds[i], cone.visible);
    }
  }

  private updatePennant(dt: number, time: number, wind: number, reduced: boolean, camera: THREE.Vector3): void {
    const pen = this.pennant;
    if (!pen) return;
    const n = this.cones.length;
    // hoisted after the last cone is up; lowered first
    const ready = n === 0 || this.p[n - 1] > 0.6;
    const goal = this.pennantUp && ready ? 1 : 0;
    this.pennantP = reduced ? goal : goal > this.pennantP ? Math.min(1, this.pennantP + dt / HOIST_SEC) : Math.max(0, this.pennantP - dt / HOIST_SEC);
    const p = this.pennantP;
    pen.visible = p > 0.002;
    if (!pen.visible) return;
    const e = p * p * (3 - 2 * p);
    pen.position.y = FOOT_Y + (PENNANT_Y - FOOT_Y) * e;
    // stream downwind, turned a little toward the viewer so the cloth shows a face (as the house flags)
    const mast = pen.parent!;
    mast.updateMatrixWorld();
    const w = pen.getWorldPosition(this.tmp);
    const toCam = Math.atan2(camera.x - w.x, camera.z - w.z);
    const side = Math.sin(toCam - this.downwind);
    const yaw = this.downwind - Math.PI / 2 + 0.45 * Math.sign(side) * (1 - Math.abs(side));
    this.qTmp.setFromEuler(this.eTmp.set(0, yaw, 0, "YXZ"));
    mast.getWorldQuaternion(this.qPar).invert();
    pen.quaternion.copy(this.qPar.multiply(this.qTmp));
    // flutter: a travelling wave down the fly, harder and faster in the wind; the tip droops in a lull
    const pos = pen.geometry.attributes.position as THREE.BufferAttribute;
    const amp = reduced ? 0 : 0.25 + 0.55 * wind;
    const k = 1.25, om = 5 + 6 * wind;
    const droop = (1 - wind) * 0.9;
    for (let i = 0; i <= PENNANT_SEG; i++) {
      const t = i / PENNANT_SEG;
      const x = t * PENNANT_L * (0.96 + 0.04 * wind);
      const hh = (1 - t) * PENNANT_H * 0.5;
      const z = Math.sin(k * x - om * time) * amp * t + Math.sin(2.3 * x - om * 1.7 * time) * amp * 0.25 * t;
      const y = -droop * t * t * 1.4;
      pos.setXYZ(i * 2, x, y + hh, z);
      pos.setXYZ(i * 2 + 1, x, y - hh, z);
    }
    pos.needsUpdate = true;
    pen.geometry.computeVertexNormals();
  }

  dispose(): void {
    this.pennant?.removeFromParent();
    this.pennant?.geometry.dispose();
    this.pennantMat.dispose();
    for (const m of this.cones) m.removeFromParent();
    if (this.lights) for (const id of this.lightIds) this.lights.remove(id);
    this.geometry.dispose();
    this.lanternGeo.dispose();
  }
}
