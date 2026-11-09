import { afterEach, describe, expect, it, vi } from "vitest";
import { PreparationQueue } from "./preparation-queue";

/** A real-time frame clock: each rAF callback runs as its own macrotask, like a browser frame. */
function frames() {
  let inFrame = false, ran = 0;
  const pending = new Map<number, ReturnType<typeof setTimeout>>();
  let next = 1;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = next++;
    pending.set(id, setTimeout(() => { pending.delete(id); inFrame = true; try { cb(performance.now()); } finally { inFrame = false; ran++; } }, 1));
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { clearTimeout(pending.get(id)); pending.delete(id); });
  return { get inFrame() { return inFrame; }, get ran() { return ran; } };
}
const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => vi.unstubAllGlobals());

describe("post-frame preparation drain", () => {
  it("marks the frame in its callback but runs the bounded work in a task of its own, once per frame", async () => {
    const clock = frames(), queue = new PreparationQueue(), seen: boolean[] = [];
    const jobs = Array.from({ length: 3 }, () => queue.submit(() => { seen.push(clock.inFrame); }, { nextFrame: true }));
    await Promise.all(jobs);
    expect(seen).toEqual([false, false, false]);
    expect(clock.ran).toBeGreaterThan(0);
    queue.dispose();
  });

  it("drops a drain already posted when its work is cancelled, and closes its channel on dispose", async () => {
    frames();
    const queue = new PreparationQueue(), controller = new AbortController(), work = vi.fn();
    const cancelled = queue.submit(work, { signal: controller.signal });
    const rejection = expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejection;
    await settle();
    expect(work).not.toHaveBeenCalled();
    const later = queue.submit(() => "ran");
    await expect(later).resolves.toBe("ran");
    queue.dispose();
    await expect(queue.submit(() => {})).rejects.toMatchObject({ name: "AbortError" });
  });

  it("ends a drain at an indivisible job that spends the allowance; the next waits for the next frame", async () => {
    frames();
    const queue = new PreparationQueue(), order: number[] = [];
    let cpu = 0;
    const now = performance.now.bind(performance);
    vi.spyOn(performance, "now").mockImplementation(() => now() + cpu);
    // each job costs the whole allowance: one per drain
    const jobs = [1, 2, 3].map((n) => queue.submit(() => { order.push(n); cpu += 3; }));
    await Promise.all(jobs);
    expect(order).toEqual([1, 2, 3]);
    expect(queue.stats.submitted).toBe(3);
    queue.dispose();
    vi.restoreAllMocks();
  });
});
