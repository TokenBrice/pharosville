import type { HarbourLayout } from "../layout/types";
import type { HarbourModel } from "../model/types";
import seedsUrl from "../data/sim-seeds.json?url";
import { buildSimLayout, type SimLayout } from "./layout-graph";
import type { CoastGrid } from "./obstacles";
import { outingSeed, seedOutings } from "./outings";
import { buildPlan, legTimes, seedLegTimes } from "./plan";
import { buildPlanLegPath, pathBuffers, pathKey, planPathRequests, type PreparedPlan, type PathRequest } from "./plan-paths";
import { matchingSeeds, type SimSeeds } from "./seeds";

type Msg =
  | { type: "warm"; layout: HarbourLayout; coast: CoastGrid | null }
  | { type: "prepare"; id: number; model: HarbourModel; nowMs: number; knownPlainPaths: string[] }
  | { type: "paths"; id: number; planRevision: number; layoutKey: string; legs: PathRequest[] };
const scope = self as unknown as { onmessage: ((e: MessageEvent<Msg>) => void) | null; postMessage(m: unknown, transfer?: Transferable[]): void };
const fetchingSeeds = fetch(seedsUrl);
// Own early rejection while coast/layout are still loading; the warm job reports the failure.
void fetchingSeeds.catch(() => {});
let L: SimLayout | null = null, base = 0;
let layoutKey = "";
let queue = Promise.resolve();
scope.onmessage = ({ data: m }) => {
  // Initialization hashes asynchronously; preserve message order through it and every later job.
  queue = queue.then(async () => {
    if (m.type === "warm") {
      L = buildSimLayout(m.layout, m.coast);
      base = L.slots.length;
      const response = await fetchingSeeds;
      if (!response.ok) throw new Error(`Simulation seeds HTTP ${response.status}`);
      const seeds = await response.json() as SimSeeds;
      if (await matchingSeeds(seeds, m.layout, m.coast)) {
        seedLegTimes(L, seeds.legs); seedOutings(L, seeds.outings);
        scope.postMessage({ legs: seeds.legs, outings: seeds.outings });
      } else {
        // Authored dev variants compute exact answers here, never in a frame. Production skew
        // remains visible, but also stays exact (e.g. coast decoding unavailable on this device).
        console.warn("[harbour] simulation seed mismatch; preparing exact layout answers in worker");
        const legs = legTimes(L), outings = outingSeed(L);
        outings.lanes = null;
        scope.postMessage({ legs, outings });
      }
      return;
    }
    if (!L) throw new Error("Simulation worker has no layout");
    if (m.type === "paths") {
      const paths: PreparedPlan["paths"] = [];
      if (layoutKey === m.layoutKey) for (const request of m.legs) {
        const { path, bad } = buildPlanLegPath(L, base, ...request);
        paths.push([pathKey(...request), path, bad]);
      }
      scope.postMessage({ id: m.id, planRevision: m.planRevision, layoutKey: m.layoutKey, paths }, [...pathBuffers(paths)] as Transferable[]);
      return;
    }
    L.slots.length = base;
    layoutKey = m.model.planKey;
    // Allocate directly: playback, separation and one-off voyages belong only to the main sim.
    const plan = buildPlan(m.model, L);
    const known = new Set(m.knownPlainPaths);
    const sailing = plan.boats.filter((_, i) => m.model.boats[i].state !== "shoals" && m.model.boats[i].state !== "wrecked");
    const requests = planPathRequests(sailing, m.nowMs, (key) => known.has(key));
    const prepared: PreparedPlan = {
      plan: { key: plan.key, boats: plan.boats, stats: plan.stats },
      rafts: L.slots.slice(base),
      paths: [],
    };
    for (const request of [...requests.now, ...requests.soon]) {
      const key = pathKey(...request);
      const { path, bad } = buildPlanLegPath(L, base, ...request);
      // One unsafe leg must never fail the whole fleet: the flag travels with the path and the main
      // sim handles it per boat (badOuting / route-unavailable hold), as before S16-I6.
      prepared.paths.push([key, path, bad]);
    }
    const buffers = pathBuffers(prepared.paths);
    for (const b of prepared.plan.boats) for (const a of [b.segStart, b.segEnd, b.segKind, b.segSlot, b.segFrom, b.segLoop]) buffers.add(a.buffer);
    scope.postMessage({ id: m.id, prepared }, [...buffers] as Transferable[]);
  }).catch((error: unknown) => {
    scope.postMessage({ error: error instanceof Error ? error.message : String(error) });
  });
};
