import { CIVIC_CORE_CENTER } from "../../systems/world-layout";
import { tileToScreen, type ScreenPoint } from "../../systems/projection";
import { drawAsset } from "../canvas-primitives";
import type { DrawPharosVilleInput } from "../render-types";
import { skyState } from "./sky";

const CENTER_CLUSTER_SCALE = 0.5;

// Chimney smoke — a smaller, gentler variant of the lighthouse brazier smoke.
// Implemented locally so we do not depend on lighthouse internals.
const CHIMNEY_SMOKE_PUFF_COUNT = 8;
const CHIMNEY_SMOKE_LIFETIME = 4.5;
const CHIMNEY_SMOKE_RISE_PX = 80;
const CHIMNEY_SMOKE_PEAK_ALPHA = 0.1;
const CHIMNEY_SMOKE_NIGHT_SUPPRESS = 0.7;
const CHIMNEY_SMOKE_BASE_LIFT_PX = 12;

/**
 * Three procedural chimney plumes at fixed tile offsets from CIVIC_CORE_CENTER.
 * Phase staggering keeps the wisps reading as independent fires.
 */
export const CENTER_CLUSTER_CHIMNEYS: readonly { x: number; y: number; phase: number }[] = [
  { x: -1.5, y: -0.7, phase: 0 },
  { x: 1.7, y: -0.4, phase: 1.6 },
  { x: 0.2, y: 1.2, phase: 3.1 },
] as const;

export function drawCenterCluster(input: DrawPharosVilleInput): void {
  const { assets, camera, ctx } = input;
  const cluster = assets?.get("overlay.center-cluster");
  if (!cluster) return;
  const center = tileToScreen(CIVIC_CORE_CENTER, camera);
  drawAsset(ctx, cluster, center.x, center.y, camera.zoom * CENTER_CLUSTER_SCALE);
  drawCenterClusterChimneySmoke(input);
}

export function drawCenterClusterChimneySmoke(input: DrawPharosVilleInput): void {
  const { camera, ctx, motion } = input;
  const nightFactor = skyState(motion).nightFactor;
  if (nightFactor > CHIMNEY_SMOKE_NIGHT_SUPPRESS) return;
  const dayFactor = 1 - nightFactor / CHIMNEY_SMOKE_NIGHT_SUPPRESS;
  const peakBase = CHIMNEY_SMOKE_PEAK_ALPHA * dayFactor;
  if (peakBase <= 0) return;
  const zoom = camera.zoom;
  ctx.save();
  for (const chimney of CENTER_CLUSTER_CHIMNEYS) {
    const tile = { x: CIVIC_CORE_CENTER.x + chimney.x, y: CIVIC_CORE_CENTER.y + chimney.y };
    const base = tileToScreen(tile, camera);
    if (motion.reducedMotion) {
      drawFrozenChimneyWisp(ctx, base, zoom, peakBase, chimney.phase);
      continue;
    }
    drawAnimatedChimneyWisp(ctx, base, zoom, peakBase, motion.timeSeconds + chimney.phase, chimney.phase);
  }
  ctx.restore();
}

function drawAnimatedChimneyWisp(
  ctx: CanvasRenderingContext2D,
  base: ScreenPoint,
  zoom: number,
  peakBase: number,
  time: number,
  phase: number,
): void {
  for (let i = 0; i < CHIMNEY_SMOKE_PUFF_COUNT; i += 1) {
    const offset = (i / CHIMNEY_SMOKE_PUFF_COUNT) * CHIMNEY_SMOKE_LIFETIME;
    const t = ((time + offset) % CHIMNEY_SMOKE_LIFETIME) / CHIMNEY_SMOKE_LIFETIME;
    const seed = i * 1.913 + phase;
    const dy = -t * CHIMNEY_SMOKE_RISE_PX * zoom;
    const dx = Math.sin(time * 0.4 + seed) * 9 * zoom * t;
    const alpha = peakBase * smokeAlphaShape(t);
    if (alpha < 0.004) continue;
    const r = (2.2 + t * 4.4) * zoom;
    ctx.fillStyle = `rgba(56, 50, 58, ${alpha})`;
    ctx.beginPath();
    ctx.arc(base.x + dx, base.y - CHIMNEY_SMOKE_BASE_LIFT_PX * zoom + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Reduced-motion frame: three stacked puffs forming a clear, identifiable
// rising plume. Deterministic — depends only on the chimney's static phase.
const FROZEN_PUFFS = [
  { t: 0.22, dx: -1.6 },
  { t: 0.5, dx: 0 },
  { t: 0.78, dx: 1.4 },
] as const;

function drawFrozenChimneyWisp(
  ctx: CanvasRenderingContext2D,
  base: ScreenPoint,
  zoom: number,
  peakBase: number,
  phase: number,
): void {
  for (const puff of FROZEN_PUFFS) {
    const dy = -puff.t * CHIMNEY_SMOKE_RISE_PX * zoom;
    const dx = (puff.dx + Math.sin(phase) * 2 * puff.t) * zoom;
    const alpha = peakBase * smokeAlphaShape(puff.t);
    if (alpha < 0.004) continue;
    const r = (2.2 + puff.t * 4.4) * zoom;
    ctx.fillStyle = `rgba(56, 50, 58, ${alpha})`;
    ctx.beginPath();
    ctx.arc(base.x + dx, base.y - CHIMNEY_SMOKE_BASE_LIFT_PX * zoom + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function smokeAlphaShape(t: number): number {
  return t < 0.25 ? t / 0.25 : (1 - t) / 0.75;
}
