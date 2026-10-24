import type { HarbourLayout } from "../layout/types";
import type { CoastGrid } from "./obstacles";
import type { OutingSeed } from "./outings";
import type { RepLeg } from "./plan";

/** Bump when geometry/timing/outing semantics change, then run build-sim-seeds.mjs. 2: Living Harbour points of sail (07-M1). */
export const SIM_SEED_VERSION = 2;
export interface SimSeeds {
  version: number;
  key: string;
  algorithms: string;
  /** Transitive generator source inputs; parity tests reject a stale generated asset. */
  sources: string[];
  legs: Array<[string, RepLeg]>;
  outings: OutingSeed;
}

/** Computed once in the planning worker, never in a frame or on the main thread. */
export async function simSeedKey(layout: HarbourLayout, coast: CoastGrid | null): Promise<string> {
  const digest = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>)), (b) => b.toString(16).padStart(2, "0")).join("");
  const coastKey = coast ? await digest(coast.data) : null;
  return digest(new TextEncoder().encode(JSON.stringify([SIM_SEED_VERSION, layout, coast && [coast.size, coast.bounds, coastKey]])));
}

export async function matchingSeeds(seed: SimSeeds, layout: HarbourLayout, coast: CoastGrid | null): Promise<boolean> {
  return seed.version === SIM_SEED_VERSION && seed.key === await simSeedKey(layout, coast);
}
