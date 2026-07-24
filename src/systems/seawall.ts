/**
 * Seawall navigation model: derives the blocked coastal-water ring that
 * motion and path helpers treat as wall-capped water.
 *
 * Cross-file contracts:
 * - `world-layout.ts` imports `isSeawallBarrierTile` to mark coastal water as
 *   blocked. Module-scope state (barrier tiles and distance mask) must stay
 *   lazy to dodge a circular-import TDZ between the two modules.
 *
 * Risk area: side detection or offset changes alter the navigable perimeter.
 *
 * See `docs/pharosville/CURRENT.md` → seawall paragraph.
 */

import {
  getMainIslandLandMask,
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
} from "./world-layout";

type Side = "N" | "E" | "S" | "W";
interface PerimeterEdge {
  x: number;
  y: number;
  side: Side;
}

function offsetForSide(side: Side): { dx: number; dy: number } {
  if (side === "N") return { dx: 0, dy: -1 };
  if (side === "E") return { dx: 1, dy: 0 };
  if (side === "S") return { dx: 0, dy: 1 };
  return { dx: -1, dy: 0 };
}

// The island perimeter is every land tile-edge that abuts an in-bounds water
// tile. Derived from the same `mainIslandValue` ellipse union that defines the
// island, so the wall always follows the actual coast — including the
// lighthouse-mountain west coast and the SW arc that the prior hand-authored
// list missed.
let cachedPerimeter: PerimeterEdge[] | null = null;
function computePerimeter(): PerimeterEdge[] {
  if (cachedPerimeter) return cachedPerimeter;
  const mask = getMainIslandLandMask();
  const W = PHAROSVILLE_MAP_WIDTH;
  const H = PHAROSVILLE_MAP_HEIGHT;
  const land = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    return mask[y * W + x] === 1;
  };
  const edges: PerimeterEdge[] = [];
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (!land(x, y)) continue;
      if (y - 1 >= 0 && !land(x, y - 1)) edges.push({ x, y, side: "N" });
      if (x + 1 < W && !land(x + 1, y)) edges.push({ x, y, side: "E" });
      if (y + 1 < H && !land(x, y + 1)) edges.push({ x, y, side: "S" });
      if (x - 1 >= 0 && !land(x - 1, y)) edges.push({ x, y, side: "W" });
    }
  }
  cachedPerimeter = edges;
  return edges;
}

// Lazy array proxy: populates the underlying array on first access. We need
// this because `world-layout.ts` imports `isSeawallBarrierTile` from this
// module, so we cannot evaluate the perimeter at module top-level without
// hitting a TDZ on `world-layout`'s own module-scope `let`s during the cycle.
function lazyArray<T>(filler: () => T[]): T[] {
  const target: T[] = [];
  let ready = false;
  const ensure = () => {
    if (!ready) {
      ready = true;
      target.push(...filler());
    }
    return target;
  };
  return new Proxy(target, {
    get(_t, prop, receiver) { ensure(); return Reflect.get(target, prop, receiver); },
    has(_t, prop) { ensure(); return Reflect.has(target, prop); },
    ownKeys(_t) { ensure(); return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(_t, prop) { ensure(); return Reflect.getOwnPropertyDescriptor(target, prop); },
  });
}

// Barrier tiles: the unique water tile immediately seaward of each perimeter
// edge. Continuous moat (no gates) so ships sail outside the wall — dock
// assignment picks mooring tiles seaward of the barrier.
function computeBarrierTiles(): { x: number; y: number }[] {
  const seen = new Set<number>();
  const tiles: { x: number; y: number }[] = [];
  const W = PHAROSVILLE_MAP_WIDTH;
  for (const edge of computePerimeter()) {
    const { dx, dy } = offsetForSide(edge.side);
    const bx = edge.x + dx;
    const by = edge.y + dy;
    const key = by * W + bx;
    if (seen.has(key)) continue;
    seen.add(key);
    tiles.push({ x: bx, y: by });
  }
  return tiles;
}

export const SEAWALL_BARRIER_TILES: readonly { x: number; y: number }[] = lazyArray(computeBarrierTiles);

let cachedBarrierKeys: Set<number> | null = null;
function getBarrierKeys(): Set<number> {
  if (cachedBarrierKeys) return cachedBarrierKeys;
  const keys = new Set<number>();
  for (const tile of SEAWALL_BARRIER_TILES) keys.add(tile.y * PHAROSVILLE_MAP_WIDTH + tile.x);
  cachedBarrierKeys = keys;
  return keys;
}

export function isSeawallBarrierTile(tile: { x: number; y: number }): boolean {
  return isSeawallBarrierTileXY(tile.x, tile.y);
}

// Zero-alloc overload for the A* hot loop: avoids the per-neighbor object literal
// that the {x,y} signature otherwise forces.
export function isSeawallBarrierTileXY(x: number, y: number): boolean {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= PHAROSVILLE_MAP_WIDTH || iy >= PHAROSVILLE_MAP_HEIGHT) return false;
  return getBarrierKeys().has(iy * PHAROSVILLE_MAP_WIDTH + ix);
}

