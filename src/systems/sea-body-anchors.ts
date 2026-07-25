import { SEA_BODY_TERRAIN, type SeaBodyName } from "./sea-bodies";
import {
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
  terrainKindAt,
} from "./world-layout";

/**
 * Z3: where a body's ships actually go, DERIVED from the body.
 *
 * Ship anchors used to be ~60 hand-authored design-space tiles per placement in
 * risk-water-areas.ts. That is a table describing one particular partition, and
 * it silently rots the moment the partition changes: an anchor outside its own
 * body fails `isRiskPlacementWaterTile` twelve times and falls through to
 * `nearestRiskPlacementWaterTile`, which piles the ships onto whichever edge
 * happens to be closest. The Sea Master reshape would have rotted all of them
 * at once.
 *
 * Deriving the anchors instead means the fleet follows the coastline wherever
 * it goes, and the class of bug disappears rather than being re-authored.
 *
 * The spread is farthest-point sampling: start at the tile nearest the body's
 * centroid, then repeatedly take the eligible tile furthest from everything
 * chosen so far. That gives anchors spaced across the body's real shape —
 * including into its lobes and inlets, which a centroid-plus-radius scatter
 * never reaches — while staying deterministic, which the world build requires.
 */

export interface AnchorTile {
  x: number;
  y: number;
}

const tilesByBody = new Map<SeaBodyName, AnchorTile[]>();
const anchorsByBody = new Map<string, AnchorTile[]>();

/** Every tile the live terrain classifier assigns to this body. */
export function seaBodyTiles(body: SeaBodyName): readonly AnchorTile[] {
  const cached = tilesByBody.get(body);
  if (cached) return cached;
  const terrain = SEA_BODY_TERRAIN[body];
  const tiles: AnchorTile[] = [];
  for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y += 1) {
    for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 1) {
      if (terrainKindAt(x, y) === terrain) tiles.push({ x, y });
    }
  }
  tilesByBody.set(body, tiles);
  return tiles;
}

/**
 * A representative tile INSIDE the body — its centroid, snapped inward.
 *
 * The centroid of a concave body can fall outside it (a crescent bay's does),
 * so the centroid is only a seed: what comes back is the body tile nearest to
 * it.
 */
export function seaBodyCentroidTile(body: SeaBodyName): AnchorTile | null {
  const tiles = seaBodyTiles(body);
  if (tiles.length === 0) return null;
  let sumX = 0;
  let sumY = 0;
  for (const tile of tiles) {
    sumX += tile.x;
    sumY += tile.y;
  }
  const centroidX = sumX / tiles.length;
  const centroidY = sumY / tiles.length;
  let best = tiles[0]!;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const tile of tiles) {
    const distance = (tile.x - centroidX) ** 2 + (tile.y - centroidY) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = tile;
    }
  }
  return best;
}

/** `count` well-spread anchors inside the body, deterministic and memoised. */
export function seaBodyAnchors(body: SeaBodyName, count: number): readonly AnchorTile[] {
  const key = `${body}:${count}`;
  const cached = anchorsByBody.get(key);
  if (cached) return cached;

  const tiles = seaBodyTiles(body);
  const seed = seaBodyCentroidTile(body);
  if (!seed || tiles.length === 0) {
    anchorsByBody.set(key, []);
    return [];
  }

  const chosen: AnchorTile[] = [seed];
  // Distance from each candidate to the nearest chosen anchor, maintained
  // incrementally so this stays O(count * tiles) rather than O(count * tiles^2).
  const nearest = tiles.map((tile) => (tile.x - seed.x) ** 2 + (tile.y - seed.y) ** 2);

  while (chosen.length < count && chosen.length < tiles.length) {
    let bestIndex = 0;
    let bestDistance = -1;
    for (let index = 0; index < tiles.length; index += 1) {
      if (nearest[index]! > bestDistance) {
        bestDistance = nearest[index]!;
        bestIndex = index;
      }
    }
    if (bestDistance <= 0) break;
    const pick = tiles[bestIndex]!;
    chosen.push(pick);
    for (let index = 0; index < tiles.length; index += 1) {
      const distance = (tiles[index]!.x - pick.x) ** 2 + (tiles[index]!.y - pick.y) ** 2;
      if (distance < nearest[index]!) nearest[index] = distance;
    }
  }

  anchorsByBody.set(key, chosen);
  return chosen;
}

/**
 * A scatter radius that matches the body's real extent, so a ship's wander
 * around its anchor stays inside its own water.
 *
 * Half the mean spacing between anchors: wide enough that the fleet does not
 * sit on the anchor points, tight enough that the scatter rarely leaves the
 * body (and `isRiskPlacementWaterTile` catches it when it does).
 */
