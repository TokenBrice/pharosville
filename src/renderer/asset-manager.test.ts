import { afterEach, describe, expect, it, vi } from "vitest";
import type { PharosVilleAssetManifest, PharosVilleAssetManifestEntry } from "../systems/asset-manifest";
import {
  type LoadedPharosVilleAsset,
  PHAROSVILLE_CRITICAL_ASSET_CONCURRENCY,
  PHAROSVILLE_DEFERRED_ASSET_CONCURRENCY,
  PHAROSVILLE_LOGO_CONCURRENCY,
  PharosVilleAssetManager,
} from "./asset-manager";
import { drawAssetFrame } from "./canvas-primitives";

const baseEntry: PharosVilleAssetManifestEntry = {
  anchor: [24, 24],
  category: "ship",
  displayScale: 1,
  footprint: [1, 1],
  height: 48,
  hitbox: [0, 0, 48, 48],
  id: "ship.base",
  layer: "ships",
  loadPriority: "deferred",
  path: "ships/base.png",
  width: 48,
};

describe("PharosVilleAssetManager", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads deferred assets with a bounded decode queue and stable semantic ordering", async () => {
    const manifest = makeManifest([
      makeEntry("ship.sixth", "ship", 0),
      makeEntry("ship.seventh", "ship", 1),
      makeEntry("terrain.harbor", "terrain", 2),
      makeEntry("terrain.deep", "terrain", 3),
      makeEntry("overlay.central", "overlay", 4),
      makeEntry("dock.grand", "dock", 5),
      makeEntry("landmark.lighthouse", "landmark", 6),
      makeEntry("prop.crate", "prop", 7),
    ]);
    stubManifestFetch(manifest);
    const starts: string[] = [];
    let activeLoads = 0;
    let peakLoads = 0;
    stubImageLoader((src) => {
      starts.push(src);
      activeLoads += 1;
      peakLoads = Math.max(peakLoads, activeLoads);
      return new Promise((resolve) => {
        setTimeout(() => {
          activeLoads -= 1;
          resolve();
        }, 1);
      });
    });

    const manager = new PharosVilleAssetManager();
    const result = await manager.loadDeferred();

    expect(result.errors).toEqual([]);
    expect(result.loaded).toHaveLength(8);
    expect(peakLoads).toBe(PHAROSVILLE_DEFERRED_ASSET_CONCURRENCY);
    expect(result.stats.peakDeferredConcurrency).toBe(PHAROSVILLE_DEFERRED_ASSET_CONCURRENCY);
    expect(result.stats.deferredBatchesStarted).toBe(1);
    expect(result.stats.activeDeferredLoads).toBe(0);
    expect(result.stats.deferredLoadedCount).toBe(8);
    expect(manager.areDeferredAssetsSettled()).toBe(true);
    expect(starts.slice(0, PHAROSVILLE_DEFERRED_ASSET_CONCURRENCY)).toEqual([
      "/pharosville/assets/terrain/harbor.png?v=test-cache",
      "/pharosville/assets/terrain/deep.png?v=test-cache",
      "/pharosville/assets/overlay/central.png?v=test-cache",
      "/pharosville/assets/docks/grand.png?v=test-cache",
      "/pharosville/assets/landmarks/lighthouse.png?v=test-cache",
      "/pharosville/assets/ships/sixth.png?v=test-cache",
    ]);
  });

  it("reports manifest and readiness stats for critical and deferred assets", async () => {
    const critical = makeEntry("dock.critical", "dock", 0, "critical");
    const requiredDeferred = makeEntry("ship.required", "ship", 1, "deferred");
    const deferred = makeEntry("terrain.deep", "terrain", 2, "deferred");
    const manifest = makeManifest([critical, requiredDeferred, deferred], [critical.id, requiredDeferred.id]);
    stubManifestFetch(manifest);
    stubImageLoader(() => Promise.resolve());

    const manager = new PharosVilleAssetManager();
    await manager.loadManifest();
    expect(manager.getLoadStats()).toMatchObject({
      criticalAssetCount: 2,
      deferredAssetCount: 2,
      loadedAssetCount: 0,
      requiredForFirstRenderCount: 2,
      totalAssetCount: 3,
    });
    expect(manager.getAssetLoadProgressKey()).toBe(0);

    const criticalResult = await manager.loadCritical();
    expect(criticalResult.stats).toMatchObject({
      criticalAssetCount: 2,
      criticalLoadedCount: 2,
      deferredLoadedCount: 1,
      loadedAssetCount: 2,
    });
    expect(manager.getAssetLoadProgressKey()).toBe(2_000_007);
    expect(manager.areCriticalAssetsLoaded()).toBe(true);

    const deferredResult = await manager.loadDeferred();
    expect(deferredResult.stats).toMatchObject({
      deferredAssetCount: 2,
      deferredLoadedCount: 2,
      deferredQueuedCount: 0,
      loadedAssetCount: 3,
      maxDeferredConcurrency: PHAROSVILLE_DEFERRED_ASSET_CONCURRENCY,
    });
    expect(manager.getAssetLoadProgressKey()).toBe(2_000_008);
    expect(manager.getLoadStats().deferredCompletedAt).toEqual(expect.any(Number));
  });

  it("loads sprite-sheet frame sources for animated assets without changing static entries", async () => {
    const animated = {
      ...makeEntry("ship.animated", "ship", 0),
      animation: {
        frameCount: 4,
        frameSource: "ships/animated-frames.png",
        fps: 8,
        loop: true,
        reducedMotionFrame: 0,
        spriteSheet: {
          columns: 2,
          frameHeight: 48,
          frameWidth: 48,
          rows: 2,
        },
      },
    } satisfies PharosVilleAssetManifestEntry;
    const staticEntry = makeEntry("ship.static", "ship", 1);
    const manifest = makeManifest([animated, staticEntry]);
    const starts: string[] = [];
    stubImageLoader((src) => {
      starts.push(src);
      return Promise.resolve();
    });

    const manager = new PharosVilleAssetManager();
    const loadedAnimated = await manager.loadAsset(animated, manifest);
    const loadedStatic = await manager.loadAsset(staticEntry, manifest);

    expect(loadedAnimated.frameSource).toBeDefined();
    expect(loadedStatic.frameSource).toBeUndefined();
    expect(starts).toEqual([
      "/pharosville/assets/ships/animated.png?v=test-cache",
      "/pharosville/assets/ships/animated-frames.png?v=test-cache",
      "/pharosville/assets/ships/static.png?v=test-cache",
    ]);
  });

  it("keeps animated static image loading usable when the optional frame source fails", async () => {
    const animated = {
      ...makeEntry("ship.animated", "ship", 0),
      animation: {
        frameCount: 4,
        frameSource: "ships/animated-frames.png",
        fps: 8,
        loop: true,
        reducedMotionFrame: 0,
        spriteSheet: {
          columns: 2,
          frameHeight: 48,
          frameWidth: 48,
          rows: 2,
        },
      },
    } satisfies PharosVilleAssetManifestEntry;
    const manifest = makeManifest([animated]);
    stubImageLoader((src) => (
      src.includes("animated-frames")
        ? Promise.reject(new Error("missing frame source"))
        : Promise.resolve()
    ));

    const manager = new PharosVilleAssetManager();
    const loaded = await manager.loadAsset(animated, manifest);

    expect(loaded.image).toBeDefined();
    expect(loaded.frameSource).toBeUndefined();
    expect(manager.get(animated.id)).toBe(loaded);
  });

  it("draws a sprite-sheet frame with static asset anchor and display scale semantics", () => {
    const entry = {
      ...baseEntry,
      anchor: [12, 14],
      animation: {
        frameCount: 6,
        frameSource: "ships/base-frames.png",
        fps: 8,
        loop: true,
        reducedMotionFrame: 0,
        spriteSheet: {
          columns: 3,
          frameHeight: 24,
          frameWidth: 32,
          rows: 2,
        },
      },
      displayScale: 2,
      height: 24,
      width: 32,
    } satisfies PharosVilleAssetManifestEntry;
    const frameSource = {} as HTMLImageElement;
    const asset: LoadedPharosVilleAsset = {
      entry,
      frameSource,
      image: {} as HTMLImageElement,
    };
    const drawImage = vi.fn();
    const ctx = { drawImage } as unknown as CanvasRenderingContext2D;

    expect(drawAssetFrame(ctx, asset, 100, 80, 0.5, 4)).toBe(true);

    expect(drawImage).toHaveBeenCalledWith(
      frameSource,
      32,
      24,
      32,
      24,
      88,
      66,
      32,
      24,
    );
  });

  it("loads logos with a bounded decode queue and filters duplicate or remote sources", async () => {
    const logoSrcs = Array.from({ length: PHAROSVILLE_LOGO_CONCURRENCY + 3 }, (_, index) => `/logos/${index}.png`);
    const starts: string[] = [];
    let activeLoads = 0;
    let peakLoads = 0;
    stubImageLoader((src) => {
      starts.push(src);
      activeLoads += 1;
      peakLoads = Math.max(peakLoads, activeLoads);
      return new Promise((resolve) => {
        setTimeout(() => {
          activeLoads -= 1;
          resolve();
        }, 1);
      });
    });

    const manager = new PharosVilleAssetManager();
    const loaded = await manager.loadLogos([
      ...logoSrcs,
      logoSrcs[0],
      "https://example.com/logo.png",
      "",
    ]);

    expect(loaded).toHaveLength(logoSrcs.length);
    expect(peakLoads).toBe(PHAROSVILLE_LOGO_CONCURRENCY);
    expect(starts).toEqual(logoSrcs);
    expect(manager.getLoadStats()).toMatchObject({
      failedLogoCount: 0,
      loadedLogoCount: logoSrcs.length,
    });
  });

  it("waits for image decode before resolving a loaded logo", async () => {
    let resolveDecode: () => void = () => undefined;
    const decode = vi.fn(() => new Promise<void>((resolve) => {
      resolveDecode = resolve;
    }));
    stubDecodingImage(decode);

    const manager = new PharosVilleAssetManager();
    const pending = manager.loadLogo("/logos/decoded.png");
    let resolved = false;
    void pending.then(() => {
      resolved = true;
    });

    await nextTask();
    expect(decode).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(false);

    resolveDecode();
    const loaded = await pending;

    expect(loaded.src).toBe("/logos/decoded.png");
    expect(resolved).toBe(true);
  });

  it("caps critical asset loading at PHAROSVILLE_CRITICAL_ASSET_CONCURRENCY", async () => {
    const criticals = Array.from({ length: PHAROSVILLE_CRITICAL_ASSET_CONCURRENCY + 4 }, (_, index) => (
      makeEntry(`ship.critical-${index}`, "ship", index, "critical")
    ));
    const manifest = makeManifest(criticals, criticals.map((entry) => entry.id));
    stubManifestFetch(manifest);
    let activeLoads = 0;
    let peakLoads = 0;
    stubImageLoader(() => {
      activeLoads += 1;
      peakLoads = Math.max(peakLoads, activeLoads);
      return new Promise((resolve) => {
        setTimeout(() => {
          activeLoads -= 1;
          resolve();
        }, 1);
      });
    });

    const manager = new PharosVilleAssetManager();
    const result = await manager.loadCritical();

    expect(result.errors).toEqual([]);
    expect(result.loaded).toHaveLength(criticals.length);
    expect(peakLoads).toBeLessThanOrEqual(PHAROSVILLE_CRITICAL_ASSET_CONCURRENCY);
    expect(result.stats.maxCriticalConcurrency).toBe(PHAROSVILLE_CRITICAL_ASSET_CONCURRENCY);
  });

  it("loads shellCritical entries before visibleCritical and tracks both buckets", async () => {
    const shellOne = { ...makeEntry("overlay.shell-one", "overlay", 0, "critical"), phase: "shellCritical" as const };
    const shellTwo = { ...makeEntry("landmark.shell-two", "landmark", 1, "critical"), phase: "shellCritical" as const };
    const visibleOne = { ...makeEntry("dock.visible-one", "dock", 2, "critical"), phase: "visibleCritical" as const };
    const visibleTwo = makeEntry("ship.visible-two", "ship", 3, "critical");
    const manifest = makeManifest([shellOne, shellTwo, visibleOne, visibleTwo], [
      shellOne.id,
      shellTwo.id,
      visibleOne.id,
      visibleTwo.id,
    ]);
    stubManifestFetch(manifest);
    const starts: string[] = [];
    stubImageLoader((src) => {
      starts.push(src);
      return Promise.resolve();
    });

    const manager = new PharosVilleAssetManager();
    const result = await manager.loadCritical();

    expect(result.errors).toEqual([]);
    expect(result.loaded).toHaveLength(4);
    // Shell PNGs must finish before any visible PNG starts.
    const shellSrcs = starts.filter((src) => src.includes("/shell-"));
    const visibleSrcs = starts.filter((src) => src.includes("/visible-") || src.includes("/asset-3"));
    expect(shellSrcs.length).toBe(2);
    expect(visibleSrcs.length).toBe(2);
    const lastShellIndex = Math.max(...shellSrcs.map((src) => starts.indexOf(src)));
    const firstVisibleIndex = Math.min(...visibleSrcs.map((src) => starts.indexOf(src)));
    expect(lastShellIndex).toBeLessThan(firstVisibleIndex);
    expect(result.stats).toMatchObject({
      shellCriticalAssetCount: 2,
      shellCriticalLoadedCount: 2,
      visibleCriticalAssetCount: 2,
      visibleCriticalLoadedCount: 2,
    });
    expect(manager.areCriticalAssetsLoaded()).toBe(true);
  });

  it("falls back to a loaded logo when image decode rejects", async () => {
    const decode = vi.fn(() => Promise.reject(new Error("decode unavailable")));
    stubDecodingImage(decode, 48);

    const manager = new PharosVilleAssetManager();
    const loaded = await manager.loadLogo("/logos/fallback.png");

    expect(decode).toHaveBeenCalledTimes(1);
    expect(loaded.src).toBe("/logos/fallback.png");
    expect(manager.getLoadStats()).toMatchObject({
      failedLogoCount: 0,
      loadedLogoCount: 1,
    });
  });
});

