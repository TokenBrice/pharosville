import * as THREE from "three";
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import type { HarbourLayout, HullClass, Pier } from "../layout/types";
import type { HarbourModel } from "../model/types";
import type { OceanService } from "../ocean/ocean-system";
import type { WakeService } from "../ocean/wake";
import type { HarbourSim } from "../sim/sim";
import { PH_ANCHORED, PH_APPROACHING, PH_CASTING_OFF, PH_DOCKED, PH_MOORED, PH_SAILING } from "../sim/sim";
import type { GroundService } from "../world/ground";
import { getHarbourMaterials } from "../world/materials";
import { EmblemAtlas } from "./emblems";
import { createFleetMaterials, type FleetUniforms } from "./fleet-material";
import { loadKit, type HullVariant, type Kit } from "./hull-kit";
import { bollardFor, MooringLines } from "./mooring-lines";
import { RidingLights } from "./riding-lights";
import { Fenders } from "./fenders";
import { HouseFlags } from "./house-flags";
import { coastDistance } from "../sim/obstacles";
import type { QualityService, QualityTier } from "../engine/quality";
import { approach, hash01, indexVariants, pickVariant, sternLampLit, targetSwing, wreckScale, type VariantIndex } from "./variants";
import { DECK, linear, liveryFor, TOPSIDE, TRIM } from "./livery";
import { ensureMotionService, MotionClock } from "../ui/services";

/**
 * FleetSystem: every stablecoin's hull, in ONE BatchedMesh multi-draw (+ its shadow pass), posed every
 * frame from the 'sim' service: hull variant by peg family × supply class (kit manifest), LOD hull when
 * small on screen, furl morph, boom swing + tack mirroring, heel from the sim plus swell bob/pitch/roll
 * from ocean.heightAt, brand boot-top/pennant/cover tint, the coin emblem on the mainsail. Also:
 * wake stamps, mooring lines, riding lights, Wreck Cove hulks, mooring buoys, and the 'picking' service.
 *
 * Reduced motion ('motion' service): the sim holds its clock (sim/system.ts), the sea its swell
 * (ocean-system.ts), and the fleet's own clock (rig life, storm labouring, fenders, flags, lamp shimmer)
 * eases to a stop over a second (and back when it turns off): hulls lie still and, not moving, stamp no wakes.
 *
 * Dev: ?fleet=debug overlays counts, timings and a hull/land intersection audit.
 */

export type PickHit = { kind: "boat"; id: string } | { kind: "landmark"; id: string };
export interface PickingService {
  pick(clientX: number, clientY: number): PickHit | null;
  /** Client-pixel position of a boat's masthead / a landmark's top; visible = in front and on screen. */
  screenPosition(kind: "boat" | "landmark", id: string): { x: number; y: number; visible: boolean };
  setHover(id: string | null): void;
  setSelected(id: string | null): void;
}

/** Riding lights come on with the town (uWindowGlow), not at the first hint of golden hour. */
const RIDING_GLOW = 0.3;
/** Linear colours: oil lamps are warm white; sidelights red / green. */
const LAMP_WARM = new THREE.Color("#FFE2B0");
const LAMP_RED = new THREE.Color("#FF3A24");
const LAMP_GREEN = new THREE.Color("#3DFF7A");
/**
 * Fleet detail by the quality service's tier (the same art, less of it far away): the screen size at
 * which a hull swaps to its full mesh (in / out, px), how near mooring lines and house flags are drawn,
 * up to what zoom the fleet casts shadows, and whether still hulls stamp contact rings in the wake RT.
 */
interface FleetTier { lodIn: number; lodOut: number; lineRange: number; flagRange: number; shadowDist: number; contact: boolean; fenderRange: number }
const FLEET_TIERS: Record<QualityTier, FleetTier> = {
  high: { lodIn: 40, lodOut: 34, lineRange: 650, flagRange: 1300, shadowDist: 640, contact: true, fenderRange: 300 },
  medium: { lodIn: 58, lodOut: 50, lineRange: 460, flagRange: 950, shadowDist: 520, contact: true, fenderRange: 200 },
  low: { lodIn: 90, lodOut: 78, lineRange: 300, flagRange: 640, shadowDist: 360, contact: false, fenderRange: 0 },
};
/** DEWS bands at which the weather turns to storm for the fleet (ALERT … DANGER → 0.55 … 1). */
const STORM_BY_BAND: Record<string, number> = { CALM: 0, WATCH: 0, ALERT: 0.55, WARNING: 0.8, DANGER: 1 };
const WRECK_KITS = ["wreck_a", "wreck_b", "wreck_c"];
/** The dead coins with the biggest peak cap get full-size, detailed hulks; the rest lie smaller. */
const DETAILED_WRECKS = 16;
const BUOY_KIT = "mooring_buoy";
const DATA_W = 256;
/** Livery texels per instance (uFleetPaint): topside, trim, deck, coachroof. */
const PAINT_TEXELS = 4;
/**
 * Far away the rig recedes (fleet-material STRUCK): spars weather to slate and rigging drops as a hull shrinks
 * from SPAR_NEAR to SPAR_FAR px LOA, and up to STRIKE_SHARE of the furled hulls (hash-picked) strike theirs, so
 * docked rows read as hulls and a few masts.
 */
const SPAR_NEAR = 70, SPAR_FAR = 34, STRIKE_SHARE = 0.8;
const CLASS_LOA_FALLBACK: Record<HullClass, number> = { flagship: 26, large: 18, medium: 13, small: 10, boat: 7.5, skiff: 5 };

interface BoatRec {
  id: string;
  inst: number;
  variant: HullVariant;
  scale: number;
  loa: number;
  beam: number;
  geomFull: number;
  geomLod: number;
  geomWreck: number;
  geomCur: number;
  wrecked: boolean;
  swing: number;
  heel: number;
  hi: number;
  px: number; pz: number; vx: number; vz: number; seen: boolean;
  phi: number;
  slot: number; // emblem slot
  brand: THREE.Color;
  bollardSlot: number;
  bow: [number, number, number] | null;
  /** Bow-in (Mediterranean) berth: two bow lines to the quay, the stern's lazy line down to its block. */
  med: boolean;
  stern: [number, number, number] | null;
  visible: boolean;
  dist: number;
  /** Has a peg reading (stern / anchor lamp may be lit at all); shows an anchor light when moored (sternLampLit); whether its pennant flies. */
  reading: boolean;
  lit: boolean;
  flag: number;
  /** Rig struck this frame (far away, furled): no masthead flag or light. `mastK` orders who strikes first. */
  struck: boolean;
  mastK: number;
  /** Picking sphere (world). */
  cx: number; cy: number; cz: number; r: number; top: number;
}

