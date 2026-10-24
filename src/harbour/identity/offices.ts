import * as THREE from "three";
import { mergeStaticMeshes } from "../engine/static-merge";
import type { CivicPlot, CrestAtlas } from "./types";

/**
 * Harbour-office dressing (D17). Whoever places the civic GLBs (public/harbour/civic/harbour-office-*.glb)
 * leaves their named nodes in the scene; this finds them, tells the chain from the nearest
 * `harbour-office:<chain>` plot in layout.civic, and dresses them:
 *   crest_panel   → the chain's facade crest (UVs remapped into crests.webp, one shared material)
 *   awning        → hb_cover stripes tinted by the chain colour (vertex colours × chain field)
 *   flag_pole_top → returned as a flag site for the crest house flag
 * T6: the awnings are merged into their own mesh (one draw, as before) that keeps each chain's vertex range, so
 * `setFurl(chain, k)` can roll a chain's awning back toward its wall (k = 1: ~30 % of its depth) when its 30-day
 * supply fell ≥ 8 % (readings.offices "furled"; driven by civic/office-works.ts).
 */
export interface OfficeSite { chain: string; top: THREE.Vector3 }

export function officePlots(civic: readonly CivicPlot[] | undefined): Array<{ chain: string; x: number; z: number; rot: number }> {
  return (civic ?? []).filter((c) => c.kind.startsWith("harbour-office:")).map((c) => ({ chain: c.kind.slice("harbour-office:".length), x: c.position[0], z: c.position[2], rot: c.rotationY ?? 0 }));
}

/** A furled awning keeps this share of its depth (rolled up against the wall). */
export const FURL_DEPTH = 0.3;

/**
 * Roll a run of awning vertices back toward the wall: in the plot frame (+z = the front, away from the wall) the
 * depth from the back edge and the drop from the top edge both shrink to 1 − (1 − FURL_DEPTH)·k. `rest` and `out`
 * are world xyz; the plot sits at (px, pz) turned `rot` about +y.
 */
export function furlAwning(rest: Float32Array, out: Float32Array, start: number, count: number, px: number, pz: number, rot: number, k: number): void {
  const c = Math.cos(rot), s = Math.sin(rot);
  let zBack = Infinity, yTop = -Infinity;
  for (let i = start; i < start + count; i++) {
    const dx = rest[i * 3] - px, dz = rest[i * 3 + 2] - pz;
    zBack = Math.min(zBack, dx * s + dz * c);
    yTop = Math.max(yTop, rest[i * 3 + 1]);
  }
  const K = 1 - (1 - FURL_DEPTH) * k;
  for (let i = start; i < start + count; i++) {
    const dx = rest[i * 3] - px, dz = rest[i * 3 + 2] - pz;
    const lx = dx * c - dz * s, lz = zBack + (dx * s + dz * c - zBack) * K;
    out[i * 3] = px + lx * c + lz * s;
    out[i * 3 + 1] = yTop + (rest[i * 3 + 1] - yTop) * K;
    out[i * 3 + 2] = pz - lx * s + lz * c;
  }
}

export function nearestChain(plots: ReadonlyArray<{ chain: string; x: number; z: number }>, x: number, z: number, maxDist = 30): string | null {
  let best: string | null = null, bd = maxDist * maxDist;
  for (const p of plots) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = p.chain; } }
  return best;
}

const DRESSED = "__hbIdentity";
/** Facade crest growth about its centre, and a drop (m, in the wall plane), tuned to each classical facade's frame
 *  (PLAN §4.2): tablets between columns and attics under cornices have less room than the stoa's attic. */
const PANEL_GROW: Record<string, { grow: number; drop: number }> = {
  bsc: { grow: 1.2, drop: 0 }, "hyperliquid-l1": { grow: 1.3, drop: 0 }, base: { grow: 1.05, drop: 0 },
  arbitrum: { grow: 1.1, drop: 0 }, polygon: { grow: 1.15, drop: 0 },
};
const PANEL_DEFAULT = { grow: 1.4, drop: 0 };

/** A float copy of an attribute (glTF quantized positions are normalized int16: they cannot hold a grown value). */
function floatCopy(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): THREE.BufferAttribute {
  const out = new THREE.Float32BufferAttribute(new Float32Array(a.count * a.itemSize), a.itemSize);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out.setComponent(i, k, a.getComponent(i, k));
  return out;
}

function meshesOf(o: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  o.traverse((c) => { if ((c as THREE.Mesh).isMesh) out.push(c as THREE.Mesh); });
  return out;
}

