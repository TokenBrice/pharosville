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

/**
 * Can this DEVICE show the map at all, in its best orientation?
 *
 * Orientation-free on purpose: a phone that is 390x844 has the same capability
 * whichever way up it is held, and the answer to "should this device ever mount
 * the world" must not flip when the user rotates it.
 */
export function isWidescreenViewport(width: number, height: number): boolean {
  if (!width || !height) return false;
  return Math.max(width, height) >= MIN_LONG_SIDE_PX
    && Math.min(width, height) >= MIN_SHORT_SIDE_PX;
}

/**
 * Can the CURRENT VIEWPORT show the map?
 *
 * V1 (2026-07-25): this replaces a `(orientation: portrait)` media query, which
 * was the wrong question asked in the wrong units.
 *
 * In CSS, `orientation` is a property of the VIEWPORT, not of the device: it
 * reports portrait whenever the viewport's height is at least its width. So a
 * 1250x1250 browser window on a desktop monitor was "portrait" and got the
 * rotate prompt, while the SAME window 700px shorter was "landscape" and
 * charted fine. Adding height took the world away — which is nonsense, because
 * the taller window has strictly more room.
 *
 * The real question is whether the viewport has the room, so that is what is
 * measured. Width is the binding constraint — the world is a wide isometric
 * composition — so it takes the long-side floor, and height takes the short-side
 * floor. A phone in portrait still fails on width and still gets told to rotate;
 * a tall desktop window, or a tablet held upright with 720px of width, does not.
 */
export function canViewportShowMap(width: number, height: number): boolean {
  if (!width || !height) return false;
  return width >= MIN_LONG_SIDE_PX && height >= MIN_SHORT_SIDE_PX;
}
