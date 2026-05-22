import { describe, expect, it } from "vitest";
import { createLruCache, createStatsLruCache } from "./lru-cache";

describe("createLruCache", () => {
  it("touches entries on read and evicts the least recently used key", () => {
    const cache = createLruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);

    expect(cache.get("a")).toBe(1);
    cache.set("c", 3);

    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
    expect(cache.size).toBe(2);
  });
});

describe("createStatsLruCache", () => {
  it("tracks hits, misses, and evictions", () => {
    const cache = createStatsLruCache<string, string | null>(1);

    expect(cache.get("missing")).toBeUndefined();
    cache.set("a", null);
    expect(cache.get("a")).toBeNull();
    cache.set("b", "value");

    expect(cache.stats()).toEqual({
      capacity: 1,
      evictions: 1,
      hits: 1,
      misses: 1,
      size: 1,
    });
  });

  it("resets entries and counters together", () => {
    const cache = createStatsLruCache<string, number>(1);
    expect(cache.getOrBuild("a", () => 1)).toBe(1);
    expect(cache.getOrBuild("a", () => 2)).toBe(1);

    cache.reset();

    expect(cache.stats()).toEqual({
      capacity: 1,
      evictions: 0,
      hits: 0,
      misses: 0,
      size: 0,
    });
  });
});
