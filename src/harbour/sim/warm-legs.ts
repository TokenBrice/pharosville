import type { HarbourLayout } from "../layout/types";
import type { HarbourModel } from "../model/types";
import type { CoastGrid } from "./obstacles";
import type { OutingSeed } from "./outings";
import type { RepLeg } from "./plan";
import type { PreparedPlan } from "./plan-paths";

export interface WarmLegs {
  done: Promise<void>;
  prepare(model: HarbourModel, nowMs: number, knownPlainPaths: string[]): Promise<PreparedPlan>;
  stop(): void;
}

/** One persistent, same-origin module worker owns all allocation and initial path generation.
 * Failures reject every waiter; DataSystem exposes honest boatless arrival if no plan installed.
 * No failure authorizes animation-frame fallback computation.
 * The live coast is cloned ONCE by postMessage, never transferred/detached from ocean or sim.
 */
export function warmLegsOffThread(layout: HarbourLayout, coast: Promise<CoastGrid | null>, onShare: (entries: Array<[string, RepLeg]>) => void, onOutings: (seed: OutingSeed) => void, onError: (error: Error) => void = (error) => console.warn("[harbour] simulation worker unavailable", error)): WarmLegs {
  let worker: Worker | null = null, failure: Error | null = null, serial = 0;
  let ready!: () => void, rejectReady!: (error: Error) => void;
  const done = new Promise<void>((resolve, reject) => { ready = resolve; rejectReady = reject; });
  const pending = new Map<number, { resolve(value: PreparedPlan): void; reject(error: Error): void }>();
  const fail = (error: Error, notify = true) => {
    if (failure) return;
    failure = error;
    worker?.terminate(); worker = null;
    rejectReady(error);
    for (const p of pending.values()) p.reject(error);
    pending.clear();
    if (notify) onError(error);
  };
  try {
    worker = new Worker(new URL("./warm-legs.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ id?: number; error?: string; legs?: Array<[string, RepLeg]>; outings?: OutingSeed; prepared?: PreparedPlan }>) => {
      if (failure) return;
      const m = event.data;
      if (m.error) { fail(new Error(m.error)); return; }
      if (m.legs && m.outings) { onShare(m.legs); onOutings(m.outings); ready(); return; }
      if (m.id != null && m.prepared) { pending.get(m.id)?.resolve(m.prepared); pending.delete(m.id); }
    };
    worker.onerror = (event) => { event.preventDefault(); fail(new Error(event.message || "Simulation worker failed")); };
    worker.onmessageerror = () => fail(new Error("Simulation worker response could not be decoded"));
  } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
  void coast.then((value) => {
    if (!worker) return;
    try { worker.postMessage({ type: "warm", layout, coast: value }); }
    catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
  }, (error: unknown) => fail(error instanceof Error ? error : new Error(String(error))));
  return {
    done,
    async prepare(model, nowMs, knownPlainPaths) {
      await done;
      if (failure || !worker) throw failure ?? new Error("Simulation worker stopped");
      const id = ++serial;
      return new Promise<PreparedPlan>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        try { worker!.postMessage({ type: "prepare", id, model, nowMs, knownPlainPaths }); }
        catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
      });
    },
    stop() { fail(new Error("Simulation preparation cancelled"), false); },
  };
}
