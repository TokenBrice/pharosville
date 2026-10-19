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
beforeEach(() => { WorkerDouble.created = []; WorkerDouble.fail = false; vi.stubGlobal("Worker", WorkerDouble); });
afterEach(() => vi.unstubAllGlobals());
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
