export type PharosVilleAssetCategory = "terrain" | "landmark" | "dock" | "ship" | "prop" | "overlay";
export type PharosVilleAssetPriority = "critical" | "deferred";
/**
 * NFS4 #16: per-entry phase that orders critical loading.
 * `shellCritical` paints the world silhouette (lighthouse + main island) first,
 * then `visibleCritical` fills in the docks/ships/props the user sees on first
 * paint, then `deferred` everything else. Optional — when absent, the phase is
 * inferred from `loadPriority` (critical → visibleCritical, deferred → deferred).
 */
export type PharosVilleAssetPhase = "shellCritical" | "visibleCritical" | "deferred";
export type PharosVilleAssetManifestSchemaVersion = 1 | 2;

export interface PharosVilleAssetAnimation {
  durationMs?: number;
  fps?: number;
  frameCount: number;
  frameSource: string;
  loop: boolean;
  reducedMotionFrame: number;
  spriteSheet?: {
    columns: number;
    frameHeight: number;
    frameWidth: number;
    rows: number;
  };
  /**
   * Wave 6 W6.13 — optional WebP twin for `frameSource`. When present, the
   * renderer prefers the WebP and falls back to the PNG at `frameSource` if
   * the browser cannot decode WebP. Validator enforces signature + dimension
   * parity with the PNG.
   */
  webpFrameSource?: string;
}

export interface PharosVilleAssetManifestEntry {
  animation?: PharosVilleAssetAnimation;
  anchor: [number, number];
  beacon?: [number, number];
  category: PharosVilleAssetCategory;
  criticalReason?: string;
  displayScale: number;
  footprint: [number, number];
  height: number;
  hitbox: [number, number, number, number];
  id: string;
  layer: string;
  loadPriority: PharosVilleAssetPriority;
  paletteKeys?: string[];
  phase?: PharosVilleAssetPhase;
  path: string;
  promptKey?: string;
  promptProvenance?: {
    jobId?: string;
    seed?: number;
    styleAnchorVersion: string;
  };
  semanticRole?: string;
  tool?: string;
  /**
   * Wave 6 W6.13 — optional WebP twin for the primary `path` PNG. When
   * present, the renderer prefers WebP and falls back to PNG if the browser
   * cannot decode it. Validator enforces signature + dimension parity with
   * the PNG and counts the WebP bytes (not the PNG) against the payload
   * budget when both are available.
   */
  webpPath?: string;
  width: number;
}

interface PharosVilleAssetManifestStyleBase {
  anchor: string;
  generationDefaults: {
    detail: string;
    outline: string;
    shading: string;
    transparentBackground: boolean;
    view: string;
  };
  palette: string[];
}

interface PharosVilleAssetManifestV1Style extends PharosVilleAssetManifestStyleBase {
  assetVersion: string;
}

interface PharosVilleAssetManifestV2Style extends PharosVilleAssetManifestStyleBase {
  cacheVersion: string;
  styleAnchorVersion: string;
}

export interface PharosVilleAssetManifestV1 {
  assets: PharosVilleAssetManifestEntry[];
  requiredForFirstRender: string[];
  schemaVersion: 1;
  style: PharosVilleAssetManifestV1Style;
}

export interface PharosVilleAssetManifestV2 {
  assets: PharosVilleAssetManifestEntry[];
  requiredForFirstRender: string[];
  schemaVersion: 2;
  style: PharosVilleAssetManifestV2Style;
}

export type PharosVilleAssetManifest = PharosVilleAssetManifestV1 | PharosVilleAssetManifestV2;

/**
 * NFS4 #15: runtime variant of the manifest, stripped of authoring-only fields
 * (prompt*, semanticRole, criticalReason, paletteKeys, tool). The full
 * `manifest.json` is preserved for the validator and offline tooling. The
 * runtime variant is emitted by the Vite plugin in `vite.config.ts` (build) and
 * the dev middleware (serve), so the path is identical in both modes.
 */
export const PHAROSVILLE_ASSET_MANIFEST_PATH = "/pharosville/assets/manifest.runtime.json";

export function manifestCacheVersion(manifest: PharosVilleAssetManifest): string {
  return manifest.schemaVersion === 2 ? manifest.style.cacheVersion : manifest.style.assetVersion;
}

export function manifestStyleAnchorVersion(manifest: PharosVilleAssetManifest): string {
  return manifest.schemaVersion === 2 ? manifest.style.styleAnchorVersion : manifest.style.assetVersion;
}

export function assetUrl(asset: PharosVilleAssetManifestEntry, manifest: PharosVilleAssetManifest): string {
  return `/pharosville/assets/${asset.path}?v=${encodeURIComponent(manifestCacheVersion(manifest))}`;
}

/**
 * Wave 6 W6.13 — URL for the WebP twin, or `undefined` when the asset has no
 * `webpPath`. Same cache-busting query as `assetUrl`. Renderer prefers this
 * URL and falls back to `assetUrl` on decode failure.
 */
export function assetWebpUrl(asset: PharosVilleAssetManifestEntry, manifest: PharosVilleAssetManifest): string | undefined {
  if (!asset.webpPath) return undefined;
  return `/pharosville/assets/${asset.webpPath}?v=${encodeURIComponent(manifestCacheVersion(manifest))}`;
}

/**
 * Wave 6 W6.13 — URL for the WebP twin of an animated asset's `frameSource`,
 * or `undefined` when the animation has no `webpFrameSource`.
 */
export function assetWebpFrameSourceUrl(asset: PharosVilleAssetManifestEntry, manifest: PharosVilleAssetManifest): string | undefined {
  const webpFrameSource = asset.animation?.webpFrameSource;
  if (!webpFrameSource) return undefined;
  return `/pharosville/assets/${webpFrameSource}?v=${encodeURIComponent(manifestCacheVersion(manifest))}`;
}

/**
 * NFS4 #16: resolve the asset's load phase, falling back to a sensible default
 * derived from `loadPriority` for entries that have not been annotated yet.
 */
export function assetPhase(asset: PharosVilleAssetManifestEntry): PharosVilleAssetPhase {
  if (asset.phase) return asset.phase;
  return asset.loadPriority === "critical" ? "visibleCritical" : "deferred";
}
