import type { ShipMotionSample } from "./motion";
import { selectGardenObservatoryAreas } from "./observe-sequence";
import { TILE_HEIGHT, tileToScreen, type IsoCamera, type ScreenPoint } from "./projection";
import type {
  DockNode,
  PharosVilleWorld,
  SelectableWorldEntity,
  ShipHull,
  ShipNode,
} from "./world-types";

export const GARDEN_OVERVIEW_SHIP_LIMIT = 20;
export const GARDEN_WATER_Y = -1.45;
export const GARDEN_DOCK_ROOT_Y = GARDEN_WATER_Y + 0.2;
export const GARDEN_SHIP_ROOT_Y = GARDEN_WATER_Y + 0.38;
export const GARDEN_ZONE_ROOT_Y = GARDEN_WATER_Y + 0.04;
export const GARDEN_ISLAND_TILE_OFFSET = { x: 12, y: 8 } as const;
export const GARDEN_LIGHTHOUSE_ROOT_OFFSET = { x: -7, y: 2.55, z: -1.25 } as const;
export const GARDEN_LIGHTHOUSE_BEACON_Y = 15.15;
export const GARDEN_LIGHTHOUSE_HEIGHT = 17.35;

export type GardenHullSilhouette = "galleon" | "clipper" | "schooner" | "junk";
export type GardenSemanticView = "analyze" | "explore" | "overview";

export const GARDEN_SILHOUETTE_FOR_HULL: Record<ShipHull, GardenHullSilhouette> = {
  "algo-junk": "junk",
  "chartered-brigantine": "clipper",
  "crypto-caravel": "clipper",
  "dao-schooner": "schooner",
  "treasury-galleon": "galleon",
};

export interface GardenShipPlacement {
  displayOffset: ScreenPoint;
  representative: boolean;
  ship: ShipNode;
}

export interface GardenObservatorySlice {
  areas: ReturnType<typeof selectGardenObservatoryAreas>;
  docks: DockNode[];
  representativeDetailIds: ReadonlySet<string>;
  ships: GardenShipPlacement[];
  transientSelectedDetailId: string | null;
}

interface GardenObservatoryBaseSlice extends Omit<
  GardenObservatorySlice,
  "ships" | "transientSelectedDetailId"
> {
  ships: GardenShipPlacement[];
}

const baseSliceByWorld = new WeakMap<PharosVilleWorld, GardenObservatoryBaseSlice>();

export function selectGardenObservatorySlice(
  world: PharosVilleWorld,
  selectedDetailId: string | null,
): GardenObservatorySlice {
  const base = gardenObservatoryBaseSlice(world);
  const transientShip = selectGardenTransientShip(world, selectedDetailId, base.representativeDetailIds);
  if (!transientShip) {
    return {
      ...base,
      transientSelectedDetailId: null,
    };
  }
  return {
    ...base,
    ships: [
      ...base.ships,
      {
        displayOffset: { x: 0, y: 0 },
        representative: false,
        ship: transientShip,
      },
    ],
    transientSelectedDetailId: transientShip.detailId,
  };
}

export function selectGardenTransientShip(
  world: PharosVilleWorld,
  selectedDetailId: string | null,
  representativeDetailIds = gardenObservatoryBaseSlice(world).representativeDetailIds,
): ShipNode | null {
  if (!selectedDetailId || representativeDetailIds.has(selectedDetailId)) return null;
  const entity = world.entityById[selectedDetailId];
  return entity?.kind === "ship" ? entity : null;
}

export function resolveGardenShipDisplayTile(input: {
  displayOffset: ScreenPoint;
  representative: boolean;
  sample: Pick<ShipMotionSample, "tile"> | null | undefined;
  ship: ShipNode;
}): ScreenPoint {
  const { displayOffset, representative, sample, ship } = input;
  const tile = sample?.tile ?? ship.tile;
  if (!representative) return tile;
  const motionX = tile.x - ship.tile.x;
  const motionY = tile.y - ship.tile.y;
  const motionDistance = Math.hypot(motionX, motionY);
  const motionScale = motionDistance > 2.5 ? 2.5 / motionDistance : 1;
  return {
    x: ship.tile.x + displayOffset.x + motionX * motionScale,
    y: ship.tile.y + displayOffset.y + motionY * motionScale,
  };
}

export function resolveGardenEntityDisplayTile(input: {
  entity: SelectableWorldEntity;
  shipMotionSamples?: ReadonlyMap<string, ShipMotionSample>;
  slice: GardenObservatorySlice;
}): ScreenPoint | null {
  const { entity, shipMotionSamples, slice } = input;
  if (entity.kind === "lighthouse") return gardenIslandDisplayTile(entity.tile);
  if (entity.kind === "area") return gardenAreaDisplayTile(entity);
  if (entity.kind === "dock") {
    const index = slice.docks.findIndex((dock) => dock.detailId === entity.detailId);
    const displayIndex = index >= 0
      ? index
      : Math.max(0, (entity.harborRank ?? 1) - 1);
    return gardenDockDisplayTile(entity.tile, displayIndex);
  }
  if (entity.kind === "grave" || entity.kind === "pigeonnier") return entity.tile;
  if (entity.kind !== "ship") return null;
  const placement = slice.ships.find(({ ship }) => ship.detailId === entity.detailId);
  return placement
    ? resolveGardenShipDisplayTile({
        ...placement,
        sample: shipMotionSamples?.get(entity.id),
      })
    : null;
}

