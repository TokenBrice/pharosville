/**
 * Seawall model: derives the perimeter masonry placements that ring the main
 * island and exposes the blocked coastal-water ring that motion + path helpers
 * treat as wall-capped water (un-navigable).
 *
 * Cross-file contracts:
 * - `world-layout.ts` imports `isSeawallBarrierTile` to mark coastal water as
 *   blocked. Module-scope state (placements, barrier tiles, distance mask) MUST
 *   stay lazy to dodge a circular-import TDZ between the two modules.
 * - `harbor-district.ts` consumes the placement list to render the actual
 *   `overlay.seawall-*` sprites; do not draw masonry from anywhere else.
 *
 * Risk areas: any change to side detection or offset math shifts both visual
 * placement AND motion blocking simultaneously — keep the two derivations in
 * sync. The straight vs corner sprite choice depends on adjacency; bumping
 * thresholds here can cause masonry "gaps" along diagonal coasts.
 *
 * See `docs/pharosville/CURRENT.md` → seawall paragraph.
 */

import {
  getMainIslandLandMask,
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
} from "./world-layout";

export interface SeawallPlacement {
  assetId:
    | "overlay.seawall-corner"
    | "overlay.seawall-straight"
    | "overlay.seawall-edge-ne"
    | "overlay.seawall-edge-nw";
  flipX: boolean;
  rotation: number;
  scale: number;
  tile: { x: number; y: number };
  yOffset: number;
  alphaJitter: number;
}

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

// Stable pseudo-random alpha jitter so wall stones don't read as a uniform
// stripe. Hash keyed on (x,y,side) so output is deterministic.
function jitter(seed: number): number {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

// Use the existing pale-limestone seawall-straight sprite for every side and
// rotate it to the iso edge angle (±atan(0.5) ≈ ±26.57° from screen-horizontal).
// The pre-generated diagonal variants were darker and had baked end-cap features
// that broke seamless tiling; rotation accepts a small nearest-neighbor pixel
// softness in exchange for one cohesive limestone style and no visible joints.
const ISO_EDGE_ANGLE_DEG = (Math.atan2(1, 2) * 180) / Math.PI;
const SEAWALL_RENDER_SCALE = 0.48;

function makePlacement(input: {
  assetId?: SeawallPlacement["assetId"];
  rotation: number;
  scale?: number;
  seed: number;
  tile: { x: number; y: number };
}): SeawallPlacement {
  return {
    assetId: input.assetId ?? "overlay.seawall-straight",
    flipX: false,
    rotation: input.rotation,
    scale: input.scale ?? SEAWALL_RENDER_SCALE,
    tile: input.tile,
    yOffset: 1,
    alphaJitter: jitter(input.seed) * 0.04,
  };
}

interface AuthoredSeawallSegment {
  end: { x: number; y: number };
  rotation: number;
  scale?: number;
  start: { x: number; y: number };
}

const AUTHORED_SEAWALL_SEGMENTS: readonly AuthoredSeawallSegment[] = [
  // Northern lighthouse harbor: one authored spine ties the lighthouse apron
  // into the BSC shoulder in one continuous run, then hands off to the
  // northern slips and eastern harbor wall.
  { start: { x: 15.4, y: 25.3 }, end: { x: 20.4, y: 36.6 }, rotation: -ISO_EDGE_ANGLE_DEG },
  { start: { x: 15.4, y: 25.3 }, end: { x: 25, y: 23 },    rotation: ISO_EDGE_ANGLE_DEG },
  { start: { x: 25, y: 23 },    end: { x: 28, y: 22 },    rotation: ISO_EDGE_ANGLE_DEG },
  { start: { x: 28, y: 22 },    end: { x: 34, y: 22 },    rotation: ISO_EDGE_ANGLE_DEG },
  { start: { x: 34, y: 22 },    end: { x: 37, y: 23 },    rotation: ISO_EDGE_ANGLE_DEG },
  // Leave a cleaner opening for the Solana / Hyperliquid slips before the
  // wall turns into the east harbor face.
  { start: { x: 39.2, y: 23.7 }, end: { x: 41.4, y: 24.4 }, rotation: ISO_EDGE_ANGLE_DEG },
  { start: { x: 41.4, y: 24.4 }, end: { x: 42.1, y: 26.3 }, rotation: -ISO_EDGE_ANGLE_DEG },
  // Southwest and south quays that connect the market slips to the central pier.
  // The south quay dips to meet the Arbitrum dock at (32,40) then rises back east.
  { start: { x: 20.4, y: 36.6 }, end: { x: 24.4, y: 38.0 }, rotation: ISO_EDGE_ANGLE_DEG },
  { start: { x: 24.2, y: 39.2 }, end: { x: 32, y: 40 },    rotation: ISO_EDGE_ANGLE_DEG },
  { start: { x: 32, y: 40 },    end: { x: 39.2, y: 39.2 }, rotation: ISO_EDGE_ANGLE_DEG },
  // Eastern harbor edge around the observatory gate and Ethereum pier.
  { start: { x: 42.1, y: 26.3 }, end: { x: 42.1, y: 34.5 }, rotation: -ISO_EDGE_ANGLE_DEG },
] as const;

function placementsForSegment(segment: AuthoredSeawallSegment, segmentIndex: number): SeawallPlacement[] {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  const placements: SeawallPlacement[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    placements.push(makePlacement({
      rotation: segment.rotation,
      scale: segment.scale,
      seed: 10_000 + segmentIndex * 101 + step,
      tile: {
        x: segment.start.x + dx * t,
        y: segment.start.y + dy * t,
      },
    }));
  }
  return placements;
}

function computePlacements(): SeawallPlacement[] {
  const placements: SeawallPlacement[] = [];
  const seen = new Set<string>();
  for (const [segmentIndex, segment] of AUTHORED_SEAWALL_SEGMENTS.entries()) {
    for (const placement of placementsForSegment(segment, segmentIndex)) {
      const key = `${placement.tile.x.toFixed(2)}.${placement.tile.y.toFixed(2)}.${placement.rotation.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      placements.push(placement);
    }
  }
  return placements;
}

export const SEAWALL_RENDER_PLACEMENTS: readonly SeawallPlacement[] = lazyArray(computePlacements);
