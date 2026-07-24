import { describe, expect, it } from "vitest";
import {
  createRenderSchedulerHysteresisState,
  RENDER_SCHEDULER_DOWNSHIFT_STREAK,
  RENDER_SCHEDULER_UPSHIFT_STREAK,
  resolveRenderSchedulerState,
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
    expect(scheduler.targetFrameMs).toBe(16.7);
  });

  it("uses the balanced tier as the normal animated default", () => {
    const scheduler = resolveRenderSchedulerState({
      cameraIntentActive: false,
      drawDurationMs: 10,
      framePacingP90Ms: 16,
      reducedMotion: false,
    });

    expect(scheduler.tier).toBe("balanced");
  });

  it("uses interaction tier during active camera intent", () => {
    const scheduler = resolveRenderSchedulerState({
      cameraIntentActive: true,
      reducedMotion: false,
    });

    expect(scheduler.tier).toBe("interaction");
  });

  it("uses the constrained tier under severe frame pressure", () => {
    const scheduler = resolveRenderSchedulerState({
      cameraIntentActive: false,
      drawDurationMs: 100,
      framePacingP90Ms: 60,
      reducedMotion: false,
    });

    expect(scheduler.tier).toBe("constrained");
  });

  it("uses recovery tier for moderate pressure", () => {
    const scheduler = resolveRenderSchedulerState({
      cameraIntentActive: false,
      drawDurationMs: 55,
      framePacingP90Ms: 30,
      reducedMotion: false,
    });

    expect(scheduler.tier).toBe("recovery");
  });
});

describe("render scheduler hysteresis", () => {
  const calm = { cameraIntentActive: false, drawDurationMs: 10, framePacingP90Ms: 16, reducedMotion: false };
  const pressured = { cameraIntentActive: false, drawDurationMs: 55, framePacingP90Ms: 30, reducedMotion: false };

  it("requires a sustained streak before downshifting", () => {
    const state = createRenderSchedulerHysteresisState();

    for (let frame = 1; frame < RENDER_SCHEDULER_DOWNSHIFT_STREAK; frame += 1) {
      expect(resolveRenderSchedulerState(pressured, state).tier).toBe("balanced");
    }
    expect(resolveRenderSchedulerState(pressured, state).tier).toBe("recovery");
  });

  it("suppresses single-frame tier flicker in both directions", () => {
    const state = createRenderSchedulerHysteresisState();

    // Alternating pressure never accumulates a downshift streak.
    for (let frame = 0; frame < 10; frame += 1) {
      expect(resolveRenderSchedulerState(pressured, state).tier).toBe("balanced");
      expect(resolveRenderSchedulerState(calm, state).tier).toBe("balanced");
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
    expect(resolveRenderSchedulerState(calm, state).tier).toBe("balanced");
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
    expect(state.loadTier).toBe("balanced");

    // The pending downshift streak survives the interruption.
    expect(resolveRenderSchedulerState(pressured, state).tier).toBe("recovery");
  });
});
