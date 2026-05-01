export interface SeawallPlacement {
  assetId: "overlay.seawall-corner" | "overlay.seawall-straight";
  flipX: boolean;
  rotation: number;
  scale: number;
  tile: { x: number; y: number };
  yOffset: number;
  alphaJitter: number;
}

// These water tiles sit directly outside the main-island coast. They remain
// semantic water for rendering, but route sampling and spawn helpers must treat
// them as blocked by the masonry seawall so ships stay outside the harbor ring.
export const SEAWALL_BARRIER_TILES = [
  { x: 24, y: 23 },
  { x: 25, y: 22 },
  { x: 26, y: 22 },
  { x: 27, y: 21 },
  { x: 28, y: 21 },
  { x: 29, y: 21 },
  { x: 32, y: 21 },
  { x: 33, y: 21 },
  { x: 34, y: 21 },
  { x: 35, y: 21 },
  { x: 36, y: 21 },
  { x: 37, y: 21 },
  { x: 38, y: 21 },
  { x: 39, y: 21 },
  { x: 40, y: 21 },
  { x: 41, y: 22 },
  { x: 42, y: 24 },
  { x: 43, y: 25 },
  { x: 44, y: 26 },
  { x: 44, y: 27 },
  { x: 44, y: 28 },
  { x: 44, y: 29 },
  { x: 44, y: 30 },
  { x: 44, y: 31 },
  { x: 44, y: 32 },
  { x: 44, y: 33 },
  { x: 43, y: 34 },
  { x: 41, y: 36 },
  { x: 40, y: 37 },
  { x: 39, y: 38 },
  { x: 38, y: 39 },
  { x: 37, y: 40 },
  { x: 35, y: 41 },
  { x: 34, y: 41 },
  { x: 33, y: 42 },
  { x: 32, y: 42 },
  { x: 31, y: 42 },
  { x: 30, y: 42 },
  { x: 29, y: 41 },
  { x: 28, y: 41 },
  { x: 27, y: 41 },
  { x: 26, y: 40 },
  { x: 25, y: 39 },
  { x: 24, y: 38 },
  { x: 23, y: 38 },
  { x: 20, y: 36 },
  { x: 19, y: 35 },
  { x: 19, y: 34 },
  { x: 19, y: 33 },
  { x: 19, y: 32 },
] as const;

const BARRIER_TILE_KEYS = new Set(SEAWALL_BARRIER_TILES.map((tile) => `${tile.x}.${tile.y}`));

export function isSeawallBarrierTile(tile: { x: number; y: number }): boolean {
  return BARRIER_TILE_KEYS.has(`${Math.round(tile.x)}.${Math.round(tile.y)}`);
}

// Distance mask covers the integer tile grid spanning the barrier set with a
// safety pad in all directions. Float inputs fall through to the precise
// hypot scan so motion samples (which interpolate between tiles) stay
// bit-identical to the prior implementation.
const SEAWALL_DISTANCE_MASK_PAD = 8;
const SEAWALL_DISTANCE_MASK_MIN_X = -SEAWALL_DISTANCE_MASK_PAD;
const SEAWALL_DISTANCE_MASK_MIN_Y = -SEAWALL_DISTANCE_MASK_PAD;
const SEAWALL_DISTANCE_MASK_MAX_X = 56 + SEAWALL_DISTANCE_MASK_PAD;
const SEAWALL_DISTANCE_MASK_MAX_Y = 56 + SEAWALL_DISTANCE_MASK_PAD;
const SEAWALL_DISTANCE_MASK_WIDTH =
  SEAWALL_DISTANCE_MASK_MAX_X - SEAWALL_DISTANCE_MASK_MIN_X;
const SEAWALL_DISTANCE_MASK_HEIGHT =
  SEAWALL_DISTANCE_MASK_MAX_Y - SEAWALL_DISTANCE_MASK_MIN_Y;

