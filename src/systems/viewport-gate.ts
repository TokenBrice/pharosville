/**
 * Shared widescreen-gate thresholds.
 *
 * `src/client.tsx` applies these before it imports the desktop data/runtime
 * chunk. The guard `scripts/check-viewport-gate.mjs` verifies that lazy
 * boundary remains intact.
 *
 * Runtime-neutral: no React or DOM imports.
 */

export const MIN_LONG_SIDE_PX = 720;
export const MIN_SHORT_SIDE_PX = 360;

export function isWidescreenViewport(width: number, height: number): boolean {
  if (!width || !height) return false;
  return Math.max(width, height) >= MIN_LONG_SIDE_PX
    && Math.min(width, height) >= MIN_SHORT_SIDE_PX;
}
