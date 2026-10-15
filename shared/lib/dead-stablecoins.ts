import type { DeadStablecoin } from "../types";
import deadStablecoinAsset from "../data/dead-stablecoins.json";

export { CAUSE_HEX, CAUSE_META } from "./cause-of-death";

/** Validated against shared/'s strict schema by dead-stablecoins.test.ts (and at sync time), not at runtime: zod stays out of the bundle. */
export const DEAD_STABLECOINS = deadStablecoinAsset as DeadStablecoin[];
