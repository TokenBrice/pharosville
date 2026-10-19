import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { runtimeLogoPath } from "../../lib/logos";
import type { AssetStore } from "../engine/assets";
import { DECK, liveryFor, TOPSIDE, TRIM } from "../fleet/livery";
import { indexVariants, pickVariant } from "../fleet/variants";
import { hashColor, rigFor } from "../model/classify";
import type { HarbourMaterials } from "../world/materials";
import { CIVIC_BASE, toWorld, worldGeometry, type LoadedPlot, type ManifestKind } from "./assemble";
import type { CivicBoards } from "./boards";
import { Embers } from "./fx";
import type { WorkerSlot } from "./workers";
import { allocateYard, type HullStage, type PrelaunchCoin, type YardPlace } from "./yard";

/**
 * THE SHIPYARD (D20): the registry's pre-launch coins as hulls under construction. Keels, frames and planked
 * hulls on the building berths, painted ones beside the slips, and the launching-soon ships fully rigged on the
 * six big slipways, dressed overall in signal flags. Each hull has its name board (logo + symbol) at the head
 * of its berth, facing the harbour's camera side. Shipwrights hammer at the hulls, the treadwheel cranes
 * run slowly on their rails. A coin that appears live leaves the yard (the sim sails it out from the Slipway).
 *
 * The whole yard is ONE merged kit mesh (rebuilt only when a coin launches); the name boards are painted into the
 * quarter's shared board atlas (boards.ts). A launched coin's hull, posts AND board leave together: its berth stays
 * empty until the registry's book (re-synced) puts the next coin there.
 */

const KIT = "/harbour/kit/";
const STAGE_NODE: Record<Exclude<HullStage, "rigged">, string> = { keel: "keel_only", ribs: "ribs", planked: "planked", painted: "painted" };
/** No canvas is bent on until she is launched (no sails, no covers): bare spars, dressed in flags. */
const DROP = /^(sail_main|sail_jib|sail_2|sail_extra|sail_cover|sail_cover_2|flag)$/;
/** Hull scale on a slip (the slips take ~34 m ships) and on a berth (13 m x 3.9 m: clear of the shed piers, which stand on the bay lines 7 m either side of the berth centre). */
const SLIP_SCALE = 1.75, BERTH_SCALE = 1.0;
/** Treadwheel radius of the cranes (cv_yard.py WHEEL_R): crane_N_wheel turns by slide / radius. */
const WHEEL_R = 2.5;
/** International code flags, a bright run for dressing overall (sRGB). */
const SIGNAL = ["#C8282E", "#F2C230", "#1F4EA0", "#F4F1E8", "#1C1C1C", "#2F7A3B", "#E07A1F"];

interface KitHullManifest { id: string; file: string; family: string; class: string; loa_m: number; nodes: Array<{ name: string; origin: [number, number, number] }> }

export interface YardHull {
  coin: PrelaunchCoin;
  stage: HullStage;
  slot: { kind: "slip" | "berth"; index: number } | null;
  /** World point of the keel on its slip / berth blocks (null when it has no slot). */
  position: [number, number, number] | null;
  /** Half length (m), for picking. */
  radius: number;
  launched: boolean;
}

interface Placed { place: YardPlace; frame: THREE.Matrix4; scale: number; loa: number; keel: number; hull: THREE.BufferGeometry; extra: THREE.BufferGeometry[]; board: THREE.Vector3; boardW: number }

function cloneDeep(scene: THREE.Object3D): THREE.Object3D {
  const c = scene.clone(true);
  c.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.geometry = m.geometry.clone(); m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone(); }
  });
  return c;
}

/** Bake a morph target (absolute or relative) at `w` into the geometry. */
function bakeMorph(mesh: THREE.Mesh, w: number): void {
  const g = mesh.geometry, mp = g.morphAttributes.position?.[0];
  if (!mp || w === 0) return;
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const dx = g.morphTargetsRelative ? mp.getX(i) : mp.getX(i) - pos.getX(i);
    const dy = g.morphTargetsRelative ? mp.getY(i) : mp.getY(i) - pos.getY(i);
    const dz = g.morphTargetsRelative ? mp.getZ(i) : mp.getZ(i) - pos.getZ(i);
    pos.setXYZ(i, pos.getX(i) + dx * w, pos.getY(i) + dy * w, pos.getZ(i) + dz * w);
  }
  g.morphAttributes = {};
  mesh.morphTargetInfluences = undefined;
  mesh.morphTargetDictionary = undefined;
  g.computeVertexNormals();
}

