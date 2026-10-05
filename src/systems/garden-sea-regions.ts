import { RISK_WATER_AREAS, WRECK_SHOAL_AREA } from "./risk-water-areas";
import { seaBodyForArea, type SeaBodyAreaKey } from "./sea-bodies";
import {
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
  terrainKindAt,
} from "./world-layout";
import type { TerrainKind } from "./world-types";

/**
 * W2 (Grand Scale Revamp, decision D5): the sea regions.
 *
 * The six DEWS zones used to be drawn as overlapping ellipses with a 4–20%
 * tint — a chart annotation floating on uniform water. Meanwhile
 * `terrainKindAt` partitions 75.8% of the rim-bounded sea into named, contiguous,
 * organically-shaped regions, and ship placement and motion already obey it
 * (plan finding F6). The renderer simply never drew it.
 *
 * This module rasterises that existing field into a texture the water shader
 * samples, so a region reads as a body of water with an edge — and the
 * boundary you see is exactly the boundary the simulation uses. No new
 * partition is invented; inventing one is what let display and data drift
 * apart in the first place.
 */

/** Region ids, encoded in the field texture's red channel. */
export const SEA_REGION_ID = {
  none: 0,
  calm: 1,
  watch: 2,
  alert: 3,
  warning: 4,
  danger: 5,
  ledger: 6,
  open: 7,
  wreck: 8,
} as const;

export type SeaRegionName = keyof typeof SEA_REGION_ID;

export const SEA_REGION_COUNT = 9;

export interface RiskSurfaceSignature {
  readonly label: string;
  readonly kind: "mirror" | "strokes" | "silt";
  /** World-unit spacing between groups, and seeded stroke length range. */
  readonly pitch: number;
  readonly length: readonly [number, number];
  readonly grouping: number;
  /** Across-stroke spacing inside a group, in world units. */
  readonly gap: number;
  /** Authored world-space bearing; Warning is offset by 20 degrees. */
  readonly bearing: number;
  readonly coverageCap: number;
  /** Passive dark-core value weight, not emission or optical roughness. */
  readonly value: number;
}

function surfaceSignature(
  label: string, kind: RiskSurfaceSignature["kind"], pitch: number,
  minimumLength: number, maximumLength: number, grouping: number,
  gap: number, bearing: number, coverageCap: number, value: number,
): Readonly<RiskSurfaceSignature> {
  return Object.freeze({
    label, kind, pitch, length: Object.freeze([minimumLength, maximumLength] as const),
    grouping, gap, bearing, coverageCap, value,
  });
}

/** Five ordinal bands and two explicitly non-ordinal waters; shared with the reading key. */
export const RISK_SURFACE_SIGNATURES = Object.freeze({
  calm: surfaceSignature(RISK_WATER_AREAS["safe-harbor"].label, "mirror", 0, 0, 0, 0, 0, 1.29, 0, 0),
  watch: surfaceSignature(RISK_WATER_AREAS["breakwater-edge"].label, "strokes", 12, 18, 30, 1, 0, 1.41, 0.03, 0.22),
  alert: surfaceSignature(RISK_WATER_AREAS["harbor-mouth-watch"].label, "strokes", 10, 8, 14, 2, 3, -1.48, 0.05, 0.28),
  warning: surfaceSignature(RISK_WATER_AREAS["outer-rough-water"].label, "strokes", 8, 3, 6, 3, 2, -1.3 + Math.PI / 9, 0.07, 0.34),
  danger: surfaceSignature(RISK_WATER_AREAS["storm-shelf"].label, "strokes", 6, 3, 5, 4, 1.5, -0.78, 0.1, 0.42),
  ledger: surfaceSignature(RISK_WATER_AREAS["ledger-mooring"].label, "strokes", 24, 18, 30, 1, 0, 0, 0.015, 0.18),
  wreck: surfaceSignature(WRECK_SHOAL_AREA.label, "silt", 0, 0, 0, 0, 0, 0, 0.04, 0.18),
});

