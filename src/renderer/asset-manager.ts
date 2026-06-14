import type {
  PharosVilleAssetManifest,
  PharosVilleAssetManifestEntry,
} from "../systems/asset-manifest";
import { waitForIdleChunk } from "../lib/idle-scheduler";
import { assetPhase, assetUrl, assetWebpFrameSourceUrl, assetWebpUrl, manifestCacheVersion, PHAROSVILLE_ASSET_MANIFEST_PATH } from "../systems/asset-manifest";

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
  criticalDecodeMs: number;
  criticalLoadedCount: number;
  deferredAssetCount: number;
  deferredBatchesStarted: number;
  deferredCompletedAt: number | null;
  deferredDecodeMs: number;
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
  /** Total count of `get(id)` calls that returned null. Diagnoses callers
      blindly drawing assets that aren't loaded (or were never declared). */
  totalAssetMisses: number;
  /** Distinct asset ids that have ever been missed in this session. */
  uniqueMissedAssetIds: number;
}

export const PHAROSVILLE_CRITICAL_ASSET_CONCURRENCY = 6;
export const PHAROSVILLE_DEFERRED_ASSET_CONCURRENCY = 6;
export const PHAROSVILLE_LOGO_CONCURRENCY = 6;

/**
 * V1.2 — deferred-progress batching for the renderer's asset load tick.
 * The static-layer caches in `world-canvas.ts` embed
 * `getAssetLoadProgressKey()` in their generation key, so every key change
 * clears them and forces full offscreen repaints. Quantizing the in-flight
 * deferred count means ~40 trickling sprite decodes cost a handful of
 * repaints instead of one each; the exact count is restored when the
 * deferred group settles so the final scene always repaints with every
 * sprite present. Critical-phase progress stays exact: those sprites gate
 * the first visible frame.
 */
export const PHAROSVILLE_DEFERRED_PROGRESS_BATCH = 8;

const PHAROSVILLE_DEFERRED_IDLE_TIMEOUT_MS = 800;

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
  private criticalDecodeMs = 0;
  private deferredDecodeMs = 0;
  private peakDeferredConcurrency = 0;
  private shellCriticalLoadedCount = 0;
  private visibleCriticalLoadedCount = 0;

  // Telemetry: counts every `get()` call that returns null (asset isn't
  // loaded yet, was never declared, or failed to load). Surfaced via
  // `getMissStats()` and folded into `getLoadStats()`. Used to diagnose
  // visual glitches caused by callers blindly drawing without a fallback.
  private missCountsById = new Map<string, number>();

  get(id: string): LoadedPharosVilleAsset | null {
    const hit = this.assets.get(id);
    if (hit) return hit;
    this.missCountsById.set(id, (this.missCountsById.get(id) ?? 0) + 1);
    return null;
  }

  getMissStats(): { totalMisses: number; uniqueMissedIds: number; topMissedIds: ReadonlyArray<{ id: string; count: number }> } {
    let totalMisses = 0;
    const entries: Array<{ id: string; count: number }> = [];
    for (const [id, count] of this.missCountsById) {
      totalMisses += count;
      entries.push({ id, count });
    }
    entries.sort((a, b) => b.count - a.count);
    return {
      totalMisses,
      uniqueMissedIds: this.missCountsById.size,
      topMissedIds: entries.slice(0, 10),
    };
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
      criticalDecodeMs: this.criticalDecodeMs,
      criticalLoadedCount: this.criticalLoadedCount,
      deferredAssetCount: summary?.deferredAssetCount ?? 0,
      deferredBatchesStarted: this.deferredBatchesStarted,
      deferredCompletedAt: this.deferredCompletedAt,
      deferredDecodeMs: this.deferredDecodeMs,
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
      totalAssetMisses: this.totalMissCount(),
      uniqueMissedAssetIds: this.missCountsById.size,
    };
  }

  private totalMissCount(): number {
    let total = 0;
    for (const count of this.missCountsById.values()) total += count;
    return total;
  }

  getAssetLoadProgressKey(): number {
    const deferredKey = this.areDeferredAssetsSettled()
      ? this.deferredLoadedCount
      : Math.floor(this.deferredLoadedCount / PHAROSVILLE_DEFERRED_PROGRESS_BATCH) * PHAROSVILLE_DEFERRED_PROGRESS_BATCH;
    return this.criticalLoadedCount * 1_000_003 + deferredKey;
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
    const response = await fetch(PHAROSVILLE_ASSET_MANIFEST_PATH, signal ? { signal } : {});
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
      const loadStartedAt = performanceNow();
      const image = await loadImageWithFallback(assetWebpUrl(asset, manifest), assetUrl(asset, manifest), signal);
      const frameSource = await loadAssetFrameSource(asset, manifest, signal);
      this.trackDecodeDuration(asset, manifest, performanceNow() - loadStartedAt);
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
    const loadTracked = (asset: PharosVilleAssetManifestEntry) => (
      this.loadTrackedAsset(asset, manifest, signal, options.deferred === true)
    );
    const concurrency = options.concurrency ?? assets.length;
    const settled = options.deferred
      ? await settleIdleChunkedQueuedLoads(assets, loadTracked, concurrency, signal)
      : await settleQueuedLoads(assets, loadTracked, concurrency, signal);
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

  private trackDecodeDuration(asset: PharosVilleAssetManifestEntry, manifest: PharosVilleAssetManifest, durationMs: number) {
    if (!Number.isFinite(durationMs)) return;
    const normalizedMs = Math.max(0, durationMs);
    if (isCriticalAsset(asset, manifest)) this.criticalDecodeMs += normalizedMs;
    else this.deferredDecodeMs += normalizedMs;
  }
}

