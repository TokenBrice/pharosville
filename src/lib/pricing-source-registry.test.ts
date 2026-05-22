import { describe, expect, it } from "vitest";
import {
  PRICING_SOURCE_REGISTRY,
  assertUniqueRegistryKeys,
  buildRegistryMapByKey,
} from "@shared/lib/pricing-source-registry";
import { PRICE_SOURCE_HEALTH_BUCKET_KEYS } from "@shared/lib/pricing-sources";

describe("pricing registries", () => {
  it("guards pricing source registry duplicate keys", () => {
    expect(() => assertUniqueRegistryKeys(PRICING_SOURCE_REGISTRY, "pricing source registry")).not.toThrow();
    expect(() => buildRegistryMapByKey([
      { key: "duplicate", value: 1 },
      { key: "duplicate", value: 2 },
    ], "test registry")).toThrow(/duplicate/);
  });

  it("keeps health bucket keys unique", () => {
    expect(new Set(PRICE_SOURCE_HEALTH_BUCKET_KEYS).size).toBe(PRICE_SOURCE_HEALTH_BUCKET_KEYS.length);
  });
});
