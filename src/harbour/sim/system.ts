/**
 * DataSystem: feed → model → sim. Registers the 'model' (HarbourModel) and 'sim' (HarbourSim)
 * services and advances the sim once per frame, before the fleet reads `sim.pose`.
 *
 * Dev only (never in production builds): `?sim=1` logs the under-way count every 10 s;
 * `?simspeed=N` runs the sim clock N×; `?simdebug=1` draws plain hull markers from the poses;
 * `?simat=<epoch ms>` starts the sim clock there; the 'simclock' service shifts it (gate captures).
 * `?simevent=tow|shoals|launch[:<coin id>]` stages one snapshot diff ~6 s after the data lands (lane MOTION
 * captures of 07-M6/M7/M12): a coin under way dies (towed to Wreck Cove) or depegs (adrift to the Shoals), or
 * a medium coin missing from the first snapshot appears (launched down the ways).
 *
 * Reduced motion (the 'motion' service: prefers-reduced-motion or ?motion=reduce) HOLDS the sim clock:
 * every boat lies still at the pose she had (no sailing, no swinging to her mooring). When it turns off
 * the clock runs on from where it was held (it then lags wall time by the pause), so nothing jumps.
 * The model and its freshness always read the real clock.
 */
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import type { HarbourLayout } from "../layout/types";
import { HarbourFeed } from "../data/fetch";
import { buildHarbourModel } from "../model/build";
import { allTruth } from "../model/truth";
import type { HarbourModel } from "../model/types";
import { HarbourSim, PH_APPROACHING, PH_DOCKED, PH_MOORED, PH_SAILING } from "./sim";
import type { CoastGrid } from "./obstacles";
import { SimDebugMarkers } from "./debug-markers";
import { warmLegsOffThread, type WarmLegs } from "./warm-legs";
import { loadSdfImage } from "../ocean/sdf-image";
import { ensureMotionService } from "../ui/services";

/** Re-evaluate freshness this often even without new payloads (a silent feed must turn stale). */
const TRUTH_RECHECK_MS = 30_000;

/** The sea SDF's coast channel (R), rows from minZ, or null (the sim then uses the layout's coast outline). */
async function loadCoast(ctx: EngineContext, layout: HarbourLayout): Promise<CoastGrid | null> {
  const url = layout.sea?.sdf, bounds = layout.sea?.bounds as [number, number, number, number] | undefined;
  if (!url || !bounds) return null;
  const img = await loadSdfImage(ctx, url);
  if (!img || img.width !== img.height) return null;
  return { data: img.coast, size: img.width, bounds };
}

export class DataSystem implements WorldSystem {
  readonly name = "data";
  private feed: HarbourFeed | null = null;
  private sim: HarbourSim | null = null;
  private layout: HarbourLayout | null = null;
  private dirty = false;
  private truthSig = "";
  private lastBuild = 0;
  private logEvery = 0;
  private lastLog = 0;
  private arrivals = 0;
  private prevPhase: Uint8Array = new Uint8Array(0);
  private speed = 1;
  private markers: SimDebugMarkers | null = null;
  private t0 = 0;
  /** Dev only: sim clock offset (ms) from wall time. */
  private offset = 0;
  /** Reduced motion: the sim time (ms) the clock is held at, else null; and the lag accrued by past holds. */
  private heldAt: number | null = null;
  private motionLag = 0;
  private unsubMotion: (() => void) | null = null;
  private warm: WarmLegs | null = null;
  /** The first install has been queued (the eager one, built ahead of the first frames). */
  private eager = false;
  /** Dev: a staged snapshot diff (?simevent): kind, coin (chosen when it fires), when (ms, wall) it fires. */
  private devEvent: { kind: string; id: string | null; at: number; fired: boolean } | null = null;

