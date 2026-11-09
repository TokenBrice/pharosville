import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { EngineContext, FrameState } from "../engine/types";
import type { Services } from "../engine/services";
import type { HarbourPayloads } from "../model/types";
import { PHAROSVILLE_ENDPOINT_REGISTRY } from "@shared/lib/pharosville-endpoint-registry";
import { FRESHNESS_RATIOS } from "@shared/lib/status-thresholds";
import DEAD_STABLECOINS from "virtual:pharosville-cemetery";
import { fleetPreparation, type PreparedFleet } from "../fleet/preparation";
import { parseApiMeta } from "../../lib/api";
import { projectedFixtures, TRUTH_COIN_ID, TRUTH_NOW, upstreamFixtures } from "../__fixtures__/projection";
import { deriveTargets } from "../readings/bind";
import { allTruth } from "../model/truth";
import { DataSystem } from "./system";
import { buildSimLayout } from "./layout-graph";
import { buildPlan } from "./plan";
import { buildPlanLegPath, pathKey, planPathRequests } from "./plan-paths";
import { makeCoins, makeLayout, makePayloads, T0_MS } from "./test-fixtures";

const state = vi.hoisted(() => ({ feed: null as null | { payloads: HarbourPayloads; publish(p: HarbourPayloads): void }, motion: null as null | ((v: boolean) => void), reduced: true }));
vi.mock("../data/fetch", () => ({ HarbourFeed: class {
  payloads: HarbourPayloads = {};
  listener = () => {};
  constructor() { state.feed = this; }
  subscribe(fn: () => void) { this.listener = fn; }
  start() {}
  stop() {}
  publish(p: HarbourPayloads) { this.payloads = p; this.listener(); }
} }));
vi.mock("../ui/services", () => ({ ensureMotionService: () => ({ reduced: state.reduced, subscribe: (fn: (v: boolean) => void) => { state.motion = fn; return () => {}; } }) }));
vi.mock("./warm-legs", () => ({ warmLegsOffThread: (layout: ReturnType<typeof makeLayout>) => {
  const L = buildSimLayout(layout), base = L.slots.length;
  return {
    done: Promise.resolve(), stop() {},
    async prepare(model: Parameters<typeof buildPlan>[0], nowMs: number) {
      L.slots.length = base;
      const plan = buildPlan(model, L), req = planPathRequests(plan.boats, nowMs, () => false);
      return { plan: { key: plan.key, boats: plan.boats, stats: plan.stats }, rafts: L.slots.slice(base), paths: [...req.now, ...req.soon].map((r) => { const result = buildPlanLegPath(L, base, ...r); return [pathKey(...r), result.path, result.bad]; }) };
    },
    async paths(planRevision: number, layoutKey: string) { return { planRevision, layoutKey, paths: [] }; },
  };
} }));
let system: DataSystem, ctx: EngineContext;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(T0_MS);
  state.reduced = true;
  vi.stubGlobal("location", { search: "" });
  vi.stubGlobal("window", Object.assign(new EventTarget(), { setTimeout }));
  vi.stubGlobal("document", Object.assign(new EventTarget(), { hidden: false }));
  vi.stubGlobal("navigator", { onLine: true });
  system = new DataSystem();
  ctx = { services: new Map([["layout", makeLayout({ berthsPerClass: 3 })]]) as unknown as Services } as EngineContext;
  fleetPreparation(ctx).register(async (_model, _plan, revision) => ({ revision, commit() {}, dispose() {} })); // p-main publication barrier
});
afterEach(() => { system.dispose(ctx); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function publish(p: HarbourPayloads) {
  state.feed!.publish(p);
  for (let i = 0; i < 4; i++) { await Promise.resolve(); await vi.advanceTimersByTimeAsync(0); }
  system.update({ nowMs: Date.now(), delta: 0, elapsed: 0 } as FrameState, ctx);
}

it("runs real DataSystem/model/sim reduced-motion changes on the held clock with current truth", async () => {
  await system.init(ctx);
  const coins = makeCoins({ n: 4 });
  await publish(makePayloads({ coins }));
  const sim = ctx.services.get("sim")!, id = sim.model.boats[0].id;
  const events = vi.fn(); sim.onEvent(events);
  await publish(makePayloads({ coins, depegIds: [id] }));
  expect(sim.slotOf(sim.indexOf(id))?.kind).toBe("shoals");
  expect([...sim.pose.event]).toEqual([0, 0, 0, 0]);
  await publish(makePayloads({ coins }));
  expect(sim.slotOf(sim.indexOf(id))?.kind).not.toBe("shoals");
  const newCoin = { ...coins[1], id: "fresh-coin", symbol: "NEW" };
  const dead = { ...coins[2], id: DEAD_STABLECOINS[0].id, symbol: "DEAD" };
  await publish(makePayloads({ coins: [...coins, newCoin, dead] }));
  expect(sim.slotOf(sim.indexOf(dead.id))?.kind).toBe("wreck");
  expect(sim.pose.speed[sim.indexOf(newCoin.id)]).toBe(0);
  const held = structuredClone(sim.pose.position);
  Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange"));
  vi.setSystemTime(T0_MS + 1000);
  Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange"));
  system.update({ nowMs: Date.now(), delta: 0, elapsed: 0 } as FrameState, ctx);
  expect(sim.resumeOpacity).toBe(1); expect(sim.pose.position).toEqual(held);
  await publish(makePayloads({ coins: [...coins, newCoin, dead], stale: true }));
  expect(sim.frozen).toBe(true); expect([...sim.pose.event]).toEqual(Array(6).fill(0));
  expect(events).not.toHaveBeenCalled();
});

it.each([[false, false], [false, true], [true, false], [true, true]])("ages installed truth on the first returned frame while fleet preparation is pending (reduced=%s, refreshed=%s)", async (reduced, refreshed) => {
  state.reduced = reduced;
  vi.setSystemTime(TRUTH_NOW);
  await system.init(ctx);
  const input = upstreamFixtures();
  input.stress.signals = { [TRUTH_COIN_ID]: { score: 90, band: "DANGER" } };
  for (const key of ["stability", "mintBurn"] as const) {
    const age = PHAROSVILLE_ENDPOINT_REGISTRY[key].metaMaxAgeSec * FRESHNESS_RATIOS.DEGRADED - 60;
    input[key]._meta = { updatedAt: TRUTH_NOW / 1000 - age, ageSeconds: age, status: "fresh" };
  }
  const payloads = Object.fromEntries(Object.entries(projectedFixtures(input)).map(([key, body]) => {
    const { _meta, ...data } = body as Record<string, unknown>;
    return [key, { data, meta: parseApiMeta(_meta), fetchedAtMs: Date.now() }];
  })) as HarbourPayloads;
  await publish(payloads);
  const sim = ctx.services.get("sim")!, installed = ctx.services.get("model")!;
  expect(installed.truth.stablecoins.state).toBe("current");
  expect(installed.readings.psi.lit).toBe(true);
  expect(installed.readings.stormFlags).toHaveLength(1);
  vi.spyOn(sim, "pathRequests").mockReturnValue({ now: [], soon: [] }); // cached paths cannot guard freshness
  const reset = vi.spyOn(sim, "resetHistory");
  const pose = structuredClone(sim.pose.position), revision = system.readiness.revision;
  const hide = (hidden: boolean) => { Object.defineProperty(document, "hidden", { configurable: true, value: hidden }); document.dispatchEvent(new Event("visibilitychange")); };
  hide(true);
  let complete!: (fleet: PreparedFleet) => void;
  const preparing = vi.spyOn(fleetPreparation(ctx), "prepareFleet").mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
  state.feed!.publish(payloads);
  await vi.advanceTimersByTimeAsync(0);
  expect(preparing).toHaveBeenCalledOnce();
  vi.setSystemTime(TRUTH_NOW + 6 * 3600_000);
  if (refreshed) {
    state.feed!.publish(Object.fromEntries(Object.entries(payloads).map(([key, snap]) => [key, {
      ...snap, fetchedAtMs: Date.now(), meta: { updatedAt: Date.now() / 1000 - 60, ageSeconds: 60, status: "fresh" },
    }])) as HarbourPayloads);
    expect(allTruth(state.feed!.payloads, Date.now()).stablecoins.state).toBe("current");
  }
  hide(false);
  const at = Date.now();
  system.update({ nowMs: at, delta: 0, elapsed: 0 } as FrameState, ctx);
  const aged = ctx.services.get("model")!;
  expect(aged.truth).toEqual(allTruth(payloads, at));
  expect(aged.truth.stablecoins.state).toBe("stale");
  expect(sim.model).toBe(aged);
  expect(system.readiness.revision).toBe(revision);
  expect(deriveTargets({ model: aged, stablecoinsAttempted: true, chainsChange7d: payloads.chains?.data?.globalChange7dPct })).toMatchObject({
    fog: true, psi: { lit: false }, sea: null, weather: null, cones: null, stormFlags: [], tide: { pct: null }, flows: { available: false },
  });
  expect(aged.readings.psi.lit).toBe(false);
  expect(aged.readings.flows.stale).toBe(true);
  expect(aged.boats[0].stormSignal).toBeNull();
  expect(sim.pose.position).toEqual(pose);
  if (!reduced) system.update({ nowMs: at + 125, delta: 0, elapsed: 0 } as FrameState, ctx);
  system.update({ nowMs: at + 250, delta: 0, elapsed: 0 } as FrameState, ctx);
  expect(sim.resumeOpacity).toBe(1);
  expect(sim.resumeHolding).toBe(false);
  expect(reset).toHaveBeenCalledOnce();
  const commit = vi.fn();
  complete({ revision: revision + 1, commit, dispose() {} });
  for (let i = 0; i < 16; i++) await Promise.resolve();
  expect(commit).not.toHaveBeenCalled(); // an old in-flight candidate cannot resurrect current truth
  expect(ctx.services.get("model")!.truth.stablecoins.state).toBe("stale");
});
