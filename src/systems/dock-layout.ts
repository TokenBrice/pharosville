import type { DockNode } from "./world-types";

export type StationType = DockNode["station"]["type"];

export interface StationScaleRung {
  baseLength: number;
  span: number;
  secondLevelTop: number;
}

/**
 * Authored civic-hall dimensions from the §6 harbor scale ladder. The
 * ordinary rungs were re-based 2026-09-05 for the zoom-1.0 rest (operator
 * decision A4, "warm village"): each silhouette grew ~1.46–1.85x in vertical
 * scale only, so footprints, water exclusion, and berthing are untouched.
 * The band is 13.3–17.9 rather than the nominal 14–18 because the
 * clone-separation contract (no two archetypes within 10% on BOTH footprint
 * area and second-level height, `garden-docks.test.ts`) plus the preserved
 * uogashi→storm-mole order forces a >=1.331x spread between the shortest and
 * tallest ordinary rung, and the Mole's 21.5 landmark cap keeps a >=1.20x
 * lead over the tallest (17.9 x 1.2 = 21.48 <= 21.5).
 */
export const STATION_SCALE_LADDER: Record<StationType, StationScaleRung> = {
  "ethereum-mole": { baseLength: 24.0, span: 10.0, secondLevelTop: 21.5 },
  "stepped-inlet": { baseLength: 16.0, span: 7.8, secondLevelTop: 15.6 },
  "fishing-pier": { baseLength: 15.4, span: 6.7, secondLevelTop: 14.7 },
  "tea-house-quay": { baseLength: 15.0, span: 7.4, secondLevelTop: 16.2 },
  "hatago-wharf": { baseLength: 14.6, span: 6.6, secondLevelTop: 17.2 },
  uogashi: { baseLength: 14.2, span: 7.8, secondLevelTop: 13.3 },
  "storm-mole": { baseLength: 13.4, span: 8.8, secondLevelTop: 17.9 },
  "reed-boathouse": { baseLength: 13.6, span: 6.0, secondLevelTop: 16.6 },
  "pigeonnier-islet": { baseLength: 12.6, span: 5.6, secondLevelTop: 15.0 },
};

export interface StationScale extends StationScaleRung {
  heightScale: number;
  length: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Applies the live supply multiplier to the authored hall scale ladder. The
 * Mole is a civic landmark rather than a supply display, so its hall never
 * changes.
 */
export function stationScaleFor(type: StationType, totalUsd: number): StationScale {
  const rung = STATION_SCALE_LADDER[type];
  if (type === "ethereum-mole") return { ...rung, heightScale: 1, length: rung.baseLength };
  const supplyFactor = clamp(
    (Math.log10(Math.max(1, totalUsd)) - 8.5) / 3.2,
    0,
    1,
  );
  const heightScale = 0.95 + supplyFactor * 0.15;
  return {
    ...rung,
    heightScale,
    length: clamp(rung.baseLength * (0.95 + supplyFactor * 0.40), 12.6, 20.0),
    secondLevelTop: rung.secondLevelTop * heightScale,
  };
}

export interface StationFootprint {
  /** Landward edge in local world units; local +X points seaward. */
  minX: number;
  /** Seaward edge in local world units. */
  maxX: number;
  /** First alongshore edge in local world units. */
  minZ: number;
  /** Opposite alongshore edge in local world units. */
  maxZ: number;
  /** Derived local X extent, retained for dimension-only callers. */
  length: number;
  /** Derived local Z extent, retained for dimension-only callers. */
  span: number;
}

export type StationLocalBounds = Pick<StationFootprint, "minX" | "maxX" | "minZ" | "maxZ">;

export interface StationComponentBounds extends StationLocalBounds {
  readonly id: string;
}

export interface StationFootprintContract extends StationLocalBounds {
  /**
   * Solid sub-envelopes used only where the outer envelope encloses navigable
   * water. Ordinary stations are wholly solid and need no decomposition.
   */
  readonly components?: readonly StationComponentBounds[];
}

/**
 * Measured maximum-supply, size-10 bounds of each complete authored recipe,
 * relative to its cove root. These precinct envelopes, not the hall ladder
 * above, own placement clearance. `STATION_SCALE_LADDER` intentionally remains
 * the civic-hall contract used for supply mass, visual differentiation and the
 * Mole's landmark lead; collapsing hall dimensions into whole-recipe extents
 * is what previously left every landward apron and hall unprotected.
 */
export const STATION_LOCAL_BOUNDS: Record<StationType, StationFootprintContract> = {
  "ethereum-mole": {
    minX: -23.00,
    maxX: 17.00,
    minZ: -16.50,
    maxZ: 13.60,
    components: [
      { id: "ethereum-mole-landward", minX: -23.00, maxX: -3, minZ: -16.50, maxZ: 13.60 },
      { id: "ethereum-mole-long-arm", minX: -5, maxX: 17.00, minZ: -14.2, maxZ: -6.75 },
      { id: "ethereum-mole-short-arm", minX: -5, maxX: 10, minZ: 6.75, maxZ: 13.60 },
    ],
  },
  "hatago-wharf": { minX: -18.27, maxX: 6.44, minZ: -3.50, maxZ: 3.50 },
  "tea-house-quay": { minX: -18.21, maxX: 7.92, minZ: -3.88, maxZ: 3.88 },
  "fishing-pier": { minX: -18.16, maxX: 11.31, minZ: -3.45, maxZ: 3.60 },
  uogashi: { minX: -17.75, maxX: 1.92, minZ: -4.20, maxZ: 4.05 },
  "pigeonnier-islet": { minX: -17.73, maxX: 4.40, minZ: -3.23, maxZ: 3.25 },
  "stepped-inlet": { minX: -17.51, maxX: 6.91, minZ: -3.90, maxZ: 3.90 },
  "reed-boathouse": { minX: -17.38, maxX: 6.44, minZ: -3.26, maxZ: 3.26 },
  "storm-mole": { minX: -17.26, maxX: 1.82, minZ: -5.51, maxZ: 5.43 },
};

/** Complete occupied precinct envelope at the station's cove-root origin. */
export function stationFootprint(
  type: StationType,
  _totalUsd: number,
  _size: number,
): StationFootprint {
  const { minX, maxX, minZ, maxZ } = STATION_LOCAL_BOUNDS[type];
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    length: maxX - minX,
    span: maxZ - minZ,
  };
}

