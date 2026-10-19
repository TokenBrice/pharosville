import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { EngineContext, FrameState } from "../engine/types";
import { DataSystem } from "./system";

type Payloads = Record<string, { data: { count: number } | null; fetchedAtMs: number; error?: string }>;
interface Model { boats: unknown[]; hasFleet: boolean; planKey: string; truth: { stablecoins: { state: string } } }
interface Feed { payloads: Payloads; publish(key: string, count?: number | null): void }
interface Sim { model: Model; plan: { key: string }; pose: { count: number }; setModel: Mock; poseAt: Mock }
interface Warm { done: Promise<void>; prepare: Mock; stop: Mock }
const state = vi.hoisted(() => ({ feed: null as Feed | null, warm: null as Warm | null, sims: [] as Sim[], fail: null as ((error: Error) => void) | null }));
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
vi.mock("../model/build", () => ({ buildHarbourModel: (payloads: Payloads, nowMs: number): Model => ({
  boats: Array.from({ length: payloads.stablecoins?.data?.count ?? 0 }),
  planKey: String(payloads.stablecoins?.data?.count ?? 0),
  hasFleet: !!payloads.stablecoins?.data,
  truth: { stablecoins: { state: !payloads.stablecoins?.data ? "unavailable" : nowMs - payloads.stablecoins.fetchedAtMs > 40_000 ? "stale" : "current" } },
}) }));
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
  vi.stubGlobal("window", { setTimeout });
  state.sims.length = 0;
  state.fail = null;
  warm = deferred<void>(); paths = deferred<object>();
  state.warm = { done: warm.promise, prepare: vi.fn(() => paths.promise), stop: vi.fn() };
  system = new DataSystem();
  ctx = { services: new Map([["layout", { piers: [] }]]) } as unknown as EngineContext;
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
    expect(ctx.services.get("simulation-status")).toEqual({ unavailable: true });
    expect(ctx.services.get("readiness")).toEqual({ revision: 0, boats: 0, prepared: false });
    expect(ctx.services.has("feed")).toBe(false); expect(ctx.services.has("sim")).toBe(false);
    system.update(frame, ctx);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("never installs or poses dirty data in a frame before warmup or while required paths are pending", async () => {
    await begin();
    const sim = ctx.services.get("sim") as Sim;
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
    const poses = sim.poseAt.mock.calls.length;
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

  it("keeps aging the installed snapshots after worker loss, without retrying or planning in a frame", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await begin(); await startPreparation(); paths.resolve({}); await flush();
    await vi.advanceTimersByTimeAsync(20_000);
    state.warm!.prepare.mockRejectedValueOnce(new Error("worker stopped"));
    state.feed!.publish("stablecoins", 3);
    await vi.runOnlyPendingTimersAsync();
    await vi.runOnlyPendingTimersAsync();
    expect(system.readiness.boats).toBe(2);
    expect(state.sims[0].model.boats).toHaveLength(2);
    expect(state.warm!.prepare).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(31_000);
    system.update({ ...frame, nowMs: Date.now() }, ctx);
    await vi.runOnlyPendingTimersAsync();
    expect(state.sims[0].model.truth.stablecoins.state).toBe("stale");
    state.feed!.publish("stress"); await vi.runOnlyPendingTimersAsync();
    expect(state.warm!.prepare).toHaveBeenCalledTimes(2);
    expect(state.sims[0].model.boats).toHaveLength(2);
  });

  it("surfaces worker failure without frame-owned fallback or false readiness", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await begin(); await startPreparation(); paths.reject(new Error("CSP refused worker")); await flush();
    system.update(frame, ctx);
    expect(warn).toHaveBeenCalledOnce();
    expect(state.sims[0].setModel).not.toHaveBeenCalled();
    expect(system.readiness.prepared).toBe(false);
    expect(ctx.services.get("simulation-status")).toEqual({ unavailable: true });
  });

  it("terminates failed worker startup honestly even when stablecoins succeeded", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await begin();
    const error = new Error("worker module blocked");
    state.fail!(error); warm.reject(error); await flush();
    expect(ctx.services.get("simulation-status")).toEqual({ unavailable: true });
    await vi.runOnlyPendingTimersAsync();
    system.update(frame, ctx);
    state.feed!.publish("stress"); await vi.runOnlyPendingTimersAsync();
    expect(warn).toHaveBeenCalledOnce();
    expect(state.warm!.prepare).not.toHaveBeenCalled();
    expect(state.sims[0].setModel).not.toHaveBeenCalled();
    expect(system.readiness).toEqual({ revision: 0, boats: 0, prepared: false });
    expect(ctx.services.get("model")).toMatchObject({ boats: [], hasFleet: false });
  });

  it("recovers failed first planning on a later register refresh, not optional arrivals", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await begin(); await startPreparation(); paths.reject(new Error("worker failed")); await flush();
    await vi.runOnlyPendingTimersAsync();
    const failed = state.warm!;
    state.feed!.publish("stress"); await vi.runOnlyPendingTimersAsync();
    expect(failed.stop).not.toHaveBeenCalled();
    const recovered = deferred<object>();
    state.warm = { done: Promise.resolve(), prepare: vi.fn(() => recovered.promise), stop: vi.fn() };
    state.feed!.publish("stablecoins", 3);
    system.update(frame, ctx);
    expect(failed.stop).not.toHaveBeenCalled(); // Restart and allocation are both task-owned.
    await vi.runOnlyPendingTimersAsync(); await flush(); await vi.runOnlyPendingTimersAsync();
    expect(failed.stop).toHaveBeenCalledOnce();
    expect(state.warm.prepare).toHaveBeenCalledOnce();
    expect(ctx.services.get("simulation-status")).toEqual({ unavailable: true });
    recovered.resolve({}); await flush();
    expect(system.readiness).toEqual({ revision: 1, boats: 3, prepared: true });
    expect(ctx.services.get("simulation-status")).toEqual({ unavailable: false });
    expect(state.sims[0].setModel).toHaveBeenCalledOnce();
  });
});
