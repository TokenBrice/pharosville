import { describe, expect, it, vi } from "vitest";
import layoutJson from "../data/layout.json";
import type { HarbourLayout } from "../layout/types";
import { buildHarbourModel } from "../model/build";
import { buildSimLayout } from "./layout-graph";
import { buildPlan, boatLocalTime, findSegment, SEG_DOCK } from "./plan";
import { buildPlanLegPath, pathKey, planPathRequests, type PathRequest, type PreparedPlan } from "./plan-paths";
import * as paths from "./plan-paths";
import { HarbourSim, PH_SAILING } from "./sim";
import { makeLayout, makePayloads, PIERED, T0_MS } from "./test-fixtures";

function prepared(real = false) {
  const layout = real ? layoutJson as unknown as HarbourLayout : makeLayout({ berthsPerClass: 3 });
  const opts = { pieredChains: real ? layout.piers.map((p) => p.chain) : PIERED, dead: [] };
  const model = buildHarbourModel(makePayloads({ n: 40 }), T0_MS, opts);
  const L = buildSimLayout(layout), base = L.slots.length, plan = buildPlan(model, L);
  const build = (rs: PathRequest[]): PreparedPlan["paths"] => rs.map((r) => { const p = buildPlanLegPath(L, base, ...r); return [pathKey(...r), p.path, p.bad]; });
  const req = planPathRequests(plan.boats, T0_MS, () => false);
  const value: PreparedPlan = { plan: { key: plan.key, boats: plan.boats, stats: plan.stats }, rafts: L.slots.slice(base), paths: build([...req.now, ...req.soon]) };
  const sim = new HarbourSim(buildHarbourModel({}, T0_MS, opts), layout, T0_MS);
  sim.setModel(model, T0_MS, value);
  return { sim, L, base, build };
}