const cLin = (hex: string) => new THREE.Color(hex);

const RED_LEAD = new THREE.Color("#8E4430");

/**
 * Paint one hull geometry (hull frame: y up from the waterline, vec4 colour) in its coin's livery. Out of the
 * water the brand mask would paint the whole bottom: the brand colour keeps to the boot-top line at the
 * waterline, the underbody below it is red lead (a hull on the stocks).
 */
function paintLivery(g: THREE.BufferGeometry, coinId: string, family: string, brand: THREE.Color): void {
  const paint = g.attributes._paint as THREE.BufferAttribute | undefined, bm = g.attributes._brand as THREE.BufferAttribute | undefined;
  const col = g.attributes.color as THREE.BufferAttribute, pos = g.attributes.position as THREE.BufferAttribute;
  if (!paint && !bm) return;
  const lv = liveryFor(coinId, family);
  const top = cLin(TOPSIDE[lv.topside]), stripe = cLin(TRIM[lv.stripe]), deck = cLin(DECK[lv.deck]), roof = lv.roof ? cLin(TRIM[lv.roof]) : null;
  for (let i = 0; i < col.count; i++) {
    let c: THREE.Color | null = null;
    const r = paint ? paint.getX(i) : 0;
    if (r >= 1 && r < 2) c = top; else if (r >= 2.5 && r < 3.5) c = stripe; else if (r >= 3.5 && r < 4.5) c = deck;
    else if (r >= 4.5 && r < 6.5) c = stripe; else if (r >= 6.5 && r < 7.5) c = roof;
    if (bm && bm.getX(i) > 0.5) { const y = pos.getY(i); c = y > -0.28 ? brand : RED_LEAD; }
    else if (r >= 1 && r < 2 && pos.getY(i) < -0.28) c = RED_LEAD;
    if (c) col.setXYZ(i, c.r, c.g, c.b);
  }
}

/** Keep only position / normal / colour(vec4), indexed (the merge needs one layout). */
function slim(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const n of ["position", "normal", "color"]) if (g.attributes[n]) out.setAttribute(n, g.attributes[n]);
  out.setIndex(g.index);
  return out;
}

/** A box (vec4 colour, pattern id in alpha) for posts and boards' frames. */
function boxGeo(w: number, h: number, d: number, hex: string, pattern = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const c = cLin(hex), n = g.attributes.position.count, a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b, pattern / 16], i * 4);
  g.setAttribute("color", new THREE.BufferAttribute(a, 4));
  g.deleteAttribute("uv");
  g.setIndex(Array.from({ length: n }, (_, i) => i));
  return g;
}

/** Triangle pennants strung along a polyline (dressing overall), vec4 colour. */
function dressingGeo(pts: THREE.Vector3[], size: number, seed: number): THREE.BufferGeometry {
  const P: number[] = [], C: number[] = [];
  const c = new THREE.Color();
  let k = seed;
  for (let s = 0; s + 1 < pts.length; s++) {
    const a = pts[s], b = pts[s + 1], len = a.distanceTo(b);
    const n = Math.max(2, Math.floor(len / (size * 1.25)));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 0.7) / n;
      const p0 = a.clone().lerp(b, t0), p1 = a.clone().lerp(b, t1);
      // the line sags a little between its ends
      const sag = (t: number) => -Math.sin(Math.PI * t) * len * 0.04;
      p0.y += sag(t0); p1.y += sag(t1);
      const tip = p0.clone().lerp(p1, 0.5); tip.y -= size;
      c.set(SIGNAL[k++ % SIGNAL.length]);
      for (const v of [p0, tip, p1, p1, tip, p0]) { P.push(v.x, v.y, v.z); C.push(c.r, c.g, c.b, 0); }
    }
    // the dressing line itself
    const up = new THREE.Vector3(0, 0.05, 0);
    for (const v of [a, b, b.clone().add(up), a, b.clone().add(up), a.clone().add(up)]) { P.push(v.x, v.y, v.z); C.push(0.1, 0.09, 0.08, 0); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(C, 4));
  g.computeVertexNormals();
  g.setIndex(Array.from({ length: P.length / 3 }, (_, i) => i));
  return g;
}

