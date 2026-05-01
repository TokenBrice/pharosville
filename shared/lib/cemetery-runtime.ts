import type { DeadStablecoin, StablecoinMeta } from "../types";
import deadStablecoinAsset from "../data/dead-stablecoins.json";
import { RUNTIME_FROZEN_STABLECOINS } from "./stablecoins/runtime-registry";

export type CemeteryEntry = DeadStablecoin & { archivedDataAvailable?: boolean };

function frozenToDeadShape(coin: StablecoinMeta): CemeteryEntry {
  if (!coin.obituary) {
    throw new Error(`Frozen coin ${coin.id} is missing obituary block`);
  }
  return {
    id: coin.id,
    name: coin.name,
    symbol: coin.symbol,
    logo: `${coin.symbol.toLowerCase()}.png`,
    pegCurrency: coin.flags.pegCurrency,
    causeOfDeath: coin.obituary.causeOfDeath,
    deathDate: coin.obituary.deathDate,
    epitaph: coin.obituary.epitaph,
    obituary: coin.obituary.obituary,
    peakMcap: coin.obituary.peakMcap,
    sourceUrl: coin.obituary.sourceUrl,
    sourceLabel: coin.obituary.sourceLabel,
    contracts: coin.contracts,
    archivedDataAvailable: true,
  };
}

function buildRuntimeCemetery(): CemeteryEntry[] {
  const seenIds = new Set<string>();
  const merged: CemeteryEntry[] = [];
  for (const dead of deadStablecoinAsset as DeadStablecoin[]) {
    if (seenIds.has(dead.id)) {
      throw new Error(`Cemetery id collision: ${dead.id} appears twice in dead-stablecoins.json`);
    }
    seenIds.add(dead.id);
    merged.push(dead);
  }
  for (const frozen of RUNTIME_FROZEN_STABLECOINS) {
    if (seenIds.has(frozen.id)) {
      throw new Error(`Cemetery id collision: ${frozen.id} is in both dead-stablecoins.json and frozen stablecoins`);
    }
    seenIds.add(frozen.id);
    merged.push(frozenToDeadShape(frozen));
  }
  return merged;
}

export const RUNTIME_CEMETERY_ENTRIES: CemeteryEntry[] = buildRuntimeCemetery();
