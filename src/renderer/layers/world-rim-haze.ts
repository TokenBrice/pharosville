// V1.3 — world-edge atmospheric haze.
//
// The authored 56×56 map ends in a hard diamond edge against the sky
// backdrop, which reads as a game board instead of a sea. This pass strokes
// a few soft, mood-tinted bands along the projected map rim so the deep
// outer shelf feathers into the backdrop both inward and outward —
// atmospheric perspective for a world that continues past the rim.
//
// Cost: a handful of wide strokes per frame (one Path2D rebuilt only when
// the camera or map changes would be overkill — the path is 4 segments).
// Drawn before the entity pass so edge-zone ships (Ledger Mooring, Calm
// Anchorage hug the rim) stay crisp and selectable above the haze. Pure
// function of (map, camera, wall-clock mood) — no time-driven animation, so
// reduced motion renders the identical frame.
import { TILE_HEIGHT, TILE_WIDTH, tileToScreen } from "../../systems/projection";
import type { DrawPharosVilleInput } from "../render-types";
import { skyState } from "./sky";

interface RimHazeBand {
  alphaScale: number;
  /** Stroke width in zoom-scaled sprite units. */
  width: number;
}

// Widest band first so narrower, brighter bands layer on top of the fade.
const RIM_HAZE_BANDS: readonly RimHazeBand[] = [
  { alphaScale: 0.4, width: 104 },
  { alphaScale: 0.62, width: 64 },
  { alphaScale: 0.85, width: 36 },
  { alphaScale: 1, width: 16 },
];

const RIM_HAZE_BASE_ALPHA = 0.075;

function rimHazeColor(mist: string, alpha: number): string {
  // Mood mist colors are rgba strings; swap the trailing alpha (same pattern
  // as the sky cloud stroke matrix).
  return mist.replace(/[\d.]+\)$/, `${alpha.toFixed(3)})`);
}

export function drawWorldRimHaze(input: DrawPharosVilleInput): void {
  const { camera, ctx, world } = input;
  const map = world.map;
  if (!map || map.width <= 0 || map.height <= 0) return;
  const { mood, nightFactor } = skyState(input.motion);

  const halfTileX = (TILE_WIDTH / 2) * camera.zoom;
  const halfTileY = (TILE_HEIGHT / 2) * camera.zoom;
  const north = tileToScreen({ x: 0, y: 0 }, camera);
  const east = tileToScreen({ x: map.width - 1, y: 0 }, camera);
  const south = tileToScreen({ x: map.width - 1, y: map.height - 1 }, camera);
  const west = tileToScreen({ x: 0, y: map.height - 1 }, camera);

  // Night keeps a whisper of haze; the night tint pass already dims the rim.
  const moodAlpha = RIM_HAZE_BASE_ALPHA * (1 - 0.45 * nightFactor);
  if (moodAlpha <= 0.004) return;

  ctx.save();
  ctx.lineJoin = "round";
  for (const band of RIM_HAZE_BANDS) {
    ctx.strokeStyle = rimHazeColor(mood.mist, moodAlpha * band.alphaScale);
    ctx.lineWidth = Math.max(1, band.width * camera.zoom);
    ctx.beginPath();
    ctx.moveTo(north.x, north.y - halfTileY);
    ctx.lineTo(east.x + halfTileX, east.y);
    ctx.lineTo(south.x, south.y + halfTileY);
    ctx.lineTo(west.x - halfTileX, west.y);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}
