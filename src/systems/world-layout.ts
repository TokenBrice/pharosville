import type { GraveNode, PharosVilleMap, PharosVilleTile, ShipRiskPlacement, TerrainKind, TileKind } from "./world-types";
import type { CemeteryEntry } from "@shared/lib/cemetery-merged";
import { RISK_WATER_REGION_TILES } from "./risk-water-areas";
import { isSeawallBarrierTile } from "./seawall";
import { stableUnit } from "./stable-random";

export const PHAROSVILLE_MAP_WIDTH = 56;
export const PHAROSVILLE_MAP_HEIGHT = 56;
export const MAX_TILE_X = PHAROSVILLE_MAP_WIDTH - 1;
export const MAX_TILE_Y = PHAROSVILLE_MAP_HEIGHT - 1;
export const LIGHTHOUSE_TILE = { x: 18, y: 28 } as const;
export const CIVIC_CORE_CENTER = { x: 31, y: 31 } as const;
export const CIVIC_CORE_RADIUS = 8.5;
// Chebyshev tile distance: any sea tile within this many tiles of land is rendered
// as generic "water" (no DEWS zone), giving the island a non-attributed halo
// before named edge-water districts begin.
export const ISLAND_PERIPHERY_TILE_DISTANCE = 4;

// Zone geometry constants.
// East-corner Alert/Warning/Danger rings share a single ellipse anchored at
// the (55, 0) corner. Thresholds slice that ellipse into three concentric
// bands; isSoutheastWatchShelf re-uses ALERT_RING_OUTER as a guard so it never
// claims tiles that should be Alert.
const EAST_CORNER_CENTER = { x: 55, y: 0 } as const;
const SOUTHEAST_CORNER_CENTER = { x: 55, y: 55 } as const;
const CORNER_RADIUS = 14;
const DANGER_RING_OUTER = 0.26;
const WARNING_RING_OUTER = 0.66;
const ALERT_RING_INNER = 0.66;
const ALERT_RING_OUTER = 1.63;

// South breakwater basin shared between Watch Breakwater (primary) and the
// Calm Anchorage southBay fallback.
const SOUTH_BASIN_BOUNDS = { minX: 16, maxX: 43, minY: 45 } as const;

// Compact upper Alert ring covers the eastern shelf above this threshold;
// tiles beyond it on the eastern edge belong to Watch Breakwater.
const EAST_SHELF_MIN_X = 45;
const EAST_SHELF_MIN_Y = 18;
const SOUTH_SHELF_MIN_Y = 38;
const SOUTH_SHELF_DIAGONAL_THRESHOLD = 78;

export const REGION_TILES: Record<ShipRiskPlacement, { x: number; y: number }> = RISK_WATER_REGION_TILES;

export const ETHEREUM_L2_DOCK_CHAIN_IDS = ["base", "arbitrum", "polygon"] as const;
export const ETHEREUM_HARBOR_PRIORITY_CHAIN_IDS = ["ethereum", ...ETHEREUM_L2_DOCK_CHAIN_IDS] as const;

// Ethereum anchors the east cove. Base now sits west of Ethereum and between
// Ethereum and Arbitrum so it reads as the middle slip in the cove without
// covering neighboring ports. Optimism is intentionally not assigned a rendered
// harbor.
export const BASE_HARBOR_DOCK_TILE = { x: 38.5, y: 37.5 } as const;
export const EVM_BAY_DOCK_TILES = [
  { x: 43, y: 31 },
  BASE_HARBOR_DOCK_TILE,
  { x: 32, y: 41 },
  { x: 26, y: 39 },
] as const;

// Outer harbors wrap the north, west, south, and east coasts so the
// island reads as a single inhabited harbor ring rather than a dock staircase.
// Tron anchors the central north shelf and solana the north-east shelf to keep
// them clear of the central lighthouse and ethereum harbors. HyperLiquid gets a
// small northward nudge on the east shelf so it clears the neighboring cove.
export const HYPERLIQUID_HARBOR_DOCK_TILE = { x: 39.5, y: 21.5 } as const;
export const OUTER_HARBOR_DOCK_TILES = [
  { x: 20, y: 35 },
  { x: 28, y: 22 },
  { x: 34, y: 22 },
  HYPERLIQUID_HARBOR_DOCK_TILE,
  { x: 33, y: 41 },
  { x: 23, y: 37 },
  { x: 25, y: 38 },
  { x: 27, y: 40 },
  { x: 43, y: 33 },
  { x: 25, y: 23 },
] as const;

