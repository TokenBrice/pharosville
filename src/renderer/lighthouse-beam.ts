import { tileToScreen, type IsoCamera, type ScreenPoint } from "../systems/projection";
import type { PharosVilleAssetManager } from "./asset-manager";
import { LIGHTHOUSE_DRAW_OFFSET, LIGHTHOUSE_DRAW_SCALE } from "./visual-scales";

export const LIGHTHOUSE_BEAM_SWEEP_PERIOD_SECONDS = 48;
export const LIGHTHOUSE_BEAM_REDUCED_ANGLE = Math.PI / 4;

export interface LighthouseBeamSweep {
  angle: number;
  cos: number;
  sin: number;
}

export interface LighthouseBeamRenderState {
  center: ScreenPoint;
  firePoint: ScreenPoint;
  lighthouseAsset: ReturnType<PharosVilleAssetManager["get"]> | null;
  spriteAnchor: ScreenPoint;
  spriteScale: number;
}

export function lighthouseBeamSweepAngle(timeSeconds: number, reducedMotion: boolean): number {
  if (reducedMotion) return LIGHTHOUSE_BEAM_REDUCED_ANGLE;
  const cycle = timeSeconds / LIGHTHOUSE_BEAM_SWEEP_PERIOD_SECONDS;
  const radians = cycle * Math.PI * 2;
  return radians + Math.sin(radians) * 0.15;
}

export function lighthouseBeamSweep(timeSeconds: number, reducedMotion: boolean): LighthouseBeamSweep {
  const angle = lighthouseBeamSweepAngle(timeSeconds, reducedMotion);
  return {
    angle,
    cos: Math.cos(angle),
    sin: Math.sin(angle),
  };
}

export function resolveLighthouseBeamRenderState(input: {
  assets?: Pick<PharosVilleAssetManager, "get"> | null;
  camera: IsoCamera;
  lighthouse: { tile: { x: number; y: number } };
}): LighthouseBeamRenderState {
  const { assets, camera, lighthouse } = input;
  const center = tileToScreen(lighthouse.tile, camera);
  const lighthouseAsset = assets?.get("landmark.lighthouse") ?? null;
  const spriteScale = camera.zoom * LIGHTHOUSE_DRAW_SCALE;
  const spriteAnchor = {
    x: center.x + LIGHTHOUSE_DRAW_OFFSET.x * camera.zoom,
    y: center.y + LIGHTHOUSE_DRAW_OFFSET.y * camera.zoom,
  };
  const firePoint = lighthouseAsset
    ? {
      x: spriteAnchor.x + (lighthouseAsset.entry.beacon?.[0] ?? lighthouseAsset.entry.anchor[0]) * lighthouseAsset.entry.displayScale * spriteScale
        - lighthouseAsset.entry.anchor[0] * lighthouseAsset.entry.displayScale * spriteScale,
      y: spriteAnchor.y + (lighthouseAsset.entry.beacon?.[1] ?? lighthouseAsset.entry.anchor[1]) * lighthouseAsset.entry.displayScale * spriteScale
        - lighthouseAsset.entry.anchor[1] * lighthouseAsset.entry.displayScale * spriteScale,
    }
    : { x: center.x, y: center.y - 148 * camera.zoom };
  return { center, firePoint, lighthouseAsset, spriteAnchor, spriteScale };
}
