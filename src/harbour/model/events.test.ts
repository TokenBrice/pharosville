import { describe, expect, it } from "vitest";
import { buildHarbourModel } from "./build";
import { dayBookLine, detectEvents, eventSnapshot, FLOW_HOUR_MEAN_X, FLOW_HOUR_MIN_USD, isBigFlowHour, type EventState, type HarbourEvent } from "./events";
import type { HarbourPayloads } from "./types";

const T0 = 1_790_000_000_000;
const MIN = 60_000;

interface World {
  coins: Array<{ id: string; supply: number }>;
  peg: Record<string, { bps: number; depeg: boolean } | null>;
  psi: string;
  dews: Record<string, string>;
  grades: Record<string, string>;
  hourly?: Array<{ hourTs: number; mint: number; burn: number; valuation?: string }>;
  pegMethod?: string;
}

function world(over: Partial<World> = {}): World {
  return {
    coins: [{ id: "usdx", supply: 2e9 }, { id: "usdy", supply: 5e8 }],
    peg: { usdx: { bps: 18, depeg: false }, usdy: { bps: 4, depeg: false } },
    psi: "STEADY",
    dews: { usdx: "CALM", usdy: "CALM" },
    grades: { usdx: "B+", usdy: "A" },
    ...over,
  };
}

/** Payloads for one poll at `atMs`; `stale` endpoints get a stale meta. */
function payloads(w: World, atMs: number, stale: string[] = []): HarbourPayloads {
  const meta = (k: string) => ({ updatedAt: atMs / 1000 - 30, ageSeconds: 30, status: stale.includes(k) ? "stale" as const : "fresh" as const });
  const snap = (k: string, data: unknown) => ({ data, meta: meta(k), fetchedAtMs: atMs });
  return {
    stablecoins: snap("stablecoins", { peggedAssets: w.coins.map((c) => ({ id: c.id, name: c.id.toUpperCase(), symbol: c.id.toUpperCase(), pegType: "peggedUSD", circulating: { peggedUSD: c.supply }, chainCirculating: { Ethereum: { current: c.supply } }, chains: ["Ethereum"] })) }),
    pegSummary: snap("pegSummary", {
      coins: Object.entries(w.peg).filter(([, v]) => v).map(([id, v]) => ({ id, currentDeviationBps: v!.bps, activeDepeg: v!.depeg, methodologyVersion: w.pegMethod ?? "1" })),
      methodology: { version: w.pegMethod ?? "1" },
    }),
    stability: snap("stability", { current: { score: w.psi === "STEADY" ? 82.4 : 61.3, band: w.psi, methodologyVersion: "3" }, history: [] }),
    stress: snap("stress", { signals: Object.fromEntries(Object.entries(w.dews).map(([id, band]) => [id, { score: band === "CALM" ? 10 : 60, band }])) }),
    safetyGrades: snap("safetyGrades", { grades: Object.entries(w.grades).map(([id, grade]) => ({ id, grade })), methodologyVersion: "9" }),
    mintBurn: snap("mintBurn", { hourly: (w.hourly ?? []).map((h) => ({ hourTs: h.hourTs, netFlowUsd: h.valuation === "partial" ? null : h.mint - h.burn, mintVolumeUsd: h.mint, burnVolumeUsd: h.burn, valuation: h.valuation ?? "complete" })) }),
  } as unknown as HarbourPayloads;
}

/** Run a sequence of polls; returns every confirmed event by poll index. */
function run(polls: Array<{ w: World; stale?: string[]; samePoll?: boolean }>, confirmPolls?: number): HarbourEvent[][] {
  let st: EventState | null = null;
  let at = T0;
  const out: HarbourEvent[][] = [];
  for (const p of polls) {
    if (!p.samePoll) at += 5 * MIN;
    const pl = payloads(p.w, at, p.stale);
    const model = buildHarbourModel(pl, at + 1000, { dead: [] });
    const r = detectEvents(st, eventSnapshot(model, pl, at + 1000), { confirmPolls });
    st = r.state;
    out.push(r.events);
  }
  return out;
}