/**
 * Band/placement -> sea-region slot. The rendered geometry comes from the
 * terrain field; this only says which slot a band's live colour drives.
 *
 * `seaBodyForArea` is the one authority for the band mapping; every
 * `SeaBodyName` is also a region name, so the slot is a lookup on top of it.
 */
export function seaRegionIdForArea(area: SeaBodyAreaKey): number {
  const body = seaBodyForArea(area);
  return body ? SEA_REGION_ID[body] : SEA_REGION_ID.none;
}

const REGION_FOR_TERRAIN: Partial<Record<TerrainKind, number>> = {
  rim: SEA_REGION_ID.none,
  "alert-water": SEA_REGION_ID.alert,
  "calm-water": SEA_REGION_ID.calm,
  "harbor-water": SEA_REGION_ID.calm,
  "ledger-water": SEA_REGION_ID.ledger,
  "storm-water": SEA_REGION_ID.danger,
  "warning-water": SEA_REGION_ID.warning,
  "watch-water": SEA_REGION_ID.watch,
  "wreck-water": SEA_REGION_ID.wreck,
  // The island periphery and lighthouse sightline stay deliberately
  // unassigned: they are the harbor approach and the monument's open water,
  // and they carry the composition's breathing room (D5).
  "deep-water": SEA_REGION_ID.open,
  water: SEA_REGION_ID.open,
};

/**
 * Field resolution. 512² over a 140-tile map is ~3.7 samples per tile, enough
 * that the boundary distance channel stays smooth under the shader's blend
 * without the texture itself becoming a memory concern (256 KiB, one upload).
 */
export const SEA_REGION_FIELD_SIZE = 512;

/**
 * Tile distance represented by a fully white boundary-distance texel.
 *
 * The transform used to divide by a fixed 24 texels, which silently changed
 * its world width whenever a focused test built a smaller field. Keeping the
 * scale in tiles makes both the shader's boundary banks and the field itself
 * speak the same unit: named-body seams can now be asserted as a deliberate
 * few-tile treatment rather than as an opaque normalised threshold.
 */
export const SEA_REGION_DISTANCE_FULL_SCALE_TILES = 6.5;

/**
 * T3.2 (2026-09-07): tile distance from LAND represented by a fully white
 * shore-distance texel.
 *
 * `SeaRegionField` has always documented "B = shore distance" and has always
 * written zero there, so the water shader hand-authored ~35 lines of ellipse
 * and sine bathymetry approximating a coastline the terrain field knows
 * exactly. 24 tiles is where the authored island ramp reached full depth
 * (smoothstep(0.92, 3.8) on an 18.4x13.8-tile ellipse), so the new channel
 * lands on the same physical scale the shader was already tuned against.
 */
export const SEA_REGION_SHORE_FULL_SCALE_TILES = 24;

export interface SeaRegionField {
  /**
   * RGBA: R = region id (0-255 scaled), G = boundary distance, B = shore
   * distance (T3.2, 2026-09-07 — declared here since W2, written as zero until
   * then). G and B are both normalised chamfer distances, over
   * `SEA_REGION_DISTANCE_FULL_SCALE_TILES` and
   * `SEA_REGION_SHORE_FULL_SCALE_TILES` respectively.
   */
  data: Uint8Array;
  size: number;
  /** World-space extent the field covers, in tiles. */
  tileSpan: number;
}

export function seaRegionAtTile(x: number, y: number): number {
  return REGION_FOR_TERRAIN[terrainKindAt(x, y)] ?? SEA_REGION_ID.none;
}

/**
 * Builds the region field.
 *
 * Region ids are sampled straight from `terrainKindAt` at supersampled
 * resolution — the classification is authoritative and is never smoothed or
 * reassigned (W2.2's contract). What IS smoothed is the *distance* channel:
 * a two-pass chamfer transform over the boundary mask, which the shader uses
 * to blend region character and to draw the drifting foam line where two
 * bodies of water meet.
 */
