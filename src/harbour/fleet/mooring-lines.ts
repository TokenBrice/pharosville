import * as THREE from "three";
import type { HarbourLayout, Pier } from "../layout/types";

/**
 * Mooring lines: thin sagging ropes as screen-space ribbons (true rope width, never under ~1.4 px),
 * one draw for the whole harbour.
 * Each line runs from a bollard / buoy ring / anchor point to a hull's cleat; `k` (0..1) is how much of
 * it is out, growing from the shore end (a line thrown from the pier as the hull comes alongside, taken
 * back in as she casts off).
 */
const SEGS = 8;

const VERT = /* glsl */ `
attribute vec3 aA;
attribute vec3 aB;
attribute vec2 aQ;      // x: side (-1 | 1), y: end (0 = A, 1 = B)
uniform vec2 uResolution;
uniform float uWidth;   // rope diameter (m)
uniform float uMinPx;
void main() {
  mat4 pv = projectionMatrix * viewMatrix;
  vec4 ca = pv * vec4(aA, 1.0), cb = pv * vec4(aB, 1.0);
  vec2 sa = ca.xy / ca.w * uResolution, sb = cb.xy / cb.w * uResolution;
  vec2 d = sb - sa;
  d = dot(d, d) > 1e-6 ? normalize(d) : vec2(1.0, 0.0);
  vec2 n = vec2(-d.y, d.x);
  vec4 c = aQ.y < 0.5 ? ca : cb;
  // half-width in pixels: the rope's true size, never thinner than uMinPx (AA'd in the fragment)
  float hw = max(uMinPx, uWidth * projectionMatrix[1][1] * 0.5 * uResolution.y / c.w) * 0.5;
  c.xy += n * aQ.x * hw * 2.0 / uResolution * c.w;
  gl_Position = c;
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
void main() { gl_FragColor = vec4(uColor, 1.0); }`;

export class MooringLines {
  readonly object: THREE.Mesh;
  private readonly a: Float32Array;
  private readonly b: Float32Array;
  private readonly attrA: THREE.BufferAttribute;
  private readonly attrB: THREE.BufferAttribute;
  private readonly geo: THREE.BufferGeometry;
  private count = 0;
  readonly max: number;
  private readonly material: THREE.ShaderMaterial;
  private readonly rope = new THREE.Color("#B59B72");

