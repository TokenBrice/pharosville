import { describe, expect, it } from "vitest";
import { truthCopy, type ReadingName } from "./truth-copy";

const stamp = Date.UTC(2026, 10, 8, 12, 34, 56);
describe("shared truth sentences", () => {
  it.each<ReadingName>(["Supply", "Chain comparisons", "PSI", "Peg readings", "Stress readings", "Safety grades", "Flow readings", "Depeg events", "Reserves", "DEX liquidity"])("formats dated current and stale %s", (reading) => {
    expect(truthCopy({ kind: "reading", reading, truth: { state: "current", sourceUpdatedAtMs: stamp } })).toBe(`${reading}: current. Updated 2026-11-08 12:34:56 UTC.`);
    expect(truthCopy({ kind: "reading", reading, truth: { state: "stale", sourceUpdatedAtMs: stamp } })).toBe(`${reading}: stale. Last observed 2026-11-08 12:34:56 UTC.`);
  });
  it("keeps undated, unknown and absent evidence distinct", () => {
    expect(truthCopy({ kind: "reading", reading: "PSI", truth: { state: "stale" } })).toBe("PSI: stale. Source freshness is unverified.");
    expect(truthCopy({ kind: "reading", reading: "PSI", truth: { state: "unavailable" } })).toBe("PSI: unavailable.");
    for (const state of ["unknown", "current"] as const) {
      expect(truthCopy({ kind: "reading", reading: "PSI", truth: { state, sourceUpdatedAtMs: NaN } })).toBe("PSI: unavailable. Source freshness is unverified.");
    }
    expect(truthCopy({ kind: "retained-heading" })).toBe("Last received values");
  });
  it("appends freshness to partial coverage without changing its denominator", () => {
    for (const state of ["current", "stale"] as const) {
      const truth = { state, sourceUpdatedAtMs: stamp };
      expect(truthCopy({ kind: "reading", reading: "Peg readings", truth, coveragePct: 62.5 })).toBe(`Peg readings: partial. Observed across 62.5% of tracked supply. ${truthCopy({ kind: "reading", reading: "Peg readings", truth })}`);
    }
  });
  it("names missing rows, grades and observed empty lists", () => {
    for (const reading of ["peg", "stress"] as const) expect(truthCopy({ kind: "absent-row", reading })).toBe(`No ${reading} reading is available for this coin.`);
    for (const grade of ["NR", null, undefined, ""]) expect(truthCopy({ kind: "grade", grade, truth: { state: "current" } })).toBe("Not rated.");
    expect(truthCopy({ kind: "grade", grade: "A", truth: { state: "current" } })).toBe("A");
    expect(truthCopy({ kind: "grade", grade: "NR", truth: { state: "unavailable" } })).toBe("Safety grades: unavailable.");
    expect(truthCopy({ kind: "observed-empty", reading: "shoals" })).toBe("No off-peg coins were observed among covered coins.");
    expect(truthCopy({ kind: "observed-empty", reading: "alerts" })).toBe("No Alert-or-worse signals were observed among covered coins.");
  });
  it.each([[true, false, "stress signals"], [false, true, "depeg events"], [true, true, "stress signals and depeg events"]] as const)("qualifies PSI inputs %s/%s", (dewsUnavailable, depegEventsUnavailable, missing) => {
    expect(truthCopy({ kind: "psi-qualification", dewsUnavailable, depegEventsUnavailable })).toBe(`Computed without ${missing}. A horn shutter narrows the beam until those inputs return.`);
  });
  it("does not qualify a complete PSI", () => expect(truthCopy({ kind: "psi-qualification", dewsUnavailable: false, depegEventsUnavailable: false })).toBe(""));
});
