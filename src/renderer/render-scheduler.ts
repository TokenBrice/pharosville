import type { PharosVilleRenderSchedulerState, PharosVilleRenderSchedulerTier } from "./render-types";

export const RENDER_SCHEDULER_TARGET_FRAME_MS = 16.7;

// Hysteresis: a load-tier change must be observed for a sustained streak of
// frames before it is applied, so the scheduler does not flicker passes on and
// off when frame pacing hovers around a threshold. Downshifts (toward heavier
// degradation) apply quickly; upshifts (restoring effects) require a longer
// streak, mirroring the adaptive-DPR discipline in canvas-budget.ts.
// V4.1: downshift streak 3 → 2 so spike recovery starts one frame sooner —
// at a 90ms+ constrained-trigger draw that single frame is worth more than
// the flicker risk it adds (alternating-pressure flap is still suppressed:
// any calm frame resets the streak, and upshift still needs 8).
export const RENDER_SCHEDULER_DOWNSHIFT_STREAK = 2;
export const RENDER_SCHEDULER_UPSHIFT_STREAK = 8;

type RenderSchedulerLoadTier = Extract<PharosVilleRenderSchedulerTier, "full" | "recovery" | "constrained">;

export interface RenderSchedulerHysteresisState {
  loadTier: RenderSchedulerLoadTier;
  downshiftStreak: number;
  upshiftStreak: number;
}

export function createRenderSchedulerHysteresisState(): RenderSchedulerHysteresisState {
  return { loadTier: "full", downshiftStreak: 0, upshiftStreak: 0 };
}

const INTERACTION_SKIPS = ["film-grain"] as const;
const INTERACTION_DEGRADES = ["cloud-shadow", "birds", "god-rays"] as const;
const LOW_PRIORITY_EFFECT_SKIPS = [
  "birds",
  "bioluminescent-sparkles",
  "decorative-lights",
  "film-grain",
  "god-rays",
  "moon-reflection",
  "sea-mist",
] as const;
// Constrained tier additionally sheds the per-frame water passes — the
// single largest direct-draw cost (hundreds of visible tiles per frame).
// Recovery keeps them so moderate pressure doesn't visibly still the sea.
const CONSTRAINED_EFFECT_SKIPS = [
  ...LOW_PRIORITY_EFFECT_SKIPS,
  "water-accents",
  "coastal-water-motion",
  "dock-caustics",
] as const;

export function resolveRenderSchedulerState(
  input: {
    cameraIntentActive: boolean;
    drawDurationMs?: number;
    framePacingP90Ms?: number;
    reducedMotion: boolean;
  },
  hysteresis?: RenderSchedulerHysteresisState,
): PharosVilleRenderSchedulerState {
  const tier = resolveRenderSchedulerTier(input, hysteresis);
  return {
    degradedPasses: degradedPassesForTier(tier),
    skippedPasses: skippedPassesForTier(tier),
    targetFrameMs: RENDER_SCHEDULER_TARGET_FRAME_MS,
    tier,
  };
}

export function shouldDrawScheduledPass(
  scheduler: PharosVilleRenderSchedulerState | undefined,
  pass: string,
): boolean {
  return !scheduler?.skippedPasses.includes(pass);
}

export function isScheduledPassDegraded(
  scheduler: PharosVilleRenderSchedulerState | undefined,
  pass: string,
): boolean {
  return Boolean(scheduler?.degradedPasses.includes(pass));
}

function resolveRenderSchedulerTier(
  input: {
    cameraIntentActive: boolean;
    drawDurationMs?: number;
    framePacingP90Ms?: number;
    reducedMotion: boolean;
  },
  hysteresis?: RenderSchedulerHysteresisState,
): PharosVilleRenderSchedulerTier {
  if (input.reducedMotion) return "full";
  if (input.cameraIntentActive) return "interaction";
  const raw = rawLoadTier(input);
  if (!hysteresis) return raw;
  return advanceLoadTierHysteresis(hysteresis, raw);
}

function rawLoadTier(input: {
  drawDurationMs?: number;
  framePacingP90Ms?: number;
}): RenderSchedulerLoadTier {
  const p90 = input.framePacingP90Ms ?? 0;
  const draw = input.drawDurationMs ?? 0;
  if (p90 >= 48 || draw >= 90) return "constrained";
  if (p90 >= 28 || draw >= 48) return "recovery";
  return "full";
}

const LOAD_TIER_SEVERITY: Record<RenderSchedulerLoadTier, number> = {
  full: 0,
  recovery: 1,
  constrained: 2,
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

function skippedPassesForTier(tier: PharosVilleRenderSchedulerTier): readonly string[] {
  if (tier === "interaction") return INTERACTION_SKIPS;
  if (tier === "constrained") return CONSTRAINED_EFFECT_SKIPS;
  if (tier === "recovery") return LOW_PRIORITY_EFFECT_SKIPS;
  return [];
}

function degradedPassesForTier(tier: PharosVilleRenderSchedulerTier): readonly string[] {
  if (tier === "interaction") return INTERACTION_DEGRADES;
  return [];
}
