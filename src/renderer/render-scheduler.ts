import type { PharosVilleRenderSchedulerState, PharosVilleRenderSchedulerTier } from "./render-types";

export const RENDER_SCHEDULER_TARGET_FRAME_MS = 16.7;

/**
 * Quiet wall-clock time before an unattended world halves its duty cycle.
 *
 * PharosVille is meant to be left open, so most of a session is spent with
 * nobody touching it, and a full-rate loop on a second screen spends battery
 * and fan noise on frames nobody is watching closely. Three minutes is longer
 * than any plausible reading pause — a tooltip, a detail card, a long look at
 * one convoy — and short enough that an abandoned tab spends the bulk of its
 * life at the lower rate. Guessing wrong costs one frame: any input restores
 * full rate on the next frame, with no ramp.
 */
export const RENDER_SCHEDULER_IDLE_AFTER_MS = 180_000;

/**
 * Idle duty cycle: one drawn frame per two frames of a 60Hz display.
 *
 * The loop skips a frame whose interval is STRICTLY BELOW this, so the value has
 * to sit under two 60Hz vsync intervals, not on top of them. At 33.4 it sat
 * above 2×16.667 = 33.33, so every two-frame interval was rejected and the world
 * drew on the THIRD — 20 fps, not the 30 this documents. The margin below 33.33
 * absorbs the pacing jitter of a panel that is not exactly 60.000 Hz, and is far
 * enough above a single 16.7 ms interval that one-frame intervals can never pass.
 */
export const RENDER_SCHEDULER_IDLE_TARGET_FRAME_MS = 33;

export interface RenderSchedulerIdleState {
  idle: boolean;
  targetFrameMs: number;
}

/**
 * Whether the world should be sampling itself at the idle duty cycle.
 *
 * Idle is orthogonal to the load tier: it says nobody is interacting, not that
 * the machine is struggling. Motion is a pure function of the world clock (see
 * `resolveShipMotionSampleInto`, and the exponential `dampingAlpha` in visual
 * smoothing, both keyed on elapsed seconds), so a longer target samples the
 * same motion less often rather than slowing it down.
 *
 * Reduced motion has no continuous clock to throttle — it draws one
 * deterministic static frame — so it is never idle.
 */
export function resolveRenderSchedulerIdleState(input: {
  msSinceInteraction: number;
  reducedMotion: boolean;
}): RenderSchedulerIdleState {
  const idle = !input.reducedMotion && input.msSinceInteraction >= RENDER_SCHEDULER_IDLE_AFTER_MS;
  return {
    idle,
    targetFrameMs: idle ? RENDER_SCHEDULER_IDLE_TARGET_FRAME_MS : RENDER_SCHEDULER_TARGET_FRAME_MS,
  };
}

/**
 * Whether a resolved scheduler state is using the unattended duty cycle.
 *
 * The target interval is already part of the renderer contract, so keep idle
 * detection derived from that state rather than adding a second idle signal
 * that could drift from the loop's scheduling decision.
 */
export function isRenderSchedulerIdle(
  state: Pick<PharosVilleRenderSchedulerState, "targetFrameMs">,
): boolean {
  return state.targetFrameMs === RENDER_SCHEDULER_IDLE_TARGET_FRAME_MS;
}

// Hysteresis: a load-tier change must be observed for a sustained streak of
// frames before it is applied, so Three quality settings do not flicker when
// frame pacing hovers around a threshold. Downshifts apply quickly; upshifts
// require a longer streak, mirroring the adaptive-DPR discipline.
// V4.1: downshift streak 3 → 2 so spike recovery starts one frame sooner —
// at a 90ms+ constrained-trigger draw that single frame is worth more than
// the flicker risk it adds (alternating-pressure flap is still suppressed:
// any calm frame resets the streak, and upshift still needs 8).
export const RENDER_SCHEDULER_DOWNSHIFT_STREAK = 2;
export const RENDER_SCHEDULER_UPSHIFT_STREAK = 8;

