import { createRingBuffer, pushRingBuffer, type RingBuffer } from "../systems/canvas-budget";

export type FramePacingMetrics = {
  averageMs: number;
  droppedFrameCount: number;
  effectiveFps: number;
  longestDroppedBurst: number;
  maxMs: number;
  p50Ms: number;
  p90Ms: number;
  sampleCount: number;
};

export type FrameIntervalWindow = {
  samples: RingBuffer;
  sortedScratch: number[];
};

export type NumericMaxWindow = RingBuffer;

export type LongtaskWindow = {
  counts: RingBuffer;
  maxDurations: RingBuffer;
};

const FRAME_INTERVAL_WINDOW_SIZE = 120;
const DROPPED_FRAME_INTERVAL_MS = 34;

export function emptyFramePacingMetrics(): FramePacingMetrics {
  return {
    averageMs: 0,
    droppedFrameCount: 0,
    effectiveFps: 0,
    longestDroppedBurst: 0,
    maxMs: 0,
    p50Ms: 0,
    p90Ms: 0,
    sampleCount: 0,
  };
}

export function createFrameIntervalWindow(): FrameIntervalWindow {
  return {
    samples: createRingBuffer(FRAME_INTERVAL_WINDOW_SIZE),
    sortedScratch: new Array<number>(FRAME_INTERVAL_WINDOW_SIZE),
  };
}

export function pushFrameIntervalSample(window: FrameIntervalWindow, intervalMs: number): FramePacingMetrics {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return resolveFramePacingMetrics(window);
  pushRingBuffer(window.samples, intervalMs);
  return resolveFramePacingMetrics(window);
}

function resolveFramePacingMetrics(window: FrameIntervalWindow): FramePacingMetrics {
  const ring = window.samples;
  if (ring.size <= 0) return emptyFramePacingMetrics();
  let sum = 0;
  let maxMs = 0;
  let droppedFrameCount = 0;
  let currentDroppedBurst = 0;
  let longestDroppedBurst = 0;
  for (let index = 0; index < ring.size; index += 1) {
    const interval = frameIntervalAt(ring, index);
    sum += interval;
    if (interval > maxMs) maxMs = interval;
    if (interval > DROPPED_FRAME_INTERVAL_MS) {
      droppedFrameCount += 1;
      currentDroppedBurst += 1;
      if (currentDroppedBurst > longestDroppedBurst) longestDroppedBurst = currentDroppedBurst;
    } else {
      currentDroppedBurst = 0;
    }
    window.sortedScratch[index] = interval;
  }
  sortFirstNumbers(window.sortedScratch, ring.size);
  const averageMs = sum / ring.size;
  return {
    averageMs,
    droppedFrameCount,
    effectiveFps: averageMs > 0 ? 1000 / averageMs : 0,
    longestDroppedBurst,
    maxMs,
    p50Ms: percentile(window.sortedScratch, 0.5, ring.size),
    p90Ms: percentile(window.sortedScratch, 0.9, ring.size),
    sampleCount: ring.size,
  };
}

function frameIntervalAt(ring: RingBuffer, chronologicalIndex: number): number {
  if (ring.size < ring.capacity) return ring.values[chronologicalIndex] ?? 0;
  return ring.values[(ring.cursor + chronologicalIndex) % ring.capacity] ?? 0;
}

export function createNumericMaxWindow(capacity: number): NumericMaxWindow {
  return createRingBuffer(capacity);
}

export function pushNumericMaxWindow(window: NumericMaxWindow, value: number): number {
  pushRingBuffer(window, Number.isFinite(value) ? value : 0);
  let max = 0;
  for (let index = 0; index < window.size; index += 1) {
    const sample = window.values[index] ?? 0;
    if (sample > max) max = sample;
  }
  return max;
}

export function createLongtaskWindow(capacity: number): LongtaskWindow {
  return {
    counts: createRingBuffer(capacity),
    maxDurations: createRingBuffer(capacity),
  };
}

export function pushLongtaskWindow(window: LongtaskWindow, count: number, maxDurationMs: number): { count: number; maxDurationMs: number } {
  pushRingBuffer(window.counts, Math.max(0, Math.floor(Number.isFinite(count) ? count : 0)));
  pushRingBuffer(window.maxDurations, Math.max(0, Number.isFinite(maxDurationMs) ? maxDurationMs : 0));
  const size = window.counts.size;
  let totalCount = 0;
  let maxMs = 0;
  for (let index = 0; index < size; index += 1) {
    totalCount += window.counts.values[index] ?? 0;
    const duration = window.maxDurations.values[index] ?? 0;
    if (duration > maxMs) maxMs = duration;
  }
  return { count: totalCount, maxDurationMs: maxMs };
}

function percentile(sortedValues: number[], percentileValue: number, count = sortedValues.length): number {
  if (count === 0) return 0;
  const index = Math.min(count - 1, Math.max(0, Math.floor((count - 1) * percentileValue)));
  return sortedValues[index] ?? 0;
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
