import type { GraveNode, PharosVilleMap, PharosVilleTile, ShipRiskPlacement, TerrainKind, TileKind } from "./world-types";
import type { CemeteryEntry } from "@shared/lib/cemetery-merged";
import { RISK_WATER_REGION_TILES } from "./risk-water-areas";
import { mulberry32 } from "./rng";
import { isSeawallBarrierTile } from "./seawall";
import { stableHash, stableUnit } from "./stable-random";
import { clamp } from "./motion-utils";
import {
  PHAROSVILLE_DESIGN_SPAN,
  PHAROSVILLE_LAND_OFFSET,
  PHAROSVILLE_MAP_SCALE as MAP_SCALE,
  landWorldTile,
  zoneWorldTile,
} from "./map-scale";

/**
 * N1 (2026-07-25): the world grew 2x on each axis — 4x the sea.
 *
 * At 56x56 the island plus its unattributed halo took the whole middle of the
 * map, leaving roughly 10 eligible water tiles per ship. With ~187 ships that
 * read as a packed quay with no room to sail, moor or manoeuvre (operator:
 * "still super packed... we could easily 2x the map size").
 *
 * Rather than re-author every hardcoded ellipse, corner and bounds box, the
 * terrain stays authored in its original 56-tile DESIGN SPACE and two
 * transforms map it onto the larger grid:
 *
 * - `landDesign` OFFSETS world tiles into design space, so the island,
 *   cemetery and pigeonnier keep their exact absolute size and shape and
 *   simply sit in a bigger sea.
 * - `zoneDesign` SCALES world tiles into design space, so the DEWS regions
 *   stretch to fill the new map and every band gains proportional water.
 *
 * The result: same island, 4x the sailable sea.
 */
export { PHAROSVILLE_MAP_SCALE } from "./map-scale";
const DESIGN_SPAN = PHAROSVILLE_DESIGN_SPAN;
/** Width of the PharosVille tile grid, in tiles. */
export const PHAROSVILLE_MAP_WIDTH = DESIGN_SPAN * MAP_SCALE;
/** Height of the PharosVille tile grid, in tiles. */
export const PHAROSVILLE_MAP_HEIGHT = DESIGN_SPAN * MAP_SCALE;
/** Inclusive max coordinate in DESIGN space, for the zone predicates below. */
const MAX_DESIGN_X = DESIGN_SPAN - 1;
const MAX_DESIGN_Y = DESIGN_SPAN - 1;
/** Offset that centres the design-space landmasses on the enlarged grid. */
const LAND_OFFSET = PHAROSVILLE_LAND_OFFSET;

/** World tile -> design tile for LANDMASSES (absolute size preserved). */
function landDesignX(x: number): number { return x - LAND_OFFSET; }
function landDesignY(y: number): number { return y - LAND_OFFSET; }
/** Design tile -> world tile, for exported landmass anchors. */
const landWorld = landWorldTile;
/**
 * World tile -> design tile for ZONE geometry (stretched to fill the map).
 *
 * H4: the map is the exact inverse of `zoneWorldTile` — design 0 to world 0,
 * design 55 to the LAST world tile — rather than a plain `x / MAP_SCALE`.
 *
 * The zone predicates are written against design TILE INDICES with inclusive
 * bounds (`x <= 30`, `y > 9 -> false`). A plain divide stretches the design box
 * to [0, 55.6] at MAP_SCALE 2.5, which pushes the outer part of every
 * edge-authored band past its own bound and drops it back to open sea. Mapping
 * the world span onto exactly [0, 55] keeps every authored bound meaning what
 * it says at any scale, integer or not.
 */
const DESIGN_LAST = DESIGN_SPAN - 1;
const WORLD_LAST = DESIGN_SPAN * MAP_SCALE - 1;
function zoneDesignX(x: number): number { return (x * DESIGN_LAST) / WORLD_LAST; }
function zoneDesignY(y: number): number { return (y * DESIGN_LAST) / WORLD_LAST; }
/**
 * The design TILE a world tile falls in — the rounded form of the above.
 *
 * The zone bands are a hand-authored 56x56 tile diagram, and every rectangular
 * bound in it (`x <= 30`, `y > 9 -> false`, `x + y >= 78`) names whole tiles.
 * Feeding those a continuous coordinate re-reads the outer fraction of each
 * authored tile as being outside the band, which at MAP_SCALE 2.5 dropped
 * strips of Ledger and Calm back to open sea. The ellipse rings keep the
 * continuous form: their boundaries are curves, not tile edges.
 */
interface ZonePoint {
  /** Continuous design coordinate, for the ellipse rings. */
  x: number;
  y: number;
  /** Design TILE index, for the authored rectangular bounds. */
  tileX: number;
  tileY: number;
}

function zonePointAt(worldX: number, worldY: number): ZonePoint {
  const x = zoneDesignX(worldX);
  const y = zoneDesignY(worldY);
  return { x, y, tileX: Math.round(x), tileY: Math.round(y) };
}
/** Inclusive maximum x-coordinate for valid tiles (`PHAROSVILLE_MAP_WIDTH - 1`). */
export const MAX_TILE_X = PHAROSVILLE_MAP_WIDTH - 1;
/** Inclusive maximum y-coordinate for valid tiles (`PHAROSVILLE_MAP_HEIGHT - 1`). */
export const MAX_TILE_Y = PHAROSVILLE_MAP_HEIGHT - 1;
/** Anchor tile for the lighthouse on the western promontory; sprites and beam math hang off this point. */
export const LIGHTHOUSE_TILE = landWorld({ x: 18, y: 28 });
/**
 * Chebyshev tile distance: any sea tile within this many tiles of land is rendered
 * as generic "water" (no DEWS zone), giving the island a non-attributed halo
 * before named edge-water districts begin.
 */
