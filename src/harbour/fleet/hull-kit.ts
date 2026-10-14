import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { AssetStore } from "../engine/assets";

/**
 * The hull kit (public/harbour/kit, manifest.json) baked for ONE BatchedMesh draw:
 * every GLB (hull variants, their LODs, wrecks, the buoy) is flattened into a single geometry in the
 * GLB root's frame (glTF: +x bow, +y up, +z starboard, origin midships on the waterline) carrying the
 * whole node/morph contract as vertex attributes, so the vertex shader can pose any hull:
 *
 *   position, normal, color (vec4: rgb albedo, a = pattern id / 16)
 *   aSailUV  (TEXCOORD_0, sail space) · aEmbUV (TEXCOORD_1, emblem square [0,1]², else -1)
 *   aFurl / aFurlN: the "furl" morph deltas (0 = set … 1 = furled / cover on)
 *   aMeta = (kind 0 opaque | 1 sail | 2 cover, node, brand 0..1, flag 0..1)
 *     node: 0 rigid · 1 rigid + mirrored on port tack · 2 boom · 3 boom_2 · 4 jib
 *   aPivot / aAxis: rotation pivot + axis of the node's group (boom: gooseneck, +y; jib: tack, stay axis)
 *   aPaint = (livery region, x / (loa / 2)): the kit's _PAINT corner attribute (0 keep · 1 + 0.98 t topsides,
 *     t boot-top 0 .. sheer 1 · 3 sheer stripe / band · 4 deck · 5 rail cap · 6 inside bulwarks · 7 coachroof ·
 *     8 spar; LOD: topsides + 10, rig 9) plus, from the node names, 8 for spars and 10 for standing rigging.
 *     Decorative, never data.
 */
export const KIT_BASE = "/harbour/kit/";

export interface ManifestNode { name: string; parent: string; origin: [number, number, number]; empty?: boolean; material?: string; stay_axis?: [number, number, number] }
export interface ManifestHull {
  id: string; file: string; family: string; class: string; rig: string;
  loa_m: number; beam_m: number; freeboard_m: number; lod?: string;
  emblem?: { node: string; centre_m: [number, number, number]; size_m: number };
  nodes: ManifestNode[];
}
export interface ManifestProp { id: string; file: string; family: string; loa_m?: number; nodes: ManifestNode[] }
export interface ManifestWreckItem { id: string; file: string; kind: string; size_class?: string; loa_m?: number; sits?: string; nodes: ManifestNode[] }
export interface KitManifest { hulls: ManifestHull[]; props: ManifestProp[]; wreck_kit?: { items: ManifestWreckItem[] } }

export interface HullVariant {
  id: string;
  family: string;
  cls: string;
  loa: number;
  beam: number;
  full: THREE.BufferGeometry;
  lod: THREE.BufferGeometry | null;
  /** Anchors in the hull frame (pre-heel). */
  bowCleat: THREE.Vector3;
  sternCleat: THREE.Vector3;
  masthead: THREE.Vector3;
  /** Highest point (m above the waterline) for picking spheres / labels. */
  top: number;
}

export interface Kit {
  manifest: KitManifest;
  hulls: Map<string, HullVariant>;
  props: Map<string, { geometry: THREE.BufferGeometry; loa: number; nodes: ManifestNode[] }>;
}

const KIND: Record<string, number> = { hb_opaque: 0, hb_sail: 1, hb_cover: 2 };
/** Wreck kit v2 kinds: the epitaph nameboard (TEXCOORD_0 = board space) and lantern glass (hb_emissive × uLamp). */
export const KIND_BOARD = 3, KIND_LAMP = 4;
const MIRROR_RIGID = new Set(["yards", "sail_extra"]);
const SPAR_NODES = new Set(["mast", "yards", "boom_spar", "boom_2_spar", "gaff", "gaff_2"]);
const PAINT_SPAR = 8, PAINT_RIGGING = 10;
const tmpV = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpN = new THREE.Matrix3();

