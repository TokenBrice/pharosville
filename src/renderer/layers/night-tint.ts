import type { DrawPharosVilleInput } from "../render-types";

const MAX_NIGHT_DARKNESS = 0.70;
const NIGHT_TINT_R = 14;
const NIGHT_TINT_G = 8;
const NIGHT_TINT_B = 38;
const DAY_VIGNETTE_EDGE_ALPHA = 0.24;
const NIGHT_VIGNETTE_EDGE_ALPHA = 0.82;
const VIGNETTE_R = 5;
const VIGNETTE_G = 3;
const VIGNETTE_B = 18;

// 25 entries cover all 21 reachable nightFactor buckets (0.05 step, 0..1) at
// one viewport size without thrash, even under fast dev-tool scrubbing of
// time-of-day. Production cycles transition at most 2-3 buckets at a time;
// the prior cap of 5 was sufficient for natural play but caused constant
// recreation under scrubbing.
const VIGNETTE_GRADIENT_CACHE_LIMIT = 25;
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
  drawSceneVignette(input, nightFactor);
}

export function drawSceneVignette(input: DrawPharosVilleInput, nightFactor: number): void {
  const { ctx, height, width } = input;
  // Bucket nightFactor at 0.05 resolution (Math.round(* 20) / 20) and use the
  // bucketed value to compute the gradient alpha so the cached gradient's
  // canonical alpha matches its key. Without this, the first nightFactor seen
  // within a bucket freezes the alpha for all subsequent hits in that bucket,
  // producing visibly stepped vignette transitions.
  const clampedNightFactor = Math.min(1, Math.max(0, nightFactor));
  const bucket = Math.round(clampedNightFactor * 20);
  const bucketedNightFactor = bucket / 20;
  const key = `${width | 0}:${height | 0}:${bucket}`;
  let vignette = vignetteGradientCache.get(key);
  if (!vignette) {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const diagonal = Math.hypot(width, height);
    const innerR = diagonal * 0.28;
    const outerR = diagonal * 0.78;
    const edgeAlpha = DAY_VIGNETTE_EDGE_ALPHA
      + (NIGHT_VIGNETTE_EDGE_ALPHA - DAY_VIGNETTE_EDGE_ALPHA) * bucketedNightFactor;
    vignette = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
    vignette.addColorStop(0, `rgba(${VIGNETTE_R}, ${VIGNETTE_G}, ${VIGNETTE_B}, 0)`);
    vignette.addColorStop(1, `rgba(${VIGNETTE_R}, ${VIGNETTE_G}, ${VIGNETTE_B}, ${edgeAlpha})`);
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
