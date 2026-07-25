import {
  CEMETERY_CENTER,
  DOCK_TILES,
  MAX_TILE_X,
  MAX_TILE_Y,
  PIGEONNIER_HARBOR_DOCK_TILE,
  PIGEON_ISLAND_CENTER,
  PIGEON_ISLAND_RADIUS,
} from "./world-layout";
import { stableFnv1aHash } from "./stable-random";
import { landWorldTile } from "./map-scale";

// Zones-v2 placement fix (2026-07-24): ship-vs-land exclusion for the RENDERED
// garden composition. The data map (`terrainKindAt` in world-layout.ts) and
// the garden island mesh are intentionally display-vs-data decoupled: the
// rendered island root sits at `gardenIslandDisplayTile` = (30,36), NOT at the
// data island center (31,31). The zones-v2 ring redistribution assumed the
// data center, so Calm/Watch representatives moored on the rendered rock.
//
// The shapes below are calibrated against the garden meshes themselves:
// - Island: the bottom terrace ellipse of `createTerracedIsland`
//   (bottomRadius 18.4 world, scaleZ 0.75, local offset (0.6,1.2)) widened by
//   ~0.7 tiles for the shoreline boulder ring. Verified against rendered
//   captures: moorings at ellipse value ≥ ~1.05 read as open water, hulls at
//   value < 1 sit on the rock.
// - Garden islets (garden-islets.ts): purely decorative meshes absent from the
//   terrain model, so no data-side check ever avoided them. Radii = stone
//   group span + ~1 tile.
// - Cemetery/pigeonnier: data anchors (world-layout) + ~0.8 tile buffer.
//
// All math is in TILE space (world units / √2). This module must stay
// three-free so systems and motion code can import it.

