import { paletteRgba, zoneThemeForTerrain } from "../../systems/palette";
import { tileToScreen } from "../../systems/projection";
import { isWaterTileKind, terrainKindAt } from "../../systems/world-layout";
import { dockOutwardVector } from "../geometry";
import type { DrawPharosVilleInput } from "../render-types";

/**
 * One foam ribbon segment along a dock's seawall edge. Mirrors the
 * `LIGHTHOUSE_SURF` shape so the two layers can share helpers — anchor tile
 * plus segment length (sprite-units), phase offset (radians), and a curve
 * tilt that sells the wave running along the wall.
 */
export interface DockSurfRibbonDef {
  x: number;
  y: number;
  length: number;
  phase: number;
  tilt: number;
}

// Peak ribbon alpha at full intensity. Per-zone theme multipliers scale this
// down (LEDGER, DANGER) or up (ALERT) — see ZONE_THEMES.beachFoamAlpha.
const FOAM_PEAK_ALPHA = 0.6;
const FOAM_LINE_WIDTH = 3;

/**
 * Per-chain foam ribbon definitions. Opt-in by chain id: docks whose seawall
 * geometry cannot be derived from existing layout data are simply omitted
 * (`drawHarborSurf` silently skips them). Keys are bare chain ids (e.g.
 * `ethereum`, `bsc`) — the lookup strips the `dock.` prefix off
 * `DockNode.id`. Bare keys keep this table out of the asset-id static-check
 * regex in `validate-assets.mjs` (which would otherwise mis-classify
 * runtime DockNode id strings as manifest references).
 *
 * Each entry traces a 6-segment ribbon along the seaward edge of the dock's
 * landfall tile, slightly offset in the outward direction so the foam paints
 * just on the water side of the pad rather than over the dock sprite. The
 * tile coordinates here are tuned by hand to match each dock's silhouette;
 * length/phase/tilt values mirror the LIGHTHOUSE_SURF cadence.
 */
