import type { StabilityIndexResponse } from "@shared/types";
import { describe, expect, it } from "vitest";
import { buildGardenMonthRecord, gardenMonthRecordLabel } from "./garden-month-record";

const DAY_MS = 86_400_000;
const NOW = Date.UTC(2026, 7, 13);

function history(scores: readonly { daysAgo: number; score: number }[]): StabilityIndexResponse {
  return {
    current: null,
    history: scores.map(({ daysAgo, score }) => ({
      band: score >= 70 ? "STEADY" : "FRACTURE",
      date: NOW - daysAgo * DAY_MS,
      methodologyVersion: "test",
      score,
    })),
    methodology: { asOf: 0 } as StabilityIndexResponse["methodology"],
  };
}

describe("garden monthly record", () => {
  it("uses only the trailing 30 days and turns a calm month into growth", () => {
    const record = buildGardenMonthRecord(history([
      { daysAgo: 0, score: 90 }, { daysAgo: 15, score: 80 }, { daysAgo: 40, score: 5 },
    ]));
    expect(record.averagePsi).toBe(85);
    expect(record.growth).toBe(1);
    expect(record.sampleCount).toBe(2);
    expect(gardenMonthRecordLabel(record)).toContain("Flourishing");
  });

  it("turns a stressed month into shedding and distinguishes missing history", () => {
    const stressed = buildGardenMonthRecord(history([
      { daysAgo: 0, score: 20 }, { daysAgo: 20, score: 30 },
    ]));
    expect(stressed.growth).toBe(0);
    expect(gardenMonthRecordLabel(stressed)).toContain("sheds and browns");
    expect(buildGardenMonthRecord(null)).toMatchObject({ growth: 0.5, unavailable: true });
  });
});