export const ISLAND_PERIPHERY_TILE_DISTANCE = 4;

// Zone geometry constants.
// East-corner Alert/Warning/Danger rings share a single ellipse anchored at
// the (55, 0) corner. Thresholds slice that ellipse into three concentric
// bands; isSoutheastWatchShelf re-uses ALERT_RING_OUTER as a guard so it never
// claims tiles that should be Alert.
const EAST_CORNER_CENTER = { x: 55, y: 0 } as const;
const SOUTHEAST_CORNER_CENTER = { x: 55, y: 55 } as const;
// N2 (2026-07-25): the ship graveyard. Dead and frozen stablecoins used to sit
// as headstones on a detached islet; they are now an accumulation of wrecks
// over a corner of the SEA. The south-west corner is the far pole from the
// north-east storm corner, so the map reads danger at one end and memory at
// the other.
const WRECK_CORNER_CENTER = { x: 0, y: 55 } as const;
const WRECK_CORNER_RADIUS = 17;
const CORNER_RADIUS = 14;
const DANGER_RING_OUTER = 0.26;
const WARNING_RING_OUTER = 0.66;
const ALERT_RING_INNER = 0.66;
const ALERT_RING_OUTER = 1.63;

// South breakwater basin shared between Watch Breakwater (primary) and the
// Calm Anchorage southBay fallback.
const SOUTH_BASIN_BOUNDS = { minX: 16, maxX: 44, minY: 45 } as const;

// WATCH is the next east-corner ring outside Alert before the map transitions
// into the south/southeast breakwater basin.
const WATCH_RING_OUTER = 7.0;
const SOUTH_SHELF_MIN_Y = 37;
const SOUTH_SHELF_DIAGONAL_THRESHOLD = 78;
const CALM_SOUTH_BASIN_PATCH = { minX: 16, maxX: 37, minY: 45, maxY: MAX_DESIGN_Y } as const;
const CALM_EAST_SHOULDER_PATCH = { minX: 40, maxX: 47, minY: 31, maxY: 38 } as const;
const CALM_LOWER_BREAKWATER_PATCH = { minX: 30, maxX: 42, minY: 42, maxY: 47 } as const;

/** Canonical anchor tile per DEWS risk region; ships in a given region drift around this point. */
export const REGION_TILES: Record<ShipRiskPlacement, { x: number; y: number }> = RISK_WATER_REGION_TILES;

/** Ethereum L2 chain IDs that share the EVM bay docks (excludes the L1 itself). */
export const ETHEREUM_L2_DOCK_CHAIN_IDS = ["base", "arbitrum", "polygon"] as const;
/** Chain IDs that get priority placement around the Ethereum harbor (L1 + L2s). */
export const ETHEREUM_HARBOR_PRIORITY_CHAIN_IDS = ["ethereum", ...ETHEREUM_L2_DOCK_CHAIN_IDS] as const;

/**
 * H1 (2026-07-25): the harbour ring is DERIVED from the island's coastline,
 * not hand-authored.
 *
 * The authored tiles had drifted inland — six of the twelve sat at an ellipse
 * value below 0.90, which on a 24x19 island is one to three tiles up the slope
 * from the water. Cardinal-adjacency to water (the old contract) is not the
 * same as being ON the coast, so harbours read as buildings dropped in the
 * middle of the island rather than as a ring of quays around it. They were
 * also bunched: six of twelve on the southern arc, none on the west.
 *
 * Every slot is now a bearing. `shoreDockTile` marches outward from the island
 * centre along that bearing and returns the LAST land tile before the water,
 * so a harbour is on the coast by construction and stays there if the island's
 * shape is ever retuned.
 */
const ISLAND_DESIGN_CENTER = { x: 31, y: 31 };
/**
 * Thirteen evenly spaced bearings from due north, clockwise. Bearing 10
 * (~187deg, due west) is dropped: it lands on the lighthouse promontory, and
 * the Pharos gets the west coast to itself. That leaves TWELVE ring slots,
 * numbered clockwise from north by `harborRingTile`.
 */
const HARBOR_RING_BEARINGS = 13;
const LIGHTHOUSE_RING_BEARING = 10;

/**
 * The outermost land tile along `bearingDeg` from the island centre.
 *
 * Marched rather than solved: the coast is a union of two ellipses, and the
 * march also guarantees the returned tile is one the tile grid actually
 * contains (a solved boundary point rounds to a tile that may be water).
 */
function shoreDockTile(bearingDeg: number): { x: number; y: number } {
  const radians = (bearingDeg * Math.PI) / 180;
  const stepX = Math.cos(radians);
  const stepY = Math.sin(radians);
  let shore = { ...ISLAND_DESIGN_CENTER };
  for (let radius = 1; radius <= 24; radius += 0.1) {
    const tile = {
      x: Math.round(ISLAND_DESIGN_CENTER.x + stepX * radius),
      y: Math.round(ISLAND_DESIGN_CENTER.y + stepY * radius),
    };
    if (mainIslandDesignValue(tile.x, tile.y) >= 1) break;
    shore = tile;
  }
  return landWorld(shore);
}

/**
 * Ring slot -> shore tile. Slot 0 is due north and slots run clockwise,
 * skipping the lighthouse promontory so the twelve slots are contiguous.
 */
function harborRingTile(slot: number): { x: number; y: number } {
  const bearing = slot < LIGHTHOUSE_RING_BEARING ? slot : slot + 1;
  return shoreDockTile(-90 + (bearing * 360) / HARBOR_RING_BEARINGS);
}

