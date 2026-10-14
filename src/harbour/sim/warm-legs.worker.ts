import type { HarbourLayout } from "../layout/types";
import { buildSimLayout } from "./layout-graph";
import type { CoastGrid } from "./obstacles";
import { legTimes } from "./plan";

/** One share of the representative leg times, on this worker's own copy of the sim layout (sim/warm-legs). */
const scope = self as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage(m: unknown): void };
scope.onmessage = (e: MessageEvent<{ layout: HarbourLayout; coast: CoastGrid | null; w: number; n: number }>) => {
  const { layout, coast, w, n } = e.data;
  scope.postMessage(legTimes(buildSimLayout(layout, coast), w, n));
};
