import * as THREE from "three";

/**
 * DA-07 maiden bunting: a hull "dressed overall" — a line of small signal flags from the stem up to the masthead
 * and down to the stern, in her brand colour alternating with cream. Flown by:
 *   - every coin in readings.maidens (new to the register this week: no supply on record a week or a month ago,
 *     model/readings.ts isMaiden — strict, and dormant while the producer leaves week-ago gaps), and
 *   - a coin launched during the visit (the sim's "launch" event, or the staged launch moment), for her first
 *     circuit: until she first berths again (the sim's "docking"), at most LAUNCH_DRESS_MS.
 * A launch's dressing runs up the line from the bow over DRESS_SEC (the "short dressing"); maidens present on the
 * first reading and everything under reduced motion are simply dressed. ONE draw: re-posed on the CPU into one
 * dynamic kit-material geometry (≤ MAX_DRESSED hulls).
 */
export const MAX_DRESSED = 16;
const FLAGS_PER_LEG = 16; // REVIEW #7: dense enough to read as a dressed line at the heart view
const FLAGS = FLAGS_PER_LEG * 2;
/** Launch dressing: the flags run up over this long, and come down again by her first berth or this long. */
const DRESS_SEC = 3.5;
export const LAUNCH_DRESS_MS = 20 * 60_000;
const CREAM = new THREE.Color("#FBF4E4");
/** A dark brand is lifted toward white until its luma reaches this (linear): dyed bunting reads against hull and sea. */
const MIN_LUMA = 0.2;
/** Flag drop never below this many px on screen (it grows with distance, capped at MAX_LOA_K × LOA), like the flag law. */
export const BUNTING_MIN_PX = 4;
const MAX_LOA_K = 0.09;

/** Flag edge (m) for a hull of length `loa`, `pxPerM` screen px per metre at the hull. */
export function buntingFlagSize(loa: number, pxPerM = Infinity): number {
  const base = THREE.MathUtils.clamp(loa * 0.05, 0.45, 1.3);
  return Math.max(base, Math.min(BUNTING_MIN_PX / pxPerM, loa * MAX_LOA_K));
}

interface Dress { p: number; up: boolean; slot: number }

export class Bunting {
  readonly mesh: THREE.Mesh;
  private readonly geo = new THREE.BufferGeometry();
  private readonly dressed = new Map<string, Dress>();
  /** Launch-dressed coins (sim launch / launch moment) → wall-clock ms the dressing ends at the latest. */
  private readonly launched = new Map<string, number>();
  private maidens: readonly string[] = [];
  private primed = false;
  private readonly freeSlots: number[] = [];
  private readonly drawn = new Set<number>();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly t = new THREE.Vector3();
  private readonly n = new THREE.Vector3();
  private readonly col = new THREE.Color();
  private readonly dye = new THREE.Color();
  private readonly cam = new THREE.Vector3();