// The ten chains that get a named slip take ring slots 0..9 — a continuous run
// from due north, clockwise through east and south, to the west-south-west.
// Slots 10 and 11 (WNW and NNW, flanking the Pharos) are the spare slips, so a
// world with fewer chains still leaves its gap on the lighthouse's coast rather
// than punching a hole in the middle of the ring.
/** Dock tile reserved for Base; named so Base-specific scenery can resolve it without index lookups. */
export const BASE_HARBOR_DOCK_TILE = harborRingTile(3);
/**
 * The EVM bay: four contiguous slots on the north-east-to-south-east arc, in
 * the order ethereum, base, arbitrum, polygon. Contiguity is the point — the L1
 * and its L2s read as one district.
 */
export const EVM_BAY_DOCK_TILES = [
  harborRingTile(2), // ethereum (NE)
  BASE_HARBOR_DOCK_TILE, // base (E)
  harborRingTile(4), // arbitrum (ESE)
  harborRingTile(5), // polygon (SE)
] as const;

/** Dedicated Hyperliquid dock tile (SSW coast, below the EVM bay). */
export const HYPERLIQUID_HARBOR_DOCK_TILE = harborRingTile(8);
/** Dedicated Solana dock tile (WSW coast, under the Pharos promontory). */
export const SOLANA_HARBOR_DOCK_TILE = harborRingTile(9);
/**
 * The outer ring: the north and north-east approach, then the south and west
 * coasts continuing clockwise from the EVM bay. Slots [0..5] map to bsc, tron,
 * solana, hyperliquid, aptos, avalanche; [6..7] are the spare slips.
 */
export const OUTER_HARBOR_DOCK_TILES = [
  harborRingTile(6), // bsc (SSE)
  harborRingTile(1), // tron (NNE)
  SOLANA_HARBOR_DOCK_TILE, // solana (WSW, under the Pharos)
  HYPERLIQUID_HARBOR_DOCK_TILE, // hyperliquid (SSW)
  harborRingTile(0), // aptos (N)
  harborRingTile(7), // avalanche (S)
  harborRingTile(10), // spare: WNW, north of the Pharos
  harborRingTile(11), // spare: NNW
] as const;

/** Lookup of preferred dock tile per chain ID. Docking systems try this tile first before falling back to nearest-available water. */
export const PREFERRED_DOCK_TILES: Record<string, { x: number; y: number }> = {
  ethereum: EVM_BAY_DOCK_TILES[0],
  base: EVM_BAY_DOCK_TILES[1],
  arbitrum: EVM_BAY_DOCK_TILES[2],
  polygon: EVM_BAY_DOCK_TILES[3],
  bsc: OUTER_HARBOR_DOCK_TILES[0],
  tron: OUTER_HARBOR_DOCK_TILES[1],
  solana: SOLANA_HARBOR_DOCK_TILE,
  hyperliquid: HYPERLIQUID_HARBOR_DOCK_TILE,
  aptos: OUTER_HARBOR_DOCK_TILES[4],
  avalanche: OUTER_HARBOR_DOCK_TILES[5],
};

/** Set form of `ETHEREUM_HARBOR_PRIORITY_CHAIN_IDS` for O(1) membership checks in render/docking hot paths. */
export const EVM_BAY_CHAIN_IDS = new Set<string>(ETHEREUM_HARBOR_PRIORITY_CHAIN_IDS);

/** Flattened union of EVM-bay and outer-harbor dock tiles, used wherever the seawall and dock chrome iterate every dock. */
export const DOCK_TILES = [
  ...EVM_BAY_DOCK_TILES,
  ...OUTER_HARBOR_DOCK_TILES,
];

// Cemetery remains a separate memorial islet, snapped to the bottom-left edge
// as in the positioning source while staying outside the central island model.
/** Center of the cemetery scatter region (the planted graves) on the bottom-left memorial islet. */
// N2: the graveyard is a stretch of SEA in the south-west corner, not an
// islet. Zone space, so it scales with the map like the other water zones.
export const CEMETERY_CENTER = zoneWorldTile({ x: 6.0, y: 49.0 });
/** Ellipse half-axes for the inner planted-grave region (graves stay within this footprint). */
// Wrecks scatter across the shoals rather than crowding a churchyard plot.
export const CEMETERY_RADIUS = { x: 12.0, y: 9.0 } as const;
/** Ellipse half-axes for the outer cemetery islet landmass that surrounds the graves. */
export const CEMETERY_ISLAND_RADIUS = { x: 5.4, y: 3.8 } as const;

// Pigeonnier islet in the southeast Watch Breakwater shelf — a single-tile
// messenger-tower platform far enough from the main shipping lanes that
// ships rarely overlap the silhouette. Carries the PharosWatch dispatch
// sprite + plaque only.
/**
 * Center of the southeast pigeonnier islet (PharosWatch dispatch tower).
 *
 * N1: unlike the main island and the cemetery, this islet is authored relative
 * to a ZONE (the southeast Watch Breakwater shelf), not to the island — so it
 * takes the zone transform. Offsetting it instead left it straddling the
 * calm/watch boundary, out of the shelf it is named for. Only the CENTER is
 * transformed; `PIGEON_ISLAND_RADIUS` keeps the platform one tile wide.
 */
export const PIGEON_ISLAND_CENTER = zoneWorldTile({ x: 50, y: 50 });
/** Ellipse half-axes of the single-tile pigeonnier islet. */
export const PIGEON_ISLAND_RADIUS = { x: 0.7, y: 0.7 } as const;
/** Dock tile adjacent to the pigeonnier islet (one tile west of `PIGEON_ISLAND_CENTER`). */
export const PIGEONNIER_HARBOR_DOCK_TILE = { x: PIGEON_ISLAND_CENTER.x - 1, y: PIGEON_ISLAND_CENTER.y } as const;
/** Chain IDs whose ships moor at the pigeonnier islet rather than the main harbor ring. */
export const PIGEONNIER_HARBOR_CHAIN_IDS = ["ton"] as const;

