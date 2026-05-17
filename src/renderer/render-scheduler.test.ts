import { describe, expect, it } from "vitest";
import {
  isScheduledPassDegraded,
  resolveRenderSchedulerState,
  shouldDrawScheduledPass,
} from "./render-scheduler";

describe("render scheduler", () => {
  it("keeps reduced motion deterministic at the full tier", () => {
    const scheduler = resolveRenderSchedulerState({
      cameraIntentActive: true,
      drawDurationMs: 200,
      framePacingP90Ms: 200,
      reducedMotion: true,
    });

    expect(scheduler.tier).toBe("full");
    expect(scheduler.skippedPasses).toHaveLength(0);
  });

  it("uses interaction tier during active camera intent", () => {
    const scheduler = resolveRenderSchedulerState({
      cameraIntentActive: true,
      reducedMotion: false,
    });

    expect(scheduler.tier).toBe("interaction");
    expect(shouldDrawScheduledPass(scheduler, "film-grain")).toBe(false);
    expect(isScheduledPassDegraded(scheduler, "birds")).toBe(true);
    expect(shouldDrawScheduledPass(scheduler, "weather")).toBe(true);
  });

  it("skips decorative effects under constrained frame pacing", () => {
    const scheduler = resolveRenderSchedulerState({
      cameraIntentActive: false,
      drawDurationMs: 100,
      framePacingP90Ms: 60,
      reducedMotion: false,
    });

    expect(scheduler.tier).toBe("constrained");
    expect(shouldDrawScheduledPass(scheduler, "moon-reflection")).toBe(false);
    expect(shouldDrawScheduledPass(scheduler, "selection")).toBe(true);
  });

  it("uses recovery tier for moderate pressure", () => {
    const scheduler = resolveRenderSchedulerState({
      cameraIntentActive: false,
      drawDurationMs: 55,
      framePacingP90Ms: 30,
      reducedMotion: false,
    });

    expect(scheduler.tier).toBe("recovery");
    expect(shouldDrawScheduledPass(scheduler, "film-grain")).toBe(false);
    expect(isScheduledPassDegraded(scheduler, "cloud-shadow")).toBe(true);
  });
});
