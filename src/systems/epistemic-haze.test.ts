import { describe, expect, it } from "vitest";
import {
  advanceEpistemicHaze,
  type EpistemicFogSource,
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
  });
});

describe("arriving source fog", () => {
  const source: EpistemicFogSource = {
    id: "risk", feed: "Peg summary", stale: true,
    centre: { x: 20, z: 30 }, radius: 12, lastGood: "2026-09-08T10:00:00Z",
  };
  it("ramps on a freshness edge then thins continuously on recovery", () => {
    const edge = advanceEpistemicHaze([source], [], 0);
    expect(edge[0]!.strength).toBe(0);
    const halfway = advanceEpistemicHaze([source], edge, 22.5);
    expect(halfway[0]!.strength).toBe(0.5);
    const arrived = advanceEpistemicHaze([source], halfway, 45);
    expect(arrived[0]!.strength).toBe(1);
    const clearSource = { ...source, stale: false };
    const recovery = advanceEpistemicHaze([clearSource], arrived, 50);
    expect(recovery[0]!.strength).toBe(1);
    expect(advanceEpistemicHaze([clearSource], recovery, 72.5)[0]!.strength).toBe(0.5);
    expect(advanceEpistemicHaze([clearSource], recovery, 95)[0]!.strength).toBe(0);
  });
  it("keeps a bounded static bank under reduced motion and exposes its last-good fact", () => {
    const bank = advanceEpistemicHaze([{ ...source, radius: 1000 }], [], 10, true)[0]!;
    expect(bank.radius).toBe(24);
    expect(bank.strength).toBe(1);
    expect(bank.arrival).toBe(1);
    expect(bank.caption).toContain(source.lastGood);
    expect(advanceEpistemicHaze([{ ...source, stale: false }], [bank], 20, true)[0]!.strength).toBe(0);
  });
});