export const PREFERRED_DOCK_TILES: Record<string, { x: number; y: number }> = {
  ethereum: EVM_BAY_DOCK_TILES[0],
  base: EVM_BAY_DOCK_TILES[1],
  arbitrum: EVM_BAY_DOCK_TILES[2],
  polygon: EVM_BAY_DOCK_TILES[3],
  bsc: OUTER_HARBOR_DOCK_TILES[0],
  tron: OUTER_HARBOR_DOCK_TILES[1],
  solana: OUTER_HARBOR_DOCK_TILES[2],
  aptos: OUTER_HARBOR_DOCK_TILES[3],
  avalanche: OUTER_HARBOR_DOCK_TILES[4],
};

export const EVM_BAY_CHAIN_IDS = new Set<string>(ETHEREUM_HARBOR_PRIORITY_CHAIN_IDS);

export const DOCK_TILES = [
  ...EVM_BAY_DOCK_TILES,
  ...OUTER_HARBOR_DOCK_TILES,
];

// Cemetery remains a separate memorial islet, snapped to the bottom-left edge
// as in the positioning source while staying outside the central island model.
export const CEMETERY_CENTER = { x: 8.0, y: 50.0 } as const;
export const CEMETERY_RADIUS = { x: 3.3, y: 2.1 } as const;
const CEMETERY_ISLAND_RADIUS = { x: 5.4, y: 3.8 } as const;

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
]);

const ELEVATED_TERRAIN_KINDS = new Set<TerrainKind>(["hill", "rock", "cliff"]);

export function isWaterTileKind(kind: TileKind | TerrainKind): boolean {
  return WATER_TERRAIN_KINDS.has(kind as TerrainKind);
}

export function isLandTileKind(kind: TileKind | TerrainKind): boolean {
  return !isWaterTileKind(kind);
}

export function isElevatedTileKind(kind: TileKind | TerrainKind): boolean {
  return ELEVATED_TERRAIN_KINDS.has(kind as TerrainKind);
}

export function isShoreTileKind(kind: TileKind | TerrainKind): boolean {
  return kind === "shore" || kind === "beach";
}

export function isRoadTileKind(kind: TileKind | TerrainKind): boolean {
  return kind === "road";
}

export function tileKindAt(x: number, y: number): TileKind {
  return canonicalTileKind(terrainKindAt(x, y));
}

export function terrainKindAt(x: number, y: number): TerrainKind {
  if (x === BASE_HARBOR_DOCK_TILE.x && y === BASE_HARBOR_DOCK_TILE.y) return "shore";
  if (x === HYPERLIQUID_HARBOR_DOCK_TILE.x && y === HYPERLIQUID_HARBOR_DOCK_TILE.y) return "shore";
  const island = islandValue(x, y);
  const lighthouseMountain = lighthouseMountainValue(x, y);
  const cemetery = cemeteryValue(x, y);
  const nearIslandEdge = island > 0.82;

  if (isOutOfBounds(x, y) || island >= 1) {
    const inIslandPeriphery = isWithinIslandPeriphery(x, y);
    if (!isLighthouseVisualClearance(x, y) && isSoutheastWatchShelf(x, y)) return "watch-water";
    if (!inIslandPeriphery && !isLighthouseVisualClearance(x, y)) {
      if (isDangerStrait(x, y)) return "storm-water";
      if (isWarningShoals(x, y)) return "warning-water";
      if (isAlertChannel(x, y)) return "alert-water";
      if (isLedgerMooring(x, y)) return "ledger-water";
      if (isWatchBreakwater(x, y)) return "watch-water";
      if (isCalmAnchorage(x, y)) return "calm-water";
    }
    if (isTopShelfOpenWaterGap(x, y)) return "water";
    if (isDeepSeaShelf(x, y)) return "deep-water";
    return "water";
  }

  if (x === LIGHTHOUSE_TILE.x && y === LIGHTHOUSE_TILE.y) return "hill";
  if (cemetery < 1) return "grass";
  if (lighthouseMountain < 1.04) {
    if (lighthouseMountain > 0.78 || y < LIGHTHOUSE_TILE.y - 2) return "cliff";
    if (lighthouseMountain > 0.48) return "rock";
    return "hill";
  }
  if (nearIslandEdge) return "shore";
  if (ellipseValue(x, y, 31.3, 31.2, 7.2, 5.9) < 0.7) return "rock";
  if (ellipseValue(x, y, 39.0, 29.6, 5.8, 5.2) < 0.58) return "rock";
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
    // Detached bottom-left cemetery islet.
    ellipseValue(x, y, CEMETERY_CENTER.x, CEMETERY_CENTER.y, CEMETERY_ISLAND_RADIUS.x, CEMETERY_ISLAND_RADIUS.y),
  );
}

