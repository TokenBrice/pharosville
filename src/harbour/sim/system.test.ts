import type { Services } from "../engine/services";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { EngineContext, FrameState } from "../engine/types";
import { DataSystem } from "./system";

type Payloads = Record<string, { data: { count: number } | null; fetchedAtMs: number; error?: string }>;
interface Model { boats: unknown[]; hasFleet: boolean; planKey: string; truth: { stablecoins: { state: string } } }
interface Feed { payloads: Payloads; publish(key: string, count?: number | null): void }
interface Sim { model: Model; plan: { key: string }; pose: { count: number }; setModel: Mock; poseAt: Mock }
interface Warm { done: Promise<void>; prepare: Mock; stop: Mock }
const state = vi.hoisted(() => ({ feed: null as Feed | null, warm: null as Warm | null, sims: [] as Sim[], buildError: false, fail: null as ((error: Error) => void) | null }));
vi.mock("../data/fetch", () => ({ HarbourFeed: class {
  payloads: Payloads = {};
  listener: () => void = () => {};
  constructor() { state.feed = this; }
  subscribe(fn: () => void) { this.listener = fn; }
  start() { return new Promise<void>(() => {}); }
  stop() {}
  publish(key: string, count: number | null = 2) {
    this.payloads[key] = { data: count === null ? null : { count }, fetchedAtMs: Date.now(), ...(count === null ? { error: "unavailable" } : {}) };
    this.listener();
  }
} }));
vi.mock("../model/build", () => ({ buildHarbourModel: (payloads: Payloads, nowMs: number): Model => {
  if (state.buildError) throw new Error("bad model");
  return ({
  boats: Array.from({ length: payloads.stablecoins?.data?.count ?? 0 }),
  planKey: String(payloads.stablecoins?.data?.count ?? 0),
  hasFleet: !!payloads.stablecoins?.data,
  truth: { stablecoins: { state: !payloads.stablecoins?.data ? "unavailable" : nowMs - payloads.stablecoins.fetchedAtMs > 40_000 ? "stale" : "current" } },
}); } }));
vi.mock("../model/truth", () => ({ allTruth: (payloads: Payloads, nowMs: number) => ({ stablecoins: { state: !payloads.stablecoins?.data ? "unavailable" : nowMs - payloads.stablecoins.fetchedAtMs > 40_000 ? "stale" : "current" } }) }));
vi.mock("../ocean/sdf-image", () => ({ loadSdfImage: vi.fn() }));
vi.mock("../ui/services", () => ({ ensureMotionService: () => ({ reduced: false, subscribe: () => () => {} }) }));
vi.mock("./debug-markers", () => ({ SimDebugMarkers: class {} }));
vi.mock("./warm-legs", () => ({ warmLegsOffThread: (_layout: unknown, _coast: unknown, _share: unknown, _outings: unknown, onError: (error: Error) => void) => {
  state.fail = onError;
  return state.warm;
} }));
vi.mock("./sim", () => ({ PH_APPROACHING: 3, PH_DOCKED: 0, PH_MOORED: 4, HarbourSim: class {
  model: Model;
  pose = { count: 0 };
  plan: { key: string };
  setModel = vi.fn((model: Model) => { this.model = model; this.plan = { key: model.planKey }; this.pose.count = model.boats.length; });
  poseAt = vi.fn(() => this.pose);
  constructor(model: Model) { this.model = model; this.plan = { key: model.planKey }; state.sims.push(this); }
  seedLegTimes() {}
  seedOutings() {}
  knownPlainPaths() { return []; }
} }));

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
const frame = { nowMs: 100, elapsed: 0, delta: 0 } as FrameState;
let system: DataSystem, ctx: EngineContext;
let warm: { promise: Promise<void>; resolve(value: void): void; reject(error: Error): void };
let paths: { promise: Promise<object>; resolve(value: object): void; reject(error: Error): void };
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("location", { search: "" });
  vi.stubGlobal("window", Object.assign(new EventTarget(), { setTimeout }));
  vi.stubGlobal("document", Object.assign(new EventTarget(), { hidden: false }));
  vi.stubGlobal("navigator", { onLine: true });
  state.sims.length = 0;
  state.fail = null;
  state.buildError = false;
  warm = deferred<void>(); paths = deferred<object>();
  state.warm = { done: warm.promise, prepare: vi.fn(() => paths.promise), stop: vi.fn() };
  system = new DataSystem();
  ctx = { services: new Map([["layout", { piers: [] }]]) as unknown as Services } as unknown as EngineContext;
});
afterEach(() => { system.dispose(ctx); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function begin() {
  await system.init(ctx);
  state.feed!.publish("stablecoins"); state.feed!.publish("pegSummary");
}
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
async function startPreparation() { warm.resolve(); await flush(); await vi.runOnlyPendingTimersAsync(); }

describe("single-owner prepared adoption", () => {
  it("publishes an unavailable empty model when no layout can start the simulation", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    ctx.services.delete("layout");
    await system.init(ctx);
    expect(ctx.services.get("model")).toMatchObject({ boats: [], hasFleet: false });
    expect(ctx.services.get("simulation-status")).toMatchObject({ unavailable: true });
    expect(ctx.services.get("readiness")).toEqual({ revision: 0, boats: 0, prepared: false });
    expect(ctx.services.has("feed")).toBe(false); expect(ctx.services.has("sim")).toBe(false);
    system.update(frame, ctx);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("never installs or poses dirty data in a frame before warmup or while required paths are pending", async () => {
    await begin();
    const sim = ctx.services.get("sim")!;
    const readiness = ctx.services.get("readiness");
    system.update(frame, ctx);
    expect(sim.setModel).not.toHaveBeenCalled(); expect(sim.poseAt).not.toHaveBeenCalled();
    expect(readiness).toEqual({ revision: 0, boats: 0, prepared: false });
    await startPreparation();
    expect(state.warm!.prepare).toHaveBeenCalledOnce();
    system.update(frame, ctx);
    expect(sim.setModel).not.toHaveBeenCalled();
    expect(ctx.services.get("model")).toMatchObject({ boats: [] });
    paths.resolve({}); await flush();
    expect(sim.setModel).toHaveBeenCalledOnce();
    expect(ctx.services.get("model")).toBe(sim.model);
    expect(ctx.services.get("readiness")).toBe(readiness);
    expect(readiness).toEqual({ revision: 1, boats: 2, prepared: true });
    const poses = vi.mocked(sim.poseAt).mock.calls.length;
    system.update(frame, ctx);
    expect(sim.poseAt).toHaveBeenCalledTimes(poses);
  });

  it("requires both essential settlements but not the other five endpoints", async () => {
    await system.init(ctx); state.feed!.publish("stablecoins");
    await startPreparation(); expect(state.warm!.prepare).not.toHaveBeenCalled();
    state.feed!.publish("pegSummary", null); await vi.runOnlyPendingTimersAsync();
    expect(state.warm!.prepare).toHaveBeenCalledOnce();
    paths.resolve({}); await flush();
    expect(system.readiness.prepared).toBe(true);
  });

  it("publishes an honest prepared empty/error revision", async () => {
    await system.init(ctx); state.feed!.publish("stablecoins", null); state.feed!.publish("pegSummary", null);
    await startPreparation();
    expect(system.readiness).toEqual({ revision: 1, boats: 0, prepared: true });
    expect(state.warm!.prepare).not.toHaveBeenCalled();
  });

  it("coalesces optional arrivals without restarting allocation", async () => {
    await begin(); await startPreparation(); state.feed!.publish("stress");
    paths.resolve({}); await flush();
    expect(state.warm!.prepare).toHaveBeenCalledOnce();
    expect(system.readiness).toEqual({ revision: 1, boats: 2, prepared: true });
  });

  it("discards a superseded structural candidate and only publishes the latest fleet", async () => {
    await begin(); await startPreparation();
    const next = deferred<object>(); state.warm!.prepare.mockImplementationOnce(() => next.promise);
    state.feed!.publish("stablecoins", 3);
    paths.resolve({}); await flush();
    expect(system.readiness.prepared).toBe(false);
    expect(state.sims[0].setModel).not.toHaveBeenCalled();
    await vi.runOnlyPendingTimersAsync(); next.resolve({}); await flush();
    expect(state.sims[0].setModel).toHaveBeenCalledOnce();
    expect(system.readiness).toEqual({ revision: 1, boats: 3, prepared: true });
  });

  it("does not plan again for a nonstructural refresh and increments only installed revisions", async () => {
    await begin(); await startPreparation(); paths.resolve({}); await flush();
    state.feed!.publish("stress"); system.update(frame, ctx);
    expect(system.readiness.revision).toBe(1);
    await vi.runOnlyPendingTimersAsync();
    expect(state.warm!.prepare).toHaveBeenCalledOnce();
    expect(system.readiness.revision).toBe(2);
  });

  it("does not publish late worker results after disposal", async () => {
    await begin(); await startPreparation(); system.dispose(ctx);
    paths.resolve({}); await flush();
    expect(ctx.services.has("sim")).toBe(false);
    expect(ctx.services.has("model")).toBe(false);
    expect(ctx.services.has("readiness")).toBe(false);
    expect(state.sims[0].setModel).not.toHaveBeenCalled();
  });

  it("keeps an old cancelled job from changing a remounted preparation owner", async () => {
    await begin(); await startPreparation();
    const old = paths;
    system.dispose(ctx);
    const next = deferred<object>();
    state.warm = { done: Promise.resolve(), prepare: vi.fn(() => next.promise), stop: vi.fn() };
    await system.init(ctx);
    state.feed!.publish("stablecoins", 3); state.feed!.publish("pegSummary");
    await flush(); await vi.runOnlyPendingTimersAsync();
    old.resolve({}); await flush();
    expect(system.readiness).toEqual({ revision: 0, boats: 0, prepared: false });
    expect(state.sims[1].setModel).not.toHaveBeenCalled();
    next.resolve({}); await flush();
    expect(system.readiness).toEqual({ revision: 1, boats: 3, prepared: true });
    expect(state.sims[1].setModel).toHaveBeenCalledOnce();
  });

  it("ages saved readings during recovery and installs the freshest feed after a restart", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await begin(); await startPreparation(); paths.resolve({}); await flush();
    state.fail!(new Error("worker crashed"));
    expect(system.status).toMatchObject({ phase: "recovering", unavailable: false, attempt: 0, reason: "crash", message: "Fleet updates paused. Showing saved readings." });
    state.feed!.publish("stablecoins", 3);
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(50_000);
    system.update({ ...frame, nowMs: Date.now() }, ctx);
    await vi.advanceTimersByTimeAsync(0);
    expect(state.sims[0].model.truth.stablecoins.state).toBe("stale");
    expect(system.readiness.boats).toBe(2);
    const recovered = deferred<object>();
    state.warm = { done: Promise.resolve(), prepare: vi.fn(() => recovered.promise), stop: vi.fn() };
    Object.defineProperty(document, "hidden", { value: false, configurable: true }); document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(1001);
    state.feed!.publish("stablecoins", 4);
    recovered.resolve({}); await flush();
    await vi.advanceTimersByTimeAsync(1); await flush();
    expect(system.readiness.boats).toBe(4);
    expect(system.status).toMatchObject({ phase: "ready", unavailable: false, attempt: 0, reason: null, nextRetryAtMs: null });
  });

  it("surfaces worker failure without frame-owned fallback or false readiness", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await begin(); await startPreparation(); paths.reject(new Error("CSP refused worker")); await flush();
    system.update(frame, ctx);
    expect(warn).toHaveBeenCalledOnce();
    expect(state.sims[0].setModel).not.toHaveBeenCalled();
    expect(system.readiness.prepared).toBe(false);
    expect(ctx.services.get("simulation-status")).toMatchObject({ unavailable: true });
  });

  it("terminates failed worker startup honestly even when stablecoins succeeded", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await begin();
    const error = new Error("worker module blocked");
    state.fail!(error); warm.reject(error); await flush();
    expect(ctx.services.get("simulation-status")).toMatchObject({ unavailable: true });
    await vi.runOnlyPendingTimersAsync();
    system.update(frame, ctx);
    state.feed!.publish("stress"); await vi.runOnlyPendingTimersAsync();
    expect(warn).toHaveBeenCalledOnce();
    expect(state.warm!.prepare).not.toHaveBeenCalled();
    expect(state.sims[0].setModel).not.toHaveBeenCalled();
    expect(system.readiness).toEqual({ revision: 0, boats: 0, prepared: false });
    expect(ctx.services.get("model")).toMatchObject({ boats: [], hasFleet: false });
  });

  it("exposes the timeout reason and initial recovery copy without false fleet readiness", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await begin();
    state.fail!(Object.assign(new Error("warmup timed out"), { reason: "timeout" }));
    expect(system.status).toMatchObject({ phase: "recovering", reason: "timeout", attempt: 0, unavailable: true, message: "Fleet planning unavailable. Trying again." });
    expect(system.status.nextRetryAtMs).toBe(Date.now() + 1000);
    expect(system.readiness.prepared).toBe(false);
  });

  it("bounds each episode to three restarts at 1/5/15 seconds and permits one named manual episode", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await begin();
    const first = state.warm!;
    state.fail!(new Error("crash")); warm.reject(new Error("crash")); await flush();
    for (const [i, delay] of [1000, 5000, 15000].entries()) {
      state.warm = { done: new Promise(() => {}), prepare: vi.fn(), stop: vi.fn() };
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(system.status.attempt).toBe(i);
      await vi.advanceTimersByTimeAsync(1);
      expect(system.status.attempt).toBe(i + 1);
      state.fail!(new Error("crash"));
    }
    expect(first.stop).toHaveBeenCalled();
    expect(system.status).toMatchObject({ phase: "unavailable", attempt: 3, nextRetryAtMs: null, message: "Fleet updates paused. Retry fleet updates." });
    state.feed!.publish("stablecoins", 3);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(system.status.attempt).toBe(3);
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    window.dispatchEvent(new Event("offline"));
    system.status.retry(); system.status.retry();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(system.status).toMatchObject({ phase: "recovering", attempt: 0, nextRetryAtMs: null, message: "Fleet planning unavailable. Trying again." });
    state.warm = { done: new Promise(() => {}), prepare: vi.fn(), stop: vi.fn() };
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true }); window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(1);
    expect(system.status.attempt).toBe(0); // A manual episode starts with a fresh initial attempt.
    state.fail!(new Error("manual attempt failed"));
    expect(system.status.nextRetryAtMs).toBe(Date.now() + 1000);
    state.warm = { done: Promise.resolve(), prepare: vi.fn(async () => ({})), stop: vi.fn() };
    await vi.advanceTimersByTimeAsync(1001);
    expect(system.readiness.boats).toBe(3);
    expect(system.status.phase).toBe("ready");
  });

  it("does not start another owner on visibility/connectivity events during worker recovery", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await begin();
    state.fail!(new Error("crash")); warm.reject(new Error("crash")); await flush();
    const next = deferred<void>();
    state.warm = { done: next.promise, prepare: vi.fn(async () => ({})), stop: vi.fn() };
    await vi.advanceTimersByTimeAsync(1000);
    const owner = state.warm;
    window.dispatchEvent(new Event("online")); document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(system.status.attempt).toBe(1); expect(owner.stop).not.toHaveBeenCalled();
    next.resolve(); await flush(); await vi.advanceTimersByTimeAsync(1);
    expect(system.status.phase).toBe("ready");
  });

  it("ignores a superseded generation's late preparation and failure", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await begin(); await startPreparation();
    const oldFailure = state.fail!;
    oldFailure(new Error("lost worker"));
    state.feed!.publish("stablecoins", 3);
    const next = deferred<object>();
    state.warm = { done: Promise.resolve(), prepare: vi.fn(() => next.promise), stop: vi.fn() };
    await vi.advanceTimersByTimeAsync(1001);
    paths.resolve({}); oldFailure(new Error("late crash")); await flush();
    expect(system.readiness.prepared).toBe(false);
    next.resolve({}); await flush();
    expect(system.readiness.boats).toBe(3);
    expect(system.status.phase).toBe("ready");
    system.dispose(ctx);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ctx.services.has("simulation-status")).toBe(false);
  });
});


describe("model-build failure containment", () => {
  it("releases preparation and accepts a good refresh without declaring the worker broken", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await begin(); await startPreparation(); paths.resolve({}); await flush();
    const installed = ctx.services.get("model");
    const poses = state.sims[0].poseAt.mock.calls.length;
    state.buildError = true;
    state.feed!.publish("stress"); await vi.runOnlyPendingTimersAsync();
    expect(ctx.services.get("model")).toBe(installed);
    expect(state.sims[0].poseAt).toHaveBeenCalledTimes(poses);
    expect(warn).toHaveBeenCalledWith("[harbour] model-build unavailable", expect.any(Error));
    state.buildError = false;
    state.feed!.publish("stablecoins", 3); await vi.runOnlyPendingTimersAsync(); await flush();
    expect(state.warm!.prepare).toHaveBeenCalledTimes(2);
    expect(state.sims[0].model.boats).toHaveLength(3);
    expect(system.readiness.prepared).toBe(true);
  });
});
