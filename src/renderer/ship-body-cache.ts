import { canvasPixelArea } from "../systems/canvas-budget";

export const SHIP_BODY_CACHE_SCHEMA_VERSION = "ship-body-precompose-v1";
export const DEFAULT_SHIP_BODY_CACHE_MAX_ENTRIES = 96;
export const DEFAULT_SHIP_BODY_CACHE_MAX_PIXELS = 2_000_000;

export interface ShipBodyCacheSize {
  height: number;
  width: number;
}

export interface ShipBodyPrecomposeRequest {
  assetId: string;
  dpr: number;
  logicalSize: ShipBodyCacheSize;
  manifestCacheVersion: string;
  shipId: string;
  sourceSize: ShipBodyCacheSize;
  animationFrameKey?: string | number;
  liveryKey?: string;
  orientationKey?: string;
  poseKey?: string;
  tintKey?: string;
}

export interface NormalizedShipBodyCacheKeyFields {
  animationFrameKey: string;
  assetId: string;
  dprBucket: number;
  liveryKey: string;
  logicalSize: ShipBodyCacheSize;
  manifestCacheVersion: string;
  orientationKey: string;
  poseKey: string;
  schemaVersion: typeof SHIP_BODY_CACHE_SCHEMA_VERSION;
  shipId: string;
  sourceSize: ShipBodyCacheSize;
  tintKey: string;
}

export interface ShipBodyCachePaintInput {
  backingSize: ShipBodyCacheSize;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  key: string;
  request: ShipBodyPrecomposeRequest;
}

export interface ShipBodyCacheFallback {
  backingSize: ShipBodyCacheSize;
  drawMode: "direct-source";
  logicalSize: ShipBodyCacheSize;
  reason: ShipBodyCacheFallbackReason;
  sourceSize: ShipBodyCacheSize;
}

export type ShipBodyCacheFallbackReason = "canvas-unavailable" | "entry-limit" | "pixel-budget";
export type ShipBodyCacheResultStatus = "budget-skip" | "fallback" | "hit" | "miss";

export type ShipBodyCacheResult =
  | {
      backingSize: ShipBodyCacheSize;
      canvas: HTMLCanvasElement;
      fallback: null;
      key: string;
      status: "hit" | "miss";
    }
  | {
      backingSize: ShipBodyCacheSize;
      canvas: null;
      fallback: ShipBodyCacheFallback;
      key: string;
      status: "budget-skip" | "fallback";
    };

export interface ShipBodyCacheStats {
  budgetSkipCount: number;
  entryCount: number;
  evictionCount: number;
  fallbackCount: number;
  hitCount: number;
  maxEntries: number;
  maxPixels: number;
  missCount: number;
  pixelCount: number;
}

export interface ShipBodyCacheOptions {
  canvasFactory?: ShipBodyCanvasFactory;
  maxEntries?: number;
  maxPixels?: number;
}

export interface ShipBodyCacheLookupOptions {
  maxPixels?: number;
  protectedKeys?: ReadonlySet<string>;
}

export interface ShipBodyCache {
  clear(): void;
  delete(key: string): boolean;
  getOrCreate(
    request: ShipBodyPrecomposeRequest,
    paint: (input: ShipBodyCachePaintInput) => void,
    options?: ShipBodyCacheLookupOptions,
  ): ShipBodyCacheResult;
  has(key: string): boolean;
  peek(key: string): HTMLCanvasElement | null;
  stats(): ShipBodyCacheStats;
}

export type ShipBodyCanvasFactory = (width: number, height: number) => HTMLCanvasElement | null;

interface ShipBodyCacheEntry {
  backingSize: ShipBodyCacheSize;
  canvas: HTMLCanvasElement;
  pixels: number;
}

