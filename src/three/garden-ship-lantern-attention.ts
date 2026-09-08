export const SHIP_LANTERN_HOVER_DWELL_SECONDS = 0.06;
export const SHIP_LANTERN_ATTACK_SECONDS = 0.12;
export const SHIP_LANTERN_RELEASE_SECONDS = 0.4;

const LANTERN_ATTENTION_EPSILON = 0.002;
/**
 * Ceremony-only lantern bow. Convoy order becomes a normalized delay so every
 * fleet, regardless of size, completes one legible sweep inside the beat.
 */
export function shipLanternCeremonyBow(
  convoyIndex: number,
  convoyLength: number,
  progress: number,
  reducedMotion = false,
): number {
  const sample = reducedMotion ? 0.5 : Math.max(0, Math.min(1, progress));
  const order = convoyLength <= 1 ? 0 : Math.max(0, Math.min(1, convoyIndex / (convoyLength - 1)));
  const local = sample - order * 0.34;
  if (local <= 0 || local >= 0.78) return 0;
  if (local < 0.18) return smoothstep(local / 0.18);
  if (local <= 0.58) return 1;
  return 1 - smoothstep((local - 0.58) / 0.2);
}

function smoothstep(value: number): number {
  const bounded = Math.max(0, Math.min(1, value));
  return bounded * bounded * (3 - 2 * bounded);
}

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
