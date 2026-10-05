import type { StabilityIndexResponse } from "@shared/types";
import { describe, expect, it } from "vitest";
import { makeSourceStatuses } from "../__fixtures__/pharosville-world";
import { buildGardenMonthRecord, gardenMonthRecordContentSignature, gardenMonthRecordLabel } from "./garden-month-record";

const DAY_MS = 86_400_000;
const NOW = Date.UTC(2026, 7, 13);
function history(points: Array<{ daysAgo: number; score: number; version?: string; date?: number }>): StabilityIndexResponse {
  return { current: null, history: points.map(({ daysAgo, score, version = "v1", date }) => ({
    band: score >= 70 ? "STEADY" : "FRACTURE", date: date ?? NOW - daysAgo * DAY_MS, methodologyVersion: version, score,
  })), methodology: { asOf: 0 } as StabilityIndexResponse["methodology"] };
}

describe("exact garden daily record", () => {
  it("ends at the newest supplied day and keeps precisely 30 chronological UTC slots", () => {
    const record = buildGardenMonthRecord(history(Array.from({ length: 65 }, (_, day) => ({ daysAgo: day, score: day }))));
    expect(record.sampleCount).toBe(30);
    expect(record.days).toHaveLength(30);
    expect(record.windowStartDay).toBe("2026-07-15");
    expect(record.windowEndDay).toBe("2026-08-13");
    expect(record.days.map((point) => point.score)).toEqual(Array.from({ length: 30 }, (_, day) => 29 - day));
    expect(record.scoreBounds).toEqual([0, 100]);
    expect(record.spanDays).toBe(29);
    expect(gardenMonthRecordLabel(record)).toContain("no rolling average");
    expect(record).not.toHaveProperty("growth");
    expect(record).not.toHaveProperty("averagePsi");
  });

  it("normalizes seconds and milliseconds, with array-last-write winning over intraday ordering", () => {
    const record = buildGardenMonthRecord(history([
      { daysAgo: 0, score: 85, date: (NOW + 20 * 3_600_000) / 1000 },
      { daysAgo: 1, score: 77, date: (NOW - DAY_MS) / 1000 },
      { daysAgo: 0, score: 42, date: NOW + 3_600_000, version: "v2" },
    ]));
    expect(record.sampleCount).toBe(2);
    expect(record.days.at(-1)).toEqual({ day: "2026-08-13", at: NOW + 3_600_000, score: 42, band: "FRACTURE", methodologyVersion: "v2", gap: false });
    expect(record.days.at(-2)?.at).toBe(NOW - DAY_MS);
    expect(record.segments.map((segment) => segment.map((point) => point.score))).toEqual([[77], [42]]);
  });

  it("does not invent closes or join missing days, version edges or unknown methodologies", () => {
    const record = buildGardenMonthRecord(history([
      { daysAgo: 4, score: 80 }, { daysAgo: 3, score: 90, version: "v2" },
      { daysAgo: 1, score: 20, version: "v2" }, { daysAgo: 0, score: 30, version: "" },
    ]));
    expect(record.sampleCount).toBe(4);
    expect(record.days.at(-3)).toEqual({ day: "2026-08-11", at: null, score: null, band: null, methodologyVersion: null, gap: true });
    expect(record.segments.map((segment) => segment.map((point) => point.score))).toEqual([[80], [90], [20], [30]]);
    expect(record.firstDay).toBe("2026-08-09");
    expect(record.lastDay).toBe("2026-08-13");
  });

  it("represents a non-finite last daily write as a gap instead of recovering an obsolete score", () => {
    const record = buildGardenMonthRecord(history([
      { daysAgo: 0, score: 80 }, { daysAgo: 0, score: NaN }, { daysAgo: 1, score: 55, date: NaN },
    ]));
    expect(record.unavailable).toBe(true);
    expect(record.sampleCount).toBe(0);
    expect(record.days.at(-1)).toMatchObject({ at: NOW, gap: true, score: null });
    expect(gardenMonthRecordLabel(record)).toBe("Neutral gravel bed — no supplied daily PSI closes");
    expect(buildGardenMonthRecord(null)).toMatchObject({ days: [], segments: [], unavailable: true });
  });

  it("preserves held observation/publication evidence without re-certifying dated values", () => {
    const supplied = history([{ daysAgo: 0, score: 82 }]);
    const held = makeSourceStatuses({ stability: { state: "stale", observedAt: NOW - DAY_MS, publishedAt: NOW - DAY_MS, reason: "held" } }).stability;
    const record = buildGardenMonthRecord(supplied, held);
    expect(record.evidence).toBe(held);
    expect(record.segments[0]?.[0]?.at).toBe(NOW);
    expect(gardenMonthRecordContentSignature(record)).toBe(gardenMonthRecordContentSignature(buildGardenMonthRecord(supplied, makeSourceStatuses().stability)));
    expect(gardenMonthRecordContentSignature(buildGardenMonthRecord(history([{ daysAgo: 0, score: 83 }]), held))).not.toBe(gardenMonthRecordContentSignature(record));
  });
});
