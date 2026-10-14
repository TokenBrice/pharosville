import * as THREE from "three";
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import type { HarbourLayout, HullClass, Pier } from "../layout/types";
import type { LightsService } from "../lights/lights-service";
import type { HarbourModel } from "../model/types";
import type { OceanService } from "../ocean/ocean-system";
import type { WakeService } from "../ocean/wake";
import type { HarbourSim } from "../sim/sim";
import { PH_APPROACHING, PH_CASTING_OFF, PH_DOCKED, PH_MOORED, PH_SAILING } from "../sim/sim";
import type { GroundService } from "../world/ground";
import { getHarbourMaterials } from "../world/materials";
import { EmblemAtlas } from "./emblems";
import { createFleetMaterials, type FleetUniforms } from "./fleet-material";
import { loadKit, type HullVariant, type Kit } from "./hull-kit";
import { bollardFor, MooringLines } from "./mooring-lines";
import { approach, indexVariants, pickVariant, targetSwing, wreckScale, type VariantIndex } from "./variants";

/**
 * FleetSystem: every stablecoin's hull, in ONE BatchedMesh multi-draw (+ its shadow pass), posed every
 * frame from the 'sim' service: hull variant by peg family × supply class (kit manifest), LOD hull when
 * small on screen, furl morph, boom swing + tack mirroring, heel from the sim plus swell bob/pitch/roll
 * from ocean.heightAt, brand boot-top/pennant/cover tint, the coin emblem on the mainsail. Also:
 * wake stamps, mooring lines, riding lights, Wreck Cove hulks, mooring buoys, and the 'picking' service.
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

const MAX_RIDING = 32;
/** Anchor/stern lights are small oil lamps: dimmer and warmer than the quay lamps (sprite and water pillar scale with it). */
const RIDING_COLOR = new THREE.Color("#FFE0AE").multiplyScalar(0.32);
/** Riding lights come on with the town (uWindowGlow), not at the first hint of golden hour. */
const RIDING_GLOW = 0.3;
const LOD_PX_IN = 40, LOD_PX_OUT = 34;
const LINE_RANGE = 650;
const WRECK_KITS = ["wreck_a", "wreck_b", "wreck_c"];
const BUOY_KIT = "mooring_buoy";
const DATA_W = 256;
const CLASS_LOA_FALLBACK: Record<HullClass, number> = { flagship: 26, large: 18, medium: 13, small: 10, boat: 7.5, skiff: 5 };

