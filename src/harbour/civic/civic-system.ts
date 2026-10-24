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
import { CIVIC_BASE, loadPlot, mergeStatic, pieceCentres, toWorld, type CivicManifest, type CivicPlot, type LoadedPlot } from "./assemble";
import { CivicBoards, flagPlace, wallPlace, type BoardSlot } from "./boards";
import { BurnFurnace, plumeLee } from "./burn";
import { applyFlowOverrides, civicFlows, workLevels, type CivicFlows, type FlowSide } from "./flows";
import { MINT_WORKERS, MintWorks } from "./mint";
import { Shipyard } from "./shipyard";
import { Workers } from "./workers";
import { gradeTally, launchedIds, topMovers, type ChainMove, type HullStage, type PrelaunchBook, type PrelaunchCoin } from "./yard";
import { paintCrestFlag, paintFrieze, paintGradeBoard, paintRegisterFlag, paintWeatherBoard } from "./paint";

/**
 * CIVIC: the P6 utility quarter (D19–D21). Loads public/harbour/civic/<kind>.glb at every layout.civic plot
 * (harbour material port, still parts merged to one draw per material, lamps/windows/furnaces into the
 * 'lights' service) and runs the three working landmarks:
 *   the Mint   chimneys, furnaces, presses, waterwheel, workers ∝ mint volume (24 h + the latest closed hour)
 *   the Burn   fire, embers, coins down the chute, plume ∝ burn volume; the darker plume when the net is negative
 *   the Yard   the registry's pre-launch coins as hulls by construction stage (src/harbour/data/prelaunch.json)
 * and tells the data stories of the other utility buildings without a hover (boards.ts / paint.ts, one draw):
 *   the Storm-signal Station   the one home of the DEWS signal: its own mast (manifest anchor 'signal', exposed on the
 *                              plot entry) where readings/storm-cones.ts hoists the cones and drums; the band chalked
 *                              on its weather board
 *   the Harbourmaster          the movers hoist: the day's top gaining harbour's crest (green hoist stripe) and the top
 *   the Registry               "REGISTER OF SHIPPING" on its frieze, its house flag, the grade board (shields A–F, counts)
 *                              losing harbour's (red stripe), no cones (24 h chain supply change, /api/chains)
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
  /** The Burn's activity 0..1 (the audio layer's furnace; 0 while banked / stale). */
  readonly burnRate: number;
  readonly shipyard: ReadonlyArray<{ id: string; symbol: string; name: string; phase: string | null; expectedLaunchDate: string | null; milestones: PrelaunchCoin["milestones"]; slot: string | null; stage: HullStage; launched: boolean }>;
  /** The UI's yard book (ui/yard.ts reads coins + hullPosition). */
  readonly yard: { coins: unknown[]; hullPosition(id: string): readonly [number, number, number] | null };
  readonly pickables: readonly CivicPickable[];
  /** Loaded plot roots by plot id (e.g. the identity layer dresses crest_panel / flag_pole_top; readings hoists the storm signal on anchors.signal). */
  readonly plots: ReadonlyMap<string, { kind: string; root: THREE.Object3D; nodes: ReadonlyMap<string, THREE.Object3D>; anchors?: Record<string, unknown> }>;
}

