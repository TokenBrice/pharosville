import {
  DOCK_TILES,
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

// Visual gates: skip rendering a wall sprite at the perimeter edge directly
// seaward of each dock tile so piers can extend through. We pick the dock's
// outward side as the cardinal direction whose 2-step ray reaches deepest into
// open sea — the coarse `|dx| vs |dy|` shortcut misroutes docks like Solana
// (34, 22) into the strait at (35, 22) instead of the open sea above.
function dockGateSide(dock: { x: number; y: number }, mask: Uint8Array): Side | null {
  const center = (PHAROSVILLE_MAP_WIDTH - 1) / 2;
  const W = PHAROSVILLE_MAP_WIDTH;
  const H = PHAROSVILLE_MAP_HEIGHT;
  const isWater = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= W || y >= H) return true; // beyond bounds = open sea
    return mask[y * W + x] !== 1;
  };
  const tileX = Math.round(dock.x);
  const tileY = Math.round(dock.y);
  const dockDist = Math.hypot(dock.x - center, dock.y - center);
  let bestSide: Side | null = null;
  let bestDist = -Infinity;
  const sides: Side[] = ["N", "E", "S", "W"];
  for (const side of sides) {
    const { dx, dy } = offsetForSide(side);
    const wx = tileX + dx;
    const wy = tileY + dy;
    const mx = tileX + dx * 2;
    const my = tileY + dy * 2;
    if (!isWater(wx, wy) || !isWater(mx, my)) continue;
    const waterDist = Math.hypot(wx - center, wy - center);
    if (waterDist <= dockDist) continue;
    if (waterDist > bestDist) {
      bestDist = waterDist;
      bestSide = side;
    }
  }
  return bestSide;
}

function gateEdgeKeys(): Set<string> {
  const mask = getMainIslandLandMask();
  const gates = new Set<string>();
  for (const dock of DOCK_TILES) {
    const side = dockGateSide(dock, mask);
    if (!side) continue;
    const tileX = Math.round(dock.x);
    const tileY = Math.round(dock.y);
    gates.add(`${tileX}.${tileY}.${side}`);
  }
  return gates;
}

// Open-coast raycast: a perimeter edge faces open sea if a ray cast outward
// in its cardinal direction reaches the map boundary within ~OPEN_COAST_REACH
// tiles without hitting land. Edges that hit land within that distance face
// straits or enclosed pockets — placing a wall there reads as an "extra wall"
// inside what should be a passable inlet.
// 5 not 4: the shallow inlet between the lighthouse mountain and the north
// shelf is 4 tiles wide, so a 4-tile reach just misses it.
const OPEN_COAST_REACH = 5;
function isOpenCoast(tile: { x: number; y: number }, side: Side, mask: Uint8Array): boolean {
  const { dx, dy } = offsetForSide(side);
  const W = PHAROSVILLE_MAP_WIDTH;
  const H = PHAROSVILLE_MAP_HEIGHT;
  for (let step = 1; step <= OPEN_COAST_REACH; step += 1) {
    const x = tile.x + dx * step;
    const y = tile.y + dy * step;
    if (x < 0 || y < 0 || x >= W || y >= H) return true;
    if (mask[y * W + x] === 1) return false;
  }
  return true;
}