const depegged = world({ peg: { usdx: { bps: -412, depeg: true }, usdy: { bps: 4, depeg: false } } });

describe("detectEvents — honesty bar", () => {
  it("never fires on the first load, however the world looks", () => {
    expect(run([{ w: depegged }])[0]).toEqual([]);
  });

  it("D-4: a depeg is confirmed on the second consecutive poll, not the first", () => {
    const ev = run([{ w: world() }, { w: depegged }, { w: depegged }]);
    expect(ev[1]).toEqual([]);
    expect(ev[2].map((e) => e.kind)).toEqual(["depeg"]);
    expect(ev[2][0]).toMatchObject({ coinId: "usdx", symbol: "USDX", endpoint: "pegSummary", from: "18", to: "412 bps", text: "USDX ran onto the Shoals" });
    expect(ev[2][0].firstSeenMs).toBeLessThan(ev[2][0].atMs);
  });

  it("a one-poll blip is never recorded; confirmPolls 1 reports it at once", () => {
    const blip = [{ w: world() }, { w: depegged }, { w: world() }, { w: world() }];
    expect(run(blip).flat()).toEqual([]);
    expect(run(blip, 1).flat().map((e) => e.kind)).toEqual(["depeg", "recovery"]);
  });

  it("recovery quotes the last off-peg deviation: '412 → 18 bps'", () => {
    const ev = run([{ w: depegged }, { w: world() }, { w: world() }]).flat();
    expect(ev.map((e) => e.kind)).toEqual(["recovery"]);
    expect(dayBookLine(ev[0], "14:20")).toBe("14:20 USDX left the Shoals · 412 → 18 bps");
  });

  it("is silent while the endpoint is stale, and a stale poll breaks the run", () => {
    const ev = run([{ w: world() }, { w: depegged, stale: ["pegSummary"] }, { w: depegged, stale: ["pegSummary"] }, { w: depegged }]);
    expect(ev.flat()).toEqual([]);
    expect(run([{ w: world() }, { w: depegged }, { w: depegged, stale: ["pegSummary"] }, { w: depegged }]).flat()).toEqual([]);
  });

  it("a rebuild without a new poll (same fetch time) does not count as a poll", () => {
    expect(run([{ w: world() }, { w: depegged }, { w: depegged, samePoll: true }]).flat()).toEqual([]);
  });

  it("coverage changes are silent: a peg reading that disappears and returns", () => {
    const gone = world({ peg: { usdx: null, usdy: { bps: 4, depeg: false } } });
    expect(run([{ w: depegged }, { w: gone }, { w: gone }, { w: world() }, { w: world() }]).flat().map((e) => e.kind)).toEqual(["recovery"]);
    // a coin first covered while off peg is a baseline, not a depeg
    expect(run([{ w: gone }, { w: depegged }, { w: depegged }]).flat()).toEqual([]);
  });

  it("a methodology change re-baselines silently", () => {
    const newMethod = { ...depegged, pegMethod: "2" };
    expect(run([{ w: world() }, { w: newMethod }, { w: newMethod }]).flat()).toEqual([]);
  });

  it("a stale first load is no baseline: the first current poll is", () => {
    expect(run([{ w: world(), stale: ["pegSummary"] }, { w: depegged }, { w: depegged }]).flat()).toEqual([]);
  });
});

