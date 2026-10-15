import type { HarbourLayout } from "../layout/types";
import type { Slot } from "./layout-graph";
import type { CoastGrid } from "./obstacles";
import type { OutingSeed } from "./outings";
import type { PathRec } from "./path";
import type { RepLeg } from "./plan";
import type { PathRequest } from "./sim";

export interface WarmLegs {
  /** Settles once every worker's answer (a share of the leg times; worker 0: the outing answers) has landed or failed (at once without workers). */
  done: Promise<void>;
  /**
   * The plan legs, built by the same workers (round-robin shares): resolves once every worker has posted
   * its `now` share (or failed); `soon` shares arrive later. `onPaths` receives each share as it lands. The
   * workers end after their `soon` share. Without workers: resolves at once, nothing is built.
   */
  paths(rafts: Slot[], now: PathRequest[], soon: PathRequest[], onPaths: (entries: Array<[string, PathRec, boolean]>) => void): Promise<void>;
  stop(): void;
}

/**
 * Boot: the representative leg times (≈0.7 s of path building, the same for every viewer) and the
 * layout-only outing answers (gate loops, scenic and outing metres) are built by a few workers in
 * parallel while the main thread loads the rest of the world, instead of in the HarbourSim's first plan;
 * once that plan exists, the legs its first poses sail are built by them too. The workers start (load
 * their code) at once and set to work when `coast` resolves. `onShare` / `onOutings` receive the answers
 * as they land. No Worker (tests), or a worker that fails: nothing is seeded and the sim builds what it
 * needs itself when it needs it (the same values).
 */
export function warmLegsOffThread(layout: HarbourLayout, coast: Promise<CoastGrid | null>, onShare: (entries: Array<[string, RepLeg]>) => void, onOutings: (seed: OutingSeed) => void): WarmLegs {
  if (typeof Worker === "undefined") return { done: Promise.resolve(), paths: () => Promise.resolve(), stop: () => {} };
  // (worker 0 lays out the outing answers; the rest share the legs: a lone worker does both)
  const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  const workers: Worker[] = [];
  const stop = () => { for (const wk of workers.splice(0)) wk.terminate(); };
  const end = (wk: Worker) => { wk.terminate(); const i = workers.indexOf(wk); if (i >= 0) workers.splice(i, 1); };
  const warmed: Array<Promise<void>> = [];
  try {
    for (let w = 0; w < n; w++) {
      const wk = new Worker(new URL("./warm-legs.worker.ts", import.meta.url), { type: "module" });
      workers.push(wk);
      // worker 0's answer is the outing seed (and, alone, the legs first); the others' a share of the legs
      let left = n === 1 ? 2 : 1;
      warmed.push(new Promise<void>((settle) => {
        wk.onmessage = (e: MessageEvent<{ legs?: Array<[string, RepLeg]>; outings?: OutingSeed }>) => {
          if (e.data.legs) onShare(e.data.legs);
          if (e.data.outings) onOutings(e.data.outings);
          if (--left === 0) settle();
        };
        wk.onerror = (e) => { e.preventDefault(); end(wk); settle(); };
      }));
    }
  } catch {
    stop();
  }
  void coast.then((c) => { workers.forEach((wk, w) => wk.postMessage({ type: "warm", layout, coast: c, w, n })); }, stop);
  const done = Promise.all(warmed).then(() => {});
  const paths: WarmLegs["paths"] = (rafts, now, soon, onPaths) => Promise.all(workers.slice().map((wk, w, all) => new Promise<void>((settle) => {
    let first = true;
    wk.onmessage = (e: MessageEvent<{ paths: Array<[string, PathRec, boolean]> }>) => {
      onPaths(e.data.paths);
      if (first) { first = false; settle(); } else end(wk);
    };
    wk.onerror = (e) => { e.preventDefault(); end(wk); settle(); };
    const share = (list: PathRequest[]) => list.filter((_, k) => k % all.length === w);
    wk.postMessage({ type: "paths", rafts, now: share(now), soon: share(soon) });
  }))).then(() => {});
  return { done, paths, stop };
}