  constructor(material: THREE.Material) {
    // per flag: a triangle (3 verts) hanging under the line; both faces (the kit material is double-sided)
    const verts = MAX_DRESSED * FLAGS * 3;
    this.geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(verts * 4), 4).setUsage(THREE.DynamicDrawUsage));
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.name = "harbour-bunting";
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.visible = false;
    for (let i = MAX_DRESSED - 1; i >= 0; i--) this.freeSlots.push(i);
  }

  /** A coin launched in this visit: dressed (running up from the bow) until her first berth. */
  launch(id: string, nowMs: number): void {
    if (!this.launched.has(id)) this.launched.set(id, nowMs + LAUNCH_DRESS_MS);
  }

  /** Her first circuit is done (she berthed): the launch dressing comes down (a maiden keeps hers). */
  berthed(id: string): void { this.launched.delete(id); }

  isDressed(id: string): boolean { return (this.dressed.get(id)?.up ?? false); }

  /** Once a frame before the hulls (once the readings are in): the maidens, the launch book, the dressing clock. */
  sync(maidens: readonly string[], nowMs: number, dt: number, reduced: boolean, camera: THREE.Vector3): void {
    this.maidens = maidens;
    this.cam.copy(camera);
    for (const [id, until] of this.launched) if (nowMs > until) this.launched.delete(id);
    const want = new Set<string>(this.maidens);
    for (const id of this.launched.keys()) want.add(id);
    for (const [id, d] of this.dressed) d.up = want.has(id);
    for (const id of want) {
      if (this.dressed.has(id) || !this.freeSlots.length) continue;
      // a maiden on the first reading is simply dressed; a launch (and a later maiden) runs its flags up
      const instant = !this.primed && !this.launched.has(id);
      this.dressed.set(id, { p: instant ? 1 : 0, up: true, slot: this.freeSlots.pop()! });
    }
    this.primed = true;
    const step = dt / DRESS_SEC;
    for (const [id, d] of this.dressed) {
      d.p = reduced ? (d.up ? 1 : 0) : d.up ? Math.min(1, d.p + step) : Math.max(0, d.p - step);
      if (!d.up && d.p <= 0) { this.freeSlots.push(d.slot); this.dressed.delete(id); }
    }
    this.drawn.clear();
  }

  /**
   * One posed hull: `m` = her world matrix (kit frame); bow, masthead and stern anchors in the kit frame.
   * `brand` linear; `time` the fleet's decorative clock (still under reduced motion); `wind` 0..1.
   */
  hull(id: string, m: THREE.Matrix4, bow: THREE.Vector3, mast: THREE.Vector3, stern: THREE.Vector3, loa: number, brand: THREE.Color, time: number, wind: number,
    pxPerM = Infinity): boolean {
    const d = this.dressed.get(id);
    if (!d || d.p <= 0.002) return false;
    const P = (this.geo.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const N = (this.geo.attributes.normal as THREE.BufferAttribute).array as Float32Array;
    const C = (this.geo.attributes.color as THREE.BufferAttribute).array as Float32Array;
    const e = m.elements;
    this.up.set(e[4], e[5], e[6]).normalize();
    // the stem head and the taffrail sit a little above the cleats
    const bowW = this.a.copy(bow).applyMatrix4(m).addScaledVector(this.up, 0.5);
    const mastW = this.b.copy(mast).applyMatrix4(m);
    const sternW = this.c.copy(stern).applyMatrix4(m).addScaledVector(this.up, 0.7);
    const f = buntingFlagSize(loa, pxPerM);
    // her colour, lifted when dark (luma below MIN_LUMA) so the line reads; never past the dye (no glow)
    const luma = 0.2126 * brand.r + 0.7152 * brand.g + 0.0722 * brand.b;
    const dye = this.dye.copy(brand).lerp(CREAM, luma < MIN_LUMA ? (MIN_LUMA - luma) / Math.max(1e-3, 0.9 - luma) : 0);
    const shown = d.p * FLAGS; // flags run up from the bow, along the line to the stern
    const sway = 0.18 + 0.35 * wind;
    let v = d.slot * FLAGS * 3;
    for (let leg = 0; leg < 2; leg++) {
      const A = leg === 0 ? bowW : mastW, B = leg === 0 ? mastW : sternW;
      const len = A.distanceTo(B), sag = 0.05 * len + 0.12; // the rope batcher's own sag (mooring-lines.ts)
      for (let k = 0; k < FLAGS_PER_LEG; k++, v += 3) {
        const fi = leg * FLAGS_PER_LEG + k;
        const show = THREE.MathUtils.clamp(shown - fi, 0, 1);
        if (show <= 0) { P.fill(0, v * 3, (v + 3) * 3); continue; }
        const s0 = (k + 0.1) / FLAGS_PER_LEG, s1 = (k + 0.9) / FLAGS_PER_LEG;
        // the two corners on the line (with its sag), the fly hanging below, swinging in the wind
        const p0 = this.lineAt(A, B, s0, sag, this.t);
        const x0 = p0.x, y0 = p0.y, z0 = p0.z;
        const p1 = this.lineAt(A, B, s1, sag, this.n);
        const x1 = p1.x, y1 = p1.y, z1 = p1.z;
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, mz = (z0 + z1) / 2;
        const ph = time * (2.2 + 1.6 * wind) + fi * 0.9 + id.length;
        const sw = Math.sin(ph) * sway * f;
        // across the line (horizontal, normal to it), signed toward the viewer: the flags blow out a little to that
        // side so the line reads as cloth from any heading, not as slivers edge-on along the centreline
        let tx = x1 - x0, tz = z1 - z0;
        const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        let sx = -tz, sz = tx;
        if (sx * (this.cam.x - mx) + sz * (this.cam.z - mz) < 0) { sx = -sx; sz = -sz; }
        const drop = f * 1.1 * show, hang = drop * 0.6, out = drop * 0.8 + sw;
        const ax = mx - this.up.x * hang + sx * out, ay = my - this.up.y * hang, az = mz - this.up.z * hang + sz * out;
        const o = v * 3;
        P[o] = x0; P[o + 1] = y0; P[o + 2] = z0;
        P[o + 3] = x1; P[o + 4] = y1; P[o + 5] = z1;
        P[o + 6] = ax; P[o + 7] = ay; P[o + 8] = az;
        // face normal
        const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0, wx = ax - x0, wy = ay - y0, wz = az - z0;
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        for (let q = 0; q < 3; q++) { N[o + q * 3] = nx; N[o + q * 3 + 1] = ny; N[o + q * 3 + 2] = nz; }
        // brand, cream, brand a shade deeper, cream …: dyed cloth, never neon
        const c = fi % 2 === 1 ? CREAM : this.col.copy(dye).multiplyScalar(fi % 4 === 0 ? 1 : 0.9);
        for (let q = 0; q < 3; q++) { const w = (v + q) * 4; C[w] = c.r; C[w + 1] = c.g; C[w + 2] = c.b; C[w + 3] = 0; }
      }
    }
    this.drawn.add(d.slot);
    return true;
  }

  /** The dressing line's three points (stem head, masthead, taffrail) of the last hull() that returned true. */
  get line(): readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3] { return [this.a, this.b, this.c]; }

  end(): void {
    const P = (this.geo.attributes.position as THREE.BufferAttribute).array as Float32Array;
    for (let s = 0; s < MAX_DRESSED; s++) if (!this.drawn.has(s)) P.fill(0, s * FLAGS * 9, (s + 1) * FLAGS * 9);
    this.mesh.visible = this.drawn.size > 0;
    if (!this.drawn.size) return;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  private lineAt(A: THREE.Vector3, B: THREE.Vector3, s: number, sag: number, out: THREE.Vector3): THREE.Vector3 {
    return out.lerpVectors(A, B, s).addScaledVector(this.up, -sag * 4 * s * (1 - s));
  }

  dispose(): void { this.mesh.removeFromParent(); this.geo.dispose(); }
}
