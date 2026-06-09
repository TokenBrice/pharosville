import { describe, expect, it } from "vitest";
import {
  createRenderSchedulerHysteresisState,
  isScheduledPassDegraded,
  RENDER_SCHEDULER_DOWNSHIFT_STREAK,
  RENDER_SCHEDULER_UPSHIFT_STREAK,
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
    expect(shouldDrawScheduledPass(scheduler, "scene-vignette")).toBe(true);
    // Constrained (but not recovery) also sheds the per-frame water passes.
    expect(shouldDrawScheduledPass(scheduler, "coastal-water-motion")).toBe(false);
    expect(shouldDrawScheduledPass(scheduler, "water-accents")).toBe(false);
    expect(shouldDrawScheduledPass(scheduler, "lighthouse-reflection")).toBe(true);
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
    expect(shouldDrawScheduledPass(scheduler, "moon-reflection")).toBe(false);
    expect(shouldDrawScheduledPass(scheduler, "scene-vignette")).toBe(true);
    expect(shouldDrawScheduledPass(scheduler, "coastal-water-motion")).toBe(true);
    expect(shouldDrawScheduledPass(scheduler, "water-accents")).toBe(true);
    expect(isScheduledPassDegraded(scheduler, "cloud-shadow")).toBe(false);
  });
});

describe("render scheduler hysteresis", () => {
  const calm = { cameraIntentActive: false, drawDurationMs: 10, framePacingP90Ms: 16, reducedMotion: false };
  const pressured = { cameraIntentActive: false, drawDurationMs: 55, framePacingP90Ms: 30, reducedMotion: false };

  it("requires a sustained streak before downshifting", () => {
    const state = createRenderSchedulerHysteresisState();

    for (let frame = 1; frame < RENDER_SCHEDULER_DOWNSHIFT_STREAK; frame += 1) {
      expect(resolveRenderSchedulerState(pressured, state).tier).toBe("full");
    }
    expect(resolveRenderSchedulerState(pressured, state).tier).toBe("recovery");
  });

  it("suppresses single-frame tier flicker in both directions", () => {
    const state = createRenderSchedulerHysteresisState();

    // Alternating pressure never accumulates a downshift streak.
    for (let frame = 0; frame < 10; frame += 1) {
      expect(resolveRenderSchedulerState(pressured, state).tier).toBe("full");
      expect(resolveRenderSchedulerState(calm, state).tier).toBe("full");
    }

    // Sustained pressure downshifts; alternating calm then never upshifts.
    for (let frame = 0; frame < RENDER_SCHEDULER_DOWNSHIFT_STREAK; frame += 1) {
      resolveRenderSchedulerState(pressured, state);
    }
    expect(state.loadTier).toBe("recovery");
    for (let frame = 0; frame < 10; frame += 1) {
      expect(resolveRenderSchedulerState(calm, state).tier).toBe("recovery");
      expect(resolveRenderSchedulerState(pressured, state).tier).toBe("recovery");
    }
  });

  it("upshifts only after a long calm streak", () => {
    const state = createRenderSchedulerHysteresisState();
    for (let frame = 0; frame < RENDER_SCHEDULER_DOWNSHIFT_STREAK; frame += 1) {
      resolveRenderSchedulerState(pressured, state);
    }
    expect(state.loadTier).toBe("recovery");

    for (let frame = 1; frame < RENDER_SCHEDULER_UPSHIFT_STREAK; frame += 1) {
      expect(resolveRenderSchedulerState(calm, state).tier).toBe("recovery");
    }
    expect(resolveRenderSchedulerState(calm, state).tier).toBe("full");
  });

  it("freezes streaks during interaction and reduced-motion frames", () => {
    const state = createRenderSchedulerHysteresisState();
    for (let frame = 1; frame < RENDER_SCHEDULER_DOWNSHIFT_STREAK; frame += 1) {
      resolveRenderSchedulerState(pressured, state);
    }

    const interaction = resolveRenderSchedulerState({ ...pressured, cameraIntentActive: true }, state);
    expect(interaction.tier).toBe("interaction");
    const reduced = resolveRenderSchedulerState({ ...pressured, reducedMotion: true }, state);
    expect(reduced.tier).toBe("full");
    expect(state.loadTier).toBe("full");

    // The pending downshift streak survives the interruption.
    expect(resolveRenderSchedulerState(pressured, state).tier).toBe("recovery");
  });
});
