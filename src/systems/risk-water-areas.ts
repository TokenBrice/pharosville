import type { DewsAreaBand, ShipRiskPlacement, ShipWaterZone, TerrainKind } from "./world-types";
import { zoneWorldTile } from "./map-scale";

type TileCoordinate = { x: number; y: number };

export interface RiskWaterAreaDefinition {
  placement: ShipRiskPlacement;
  label: string;
  /** One-line observer reading of the zone; shared by the legend and the
      ship detail-panel status line so the two can never drift. */
  reading: string;
  band: DewsAreaBand | null;
  regionTile: TileCoordinate;
  labelTile: TileCoordinate;
  terrain: TerrainKind;
  validTerrains: readonly TerrainKind[] | "any-water";
  waterStyle: string;
  motionZone: ShipWaterZone;
  shipAnchors: readonly TileCoordinate[];
  scatterRadius: TileCoordinate;
}

export const SHIP_RISK_PLACEMENTS = [
  "safe-harbor",
  "breakwater-edge",
  "harbor-mouth-watch",
  "outer-rough-water",
  "storm-shelf",
  "ledger-mooring",
] as const satisfies readonly ShipRiskPlacement[];

export const DEWS_AREA_BANDS = [
  "DANGER",
  "WARNING",
  "ALERT",
  "WATCH",
  "CALM",
] as const satisfies readonly DewsAreaBand[];

export const DEWS_AREA_PLACEMENTS: Record<DewsAreaBand, ShipRiskPlacement> = {
  DANGER: "storm-shelf",
  WARNING: "outer-rough-water",
  ALERT: "harbor-mouth-watch",
  WATCH: "breakwater-edge",
  CALM: "safe-harbor",
};

/**
 * Authored in DESIGN SPACE (the original 56-tile grid). `RISK_WATER_AREAS`
 * below exposes the same table scaled onto the live world grid, so these
 * numbers stay readable against the design diagrams while the world is 2x
 * larger (N1).
 */
const AUTHORED_RISK_WATER_AREAS: Record<ShipRiskPlacement, RiskWaterAreaDefinition> = {
  "safe-harbor": {
    placement: "safe-harbor",
    label: "Calm Anchorage",
    reading: "Steady peg evidence; the safe default berth",
    band: "CALM",
    // Z1 (data anchors from the operator-approved sketch
    // agents/2026-07-24-zone-recomposition-sketch.md): Calm Anchorage keeps
    // its south-west calm-water anchors. Zones-v2 (operator overlay): the
    // RENDERED ring re-centers on the island as the inner harbor ring — the
    // display composition lives in garden-observatory-slice.ts
    // (AREA_DISPLAY_CENTER / AREA_LABEL_TILE), not in this data.
    regionTile: { x: 11, y: 36 },
    labelTile: { x: 11, y: 36 },
    terrain: "calm-water",
    validTerrains: ["calm-water"],
    waterStyle: "left-edge calm anchorage",
    motionZone: "calm",
    // N2: the extreme south-west corner became the wreck shoals, so Calm's
    // southern anchors move north out of the graveyard's water.
    shipAnchors: [
      { x: 0, y: 15 },
      { x: 0, y: 27 },
      { x: 0, y: 33 },
      { x: 3, y: 36 },
      { x: 6, y: 20 },
      { x: 8, y: 32 },
      { x: 16, y: 40 },
      // Z1 optional additions so moored ships populate the new ring.
      { x: 13, y: 41 },
      { x: 19, y: 45 },
    ],
    scatterRadius: { x: 7, y: 15 },
  },
  "breakwater-edge": {
    placement: "breakwater-edge",
    label: "Watch Breakwater",
    reading: "Early-warning signals worth watching",
    band: "WATCH",
    // Z1: Watch Breakwater anchors the south basin. Zones-v2 (operator
    // overlay): the RENDERED ellipse re-centers on the island as the
    // dominant monitored sea (see garden-observatory-slice.ts).
    regionTile: { x: 38, y: 48 },
    labelTile: { x: 38, y: 48 },
    terrain: "watch-water",
    validTerrains: ["watch-water"],
    waterStyle: "south-basin and east-shelf watch breakwater",
    motionZone: "watch",
    shipAnchors: [
      { x: 38, y: 52 },
      { x: 41, y: 52 },
      { x: 43, y: 54 },
      { x: 44, y: 44 },
      { x: 48, y: 44 },
      { x: 52, y: 42 },
      { x: 55, y: 40 },
      { x: 50, y: 48 },
      { x: 54, y: 45 },
      { x: 50, y: 22 },
      { x: 53, y: 25 },
      { x: 55, y: 28 },
      { x: 51, y: 32 },
      { x: 55, y: 35 },
      { x: 38, y: 55 },
      { x: 42, y: 55 },
      { x: 46, y: 55 },
    ],
    scatterRadius: { x: 18, y: 14 },
  },
  "harbor-mouth-watch": {
    placement: "harbor-mouth-watch",
    label: "Alert Channel",
    reading: "Elevated DEWS alert; pressure building",
    band: "ALERT",
    // Z1: Alert Channel anchors its painted alert-water ring. Zones-v2
    // (operator overlay): the RENDERED arc centers off-frame NE, outermost of
    // the Alert>Warning>Danger escalation (see garden-observatory-slice.ts).
    regionTile: { x: 50, y: 16 },
    labelTile: { x: 50, y: 16 },
    terrain: "alert-water",
    validTerrains: ["alert-water"],
    waterStyle: "east-corner alert ring",
    motionZone: "alert",
    shipAnchors: [
      { x: 55, y: 12 },
      { x: 55, y: 14 },
      { x: 55, y: 17 },
      { x: 47, y: 14 },
      { x: 45, y: 12 },
      { x: 40, y: 0 },
      { x: 43, y: 0 },
    ],
    scatterRadius: { x: 8, y: 7 },
  },
  "outer-rough-water": {
    placement: "outer-rough-water",
    label: "Warning Shoals",
    reading: "Serious peg stress; shallow, hazardous water",
    band: "WARNING",
    regionTile: { x: 50, y: 8 },
    labelTile: { x: 50, y: 8 },
    terrain: "warning-water",
    validTerrains: ["warning-water"],
    waterStyle: "east-corner warning ring",
    motionZone: "warning",
    shipAnchors: [
      { x: 55, y: 8 },
      { x: 55, y: 11 },
      { x: 50, y: 8 },
      { x: 47, y: 0 },
      { x: 45, y: 0 },
      { x: 51, y: 9 },
      { x: 53, y: 9 },
    ],
    scatterRadius: { x: 5, y: 5 },
  },
  "storm-shelf": {
    placement: "storm-shelf",
    label: "Danger Strait",
    reading: "Active depeg or critical risk; storm water",
    band: "DANGER",
    regionTile: { x: 54, y: 1 },
    labelTile: { x: 54, y: 1 },
    terrain: "storm-water",
    validTerrains: ["storm-water"],
    waterStyle: "east-corner danger core",
    motionZone: "danger",
    shipAnchors: [
      { x: 55, y: 0 },
      { x: 55, y: 3 },
      { x: 55, y: 5 },
      { x: 54, y: 1 },
      { x: 53, y: 2 },
      { x: 54, y: 4 },
      { x: 52, y: 0 },
    ],
    scatterRadius: { x: 4, y: 4 },
  },
  "ledger-mooring": {
    placement: "ledger-mooring",
    label: "Ledger Mooring",
    reading: "NAV-priced ledger assets; priced by attestation, not market peg",
    band: null,
    regionTile: { x: 10, y: 5 },
    labelTile: { x: 10, y: 5 },
    terrain: "ledger-water",
    validTerrains: ["ledger-water"],
    waterStyle: "top-shelf NAV ledger mooring",
    motionZone: "ledger",
    shipAnchors: [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 15, y: 0 },
      { x: 20, y: 0 },
      { x: 3, y: 4 },
      { x: 10, y: 5 },
      { x: 18, y: 5 },
      { x: 25, y: 5 },
      { x: 5, y: 8 },
      { x: 15, y: 8 },
      { x: 22, y: 8 },
    ],
    scatterRadius: { x: 14, y: 5 },
  },
};

