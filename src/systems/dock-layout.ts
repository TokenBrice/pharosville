import type { DockNode } from "./world-types";

export type StationType = DockNode["station"]["type"];

export interface StationScaleRung {
  baseLength: number;
  span: number;
  secondLevelTop: number;
}

/** Authored civic-hall dimensions from the §6 harbor scale ladder. */
export const STATION_SCALE_LADDER: Record<StationType, StationScaleRung> = {
  "ethereum-mole": { baseLength: 24.0, span: 10.0, secondLevelTop: 21.5 },
  "stepped-inlet": { baseLength: 16.0, span: 7.8, secondLevelTop: 9.4 },
  "fishing-pier": { baseLength: 15.4, span: 6.7, secondLevelTop: 8.3 },
  "tea-house-quay": { baseLength: 15.0, span: 7.4, secondLevelTop: 10.7 },
  "hatago-wharf": { baseLength: 14.6, span: 6.6, secondLevelTop: 11.8 },
  uogashi: { baseLength: 14.2, span: 7.8, secondLevelTop: 7.2 },
  "storm-mole": { baseLength: 13.4, span: 8.8, secondLevelTop: 12.1 },
  "reed-boathouse": { baseLength: 13.6, span: 6.0, secondLevelTop: 11.2 },
  "pigeonnier-islet": { baseLength: 12.6, span: 5.6, secondLevelTop: 8.6 },
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
  /** World units along the seaward axis (land→sea). */
  length: number;
  /** World units along the shore. */
  span: number;
}

/**
 * Occupied precinct envelope for scenery and risk-marker clearance at a
 * given dock size (1–10).
 *
 * The Mole is the one station whose clearance envelope exceeds its hall:
 * its landward apron, navigable basin and unequal breakwater arms occupy
 * 40 × 30 world units around the 24 × 10 civic hall. Ship exclusion MUST NOT
 * use that precinct envelope because ships are meant to enter the basin;
 * the navigation layer owns a separate Mole-specific mouth radius.
 *
 * For every ordinary station, the scale ladder bounds today's quay and pier
 * recipe at every size. Those recipe dimensions remain in this calculation
 * so a later adjustment cannot silently outgrow the systems-owned placement
 * envelope.
 */
export function stationFootprint(
  type: StationType,
  totalUsd: number,
  size: number,
): StationFootprint {
  if (type === "ethereum-mole") return { length: 40, span: 30 };
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
  return {
    length: Math.max(scale.length, pierLength, quayLength),
    span: Math.max(scale.span, quaySpan),
  };
}

/**
 * Conservative circumscribing radius used by tile-space placement systems.
 * Round outward so integer tile searches never shave a station corner.
 * Navigation callers must retain the Mole's basin-aware mouth radius rather
 * than applying this precinct-sized radius to `ethereum-mole`.
 */
export function stationClearanceTiles(type: StationType, totalUsd: number, size: number): number {
  const { length, span } = stationFootprint(type, totalUsd, size);
  return Math.ceil(Math.hypot(length, span) / 2 / Math.SQRT2);
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
