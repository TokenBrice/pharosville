import { describe, expect, it } from "vitest";
import { applyDevCueOverrides, deriveTargets, OFFICE_FURL_HOLD, OFFICE_FURL_ON, OFFICE_WORKS_HOLD, OFFICE_WORKS_ON, officeStates, officeWorks } from "../readings/bind";
import { boatFact, harbourFact, MAIDEN_LINE, officeLine, SIGNAL_HOISTED, stormSignalLine } from "../ui/facts";
import { buildHarbourModel } from "./build";
import { isMaiden, MAIDEN_MAX_GAP_SHARE, STORM_FLAGS_MAX, weekAgoGapShare } from "./readings";
import type { CoinRow, HarbourPayloads } from "./types";

const NOW = 1_790_000_000_000;
const meta = (status: "fresh" | "stale") => ({ updatedAt: NOW / 1000 - 60, ageSeconds: 60, status });
const snap = <T,>(data: T, status: "fresh" | "stale" = "fresh") => ({ data, meta: meta(status), fetchedAtMs: NOW });
const coin = (id: string, supply: number, prevWeek?: number, prevMonth?: number): CoinRow => ({
  id, name: id, symbol: id.toUpperCase(), pegType: "peggedUSD", circulating: { peggedUSD: supply }, chainCirculating: { Ethereum: { current: supply } }, chains: ["Ethereum"],
  ...(prevWeek != null ? { circulatingPrevWeek: { peggedUSD: prevWeek } } : {}),
  ...(prevMonth != null ? { circulatingPrevMonth: { peggedUSD: prevMonth } } : {}),
});

describe("DA-04 storm signals at the masthead", () => {
  const bands: Array<[string, string, number]> = [["a", "CALM", 5], ["b", "WATCH", 40], ["c", "ALERT", 60], ["d", "WARNING", 70], ["e", "DANGER", 90], ["f", "ALERT", 61], ["g", "ALERT", 62], ["h", "ALERT", 63]];
  const p = (status: "fresh" | "stale" = "fresh"): HarbourPayloads => ({
    stablecoins: snap({ peggedAssets: bands.map(([id], i) => coin(id, 1e9 - i)) }),
    stress: snap({ signals: Object.fromEntries(bands.map(([id, band, score]) => [id, { band, score }])) }, status),
  }) as HarbourPayloads;

  it("ALERT+ only, worst score first, at most five, with the station's shapes", () => {
    const m = buildHarbourModel(p(), NOW, { dead: [] });
    const f = m.readings.stormFlags;
    expect(f).toHaveLength(STORM_FLAGS_MAX);
    expect(f.map((x) => [x.id, x.shape])).toEqual([["e", "cone+drum"], ["d", "drum"], ["h", "cone"], ["g", "cone"], ["f", "cone"]]);
    expect(m.boats.find((b) => b.id === "c")!.stormSignal).toBeNull(); // sixth ALERT+: no signal
    expect(m.boats.find((b) => b.id === "b")!.stormSignal).toBeNull(); // WATCH is below the line
  });

  it("stale stress: no signal anywhere (neutral, never calm claimed)", () => {
    const m = buildHarbourModel(p("stale"), NOW, { dead: [] });
    expect(m.readings.stormFlags).toEqual([]);
    expect(m.boats.every((b) => b.stormSignal === null)).toBe(true);
    expect(stormSignalLine(m.boats.find((b) => b.id === "e")!, false)).toBeNull();
  });

  it("hover and panel say the same words", () => {
    const m = buildHarbourModel(p(), NOW, { dead: [] });
    const e = m.boats.find((b) => b.id === "e")!;
    expect(boatFact(e, { kind: "moored", place: "Ethereum" })).toContain(SIGNAL_HOISTED);
    expect(stormSignalLine(e, true)).toBe("a cone and a drum at the masthead, signal hoisted: early warning, not a depeg");
    expect(stormSignalLine(m.boats.find((b) => b.id === "c")!, true)).toMatch(/only the five worst/);
    expect(boatFact(m.boats.find((b) => b.id === "a")!, { kind: "moored", place: "Ethereum" })).not.toContain(SIGNAL_HOISTED);
    // a flagged coin that is also off peg never reads "not a depeg"
    expect(stormSignalLine({ ...e, activeDepeg: true }, true)).not.toMatch(/not a depeg/);
  });
});

describe("DA-07 maiden voyage", () => {
  it("no week-ago AND no month-ago supply, supply now, feed current, no producer gap", () => {
    expect(isMaiden(coin("n", 5e6), true, 0)).toBe(true);
    expect(isMaiden(coin("n", 5e6, 0, 0), true, 0)).toBe(true);
    expect(isMaiden(coin("n", 5e6, 1), true, 0)).toBe(false);          // had supply a week ago
    expect(isMaiden(coin("n", 5e6, undefined, 3e6), true, 0)).toBe(false); // a month-ago supply: not new this week
    expect(isMaiden(coin("n", 0), true, 0)).toBe(false);                // nothing afloat
    expect(isMaiden(coin("n", 5e6), false, 0)).toBe(false);             // feed not current
    expect(isMaiden(coin("n", 5e6), true, MAIDEN_MAX_GAP_SHARE)).toBe(true);
    expect(isMaiden(coin("n", 5e6), true, MAIDEN_MAX_GAP_SHARE + 1e-9)).toBe(false); // producer gap
  });

  it("the gap share counts coins with supply now and no week-ago supply", () => {
    expect(weekAgoGapShare([coin("a", 1, 1), coin("b", 1), coin("c", 0), coin("d", 1, 0)])).toBeCloseTo(2 / 3);
  });

  it("through the model: one newcomer among 100 settled coins; a stale feed or a gap of 3 % calls nobody new", () => {
    const settled = Array.from({ length: 100 }, (_, i) => coin(`c${i}`, 1e7, 1e7, 1e7));
    const build = (rows: CoinRow[], status: "fresh" | "stale" = "fresh") =>
      buildHarbourModel({ stablecoins: snap({ peggedAssets: rows }, status) } as HarbourPayloads, NOW, { dead: [] });
    expect(build([...settled, coin("new", 5e6)]).boats.filter((b) => b.maiden).map((b) => b.id)).toEqual(["new"]);
    expect(build([...settled, coin("new", 5e6)], "stale").boats.some((b) => b.maiden)).toBe(false);
    expect(build([...settled, coin("x1", 5e6), coin("x2", 5e6), coin("x3", 5e6)]).boats.some((b) => b.maiden)).toBe(false);
    expect(MAIDEN_LINE).toBe("new to the register this week");
  });
});

