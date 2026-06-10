import { describe, expect, it, vi } from "vitest";
import {
  buildShipBodyCacheKey,
  createShipBodyCache,
  normalizeShipBodyCacheKeyFields,
  shipBodyBackingSize,
  type ShipBodyCanvasFactory,
  type ShipBodyPrecomposeRequest,
} from "./ship-body-cache";

describe("ship body cache", () => {
  it("builds stable keys that include manifest cache version and size fields", () => {
    const base = makeRequest({
      manifestCacheVersion: "assets-v1",
      sourceSize: { width: 136, height: 100 },
      logicalSize: { width: 68, height: 50 },
    });

    const key = buildShipBodyCacheKey(base);
    expect(key).toContain("cv=assets-v1");
    expect(key).toContain("src=136x100");
    expect(key).toContain("logical=68x50");
    expect(key).toBe(buildShipBodyCacheKey({ ...base }));
    expect(key).not.toBe(buildShipBodyCacheKey({ ...base, manifestCacheVersion: "assets-v2" }));
    expect(key).not.toBe(buildShipBodyCacheKey({ ...base, logicalSize: { width: 70, height: 50 } }));
  });

  it("normalizes source size, logical size, and DPR for precomposition", () => {
    const fields = normalizeShipBodyCacheKeyFields(makeRequest({
      dpr: 1.257,
      logicalSize: { width: 25.555, height: Number.NaN },
      sourceSize: { width: 32.4, height: 16.6 },
    }));

    expect(fields.dprBucket).toBe(126);
    expect(fields.logicalSize).toEqual({ width: 25.56, height: 1 });
    expect(fields.sourceSize).toEqual({ width: 32, height: 17 });
    expect(shipBodyBackingSize(makeRequest({
      dpr: 1.25,
      logicalSize: { width: 20, height: 10 },
    }))).toEqual({ width: 25, height: 13 });
  });

  it("reuses a cached precomposed body and does not repaint on hit", () => {
    const canvasFactory = makeCanvasFactory();
    const cache = createShipBodyCache({ canvasFactory, maxEntries: 4, maxPixels: 10_000 });
    const paint = vi.fn();
    const request = makeRequest({ logicalSize: { width: 20, height: 10 } });

    const first = cache.getOrCreate(request, paint);
    const second = cache.getOrCreate(request, paint);

    expect(first.status).toBe("miss");
    expect(second.status).toBe("hit");
    expect(second.canvas).toBe(first.canvas);
    expect(paint).toHaveBeenCalledTimes(1);
    expect(cache.stats()).toMatchObject({
      entryCount: 1,
      hitCount: 1,
      missCount: 1,
      pixelCount: 200,
    });
  });

  it("touches entries on hit and evicts the least recently used body first", () => {
    const cache = createShipBodyCache({
      canvasFactory: makeCanvasFactory(),
      maxEntries: 2,
      maxPixels: 10_000,
    });
    const paint = vi.fn();
    const first = makeRequest({ shipId: "ship-a" });
    const second = makeRequest({ shipId: "ship-b" });
    const third = makeRequest({ shipId: "ship-c" });
    const firstKey = buildShipBodyCacheKey(first);
    const secondKey = buildShipBodyCacheKey(second);
    const thirdKey = buildShipBodyCacheKey(third);

    cache.getOrCreate(first, paint);
    cache.getOrCreate(second, paint);
    cache.getOrCreate(first, paint);
    cache.getOrCreate(third, paint);

    expect(cache.has(firstKey)).toBe(true);
    expect(cache.has(secondKey)).toBe(false);
    expect(cache.has(thirdKey)).toBe(true);
    expect(cache.stats()).toMatchObject({
      entryCount: 2,
      evictionCount: 1,
      hitCount: 1,
      missCount: 3,
    });
  });

  it("skips precomposition and returns a direct-source fallback when the body exceeds the pixel budget", () => {
    const cache = createShipBodyCache({
      canvasFactory: makeCanvasFactory(),
      maxEntries: 4,
      maxPixels: 99,
    });
    const paint = vi.fn();

    const result = cache.getOrCreate(makeRequest({
      logicalSize: { width: 10, height: 10 },
    }), paint);

    expect(result.status).toBe("budget-skip");
    expect(result.canvas).toBeNull();
    expect(result.fallback).toMatchObject({
      drawMode: "direct-source",
      reason: "pixel-budget",
      sourceSize: { width: 64, height: 32 },
      logicalSize: { width: 10, height: 10 },
    });
    expect(paint).not.toHaveBeenCalled();
    expect(cache.stats()).toMatchObject({
      budgetSkipCount: 1,
      entryCount: 0,
      missCount: 1,
      pixelCount: 0,
    });
  });

  it("evicts old entries until the pixel budget can retain the new body", () => {
    const cache = createShipBodyCache({
      canvasFactory: makeCanvasFactory(),
      maxEntries: 10,
      maxPixels: 500,
    });
    const paint = vi.fn();
    const first = makeRequest({ shipId: "ship-a", logicalSize: { width: 10, height: 10 } });
    const second = makeRequest({ shipId: "ship-b", logicalSize: { width: 10, height: 10 } });
    const large = makeRequest({ shipId: "ship-c", logicalSize: { width: 20, height: 20 } });

    cache.getOrCreate(first, paint);
    cache.getOrCreate(second, paint);
    const result = cache.getOrCreate(large, paint);

    expect(result.status).toBe("miss");
    expect(cache.has(buildShipBodyCacheKey(first))).toBe(false);
    expect(cache.has(buildShipBodyCacheKey(second))).toBe(true);
    expect(cache.has(buildShipBodyCacheKey(large))).toBe(true);
    expect(cache.stats()).toMatchObject({
      entryCount: 2,
      evictionCount: 1,
      pixelCount: 500,
    });
  });

  it("falls back instead of evicting entries protected by the caller", () => {
    const cache = createShipBodyCache({
      canvasFactory: makeCanvasFactory(),
      maxEntries: 2,
      maxPixels: 250,
    });
    const paint = vi.fn();
    const first = makeRequest({ shipId: "ship-a", logicalSize: { width: 10, height: 10 } });
    const second = makeRequest({ shipId: "ship-b", logicalSize: { width: 10, height: 10 } });
    const third = makeRequest({ shipId: "ship-c", logicalSize: { width: 10, height: 10 } });
    const protectedKeys = new Set([
      buildShipBodyCacheKey(first),
      buildShipBodyCacheKey(second),
    ]);

    cache.getOrCreate(first, paint);
    cache.getOrCreate(second, paint);
    const result = cache.getOrCreate(third, paint, { protectedKeys });

    expect(result.status).toBe("budget-skip");
    expect(result.fallback?.reason).toBe("entry-limit");
    expect(cache.has(buildShipBodyCacheKey(first))).toBe(true);
    expect(cache.has(buildShipBodyCacheKey(second))).toBe(true);
    expect(cache.has(buildShipBodyCacheKey(third))).toBe(false);
    expect(cache.stats()).toMatchObject({
      budgetSkipCount: 1,
      entryCount: 2,
      evictionCount: 0,
    });
  });

  it("honors a per-lookup pixel budget below the cache maximum", () => {
    const cache = createShipBodyCache({
      canvasFactory: makeCanvasFactory(),
      maxEntries: 4,
      maxPixels: 10_000,
    });
    const paint = vi.fn();

    const result = cache.getOrCreate(makeRequest({
      logicalSize: { width: 20, height: 10 },
    }), paint, { maxPixels: 100 });

    expect(result.status).toBe("budget-skip");
    expect(result.fallback?.reason).toBe("pixel-budget");
    expect(cache.stats().pixelCount).toBe(0);
  });

  it("absorbs live-fleet + V3.1 pose cardinality under the default entry cap without eviction", () => {
    // V4.2 guarantee: ~201 live-fleet ships (1 steady-state entry each;
    // pose/zoom/dpr never enter the key) plus V3.1 pose columns (+4 per
    // titan sheet, 13 sheets => +52) must fit the default cap with headroom
    // for transient rebakes (emblem logo arrival, weathering zone changes).
    const cache = createShipBodyCache({ canvasFactory: makeCanvasFactory(), maxPixels: 100_000_000 });
    const paint = vi.fn();
    for (let ship = 0; ship < 201; ship += 1) {
      cache.getOrCreate(makeRequest({ shipId: `fleet-${ship}` }), paint);
    }
    for (let titan = 0; titan < 13; titan += 1) {
      for (let pose = 1; pose <= 4; pose += 1) {
        cache.getOrCreate(makeRequest({ shipId: `titan-${titan}`, poseKey: `octant-${pose}` }), paint);
      }
    }

    expect(cache.stats()).toMatchObject({
      entryCount: 253,
      evictionCount: 0,
      maxEntries: 512,
    });

    // Above the cap the LRU contract still holds: the oldest fleet entry
    // goes first, the newest pose entries stay.
    for (let extra = 0; extra < 260; extra += 1) {
      cache.getOrCreate(makeRequest({ shipId: `transient-${extra}` }), paint);
    }
    expect(cache.stats().entryCount).toBe(512);
    expect(cache.has(buildShipBodyCacheKey(makeRequest({ shipId: "fleet-0" })))).toBe(false);
    expect(cache.has(buildShipBodyCacheKey(makeRequest({ shipId: "titan-12", poseKey: "octant-4" })))).toBe(true);
  });

  it("returns a direct-source fallback when no canvas can be created", () => {
    const cache = createShipBodyCache({
      canvasFactory: () => null,
      maxEntries: 4,
      maxPixels: 10_000,
    });
    const paint = vi.fn();

    const result = cache.getOrCreate(makeRequest(), paint);

    expect(result.status).toBe("fallback");
    expect(result.canvas).toBeNull();
    expect(result.fallback?.reason).toBe("canvas-unavailable");
    expect(paint).not.toHaveBeenCalled();
    expect(cache.stats()).toMatchObject({
      entryCount: 0,
      fallbackCount: 1,
      missCount: 1,
    });
  });
});

function makeRequest(overrides: Partial<ShipBodyPrecomposeRequest> = {}): ShipBodyPrecomposeRequest {
  return {
    assetId: "ship.standard",
    dpr: 1,
    logicalSize: { width: 20, height: 10 },
    manifestCacheVersion: "assets-v1",
    shipId: "ship-a",
    sourceSize: { width: 64, height: 32 },
    ...overrides,
  };
}

function makeCanvasFactory(): ShipBodyCanvasFactory {
  return (width, height) => {
    const canvas = {
      height,
      width,
      getContext: vi.fn(() => ({
        clearRect: vi.fn(),
        setTransform: vi.fn(),
      })),
    };
    return canvas as unknown as HTMLCanvasElement;
  };
}