export class FleetSystem implements WorldSystem {
  readonly name = "fleet";
  private kit: Kit | null = null;
  private index: VariantIndex = {};
  private atlas: EmblemAtlas | null = null;
  private mesh: THREE.BatchedMesh | null = null;
  private material: THREE.MeshStandardMaterial | null = null;
  private depth: THREE.MeshDepthMaterial | null = null;
  private readonly uniforms: FleetUniforms;
  private data = new Float32Array(0);
  private paint = new Float32Array(0);
  private geomIds = new Map<string, number>();
  private boats: BoatRec[] = [];
  private byId = new Map<string, BoatRec>();
  private wreckInst: Array<{ inst: number; x: number; z: number; h: number; scale: number; heel: number; y: number; pitch: number; phi: number }> = [];
  private wrecksPosed = false;
  private buoyInst: Array<{ inst: number; x: number; z: number; phi: number }> = [];
  private model: HarbourModel | null = null;
  private layout: HarbourLayout | null = null;
  private piers = new Map<string, Pier>();
  private lines!: MooringLines;
  private riding!: RidingLights;
  private fenders: Fenders | null = null;
  private flags: HouseFlags | null = null;
  private hover: string | null = null;
  private selected: string | null = null;
  private ring: THREE.Mesh | null = null;
  private ringK = 0;
  private debug: HTMLDivElement | null = null;
  private debugTimer = 0;
  private audit = { land: 0, hull: 0, worst: "" };
  private auditTimer = 0;
  private cpuMs = 0;
  private stats = { full: 0, lod: 0, visible: 0, moving: 0, docked: 0, wakes: 0 };
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, "YZX");
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly frustum = new THREE.Frustum();
  private readonly pv = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  private ctx: EngineContext | null = null;
  private failed = false;
  private logosAsked = false;
  private tier: FleetTier = FLEET_TIERS.high;
  private unsubQuality: (() => void) | null = null;
  /** 0 fair … 1 full storm (DEWS ALERT+), eased; drives pitch/roll, heel and line snubbing. */
  private storm = 0;
  /** The fleet's decorative clock (s) and motion level (1 full … 0 reduced): reduced motion freezes every sway in place. */
  private time = 0;
  private clock: MotionClock | null = null;
  private readonly ropeLight = new THREE.Color();
  private readonly flagLight = new THREE.Color();
  private ocean: OceanService | null = null;
  /** Sea height under (x, z): a method, not a per-frame closure. */
  private seaH(x: number, z: number): number { return this.ocean ? this.ocean.heightAt(x, z) : 0; }
  /** A lamp's anchor in the current hull frame (this.m4) → world (this.v). Bound once, not per hull. */
  private readonly lampAt = (lx: number, ly: number, lz: number): THREE.Vector3 => this.v.set(lx, ly, lz).applyMatrix4(this.m4);

  constructor() {
    const dt = new THREE.DataTexture(new Float32Array(DATA_W * 4 * 4), DATA_W, 4, THREE.RGBAFormat, THREE.FloatType);
    dt.needsUpdate = true;
    this.uniforms = {
      uFleetData: { value: dt },
      uFleetPaint: { value: new THREE.DataTexture(new Float32Array(DATA_W * 4), DATA_W, 1, THREE.RGBAFormat, THREE.FloatType) },
      uEmblems: { value: new THREE.Texture() },
      uEmblemGrid: { value: new THREE.Vector4(32, 1, 1 / 32, 1) },
      uWind: { value: 0.35 },
      uFleetTime: { value: 0 },
    };
  }

  async init(ctx: EngineContext): Promise<void> {
    this.ctx = ctx;
    const layout = ctx.services.get("layout") as HarbourLayout | undefined;
    if (!layout) { console.warn("[harbour] fleet: no layout"); return; }
    this.layout = layout;
    for (const p of layout.piers) this.piers.set(p.id, p);
    try {
      const [kit, atlas] = await Promise.all([loadKit(ctx.assets), EmblemAtlas.load(420)]);
      this.kit = kit; this.atlas = atlas;
    } catch (e) {
      console.error("[harbour] fleet: kit failed to load", e);
      this.failed = true;
      return;
    }
    this.index = indexVariants(this.kit.manifest.hulls);
    this.uniforms.uEmblems.value = this.atlas.texture;
    this.uniforms.uEmblemGrid.value = this.atlas.grid;
    const { material, depth } = createFleetMaterials(getHarbourMaterials(ctx), ctx.uniforms, this.uniforms);
    this.material = material; this.depth = depth;
    this.buildMesh(ctx, 1500);
    this.lines = new MooringLines(ctx.uniforms.uResolution, 700);
    ctx.scene.add(this.lines.object);
    this.riding = new RidingLights({ ...ctx.uniforms, uTime: this.uniforms.uFleetTime });
    ctx.scene.add(this.riding.object);
    this.fenders = new Fenders();
    ctx.scene.add(this.fenders.mesh);
    this.flags = new HouseFlags({ ...ctx.uniforms, uTime: this.uniforms.uFleetTime }, this.atlas.texture, this.atlas.grid);
    ctx.scene.add(this.flags.mesh);
    this.ring = this.makeRing();
    ctx.scene.add(this.ring);

    ctx.services.set("picking", this.pickingService());
    this.clock = new MotionClock(ensureMotionService(ctx));
    const quality = ctx.services.get("quality") as QualityService | undefined;
    if (quality) {
      this.tier = FLEET_TIERS[quality.tier] ?? FLEET_TIERS.high;
      this.unsubQuality = quality.onChange((q) => { this.tier = FLEET_TIERS[q.tier] ?? FLEET_TIERS.high; });
    }
    if (import.meta.env.DEV && new URLSearchParams(location.search).get("fleet") === "debug") {
      this.debug = document.createElement("div");
      Object.assign(this.debug.style, { position: "fixed", left: "10px", top: "10px", zIndex: "50", font: "12px/1.45 ui-monospace, monospace", color: "#F4ECD8", background: "rgba(16,24,30,0.78)", padding: "8px 10px", borderRadius: "4px", whiteSpace: "pre", pointerEvents: "none" });
      document.body.appendChild(this.debug);
    }
  }

  // ------------------------------------------------------------------ batched mesh

  private buildMesh(ctx: EngineContext, maxInstances: number): void {
    const kit = this.kit!;
    const geos: Array<[string, THREE.BufferGeometry]> = [];
    for (const h of kit.hulls.values()) { geos.push([h.id, h.full]); if (h.lod) geos.push([`${h.id}#lod`, h.lod]); }
    for (const [id, p] of kit.props) geos.push([id, p.geometry]);
    let nv = 0, ni = 0;
    for (const [, g] of geos) { nv += g.attributes.position.count; ni += g.index!.count; }
    const mesh = new THREE.BatchedMesh(maxInstances, nv, ni, this.material!);
    mesh.name = "harbour-fleet";
    mesh.customDepthMaterial = this.depth!;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.perObjectFrustumCulled = true;
    mesh.sortObjects = false;
    for (const [id, g] of geos) this.geomIds.set(id, mesh.addGeometry(g));
    this.mesh = mesh;
    this.ensureData(maxInstances);
    ctx.scene.add(mesh);
  }

  private ensureData(maxInstances: number): void {
    const prows = Math.ceil((maxInstances * PAINT_TEXELS) / DATA_W);
    if (this.paint.length < prows * DATA_W * 4) {
      const old = this.uniforms.uFleetPaint.value;
      const p = new Float32Array(prows * DATA_W * 4);
      p.set(this.paint);
      this.paint = p;
      const t = new THREE.DataTexture(p, DATA_W, prows, THREE.RGBAFormat, THREE.FloatType);
      t.needsUpdate = true;
      this.uniforms.uFleetPaint.value = t;
      old.dispose();
    }
    const rows = Math.ceil((maxInstances * 2) / DATA_W);
    if (this.data.length >= rows * DATA_W * 4) return;
    this.data = new Float32Array(rows * DATA_W * 4);
    for (let i = 0; i < maxInstances; i++) this.data[(i * 2 + 1) * 4 + 3] = -1;
    const old = this.uniforms.uFleetData.value;
    const t = new THREE.DataTexture(this.data, DATA_W, rows, THREE.RGBAFormat, THREE.FloatType);
    t.needsUpdate = true;
    this.uniforms.uFleetData.value = t;
    old.dispose();
  }

  private addInstance(geom: number): number {
    const mesh = this.mesh!;
    if (mesh.instanceCount >= mesh.maxInstanceCount) {
      const n = Math.ceil(mesh.maxInstanceCount * 1.5);
      mesh.setInstanceCount(n);
      this.ensureData(n);
    }
    return mesh.addInstance(geom);
  }

  private writeData(inst: number, furl: number, swing: number, hi: number, r: number, g: number, b: number, slot: number, flag = 1, far = 0, struck = false): void {
    const d = this.data, o = inst * 8;
    // pennant flying (sign), how far the rig has receded and whether it is struck share one channel
    const m = 1 + far + (struck ? 2 : 0);
    d[o] = furl; d[o + 1] = swing; d[o + 2] = hi; d[o + 3] = flag > 0.5 ? m : -m;
    d[o + 4] = r; d[o + 5] = g; d[o + 6] = b; d[o + 7] = slot;
  }

  /** The hull's livery (decorative, hash-picked per coin) into uFleetPaint; 0 texels = the kit's own paint. */
  private writePaint(inst: number, id: string | null, family: string): void {
    const p = this.paint, o = inst * PAINT_TEXELS * 4;
    p.fill(0, o, o + PAINT_TEXELS * 4);
    if (id) {
      const lv = liveryFor(id, family);
      p.set(linear(TOPSIDE[lv.topside]), o); p[o + 3] = lv.nameBoard ? 1 : 0;
      p.set(linear(TRIM[lv.stripe]), o + 4); p[o + 7] = 1;
      p.set(linear(DECK[lv.deck]), o + 8);
      if (lv.roof) { p.set(linear(TRIM[lv.roof]), o + 12); p[o + 15] = 1; }
    }
    this.uniforms.uFleetPaint.value.needsUpdate = true;
  }

  // ------------------------------------------------------------------ model → instances

  private install(model: HarbourModel): void {
    const mesh = this.mesh!, kit = this.kit!, layout = this.layout!;
    this.model = model;
    const old = this.byId;
    for (const b of this.boats) mesh.deleteInstance(b.inst);
    for (const w of this.wreckInst) mesh.deleteInstance(w.inst);
    for (const bu of this.buoyInst) mesh.deleteInstance(bu.inst);
    this.boats = []; this.byId = new Map(); this.wreckInst = []; this.buoyInst = [];
    const loaOf = (c: HullClass) => layout.hull?.loa?.[c] ?? CLASS_LOA_FALLBACK[c];
    for (const boat of model.boats) {
      const vid = pickVariant(this.index, boat.rig, boat.hullClass);
      const variant = vid ? kit.hulls.get(vid) : undefined;
      if (!variant) continue;
      const loa = loaOf(boat.hullClass);
      const scale = loa / variant.loa;
      const geomFull = this.geomIds.get(variant.id)!;
      const geomLod = this.geomIds.get(`${variant.id}#lod`) ?? geomFull;
      const geomWreck = this.geomIds.get(WRECK_KITS[Math.floor(hash01(boat.id) * 3)]) ?? geomFull;
      const wrecked = boat.state === "wrecked";
      const g0 = wrecked ? geomWreck : geomLod;
      const prev = old.get(boat.id);
      const brand = new THREE.Color(boat.brandColor);
      const rec: BoatRec = {
        id: boat.id, inst: this.addInstance(g0), variant, scale, loa, beam: variant.beam * scale, geomFull, geomLod, geomWreck, geomCur: g0, wrecked,
        swing: prev?.swing ?? 0, heel: prev?.heel ?? 0, hi: 0, px: prev?.px ?? 0, pz: prev?.pz ?? 0, vx: 0, vz: 0, seen: !!prev?.seen,
        phi: hash01(boat.id + "#bob") * Math.PI * 2,
        slot: this.atlas ? this.atlas.slotFor({ id: boat.id, symbol: boat.symbol, brandColor: boat.brandColor }) : -1,
        brand, bollardSlot: -2, bow: null, med: false, stern: null, visible: false, dist: 0, reading: sternLampLit(boat, "under-way"), lit: sternLampLit(boat, "moored"), flag: 1, struck: false, mastK: hash01(boat.id + "#mast"), cx: 0, cy: 0, cz: 0, r: loa * 0.5, top: variant.top * scale,
      };
      this.writePaint(rec.inst, wrecked ? null : boat.id, variant.family);
      this.boats.push(rec);
      this.byId.set(rec.id, rec);
    }
    this.placeWrecks(model, this.ctx?.services.get("sim") as HarbourSim | undefined);
    this.wrecksPosed = false;
    this.placeBuoys();
  }

  /**
   * Dead coins (readings.wrecks) that are not payload boats: hulks beached up the Wreck Cove strand (the
   * sim's wreck slots: the island's beach slots / authored hulks first, then the boneyard), keel buried
   * in dry sand, heeled over 20-35°. The DETAILED_WRECKS biggest by peak cap are full-size hulks on the
   * best slots; the rest lie smaller and further gone along the same beach.
   */
  private placeWrecks(model: HarbourModel, sim: HarbourSim | undefined): void {
    const L = sim?.layout;
    const kit = this.kit!;
    const ground = this.ctx?.services.get("ground") as GroundService | undefined;
    const taken = new Set<number>();
    if (sim) for (let i = 0; i < sim.pose.count; i++) if (model.boats[i]?.state === "wrecked" && sim.pose.slot[i] >= 0) taken.add(sim.pose.slot[i]);
    const gy = (x: number, z: number) => (ground ? ground.heightAt(x, z) : 0.5);
    // dry, open strand: sand above the waterline, no cliff or bank right over it
    const dry = (x: number, z: number) => {
      const h = gy(x, z);
      if (h < 0.12 || h > 3.2) return false;
      for (let a = -6; a <= 6; a += 3) for (let b = -6; b <= 6; b += 3) if (a * a + b * b <= 36 && gy(x + a, z + b) > h + 2.4) return false;
      return true;
    };
    type Spot = { x: number; z: number; h: number; big: boolean; loa: number };
    const spots: Spot[] = [];
    const near = (x: number, z: number, r: number) => spots.some((q) => Math.hypot(q.x - x, q.z - z) < r + q.loa * 0.3);
    let cx = 0, cz = 0, nc = 0;
    if (L) for (const w of L.wrecks) { cx += L.slots[w].x; cz += L.slots[w].z; nc++; }
    if (nc) { cx /= nc; cz /= nc; }
    if (L) for (const w of L.wrecks) {
      const s = L.slots[w];
      const big = !s.id.startsWith("wreck/bone");
      if (taken.has(w) || !dry(s.x, s.z) || near(s.x, s.z, (big ? L.loa[s.cls] : 6) * 0.3)) continue;
      spots.push({ x: s.x, z: s.z, h: s.heading, big, loa: big ? L.loa[s.cls] : 6 });
    }
    const live = new Set(model.boats.map((b) => b.id));
    const dead = model.readings.wrecks.filter((w) => !live.has(w.id)).sort((a, b) => (b.peakMcap ?? 0) - (a.peakMcap ?? 0));
    // more dry strand round the cove when its own slots run out
    const coast = L?.field?.coast ?? null;
    if (coast && nc && spots.length < dead.length) {
      const cand: Array<{ x: number; z: number; d: number }> = [];
      for (let z = cz - 140; z <= cz + 140; z += 3) for (let x = cx - 140; x <= cx + 140; x += 3) {
        const c = coastDistance(coast, x, z);
        if (c < -5 || c > -0.5) continue;
        cand.push({ x, z, d: Math.hypot(x - cx, z - cz) });
      }
      cand.sort((p, q) => p.d - q.d);
      for (const p of cand) {
        if (spots.length >= dead.length) break;
        if (near(p.x, p.z, 2.6) || !dry(p.x, p.z)) continue;
        const gx = coastDistance(coast, p.x + 1.5, p.z) - coastDistance(coast, p.x - 1.5, p.z), gz = coastDistance(coast, p.x, p.z + 1.5) - coastDistance(coast, p.x, p.z - 1.5);
        spots.push({ x: p.x, z: p.z, h: Math.atan2(-gx, -gz) + (hash01(`w${p.x},${p.z}`) - 0.5) * 1.4, big: false, loa: 6 });
      }
    }
    // the biggest dead take the best (authored, nearest the cove's heart) spots
    spots.sort((a, b) => b.loa - a.loa || Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
    for (let i = 0; i < Math.min(spots.length, dead.length); i++) {
      const s = spots[i], w = dead[i];
      const detailed = i < DETAILED_WRECKS;
      const kid = WRECK_KITS[(i * 7 + Math.floor(hash01(w.id) * 3)) % 3];
      const geom = this.geomIds.get(kid);
      const prop = kit.props.get(kid);
      if (geom == null || !prop) continue;
      const len = detailed ? Math.max(10, Math.min(16, s.loa * 0.85)) * (0.9 + 0.2 * hash01(w.id + "#s")) : Math.min(6.8, Math.max(4.4, s.loa * 0.6)) * (0.85 + 0.3 * hash01(w.id + "#s"));
      const scale = (len / prop.loa) * (detailed ? wreckScale(w.peakMcap) : 1);
      const inst = this.addInstance(geom);
      this.writePaint(inst, null, "");
      const side = hash01(w.id + "#side") < 0.5 ? -1 : 1;
      // the keel half-buried in the sand where she lies: the sand's own height, less the burial
      const sand = Math.min(gy(s.x, s.z), gy(s.x + Math.sin(s.h) * len * 0.3, s.z + Math.cos(s.h) * len * 0.3), gy(s.x - Math.sin(s.h) * len * 0.3, s.z - Math.cos(s.h) * len * 0.3));
      this.wreckInst.push({
        inst, x: s.x, z: s.z, h: s.h, scale,
        heel: side * (0.3 + 0.24 * hash01(w.id + "#heel")),
        y: sand - (0.18 + 0.22 * hash01(w.id + "#y")) * len * 0.11,
        pitch: 0.03 + 0.07 * hash01(w.id + "#p"), phi: hash01(w.id + "#c") * 6.28,
      });
      // smaller hulks: further gone, bleached
      const k = detailed ? 0.5 : 0.62;
      this.writeData(inst, 0, 0, 0, k, k, k, -2, 0);
    }
  }

  private placeBuoys(): void {
    const geom = this.geomIds.get(BUOY_KIT);
    if (geom == null) return;
    for (const m of this.layout!.moorings ?? []) {
      const inst = this.addInstance(geom);
      this.writePaint(inst, null, "");
      this.writeData(inst, 0, 0, 0, 0.8, 0.2, 0.1, -1);
      this.buoyInst.push({ inst, x: m.position[0], z: m.position[2], phi: hash01(m.id) * 6.28 });
    }
  }

  // ------------------------------------------------------------------ frame

  update(frame: FrameState, ctx: EngineContext): void {
    if (!this.mesh || this.failed) return;
    // the emblem logos are not first-view weight: fetched once the first frame is up (roundels until then)
    if (!this.logosAsked) { this.logosAsked = true; requestAnimationFrame(() => { void this.atlas?.loadLogos(); }); }
    const t0 = performance.now();
    const model = ctx.services.get("model") as HarbourModel | undefined;
    const sim = ctx.services.get("sim") as HarbourSim | undefined;
    if (model && model !== this.model) this.install(model);
    this.ocean = (ctx.services.get("ocean") as OceanService | undefined) ?? null;
    const wake = ctx.services.get("wake") as WakeService | undefined;
    const cam = ctx.camera;
    this.pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    const viewH = ctx.renderer.domElement.clientHeight || innerHeight;
    const pxPerM = viewH / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    const dt = Math.max(1e-3, frame.delta);
    const time = this.time = this.clock ? this.clock.step(dt) : frame.elapsed;
    this.uniforms.uFleetTime.value = time;
    const tier = this.tier;
    // storm: the weather band the sky and the storm mast show (DEWS ALERT and worse)
    const readings = ctx.services.get("readings") as { stormBand?: string | null } | undefined;
    const stormT = STORM_BY_BAND[readings?.stormBand ?? "CALM"] ?? 0;
    this.storm += (stormT - this.storm) * (1 - Math.exp(-dt * 0.35));
    const storm = this.storm;
    const ground = ctx.services.get("ground") as GroundService | undefined;
    const mesh = this.mesh;
    mesh.castShadow = ctx.rig.distance < tier.shadowDist;

    const st = this.stats;
    st.full = 0; st.lod = 0; st.visible = 0; st.moving = 0; st.docked = 0; st.wakes = 0;
    this.lines.begin();
    this.fenders?.begin();
    const pose = sim?.pose;
    const n = pose && model && pose.count === model.boats.length ? pose.count : 0;
    const windFrom = sim?.wind.fromRad ?? -1;
    this.uniforms.uWind.value = sim?.wind.strength ?? 0.35;
    const slots = sim?.layout.slots;
    const hiK = 1 - Math.exp(-dt * 8);
    const glow = ctx.uniforms.uWindowGlow.value;
    const glowK = THREE.MathUtils.smoothstep(glow, RIDING_GLOW - 0.12, RIDING_GLOW + 0.2);
    this.riding.begin();
    this.flags?.begin();
    const downwind = windFrom + Math.PI;

    for (let i = 0, bi = 0; i < n && bi < this.boats.length; i++) {
      const b = this.boats[bi];
      if (b.id !== pose!.ids[i]) continue; // a boat without a kit hull was skipped
      bi++;
      const x = pose!.position[i * 3], z = pose!.position[i * 3 + 2], h = pose!.heading[i];
      const ph = pose!.phase[i];
      const sail = pose!.sailState[i];
      const moving = ph === PH_CASTING_OFF || ph === PH_SAILING || ph === PH_APPROACHING;
      // velocity from the pose itself (robust to astern legs and ?simspeed)
      if (!b.seen) { b.px = x; b.pz = z; b.seen = true; }
      let vx = (x - b.px) / dt, vz = (z - b.pz) / dt;
      if (vx * vx + vz * vz > 900) { vx = 0; vz = 0; } // teleport (re-plan) — no wake streak
      const vk = 1 - Math.exp(-dt * 4);
      b.vx += (vx - b.vx) * vk; b.vz += (vz - b.vz) * vk;
      b.px = x; b.pz = z;

      // rig pose
      const target = b.wrecked ? 0 : targetSwing(h, windFrom, sail);
      b.swing = approach(b.swing, target, dt * 0.55);
      // in a storm the sail drawing heels her hard over (the sim's heel follows the model's wind)
      const heelT = pose!.heel[i] * (moving ? 1 + 1.3 * storm : 1);
      b.heel += (heelT - b.heel) * (1 - Math.exp(-dt * 1.2));
      const hiT = b.id === this.hover ? 1 : b.id === this.selected ? 0.5 : 0;
      b.hi += (hiT - b.hi) * hiK;

      // swell: bob, pitch, roll from the sea surface under the hull (big hulls average more)
      const fx = Math.sin(h), fz = Math.cos(h);
      const half = b.loa * 0.4, hb = b.beam * 0.5;
      const h0 = this.seaH(x, z), hBow = this.seaH(x + fx * half, z + fz * half), hSt = this.seaH(x - fx * half, z - fz * half);
      const hPort = this.seaH(x + fz * hb, z - fx * hb), hStb = this.seaH(x - fz * hb, z + fx * hb);
      const resp = b.wrecked ? 0.12 : Math.min(1, Math.max(0.3, 9 / b.loa));
      const idle = moving ? 0.6 : 1;
      const bob = (h0 * 0.7 + (hBow + hSt) * 0.15) + Math.sin(time * 0.9 + b.phi) * 0.035 * resp * idle;
      let pitch = Math.atan2(hBow - hSt, half * 2) * 0.8 * resp + Math.sin(time * 0.7 + b.phi * 1.3) * 0.006 * resp;
      let roll = Math.atan2(hPort - hStb, b.beam) * 0.7 * resp + Math.sin(time * 1.05 + b.phi) * 0.014 * resp * idle;
      // storm: under way she labours (pitching into the seas, rolling); alongside or on her mooring she
      // snubs at her lines, surging back and forth and sheering
      let sx = x, sz = z, sh = h;
      if (storm > 0.01 && !b.wrecked) {
        const k = storm * resp;
        if (moving) {
          pitch = pitch * (1 + 1.4 * storm) + k * (0.07 * Math.sin(time * 1.15 + b.phi * 1.7) + 0.03 * Math.sin(time * 2.3 + b.phi));
          roll = roll * (1 + 1.2 * storm) + k * (0.09 * Math.sin(time * 0.83 + b.phi) + 0.035 * Math.sin(time * 1.9 + b.phi * 2.1));
        } else {
          const ph2 = time * 0.55 + b.phi * 2.3;
          const snub = Math.sin(ph2) + 0.35 * Math.sin(ph2 * 2.1 + 1.3); // a tug, a slack, a sharper tug
          const surge = storm * (0.25 + 0.012 * b.loa) * snub;
          sx += fx * surge; sz += fz * surge;
          sh += storm * 0.06 * Math.sin(time * 0.41 + b.phi * 1.1);
          pitch += k * 0.05 * Math.sin(time * 1.1 + b.phi);
          roll += k * 0.07 * Math.sin(time * 0.9 + b.phi * 1.4);
        }
      }

      if (b.wrecked) {
        // beached: on the sand, keel buried, no swell under her
        this.e.set(b.heel, h - Math.PI / 2, 0.05, "YZX");
        this.v.set(x, (ground ? ground.heightAt(x, z) : 0) - b.beam * 0.22, z);
      } else {
        this.e.set(b.heel + roll, sh - Math.PI / 2, pitch, "YZX");
        this.v.set(sx, bob, sz);
      }
      this.q.setFromEuler(this.e);
      this.m4.compose(this.v, this.q, this.s.setScalar(b.scale));
      mesh.setMatrixAt(b.inst, this.m4);

      // visibility + LOD by on-screen size
      const cy = bob + b.top * 0.4;
      this.sphere.center.set(x, cy, z); this.sphere.radius = Math.max(b.loa * 0.55, b.top * 0.55);
      b.cx = x; b.cy = cy; b.cz = z; b.r = this.sphere.radius;
      b.visible = this.frustum.intersectsSphere(this.sphere);
      const dx = cam.position.x - x, dy = cam.position.y - cy, dz = cam.position.z - z;
      b.dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const px = (b.loa / b.dist) * pxPerM;
      let g = b.wrecked ? b.geomWreck : b.geomCur === b.geomFull ? (px < tier.lodOut ? b.geomLod : b.geomFull) : (px > tier.lodIn ? b.geomFull : b.geomLod);
      if (b.hi > 0.05 && !b.wrecked) g = b.geomFull;
      if (g !== b.geomCur) { mesh.setGeometryIdAt(b.inst, g); b.geomCur = g; }
      if (b.visible) { st.visible++; if (g === b.geomFull) st.full++; else st.lod++; }
      // pennants: small hulls strike theirs when small on screen (no speckle across the bay)
      b.flag = b.loa >= 12 ? 1 : b.flag ? (px > 55 ? 1 : 0) : (px > 72 ? 1 : 0);
      const far = b.hi > 0.05 || b.wrecked ? 0 : 1 - THREE.MathUtils.smoothstep(px, SPAR_FAR, SPAR_NEAR);
      b.struck = !moving && sail < 0.1 && b.mastK < far * STRIKE_SHARE;
      this.writeData(b.inst, b.wrecked ? 0 : 1 - sail, b.wrecked ? 0 : b.swing, b.hi, b.brand.r, b.brand.g, b.brand.b, b.wrecked ? -2 : b.slot, b.wrecked ? 0 : b.flag, far, b.struck);

      // a house flag with the coin's emblem at the masthead of the bigger hulls at rest (sails furled)
      // (aground on the Shoals: a distress signal instead, every hull)
      const distress = ph === PH_ANCHORED && sim?.slotOf(i)?.kind === "shoals";
      if (this.flags && !moving && !b.wrecked && !b.struck && b.visible && b.dist < tier.flagRange && (distress || (b.loa >= 12.5 && b.slot >= 0 && ph !== PH_ANCHORED))) {
        this.v.copy(b.variant.masthead).applyMatrix4(this.m4);
        this.flags.add(this.v.x, this.v.y + 0.35, this.v.z, Math.min(3.8, Math.max(1.4, b.loa * (b.loa < 15 ? 0.11 : 0.13))), downwind, Math.atan2(cam.position.x - x, cam.position.z - z), distress ? -3 : b.slot, b.phi * 3);
      }

      // night: under way, masthead + red/green sidelights (+ the stern light); anchored, an anchor light;
      // moored, only some hulls show a dim one. Stern / anchor lamps are lit only with a peg reading.
      if (glowK > 0.001 && b.visible && !b.wrecked && (moving || (ph === PH_ANCHORED && b.reading) || b.lit)) {
        const v = b.variant, rl = this.riding;
        const lampAt = this.lampAt;
        if (moving) {
          const mh = lampAt(v.masthead.x, v.masthead.y, v.masthead.z);
          rl.add(mh.x, mh.y, mh.z, LAMP_WARM.r * 5, LAMP_WARM.g * 5, LAMP_WARM.b * 5, 0.42, h0, 0.6);
          const bx = v.bowCleat.x * 0.7, by = v.bowCleat.y + 0.55, bz = v.beam * 0.42;
          const pl = lampAt(bx, by, -bz);
          rl.add(pl.x, pl.y, pl.z, LAMP_RED.r * 3.2, LAMP_RED.g * 3.2, LAMP_RED.b * 3.2, 0.3, h0, 0.7);
          const sl = lampAt(bx, by, bz);
          rl.add(sl.x, sl.y, sl.z, LAMP_GREEN.r * 2.8, LAMP_GREEN.g * 2.8, LAMP_GREEN.b * 2.8, 0.3, h0, 0.7);
          if (b.reading) {
            const sp = lampAt(v.sternCleat.x, v.sternCleat.y + 0.9, 0);
            rl.add(sp.x, sp.y, sp.z, LAMP_WARM.r * 2.2, LAMP_WARM.g * 2.2, LAMP_WARM.b * 2.2, 0.26, h0, 0.8);
          }
        } else {
          const k = ph === PH_ANCHORED ? 1.3 : 0.65;
          // rig struck far away: the anchor lamp hangs low in the forestay's place, not on thin air
          const mh = b.struck ? lampAt(v.bowCleat.x * 0.8, v.bowCleat.y + 1.2, 0) : lampAt(v.masthead.x, v.masthead.y, v.masthead.z);
          rl.add(mh.x, mh.y, mh.z, LAMP_WARM.r * k, LAMP_WARM.g * k, LAMP_WARM.b * k, ph === PH_ANCHORED ? 0.26 : 0.17, h0, 0.5);
        }
      }

      // wake: moving hulls trail a Kelvin wake; moored hulls stamp contact darkening (tiny velocity carries the heading)
      const spd = Math.hypot(b.vx, b.vz);
      if (wake && !b.wrecked) {
        if (moving && spd > 0.15) { wake.stamp(x, z, b.vx, b.vz, hb, 1, b.loa * 0.5); st.moving++; }
        else if (ph === PH_ANCHORED) {
          // aground: surf breaks and churns round the hull, pulsing with the swell
          const surge = 0.5 + 0.5 * Math.sin(time * 1.4 + b.phi);
          wake.stamp(x, z, fx * 0.002, fz * 0.002, hb * (1.6 + 0.4 * surge), 1.4 + 0.6 * surge, b.loa * 0.7);
        } else if (tier.contact || b.visible) wake.stamp(x, z, fx * 0.002, fz * 0.002, hb, 0.9, b.loa * 0.5);
        st.wakes++;
      }
      if (ph === PH_DOCKED || ph === PH_MOORED) st.docked++;

      // mooring lines (near the camera only: they are a close-zoom read)
      if (slots && !b.wrecked && b.visible && b.dist < tier.lineRange) {
        const si = pose!.slot[i];
        const s = si >= 0 ? slots[si] : undefined;
        if (s) this.mooringLines(b, s, x, z, pose!.lines[i], bob);
      }
    }

    // hulks lie still on the dry strand (set once: they never move)
    if (!this.wrecksPosed) {
      this.wrecksPosed = true;
      for (const w of this.wreckInst) {
        this.e.set(w.heel, w.h - Math.PI / 2, w.pitch, "YZX");
        this.m4.compose(this.v.set(w.x, w.y, w.z), this.q.setFromEuler(this.e), this.s.setScalar(w.scale));
        mesh.setMatrixAt(w.inst, this.m4);
      }
    }

    // buoys bob on the swell (still under reduced motion)
    for (const bu of this.buoyInst) {
      const y = this.seaH(bu.x, bu.z);
      this.e.set(Math.sin(time * 1.3 + bu.phi) * 0.06, bu.phi, Math.sin(time * 1.1 + bu.phi * 2) * 0.06, "YZX");
      this.m4.compose(this.v.set(bu.x, y - 0.05, bu.z), this.q.setFromEuler(this.e), this.s.setScalar(1));
      mesh.setMatrixAt(bu.inst, this.m4);
    }

    // rope colour follows the light
    const u = ctx.uniforms;
    const light = this.v.set(
      u.uHemiSky.value.r * 1.6 + u.uSunColor.value.r * 0.12,
      u.uHemiSky.value.g * 1.6 + u.uSunColor.value.g * 0.12,
      u.uHemiSky.value.b * 1.6 + u.uSunColor.value.b * 0.12,
    );
    this.lines.end(this.ropeLight.setRGB(Math.min(1, light.x), Math.min(1, light.y), Math.min(1, light.z)));
    this.fenders?.end();
    this.riding.end(glowK, Math.min(1, (sim?.wind.strength ?? 0.35) * 1.4));
    if (this.flags) {
      const dim = 1 - 0.72 * u.uNight.value;
      const fl = this.flagLight.setRGB(
        Math.min(1.1, u.uHemiSky.value.r * 1.1 + u.uSunColor.value.r * 0.42) * dim,
        Math.min(1.1, u.uHemiSky.value.g * 1.1 + u.uSunColor.value.g * 0.42) * dim,
        Math.min(1.1, u.uHemiSky.value.b * 1.1 + u.uSunColor.value.b * 0.42) * dim,
      );
      this.flags.end(fl, sim?.wind.strength ?? 0.35);
    }
    this.uniforms.uFleetData.value.needsUpdate = true;

    this.updateRing(frame, ctx);
    this.cpuMs += (performance.now() - t0 - this.cpuMs) * 0.1;
    if (this.debug) this.updateDebug(frame, ctx, sim);
  }

  /**
   * Lines from the sim's `lines` (0..1): thrown from the deck once she is in (bow line, then stern line,
   * then the spring), arcing over and dropping into their sag on the bollard; hauled back aboard before
   * she casts off.
   */
  private mooringLines(b: BoatRec, s: NonNullable<HarbourSim["layout"]["slots"][number]>, x: number, z: number, lines: number, bob: number): void {
    const v = b.variant, sc = b.scale;
    if (s.kind === "berth") {
      if (b.bollardSlot !== s.index) {
        b.bollardSlot = s.index;
        const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
        const sx = -fz, sz = fx; // starboard (-cos h, sin h)
        const pier = this.piers.get(s.id.split("/")[0]);
        const bx = s.x + fx * (v.bowCleat.x * sc + b.loa * 0.25) + sx * v.bowCleat.z * sc, bz = s.z + fz * (v.bowCleat.x * sc + b.loa * 0.25) + sz * v.bowCleat.z * sc;
        const tx = s.x + fx * (v.sternCleat.x * sc - b.loa * 0.25), tz = s.z + fz * (v.sternCleat.x * sc - b.loa * 0.25);
        b.bow = bollardFor(this.layout!, pier, bx, bz, Math.max(8, b.loa * 0.6));
        b.stern = bollardFor(this.layout!, pier, tx, tz, Math.max(8, b.loa * 0.6));
        // bow-in to a quay with nothing alongside (a Mediterranean berth): two crossed bow lines to the
        // quay and a lazy line from the stern down to its mooring block, never a rope across the water
        const side = bollardFor(this.layout!, pier, s.x + sx * b.beam * 0.9, s.z + sz * b.beam * 0.9, b.beam * 0.6);
        b.med = s.mode === "finger" && !side && !!b.bow;
        if (b.med && b.bow) {
          // her bollard sits on the quay dead ahead of the bow (one per berth): both bow lines go to it
          b.bow = bollardFor(this.layout!, pier, s.x + fx * (b.loa * 0.5 + 1.2), s.z + fz * (b.loa * 0.5 + 1.2), Math.max(8, b.loa * 0.6)) ?? b.bow;
          b.stern = [s.x - fx * b.loa * 1.25, -0.6, s.z - fz * b.loa * 1.25];
        }
      }
      // never a line stretched to a berth she is not at (stale holds, re-plans)
      const d = Math.hypot(x - s.x, z - s.z);
      const near = 1 - THREE.MathUtils.smoothstep(d, b.loa * 0.25, b.loa * 0.9);
      if (near <= 0 || lines <= 0.001) return;
      const kb = Math.min(near, THREE.MathUtils.smoothstep(lines, 0, 0.4));
      const kt = Math.min(near, THREE.MathUtils.smoothstep(lines, 0.3, 0.72));
      if (b.bow && kb > 0) {
        if (b.med) {
          // a Mediterranean berth: port and starboard bow lines in a V to her bollard, the second a beat later
          for (let k = -1; k <= 1; k += 2) {
            const kk = k < 0 ? kb : Math.max(0, (kb - 0.25) / 0.75);
            if (kk <= 0) continue;
            this.v.set(v.bowCleat.x * 0.86, v.bowCleat.y, v.beam * 0.3 * k).applyMatrix4(this.m4);
            this.lines.throwLine(this.v.x, this.v.y, this.v.z, b.bow[0], b.bow[1], b.bow[2], kk);
          }
        } else { this.v.copy(v.bowCleat).applyMatrix4(this.m4); this.lines.throwLine(this.v.x, this.v.y, this.v.z, b.bow[0], b.bow[1], b.bow[2], kb); }
      }
      if (b.stern && kt > 0) { this.v.copy(v.sternCleat).applyMatrix4(this.m4); this.lines.throwLine(this.v.x, this.v.y, this.v.z, b.stern[0], b.stern[1], b.stern[2], kt); }
      // fenders over the side once she is in (alongside: the quay side; in a slip: both sides)
      if (this.fenders && b.dist < this.tier.fenderRange) {
        let side = 0;
        if (s.mode === "alongside" && s.warp) side = -s.warp[0] * -Math.cos(s.heading) + -s.warp[1] * Math.sin(s.heading) > 0 ? 1 : -1;
        this.fenders.add(this.m4, v.loa, v.beam / 2, v.bowCleat.y, side, THREE.MathUtils.smoothstep(lines, 0.1, 0.5) * near, b.phi + this.time * 0.8);
      }
      // alongside: a spring from amidships aft to the stern bollard, made fast last
      if (s.mode === "alongside" && b.stern) {
        const ks = Math.min(near, THREE.MathUtils.smoothstep(lines, 0.66, 1));
        this.v.set(v.bowCleat.x * 0.25, v.bowCleat.y, v.bowCleat.z).applyMatrix4(this.m4);
        if (ks > 0) this.lines.throwLine(this.v.x, this.v.y, this.v.z, b.stern[0], b.stern[1], b.stern[2], ks);
      }
      return;
    }
    if (s.swing > 0) {
      const d = Math.hypot(x - s.x, z - s.z);
      const k = Math.min(1 - THREE.MathUtils.smoothstep(d, s.swing + b.loa * 0.35, s.swing + b.loa * 1.4), THREE.MathUtils.smoothstep(lines, 0, 0.6));
      if (k <= 0) return;
      this.v.copy(v.bowCleat).applyMatrix4(this.m4);
      // a buoy ring for moorings; the anchor rode enters the water for the far anchorage and the Shoals
      const ay = s.kind === "mooring" ? bob + 0.85 : bob - 0.1;
      this.lines.add(s.x, ay, s.z, this.v.x, this.v.y, this.v.z, k);
    }
  }

  // ------------------------------------------------------------------ selection ring

  private makeRing(): THREE.Mesh {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uK: { value: 0 }, uNight: this.ctx!.uniforms.uNight },
      vertexShader: /* glsl */ `varying vec2 vQ; void main() { vQ = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uK, uNight; varying vec2 vQ;
        void main() {
          float r = length(vQ);
          float d0 = (r - 0.86) / 0.035, d2 = (r - 0.97) / 0.03;
          float ring = exp(-d0 * d0);
          float h1 = 1.0 - smoothstep(0.0, 0.22, abs(r - 0.86));
          float halo = h1 * h1 * 0.16;
          float a = atan(vQ.y, vQ.x);
          float ticks = smoothstep(0.55, 0.95, cos(a * 24.0 + uTime * 0.25)) * exp(-d2 * d2) * 0.4;
          float pulse = 0.85 + 0.15 * sin(uTime * 2.0);
          vec3 col = mix(vec3(1.0, 0.86, 0.58), vec3(1.0, 0.8, 0.5), uNight);
          float mask = 1.0 - smoothstep(0.96, 1.0, r);
          gl_FragColor = vec4(col * (ring * pulse + halo + ticks) * mask * uK * (0.65 + 1.0 * uNight), 1.0);
        }`,
      // additive colour, alpha untouched (later passes read the frame's alpha)
      transparent: true, depthWrite: false, blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    // a unit quad in its own xy (vQ), laid flat on the water
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const m = new THREE.Mesh(g, mat);
    m.rotation.x = -Math.PI / 2;
    m.name = "harbour-selection-ring";
    m.renderOrder = 3;
    m.frustumCulled = false;
    m.visible = false;
    return m;
  }

  private updateRing(frame: FrameState, ctx: EngineContext): void {
    const ring = this.ring;
    if (!ring) return;
    const b = this.selected ? this.byId.get(this.selected) : undefined;
    this.ringK += ((b ? 1 : 0) - this.ringK) * (1 - Math.exp(-frame.delta * 5));
    ring.visible = this.ringK > 0.01 && !!b;
    if (!b || !ring.visible) return;
    const ocean = ctx.services.get("ocean") as OceanService | undefined;
    const y = (ocean ? ocean.heightAt(b.cx, b.cz) : 0) + 0.3;
    ring.position.set(b.cx, y, b.cz);
    ring.scale.setScalar(Math.max(4, b.loa * 0.66));
    const m = ring.material as THREE.ShaderMaterial;
    m.uniforms.uTime.value = frame.elapsed;
    m.uniforms.uK.value = this.ringK;
  }

  // ------------------------------------------------------------------ picking

  private pickingService(): PickingService {
    const ray = new THREE.Ray();
    const ndc = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    const sph = new THREE.Sphere();
    const segB = new THREE.Vector3(), pOnRay = new THREE.Vector3(), pOnSeg = new THREE.Vector3();
    const toNdc = (clientX: number, clientY: number): boolean => {
      const r = this.canvasRect();
      if (r.width <= 0 || r.height <= 0) return false;
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1, 0.5);
      return true;
    };
    return {
      pick: (cx, cy) => {
        const ctx = this.ctx;
        if (!ctx || !toNdc(cx, cy)) return null;
        const cam = ctx.camera;
        ray.origin.copy(cam.position);
        ray.direction.copy(ndc).unproject(cam).sub(cam.position).normalize();
        let best: PickHit | null = null, bestT = Infinity;
        for (const b of this.boats) {
          if (!b.visible) continue;
          // a slim capsule-ish test: the hull sphere, shrunk toward the mast line for long hulls
          sph.center.set(b.cx, b.cy, b.cz); sph.radius = Math.max(b.r * 0.75, 3);
          const hit = ray.intersectSphere(sph, tmp);
          if (!hit) continue;
          const t = tmp.distanceTo(ray.origin);
          if (t < bestT) { bestT = t; best = { kind: "boat", id: b.id }; }
        }
        if (best) return best;
        for (const lm of this.layout?.landmarks ?? []) {
          const r = lm.footprint / 2;
          // vertical axis from the ground up: tall things are picked on their body, zones on their footprint
          const hgt = lm.footprint <= 30 ? Math.max(6, lm.footprint * 1.4) : 2;
          const segA = tmp.set(lm.position[0], lm.position[1], lm.position[2]);
          segB.set(lm.position[0], lm.position[1] + hgt, lm.position[2]);
          const d2 = ray.distanceSqToSegment(segA, segB, pOnRay, pOnSeg);
          if (d2 > r * r) continue;
          const t = pOnRay.distanceTo(ray.origin);
          if (t < bestT) { bestT = t; best = { kind: "landmark", id: lm.id }; }
        }
        return best;
      },
      screenPosition: (kind, id) => {
        const ctx = this.ctx;
        if (!ctx) return { x: 0, y: 0, visible: false };
        if (kind === "boat") {
          const b = this.byId.get(id);
          if (!b) return { x: 0, y: 0, visible: false };
          tmp.set(b.cx, b.cy - b.top * 0.4 + b.top, b.cz);
        } else {
          const lm = this.layout?.landmarks.find((l) => l.id === id);
          if (!lm) return { x: 0, y: 0, visible: false };
          tmp.set(lm.position[0], lm.position[1] + (lm.footprint <= 30 ? lm.footprint * 1.2 : 4), lm.position[2]);
        }
        tmp.project(ctx.camera);
        const r = this.canvasRect();
        const x = r.left + (tmp.x * 0.5 + 0.5) * r.width, y = r.top + (-tmp.y * 0.5 + 0.5) * r.height;
        const visible = tmp.z > -1 && tmp.z < 1 && Math.abs(tmp.x) <= 1 && Math.abs(tmp.y) <= 1;
        return { x, y, visible };
      },
      setHover: (id) => { this.hover = id; },
      setSelected: (id) => { this.selected = id; },
    };
  }

  /** The canvas' client rect, read once per resize (getBoundingClientRect allocates and forces layout). */
  private rect: { left: number; top: number; width: number; height: number } | null = null;
  private canvasRect(): { left: number; top: number; width: number; height: number } {
    if (!this.rect) {
      const r = this.ctx!.renderer.domElement.getBoundingClientRect();
      this.rect = { left: r.left, top: r.top, width: r.width, height: r.height };
    }
    return this.rect;
  }

  resize(): void { this.rect = null; }

  // ------------------------------------------------------------------ dev overlay

  private updateDebug(frame: FrameState, ctx: EngineContext, sim: HarbourSim | undefined): void {
    this.auditTimer -= frame.delta;
    if (this.auditTimer <= 0) { this.auditTimer = 0.5; this.runAudit(ctx); }
    this.debugTimer -= frame.delta;
    if (this.debugTimer > 0) return;
    this.debugTimer = 0.25;
    const s = this.stats, st = sim?.stats;
    const lights = this.riding.count;
    this.debug!.textContent = [
      `fleet  boats ${this.boats.length} · wrecks ${this.wreckInst.length} · buoys ${this.buoyInst.length}`,
      `view   visible ${s.visible} (full ${s.full} · lod ${s.lod}) · cast shadows ${this.mesh!.castShadow ? "on" : "off"}`,
      `sim    under way ${st?.underWay ?? 0} · docked ${st?.docked ?? 0} · moored ${st?.moored ?? 0} · anchored ${st?.anchored ?? 0} · voyages ${st?.voyages ?? 0}`,
      `fx     wakes ${s.wakes} (moving ${s.moving}) · lines ${this.lines.lines} · riding lights ${lights}`,
      `cpu    ${this.cpuMs.toFixed(2)} ms/frame · draws (scene) ${window.__harbourStats?.drawCalls ?? "?"}`,
      `audit  hull overlaps ${this.audit.hull} · on land/piers ${this.audit.land}${this.audit.worst ? ` · ${this.audit.worst}` : ""}`,
    ].join("\n");
  }

  /** Hull capsules vs each other and vs the static island (ground height field). Dev only. */
  private runAudit(ctx: EngineContext): void {
    const ground = ctx.services.get("ground") as GroundService | undefined;
    const cell = 24, grid = new Map<number, BoatRec[]>();
    const key = (x: number, z: number) => (Math.floor(x / cell) + 512) * 4096 + (Math.floor(z / cell) + 512);
    let hull = 0, land = 0, worst = "", worstD = 0;
    for (const b of this.boats) {
      if (b.wrecked) continue;
      const k = key(b.cx, b.cz);
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(b);
    }
    const seg = (b: BoatRec): [number, number, number, number, number] => {
      this.mesh!.getMatrixAt(b.inst, this.m4);
      const e = this.m4.elements; // column 0 = scaled bow axis
      const l = Math.hypot(e[0], e[2]) || 1, fx = e[0] / l, fz = e[2] / l;
      const hl = Math.max(0, b.loa * 0.5 - b.beam * 0.5);
      return [b.cx - fx * hl, b.cz - fz * hl, b.cx + fx * hl, b.cz + fz * hl, b.beam * 0.45];
    };
    for (const b of this.boats) {
      if (b.wrecked) continue;
      const [ax, az, bx, bz, r] = seg(b);
      const gb = ground?.bounds;
      if (ground && gb && b.cx > gb[0] && b.cx < gb[2] && b.cz > gb[1] && b.cz < gb[3]) {
        for (const t of [0.0, 0.5, 1.0]) {
          const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
          const gh = ground.heightAt(px, pz);
          if (gh > 0.35) { land++; if (gh > worstD) { worstD = gh; worst = `${b.id} on land/pier (+${gh.toFixed(1)} m)`; } break; }
        }
      }
      const gx = Math.floor(b.cx / cell), gz = Math.floor(b.cz / cell);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        for (const o of grid.get((gx + i + 512) * 4096 + (gz + j + 512)) ?? []) {
          if (o.inst <= b.inst) continue;
          const [cx, cz, dx, dz, r2] = seg(o);
          const d = segDist(ax, az, bx, bz, cx, cz, dx, dz);
          const pen = r + r2 - d;
          if (pen > 0.3) { hull++; if (pen > worstD) { worstD = pen; worst = `${b.id} × ${o.id} (${pen.toFixed(1)} m)`; } }
        }
      }
    }
    this.audit = { hull, land, worst };
  }

  dispose(ctx: EngineContext): void {
    if (this.mesh) { ctx.scene.remove(this.mesh); this.mesh.dispose(); }
    if (this.lines) { ctx.scene.remove(this.lines.object); this.lines.dispose(); }
    if (this.ring) { ctx.scene.remove(this.ring); this.ring.geometry.dispose(); (this.ring.material as THREE.Material).dispose(); }
    if (this.riding) { ctx.scene.remove(this.riding.object); this.riding.dispose(); }
    if (this.fenders) { ctx.scene.remove(this.fenders.mesh); this.fenders.dispose(); }
    if (this.flags) { ctx.scene.remove(this.flags.mesh); this.flags.dispose(); }
    this.material?.dispose(); this.depth?.dispose();
    this.atlas?.dispose();
    this.uniforms.uFleetData.value.dispose();
    this.uniforms.uFleetPaint.value.dispose();
    this.debug?.remove();
    this.unsubQuality?.(); this.unsubQuality = null;
    ctx.services.delete("picking");
  }
}

function segDist(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): number {
  // closest distance between 2D segments AB and CD (sampled exact enough for an audit)
  let best = Infinity;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
    const ex = dx - cx, ez = dz - cz, L2 = ex * ex + ez * ez || 1;
    const u = Math.min(1, Math.max(0, ((px - cx) * ex + (pz - cz) * ez) / L2));
    best = Math.min(best, Math.hypot(px - (cx + ex * u), pz - (cz + ez * u)));
  }
  return best;
}
