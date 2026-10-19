import * as THREE from "three";
import { dequantizeForPatterns, type HarbourMaterials } from "../world/materials";
import { replaceStaticDepth } from "../world/depth-prepass";
import { decodeMeshAttribute, setBounds } from "../engine/static-merge";

/**
 * Civic GLB plumbing: the manifest contract, the per-plot load (harbour material port, animated nodes re-pivoted
 * on the manifest's origins) and the static merge (every plot's still parts become one draw per material).
 */

export const CIVIC_BASE = "/harbour/civic/";

export interface CivicPlot { id: string; kind: string; position: [number, number, number]; rotationY: number; footprint: [number, number] }

export interface ManifestNode { name: string; origin: [number, number, number]; empty?: boolean; material?: string; anim?: string; points_gltf?: number[]; rotation_x_rad_gltf?: number; toe_gltf?: number[] }
export interface ManifestKind {
  file: string;
  footprint: [number, number] | null;
  nodes: ManifestNode[];
  anchors?: Record<string, unknown>;
  slips?: Array<{ name: string; origin: [number, number, number]; toe: [number, number, number]; slope_rad: number; max_loa_m: number; width_m: number }>;
  berths?: Array<{ name: string; origin: [number, number, number]; max_loa_m: number; max_beam_m: number }>;
  loa_m?: number; beam_m?: number; keel_bottom_y?: number;
}
export interface CivicManifest { kinds: Record<string, ManifestKind>; chains?: Record<string, string> }

/** Mesh nodes that move: kept apart from the static merge and re-pivoted on their manifest origin. */
const MOVING = /^(press_\d+|wheel|crane_\d+|crane_\d+_wheel|fire_core)$/;
/** Mesh nodes another layer owns or tints (kept apart, untouched). */
const KEEP = /^(crest_panel|furnace_glow|grate_glow|awning)$/;

export interface LoadedPlot {
  plot: CivicPlot;
  spec: ManifestKind;
  root: THREE.Group;
  /** Named nodes (meshes and empties) of the plot, by name. */
  nodes: Map<string, THREE.Object3D>;
}

export async function loadPlot(load: (url: string) => Promise<{ scene: THREE.Group }>, mats: HarbourMaterials, plot: CivicPlot, spec: ManifestKind): Promise<LoadedPlot> {
  const gltf = await load(CIVIC_BASE + spec.file);
  const scene = gltf.scene;
  mats.apply(scene, { deferStatic: isStatic });
  const origin = new Map(spec.nodes.map((n) => [n.name, n.origin]));
  const nodes = new Map<string, THREE.Object3D>();
  scene.traverse((o) => {
    if (!o.name) return;
    nodes.set(o.name, o);
    const mesh = o as THREE.Mesh;
    const pv = origin.get(o.name);
    // dequantizeForPatterns baked the node into the asset frame: move the pivot back where it turns
    if (mesh.isMesh && pv && MOVING.test(o.name) && mesh.position.lengthSq() === 0) {
      mesh.geometry.translate(-pv[0], -pv[1], -pv[2]);
      mesh.position.set(pv[0], pv[1], pv[2]);
      mesh.updateMatrix();
    }
  });
  const root = new THREE.Group();
  root.name = `civic-${plot.id}`;
  root.position.set(plot.position[0], plot.position[1], plot.position[2]);
  root.rotation.y = plot.rotationY;
  root.add(scene);
  root.updateMatrixWorld(true);
  root.traverse((o) => { if (isStatic(o)) mats.staticDepth.add(o as THREE.Mesh); });
  return { plot, spec, root, nodes };
}

/** Is this mesh part of the still building (merged), rather than a moving / owned piece? */
export function isStatic(o: THREE.Object3D): boolean {
  const m = o as THREE.Mesh;
  return !!m.isMesh && !MOVING.test(m.name) && !KEEP.test(m.name) && !Array.isArray(m.material);
}

const ATTRS = ["position", "normal", "color"] as const;

/** World-space copy of a mesh's geometry with the attributes the merge needs (colour forced to vec4). */
export function worldGeometry(mesh: THREE.Mesh, extra: readonly string[] = []): THREE.BufferGeometry {
  mesh.updateWorldMatrix(true, false);
  const src = mesh.geometry;
  const g = new THREE.BufferGeometry();
  for (const name of [...ATTRS, ...extra]) {
    const a = src.attributes[name] as THREE.BufferAttribute | undefined;
    if (!a) {
      if (name === "color") g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(src.attributes.position.count * 4).fill(1), 4));
      continue;
    }
    if (name === "color" && a.itemSize === 3) {
      const out = new Float32Array(a.count * 4);
      for (let i = 0; i < a.count; i++) { out[i * 4] = a.getX(i); out[i * 4 + 1] = a.getY(i); out[i * 4 + 2] = a.getZ(i); out[i * 4 + 3] = 0; }
      g.setAttribute("color", new THREE.BufferAttribute(out, 4));
    } else {
      const out = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
      g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
    }
  }
  if (src.index) g.setIndex(Array.from(src.index.array));
  else g.setIndex(Array.from({ length: src.attributes.position.count }, (_, i) => i));
  g.applyMatrix4(mesh.matrixWorld);
  // window centres are points in the mesh frame: carry them into the world too
  const wc = g.attributes.hbWinC as THREE.BufferAttribute | undefined;
  if (wc) { const v = new THREE.Vector3(); for (let i = 0; i < wc.count; i++) { v.fromBufferAttribute(wc, i).applyMatrix4(mesh.matrixWorld); wc.setXYZ(i, v.x, v.y, v.z); } }
  return g;
}

