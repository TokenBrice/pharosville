import { describe, expect, it } from "vitest";
import {
  createRenderSchedulerHysteresisState,
  RENDER_SCHEDULER_DOWNSHIFT_STREAK,
  RENDER_SCHEDULER_IDLE_AFTER_MS,
  RENDER_SCHEDULER_IDLE_TARGET_FRAME_MS,
  RENDER_SCHEDULER_UPSHIFT_STREAK,
  resolveRenderSchedulerIdleState,
  resolveRenderSchedulerState,
  seaQualityTier,
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

  it("uses the full tier for healthy-hardware calm frames (G3)", () => {
    const scheduler = resolveRenderSchedulerState({
      cameraIntentActive: false,
      drawDurationMs: 10,
      framePacingP90Ms: 16,
      reducedMotion: false,
    });

    expect(scheduler.tier).toBe("full");
  });

  it("uses the balanced tier between the full budget and recovery pressure", () => {
    const scheduler = resolveRenderSchedulerState({
      cameraIntentActive: false,
      drawDurationMs: 34,
      framePacingP90Ms: 24,
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

  it("reports the load reading that interaction masks", () => {
    // S1: `interaction` says the camera is moving, not that the GPU is in
    // trouble, so it must not be the signal quality decisions read. The ladder
    // is bypassed on those frames, so its frozen tier is exactly what this
    // frame would be at if the camera were still.
    const hysteresis = createRenderSchedulerHysteresisState();
    const pressured = { cameraIntentActive: false, framePacingP90Ms: 34, reducedMotion: false };
    for (let frame = 0; frame < RENDER_SCHEDULER_DOWNSHIFT_STREAK; frame += 1) {
      resolveRenderSchedulerState(pressured, hysteresis);
    }
    expect(hysteresis.loadTier).toBe("recovery");

    const dragging = resolveRenderSchedulerState(
      { ...pressured, cameraIntentActive: true },
      hysteresis,
    );
    expect(dragging.tier).toBe("interaction");
    expect(dragging.loadTier).toBe("recovery");
    expect(seaQualityTier(dragging)).toBe("recovery");

    // A healthy machine keeps its quality through the same drag.
    const healthy = createRenderSchedulerHysteresisState();
    healthy.loadTier = "full";
    const healthyDrag = resolveRenderSchedulerState(
      { cameraIntentActive: true, framePacingP90Ms: 16, reducedMotion: false },
      healthy,
    );
    expect(healthyDrag.tier).toBe("interaction");
    expect(seaQualityTier(healthyDrag)).toBe("full");
  });

  it("passes load tiers through seaQualityTier untouched", () => {
    for (const tier of ["full", "balanced", "recovery", "constrained"] as const) {
      expect(seaQualityTier({ tier })).toBe(tier);
    }
    // Absent a load reading, the ladder's own initial value is the fallback.
    expect(seaQualityTier({ tier: "interaction" })).toBe("balanced");
  });

  it("idles only after a sustained quiet spell, and never under reduced motion", () => {
    const awake = resolveRenderSchedulerIdleState({ msSinceInteraction: 0, reducedMotion: false });
    expect(awake.idle).toBe(false);
    expect(awake.targetFrameMs).toBe(16.7);

    const nearlyIdle = resolveRenderSchedulerIdleState({
      msSinceInteraction: RENDER_SCHEDULER_IDLE_AFTER_MS - 1,
      reducedMotion: false,
    });
    expect(nearlyIdle.idle).toBe(false);

    const idle = resolveRenderSchedulerIdleState({
      msSinceInteraction: RENDER_SCHEDULER_IDLE_AFTER_MS,
      reducedMotion: false,
    });
    expect(idle.idle).toBe(true);
    expect(idle.targetFrameMs).toBe(RENDER_SCHEDULER_IDLE_TARGET_FRAME_MS);

    // A single static frame has no duty cycle to halve.
    const reduced = resolveRenderSchedulerIdleState({
      msSinceInteraction: RENDER_SCHEDULER_IDLE_AFTER_MS * 10,
      reducedMotion: true,
    });
    expect(reduced.idle).toBe(false);
    expect(reduced.targetFrameMs).toBe(16.7);
  });

  it("passes a two-frame interval on a 60Hz display, so idle is 30fps not 20", () => {
    // The loop skips a frame whose interval is STRICTLY BELOW the target. Two
    // 60Hz vsync intervals are 33.33 ms, so a target of 33.4 rejected them and
    // the world drew every THIRD frame — 20 fps behind a comment claiming 30.
    const vsync60 = 1000 / 60;
    expect(vsync60 * 2).toBeGreaterThan(RENDER_SCHEDULER_IDLE_TARGET_FRAME_MS);
    // ...while a single interval still cannot pass, or idle would do nothing.
    expect(vsync60).toBeLessThan(RENDER_SCHEDULER_IDLE_TARGET_FRAME_MS);
    // Margin for a panel that is not exactly 60.000 Hz, both ways.
    expect((1000 / 60.5) * 2).toBeGreaterThan(RENDER_SCHEDULER_IDLE_TARGET_FRAME_MS);
    expect(1000 / 59.5).toBeLessThan(RENDER_SCHEDULER_IDLE_TARGET_FRAME_MS);
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
    // Calm frames resolve to the full raw tier (G3), so the sustained-calm
    // upshift lands on full, not merely balanced.
    expect(resolveRenderSchedulerState(calm, state).tier).toBe("full");
  });

  it("promotes a healthy session from balanced to full after a calm streak", () => {
    const state = createRenderSchedulerHysteresisState();
    for (let frame = 1; frame < RENDER_SCHEDULER_UPSHIFT_STREAK; frame += 1) {
      expect(resolveRenderSchedulerState(calm, state).tier).toBe("balanced");
    }
    expect(resolveRenderSchedulerState(calm, state).tier).toBe("full");
  });

  it("sheds the full tier quickly under sustained pressure", () => {
    const state = createRenderSchedulerHysteresisState();
    for (let frame = 0; frame < RENDER_SCHEDULER_UPSHIFT_STREAK; frame += 1) {
      resolveRenderSchedulerState(calm, state);
    }
    expect(state.loadTier).toBe("full");

    for (let frame = 1; frame < RENDER_SCHEDULER_DOWNSHIFT_STREAK; frame += 1) {
      expect(resolveRenderSchedulerState(pressured, state).tier).toBe("full");
    }
    expect(resolveRenderSchedulerState(pressured, state).tier).toBe("recovery");
  });

  it("freezes the ladder on idle frames so a duty cycle never reads as load", () => {
    // The trap this closes: an idle frame is deliberately spaced at ~33ms, and
    // 33ms is squarely inside the `recovery` band. Left alone, a world nobody
    // is touching would shed water motion, gulls and shadows two frames after
    // it started saving power.
    const state = createRenderSchedulerHysteresisState();
    for (let frame = 0; frame < RENDER_SCHEDULER_UPSHIFT_STREAK; frame += 1) {
      resolveRenderSchedulerState(calm, state);
    }
    expect(state.loadTier).toBe("full");

    const idle = {
      cameraIntentActive: false,
      drawDurationMs: 10,
      framePacingP90Ms: 34,
      idleActive: true,
      reducedMotion: false,
    };
    for (let frame = 0; frame < RENDER_SCHEDULER_DOWNSHIFT_STREAK * 4; frame += 1) {
      const scheduler = resolveRenderSchedulerState(idle, state);
      expect(scheduler.tier).toBe("full");
      expect(scheduler.targetFrameMs).toBe(RENDER_SCHEDULER_IDLE_TARGET_FRAME_MS);
    }
    expect(state.loadTier).toBe("full");
    expect(state.downshiftStreak).toBe(0);

    // Genuine pressure after the world wakes still sheds on the usual streak.
    for (let frame = 1; frame < RENDER_SCHEDULER_DOWNSHIFT_STREAK; frame += 1) {
      expect(resolveRenderSchedulerState(pressured, state).tier).toBe("full");
    }
    expect(resolveRenderSchedulerState(pressured, state).tier).toBe("recovery");
  });

  it("holds the idle freeze even with no ladder to freeze", () => {
    // The live loop always passes a ladder, so this never fires today. Without
    // one the guard used to fall through to the raw reading and answer
    // `recovery` off the duty cycle itself — failing OPEN into exactly the
    // shedding it exists to prevent. `balanced` is the ladder's own starting
    // value, so a caller with no ladder gets the answer it would have had.
    const idle = {
      cameraIntentActive: false,
      drawDurationMs: 10,
      framePacingP90Ms: 34,
      idleActive: true,
      reducedMotion: false,
    };

    const scheduler = resolveRenderSchedulerState(idle);

    expect(scheduler.tier).toBe("balanced");
    expect(scheduler.loadTier).toBe("balanced");
    // A non-idle frame at the same pacing is still read as load, as it must be.
    expect(resolveRenderSchedulerState({ ...idle, idleActive: false }).tier).toBe("recovery");
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