/**
 * N1: zone anchors are stretched onto the enlarged grid alongside the zone
 * terrain itself, so a band's ships, label and region tile all land inside the
 * band's painted water exactly as they did at the authored scale.
 */
function scaleRiskWaterArea(area: RiskWaterAreaDefinition): RiskWaterAreaDefinition {
  return {
    ...area,
    labelTile: zoneWorldTile(area.labelTile),
    regionTile: zoneWorldTile(area.regionTile),
    shipAnchors: area.shipAnchors.map((anchor) => zoneWorldTile(anchor)),
    scatterRadius: zoneWorldTile(area.scatterRadius),
  };
}

export const RISK_WATER_AREAS: Record<ShipRiskPlacement, RiskWaterAreaDefinition> = Object.fromEntries(
  SHIP_RISK_PLACEMENTS.map((placement) => [placement, scaleRiskWaterArea(AUTHORED_RISK_WATER_AREAS[placement])]),
) as Record<ShipRiskPlacement, RiskWaterAreaDefinition>;

function mapRiskWaterAreas<T>(select: (area: RiskWaterAreaDefinition) => T): Record<ShipRiskPlacement, T> {
  return Object.fromEntries(
    SHIP_RISK_PLACEMENTS.map((placement) => [placement, select(RISK_WATER_AREAS[placement])]),
  ) as Record<ShipRiskPlacement, T>;
}

export const RISK_WATER_REGION_TILES = mapRiskWaterAreas((area) => area.regionTile);
export const SHIP_WATER_ANCHORS = mapRiskWaterAreas((area) => area.shipAnchors);
export const SHIP_SCATTER_RADIUS = mapRiskWaterAreas((area) => area.scatterRadius);

export function riskWaterAreaForPlacement(placement: ShipRiskPlacement): RiskWaterAreaDefinition {
  return RISK_WATER_AREAS[placement];
}

export function dewsAreaPlacementForBand(band: string | null | undefined): ShipRiskPlacement | null {
  const normalized = band?.toUpperCase();
  if (!normalized || !(normalized in DEWS_AREA_PLACEMENTS)) return null;
  return DEWS_AREA_PLACEMENTS[normalized as DewsAreaBand];
}

export function waterZoneForPlacement(placement: ShipRiskPlacement): ShipWaterZone {
  return RISK_WATER_AREAS[placement].motionZone;
}
