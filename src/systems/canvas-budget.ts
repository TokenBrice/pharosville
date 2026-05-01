export const MAX_MAIN_CANVAS_PIXELS = 8_000_000;
export const MAX_TERRAIN_CACHE_PIXELS = 6_000_000;
export const MAX_WEATHER_CACHE_PIXELS = 2_000_000;
export const MAX_MINIMAP_PIXELS = 300_000;
export const MAX_TOTAL_BACKING_PIXELS = 14_000_000;
export const ADAPTIVE_DPR_WINDOW_SIZE = 48;
export const ADAPTIVE_DPR_DOWNSHIFT_P90_MS = 17.4;
export const ADAPTIVE_DPR_UPSHIFT_P90_MS = 13.6;
export const ADAPTIVE_DPR_STEP = 0.125;
export const ADAPTIVE_DPR_DOWNSHIFT_STREAK = 4;
export const ADAPTIVE_DPR_UPSHIFT_STREAK = 16;
export const ADAPTIVE_DPR_CHANGE_COOLDOWN_FRAMES = 24;

export interface DrawDurationWindow {
  capacity: number;
  cursor: number;
  entries: number[];
  size: number;
}

export interface DrawDurationStats {
  averageMs: number;
  count: number;
  p90Ms: number;
}

export interface AdaptiveDprState {
  cooldownFrames: number;
  downshiftStreak: number;
  requestedDpr: number;
  upshiftStreak: number;
}

export function createDrawDurationWindow(capacity = ADAPTIVE_DPR_WINDOW_SIZE): DrawDurationWindow {
  return {
    capacity: Math.max(1, Math.floor(capacity)),
    cursor: 0,
    entries: [],
    size: 0,
  };
}

export function pushDrawDurationSample(window: DrawDurationWindow, drawDurationMs: number): DrawDurationStats {
  const sample = Number.isFinite(drawDurationMs) ? Math.max(0, drawDurationMs) : 0;
  if (window.size < window.capacity) {
    window.entries.push(sample);
    window.size += 1;
  } else {
    window.entries[window.cursor] = sample;
    window.cursor = (window.cursor + 1) % window.capacity;
  }

  if (window.size === 0) {
    return { averageMs: 0, count: 0, p90Ms: 0 };
  }

  let total = 0;
  for (let index = 0; index < window.size; index += 1) total += window.entries[index] ?? 0;
  const sorted = window.entries.slice(0, window.size).sort((left, right) => left - right);
  const percentileIndex = Math.max(0, Math.ceil(window.size * 0.9) - 1);
  return {
    averageMs: total / window.size,
    count: window.size,
    p90Ms: sorted[percentileIndex] ?? 0,
  };
}

export function initialAdaptiveDprState(requestedDpr: number): AdaptiveDprState {
  return {
    cooldownFrames: 0,
    downshiftStreak: 0,
    requestedDpr,
    upshiftStreak: 0,
  };
}

export function resolveAdaptiveDprState(input: {
  maximumRequestedDpr: number;
  minimumRequestedDpr?: number;
  state: AdaptiveDprState;
  stats: DrawDurationStats;
}): AdaptiveDprState {
  const minimumRequestedDpr = Math.max(1, input.minimumRequestedDpr ?? 1);
  const maximumRequestedDpr = Math.max(minimumRequestedDpr, input.maximumRequestedDpr);
  const requestedDpr = quantizeDpr(Math.max(minimumRequestedDpr, Math.min(maximumRequestedDpr, input.state.requestedDpr)));
  const nextState: AdaptiveDprState = {
    cooldownFrames: Math.max(0, input.state.cooldownFrames - 1),
    downshiftStreak: input.state.downshiftStreak,
    requestedDpr,
    upshiftStreak: input.state.upshiftStreak,
  };
  if (input.stats.count < Math.max(ADAPTIVE_DPR_DOWNSHIFT_STREAK, ADAPTIVE_DPR_UPSHIFT_STREAK)) return nextState;
  if (nextState.cooldownFrames > 0) return nextState;

  if (input.stats.p90Ms > ADAPTIVE_DPR_DOWNSHIFT_P90_MS) {
    nextState.downshiftStreak += 1;
    nextState.upshiftStreak = 0;
    if (nextState.downshiftStreak >= ADAPTIVE_DPR_DOWNSHIFT_STREAK && nextState.requestedDpr > minimumRequestedDpr) {
      return {
        cooldownFrames: ADAPTIVE_DPR_CHANGE_COOLDOWN_FRAMES,
        downshiftStreak: 0,
        requestedDpr: quantizeDpr(Math.max(minimumRequestedDpr, nextState.requestedDpr - ADAPTIVE_DPR_STEP)),
        upshiftStreak: 0,
      };
    }
    return nextState;
  }

  if (input.stats.p90Ms < ADAPTIVE_DPR_UPSHIFT_P90_MS) {
    nextState.upshiftStreak += 1;
    nextState.downshiftStreak = 0;
    if (nextState.upshiftStreak >= ADAPTIVE_DPR_UPSHIFT_STREAK && nextState.requestedDpr < maximumRequestedDpr) {
      return {
        cooldownFrames: ADAPTIVE_DPR_CHANGE_COOLDOWN_FRAMES,
        downshiftStreak: 0,
        requestedDpr: quantizeDpr(Math.min(maximumRequestedDpr, nextState.requestedDpr + ADAPTIVE_DPR_STEP)),
        upshiftStreak: 0,
      };
    }
    return nextState;
  }

  return {
    ...nextState,
    downshiftStreak: 0,
    upshiftStreak: 0,
  };
}

function quantizeDpr(value: number): number {
  return Math.round(value / ADAPTIVE_DPR_STEP) * ADAPTIVE_DPR_STEP;
}

export function resolveCanvasBudget(input: {
  cssHeight: number;
  cssWidth: number;
  requestedDpr: number;
}) {
  const cssPixels = Math.max(1, Math.floor(input.cssWidth) * Math.floor(input.cssHeight));
  const requestedDpr = Number.isFinite(input.requestedDpr) ? Math.max(1, input.requestedDpr) : 1;
  const maxDprForMainCanvas = Math.sqrt(MAX_MAIN_CANVAS_PIXELS / cssPixels);
  const effectiveDpr = Math.max(1, Math.min(2, requestedDpr, maxDprForMainCanvas));
  const backingWidth = Math.max(1, Math.floor(input.cssWidth * effectiveDpr));
  const backingHeight = Math.max(1, Math.floor(input.cssHeight * effectiveDpr));

  return {
    backingHeight,
    backingPixels: backingWidth * backingHeight,
    backingWidth,
    effectiveDpr,
    maxMainCanvasPixels: MAX_MAIN_CANVAS_PIXELS,
    maxTotalBackingPixels: MAX_TOTAL_BACKING_PIXELS,
    requestedDpr,
  };
}
