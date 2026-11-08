import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureMotionService, MotionClock } from "./services";
import type { EngineContext } from "../engine/types";

afterEach(() => vi.unstubAllGlobals());

describe("engine-owned motion listener", () => {
  it("unsubscribes on abort and cannot be recreated by a late deferred initializer", () => {
    const addEventListener = vi.fn(), removeEventListener = vi.fn();
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener, removeEventListener }));
    vi.stubGlobal("location", { search: "" });
    const lifetime = new AbortController();
    const ctx = { services: new Map(), signal: lifetime.signal } as unknown as EngineContext;
    const motion = ensureMotionService(ctx);
    expect(ensureMotionService(ctx)).toBe(motion);
    expect(addEventListener).toHaveBeenCalledTimes(1);
    lifetime.abort();
    expect(removeEventListener).toHaveBeenCalledWith("change", addEventListener.mock.calls[0][1]);
    ctx.services.clear();
    expect(() => ensureMotionService(ctx)).toThrow("Engine disposed");
    motion.dispose();
    expect(addEventListener).toHaveBeenCalledTimes(1);
  });
});

it("combines the visitor choice with OS reduction, with no full-motion override or persistence", () => {
  let change!: (e: { matches: boolean }) => void;
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: (_: string, fn: typeof change) => { change = fn; }, removeEventListener() {} }));
  vi.stubGlobal("location", { search: "?motion=full" });
  const motion = ensureMotionService({ services: new Map() } as unknown as EngineContext);
  expect(motion.reduced).toBe(true);
  motion.setStill(true); motion.setStill(false); expect(motion.reduced).toBe(true);
  change({ matches: false }); expect(motion.reduced).toBe(false);
  motion.setStill(true); change({ matches: false }); expect(motion.reduced).toBe(true);
  motion.dispose();
});

it("holds decorative clocks after settling, then resumes without catching up to wall time", () => {
  vi.stubGlobal("location", { search: "" });
  const motion = ensureMotionService({ services: new Map() } as unknown as EngineContext), clock = new MotionClock(motion);
  clock.step(1); motion.setStill(true);
  for (let i = 0; i < 600; i++) clock.step(1 / 60);
  const held = clock.time;
  for (let i = 0; i < 600; i++) clock.step(1 / 60);
  expect(clock.time).toBe(held);
  motion.setStill(false); clock.step(1 / 60);
  expect(clock.time).toBeGreaterThan(held);
  expect(clock.time - held).toBeLessThan(1 / 60);
  motion.dispose();
});