PREFERRED_DOCK_TILES.ton = PIGEONNIER_HARBOR_DOCK_TILE;

type GraveMarker = GraveNode["visual"]["marker"];

function ellipseValue(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
}

const WATER_TERRAIN_KINDS = new Set<TerrainKind>([
  "deep-water",
  "water",
  "alert-water",
  "calm-water",
  "harbor-water",
  "watch-water",
  "warning-water",
  "storm-water",
  "ledger-water",
  "wreck-water",
]);

/** True if `kind` is one of the water terrain kinds (deep, calm, alert, harbor, watch, warning, storm, ledger, generic). */
export function isWaterTileKind(kind: TileKind | TerrainKind): boolean {
  return WATER_TERRAIN_KINDS.has(kind as TerrainKind);
}

/** Returns the canonical (collapsed) `TileKind` at `(x, y)`. Detail-level terrain is mapped down to the small render-time enum. */
export function tileKindAt(x: number, y: number): TileKind {
  return canonicalTileKind(terrainKindAt(x, y));
}

/** Returns the full `TerrainKind` (water sub-zone, rock, grass, shore, ...) at `(x, y)`. Source of truth for terrain classification. */
export function terrainKindAt(x: number, y: number): TerrainKind {
  const island = islandValue(x, y);
  const cemetery = cemeteryValue(x, y);
  const nearIslandEdge = island > 0.9;

  if (isOutOfBounds(x, y) || island >= 1) {
    // N1: zone geometry is authored in design space and SCALED onto the
    // enlarged grid, so every DEWS band stretches to fill the bigger map and
    // gains proportional sailable water. Landmass tests above stay in world
    // space (they are offset, not scaled, so the island keeps its size).
    const zone = zonePointAt(x, y);
    const { x: zx, y: zy } = zone;
    const inIslandPeriphery = isWithinIslandPeriphery(x, y);
    const clearance = isLighthouseVisualClearance(x, y);
    if (!clearance && isCalmAnchoragePeripheryOverride(zone)) return "calm-water";
    if (!clearance && isWatchBreakwaterPeripheryOverride(zone)) return "watch-water";
    if (!inIslandPeriphery && !clearance) {
      if (isDangerStrait(zx, zy)) return "storm-water";
      if (isWarningShoals(zx, zy)) return "warning-water";
      if (isLedgerMooring(zone)) return "ledger-water";
      if (isAlertChannel(zx, zy)) return "alert-water";
      if (isWatchBreakwater(zone)) return "watch-water";
      if (isWreckShoals(zx, zy)) return "wreck-water";
      if (isCalmAnchorage(zone)) return "calm-water";
    }
    if (isTopShelfOpenWaterGap(zone)) return "watch-water";
    if (isDeepSeaShelfWorld(x, y)) return "deep-water";
    if (inIslandPeriphery || clearance) return "water";
    return "calm-water";
  }

  if (cemetery < 1) return "grass";
  if (nearIslandEdge) return "shore";
  // Rock outcrops are island features: design space, offset only.
  const rx = landDesignX(x);
  const ry = landDesignY(y);
  if (ellipseValue(rx, ry, 31.3, 31.2, 7.2, 5.9) < 0.7) return "rock";
  if (ellipseValue(rx, ry, 39.0, 29.6, 5.8, 5.2) < 0.58) return "rock";
  return "grass";
}

function canonicalTileKind(kind: TerrainKind): TileKind {
  if (kind === "deep-water") return "deep-water";
  if (isWaterTileKind(kind)) return "water";
  if (kind === "road") return "road";
  if (kind === "shore" || kind === "beach" || kind === "cliff") return "shore";
  return "land";
}

function islandValue(x: number, y: number): number {
  return Math.min(
    mainIslandValue(x, y),
    // Detached southeast pigeonnier islet (PharosWatch dispatch).
    ellipseValue(x, y, PIGEON_ISLAND_CENTER.x, PIGEON_ISLAND_CENTER.y, PIGEON_ISLAND_RADIUS.x, PIGEON_ISLAND_RADIUS.y),
  );
}

function mainIslandValue(x: number, y: number): number {
  // N1: the island is authored in design space and OFFSET (not scaled) onto
  // the enlarged grid, so it keeps its exact size while the sea grows around it.
  return mainIslandDesignValue(landDesignX(x), landDesignY(y));
}

/** The island field in DESIGN space. `mainIslandValue` is its world-space face. */
function mainIslandDesignValue(dx: number, dy: number): number {
  return Math.min(
    // Main horizontal oval. The wall traces this perimeter as a smooth ring.
    ellipseValue(dx, dy, 31.0, 31.0, 12.0, 9.5),
    // Lighthouse promontory: bulges west so the lighthouse anchors the W
    // coast. Sized to overlap the main oval enough that the union has no
    // concavity at the junction (which would otherwise produce a small
    // strait pocket and an "extra wall" inside the harbor area).
    ellipseValue(dx, dy, 19.5, 28.5, 4.0, 3.0),
  );
}

function isAlertChannel(x: number, y: number): boolean {
  const value = eastCornerRiskValue(x, y);
  return value >= ALERT_RING_INNER && value < ALERT_RING_OUTER;
}

function isWarningShoals(x: number, y: number): boolean {
  const value = eastCornerRiskValue(x, y);
  return value >= DANGER_RING_OUTER && value < WARNING_RING_OUTER;
}

