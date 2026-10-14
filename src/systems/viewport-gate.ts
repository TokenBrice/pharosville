/**
 * Shared viewport-gate thresholds.
 *
 * `src/client.tsx` applies these before it imports the Harbour data/runtime
 * chunk. The guard `scripts/check-viewport-gate.mjs` verifies that lazy
 * boundary remains intact.
 *
 * Runtime-neutral: no React or DOM imports.
 */

/**
 * One sorted size profile: 720 CSS px on the long side and 600 on the short
 * side. It admits every earlier desktop profile (900×720, 1200×640), unfolded
 * foldables (a Galaxy Z Fold 7 inner screen is ≈832×750, ≈832×680 under
 * Chrome's toolbar) and tablets either way up (iPad mini 744×1133), while
 * phones (short side ≤ ≈480) and folded foldables stay on the welcome page.
 */
export const MIN_LONG_SIDE_PX = 720;
export const MIN_SHORT_SIDE_PX = 600;

/**
 * Can this DEVICE show the map at all, in its best orientation?
 *
 * Orientation-free on purpose: a phone that is 390x844 has the same capability
 * whichever way up it is held, and the answer to "should this device ever mount
 * the world" must not flip when the user rotates it. Sorting the sides keeps
 * this a monotonic size test rather than an orientation or aspect-ratio gate.
 */
export function isWidescreenViewport(width: number, height: number): boolean {
  if (!width || !height) return false;
  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);
  return longSide >= MIN_LONG_SIDE_PX && shortSide >= MIN_SHORT_SIDE_PX;
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
 * measured. The same monotonic max/min test applies to the viewport: adding
 * room along either side can never take the world away. A phone still fails;
 * a 744x1133 portrait tablet, an 832x680 unfolded foldable and a 2560x720
 * ultrawide window all pass without an orientation, aspect-ratio, or
 * device-label query.
 */
export function canViewportShowMap(width: number, height: number): boolean {
  return isWidescreenViewport(width, height);
}
