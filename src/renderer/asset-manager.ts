import type {
  PharosVilleAssetManifest,
  PharosVilleAssetManifestEntry,
  PharosVilleAssetPhase,
} from "../systems/asset-manifest";
import { assetPhase, assetUrl, manifestCacheVersion, PHAROSVILLE_ASSET_MANIFEST_PATH } from "../systems/asset-manifest";

export interface LoadedPharosVilleAsset {
  entry: PharosVilleAssetManifestEntry;
  frameSource?: HTMLImageElement;
  image: HTMLImageElement;
}

export interface LoadedPharosVilleLogo {
  image: HTMLImageElement;
  src: string;
}

export interface PharosVilleAssetLoadError {
  id: string;
  message: string;
  path: string;
  priority: PharosVilleAssetManifestEntry["loadPriority"];
}

export interface PharosVilleAssetLoadResult {
  errors: PharosVilleAssetLoadError[];
  loaded: LoadedPharosVilleAsset[];
  manifest: PharosVilleAssetManifest;
  stats: PharosVilleAssetLoadStats;
}

export interface PharosVilleAssetLoadStats {
  activeDeferredLoads: number;
  criticalAssetCount: number;
  criticalLoadedCount: number;
  deferredAssetCount: number;
  deferredBatchesStarted: number;
  deferredCompletedAt: number | null;
  deferredLoadedCount: number;
  deferredQueuedCount: number;
  deferredStartedAt: number | null;
  failedAssetCount: number;
  failedLogoCount: number;
  loadedAssetCount: number;
  loadedLogoCount: number;
  maxCriticalConcurrency: number;
  maxDeferredConcurrency: number;
  peakDeferredConcurrency: number;
  requiredForFirstRenderCount: number;
  shellCriticalAssetCount: number;
  shellCriticalLoadedCount: number;
  totalAssetCount: number;
  visibleCriticalAssetCount: number;
  visibleCriticalLoadedCount: number;
}

export const PHAROSVILLE_CRITICAL_ASSET_CONCURRENCY = 6;
export const PHAROSVILLE_DEFERRED_ASSET_CONCURRENCY = 6;
export const PHAROSVILLE_LOGO_CONCURRENCY = 6;

interface AssetManifestSummary {
  criticalAssetCount: number;
  criticalIds: ReadonlySet<string>;
  deferredAssetCount: number;
  deferredIds: ReadonlySet<string>;
  requiredForFirstRenderCount: number;
  shellCriticalAssetCount: number;
  shellCriticalIds: ReadonlySet<string>;
  totalAssetCount: number;
  visibleCriticalAssetCount: number;
  visibleCriticalIds: ReadonlySet<string>;
}

export class PharosVilleAssetManager {
  private assets = new Map<string, LoadedPharosVilleAsset>();
  private failedAssets = new Map<string, PharosVilleAssetLoadError>();
  private failedLogos = new Set<string>();
  private logos = new Map<string, LoadedPharosVilleLogo>();
  private manifest: PharosVilleAssetManifest | null = null;
  private manifestSummary: AssetManifestSummary | null = null;
  private activeDeferredLoads = 0;
  private deferredBatchesStarted = 0;
  private deferredCompletedAt: number | null = null;
  private deferredStartedAt: number | null = null;
  private criticalLoadedCount = 0;
  private deferredLoadedCount = 0;
  private peakDeferredConcurrency = 0;
  private shellCriticalLoadedCount = 0;
  private visibleCriticalLoadedCount = 0;

  get(id: string): LoadedPharosVilleAsset | null {
    return this.assets.get(id) ?? null;
  }

  getManifest(): PharosVilleAssetManifest | null {
    return this.manifest;
  }