export function buildSeaRegionField(size = SEA_REGION_FIELD_SIZE): SeaRegionField {
  const data = new Uint8Array(size * size * 4);
  const ids = new Uint8Array(size * size);
  const tileSpan = PHAROSVILLE_MAP_WIDTH;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const tileX = (px / size) * PHAROSVILLE_MAP_WIDTH;
      const tileY = (py / size) * PHAROSVILLE_MAP_HEIGHT;
      // Z2 (Sea Master, 2026-07-25): sampled STRAIGHT.
      //
      // This used to displace the sample position by a domain warp of up to
      // ~12 tiles, to hide the ruler-straight edges the old half-plane terrain
      // produced. It hid them badly and cost something far worse: the warp
      // lived only here, so the water shader drew one boundary while ships,
      // buoys, motion and labels obeyed another. Measured, 13.7% of the sea was
      // painted a different region than the simulation used — 70% of open
      // water, 39% of Warning Shoals.
      //
      // The warp now lives in `sea-bodies.ts`, inside classification itself, so
      // the wandering edge IS the real edge and there is nothing left to hide.
      ids[py * size + px] = seaRegionAtTile(Math.floor(tileX), Math.floor(tileY));
    }
  }

  // Boundary mask: a texel is on a boundary when a 4-neighbour differs.
  const distance = new Float32Array(size * size).fill(Number.POSITIVE_INFINITY);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const index = py * size + px;
      const id = ids[index]!;
      const left = px > 0 ? ids[index - 1]! : id;
      const right = px < size - 1 ? ids[index + 1]! : id;
      const up = py > 0 ? ids[index - size]! : id;
      const down = py < size - 1 ? ids[index + size]! : id;
      if (id !== left || id !== right || id !== up || id !== down) distance[index] = 0;
    }
  }
  chamferDistance(distance, size);

  // T3.2 (2026-09-07): the shore-distance channel this interface has always
  // declared. Same transform, different seed: every LAND texel is zero, so a
  // water texel carries its real distance to the nearest coast — every coast,
  // not the one island the water shader could afford to hand-author.
  const shore = new Float32Array(size * size).fill(Number.POSITIVE_INFINITY);
  for (let index = 0; index < size * size; index += 1) {
    if (ids[index] === SEA_REGION_ID.none) shore[index] = 0;
  }
  chamferDistance(shore, size);
  const shoreScale = (size / tileSpan) * SEA_REGION_SHORE_FULL_SCALE_TILES;

  // Normalise: the shader wants 0 at a boundary rising to 1 well inside a
  // region. The scale is expressed in map tiles so alternate bake sizes keep
  // exactly the same physical bank width as the production 512px field.
  const distanceScale = (size / tileSpan) * SEA_REGION_DISTANCE_FULL_SCALE_TILES;
  for (let index = 0; index < size * size; index += 1) {
    data[index * 4] = ids[index]!;
    data[index * 4 + 1] = Math.min(255, Math.round((distance[index]! / distanceScale) * 255));
    data[index * 4 + 2] = Math.min(255, Math.round((shore[index]! / shoreScale) * 255));
    data[index * 4 + 3] = 255;
  }

  return { data, size, tileSpan };
}

/** Two-pass chamfer (3-4) distance transform. Cheap and smooth enough here. */
function chamferDistance(distance: Float32Array, size: number): void {
  const straight = 1;
  const diagonal = Math.SQRT2;
  const relax = (index: number, from: number, cost: number) => {
    const candidate = distance[from]! + cost;
    if (candidate < distance[index]!) distance[index] = candidate;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      if (x > 0) relax(index, index - 1, straight);
      if (y > 0) relax(index, index - size, straight);
      if (x > 0 && y > 0) relax(index, index - size - 1, diagonal);
      if (x < size - 1 && y > 0) relax(index, index - size + 1, diagonal);
    }
  }
  for (let y = size - 1; y >= 0; y -= 1) {
    for (let x = size - 1; x >= 0; x -= 1) {
      const index = y * size + x;
      if (x < size - 1) relax(index, index + 1, straight);
      if (y < size - 1) relax(index, index + size, straight);
      if (x < size - 1 && y < size - 1) relax(index, index + size + 1, diagonal);
      if (x > 0 && y < size - 1) relax(index, index + size - 1, diagonal);
    }
  }
}

