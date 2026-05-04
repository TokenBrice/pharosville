import { tileToScreen } from "../../systems/projection";
import { PIGEON_ISLAND_CENTER } from "../../systems/world-layout";
import { drawAsset } from "../canvas-primitives";
import type { DrawPharosVilleInput } from "../render-types";

// The renderer reads the islet center directly from world-layout so a single
// constant edit moves both the tile-mask and the rendered tower.
export function drawPigeonnier(input: DrawPharosVilleInput): void {
  const asset = input.assets?.get("landmark.pigeonnier");
  if (!asset) return;
  const p = tileToScreen(PIGEON_ISLAND_CENTER, input.camera);
  drawAsset(input.ctx, asset, p.x, p.y, input.camera.zoom);
}