  async init(ctx: EngineContext): Promise<void> {
    const layout = ctx.services.get("layout") as HarbourLayout | undefined;
    if (!layout) { console.warn("[harbour] data: no layout service; the fleet stays empty"); return; }
    this.layout = layout;
    const q = new URLSearchParams(location.search);
    if (import.meta.env.DEV) {
      if (q.get("sim") === "1") this.logEvery = 10_000;
      const s = Number(q.get("simspeed"));
      if (Number.isFinite(s) && s > 0) this.speed = s;
      if (q.get("simdebug") === "1") this.markers = new SimDebugMarkers(ctx.scene);
      const at = Number(q.get("simat"));
      if (q.has("simat") && Number.isFinite(at)) this.offset = at - Date.now();
      ctx.services.set("simclock", { shift: (ms: number) => { this.offset += ms; }, now: () => this.simClock(Date.now()) });
      const ev = q.get("simevent");
      if (ev) { const [kind, id] = ev.split(":"); this.devEvent = { kind, id: id ?? null, at: Infinity, fired: false }; }
    }
    this.t0 = Date.now();
    const motion = ensureMotionService(ctx);
    const hold = (reduced: boolean) => {
      const wall = this.simNow(Date.now()) - this.motionLag;
      if (reduced && this.heldAt === null) this.heldAt = wall;
      else if (!reduced && this.heldAt !== null) { this.motionLag += wall - this.heldAt; this.heldAt = null; }
    };
    hold(motion.reduced);
    this.unsubMotion = motion.subscribe(hold);
    // the payloads are asked for first: the round trip overlaps the SDF decode and everything after it
    const feed = this.feed = new HarbourFeed();
    feed.subscribe(() => { this.dirty = true; });
    ctx.services.set("feed", feed);
    const landed = feed.start();
    // the island's real coastline, from the baked sea SDF (the same bytes for every viewer)
    const coasting = loadCoast(ctx, layout);
    // the first real plan's leg times and outing answers, built by workers meanwhile (they load now, start
    // on the coast; the sim adopts their answers as they land)
    const warm = this.warm = warmLegsOffThread(layout, coasting, (entries) => this.sim?.seedLegTimes(entries), (seed) => this.sim?.seedOutings(seed));
    const coast = await coasting;
    if (this.feed !== feed) return; // disposed meanwhile
    const now = this.simNow(Date.now());
    // AWAITING DATA: an empty, unavailable model until the first payloads land — never a fixture fleet
    const empty = buildHarbourModel({}, now, { pieredChains: layout.piers.map((p) => p.chain) });
    this.sim = new HarbourSim(empty, layout, this.simClock(Date.now()), coast);
    ctx.services.set("model", empty);
    ctx.services.set("sim", this.sim);
    // once the first round of payloads is in and the workers are warm: install it in a task of its own,
    // while the rest of the world is still loading, rather than in a frame
    void Promise.all([landed, warm.done]).then(() => setTimeout(() => { void this.installEarly(ctx); }, 0));
  }

  /**
   * The first install, ahead of the frames: the model and plan, then the legs the first poses sail (built
   * by the workers), then those poses. The first update() finds the model installed and the paths cached. If
   * frames already consumed the payloads (the world was up first), there is nothing left to do here.
   */
  private async installEarly(ctx: EngineContext): Promise<void> {
    const sim = this.sim, warm = this.warm;
    if (this.eager || !sim || !warm) return;
    this.eager = true;
    if (!this.dirty) { warm.stop(); return; }
    this.dirty = false;
    const wall = Date.now();
    this.lastBuild = wall;
    const model = this.rebuild(ctx, this.simNow(wall), this.simClock(wall));
    if (model) this.truthSig = Object.values(model.truth).map((t) => t.state).join();
    const plan = sim.plan, req = sim.pathRequests(this.simClock(Date.now()));
    await warm.paths(sim.rafts(), req.now, req.soon, (entries) => sim.seedPaths(plan, entries));
    if (this.sim === sim) sim.poseAt(this.simClock(Date.now()));
  }

  /** The model's clock: wall time (dev: scaled / offset). */
  private simNow(nowMs: number): number {
    return (this.speed === 1 ? nowMs : this.t0 + (nowMs - this.t0) * this.speed) + this.offset;
  }

  /** The sim's clock: the model's, held under reduced motion and lagging by the time it was held. */
  private simClock(nowMs: number): number {
    return this.heldAt ?? this.simNow(nowMs) - this.motionLag;
  }

  private rebuild(ctx: EngineContext, now: number, simT: number): HarbourModel | null {
    if (!this.feed || !this.sim || !this.layout) return null;
    let model = buildHarbourModel(this.feed.payloads, now, { pieredChains: this.layout.piers.map((p) => p.chain) });
    if (import.meta.env.DEV && this.devEvent) model = this.stageDevEvent(model);
    this.sim.setModel(model, simT);
    ctx.services.set("model", model);
    return model;
  }

