import { CIVIC_CORE_CENTER } from "../../systems/world-layout";
import { tileToScreen } from "../../systems/projection";
import { drawAsset } from "../canvas-primitives";
import type { DrawPharosVilleInput } from "../render-types";

const CENTER_CLUSTER_SCALE = 0.5;

export function drawCenterCluster(input: DrawPharosVilleInput): void {
  const { assets, camera, ctx } = input;
  const cluster = assets?.get("overlay.center-cluster");
  if (!cluster) return;
  const center = tileToScreen(CIVIC_CORE_CENTER, camera);
  drawAsset(ctx, cluster, center.x, center.y, camera.zoom * CENTER_CLUSTER_SCALE);
}
