import { describe, expect, it } from "vitest";
import type { Boat } from "../model/types";
import { cullLabels } from "./cull";
import { boatFact, landmarkFact, whereabouts, whyHere } from "./facts";
import { bps, money, pctChange, pegName, share } from "./format";
import { searchCoins } from "./search";

const coin = (symbol: string, name: string, supply: number) => ({ id: symbol.toLowerCase(), symbol, name, supply });
const COINS = [coin("USX", "Solstice USX", 2e8), coin("USDT", "Tether", 1.84e11), coin("USDC", "USD Coin", 7.6e10),
  coin("DAI", "Dai", 4e9), coin("PYUSD", "PayPal USD", 1e9), coin("EURC", "Euro Coin", 2e8), coin("GHO", "Aave GHO", 3e8)];

describe("search", () => {
  it("ranks an exact ticker first", () => expect(searchCoins("dai", COINS)[0].symbol).toBe("DAI"));
  it("breaks prefix ties by supply, not by ticker length", () => expect(searchCoins("us", COINS).map((c) => c.symbol).slice(0, 3)).toEqual(["USDT", "USDC", "USX"]));
  it("matches name words and subsequences", () => {
    expect(searchCoins("paypal", COINS)[0].symbol).toBe("PYUSD");
    expect(searchCoins("tthr", COINS)[0].symbol).toBe("USDT");
  });
  it("returns nothing for an empty or hopeless query", () => {
    expect(searchCoins("  ", COINS)).toEqual([]);
    expect(searchCoins("zzqx", COINS)).toEqual([]);
  });
});

describe("format", () => {
  it("money", () => {
    expect(money(184.09e9)).toBe("$184.1B");
    expect(money(4.213e9)).toBe("$4.21B");
    expect(money(312e6)).toBe("$312M");
    expect(money(-41.8e6, { signed: true })).toBe("−$41.8M");
    expect(money(null)).toBe("—");
  });
  it("bps and percentages use a true minus", () => {
    expect(bps(-35.2)).toBe("−35 bps");
    expect(bps(12)).toBe("+12 bps");
    expect(pctChange(-0.0001)).toBe("−0.01%");
    expect(pctChange(0.1234)).toBe("+12.3%");
    expect(share(0.583)).toBe("58%");
    expect(share(0.0004)).toBe("<0.1%");
  });
  it("peg names", () => { expect(pegName("peggedUSD")).toBe("US dollar"); expect(pegName("peggedXYZ")).toBe("XYZ"); });
});

const boat = (over: Partial<Boat> = {}): Boat => ({
  id: "usdt", symbol: "USDT", name: "Tether", supply: 184.1e9, hullClass: "flagship", rig: "usd", pegType: "peggedUSD",
  brandColor: "#26a17b", logo: null, chainShares: [{ chain: "Tron", share: 0.51, usd: 93e9 }, { chain: "Ethereum", share: 0.4, usd: 73e9 }],
  circuit: [{ chain: "Tron", where: "pier-tron", share: 0.55, rawShare: 0.51 }, { chain: "Ethereum", where: "pier-ethereum", share: 0.45, rawShare: 0.4 }],
  home: "pier-tron", pegDeviationBps: -8, activeDepeg: false, nullPeg: false, dews: "CALM", dewsScore: 15, grade: "A-", state: "circuit", ...over,
});

describe("facts", () => {
  it("one-fact tag lines", () => {
    expect(boatFact(boat(), whereabouts(0, "berth", "Tron"))).toBe("USDT · $184.1B · alongside Tron");
    expect(boatFact(boat(), whereabouts(2, "berth", "Ethereum"))).toBe("USDT · $184.1B · sailing to Ethereum");
    expect(boatFact(boat({ pegDeviationBps: -35, state: "shoals" }), whereabouts(5, "shoals", null))).toBe("USDT · $184.1B · on the Shoals −35 bps");
  });
  it("explains the position from the data", () => {
    expect(whyHere(boat(), whereabouts(0, "berth", "Tron"))).toMatch(/longest at Tron, which holds 51%/);
    expect(whyHere(boat({ state: "shoals", pegDeviationBps: -35 }), whereabouts(5, "shoals", null))).toMatch(/35 bps below its peg/);
    expect(whyHere(boat({ circuit: [{ chain: null, where: "far", share: 1, rawShare: 1 }] }), whereabouts(4, "far", null))).toMatch(/Far Ports/);
  });
  it("landmarks without data say so instead of inventing one", () => {
    expect(landmarkFact("pharos", null, null).fact).toMatch(/unlit/);
    expect(landmarkFact("church", null, null).decorative).toBe(true);
  });
});

describe("label culling", () => {
  it("keeps labels in priority order and drops overlaps", () => {
    const b = (x: number, y: number, visible = true) => ({ x, y, w: 50, h: 14, visible });
    expect(cullLabels([b(10, 10), b(30, 12), b(100, 10), b(200, 10, false)])).toEqual([true, false, true, false]);
    expect(cullLabels([b(-20, 10)], 4, { w: 800, h: 600 })).toEqual([false]);
  });
});
