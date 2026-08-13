import { describe, expect, it } from "vitest";
import {
  deriveEpistemicHaze,
  epistemicHazeLabel,
  quayHazeLabel,
  riskWaterHazeLabel,
} from "./epistemic-haze";

describe("epistemic haze", () => {
  it("keeps both instruments clear without explicit stale evidence", () => {
    const haze = deriveEpistemicHaze(undefined);
    expect(haze).toEqual({ quays: false, riskWaters: false });
    expect(epistemicHazeLabel(haze)).toContain("current");
  });

  it("maps only Peg summary staleness to risk waters", () => {
    const haze = deriveEpistemicHaze({ pegSummaryStale: true });
    expect(haze).toEqual({ quays: false, riskWaters: true });
    expect(riskWaterHazeLabel(haze)).toContain("Peg summary feed is stale");
    expect(quayHazeLabel(haze)).toContain("Chains feed is current");
  });

  it("maps only Chains staleness to quays", () => {
    const haze = deriveEpistemicHaze({ chainsStale: true });
    expect(haze).toEqual({ quays: true, riskWaters: false });
    expect(epistemicHazeLabel(haze)).toBe("Haze over the quays — Chains feed is stale");
  });
});
