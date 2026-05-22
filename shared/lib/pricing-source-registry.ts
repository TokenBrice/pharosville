export type {
  PricingSourceCapabilities,
  PricingSourceFreshnessKind,
  PricingSourceRegistryEntry,
  PricingSourceTrustTier,
} from "./pricing-source-registry-types";

import type { PricingSourceRegistryEntry } from "./pricing-source-registry-types";
import { PRICING_SOURCE_REGISTRY_AGGREGATORS } from "./pricing-source-registry-aggregators";
import { PRICING_SOURCE_REGISTRY_DEX_SEARCH } from "./pricing-source-registry-dex-search";
import { PRICING_SOURCE_REGISTRY_MARKET_FEEDS } from "./pricing-source-registry-market-feeds";
import { PRICING_SOURCE_REGISTRY_SPECIAL } from "./pricing-source-registry-special";

export const PRICING_SOURCE_REGISTRY = [
  ...PRICING_SOURCE_REGISTRY_AGGREGATORS,
  ...PRICING_SOURCE_REGISTRY_MARKET_FEEDS,
  ...PRICING_SOURCE_REGISTRY_DEX_SEARCH,
  ...PRICING_SOURCE_REGISTRY_SPECIAL,
] as const satisfies readonly PricingSourceRegistryEntry[];

export type PricingSourceKey = (typeof PRICING_SOURCE_REGISTRY)[number]["key"];

export function assertUniqueRegistryKeys(
  entries: readonly { key: string }[],
  registryLabel: string,
): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.key)) {
      duplicates.add(entry.key);
      continue;
    }
    seen.add(entry.key);
  }
  if (duplicates.size > 0) {
    throw new Error(`${registryLabel} has duplicate keys: ${[...duplicates].sort().join(", ")}`);
  }
}

export function buildRegistryMapByKey<T extends { key: string }>(
  entries: readonly T[],
  registryLabel: string,
): Map<string, T> {
  assertUniqueRegistryKeys(entries, registryLabel);
  return new Map(entries.map((entry): [string, T] => [entry.key, entry]));
}

const REGISTRY_MAP = buildRegistryMapByKey(PRICING_SOURCE_REGISTRY, "pricing source registry");

export function getPricingSourceRegistryEntry(sourceKey: string): PricingSourceRegistryEntry | undefined {
  return REGISTRY_MAP.get(sourceKey);
}

export function isPricingSourceProtocolOverride(sourceKey: string | null | undefined): boolean {
  if (!sourceKey) return false;
  return getPricingSourceRegistryEntry(sourceKey)?.isProtocolOverride ?? false;
}

export function isPricingSourceSoftGuardrailExempt(sourceKey: string | null | undefined): boolean {
  if (!sourceKey) return false;
  return getPricingSourceRegistryEntry(sourceKey)?.bypassesSoftValidationGuardrails ?? false;
}