export class Shipyard {
  readonly group = new THREE.Group();
  readonly hulls: YardHull[] = [];
  private mesh: THREE.Mesh | null = null;
  private readonly cranes: Array<{ node: THREE.Object3D; z: number; ph: number; wheel: { node: THREE.Object3D; z: number } | null }> = [];
  private placed: Placed[] = [];
  /** Sawdust where the frames are being faired (two hulls, decorative). */
  private readonly dust: Embers[] = [];
  private launched = new Set<string>();
  private t = 0;

  private constructor(p: LoadedPlot, private readonly mats: HarbourMaterials, private readonly boards: CivicBoards) {
    this.group.name = "shipyard";
    p.nodes.forEach((n, name) => {
      if (!/^crane_\d+$/.test(name)) return;
      const w = p.nodes.get(`${name}_wheel`);
      this.cranes.push({ node: n, z: n.position.z, ph: this.cranes.length * 2.1, wheel: w ? { node: w, z: w.position.z } : null });
    });
  }

  static async build(p: LoadedPlot, mats: HarbourMaterials, boards: CivicBoards, coins: readonly PrelaunchCoin[], stageSpec: ManifestKind,
    assets: AssetStore, launchAt: [number, number] | null): Promise<Shipyard> {
    const y = new Shipyard(p, mats, boards);
    const spec = p.spec;
    const slips = spec.slips ?? [], berths = spec.berths ?? [];
    // the launch slip first (where the sim's Slipway voyage starts), then the nearest; berths: front row, nearest the slips
    const slipW = slips.map((s, i) => ({ i, w: toWorld(p.root, s.origin) }));
    const slipOrder = slipW.sort((a, b) => (launchAt ? Math.hypot(a.w.x - launchAt[0], a.w.z - launchAt[1]) - Math.hypot(b.w.x - launchAt[0], b.w.z - launchAt[1]) : a.i - b.i)).map((s) => s.i);
    const berthOrder = berths.map((b, i) => ({ i, b })).sort((a, b) => b.b.origin[2] - a.b.origin[2] || a.b.origin[0] - b.b.origin[0]).map((x) => x.i);
    const plan = allocateYard(coins, slipOrder, berthOrder);

    // the stage hulls (keel / ribs / planked / painted) and the kit hulls the rigged ones need
    const stagesGltf = await assets.gltf(CIVIC_BASE + stageSpec.file);
    const stages = cloneDeep(stagesGltf.scene);
    mats.apply(stages);
    stages.updateMatrixWorld(true);
    const stageGeo = new Map<string, THREE.Mesh>();
    stages.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) stageGeo.set(m.name, m); });
    const keelBottom = stageSpec.keel_bottom_y ?? -1.2;

    let kit: { hulls: KitHullManifest[] } = { hulls: [] };
    try { kit = await assets.json<{ hulls: KitHullManifest[] }>(KIT + "manifest.json"); } catch { /* rigged hulls fall back to painted */ }
    const index = indexVariants(kit.hulls);
    const kitCache = new Map<string, Promise<{ root: THREE.Object3D; man: KitHullManifest; keel: number } | null>>();
    const kitHull = (family: string) => {
      const id = pickVariant(index, family, "medium");
      const man = kit.hulls.find((h) => h.id === id);
      if (!id || !man) return Promise.resolve(null);
      let pr = kitCache.get(id);
      if (!pr) {
        pr = assets.gltf(KIT + man.file).then((g) => {
          const root = cloneDeep(g.scene);
          root.traverse((o) => { if (DROP.test(o.name)) o.visible = false; });
          mats.apply(root);
          root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.morphTargetInfluences) bakeMorph(m, 1); });
          root.updateMatrixWorld(true);
          const bb = new THREE.Box3();
          root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.name === "hull") bb.expandByObject(m); });
          return { root, man, keel: bb.isEmpty() ? -1.4 : bb.min.y };
        }, () => null);
        kitCache.set(id, pr);
      }
      return pr;
    };

    const rot = new THREE.Matrix4().makeRotationY(Math.PI / 2); // hull +x (bow) → slot −z (away from the water)
    for (const place of plan) {
      const slot = place.slot;
      if (!slot) { y.hulls.push({ coin: place.coin, stage: place.stage, slot: null, position: null, radius: 0, launched: false }); continue; }
      const nodeName = slot.kind === "slip" ? slips[slot.index].name : berths[slot.index].name;
      const node = p.nodes.get(nodeName);
      if (!node) continue;
      node.updateWorldMatrix(true, false);
      const scale = slot.kind === "slip" ? SLIP_SCALE : BERTH_SCALE;
      const family = rigFor(place.coin.pegType);
      const brand = new THREE.Color(place.coin.brandColor ?? hashColor(place.coin.id));
      let hull: THREE.BufferGeometry | null = null;
      const extra: THREE.BufferGeometry[] = [];
      let keel = keelBottom, loa = stageSpec.loa_m ?? 13;
      const frameOf = (k: number) => new THREE.Matrix4().copy(node.matrixWorld)
        .multiply(new THREE.Matrix4().makeTranslation(0, -k * scale, 0)).multiply(rot).multiply(new THREE.Matrix4().makeScale(scale, scale, scale));

      if (place.stage === "rigged") {
        const kh = await kitHull(family);
        if (kh) {
          keel = kh.keel; loa = kh.man.loa_m;
          const frame = frameOf(keel);
          const parts: THREE.BufferGeometry[] = [];
          kh.root.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh || !o.visible || (m.material as THREE.Material).name !== "hb_kit") return;
            let vis = true;
            for (let q: THREE.Object3D | null = o; q; q = q.parent) if (!q.visible) vis = false;
            if (!vis) return;
            const g = worldGeometry(m, ["_paint", "_brand"]);
            if (m.name === "hull" || m.name === "deck") paintLivery(g, place.coin.id, family, brand);
            parts.push(slim(g.applyMatrix4(frame)));
            g.dispose();
          });
          hull = mergeGeometries(parts, false);
          // dressed overall: bow → masthead → stern
          const at = (n: string) => { const o = kh.man.nodes.find((x) => x.name === n)?.origin; return o ? new THREE.Vector3(...o).applyMatrix4(frame) : null; };
          const head = at("masthead_light"), bow = at("bow_cleat"), stern = at("stern_cleat");
          if (head && bow && stern) {
            const bowTip = bow.clone().add(new THREE.Vector3().subVectors(bow, stern).normalize().multiplyScalar(2.4 * scale));
            extra.push(dressingGeo([bowTip, head, stern], 0.85 * scale, place.coin.id.length));
          }
        }
      }
      if (!hull) {
        const stage = place.stage === "rigged" ? "painted" : place.stage;
        const src = stageGeo.get(STAGE_NODE[stage]);
        if (!src) continue;
        const frame = frameOf(keel);
        const g = worldGeometry(src, ["_paint", "_brand"]);
        if (stage === "painted") paintLivery(g, place.coin.id, family, brand);
        hull = slim(g.applyMatrix4(frame));
      }
      // the name board at the head of the berth (land end), on two posts
      const back = (loa * scale) / 2 + (slot.kind === "slip" ? 3.5 : 2.2);
      const boardAt = new THREE.Vector3(0, 0, 0).applyMatrix4(node.matrixWorld);
      const dir = new THREE.Vector3(0, 0, -1).transformDirection(node.matrixWorld).setY(0).normalize();
      boardAt.addScaledVector(dir, back);
      boardAt.y = toWorld(p.root, [0, 0.4, 0]).y;
      const boardW = slot.kind === "slip" ? 6.2 : 4.2;
      y.placed.push({ place, frame: frameOf(keel), scale, loa, keel, hull, extra, board: boardAt, boardW });
      // the keel on the blocks (the UI's pick segment runs up from here)
      const centre = new THREE.Vector3(0, 0, 0).applyMatrix4(node.matrixWorld);
      y.hulls.push({ coin: place.coin, stage: place.stage, slot, position: [centre.x, centre.y, centre.z], radius: (loa * scale) / 2, launched: false });
    }
    y.rebuild();
    y.buildBoards();
    // sawdust: a pale drift of specks over the two front-row hulls in frame / being planked
    for (const pl of y.placed.filter((x) => x.place.stage === "ribs" || x.place.stage === "planked").slice(0, 2)) {
      const at = new THREE.Vector3(0, 1.6, 0).applyMatrix4(pl.frame);
      const e = new Embers(at, 28, 97 + y.dust.length);
      e.u.uColor.value.setRGB(0.95, 0.8, 0.55);
      e.points.name = "shipyard-sawdust";
      y.dust.push(e);
      y.group.add(e.points);
    }
    return y;
  }

  /** The yard mesh without the launched hulls (and their boards' posts). */
  private rebuild(): void {
    if (this.mesh) { this.group.remove(this.mesh); this.mesh.geometry.dispose(); }
    const parts: THREE.BufferGeometry[] = [];
    const face = new THREE.Vector3(Math.SQRT1_2, 0, Math.SQRT1_2);
    for (const pl of this.placed) {
      if (this.launched.has(pl.place.coin.id)) continue;
      parts.push(pl.hull, ...pl.extra);
      // posts
      const side = new THREE.Vector3(face.z, 0, -face.x);
      for (const s of [-1, 1]) {
        const post = boxGeo(0.18, 2.6, 0.18, "#5B4632", 1);
        post.translate(pl.board.x + side.x * s * (pl.boardW / 2 - 0.3), pl.board.y + 1.3, pl.board.z + side.z * s * (pl.boardW / 2 - 0.3));
        parts.push(post);
      }
    }
    if (!parts.length) { this.mesh = null; return; }
    const geo = mergeGeometries(parts, false);
    if (!geo) return;
    geo.computeBoundingSphere();
    this.mesh = new THREE.Mesh(geo, this.mats.kit());
    this.mesh.name = "shipyard-hulls";
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.updateMatrix();
    this.group.add(this.mesh);
  }

  private buildBoards(): void {
    const face = new THREE.Vector3(Math.SQRT1_2, 0, Math.SQRT1_2), side = new THREE.Vector3(face.z, 0, -face.x), up = new THREE.Vector3(0, 1, 0);
    const ctx = this.boards.ctx;
    for (const pl of this.placed) {
      const slot = this.boards.alloc(512, 128);
      if (!slot || !ctx) continue;
      this.boards.paint(slot, () => this.drawBoard(ctx, pl.place, slot.x, slot.y, slot.w, slot.h, () => this.boards.touch()));
      const w = pl.boardW, h = w * (slot.h / slot.w);
      const centre = pl.board.clone().setY(pl.board.y + 2.6 + h / 2 - 0.25).addScaledVector(face, 0.12);
      this.boards.place(`yard:${pl.place.coin.id}`, slot, { centre, right: side.clone(), up, w, h }, !this.launched.has(pl.place.coin.id));
    }
  }

  private drawBoard(ctx: CanvasRenderingContext2D, place: YardPlace, x: number, y: number, w: number, h: number, done: () => void): void {
    const c = place.coin;
    const pad = 6;
    ctx.save();
    ctx.fillStyle = "#1E2833";
    ctx.fillRect(x + pad, y + pad, w - 2 * pad, h - 2 * pad);
    ctx.strokeStyle = "#C99A3E"; ctx.lineWidth = 5;
    ctx.strokeRect(x + pad + 5, y + pad + 5, w - 2 * pad - 10, h - 2 * pad - 10);
    const r = (h - 2 * pad) * 0.36, cxr = x + pad + 14 + r, cyr = y + h / 2;
    ctx.fillStyle = "#F3EFE6";
    ctx.beginPath(); ctx.arc(cxr, cyr, r, 0, Math.PI * 2); ctx.fill();
    // symbol in gilt caps, fitted to the board
    const tx = cxr + r + 16, tw = x + w - pad - 18 - tx;
    let size = 54;
    ctx.font = `600 ${size}px Georgia, 'Times New Roman', serif`;
    const label = c.symbol.toUpperCase();
    while (size > 22 && ctx.measureText(label).width > tw) { size -= 2; ctx.font = `600 ${size}px Georgia, 'Times New Roman', serif`; }
    ctx.fillStyle = "#E8C46A";
    ctx.textBaseline = "middle";
    ctx.fillText(label, tx, cyr - 10);
    ctx.font = `italic 22px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = "#B9C2C8";
    const stageWord: Record<HullStage, string> = { keel: "keel laid", ribs: "in frame", planked: "planked", painted: "painted", rigged: "awaiting launch" };
    ctx.fillText(stageWord[place.stage], tx, cyr + 30);
    ctx.restore();
    const monogram = () => {
      ctx.save();
      ctx.fillStyle = c.brandColor ?? hashColor(c.id);
      ctx.beginPath(); ctx.arc(cxr, cyr, r - 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#FFFFFF"; ctx.font = `700 ${Math.round(r * 0.9)}px Georgia, serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(c.symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase(), cxr, cyr + 2);
      ctx.restore();
      done();
    };
    if (!c.logo) { monogram(); return; }
    const img = new Image();
    img.onload = () => {
      ctx.save();
      ctx.beginPath(); ctx.arc(cxr, cyr, r - 4, 0, Math.PI * 2); ctx.clip();
      const s = (r - 4) * 2 * 0.86;
      ctx.drawImage(img, cxr - s / 2, cyr - s / 2, s, s);
      ctx.restore();
      done();
    };
    img.onerror = monogram;
    img.src = runtimeLogoPath(c.logo);
  }

  /** Coins live in the payload leave the yard. */
  setLaunched(ids: ReadonlySet<string>): void {
    let changed = false;
    for (const h of this.hulls) {
      const l = ids.has(h.coin.id);
      if (l !== h.launched) { h.launched = l; changed = true; }
    }
    if (!changed) return;
    this.launched = new Set(this.hulls.filter((h) => h.launched).map((h) => h.coin.id));
    this.gangDirty = true;
    for (const pl of this.placed) this.boards.show(`yard:${pl.place.coin.id}`, !this.launched.has(pl.place.coin.id));
    this.rebuild();
  }

  /** Cranes run slowly on their rails; shipwrights at the hulls. */
  update(dt: number, moving: boolean, night: number, wind: { to: readonly [number, number]; k: number }, camera: THREE.PerspectiveCamera, viewportH: number): void {
    if (moving) this.t += dt;
    // by day only (the gang works in daylight); a faint drift, never a fountain
    for (const d of this.dust) {
      d.update(dt, 0.6 * (1 - night), 1.1, 1.8, wind.to, wind.k, camera, viewportH, 0, moving);
      d.u.uGain.value = 0.45 * (1 - night);
    }
    for (const c of this.cranes) {
      // long, eased travels with pauses: a working crane, not a pendulum
      const s = Math.sin(this.t * (2 * Math.PI / 95) + c.ph);
      const off = 12 * Math.sign(s) * Math.pow(Math.abs(s), 0.6);
      c.node.position.z = c.z + off;
      // the treadwheel rides along on the sledge and turns as if it drove it
      if (c.wheel) { c.wheel.node.position.z = c.wheel.z + off; c.wheel.node.rotation.x = off / WHEEL_R; }
    }
  }

  /** The gang's stations (static; recomputed when a hull leaves the yard). */
  private gang: WorkerSlot[] = [];
  private gangDirty = true;

  private stations(): WorkerSlot[] {
    const building = this.placed.filter((pl) => !this.launched.has(pl.place.coin.id));
    const rank = (pl: Placed) => ["rigged", "painted", "planked", "ribs", "keel"].indexOf(pl.place.stage);
    const order = [...building].sort((a, b) => rank(a) - rank(b));
    const out: WorkerSlot[] = [];
    const p = new THREE.Vector3(), hp = new THREE.Vector3();
    // one at every hull, a second at every other one, the most advanced first
    for (let pass = 0; pass < 2; pass++) {
      order.forEach((pl, i) => {
        if (pass === 1 && i % 2 === 1) return;
        const side = (pass === 0 ? 1 : -1) * (pl.scale * 2.3 + 0.7) / pl.scale;
        const along = (((i * 37 + pass * 11) % 7) / 7 - 0.5) * pl.loa * 0.7;
        // hull frame (+x bow, +z starboard, y up from the waterline): beside the hull, feet on the floor the keel rests on
        p.set(along, pl.keel, side).applyMatrix4(pl.frame);
        hp.set(along, pl.keel, 0).applyMatrix4(pl.frame);
        out.push({ x: p.x, y: p.y - 0.35, z: p.z, h: Math.atan2(hp.x - p.x, hp.z - p.z), gait: 0, hammer: 1, tempo: 0.7 + ((i * 13) % 5) * 0.12, visible: true });
      });
    }
    return out;
  }

  /** Fill worker slots: shipwrights hammering beside the hulls still building. */
  workers(out: WorkerSlot[]): void {
    if (this.gangDirty) { this.gang = this.stations(); this.gangDirty = false; }
    for (let k = 0; k < out.length; k++) {
      const g = this.gang[k], w = out[k];
      if (!g) { w.visible = false; continue; }
      Object.assign(w, g);
    }
  }

  dispose(): void {
    this.mesh?.geometry.dispose();
    for (const pl of this.placed) { pl.hull.dispose(); pl.extra.forEach((g) => g.dispose()); }
    for (const d of this.dust) d.dispose();
  }
}
