import type { Texture, WebGLRenderer } from "three";
import type { TextureUploadQueueMetrics } from "../renderer/render-types";

const IDLE_TIMEOUT_MS = 1_000;
const IDLE_TASK_BUDGET = 2;
const FRAME_TASK_BUDGET = 4;
const TASK_TIME_BUDGET_MS = 4;
const MIN_IDLE_TIME_MS = 1;

export interface TextureUploadRequest {
  /**
   * Stable identity for the pending work. Scheduling the same key again
   * replaces its callbacks, which lets a newer logo generation supersede one
   * that has not painted yet.
   */
  key: string;
  owner: object;
  ownerName: string;
  texture: Texture;
  /** Checked immediately before touching the texture or renderer. */
  isOwnerValid: () => boolean;
  /**
   * Optional deferred paint. Returning false completes the task without an
   * upload, for example when another task already painted this generation.
   */
  prepare?: () => boolean;
  /** Runs after every still-valid task for this owner has completed. */
  onOwnerDrained?: () => void;
}

export interface TextureUploadScheduler {
  cancelOwner(owner: object): void;
  dispose(): void;
  flushBetweenFrames(maxTasks?: number): void;
  metrics(): TextureUploadQueueMetrics;
  pause(): void;
  resume(): void;
  schedule(request: TextureUploadRequest): void;
}

interface PendingTextureUpload extends TextureUploadRequest {
  sequence: number;
}

interface TextureUploadSchedulerEnvironment {
  cancelIdleCallback?: (handle: number) => void;
  now: () => number;
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
}

function browserEnvironment(): TextureUploadSchedulerEnvironment {
  const host = typeof window === "undefined" ? null : window;
  const environment: TextureUploadSchedulerEnvironment = {
    now: () => performance.now(),
  };
  if (host?.cancelIdleCallback) {
    environment.cancelIdleCallback = host.cancelIdleCallback.bind(host);
  }
  if (host?.requestIdleCallback) {
    environment.requestIdleCallback = host.requestIdleCallback.bind(host);
  }
  return environment;
}

/**
 * Owns explicit texture uploads for one WebGL renderer.
 *
 * Idle callbacks do the normal work. The render loop also drains a small,
 * fixed number at its between-frame boundary so continuous animation or a
 * browser without requestIdleCallback cannot starve uploads until first draw.
 */
export function createTextureUploadScheduler(
  renderer: Pick<WebGLRenderer, "initTexture">,
  environment: TextureUploadSchedulerEnvironment = browserEnvironment(),
): TextureUploadScheduler {
  let disposed = false;
  let paused = false;
  let idleHandle: number | null = null;
  let nextSequence = 0;
  let queue: PendingTextureUpload[] = [];
  const pendingByKey = new Map<string, PendingTextureUpload>();
  const ownerDrainCallbacks = new Map<object, Map<string, () => void>>();
  const counters = {
    canceled: 0,
    completed: 0,
    failed: 0,
    frameFlushCount: 0,
    idleFlushCount: 0,
    maxPending: 0,
    uploaded: 0,
  };

  const ownerStillPending = (owner: object) => (
    queue.some((task) => task.owner === owner)
  );

  const finishOwnerIfDrained = (owner: object) => {
    if (ownerStillPending(owner)) return;
    const callbacks = ownerDrainCallbacks.get(owner);
    ownerDrainCallbacks.delete(owner);
    if (!callbacks) return;
    for (const callback of new Set(callbacks.values())) callback();
  };

  const execute = (task: PendingTextureUpload) => {
    pendingByKey.delete(task.key);
    if (!task.isOwnerValid()) {
      counters.canceled += 1;
      finishOwnerIfDrained(task.owner);
      return;
    }
    try {
      const shouldUpload = task.prepare?.() ?? true;
      if (shouldUpload) {
        renderer.initTexture(task.texture);
        counters.uploaded += 1;
      }
      counters.completed += 1;
    } catch {
      counters.failed += 1;
    }
    finishOwnerIfDrained(task.owner);
  };

  const drain = (
    maxTasks: number,
    canContinue: (processed: number, elapsedMs: number) => boolean,
  ) => {
    const startedAt = environment.now();
    let processed = 0;
    while (queue.length > 0 && processed < maxTasks) {
      const elapsedMs = environment.now() - startedAt;
      if (!canContinue(processed, elapsedMs)) break;
      const task = queue.shift()!;
      execute(task);
      processed += 1;
    }
  };

  const scheduleIdle = () => {
    if (
      disposed
      || paused
      || idleHandle !== null
      || queue.length === 0
      || !environment.requestIdleCallback
    ) return;
    idleHandle = environment.requestIdleCallback((deadline) => {
      idleHandle = null;
      counters.idleFlushCount += 1;
      drain(IDLE_TASK_BUDGET, (processed, elapsedMs) => (
        elapsedMs < TASK_TIME_BUDGET_MS
        && (deadline.didTimeout || processed === 0 || deadline.timeRemaining() >= MIN_IDLE_TIME_MS)
      ));
      scheduleIdle();
    }, { timeout: IDLE_TIMEOUT_MS });
  };

  return {
    cancelOwner(owner) {
      if (disposed) return;
      let canceled = 0;
      queue = queue.filter((task) => {
        if (task.owner !== owner) return true;
        pendingByKey.delete(task.key);
        canceled += 1;
        return false;
      });
      counters.canceled += canceled;
      ownerDrainCallbacks.delete(owner);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (idleHandle !== null) environment.cancelIdleCallback?.(idleHandle);
      idleHandle = null;
      counters.canceled += queue.length;
      queue = [];
      pendingByKey.clear();
      ownerDrainCallbacks.clear();
    },
    flushBetweenFrames(maxTasks = FRAME_TASK_BUDGET) {
      if (disposed || paused || queue.length === 0) return;
      counters.frameFlushCount += 1;
      drain(Math.max(0, maxTasks), (_processed, elapsedMs) => (
        elapsedMs < TASK_TIME_BUDGET_MS
      ));
      scheduleIdle();
    },
    metrics() {
      return {
        ...counters,
        pending: queue.length,
        pendingOwners: [...new Set(queue.map((task) => task.ownerName))].sort(),
      };
    },
    pause() {
      if (disposed || paused) return;
      paused = true;
      if (idleHandle !== null) environment.cancelIdleCallback?.(idleHandle);
      idleHandle = null;
    },
    resume() {
      if (disposed || !paused) return;
      paused = false;
      scheduleIdle();
    },
    schedule(request) {
      if (disposed) return;
      const previous = pendingByKey.get(request.key);
      if (previous) {
        const index = queue.indexOf(previous);
        const replacement = { ...request, sequence: previous.sequence };
        if (index >= 0) queue[index] = replacement;
        pendingByKey.set(request.key, replacement);
      } else {
        const pending = { ...request, sequence: nextSequence };
        nextSequence += 1;
        queue.push(pending);
        pendingByKey.set(request.key, pending);
      }
      if (request.onOwnerDrained) {
        let callbacks = ownerDrainCallbacks.get(request.owner);
        if (!callbacks) {
          callbacks = new Map();
          ownerDrainCallbacks.set(request.owner, callbacks);
        }
        callbacks.set(request.key, request.onOwnerDrained);
      }
      counters.maxPending = Math.max(counters.maxPending, queue.length);
      scheduleIdle();
    },
  };
}
