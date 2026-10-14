import * as THREE from "three";
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import type { QualityService } from "../engine/quality";
import type { HarbourLayout } from "../layout/types";
import { getLightsStore } from "../lights/lights-service";
import type { LifeService } from "../life/life-system";
import type { HarbourModel } from "../model/types";
import { acquireFxTextures, type FxTextures } from "../ocean/textures";
import type { ReadingsService } from "../readings/readings-system";
import { ensureMotionService, type MotionService } from "../ui/services";
import { getHarbourMaterials } from "../world/materials";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CIVIC_BASE, loadPlot, mergeStatic, pieceCentres, toWorld, worldGeometry, type CivicManifest, type CivicPlot, type LoadedPlot } from "./assemble";
import { BurnFurnace } from "./burn";
import { applyFlowOverrides, civicFlows, workLevels, type CivicFlows, type FlowSide } from "./flows";
import { MINT_WORKERS, MintWorks } from "./mint";
import { Shipyard } from "./shipyard";
import { Workers } from "./workers";
import { launchedIds, type HullStage, type PrelaunchBook, type PrelaunchCoin } from "./yard";

/**
 * CIVIC: the P6 utility quarter (D19–D21). Loads public/harbour/civic/<kind>.glb at every layout.civic plot
 * (harbour material port, still parts merged to one draw per material, lamps/windows/furnaces into the
 * 'lights' service) and runs the three working landmarks:
 *   the Mint   chimneys, furnaces, presses, waterwheel, workers ∝ mint volume (24 h + the latest closed hour)
 *   the Burn   fire, embers, coins down the chute, plume ∝ burn volume; the darker plume when the net is negative
 *   the Yard   the registry's pre-launch coins as hulls by construction stage (src/harbour/data/prelaunch.json)
 * Stale / no flow reading: the fires bank to embers and the chimneys go quiet (the readings fog carries the rest).
 * Scope of the flows: Ethereum · Base · Arbitrum.
 *
 * Service 'civic' (read structurally by the UI, the audio and picking): see CivicService.
 * Dev only: ?mint=…&burn=… (≤ 1 an activity, else a 24 h USD volume); ?stale=mintBurn banks the fires.
 * `?civic=0` skips the quarter (A/B captures).
 */

export interface CivicPickable { kind: "landmark"; id: string; position: [number, number, number]; radius: number; coinId?: string }

export interface CivicService {
  /** Bumped when anything below changes shape (plots loaded, yard rebuilt, flows re-read). */
  readonly version: number;
  readonly mint: FlowSide;
  readonly burn: FlowSide;
  readonly net24hUsd: number | null;
  readonly scope: readonly string[];
  /** -1 the Burn dominates … +1 the Mint dominates. */
  readonly dominance: number;
  /** Stale / no reading: fires banked. */
  readonly banked: boolean;
  /** The Mint's activity 0..1 (the audio layer's mint rate). */
  readonly mintRate: number;
  readonly shipyard: ReadonlyArray<{ id: string; symbol: string; name: string; phase: string | null; expectedLaunchDate: string | null; milestones: PrelaunchCoin["milestones"]; slot: string | null; stage: HullStage; launched: boolean }>;
  /** The UI's yard book (ui/yard.ts reads coins + hullPosition). */
  readonly yard: { coins: unknown[]; hullPosition(id: string): readonly [number, number, number] | null };
  readonly pickables: readonly CivicPickable[];
  /** Loaded plot roots by plot id (e.g. the identity layer dresses crest_panel / flag_pole_top). */
  readonly plots: ReadonlyMap<string, { kind: string; root: THREE.Object3D; nodes: ReadonlyMap<string, THREE.Object3D> }>;
}

/** Civic kind → the id the UI already uses for that place (ui/places.ts CIVIC_PANEL_ID). */
const PANEL_ID: Record<string, string> = { customs: "customs-house", stormstation: "storm-mast", shipyard: "slipway" };
const TOP: Record<string, number> = { mint: 33, burn: 22, shipyard: 22, customs: 30, registry: 18, chartroom: 12, stormstation: 22, harbourmaster: 26, keeperslog: 10 };
const WORKERS = MINT_WORKERS + 30;

