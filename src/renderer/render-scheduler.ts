import type { PharosVilleRenderSchedulerState, PharosVilleRenderSchedulerTier } from "./render-types";

export const RENDER_SCHEDULER_TARGET_FRAME_MS = 16.7;

const INTERACTION_SKIPS = ["film-grain"] as const;
const INTERACTION_DEGRADES = ["cloud-shadow", "birds", "god-rays"] as const;
const CONSTRAINED_SKIPS = [
  "birds",
  "bioluminescent-sparkles",
  "cloud-shadow",
  "decorative-lights",
  "film-grain",
  "god-rays",
  "moon-reflection",
  "sea-mist",
] as const;
const RECOVERY_SKIPS = ["film-grain"] as const;
const RECOVERY_DEGRADES = ["birds", "cloud-shadow"] as const;

export function resolveRenderSchedulerState(input: {
  cameraIntentActive: boolean;
  drawDurationMs?: number;
  framePacingP90Ms?: number;
  reducedMotion: boolean;
}): PharosVilleRenderSchedulerState {
  const tier = resolveRenderSchedulerTier(input);
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

function resolveRenderSchedulerTier(input: {
  cameraIntentActive: boolean;
  drawDurationMs?: number;
  framePacingP90Ms?: number;
  reducedMotion: boolean;
}): PharosVilleRenderSchedulerTier {
  if (input.reducedMotion) return "full";
  if (input.cameraIntentActive) return "interaction";
  const p90 = input.framePacingP90Ms ?? 0;
  const draw = input.drawDurationMs ?? 0;
  if (p90 >= 48 || draw >= 90) return "constrained";
  if (p90 >= 28 || draw >= 48) return "recovery";
  return "full";
}

function skippedPassesForTier(tier: PharosVilleRenderSchedulerTier): readonly string[] {
  if (tier === "interaction") return INTERACTION_SKIPS;
  if (tier === "constrained") return CONSTRAINED_SKIPS;
  if (tier === "recovery") return RECOVERY_SKIPS;
  return [];
}

function degradedPassesForTier(tier: PharosVilleRenderSchedulerTier): readonly string[] {
  if (tier === "interaction") return INTERACTION_DEGRADES;
  if (tier === "recovery") return RECOVERY_DEGRADES;
  return [];
}
