import type { DrawPharosVilleInput } from "../render-types";

const MAX_NIGHT_DARKNESS = 0.70;
const NIGHT_TINT_R = 14;
const NIGHT_TINT_G = 8;
const NIGHT_TINT_B = 38;

const VIGNETTE_GRADIENT_CACHE_LIMIT = 5;
const vignetteGradientCache = new Map<string, CanvasGradient>();

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
  // Bucket nightFactor at 0.05 resolution (Math.round(* 20) / 20) and use the
  // bucketed value to compute the gradient alpha so the cached gradient's
  // canonical alpha matches its key. Without this, the first nightFactor seen
  // within a bucket freezes the alpha for all subsequent hits in that bucket,
  // producing visibly stepped vignette transitions.
  const bucket = Math.round(nightFactor * 20);
  const bucketedNightFactor = bucket / 20;
  const key = `${width | 0}:${height | 0}:${bucket}`;
  let vignette = vignetteGradientCache.get(key);
  if (!vignette) {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const diagonal = Math.hypot(width, height);
    const innerR = diagonal * 0.28;
    const outerR = diagonal * 0.78;
    vignette = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
    vignette.addColorStop(0, "rgba(5, 3, 18, 0)");
    vignette.addColorStop(1, `rgba(5, 3, 18, ${0.82 * bucketedNightFactor})`);
    vignetteGradientCache.set(key, vignette);
    if (vignetteGradientCache.size > VIGNETTE_GRADIENT_CACHE_LIMIT) {
      const oldest = vignetteGradientCache.keys().next().value;
      if (oldest !== undefined) vignetteGradientCache.delete(oldest);
    }
  }
  ctx.save();
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