describe("detectEvents — the kinds", () => {
  it("launch: a new id, confirmed after two polls; reappearing coins are not launches", () => {
    const more = world({ coins: [...world().coins, { id: "newc", supply: 3e7 }] });
    const ev = run([{ w: world() }, { w: more }, { w: more }]).flat();
    expect(ev.map((e) => [e.kind, e.coinId])).toEqual([["launch", "newc"]]);
    expect(ev[0].to).toBe("$30.0M");
    const less = world({ coins: [{ id: "usdx", supply: 2e9 }] });
    expect(run([{ w: world() }, { w: less }, { w: less }, { w: world() }, { w: world() }]).flat()).toEqual([]);
  });

  it("death: a coin whose state turns wrecked", () => {
    let st: EventState | null = null;
    const evs: HarbourEvent[] = [];
    for (let i = 0; i < 3; i++) {
      const at = T0 + i * 5 * MIN, pl = payloads(world(), at);
      const dead = i === 0 ? [] : [{ id: "usdy", name: "USDY", symbol: "USDY", deathDate: "2026-10", causeOfDeath: "algorithmic-failure" }];
      const r = detectEvents(st, eventSnapshot(buildHarbourModel(pl, at, { dead: dead as never }), pl, at));
      st = r.state; evs.push(...r.events);
    }
    expect(evs.map((e) => [e.kind, e.coinId])).toEqual([["death", "usdy"]]);
    expect(evs[0].text).toBe("USDY was towed to Wreck Cove");
  });

  it("PSI band and the weighted DEWS band", () => {
    const shift = world({ psi: "TREMOR", dews: { usdx: "ALERT", usdy: "ALERT" } });
    const ev = run([{ w: world() }, { w: shift }, { w: shift }]).flat();
    expect(ev.map((e) => e.kind).sort()).toEqual(["dews-band", "psi-band"]);
    expect(ev.find((e) => e.kind === "psi-band")).toMatchObject({ from: "Steady", to: "Tremor · 61.3" });
    expect(ev.find((e) => e.kind === "dews-band")).toMatchObject({ from: "Calm", to: "Alert" });
  });

  it("hull class crosses a decade; grade letter changes (B+ → B- is no change)", () => {
    const grown = world({ coins: [{ id: "usdx", supply: 2e9 }, { id: "usdy", supply: 1.2e9 }], grades: { usdx: "B-", usdy: "C" } });
    const ev = run([{ w: world() }, { w: grown }, { w: grown }]).flat();
    expect(ev.map((e) => [e.kind, e.coinId]).sort()).toEqual([["grade", "usdy"], ["hull-class", "usdy"]]);
    expect(ev.find((e) => e.kind === "hull-class")).toMatchObject({ from: "medium hull", text: "USDY grew to a large hull" });
    expect(ev.find((e) => e.kind === "grade")).toMatchObject({ from: "A", to: "C" });
  });
});

describe("big flow hour", () => {
  it("threshold: ≥ $100M AND ≥ 3× the window mean AND complete valuation", () => {
    expect(isBigFlowHour(FLOW_HOUR_MIN_USD, FLOW_HOUR_MIN_USD / FLOW_HOUR_MEAN_X, true)).toBe(true);
    expect(isBigFlowHour(FLOW_HOUR_MIN_USD - 1, 1, true)).toBe(false);
    expect(isBigFlowHour(150e6, 50.1e6, true)).toBe(false);
    expect(isBigFlowHour(150e6, 50e6, true)).toBe(true);
    expect(isBigFlowHour(500e6, 1e6, false)).toBe(false);
  });

  const hours = (n: number, last: { mint: number; burn: number; valuation?: string }) =>
    Array.from({ length: n }, (_, i) => (i === n - 1 ? { hourTs: 1000 + i * 3600, ...last } : { hourTs: 1000 + i * 3600, mint: 10e6, burn: 10e6 }));

  it("judges each new closed hour once; the first hour seen is the baseline", () => {
    const base = world({ hourly: hours(24, { mint: 400e6, burn: 10e6 }) });
    const big = world({ hourly: hours(25, { mint: 400e6, burn: 10e6 }) });
    const ev = run([{ w: base }, { w: big }, { w: big }]);
    expect(ev[0]).toEqual([]);
    expect(ev[1].map((e) => e.kind)).toEqual(["flow-hour"]);
    expect(ev[1][0].text).toBe("A big hour at the Mint");
    expect(ev[2]).toEqual([]);
  });

  it("partial valuation or a stale feed: nothing", () => {
    const base = world({ hourly: hours(24, { mint: 10e6, burn: 10e6 }) });
    expect(run([{ w: base }, { w: world({ hourly: hours(25, { mint: 400e6, burn: 1e6, valuation: "partial" }) }) }]).flat()).toEqual([]);
    expect(run([{ w: base }, { w: world({ hourly: hours(25, { mint: 400e6, burn: 1e6 }) }), stale: ["mintBurn"] }]).flat()).toEqual([]);
  });
});