/**
 * The static codebook above carries non-colour, non-motion risk meaning.
 * These optical parameters reinforce body identity; their agitation is not an
 * ordinal requirement. Pond optics can change them without changing the key.
 */
export interface SeaRegionCharacter {
  /** Authored hue destination; shader luminance matching keeps value with depth. */
  tint: string;
  /** Multiplies the shared swell amplitude. */
  swell: number;
  /** Multiplies chop frequency — higher reads as rougher, more broken water. */
  chop: number;
  /** How much sky and lighthouse the surface returns. Calm water is a mirror. */
  reflectivity: number;
  /** Darkens (< 1) or lifts (> 1) the region against the base water colour. */
  depth: number;
  /** Strength of the body's hue after luminance matching; K7 keeps it quiet (~0.25). */
  tintStrength: number;
  /** Base probe roughness in the shared pond envelope, before filtering variance. */
  probeRoughness: number;
  /** Direction the body's normal flow travels in world-tile radians. */
  flowBearing: number;
  /** 0 follows the shared wind; 1 holds the authored body direction. */
  flowHold: number;
  /** Strength of the optical fine normal term, independent of static ink. */
  normalDetail: number;
  /** Pale local shelf contribution; deliberately concentrated in Warning. */
  shallowShelf: number;
  /** Physical width of the low-frequency body-boundary treatment. */
  boundaryWidthTiles: number;
  /** Pale seam contribution inside the body's boundary bank. */
  boundaryFoam: number;
  /** Value-only bank/striations contribution inside the body's boundary bank. */
  boundaryBank: number;
}