export function gardenTileToScreen(
  tile: ScreenPoint,
  worldY: number,
  camera: IsoCamera,
): ScreenPoint {
  const point = tileToScreen(tile, camera);
  return {
    x: point.x,
    y: point.y - worldY * TILE_HEIGHT * (Math.sqrt(3) / 2) * camera.zoom,
  };
}

export function gardenIslandDisplayTile(tile: ScreenPoint): ScreenPoint {
  return {
    x: tile.x + GARDEN_ISLAND_TILE_OFFSET.x,
    y: tile.y + GARDEN_ISLAND_TILE_OFFSET.y,
  };
}

export function gardenDockDisplayTile(tile: ScreenPoint, index: number): ScreenPoint {
  return index === 1 ? { x: tile.x + 3, y: tile.y + 5 } : tile;
}

export function gardenAreaDisplayTile(area: {
  band?: string | null;
  tile: ScreenPoint;
}): ScreenPoint {
  const elevatedEastBand = area.band === "ALERT"
    || area.band === "WARNING"
    || area.band === "DANGER";
  return elevatedEastBand
    ? { x: area.tile.x - 4, y: area.tile.y + 4 }
    : area.tile;
}

export function gardenCameraViewHeight(viewportHeight: number, zoom: number): number {
  return viewportHeight / (TILE_HEIGHT * zoom);
}

export function gardenSemanticView(
  zoom: number,
  selectedDetailId: string | null,
): GardenSemanticView {
  if (selectedDetailId) return "analyze";
  return zoom >= 1.05 ? "explore" : "overview";
}

export function gardenShipSelectionRadius(ship: ShipNode): number {
  const scale = Math.max(0.72, Math.min(1.6, ship.visual.scale || 1)) * 0.82;
  return 1.9 * scale;
}

export function selectGardenDocks(docks: readonly DockNode[]): DockNode[] {
  const ranked = docks.toSorted((left, right) => (
    right.totalUsd - left.totalUsd || left.id.localeCompare(right.id)
  ));
  const first = ranked[0];
  if (!first) return [];
  const separated = ranked.filter((dock) => (
    dock.id !== first.id && tileDistance(dock.tile, first.tile) >= 10
  ));
  const second = separated[0]
    ?? ranked
      .filter((dock) => dock.id !== first.id)
      .toSorted((left, right) => (
        tileDistance(right.tile, first.tile) - tileDistance(left.tile, first.tile)
        || right.totalUsd - left.totalUsd
        || left.id.localeCompare(right.id)
      ))[0];
  return second ? [first, second] : [first];
}

export function selectRepresentativeShips(
  ships: readonly ShipNode[],
  limit = GARDEN_OVERVIEW_SHIP_LIMIT,
): ShipNode[] {
  if (limit <= 0) return [];
  const ranked = ships.toSorted(compareRepresentativeShips);
  if (ranked.length <= limit) return ranked;

  const chosen: ShipNode[] = [];
  const chosenIds = new Set<string>();
  const include = (ship: ShipNode | undefined) => {
    if (!ship || chosenIds.has(ship.id) || chosen.length >= limit) return;
    chosenIds.add(ship.id);
    chosen.push(ship);
  };

  const marketLeaders = ships.toSorted((left, right) => (
    right.marketCapUsd - left.marketCapUsd || left.id.localeCompare(right.id)
  ));
  const leaderCount = Math.min(limit, Math.max(4, Math.floor(limit * 0.4)));
  for (const ship of marketLeaders.slice(0, leaderCount)) include(ship);

  for (const zone of ["danger", "warning", "alert", "watch", "ledger", "calm"] as const) {
    include(ranked.find((ship) => ship.riskZone === zone));
  }
  for (const silhouette of ["galleon", "clipper", "schooner", "junk"] as const) {
    include(ranked.find((ship) => GARDEN_SILHOUETTE_FOR_HULL[ship.visual.hull] === silhouette));
  }
  const movers = ships.toSorted((left, right) => (
    Math.abs(right.change7dPct ?? right.change24hPct ?? 0)
      - Math.abs(left.change7dPct ?? left.change24hPct ?? 0)
    || right.marketCapUsd - left.marketCapUsd
    || left.id.localeCompare(right.id)
  ));
  for (const ship of movers.slice(0, 4)) include(ship);
  const representedChains = new Set(
    chosen.map((ship) => ship.dominantChainId).filter((chain): chain is string => Boolean(chain)),
  );
  for (const ship of marketLeaders) {
    if (!ship.dominantChainId || representedChains.has(ship.dominantChainId)) continue;
    include(ship);
    representedChains.add(ship.dominantChainId);
    if (chosen.length >= limit) break;
  }
  const zoneOrder = ["danger", "warning", "alert", "watch", "ledger", "calm"] as const;
  for (let position = 0; chosen.length < limit; position += 1) {
    const before = chosen.length;
    for (const zone of zoneOrder) {
      include(ranked.filter((ship) => ship.riskZone === zone)[position]);
    }
    if (chosen.length === before) break;
  }
  for (const ship of ranked) include(ship);
  return chosen;
}

