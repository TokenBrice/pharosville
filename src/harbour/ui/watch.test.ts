import { describe, expect, it } from "vitest";
import { buildHarbourModel } from "../model/build";
import { makePayloads, PIERED, T0_MS } from "../sim/test-fixtures";
import { BREATH_K, IDLE_AFTER_S, idleBreath, modelWatch, rankWatch, WATCH_MOVER_MIN_USD, type WatchCoin } from "./watch";

const coin = (id: string, o: Partial<WatchCoin> = {}): WatchCoin => ({ id, symbol: id.toUpperCase(), supply: 1e9, activeDepeg: false, pegDeviationBps: 2, prevDay: 1e9, maiden: false, ...o });

describe("watch ranking", () => {
  it("visits the biggest mover, the worst depeg and the newest coin, in that order", () => {
    const stops = rankWatch([
      coin("a", { supply: 5e9, prevDay: 4.9e9 }),            // +100M
      coin("b", { supply: 2e9, prevDay: 2.4e9 }),            // −400M: the mover
      coin("c", { activeDepeg: true, pegDeviationBps: -80 }),
      coin("d", { activeDepeg: true, pegDeviationBps: 310 }), // the worst depeg
      coin("e", { supply: 3e7, prevDay: 3e7, maiden: true }),
      coin("f", { supply: 9e7, prevDay: 9e7, maiden: true }),               // the largest newcomer
    ]);
    expect(stops.map((s) => [s.id, s.reason])).toEqual([["b", "mover"], ["d", "depeg"], ["f", "launch"]]);
    expect(stops[0].line).toMatch(/biggest supply change in 24 h/);
  });
  it("shows nothing it cannot name: no mover under the floor, no depeg without one", () => {
    const stops = rankWatch([coin("a", { supply: 1e9 + WATCH_MOVER_MIN_USD / 2 }), coin("b", { activeDepeg: false, pegDeviationBps: 900 }), coin("c", { maiden: false })]);
    expect(stops).toEqual([]);
  });
  it("never lists one coin twice", () => {
    const stops = rankWatch([coin("a", { supply: 3e9, prevDay: 1e9, activeDepeg: true, pegDeviationBps: 500 })]);
    expect(stops.map((s) => s.id)).toEqual(["a"]);
  });
});

describe("idle breath", () => {
  const o = { k: 0, dx: 0, dz: 0 };
  it("is still for the first three minutes", () => {
    expect(idleBreath(IDLE_AFTER_S - 1, o)).toEqual({ k: 0, dx: 0, dz: 0 });
  });
  it("never exceeds ±3 % or a few metres", () => {
    for (let t = IDLE_AFTER_S; t < IDLE_AFTER_S + 600; t += 0.7) {
      idleBreath(t, o);
      expect(Math.abs(o.k)).toBeLessThanOrEqual(BREATH_K + 1e-9);
      expect(Math.hypot(o.dx, o.dz)).toBeLessThan(6);
    }
  });
  it("eases in rather than jumping", () => {
    idleBreath(IDLE_AFTER_S + 0.5, o);
    expect(Math.abs(o.k)).toBeLessThan(0.0005);
  });
});

describe("the watch visits landmarks when their readings are notable (D14/A15)", () => {
  const all = { pharos: "PSI 61.0 · Fracture", shoals: "3 boats off peg", station: "Station: Alert; two cones." };
  it("runs the harbourmaster's round: the Pharos, the mover, the Shoals, the depeg, the station, the newcomer", () => {
    const stops = rankWatch([
      coin("b", { supply: 2e9, prevDay: 2.4e9 }),
      coin("d", { activeDepeg: true, pegDeviationBps: 310 }),
      coin("f", { supply: 9e7, prevDay: 9e7, maiden: true }),
    ], { fleet: true, peg: true }, all);
    expect(stops.map((s) => [s.kind, s.id, s.reason])).toEqual([
      ["landmark", "pharos", "pharos"], ["boat", "b", "mover"], ["landmark", "shoals", "shoals"],
      ["boat", "d", "depeg"], ["landmark", "storm-mast", "station"], ["boat", "f", "launch"],
    ]);
    expect(stops.filter((s) => s.kind === "landmark").map((s) => [s.name, s.line])).toEqual([
      ["The Pharos", all.pharos], ["The Shoals", all.shoals], ["Storm-signal Station", all.station],
    ]);
  });
  it("names no landmark without current fleet readings, and no Shoals without current peg readings", () => {
    expect(rankWatch([], { fleet: false, peg: true }, all)).toEqual([]);
    expect(rankWatch([], { fleet: true, peg: false }, all).map((s) => s.reason)).toEqual(["pharos", "station"]);
    expect(rankWatch([], { fleet: true, peg: true }, {})).toEqual([]);
  });

  it("excludes tokenized funds from modelWatch mover stops even when their 24 h AUM swing exceeds core coins", () => {
    const p = makePayloads({
      coins: [
        {
          id: "usdc-circle", name: "USD Coin", symbol: "USDC", pegType: "peggedUSD",
          circulating: { peggedUSD: 10e9 }, circulatingPrevDay: { peggedUSD: 9.95e9 },
          chainCirculating: { Ethereum: { current: 10e9 } }, chains: ["Ethereum"],
        },
        {
          id: "buidl-blackrock", name: "BlackRock BUIDL", symbol: "BUIDL", pegType: "peggedUSD",
          circulating: { peggedUSD: 2.5e9 }, circulatingPrevDay: { peggedUSD: 1.5e9 },
          chainCirculating: { Ethereum: { current: 2.5e9 } }, chains: ["Ethereum"],
        },
      ],
    });
    const m = buildHarbourModel(p, T0_MS, { pieredChains: PIERED, dead: [] });
    const stops = modelWatch(m, T0_MS);
    const mover = stops.find((s) => s.reason === "mover");
    expect(mover?.id).toBe("usdc-circle");
    expect(stops.some((s) => s.id === "buidl-blackrock")).toBe(false);
  });
});
