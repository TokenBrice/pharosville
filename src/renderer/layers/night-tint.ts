import type { DrawPharosVilleInput } from "../render-types";

const MAX_NIGHT_DARKNESS = 0.62;
const NIGHT_TINT_R = 8;
const NIGHT_TINT_G = 14;
const NIGHT_TINT_B = 28;

export function drawNightTint(input: DrawPharosVilleInput, nightFactor: number): void {
  if (nightFactor <= 0) return;
  const { ctx, height, width } = input;
  const alpha = MAX_NIGHT_DARKNESS * nightFactor;
  ctx.save();
  ctx.fillStyle = `rgba(${NIGHT_TINT_R}, ${NIGHT_TINT_G}, ${NIGHT_TINT_B}, ${alpha})`;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