  constructor(resolution: THREE.IUniform<THREE.Vector2>, maxLines = 600) {
    this.max = maxLines;
    const nq = maxLines * SEGS;
    this.a = new Float32Array(nq * 4 * 3);
    this.b = new Float32Array(nq * 4 * 3);
    const q = new Float32Array(nq * 4 * 2);
    const idx = new Uint32Array(nq * 6);
    for (let i = 0; i < nq; i++) {
      q.set([-1, 0, 1, 0, -1, 1, 1, 1], i * 8);
      const v = i * 4;
      idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6);
    }
    this.attrA = new THREE.BufferAttribute(this.a, 3).setUsage(THREE.DynamicDrawUsage);
    this.attrB = new THREE.BufferAttribute(this.b, 3).setUsage(THREE.DynamicDrawUsage);
    const g = new THREE.BufferGeometry();
    g.setAttribute("aA", this.attrA);
    g.setAttribute("aB", this.attrB);
    g.setAttribute("aQ", new THREE.BufferAttribute(q, 2));
    // three needs a position attribute to count vertices
    g.setAttribute("position", this.attrA);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uResolution: resolution, uWidth: { value: 0.07 }, uMinPx: { value: 1.4 }, uColor: { value: this.rope.clone() } },
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    });
    this.object = new THREE.Mesh(g, this.material);
    this.object.name = "harbour-mooring-lines";
    this.object.frustumCulled = false;
    this.object.renderOrder = 2;
  }

  begin(): void { this.count = 0; }

  /** Rope from (bx,by,bz) (shore end) to (ax,ay,az) (cleat), k = fraction paid out. */
  add(bx: number, by: number, bz: number, ax: number, ay: number, az: number, k: number): void {
    if (this.count >= this.max || k <= 0.01) return;
    const len = Math.hypot(ax - bx, ay - by, az - bz);
    const sag = 0.05 * len + 0.12;
    const A = this.a, B = this.b;
    let px = bx, py = by, pz = bz;
    for (let s = 1; s <= SEGS; s++) {
      const t = (s / SEGS) * k;
      const x = bx + (ax - bx) * t, z = bz + (az - bz) * t;
      // slack line: parabolic sag, a little deeper while it is still being paid out
      const y = by + (ay - by) * t - sag * 4 * t * (1 - t) * (1 + (1 - k) * 0.8);
      const o = ((this.count * SEGS) + s - 1) * 12;
      for (let v = 0; v < 4; v++) {
        A[o + v * 3] = px; A[o + v * 3 + 1] = py; A[o + v * 3 + 2] = pz;
        B[o + v * 3] = x; B[o + v * 3 + 1] = y; B[o + v * 3 + 2] = z;
      }
      px = x; py = y; pz = z;
    }
    this.count++;
  }

  /**
   * A line thrown from the deck (ax,ay,az: the cleat) to the shore (bx,by,bz: bollard), k = how far it
   * has flown: the free end arcs over and drops onto the bollard, and the rope settles into its sag as
   * it is made fast (k → 1). Hauled aboard, k runs back down and the end comes home the same way.
   */
  throwLine(ax: number, ay: number, az: number, bx: number, by: number, bz: number, k: number): void {
    if (this.count >= this.max || k <= 0.01) return;
    const len = Math.hypot(ax - bx, ay - by, az - bz);
    const sag = 0.05 * len + 0.12;
    const fly = 1 - k;
    // the flying end's arc: highest mid-throw, gone once it lands
    const lift = (0.35 + 0.18 * len) * 4 * k * fly;
    const A = this.a, B = this.b;
    let px = ax, py = ay, pz = az;
    for (let s = 1; s <= SEGS; s++) {
      const u = s / SEGS, t = u * k;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      // the flown part trails up to the flying end, and drops into its sag as it lands
      const y = ay + (by - ay) * t + lift * u * (1.6 - 0.6 * u) * 0.75 - sag * 4 * t * (1 - t) * k * k;
      const o = ((this.count * SEGS) + s - 1) * 12;
      for (let v = 0; v < 4; v++) {
        A[o + v * 3] = px; A[o + v * 3 + 1] = py; A[o + v * 3 + 2] = pz;
        B[o + v * 3] = x; B[o + v * 3 + 1] = y; B[o + v * 3 + 2] = z;
      }
      px = x; py = y; pz = z;
    }
    this.count++;
  }

  end(light: THREE.Color): void {
    const nq = this.count * SEGS;
    this.geo.setDrawRange(0, nq * 6);
    if (nq) {
      for (const at of [this.attrA, this.attrB]) { at.clearUpdateRanges(); at.addUpdateRange(0, nq * 12); at.needsUpdate = true; }
    }
    (this.material.uniforms.uColor.value as THREE.Color).copy(this.rope).multiply(light);
  }

  get lines(): number { return this.count; }

  dispose(): void { this.geo.dispose(); this.material.dispose(); }
}

/**
 * Where a hull's lines make fast on its pier: the closest point on the pier's deck edge to a point
 * near the cleat (bollards sit on the edge). Returns [x, y, z] or null when no segment is near.
 */
export function bollardFor(layout: HarbourLayout, pier: Pier | undefined, x: number, z: number, maxDist = 14): [number, number, number] | null {
  if (!pier) return null;
  let best = Infinity, bx = 0, bz = 0, by = 0;
  for (const s of pier.segments) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
    const L2 = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / L2));
    const cx = s.a[0] + dx * t, cz = s.a[1] + dz * t;
    const ox = x - cx, oz = z - cz;
    const d = Math.hypot(ox, oz) || 1e-6;
    const half = s.width / 2;
    const edge = Math.max(0, d - half);
    if (edge < best) {
      best = edge;
      const inset = Math.min(d, Math.max(0, half - 0.25));
      bx = cx + (ox / d) * inset; bz = cz + (oz / d) * inset;
      const top = s.kind === "quay" || s.kind === "breakwater" || s.kind === "mole" ? ((layout as { quayY?: number }).quayY ?? layout.deckY + 1.2) : layout.deckY;
      by = top + 0.45;
    }
  }
  return best <= maxDist ? [bx, by, bz] : null;
}
