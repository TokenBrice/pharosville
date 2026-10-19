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
  /** Engine lifetime; optional for standalone system fixtures. */
  readonly signal?: AbortSignal;
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
  /** Noncritical future-state programs, prepared in idle turns after the first completed frame. */
  prepareIdle?(ctx: EngineContext): Promise<void>;
  dispose(ctx: EngineContext): void;
}

/** Explicit private-pass preparation; target is resolved at issuance (resize may replace it). */
export interface PreparationEntry {
  readonly root: THREE.Object3D;
  readonly camera: THREE.Camera;
  readonly target: () => THREE.WebGLRenderTarget | null;
  readonly scene?: THREE.Scene;
}

export interface PreparationService {
  register(entry: PreparationEntry): () => void;
  /** Detached additions must await this before publication. Rejects on engine disposal. */
  prepareGroup(root: THREE.Object3D): Promise<void>;
  /** Prepare a calendar classification before publishing colour/depth versions and uniforms. */
  prepareSeason(scope: () => () => void, commit: () => void): Promise<void>;
  /** One idle upload per task; render-target attachments are never uploaded as CPU textures. */
  stageTextures(root: THREE.Object3D): void;
}

/** Installed simulation model/plan readiness; DataSystem mutates this service in place. */
export interface ReadinessState {
  revision: number;
  boats: number;
  prepared: boolean;
}

/** Startup planning failure; the awaiting world is real, but it cannot claim live fleet readings. */
export interface SimulationStatus {
  unavailable: boolean;
}

/** FleetSystem's posed/submitted revision and boat count, copied after a completed composer render. */
export interface RenderedFleetState {
  readonly revision: number;
  readonly boats: number;
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
  firstFleetFrameMs: number | null;
  renderedRevision: number;
  renderedBoats: number;
  /** Render pixel ratio chosen by the quality governor. */
  dpr?: number;
  /** p10 of completed current-state GPU samples, retained as the compact stats alias. */
  gpuMs?: number | null;
  gpuP10Ms?: number | null;
  gpuP50Ms?: number | null;
  /** Bounded current-state population behind p10/p50. */
  gpuSamples?: number;
  /** Cumulative non-disjoint completions (including prior states), pending and rejected queries. */
  gpuCompletedSamples?: number;
  gpuPendingQueries?: number;
  gpuDisjointSamples?: number;
  gpuSkippedQueries?: number;
  /** Quality tier chosen by the governor ('quality' service). */
  quality?: "high" | "medium" | "low";
  /** Boot profile (ms): each system's init, then the first frame's render. */
  boot?: Record<string, number>;
}