/**
 * Merge every static mesh under `roots` into one mesh per material (kit, window, lamp glass), remove the
 * originals. Returns the merged meshes (world space, identity transform), shadows set like the port does.
 */
export function mergeStatic(roots: readonly THREE.Object3D[], filter: (m: THREE.Mesh) => boolean = isStatic): THREE.Mesh[] {
  const groups = new Map<THREE.Material, THREE.Mesh[]>();
  for (const root of roots) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (!filter(m)) { dequantizeForPatterns(m); return; }
      const mat = m.material as THREE.Material;
      if (!["hb_kit", "hb_window", "hb_emissive"].includes(mat.name)) return;
      let gr = groups.get(mat);
      if (!gr) { gr = []; groups.set(mat, gr); }
      gr.push(m);
    });
  }
  const out: THREE.Mesh[] = [];
  for (const [mat, gr] of groups) {
    const attrs = mat.name === "hb_window" ? [...ATTRS, "hbWin", "hbWinC"] : ATTRS;
    const total = gr.reduce((n, m) => n + m.geometry.attributes.position.count, 0);
    const geo = new THREE.BufferGeometry();
    for (const name of attrs) {
      const size = name === "color" || name === "hbWin" ? 4 : 3;
      const data = new Float32Array(total * size);
      let at = 0;
      for (const source of gr) {
        const attribute = source.geometry.attributes[name], count = source.geometry.attributes.position.count;
        if (name === "color" && (!attribute || attribute.itemSize === 3)) {
          for (let i = 0; i < count; i++) {
            data[(at + i) * 4] = attribute?.getX(i) ?? 1;
            data[(at + i) * 4 + 1] = attribute?.getY(i) ?? 1;
            data[(at + i) * 4 + 2] = attribute?.getZ(i) ?? 1;
            data[(at + i) * 4 + 3] = attribute ? 0 : 1;
          }
        } else if (attribute) decodeMeshAttribute(source, name, data, at, source.matrixWorld);
        at += count;
      }
      geo.setAttribute(name, new THREE.BufferAttribute(data, size));
    }
    const indices = gr.reduce((n, m) => n + (m.geometry.index?.count ?? m.geometry.attributes.position.count), 0);
    const index = total > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
    let offset = 0, base = 0;
    for (const source of gr) {
      const g = source.geometry, count = g.index?.count ?? g.attributes.position.count;
      for (let i = 0; i < count; i++) index[offset++] = base + (g.index ? g.index.getX(i) : i);
      base += g.attributes.position.count;
    }
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    setBounds(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `civic-merged-${mat.name}`;
    mesh.castShadow = mat.name === "hb_kit";
    mesh.receiveShadow = true;
    // Only the new childless merged output is fixed; presses, cranes and their ancestors stay live.
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    out.push(mesh);
    replaceStaticDepth(gr, mesh);
    for (const m of gr) m.removeFromParent();
  }
  return out;
}

/** Centres (world) of the connected pieces of a mesh: one lamp glass / one furnace mouth each. */
export function pieceCentres(mesh: THREE.Mesh): THREE.Vector3[] {
  const g = mesh.geometry, pos = g.attributes.position, n = pos.count;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x: number) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const idx = g.index;
  const tc = idx ? idx.count : n;
  for (let t = 0; t < tc; t += 3) {
    const a = find(idx ? idx.getX(t) : t);
    for (let k = 1; k < 3; k++) { const b = find(idx ? idx.getX(t + k) : t + k); if (b !== a) parent[b] = a; }
  }
  // positions may coincide without sharing an index (flat-shaded exports): weld by cell as well
  const cell = new Map<string, number>();
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    const key = `${Math.round(p.x * 50)},${Math.round(p.y * 50)},${Math.round(p.z * 50)}`;
    const j = cell.get(key);
    if (j === undefined) cell.set(key, i);
    else { const a = find(i), b = find(j); if (a !== b) parent[b] = a; }
  }
  const acc = new Map<number, { s: THREE.Vector3; n: number }>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let e = acc.get(r);
    if (!e) { e = { s: new THREE.Vector3(), n: 0 }; acc.set(r, e); }
    e.s.add(p.fromBufferAttribute(pos, i)); e.n++;
  }
  mesh.updateWorldMatrix(true, false);
  return [...acc.values()].map((e) => e.s.divideScalar(e.n).applyMatrix4(mesh.matrixWorld));
}

/** Plot frame → world (plots never move: the root's world matrix is set once at load). */
export function toWorld(root: THREE.Object3D, p: readonly number[], out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(p[0], p[1], p[2]).applyMatrix4(root.matrixWorld);
}
