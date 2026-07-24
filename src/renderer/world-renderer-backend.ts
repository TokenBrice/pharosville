import type { PharosVilleRenderMetrics } from "./render-types";
import type { PharosVilleRenderSchedulerState } from "./render-types";
import type { PharosVilleMotionPlan, ShipMotionSample } from "../systems/motion";
import type { IsoCamera } from "../systems/projection";
import type { SeaState } from "../systems/sea-state";
import type { PharosVilleWorld } from "../systems/world-types";

export type WorldRendererStatus = "loading" | "ready" | "failed";

export interface ThreeLogoAsset {
  image: HTMLImageElement;
  src: string;
}

export interface ThreeLogoAssets {
  getLogo: (src: string | null | undefined) => ThreeLogoAsset | null;
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
  calls: number;
  geometries: number;
  lines: number;
  points: number;
  textures: number;
  triangles: number;
}

export interface ThreeWorldRendererMetrics extends PharosVilleRenderMetrics {
  gpu: WorldRendererGpuMetrics;
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