function isDangerStrait(x: number, y: number): boolean {
  return eastCornerRiskValue(x, y) < DANGER_RING_OUTER;
}

/**
 * The wreck shoals (N2): slack, shallow water in the south-west corner where
 * dead and frozen stablecoins come to rest. A lifecycle record, not a live
 * market signal — the Entity Meaning contract for cemetery markers is
 * unchanged, only their setting is.
 */
function isWreckShoals(x: number, y: number): boolean {
  return ellipseValue(x, y, WRECK_CORNER_CENTER.x, WRECK_CORNER_CENTER.y, WRECK_CORNER_RADIUS, WRECK_CORNER_RADIUS) < 1;
}

function eastCornerRiskValue(x: number, y: number): number {
  return ellipseValue(x, y, EAST_CORNER_CENTER.x, EAST_CORNER_CENTER.y, CORNER_RADIUS, CORNER_RADIUS);
}

// Visual buffer around the lighthouse sprite on the generated island mountain:
// keep adjacent water generic so DEWS labels and zone textures do not crowd it.
function isLighthouseVisualClearance(x: number, y: number): boolean {
  // Island-adjacent: design space, OFFSET onto the enlarged grid (N1).
  const dx = landDesignX(x);
  const dy = landDesignY(y);
  return dx >= 14 && dx <= 24 && dy >= 23 && dy <= 32;
}

function isWatchBreakwater(zone: ZonePoint): boolean {
  // South breakwater basin plus the outer east-corner WATCH ring.
  return isEastCornerWatchRing(zone) || isWatchBreakwaterPeripheryOverride(zone);
}

function isWatchBreakwaterPeripheryOverride(zone: ZonePoint): boolean {
  const { tileX, tileY, x, y } = zone;
  const southBasin =
    tileX >= SOUTH_BASIN_BOUNDS.minX && tileX <= SOUTH_BASIN_BOUNDS.maxX
    && tileY >= SOUTH_BASIN_BOUNDS.minY;
  const southeastBasin =
    ellipseValue(x, y, SOUTHEAST_CORNER_CENTER.x, SOUTHEAST_CORNER_CENTER.y, CORNER_RADIUS, CORNER_RADIUS) < 1.0;
  const exposedEastRing = tileX >= 44 && isEastCornerWatchRing(zone);
  return southBasin || exposedEastRing || isSouthernWatchShelf(zone) || southeastBasin;
}

function isEastCornerWatchRing(zone: ZonePoint): boolean {
  const { tileX, tileY, x, y } = zone;
  if (tileX < 28 || tileX > MAX_DESIGN_X || tileY < 0 || tileY > MAX_DESIGN_Y) return false;
  const eastValue = eastCornerRiskValue(x, y);
  return eastValue >= ALERT_RING_OUTER && eastValue < WATCH_RING_OUTER;
}

function isSouthernWatchShelf({ tileX, tileY }: ZonePoint): boolean {
  // Southern shelf: tiles south of the harbor that bridge into the south basin.
  return tileX >= 28 && tileX <= MAX_DESIGN_X && tileY >= SOUTH_SHELF_MIN_Y
    && tileY <= MAX_DESIGN_Y && tileX + tileY >= SOUTH_SHELF_DIAGONAL_THRESHOLD;
}

function isCalmAnchorage(zone: ZonePoint): boolean {
  const { tileX, tileY, x, y } = zone;
  const leftEdge = tileX <= 15 && tileY >= 10 && tileY <= MAX_DESIGN_Y;
  const leftBasin = ellipseValue(x, y, 8.2, 31.0, 15.0, 20.5) < 1.08 && tileX <= 22 && tileY >= 10;
  const southBay =
    tileX >= SOUTH_BASIN_BOUNDS.minX && tileX <= SOUTH_BASIN_BOUNDS.maxX
    && tileY >= SOUTH_BASIN_BOUNDS.minY;
  return leftEdge || leftBasin || southBay;
}

function isCalmAnchoragePeripheryOverride({ tileX: x, tileY: y }: ZonePoint): boolean {
  const southBasinPatch =
    x >= CALM_SOUTH_BASIN_PATCH.minX
    && x <= CALM_SOUTH_BASIN_PATCH.maxX
    && y >= CALM_SOUTH_BASIN_PATCH.minY
    && y <= CALM_SOUTH_BASIN_PATCH.maxY;
  const eastShoulderPatch =
    x >= CALM_EAST_SHOULDER_PATCH.minX
    && x <= CALM_EAST_SHOULDER_PATCH.maxX
    && y >= CALM_EAST_SHOULDER_PATCH.minY
    && y <= CALM_EAST_SHOULDER_PATCH.maxY;
  const lowerBreakwaterPatch =
    x >= CALM_LOWER_BREAKWATER_PATCH.minX
    && x <= CALM_LOWER_BREAKWATER_PATCH.maxX
    && y >= CALM_LOWER_BREAKWATER_PATCH.minY
    && y <= CALM_LOWER_BREAKWATER_PATCH.maxY;
  return southBasinPatch || eastShoulderPatch || lowerBreakwaterPatch;
}

function isOutOfBounds(x: number, y: number): boolean {
  return x < 0 || y < 0 || x >= PHAROSVILLE_MAP_WIDTH || y >= PHAROSVILLE_MAP_HEIGHT;
}

let cachedMainIslandLandMask: Uint8Array | null = null;
let cachedNavigableWaterMask: Uint8Array | null = null;

/**
 * Returns a lazily-built, cached row-major mask (1 = land on the main island,
 * 0 otherwise). Excludes the cemetery and pigeonnier islets. Used by periphery
 * checks and renderer code that needs cheap land/water lookups.
 */