function nodeOrigin(nodes: ManifestNode[], name: string): THREE.Vector3 | null {
  const n = nodes.find((x) => x.name === name);
  return n ? new THREE.Vector3(...n.origin) : null;
}

/** Flatten one GLB into the fleet attribute layout. `pivots` comes from the manifest (Blender object origins). */
export function bakeGltf(gltf: GLTF, nodes: ManifestNode[], opts: { lod?: boolean; loa?: number; wreck?: boolean; skip?: ReadonlySet<string> } = {}): THREE.BufferGeometry {
  const halfLoa = (opts.loa ?? 10) / 2;
  const boom = nodeOrigin(nodes, "boom") ?? new THREE.Vector3();
  const boom2 = nodeOrigin(nodes, "boom_2") ?? new THREE.Vector3();
  const jibNode = nodes.find((n) => n.name === "sail_jib");
  const jib = jibNode ? new THREE.Vector3(...jibNode.origin) : new THREE.Vector3();
  const jibAxis = jibNode?.stay_axis ? new THREE.Vector3(...jibNode.stay_axis).normalize() : new THREE.Vector3(0, 1, 0);
  const P: number[] = [], N: number[] = [], C: number[] = [], SU: number[] = [], EU: number[] = [], F: number[] = [], FN: number[] = [];
  const M: number[] = [], PV: number[] = [], AX: number[] = [], PA: number[] = [], I: number[] = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = geo.groups.length ? geo.groups : [{ start: 0, count: geo.index ? geo.index.count : geo.attributes.position.count, materialIndex: 0 }];
    // node group from the hierarchy
    let node = 0;
    const ancestors: string[] = [];
    for (let p: THREE.Object3D | null = mesh; p; p = p.parent) ancestors.push(p.name);
    if (opts.skip && ancestors.some((a) => opts.skip!.has(a))) return;
    const epitaph = !!opts.wreck && ancestors.includes("epitaph");
    const parentName = mesh.parent?.name ?? "";
    let pivot = new THREE.Vector3(), axis = new THREE.Vector3(0, 1, 0);
    if (opts.lod) node = 1;
    else if (ancestors.includes("boom_2")) { node = 3; pivot = boom2; }
    else if (ancestors.includes("boom")) { node = 2; pivot = boom; }
    else if (mesh.name === "sail_jib") { node = 4; pivot = jib; axis = jibAxis; }
    else if (MIRROR_RIGID.has(mesh.name) || (mesh.name === "sail_main" && parentName === "_heel")) node = 1;
    const flag = mesh.name === "flag" ? 1 : 0;
    const pos = geo.attributes.position, nrm = geo.attributes.normal, col = geo.attributes.color;
    const uv0 = geo.attributes.uv, uv1 = geo.attributes.uv1, brand = geo.attributes._brand, paint = geo.attributes._paint;
    const nodePaint = SPAR_NODES.has(mesh.name) ? PAINT_SPAR : mesh.name === "rigging" ? PAINT_RIGGING : 0;
    const mi = mesh.morphTargetDictionary?.furl;
    const mp = mi != null ? geo.morphAttributes.position?.[mi] : undefined;
    const mn = mi != null ? geo.morphAttributes.normal?.[mi] : undefined;
    const relative = geo.morphTargetsRelative;
    const mw = mesh.matrixWorld;
    const linear = new THREE.Matrix4().copy(mw).setPosition(0, 0, 0);
    tmpN.getNormalMatrix(mw);
    const base = P.length / 3;
    // Furled canvas, slimmed: the brand cover lies flaked low on the boom (not a fat tube) and the
    // rolled jib is a slim roll on its stay. The furl morph's end shape is pulled toward its axis.
    const isCover = mats.some((m) => m.name === "hb_cover");
    const isJib = mesh.name === "sail_jib";
    let furlAdj: Float32Array | null = null, coverUV: Float32Array | null = null;
    if (mp && (isCover || isJib) && !opts.lod) {
      const nv = pos.count;
      const B = new Float32Array(nv * 3), Pf = new Float32Array(nv * 3);
      for (let vi = 0; vi < nv; vi++) {
        tmpV.fromBufferAttribute(pos, vi).applyMatrix4(mw);
        B[vi * 3] = tmpV.x; B[vi * 3 + 1] = tmpV.y; B[vi * 3 + 2] = tmpV.z;
        tmpV.fromBufferAttribute(mp, vi);
        if (!relative) tmpV.sub(tmpP.fromBufferAttribute(pos, vi));
        tmpV.applyMatrix4(linear);
        Pf[vi * 3] = B[vi * 3] + tmpV.x; Pf[vi * 3 + 1] = B[vi * 3 + 1] + tmpV.y; Pf[vi * 3 + 2] = B[vi * 3 + 2] + tmpV.z;
      }
      furlAdj = new Float32Array(nv * 3);
      if (isCover) {
        // centre line y(x), z(x) by least squares, then a slimmer, lower section
        let sx = 0, sxx = 0, sy = 0, sxy = 0, sz = 0, sxz = 0, x0 = Infinity, x1 = -Infinity;
        for (let vi = 0; vi < nv; vi++) {
          const x = Pf[vi * 3], y = Pf[vi * 3 + 1], z = Pf[vi * 3 + 2];
          sx += x; sxx += x * x; sy += y; sxy += x * y; sz += z; sxz += x * z; x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        }
        const den = nv * sxx - sx * sx || 1;
        const by = (nv * sxy - sx * sy) / den, ay = (sy - by * sx) / nv, bz = (nv * sxz - sx * sz) / den, az = (sz - bz * sx) / nv;
        let rm = 0;
        for (let vi = 0; vi < nv; vi++) { const x = Pf[vi * 3]; rm += Math.hypot(Pf[vi * 3 + 1] - (ay + by * x), Pf[vi * 3 + 2] - (az + bz * x)); }
        rm = rm / nv || 0.1;
        coverUV = new Float32Array(nv * 2);
        for (let vi = 0; vi < nv; vi++) {
          const x = Pf[vi * 3], cy = ay + by * x - rm * 0.3, cz = az + bz * x;
          const ry = Pf[vi * 3 + 1] - (ay + by * x), rz = Pf[vi * 3 + 2] - cz;
          const ny = cy + ry * 0.55, nz = cz + rz * 0.42;
          furlAdj[vi * 3] = Pf[vi * 3] - B[vi * 3]; furlAdj[vi * 3 + 1] = ny - B[vi * 3 + 1]; furlAdj[vi * 3 + 2] = nz - B[vi * 3 + 2];
          coverUV[vi * 2] = (x - x0) / Math.max(1e-3, x1 - x0); coverUV[vi * 2 + 1] = ry / rm;
        }
      } else {
        const ax = jibAxis;
        for (let vi = 0; vi < nv; vi++) {
          const dx = Pf[vi * 3] - jib.x, dy = Pf[vi * 3 + 1] - jib.y, dz = Pf[vi * 3 + 2] - jib.z;
          const t = dx * ax.x + dy * ax.y + dz * ax.z;
          const rx = dx - ax.x * t, ry = dy - ax.y * t, rz = dz - ax.z * t;
          furlAdj[vi * 3] = Pf[vi * 3] - rx * 0.6 - B[vi * 3]; furlAdj[vi * 3 + 1] = Pf[vi * 3 + 1] - ry * 0.6 - B[vi * 3 + 1]; furlAdj[vi * 3 + 2] = Pf[vi * 3 + 2] - rz * 0.6 - B[vi * 3 + 2];
        }
      }
    }
    for (const g of groups) {
      const mat = mats[g.materialIndex ?? 0];
      const kind = opts.wreck && mat.name === "hb_emissive" ? KIND_LAMP : epitaph && (KIND[mat.name] ?? 0) === 0 ? KIND_BOARD : KIND[mat.name] ?? 0;
      const used = new Map<number, number>();
      const end = g.start + g.count;
      for (let k = g.start; k < end; k++) {
        const vi = geo.index ? geo.index.getX(k) : k;
        let out = used.get(vi);
        if (out == null) {
          out = P.length / 3 - base;
          used.set(vi, out);
          tmpV.fromBufferAttribute(pos, vi).applyMatrix4(mw);
          P.push(tmpV.x, tmpV.y, tmpV.z);
          if (nrm) { tmpV.fromBufferAttribute(nrm, vi).applyMatrix3(tmpN).normalize(); N.push(tmpV.x, tmpV.y, tmpV.z); } else N.push(0, 1, 0);
          if (mesh.name === "yards" && !opts.lod) C.push(0.3, 0.2, 0.12, col && col.itemSize > 3 ? col.getW(vi) : 0); // spars are tarred wood, not white planks
          else if (col) C.push(col.getX(vi), col.getY(vi), col.getZ(vi), col.itemSize > 3 ? col.getW(vi) : 0); else C.push(1, 1, 1, 0);
          if (coverUV && kind === 2) SU.push(coverUV[vi * 2], coverUV[vi * 2 + 1]);
          else if (kind === KIND_BOARD) SU.push(uv0 ? uv0.getX(vi) : -4, uv0 ? uv0.getY(vi) : -4);
          else SU.push(uv0 && kind === 1 ? uv0.getX(vi) : 0, uv0 && kind === 1 ? uv0.getY(vi) : 0);
          EU.push(uv1 && kind === 1 ? uv1.getX(vi) : -1, uv1 && kind === 1 ? uv1.getY(vi) : -1);
          if (furlAdj) F.push(furlAdj[vi * 3], furlAdj[vi * 3 + 1], furlAdj[vi * 3 + 2]);
          else if (mp) {
            // deltas are directions: the node's linear part (KHR_mesh_quantization scale) only
            tmpV.fromBufferAttribute(mp, vi);
            if (!relative) tmpV.sub(tmpP.fromBufferAttribute(pos, vi));
            tmpV.applyMatrix4(linear);
            F.push(tmpV.x, tmpV.y, tmpV.z);
          } else F.push(0, 0, 0);
          if (mn) { tmpV.fromBufferAttribute(mn, vi); if (!relative && nrm) tmpV.sub(tmpP.fromBufferAttribute(nrm, vi)); FN.push(tmpV.x, tmpV.y, tmpV.z); } else FN.push(0, 0, 0);
          M.push(kind, node, brand ? brand.getX(vi) : 0, flag);
          let pc = kind === 0 ? (paint ? paint.getX(vi) : nodePaint) : 0;
          if (opts.lod && pc >= 1 && pc < 2.5) pc += 10; // LOD topsides: the stripe is painted in the shader
          else if (opts.lod && pc > 7.5 && pc < 8.5) pc = 9; // LOD rig: may be struck far away when furled
          PA.push(pc, P[P.length - 3] / halfLoa);
          PV.push(pivot.x, pivot.y, pivot.z);
          AX.push(axis.x, axis.y, axis.z);
        }
        I.push(base + out);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(C, 4));
  g.setAttribute("aSailUV", new THREE.Float32BufferAttribute(SU, 2));
  g.setAttribute("aEmbUV", new THREE.Float32BufferAttribute(EU, 2));
  g.setAttribute("aFurl", new THREE.Float32BufferAttribute(F, 3));
  g.setAttribute("aFurlN", new THREE.Float32BufferAttribute(FN, 3));
  g.setAttribute("aMeta", new THREE.Float32BufferAttribute(M, 4));
  g.setAttribute("aPivot", new THREE.Float32BufferAttribute(PV, 3));
  g.setAttribute("aAxis", new THREE.Float32BufferAttribute(AX, 3));
  g.setAttribute("aPaint", new THREE.Float32BufferAttribute(PA, 2));
  g.setIndex(I);
  // bounds cover the set AND furled shapes and the boom swung either way
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const span = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x));
  bb.min.z = Math.min(bb.min.z, -span * 0.45); bb.max.z = Math.max(bb.max.z, span * 0.45);
  g.computeBoundingSphere();
  return g;
}

