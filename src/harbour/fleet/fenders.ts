import * as THREE from "three";

/**
 * Fenders: the small canvas-white bolsters a hull hangs over her side at a berth, one InstancedMesh for
 * the whole harbour. Only hulls lying at a berth near the camera hang them (a close-zoom read); each is
 * placed in the hull's own frame, so it rides, rolls and tugs with her.
 */
const MAX = 900;

export class Fenders {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private readonly m = new THREE.Matrix4();
  private readonly local = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly tilt = new THREE.Euler();

  constructor() {
    const g = new THREE.CapsuleGeometry(0.15, 0.42, 3, 8);
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#DDD6C4"), roughness: 0.62, metalness: 0 });
    this.mesh = new THREE.InstancedMesh(g, mat, MAX);
    this.mesh.name = "harbour-fenders";
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
  }

  begin(): void { this.n = 0; }

  /**
   * Fenders on one or both sides of a hull whose world matrix is `hull` (glTF frame: +x bow, +z
   * starboard, origin midships on the waterline; scaled). side: -1 port, 1 starboard, 0 both.
   * `deck` and `halfBeam` in the hull's own (unscaled) units; `k` 0..1 how far they are out.
   */
  add(hull: THREE.Matrix4, loa: number, halfBeam: number, deck: number, side: number, k: number, phase: number): void {
    if (k <= 0.02) return;
    for (const sd of side === 0 ? [-1, 1] : [side]) {
      for (const f of [-0.2, 0.08, 0.3]) {
        if (this.n >= MAX) return;
        // hung from the rail on its lanyard, swaying a touch; lowered as the lines go out
        const sway = 0.06 * Math.sin(phase + f * 9 + sd);
        this.tilt.set(sway, 0, sd * 0.12);
        this.q.setFromEuler(this.tilt);
        this.p.set(loa * f, deck * (0.48 + 0.3 * (1 - k)), sd * (halfBeam * (1 - 0.18 * Math.abs(f) * 2) + 0.1));
        this.local.compose(this.p, this.q, this.s.setScalar(Math.max(0.6, Math.min(1.6, loa / 10))));
        this.m.multiplyMatrices(hull, this.local);
        this.mesh.setMatrixAt(this.n++, this.m);
      }
    }
  }

  end(): void {
    this.mesh.count = this.n;
    if (this.n) {
      this.mesh.instanceMatrix.clearUpdateRanges();
      this.mesh.instanceMatrix.addUpdateRange(0, this.n * 16); // 64 bytes per active matrix
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}
