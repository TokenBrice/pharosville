import { paletteRgba, zoneThemeForTerrain } from "../../systems/palette";
import { isWaterTileKind, terrainKindAt } from "../../systems/world-layout";
import { dockOutwardVector } from "../geometry";
import type { DrawPharosVilleInput } from "../render-types";

/**
 * One foam ribbon segment along a dock's seawall edge. Mirrors the
 * `LIGHTHOUSE_SURF` shape so the two layers can share helpers — anchor tile
 * plus segment length (sprite-units), phase offset (radians), and a curve
 * tilt that sells the wave running along the wall.
 */
export type DockSurfRibbonDef = readonly [x: number, y: number, length: number, phase: number, tilt: number];

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
    [42.55, 29.7, 18, 0.4, 0.10],
    [42.55, 30.4, 22, 2.1, -0.12],
    [42.55, 31.1, 26, 4.0, 0.02],
    [42.55, 31.8, 24, 5.7, 0.14],
    [42.55, 32.5, 20, 1.3, -0.10],
    [42.55, 33.2, 17, 3.4, 0.08],
  ],
  // Base modular slip — SE periphery, outward (+1, 0). Wall runs N-S.
  base: [
    [39.55, 36.7, 16, 1.6, 0.08],
    [39.55, 37.4, 20, 3.7, -0.14],
    [39.55, 38.1, 24, 5.2, 0.04],
    [39.55, 38.8, 22, 0.7, 0.16],
    [39.55, 39.5, 19, 2.4, -0.08],
    [39.55, 40.2, 17, 4.5, 0.10],
  ],
  // Arbitrum arch bridge — south periphery, outward (0, +1). Wall runs E-W.
  arbitrum: [
    [30.7, 40.55, 16, 0.9, 0.06],
    [31.4, 40.55, 20, 2.7, -0.14],
    [32.1, 40.55, 24, 4.4, 0.02],
    [32.8, 40.55, 22, 5.9, 0.16],
    [33.5, 40.55, 19, 1.5, -0.10],
    [34.2, 40.55, 17, 3.2, 0.08],
  ],
  // Polygon hexmarket — SW periphery, outward (0, +1). Wall runs E-W.
  polygon: [
    [24.7, 39.55, 16, 1.1, 0.10],
    [25.4, 39.55, 20, 2.9, -0.12],
    [26.1, 39.55, 24, 4.6, 0.04],
    [26.8, 39.55, 22, 0.3, 0.14],
    [27.5, 39.55, 19, 2.0, -0.08],
    [28.2, 39.55, 17, 3.7, 0.06],
  ],
  // BSC mercantile wharf — SW shoulder, outward (-1, 0). Wall runs N-S.
  bsc: [
    [20.45, 34.7, 17, 0.6, -0.08],
    [20.45, 35.4, 21, 2.3, 0.12],
    [20.45, 36.1, 25, 4.1, -0.02],
    [20.45, 36.8, 23, 5.5, -0.14],
    [20.45, 37.5, 19, 1.0, 0.10],
    [20.45, 38.2, 17, 3.0, -0.06],
  ],
  // Tron arena wharf — N periphery (west of center), outward (0, -1). Wall runs E-W.
  tron: [
    [26.7, 21.45, 17, 1.3, 0.08],
    [27.4, 21.45, 21, 3.0, -0.12],
    [28.1, 21.45, 25, 4.7, 0.02],
    [28.8, 21.45, 23, 0.5, 0.14],
    [29.5, 21.45, 19, 2.2, -0.10],
    [30.2, 21.45, 17, 3.9, 0.06],
  ],
  // Solana prism stilt — NW shoulder near lighthouse, outward (0, -1) per
  // DOCK_OUTWARD_VECTOR_OVERRIDES. Wall runs E-W.
  solana: [
    [23.7, 22.45, 17, 0.8, 0.10],
    [24.4, 22.45, 21, 2.5, -0.14],
    [25.1, 22.45, 25, 4.2, 0.04],
    [25.8, 22.45, 23, 5.8, 0.16],
    [26.5, 22.45, 19, 1.6, -0.10],
    [27.2, 22.45, 17, 3.3, 0.08],
  ],
  // Aptos jade pagoda — N periphery (east of Tron), outward (0, -1). Wall runs E-W.
  aptos: [
    [30.7, 21.45, 17, 1.0, 0.06],
    [31.4, 21.45, 21, 2.7, -0.12],
    [32.1, 21.45, 25, 4.4, 0.02],
    [32.8, 21.45, 23, 0.1, 0.14],
    [33.5, 21.45, 19, 1.8, -0.08],
    [34.2, 21.45, 17, 3.5, 0.06],
  ],
  // Avalanche alpine watch — S periphery, outward (0, +1). Wall runs E-W.
  avalanche: [
    [31.7, 40.55, 17, 1.4, 0.10],
    [32.4, 40.55, 21, 3.1, -0.14],
    [33.1, 40.55, 25, 4.8, 0.02],
    [33.8, 40.55, 23, 0.6, 0.16],
    [34.5, 40.55, 19, 2.3, -0.10],
    [35.2, 40.55, 17, 4.0, 0.08],
  ],
  // Hyperliquid harbor — S periphery (between Base and Arbitrum), outward (0, +1).
  hyperliquid: [
    [34.7, 39.55, 16, 1.2, 0.08],
    [35.4, 39.55, 20, 2.9, -0.12],
    [36.1, 39.55, 24, 4.6, 0.04],
    [36.8, 39.55, 22, 0.4, 0.14],
    [37.5, 39.55, 19, 2.1, -0.10],
    [38.2, 39.55, 17, 3.8, 0.06],
  ],
  // TON pigeonnier pier — detached islet at (49,50), outward (-1, 0) (faces
  // west toward the main island). The pigeonnier islet is single-tile, so
  // the ribbon is narrower and centered tightly on its short west edge.
  ton: [
    [48.45, 49.4, 14, 0.7, -0.06],
    [48.45, 49.7, 17, 2.2, 0.10],
    [48.45, 50.0, 20, 3.9, -0.02],
    [48.45, 50.3, 18, 5.4, -0.12],
    [48.45, 50.6, 16, 1.1, 0.08],
    [48.45, 50.9, 14, 2.8, -0.06],
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
  const zoom = camera.zoom;
  ctx.lineWidth = Math.max(1, FOAM_LINE_WIDTH * zoom * 0.6);
  const mapWidth = world.map.width;
  for (const dock of world.docks) {
    const chainId = dock.id.startsWith("dock.") ? dock.id.slice("dock.".length) : dock.id;
    const ribbon = HARBOR_SURF_BY_CHAIN[chainId];
    if (!ribbon || ribbon.length === 0) continue;
    const zoneMultiplier = dockFoamAlphaMultiplier(dock.tile, mapWidth);
    if (zoneMultiplier <= 0) continue;
    for (const [x, y, length, phase, tilt] of ribbon) {
      const pX = (x - y) * 16 * zoom + camera.offsetX;
      const pY = (x + y) * 8 * zoom + camera.offsetY;
      const wash = dockSurfWash(phase, time, motion.reducedMotion);
      const alpha = wash * FOAM_PEAK_ALPHA * zoneMultiplier;
      if (alpha < 0.005) continue;
      ctx.strokeStyle = paletteRgba("foam_white", Math.min(1, alpha));
      ctx.beginPath();
      ctx.moveTo(pX - length * zoom * 0.5, pY);
      ctx.quadraticCurveTo(
        pX,
        pY + tilt * length * zoom,
        pX + length * zoom * 0.5,
        pY + 4 * zoom,
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