// Stable pseudo-random alpha jitter so wall stones don't read as a uniform
// stripe. Hash keyed on (x,y,side) so output is deterministic.
function jitter(seed: number): number {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

// Pick the most "outward-facing" side for a tile when it has several perimeter
// edges. Sides whose outward ray reaches open sea win over sides facing into
// straits/concavities; among open-coast sides we still pick the one furthest
// from the civic core so the sprite sits on the visible iso-front of the tile.
function dominantSide(
  tile: { x: number; y: number },
  sides: readonly Side[],
  mask: Uint8Array,
): Side | null {
  const center = (PHAROSVILLE_MAP_WIDTH - 1) / 2;
  let bestSide: Side | null = null;
  let bestScore = -Infinity;
  for (const side of sides) {
    if (!isOpenCoast(tile, side, mask)) continue;
    const { dx, dy } = offsetForSide(side);
    const score = (tile.x - center) * dx + (tile.y - center) * dy;
    if (score > bestScore) {
      bestScore = score;
      bestSide = side;
    }
  }
  return bestSide;
}

// Trace the perimeter as an ordered clockwise loop using a Moore-neighbor walk
// over the perimeter set. This gives us a stable arclength order so the sprite
// subsampling produces an evenly-spaced ring rather than the dense clumps that
// per-tile emission produces along long straight runs.
function tracePerimeterLoop(): { x: number; y: number; sides: Side[] }[] {
  const W = PHAROSVILLE_MAP_WIDTH;
  const sidesByTile = new Map<number, Side[]>();
  for (const edge of computePerimeter()) {
    const key = edge.y * W + edge.x;
    const list = sidesByTile.get(key);
    if (list) list.push(edge.side); else sidesByTile.set(key, [edge.side]);
  }

  // Start from the topmost-leftmost perimeter tile, then walk clockwise. The
  // priority order biases the next step to follow the boundary; for our
  // simply-connected island this is sufficient without a strict Moore-neighbor
  // implementation.
  const candidateKeys = [...sidesByTile.keys()].sort((a, b) => {
    const ay = Math.floor(a / W), ax = a % W;
    const by = Math.floor(b / W), bx = b % W;
    if (ay !== by) return ay - by;
    return ax - bx;
  });
  if (candidateKeys.length === 0) return [];

  const visited = new Set<number>();
  const loop: { x: number; y: number; sides: Side[] }[] = [];
  const directions: Array<{ dx: number; dy: number }> = [
    { dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 1 },
    { dx: -1, dy: 0 }, { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
  ];
  let currentKey = candidateKeys[0];
  // Initial step direction: toward the right (clockwise from top-left is east).
  let lastDirIndex = 0;
  while (currentKey !== undefined && !visited.has(currentKey)) {
    visited.add(currentKey);
    const cx = currentKey % W;
    const cy = Math.floor(currentKey / W);
    loop.push({ x: cx, y: cy, sides: sidesByTile.get(currentKey)! });
    // Next perimeter tile: prefer the direction that continues clockwise.
    // Start the search from (lastDir - 2) to favor a slight right turn.
    let next: number | undefined;
    let nextDirIndex = -1;
    for (let i = 0; i < directions.length; i += 1) {
      const idx = (lastDirIndex + 6 + i) % directions.length;
      const d = directions[idx];
      const nk = (cy + d.dy) * W + (cx + d.dx);
      if (sidesByTile.has(nk) && !visited.has(nk)) {
        next = nk;
        nextDirIndex = idx;
        break;
      }
    }
    currentKey = next!;
    lastDirIndex = nextDirIndex;
  }
  return loop;
}

// Subsampled perimeter: emit one sprite every ~SAMPLE_STRIDE tiles around the
// loop so wall sprites tile cleanly without piling on each other. The straight
// sprite is ~4.2 tile-units wide at scale 0.84, so a stride of 2 leaves ~50%
// overlap — enough for continuity, not so much that the wall reads as a thick
// band on long runs like the south quay.
const SAMPLE_STRIDE = 2;

// Pre-rotated diagonal sprites: seawall-edge-nw runs down-right (matches
// N/S tile-edges in iso); seawall-edge-ne runs down-left/up-right (matches
// E/W tile-edges). For each diagonal, the sprite has its wall face on one
// side; rotating 180° flips it to the opposite outward side without changing
// the long-axis direction. This replaces the canvas-rotated screen-horizontal
// sprite, giving us crisp diagonal pixel art instead of nearest-neighbor
// staircase artifacts.
function spriteForSide(side: Side): {
  assetId: SeawallPlacement["assetId"];
  rotation: number;
} {
  if (side === "N") return { assetId: "overlay.seawall-edge-nw", rotation: 180 };
  if (side === "S") return { assetId: "overlay.seawall-edge-nw", rotation: 0 };
  if (side === "E") return { assetId: "overlay.seawall-edge-ne", rotation: 0 };
  return { assetId: "overlay.seawall-edge-ne", rotation: 180 }; // W
}

function computePlacements(): SeawallPlacement[] {
  const gates = gateEdgeKeys();
  const mask = getMainIslandLandMask();
  const loop = tracePerimeterLoop();
  const placements: SeawallPlacement[] = [];
  for (let i = 0; i < loop.length; i += 1) {
    if (i % SAMPLE_STRIDE !== 0) continue;
    const node = loop[i];
    const side = dominantSide({ x: node.x, y: node.y }, node.sides, mask);
    if (!side) continue; // every side faces a strait/concavity — no wall here
    if (gates.has(`${node.x}.${node.y}.${side}`)) continue;
    const { dx, dy } = offsetForSide(side);
    const tile = { x: node.x + dx * 0.5, y: node.y + dy * 0.5 };
    const sprite = spriteForSide(side);
    const seed = node.x * 53 + node.y * 131 + side.charCodeAt(0);
    placements.push({
      assetId: sprite.assetId,
      flipX: false,
      rotation: sprite.rotation,
      scale: 0.84,
      tile,
      yOffset: 1,
      alphaJitter: jitter(seed) * 0.04,
    });
  }
  return placements;
}

export const SEAWALL_RENDER_PLACEMENTS: readonly SeawallPlacement[] = lazyArray(computePlacements);