// Distance mask covers the integer tile grid spanning the barrier set with a
// safety pad in all directions. Float inputs fall through to the precise
// hypot scan so motion samples (which interpolate between tiles) stay
// bit-identical. Bounds are derived lazily from PHAROSVILLE_MAP_WIDTH/HEIGHT
// — referencing them at module top-level would TDZ on the world-layout cycle.
const SEAWALL_DISTANCE_MASK_PAD = 8;
const SEAWALL_DISTANCE_MASK_MIN_X = -SEAWALL_DISTANCE_MASK_PAD;
const SEAWALL_DISTANCE_MASK_MIN_Y = -SEAWALL_DISTANCE_MASK_PAD;

interface SeawallDistanceMask {
  data: Float32Array;
  width: number;
  height: number;
}
let seawallDistanceMask: SeawallDistanceMask | null = null;

function ensureSeawallDistanceMask(): SeawallDistanceMask {
  if (seawallDistanceMask) return seawallDistanceMask;
  const barriers = SEAWALL_BARRIER_TILES;
  const width = PHAROSVILLE_MAP_WIDTH + 2 * SEAWALL_DISTANCE_MASK_PAD;
  const height = PHAROSVILLE_MAP_HEIGHT + 2 * SEAWALL_DISTANCE_MASK_PAD;
  const data = new Float32Array(width * height);
  for (let gy = 0; gy < height; gy += 1) {
    const tileY = gy + SEAWALL_DISTANCE_MASK_MIN_Y;
    const rowBase = gy * width;
    for (let gx = 0; gx < width; gx += 1) {
      const tileX = gx + SEAWALL_DISTANCE_MASK_MIN_X;
      let best = Number.POSITIVE_INFINITY;
      for (const barrier of barriers) {
        const dx = tileX - barrier.x;
        const dy = tileY - barrier.y;
        const dist = Math.hypot(dx, dy);
        if (dist < best) best = dist;
      }
      data[rowBase + gx] = best;
    }
  }
  seawallDistanceMask = { data, width, height };
  return seawallDistanceMask;
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
  if (Number.isInteger(x) && Number.isInteger(y)) {
    const mask = ensureSeawallDistanceMask();
    const gx = x - SEAWALL_DISTANCE_MASK_MIN_X;
    const gy = y - SEAWALL_DISTANCE_MASK_MIN_Y;
    if (gx >= 0 && gy >= 0 && gx < mask.width && gy < mask.height) {
      // Integer-tile fast path: O(1) lookup into precomputed mask.
      return mask.data[gy * mask.width + gx];
    }
  }
  return computeSeawallBarrierDistance(tile);
}