  getLoadStats(): PharosVilleAssetLoadStats {
    const summary = this.getManifestSummary();
    const failedDeferredCount = countFailedAssets(this.failedAssets, summary?.deferredIds);
    return {
      activeDeferredLoads: this.activeDeferredLoads,
      criticalAssetCount: summary?.criticalAssetCount ?? 0,
      criticalLoadedCount: this.criticalLoadedCount,
      deferredAssetCount: summary?.deferredAssetCount ?? 0,
      deferredBatchesStarted: this.deferredBatchesStarted,
      deferredCompletedAt: this.deferredCompletedAt,
      deferredLoadedCount: this.deferredLoadedCount,
      deferredQueuedCount: Math.max(0, (summary?.deferredAssetCount ?? 0) - this.deferredLoadedCount - failedDeferredCount),
      deferredStartedAt: this.deferredStartedAt,
      failedAssetCount: this.failedAssets.size,
      failedLogoCount: this.failedLogos.size,
      loadedAssetCount: this.assets.size,
      loadedLogoCount: this.logos.size,
      maxCriticalConcurrency: PHAROSVILLE_CRITICAL_ASSET_CONCURRENCY,
      maxDeferredConcurrency: PHAROSVILLE_DEFERRED_ASSET_CONCURRENCY,
      peakDeferredConcurrency: this.peakDeferredConcurrency,
      requiredForFirstRenderCount: summary?.requiredForFirstRenderCount ?? 0,
      shellCriticalAssetCount: summary?.shellCriticalAssetCount ?? 0,
      shellCriticalLoadedCount: this.shellCriticalLoadedCount,
      totalAssetCount: summary?.totalAssetCount ?? 0,
      visibleCriticalAssetCount: summary?.visibleCriticalAssetCount ?? 0,
      visibleCriticalLoadedCount: this.visibleCriticalLoadedCount,
    };
  }

  getAssetLoadProgressKey(): number {
    return this.criticalLoadedCount * 1_000_003 + this.deferredLoadedCount;
  }

  areCriticalAssetsLoaded(): boolean {
    const summary = this.getManifestSummary();
    if (!summary) return false;
    return this.criticalLoadedCount >= summary.criticalAssetCount;
  }

  areDeferredAssetsSettled(): boolean {
    const summary = this.getManifestSummary();
    if (!summary) return false;
    return this.deferredLoadedCount + countFailedAssets(this.failedAssets, summary.deferredIds) >= summary.deferredAssetCount;
  }

  getLogo(src: string | null | undefined): LoadedPharosVilleLogo | null {
    if (!src) return null;
    return this.logos.get(src) ?? null;
  }

  async loadCritical(signal?: AbortSignal): Promise<PharosVilleAssetLoadResult> {
    const manifest = await this.loadManifest(signal);
    const requiredIds = new Set(manifest.requiredForFirstRender);
    const isCritical = (asset: PharosVilleAssetManifestEntry) => (
      asset.loadPriority === "critical" || requiredIds.has(asset.id)
    );
    const shellCritical: PharosVilleAssetManifestEntry[] = [];
    const visibleCritical: PharosVilleAssetManifestEntry[] = [];
    for (const asset of manifest.assets) {
      if (!isCritical(asset)) continue;
      if (assetPhase(asset) === "shellCritical") shellCritical.push(asset);
      else visibleCritical.push(asset);
    }
    // NFS4 #16: load the world silhouette first so the canvas can paint a
    // coherent shell, then fill in the rest of the visible-critical bucket.
    // areCriticalAssetsLoaded() still gates on the union (no semantic change),
    // so existing callers continue to wait for both phases before unblocking.
    const shellResult = await this.loadAssetGroup(shellCritical, manifest, signal, {
      concurrency: PHAROSVILLE_CRITICAL_ASSET_CONCURRENCY,
    });
    if (signal?.aborted) return shellResult;
    const visibleResult = await this.loadAssetGroup(visibleCritical, manifest, signal, {
      concurrency: PHAROSVILLE_CRITICAL_ASSET_CONCURRENCY,
    });
    return {
      errors: [...shellResult.errors, ...visibleResult.errors],
      loaded: [...shellResult.loaded, ...visibleResult.loaded],
      manifest,
      stats: this.getLoadStats(),
    };
  }

  async loadDeferred(signal?: AbortSignal): Promise<PharosVilleAssetLoadResult> {
    const manifest = await this.loadManifest(signal);
    const deferred = orderDeferredAssets(manifest.assets.filter((asset) => asset.loadPriority === "deferred"), manifest);
    return this.loadAssetGroup(deferred, manifest, signal, {
      concurrency: PHAROSVILLE_DEFERRED_ASSET_CONCURRENCY,
      deferred: true,
    });
  }

  async loadManifest(signal?: AbortSignal): Promise<PharosVilleAssetManifest> {
    if (this.manifest) return this.manifest;
    const response = await fetch(PHAROSVILLE_ASSET_MANIFEST_PATH, { signal });
    if (!response.ok) throw new Error(`Failed to load PharosVille asset manifest: ${response.status}`);
    this.manifest = await response.json() as PharosVilleAssetManifest;
    this.manifestSummary = summarizeManifest(this.manifest);
    return this.manifest;
  }

