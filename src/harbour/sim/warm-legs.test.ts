import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HarbourLayout } from "../layout/types";
import type { HarbourModel } from "../model/types";
import type { CoastGrid } from "./obstacles";
import { warmLegsOffThread } from "./warm-legs";

class WorkerDouble {
  static created: WorkerDouble[] = [];
  static fail = false;
  onmessage: ((event: { data: Record<string, unknown> }) => void) | null = null;
  onerror: ((event: { message: string; preventDefault(): void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor(readonly url: URL, readonly options: WorkerOptions) {
    if (WorkerDouble.fail) throw new Error("worker construction refused");
    WorkerDouble.created.push(this);
  }
}
beforeEach(() => { vi.useFakeTimers(); WorkerDouble.created = []; WorkerDouble.fail = false; vi.stubGlobal("Worker", WorkerDouble); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const layout = { piers: [] } as unknown as HarbourLayout;
const model = { planKey: "fleet" } as HarbourModel;

describe("persistent worker ownership and cancellation", () => {
  it("uses one same-origin module URL and does not transfer the live coast", async () => {
    const coast: CoastGrid = { data: new Uint8Array([1, 2, 3, 4]), size: 2, bounds: [0, 0, 2, 2] };
    const warm = warmLegsOffThread(layout, Promise.resolve(coast), vi.fn(), vi.fn());
    const worker = WorkerDouble.created[0];
    await Promise.resolve();
    expect(WorkerDouble.created).toHaveLength(1);
    expect(worker.url.protocol).not.toBe("blob:");
    expect(worker.url.pathname).toContain("warm-legs.worker.ts");
    expect(worker.options).toEqual({ type: "module" });
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "warm", layout, coast });
    expect(coast.data.byteLength).toBe(4);
    worker.onmessage!({ data: { legs: [], outings: {} } }); await warm.done; warm.stop();
  });

  it("rejects readiness on construction failure rather than authorizing a main-thread fallback", async () => {
    WorkerDouble.fail = true;
    const warm = warmLegsOffThread(layout, Promise.resolve(null), vi.fn(), vi.fn());
    await expect(warm.done).rejects.toThrow("construction refused");
    await expect(warm.prepare(model, 0, [])).rejects.toThrow("construction refused");
  });

  it("settles readiness when disposed before warmup", async () => {
    const warm = warmLegsOffThread(layout, Promise.resolve(null), vi.fn(), vi.fn());
    warm.stop(); await expect(warm.done).rejects.toThrow("cancelled");
    expect(WorkerDouble.created[0].terminate).toHaveBeenCalledOnce();
  });

  it("settles every pending preparation on disposal and ignores late replies", async () => {
    const share = vi.fn(), warm = warmLegsOffThread(layout, Promise.resolve(null), share, vi.fn());
    const worker = WorkerDouble.created[0];
    worker.onmessage!({ data: { legs: [], outings: {} } }); await warm.done;
    const a = warm.prepare(model, 0, []), b = warm.prepare(model, 1, []);
    await Promise.resolve(); warm.stop();
    await expect(a).rejects.toThrow("cancelled"); await expect(b).rejects.toThrow("cancelled");
    worker.onmessage!({ data: { legs: [], outings: {} } });
    expect(share).toHaveBeenCalledOnce(); expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("correlates out-of-order replies by job ID and keeps the worker for later plans", async () => {
    const warm = warmLegsOffThread(layout, Promise.resolve(null), vi.fn(), vi.fn());
    const worker = WorkerDouble.created[0];
    worker.onmessage!({ data: { legs: [], outings: {} } }); await warm.done;
    const a = warm.prepare(model, 0, []), b = warm.prepare(model, 1, ["0>1>medium"]);
    await Promise.resolve();
    const first = { plan: { key: "first" } }, second = { plan: { key: "second" } };
    worker.onmessage!({ data: { id: 2, prepared: second } });
    worker.onmessage!({ data: { id: 1, prepared: first } });
    expect(await a).toBe(first); expect(await b).toBe(second);
    expect(worker.terminate).not.toHaveBeenCalled(); warm.stop();
  });

  it("terminates silent warmup at 30 seconds, settles waiters, and ignores late replies", async () => {
    const share = vi.fn(), onError = vi.fn();
    const warm = warmLegsOffThread(layout, new Promise(() => {}), share, vi.fn(), onError);
    const rejected = expect(warm.done).rejects.toMatchObject({ reason: "timeout" });
    await vi.advanceTimersByTimeAsync(29_999); expect(onError).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await rejected;
    const worker = WorkerDouble.created[0];
    worker.onmessage!({ data: { legs: [], outings: {} } });
    expect(share).not.toHaveBeenCalled(); expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("gives preparation an independent deadline and rejects every pending job on timeout", async () => {
    const warm = warmLegsOffThread(layout, Promise.resolve(null), vi.fn(), vi.fn(), vi.fn());
    const worker = WorkerDouble.created[0];
    await vi.advanceTimersByTimeAsync(29_000);
    worker.onmessage!({ data: { legs: [], outings: {} } }); await warm.done;
    const a = warm.prepare(model, 0, []), b = warm.prepare(model, 1, []);
    const rejected = Promise.all([expect(a).rejects.toMatchObject({ reason: "timeout" }), expect(b).rejects.toMatchObject({ reason: "timeout" })]);
    await vi.advanceTimersByTimeAsync(29_999); expect(worker.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await rejected;
    worker.onmessage!({ data: { id: 1, prepared: {} } });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it.each(["error", "messageerror"])("settles pending work on worker %s", async (kind) => {
    const warm = warmLegsOffThread(layout, Promise.resolve(null), vi.fn(), vi.fn());
    const worker = WorkerDouble.created[0];
    worker.onmessage!({ data: { legs: [], outings: {} } }); await warm.done;
    const job = warm.prepare(model, 0, []); await Promise.resolve();
    if (kind === "error") worker.onerror!({ message: "worker failed", preventDefault() {} });
    else worker.onmessageerror!();
    await expect(job).rejects.toThrow();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});

describe("later transferable path jobs", () => {
  it("correlates path revisions independently of preparation and cancels pending refill on worker loss", async () => {
    const warm = warmLegsOffThread(layout, Promise.resolve(null), vi.fn(), vi.fn(), vi.fn());
    const worker = WorkerDouble.created[0];
    worker.onmessage!({ data: { legs: [], outings: {} } }); await warm.done;
    const a = warm.paths(1, "old", [[0, 1, "medium", 0, 13, 4]]);
    const b = warm.paths(2, "new", [[1, 2, "large", 0, 18, 6]]);
    await Promise.resolve();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "paths", id: 1, planRevision: 1, layoutKey: "old", legs: [[0, 1, "medium", 0, 13, 4]] });
    worker.onmessage!({ data: { id: 2, planRevision: 2, layoutKey: "new", paths: [] } });
    expect(await b).toEqual({ planRevision: 2, layoutKey: "new", paths: [] });
    const rejected = expect(a).rejects.toThrow("could not be decoded");
    worker.onmessageerror!(); await rejected;
    await expect(warm.paths(3, "new", [])).rejects.toThrow("could not be decoded");
  });
});