interface GardenEllipse {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/** Rendered island rock footprint (terrace + shoreline boulders), tile space. */
export const GARDEN_ISLAND_OBSTACLE: GardenEllipse = {
  // N1: authored in design space; offset onto the enlarged grid so the
  // footprint tracks the island, whose absolute size did not change.
  ...landWorldTile({ x: 30.42, y: 36.85 }),
  rx: 13.9,
  ry: 10.5,
};

/**
 * N2: the cemetery islet no longer exists — dead stablecoins are wrecks
 * scattered across the south-west wreck shoals, which are open water. The
 * obstacle is kept as a small courtesy clearance around the densest cluster so
 * a live hull never parks inside a wreck, but it no longer walls off a
 * landmass that is not there.
 */
export const GARDEN_CEMETERY_OBSTACLE: GardenEllipse = {
  x: CEMETERY_CENTER.x,
  y: CEMETERY_CENTER.y,
  rx: 3.2,
  ry: 2.4,
} as const;

interface GardenCircle {
  x: number;
  y: number;
  r: number;
}

/** Decorative garden islets (crane, turtle, lone), tile space. */
export const GARDEN_ISLET_OBSTACLES: readonly GardenCircle[] = [
  // Landmasses: design space, offset onto the enlarged grid (N1).
  { ...landWorldTile({ x: 28, y: 8 }), r: 2.7 }, // crane
  { ...landWorldTile({ x: 4, y: 20 }), r: 3.7 }, // turtle
  { ...landWorldTile({ x: 26, y: 44 }), r: 2.5 }, // lone
];

/** Rendered pigeonnier islet (single-tile platform + buffer), tile space. */
export const GARDEN_PIGEONNIER_OBSTACLE: GardenCircle = {
  x: PIGEON_ISLAND_CENTER.x,
  y: PIGEON_ISLAND_CENTER.y,
  r: PIGEON_ISLAND_RADIUS.x + 0.9,
} as const;

/**
 * Dock/pier structures a free-moored ship must clear (zone representatives
 * only — docked ships intentionally moor beside these). Circles cover the
 * pier deck and its moored-workings apron; the keeper's rowboat and the
 * beacon-tower base sit inside the island obstacle already. Dock aprons take
 * only HALF the ship's hull margin (unlike solid landmasses, which take the
 * full half-length): piers are low, narrow decks a tangentially-moored hull
 * reads clear of, and a full-length apron around every wharf would make the
 * harbor ring un moorable for titans.
 */
const GARDEN_DOCK_OBSTACLES: readonly GardenCircle[] = [
  ...DOCK_TILES.map((tile) => ({ x: tile.x, y: tile.y, r: 2.2 })),
  { x: PIGEONNIER_HARBOR_DOCK_TILE.x, y: PIGEONNIER_HARBOR_DOCK_TILE.y, r: 2.2 },
] as const;
const DOCK_MARGIN_SHARE = 0.5;

// Hull plan half-length (pivot-to-bow) at visual scale 1, world units — the
// clipper/galleon plan outlines in garden-ships.ts span ~4.85 world units.
// TILE_TO_WORLD duplicates garden-util's TILE_SCALE (√2) so this module stays
// three-free.
const HULL_BOW_REACH_WORLD = 4.9;
const TILE_TO_WORLD = Math.SQRT2;
// Bob/sway and Chaikin path-smoothing allowance on top of the hull plan.
const SWAY_ALLOWANCE_TILES = 0.4;

/**
 * Water margin (tiles) a ship needs beyond every obstacle so its hull never
 * overlaps rock at any bob/sway: the ship's visual half-length plus a small
 * sway allowance. `visualScale` is the RENDERED scale (see
 * `gardenShipVisualScale` in garden-observatory-slice.ts).
 */
export function gardenShipWaterMarginTiles(visualScale: number): number {
  const scale = Math.max(0.4, visualScale || 1);
  return (HULL_BOW_REACH_WORLD * scale) / TILE_TO_WORLD + SWAY_ALLOWANCE_TILES;
}

function ellipseValue(point: { x: number; y: number }, ellipse: GardenEllipse, margin: number): number {
  const rx = ellipse.rx + margin;
  const ry = ellipse.ry + margin;
  return ((point.x - ellipse.x) / rx) ** 2 + ((point.y - ellipse.y) / ry) ** 2;
}

function circleValue(point: { x: number; y: number }, circle: GardenCircle, margin: number): number {
  const r = circle.r + margin;
  return ((point.x - circle.x) / r) ** 2 + ((point.y - circle.y) / r) ** 2;
}

/**
 * True when the tile-center at (x, y) falls inside a rendered landmass
 * (island rock, garden islets, cemetery, pigeonnier). Used by data-side
 * placement and A* motion routing so ships and waypoints never occupy or
 * cross rendered rock. Docks are deliberately excluded: moorings live
 * beside them by design.
 */
export function isGardenObstacleTile(x: number, y: number): boolean {
  const point = { x, y };
  if (ellipseValue(point, GARDEN_ISLAND_OBSTACLE, 0) < 1) return true;
  if (ellipseValue(point, GARDEN_CEMETERY_OBSTACLE, 0) < 1) return true;
  if (circleValue(point, GARDEN_PIGEONNIER_OBSTACLE, 0) < 1) return true;
  for (const islet of GARDEN_ISLET_OBSTACLES) {
    if (circleValue(point, islet, 0) < 1) return true;
  }
  return false;
}

/**
 * True when `point` is valid open water for a ship needing `marginTiles`
 * clearance: inside the map and outside every rendered obstacle (expanded by
 * the margin). With `includeDocks`, dock/pier aprons count as obstacles too —
 * use that for free-moored zone placement, never for dock traffic.
 */
export function isGardenShipWater(
  point: { x: number; y: number },
  marginTiles: number,
  includeDocks = false,
): boolean {
  if (point.x < 0 || point.y < 0 || point.x > MAX_TILE_X || point.y > MAX_TILE_Y) return false;
  if (ellipseValue(point, GARDEN_ISLAND_OBSTACLE, marginTiles) < 1) return false;
  if (ellipseValue(point, GARDEN_CEMETERY_OBSTACLE, marginTiles) < 1) return false;
  if (circleValue(point, GARDEN_PIGEONNIER_OBSTACLE, marginTiles) < 1) return false;
  for (const islet of GARDEN_ISLET_OBSTACLES) {
    if (circleValue(point, islet, marginTiles) < 1) return false;
  }
  if (includeDocks) {
    const dockMargin = marginTiles * DOCK_MARGIN_SHARE;
    for (const dock of GARDEN_DOCK_OBSTACLES) {
      if (circleValue(point, dock, dockMargin) < 1) return false;
    }
  }
  return true;
}

/**
 * Deterministic nearest-valid-water resolver: returns `point` unchanged when
 * already valid, otherwise rejection-samples expanding rings around it
 * (several seeded angles per ring so a nearby valid arc beats a far random
 * one) and takes the first valid candidate. The map is mostly water, so the
 * search always succeeds well within the attempt budget; the final fallback
 * merely clamps into bounds (never onto land — every obstacle is far from
 * the map edge).
 */
export function nearestGardenShipWater(
  point: { x: number; y: number },
  marginTiles: number,
  seed: string,
  includeDocks = false,
): { x: number; y: number } {
  if (isGardenShipWater(point, marginTiles, includeDocks)) return point;
  const ANGLES_PER_RING = 6;
  for (let attempt = 0; attempt < 40 * ANGLES_PER_RING; attempt += 1) {
    const radius = 0.75 + Math.floor(attempt / ANGLES_PER_RING) * 0.5;
    // FNV-1a: sequential attempt suffixes avalanche into unrelated angles
    // (the djb2-based stableUnit barely moves for ".N" suffixes).
    const angle = (stableFnv1aHash(`${seed}.${attempt}`) / 0xffffffff) * Math.PI * 2;
    const candidate = {
      x: Math.max(0, Math.min(MAX_TILE_X, point.x + Math.cos(angle) * radius)),
      y: Math.max(0, Math.min(MAX_TILE_Y, point.y + Math.sin(angle) * radius)),
    };
    if (isGardenShipWater(candidate, marginTiles, includeDocks)) return candidate;
  }
  return {
    x: Math.max(0, Math.min(MAX_TILE_X, point.x)),
    y: Math.max(0, Math.min(MAX_TILE_Y, point.y)),
  };
}
