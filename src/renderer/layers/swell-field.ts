// V2.1 — coherent swell fronts.
//
// The per-tile water accents are deterministic but spatially incoherent: no
// motion ever travels across tiles, so the sea never moves as a body of
// water. This pass draws a few long, slow wave fronts that drift across the
// whole water field. Fronts live on iso "rows" (x + y = c in tile space, a
// horizontal line on screen) and travel down-screen over time, wrapping over
// the map extent.
//
// Geometry per front: sampled every ~1.5 tiles along the front line; samples
// over land or off-map break the polyline so fronts part around the island
// and islets. Each segment's waviness is scaled by the underlying zone
// theme's motion.amplitudeScale, so Danger water carries steeper swell than
// Calm Anchorage while zone base colors stay untouched (the front is a
// translucent foam highlight, not a recolor).
//
// Cost: 3 fronts × (~70 tile lookups + one batched stroke). The pass is
// called from drawWaterTerrainAccents, so it inherits the water-accents
// scheduler shedding (constrained sheds, recovery keeps) and the
// waterAccentDrawMs metric. Reduced motion freezes the time-zero frame.
import { isWaterTileKind } from "../../systems/world-layout";
import { zoneThemeForTerrain } from "../../systems/palette";
import { TILE_HEIGHT, TILE_WIDTH } from "../../systems/projection";
import type { PharosVilleMap, PharosVilleTile } from "../../systems/world-types";
import type { DrawPharosVilleInput } from "../render-types";
import { terrainKindForTile } from "../visible-tiles";

export const SWELL_FRONT_COUNT = 3;
const SWELL_SAMPLE_STEP_TILES = 1.5;
const SWELL_BASE_SPEED_ROWS_PER_SECOND = 0.55;
const SWELL_WAVINESS_TILES = 0.42;
const SWELL_CREST_ALPHA = 0.12;
const SWELL_TRAIL_ALPHA = 0.055;
const SWELL_TRAIL_OFFSET_TILES = 0.38;
const SWELL_COLOR = "rgba(214, 240, 245";

function swellTileAt(map: PharosVilleMap, x: number, y: number): PharosVilleTile | null {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  return map.tiles[y * map.width + x] ?? null;
}

// Scratch reused across frames: flat [x0, y0, x1, y1, …] runs split by NaN
// sentinels at segment breaks, so a front strokes as one batched path.
const frontPointsScratch: number[] = [];

function strokeFrontPath(
  ctx: CanvasRenderingContext2D,
  points: readonly number[],
  offsetY: number,
): boolean {
  let segmentOpen = false;
  let strokedAnySegment = false;
  ctx.beginPath();
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i]!;
    const y = points[i + 1]!;
    if (Number.isNaN(x)) {
      segmentOpen = false;
      continue;
    }
    if (segmentOpen) {
      ctx.lineTo(x, y + offsetY);
      strokedAnySegment = true;
    } else {
      ctx.moveTo(x, y + offsetY);
      segmentOpen = true;
    }
  }
  if (strokedAnySegment) ctx.stroke();
  return strokedAnySegment;
}

/**
 * Draws the travelling swell fronts. `windScale` comes from the
 * threat-aware wind multiplier so a stressed fleet reads as a windier sea.
 * Each front strokes twice: a brighter crest line and a fainter trailing
 * line offset down-screen, which reads as a wave body instead of a wire.
 * Returns the number of fronts that produced at least one stroked segment
 * (for tests/telemetry).
 */
export function drawSwellField(input: DrawPharosVilleInput, windScale: number): number {
  const { camera, ctx, height, motion, width, world } = input;
  const map = world.map;
  if (!map || map.width <= 0 || map.height <= 0) return 0;

  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  const rowSpan = map.width + map.height; // diamond depth in iso rows
  const spacing = rowSpan / SWELL_FRONT_COUNT;
  const travel = time * SWELL_BASE_SPEED_ROWS_PER_SECOND * windScale;
  const deltaX = (TILE_WIDTH / 2) * camera.zoom;
  const deltaY = (TILE_HEIGHT / 2) * camera.zoom;
  const sampleHalfSpan = Math.max(map.width, map.height);
  const trailOffsetY = SWELL_TRAIL_OFFSET_TILES * TILE_HEIGHT * camera.zoom;

  let drawnFronts = 0;
  ctx.save();
  ctx.lineCap = "round";
  for (let front = 0; front < SWELL_FRONT_COUNT; front += 1) {
    const row = ((travel + front * spacing) % rowSpan + rowSpan) % rowSpan;
    frontPointsScratch.length = 0;
    let lastWasBreak = true;
    for (let s = -sampleHalfSpan; s <= sampleHalfSpan; s += SWELL_SAMPLE_STEP_TILES) {
      const tileX = (row + s) / 2;
      const tileY = (row - s) / 2;
      const tile = swellTileAt(map, Math.round(tileX), Math.round(tileY));
      const terrain = tile ? terrainKindForTile(tile) : null;
      if (!tile || !terrain || !isWaterTileKind(terrain)) {
        if (!lastWasBreak) frontPointsScratch.push(Number.NaN, Number.NaN);
        lastWasBreak = true;
        continue;
      }
      const amplitudeScale = zoneThemeForTerrain(String(terrain)).motion.amplitudeScale;
      // Waviness rides along the propagation axis (down-screen) so the
      // front undulates without leaving its row.
      const wobble = Math.sin(s * 0.7 + time * 0.9 + front * 2.1)
        * SWELL_WAVINESS_TILES
        * amplitudeScale;
      const screenX = (tileX - tileY) * deltaX + camera.offsetX;
      const screenY = (tileX + tileY + wobble) * deltaY + camera.offsetY;
      if (screenX < -64 || screenX > width + 64 || screenY < -64 || screenY > height + 64) {
        if (!lastWasBreak) frontPointsScratch.push(Number.NaN, Number.NaN);
        lastWasBreak = true;
        continue;
      }
      frontPointsScratch.push(screenX, screenY);
      lastWasBreak = false;
    }
    if (frontPointsScratch.length < 4) continue;
    ctx.strokeStyle = `${SWELL_COLOR}, ${SWELL_CREST_ALPHA.toFixed(3)})`;
    ctx.lineWidth = Math.max(1, 1.5 * camera.zoom);
    const crestStroked = strokeFrontPath(ctx, frontPointsScratch, 0);
    ctx.strokeStyle = `${SWELL_COLOR}, ${SWELL_TRAIL_ALPHA.toFixed(3)})`;
    ctx.lineWidth = Math.max(1, 2.4 * camera.zoom);
    strokeFrontPath(ctx, frontPointsScratch, trailOffsetY);
    if (crestStroked) drawnFronts += 1;
  }
  ctx.restore();
  return drawnFronts;
}
