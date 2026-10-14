import layoutUrl from "../data/layout.json?url";
import type { CameraPreset } from "../engine/camera-rig";
import type { PostChain } from "../engine/post";
import type { EngineContext, WorldSystem } from "../engine/types";
import type { HarbourLayout, LayoutCameraPreset } from "./types";

/** Preset used on first paint: "heart" (v2 default framing) when present, else "overview". */
export function defaultPresetName(layout: HarbourLayout): string {
  return layout.camera.presets.heart ? "heart" : "overview";
}

export function toCameraPreset(p: LayoutCameraPreset): CameraPreset {
  return { target: [...p.target], distance: p.distance, fovDeg: p.fovDeg, pitchDeg: p.pitchDeg, yawDeg: p.yawDeg };
}

/**
 * Loads src/harbour/data/layout.json, registers it as the 'layout' service, applies the default
 * camera preset (or `?view=<preset>`) and the pan clamp. Runs first so every later system can read it.
 */
export class LayoutSystem implements WorldSystem {
  readonly name = "layout";

  async init(ctx: EngineContext): Promise<void> {
    const res = await fetch(layoutUrl);
    if (!res.ok) throw new Error(`[harbour] layout.json ${res.status}`);
    const layout = (await res.json()) as HarbourLayout;
    ctx.services.set("layout", layout);

    const { presets, panClamp } = layout.camera;
    const rig = ctx.rig;
    rig.bounds.min.set(panClamp.min[0], panClamp.min[1]);
    rig.bounds.max.set(panClamp.max[0], panClamp.max[1]);
    const dists = Object.values(presets).map((p) => p.distance);
    rig.minDistance = layout.camera.minDistance ?? Math.max(30, Math.min(...dists) * 0.6);
    rig.maxDistance = layout.camera.maxDistance ?? Math.max(...dists) * 1.15;

    const q = new URLSearchParams(location.search);
    const asked = q.get("view");
    const name = asked && presets[asked] ? asked : defaultPresetName(layout);
    const preset = toCameraPreset(presets[name]);
    // dev/gate framing: ?cam=x,y,z,distance[,pitchDeg]
    const cam = (q.get("cam") ?? "").split(",").map(Number);
    if (cam.length >= 4 && cam.every(Number.isFinite)) {
      preset.target = [cam[0], cam[1], cam[2]];
      preset.distance = cam[3];
      if (cam.length >= 5) preset.pitchDeg = cam[4];
    }
    rig.applyPreset(preset, true);

    // tilt-shift: none at the default (heart) framing, full only out at the overview
    const post = ctx.services.get("post") as PostChain | undefined;
    if (post) {
      const near = presets.heart?.distance ?? presets.overview.distance * 0.45;
      post.tiltNear = near * 1.1;
      post.tiltFar = Math.max(near * 1.5, presets.overview.distance);
    }
  }

  update(): void {}

  dispose(ctx: EngineContext): void { ctx.services.delete("layout"); }
}