export function getMainIslandLandMask(): Uint8Array {
  if (cachedMainIslandLandMask) return cachedMainIslandLandMask;
  const mask = new Uint8Array(PHAROSVILLE_MAP_WIDTH * PHAROSVILLE_MAP_HEIGHT);
  for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y += 1) {
    for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 1) {
      if (!isOutOfBounds(x, y) && mainIslandValue(x, y) < 1) mask[y * PHAROSVILLE_MAP_WIDTH + x] = 1;
    }
  }
  cachedMainIslandLandMask = mask;
  return mask;
}

function isWithinIslandPeriphery(x: number, y: number): boolean {
  if (isOutOfBounds(x, y)) return false;
  const r = ISLAND_PERIPHERY_TILE_DISTANCE;
  const mask = getMainIslandLandMask();
  const minX = Math.max(0, Math.floor(x) - r);
  const maxX = Math.min(PHAROSVILLE_MAP_WIDTH - 1, Math.ceil(x) + r);
  const minY = Math.max(0, Math.floor(y) - r);
  const maxY = Math.min(PHAROSVILLE_MAP_HEIGHT - 1, Math.ceil(y) + r);
  for (let ny = minY; ny <= maxY; ny += 1) {
    for (let nx = minX; nx <= maxX; nx += 1) {
      if (mask[ny * PHAROSVILLE_MAP_WIDTH + nx]) return true;
    }
  }
  return false;
}

/**
 * The deep-sea rim: one world tile all the way round, two in the corners.
 *
 * H4: measured in WORLD tiles, not design coordinates. It is a map-edge
 * feature, and expressing it in design space made its width depend on
 * MAP_SCALE — at 2.5 the corner band fell to an `=== 1` test that a
 * non-integer scale can never satisfy.
 */
const DEEP_CORNER_TILES = 8 * MAP_SCALE;

function isDeepSeaShelfWorld(x: number, y: number): boolean {
  const edge = Math.min(x, y, MAX_TILE_X - x, MAX_TILE_Y - y);
  if (edge < 1) return true;
  if (edge < 2) {
    return x < DEEP_CORNER_TILES || y < DEEP_CORNER_TILES
      || x > MAX_TILE_X - DEEP_CORNER_TILES || y > MAX_TILE_Y - DEEP_CORNER_TILES;
  }
  return false;
}

function isTopShelfOpenWaterGap({ tileX: x, tileY: y }: ZonePoint): boolean {
  if (y < 0 || y > 7) return false;
  if (x >= 31 && x <= 39) return true;
  // Visual buffer between Ledger Mooring's east flank and the Alert ring
  // along the top two rows; this is now folded into Watch Breakwater so no
  // neutral water remains between Ledger and Alert.
  if (x >= 23 && x <= 30 && y <= 1) return true;
  return false;
}

function isLedgerMooring({ tileX: x, tileY: y }: ZonePoint): boolean {
  // Top-left mooring shelf snapped to the map corner. The east/top freed
  // water beyond x=30 belongs to Watch Breakwater before the Alert stack.
  if (y < 0 || y > 9 || x < 0) return false;
  return x <= 30;
}

function getNavigableWaterMask(): Uint8Array {
  if (cachedNavigableWaterMask) return cachedNavigableWaterMask;
  const mask = new Uint8Array(PHAROSVILLE_MAP_WIDTH * PHAROSVILLE_MAP_HEIGHT);
  const queue: Array<{ x: number; y: number }> = [];
  const enqueue = (x: number, y: number) => {
    if (isOutOfBounds(x, y) || isSeawallBarrierTile({ x, y }) || !isWaterTileKind(tileKindAt(x, y))) return;
    const index = y * PHAROSVILLE_MAP_WIDTH + x;
    if (mask[index]) return;
    mask[index] = 1;
    queue.push({ x, y });
  };

  for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 1) {
    enqueue(x, 0);
    enqueue(x, PHAROSVILLE_MAP_HEIGHT - 1);
  }
  for (let y = 1; y < PHAROSVILLE_MAP_HEIGHT - 1; y += 1) {
    enqueue(0, y);
    enqueue(PHAROSVILLE_MAP_WIDTH - 1, y);
  }

  while (queue.length > 0) {
    const tile = queue.shift();
    if (!tile) continue;
    enqueue(tile.x + 1, tile.y);
    enqueue(tile.x - 1, tile.y);
    enqueue(tile.x, tile.y + 1);
    enqueue(tile.x, tile.y - 1);
  }

  cachedNavigableWaterMask = mask;
  return mask;
}

/** True if `tile` is open water reachable from the map edge (i.e. ships can sail there without crossing the seawall). */
export function isNavigableWaterTile(tile: { x: number; y: number }): boolean {
  if (isOutOfBounds(tile.x, tile.y) || isSeawallBarrierTile(tile) || !isWaterTileKind(tileKindAt(tile.x, tile.y))) return false;
  // The mask is a flat row-major array of INTEGER cells, but callers pass
  // fractional tiles routinely — ship samples, and (since MAP_SCALE went to
  // 2.5) any zone anchor on an odd design tile. An unrounded index reads
  // `undefined` and silently declares open water unnavigable.
  const index = Math.round(tile.y) * PHAROSVILLE_MAP_WIDTH + Math.round(tile.x);
  return !!getNavigableWaterMask()[index];
}

