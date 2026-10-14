/**
 * Dev-only (`?simdebug=1`): plain instanced hull markers straight from sim.pose, so the truth layer
 * can be checked in the real runtime before (or alongside) the fleet renderer. Not art.
 */
import * as THREE from "three";
import type { HarbourSim } from "./sim";
import { PH_ANCHORED, PH_APPROACHING, PH_CASTING_OFF, PH_SAILING } from "./sim";

const LOA: Record<string, number> = { flagship: 26, large: 18, medium: 13, small: 10, boat: 7.5, skiff: 5 };

export class SimDebugMarkers {
  private mesh: THREE.InstancedMesh | null = null;
  private count = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();
  private readonly tints = [new THREE.Color("#ffb347"), new THREE.Color("#7fdcff"), new THREE.Color("#8dff9a"), new THREE.Color("#ff4040")];

  constructor(private readonly scene: THREE.Scene) {}

  update(sim: HarbourSim): void {
    const pose = sim.pose;
    const n = pose.count;
    if (!this.mesh || this.count !== n) this.rebuild(sim, n);
    const mesh = this.mesh!;
    for (let i = 0; i < n; i++) {
      const b = sim.model.boats[i];
      const loa = LOA[b.hullClass] ?? 8;
      this.e.set(0, pose.heading[i], -pose.heel[i]);
      this.q.setFromEuler(this.e);
      this.v.set(pose.position[i * 3], 0.9, pose.position[i * 3 + 2]);
      this.s.set(loa * 0.32, 1.6 + pose.sailState[i] * loa * 0.6, loa);
      this.m.compose(this.v, this.q, this.s);
      mesh.setMatrixAt(i, this.m);
      const ph = pose.phase[i];
      this.c.set(b.brandColor);
      if (ph === PH_CASTING_OFF) this.c.lerp(this.tints[0], 0.6);
      else if (ph === PH_SAILING) this.c.lerp(this.tints[1], 0.5);
      else if (ph === PH_APPROACHING) this.c.lerp(this.tints[2], 0.6);
      else if (ph === PH_ANCHORED) this.c.lerp(this.tints[3], 0.5);
      mesh.setColorAt(i, this.c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  private rebuild(_sim: HarbourSim, n: number): void {
    this.dispose();
    // a hull-ish wedge: box with the bow (+z) pinched
    const g = new THREE.BoxGeometry(1, 1, 1, 1, 1, 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      const z = pos.getZ(k), y = pos.getY(k);
      if (z > 0.49) pos.setX(k, pos.getX(k) * 0.15);
      pos.setY(k, y + 0.5);
    }
    g.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(g, mat, Math.max(1, n));
    this.mesh.frustumCulled = false;
    this.mesh.count = n;
    this.mesh.name = "sim-debug-markers";
    this.count = n;
    this.scene.add(this.mesh);
  }

  dispose(): void {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh = null;
  }
}
