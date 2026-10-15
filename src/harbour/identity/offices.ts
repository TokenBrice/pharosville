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
 */
export interface OfficeSite { chain: string; top: THREE.Vector3 }

export function officePlots(civic: readonly CivicPlot[] | undefined): Array<{ chain: string; x: number; z: number }> {
  return (civic ?? []).filter((c) => c.kind.startsWith("harbour-office:")).map((c) => ({ chain: c.kind.slice("harbour-office:".length), x: c.position[0], z: c.position[2] }));
}

export function nearestChain(plots: ReadonlyArray<{ chain: string; x: number; z: number }>, x: number, z: number, maxDist = 30): string | null {
  let best: string | null = null, bd = maxDist * maxDist;
  for (const p of plots) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = p.chain; } }
  return best;
}

const DRESSED = "__hbIdentity";
/** Facade crest growth about its centre, and a drop (m, in the wall plane) to keep it in the wide part of a gable. */
const PANEL_GROW: Record<string, { grow: number; drop: number }> = { tron: { grow: 1.95, drop: 0.25 } };
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
    for (const o of tops) {
      const chain = chainAt(o);
      if (!chain || !this.atlas.chains[chain]) continue;
      o.userData[DRESSED] = true;
      found.push({ chain, top: o.getWorldPosition(new THREE.Vector3()) });
    }
    return found;
  }

  dispose(): void { this.panelMat.dispose(); }
}
