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
import { fleetPreparation, type PreparedFleet } from "../fleet/preparation";
import { isAbort } from "../engine/failure";
import type { EngineContext, FrameState, SimulationStatus, WorldSystem } from "../engine/types";
import type { HarbourLayout } from "../layout/types";
import { HarbourFeed } from "../data/fetch";
import { buildHarbourModel } from "../model/build";
import { allTruth } from "../model/truth";
import type { HarbourModel, HarbourPayloads } from "../model/types";
import { HarbourSim, PH_APPROACHING, PH_DOCKED, PH_MOORED, PH_SAILING } from "./sim";
import type { CoastGrid } from "./obstacles";
import { SimDebugMarkers } from "./debug-markers";
import { warmLegsOffThread, type WarmLegs } from "./warm-legs";
import { loadSdfImage } from "../ocean/sdf-image";
import { ensureMotionService } from "../ui/services";

/** Re-evaluate freshness this often even without new payloads (a silent feed must turn stale). */
const TRUTH_RECHECK_MS = 30_000;

export interface SimulationClock { shift(ms: number): void; now(): number }

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
  /** Dev: a staged snapshot diff (?simevent): kind, coin (chosen when it fires), when (ms, wall) it fires. */
  private devEvent: { kind: string; id: string | null; at: number; fired: boolean } | null = null;
  /** One task owns preparation; frames only consume an already installed coherent revision. */
  private queued: number | undefined;
  private preparing = false;
  private fleetAbort: AbortController | null = null;
  private warmed = false;
  private workerFailed = false;
  private restartWarm: (() => void) | null = null;
  private generation = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retryRemaining = 0;
  private retryPending = false;
  private restartAttempt = true;
  private unsubscribeRecovery: (() => void) | null = null;
  readonly status: SimulationStatus = { unavailable: false, phase: "starting", reason: null, attempt: 0, nextRetryAtMs: null, message: "", retry: () => {} };
  /** Last installed snapshots retain their original ages if the worker becomes unavailable. */
  private installedPayloads: HarbourPayloads | null = null;
  private revision = 0;
  private consumedRevision = 0;
  private preparedPose = false;
  private refilling = false;
  private nextRefill = 0;
  private workerPlanKey = "";
  private returning = false;
  private returnFadeAt: number | null = null;
  private returnReconciled = false;
  readonly readiness = { revision: 0, boats: 0, prepared: false };

  async init(ctx: EngineContext): Promise<void> {
    fleetPreparation(ctx);
    ctx.services.set("readiness", this.readiness);
    ctx.services.set("simulation-status", this.status);
    const layout = ctx.services.get("layout");
    if (!layout) {
      // Publish a terminal empty world too: reveal must never wait for a service this path cannot install.
      ctx.services.set("model", buildHarbourModel({}, Date.now()));
      Object.assign(this.status, { unavailable: true, phase: "unavailable", message: "Fleet updates paused. Retry fleet updates." });
      console.warn("[harbour] data: no layout service; the fleet stays empty");
      return;
    }
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
      if (reduced && this.heldAt === null) { this.heldAt = wall; this.sim?.settleMotion(wall); }
      else if (!reduced && this.heldAt !== null) { this.motionLag += wall - this.heldAt; this.heldAt = null; this.sim?.resumeMotion(this.simClock(Date.now())); }
    };
    hold(motion.reduced);
    this.unsubMotion = motion.subscribe(hold);
    // the payloads are asked for first: the round trip overlaps the SDF decode and everything after it
    const feed = this.feed = new HarbourFeed();
    feed.subscribe(() => { this.dirty = true; this.revision++; this.fleetAbort?.abort(); this.queuePreparation(ctx); });
    ctx.services.set("feed", feed);
    void feed.start();
    // the island's real coastline, from the baked sea SDF (the same bytes for every viewer)
    const coasting = loadCoast(ctx, layout);
    // One persistent owner starts alongside the coast/API requests; no partial public installs.
    const startWarm = this.restartWarm = () => {
      this.fleetAbort?.abort();
      const generation = ++this.generation;
      this.warm?.stop();
      this.warmed = false; this.workerFailed = false; this.preparing = false; this.refilling = false; this.nextRefill = 0; this.workerPlanKey = ""; this.dirty = true;
      const current = () => this.feed === feed && this.generation === generation;
      const warm = this.warm = warmLegsOffThread(layout, coasting,
        (entries) => { if (current()) this.sim?.seedLegTimes(entries); },
        (seed) => { if (current()) this.sim?.seedOutings(seed); },
        (error) => { if (current()) this.workerUnavailable(ctx, feed, error); });
      void warm.done.then(() => {
        if (this.feed !== feed || this.warm !== warm) return;
        this.warmed = true; this.queuePreparation(ctx);
      }, () => { if (this.feed === feed && this.warm === warm) this.warmed = false; });
    };
    this.status.retry = () => {
      if (this.feed !== feed || this.status.phase !== "unavailable") return;
      this.status.attempt = 0;
      this.status.phase = "recovering";
      this.status.message = this.installedPayloads ? "Fleet updates paused. Showing saved readings." : "Fleet planning unavailable. Trying again.";
      this.scheduleRetry(feed, 0, false);
    };
    const resume = () => this.resumeRetry(feed);
    const visibility = () => {
      resume();
      if (document.hidden) { this.returning = true; this.returnFadeAt = null; this.returnReconciled = false; if (this.sim) { this.sim.resumeHolding = true; this.sim.resumeOpacity = 1; } }
      else if (this.returning) { this.nextRefill = 0; this.refillPaths(ctx, this.simClock(Date.now())); }
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    this.unsubscribeRecovery = () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
    };
    startWarm();
    const coast = await coasting;
    if (this.feed !== feed) return; // disposed meanwhile
    const now = this.simNow(Date.now());
    // AWAITING DATA: an empty, unavailable model until the first payloads land — never a fixture fleet
    const empty = buildHarbourModel({}, now, { pieredChains: layout.piers.map((p) => p.chain) });
    this.sim = new HarbourSim(empty, layout, this.simClock(Date.now()), coast);
    ctx.services.set("model", empty);
    ctx.services.set("sim", this.sim);
    this.queuePreparation(ctx);
  }

  private workerUnavailable(ctx: EngineContext, feed: HarbourFeed, error: unknown): void {
    if (this.feed !== feed || this.workerFailed) return;
    this.warmed = false; this.workerFailed = true; this.dirty = true; this.fleetAbort?.abort();
    this.warm?.stop();
    this.status.unavailable = this.installedPayloads === null;
    this.status.reason = error instanceof Error && "reason" in error && error.reason === "timeout" ? "timeout" : "crash";
    this.status.phase = this.status.attempt >= 3 ? "unavailable" : "recovering";
    this.status.message = this.status.phase === "unavailable" ? "Fleet updates paused. Retry fleet updates."
      : this.installedPayloads ? "Fleet updates paused. Showing saved readings." : "Fleet planning unavailable. Trying again.";
    console.warn("[harbour] simulation preparation unavailable", error);
    if (this.status.phase === "recovering") this.scheduleRetry(feed, [1000, 5000, 15000][this.status.attempt]);
    this.queuePreparation(ctx);
  }

  private scheduleRetry(feed: HarbourFeed, delay: number, restartAttempt = true): void {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.retryRemaining = delay;
    this.restartAttempt = restartAttempt;
    this.retryPending = true;
    this.status.nextRetryAtMs = Date.now() + delay;
    this.resumeRetry(feed);
  }

  private resumeRetry(feed: HarbourFeed): void {
    if (this.feed !== feed || this.status.phase !== "recovering" || !this.retryPending) return;
    if (document.hidden || navigator.onLine === false) {
      if (this.status.nextRetryAtMs !== null) this.retryRemaining = Math.max(0, this.status.nextRetryAtMs - Date.now());
      clearTimeout(this.retryTimer); this.retryTimer = undefined;
      this.status.nextRetryAtMs = null;
      return;
    }
    if (this.retryTimer !== undefined) return;
    this.status.nextRetryAtMs = Date.now() + this.retryRemaining;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.status.nextRetryAtMs = null;
      if (document.hidden || navigator.onLine === false) return;
      this.retryPending = false;
      if (this.restartAttempt) this.status.attempt++;
      this.restartWarm?.();
    }, this.retryRemaining);
  }

  private queuePreparation(ctx: EngineContext): void {
    if (!this.sim || !this.feed || (!this.warmed && !this.workerFailed) || this.preparing || this.queued !== undefined || !this.dirty) return;
    // Only eligibility + depeg state gate the first fleet. Error snapshots count as settled.
    if (!this.feed.payloads.stablecoins || !this.feed.payloads.pegSummary) return;
    this.queued = window.setTimeout(() => {
      this.queued = undefined;
      void this.prepare(ctx);
    }, 0);
  }

  private async prepare(ctx: EngineContext): Promise<void> {
    const sim = this.sim, feed = this.feed, layout = this.layout, warm = this.warm;
    if (!sim || !feed || !layout || !warm || this.preparing) return;
    if (this.workerFailed && !this.installedPayloads) { this.dirty = false; return; }
    const generation = this.generation;
    const recovering = this.workerFailed;
    this.preparing = true;
    this.dirty = false;
    let revision = this.revision;
    // Worker loss holds the last coherent fleet, but its original snapshots must still age.
    // This is freshness-only playback, never a replacement main-thread planning fallback.
    const payloads = this.workerFailed ? this.installedPayloads! : feed.payloads;
    const modelAt = () => {
      const now = Date.now();
      const m = buildHarbourModel(payloads, this.simNow(now), { pieredChains: layout.piers.map((p) => p.chain), truthNowMs: now });
      return import.meta.env.DEV && this.devEvent ? this.stageDevEvent(m) : m;
    };
    let fleet: PreparedFleet | undefined;
    let controller: AbortController | undefined;
    let phase: "model-build" | "worker" | "fleet" = "model-build";
    try {
      let model = modelAt();
      phase = "worker";
      const planning = !recovering && model.boats.length > 0 && (model.planKey !== sim.plan.key || this.workerPlanKey !== model.planKey);
      const prepared = planning ? await warm.prepare(model, this.simClock(Date.now()), sim.knownPlainPaths()) : undefined;
      if (this.feed !== feed || this.sim !== sim || this.generation !== generation || this.workerFailed !== recovering || revision < this.consumedRevision) return;
      if (prepared) this.workerPlanKey = model.planKey;
      // Never publish an unseen intermediate structural model or replay its transitions.
      // Optional arrivals with identical planning inputs coalesce without restarting allocation.
      // (Only the worker's wait lets newer payloads arrive: without it the first build is already the latest.)
      if (planning) {
        phase = "model-build";
        const latest = modelAt();
        if (latest.planKey !== model.planKey) { this.dirty = true; return; }
        model = latest;
      }
      revision = this.revision;
      phase = "fleet";
      controller = this.fleetAbort = new AbortController();
      const signal = ctx.signal ? AbortSignal.any([ctx.signal, controller.signal]) : controller.signal;
      fleet = await fleetPreparation(ctx).prepareFleet(model, prepared, this.readiness.revision + 1, signal);
      if (signal.aborted || this.feed !== feed || this.generation !== generation || revision !== this.revision || this.workerFailed !== recovering) { this.dirty = true; return; }
      sim.setModel(model, this.simClock(Date.now()), prepared, this.heldAt !== null);
      sim.poseAt(this.simClock(Date.now())); // boundary misses/transition paths are owned by this task
      fleet.commit();
      this.preparedPose = true;
      this.consumedRevision = revision;
      this.dirty = false;
      this.installedPayloads = { ...payloads };
      this.lastBuild = Date.now();
      this.truthSig = Object.values(model.truth).map((t) => t.state).join();
      ctx.services.set("model", model);
      this.readiness.revision++;
      this.readiness.boats = model.boats.length;
      this.readiness.prepared = true;
      if (!recovering) Object.assign(this.status, { unavailable: false, phase: "ready", reason: null, attempt: 0, nextRetryAtMs: null, message: "" });
    } catch (error) {
      if (this.generation !== generation || isAbort(error)) { /* a newer preparation owns the outcome */ }
      else if (phase === "worker") this.workerUnavailable(ctx, feed, error);
      else {
        this.status.unavailable = this.installedPayloads === null;
        console.warn(`[harbour] ${phase} unavailable`, error);
      }
    } finally {
      fleet?.dispose();
      if (this.fleetAbort === controller) this.fleetAbort = null;
      if (this.feed === feed && this.generation === generation) {
        this.preparing = false;
        this.queuePreparation(ctx);
      }
    }
  }

  private refillPaths(ctx: EngineContext, nowMs: number): void {
    const sim = this.sim, warm = this.warm, feed = this.feed;
    if (!sim || !warm || !feed || !this.warmed || this.workerFailed || this.preparing || this.refilling) return;
    const requests = sim.pathRequests(nowMs), legs = [...requests.now, ...requests.soon];
    if (!legs.length) return;
    const plan = sim.plan, revision = sim.planRevision, generation = this.generation;
    this.refilling = true;
    void warm.paths(revision, plan.key, legs).then((reply) => {
      if (this.sim !== sim || this.generation !== generation || sim.plan !== plan || reply.planRevision !== revision || reply.layoutKey !== plan.key) return;
      sim.seedPaths(plan, reply.paths, reply.holds);
    }, (error: unknown) => {
      if (this.sim === sim && this.generation === generation) this.workerUnavailable(ctx, feed, error);
    }).finally(() => { if (this.generation === generation) this.refilling = false; });
  }

  /** The model's clock: wall time (dev: scaled / offset). */
  private simNow(nowMs: number): number {
    return (this.speed === 1 ? nowMs : this.t0 + (nowMs - this.t0) * this.speed) + this.offset;
  }

  /** The sim's clock: the model's, held under reduced motion and lagging by the time it was held. */
  private simClock(nowMs: number): number {
    return this.heldAt ?? this.simNow(nowMs) - this.motionLag;
  }

  // Installation deliberately has no animation-frame entry point.

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
    if (this.devEvent && !this.devEvent.fired && Date.now() >= this.devEvent.at) { this.devEvent.fired = true; this.dirty = true; this.revision++; }
    if (this.readiness.prepared && !this.dirty && frame.nowMs - this.lastBuild > TRUTH_RECHECK_MS && this.feed) {
      // a silent feed must still age into stale: re-check freshness (cheap), rebuild only on a change
      this.lastBuild = frame.nowMs;
      const payloads = this.workerFailed ? this.installedPayloads ?? this.feed.payloads : this.feed.payloads;
      const sig = Object.values(allTruth(payloads, frame.nowMs)).map((t) => t.state).join(); // freshness uses wall time
      if (sig !== this.truthSig) { this.dirty = true; this.revision++; }
    }
    if (this.dirty) this.queuePreparation(ctx);
    let holdReturn = this.returning;
    if (this.returning && !document.hidden) {
      const reduced = this.heldAt !== null;
      if (this.returnFadeAt !== null || reduced || this.workerFailed || !sim.pathRequests(this.simClock(frame.nowMs)).now.length) {
        this.returnFadeAt ??= frame.nowMs;
        const u = reduced ? 1 : Math.min(1, (frame.nowMs - this.returnFadeAt) / 250);
        sim.resumeOpacity = Math.abs(1 - 2 * u);
        if (u >= 0.5 && !this.returnReconciled) { sim.resetHistory(); this.returnReconciled = true; }
        holdReturn = u < 0.5;
        if (u === 1) { this.returning = false; this.returnFadeAt = null; }
      }
    }
    sim.resumeHolding = holdReturn;
    const pose = !this.readiness.prepared || this.preparedPose || holdReturn ? sim.pose : sim.poseAt(this.simClock(frame.nowMs));
    this.preparedPose = false;
    if (frame.nowMs >= this.nextRefill) { this.nextRefill = frame.nowMs + 1000; this.refillPaths(ctx, this.simClock(frame.nowMs)); }
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
    this.fleetAbort?.abort();
    this.generation++;
    clearTimeout(this.retryTimer); this.retryTimer = undefined; this.retryPending = false;
    this.unsubscribeRecovery?.(); this.unsubscribeRecovery = null;
    clearTimeout(this.queued);
    this.queued = undefined;
    this.feed?.stop();
    this.warm?.stop(); this.warm = null;
    this.unsubMotion?.(); this.unsubMotion = null;
    this.markers?.dispose();
    this.feed = null;
    this.sim = null;
    this.warmed = false; this.preparing = false; this.dirty = false; this.preparedPose = false;
    this.workerFailed = false; this.installedPayloads = null;
    this.restartWarm = null;
    this.returning = false; this.returnFadeAt = null; this.returnReconciled = false;
    Object.assign(this.status, { unavailable: false, phase: "starting", reason: null, attempt: 0, nextRetryAtMs: null, message: "", retry: () => {} });
    this.readiness.prepared = false; this.readiness.boats = 0; this.readiness.revision = 0;
    this.revision = 0; this.consumedRevision = 0;
    ctx.services.delete("feed");
    ctx.services.delete("sim");
    ctx.services.delete("model");
    ctx.services.delete("simclock");
    ctx.services.delete("readiness");
    ctx.services.delete("simulation-status");
  }
}
