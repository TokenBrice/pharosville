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

// A plain snapshot of the barrier ring. `SEAWALL_BARRIER_TILES` is a lazy
// Proxy (see `lazyArray` above), so every element read on it pays a trap —
// fine for a one-off iteration, ruinous inside the distance-mask build, which
// reads it once per barrier per grid cell (~12 million traps).
let cachedBarrierTiles: readonly { x: number; y: number }[] | null = null;
function getBarrierTiles(): readonly { x: number; y: number }[] {
  if (cachedBarrierTiles) return cachedBarrierTiles;
  cachedBarrierTiles = [...SEAWALL_BARRIER_TILES];
  return cachedBarrierTiles;
}

// The barrier set as a row-major grid flag. This is read from the A* inner
// loop and the navigable-water flood fill — millions of calls per world build
// — where a typed-array index beats a Set lookup on a boxed key.
let cachedBarrierMask: Uint8Array | null = null;
function getBarrierMask(): Uint8Array {
  if (cachedBarrierMask) return cachedBarrierMask;
  const mask = new Uint8Array(PHAROSVILLE_MAP_WIDTH * PHAROSVILLE_MAP_HEIGHT);
  for (const tile of getBarrierTiles()) {
    if (tile.x < 0 || tile.y < 0 || tile.x >= PHAROSVILLE_MAP_WIDTH || tile.y >= PHAROSVILLE_MAP_HEIGHT) continue;
    mask[tile.y * PHAROSVILLE_MAP_WIDTH + tile.x] = 1;
  }
  cachedBarrierMask = mask;
  return mask;
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
  return getBarrierMask()[iy * PHAROSVILLE_MAP_WIDTH + ix] === 1;
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
  // Barrier coordinates as flat typed arrays: the inner loop below runs once
  // per barrier per grid cell, so it must not chase object properties (or, as
  // it used to, Proxy traps) to read them.
  const barriers = getBarrierTiles();
  const barrierX = new Float64Array(barriers.length);
  const barrierY = new Float64Array(barriers.length);
  for (let index = 0; index < barriers.length; index += 1) {
    barrierX[index] = barriers[index]!.x;
    barrierY[index] = barriers[index]!.y;
  }
  const width = PHAROSVILLE_MAP_WIDTH + 2 * SEAWALL_DISTANCE_MASK_PAD;
  const height = PHAROSVILLE_MAP_HEIGHT + 2 * SEAWALL_DISTANCE_MASK_PAD;
  const data = new Float32Array(width * height);
  for (let gy = 0; gy < height; gy += 1) {
    const tileY = gy + SEAWALL_DISTANCE_MASK_MIN_Y;
    const rowBase = gy * width;
    for (let gx = 0; gx < width; gx += 1) {
      const tileX = gx + SEAWALL_DISTANCE_MASK_MIN_X;
      // Compare squared distances and take the root once. argmin is the same
      // under a monotone transform, and for integer tile offsets the sum is
      // exact, so the stored distance is unchanged.
      let bestSquared = Number.POSITIVE_INFINITY;
      for (let index = 0; index < barrierX.length; index += 1) {
        const dx = tileX - barrierX[index]!;
        const dy = tileY - barrierY[index]!;
        const squared = dx * dx + dy * dy;
        if (squared < bestSquared) bestSquared = squared;
      }
      data[rowBase + gx] = Math.sqrt(bestSquared);
    }
  }
  seawallDistanceMask = { data, width, height };
  return seawallDistanceMask;
}

function computeSeawallBarrierDistance(tile: { x: number; y: number }): number {
  let bestSquared = Number.POSITIVE_INFINITY;
  for (const barrier of getBarrierTiles()) {
    const dx = tile.x - barrier.x;
    const dy = tile.y - barrier.y;
    const squared = dx * dx + dy * dy;
    if (squared < bestSquared) bestSquared = squared;
  }
  return Math.sqrt(bestSquared);
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
