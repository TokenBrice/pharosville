export type PharosVilleAssetCategory = "terrain" | "landmark" | "dock" | "ship" | "prop" | "overlay";
export type PharosVilleAssetPriority = "critical" | "deferred";

/**
 * Authoring metadata retained for the offline raster-asset validator and
 * runtime-manifest tooling. The Three.js browser runtime does not load this
 * manifest.
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
   * Optional WebP twin for `frameSource`. The offline validator enforces
   * signature and dimension parity with the PNG.
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
   * Optional WebP twin for the primary PNG. The offline validator enforces
   * signature and dimension parity and applies it to the payload budget.
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
