import { describe, expect, it } from "vitest";
import book from "../data/prelaunch.json";
import { activityForRate, applyFlowOverrides, civicFlows, dominanceFor, workLevels } from "./flows";
import { allocateYard, launchedIds, stageFor, type PrelaunchBook, type PrelaunchCoin } from "./yard";

const hour = (mintUsd: number, burnUsd: number, i = 0) => ({ hourTs: i, netUsd: mintUsd - burnUsd, mintUsd, burnUsd });
const flows = (hourly: ReturnType<typeof hour>[], extra: Partial<{ stale: boolean; available: boolean }> = {}) => ({
  hourly, net24hUsd: hourly.reduce((s, h) => s + h.netUsd, 0), scope: ["ethereum", "base", "arbitrum"], stale: false, available: true, ...extra,
});

describe("the Mint and the Burn", () => {
  it("activity is log-scaled between idle and flat out", () => {
    expect(activityForRate(0)).toBe(0);
    expect(activityForRate(4e6)).toBe(0);
    expect(activityForRate(4e7)).toBeCloseTo(0.5);
    expect(activityForRate(4e8)).toBe(1);
    expect(activityForRate(4e9)).toBe(1);
  });

  it("dominance follows the 24 h net, with a visible floor and a noise band", () => {
    expect(dominanceFor(100, 100)).toBe(0);
    expect(dominanceFor(1000, 999)).toBe(0);
    expect(dominanceFor(103, 100)).toBeCloseTo(0.35);
    expect(dominanceFor(100, 103)).toBeCloseTo(-0.35);
    expect(dominanceFor(300, 100)).toBe(1);
    expect(dominanceFor(0, 0)).toBe(0);
  });

  it("a negative net makes the Burn work harder than the Mint", () => {
    const c = civicFlows(flows(Array.from({ length: 24 }, (_, i) => hour(40e6, 80e6, i))));
    expect(c.net24hUsd).toBeLessThan(0);
    expect(c.dominance).toBeLessThan(0);
    const w = workLevels(c);
    expect(w.burn).toBeGreaterThan(w.mint);
  });

  it("stale or missing flows bank the fires (never drawn as a calm reading)", () => {
    const stale = civicFlows(flows([hour(1e8, 1e8)], { stale: true }));
    expect(stale.banked).toBe(true);
    expect(stale.mint.activity).toBe(0);
    expect(workLevels(stale)).toEqual({ mint: 0, burn: 0 });
    expect(stale.mint.volume24hUsd).toBe(1e8); // the panel still has the last numbers
    const none = civicFlows({ hourly: [], net24hUsd: null, scope: [], stale: false, available: false });
    expect(none.banked).toBe(true);
    expect(none.net24hUsd).toBeNull();
    expect(civicFlows(null).banked).toBe(true);
  });

  it("dev overrides take an activity or a 24 h volume", () => {
    const base = civicFlows(flows([hour(1e8, 1e8)]));
    const hi = applyFlowOverrides(base, new URLSearchParams("mint=1&burn=0.2"));
    expect(hi.mint.activity).toBeCloseTo(1);
    expect(hi.burn.activity).toBeCloseTo(0.2);
    expect(hi.dominance).toBeGreaterThan(0);
    const usd = applyFlowOverrides(base, new URLSearchParams("burn=9e9"));
    expect(usd.burn.volume24hUsd).toBe(9e9);
    expect(usd.dominance).toBeLessThan(0);
    expect(applyFlowOverrides(base, new URLSearchParams(""))).toBe(base);
  });
});

describe("the Shipyard", () => {
  const coins = (book as unknown as PrelaunchBook).coins;

  it("the book holds the registry's pre-launch coins with their phases", () => {
    expect(coins.length).toBe((book as unknown as PrelaunchBook).count);
    expect(coins.length).toBeGreaterThan(11);
    expect(new Set(coins.map((c) => c.id)).size).toBe(coins.length);
    for (const c of coins) expect(c.symbol && c.name).toBeTruthy();
  });

  it("stages follow the launch phase", () => {
    expect(stageFor("announced")).toBe("keel");
    expect(stageFor(null)).toBe("keel");
    expect(stageFor("testnet")).toBe("ribs");
    expect(stageFor("auditing")).toBe("planked");
    expect(stageFor("beta")).toBe("painted");
    expect(stageFor("launching-soon")).toBe("rigged");
  });

  it("rigged hulls take the slips, the rest the berths, furthest along first; every slot used once", () => {
    const plan = allocateYard(coins, [5, 4, 3, 2, 1, 0], Array.from({ length: 37 }, (_, i) => i));
    expect(plan.length).toBe(coins.length);
    const rigged = plan.filter((p) => p.stage === "rigged");
    for (const p of rigged.slice(0, 6)) expect(p.slot?.kind).toBe("slip");
    const used = plan.filter((p) => p.slot).map((p) => `${p.slot!.kind}${p.slot!.index}`);
    expect(new Set(used).size).toBe(used.length);
    const berths = plan.filter((p) => p.slot?.kind === "berth");
    const order = ["rigged", "painted", "planked", "ribs", "keel"];
    for (let i = 1; i < berths.length; i++) expect(order.indexOf(berths[i].stage)).toBeGreaterThanOrEqual(order.indexOf(berths[i - 1].stage));
  });

  it("is deterministic and overflows to no slot rather than overlap", () => {
    const few = allocateYard(coins, [0], [0, 1]);
    expect(few.filter((p) => p.slot).length).toBe(3);
    expect(allocateYard([...coins].reverse(), [0], [0, 1]).map((p) => p.coin.id)).toEqual(few.map((p) => p.coin.id));
  });

  it("a coin that appears live is launched (by id or DefiLlama id)", () => {
    const c: PrelaunchCoin[] = [
      { ...coins[0], id: "a-x", llamaId: null },
      { ...coins[0], id: "b-y", llamaId: "777" },
      { ...coins[0], id: "c-z", llamaId: null },
    ];
    expect([...launchedIds(c, new Set(["a-x", "777", "zzz"]))].sort()).toEqual(["a-x", "b-y"]);
  });
});
