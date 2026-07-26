import { gardenAreaCenterTile } from "./garden-observatory-slice";
import {
  ZONE_BASE_RADIUS,
  ZONE_BASE_RADIUS_LEDGER,
  ZONE_ELLIPSE_X,
  ZONE_ELLIPSE_Z,
} from "./garden-zone-radii";
import { isGardenObstacleTile } from "./garden-water-exclusion";
import { MAX_TILE_X, MAX_TILE_Y } from "./world-layout";

// Zones-v3 coverage measurement (2026-07-24): the operator steer asks that the
// six rendered zone ellipses cover a solid majority of the open-sea surface
// ("most of the total map is still empty; zones should cover at least
// 50–60%"). This module measures exactly that, deterministically, with no
// renderer: the union of the six rendered zone ellipses (display centers from
// gardenAreaCenterTile, radii from garden-zone-radii) intersected with the
// sea surface (the 112×112 tile map minus the rendered landmasses from
// garden-water-exclusion), as a fraction of the total sea surface. Both the
// centers and the radii ride the N1 map scale, so this measurement is
// scale-invariant.
//
// Radii are world units; the exclusion model works in TILE space, so the
// ellipse semi-axes are divided by TILE_TO_WORLD (√2 — same constant
// garden-water-exclusion uses; this module stays three-free).
const TILE_TO_WORLD = Math.SQRT2;

export interface GardenZoneEllipseSpec {
  key: string;
  centerTile: { x: number; y: number };
  /** Tile-space semi-axes (world semi-axes / √2). */
  rx: number;
  ry: number;
}

export interface GardenZoneCoverageInput {
  /** Ship count per zone key (band name or "ledger-mooring"); defaults to 1
      (worst case — the √count term only grows ellipses). */
  counts?: Record<string, number>;
  /** Sub-tile sampling step; smaller is finer. Default 0.25 tiles. */
  step?: number;
  /** Tuning aid: override per-band base radii (and "ledger-mooring"). */
  baseRadii?: Record<string, number>;
}

export interface GardenZoneCoverageReport {
  coverage: number;
  coveredSeaSamples: number;
  seaSamples: number;
  ellipses: GardenZoneEllipseSpec[];
}

/** The six rendered zone ellipses in tile space (display composition). */
export function gardenZoneEllipseSpecs(
  counts: Record<string, number> = {},
  baseRadii: Record<string, number> = {},
): GardenZoneEllipseSpec[] {
  const spec = (key: string, base: number, count: number): GardenZoneEllipseSpec => {
    const radius = (baseRadii[key] ?? base)
      + Math.min(2, Math.sqrt(Math.max(1, count)) * 0.3);
    const area = key === "ledger-mooring"
      ? { riskPlacement: key, tile: { x: 0, y: 0 } }
      : { band: key, tile: { x: 0, y: 0 } };
    return {
      key,
      centerTile: gardenAreaCenterTile(area),
      rx: (radius * ZONE_ELLIPSE_X) / TILE_TO_WORLD,
      ry: (radius * ZONE_ELLIPSE_Z) / TILE_TO_WORLD,
    };
  };
  return [
    ...Object.entries(ZONE_BASE_RADIUS).map(([band, base]) => (
      spec(band, base, counts[band] ?? 1)
    )),
    spec("ledger-mooring", ZONE_BASE_RADIUS_LEDGER, 1),
  ];
}

function insideEllipse(x: number, y: number, ellipse: GardenZoneEllipseSpec): boolean {
  const nx = (x - ellipse.centerTile.x) / ellipse.rx;
  const ny = (y - ellipse.centerTile.y) / ellipse.ry;
  return nx * nx + ny * ny <= 1;
}

/**
 * Fraction of the open-sea surface covered by at least one zone ellipse.
 * Grid-samples the map at `step` resolution; a sample is "sea" when it is not
 * inside any rendered landmass (garden-water-exclusion obstacles at margin 0).
 */
export function gardenZoneSeaCoverage(
  input: GardenZoneCoverageInput = {},
): GardenZoneCoverageReport {
  const step = input.step ?? 0.25;
  const ellipses = gardenZoneEllipseSpecs(input.counts, input.baseRadii);
  let seaSamples = 0;
  let coveredSeaSamples = 0;
  for (let y = step / 2; y <= MAX_TILE_Y; y += step) {
    for (let x = step / 2; x <= MAX_TILE_X; x += step) {
      if (isGardenObstacleTile(x, y)) continue;
      seaSamples += 1;
      if (ellipses.some((ellipse) => insideEllipse(x, y, ellipse))) {
        coveredSeaSamples += 1;
      }
    }
  }
  return {
    coverage: seaSamples === 0 ? 0 : coveredSeaSamples / seaSamples,
    coveredSeaSamples,
    seaSamples,
    ellipses,
  };
}