export class OfficeDresser {
  private readonly panelMat: THREE.MeshStandardMaterial;
  private readonly done = new Set<string>();
  private readonly v = new THREE.Vector3();
  /** T6: the merged awnings (world space), each chain's vertex run and its rest positions. */
  private readonly awnings: Array<{ mesh: THREE.Mesh; rest: Float32Array; runs: Map<string, { start: number; count: number }> }> = [];
  private readonly furlK = new Map<string, number>();

  constructor(private readonly atlas: CrestAtlas, crests: THREE.Texture, private readonly plots: ReturnType<typeof officePlots>) {
    this.panelMat = new THREE.MeshStandardMaterial({ map: crests, roughness: 0.62, metalness: 0.05, emissive: new THREE.Color(1, 0.86, 0.66), emissiveMap: crests, emissiveIntensity: 0 });
    this.panelMat.name = "identity_crest_panel";
  }

  get complete(): boolean { return this.plots.length > 0 && this.done.size >= this.plots.length; }

  /** Night: the crest is lamp-lit (the office lamps sit right under it). */
  setGlow(k: number): void { this.panelMat.emissiveIntensity = k; }

  /** Scan the scene for undressed offices. Returns the flag sites found this pass. */
  scan(scene: THREE.Object3D): OfficeSite[] {
    const found: OfficeSite[] = [];
    const panels: THREE.Object3D[] = [], awnings: THREE.Object3D[] = [], tops: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (o.userData[DRESSED]) return;
      const n = o.name;
      if (n === "crest_panel" || n.startsWith("crest_panel_") || n.startsWith("crest_panel.")) panels.push(o);
      else if (n === "awning" || n.startsWith("awning_") || n.startsWith("awning.")) awnings.push(o);
      else if (n === "flag_pole_top" || n.startsWith("flag_pole_top_") || n.startsWith("flag_pole_top.")) tops.push(o);
    });
    const chainAt = (o: THREE.Object3D) => { o.getWorldPosition(this.v); return nearestChain(this.plots, this.v.x, this.v.z); };
    const dressed: THREE.Mesh[] = [];
    const awn: Array<{ chain: string; mesh: THREE.Mesh }> = [];
    for (const o of panels) {
      const chain = chainAt(o), c = chain ? this.atlas.chains[chain] : undefined;
      if (!c) continue;
      o.userData[DRESSED] = true;
      for (const m of meshesOf(o)) {
        const g = m.geometry.clone(), uvSrc = g.getAttribute("uv") as THREE.BufferAttribute | undefined;
        if (!uvSrc) continue;
        const uv = floatCopy(uvSrc);
        g.setAttribute("uv", uv);
        const [u0, v0, u1, v1] = c.panel;
        // glTF UVs keep v = 0 at the top (three's GLTFLoader does not flip them); the atlas is loaded flipY
        for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (u1 - u0) * uv.getX(i), v1 - (v1 - v0) * uv.getY(i));
        uv.needsUpdate = true;
        // the crest reads "large on the facade" (D17): grown about its centre in the wall plane, a hair proud
        g.computeBoundingBox();
        const c0 = g.boundingBox!.getCenter(new THREE.Vector3());
        const pos = floatCopy(g.getAttribute("position"));
        g.setAttribute("position", pos);
        const { grow, drop } = PANEL_GROW[chain!] ?? PANEL_DEFAULT;
        // the drop is in metres; the geometry may sit under a scaled node
        const dy = drop / Math.max(1e-3, m.getWorldScale(this.v).y);
        for (let i = 0; i < pos.count; i++) pos.setXYZ(i, c0.x + (pos.getX(i) - c0.x) * grow, c0.y + (pos.getY(i) - c0.y) * grow - dy, pos.getZ(i) + 0.04);
        g.computeBoundingSphere();
        m.geometry = g;
        m.material = this.panelMat;
        dressed.push(m);
      }
      this.done.add(chain!);
    }
    for (const o of awnings) {
      const chain = chainAt(o), c = chain ? this.atlas.chains[chain] : undefined;
      if (!c) continue;
      o.userData[DRESSED] = true;
      const tint = new THREE.Color(c.color);
      for (const m of meshesOf(o)) {
        const g = m.geometry.clone(), src = g.getAttribute("color") as THREE.BufferAttribute | undefined;
        // the tint needs float colours (glTF keeps them as normalized bytes: a tinted byte would round)
        const col = src ? floatCopy(src) : undefined;
        if (col) {
          g.setAttribute("color", col);
          for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * tint.r, col.getY(i) * tint.g, col.getZ(i) * tint.b);
          col.needsUpdate = true;
          m.geometry = g;
          awn.push({ chain: chain!, mesh: m });
          continue;
        } else {
          const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((mm) => {
            const k = mm.clone() as THREE.MeshStandardMaterial;
            k.color?.copy(tint);
            return k;
          });
          m.material = Array.isArray(m.material) ? mats : mats[0];
        }
        dressed.push(m);
      }
    }
    // dressed crests and awnings never move again: one draw per material for all the offices (and one shadow draw)
    mergeStaticMeshes(dressed, scene, "offices");
    if (awn.length) this.mergeAwnings(awn, scene);
    for (const o of tops) {
      const chain = chainAt(o);
      if (!chain || !this.atlas.chains[chain]) continue;
      o.userData[DRESSED] = true;
      found.push({ chain, top: o.getWorldPosition(new THREE.Vector3()) });
    }
    return found;
  }

  /** T6: furl a chain's awning, k 0 (as built) … 1 (rolled to FURL_DEPTH against the wall). */
  setFurl(chain: string, k: number): void {
    if (Math.abs((this.furlK.get(chain) ?? 0) - k) < 1e-4) return;
    this.furlK.set(chain, k);
    const plot = this.plots.find((p) => p.chain === chain);
    if (!plot) return;
    for (const a of this.awnings) {
      const r = a.runs.get(chain);
      if (!r) continue;
      const pos = a.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      furlAwning(a.rest, pos.array as Float32Array, r.start, r.count, plot.x, plot.z, plot.rot, k);
      pos.needsUpdate = true;
    }
  }

  /** The tinted awnings → one world-space mesh per material, remembering each chain's vertex run. */
  private mergeAwnings(list: Array<{ chain: string; mesh: THREE.Mesh }>, scene: THREE.Object3D): void {
    const byMat = new Map<THREE.Material, typeof list>();
    for (const e of list) {
      const mat = e.mesh.material as THREE.Material;
      if (Array.isArray(e.mesh.material)) continue;
      let l = byMat.get(mat);
      if (!l) byMat.set(mat, l = []);
      l.push(e);
    }
    for (const [mat, l] of byMat) {
      let verts = 0, idx = 0;
      for (const e of l) { verts += e.mesh.geometry.getAttribute("position").count; idx += e.mesh.geometry.index?.count ?? e.mesh.geometry.getAttribute("position").count; }
      const cs = l[0].mesh.geometry.getAttribute("color").itemSize;
      const P = new Float32Array(verts * 3), N = new Float32Array(verts * 3), C = new Float32Array(verts * cs), I = new Uint32Array(idx);
      const runs = new Map<string, { start: number; count: number }>();
      const nm = new THREE.Matrix3();
      let v0 = 0, i0 = 0;
      for (const e of l) {
        const g = e.mesh.geometry, pos = g.getAttribute("position"), nrm = g.getAttribute("normal"), col = g.getAttribute("color");
        e.mesh.updateWorldMatrix(true, false);
        nm.getNormalMatrix(e.mesh.matrixWorld);
        for (let i = 0; i < pos.count; i++) {
          this.v.fromBufferAttribute(pos, i).applyMatrix4(e.mesh.matrixWorld);
          P.set([this.v.x, this.v.y, this.v.z], (v0 + i) * 3);
          if (nrm) { this.v.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize(); N.set([this.v.x, this.v.y, this.v.z], (v0 + i) * 3); }
          for (let k = 0; k < cs; k++) C[(v0 + i) * cs + k] = k < col.itemSize ? col.getComponent(i, k) : 1;
        }
        if (g.index) for (let k = 0; k < g.index.count; k++) I[i0 + k] = g.index.getX(k) + v0;
        else for (let k = 0; k < pos.count; k++) I[i0 + k] = k + v0;
        const r = runs.get(e.chain);
        // one chain may carry several awning meshes: they are appended back to back
        if (r && r.start + r.count === v0) r.count += pos.count; else runs.set(e.chain, { start: v0, count: pos.count });
        v0 += pos.count; i0 += g.index?.count ?? pos.count;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(P, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute("normal", new THREE.BufferAttribute(N, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(C, cs));
      geo.setIndex(new THREE.BufferAttribute(I, 1));
      geo.computeBoundingSphere();
      const first = l[0].mesh;
      const merged = new THREE.Mesh(geo, mat);
      merged.name = "offices-awnings";
      merged.castShadow = first.castShadow;
      merged.receiveShadow = first.receiveShadow;
      merged.matrixAutoUpdate = false;
      scene.add(merged);
      for (const e of l) { e.mesh.removeFromParent(); e.mesh.geometry.dispose(); }
      this.awnings.push({ mesh: merged, rest: P.slice(), runs });
      for (const [chain] of runs) { const k = this.furlK.get(chain); if (k) { this.furlK.delete(chain); this.setFurl(chain, k); } }
    }
  }

  dispose(): void { this.panelMat.dispose(); for (const a of this.awnings) { a.mesh.removeFromParent(); a.mesh.geometry.dispose(); } }
}