const hash01 = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
};

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
  stern: [number, number, number] | null;
  visible: boolean;
  dist: number;
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
  private geomIds = new Map<string, number>();
  private boats: BoatRec[] = [];
  private byId = new Map<string, BoatRec>();
  private wreckInst: number[] = [];
  private buoyInst: Array<{ inst: number; x: number; z: number; phi: number }> = [];
  private model: HarbourModel | null = null;
  private layout: HarbourLayout | null = null;
  private piers = new Map<string, Pier>();
  private lines!: MooringLines;
  private ridingIds: number[] = [];
  private ridingOn = 0;
  private ridingPick: Array<{ b: BoatRec; stern: boolean }> = [];
  private ridingTimer = 0;
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

  constructor() {
    const dt = new THREE.DataTexture(new Float32Array(DATA_W * 4 * 4), DATA_W, 4, THREE.RGBAFormat, THREE.FloatType);
    dt.needsUpdate = true;
    this.uniforms = {
      uFleetData: { value: dt },
      uEmblems: { value: new THREE.Texture() },
      uEmblemGrid: { value: new THREE.Vector4(32, 1, 1 / 32, 1) },
      uWind: { value: 0.35 },
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
    this.ring = this.makeRing();
    ctx.scene.add(this.ring);

    // riding lights: a fixed pool, reassigned to the nearest hulls (sprites only, no ground pools)
    const lights = ctx.services.get("lights") as LightsService | undefined;
    if (lights) for (let i = 0; i < MAX_RIDING; i++) { const id = lights.add("riding", [0, -50, 0], RIDING_COLOR); lights.setOn(id, false); this.ridingIds.push(id); }

    ctx.services.set("picking", this.pickingService());
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

  private writeData(inst: number, furl: number, swing: number, hi: number, r: number, g: number, b: number, slot: number): void {
    const d = this.data, o = inst * 8;
    d[o] = furl; d[o + 1] = swing; d[o + 2] = hi; d[o + 3] = 0;
    d[o + 4] = r; d[o + 5] = g; d[o + 6] = b; d[o + 7] = slot;
  }

  // ------------------------------------------------------------------ model → instances

  private install(model: HarbourModel): void {
    const mesh = this.mesh!, kit = this.kit!, layout = this.layout!;
    this.model = model;
    const old = this.byId;
    for (const b of this.boats) mesh.deleteInstance(b.inst);
    for (const w of this.wreckInst) mesh.deleteInstance(w);
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
        brand, bollardSlot: -2, bow: null, stern: null, visible: false, dist: 0, cx: 0, cy: 0, cz: 0, r: loa * 0.5, top: variant.top * scale,
      };
      this.boats.push(rec);
      this.byId.set(rec.id, rec);
    }
    this.placeWrecks(model);
    this.placeBuoys();
  }

  /** Dead coins (readings.wrecks) that are not payload boats: grey hulks on the Wreck Cove slots, biggest peak cap first. */
  private placeWrecks(model: HarbourModel): void {
    const slots = this.layout!.zones.wreckCove?.slots ?? [];
    if (!slots.length) return;
    const ground = this.ctx?.services.get("ground") as GroundService | undefined;
    const live = new Set(model.boats.map((b) => b.id));
    const dead = model.readings.wrecks.filter((w) => !live.has(w.id)).sort((a, b) => (b.peakMcap ?? 0) - (a.peakMcap ?? 0));
    // biggest wrecks take the "large" slots, then medium, then small
    const order = [...slots].sort((a, b) => CLASS_LOA_FALLBACK[b.class] - CLASS_LOA_FALLBACK[a.class]);
    const kit = this.kit!;
    for (let i = 0; i < Math.min(order.length, dead.length); i++) {
      const s = order[i], w = dead[i];
      const kid = WRECK_KITS[(i * 7 + Math.floor(hash01(w.id) * 3)) % 3];
      const geom = this.geomIds.get(kid);
      const prop = kit.props.get(kid);
      if (geom == null || !prop) continue;
      const scale = (CLASS_LOA_FALLBACK[s.class] / prop.loa) * wreckScale(w.peakMcap);
      const inst = this.addInstance(geom);
      const gy = ground ? ground.heightAt(s.position[0], s.position[2]) : 0;
      // beached: settle onto the strand (or sit at the waterline when the slot is in the shallows)
      const y = Math.max(-0.35, Math.min(gy, 1.2) - 0.25);
      this.e.set(0, s.headingRad - Math.PI / 2, (hash01(w.id + "#r") - 0.5) * 0.08, "YZX");
      this.m4.compose(this.v.set(s.position[0], y, s.position[2]), this.q.setFromEuler(this.e), this.s.setScalar(scale));
      this.mesh!.setMatrixAt(inst, this.m4);
      this.writeData(inst, 0, 0, 0, 0.5, 0.5, 0.5, -1);
      this.wreckInst.push(inst);
    }
  }

  private placeBuoys(): void {
    const geom = this.geomIds.get(BUOY_KIT);
    if (geom == null) return;
    for (const m of this.layout!.moorings ?? []) {
      const inst = this.addInstance(geom);
      this.writeData(inst, 0, 0, 0, 0.8, 0.2, 0.1, -1);
      this.buoyInst.push({ inst, x: m.position[0], z: m.position[2], phi: hash01(m.id) * 6.28 });
    }
  }

  // ------------------------------------------------------------------ frame

  update(frame: FrameState, ctx: EngineContext): void {
    if (!this.mesh || this.failed) return;
    const t0 = performance.now();
    const model = ctx.services.get("model") as HarbourModel | undefined;
    const sim = ctx.services.get("sim") as HarbourSim | undefined;
    if (model && model !== this.model) this.install(model);
    const ocean = ctx.services.get("ocean") as OceanService | undefined;
    const wake = ctx.services.get("wake") as WakeService | undefined;
    const cam = ctx.camera;
    this.pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    const viewH = ctx.renderer.domElement.clientHeight || innerHeight;
    const pxPerM = viewH / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    const time = frame.elapsed, dt = Math.max(1e-3, frame.delta);
    const H = (x: number, z: number) => (ocean ? ocean.heightAt(x, z) : 0);
    const mesh = this.mesh;
    mesh.castShadow = ctx.rig.distance < 640;

    const st = this.stats;
    st.full = 0; st.lod = 0; st.visible = 0; st.moving = 0; st.docked = 0; st.wakes = 0;
    this.lines.begin();
    const pose = sim?.pose;
    const n = pose && model && pose.count === model.boats.length ? pose.count : 0;
    const windFrom = sim?.wind.fromRad ?? -1;
    this.uniforms.uWind.value = sim?.wind.strength ?? 0.35;
    const slots = sim?.layout.slots;
    const hiK = 1 - Math.exp(-dt * 8);

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
      const heelT = b.wrecked ? 0 : pose!.heel[i];
      b.heel += (heelT - b.heel) * (1 - Math.exp(-dt * 1.2));
      const hiT = b.id === this.hover ? 1 : b.id === this.selected ? 0.5 : 0;
      b.hi += (hiT - b.hi) * hiK;

      // swell: bob, pitch, roll from the sea surface under the hull (big hulls average more)
      const fx = Math.sin(h), fz = Math.cos(h);
      const half = b.loa * 0.4, hb = b.beam * 0.5;
      const h0 = H(x, z), hBow = H(x + fx * half, z + fz * half), hSt = H(x - fx * half, z - fz * half);
      const hPort = H(x + fz * hb, z - fx * hb), hStb = H(x - fz * hb, z + fx * hb);
      const resp = Math.min(1, Math.max(0.3, 9 / b.loa));
      const idle = moving ? 0.6 : 1;
      const bob = (h0 * 0.7 + (hBow + hSt) * 0.15) + Math.sin(time * 0.9 + b.phi) * 0.035 * resp * idle;
      const pitch = Math.atan2(hBow - hSt, half * 2) * 0.8 * resp + Math.sin(time * 0.7 + b.phi * 1.3) * 0.006 * resp;
      const roll = Math.atan2(hPort - hStb, b.beam) * 0.7 * resp + Math.sin(time * 1.05 + b.phi) * 0.014 * resp * idle;

      const wreckSink = b.wrecked ? -0.4 : 0;
      this.e.set(b.heel + roll, h - Math.PI / 2, pitch, "YZX");
      this.q.setFromEuler(this.e);
      this.v.set(x, bob + wreckSink, z);
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
      let g = b.wrecked ? b.geomWreck : b.geomCur === b.geomFull ? (px < LOD_PX_OUT ? b.geomLod : b.geomFull) : (px > LOD_PX_IN ? b.geomFull : b.geomLod);
      if (b.hi > 0.05 && !b.wrecked) g = b.geomFull;
      if (g !== b.geomCur) { mesh.setGeometryIdAt(b.inst, g); b.geomCur = g; }
      if (b.visible) { st.visible++; if (g === b.geomFull) st.full++; else st.lod++; }
      this.writeData(b.inst, b.wrecked ? 0 : 1 - sail, b.wrecked ? 0 : b.swing, b.hi, b.brand.r, b.brand.g, b.brand.b, b.wrecked ? -1 : b.slot);

      // wake: moving hulls trail a Kelvin wake; moored hulls stamp contact darkening (tiny velocity carries the heading)
      const spd = Math.hypot(b.vx, b.vz);
      if (wake && !b.wrecked) {
        if (moving && spd > 0.15) { wake.stamp(x, z, b.vx, b.vz, hb, 1, b.loa * 0.5); st.moving++; }
        else wake.stamp(x, z, fx * 0.002, fz * 0.002, hb, 0.9, b.loa * 0.5);
        st.wakes++;
      }
      if (ph === PH_DOCKED || ph === PH_MOORED) st.docked++;

      // mooring lines (near the camera only: they are a close-zoom read)
      if (slots && !b.wrecked && b.visible && b.dist < LINE_RANGE) {
        const si = pose!.slot[i];
        const s = si >= 0 ? slots[si] : undefined;
        if (s) this.mooringLines(b, s, x, z, h, bob);
      }
    }

    // buoys bob on the swell
    for (const bu of this.buoyInst) {
      const y = H(bu.x, bu.z);
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
    this.lines.end(new THREE.Color(Math.min(1, light.x), Math.min(1, light.y), Math.min(1, light.z)));
    this.uniforms.uFleetData.value.needsUpdate = true;

    this.updateRiding(frame, ctx);
    this.updateRing(frame, ctx);
    this.cpuMs += (performance.now() - t0 - this.cpuMs) * 0.1;
    if (this.debug) this.updateDebug(frame, ctx, sim);
  }

  private mooringLines(b: BoatRec, s: NonNullable<HarbourSim["layout"]["slots"][number]>, x: number, z: number, _h: number, bob: number): void {
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
      }
      const d = Math.hypot(x - s.x, z - s.z);
      const k = 1 - THREE.MathUtils.smoothstep(d, b.loa * 0.12, b.loa * 0.9);
      if (k <= 0) return;
      if (b.bow) { this.v.copy(v.bowCleat).applyMatrix4(this.m4); this.lines.add(b.bow[0], b.bow[1], b.bow[2], this.v.x, this.v.y, this.v.z, k); }
      if (b.stern) { this.v.copy(v.sternCleat).applyMatrix4(this.m4); this.lines.add(b.stern[0], b.stern[1], b.stern[2], this.v.x, this.v.y, this.v.z, k); }
      return;
    }
    if (s.swing > 0) {
      const d = Math.hypot(x - s.x, z - s.z);
      const k = 1 - THREE.MathUtils.smoothstep(d, s.swing + b.loa * 0.35, s.swing + b.loa * 1.4);
      if (k <= 0) return;
      this.v.copy(v.bowCleat).applyMatrix4(this.m4);
      // a buoy ring for moorings; the anchor rode enters the water for the far anchorage and the Shoals
      const ay = s.kind === "mooring" ? bob + 0.85 : bob - 0.1;
      this.lines.add(s.x, ay, s.z, this.v.x, this.v.y, this.v.z, k);
    }
  }

  // ------------------------------------------------------------------ riding lights

  private updateRiding(frame: FrameState, ctx: EngineContext): void {
    const lights = ctx.services.get("lights") as LightsService | undefined;
    if (!lights || !this.ridingIds.length) return;
    const glow = ctx.uniforms.uWindowGlow.value;
    this.ridingTimer -= frame.delta;
    if (this.ridingTimer <= 0) {
      this.ridingTimer = 0.35;
      this.ridingPick.length = 0;
      if (glow > RIDING_GLOW) {
        // nearest first, dithered per hull so the lit set fades out instead of ending in a hard ring
        const key = (b: BoatRec) => b.dist * (0.55 + 0.9 * ((b.phi * 7.31) % 1));
        const cand = this.boats.filter((b) => b.visible && !b.wrecked).sort((a, b) => key(a) - key(b));
        for (const b of cand) {
          if (this.ridingPick.length >= MAX_RIDING) break;
          this.ridingPick.push({ b, stern: false });
          // under way: a stern light too, so moving hulls read at night
          if (Math.hypot(b.vx, b.vz) > 0.3 && this.ridingPick.length < MAX_RIDING) this.ridingPick.push({ b, stern: true });
        }
      }
      const want = this.ridingPick.length;
      for (let i = 0; i < this.ridingIds.length; i++) {
        const on = i < want;
        if ((i < this.ridingOn) !== on) lights.setOn(this.ridingIds[i], on);
      }
      this.ridingOn = want;
    }
    for (let i = 0; i < this.ridingOn; i++) {
      const { b, stern } = this.ridingPick[i];
      this.mesh!.getMatrixAt(b.inst, this.m4);
      if (stern) this.v.copy(b.variant.sternCleat).setY(b.variant.sternCleat.y + 0.9);
      else this.v.copy(b.variant.masthead);
      this.v.applyMatrix4(this.m4);
      lights.setPosition(this.ridingIds[i], this.v);
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
    const toNdc = (clientX: number, clientY: number): boolean => {
      const el = this.ctx!.renderer.domElement, r = el.getBoundingClientRect();
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
          const segB = new THREE.Vector3(lm.position[0], lm.position[1] + hgt, lm.position[2]);
          const pOnRay = new THREE.Vector3(), pOnSeg = new THREE.Vector3();
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
        const r = ctx.renderer.domElement.getBoundingClientRect();
        const x = r.left + (tmp.x * 0.5 + 0.5) * r.width, y = r.top + (-tmp.y * 0.5 + 0.5) * r.height;
        const visible = tmp.z > -1 && tmp.z < 1 && Math.abs(tmp.x) <= 1 && Math.abs(tmp.y) <= 1;
        return { x, y, visible };
      },
      setHover: (id) => { this.hover = id; },
      setSelected: (id) => { this.selected = id; },
    };
  }

  // ------------------------------------------------------------------ dev overlay

  private updateDebug(frame: FrameState, ctx: EngineContext, sim: HarbourSim | undefined): void {
    this.auditTimer -= frame.delta;
    if (this.auditTimer <= 0) { this.auditTimer = 0.5; this.runAudit(ctx); }
    this.debugTimer -= frame.delta;
    if (this.debugTimer > 0) return;
    this.debugTimer = 0.25;
    const s = this.stats, st = sim?.stats;
    const lights = this.ridingOn;
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
    const lights = ctx.services.get("lights") as LightsService | undefined;
    for (const id of this.ridingIds) lights?.remove(id);
    this.material?.dispose(); this.depth?.dispose();
    this.atlas?.dispose();
    this.uniforms.uFleetData.value.dispose();
    this.debug?.remove();
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
