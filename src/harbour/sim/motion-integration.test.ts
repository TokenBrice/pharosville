import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { EngineContext, FrameState } from "../engine/types";
import type { Services } from "../engine/services";
import type { HarbourPayloads } from "../model/types";
import DEAD_STABLECOINS from "virtual:pharosville-cemetery";
import { fleetPreparation } from "../fleet/preparation";
import { DataSystem } from "./system";
import { buildSimLayout } from "./layout-graph";
import { buildPlan } from "./plan";
import { buildPlanLegPath, pathKey, planPathRequests } from "./plan-paths";
import { makeCoins, makeLayout, makePayloads, T0_MS } from "./test-fixtures";

const state = vi.hoisted(() => ({ feed: null as null | { payloads: HarbourPayloads; publish(p: HarbourPayloads): void }, motion: null as null | ((v: boolean) => void) }));
vi.mock("../data/fetch", () => ({ HarbourFeed: class {
  payloads: HarbourPayloads = {};
  listener = () => {};
  constructor() { state.feed = this; }
  subscribe(fn: () => void) { this.listener = fn; }
  start() {}
  stop() {}
  publish(p: HarbourPayloads) { this.payloads = p; this.listener(); }
} }));
vi.mock("../ui/services", () => ({ ensureMotionService: () => ({ reduced: true, subscribe: (fn: (v: boolean) => void) => { state.motion = fn; return () => {}; } }) }));
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
  vi.stubGlobal("location", { search: "" });
  vi.stubGlobal("window", Object.assign(new EventTarget(), { setTimeout }));
  vi.stubGlobal("document", Object.assign(new EventTarget(), { hidden: false }));
  vi.stubGlobal("navigator", { onLine: true });
  system = new DataSystem();
  ctx = { services: new Map([["layout", makeLayout({ berthsPerClass: 3 })]]) as unknown as Services } as EngineContext;
  fleetPreparation(ctx).register(async (_model, _plan, revision) => ({ revision, commit() {}, dispose() {} })); // p-main publication barrier
});
afterEach(() => { system.dispose(ctx); vi.useRealTimers(); vi.unstubAllGlobals(); });
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
