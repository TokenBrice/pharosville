import * as THREE from "three";
import type { StormFlag, StormSignalShape } from "../model/types";
import { CONE_H, DRUM_H, shapeData, type Shape, type ShapeData } from "../readings/storm-cones";

/**
 * DA-04 storm signals at the masthead: each coin in readings.stormFlags (the five worst DEWS Alert+ coins, worst
 * first) flies the Storm-signal Station's shape vocabulary over her own masthead — a cone at Alert, a drum at
 * Warning, a cone over a drum at Danger — in the real convention's matte black, a crisp silhouette against sky and
 * sail (REVIEW #7: never a brown cask, never lit). Early warning, not a depeg (the Shoals tell the depeg). The shapes
 * ride the hull's whole pose (heel, roll, pitch, the launch ways). Like the burgee's flag law, a far hull's shape never
 * drops below MIN_PX on screen, so a hoisted signal reads at the default heart view.
 *
 * ONE draw: every shape of every flagged hull re-posed on the CPU into one small dynamic kit-material geometry
 * (≤ 5 hulls × a cone and a drum ≈ 1.2k vertices). A newly flagged coin's shape breaks out (grows from the truck)
 * over HOIST_SEC, a cleared one is struck the same way; reduced motion and the first reading: at once.
 *
 * Fleet hook (fleet-system.ts): `sync()` once a frame, `hull()` per posed hull, `end()`; `lift(id)` = metres the
 * burgee rides above the masthead so it flies over the shape.
 */
export const MAST_SIGNALS_MAX = 5;
const HOIST_SEC = 3;
/** Shape height on a hull (m): a share of her length, kept readable on a skiff and modest on a titan. */
const SIZE_K = 0.11, SIZE_MIN = 0.9, SIZE_MAX = 2.8;
/** Matte black canvas (linear albedo, plain kit pattern 0): a silhouette against sky, sail and brand flag. */
const BLACK = 0.03;
/** Each shape's height never drops below this many px on screen (it grows with distance, capped at MAX_LOA_K × LOA). */
export const MIN_PX = 9;
const MAX_LOA_K = 0.45;
/** Gap between the truck and the shape, and between a cone and the drum under it (× shape height). */
const GAP_K = 0.12;

export function mastSignalSize(loa: number, pxPerM = Infinity): number {
  const base = THREE.MathUtils.clamp(loa * SIZE_K, SIZE_MIN, SIZE_MAX);
  return Math.max(base, Math.min(MIN_PX / pxPerM, loa * MAX_LOA_K));
}

/** The shapes, top first, of a signal: what the station's vocabulary hoists for each band. */
export function signalParts(shape: StormSignalShape): readonly Shape[] {
  return shape === "cone" ? ["cone"] : shape === "drum" ? ["drum"] : ["cone", "drum"];
}

interface Slot { id: string | null; shape: StormSignalShape; p: number; up: boolean; size: number }

export class MastSignals {
  readonly mesh: THREE.Mesh;
  private readonly cone: ShapeData = shapeData("cone");
  private readonly drum: ShapeData = shapeData("drum");
  /** Per slot: first vertex of its cone, then its drum. */
  private readonly per: number;
  private readonly geo = new THREE.BufferGeometry();
  private readonly slots: Slot[] = [];
  private readonly byId = new Map<string, Slot>();
  private readonly drawn = new Set<number>();
  private key = "";
  private primed = false;
  private readonly o = new THREE.Vector3();
  private readonly ax = new THREE.Vector3();
  private readonly ay = new THREE.Vector3();
  private readonly az = new THREE.Vector3();

  constructor(material: THREE.Material) {
    const nc = this.cone.pos.length / 3, nd = this.drum.pos.length / 3;
    this.per = nc + nd;
    const verts = this.per * MAST_SIGNALS_MAX;
    const idx: number[] = [];
    const col = new Float32Array(verts * 4);
    for (let s = 0; s < MAST_SIGNALS_MAX; s++) {
      const b = s * this.per;
      for (let k = 0; k < this.cone.idx.length; k++) idx.push(this.cone.idx[k] + b);
      for (let k = 0; k < this.drum.idx.length; k++) idx.push(this.drum.idx[k] + b + nc);
      for (let v = b; v < b + this.per; v++) col.set([BLACK, BLACK, BLACK, 0], v * 4);
      this.slots.push({ id: null, shape: "cone", p: 0, up: false, size: 0 });
    }
    this.geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("color", new THREE.BufferAttribute(col, 4));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.name = "harbour-mast-signals";
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.visible = false;
  }

