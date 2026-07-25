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
 * `terrainKindAt` ALREADY partitions 88.5% of the sea into named, contiguous,
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

const REGION_FOR_TERRAIN: Partial<Record<TerrainKind, number>> = {
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
 * Field resolution. 512² over a 56-tile map is ~9 samples per tile, enough
 * that the boundary distance channel stays smooth under the shader's blend
 * without the texture itself becoming a memory concern (256 KiB, one upload).
 */
export const SEA_REGION_FIELD_SIZE = 512;

export interface SeaRegionField {
  /** RGBA: R = region id (0-255 scaled), G = boundary distance, B = shore distance. */
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
      // W2.2: domain warp. The terrain tests are geometric (ellipses and
      // half-planes), so a straight sample grid yields ruler-straight region
      // edges that read as map paint rather than water. Displacing the SAMPLE
      // POSITION by a little noise makes the boundary wander like a current
      // front — the classification itself is untouched, which is why the
      // per-tile majority still matches the raw field exactly.
      const warped = warpSampleTile(tileX, tileY);
      ids[py * size + px] = seaRegionAtTile(Math.floor(warped.x), Math.floor(warped.y));
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

  // Normalise: the shader wants 0 at a boundary rising to 1 well inside a
  // region. 24 texels ~ 2.6 tiles, the width the foam line and the character
  // blend read best at.
  const distanceScale = 24;
  for (let index = 0; index < size * size; index += 1) {
    data[index * 4] = ids[index]!;
    data[index * 4 + 1] = Math.min(255, Math.round((distance[index]! / distanceScale) * 255));
    data[index * 4 + 2] = 0;
    data[index * 4 + 3] = 255;
  }

  return { data, size, tileSpan };
}

/**
 * How far the boundary may wander, in tiles. Big enough to break the ruler
 * lines, small enough that a tile's majority classification never flips.
 */
const BOUNDARY_WARP_TILES = 2.6;

/**
 * R6: the anti-onion warp.
 *
 * The DEWS risk geometry is radial by construction — concentric rings around
 * the island — so rasterising it faithfully still produced concentric rings.
 * That is the exact complaint D5 set out to kill: the regions were honest but
 * they read as an onion rather than as a coastline.
 *
 * A LOW-FREQUENCY DIRECTIONAL field is added on top of the high-frequency
 * boundary noise. It stretches the sample space along one axis and shears it
 * along another, so a ring samples as an elongated basin on one side and
 * pinches to a strait on the other. Regions come out as straits, bays and
 * shoals with lobes instead of annuli.
 *
 * Two properties keep this honest:
 * - It displaces the SAMPLE POSITION only. Classification is never rewritten,
 *   so a tile still belongs to whatever band `terrainKindAt` says it does, and
 *   the per-tile majority test still passes.
 * - The displacement is bounded by `DIRECTIONAL_WARP_TILES`, so no band can be
 *   dragged across the map into someone else's water.
 */
const DIRECTIONAL_WARP_TILES = 9.5;
/** Radians. The axis the sea is stretched along — a NE/SW grain. */
const DIRECTIONAL_WARP_ANGLE = 0.72;

function warpSampleTile(tileX: number, tileY: number): { x: number; y: number } {
  // Normalised position, so the directional term is a single slow sweep across
  // the whole map rather than a repeating pattern.
  const u = tileX / PHAROSVILLE_MAP_WIDTH - 0.5;
  const v = tileY / PHAROSVILLE_MAP_HEIGHT - 0.5;

  const axisX = Math.cos(DIRECTIONAL_WARP_ANGLE);
  const axisY = Math.sin(DIRECTIONAL_WARP_ANGLE);
  // Distance along and across the grain.
  const along = u * axisX + v * axisY;
  const across = -u * axisY + v * axisX;

  // Stretch along the grain and pinch across it, modulated by a slow lobe so
  // the effect is not a uniform shear (which would just rotate the onion).
  const lobe = Math.sin(along * 2.1 + 0.6) * 0.7 + Math.sin(across * 1.4 - 1.1) * 0.3;
  const stretch = lobe * DIRECTIONAL_WARP_TILES;
  const shear = Math.sin(across * 2.6 + along * 1.3) * DIRECTIONAL_WARP_TILES * 0.55;

  return {
    x: tileX
      + axisX * stretch + -axisY * shear
      + fbm(tileX * 0.19, tileY * 0.19) * BOUNDARY_WARP_TILES,
    y: tileY
      + axisY * stretch + axisX * shear
      + fbm(tileY * 0.19 + 31.7, tileX * 0.19 - 12.3) * BOUNDARY_WARP_TILES,
  };
}

/** Deterministic value noise — no Math.random, seeded purely by position. */
function hashNoise(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hashNoise(ix, iy);
  const b = hashNoise(ix + 1, iy);
  const c = hashNoise(ix, iy + 1);
  const d = hashNoise(ix + 1, iy + 1);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}

/** Two octaves is plenty: this only needs to break straight lines. */
function fbm(x: number, y: number): number {
  return (smoothNoise(x, y) - 0.5) * 1.4 + (smoothNoise(x * 2.3, y * 2.3) - 0.5) * 0.6;
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
 * W2 / D6: how each region's water BEHAVES, not just what colour it is.
 *
 * Colour is never the only encoding (accessibility contract): calm is glassy
 * and reflective, danger is dark, steep and foam-streaked, and the bands in
 * between escalate monotonically. A viewer who cannot separate the hues still
 * reads the sea state from its motion.
 */
export interface SeaRegionCharacter {
  /** Multiplies the shared swell amplitude. */
  swell: number;
  /** Multiplies chop frequency — higher reads as rougher, more broken water. */
  chop: number;
  /** Whitecap / streak density. */
  foam: number;
  /** How much sky and lighthouse the surface returns. Calm water is a mirror. */
  reflectivity: number;
  /** Darkens (< 1) or lifts (> 1) the region against the base water colour. */
  depth: number;
}

export const SEA_REGION_CHARACTER: Record<SeaRegionName, SeaRegionCharacter> = {
  none: { swell: 1, chop: 1, foam: 0, reflectivity: 1, depth: 1 },
  // S1 (2026-07-25): the DEPTH multiplier is the value ramp, and it was doing
  // almost nothing — 0.78 to 1.18, +-20% around neutral. It matters more than
  // it looks, because the shader luminance-matches each region's tint against
  // the live water (which is what stops a tint reading as paint) and so throws
  // most of the hue's own brightness away. Depth is what survives that, and
  // widening it is what makes risk read as "the water gets darker" from across
  // the map, hue-blind or not.
  //
  // The protected inner harbour: near-still, the most mirror-like water in the
  // scene, and the region the concept render's reflection sells.
  calm: { swell: 0.45, chop: 0.5, foam: 0.05, reflectivity: 1.5, depth: 1.14 },
  watch: { swell: 0.85, chop: 0.9, foam: 0.18, reflectivity: 1.1, depth: 1 },
  alert: { swell: 1.15, chop: 1.25, foam: 0.4, reflectivity: 0.8, depth: 0.88 },
  warning: { swell: 1.45, chop: 1.7, foam: 0.68, reflectivity: 0.6, depth: 0.75 },
  // Steep, dark, streaked with blown foam — legible as trouble without colour.
  danger: { swell: 1.9, chop: 2.3, foam: 1, reflectivity: 0.42, depth: 0.6 },
  // The ledger shelf reads as shallow, slack, slightly stagnant water.
  ledger: { swell: 0.7, chop: 0.75, foam: 0.1, reflectivity: 1.2, depth: 1.2 },
  open: { swell: 1, chop: 1, foam: 0.12, reflectivity: 1, depth: 0.97 },
  // N2 — the wreck shoals. Slack, shallow, still: water that has stopped
  // moving. The lowest swell and chop in the world and almost no foam, so the
  // graveyard reads as a held breath next to the working sea.
  wreck: { swell: 0.3, chop: 0.4, foam: 0.03, reflectivity: 0.9, depth: 1.26 },
};

/**
 * Fallback tint per region, in case nothing drives a slot from the live theme.
 *
 * DEWS bands are recoloured every frame from the day-blended palette via
 * `setZoneState`; the wreck shoals are NOT a DEWS band, so without a default
 * its uniform slot would stay at the zero-initialised colour and the whole
 * corner would render black.
 */
export const SEA_REGION_FALLBACK_TINT: Record<SeaRegionName, string> = {
  none: "#ffffff",
  calm: "#7fb2a8",
  watch: "#6f9fb5",
  alert: "#c3a06a",
  warning: "#c08a5a",
  danger: "#a55f52",
  ledger: "#8d8aa8",
  open: "#ffffff",
  // Drowned green-grey: algal, still, colder than the working sea.
  wreck: "#5d7068",
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
