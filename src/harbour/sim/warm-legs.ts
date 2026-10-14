import type { HarbourLayout } from "../layout/types";
import type { CoastGrid } from "./obstacles";
import type { RepLeg } from "./plan";

/**
 * Boot: the representative leg times (≈0.7 s of path building, the same for every viewer) are built by a
 * few workers in parallel while the main thread loads the rest of the world, instead of in the
 * HarbourSim constructor. `onShare` receives each worker's share as it lands. No Worker (tests), or a
 * worker that fails: nothing is seeded and the plan builds those legs itself when it needs them.
 */
export function warmLegsOffThread(layout: HarbourLayout, coast: CoastGrid | null, onShare: (entries: Array<[string, RepLeg]>) => void): () => void {
  if (typeof Worker === "undefined") return () => {};
  const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  const workers: Worker[] = [];
  const stop = () => { for (const wk of workers.splice(0)) wk.terminate(); };
  try {
    for (let w = 0; w < n; w++) {
      const wk = new Worker(new URL("./warm-legs.worker.ts", import.meta.url), { type: "module" });
      workers.push(wk);
      const done = () => { wk.terminate(); const i = workers.indexOf(wk); if (i >= 0) workers.splice(i, 1); };
      wk.onmessage = (e: MessageEvent<Array<[string, RepLeg]>>) => { done(); onShare(e.data); };
      wk.onerror = (e) => { e.preventDefault(); done(); };
      wk.postMessage({ layout, coast, w, n });
    }
  } catch {
    stop();
  }
  return stop;
}
