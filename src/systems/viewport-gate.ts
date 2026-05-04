/**
 * Shared widescreen-gate thresholds.
 *
 * The desktop-only fallback in `src/client.tsx` and the runtime-manifest
 * preload `media` query in `index.html` MUST agree on these dimensions, or
 * mobile devices will either fetch the manifest needlessly or be shown the
 * fallback inconsistently. The guard `scripts/check-viewport-gate.mjs`
 * enforces that this module and `index.html` stay in sync.
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
