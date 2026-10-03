import { describe, expect, it } from "vitest";
import { PHAROSVILLE_API_ENDPOINT_KEYS } from "@shared/types/pharosville-endpoint-keys";
import { makeSourceStatuses } from "@/__fixtures__/pharosville-world";
import {
  advanceLampStatus, deriveLampStatus, hasCompleteCurrentSources, initialLampStatusState,
  lampStatusModulationForMix, LAMP_STATUS_TRANSITION_SECONDS,
} from "./lamp-status";
import type { PharosVilleSourceState } from "./world-types";

describe("lighthouse lamp status", () => {
  it("complete current is required for fresh certification", () => {
    const current = makeSourceStatuses();
    expect(hasCompleteCurrentSources(current)).toBe(true);
    expect(deriveLampStatus(current)).toBe("fresh");
    for (const key of PHAROSVILLE_API_ENDPOINT_KEYS) {
      for (const state of ["loading", "unavailable", "stale"] satisfies PharosVilleSourceState[]) {
        const qualified = makeSourceStatuses({ [key]: { state } });
        expect(hasCompleteCurrentSources(qualified)).toBe(false);
        expect(deriveLampStatus(qualified)).toBe("stale");
      }
      for (const state of ["partial", "unknown"] as const) {
        const qualified = makeSourceStatuses({ [key]: { coverage: { state } } });
        expect(hasCompleteCurrentSources(qualified)).toBe(false);
        expect(deriveLampStatus(qualified)).toBe("stale");
      }
    }
    const held = makeSourceStatuses(Object.fromEntries(PHAROSVILLE_API_ENDPOINT_KEYS.map((key) => [key, { state: "stale", reason: "Source age stale" }])));
    expect(deriveLampStatus(held)).toBe("stale");
    const failed = makeSourceStatuses(Object.fromEntries(PHAROSVILLE_API_ENDPOINT_KEYS.map((key) => [key, { state: "stale", reason: "Refresh failed: offline" }])));
    expect(deriveLampStatus(failed)).toBe("unreachable");
  });

  it("requires two successive observations and cancels a one-poll failure", () => {
    const current = makeSourceStatuses();
    const fresh = initialLampStatusState(current);
    const oneFailedPoll = advanceLampStatus(fresh, makeSourceStatuses({ pegSummary: { state: "stale", reason: "Refresh failed: offline" } }));
    expect(oneFailedPoll.status).toBe("fresh");
    expect(oneFailedPoll.pendingStatus).toBe("stale");
    expect(advanceLampStatus(oneFailedPoll, current)).toEqual(fresh);
    const failed = makeSourceStatuses(Object.fromEntries(PHAROSVILLE_API_ENDPOINT_KEYS.map((key) => [key, { state: "unavailable", reason: "Fetch failed: offline" }])));
    const pending = advanceLampStatus(fresh, failed);
    expect(pending.status).toBe("fresh");
    expect(pending.pendingStatus).toBe("unreachable");
    expect(advanceLampStatus(pending, failed).status).toBe("unreachable");
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
});
