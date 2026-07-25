import type { ShipMotionSample } from "./motion";
import { placeGardenFleet } from "./garden-fleet-placement";
import { selectGardenObservatoryAreas } from "./observe-sequence";
import { TILE_HEIGHT, tileToScreen, type IsoCamera, type ScreenPoint } from "./projection";
import { landWorldTile, zoneWorldTile } from "./map-scale";
import {
  gardenShipWaterMarginTiles,
  isGardenShipWater,
  nearestGardenShipWater,
} from "./garden-water-exclusion";
import type {
  DockNode,
  PharosVilleWorld,
  SelectableWorldEntity,
  ShipHull,
  ShipNode,
} from "./world-types";

// D1 (Grand Scale Revamp, 2026-07-25): the cap becomes a CAPACITY, not a
// composition rule. It was 20 because the per-ship scene graph cost ~14 draw
// calls each (finding F3: 28.1 ms of JS submission at 187 ships); W1 replaced
// that with instanced batches at 9 draw calls for the whole fleet, so the
// number of ships no longer decides what the frame can afford.
//
// 320 is capacity headroom over the ~205-ship world, matching
// GARDEN_FLEET_BATCH_CAPACITY so the batches never reallocate. Composition is
// now enforced by region-scoped placement density, not by a small count.
export const GARDEN_OVERVIEW_SHIP_LIMIT = 320;
export const GARDEN_WATER_Y = -1.45;
export const GARDEN_DOCK_ROOT_Y = GARDEN_WATER_Y + 0.2;
export const GARDEN_SHIP_ROOT_Y = GARDEN_WATER_Y + 0.38;
export const GARDEN_ZONE_ROOT_Y = GARDEN_WATER_Y + 0.04;
export const GARDEN_ISLAND_TILE_OFFSET = { x: 12, y: 8 } as const;
export const GARDEN_LIGHTHOUSE_ROOT_OFFSET = { x: -7, y: 2.55, z: -1.25 } as const;
// Pharos Wonder (2026-07-24, agents/2026-07-24-pharos-wonder-plan.md, decision
// D1 — supersedes D-L1's 30-unit "epic, not bigger" call): the tower grows to
// 34 units so the attested Pharos stack (battered square base → octagonal drum
// → cylindrical drum → brazier → Zeus Soter statue) fits at the historical
// proportion rhythm. BEACON_Y is now the open-brazier centre (flame and beam
// origin); HEIGHT is the statue's raised-hand tip. Both match the GLB v4
// anchors exactly so the fallback shell, the loaded model, the DOM label
// rect, and the selection anchor never disagree.
export const GARDEN_LIGHTHOUSE_BEACON_Y = 30.1;
export const GARDEN_LIGHTHOUSE_HEIGHT = 34;
// C3 (scale & anchor contract): the three lighthouse constants above are the
// integration point. Pharos Wonder D1 re-proposed the monument scale-up
// (34 world units, statue tip) and moved the beam-origin/beacon anchor to the
// open brazier; world-renderer.ts integration (camera fit + shadow frustum +
// selection cue radius) consumes them. Selection radius, PSI beacon
// semantics, and DOM/ARIA contracts survive the scale-up unchanged: the hit
// rect and label anchor derive from these constants.

export type GardenHullSilhouette = "galleon" | "clipper" | "schooner" | "junk";
export type GardenSemanticView = "analyze" | "explore" | "overview";

// S5 / decision D-S5: the data-side 0.7–3.0 scale keeps a ~3.7× VISUAL spread
// (was clamped 0.72–1.6 → ~2.2×) so titans visibly dwarf skiffs. The floor
// (0.55) keeps the smallest hulls legible and clickable at overview zoom.
// C3 (scale & anchor contract): the mapping lives here in the
// orchestrator-owned slice so ship rendering (garden-ships), selection radii
// (below), and label layout all consume the SAME spread. Kept three-free —
// this module must stay importable without pulling the renderer into the
// world lazy chunk.
export const GARDEN_SHIP_VISUAL_SCALE_MIN = 0.55;
export const GARDEN_SHIP_VISUAL_SCALE_MAX = 2.05;
export const GARDEN_SHIP_DATA_SCALE_MIN = 0.7;
export const GARDEN_SHIP_DATA_SCALE_MAX = 3;

