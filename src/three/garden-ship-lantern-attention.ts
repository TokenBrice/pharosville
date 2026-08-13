export const SHIP_LANTERN_HOVER_DWELL_SECONDS = 0.06;
export const SHIP_LANTERN_ATTACK_SECONDS = 0.12;
export const SHIP_LANTERN_RELEASE_SECONDS = 0.4;

const LANTERN_ATTENTION_EPSILON = 0.002;

export interface ShipLanternAttentionState {
  activeHoveredDetailId: string | null;
  candidateHoveredDetailId: string | null;
  candidateSinceSeconds: number;
  lastTimeSeconds: number | null;
  warmthByDetailId: Map<string, number>;
}

export function createShipLanternAttentionState(): ShipLanternAttentionState {
  return {
    activeHoveredDetailId: null,
    candidateHoveredDetailId: null,
    candidateSinceSeconds: 0,
    lastTimeSeconds: null,
    warmthByDetailId: new Map(),
  };
}

export function advanceShipLanternAttention(
  state: ShipLanternAttentionState,
  input: {
    hoveredDetailId: string | null;
    reducedMotion: boolean;
    selectedDetailId: string | null;
    timeSeconds: number;
  },
): void {
  const timeSeconds = Number.isFinite(input.timeSeconds) ? input.timeSeconds : 0;
  const deltaSeconds = state.lastTimeSeconds === null
    ? 0
    : Math.max(0, Math.min(0.25, timeSeconds - state.lastTimeSeconds));
  state.lastTimeSeconds = timeSeconds;

  if (input.hoveredDetailId !== state.candidateHoveredDetailId) {
    state.candidateHoveredDetailId = input.hoveredDetailId;
    state.candidateSinceSeconds = timeSeconds;
    if (input.hoveredDetailId === null) state.activeHoveredDetailId = null;
  }
  let hoverActivatedNow = false;
  if (input.reducedMotion) {
    state.activeHoveredDetailId = input.hoveredDetailId;
  } else if (
    state.candidateHoveredDetailId !== null
    && timeSeconds - state.candidateSinceSeconds >= SHIP_LANTERN_HOVER_DWELL_SECONDS
  ) {
    hoverActivatedNow = state.activeHoveredDetailId !== state.candidateHoveredDetailId;
    state.activeHoveredDetailId = state.candidateHoveredDetailId;
  }

  for (const detailId of [state.activeHoveredDetailId, input.selectedDetailId]) {
    if (detailId && !state.warmthByDetailId.has(detailId)) state.warmthByDetailId.set(detailId, 0);
  }
  for (const [detailId, value] of state.warmthByDetailId) {
    const target = detailId === state.activeHoveredDetailId || detailId === input.selectedDetailId ? 1 : 0;
    const envelopeDelta = hoverActivatedNow && detailId === state.activeHoveredDetailId ? 0 : deltaSeconds;
    const next = input.reducedMotion
      ? target
      : value + (target - value) * (1 - Math.exp(
          -envelopeDelta / (target > value ? SHIP_LANTERN_ATTACK_SECONDS : SHIP_LANTERN_RELEASE_SECONDS),
        ));
    if (target === 0 && next < LANTERN_ATTENTION_EPSILON) state.warmthByDetailId.delete(detailId);
    else state.warmthByDetailId.set(detailId, next);
  }
}

export function shipLanternWarmth(state: ShipLanternAttentionState, detailId: string): number {
  return state.warmthByDetailId.get(detailId) ?? 0;
}
