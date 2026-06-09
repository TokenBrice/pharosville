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

// --- Zoom disclosure gates ------------------------------------------------
// Progressive-disclosure thresholds (plan 2.7), centralised so every layer
// gates off the same named ladder instead of per-layer magic numbers. Camera
// zoom spans 0.48–2.4 (`zoomCameraAt`); the default desktop fit lands around
// 0.85–0.9, so none of these gates flip on the initial view.

/** Below this zoom, standard hulls skip mast pennants and bowsprit logo marks. */
export const SHIP_CHROME_MIN_ZOOM = 0.6;

/**
 * At or above this zoom, ships reveal close-inspection detail: pennant
 * streamers and anchor-chain glints on resting hulls.
 */
export const SHIP_DETAIL_REVEAL_ZOOM = 1.0;

/** Minimum zoom for the dock name ribbon beside the dock flag. */
export const DOCK_NAME_RIBBON_MIN_ZOOM = 0.5;

/**
 * W6.04 (decision D8 §6) — heritage-tier stern engraving gate. Tighter than
 * the dock-ribbon gate: heritage nameplates are inspect-a-hull-level detail.
 */
export const HERITAGE_NAMEPLATE_MIN_ZOOM = 0.7;

/**
 * Identity pass P4 — fleet-wide ticker nameplates. Looser than the heritage
 * stern engraving; plates appear once ships are large enough that a ~9px
 * label sits cleanly under the hull.
 */
export const SHIP_NAMEPLATE_MIN_ZOOM = 1.1;
