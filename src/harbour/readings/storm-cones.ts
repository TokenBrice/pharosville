import * as THREE from "three";
import type { LightsService } from "../lights/lights-service";
import { MAX_CONES } from "./bind";

/**
 * THE STORM-SIGNAL MAST: one black canvas cone per ALERT+ DEWS coin, up to five, hoisted on the
 * mast's north halyard (island.glb empties storm_mast_cone_n0..4, top → down; apex up, the
 * traditional north cone). Cones run up one after another (top slot first), come down in reverse,
 * and swing a little in the DEWS wind. Reduced motion: placed at once, no swing.
 */
const CONE_R = 0.95, CONE_H = 1.9;
const HOIST_SEC = 2.4;
const FOOT_Y = 1.2;      // stowed at the foot of the halyard (mast-local)
const LANTERN_R = 0.24;  // the night signal: a red lantern on each hoisted cone
const LANTERN_HEX = "#FF4430";
const LANTERN_OUT = 0.85;  // m from the cone axis toward the viewer

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

  /** `slots` = the five north-halyard empties, top first. `lantern` = an emissive (× uLamp) material. */
  constructor(slots: THREE.Object3D[], material: THREE.Material, lantern: THREE.Material, private readonly lights?: LightsService) {
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
  }

  setCount(n: number | null): void { this.count = Math.max(0, Math.min(this.cones.length, n ?? 0)); }

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

  dispose(): void {
    for (const m of this.cones) m.removeFromParent();
    if (this.lights) for (const id of this.lightIds) this.lights.remove(id);
    this.geometry.dispose();
    this.lanternGeo.dispose();
  }
}
