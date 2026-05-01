import type { DrawPharosVilleInput } from "../render-types";

const MAX_NIGHT_DARKNESS = 0.70;
const NIGHT_TINT_R = 14;
const NIGHT_TINT_G = 8;
const NIGHT_TINT_B = 38;

export function drawNightTint(input: DrawPharosVilleInput, nightFactor: number): void {
  if (nightFactor <= 0) return;
  const { ctx, height, width } = input;
  const alpha = MAX_NIGHT_DARKNESS * nightFactor;
  ctx.save();
  ctx.fillStyle = `rgba(${NIGHT_TINT_R}, ${NIGHT_TINT_G}, ${NIGHT_TINT_B}, ${alpha})`;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

export function drawNightVignette(input: DrawPharosVilleInput, nightFactor: number): void {
  if (nightFactor <= 0) return;
  const { ctx, height, width } = input;
  const cx = width * 0.5;
  const cy = height * 0.5;
  const diagonal = Math.hypot(width, height);
  const innerR = diagonal * 0.28;
  const outerR = diagonal * 0.78;
  const vignette = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
  vignette.addColorStop(0, "rgba(5, 3, 18, 0)");
  vignette.addColorStop(1, `rgba(5, 3, 18, ${0.82 * nightFactor})`);
  ctx.save();
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