export const HARBOR_SURF_BY_CHAIN: Record<string, readonly DockSurfRibbonDef[]> = {
  // Ethereum civic cove — east periphery, outward (+1, 0). Wall runs N-S.
  ethereum: [
    { x: 42.55, y: 29.7, length: 18, phase: 0.4, tilt: 0.10 },
    { x: 42.55, y: 30.4, length: 22, phase: 2.1, tilt: -0.12 },
    { x: 42.55, y: 31.1, length: 26, phase: 4.0, tilt: 0.02 },
    { x: 42.55, y: 31.8, length: 24, phase: 5.7, tilt: 0.14 },
    { x: 42.55, y: 32.5, length: 20, phase: 1.3, tilt: -0.10 },
    { x: 42.55, y: 33.2, length: 17, phase: 3.4, tilt: 0.08 },
  ],
  // Base modular slip — SE periphery, outward (+1, 0). Wall runs N-S.
  base: [
    { x: 39.55, y: 36.7, length: 16, phase: 1.6, tilt: 0.08 },
    { x: 39.55, y: 37.4, length: 20, phase: 3.7, tilt: -0.14 },
    { x: 39.55, y: 38.1, length: 24, phase: 5.2, tilt: 0.04 },
    { x: 39.55, y: 38.8, length: 22, phase: 0.7, tilt: 0.16 },
    { x: 39.55, y: 39.5, length: 19, phase: 2.4, tilt: -0.08 },
    { x: 39.55, y: 40.2, length: 17, phase: 4.5, tilt: 0.10 },
  ],
  // Arbitrum arch bridge — south periphery, outward (0, +1). Wall runs E-W.
  arbitrum: [
    { x: 30.7, y: 40.55, length: 16, phase: 0.9, tilt: 0.06 },
    { x: 31.4, y: 40.55, length: 20, phase: 2.7, tilt: -0.14 },
    { x: 32.1, y: 40.55, length: 24, phase: 4.4, tilt: 0.02 },
    { x: 32.8, y: 40.55, length: 22, phase: 5.9, tilt: 0.16 },
    { x: 33.5, y: 40.55, length: 19, phase: 1.5, tilt: -0.10 },
    { x: 34.2, y: 40.55, length: 17, phase: 3.2, tilt: 0.08 },
  ],
  // Polygon hexmarket — SW periphery, outward (0, +1). Wall runs E-W.
  polygon: [
    { x: 24.7, y: 39.55, length: 16, phase: 1.1, tilt: 0.10 },
    { x: 25.4, y: 39.55, length: 20, phase: 2.9, tilt: -0.12 },
    { x: 26.1, y: 39.55, length: 24, phase: 4.6, tilt: 0.04 },
    { x: 26.8, y: 39.55, length: 22, phase: 0.3, tilt: 0.14 },
    { x: 27.5, y: 39.55, length: 19, phase: 2.0, tilt: -0.08 },
    { x: 28.2, y: 39.55, length: 17, phase: 3.7, tilt: 0.06 },
  ],
  // BSC mercantile wharf — SW shoulder, outward (-1, 0). Wall runs N-S.
  bsc: [
    { x: 20.45, y: 34.7, length: 17, phase: 0.6, tilt: -0.08 },
    { x: 20.45, y: 35.4, length: 21, phase: 2.3, tilt: 0.12 },
    { x: 20.45, y: 36.1, length: 25, phase: 4.1, tilt: -0.02 },
    { x: 20.45, y: 36.8, length: 23, phase: 5.5, tilt: -0.14 },
    { x: 20.45, y: 37.5, length: 19, phase: 1.0, tilt: 0.10 },
    { x: 20.45, y: 38.2, length: 17, phase: 3.0, tilt: -0.06 },
  ],
  // Tron arena wharf — N periphery (west of center), outward (0, -1). Wall runs E-W.
  tron: [
    { x: 26.7, y: 21.45, length: 17, phase: 1.3, tilt: 0.08 },
    { x: 27.4, y: 21.45, length: 21, phase: 3.0, tilt: -0.12 },
    { x: 28.1, y: 21.45, length: 25, phase: 4.7, tilt: 0.02 },
    { x: 28.8, y: 21.45, length: 23, phase: 0.5, tilt: 0.14 },
    { x: 29.5, y: 21.45, length: 19, phase: 2.2, tilt: -0.10 },
    { x: 30.2, y: 21.45, length: 17, phase: 3.9, tilt: 0.06 },
  ],
  // Solana prism stilt — NW shoulder near lighthouse, outward (0, -1) per
  // DOCK_OUTWARD_VECTOR_OVERRIDES. Wall runs E-W.
  solana: [
    { x: 23.7, y: 22.45, length: 17, phase: 0.8, tilt: 0.10 },
    { x: 24.4, y: 22.45, length: 21, phase: 2.5, tilt: -0.14 },
    { x: 25.1, y: 22.45, length: 25, phase: 4.2, tilt: 0.04 },
    { x: 25.8, y: 22.45, length: 23, phase: 5.8, tilt: 0.16 },
    { x: 26.5, y: 22.45, length: 19, phase: 1.6, tilt: -0.10 },
    { x: 27.2, y: 22.45, length: 17, phase: 3.3, tilt: 0.08 },
  ],
  // Aptos jade pagoda — N periphery (east of Tron), outward (0, -1). Wall runs E-W.
  aptos: [
    { x: 30.7, y: 21.45, length: 17, phase: 1.0, tilt: 0.06 },
    { x: 31.4, y: 21.45, length: 21, phase: 2.7, tilt: -0.12 },
    { x: 32.1, y: 21.45, length: 25, phase: 4.4, tilt: 0.02 },
    { x: 32.8, y: 21.45, length: 23, phase: 0.1, tilt: 0.14 },
    { x: 33.5, y: 21.45, length: 19, phase: 1.8, tilt: -0.08 },
    { x: 34.2, y: 21.45, length: 17, phase: 3.5, tilt: 0.06 },
  ],
  // Avalanche alpine watch — S periphery, outward (0, +1). Wall runs E-W.
  avalanche: [
    { x: 31.7, y: 40.55, length: 17, phase: 1.4, tilt: 0.10 },
    { x: 32.4, y: 40.55, length: 21, phase: 3.1, tilt: -0.14 },
    { x: 33.1, y: 40.55, length: 25, phase: 4.8, tilt: 0.02 },
    { x: 33.8, y: 40.55, length: 23, phase: 0.6, tilt: 0.16 },
    { x: 34.5, y: 40.55, length: 19, phase: 2.3, tilt: -0.10 },
    { x: 35.2, y: 40.55, length: 17, phase: 4.0, tilt: 0.08 },
  ],
  // Hyperliquid harbor — S periphery (between Base and Arbitrum), outward (0, +1).
  hyperliquid: [
    { x: 34.7, y: 39.55, length: 16, phase: 1.2, tilt: 0.08 },
    { x: 35.4, y: 39.55, length: 20, phase: 2.9, tilt: -0.12 },
    { x: 36.1, y: 39.55, length: 24, phase: 4.6, tilt: 0.04 },
    { x: 36.8, y: 39.55, length: 22, phase: 0.4, tilt: 0.14 },
    { x: 37.5, y: 39.55, length: 19, phase: 2.1, tilt: -0.10 },
    { x: 38.2, y: 39.55, length: 17, phase: 3.8, tilt: 0.06 },
  ],
  // TON pigeonnier pier — detached islet at (49,50), outward (-1, 0) (faces
  // west toward the main island). The pigeonnier islet is single-tile, so
  // the ribbon is narrower and centered tightly on its short west edge.
  ton: [
    { x: 48.45, y: 49.4, length: 14, phase: 0.7, tilt: -0.06 },
    { x: 48.45, y: 49.7, length: 17, phase: 2.2, tilt: 0.10 },
    { x: 48.45, y: 50.0, length: 20, phase: 3.9, tilt: -0.02 },
    { x: 48.45, y: 50.3, length: 18, phase: 5.4, tilt: -0.12 },
    { x: 48.45, y: 50.6, length: 16, phase: 1.1, tilt: 0.08 },
    { x: 48.45, y: 50.9, length: 14, phase: 2.8, tilt: -0.06 },
  ],
};

