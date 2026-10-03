import { makeSourceStatuses } from "@/__fixtures__/pharosville-world";
import { describe, expect, it } from "vitest";
import { ACTIVE_META_BY_ID } from "@shared/lib/stablecoins";
import { makeAsset, makePegCoin } from "../__fixtures__/pharosville-world";
import { resolveShipRiskPlacement } from "./risk-placement";
import { quietNormalInput } from "../__fixtures__/data-contract-scenarios";
import { buildPharosVilleWorld } from "./pharosville-world";

const usdcMeta = ACTIVE_META_BY_ID.get("usdc-circle");
const susdeMeta = ACTIVE_META_BY_ID.get("susde-ethena");

describe("resolveShipRiskPlacement", () => {
  it.each([
    ["unknown", 0], ["missing", 0], ["unknown", -120], ["missing", -120],
  ] as const)("unknown or missing DEWS never certifies calm while known peg survives (%s, %i bps)", (mode, deviation) => {
    const input = quietNormalInput();
    input.pegSummary!.coins.find((coin) => coin.id === "usdc-circle")!.currentDeviationBps = deviation;
    if (mode === "unknown") input.stress!.signals["usdc-circle"]!.band = "UNRECOGNIZED";
    else delete input.stress!.signals["usdc-circle"];
    const world = buildPharosVilleWorld(input);
    const ship = world.ships.find((ship) => ship.id === "usdc-circle")!;
    expect(ship.evidence.stress?.state).toBe("unavailable");
    expect(ship.evidence.pegSummary?.state).toBe("current");
    expect(ship.pegDeviationBps).toBe(deviation);
    expect(ship.riskPlacement).toBe(deviation === 0 ? "safe-harbor" : "harbor-mouth-watch");
    expect(ship.placementEvidence.stale).toBe(true);
    expect(ship.riskDepth).toBeNull();
    expect(ship.visual.hullForm.waterline).toBe(deviation === 0 ? 0 : -0.08);
  });

  it("places active depegs on the storm shelf", () => {
    expect(usdcMeta).toBeDefined();
    const result = resolveShipRiskPlacement({
      asset: makeAsset({ id: "usdc-circle", symbol: "USDC" }),
      meta: usdcMeta!,
      pegCoin: makePegCoin({ id: "usdc-circle", symbol: "USDC", activeDepeg: true, currentDeviationBps: null }),
      stress: undefined,
      freshness: makeSourceStatuses({}),
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
      freshness: makeSourceStatuses({}),
    });

    expect(result.placement).toBe("ledger-mooring");
    expect(result.evidence.stale).toBe(true);
  });

  it("places NAV tokens with peg rows at ledger mooring", () => {
    expect(susdeMeta).toBeDefined();
    const result = resolveShipRiskPlacement({
      asset: makeAsset({ id: "susde-ethena", symbol: "sUSDe" }),
      meta: susdeMeta!,
      pegCoin: makePegCoin({ id: "susde-ethena", symbol: "sUSDe", currentDeviationBps: 0 }),
      stress: undefined,
      freshness: makeSourceStatuses({}),
    });

    expect(result.placement).toBe("ledger-mooring");
    expect(result.evidence.stale).toBe(true);
  });

  it("maps NAV tokens to fresh DEWS placements instead of forcing Ledger Mooring", () => {
    expect(susdeMeta).toBeDefined();
    const result = resolveShipRiskPlacement({
      asset: makeAsset({ id: "susde-ethena", symbol: "sUSDe" }),
      meta: susdeMeta!,
      pegCoin: makePegCoin({ id: "susde-ethena", symbol: "sUSDe", currentDeviationBps: 0 }),
      stress: { band: "WATCH", score: 31, signals: {}, computedAt: 1, methodologyVersion: "fixture" },
      freshness: makeSourceStatuses({}),
    });

    expect(result.placement).toBe("breakwater-edge");
    expect(result.evidence.reason).toBe("DEWS stress escalation");
    expect(result.evidence.sourceFields).toEqual(["stress.signals[id].band"]);
  });

  it("keeps NAV tokens at ledger mooring when fresh DEWS stress is CALM", () => {
    expect(susdeMeta).toBeDefined();
    const result = resolveShipRiskPlacement({
      asset: makeAsset({ id: "susde-ethena", symbol: "sUSDe" }),
      meta: susdeMeta!,
      pegCoin: makePegCoin({ id: "susde-ethena", symbol: "sUSDe", currentDeviationBps: 0 }),
      stress: { band: "CALM", score: 8, signals: {}, computedAt: 1, methodologyVersion: "fixture" },
      freshness: makeSourceStatuses({}),
    });

    expect(result.placement).toBe("ledger-mooring");
    expect(result.evidence.reason).toBe("NAV token Ledger Mooring idle preference");
  });

  it("keeps fresh active depeg as the acute NAV placement", () => {
    expect(susdeMeta).toBeDefined();
    const result = resolveShipRiskPlacement({
      asset: makeAsset({ id: "susde-ethena", symbol: "sUSDe" }),
      meta: susdeMeta!,
      pegCoin: makePegCoin({ id: "susde-ethena", symbol: "sUSDe", activeDepeg: true, currentDeviationBps: 780 }),
      stress: undefined,
      freshness: makeSourceStatuses({}),
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
      freshness: makeSourceStatuses({ safetyGrades: { state: "stale" } }),
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
      freshness: makeSourceStatuses({}),
    });

    expect(result.placement).toBe("safe-harbor");
  });

  it("does not move ships based on stale DEWS alone", () => {
    expect(usdcMeta).toBeDefined();
    const result = resolveShipRiskPlacement({
      asset: makeAsset({ id: "usdc-circle", symbol: "USDC" }),
      meta: usdcMeta!,
      pegCoin: makePegCoin({ id: "usdc-circle", symbol: "USDC", currentDeviationBps: 0 }),
      stress: { band: "DANGER", score: 90, signals: {}, computedAt: 1, methodologyVersion: "fixture" },
      freshness: makeSourceStatuses({ stress: { state: "stale" } }),
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
      freshness: makeSourceStatuses({ pegSummary: { state: "stale" } }),
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
      freshness: makeSourceStatuses({}),
    });

    expect(result.placement).toBe("safe-harbor");
    expect(result.evidence.stale).toBe(true);
  });
});
