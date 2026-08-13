import { describe, expect, it } from "vitest";
import {
  advanceLampStatus,
  deriveLampStatus,
  initialLampStatusState,
  lampStatusModulationForMix,
  lampStatusReading,
  LAMP_FRESHNESS_KEYS,
  LAMP_STATUS_TRANSITION_SECONDS,
} from "./lamp-status";
import type { PharosVilleFreshness } from "./world-types";

describe("lighthouse lamp status", () => {
  it("folds all known endpoint freshness flags into three states", () => {
    expect(LAMP_FRESHNESS_KEYS).toHaveLength(7);
    expect(deriveLampStatus({})).toBe("fresh");
    expect(deriveLampStatus({ pegSummaryStale: true })).toBe("stale");
    expect(deriveLampStatus(Object.fromEntries(
      LAMP_FRESHNESS_KEYS.map((key) => [key, true]),
    ) as PharosVilleFreshness)).toBe("unreachable");
  });

  it("requires two successive observations and cancels a one-poll failure", () => {
    const fresh = initialLampStatusState({});
    const oneFailedPoll = advanceLampStatus(fresh, { pegSummaryStale: true });
    expect(oneFailedPoll.status).toBe("fresh");
    expect(oneFailedPoll.pendingStatus).toBe("stale");

    const recovered = advanceLampStatus(oneFailedPoll, {});
    expect(recovered).toEqual(fresh);

    const firstUnreachable = advanceLampStatus(
      advanceLampStatus(fresh, { stablecoinsStale: true }),
      Object.fromEntries(LAMP_FRESHNESS_KEYS.map((key) => [key, true])) as PharosVilleFreshness,
    );
    expect(firstUnreachable.status).toBe("fresh");
    expect(firstUnreachable.pendingStatus).toBe("unreachable");

    const allUnreachable = advanceLampStatus(
      firstUnreachable,
      Object.fromEntries(LAMP_FRESHNESS_KEYS.map((key) => [key, true])) as PharosVilleFreshness,
    );
    expect(allUnreachable.status).toBe("unreachable");
  });

  it("keeps the unreachable dimming below the PSI character scale", () => {
    const fresh = lampStatusModulationForMix(0);
    const stale = lampStatusModulationForMix(1);
    const unreachable = lampStatusModulationForMix(2);
    expect(fresh).toEqual({ coolMix: 0, intensityScale: 1, rotationScale: 1 });
    expect(stale.coolMix).toBeGreaterThan(0);
    expect(stale.intensityScale).toBeLessThan(1);
    expect(stale.rotationScale).toBeLessThan(1);
    expect(unreachable.intensityScale).toBeLessThan(stale.intensityScale);
    expect(unreachable.rotationScale).toBeLessThan(stale.rotationScale);
    expect(LAMP_STATUS_TRANSITION_SECONDS).toBeGreaterThanOrEqual(30);
  });

  it("owns the plain-language readings used by parity surfaces", () => {
    expect(lampStatusReading("fresh")).toBe("steady — all feeds fresh");
    expect(lampStatusReading("stale")).toBe("cooler and slower — some feeds stale");
    expect(lampStatusReading("unreachable")).toBe("dimmed — API unreachable; showing last-good data");
  });
});