export function gardenShipVisualScale(dataScale: number): number {
  const clamped = Math.max(
    GARDEN_SHIP_DATA_SCALE_MIN,
    Math.min(GARDEN_SHIP_DATA_SCALE_MAX, dataScale || 1),
  );
  const t = (clamped - GARDEN_SHIP_DATA_SCALE_MIN)
    / (GARDEN_SHIP_DATA_SCALE_MAX - GARDEN_SHIP_DATA_SCALE_MIN);
  return GARDEN_SHIP_VISUAL_SCALE_MIN
    + t * (GARDEN_SHIP_VISUAL_SCALE_MAX - GARDEN_SHIP_VISUAL_SCALE_MIN);
}

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
  sample: (Pick<ShipMotionSample, "tile"> & Partial<Pick<ShipMotionSample, "state">>) | null | undefined;
  ship: ShipNode;
}): ScreenPoint {
  const { displayOffset, representative, sample, ship } = input;
  const tile = sample?.tile ?? ship.tile;
  let display: ScreenPoint;
  if (!representative) {
    display = tile;
  } else {
    const motionX = tile.x - ship.tile.x;
    const motionY = tile.y - ship.tile.y;
    const motionDistance = Math.hypot(motionX, motionY);
    const motionScale = motionDistance > 2.5 ? 2.5 / motionDistance : 1;
    display = {
      x: ship.tile.x + displayOffset.x + motionX * motionScale,
      y: ship.tile.y + displayOffset.y + motionY * motionScale,
    };
  }
  // Zones-v2 placement fix: keep the composed display tile on valid open
  // water with hull clearance from rendered landmasses (island rock, garden
  // islets, cemetery, pigeonnier). Dock-proximate motion states are exempt:
  // moored/arriving/departing ships sit at authored moorings next to piers,
  // where the dock tangent already orients the hull along the wharf.
  if (sample?.state === "moored" || sample?.state === "arriving" || sample?.state === "departing") {
    return display;
  }
  const margin = gardenShipWaterMarginTiles(gardenShipVisualScale(ship.visual.scale || 1));
  return isGardenShipWater(display, margin)
    ? display
    : nearestGardenShipWater(display, margin, `motion-display.${ship.id}`);
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

// Zones-v2 (operator hand-drawn overlay, 2026-07-24 — supersedes the Z1
// sketch agents/2026-07-24-zone-recomposition-sketch.md for LAYOUT; the data
// anchors it designed stay in force): display-vs-data decoupling. Zone DATA
// anchors (regionTile/labelTile/shipAnchors in risk-water-areas.ts) stay on
// valid painted water in the NW/NE corners; the visual composition lives here:
// - gardenAreaCenterTile: the rendered ellipse's center. May sit on the island
//   (Calm's inner harbor ring) or off-frame (Ledger's NW arc, Alert/Warning's
//   NE escalation); display-only, no terrain validity required.
// - gardenAreaDisplayTile: the DOM label / hit-target / camera-focus anchor,
//   placed on the VISIBLE arc of each zone, inset toward the frame, so labels
//   never render off-screen or over the lighthouse.
//
// N1 (2026-07-25): both tables stay authored in the 56-tile DESIGN space.
// Island-relative anchors (Calm's harbor ring, Watch's island-centered sea, and
// Calm's label inside that ring) take the landmass OFFSET; the off-frame corner
// arcs and the labels inset against the frame take the zone SCALE, so they keep
// sweeping the corners of the enlarged map.
const AREA_DISPLAY_CENTER: Record<string, ScreenPoint> = {
  // Calm: centered on the island (31,31) — the protected inner harbor ring.
  CALM: landWorldTile({ x: 31, y: 31 }),
  // Watch: roughly island-centered, slightly below — the dominant sea.
  WATCH: landWorldTile({ x: 33, y: 33 }),
  // Ledger: centered off-frame NW so only its arc sweeps the top-left quadrant.
  "ledger-mooring": zoneWorldTile({ x: -4, y: 4 }),
  // Alert > Warning > Danger: nested arcs tightening into the NE storm corner.
  ALERT: zoneWorldTile({ x: 60, y: -5 }),
  WARNING: zoneWorldTile({ x: 57, y: -1 }),
  DANGER: zoneWorldTile({ x: 53, y: 2 }),
};

const AREA_LABEL_TILE: Record<string, ScreenPoint> = {
  // On the NE harbor water inside the ring, clear of docks and the lighthouse.
  CALM: landWorldTile({ x: 42, y: 26 }),
  // On the south-west arc, inset toward the frame.
  WATCH: zoneWorldTile({ x: 14, y: 50 }),
  // On the visible arc over the ledger shelf.
  "ledger-mooring": zoneWorldTile({ x: 8, y: 10 }),
  // Staggered along their arcs so the three chips never collide.
  ALERT: zoneWorldTile({ x: 43, y: 1 }),
  WARNING: zoneWorldTile({ x: 49, y: 3 }),
  DANGER: zoneWorldTile({ x: 54, y: 4 }),
};

function areaCompositionKey(area: {
  band?: string | null;
  riskPlacement?: string | null;
}): string | null {
  return area.band ?? area.riskPlacement ?? null;
}

/** Rendered zone ellipse center (display-only; may leave the map). */
export function gardenAreaCenterTile(area: {
  band?: string | null;
  riskPlacement?: string | null;
  tile: ScreenPoint;
}): ScreenPoint {
  const key = areaCompositionKey(area);
  return (key && AREA_DISPLAY_CENTER[key]) || area.tile;
}

export function gardenAreaDisplayTile(area: {
  band?: string | null;
  riskPlacement?: string | null;
  tile: ScreenPoint;
}): ScreenPoint {
  // C3: this is the zone composition's DOM/focus integration point — the
  // label anchor on the visible arc. The rendered center lives in
  // gardenAreaCenterTile; zone radii live in garden-zones.ts (Lane Z) and the
  // count→radius encoding stays monotonic.
  const key = areaCompositionKey(area);
  return (key && AREA_LABEL_TILE[key]) || area.tile;
}

export function gardenCameraViewHeight(viewportHeight: number, zoom: number): number {
  // C3: camera-fit integration point. The L1 lighthouse scale-up and any
  // composition changes (Z1/Z4) re-frame through this function; the
  // orchestrator owns adjustments, informed by Lane L/Z proposals.
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
  // C3: ship visualScale mapping integration point. S5 (decision D-S5)
  // de-compressed the data-side 0.7–3.0 scale to a ~3.7× visual spread (see
  // gardenShipVisualScale above); this consumes the SAME mapping so selection
  // rings and label layout track the rendered footprint (1.9× hull scale, as
  // before the de-compression).
  return gardenShipVisualScale(ship.visual.scale || 1) * 1.9;
}

/**
 * W3.4 (Grand Scale Revamp): the rendered harbor.
 *
 * This used to return ONE or TWO docks — a composition choice made when only
 * 20 ships rendered. With the full fleet on screen, ~65% of it is moored, and
 * two piers meant 120+ hulls piling onto the same two moorings (the dominant
 * visual failure at scale).
 *
 * Every chain harbor now renders, greedily ordered by supply so the biggest
 * chains take the best water, and separated so piers never overlap.
 */
export const GARDEN_MAX_RENDERED_DOCKS = 10;
export const GARDEN_DOCK_SEPARATION_TILES = 7;

export function selectGardenDocks(docks: readonly DockNode[]): DockNode[] {
  const ranked = docks.toSorted((left, right) => (
    right.totalUsd - left.totalUsd || left.id.localeCompare(right.id)
  ));
  const chosen: DockNode[] = [];
  for (const dock of ranked) {
    if (chosen.length >= GARDEN_MAX_RENDERED_DOCKS) break;
    const clashes = chosen.some((other) => (
      tileDistance(dock.tile, other.tile) < GARDEN_DOCK_SEPARATION_TILES
    ));
    if (!clashes) chosen.push(dock);
  }
  // A world whose harbors all sit on top of each other still renders its
  // largest one rather than nothing.
  if (chosen.length === 0 && ranked[0]) chosen.push(ranked[0]);
  return chosen;
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

function gardenObservatoryBaseSlice(world: PharosVilleWorld): GardenObservatoryBaseSlice {
  const cached = baseSliceByWorld.get(world);
  if (cached) return cached;
  const representatives = selectRepresentativeShips(world.ships);
  const representativeDetailIds = new Set(representatives.map((ship) => ship.detailId));
  // W3 (finding F4): the authored per-zone rings were sized for ~20 ships and
  // saturated at fleet scale. Placement is now blue-noise scatter across the
  // painted terrain region each risk band owns, so the fleet fills its own
  // waters instead of piling onto the island.
  const placement = placeGardenFleet(representatives, world.lighthouse.tile);
  const slice = {
    areas: selectGardenObservatoryAreas(world.areas),
    docks: selectGardenDocks(world.docks),
    representativeDetailIds,
    ships: representatives.map((ship) => {
      const tile = placement.tileByShipId.get(ship.id) ?? ship.tile;
      return {
        displayOffset: { x: tile.x - ship.tile.x, y: tile.y - ship.tile.y },
        representative: true,
        ship,
      };
    }),
  };
  baseSliceByWorld.set(world, slice);
  return slice;
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