function makeManifest(
  assets: PharosVilleAssetManifestEntry[],
  requiredForFirstRender: string[] = [],
): PharosVilleAssetManifest {
  return {
    assets,
    requiredForFirstRender,
    schemaVersion: 2,
    style: {
      anchor: "test style",
      cacheVersion: "test-cache",
      generationDefaults: {
        detail: "test",
        outline: "test",
        shading: "test",
        transparentBackground: true,
        view: "test",
      },
      palette: ["#000000", "#111111", "#222222", "#333333"],
      styleAnchorVersion: "test-style",
    },
  };
}

function makeEntry(
  id: string,
  category: PharosVilleAssetManifestEntry["category"],
  index: number,
  loadPriority: PharosVilleAssetManifestEntry["loadPriority"] = "deferred",
): PharosVilleAssetManifestEntry {
  const folderByCategory: Record<PharosVilleAssetManifestEntry["category"], string> = {
    dock: "docks",
    landmark: "landmarks",
    overlay: "overlay",
    prop: "props",
    ship: "ships",
    terrain: "terrain",
  };
  return {
    ...baseEntry,
    category,
    id,
    layer: category,
    loadPriority,
    path: `${folderByCategory[category]}/${id.split(".")[1] ?? `asset-${index}`}.png`,
  };
}

function stubManifestFetch(manifest: PharosVilleAssetManifest) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(manifest), { status: 200 })));
}

function stubImageLoader(onStart: (src: string) => Promise<void>) {
  class MockImage {
    decoding: "async" | "auto" | "sync" = "auto";
    onerror: (() => void) | null = null;
    onload: (() => void) | null = null;

    set src(value: string) {
      void onStart(value)
        .then(() => this.onload?.())
        .catch(() => this.onerror?.());
    }
  }
  vi.stubGlobal("Image", MockImage);
}

function stubDecodingImage(decoder: () => Promise<void>, naturalWidthValue = 48) {
  class MockImage {
    decoding: "async" | "auto" | "sync" = "auto";
    naturalWidth = naturalWidthValue;
    onerror: (() => void) | null = null;
    onload: (() => void) | null = null;

    decode = decoder;

    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal("Image", MockImage);
}

function nextTask() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