  async loadAsset(
    asset: PharosVilleAssetManifestEntry,
    manifest: PharosVilleAssetManifest,
    signal?: AbortSignal,
  ): Promise<LoadedPharosVilleAsset> {
    const cached = this.assets.get(asset.id);
    if (cached) return cached;
    try {
      const image = await loadImage(assetUrl(asset, manifest), signal);
      const frameSource = await loadAssetFrameSource(asset, manifest, signal);
      const loaded = frameSource == null
        ? { entry: asset, image }
        : { entry: asset, frameSource, image };
      this.assets.set(asset.id, loaded);
      this.trackLoadedAsset(asset.id);
      this.failedAssets.delete(asset.id);
      return loaded;
    } catch (error) {
      if (!isAbortError(error)) {
        this.failedAssets.set(asset.id, {
          id: asset.id,
          message: errorMessage(error),
          path: asset.path,
          priority: asset.loadPriority,
        });
      }
      throw error;
    }
  }

  async loadLogo(src: string, signal?: AbortSignal): Promise<LoadedPharosVilleLogo> {
    const cached = this.logos.get(src);
    if (cached) return cached;
    if (this.failedLogos.has(src)) throw new Error(`Skipped previously failed logo ${src}`);
    try {
      const image = await loadImage(src, signal);
      const loaded = { image, src };
      this.logos.set(src, loaded);
      return loaded;
    } catch (error) {
      if (!isAbortError(error)) this.failedLogos.add(src);
      throw error;
    }
  }

  async loadLogos(srcs: Iterable<string>, signal?: AbortSignal): Promise<LoadedPharosVilleLogo[]> {
    const uniqueSrcs = [...new Set([...srcs].filter((src) => src.startsWith("/") && !this.failedLogos.has(src)))];
    const settled = await settleQueuedLoads(uniqueSrcs, (src) => this.loadLogo(src, signal), PHAROSVILLE_LOGO_CONCURRENCY, signal);
    return settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  }

  private async loadAssetGroup(
    assets: PharosVilleAssetManifestEntry[],
    manifest: PharosVilleAssetManifest,
    signal?: AbortSignal,
    options: { concurrency?: number; deferred?: boolean } = {},
  ): Promise<PharosVilleAssetLoadResult> {
    if (options.deferred && assets.length > 0) {
      this.deferredBatchesStarted += 1;
      this.deferredStartedAt ??= performanceNow();
      this.deferredCompletedAt = null;
    }
    const settled = await settleQueuedLoads(
      assets,
      (asset) => this.loadTrackedAsset(asset, manifest, signal, options.deferred === true),
      options.concurrency ?? assets.length,
      signal,
    );
    if (options.deferred) this.deferredCompletedAt = performanceNow();
    const loaded: LoadedPharosVilleAsset[] = [];
    const errors: PharosVilleAssetLoadError[] = [];
    settled.forEach((result, index) => {
      const asset = assets[index];
      if (!asset) return;
      if (result.status === "fulfilled") {
        loaded.push(result.value);
        return;
      }
      errors.push({
        id: asset.id,
        message: errorMessage(result.reason),
        path: asset.path,
        priority: asset.loadPriority,
      });
    });
    return { errors, loaded, manifest, stats: this.getLoadStats() };
  }

  private async loadTrackedAsset(
    asset: PharosVilleAssetManifestEntry,
    manifest: PharosVilleAssetManifest,
    signal: AbortSignal | undefined,
    trackDeferred: boolean,
  ): Promise<LoadedPharosVilleAsset> {
    if (!trackDeferred || this.assets.has(asset.id)) return this.loadAsset(asset, manifest, signal);
    this.activeDeferredLoads += 1;
    this.peakDeferredConcurrency = Math.max(this.peakDeferredConcurrency, this.activeDeferredLoads);
    try {
      return await this.loadAsset(asset, manifest, signal);
    } finally {
      this.activeDeferredLoads -= 1;
    }
  }

  private getManifestSummary(): AssetManifestSummary | null {
    if (!this.manifest) return null;
    this.manifestSummary ??= summarizeManifest(this.manifest);
    return this.manifestSummary;
  }

  private trackLoadedAsset(assetId: string) {
    const summary = this.getManifestSummary();
    if (!summary) return;
    if (summary.criticalIds.has(assetId)) this.criticalLoadedCount += 1;
    if (summary.deferredIds.has(assetId)) this.deferredLoadedCount += 1;
    if (summary.shellCriticalIds.has(assetId)) this.shellCriticalLoadedCount += 1;
    if (summary.visibleCriticalIds.has(assetId)) this.visibleCriticalLoadedCount += 1;
  }
}