// G3 (Garden Sea): the full tier is a normal-session load tier, not a
// reduced-motion-only mode. A frame within the p90 ≤ 20 ms budget (and a
// modest draw-time ceiling) resolves to `full` raw; the hysteresis ladder
// promotes balanced → full after the standard 8-frame calm streak, so a
// healthy desktop iGPU settles at full while janky first frames or sustained
// pressure still shed to balanced/recovery/constrained exactly as before.
export const RENDER_SCHEDULER_FULL_MAX_P90_MS = 20;
export const RENDER_SCHEDULER_FULL_MAX_DRAW_MS = 30;

type RenderSchedulerLoadTier = Extract<PharosVilleRenderSchedulerTier, "full" | "balanced" | "recovery" | "constrained">;

export interface RenderSchedulerHysteresisState {
  loadTier: RenderSchedulerLoadTier;
  downshiftStreak: number;
  upshiftStreak: number;
}

export function createRenderSchedulerHysteresisState(): RenderSchedulerHysteresisState {
  return { loadTier: "balanced", downshiftStreak: 0, upshiftStreak: 0 };
}

/**
 * The quality tier a system should draw at, given this frame's scheduler state.
 *
 * `tier` conflates two unrelated signals. `interaction` is returned
 * unconditionally by `resolveRenderSchedulerTier` the moment the camera moves —
 * no hysteresis, no load measurement behind it — so a system that reads `tier`
 * to decide how much *quality* to ship is really keying on "is the user
 * dragging right now".
 *
 * That is what produced the operator's report that the water "goes back to this
 * bluish-palish look" whenever the camera moves. Measured on the reference GPU:
 * on a drag, cloud shadows and sun glitter switched off, ripple rings fell from
 * 24 to 15, marker buoys froze mid-swell and the shadow map dropped 1024 -> 384,
 * all in one frame — the sea's surface luminance variance fell 41%
 * (sigma 12.4 -> 7.3) at identical mean brightness. The frame budget never
 * justified it: the same frame holds 60 fps / 16.7 ms p90 with all of it on.
 *
 * This returns the load reading `interaction` masks — the hysteresis ladder's
 * frozen tier, which is what the frame would be at if the camera were still.
 * So quality tracks the machine, not the mouse, and a weak machine still sheds
 * exactly as much as it did before.
 *
 * `loadTier` is optional on the state; without it we can only fall back to
 * `balanced`, which is the ladder's own initial value.
 */
export function seaQualityTier(
  state: Pick<PharosVilleRenderSchedulerState, "tier" | "loadTier">,
): Exclude<PharosVilleRenderSchedulerTier, "interaction"> {
  if (state.tier !== "interaction") return state.tier;
  return state.loadTier ?? "balanced";
}

export function resolveRenderSchedulerState(
  input: {
    cameraIntentActive: boolean;
    drawDurationMs?: number;
    framePacingP90Ms?: number;
    idleActive?: boolean;
    reducedMotion: boolean;
  },
  hysteresis?: RenderSchedulerHysteresisState,
): PharosVilleRenderSchedulerState {
  const tier = resolveRenderSchedulerTier(input, hysteresis);
  return {
    targetFrameMs: input.idleActive ? RENDER_SCHEDULER_IDLE_TARGET_FRAME_MS : RENDER_SCHEDULER_TARGET_FRAME_MS,
    tier,
    // The ladder is bypassed on interaction, idle and reduced-motion frames, so its
    // stored tier is exactly "what this frame would be without them". On a
    // load-tier frame the ladder's value IS `tier`, so one expression covers
    // every case. With no ladder at all an idle frame still must not read its
    // own duty cycle as load — same reason as `idleFrozenTier`.
    loadTier: hysteresis?.loadTier
      ?? (input.idleActive ? idleFrozenTier(hysteresis) : rawLoadTier(input)),
  };
}

/** Test seam called only by the dev+debug render loop; cadence/motion are unchanged. */
export function applyPreviewSchedulerTier(state: PharosVilleRenderSchedulerState, tier: unknown): PharosVilleRenderSchedulerState {
  return tier === "constrained" || tier === "recovery" ? { ...state, tier, loadTier: tier } : state;
}