  /** Dev (?simevent): before it fires, a launch's coin is left out; once fired, the coin dies / depegs / is back. */
  private stageDevEvent(model: HarbourModel): HarbourModel {
    const ev = this.devEvent!;
    if (!model.hasFleet) return model;
    if (ev.at === Infinity) ev.at = Date.now() + 6000;
    if (ev.kind === "launch") {
      ev.id ??= model.boats.find((b) => b.state === "circuit" && b.hullClass === "medium")?.id ?? null;
      // (a fleet without her is a different plan, as a real new coin's is)
      return ev.fired ? model : { ...model, planKey: `${model.planKey}#without-${ev.id}`, boats: model.boats.filter((b) => b.id !== ev.id) };
    }
    if (!ev.fired) return model;
    if (!ev.id && this.sim) {
      // a coin under way, the biggest in sight of the harbour's heart
      const p = this.sim.pose;
      let best = -1;
      for (let i = 0; i < p.count; i++) if (p.phase[i] === PH_SAILING && model.boats[i]?.state === "circuit" && (best < 0 || this.sim.layout.loa[model.boats[i].hullClass] > this.sim.layout.loa[model.boats[best].hullClass])) best = i;
      ev.id = best >= 0 ? p.ids[best] : null;
    }
    const state = ev.kind === "tow" ? "wrecked" : ev.kind === "shoals" ? "shoals" : null;
    return state ? { ...model, boats: model.boats.map((b) => (b.id === ev.id ? { ...b, state } : b)) } : model;
  }

  update(frame: FrameState, ctx: EngineContext): void {
    const sim = this.sim;
    if (!sim) return;
    if (this.devEvent && !this.devEvent.fired && Date.now() >= this.devEvent.at) { this.devEvent.fired = true; this.dirty = true; }
    const now = this.simNow(frame.nowMs);
    if (!this.dirty && frame.nowMs - this.lastBuild > TRUTH_RECHECK_MS && this.feed) {
      // a silent feed must still age into stale: re-check freshness (cheap), rebuild only on a change
      this.lastBuild = frame.nowMs;
      const sig = Object.values(allTruth(this.feed.payloads, now)).map((t) => t.state).join();
      if (sig !== this.truthSig) this.dirty = true;
    }
    if (this.dirty) {
      this.dirty = false;
      this.lastBuild = frame.nowMs;
      const model = this.rebuild(ctx, now, this.simClock(frame.nowMs));
      if (model) this.truthSig = Object.values(model.truth).map((t) => t.state).join();
    }
    const pose = sim.poseAt(this.simClock(frame.nowMs));
    this.markers?.update(sim);
    if (this.logEvery) {
      if (this.prevPhase.length !== pose.count) this.prevPhase = new Uint8Array(pose.count);
      for (let i = 0; i < pose.count; i++) {
        const ph = pose.phase[i];
        if (this.prevPhase[i] === PH_APPROACHING && (ph === PH_DOCKED || ph === PH_MOORED)) this.arrivals++;
        this.prevPhase[i] = ph;
      }
      if (frame.nowMs - this.lastLog >= this.logEvery) {
        const dt = (frame.nowMs - this.lastLog) / 60_000;
        if (this.lastLog) {
          const s = sim.stats;
          console.info(`[harbour sim] under way ${s.underWay} · docked ${s.docked} · moored ${s.moored} · anchored ${s.anchored} · voyages ${s.voyages} · dockings/min ${(this.arrivals / (dt * this.speed)).toFixed(1)} · boats ${pose.count}${sim.frozen ? " · STALE (holding)" : ""}`);
        }
        this.arrivals = 0;
        this.lastLog = frame.nowMs;
      }
    }
  }

  dispose(ctx: EngineContext): void {
    this.feed?.stop();
    this.warm?.stop(); this.warm = null;
    this.unsubMotion?.(); this.unsubMotion = null;
    this.markers?.dispose();
    this.feed = null;
    this.sim = null;
    ctx.services.delete("sim");
    ctx.services.delete("model");
    ctx.services.delete("simclock");
  }
}