export function buildShipBodyCacheKey(request: ShipBodyPrecomposeRequest): string {
  const fields = normalizeShipBodyCacheKeyFields(request);
  return [
    fields.schemaVersion,
    `cv=${keyPart(fields.manifestCacheVersion)}`,
    `asset=${keyPart(fields.assetId)}`,
    `ship=${keyPart(fields.shipId)}`,
    `src=${sizeKey(fields.sourceSize)}`,
    `logical=${sizeKey(fields.logicalSize)}`,
    `dpr=${fields.dprBucket}`,
    `frame=${keyPart(fields.animationFrameKey)}`,
    `pose=${keyPart(fields.poseKey)}`,
    `orientation=${keyPart(fields.orientationKey)}`,
    `livery=${keyPart(fields.liveryKey)}`,
    `tint=${keyPart(fields.tintKey)}`,
  ].join("|");
}

export function normalizeShipBodyCacheKeyFields(request: ShipBodyPrecomposeRequest): NormalizedShipBodyCacheKeyFields {
  return {
    animationFrameKey: normalizeOptionalKey(request.animationFrameKey),
    assetId: normalizeRequiredKey(request.assetId, "assetId"),
    dprBucket: normalizeDprBucket(request.dpr),
    liveryKey: normalizeOptionalKey(request.liveryKey),
    logicalSize: normalizeLogicalSize(request.logicalSize),
    manifestCacheVersion: normalizeRequiredKey(request.manifestCacheVersion, "manifestCacheVersion"),
    orientationKey: normalizeOptionalKey(request.orientationKey),
    poseKey: normalizeOptionalKey(request.poseKey),
    schemaVersion: SHIP_BODY_CACHE_SCHEMA_VERSION,
    shipId: normalizeRequiredKey(request.shipId, "shipId"),
    sourceSize: normalizeSourceSize(request.sourceSize),
    tintKey: normalizeOptionalKey(request.tintKey),
  };
}

export function shipBodyBackingSize(request: ShipBodyPrecomposeRequest): ShipBodyCacheSize {
  const logicalSize = normalizeLogicalSize(request.logicalSize);
  const dpr = normalizeDprBucket(request.dpr) / 100;
  return {
    height: Math.max(1, Math.ceil(logicalSize.height * dpr)),
    width: Math.max(1, Math.ceil(logicalSize.width * dpr)),
  };
}

