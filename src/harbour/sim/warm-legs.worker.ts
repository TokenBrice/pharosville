import type { HarbourLayout } from "../layout/types";
import { buildSimLayout, type SimLayout, type Slot } from "./layout-graph";
import type { CoastGrid } from "./obstacles";
import { outingSeed } from "./outings";
import type { PathRec } from "./path";
import { legTimes } from "./plan";
import { buildPlanLegPath, pathKey, type PathRequest } from "./sim";

/**
 * Boot work off the main thread (sim/warm-legs), on this worker's own copy of the sim layout:
 * 1. `warm`: the first worker lays out the outing answers and posts them; the others each build a share of
 *    the representative leg times, post it, then lay the outing answers out for themselves (for step 2);
 * 2. `paths`: once the plan exists, its rafts and this worker's share of the plan legs it needs now, then
 *    of those it needs soon (posted separately), their sample arrays transferred.
 */
type Msg =
  | { type: "warm"; layout: HarbourLayout; coast: CoastGrid | null; w: number; n: number }
  | { type: "paths"; rafts: Slot[]; now: PathRequest[]; soon: PathRequest[] };

const scope = self as unknown as { onmessage: ((e: MessageEvent<Msg>) => void) | null; postMessage(m: unknown, transfer?: Transferable[]): void };
let L: SimLayout | null = null, base = 0;

function buffersOf(p: PathRec, out: Set<ArrayBufferLike>): void {
  for (const a of [p.pts, p.hdg, p.vrel, p.q, p.sOfQ, p.w0, p.w1, p.rev?.pts, p.rev?.hdg]) if (a) out.add(a.buffer);
}

scope.onmessage = (e) => {
  const m = e.data;
  if (m.type === "warm") {
    L = buildSimLayout(m.layout, m.coast);
    base = L.slots.length;
    // (a lone worker does both: the legs first)
    const legsBy = m.n > 1 ? m.w > 0 : true;
    if (legsBy) scope.postMessage({ legs: legTimes(L, m.n > 1 ? m.w - 1 : 0, Math.max(1, m.n - 1)) });
    const outings = outingSeed(L);
    if (m.w === 0) scope.postMessage({ outings });
    return;
  }
  if (!L) return;
  L.slots.length = base;
  L.slots.push(...m.rafts);
  for (const batch of [m.now, m.soon]) {
    const paths: Array<[string, PathRec, boolean]> = [], buffers = new Set<ArrayBufferLike>();
    for (const [from, to, cls, loop] of batch) {
      const { path, bad } = buildPlanLegPath(L, base, from, to, cls, loop);
      paths.push([pathKey(from, to, cls, loop), path, bad]);
      buffersOf(path, buffers);
    }
    scope.postMessage({ paths }, [...buffers] as Transferable[]);
  }
};