export function representativeShipDisplayOffsets(
  ships: readonly ShipNode[],
): ReadonlyMap<string, ScreenPoint> {
  const byZone = new Map<ShipNode["riskZone"], ShipNode[]>();
  for (const ship of ships) {
    const group = byZone.get(ship.riskZone) ?? [];
    group.push(ship);
    byZone.set(ship.riskZone, group);
  }

  const offsets = new Map<string, ScreenPoint>();
  for (const [zone, group] of byZone) {
    group.sort((left, right) => left.id.localeCompare(right.id));
    if (zone === "danger" && group.length >= 8) {
      const centerDiagonal = group.reduce(
        (sum, ship) => sum + ship.tile.x - ship.tile.y,
        0,
      ) / group.length - 10;
      const centerDepth = group.reduce(
        (sum, ship) => sum + ship.tile.x + ship.tile.y,
        0,
      ) / group.length + 1;
      group.forEach((ship, index) => {
        const progress = index / (group.length - 1);
        const angle = -Math.PI * 0.75 + progress * Math.PI * 1.5;
        const diagonal = centerDiagonal + Math.cos(angle) * 20;
        const depth = centerDepth + Math.sin(angle) * 20;
        const targetX = (diagonal + depth) / 2;
        const targetY = (depth - diagonal) / 2;
        offsets.set(ship.id, {
          x: targetX - ship.tile.x,
          y: targetY - ship.tile.y,
        });
      });
      continue;
    }
    const phase = stableUnit(`observatory.${zone}`) * Math.PI * 2;
    group.forEach((ship, index) => {
      if (group.length === 1) {
        offsets.set(ship.id, { x: 0, y: 0 });
        return;
      }
      const ring = Math.floor(index / 8);
      const ringIndex = index % 8;
      const ringCount = Math.min(8, group.length - ring * 8);
      const radius = group.length <= 4 ? 3.6 : 6.2 + ring * 2.8;
      const angle = phase + (ringIndex / ringCount) * Math.PI * 2;
      offsets.set(ship.id, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    });
  }
  return offsets;
}

function gardenObservatoryBaseSlice(world: PharosVilleWorld): GardenObservatoryBaseSlice {
  const cached = baseSliceByWorld.get(world);
  if (cached) return cached;
  const representatives = selectRepresentativeShips(world.ships);
  const displayOffsets = representativeShipDisplayOffsets(representatives);
  const representativeDetailIds = new Set(representatives.map((ship) => ship.detailId));
  const slice = {
    areas: selectGardenObservatoryAreas(world.areas),
    docks: selectGardenDocks(world.docks),
    representativeDetailIds,
    ships: representatives.map((ship) => ({
      displayOffset: composeRepresentativeOffset(
        ship,
        displayOffsets.get(ship.id) ?? { x: 0, y: 0 },
        world.lighthouse.tile,
      ),
      representative: true,
      ship,
    })),
  };
  baseSliceByWorld.set(world, slice);
  return slice;
}

function composeRepresentativeOffset(
  ship: ShipNode,
  offset: ScreenPoint,
  lighthouseTile: ScreenPoint,
): ScreenPoint {
  let x = offset.x;
  let y = offset.y;
  if (ship.riskZone === "alert" || ship.riskZone === "warning" || ship.riskZone === "danger") {
    x -= 2.25;
    y += 2.25;
  }

  const islandTile = gardenIslandDisplayTile(lighthouseTile);
  let dx = ship.tile.x + x - islandTile.x;
  let dy = ship.tile.y + y - islandTile.y;
  let distance = Math.hypot(dx, dy);
  if (distance < 0.01) {
    const angle = stableUnit(`island-clearance.${ship.id}`) * Math.PI * 2;
    dx = Math.cos(angle);
    dy = Math.sin(angle);
    distance = 1;
  }
  const clearance = 17;
  if (distance < clearance) {
    const push = clearance - distance;
    x += (dx / distance) * push;
    y += (dy / distance) * push;
  }
  return { x, y };
}

function compareRepresentativeShips(left: ShipNode, right: ShipNode): number {
  return riskRank(right.riskZone) - riskRank(left.riskZone)
    || Math.abs(right.change7dPct ?? right.change24hPct ?? 0)
      - Math.abs(left.change7dPct ?? left.change24hPct ?? 0)
    || right.marketCapUsd - left.marketCapUsd
    || left.id.localeCompare(right.id);
}

function riskRank(zone: ShipNode["riskZone"]): number {
  return {
    alert: 3,
    calm: 0,
    danger: 5,
    ledger: 1,
    warning: 4,
    watch: 2,
  }[zone];
}

function tileDistance(left: ScreenPoint, right: ScreenPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function stableUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}