export function createShipBodyCache(options: ShipBodyCacheOptions = {}): ShipBodyCache {
  const maxEntries = Math.max(1, Math.floor(options.maxEntries ?? DEFAULT_SHIP_BODY_CACHE_MAX_ENTRIES));
  const maxPixels = Math.max(1, Math.floor(options.maxPixels ?? DEFAULT_SHIP_BODY_CACHE_MAX_PIXELS));
  const canvasFactory = options.canvasFactory ?? defaultCanvasFactory;
  const entries = new Map<string, ShipBodyCacheEntry>();
  let pixelCount = 0;
  let hitCount = 0;
  let missCount = 0;
  let evictionCount = 0;
  let budgetSkipCount = 0;
  let fallbackCount = 0;

  function removeEntry(key: string): boolean {
    const entry = entries.get(key);
    if (!entry) return false;
    entries.delete(key);
    pixelCount = Math.max(0, pixelCount - entry.pixels);
    return true;
  }

  function evictOldest(protectedKeys: ReadonlySet<string> | undefined): boolean {
    for (const key of entries.keys()) {
      if (protectedKeys?.has(key)) continue;
      if (removeEntry(key)) {
        evictionCount += 1;
        return true;
      }
    }
    return false;
  }

  function skipResult(
    key: string,
    request: ShipBodyPrecomposeRequest,
    backingSize: ShipBodyCacheSize,
    reason: ShipBodyCacheFallbackReason,
  ): ShipBodyCacheResult {
    budgetSkipCount += 1;
    return {
      backingSize,
      canvas: null,
      fallback: {
        backingSize,
        drawMode: "direct-source",
        logicalSize: normalizeLogicalSize(request.logicalSize),
        reason,
        sourceSize: normalizeSourceSize(request.sourceSize),
      },
      key,
      status: "budget-skip",
    };
  }

  function fallbackResult(
    key: string,
    request: ShipBodyPrecomposeRequest,
    backingSize: ShipBodyCacheSize,
  ): ShipBodyCacheResult {
    fallbackCount += 1;
    return {
      backingSize,
      canvas: null,
      fallback: {
        backingSize,
        drawMode: "direct-source",
        logicalSize: normalizeLogicalSize(request.logicalSize),
        reason: "canvas-unavailable",
        sourceSize: normalizeSourceSize(request.sourceSize),
      },
      key,
      status: "fallback",
    };
  }

  return {
    clear() {
      entries.clear();
      pixelCount = 0;
    },
    delete: removeEntry,
    getOrCreate(request, paint, lookupOptions = {}) {
      const key = buildShipBodyCacheKey(request);
      const cached = entries.get(key);
      if (cached) {
        entries.delete(key);
        entries.set(key, cached);
        hitCount += 1;
        return {
          backingSize: cached.backingSize,
          canvas: cached.canvas,
          fallback: null,
          key,
          status: "hit",
        };
      }

      missCount += 1;
      const backingSize = shipBodyBackingSize(request);
      const candidatePixels = canvasPixelArea(backingSize.width, backingSize.height);
      const effectiveMaxPixels = Math.max(1, Math.min(maxPixels, Math.floor(lookupOptions.maxPixels ?? maxPixels)));
      if (candidatePixels > effectiveMaxPixels) {
        return skipResult(key, request, backingSize, "pixel-budget");
      }

      while (entries.size >= maxEntries) {
        if (!evictOldest(lookupOptions.protectedKeys)) {
          return skipResult(key, request, backingSize, "entry-limit");
        }
      }

      while (pixelCount + candidatePixels > effectiveMaxPixels) {
        if (!evictOldest(lookupOptions.protectedKeys)) {
          return skipResult(key, request, backingSize, "pixel-budget");
        }
      }

      const canvas = canvasFactory(backingSize.width, backingSize.height);
      const ctx = canvas?.getContext("2d", { alpha: true }) ?? null;
      if (!canvas || !ctx) {
        return fallbackResult(key, request, backingSize);
      }

      if (canvas.width !== backingSize.width) canvas.width = backingSize.width;
      if (canvas.height !== backingSize.height) canvas.height = backingSize.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, backingSize.width, backingSize.height);
      paint({ backingSize, canvas, ctx, key, request });

      entries.set(key, {
        backingSize,
        canvas,
        pixels: candidatePixels,
      });
      pixelCount += candidatePixels;

      return {
        backingSize,
        canvas,
        fallback: null,
        key,
        status: "miss",
      };
    },
    has(key) {
      return entries.has(key);
    },
    peek(key) {
      return entries.get(key)?.canvas ?? null;
    },
    stats() {
      return {
        budgetSkipCount,
        entryCount: entries.size,
        evictionCount,
        fallbackCount,
        hitCount,
        maxEntries,
        maxPixels,
        missCount,
        pixelCount,
      };
    },
  };
}

function defaultCanvasFactory(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function normalizeRequiredKey(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`Ship body cache ${fieldName} must be a non-empty string`);
  }
  return normalized;
}

function normalizeOptionalKey(value: string | number | undefined): string {
  if (value === undefined) return "0";
  return String(value).trim() || "0";
}

function normalizeSourceSize(size: ShipBodyCacheSize): ShipBodyCacheSize {
  return {
    height: normalizePositiveInteger(size.height),
    width: normalizePositiveInteger(size.width),
  };
}

function normalizeLogicalSize(size: ShipBodyCacheSize): ShipBodyCacheSize {
  return {
    height: normalizePositiveFinite(size.height),
    width: normalizePositiveFinite(size.width),
  };
}

function normalizePositiveInteger(value: number): number {
  return Math.max(1, Math.round(Number.isFinite(value) ? value : 1));
}

function normalizePositiveFinite(value: number): number {
  const finite = Number.isFinite(value) ? value : 1;
  return Math.max(1, Math.round(finite * 100) / 100);
}

function normalizeDprBucket(value: number): number {
  const finite = Number.isFinite(value) ? value : 1;
  return Math.max(100, Math.round(finite * 100));
}

function keyPart(value: string): string {
  return encodeURIComponent(value);
}

function sizeKey(size: ShipBodyCacheSize): string {
  return `${size.width}x${size.height}`;
}