let seawallDistanceMask: Float32Array | null = null;

function ensureSeawallDistanceMask(): Float32Array {
  if (seawallDistanceMask) return seawallDistanceMask;
  const mask = new Float32Array(SEAWALL_DISTANCE_MASK_WIDTH * SEAWALL_DISTANCE_MASK_HEIGHT);
  for (let gy = 0; gy < SEAWALL_DISTANCE_MASK_HEIGHT; gy += 1) {
    const tileY = gy + SEAWALL_DISTANCE_MASK_MIN_Y;
    const rowBase = gy * SEAWALL_DISTANCE_MASK_WIDTH;
    for (let gx = 0; gx < SEAWALL_DISTANCE_MASK_WIDTH; gx += 1) {
      const tileX = gx + SEAWALL_DISTANCE_MASK_MIN_X;
      let best = Number.POSITIVE_INFINITY;
      for (const barrier of SEAWALL_BARRIER_TILES) {
        const dx = tileX - barrier.x;
        const dy = tileY - barrier.y;
        const dist = Math.hypot(dx, dy);
        if (dist < best) best = dist;
      }
      mask[rowBase + gx] = best;
    }
  }
  seawallDistanceMask = mask;
  return mask;
}

function computeSeawallBarrierDistance(tile: { x: number; y: number }): number {
  let best = Number.POSITIVE_INFINITY;
  for (const barrier of SEAWALL_BARRIER_TILES) {
    best = Math.min(best, Math.hypot(tile.x - barrier.x, tile.y - barrier.y));
  }
  return best;
}

export function seawallBarrierDistance(tile: { x: number; y: number }): number {
  const x = tile.x;
  const y = tile.y;
  // Integer-tile fast path: O(1) lookup into precomputed mask.
  if (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= SEAWALL_DISTANCE_MASK_MIN_X &&
    x < SEAWALL_DISTANCE_MASK_MAX_X &&
    y >= SEAWALL_DISTANCE_MASK_MIN_Y &&
    y < SEAWALL_DISTANCE_MASK_MAX_Y
  ) {
    const mask = ensureSeawallDistanceMask();
    const gx = x - SEAWALL_DISTANCE_MASK_MIN_X;
    const gy = y - SEAWALL_DISTANCE_MASK_MIN_Y;
    return mask[gy * SEAWALL_DISTANCE_MASK_WIDTH + gx];
  }
  return computeSeawallBarrierDistance(tile);
}

