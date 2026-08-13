export const HOVER_NAMEPLATE_DWELL_MS = 150;

export interface HoverNameplateDwellState {
  detailId: string | null;
  sinceMs: number;
}

export function createHoverNameplateDwellState(): HoverNameplateDwellState {
  return { detailId: null, sinceMs: 0 };
}

/** One small hysteresis latch shared by moving and stationary targets. */
export function hoverNameplateVisible(
  state: HoverNameplateDwellState,
  detailId: string | null,
  nowMs: number,
): boolean {
  if (detailId !== state.detailId) {
    state.detailId = detailId;
    state.sinceMs = nowMs;
    return false;
  }
  return detailId !== null && nowMs - state.sinceMs >= HOVER_NAMEPLATE_DWELL_MS;
}
