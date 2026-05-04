import { vi } from "vitest";

/**
 * One canvas-side effect: a method invocation with its argument list.
 * Captured in chronological order so tests can assert ordering between
 * primitives (e.g. flagship paints before consorts).
 */
export interface RecordedCanvasCall {
  method: string;
  args: readonly unknown[];
}

/**
 * Recording stub for `CanvasRenderingContext2D` returned by
 * {@link buildRecordingCanvasContext}. The same object is castable to
 * `CanvasRenderingContext2D` (via the `ctx` field) and exposes the recorded
 * call log plus assertion helpers.
 */
export interface RecordingCanvasStub {
  ctx: CanvasRenderingContext2D;
  /** All recorded method calls in the order they were issued. */
  calls: readonly RecordedCanvasCall[];
  /** Property assignments captured by the proxy (e.g. `fillStyle`, `lineWidth`). */
  setStyles: Readonly<Record<string, unknown>>;
  /** Returns the args of every recorded call to `method`, in order. */
  callsTo: (method: string) => readonly (readonly unknown[])[];
  /** True iff `method` was called at least once with a deep-equal argument list. */
  wasCalledWith: (method: string, ...args: readonly unknown[]) => boolean;
  /** Clears recorded calls and captured property assignments. */
  reset: () => void;
}

/**
 * Default set of canvas methods recorded when callers do not supply their own
 * list. Intentionally minimal — covers the primitives every layer test we have
 * touches today (paths, fills, strokes, transforms, sprite blits, text).
 */
export const DEFAULT_RECORDED_METHODS = [
  "save",
  "restore",
  "beginPath",
  "closePath",
  "moveTo",
  "lineTo",
  "rect",
  "arc",
  "ellipse",
  "quadraticCurveTo",
  "bezierCurveTo",
  "fill",
  "stroke",
  "fillRect",
  "strokeRect",
  "clearRect",
  "setLineDash",
  "translate",
  "rotate",
  "scale",
  "drawImage",
  "fillText",
  "strokeText",
  "clip",
] as const;

interface BuildOptions {
  /** Methods to record. Defaults to {@link DEFAULT_RECORDED_METHODS}. */
  methods?: readonly string[];
  /** Initial values for canvas properties (e.g. `{ fillStyle: "" }`). */
  initialValues?: Readonly<Record<string, unknown>>;
  /**
   * Methods that must return a value (e.g. `createLinearGradient` returning a
   * gradient stub). Override entries take precedence over `methods`.
   */
  returningMethods?: Readonly<Record<string, () => unknown>>;
}

/**
 * Builds a `CanvasRenderingContext2D` stub that records every method call in
 * order and tracks property assignments via a Proxy. Use when test assertions
 * need *call order* or *call counts per method* — for plain spy-only mocking
 * (no order, just `.toHaveBeenCalled()`), prefer the simpler
 * `createCanvasContextStub` in `draw-input.ts`.
 */
export function buildRecordingCanvasContext(
  options: BuildOptions = {},
): RecordingCanvasStub {
  const methods = options.methods ?? DEFAULT_RECORDED_METHODS;
  const initialValues = options.initialValues ?? {};
  const returningMethods = options.returningMethods ?? {};

  const calls: RecordedCanvasCall[] = [];
  const setStyles: Record<string, unknown> = {};

  const target: Record<string, unknown> = { ...initialValues };
  for (const method of methods) {
    target[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return undefined;
    };
  }
  for (const [method, factory] of Object.entries(returningMethods)) {
    target[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return factory();
    };
  }

  const proxy = new Proxy(target, {
    get(rawTarget, prop) {
      return rawTarget[prop as string];
    },
    set(rawTarget, prop, value) {
      const key = prop as string;
      setStyles[key] = value;
      rawTarget[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;

  return {
    ctx: proxy,
    get calls() {
      return calls;
    },
    get setStyles() {
      return setStyles;
    },
    callsTo(method) {
      return calls.filter((entry) => entry.method === method).map((entry) => entry.args);
    },
    wasCalledWith(method, ...expected) {
      return calls.some((entry) => {
        if (entry.method !== method) return false;
        if (entry.args.length !== expected.length) return false;
        for (let i = 0; i < expected.length; i += 1) {
          if (!Object.is(entry.args[i], expected[i])) return false;
        }
        return true;
      });
    },
    reset() {
      calls.length = 0;
      for (const key of Object.keys(setStyles)) delete setStyles[key];
    },
  };
}

/**
 * Convenience factory for the common gradient stub used by lighthouse / sky /
 * water layers — every gradient just needs an `addColorStop` spy.
 */
export function createGradientStub(): { addColorStop: ReturnType<typeof vi.fn> } {
  return { addColorStop: vi.fn() };
}