  /** Once a frame, before the hulls: the readings' flags (worst first) and the hoist clock. */
  sync(flags: readonly StormFlag[], dt: number, reduced: boolean): void {
    const key = flags.map((f) => `${f.id}:${f.shape}`).join(",");
    if (key !== this.key) {
      this.key = key;
      const want = new Map(flags.slice(0, MAST_SIGNALS_MAX).map((f) => [f.id, f.shape] as const));
      for (const s of this.slots) if (s.id && (!want.has(s.id) || want.get(s.id) !== s.shape)) s.up = false;
      for (const [id, shape] of want) {
        const cur = this.byId.get(id);
        if (cur && cur.shape === shape) { cur.up = true; continue; }
        // a free slot (or one being struck that is already down)
        const free = this.slots.find((s) => !s.id) ?? this.slots.find((s) => !s.up && s.p <= 0);
        if (!free) continue;
        if (free.id && this.byId.get(free.id) === free) this.byId.delete(free.id);
        free.id = id; free.shape = shape; free.up = true; free.p = 0; free.size = 0;
        this.byId.set(id, free);
      }
      // the first reading of the visit: the signals are simply there (nothing is "hoisted" on arrival)
      if (!this.primed && flags.length) { for (const s of this.slots) if (s.up) s.p = 1; this.primed = true; }
    }
    const step = dt / HOIST_SEC;
    for (const s of this.slots) {
      if (!s.id) continue;
      s.p = reduced ? (s.up ? 1 : 0) : s.up ? Math.min(1, s.p + step) : Math.max(0, s.p - step);
      if (!s.up && s.p <= 0) { if (this.byId.get(s.id) === s) this.byId.delete(s.id); s.id = null; }
    }
    this.drawn.clear();
  }

  /** Metres the burgee must ride above the masthead to fly over this hull's signal (0 = none). */
  lift(id: string, loa: number): number {
    const s = this.byId.get(id);
    if (!s || s.p <= 0) return 0;
    const h = s.size || mastSignalSize(loa), e = s.p * s.p * (3 - 2 * s.p);
    return (h * (1 + GAP_K) * signalParts(s.shape).length) * e;
  }

  /**
   * One posed hull: `m` = the hull's world matrix (kit frame, scale `scale`), `masthead` its masthead anchor in the
   * kit frame, `pxPerM` the screen px per metre at the hull (the minimum size). No-op unless the coin flies a signal.
   */
  hull(id: string, m: THREE.Matrix4, masthead: THREE.Vector3, scale: number, loa: number, pxPerM = Infinity): void {
    const s = this.byId.get(id);
    if (!s || s.p <= 0.002) return;
    const si = this.slots.indexOf(s);
    this.o.copy(masthead).applyMatrix4(m);
    m.extractBasis(this.ax, this.ay, this.az);
    const k = 1 / (scale || 1);
    this.ax.multiplyScalar(k); this.ay.multiplyScalar(k); this.az.multiplyScalar(k);
    const e = s.p * s.p * (3 - 2 * s.p);
    s.size = mastSignalSize(loa, pxPerM);
    const h = s.size * e;
    const P = (this.geo.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const N = (this.geo.attributes.normal as THREE.BufferAttribute).array as Float32Array;
    const parts = signalParts(s.shape);
    let y = h * GAP_K; // up from the truck
    // stack from the bottom part up: the drum (if any) sits nearest the truck, the cone above it
    const bottomFirst = [...parts].reverse();
    let hasCone = false, hasDrum = false;
    for (const part of bottomFirst) {
      const d = part === "cone" ? this.cone : this.drum;
      const unit = part === "cone" ? CONE_H : DRUM_H;
      const sc = h / CONE_H, ph = unit * sc;
      const base = si * this.per + (part === "cone" ? 0 : this.cone.pos.length / 3);
      const cy = y + ph / 2;
      this.write(d, base, sc, cy, P, N);
      y += ph + h * GAP_K;
      if (part === "cone") hasCone = true; else hasDrum = true;
    }
    if (!hasCone) this.collapse(si * this.per, this.cone.pos.length / 3, P);
    if (!hasDrum) this.collapse(si * this.per + this.cone.pos.length / 3, this.drum.pos.length / 3, P);
    this.drawn.add(si);
  }

  /** After the hulls: any slot whose hull was not posed this frame (off screen, struck) draws nothing. */
  end(): void {
    const P = (this.geo.attributes.position as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < MAST_SIGNALS_MAX; i++) if (!this.drawn.has(i)) this.collapse(i * this.per, this.per, P);
    this.mesh.visible = this.drawn.size > 0;
    if (!this.drawn.size) return;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
  }

  private write(d: ShapeData, base: number, sc: number, cy: number, P: Float32Array, N: Float32Array): void {
    const { o, ax, ay, az } = this;
    for (let k = 0, w = base * 3; k < d.pos.length; k += 3, w += 3) {
      const x = d.pos[k] * sc, yy = d.pos[k + 1] * sc + cy, z = d.pos[k + 2] * sc;
      P[w] = o.x + ax.x * x + ay.x * yy + az.x * z;
      P[w + 1] = o.y + ax.y * x + ay.y * yy + az.y * z;
      P[w + 2] = o.z + ax.z * x + ay.z * yy + az.z * z;
      const nx = d.nrm[k], ny = d.nrm[k + 1], nz = d.nrm[k + 2];
      N[w] = ax.x * nx + ay.x * ny + az.x * nz;
      N[w + 1] = ax.y * nx + ay.y * ny + az.y * nz;
      N[w + 2] = ax.z * nx + ay.z * ny + az.z * nz;
    }
  }

  private collapse(base: number, count: number, P: Float32Array): void { P.fill(0, base * 3, (base + count) * 3); }

  dispose(): void { this.mesh.removeFromParent(); this.geo.dispose(); }
}