describe("T6 chain office (change30dPct, a fraction)", () => {
  it("works at ≥ +8 %, furled at ≤ −8 %, neutral between", () => {
    expect(officeWorks(OFFICE_WORKS_ON)).toBe("works");
    expect(officeWorks(OFFICE_WORKS_ON - 1e-9)).toBe("neutral");
    expect(officeWorks(OFFICE_FURL_ON)).toBe("furled");
    expect(officeWorks(OFFICE_FURL_ON + 1e-9)).toBe("neutral");
    expect(officeWorks(0)).toBe("neutral");
  });
  it("hysteresis: works holds down to +6 %, then lets go; neutral needs +8 % to start", () => {
    expect(officeWorks(0.07, "works")).toBe("works");
    expect(officeWorks(OFFICE_WORKS_HOLD, "works")).toBe("works");
    expect(officeWorks(OFFICE_WORKS_HOLD - 1e-9, "works")).toBe("neutral");
    expect(officeWorks(0.07, "neutral")).toBe("neutral");
    expect(officeWorks(-0.07, "furled")).toBe("furled");
    expect(officeWorks(OFFICE_FURL_HOLD, "furled")).toBe("furled");
    expect(officeWorks(OFFICE_FURL_HOLD + 1e-9, "furled")).toBe("neutral");
    expect(officeWorks(-0.07, "neutral")).toBe("neutral");
    expect(officeWorks(0.07, "furled")).toBe("neutral");
  });
  it("neutral when /api/chains is not current or the figure is missing", () => {
    expect(officeWorks(0.5, "works", false)).toBe("neutral");
    expect(officeWorks(-0.5, "neutral", false)).toBe("neutral");
    expect(officeWorks(null)).toBe("neutral");
    expect(officeWorks(Number.NaN)).toBe("neutral");
  });
  it("per chain through deriveTargets, carrying the previous states", () => {
    const rows = [{ name: "Ethereum", change30dPct: 0.12 }, { name: "Tron", change30dPct: -0.09 }, { name: "Base", change30dPct: 0.07 }];
    expect(officeStates(rows, true, { Base: "works" })).toEqual({ Ethereum: "works", Tron: "furled", Base: "works" });
    const m = (status: "fresh" | "stale") => buildHarbourModel({ chains: snap({ chains: [] }, status) } as unknown as HarbourPayloads, NOW, { dead: [] });
    expect(deriveTargets({ model: m("fresh"), chainsChange7d: 0, stablecoinsAttempted: true, chainRows: rows }).offices).toEqual({ Ethereum: "works", Tron: "furled", Base: "neutral" });
    expect(Object.values(deriveTargets({ model: m("stale"), chainsChange7d: 0, stablecoinsAttempted: true, chainRows: rows }).offices)).toEqual(["neutral", "neutral", "neutral"]);
  });
  it("panel lines", () => {
    expect(officeLine("works", 0.12)).toBe("Office under works: supply +12.0% over 30 d");
    expect(officeLine("furled", -0.09)).toBe("Awnings furled: −9.0% over 30 d");
    expect(officeLine("neutral", 0.07)).toBeNull();
    const m = { harbours: [{ chain: "Base", supplyUsd: 4e9, visitors: 12 }] } as unknown as Parameters<typeof harbourFact>[1];
    expect(harbourFact("Base", m, "works", 0.12)).toBe("$4.00B · 12 boats call · office under works: supply +12.0% over 30 d");
    expect(harbourFact("Base", m, "neutral", 0.12)).toBe("$4.00B · 12 boats call");
  });
});

describe("dev cue overrides", () => {
  it("?stormflags=3 ?maiden=2 ?office=Tron:furled", () => {
    const model = buildHarbourModel({ stablecoins: snap({ peggedAssets: [coin("a", 3e9, 1, 1), coin("b", 2e9, 1, 1), coin("c", 1e9, 1, 1)] }) } as HarbourPayloads, NOW, { dead: [] });
    const t = deriveTargets({ model, chainsChange7d: 0, stablecoinsAttempted: true });
    const o = applyDevCueOverrides(t, new URLSearchParams("stormflags=3&maiden=2&office=Tron:furled"), model);
    expect(o.stormFlags.map((f) => f.shape)).toEqual(["cone+drum", "drum", "cone"]);
    expect(o.maidens).toEqual(["a", "b"]);
    expect(o.offices.Tron).toBe("furled");
    expect(t.stormFlags).toEqual([]);
  });
});
