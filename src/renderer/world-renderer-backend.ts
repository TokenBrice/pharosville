import type { PharosVilleRenderMetrics } from "./render-types";
import type { PharosVilleRenderSchedulerState } from "./render-types";
import type { PharosVilleMotionPlan, ShipMotionSample } from "../systems/motion";
import type { IsoCamera } from "../systems/projection";
import type { SeaState } from "../systems/sea-state";
import type { PharosVilleWorld } from "../systems/world-types";

export type WorldRendererStatus = "loading" | "ready" | "failed";

export interface ThreeLogoAsset {
  /**
   * H1: the coin's mark with the disc it came on cut away, in its own colours,
   * on a transparent ground. Null when no mask survived the quality gate — the
   * sail then flies the unframed image instead.
   */
  emblem: HTMLCanvasElement | null;
  /**
   * The decoded logo. Production loads decode through `createImageBitmap`
   * (off the main thread, so the atlas repaint never pays a synchronous
   * decode); tests may still hand an HTMLImageElement — both are drawable.
   */
  image: HTMLImageElement | ImageBitmap;
  src: string;
}

export interface ThreeLogoAssets {
  getExpectedLogoCount?: () => number;
  getLogo: (src: string | null | undefined) => ThreeLogoAsset | null;
  /** Diagnostic count for preview/runtime evidence; rendering keys on generation. */
  getLoadedLogoCount?: () => number;
  getLogoGenerationKey: () => string;
}

export interface ThreeWorldRendererFrame {
  logos: ThreeLogoAssets;
  camera: IsoCamera;
  dpr: number;
  height: number;
  hoveredDetailId: string | null;
  motionPlan: PharosVilleMotionPlan;
  reducedMotion: boolean;
  renderScheduler: PharosVilleRenderSchedulerState;
  seaState: SeaState;
  selectedDetailId: string | null;
  shipMotionSamples: ReadonlyMap<string, ShipMotionSample>;
  timeSeconds: number;
  wallClockHour: number;
  width: number;
  world: PharosVilleWorld;
}

export interface WorldRendererGpuMetrics {
  /** Recurring total: scene/post plus recurring offscreen work such as wakes. */
  calls: number;
  /** Recurring offscreen passes excluded from the visible scene/post subtotal. */
  offscreenCalls: number;
  /** Visible scene and post-processing subtotal. */
  sceneCalls: number;
  geometries: number;
  lines: number;
  points: number;
  /**
   * Live shader programs. Every one is a compile+link on the frame that first
   * needs it, so this is the number behind the first-frame stall — and a
   * per-frame climb here means something is forcing material recompiles.
   */
  programs: number;
  textures: number;
  triangles: number;
}

export interface ThreeWorldRendererMetrics extends PharosVilleRenderMetrics {
  gpu: WorldRendererGpuMetrics;
  logoAssetsExpected: number;
  logoAssetsLoaded: number;
  rendererBackend: "three";
}

export interface ThreeWorldRenderer {
  dispose: () => void;
  render: (frame: ThreeWorldRendererFrame) => ThreeWorldRendererMetrics;
}

export interface CreateThreeWorldRendererInput {
  canvas: HTMLCanvasElement;
  onAssetReady?: () => void;
  onContextFailure: (message: string) => void;
}
