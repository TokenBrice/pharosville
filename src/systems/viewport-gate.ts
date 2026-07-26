/**
 * Shared widescreen-gate thresholds.
 *
 * `src/client.tsx` applies these before it imports the desktop data/runtime
 * chunk. The guard `scripts/check-viewport-gate.mjs` verifies that lazy
 * boundary remains intact.
 *
 * Runtime-neutral: no React or DOM imports.
 */

export const MIN_LONG_SIDE_PX = 900;
export const MIN_SHORT_SIDE_PX = 720;

/**
 * Can this DEVICE show the map at all, in its best orientation?
 *
 * Orientation-free on purpose: a phone that is 390x844 has the same capability
 * whichever way up it is held, and the answer to "should this device ever mount
 * the world" must not flip when the user rotates it. The longer side needs
 * 900 CSS pixels and the shorter side 720: real-GPU review found that
 * 720x640 and 720x720 leave the landmark and chrome too compressed.
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
 * measured. The same monotonic max/min test applies to the viewport: adding
 * room along either side can never take the world away. A phone still fails;
 * both a 720x1000 tall window and a 2560x720 ultrawide window pass without an
 * orientation, aspect-ratio, or device-label query.
 */
export function canViewportShowMap(width: number, height: number): boolean {
  return isWidescreenViewport(width, height);
}
