import type { DeadStablecoin } from "@shared/types/market";
import type { CauseFamily } from "./cemetery-classify";

/** Exact scenery/hover projection; full prose and citations belong to the deferred detail boundary. */
export type CemeteryScenery = Pick<DeadStablecoin, "id" | "name" | "symbol" | "pegCurrency" | "causeOfDeath" | "deathDate" | "peakMcap" | "epitaph" | "llamaId"> & {
  family: CauseFamily;
  born: string | null;
};
