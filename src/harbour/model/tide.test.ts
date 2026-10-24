import { describe, expect, it } from "vitest";
import { landmarkFact, PANEL_LANDMARKS, tideFact } from "../ui/facts";
import { buildHarbourModel } from "./build";
import type { HarbourPayloads } from "./types";

const NOW = 1_790_000_000_000;
const meta = (ageSeconds: number, status: "fresh" | "stale" = "fresh") => ({ updatedAt: NOW / 1000 - ageSeconds, ageSeconds, status });
const chains = (data: object, status: "fresh" | "stale" = "fresh"): HarbourPayloads =>
  ({ chains: { data: { chains: [], ...data }, meta: meta(60, status), fetchedAtMs: NOW } }) as HarbourPayloads;

describe("tide gauge DOM twin (/api/chains global change, FRACTIONS)", () => {
  it("carries 24 h / 7 d / 30 d as the fractions the feed sends", () => {
    const t = buildHarbourModel(chains({ globalChange24hPct: -0.0006, globalChange7dPct: -0.0038, globalChange30dPct: 0.0039 }), NOW, { dead: [] }).readings.tide;
    expect(t).toEqual({ change24h: -0.0006, change7d: -0.0038, change30d: 0.0039, available: true, stale: false });
  });
  it("is unknown (never slack) without a payload, and labels a stale one", () => {
    const none = buildHarbourModel({}, NOW, { dead: [] });
    expect(none.readings.tide.available).toBe(false);
    expect(tideFact(none)).toBe("no supply reading");
    const stale = buildHarbourModel(chains({ globalChange7dPct: 0.012 }, "stale"), NOW, { dead: [] });
    expect(stale.readings.tide.stale).toBe(true);
    expect(tideFact(stale)).toBe("all supply +1.20% over 7 d · stale");
  });
  it("hover fact quotes the percentage the gauge stands at; non-finite reads as missing", () => {
    const m = buildHarbourModel(chains({ globalChange7dPct: -0.0038 }), NOW, { dead: [] });
    expect(landmarkFact("tide-gauge", m, null).fact).toBe("all supply −0.38% over 7 d");
    const bad = buildHarbourModel(chains({ globalChange7dPct: Number.NaN }), NOW, { dead: [] });
    expect(bad.readings.tide.change7d).toBeNull();
    expect(tideFact(bad)).toBe("no supply reading");
  });
  it("opens a panel on click", () => expect(PANEL_LANDMARKS.has("tide-gauge")).toBe(true));
});