function mainIslandValue(x: number, y: number): number {
  return Math.min(
    // Compact central island.
    ellipseValue(x, y, 31.0, 31.2, 9.2, 7.6),
    // North harbor shelf.
    ellipseValue(x, y, 30.5, 24.8, 6.4, 3.9),
    // West harbor cove.
    ellipseValue(x, y, 23.6, 32.0, 4.4, 5.5),
    // Raised lighthouse mountain shoulder.
    ellipseValue(x, y, 18.9, 28.0, 3.7, 3.2),
    // Southern quay shelf.
    ellipseValue(x, y, 31.4, 37.8, 6.5, 3.4),
    // East / Ethereum cove.
    ellipseValue(x, y, 38.8, 31.3, 4.6, 5.2),
    // Northeast harbor shelf.
    ellipseValue(x, y, 37.8, 24.8, 4.2, 3.3),
  );
}

function lighthouseMountainValue(x: number, y: number): number {
  return Math.min(
    ellipseValue(x, y, 18.7, 28.25, 3.7, 3.05),
    ellipseValue(x, y, 17.9, 27.55, 2.65, 2.25),
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

function eastCornerRiskValue(x: number, y: number): number {
  return ellipseValue(x, y, EAST_CORNER_CENTER.x, EAST_CORNER_CENTER.y, CORNER_RADIUS, CORNER_RADIUS);
}

// Visual buffer around the lighthouse sprite on the generated island mountain:
// keep adjacent water generic so DEWS labels and zone textures do not crowd it.
function isLighthouseVisualClearance(x: number, y: number): boolean {
  return x >= 14 && x <= 24 && y >= 23 && y <= 32;
}

function isWatchBreakwater(x: number, y: number): boolean {
  // South breakwater basin plus the southeast/east shelf below the Alert Channel.
  const southBasin =
    x >= SOUTH_BASIN_BOUNDS.minX && x <= SOUTH_BASIN_BOUNDS.maxX && y >= SOUTH_BASIN_BOUNDS.minY;
  const eastBridge =
    isSoutheastWatchShelf(x, y)
    && ellipseValue(x, y, SOUTHEAST_CORNER_CENTER.x, SOUTHEAST_CORNER_CENTER.y, CORNER_RADIUS, CORNER_RADIUS) >= 1.0;
  const southeastBasin =
    ellipseValue(x, y, SOUTHEAST_CORNER_CENTER.x, SOUTHEAST_CORNER_CENTER.y, CORNER_RADIUS, CORNER_RADIUS) < 1.0;
  return southBasin || eastBridge || southeastBasin;
}

function isSoutheastWatchShelf(x: number, y: number): boolean {
  if (x < 28 || x > MAX_TILE_X || y < EAST_SHELF_MIN_Y || y > MAX_TILE_Y) return false;
  // Stay clear of the east-corner Alert/Warning/Danger ring stack.
  if (eastCornerRiskValue(x, y) < ALERT_RING_OUTER) return false;
  // Eastern shelf: tiles below the Alert ring along the x=55 edge.
  const easternShelf = x >= EAST_SHELF_MIN_X;
  // Southern shelf: tiles south of the harbor that bridge into the south basin.
  const southernShelf =
    y >= SOUTH_SHELF_MIN_Y && x + y >= SOUTH_SHELF_DIAGONAL_THRESHOLD;
  return easternShelf || southernShelf;
}

function isCalmAnchorage(x: number, y: number): boolean {
  const leftEdge = x <= 15 && y >= 10 && y <= MAX_TILE_Y;
  const leftBasin = ellipseValue(x, y, 8.2, 31.0, 15.0, 20.5) < 1.08 && x <= 22 && y >= 10;
  const southBay =
    x >= SOUTH_BASIN_BOUNDS.minX && x <= SOUTH_BASIN_BOUNDS.maxX && y >= SOUTH_BASIN_BOUNDS.minY;
  return leftEdge || leftBasin || southBay;
}

function isOutOfBounds(x: number, y: number): boolean {
  return x < 0 || y < 0 || x >= PHAROSVILLE_MAP_WIDTH || y >= PHAROSVILLE_MAP_HEIGHT;
}

let cachedMainIslandLandMask: Uint8Array | null = null;
let cachedNavigableWaterMask: Uint8Array | null = null;

function getMainIslandLandMask(): Uint8Array {
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

function isDeepSeaShelf(x: number, y: number): boolean {
  const edge = Math.min(x, y, MAX_TILE_X - x, MAX_TILE_Y - y);
  if (edge <= 0) return true;
  if (edge === 1) {
    return x < 8 || y < 8 || x > MAX_TILE_X - 8 || y > MAX_TILE_Y - 8;
  }
  return false;
}

function isTopShelfOpenWaterGap(x: number, y: number): boolean {
  return x >= 31 && x <= 39 && y >= 0 && y <= 7;
}

function isLedgerMooring(x: number, y: number): boolean {
  // Top mooring shelf: covers the entire upper edge of the diamond from the
  // western corner down to where Calm Anchorage begins, across to just before
  // the eastern Alert ring. Alert/Warning/Danger checks run first, so this
  // simple rectangle never steals their tiles.
  return y >= 0 && y <= 9 && x >= 0 && x <= 30;
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

export function isNavigableWaterTile(tile: { x: number; y: number }): boolean {
  if (isOutOfBounds(tile.x, tile.y) || isSeawallBarrierTile(tile) || !isWaterTileKind(tileKindAt(tile.x, tile.y))) return false;
  return !!getNavigableWaterMask()[tile.y * PHAROSVILLE_MAP_WIDTH + tile.x];
}

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

export function clampMapTile(tile: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(MAX_TILE_X, tile.x)),
    y: Math.max(0, Math.min(MAX_TILE_Y, tile.y)),
  };
}

export function buildPharosVilleMap(): PharosVilleMap {
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
  return {
    width: PHAROSVILLE_MAP_WIDTH,
    height: PHAROSVILLE_MAP_HEIGHT,
    tiles,
    waterRatio: waterTiles / tiles.length,
  };
}

export function graveNodesFromEntries(entries: readonly CemeteryEntry[]): GraveNode[] {
  const placed: Array<{ scale: number; x: number; y: number }> = [];
  return entries.map((entry, index) => {
    const visual = graveVisual(entry, index);
    const tile = cemeteryScatterTile(entry, index, placed, visual.scale);
    placed.push({ ...tile, scale: visual.scale });

    return {
      id: `grave.${entry.id}`,
      kind: "grave",
      label: entry.symbol,
      entry,
      logoSrc: entry.logo ? `/logos/cemetery/${entry.logo}` : null,
      tile,
      visual,
      detailId: `grave.${entry.id}`,
    };
  });
}

function cemeteryScatterTile(
  entry: CemeteryEntry,
  index: number,
  placed: readonly { scale: number; x: number; y: number }[],
  scale: number,
): { x: number; y: number } {
  let bestTile: { x: number; y: number } | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const angle = stableUnit(`${entry.id}.angle.${attempt}`) * Math.PI * 2;
    const radius = Math.sqrt(stableUnit(`${entry.id}.radius.${attempt}`)) * 0.96;
    const drift = stableUnit(`${index}.grave.drift`) * 0.34 - 0.17;
    const tile = {
      x: CEMETERY_CENTER.x + Math.cos(angle + drift) * CEMETERY_RADIUS.x * radius,
      y: CEMETERY_CENTER.y + Math.sin(angle - drift) * CEMETERY_RADIUS.y * radius,
    };
    if (cemeteryValue(tile.x, tile.y) > 0.97 || cemeteryReserved(tile) || tileKindAt(tile.x, tile.y) !== "land") continue;
    const nearest = placed.reduce((minimum, grave) => {
      const requiredSpace = 0.36 + (grave.scale + scale) * 0.2;
      const distance = Math.hypot((tile.x - grave.x) * 1.05, (tile.y - grave.y) * 1.45) - requiredSpace;
      return Math.min(minimum, distance);
    }, Number.POSITIVE_INFINITY);
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
    const angle = stableUnit(`${entry.id}.fallback.angle.${attempt}`) * Math.PI * 2;
    const radius = Math.sqrt(stableUnit(`${entry.id}.fallback.radius.${attempt}`)) * 0.72;
    const tile = {
      x: CEMETERY_CENTER.x + Math.cos(angle) * CEMETERY_RADIUS.x * radius,
      y: CEMETERY_CENTER.y + Math.sin(angle) * CEMETERY_RADIUS.y * radius,
    };
    if (tileKindAt(tile.x, tile.y) === "land") return tile;
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

function graveMarkerFor(entry: CemeteryEntry, index: number, peakScale: number): GraveMarker {
  const largeMemorial = peakScale > 0.72 && stableUnit(`${entry.id}.marker.major`) > 0.42;
  if (entry.causeOfDeath === "regulatory") return "cross";
  if (entry.causeOfDeath === "liquidity-drain") {
    const roll = stableUnit(`${entry.id}.marker.liquidity`);
    if (roll > 0.66) return "ledger";
    return roll > 0.34 ? "tablet" : "headstone";
  }
  if (entry.causeOfDeath === "counterparty-failure") {
    return largeMemorial || stableUnit(`${entry.id}.marker.counterparty`) > 0.38 ? "tablet" : "reliquary";
  }
  if (entry.causeOfDeath === "algorithmic-failure") {
    return largeMemorial || stableUnit(`${entry.id}.marker.algorithmic`) > 0.58 ? "reliquary" : "headstone";
  }
  const markers: GraveMarker[] = ["headstone", "headstone", "tablet", "reliquary"];
  return markers[Math.floor(stableUnit(`${entry.id}.${index}.marker`) * markers.length)] ?? "headstone";
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