function isCriticalAsset(asset: PharosVilleAssetManifestEntry, manifest: PharosVilleAssetManifest): boolean {
  return asset.loadPriority === "critical" || manifest.requiredForFirstRender.includes(asset.id);
}

async function settleIdleChunkedQueuedLoads<TItem, TResult>(
  items: TItem[],
  load: (item: TItem) => Promise<TResult>,
  chunkSize: number,
  signal?: AbortSignal,
): Promise<PromiseSettledResult<TResult>[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(chunkSize, items.length));
  const settled: PromiseSettledResult<TResult>[] = new Array(items.length);
  let nextIndex = 0;
  while (nextIndex < items.length && !signal?.aborted) {
    await waitForIdleChunk({
      timeoutMs: PHAROSVILLE_DEFERRED_IDLE_TIMEOUT_MS,
      ...(signal ? { signal } : {}),
    });
    if (signal?.aborted) break;
    const chunkStart = nextIndex;
    const chunkEnd = Math.min(items.length, chunkStart + limit);
    nextIndex = chunkEnd;
    const chunkSettled = await Promise.all(
      items.slice(chunkStart, chunkEnd).map(async (item): Promise<PromiseSettledResult<TResult>> => {
        try {
          return { status: "fulfilled", value: await load(item) };
        } catch (reason) {
          return { reason, status: "rejected" };
        }
      }),
    );
    chunkSettled.forEach((result, offset) => {
      settled[chunkStart + offset] = result;
    });
  }
  return settled;
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
  const pngUrl = `/pharosville/assets/${frameSource}?v=${encodeURIComponent(manifestCacheVersion(manifest))}`;
  try {
    return await loadImageWithFallback(assetWebpFrameSourceUrl(asset, manifest), pngUrl, signal);
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

/**
 * Wave 6 W6.13 — tries the primary URL (typically a WebP twin) first and
 * falls back to the secondary URL (the PNG) when the primary fails to load
 * or decode. Browsers that can't decode WebP (effectively no longer a thing
 * across the Chromium-linux matrix, but kept honest for older shells) will
 * `onerror` the WebP `<img>` and we transparently retry the PNG. Abort
 * signals are honored across both attempts.
 */
async function loadImageWithFallback(
  primary: string | undefined,
  fallback: string,
  signal?: AbortSignal,
): Promise<HTMLImageElement> {
  if (primary) {
    try {
      return await loadImage(primary, signal);
    } catch (error) {
      if (isAbortError(error)) throw error;
      // Primary failed (typically WebP decode error); fall through to the PNG.
    }
  }
  return loadImage(fallback, signal);
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
