import { describe, expect, it } from "vitest";
import { makeCoins, makePayloads, PIERED, T0_MS } from "../sim/test-fixtures";
import { buildHarbourModel, quantizeShares } from "./build";
import { hullClassFor, rigFor } from "./classify";
import type { HarbourPayloads } from "./types";

const opts = { pieredChains: PIERED, dead: [] };

describe("buildHarbourModel", () => {
  it("makes one boat per payload coin, eligibility from the payload alone", () => {
    const m = buildHarbourModel(makePayloads(), T0_MS, opts);
    expect(m.payloadCount).toBe(625);
    expect(m.boats.length).toBe(625);
    expect(new Set(m.boats.map((b) => b.id)).size).toBe(625);
    const unknown = buildHarbourModel(makePayloads({ coins: [{ id: "never-heard-of-it", name: "X", symbol: "X", pegType: "peggedUSD", circulating: { peggedUSD: 5e6 }, chainCirculating: { Ethereum: { current: 5e6 } }, chains: ["Ethereum"] }] }), T0_MS, opts);
    expect(unknown.boats.map((b) => b.id)).toEqual(["never-heard-of-it"]);
    expect(unknown.boats[0].brandColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(unknown.boats[0].logo).toBeNull();
  });

  it("is pure and deterministic", () => {
    const p = makePayloads();
    const a = buildHarbourModel(p, T0_MS, opts), b = buildHarbourModel(p, T0_MS, opts);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(b.planKey).toBe(a.planKey);
    // payload order does not matter
    const shuffled = makePayloads({ coins: [...makeCoins()].reverse() });
    expect(buildHarbourModel(shuffled, T0_MS, opts).planKey).toBe(a.planKey);
  });

  it("classes hulls by supply decade and rigs by peg", () => {
    expect([1e11, 2e9, 3e8, 4e7, 5e6, 6e5].map(hullClassFor)).toEqual(["flagship", "large", "medium", "small", "boat", "skiff"]);
    expect(["peggedUSD", "peggedEUR", "peggedGOLD", "peggedSILVER", "peggedVAR", "peggedJPY"].map(rigFor)).toEqual(["usd", "eur", "gold", "gold", "other", "fiat"]);
  });

  it("builds circuits: ≤ 4 piered stops + Far Ports, dock shares quantized and summing to 1", () => {
    const m = buildHarbourModel(makePayloads(), T0_MS, opts);
    for (const b of m.boats) {
      expect(b.circuit.filter((s) => s.chain !== null).length).toBeLessThanOrEqual(4);
      expect(b.circuit.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 9);
      for (const s of b.circuit) {
        expect(Math.abs(s.share * 20 - Math.round(s.share * 20))).toBeLessThan(1e-9);
        if (s.chain) expect(PIERED).toContain(s.chain);
      }
      expect(b.state === "moored").toBe(b.circuit.length === 1 && !b.activeDepeg);
    }
    expect(m.boats.filter((b) => b.state === "circuit").length).toBeGreaterThan(80);
    expect(quantizeShares([0.62, 0.38])).toEqual([0.6, 0.4]);
    expect(quantizeShares([0.97, 0.03]).every((v) => v >= 0.05)).toBe(true);
  });

  it("small supply drift keeps the plan key; a portfolio change moves it", () => {
    const coins = makeCoins();
    const base = buildHarbourModel(makePayloads({ coins }), T0_MS, opts);
    const drift = coins.map((c) => ({ ...c, chainCirculating: Object.fromEntries(Object.entries(c.chainCirculating).map(([k, v]) => [k, { current: v.current * 1.001 }])) }));
    expect(buildHarbourModel(makePayloads({ coins: drift }), T0_MS, opts).planKey).toBe(base.planKey);
    const moved = coins.map((c, i) => (i === 5 ? { ...c, chainCirculating: { Solana: { current: 1e10 } }, chains: ["Solana"] } : c));
    expect(buildHarbourModel(makePayloads({ coins: moved }), T0_MS, opts).planKey).not.toBe(base.planKey);
  });

  it("depegs go to the Shoals (and do not move the plan key)", () => {
    const quiet = buildHarbourModel(makePayloads(), T0_MS, opts);
    const m = buildHarbourModel(makePayloads({ depegIds: ["coin-small-3", "coin-large-1"] }), T0_MS, opts);
    expect(m.boats.find((b) => b.id === "coin-small-3")!.state).toBe("shoals");
    expect(m.readings.shoals.map((s) => s.id).sort()).toEqual(["coin-large-1", "coin-small-3"]);
    expect(m.planKey).toBe(quiet.planKey);
    expect(m.readings.seaState.offPegShare).toBeGreaterThan(0);
  });

  it("unknown is never calm: null PSI → unlit, missing peg/stress → null readings", () => {
    const noPsi = buildHarbourModel(makePayloads({ psi: null }), T0_MS, opts);
    expect(noPsi.readings.psi.lit).toBe(false);
    expect(noPsi.readings.psi.sweepSec).toBeNull();
    expect(noPsi.readings.psi.lamp).toBeNull();
    const oddBand = buildHarbourModel(makePayloads({ psi: { score: 90, band: "WHATEVER" } }), T0_MS, opts);
    expect(oddBand.readings.psi.lit).toBe(false);
    const lit = buildHarbourModel(makePayloads(), T0_MS, opts);
    expect(lit.readings.psi).toMatchObject({ lit: true, band: "BEDROCK", sweepSec: 12, lamp: "white" });

    const p = makePayloads();
    const partial: HarbourPayloads = { stablecoins: p.stablecoins!, chains: p.chains! };
    const m = buildHarbourModel(partial, T0_MS, opts);
    expect(m.readings.psi.lit).toBe(false);
    expect(m.readings.seaState.step).toBeNull();
    expect(m.readings.weather.level).toBeNull();
    expect(m.readings.stormCones).toBeNull();
    expect(m.readings.flows.available).toBe(false);
    expect(m.truth.stability.state).toBe("unavailable");
    expect(m.boats.every((b) => b.nullPeg && b.dews === null && !b.activeDepeg)).toBe(true);
    // a null deviation is an unlit stern lamp even when the peg feed is up
    expect(lit.boats.some((b) => b.nullPeg)).toBe(true);
  });

  it("no data → no fleet (AWAITING DATA), never a fixture fleet", () => {
    const m = buildHarbourModel({}, T0_MS, opts);
    expect(m.hasFleet).toBe(false);
    expect(m.boats).toEqual([]);
    expect(Object.values(m.truth).every((t) => t.state === "unavailable")).toBe(true);
  });

  it("freshness: payloads age into stale after the fetch, per endpoint", () => {
    const p = makePayloads();
    expect(buildHarbourModel(p, T0_MS, opts).truth.stablecoins.state).toBe("current");
    // 600 s budget × 12 → stale ~2 h after the producer write, even with no new fetch
    expect(buildHarbourModel(p, T0_MS + 3 * 3600_000, opts).truth.stablecoins.state).toBe("stale");
    expect(buildHarbourModel(makePayloads({ stale: true }), T0_MS, opts).truth.stablecoins.state).toBe("stale");
  });

  it("readings: weather by supply-weighted DEWS, cones per ALERT+, 24 hourly flow bars with gaps", () => {
    const m = buildHarbourModel(makePayloads(), T0_MS, opts);
    expect(m.readings.stormCones).toEqual({ count: 4, shown: 4, extra: 0 });
    expect(m.readings.weather.level).toBeGreaterThan(0);
    expect(m.readings.weather.coverage).toBeGreaterThan(0);
    expect(m.readings.weather.coverage).toBeLessThan(1);
    expect(m.readings.flows.hourly).toHaveLength(24);
    expect(m.readings.flows.hourly[5].netUsd).toBeNull();
    expect(m.readings.flows.net24hUsd).toBeNull(); // a partial hour makes the 24 h net unknown, not 0
    expect(m.readings.flows.scope).toEqual(["ethereum", "base", "arbitrum"]);
    expect(m.readings.seaState.step).toBe(0);
  });

  it("harbours reconcile with the boats' chain supply", () => {
    const m = buildHarbourModel(makePayloads(), T0_MS, opts);
    const fromBoats = m.boats.reduce((a, b) => a + b.chainShares.reduce((x, s) => x + s.usd, 0), 0);
    const fromHarbours = m.harbours.reduce((a, h) => a + h.supplyUsd, 0);
    expect(fromHarbours).toBeCloseTo(fromBoats, -2);
    expect(m.harbours.reduce((a, h) => a + h.share, 0)).toBeCloseTo(1, 9);
    expect(m.harbours.filter((h) => h.piered).map((h) => h.chain).sort()).toEqual([...PIERED].sort());
  });

  it("wrecks come from the dead-coin list; a payload coin on it is wrecked", () => {
    const dead = [{ id: "coin-boat-1", name: "Gone", symbol: "GONE", pegCurrency: "USD" as const, causeOfDeath: "abandoned" as const, deathDate: "2024-01-01", obituary: "x", sourceUrl: "x", sourceLabel: "x" }];
    const m = buildHarbourModel(makePayloads(), T0_MS, { pieredChains: PIERED, dead });
    expect(m.readings.wrecks.map((w) => w.id)).toEqual(["coin-boat-1"]);
    expect(m.boats.find((b) => b.id === "coin-boat-1")!.state).toBe("wrecked");
    expect(buildHarbourModel(makePayloads(), T0_MS, { pieredChains: PIERED }).readings.wrecks.length).toBeGreaterThan(50);
  });
});
