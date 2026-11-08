import { describe, expect, it } from "vitest";
import { buildHarbourModel } from "../model/build";
import { PHAROSVILLE_ENDPOINT_REGISTRY } from "@shared/lib/pharosville-endpoint-registry";
import { FRESHNESS_RATIOS } from "@shared/lib/status-thresholds";
import type { HarbourPayloads } from "../model/types";
import { modelWatch, watchSources } from "./watch";
import { truthCopy } from "./truth-copy";

const NOW = Date.UTC(2026, 10, 8);
const coin = (id: string, week: number, month = week) => ({ id, name: id, symbol: id, circulating: { peggedUSD: 1e8 }, circulatingPrevDay: { peggedUSD: 9e7 }, circulatingPrevWeek: { peggedUSD: week }, circulatingPrevMonth: { peggedUSD: month }, pegType: "peggedUSD", chains: [], chainCirculating: {} });
const snap = <T,>(data: T) => ({ data, fetchedAtMs: NOW, meta: { updatedAt: NOW / 1000, ageSeconds: 0, status: "fresh" as const } });
const payloads = (coins = [coin("a", 1e8), coin("new", 0, 0)]): HarbourPayloads => ({ stablecoins: snap({ peggedAssets: coins }), pegSummary: snap({ coins: [{ id: "a", activeDepeg: true, currentDeviationBps: 300 }] }) } as HarbourPayloads);

describe("Watch uses installed model truth", () => {
  it("reuses Boat.maiden: a positive month baseline and widespread week gaps never become newcomers", () => {
    const model = buildHarbourModel(payloads([coin("old", 0, 1e8)]), NOW, { dead: [] });
    expect(model.boats[0].maiden).toBe(false);
    expect(modelWatch(model, NOW).some((s) => s.reason === "launch")).toBe(false);
    const gaps = buildHarbourModel(payloads(Array.from({ length: 20 }, (_, i) => coin(`${i}`, 0, 0))), NOW, { dead: [] });
    expect(modelWatch(gaps, NOW).some((s) => s.reason === "launch")).toBe(false);
  });

  it("never joins newer mutable feed rows to the accepted boat comparison", () => {
    const feed = payloads();
    const model = buildHarbourModel(feed, NOW, { dead: [] });
    const original = modelWatch(model, NOW);
    feed.stablecoins!.data!.peggedAssets[0].circulatingPrevDay = { peggedUSD: 1 };
    expect(modelWatch(model, NOW)).toEqual(original);
    expect(modelWatch(buildHarbourModel(feed, NOW, { dead: [] }), NOW)[0].line).not.toBe(original[0].line);
  });

  it("invalidates reasons when sources age during a stop, and gates depegs on both sources", () => {
    const model = buildHarbourModel(payloads(), NOW, { dead: [] });
    const expires = Math.max(PHAROSVILLE_ENDPOINT_REGISTRY.stablecoins.metaMaxAgeSec, PHAROSVILLE_ENDPOINT_REGISTRY.pegSummary.metaMaxAgeSec) * FRESHNESS_RATIOS.DEGRADED * 1000 + 1;
    expect(modelWatch(model, NOW).length).toBeGreaterThan(0);
    expect(modelWatch(model, NOW + expires)).toEqual([]);
    model.truth.stablecoins.state = "stale";
    expect(modelWatch(model, NOW)).toEqual([]);
    model.truth.stablecoins.state = "current";
    model.truth.pegSummary.state = "stale";
    expect(watchSources(model, NOW)).toEqual({ fleet: true, peg: false });
    expect(modelWatch(model, NOW).some((s) => s.reason === "depeg")).toBe(false);
  });

  it("distinguishes waiting from a current empty ranking in shared copy", () => {
    expect(truthCopy({ kind: "watch", waiting: true })).toBe("The watch is waiting for current readings.");
    expect(truthCopy({ kind: "watch", waiting: false })).toBe("No qualifying watch subjects in current readings.");
  });
});