/** Load the manifest and every GLB it lists, in parallel. */
export async function loadKit(assets: AssetStore): Promise<Kit> {
  const res = await fetch(`${KIT_BASE}manifest.json`);
  if (!res.ok) throw new Error(`kit manifest: HTTP ${res.status}`);
  const manifest = await res.json() as KitManifest;
  const hulls = new Map<string, HullVariant>();
  const props: Kit["props"] = new Map();
  await Promise.all([
    ...manifest.hulls.map(async (h) => {
      const [full, lod] = await Promise.all([
        assets.gltf(KIT_BASE + h.file),
        h.lod ? assets.gltf(KIT_BASE + h.lod).catch(() => null) : Promise.resolve(null),
      ]);
      const fg = bakeGltf(full, h.nodes, { loa: h.loa_m });
      const lg = lod ? bakeGltf(lod, [], { lod: true, loa: h.loa_m }) : null;
      const anchor = (name: string, fb: [number, number, number]) => nodeOrigin(h.nodes, name) ?? new THREE.Vector3(...fb);
      hulls.set(h.id, {
        id: h.id, family: h.family, cls: h.class, loa: h.loa_m, beam: h.beam_m, full: fg, lod: lg,
        bowCleat: anchor("bow_cleat", [h.loa_m * 0.42, 1, 0]),
        sternCleat: anchor("stern_cleat", [-h.loa_m * 0.42, 1, 0]),
        masthead: anchor("masthead_light", [0, h.loa_m, 0]),
        top: fg.boundingBox!.max.y,
      });
    }),
    ...manifest.props.map(async (p) => {
      const g = await assets.gltf(KIT_BASE + p.file);
      props.set(p.id, { geometry: bakeGltf(g, p.nodes), loa: p.loa_m ?? 2, nodes: p.nodes });
    }),
  ]);
  return { manifest, hulls, props };
}