function resolveRenderSchedulerTier(
  input: {
    cameraIntentActive: boolean;
    drawDurationMs?: number;
    framePacingP90Ms?: number;
    idleActive?: boolean;
    reducedMotion: boolean;
  },
  hysteresis?: RenderSchedulerHysteresisState,
): PharosVilleRenderSchedulerTier {
  // Reduced motion pins full quality for a single static frame (post allowed,
  // all motion frozen, zero continuous RAF) — unchanged by the G3 tier policy.
  if (input.reducedMotion) return "full";
  if (input.cameraIntentActive) return "interaction";
  // An idle-throttled frame is deliberately spaced, so its frame interval is a
  // duty cycle, not a load reading — 33ms of it would otherwise read as
  // `recovery` and shed water motion, gulls and shadows on a machine that is
  // not working hard at all. The ladder freezes exactly as it does on
  // interaction frames, so the world keeps drawing at the quality the last
  // measured steady-state frames earned it. (The loop also keeps idle
  // intervals out of the pacing window itself, so p90 never carries them into
  // the adaptive-DPR governor or the perf tripwire.)
  if (input.idleActive) return idleFrozenTier(hysteresis);
  const raw = rawLoadTier(input);
  if (!hysteresis) return raw;
  return advanceLoadTierHysteresis(hysteresis, raw);
}

/**
 * The tier an idle frame freezes at, when it has no ladder to freeze.
 *
 * Falling through to `rawLoadTier` here would read the deliberate 33 ms duty
 * cycle as load and answer `recovery` — precisely the misreading the idle guard
 * exists to prevent, and it would fail OPEN, shedding water motion, gulls and
 * shadows on a machine doing nothing. `balanced` is the ladder's own initial
 * value and what `seaQualityTier` falls back to, so a caller with no ladder gets
 * the same answer from both.
 */
function idleFrozenTier(hysteresis?: RenderSchedulerHysteresisState): RenderSchedulerLoadTier {
  return hysteresis?.loadTier ?? "balanced";
}

function rawLoadTier(input: {
  drawDurationMs?: number;
  framePacingP90Ms?: number;
}): RenderSchedulerLoadTier {
  const p90 = input.framePacingP90Ms ?? 0;
  const draw = input.drawDurationMs ?? 0;
  if (p90 >= 48 || draw >= 90) return "constrained";
  if (p90 >= 28 || draw >= 48) return "recovery";
  if (p90 <= RENDER_SCHEDULER_FULL_MAX_P90_MS && draw <= RENDER_SCHEDULER_FULL_MAX_DRAW_MS) {
    return "full";
  }
  return "balanced";
}

const LOAD_TIER_SEVERITY: Record<RenderSchedulerLoadTier, number> = {
  full: 0,
  balanced: 1,
  recovery: 2,
  constrained: 3,
};

// Mutates `state` in place: this runs once per RAF frame, so the hysteresis
// path stays allocation-free. Interaction and reduced-motion frames bypass
// this function entirely, freezing the streaks until load-tier frames resume.
function advanceLoadTierHysteresis(
  state: RenderSchedulerHysteresisState,
  raw: RenderSchedulerLoadTier,
): RenderSchedulerLoadTier {
  const currentSeverity = LOAD_TIER_SEVERITY[state.loadTier];
  const rawSeverity = LOAD_TIER_SEVERITY[raw];
  if (rawSeverity > currentSeverity) {
    state.downshiftStreak += 1;
    state.upshiftStreak = 0;
    if (state.downshiftStreak >= RENDER_SCHEDULER_DOWNSHIFT_STREAK) {
      state.loadTier = raw;
      state.downshiftStreak = 0;
    }
  } else if (rawSeverity < currentSeverity) {
    state.upshiftStreak += 1;
    state.downshiftStreak = 0;
    if (state.upshiftStreak >= RENDER_SCHEDULER_UPSHIFT_STREAK) {
      state.loadTier = raw;
      state.upshiftStreak = 0;
    }
  } else {
    state.downshiftStreak = 0;
    state.upshiftStreak = 0;
  }
  return state.loadTier;
}