// The rendered wall follows the same blocked coast, but uses denser sub-tile
// sprite placements so the perimeter reads as a continuous limestone ring.
export const SEAWALL_RENDER_PLACEMENTS: readonly SeawallPlacement[] = [
  { assetId: "overlay.seawall-straight", flipX: false, rotation: 0, scale: 0.84, tile: { x: 21.8, y: 27.0 }, yOffset: 1, alphaJitter: 0.03 },
  { assetId: "overlay.seawall-straight", flipX: false, rotation: 0, scale: 0.84, tile: { x: 23.4, y: 25.4 }, yOffset: 1, alphaJitter: -0.02 },
  { assetId: "overlay.seawall-straight", flipX: false, rotation: 0, scale: 0.84, tile: { x: 25.2, y: 23.8 }, yOffset: 1, alphaJitter: 0.01 },
  { assetId: "overlay.seawall-corner", flipX: false, rotation: 0, scale: 0.85, tile: { x: 27.0, y: 22.6 }, yOffset: 2, alphaJitter: 0.01 },
  { assetId: "overlay.seawall-straight", flipX: false, rotation: 0, scale: 0.84, tile: { x: 28.8, y: 22.0 }, yOffset: 1, alphaJitter: -0.02 },
  { assetId: "overlay.seawall-straight", flipX: false, rotation: 0, scale: 0.84, tile: { x: 31.2, y: 22.0 }, yOffset: 1, alphaJitter: 0.02 },
  { assetId: "overlay.seawall-straight", flipX: false, rotation: 0, scale: 0.84, tile: { x: 33.6, y: 22.0 }, yOffset: 1, alphaJitter: -0.01 },
  { assetId: "overlay.seawall-straight", flipX: false, rotation: 0, scale: 0.84, tile: { x: 36.0, y: 22.0 }, yOffset: 1, alphaJitter: 0.02 },
  { assetId: "overlay.seawall-straight", flipX: false, rotation: 0, scale: 0.84, tile: { x: 38.4, y: 22.0 }, yOffset: 1, alphaJitter: -0.03 },
  { assetId: "overlay.seawall-corner", flipX: true, rotation: 0, scale: 0.88, tile: { x: 41.2, y: 24.0 }, yOffset: 2, alphaJitter: 0.04 },
  { assetId: "overlay.seawall-corner", flipX: true, rotation: 0, scale: 0.86, tile: { x: 42.6, y: 26.8 }, yOffset: 1, alphaJitter: -0.01 },
  { assetId: "overlay.seawall-corner", flipX: true, rotation: 0, scale: 0.86, tile: { x: 43.6, y: 29.4 }, yOffset: 1, alphaJitter: 0.01 },
  { assetId: "overlay.seawall-corner", flipX: true, rotation: 0, scale: 0.86, tile: { x: 43.8, y: 32.0 }, yOffset: 1, alphaJitter: -0.02 },
  { assetId: "overlay.seawall-corner", flipX: true, rotation: 0, scale: 0.86, tile: { x: 42.8, y: 34.8 }, yOffset: 1, alphaJitter: 0.03 },
  { assetId: "overlay.seawall-straight", flipX: true, rotation: 0, scale: 0.85, tile: { x: 40.0, y: 36.8 }, yOffset: 1, alphaJitter: -0.02 },
  { assetId: "overlay.seawall-straight", flipX: true, rotation: 0, scale: 0.85, tile: { x: 37.8, y: 38.8 }, yOffset: 1, alphaJitter: 0.01 },
  { assetId: "overlay.seawall-straight", flipX: true, rotation: 0, scale: 0.85, tile: { x: 35.4, y: 40.4 }, yOffset: 1, alphaJitter: 0.03 },
  { assetId: "overlay.seawall-straight", flipX: true, rotation: 0, scale: 0.85, tile: { x: 32.8, y: 41.0 }, yOffset: 1, alphaJitter: -0.03 },
  { assetId: "overlay.seawall-straight", flipX: true, rotation: 0, scale: 0.85, tile: { x: 30.2, y: 41.2 }, yOffset: 1, alphaJitter: 0.02 },
  { assetId: "overlay.seawall-straight", flipX: true, rotation: 0, scale: 0.85, tile: { x: 27.6, y: 40.8 }, yOffset: 1, alphaJitter: -0.02 },
  { assetId: "overlay.seawall-corner", flipX: false, rotation: 0, scale: 0.85, tile: { x: 24.8, y: 39.0 }, yOffset: 2, alphaJitter: 0.01 },
  { assetId: "overlay.seawall-corner", flipX: false, rotation: 0, scale: 0.88, tile: { x: 22.6, y: 37.6 }, yOffset: 2, alphaJitter: 0.03 },
  { assetId: "overlay.seawall-corner", flipX: false, rotation: 0, scale: 0.88, tile: { x: 20.8, y: 35.8 }, yOffset: 2, alphaJitter: -0.01 },
  { assetId: "overlay.seawall-corner", flipX: false, rotation: 0, scale: 0.85, tile: { x: 19.6, y: 33.6 }, yOffset: 1, alphaJitter: 0.04 },
  { assetId: "overlay.seawall-corner", flipX: false, rotation: 0, scale: 0.85, tile: { x: 19.4, y: 31.2 }, yOffset: 1, alphaJitter: -0.03 },
] as const;