export function seaBodyScatterRadius(body: SeaBodyName, anchorCount: number): number {
  const tiles = seaBodyTiles(body);
  if (tiles.length === 0) return 4;
  const areaPerAnchor = tiles.length / Math.max(1, anchorCount);
  return Math.max(3, Math.min(16, Math.sqrt(areaPerAnchor) * 0.5));
}

/**
 * The nearest tile of `body` to `tile`.
 *
 * Z3: this is how the AUTHORED anchor tables are repaired rather than replaced.
 *
 * Those tables — ship berths in risk-water-areas.ts, patrol waypoints in
 * motion-config.ts — encode more than position: their spread per zone is what
 * the motion system's cycle lengths and drift circuits were tuned against.
 * Regenerating them from scratch fixed the correctness problem (an anchor
 * outside its own body reroutes the whole placement to the nearest coast) but
 * flattened the DEWS motion escalation, because every zone then got the same
 * evenly-spread waypoints and the transit between them came to dominate.
 *
 * Snapping keeps each authored anchor's intent — its rough position and its
 * relationship to its neighbours — while guaranteeing it lands in the water it
 * claims to be in.
 */
export function snapToSeaBody(tile: AnchorTile, body: SeaBodyName): AnchorTile {
  const tiles = seaBodyTiles(body);
  if (tiles.length === 0) return tile;
  let best = tiles[0]!;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of tiles) {
    const distance = (candidate.x - tile.x) ** 2 + (candidate.y - tile.y) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/**
 * N1: where a body's name should stand, and which way it should face.
 *
 * Principal-axis analysis over the body's tiles. The bearing is the direction
 * the water runs — a strait's long axis, a bay's mouth-to-head line — and the
 * extent along it is how big the body reads, which is what sizes the board.
 *
 * The sign itself stands at the body's SOUTH-EAST frontier rather than at its
 * centroid: south-east is toward the isometric camera, so the board faces the
 * viewer and stands clear of the water it names instead of covering it.
 */
export interface SeaBodyPlacement {
  /** Tile the sign stands on — shallow water at the body's camera-facing edge. */
  tile: AnchorTile;
  /** Direction the body's water runs, in radians (world tile space). */
  bearing: number;
  /** Extent along that bearing, in tiles. Drives the board's size. */
  extent: number;
}

const placementByBody = new Map<SeaBodyName, SeaBodyPlacement | null>();

export function seaBodyPlacement(body: SeaBodyName): SeaBodyPlacement | null {
  const cached = placementByBody.get(body);
  if (cached !== undefined) return cached;

  const tiles = seaBodyTiles(body);
  if (tiles.length < 4) {
    placementByBody.set(body, null);
    return null;
  }

  let sumX = 0;
  let sumY = 0;
  for (const tile of tiles) {
    sumX += tile.x;
    sumY += tile.y;
  }
  const meanX = sumX / tiles.length;
  const meanY = sumY / tiles.length;

  // Covariance, then its dominant eigenvector — the body's long axis.
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const tile of tiles) {
    const dx = tile.x - meanX;
    const dy = tile.y - meanY;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  }
  xx /= tiles.length;
  xy /= tiles.length;
  yy /= tiles.length;
  const bearing = 0.5 * Math.atan2(2 * xy, xx - yy);

  const axisX = Math.cos(bearing);
  const axisY = Math.sin(bearing);
  let minAlong = Number.POSITIVE_INFINITY;
  let maxAlong = Number.NEGATIVE_INFINITY;
  for (const tile of tiles) {
    const along = (tile.x - meanX) * axisX + (tile.y - meanY) * axisY;
    if (along < minAlong) minAlong = along;
    if (along > maxAlong) maxAlong = along;
  }

  // The camera-facing frontier: furthest along +x +y, which is toward the
  // viewer in this isometric rig. Pulled a little back inside the body so the
  // pilings stand in its own water rather than on the boundary.
  let best = tiles[0]!;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const tile of tiles) {
    const score = tile.x + tile.y;
    if (score > bestScore) {
      bestScore = score;
      best = tile;
    }
  }
  const inset = {
    x: Math.round(best.x + (meanX - best.x) * 0.22),
    y: Math.round(best.y + (meanY - best.y) * 0.22),
  };
  const tile = snapToSeaBody(inset, body);

  const placement: SeaBodyPlacement = { tile, bearing, extent: maxAlong - minAlong };
  placementByBody.set(body, placement);
  return placement;
}
