import layoutUrl from "../data/layout.json?url";
import type { CameraPreset } from "../engine/camera-rig";
import type { PostChain } from "../engine/post";
import type { EngineContext, WorldSystem } from "../engine/types";
import { fitPresetToAspect, heroPoints } from "./framing";
import type { HarbourLayout, LayoutCameraPreset, Vec3 } from "./types";

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
 * On screens squarer than 16:10 the preset is refitted to the aspect (framing.ts); the 'home-view'
 * service hands the UI that framing for the current aspect, and a resize (a tablet turned round)
 * refits it while the visitor has not moved the camera.
 */
export class LayoutSystem implements WorldSystem {
  readonly name = "layout";
  private base: CameraPreset | null = null;
  private hero: Vec3[] = [];
  private fit = true;
  private applied: CameraPreset | null = null;
  private heartDistance = 0;
  private overviewDistance = 0;

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
    this.base = preset;
    this.fit = !(cam.length >= 4 && cam.every(Number.isFinite)); // an explicit ?cam= framing is taken as given
    this.hero = heroPoints(layout);
    this.heartDistance = presets.heart?.distance ?? presets.overview.distance * 0.45;
    this.overviewDistance = presets.overview.distance;
    ctx.services.set("home-view", () => (this.applied = this.home(ctx)));
    this.applied = this.home(ctx);
    rig.applyPreset(this.applied, true);
  }

  /** The landing framing for the current aspect; also keeps the zoom limit and the tilt-shift range in step. */
  private home(ctx: EngineContext): CameraPreset {
    const base = this.base!;
    const p = this.fit ? fitPresetToAspect(base, ctx.camera.aspect, this.hero) : base;
    const rig = ctx.rig;
    if (p.distance * 1.15 > rig.maxDistance) rig.maxDistance = p.distance * 1.15;
    // tilt-shift: none at the landing (heart) framing, full only out at the overview; a refit landing
    // that stands further back pushes the range out with it
    const post = ctx.services.get("post") as PostChain | undefined;
    if (post) {
      const near = this.heartDistance * (p.distance / base.distance);
      post.tiltNear = near * 1.1;
      post.tiltFar = Math.max(near * 1.5, this.overviewDistance * (p.distance / base.distance));
    }
    return p;
  }

  update(): void {}

  resize(_w: number, _h: number, ctx: EngineContext): void {
    if (!this.applied || !ctx.rig.isAt(this.applied)) return;
    const next = this.home(ctx);
    if (ctx.rig.isAt(next)) return;
    this.applied = next;
    ctx.rig.applyPreset(next, true);
  }

  dispose(ctx: EngineContext): void { ctx.services.delete("layout"); ctx.services.delete("home-view"); }
}
