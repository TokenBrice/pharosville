import { describe, expect, it } from "vitest";
import {
  SEA_STATE_SMOOTHING_TAU_SECONDS,
  seaStateForSources,
  seaStateSummary,
  smoothSeaState,
} from "./sea-state";
import type { AreaNode, LighthouseNode } from "./world-types";

const lighthouse = {
  psiBand: "STEADY",
  score: 12,
  unavailable: false,
} satisfies Pick<LighthouseNode, "psiBand" | "score" | "unavailable">;

function area(band: AreaNode["band"], count = 1): Pick<AreaNode, "band" | "count"> {
  return { ...(band !== undefined ? { band } : {}), count };
}

describe("sea-state master signal", () => {
  it("derives stronger swell, wind, and tempo from the max active DEWS band", () => {
    const calm = seaStateForSources({
      areas: [area("CALM")],
      lighthouse,
      wallClockHour: 12,
    });
    const danger = seaStateForSources({
      areas: [area("WATCH"), area("DANGER")],
      lighthouse,
      wallClockHour: 12,
    });

    expect(danger.source.maxDewsBand).toBe("DANGER");
    expect(danger.swell).toBeGreaterThan(calm.swell);
    expect(danger.wind).toBeGreaterThan(calm.wind);
    expect(danger.tempo).toBeGreaterThan(calm.tempo);
  });

  it("ignores inactive zero-count DEWS bands", () => {
    const state = seaStateForSources({
      areas: [area("DANGER", 0), area("ALERT", 2)],
      lighthouse,
      wallClockHour: 12,
    });

    expect(state.source.maxDewsBand).toBe("ALERT");
  });

  it("includes lighthouse PSI and night factor in the deterministic target", () => {
    const noon = seaStateForSources({
      areas: [area("WATCH")],
      lighthouse: { psiBand: "STEADY", score: 12, unavailable: false },
      wallClockHour: 12,
    });
    const midnightElevatedPsi = seaStateForSources({
      areas: [area("WATCH")],
      lighthouse: { psiBand: "DANGER", score: 88, unavailable: false },
      wallClockHour: 23,
    });

    expect(midnightElevatedPsi.source.nightFactor).toBe(1);
    expect(midnightElevatedPsi.source.psiStress).toBeGreaterThan(noon.source.psiStress);
    expect(midnightElevatedPsi.swell).toBeGreaterThan(noon.swell);
  });

  it("marks reduced motion without randomizing the identifying data values", () => {
    const reduced = seaStateForSources({
      areas: [area("WARNING")],
      lighthouse,
      reducedMotion: true,
      wallClockHour: 12,
    });
    const animated = seaStateForSources({
      areas: [area("WARNING")],
      lighthouse,
      wallClockHour: 12,
    });

    expect(reduced.reducedMotion).toBe(true);
    expect(reduced.swell).toBe(animated.swell);
    expect(reduced.wind).toBe(animated.wind);
    expect(seaStateSummary(reduced)).toContain("reduced-motion holds animation phases flat");
  });

  it("provides a pure 8-second smoothing hook for future stateful consumers", () => {
    const current = seaStateForSources({
      areas: [area("CALM")],
      lighthouse,
      wallClockHour: 12,
    });
    const target = seaStateForSources({
      areas: [area("DANGER")],
      lighthouse,
      wallClockHour: 12,
    });

    const smoothed = smoothSeaState({
      current,
      target,
      deltaSeconds: SEA_STATE_SMOOTHING_TAU_SECONDS,
    });

    expect(smoothed.swell).toBeGreaterThan(current.swell);
    expect(smoothed.swell).toBeLessThan(target.swell);
    expect(smoothed.wind).toBeGreaterThan(current.wind);
    expect(smoothed.wind).toBeLessThan(target.wind);
    expect(smoothSeaState({ current, target, deltaSeconds: 0 })).toBe(current);
  });
});