/** Civic kind → the id the UI already uses for that place (ui/places.ts CIVIC_PANEL_ID). */
const PANEL_ID: Record<string, string> = { customs: "customs-house", stormstation: "storm-mast", shipyard: "slipway" };
const TOP: Record<string, number> = { mint: 33, burn: 22, shipyard: 22, customs: 30, registry: 22, chartroom: 12, stormstation: 10, harbourmaster: 30, keeperslog: 10 };
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
  private signalKey = "";
  private boards: CivicBoards | null = null;
  private weather: BoardSlot | null = null;
  private grades: BoardSlot | null = null;
  private gradeKey = "";
  private gradeModel: HarbourModel | null = null;
  private movers: { up: BoardSlot; down: BoardSlot; hoist: { up: THREE.Vector3; down: THREE.Vector3 }; size: [number, number] } | null = null;
  private moversData: unknown = null;
  private moversKey = "";
  private crests: { img: HTMLImageElement; chains: Record<string, { flag: [number, number, number, number] }> } | null = null;
  private flagWind: [number, number] = [0, 0];
  private registryFlag: { slot: BoardSlot; hoist: THREE.Vector3; size: [number, number] } | null = null;
  private burnLee: [number, number] | null = null;
  private lightIds: number[] = [];
  private readonly plotMap = new Map<string, { kind: string; root: THREE.Object3D; nodes: ReadonlyMap<string, THREE.Object3D>; anchors?: Record<string, unknown> }>();
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
      get burnRate() { return sys.flows.burn.activity; },
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
      this.plotMap.set(p.plot.id, { kind: p.plot.kind, root: p.root, nodes: p.nodes, anchors: p.spec.anchors ?? {} });
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
    // the Burn's plume must never drift across the Pharos face from the default (heart) camera
    const pharos = (layout as { pharos?: { position?: number[] } }).pharos?.position;
    if (this.burn && pharos) {
      const yaw = THREE.MathUtils.degToRad((layout.camera.presets as Record<string, { yawDeg?: number }>).heart?.yawDeg ?? 45);
      this.burnLee = plumeLee([this.burn.bowl.x, this.burn.bowl.z], [pharos[0], pharos[2]], yaw);
    }

    // small moving parts cast no shadow (a draw each in the shadow pass for a few pixels); the gantries do
    for (const p of this.plots) p.nodes.forEach((o, name) => { if (/^(press_\d+|wheel)$/.test(name)) o.castShadow = false; });

    // one draw per material for every still part of every building
    for (const m of mergeStatic(this.plots.map((p) => p.root))) this.group.add(m);
    ctx.scene.add(this.group);

    this.workers = new Workers(mats, WORKERS, 17);
    this.group.add(this.workers.mesh);

    // the painted boards and flags (one atlas, one draw)
    this.boards = new CivicBoards();
    this.group.add(this.boards.mesh);
    this.placeBoards(byKind, ctx);

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
      if (!this.boards) return;
      const yard = await Shipyard.build(yp, mats, this.boards, this.book, stageSpec, load, lp ? [lp[0], lp[1]] : null);
      if (this.disposed) { yard.dispose(); return; }
      this.yard = yard;
      this.group.add(yard.group);
      if (this.model) yard.setLaunched(launchedIds(this.book, this.model.boats));
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
        this.yard.setLaunched(launchedIds(this.book, this.model.boats));
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
    this.burn?.update(dt, levels.burn, this.flows.dominance, banked, moving, windTo, wind, u, ctx.camera, vh, this.burnLee);
    this.yard?.update(dt, moving, u.uNight.value, { to: windTo, k: wind }, ctx.camera, vh);

    // the storm-signal station's weather board: the DEWS band its mast is flying (no reading: none)
    const level = readings?.cones ?? null;
    if (`${level}` !== this.signalKey && this.boards && this.weather) {
      this.signalKey = `${level}`;
      this.boards.paint(this.weather, (c, s) => paintWeatherBoard(c, s, level));
    }
    this.paintGrades();
    this.paintMovers(ctx, windTo);
    this.boards?.update(dt, moving, u.uNight.value, wind);

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

  /** Board / flag anchors of a civic kind (manifest anchors, plot frame) → world placements; first paint. */
  private placeBoards(byKind: (k: string) => LoadedPlot | null, ctx: EngineContext): void {
    const boards = this.boards;
    if (!boards) return;
    type Wall = { centre: [number, number, number]; normal: [number, number, number]; size: [number, number] };
    type Hoist = { hoist: [number, number, number]; size: [number, number] };
    const anchor = <T>(p: LoadedPlot, name: string) => (p.spec.anchors?.[name] ?? null) as T | null;
    const wall = (p: LoadedPlot, a: Wall, key: string, px: number, fn: (c: CanvasRenderingContext2D, s: BoardSlot) => void) => {
      const slot = boards.alloc(px, Math.round(px * a.size[1] / a.size[0]));
      if (!slot) return null;
      const n = new THREE.Vector3(...a.normal).transformDirection(p.root.matrixWorld);
      // a hair proud of the wall, so the paint never fights the stone
      boards.place(key, slot, wallPlace(toWorld(p.root, a.centre).addScaledVector(n, 0.06), n, a.size[0], a.size[1]));
      boards.paint(slot, fn);
      return slot;
    };
    const reg = byKind("registry");
    if (reg) {
      const fr = anchor<Wall>(reg, "frieze"), gb = anchor<Wall>(reg, "grade_board"), fl = anchor<Hoist>(reg, "register_flag");
      if (fr) wall(reg, fr, "registry:frieze", 1024, paintFrieze);
      if (gb) this.grades = wall(reg, gb, "registry:grades", 1024, (c, s) => paintGradeBoard(c, s, null));
      const slot = fl ? boards.alloc(256, Math.round(256 * fl.size[1] / fl.size[0])) : null;
      if (fl && slot) {
        boards.paint(slot, paintRegisterFlag);
        this.registryFlag = { slot, hoist: toWorld(reg.root, fl.hoist), size: fl.size };
      }
    }
    const st = byKind("stormstation");
    const wb = st ? anchor<Wall>(st, "weather_board") : null;
    if (st && wb) this.weather = wall(st, wb, "storm:weather", 512, (c, s) => paintWeatherBoard(c, s, null));
    const hm = byKind("harbourmaster");
    const mu = hm ? anchor<Hoist>(hm, "mover_up") : null, md = hm ? anchor<Hoist>(hm, "mover_down") : null;
    if (hm && mu && md) {
      const h = Math.round(256 * mu.size[1] / mu.size[0]);
      const up = boards.alloc(256, h), down = boards.alloc(256, h);
      if (up && down) this.movers = { up, down, hoist: { up: toWorld(hm.root, mu.hoist), down: toWorld(hm.root, md.hoist) }, size: mu.size };
      // the crest atlas (the identity layer's heraldry): the flags are copied out of it
      void Promise.all([
        fetch("/harbour/crests.json").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        // the identity layer's texture of the same atlas: one request, one decode
        ctx.assets.texture("/harbour/crests.webp", true).then((t) => t.image as HTMLImageElement, () => null),
      ]).then(([atlas, img]) => {
        if (this.disposed || !img || !atlas?.chains) return;
        this.crests = { img, chains: atlas.chains };
        this.moversKey = "";
      });
    }
  }

  /** The grade board's counts follow the model (the same tally as the Registry panel). */
  private paintGrades(): void {
    if (!this.boards || !this.grades || !this.model || this.model === this.gradeModel) return;
    this.gradeModel = this.model;
    const tally = this.model.hasFleet ? gradeTally(this.model.boats) : null;
    const key = tally ? [...tally].join(",") : "none";
    if (key === this.gradeKey) return;
    this.gradeKey = key;
    this.boards.paint(this.grades, (c, s) => paintGradeBoard(c, s, tally));
  }

  /** The movers hoist (and the register flag) fly downwind; the flags follow /api/chains' 24 h change. */
  private paintMovers(ctx: EngineContext, windTo: readonly [number, number]): void {
    const boards = this.boards;
    if (!boards) return;
    const turned = Math.abs(windTo[0] - this.flagWind[0]) + Math.abs(windTo[1] - this.flagWind[1]) > 0.15;
    if (turned) this.flagWind = [windTo[0], windTo[1]];
    const rf = this.registryFlag;
    if (rf && turned) boards.place("registry:flag", rf.slot, flagPlace(rf.hoist, this.flagWind, rf.size[0], rf.size[1]));
    const mv = this.movers;
    if (!mv || !this.crests) return;
    const feed = ctx.services.get("feed") as { payloads?: { chains?: { data?: { chains?: unknown } } } } | undefined;
    const rows = feed?.payloads?.chains?.data?.chains;
    if (rows !== this.moversData || !this.moversKey) {
      this.moversData = rows;
      const m = topMovers(Array.isArray(rows) ? rows as ChainMove[] : [], Object.keys(this.crests.chains));
      const key = `${m.up?.slug ?? "-"}:${m.down?.slug ?? "-"}`;
      if (key !== this.moversKey) {
        this.moversKey = key;
        const { img, chains } = this.crests;
        if (m.up) boards.paint(mv.up, (c, s) => paintCrestFlag(c, s, img, chains[m.up!.slug].flag, "#2F8A45"));
        if (m.down) boards.paint(mv.down, (c, s) => paintCrestFlag(c, s, img, chains[m.down!.slug].flag, "#B23A30"));
        boards.place("harbourmaster:up", mv.up, flagPlace(mv.hoist.up, this.flagWind, mv.size[0], mv.size[1]), !!m.up);
        boards.place("harbourmaster:down", mv.down, flagPlace(mv.hoist.down, this.flagWind, mv.size[0], mv.size[1]), !!m.down);
        return;
      }
    }
    if (turned) {
      boards.move("harbourmaster:up", flagPlace(mv.hoist.up, this.flagWind, mv.size[0], mv.size[1]));
      boards.move("harbourmaster:down", flagPlace(mv.hoist.down, this.flagWind, mv.size[0], mv.size[1]));
    }
  }

  dispose(ctx: EngineContext): void {
    this.disposed = true;
    this.boards?.dispose();
    ctx.scene.remove(this.group);
    ctx.services.delete("civic");
    const lights = ctx.services.get("lights") as { remove(id: number): void } | undefined;
    for (const id of this.lightIds) lights?.remove(id);
    this.mint?.dispose(); this.burn?.dispose(); this.yard?.dispose(); this.workers?.dispose();
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.name.startsWith("civic-merged")) m.geometry.dispose(); });
    this.fx?.release();
  }
}
