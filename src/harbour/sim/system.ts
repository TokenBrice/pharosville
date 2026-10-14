/**
 * DataSystem: feed → model → sim. Registers the 'model' (HarbourModel) and 'sim' (HarbourSim)
 * services and advances the sim once per frame, before the fleet reads `sim.pose`.
 *
 * Dev only (never in production builds): `?sim=1` logs the under-way count every 10 s;
 * `?simspeed=N` runs the sim clock N×; `?simdebug=1` draws plain hull markers from the poses;
 * `?simat=<epoch ms>` starts the sim clock there; the 'simclock' service shifts it (gate captures).
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
import { HarbourSim, PH_APPROACHING, PH_DOCKED, PH_MOORED } from "./sim";
import type { CoastGrid } from "./obstacles";
import { SimDebugMarkers } from "./debug-markers";
import { warmLegsOffThread } from "./warm-legs";
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
  private stopWarm: (() => void) | null = null;

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
    // the island's real coastline, from the baked sea SDF (the same bytes for every viewer)
    const coast = await loadCoast(ctx, layout);
    // the first real plan's leg times, built by workers meanwhile (the sim adopts them as they land)
    this.stopWarm = warmLegsOffThread(layout, coast, (entries) => this.sim?.seedLegTimes(entries));
    const now = this.simNow(Date.now());
    // AWAITING DATA: an empty, unavailable model until the first payloads land — never a fixture fleet
    const empty = buildHarbourModel({}, now, { pieredChains: layout.piers.map((p) => p.chain) });
    this.sim = new HarbourSim(empty, layout, this.simClock(Date.now()), coast);
    ctx.services.set("model", empty);
    ctx.services.set("sim", this.sim);
    this.feed = new HarbourFeed();
    this.feed.subscribe(() => { this.dirty = true; });
    ctx.services.set("feed", this.feed);
    void this.feed.start();
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
    const model = buildHarbourModel(this.feed.payloads, now, { pieredChains: this.layout.piers.map((p) => p.chain) });
    this.sim.setModel(model, simT);
    ctx.services.set("model", model);
    return model;
  }

  update(frame: FrameState, ctx: EngineContext): void {
    const sim = this.sim;
    if (!sim) return;
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
    this.stopWarm?.(); this.stopWarm = null;
    this.unsubMotion?.(); this.unsubMotion = null;
    this.markers?.dispose();
    this.feed = null;
    this.sim = null;
    ctx.services.delete("sim");
    ctx.services.delete("model");
    ctx.services.delete("simclock");
  }
}