/** Returns the closest navigable water tile to `tile` within `maxRadius` (Chebyshev), falling back to the input if none is found. */
export function nearestWaterTile(tile: { x: number; y: number }, maxRadius = 10): { x: number; y: number } {
  const initialKind = tileKindAt(tile.x, tile.y);
  if (isWaterTileKind(initialKind) && isNavigableWaterTile(tile)) return tile;

  let bestTile: { x: number; y: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const { x, y } = clampMapTile({ x: tile.x + dx, y: tile.y + dy });
        if (!isNavigableWaterTile({ x, y })) continue;
        const distance = Math.abs(dx) + Math.abs(dy);
        if (distance < bestDistance) {
          bestTile = { x, y };
          bestDistance = distance;
        }
      }
    }
    if (bestTile) return bestTile;
  }

  return tile;
}

/**
 * Like `nearestWaterTile` but skips tiles whose `"x.y"` key is in `occupied`,
 * so callers placing multiple ships can avoid stacking. Falls back to
 * `nearestWaterTile` when every nearby tile is taken.
 */
export function nearestAvailableWaterTile(
  tile: { x: number; y: number },
  occupied: ReadonlySet<string>,
  maxRadius = 12,
): { x: number; y: number } {
  const initialKind = tileKindAt(tile.x, tile.y);
  const initialKey = `${tile.x}.${tile.y}`;
  if (isWaterTileKind(initialKind) && isNavigableWaterTile(tile) && !occupied.has(initialKey)) return tile;

  let bestTile: { x: number; y: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const { x, y } = clampMapTile({ x: tile.x + dx, y: tile.y + dy });
        if (occupied.has(`${x}.${y}`)) continue;
        if (!isNavigableWaterTile({ x, y })) continue;
        const distance = Math.abs(dx) + Math.abs(dy);
        if (distance < bestDistance) {
          bestTile = { x, y };
          bestDistance = distance;
        }
      }
    }
    if (bestTile) return bestTile;
  }

  return nearestWaterTile(tile, maxRadius);
}

/** Clamps `tile` to the inclusive `[0, MAX_TILE_X] x [0, MAX_TILE_Y]` map bounds without rounding. */
export function clampMapTile(tile: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(MAX_TILE_X, tile.x)),
    y: Math.max(0, Math.min(MAX_TILE_Y, tile.y)),
  };
}

// `buildPharosVilleMap` is a pure function of compile-time layout constants —
// the result is identical across every call. Cache it once at module scope so
// repeated world rebuilds don't re-allocate ~3,000 tile objects.
let cachedPharosVilleMap: PharosVilleMap | null = null;

/** Builds (and memoizes) the full `PharosVilleMap` of tiles, terrains, and water ratio. Pure over compile-time layout constants. */
export function buildPharosVilleMap(): PharosVilleMap {
  if (cachedPharosVilleMap) return cachedPharosVilleMap;
  const tiles: PharosVilleTile[] = [];
  let waterTiles = 0;
  for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y += 1) {
    for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 1) {
      const terrain = terrainKindAt(x, y);
      const kind = canonicalTileKind(terrain);
      if (isWaterTileKind(kind)) waterTiles += 1;
      tiles.push({ x, y, kind, terrain });
    }
  }
  cachedPharosVilleMap = {
    width: PHAROSVILLE_MAP_WIDTH,
    height: PHAROSVILLE_MAP_HEIGHT,
    tiles,
    waterRatio: waterTiles / tiles.length,
  };
  return cachedPharosVilleMap;
}

type PlacedGrave = { scale: number; x: number; y: number };

// Spatial grid cell size for cemetery scatter neighbor queries. The maximum
// effective rejection distance is ~1.16 in `(dx*1.05, dy*1.45)` space, so a
// 1.5-tile cell guarantees a 3x3 neighbor scan covers every potential conflict.
const CEMETERY_GRID_CELL = 1.5;

function cemeteryGridKey(x: number, y: number): number {
  // Pack into a 32-bit integer to avoid string allocations per lookup.
  // Add a generous offset (1024) to keep coordinates non-negative; the
  // cemetery sits well within (0, 56).
  const cx = Math.floor(x / CEMETERY_GRID_CELL) + 1024;
  const cy = Math.floor(y / CEMETERY_GRID_CELL) + 1024;
  return (cx << 16) | cy;
}

// Memoize on the entries array reference. PharosVille's runtime cemetery
// entries are constructed once at module init, so the same reference flows
// through every world rebuild — this hits cleanly without retaining entries
// across test boundaries (the WeakMap drops them with the array itself).
const graveNodesCache = new WeakMap<readonly CemeteryEntry[], GraveNode[]>();

/**
 * Scatters cemetery entries onto the cemetery islet, returning one `GraveNode`
 * per entry with deterministic position and visual based on entry id. Memoized
 * by `entries` reference so repeated world rebuilds reuse the layout.
 */
export function graveNodesFromEntries(entries: readonly CemeteryEntry[]): GraveNode[] {
  const cached = graveNodesCache.get(entries);
  if (cached) return cached;

  // Sort by id for deterministic layout regardless of upstream insertion order.
  // Map back to the original index so visual variation that depends on
  // position-in-array stays stable across data shuffles.
  const ordered = entries
    .map((entry, originalIndex) => ({ entry, originalIndex }))
    .sort((a, b) => (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0));

  const placedByGridCell = new Map<number, PlacedGrave[]>();
  const result: GraveNode[] = new Array(ordered.length);

  for (const { entry, originalIndex } of ordered) {
    const visual = graveVisual(entry, originalIndex);
    const tile = cemeteryScatterTile(entry, originalIndex, placedByGridCell, visual.scale);
    const placed: PlacedGrave = { x: tile.x, y: tile.y, scale: visual.scale };
    const key = cemeteryGridKey(tile.x, tile.y);
    const bucket = placedByGridCell.get(key);
    if (bucket) bucket.push(placed); else placedByGridCell.set(key, [placed]);

    result[originalIndex] = {
      id: `grave.${entry.id}`,
      kind: "grave",
      label: entry.symbol,
      entry,
      tile,
      visual,
      detailId: `grave.${entry.id}`,
    };
  }

  graveNodesCache.set(entries, result);
  return result;
}

