import * as THREE from "three";

/**
 * Fenders: woven-hemp ribbed rope bolsters a hull hangs over her side at a berth, one InstancedMesh for
 * the whole harbour. Inherits the shared `hb_kit` material (shadows, height-field AO, light pools, aerial)
 * when passed one, keeping a standalone vertex-coloured fallback for headless unit tests. Only hulls lying
 * at a berth near the camera hang them (a close-zoom read); each rides, rolls and tugs in her hull frame.
 */
const MAX = 900;

/** Sculpt a coiled, ribbed woven-hemp fender bolster with per-vertex linear hemp/tarred-collar shading (RGBA, a = 0 plain). */
function buildHempBolster(): THREE.BufferGeometry {
  const rings = 12, radial = 8, halfH = 0.34;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const cCrest = new THREE.Color("#B4986E");
  const cGroove = new THREE.Color("#6D5436");
  const cCollar = new THREE.Color("#4B3A26");
  const tmp = new THREE.Color();
  for (let i = 0; i <= rings; i++) {
    const t = i / rings; // 0 bottom .. 1 top
    const y = (t - 0.5) * 2 * halfH;
    // plump tapered rope bolster with 6 circumferential hemp ribs & cinched end collars
    const endCap = Math.sin(Math.PI * t);
    const body = Math.pow(Math.max(endCap, 0), 0.42);
    const rib = Math.sin(t * 11 * Math.PI); // alternating ridges & grooves
    const collar = t < 0.14 || t > 0.86 ? 1 : 0;
    const r = (0.045 + 0.115 * body) * (1 + (collar ? -0.14 : 0.085 * rib));
    const shade = 0.78 + 0.22 * Math.min(1, t * 1.45); // darker wet lower end
    tmp.copy(collar ? cCollar : cGroove).lerp(cCrest, collar ? 0.12 : 0.5 + 0.5 * rib).multiplyScalar(shade);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2 + (i % 2) * (Math.PI / radial); // staggered braid facets
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      col.push(tmp.r, tmp.g, tmp.b, 0);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radial; j++) {
      const j2 = (j + 1) % radial;
      const a = i * radial + j, b = i * radial + j2, c = (i + 1) * radial + j2, d = (i + 1) * radial + j;
      idx.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Fenders {
  readonly mesh: THREE.InstancedMesh;
  private readonly ownsMaterial: boolean;
  private n = 0;
  private readonly m = new THREE.Matrix4();
  private readonly local = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly tilt = new THREE.Euler();

  constructor(material?: THREE.Material) {
    const g = buildHempBolster();
    const mat = material ?? new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.88, metalness: 0 });
    this.ownsMaterial = !material;
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

  dispose(): void {
    this.mesh.geometry.dispose();
    if (this.ownsMaterial) (this.mesh.material as THREE.Material).dispose();
  }
}