export class CivicSystem implements WorldSystem {
  readonly name = "civic";
  readonly group = new THREE.Group();
  private readonly q = new URLSearchParams(location.search);
  private readonly dev = import.meta.env.DEV;
  private fx: FxTextures | null = null;
  private plots: LoadedPlot[] = [];
  private mint: MintWorks | null = null;
  private burn: BurnFurnace | null = null;
  private yard: Shipyard | null = null;
  private workers: Workers | null = null;
  private motion: MotionService | null = null;
  private flows: CivicFlows = civicFlows(null);
  private model: HarbourModel | null = null;
  private readingsVersion = -1;
  private version = 0;
  private book: PrelaunchCoin[] = [];
  private pickables: CivicPickable[] = [];
  private cones: THREE.Mesh[] = [];
  private pennant: THREE.Mesh | null = null;
  /** The hoisted cones (+ pennant) as one mesh, rebuilt only when the signal changes. */
  private signal: THREE.Mesh | null = null;
  private signalKey = "";
  private lightIds: number[] = [];
  private readonly plotMap = new Map<string, { kind: string; root: THREE.Object3D; nodes: ReadonlyMap<string, THREE.Object3D> }>();
  private disposed = false;

  async init(ctx: EngineContext): Promise<void> {
    this.group.name = "civic";
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the service getters read live state
    const sys = this;
    const svc: CivicService = {
      get version() { return sys.version; },
      get mint() { return sys.flows.mint; },
      get burn() { return sys.flows.burn; },
      get net24hUsd() { return sys.flows.net24hUsd; },
      get scope() { return sys.flows.scope; },
      get dominance() { return sys.flows.dominance; },
      get banked() { return sys.flows.banked; },
      get mintRate() { return sys.flows.mint.activity; },
      get shipyard() { return sys.shipyardRows(); },
      get yard() { return sys.yardBook(); },
      get pickables() { return sys.pickables; },
      get plots() { return sys.plotMap; },
    };
    ctx.services.set("civic", svc);
    const layout = ctx.services.get("layout") as HarbourLayout | undefined;
    const plots = ((layout as { civic?: CivicPlot[] } | undefined)?.civic ?? []).filter((p) => p && typeof p.kind === "string" && Array.isArray(p.position));
    // `?civic=0` leaves the quarter empty (A/B captures)
    if (!layout || !plots.length || this.q.get("civic") === "0") return;
    this.motion = ensureMotionService(ctx);
    this.fx = acquireFxTextures(ctx);
    const mats = getHarbourMaterials(ctx);

    let manifest: CivicManifest;
    try {
      const r = await fetch(CIVIC_BASE + "manifest.json");
      if (!r.ok || !(r.headers.get("content-type") ?? "").includes("json")) throw new Error(`manifest ${r.status}`);
      manifest = (await r.json()) as CivicManifest;
    } catch (e) { console.warn("[harbour] civic manifest unavailable", e); return; }

    const load = (url: string) => ctx.assets.gltf(url);
    const loaded = await Promise.all(plots.map(async (plot) => {
      const spec = manifest.kinds[plot.kind];
      if (!spec) return null;
      try { return await loadPlot(load, mats, plot, spec); } catch (e) { console.warn(`[harbour] civic ${plot.kind} failed`, e); return null; }
    }));
    if (this.disposed) return;
    this.plots = loaded.filter((p): p is LoadedPlot => p != null);
    for (const p of this.plots) {
      this.group.add(p.root);
      this.plotMap.set(p.plot.id, { kind: p.plot.kind, root: p.root, nodes: p.nodes });
    }
    const noise = this.fx.noise;
    const lights = getLightsStore(ctx);

    // (the harbour offices' crest_panel / awning / flag_pole_top are left in place for the identity layer to dress)

    // lamps (one light per lamp glass) + a few window pools per building, before the merge takes the meshes
    for (const p of this.plots) {
      p.root.updateMatrixWorld(true);
      let wins = 0;
      p.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const name = (m.material as THREE.Material).name;
        if (name === "hb_emissive" && /_lamps$/.test(m.name)) for (const c of pieceCentres(m)) this.lightIds.push(lights.add("lamp", c));
        if (name === "hb_window" && wins < 3) {
          const cs = pieceCentres(m);
          for (let i = 0; i < cs.length && wins < 3; i += Math.max(1, Math.floor(cs.length / 3))) { this.lightIds.push(lights.add("window", cs[i])); wins++; }
        }
      });
    }

    const byKind = (k: string) => this.plots.find((p) => p.plot.kind === k) ?? null;
    const mp = byKind("mint");
    if (mp) {
      this.mint = new MintWorks(mp, noise);
      this.group.add(this.mint.group);
      for (const f of this.mint.furnaces) this.lightIds.push(lights.add("lamp", f, "#FF7A2E", 7));
      // the press hall's working lamps: the arcade reads lit and busy at night
      for (const g of this.mint.pressLamps) this.lightIds.push(lights.add("lamp", g, "#FFB15A", 6));
    }
    const bp = byKind("burn");
    if (bp) {
      this.burn = new BurnFurnace(bp, noise);
      this.group.add(this.burn.group);
      this.lightIds.push(lights.add("lamp", this.burn.bowl.clone().setY(this.burn.bowl.y + 2), "#FF6A22", 12));
    }
    const sp = byKind("stormstation");
    if (sp) {
      for (let i = 0; i < 4; i++) { const c = sp.nodes.get(`cone_${i}`) as THREE.Mesh | undefined; if (c?.isMesh) this.cones.push(c); }
      const pn = sp.nodes.get("pennant") as THREE.Mesh | undefined;
      this.pennant = pn?.isMesh ? pn : null;
      for (const m of [...this.cones, this.pennant]) if (m) m.visible = false;
    }

    // small moving parts cast no shadow (a draw each in the shadow pass for a few pixels); the gantries do
    for (const p of this.plots) p.nodes.forEach((o, name) => { if (/^(press_\d+|wheel|cone_\d+|pennant)$/.test(name)) o.castShadow = false; });

    // one draw per material for every still part of every building
    for (const m of mergeStatic(this.plots.map((p) => p.root))) this.group.add(m);
    ctx.scene.add(this.group);

    this.workers = new Workers(mats, WORKERS, 17);
    this.group.add(this.workers.mesh);

    // the yard builds behind the first frame (its order book, the stage hulls, the kit hulls and the logos)
    const yp = byKind("shipyard"), stageSpec = manifest.kinds["hull-stages"];
    if (yp && stageSpec) void this.buildYard(yp, stageSpec, layout, mats, load);
    this.buildPickables();
    this.version++;
  }

  private async buildYard(yp: LoadedPlot, stageSpec: CivicManifest["kinds"][string], layout: HarbourLayout,
    mats: ReturnType<typeof getHarbourMaterials>, load: (url: string) => ReturnType<EngineContext["assets"]["gltf"]>): Promise<void> {
    try {
      const bookMod = (await import("../data/prelaunch.json")) as unknown as { default?: PrelaunchBook } & PrelaunchBook;
      this.book = (bookMod.default ?? bookMod).coins ?? [];
      const lp = (layout.zones as { slipway?: { launchPath?: number[][] } }).slipway?.launchPath?.[0];
      const yard = await Shipyard.build(yp, mats, this.book, stageSpec, load, lp ? [lp[0], lp[1]] : null);
      if (this.disposed) { yard.dispose(); return; }
      this.yard = yard;
      this.group.add(yard.group);
      if (this.model) yard.setLaunched(launchedIds(this.book, new Set(this.model.boats.map((b) => b.id))));
      this.buildPickables();
      this.version++;
    } catch (e) { console.warn("[harbour] shipyard failed", e); }
  }

  private shipRows: CivicService["shipyard"] = [];
  private shipRowsFor = -1;
  private shipyardRows(): CivicService["shipyard"] {
    if (this.shipRowsFor === this.version) return this.shipRows;
    this.shipRowsFor = this.version;
    return this.shipRows = (this.yard?.hulls ?? []).map((h) => ({
      id: h.coin.id, symbol: h.coin.symbol, name: h.coin.name, phase: h.coin.launchPhase, expectedLaunchDate: h.coin.expectedLaunchDate,
      milestones: h.coin.milestones, slot: h.slot ? `${h.slot.kind} ${h.slot.index + 1}` : null, stage: h.stage, launched: h.launched,
    }));
  }

  private yardRows: unknown[] = [];
  private yardRowsFor = -1;
  private yardBook(): CivicService["yard"] {
    if (this.yardRowsFor !== this.version) {
      this.yardRowsFor = this.version;
      this.yardRows = (this.yard?.hulls ?? []).filter((h) => !h.launched).map((h) => ({ ...h.coin, phase: h.coin.launchPhase, stage: h.stage, slot: h.slot ? `${h.slot.kind} ${h.slot.index + 1}` : null }));
    }
    const hulls = this.yard?.hulls ?? [];
    return { coins: this.yardRows, hullPosition: (id: string) => hulls.find((h) => h.coin.id === id && !h.launched)?.position ?? null };
  }

  private buildPickables(): void {
    const out: CivicPickable[] = [];
    for (const p of this.plots) {
      const kind = p.plot.kind;
      if (kind.startsWith("harbour-office:")) continue; // the harbour picks those (their piers / hamlets)
      const top = TOP[kind] ?? 14;
      const c = toWorld(p.root, [0, top * 0.45, 0]);
      out.push({ kind: "landmark", id: PANEL_ID[kind] ?? kind, position: [c.x, c.y, c.z], radius: Math.max(p.plot.footprint[0], p.plot.footprint[1]) * 0.42 });
    }
    for (const h of this.yard?.hulls ?? []) {
      if (h.position && !h.launched) out.push({ kind: "landmark", id: "slipway", coinId: h.coin.id, position: h.position, radius: h.radius });
    }
    this.pickables = out;
  }

  update(frame: FrameState, ctx: EngineContext): void {
    const dt = frame.delta;
    const moving = !(this.motion?.reduced ?? false);
    const u = ctx.uniforms;

    // flows: the model's 24 closed hours + the readings' stale flag (which carries ?stale=mintBurn)
    const model = ctx.services.get("model") as HarbourModel | undefined;
    const readings = ctx.services.get("readings") as ReadingsService | undefined;
    if ((model && model !== this.model) || (readings && readings.version !== this.readingsVersion)) {
      const fresh = model !== this.model;
      this.model = model ?? this.model;
      this.readingsVersion = readings?.version ?? -1;
      const f = this.model?.readings.flows;
      let c = civicFlows(f ? { ...f, stale: f.stale || (readings?.flows.stale ?? false) } : null);
      if (this.dev) c = applyFlowOverrides(c, this.q);
      this.flows = c;
      if (fresh && this.yard && this.model) {
        this.yard.setLaunched(launchedIds(this.book, new Set(this.model.boats.map((b) => b.id))));
        this.buildPickables();
      }
      this.version++;
    }
    if (!this.plots.length) return;

    const life = ctx.services.get("life") as LifeService | undefined;
    const windTo = life?.windTo ?? [0.84, -0.54], wind = life?.wind ?? 0.35;
    const levels = workLevels(this.flows);
    const banked = this.flows.banked;
    const vh = u.uResolution.value.y / Math.max(1, ctx.renderer.getPixelRatio());
    this.mint?.update(dt, levels.mint, banked, moving, windTo, wind, u);
    this.burn?.update(dt, levels.burn, this.flows.dominance, banked, moving, windTo, wind, u, ctx.camera, vh);
    this.yard?.update(dt, moving, u.uNight.value, { to: windTo, k: wind }, ctx.camera, vh);

    // the storm station: cones = the DEWS level, the pennant at Danger (no reading: nothing hoisted)
    if (this.cones.length || this.pennant) {
      const n = readings?.cones ?? 0, pen = readings?.pennant ?? false;
      const key = `${n}:${pen}`;
      if (key !== this.signalKey) { this.signalKey = key; this.hoist(n, pen); }
    }

    if (this.workers) {
      const tier = (ctx.services.get("quality") as QualityService | undefined)?.tier ?? "high";
      const slots = this.workers.slots;
      const mintSlots = slots.slice(0, MINT_WORKERS), yardSlots = slots.slice(MINT_WORKERS);
      if (this.mint) this.mint.workers(mintSlots, dt, moving); else mintSlots.forEach((s) => { s.visible = false; });
      if (this.yard) this.yard.workers(yardSlots); else yardSlots.forEach((s) => { s.visible = false; });
      if (tier === "low") slots.forEach((s, i) => { if (i % 2) s.visible = false; });
      // a quiet yard at night: half the gang has gone home
      if (u.uNight.value > 0.5) yardSlots.forEach((s, i) => { if (i % 2) s.visible = false; });
      this.workers.update(dt, moving);
    }
  }

  private hoist(n: number, pennant: boolean): void {
    if (this.signal) { this.group.remove(this.signal); this.signal.geometry.dispose(); this.signal = null; }
    const parts = this.cones.slice(0, n);
    if (pennant && this.pennant) parts.push(this.pennant);
    if (!parts.length) return;
    const geos = parts.map((m) => worldGeometry(m));
    const geo = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!geo) return;
    this.signal = new THREE.Mesh(geo, parts[0].material as THREE.Material);
    this.signal.name = "civic-storm-signal";
    this.signal.receiveShadow = true;
    this.group.add(this.signal);
  }

  dispose(ctx: EngineContext): void {
    this.disposed = true;
    this.signal?.geometry.dispose();
    ctx.scene.remove(this.group);
    ctx.services.delete("civic");
    const lights = ctx.services.get("lights") as { remove(id: number): void } | undefined;
    for (const id of this.lightIds) lights?.remove(id);
    this.mint?.dispose(); this.burn?.dispose(); this.yard?.dispose(); this.workers?.dispose();
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.name.startsWith("civic-merged")) m.geometry.dispose(); });
    this.fx?.release();
  }
}