function nearestPlacedDistance(
  placedByGridCell: ReadonlyMap<number, PlacedGrave[]>,
  candidateX: number,
  candidateY: number,
  scale: number,
): number {
  const cellX = Math.floor(candidateX / CEMETERY_GRID_CELL);
  const cellY = Math.floor(candidateY / CEMETERY_GRID_CELL);
  let nearest = Number.POSITIVE_INFINITY;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const key = ((cellX + dx + 1024) << 16) | (cellY + dy + 1024);
      const bucket = placedByGridCell.get(key);
      if (!bucket) continue;
      for (const grave of bucket) {
        const requiredSpace = 0.36 + (grave.scale + scale) * 0.2;
        const ex = (candidateX - grave.x) * 1.05;
        const ey = (candidateY - grave.y) * 1.45;
        const distance = Math.sqrt(ex * ex + ey * ey) - requiredSpace;
        if (distance < nearest) nearest = distance;
      }
    }
  }
  return nearest;
}

function cemeteryScatterTile(
  entry: CemeteryEntry,
  index: number,
  placedByGridCell: ReadonlyMap<number, PlacedGrave[]>,
  scale: number,
): { x: number; y: number } {
  // Single seeded RNG per entry: avoids ~240 string allocations + hashes
  // (3 keys * 80 attempts) on the previous hot path.
  const rng = mulberry32(stableHash(entry.id));
  const drift = stableUnit(`${index}.grave.drift`) * 0.34 - 0.17;
  let bestTile: { x: number; y: number } | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng()) * 0.96;
    const tile = {
      x: CEMETERY_CENTER.x + Math.cos(angle + drift) * CEMETERY_RADIUS.x * radius,
      y: CEMETERY_CENTER.y + Math.sin(angle - drift) * CEMETERY_RADIUS.y * radius,
    };
    if (cemeteryValue(tile.x, tile.y) > 0.97 || cemeteryReserved(tile)) continue;
    // N2: wrecks settle on the wreck shoals, not on a headstone islet.
    if (terrainKindAt(tile.x, tile.y) !== "wreck-water") continue;
    const nearest = nearestPlacedDistance(placedByGridCell, tile.x, tile.y, scale);
    const edgePenalty = Math.abs(0.58 - radius) * 0.18;
    const score = nearest - edgePenalty - attempt * 0.001;
    if (score > bestScore) {
      bestScore = score;
      bestTile = tile;
    }
    if (nearest > 0.62 && attempt > 16) return tile;
  }
  if (bestTile) return bestTile;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng()) * 0.72;
    const tile = {
      x: CEMETERY_CENTER.x + Math.cos(angle) * CEMETERY_RADIUS.x * radius,
      y: CEMETERY_CENTER.y + Math.sin(angle) * CEMETERY_RADIUS.y * radius,
    };
    if (terrainKindAt(tile.x, tile.y) === "wreck-water") return tile;
  }
  return { ...CEMETERY_CENTER };
}

function graveVisual(entry: CemeteryEntry, index: number): GraveNode["visual"] {
  const peakMcap = Math.max(0, entry.peakMcap ?? 0);
  const peakScale = peakMcap > 0 ? Math.min(1, Math.max(0, (Math.log10(peakMcap) - 6) / 4)) : 0;
  const fullScale = 0.72 + peakScale * 0.48 + (stableUnit(`${entry.id}.grave.scale`) - 0.5) * 0.16;
  const scale = clamp(fullScale * 0.36, 0.25, 0.45);
  const marker = graveMarkerFor(entry, index, peakScale);
  return { marker, scale };
}

function graveMarkerFor(entry: CemeteryEntry, _index: number, _peakScale: number): GraveMarker {
  switch (entry.causeOfDeath) {
    case "regulatory":
      return "broken-keel";
    case "liquidity-drain":
      return "sinking-stern";
    case "counterparty-failure":
      return "grounded";
    case "algorithmic-failure":
      return "shattered";
    case "abandoned":
    default:
      return "skeletal";
  }
}

function cemeteryValue(x: number, y: number) {
  return ((x - CEMETERY_CENTER.x) / CEMETERY_RADIUS.x) ** 2
    + ((y - CEMETERY_CENTER.y) / CEMETERY_RADIUS.y) ** 2;
}

function cemeteryReserved(tile: { x: number; y: number }) {
  const chapel = ellipseValue(tile.x, tile.y, CEMETERY_CENTER.x - 2.05, CEMETERY_CENTER.y - 1.28, 0.72, 0.54) < 1;
  const memorial = ellipseValue(tile.x, tile.y, CEMETERY_CENTER.x, CEMETERY_CENTER.y, 0.67, 0.49) < 1;
  const northPath = Math.abs(tile.x - (CEMETERY_CENTER.x + Math.sin((tile.y - CEMETERY_CENTER.y) * 1.12) * 0.16)) < 0.17
    && tile.y > CEMETERY_CENTER.y - CEMETERY_RADIUS.y * 0.94
    && tile.y < CEMETERY_CENTER.y + CEMETERY_RADIUS.y * 0.98;
  const crossPath = Math.abs(tile.y - (CEMETERY_CENTER.y + Math.sin((tile.x - CEMETERY_CENTER.x) * 1.05) * 0.12)) < 0.14
    && tile.x > CEMETERY_CENTER.x - CEMETERY_RADIUS.x * 0.92
    && tile.x < CEMETERY_CENTER.x + CEMETERY_RADIUS.x * 0.92;
  return chapel || memorial || northPath || crossPath;
}
