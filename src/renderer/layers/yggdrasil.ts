import { tileToScreen } from "../../systems/projection";
import { drawAsset } from "../canvas-primitives";
import type { DrawPharosVilleInput } from "../render-types";

export const YGGDRASIL_TILE = { x: 42.5, y: 29.2 } as const;

export function drawYggdrasil(input: DrawPharosVilleInput) {
  const asset = input.assets?.get("landmark.yggdrasil");
  if (!asset) return;
  const p = tileToScreen(YGGDRASIL_TILE, input.camera);
  drawAsset(input.ctx, asset, p.x, p.y, input.camera.zoom);
}
