import type * as THREE from "three";
import type { EffectComposer } from "postprocessing";
import type { CameraRig } from "./camera-rig";
import type { WorldUniforms } from "./uniforms";
import type { TimeOfDay } from "./time-of-day";
import type { AssetStore } from "./assets";

/** Everything a world system may touch. Owned by the Engine; systems never create their own renderer/loop. */
export interface EngineContext {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly rig: CameraRig;
  readonly composer: EffectComposer;
  /** Shared GLSL uniforms (time, sun, sky palette, night factor, fog...). Systems read; TimeOfDay writes. */
  readonly uniforms: WorldUniforms;
  readonly timeOfDay: TimeOfDay;
  readonly assets: AssetStore;
  /** Free-form registry so systems can expose services to each other (e.g. "wake", "layout", "model"). */
  readonly services: Map<string, unknown>;
}

export interface FrameState {
  /** Seconds since engine start (monotonic, pauses when hidden). */
  readonly elapsed: number;
  /** Frame delta in seconds, clamped to [0, 0.1]. */
  readonly delta: number;
  /** Wall-clock UTC ms (for deterministic data-driven schedules). */
  readonly nowMs: number;
}

/**
 * A world system: ocean, sky, terrain, fleet, lighthouse, labels...
 * init() may await assets. update() is called once per frame before render, in registration order.
 * Systems that render to offscreen targets (wake) do so in update().
 */
export interface WorldSystem {
  readonly name: string;
  init(ctx: EngineContext): Promise<void> | void;
  update(frame: FrameState, ctx: EngineContext): void;
  /** Called after the camera rig resized/moved; optional. */
  resize?(width: number, height: number, ctx: EngineContext): void;
  dispose(ctx: EngineContext): void;
}

export interface HarbourStats {
  backend: "webgl2";
  drawCalls: number;
  triangles: number;
  textures: number;
  programs: number;
  hour: number;
  systems: string[];
  firstFrameMs: number | null;
  /** Render pixel ratio chosen by the quality governor. */
  dpr?: number;
  /** Last measured GPU frame time (EXT_disjoint_timer_query_webgl2), if available. */
  gpuMs?: number | null;
}