describe("worker-only ordinary playback", () => {
  it("holds the complete last pose on a miss, counts it once, and resumes at exact UTC without frame construction", () => {
    const { sim, build } = prepared();
    sim.poseAt(T0_MS);
    const before = structuredClone(sim.pose), spy = vi.spyOn(paths, "buildPlanLegPath");
    const future = T0_MS + 3_600_000;
    sim.poseAt(future);
    expect(sim.stats.pathMisses).toBeGreaterThan(0);
    const misses = sim.stats.pathMisses;
    sim.poseAt(future + 1);
    expect(sim.stats.pathMisses).toBe(misses);
    const p = sim.plan.boats.findIndex((p) => {
      const c = findSegment(p, boatLocalTime(p, future / 1000));
      return p.kind === "circuit" && p.segKind[c] !== SEG_DOCK && sim.pose.position[sim.indexOf(p.id) * 3] === before.position[sim.indexOf(p.id) * 3];
    });
    expect(p).toBeGreaterThanOrEqual(0);
    expect(sim.pose.position.slice(p * 3, p * 3 + 3)).toEqual(before.position.slice(p * 3, p * 3 + 3));
    expect(spy).not.toHaveBeenCalled(); spy.mockRestore();
    const req = sim.pathRequests(future); sim.seedPaths(sim.plan, build([...req.now, ...req.soon]));
    sim.poseAt(future);
    expect(sim.pose.position.slice(p * 3, p * 3 + 3)).not.toEqual(before.position.slice(p * 3, p * 3 + 3));
  });

  it("caches itinerary views, never builds on selection, and invalidates at a segment change", () => {
    const { sim, build } = prepared(); sim.poseAt(T0_MS);
    const id = sim.plan.boats.find((p) => p.kind === "circuit" && !sim.routeUnavailable.has(p.id))!.id;
    const spy = vi.spyOn(paths, "buildPlanLegPath");
    expect(sim.itineraryOf(id)).toBeNull(); expect(spy).not.toHaveBeenCalled(); spy.mockRestore();
    const req = sim.pathRequests(T0_MS);
    expect(new Set([...req.now, ...req.soon].map((r) => pathKey(...r))).size).toBe(req.now.length + req.soon.length);
    sim.seedPaths(sim.plan, build([...req.now, ...req.soon]));
    const a = sim.itineraryOf(id); expect(a).not.toBeNull(); expect(sim.itineraryOf(id)).toBe(a);
    sim.settleMotion(T0_MS); expect(sim.itineraryOf(id)).toBe(a); sim.resumeMotion(T0_MS);
    const plan = sim.plan.byId.get(id)!, c = findSegment(plan, boatLocalTime(plan, T0_MS / 1000));
    sim.poseAt(T0_MS + (plan.segEnd[c] - boatLocalTime(plan, T0_MS / 1000) + 1) * 1000);
    expect(sim.itineraryOf(id)).not.toBe(a);
  });

  it("holds one unsafe circuit leg on the authored harbour while every other sailing boat continues", () => {
    const { sim, build } = prepared(true);
    const req = sim.pathRequests(T0_MS);
    const entries = build([...req.now, ...req.soon]); sim.seedPaths(sim.plan, entries);
    const target = sim.plan.boats.find((p) => {
      const c = findSegment(p, boatLocalTime(p, T0_MS / 1000));
      return p.kind === "circuit" && p.segKind[c] !== SEG_DOCK;
    })!;
    const c = findSegment(target, boatLocalTime(target, T0_MS / 1000));
    const key = pathKey(target.segFrom[c], target.segSlot[c], target.cls, target.segLoop[c], target.loa, target.beam);
    const internals = sim as unknown as { badOuting: Set<string> };
    internals.badOuting.add(key);
    const before = structuredClone(sim.poseAt(T0_MS));
    const targetIndex = sim.indexOf(target.id);
    // Invalidate the leg timing by crossing a fresh simulation boundary with the same exact paths.
    const main = new HarbourSim(sim.model, sim.layout, T0_MS, null, () => sim.plan);
    const all = planPathRequests(sim.plan.boats, T0_MS, () => false);
    const seeded = build([...all.now, ...all.soon]).map(([k, p, bad]): [string, typeof p, boolean] => [k, p, bad || k === key]);
    main.seedPaths(main.plan, seeded);
    main.poseAt(T0_MS);
    expect(main.routeUnavailable.has(target.id)).toBe(true);
    expect(main.pose.speed[targetIndex]).toBe(0);
    for (let i = 0; i < main.pose.count; i++) if (i !== targetIndex && before.phase[i] === PH_SAILING) {
      expect(main.routeUnavailable.has(main.pose.ids[i])).toBe(false);
      expect(main.pose.speed[i]).toBeGreaterThan(0);
    }
  });
});

it("bounds path storage while pinning current and next routes through cache churn", () => {
  const { sim } = prepared();
  sim.pathRequests(T0_MS);
  const internals = sim as unknown as { pathCache: Map<string, paths.PreparedPlan["paths"][number][1]>; pathPins: Set<string> };
  const [key, path] = [...internals.pathCache].find(([key]) => internals.pathPins.has(key))!;
  sim.seedPaths(sim.plan, Array.from({ length: 1700 }, (_, i) => [`eviction-${i}`, path, false] as [string, typeof path, boolean]));
  expect(internals.pathCache.size).toBeLessThanOrEqual(1500);
  expect(internals.pathCache.get(key)).toBe(path);
});

it("adopts refill paths from a replacement worker without replacing an unchanged plan", () => {
  const { sim, build } = prepared();
  const internal = sim as unknown as { pathCache: Map<string, unknown> }; internal.pathCache.clear();
  const req = sim.pathRequests(T0_MS), plan = sim.plan;
  sim.setModel(sim.model, T0_MS, { plan: { key: plan.key, boats: plan.boats, stats: plan.stats }, rafts: [], paths: build([...req.now, ...req.soon]) });
  expect(sim.plan).toBe(plan); expect(sim.pathRequests(T0_MS)).toEqual({ now: [], soon: [] });
});
