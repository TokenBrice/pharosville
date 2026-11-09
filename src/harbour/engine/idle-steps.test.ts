import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_SLICE_MS, IDLE_TIMEOUT_MS, runIdleSteps } from "./idle-steps";

let cpu = 0;
beforeEach(() => {
  cpu = 0;
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis);
  vi.spyOn(performance, "now").mockImplementation(() => Date.now() + cpu);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

/** Each step costs `cost` ms of (mocked) CPU; records which task (timer turn) ran it. */
function* work(steps: number, cost: number, log: number[], turn: () => number): Generator<void, string> {
  for (let i = 0; i < steps; i++) { cpu += cost; log.push(turn()); yield; }
  return "done";
}

describe("idle slices", () => {
  it("bounds each task to one slice and finishes the work on a busy main thread", async () => {
    let turn = 0;
    const idle = vi.fn((cb: IdleRequestCallback, options?: IdleRequestOptions) => window.setTimeout(() => { turn++; cb({ didTimeout: true, timeRemaining: () => 0 }); }, options?.timeout));
    vi.stubGlobal("requestIdleCallback", idle);
    vi.stubGlobal("cancelIdleCallback", clearTimeout);
    const log: number[] = [];
    const result = runIdleSteps(work(40, 1, log, () => turn));
    await vi.advanceTimersByTimeAsync(40 * IDLE_TIMEOUT_MS);
    await expect(result).resolves.toBe("done");
    expect(idle.mock.calls[0][1]).toEqual({ timeout: IDLE_TIMEOUT_MS });
    const perTurn = new Map<number, number>();
    for (const t of log) perTurn.set(t, (perTurn.get(t) ?? 0) + 1);
    // 1 ms steps: a 5 ms slice runs five of them, then hands the thread back
    expect(Math.max(...perTurn.values())).toBe(IDLE_SLICE_MS);
    expect(perTurn.size).toBe(Math.ceil(40 / IDLE_SLICE_MS));
  });

  it("lends an idle period only what it has left, at least a millisecond", async () => {
    const budgets: number[] = [];
    vi.stubGlobal("requestIdleCallback", (cb: IdleRequestCallback) => window.setTimeout(() => {
      const start = cpu; cb({ didTimeout: false, timeRemaining: () => 2.5 }); budgets.push(cpu - start);
    }, 1));
    vi.stubGlobal("cancelIdleCallback", clearTimeout);
    const result = runIdleSteps(work(10, 1, [], () => 0));
    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toBe("done");
    expect(Math.max(...budgets)).toBe(3); // 2.5 ms left: the step that crosses it is the last
  });

  it("falls back to zero-delay timers, closes the work when aborted and rejects with the reason", async () => {
    vi.stubGlobal("requestIdleCallback", undefined);
    let closed = false;
    function* endless(): Generator<void, never> { try { for (;;) { cpu += 1; yield; } } finally { closed = true; } }
    const controller = new AbortController();
    const result = runIdleSteps(endless(), controller.signal);
    const rejection = expect(result).rejects.toBe("stop");
    await vi.advanceTimersByTimeAsync(5);
    controller.abort("stop");
    await rejection;
    expect(closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propagates a failure from the work", async () => {
    vi.stubGlobal("requestIdleCallback", undefined);
    function* failing(): Generator<void, void> { yield; throw new Error("bad grid"); }
    const result = runIdleSteps(failing());
    const rejection = expect(result).rejects.toThrow("bad grid");
    await vi.advanceTimersByTimeAsync(10);
    await rejection;
  });

  it("rejects at once for an already-aborted signal", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(runIdleSteps(work(1, 1, [], () => 0), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