export const SEA_REGION_CHARACTER: Record<SeaRegionName, SeaRegionCharacter> = {
  none: {
    tint: "#ffffff",
    swell: 0.34, chop: 0.8, reflectivity: 1, depth: 1,
    tintStrength: 0, probeRoughness: 0.12, flowBearing: 0, flowHold: 0, normalDetail: 0.55,
    shallowShelf: 0,
    boundaryWidthTiles: 0, boundaryFoam: 0, boundaryBank: 0,
  },
  // Value multipliers survive the shader's tint luma match. Keep the ladder
  // wide enough to read at rest without turning the bodies into painted regions.
  //
  // The protected inner harbour: near-still, the most mirror-like water in the
  // scene — glass that holds the sky and the tower, never a mint plate.
  // Physical shelter, not categorical severity, quiets the optical surface.
  calm: {
    tint: "#4b927f",
    swell: 0.2, chop: 0.7, reflectivity: 1.4, depth: 0.95,
    tintStrength: 0.18, probeRoughness: 0.06, flowBearing: 1.29, flowHold: 0.22, normalDetail: 0.25,
    shallowShelf: 0,
    boundaryWidthTiles: 2.6, boundaryFoam: 0.025, boundaryBank: 0.13,
  },
  // Broad, low-amplitude directional ripples; bending singles carry Watch.
  watch: {
    tint: "#357f9a",
    swell: 0.32, chop: 0.8, reflectivity: 1.15, depth: 1.04,
    tintStrength: 0.22, probeRoughness: 0.1, flowBearing: 1.41, flowHold: 0.86, normalDetail: 0.55,
    shallowShelf: 0,
    boundaryWidthTiles: 3, boundaryFoam: 0.05, boundaryBank: 0.1,
  },
  // Alert's authored optical current follows its channel.
  alert: {
    tint: "#73845b",
    swell: 0.3, chop: 0.8, reflectivity: 1.1, depth: 0.93,
    tintStrength: 0.24, probeRoughness: 0.12, flowBearing: -1.48, flowHold: 0.98, normalDetail: 0.5,
    shallowShelf: 0,
    boundaryWidthTiles: 3.25, boundaryFoam: 0.07, boundaryBank: 0.13,
  },
  // Pale shallow shelf, with the same pond-calm optical ceiling.
  warning: {
    tint: "#af9868",
    swell: 0.26, chop: 0.75, reflectivity: 1, depth: 0.88,
    tintStrength: 0.25, probeRoughness: 0.16, flowBearing: -1.3, flowHold: 0.9, normalDetail: 0.45,
    shallowShelf: 0.94,
    boundaryWidthTiles: 3.6, boundaryFoam: 0.108, boundaryBank: 0.05,
  },
  // Danger retains its subdued leaden hue/value; static groups carry severity.
  danger: {
    tint: "#30375d",
    swell: 0.3, chop: 0.85, reflectivity: 1, depth: 0.72,
    tintStrength: 0.25, probeRoughness: 0.2, flowBearing: -0.78, flowHold: 0.96, normalDetail: 0.5,
    shallowShelf: 0,
    boundaryWidthTiles: 3.4, boundaryFoam: 0.144, boundaryBank: 0.16,
  },
  // Ledger's non-ordinal horizontal singles sit on restrained mirror water.
  ledger: {
    tint: "#4e5a70",
    swell: 0.18, chop: 0.7, reflectivity: 1.3, depth: 1.12,
    tintStrength: 0.2, probeRoughness: 0.08, flowBearing: -0.085, flowHold: 0.99, normalDetail: 0.2,
    shallowShelf: 0,
    boundaryWidthTiles: 2.8, boundaryFoam: 0.02, boundaryBank: 0.16,
  },
  open: {
    tint: "#ffffff",
    swell: 0.34, chop: 0.8, reflectivity: 1, depth: 0.97,
    tintStrength: 0, probeRoughness: 0.12, flowBearing: 0, flowHold: 0, normalDetail: 0.55,
    shallowShelf: 0,
    boundaryWidthTiles: 0, boundaryFoam: 0, boundaryBank: 0,
  },
  // N2 — the wreck shoals. Slack, shallow, still: water that has stopped
  // moving. The lowest swell and chop in the world mean the
  // graveyard reads as a held breath next to the working sea.
  // Wreck silt and held surface UP; generic ripple motion and white foam DOWN.
  wreck: {
    tint: "#756f5d",
    swell: 0.12, chop: 0.65, reflectivity: 0.9, depth: 0.8,
    tintStrength: 0.24, probeRoughness: 0.18, flowBearing: 0.3, flowHold: 0.18, normalDetail: 0.2,
    shallowShelf: 0,
    boundaryWidthTiles: 3.1, boundaryFoam: 0.015, boundaryBank: 0.22,
  },
};

/**
 * Authored tint per region, also used before a live theme drives the slot.
 *
 * `setZoneState` retains a small day-blended theme admixture, but these dyes
 * are the body identities. Wreck has no DEWS band at all, so keeping every
 * slot seeded from the same table also prevents its corner rendering black.
 */
export const SEA_REGION_FALLBACK_TINT: Record<SeaRegionName, string> = {
  none: SEA_REGION_CHARACTER.none.tint,
  calm: SEA_REGION_CHARACTER.calm.tint,
  watch: SEA_REGION_CHARACTER.watch.tint,
  alert: SEA_REGION_CHARACTER.alert.tint,
  warning: SEA_REGION_CHARACTER.warning.tint,
  danger: SEA_REGION_CHARACTER.danger.tint,
  ledger: SEA_REGION_CHARACTER.ledger.tint,
  open: SEA_REGION_CHARACTER.open.tint,
  wreck: SEA_REGION_CHARACTER.wreck.tint,
};