export interface WreckItem {
  id: string;
  loa: number;
  sits: "sand" | "water";
  /** Baked with its epitaph post (nameboard + lantern), and without it (the memorial's own wrecks). */
  full: THREE.BufferGeometry;
  bare: THREE.BufferGeometry | null;
  /** The lantern centre in the item frame (glTF, origin = ground under it), if it has one. */
  light: THREE.Vector3 | null;
}

/** The wreck kit v2 (manifest `wreck_kit`): the wrecks and the memorial furniture (epitaph post, bell, pennants). */
export async function loadWreckKit(assets: AssetStore, manifest: KitManifest, ids: ReadonlySet<string>): Promise<Map<string, WreckItem>> {
  const out = new Map<string, WreckItem>();
  const items = (manifest.wreck_kit?.items ?? []).filter((it) => ids.has(it.id));
  await Promise.all(items.map(async (it) => {
    const g = await assets.gltf(KIT_BASE + it.file);
    g.scene.updateMatrixWorld(true);
    const lightObj = g.scene.getObjectByName("epitaph_light");
    const light = lightObj ? lightObj.getWorldPosition(new THREE.Vector3()) : null;
    const hasPost = it.nodes.some((n) => n.name === "epitaph") && it.kind === "wreck";
    out.set(it.id, {
      id: it.id, loa: it.loa_m ?? 2, sits: it.sits === "water" ? "water" : "sand", light,
      full: bakeGltf(g, it.nodes, { wreck: true, loa: it.loa_m ?? 2 }),
      bare: hasPost ? bakeGltf(g, it.nodes, { wreck: true, loa: it.loa_m ?? 2, skip: new Set(["epitaph"]) }) : null,
    });
  }));
  return out;
}