export interface StationFootprintRect {
  readonly id?: string;
  readonly origin: { x: number; y: number };
  readonly minAlong: number;
  readonly maxAlong: number;
  readonly minAcross: number;
  readonly maxAcross: number;
  readonly seawardX: number;
  readonly seawardY: number;
}

/** Rotates a cove-rooted local envelope into tile space. */
export function stationFootprintRect(
  type: StationType,
  origin: { x: number; y: number },
  seawardBearing: number,
  id?: string,
): StationFootprintRect {
  const bounds = STATION_LOCAL_BOUNDS[type];
  return {
    id: id ?? type,
    origin,
    minAlong: bounds.minX / Math.SQRT2,
    maxAlong: bounds.maxX / Math.SQRT2,
    minAcross: bounds.minZ / Math.SQRT2,
    maxAcross: bounds.maxZ / Math.SQRT2,
    seawardX: Math.cos(seawardBearing),
    seawardY: Math.sin(seawardBearing),
  };
}

/** Tile-space distance to the shared oriented station rectangle; zero inside. */
export function distanceToStationFootprint(
  point: { x: number; y: number },
  station: StationFootprintRect,
): number {
  const dx = point.x - station.origin.x;
  const dy = point.y - station.origin.y;
  const along = dx * station.seawardX + dy * station.seawardY;
  const across = -dx * station.seawardY + dy * station.seawardX;
  const outsideAlong = Math.max(station.minAlong - along, along - station.maxAlong, 0);
  const outsideAcross = Math.max(station.minAcross - across, across - station.maxAcross, 0);
  return Math.hypot(outsideAlong, outsideAcross);
}

/**
 * Navigation's legacy cove-centred clearance remains independent of the
 * complete placement envelope: ships enter the Mole basin and follow the
 * ordinary station's supply-scaled berth, while scenery clears full geometry.
 */
export function stationClearanceTiles(type: StationType, totalUsd: number, size: number): number {
  if (type === "ethereum-mole") return Math.ceil(Math.hypot(40, 30) / 2 / Math.SQRT2);
  const scale = stationScaleFor(type, totalUsd);
  const amountScale = 0.82 + clamp(
    (Math.log10(Math.max(1, totalUsd)) - 8.5) / 3.2,
    0,
    1,
  ) * 1.13;
  const pierLength = 7.6 * amountScale * 1.06;
  const pierWidth = (1.62 + amountScale * 0.36) * 1.08;
  const quayLength = (3.6 + clamp(size, 1, 10) / 10 * 3.5) * 1.05;
  const quaySpan = pierWidth * 2.15;
  return Math.ceil(Math.hypot(
    Math.max(scale.length, pierLength, quayLength),
    Math.max(scale.span, quaySpan),
  ) / 2 / Math.SQRT2);
}

interface ShoreFacingDock {
  station: { shoreBearing: number };
}

/** Cardinal berth-search vector derived from the station's authored land→sea bearing. */
export function dockSeawardVector(dock: ShoreFacingDock): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
  const x = Math.cos(dock.station.shoreBearing);
  const y = Math.sin(dock.station.shoreBearing);
  if (Math.abs(x) >= Math.abs(y)) return { x: x < 0 ? -1 : 1, y: 0 };
  return { x: 0, y: y < 0 ? -1 : 1 };
}

export const HARBOR_FLAG_SCALE_MULTIPLIER = 2.6;
export const HARBOR_QUAY_TOP_Y = 1.55;

export function harborAmountScale(totalUsd: number): number {
  const decades = (Math.log10(Math.max(1, totalUsd)) - 8.5) / 3.2;
  return 0.82 + Math.min(1, Math.max(0, decades)) * 1.13;
}


export function stationFlagPlacement(type: StationType, totalUsd: number, size: number) {
  const amount = harborAmountScale(totalUsd);
  const supply = Math.min(10, Math.max(1, size)) / 10;
  const length = 7.6 * amount * (type === "ethereum-mole" ? 1.5 : 1.06);
  const width = (1.62 + amount * 0.36) * (type === "ethereum-mole" ? 1.42 : 1.08);
  // Staffs rose with the 2026-09-05 station-scale ladder (ordinary x1.62,
  // pigeonnier x1.74, tracking each band's growth) so the standard still
  // reads against — and clears the eaves of — its now-taller hall. The
  // mole-head standard is unchanged: it stands on the outer arm in clear air.
  const height = (
    type === "ethereum-mole" ? 10
      : type === "pigeonnier-islet" ? 12.9
        : 13.3
  ) + supply * (type === "ethereum-mole" ? 1.25 : type === "pigeonnier-islet" ? 2.2 : 2.0);
  return {
    height,
    scale: ((type === "ethereum-mole" ? 1.05 : 0.72) + supply * 0.24)
      * HARBOR_FLAG_SCALE_MULTIPLIER,
    // The mole-head standard stands clear of the hall, on the outer arm.
    x: type === "ethereum-mole" ? 14.8 : length * 0.4,
    z: type === "ethereum-mole" ? -10.6
      : type === "hatago-wharf" ? width * 0.62
        : -width * 0.3,
  };
}
