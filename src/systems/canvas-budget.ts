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
  sortedScratch: number[];
  size: number;
}

// Generic fixed-allocation numeric ring buffer. Used by telemetry windows
// (`FrameIntervalWindow`, `NumericMaxWindow`, `LongtaskWindow`) that share the
// same write-cursor/size/wrap pattern as `DrawDurationWindow` above. `values`
// is pre-allocated once at construction so per-frame pushes stay
// allocation-free.
export interface RingBuffer {
  capacity: number;
  cursor: number;
  size: number;
  values: number[];
}

export function createRingBuffer(capacity: number): RingBuffer {
  const normalizedCapacity = Math.max(1, Math.floor(capacity));
  return {
    capacity: normalizedCapacity,
    cursor: 0,
    size: 0,
    values: new Array<number>(normalizedCapacity),
  };
}

export function pushRingBuffer(ring: RingBuffer, value: number): void {
  ring.values[ring.cursor] = value;
  ring.cursor = (ring.cursor + 1) % ring.capacity;
  ring.size = Math.min(ring.size + 1, ring.capacity);
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

export interface CanvasBackingPixelMetrics {
  dynamicCacheEntryCount: number;
  dynamicCachePixels: number;
  mainCanvasPixels: number;
  maxMainCanvasPixels: number;
  maxTotalBackingPixels: number;
  offscreenCachePixels: number;
  overBudgetPixels: number;
  remainingOffscreenPixels: number;
  spriteCacheEntryCount: number;
  spriteCachePixels: number;
  staticCacheEntryCount: number;
  staticCachePixels: number;
  totalBackingPixels: number;
  totalCacheEntryCount: number;
}

export function createDrawDurationWindow(capacity = ADAPTIVE_DPR_WINDOW_SIZE): DrawDurationWindow {
  const normalizedCapacity = Math.max(1, Math.floor(capacity));
  return {
    capacity: normalizedCapacity,
    cursor: 0,
    entries: new Array<number>(normalizedCapacity),
    sortedScratch: new Array<number>(normalizedCapacity),
    size: 0,
  };
}

export function pushDrawDurationSample(window: DrawDurationWindow, drawDurationMs: number): DrawDurationStats {
  const sample = Number.isFinite(drawDurationMs) ? Math.max(0, drawDurationMs) : 0;
  window.entries[window.cursor] = sample;
  window.cursor = (window.cursor + 1) % window.capacity;
  window.size = Math.min(window.size + 1, window.capacity);

  if (window.size === 0) {
    return { averageMs: 0, count: 0, p90Ms: 0 };
  }

  let total = 0;
  const sorted = window.sortedScratch;
  for (let index = 0; index < window.size; index += 1) {
    const value = window.entries[index] ?? 0;
    total += value;
    sorted[index] = value;
  }
  sortFirstNumbers(sorted, window.size);
  const percentileIndex = Math.max(0, Math.ceil(window.size * 0.9) - 1);
  return {
    averageMs: total / window.size,
    count: window.size,
    p90Ms: sorted[percentileIndex] ?? 0,
  };
}

function sortFirstNumbers(values: number[], count: number): void {
  for (let index = 1; index < count; index += 1) {
    const value = values[index] ?? 0;
    let scan = index - 1;
    while (scan >= 0 && (values[scan] ?? 0) > value) {
      values[scan + 1] = values[scan] ?? 0;
      scan -= 1;
    }
    values[scan + 1] = value;
  }
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

export function canvasPixelArea(width: number, height: number): number {
  const safeWidth = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
  const safeHeight = Number.isFinite(height) ? Math.max(0, Math.floor(height)) : 0;
  return safeWidth * safeHeight;
}

export function resolveCanvasBackingPixelMetrics(input: {
  dynamicCacheEntryCount?: number;
  dynamicCachePixels?: number;
  mainCanvasPixels: number;
  maxMainCanvasPixels?: number;
  maxTotalBackingPixels?: number;
  staticCacheEntryCount?: number;
  staticCachePixels?: number;
  spriteCacheEntryCount?: number;
  spriteCachePixels?: number;
}): CanvasBackingPixelMetrics {
  const mainCanvasPixels = Math.max(0, Math.floor(input.mainCanvasPixels));
  const staticCachePixels = Math.max(0, Math.floor(input.staticCachePixels ?? 0));
  const dynamicCachePixels = Math.max(0, Math.floor(input.dynamicCachePixels ?? 0));
  const spriteCachePixels = Math.max(0, Math.floor(input.spriteCachePixels ?? 0));
  const maxMainCanvasPixels = Math.max(1, Math.floor(input.maxMainCanvasPixels ?? MAX_MAIN_CANVAS_PIXELS));
  const maxTotalBackingPixels = Math.max(maxMainCanvasPixels, Math.floor(input.maxTotalBackingPixels ?? MAX_TOTAL_BACKING_PIXELS));
  const offscreenCachePixels = staticCachePixels + dynamicCachePixels + spriteCachePixels;
  const totalBackingPixels = mainCanvasPixels + offscreenCachePixels;
  const remainingOffscreenPixels = Math.max(0, maxTotalBackingPixels - mainCanvasPixels - offscreenCachePixels);
  return {
    dynamicCacheEntryCount: Math.max(0, Math.floor(input.dynamicCacheEntryCount ?? 0)),
    dynamicCachePixels,
    mainCanvasPixels,
    maxMainCanvasPixels,
    maxTotalBackingPixels,
    offscreenCachePixels,
    overBudgetPixels: Math.max(0, totalBackingPixels - maxTotalBackingPixels),
    remainingOffscreenPixels,
    spriteCacheEntryCount: Math.max(0, Math.floor(input.spriteCacheEntryCount ?? 0)),
    spriteCachePixels,
    staticCacheEntryCount: Math.max(0, Math.floor(input.staticCacheEntryCount ?? 0)),
    staticCachePixels,
    totalBackingPixels,
    totalCacheEntryCount: Math.max(0, Math.floor((input.staticCacheEntryCount ?? 0) + (input.dynamicCacheEntryCount ?? 0) + (input.spriteCacheEntryCount ?? 0))),
  };
}

export function canRetainOffscreenCanvas(input: {
  candidatePixels: number;
  currentDynamicCachePixels?: number;
  currentSpriteCachePixels?: number;
  currentStaticCachePixels?: number;
  mainCanvasPixels: number;
  maxTotalBackingPixels?: number;
}): boolean {
  const candidatePixels = Math.max(0, Math.floor(input.candidatePixels));
  if (candidatePixels <= 0) return true;
  const metrics = resolveCanvasBackingPixelMetrics({
    dynamicCachePixels: input.currentDynamicCachePixels ?? 0,
    mainCanvasPixels: input.mainCanvasPixels,
    maxTotalBackingPixels: input.maxTotalBackingPixels,
    spriteCachePixels: input.currentSpriteCachePixels ?? 0,
    staticCachePixels: input.currentStaticCachePixels ?? 0,
  });
  return candidatePixels <= metrics.remainingOffscreenPixels;
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
