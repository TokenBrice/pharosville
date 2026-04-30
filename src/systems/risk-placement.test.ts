import { describe, expect, it } from "vitest";
import { ACTIVE_META_BY_ID } from "@shared/lib/stablecoins";
import { makeAsset, makePegCoin } from "../__fixtures__/pharosville-world";
import { resolveShipRiskPlacement } from "./risk-placement";

const usdcMeta = ACTIVE_META_BY_ID.get("usdc-circle");
const susdeMeta = ACTIVE_META_BY_ID.get("susde-ethena");

describe("resolveShipRiskPlacement", () => {
  it("places active depegs on the storm shelf", () => {
    expect(usdcMeta).toBeDefined();
    const result = resolveShipRiskPlacement({
      asset: makeAsset({ id: "usdc-circle", symbol: "USDC" }),
      meta: usdcMeta!,
      pegCoin: makePegCoin({ id: "usdc-circle", symbol: "USDC", activeDepeg: true, currentDeviationBps: null }),
      stress: undefined,
      freshness: {},
    });

    expect(result.placement).toBe("storm-shelf");
  });

  it("places NAV tokens with missing peg rows at ledger mooring before generic evidence caveats", () => {
    expect(susdeMeta).toBeDefined();
    const result = resolveShipRiskPlacement({
      asset: makeAsset({ id: "susde-ethena", symbol: "sUSDe" }),
      meta: susdeMeta!,
      pegCoin: undefined,
      stress: undefined,
      freshness: {},
    });

    expect(result.placement).toBe("ledger-mooring");
    expect(result.evidence.reason).toBe("NAV token ledger placement");
    expect(result.evidence.sourceFields).toEqual(["meta.flags.navToken", "pegSummary.coins"]);
  });

  it("places NAV tokens with peg rows at ledger mooring", () => {
    expect(susdeMeta).toBeDefined();
    const result = resolveShipRiskPlacement({
      asset: makeAsset({ id: "susde-ethena", symbol: "sUSDe" }),
      meta: susdeMeta!,
      pegCoin: makePegCoin({ id: "susde-ethena", symbol: "sUSDe", currentDeviationBps: 0 }),
      stress: undefined,
      freshness: {},
    });

    expect(result.placement).toBe("ledger-mooring");
    expect(result.evidence.sourceFields).toEqual(["meta.flags.navToken", "pegSummary.coins[]"]);
    expect(result.evidence.stale).toBe(false);
  });

  it("keeps NAV tokens at ledger mooring when fresh DEWS would otherwise move them", () => {
    expect(susdeMeta).toBeDefined();
    const result = resolveShipRiskPlacement({
      asset: makeAsset({ id: "susde-ethena", symbol: "sUSDe" }),
      meta: susdeMeta!,
      pegCoin: makePegCoin({ id: "susde-ethena", symbol: "sUSDe", currentDeviationBps: 0 }),
      stress: { band: "WATCH", score: 31, signals: {}, computedAt: 1, methodologyVersion: "fixture" },
      freshness: {},
    });

    expect(result.placement).toBe("ledger-mooring");
    expect(result.evidence.sourceFields).toEqual(["meta.flags.navToken", "pegSummary.coins[]", "stress.signals[]"]);
  });

  it("keeps fresh active depeg as the acute NAV placement", () => {
    expect(susdeMeta).toBeDefined();
    const result = resolveShipRiskPlacement({
      asset: makeAsset({ id: "susde-ethena", symbol: "sUSDe" }),
      meta: susdeMeta!,
      pegCoin: makePegCoin({ id: "susde-ethena", symbol: "sUSDe", activeDepeg: true, currentDeviationBps: 780 }),
      stress: undefined,
      freshness: {},
    });

    expect(result.placement).toBe("storm-shelf");
  });

  it("uses fresh DEWS danger even when report cards are stale", () => {
    expect(usdcMeta).toBeDefined();
    const result = resolveShipRiskPlacement({
      asset: makeAsset({ id: "usdc-circle", symbol: "USDC" }),
      meta: usdcMeta!,
      pegCoin: makePegCoin({ id: "usdc-circle", symbol: "USDC", currentDeviationBps: 0 }),
      stress: { band: "DANGER", score: 90, signals: {}, computedAt: 1, methodologyVersion: "fixture" },
      freshness: { reportCardsStale: true },
    });

    expect(result.placement).toBe("storm-shelf");
  });

  it("uses the canonical DEWS calm placement when fresh stress is calm", () => {
    expect(usdcMeta).toBeDefined();
    const result = resolveShipRiskPlacement({
      asset: makeAsset({ id: "usdc-circle", symbol: "USDC" }),
      meta: usdcMeta!,
      pegCoin: makePegCoin({ id: "usdc-circle", symbol: "USDC", currentDeviationBps: 0 }),
      stress: { band: "CALM", score: 12, signals: {}, computedAt: 1, methodologyVersion: "fixture" },
      freshness: {},
    });

    expect(result.placement).toBe("safe-harbor");
    expect(result.evidence.reason).toBe("DEWS stress escalation");
  });

  it("does not move ships based on stale DEWS alone", () => {
    expect(usdcMeta).toBeDefined();
    const result = resolveShipRiskPlacement({
      asset: makeAsset({ id: "usdc-circle", symbol: "USDC" }),
      meta: usdcMeta!,
      pegCoin: makePegCoin({ id: "usdc-circle", symbol: "USDC", currentDeviationBps: 0 }),
      stress: { band: "DANGER", score: 90, signals: {}, computedAt: 1, methodologyVersion: "fixture" },
      freshness: { stressStale: true },
    });

    expect(result.placement).toBe("safe-harbor");
    expect(result.evidence.stale).toBe(true);
  });

  it("does not treat stale active-depeg evidence as a live storm signal", () => {
    expect(usdcMeta).toBeDefined();
    const result = resolveShipRiskPlacement({
      asset: makeAsset({ id: "usdc-circle", symbol: "USDC" }),
      meta: usdcMeta!,
      pegCoin: makePegCoin({ id: "usdc-circle", symbol: "USDC", activeDepeg: true, currentDeviationBps: 900 }),
      stress: undefined,
      freshness: { pegSummaryStale: true },
    });

    expect(result.placement).toBe("safe-harbor");
    expect(result.evidence.stale).toBe(true);
  });

  it("keeps missing or low-confidence evidence in Calm Anchorage with an evidence caveat", () => {
    expect(usdcMeta).toBeDefined();
    const result = resolveShipRiskPlacement({
      asset: makeAsset({ id: "usdc-circle", symbol: "USDC", priceConfidence: "low" }),
      meta: usdcMeta!,
      pegCoin: undefined,
      stress: undefined,
      freshness: {},
    });

    expect(result.placement).toBe("safe-harbor");
    expect(result.evidence.reason).toBe("Missing or low-confidence price evidence");
    expect(result.evidence.stale).toBe(true);
  });
});
