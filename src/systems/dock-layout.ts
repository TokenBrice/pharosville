import { REST_SEAT_YAW_RAD } from "./rest-seat";
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
  frontageScale: number;
  length: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Allocates horizontal station mass by tracked-supply share. A decade either
 * side of the rendered-harbour median reaches the authored 0.75–1.25 bounds;
 * the vertical recognizability ladder remains data-independent.
 */
export function stationScaleFor(
  type: StationType,
  frontageShare = 1,
  medianShare = frontageShare / Math.sqrt(10),
): StationScale {
  const rung = STATION_SCALE_LADDER[type];
  if (type === "ethereum-mole") {
    return { ...rung, frontageScale: 1, heightScale: 1, length: rung.baseLength };
  }
  const ratio = frontageShare > 0 && medianShare > 0 ? frontageShare / medianShare : 1;
  const frontageScale = clamp(0.75 + 0.5 * clamp(Math.log10(ratio), -1, 1), 0.75, 1.25);
  return {
    ...rung,
    frontageScale,
    heightScale: 1,
    length: rung.baseLength * frontageScale,
    span: rung.span * frontageScale,
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
 * Short W3.9 approaches extend only the seaward edge: ordinary aprons reach
 * x=5.278 at minimum amount / maximum frontage; the Mole short arm reaches 12.40.
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
      { id: "ethereum-mole-short-arm", minX: -5, maxX: 12.40, minZ: 6.75, maxZ: 13.60 },
    ],
  },
  "hatago-wharf": { minX: -18.27, maxX: 6.44, minZ: -3.50, maxZ: 3.50 },
  "tea-house-quay": { minX: -18.21, maxX: 7.92, minZ: -3.88, maxZ: 3.88 },
  "fishing-pier": { minX: -18.16, maxX: 11.31, minZ: -3.45, maxZ: 3.60 },
  uogashi: { minX: -17.75, maxX: 5.28, minZ: -4.20, maxZ: 4.05 },
  "pigeonnier-islet": { minX: -17.73, maxX: 5.28, minZ: -3.23, maxZ: 3.25 },
  "stepped-inlet": { minX: -17.51, maxX: 6.91, minZ: -3.90, maxZ: 3.90 },
  "reed-boathouse": { minX: -17.38, maxX: 6.44, minZ: -3.26, maxZ: 3.26 },
  "storm-mole": { minX: -17.26, maxX: 5.28, minZ: -5.51, maxZ: 5.43 },
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
export function stationClearanceTiles(
  type: StationType,
  totalUsd: number,
  size: number,
  frontageShare = 1,
  frontageMedianShare = frontageShare,
): number {
  if (type === "ethereum-mole") return Math.ceil(Math.hypot(40, 30) / 2 / Math.SQRT2);
  const scale = stationScaleFor(type, frontageShare, frontageMedianShare);
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

export const HARBOR_QUAY_TOP_Y = 1.55;

export function harborAmountScale(totalUsd: number): number {
  const decades = (Math.log10(Math.max(1, totalUsd)) - 8.5) / 3.2;
  return 0.82 + Math.min(1, Math.max(0, decades)) * 1.13;
}

/**
 * Nobori (plan K28, harbour-2): each harbour names itself with a tall, narrow
 * banner on an L-pole — undyed cloth carrying the chain's mark — standing on
 * an open deck, landing or low eave of its station. It replaces the ×4.2
 * rooftop board flags, which flew at the Pharos gallery line and out-chromed
 * `vermillion`. Rank is carried by rhythm, not size: the Ethereum Mole flies a
 * pair. The cloth never grows; the painted mark grows within it.
 *
 * Cloth is `NOBORI_CLOTH_ASPECT` times taller than wide; the width follows
 * supply from 0.97 to 1.165 u, so heights run 3.16–3.79 u.
 */
export const NOBORI_CLOTH_ASPECT = 3.25;
/** Clear height from the deck to the cloth's lower hem. */
const NOBORI_HEM_CLEARANCE = 1.4;
/** Pole above the crossbar. */
const NOBORI_POLE_CAP = 0.18;
/** Pole-to-pole spacing of the Mole's pair, along the cloth. */
const NOBORI_PAIR_SPACING = 1.6;

/**
 * The world yaw every nobori faces: the rest seat's, so the cloth is square to
 * the authored view (the plane's normal points back along the seat's line of
 * sight and the cloth flies toward screen-right from its pole).
 */
export const HARBOR_NOBORI_FACING_YAW = REST_SEAT_YAW_RAD;

interface NoboriSite {
  /**
   * The authored edge the pole's x is measured from: the seaward face of the
   * station's main hall (`hall`), its quay centre (`quay`), or the Mole's
   * fixed arms (`mole`, absolute).
   */
  from: "hall" | "quay" | "mole";
  x: number;
  z: number;
  /** The eave, ridge or landing the pole stands on (station-local y). */
  footY: number;
  /**
   * Cloth hem, where the pole rises through a sloped roof whose height under
   * it moves with frontage; defaults to `footY + NOBORI_HEM_CLEARANCE`.
   */
  hemY?: number;
}

/**
 * One authored site per station form. Ordinary stations stand the pole at the
 * seaward eave of their main roof — the only edge that stays over structure at
 * every supply and frontage, since the halls grow with frontage while quays
 * and approaches grow with supply — so the cloth clears the roof beneath it
 * and reads against the water. The reed boathouse uses its ridge, which the
 * dome leaves clear, and the uogashi rises through the low, seaward side of
 * its mono-pitch roof; the Mole's pair stands on the short-arm landing. Every
 * tip stays under `HARBOR_NOBORI_ENVELOPE.tipLocalY`, 13.7 u above the water.
 * Siting is checked against the authored geometry over the supply space in
 * `garden-harbor-batch.test.ts`.
 */
const NOBORI_SITES: Record<StationType, NoboriSite> = {
  "ethereum-mole": { from: "mole", x: 8.2, z: 11.0, footY: HARBOR_QUAY_TOP_Y },
  // The seaward eave of the roofed water stair, clear of the inn.
  "hatago-wharf": { from: "hall", x: 3.75, z: -0.5, footY: 5.13 },
  "stepped-inlet": { from: "hall", x: -0.12, z: -1.0, footY: 4.47 },
  uogashi: { from: "hall", x: -1.75, z: 2.75, footY: 5.85, hemY: 7.52 },
  "fishing-pier": { from: "hall", x: -0.5, z: -0.25, footY: 4.56 },
  "reed-boathouse": { from: "quay", x: -7.0, z: 0, footY: 6.26 },
  "tea-house-quay": { from: "hall", x: 0, z: -1.75, footY: 4.73 },
  "storm-mole": { from: "hall", x: 0, z: 2.75, footY: 4.63 },
  "pigeonnier-islet": { from: "hall", x: -0.25, z: 0, footY: 4.7 },
};

/** Main-hall centre relative to `quayX`, as each station author places it in `garden-docks.ts`. */
const HALL_CENTRE_FROM_QUAY: Record<StationType, number> = {
  "ethereum-mole": 0,
  "fishing-pier": -3.2,
  "hatago-wharf": -3.4,
  "pigeonnier-islet": -3.2,
  "reed-boathouse": -3.2,
  "stepped-inlet": -2.8,
  "storm-mole": -3.2,
  "tea-house-quay": -3.2,
  uogashi: -3.2,
};

export interface NoboriBanner {
  /** Pole axis, station-local. */
  x: number;
  z: number;
  footY: number;
  poleTopY: number;
  /** Crossbar and cloth top edge. */
  clothTopY: number;
  clothBottomY: number;
  clothWidth: number;
  clothHeight: number;
}

export interface StationNobori {
  /** Station-local yaw of every banner: hoist at the pole, cloth flying along local (cos, 0, −sin). */
  yaw: number;
  banners: NoboriBanner[];
}

export interface NoboriDock {
  station: { type: StationType; shoreBearing: number };
  totalUsd: number;
  size: number;
  frontageShare?: number | undefined;
  frontageMedianShare?: number | undefined;
}

/** Cloth width for a station's supply rung (0.97–1.165 u). */
export function noboriClothWidth(size: number): number {
  return 0.95 + 0.215 * (Math.min(10, Math.max(1, size)) / 10);
}

/**
 * The banners a station flies, in station-local space (root at the dock tile,
 * rotated by −shoreBearing, local +x seaward). The quay and hall arithmetic
 * repeats `authorDock`'s, so the pole lands on the same eave at every supply
 * and frontage.
 */
export function stationNobori(dock: NoboriDock): StationNobori {
  const { type, shoreBearing } = dock.station;
  const yaw = HARBOR_NOBORI_FACING_YAW + shoreBearing;
  const site = NOBORI_SITES[type];
  let x = site.x;
  if (site.from !== "mole") {
    const quayX = -7.6 * harborAmountScale(dock.totalUsd) * 1.06 * 0.3;
    const hall = stationScaleFor(type, dock.frontageShare, dock.frontageMedianShare);
    x += site.from === "quay" ? quayX : quayX + HALL_CENTRE_FROM_QUAY[type] + hall.length / 2;
  }
  const clothWidth = noboriClothWidth(dock.size);
  const clothHeight = clothWidth * NOBORI_CLOTH_ASPECT;
  const clothBottomY = site.hemY ?? site.footY + NOBORI_HEM_CLEARANCE;
  const clothTopY = clothBottomY + clothHeight;
  const banner = (poleX: number, poleZ: number): NoboriBanner => ({
    clothBottomY,
    clothHeight,
    clothTopY,
    clothWidth,
    footY: site.footY,
    poleTopY: clothTopY + NOBORI_POLE_CAP,
    x: poleX,
    z: poleZ,
  });
  const banners = [banner(x, site.z)];
  if (type === "ethereum-mole") {
    banners.push(banner(
      x + Math.cos(yaw) * NOBORI_PAIR_SPACING,
      site.z - Math.sin(yaw) * NOBORI_PAIR_SPACING,
    ));
  }
  return { banners, yaw };
}

export interface NoboriEnvelope {
  /** Highest pole tip, station-local (world y = `GARDEN_DOCK_ROOT_Y` + this). */
  tipLocalY: number;
  /** Lowest cloth hem, station-local. */
  clothBottomLocalY: number;
  /** Largest horizontal distance of any pole or cloth point from the dock tile centre, in world units. */
  reach: number;
}

/**
 * The volume any station's nobori can occupy, over every form, supply,
 * frontage and shore bearing (wind yaw included: cloth swings about its pole).
 * The rest-shot corridor test keeps its inlet clear of this envelope around
 * each dock tile.
 */
export const HARBOR_NOBORI_ENVELOPE: NoboriEnvelope = (() => {
  let tipLocalY = -Infinity;
  let clothBottomLocalY = Infinity;
  let reach = 0;
  for (const type of Object.keys(NOBORI_SITES) as StationType[]) {
    for (const size of [1, 10]) for (const totalUsd of [1, 1e13]) for (const frontageShare of [0.01, 1, 100]) {
      for (let quarter = 0; quarter < 8; quarter += 1) {
        const { banners } = stationNobori({
          frontageMedianShare: 1,
          frontageShare,
          size,
          station: { shoreBearing: (quarter * Math.PI) / 4, type },
          totalUsd,
        });
        for (const banner of banners) {
          tipLocalY = Math.max(tipLocalY, banner.poleTopY);
          clothBottomLocalY = Math.min(clothBottomLocalY, banner.clothBottomY);
          reach = Math.max(reach, Math.hypot(banner.x, banner.z) + banner.clothWidth);
        }
      }
    }
  }
  return { clothBottomLocalY, reach, tipLocalY };
})();