async function settleQueuedLoads<TItem, TResult>(
  items: TItem[],
  load: (item: TItem) => Promise<TResult>,
  concurrency: number,
  signal?: AbortSignal,
): Promise<PromiseSettledResult<TResult>[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const settled: PromiseSettledResult<TResult>[] = new Array(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (nextIndex < items.length && !signal?.aborted) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        settled[index] = { status: "fulfilled", value: await load(items[index]) };
      } catch (reason) {
        settled[index] = { reason, status: "rejected" };
      }
    }
  }));
  return settled;
}

function orderDeferredAssets(
  assets: PharosVilleAssetManifestEntry[],
  manifest: PharosVilleAssetManifest,
): PharosVilleAssetManifestEntry[] {
  const required = new Set(manifest.requiredForFirstRender);
  return assets
    .map((asset, index) => ({ asset, index }))
    .sort((left, right) => (
      deferredAssetRank(left.asset, required) - deferredAssetRank(right.asset, required)
      || left.index - right.index
    ))
    .map(({ asset }) => asset);
}

function deferredAssetRank(asset: PharosVilleAssetManifestEntry, required: ReadonlySet<string>) {
  if (required.has(asset.id)) return 0;
  const categoryRank: Record<PharosVilleAssetManifestEntry["category"], number> = {
    terrain: 1,
    overlay: 2,
    dock: 3,
    landmark: 4,
    ship: 5,
    prop: 6,
  };
  return categoryRank[asset.category] ?? 10;
}

function summarizeManifest(manifest: PharosVilleAssetManifest): AssetManifestSummary {
  const criticalIds = new Set(manifest.requiredForFirstRender);
  const deferredIds = new Set<string>();
  const shellCriticalIds = new Set<string>();
  const visibleCriticalIds = new Set<string>();
  for (const asset of manifest.assets) {
    if (asset.loadPriority === "critical") criticalIds.add(asset.id);
    if (asset.loadPriority === "deferred") deferredIds.add(asset.id);
  }
  for (const asset of manifest.assets) {
    if (!criticalIds.has(asset.id)) continue;
    if (assetPhase(asset) === "shellCritical") shellCriticalIds.add(asset.id);
    else visibleCriticalIds.add(asset.id);
  }
  return {
    criticalAssetCount: criticalIds.size,
    criticalIds,
    deferredAssetCount: deferredIds.size,
    deferredIds,
    requiredForFirstRenderCount: manifest.requiredForFirstRender.length,
    shellCriticalAssetCount: shellCriticalIds.size,
    shellCriticalIds,
    totalAssetCount: manifest.assets.length,
    visibleCriticalAssetCount: visibleCriticalIds.size,
    visibleCriticalIds,
  };
}

async function loadAssetFrameSource(
  asset: PharosVilleAssetManifestEntry,
  manifest: PharosVilleAssetManifest,
  signal?: AbortSignal,
): Promise<HTMLImageElement | undefined> {
  const frameSource = asset.animation?.frameSource;
  if (!frameSource) return undefined;
  try {
    return await loadImage(`/pharosville/assets/${frameSource}?v=${encodeURIComponent(manifestCacheVersion(manifest))}`, signal);
  } catch (error) {
    if (isAbortError(error)) throw error;
    return undefined;
  }
}

function countFailedAssets(
  failedAssets: ReadonlyMap<string, PharosVilleAssetLoadError>,
  ids: ReadonlySet<string> | undefined,
) {
  if (!ids || ids.size === 0 || failedAssets.size === 0) return 0;
  let failed = 0;
  failedAssets.forEach((_error, id) => {
    if (ids.has(id)) failed += 1;
  });
  return failed;
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function performanceNow() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function loadImage(src: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Image load aborted", "AbortError"));
      return;
    }
    const image = new Image();
    let settled = false;
    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
      image.onerror = null;
      image.onload = null;
    };
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const abort = () => {
      settle(() => reject(new DOMException("Image load aborted", "AbortError")));
      image.src = "";
    };
    image.decoding = "async";
    image.onload = () => {
      void decodeImage(image).then(
        () => settle(() => resolve(image)),
        (error) => {
          if (isLoadedImage(image)) {
            settle(() => resolve(image));
            return;
          }
          settle(() => reject(new Error(`Failed to decode image ${src}: ${errorMessage(error)}`)));
        },
      );
    };
    image.onerror = () => {
      settle(() => reject(new Error(`Failed to load image ${src}`)));
    };
    signal?.addEventListener("abort", abort, { once: true });
    image.src = src;
  });
}

async function decodeImage(image: HTMLImageElement): Promise<void> {
  if (typeof image.decode !== "function") return;
  await image.decode();
}

function isLoadedImage(image: HTMLImageElement): boolean {
  return typeof image.naturalWidth !== "number" || image.naturalWidth > 0;
}
