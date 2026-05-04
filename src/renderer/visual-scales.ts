// Centralised render-time scale and offset constants. See
// agents/health-checkup-2026-05-04/04-maintainability.md (F13). Move named
// constants that are pure visual scales/offsets here so they can be tweaked
// without grepping across layer files. Per-frame zoom math stays in the
// layers themselves.

// --- Lighthouse ---------------------------------------------------------

/** Lighthouse sprite anchor offset, in tile-screen pixels (multiplied by camera.zoom at draw time). */
export const LIGHTHOUSE_DRAW_OFFSET = { x: 22, y: 36 } as const;

/** Lighthouse sprite scale multiplier applied on top of camera.zoom. */
export const LIGHTHOUSE_DRAW_SCALE = 1.224;

// --- Ship LOD budgets ---------------------------------------------------

/** Minimum ship overlay-pass budget at low zoom. */
export const SHIP_OVERLAY_BUDGET_MIN = 20;

/** Fraction of visible ships that get overlay treatment at full zoom. */
export const SHIP_OVERLAY_BUDGET_RATIO = 0.64;

/** Minimum ship wake-pass budget at low zoom. */
export const SHIP_WAKE_BUDGET_MIN = 12;

/** Fraction of visible ships that get wake treatment at full zoom. */
export const SHIP_WAKE_BUDGET_RATIO = 0.44;

/** Below this visible-ship count, the LOD planner uses the cheap fast path. */
export const SHIP_LOD_SKIP_THRESHOLD = 24;

/** Quantization bucket for the ship lantern halo radius cache. */
export const SHIP_LANTERN_RADIUS_BUCKET = 2;