/**
 * Sample a foam-wash amplitude from a ribbon segment's phase. Reduced-motion
 * clients receive the deterministic peak (`0.66` matching the lighthouse
 * surf's still frame); otherwise the wash oscillates at the same 1.4 rad/s
 * cadence as the lighthouse to keep the two layers visually synced.
 */
function dockSurfWash(phase: number, time: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0.66;
  return 0.58 + Math.sin(time * 1.4 + phase) * 0.12;
}

/**
 * Looks up the per-zone foam-alpha multiplier for a dock at `tile`. The
 * dock tile itself sits on land (or shore), so we step outward in the
 * dock's seaward direction until we hit a water tile, then use that
 * tile's terrain kind to resolve the zone theme. Falls back to the generic
 * `water` theme if no water tile is reached within four steps (which would
 * only happen if `dockOutwardVector` and the map layout disagree).
 */
function dockFoamAlphaMultiplier(tile: { x: number; y: number }, mapWidth: number): number {
  const outward = dockOutwardVector(tile, mapWidth);
  const startX = Math.round(tile.x);
  const startY = Math.round(tile.y);
  for (let step = 1; step <= 4; step += 1) {
    const sampleX = startX + outward.x * step;
    const sampleY = startY + outward.y * step;
    const kind = terrainKindAt(sampleX, sampleY);
    if (isWaterTileKind(kind)) return zoneThemeForTerrain(kind).beachFoamAlpha;
  }
  return zoneThemeForTerrain("water").beachFoamAlpha;
}

/**
 * Beach-foam ribbon pass — paints a thin foam line along each chain
 * harbor's seawall edge. Generalized from `drawLighthouseSurf` so the two
 * passes share visual language: same arc shape, same wash cadence, same
 * reduced-motion behaviour, only the per-zone alpha multiplier differs.
 */
export function drawHarborSurf(input: DrawPharosVilleInput): void {
  const { camera, ctx, motion, world } = input;
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;

  ctx.save();
  ctx.lineCap = "round";
  const mapWidth = world.map.width;
  for (const dock of world.docks) {
    const chainId = dock.id.startsWith("dock.") ? dock.id.slice("dock.".length) : dock.id;
    const ribbon = HARBOR_SURF_BY_CHAIN[chainId];
    if (!ribbon || ribbon.length === 0) continue;
    const zoneMultiplier = dockFoamAlphaMultiplier(dock.tile, mapWidth);
    if (zoneMultiplier <= 0) continue;
    for (const surf of ribbon) {
      const p = tileToScreen(surf, camera);
      const wash = dockSurfWash(surf.phase, time, motion.reducedMotion);
      const alpha = wash * FOAM_PEAK_ALPHA * zoneMultiplier;
      if (alpha < 0.005) continue;
      ctx.strokeStyle = paletteRgba("foam_white", Math.min(1, alpha));
      ctx.lineWidth = Math.max(1, FOAM_LINE_WIDTH * camera.zoom * 0.6);
      ctx.beginPath();
      ctx.moveTo(p.x - surf.length * camera.zoom * 0.5, p.y);
      ctx.quadraticCurveTo(
        p.x,
        p.y + surf.tilt * surf.length * camera.zoom,
        p.x + surf.length * camera.zoom * 0.5,
        p.y + 4 * camera.zoom,
      );
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Peak ribbon alpha at full intensity (before per-zone multiplier and the
 * phase-wash modulation). Exposed for tests so they can assert the
 * deterministic peak frame is the spec'd `0.6 × beachFoamAlpha`.
 */
export const HARBOR_SURF_PEAK_ALPHA = FOAM_PEAK_ALPHA;