export const SEA_REGION_ORDER: readonly SeaRegionName[] = [
  "none",
  "calm",
  "watch",
  "alert",
  "warning",
  "danger",
  "ledger",
  "open",
  "wreck",
];

/**
 * W2.8: evenly spaced points along a region's real boundary, for marker buoys.
 *
 * Buoys used to ride an ellipse that had nothing to do with where the region
 * actually was. Anchoring them to the field keeps the positional (non-colour)
 * encoding the accessibility contract requires, and now it points at the true
 * edge.
 */
export function seaRegionBoundaryPoints(
  regionId: number,
  maxPoints: number,
): { x: number; y: number }[] {
  const boundary: { x: number; y: number }[] = [];
  for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y += 1) {
    for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 1) {
      if (seaRegionAtTile(x, y) !== regionId) continue;
      const edge = seaRegionAtTile(x + 1, y) !== regionId
        || seaRegionAtTile(x - 1, y) !== regionId
        || seaRegionAtTile(x, y + 1) !== regionId
        || seaRegionAtTile(x, y - 1) !== regionId;
      if (edge) boundary.push({ x, y });
    }
  }
  if (boundary.length <= maxPoints) return boundary;
  // Even stride around the traced edge keeps the spacing legible.
  const stride = boundary.length / maxPoints;
  return Array.from({ length: maxPoints }, (_, index) => (
    boundary[Math.floor(index * stride)]!
  ));
}

/**
 * W2.9: a representative tile INSIDE a region, for its DOM label, hit target
 * and camera focus.
 *
 * Label anchors used to be hand-authored tiles. After the world doubled and
 * placement moved to region-scoped blue noise, those anchors no longer sat
 * anywhere near the ships they count — the review found "Danger Strait ·
 * 9 ships" floating over a crowd of fifty and "Watch Breakwater · 46 ships"
 * over empty water. The counts were right; the labels were in the wrong place,
 * which reads as the world lying.
 *
 * The centroid of a concave region can fall outside it, so the centroid is
 * only a seed: the tile actually returned is the region tile nearest to it.
 */
export function seaRegionAnchorTile(regionId: number): { x: number; y: number } | null {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y += 1) {
    for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 1) {
      if (seaRegionAtTile(x, y) !== regionId) continue;
      sumX += x;
      sumY += y;
      count += 1;
    }
  }
  if (count === 0) return null;
  const centroidX = sumX / count;
  const centroidY = sumY / count;

  let best: { x: number; y: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y += 1) {
    for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 1) {
      if (seaRegionAtTile(x, y) !== regionId) continue;
      const distance = Math.hypot(x - centroidX, y - centroidY);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x, y };
      }
    }
  }
  return best;
}

/**
 * W2.4: coverage guard. Replaces the ellipse-union measurement, which could
 * only ever report how much sea six overlapping discs happened to touch.
 */
export function gardenSeaRegionCoverage(): {
  namedTiles: number;
  namedShare: number;
  waterTiles: number;
  byRegion: Record<SeaRegionName, number>;
} {
  const byRegion = Object.fromEntries(
    SEA_REGION_ORDER.map((name) => [name, 0]),
  ) as Record<SeaRegionName, number>;

  let waterTiles = 0;
  let namedTiles = 0;
  for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y += 1) {
    for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 1) {
      const id = seaRegionAtTile(x, y);
      if (id === SEA_REGION_ID.none) continue;
      waterTiles += 1;
      const name = SEA_REGION_ORDER[id]!;
      byRegion[name] += 1;
      if (id !== SEA_REGION_ID.open) namedTiles += 1;
    }
  }

  return {
    byRegion,
    namedShare: waterTiles === 0 ? 0 : namedTiles / waterTiles,
    namedTiles,
    waterTiles,
  };
}
