import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureMotionService } from "./services";
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
