import {
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
  terrainKindAt,
} from "./world-layout";
import {
  gardenShipWaterMarginTiles,
  isGardenShipWater,
} from "./garden-water-exclusion";
import {
  GARDEN_SHIP_ROOT_Y,
  GARDEN_SILHOUETTE_FOR_HULL,
  gardenShipVisualScale,
} from "./garden-observatory-slice";
import { defaultCamera } from "./camera";
import { screenToGround } from "./projection";
import { GARDEN_EMPTY_INLET, gardenInletDistance } from "./garden-inlet";
import type { ShipNode, ShipWaterZone, TerrainKind } from "./world-types";

/**
 * Region-scoped ANCHORAGE placement for the whole fleet.
 *
 * Ships are scattered across the painted terrain region their risk band owns —
 * the SAME field `terrainKindAt` gives the simulation (finding F6), so a ship
 * is always drawn inside the region it is labelled with. That part is
 * unchanged, and is not negotiable.
 *
 * What changed is the SHAPE of the scatter, and why.
 *
 * W3 placed the fleet with best-candidate sampling (Mitchell), which yields
 * blue noise: evenly spread, never a grid, never clumped. That was the right
 * answer to the problem it was solving — the authored per-zone rings had
 * saturated at 187 ships and piled overflow hulls on top of each other (plan
 * finding F4) — and blue noise fixed the piling completely.
 *
 * But blue noise is, by construction, the MOST UNIFORM way to scatter points
 * that isn't a lattice. Its entire purpose is to suppress clumping and leave no
 * gaps. At ~20 ships that reads as a well-spaced harbour. At 185 across the
 * whole sea it reads as a carpet: every part of the frame equally busy, no
 * negative space, no focal hierarchy, and a monument competing with sixty hulls
 * of identical visual weight. The renderer was not the problem; the point set
 * was.
 *
 * So the fleet now moors in ANCHORAGES. Each band seeds a small ODD number of
 * moorings, spread widely across its own water and deliberately UNEQUAL in
 * size — one dominant harbour, then progressively quieter ones, down to a berth
 * or two riding alone. Ships fill their anchorage from the middle outward,
 * still refusing to come within the hull gap of a neighbour.
 *
 * The result is the same ship count, the same regions, the same honesty about
 * where a ship belongs — and a composition with somewhere to rest. That is the
 * governing aesthetic doing real work rather than decorating a paragraph:
 *
 * - *ma* — the emptiness between moorings is the composition, not a gap in it.
 *   Blue noise cannot produce emptiness; it is designed to prevent it.
 * - *fukinsei* — odd counts and unequal weights, so nothing pairs off or
 *   mirrors.
 * - *shibumi* — restraint comes from the eye having a few things to look at
 *   instead of a hundred and eighty-five.
 *
 * Cold placement is deterministic. Refreshes reserve retained hulls first,
 * then solve arrivals and changed bands against those accepted berths.
 */

/** Painted terrain kind that each risk band's ships live on. */
const TERRAIN_FOR_ZONE: Record<ShipWaterZone, TerrainKind> = {
  alert: "alert-water",
  calm: "calm-water",
  danger: "storm-water",
  ledger: "ledger-water",
  warning: "warning-water",
  watch: "watch-water",
};

/**
 * R11: the minimum gap between two hulls, as a multiple of the larger hull's
 * water margin.
 *
 * The complaint was a "solid raft of overlapping hulls" in the crowded
 * north-east bands. The fix is NOT to spill ships into open water — a ship
 * drawn outside the region it is labelled with is the same dishonesty R10 just
 * removed from the labels. Instead a candidate is REJECTED outright if it
 * lands within this gap of an already-placed ship, so the band uses all of its
 * own water before it doubles up anywhere.
 *
 * The gap is measured against the LARGER of the two hulls. Checking only the
 * arriving hull's margin let a small boat berth inside a galleon's swing, and
 * under reduced motion — where every hull sits on its berth at once, with no
 * sea-room pass to part them — that read as sails through sails.
 */
export const MIN_HULL_GAP = 1.35;

/**
 * Candidate points considered per ship, per pass.
 *
 * Raised from 16 with R11's hard hull-gap rejection, and again for anchorage
 * placement: sampling inside a mooring that is filling up means most draws are
 * rejected, and a ship that exhausts its draws falls through to the region-wide
 * pass — which is the uniform scatter this file exists to avoid. Placement runs
 * once per world, not per frame, so a deeper draw costs nothing that matters.
 */
const CANDIDATES_PER_SHIP = 256;

/**
 * W3.2: the composition invariant ("a framed asymmetric composition with
 * useful open water") survives the scale-up as a density field rather than a
 * small ship count.
 *
 * Two rules shape it: keep a clear sightline to the lighthouse so the monument
 * is never crowded out, and thin the fleet toward the map edges so the frame
 * reads as composed rather than tiled.
 */
const LIGHTHOUSE_CLEARANCE_TILES = 9;
const EDGE_FALLOFF_TILES = 6;

/**
 * The bottom-right chrome (the Explore control) covers about
 * 180×120 CSS px of a 1600×1000 frame. A hull berthed under it is a ship the
 * visitor cannot see or click at rest, and under reduced motion it never
 * leaves: three cut-off hulls piled beneath the chip in the reduced tableau.
 *
 * The rect is projected once through the authored rest camera onto the hull
 * plane, giving a world-space keep-out that placement honours like any other
 * obstacle. It follows the rest seat automatically if the seat is re-authored.
 */
const REST_CHROME_VIEWPORT = { x: 1600, y: 1000 } as const;
const REST_CHROME_RECT = { width: 180, height: 120 } as const;

let restChromeKeepoutCache: readonly { x: number; y: number }[] | null = null;

/** Ground quad (tiles) under the bottom-right chrome at the rest camera. */
function restChromeKeepoutPolygon(): readonly { x: number; y: number }[] {
  if (restChromeKeepoutCache) return restChromeKeepoutCache;
  const viewport = REST_CHROME_VIEWPORT;
  const camera = defaultCamera({
    height: viewport.y,
    map: { height: PHAROSVILLE_MAP_HEIGHT, width: PHAROSVILLE_MAP_WIDTH },
    width: viewport.x,
  });
  const left = viewport.x - REST_CHROME_RECT.width;
  const top = viewport.y - REST_CHROME_RECT.height;
  restChromeKeepoutCache = [
    { x: left, y: top },
    { x: viewport.x, y: top },
    { x: viewport.x, y: viewport.y },
    { x: left, y: viewport.y },
  ].map((corner) => screenToGround(corner, camera, viewport, GARDEN_SHIP_ROOT_Y));
  return restChromeKeepoutCache;
}

/** 0 inside the chrome keep-out, else the tile distance to its edge. */
function restChromeKeepoutDistance(x: number, y: number): number {
  const polygon = restChromeKeepoutPolygon();
  let inside = false;
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index]!;
    const b = polygon[previous]!;
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
    nearest = Math.min(nearest, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
  }
  return inside ? 0 : nearest;
}

/**
 * How many moorings a band seeds, by how many ships it has to berth.
 *
 * Always ODD. A Japanese garden groups in threes, fives and sevens because even
 * counts invite the eye to pair them off and read symmetry; odd counts stay
 * unresolved and keep the composition asymmetric (*fukinsei*). The ceiling of
 * seven matters as much as the floor: enough moorings to fill the sea and the
 * anchorages start touching, which is blue noise again with extra steps.
 */
function anchorageCount(shipCount: number): number {
  if (shipCount <= 4) return 1;
  if (shipCount <= 12) return 3;
  if (shipCount <= 32) return 5;
  return 7;
}

/**
 * Relative berth share per mooring, largest first.
 *
 * Deliberately unequal. Equal anchorages are just a coarser uniform field — the
 * carpet at a different frequency — and they read as administrative rather than
 * grown. A steep falloff gives the band one harbour that obviously matters, a
 * couple of secondary roadsteads, and a lonely berth or two, which is a
 * hierarchy the eye can enter.
 */
function anchorageWeight(index: number, count: number): number {
  return (count - index) ** 1.6;
}

/**
 * Radius of a mooring holding `berths` ships, in tiles.
 *
 * DERIVED from the hull gap, not authored. The first version of this used a
 * magic constant and was quietly far too small: at a 4.03-tile gap a 28-berth
 * anchorage needs radius 11.2 even under perfect hexagonal packing, and the
 * constant produced 10.1 — so nearly every ship failed its anchorage samples,
 * fell through to the region-wide pass, and the fleet scattered exactly as
 * uniformly as before. The clustering was in the code and not in the picture.
 *
 * Random rejection sampling cannot reach hexagonal density; it saturates around
 * 55% of it, so the area each ship really needs is `gap² · 0.866 / 0.55`, and
 * the radius follows from that. `RANDOM_PACKING_AREA` is that factor.
 */
function anchorageRadius(berths: number, hullGap: number): number {
  const perShipArea = hullGap * hullGap * RANDOM_PACKING_AREA;
  return Math.max(hullGap * 1.1, Math.sqrt((berths * perShipArea) / Math.PI));
}

/** `0.866 / 0.55` — hexagonal cell area over what random packing achieves. */
const RANDOM_PACKING_AREA = 1.575;

/**
 * How far apart two moorings must sit, as a multiple of their combined radii.
 *
 * This is what actually creates the open water, and it has to be expressed
 * against the radii rather than as a flat distance: a fixed separation that
 * looks generous next to a two-berth mooring lets two thirty-berth harbours
 * overlap into one blob, which is the carpet again at a coarser grain.
 */
const ANCHORAGE_SEPARATION_FACTOR = 1.25;

/** Sample depth when seeding a mooring. */
const ANCHORAGE_CANDIDATES = 96;

export interface GardenFleetMooringPlacement {
  /** True for the band's largest, first-authored anchorage. */
  dominantMooring: boolean;
  /** Stable within-band mooring identifier using its authored seed index. */
  mooringId: string;
  /** Zero-based order from the mooring's centre outward. */
  rankWithinMooring: number;
  /** Number of berths assigned to this mooring. */
  mooringSize: number;
  riskBand: ShipWaterZone;
}

export interface GardenFleetPlacement {
  /** Absolute display tile per ship id. */
  tileByShipId: Map<string, { x: number; y: number }>;
  /** Display-only hierarchy retained from the authored anchorage allocation. */
  mooringByShipId: Map<string, GardenFleetMooringPlacement>;
}

interface RegionTiles {
  tiles: { x: number; y: number }[];
}

let regionCache: Map<TerrainKind, RegionTiles> | null = null;

interface RetainedBerth {
  tile: { x: number; y: number };
  margin: number;
  mooring: GardenFleetMooringPlacement;
}

// Accepted berths are reservations, not candidates to rerank on every refresh.
// Keep only the current fleet; departures release their water for newcomers.
let berthCache: {
  lighthouseX: number;
  lighthouseY: number;
  byShipId: Map<string, RetainedBerth>;
} | null = null;

/**
 * All navigable tiles of each painted water region, computed once.
 *
 * Obstacle-free at a nominal margin only — the per-ship hull margin is applied
 * at selection time, since it scales with the hull.
 */
function regionTiles(): Map<TerrainKind, RegionTiles> {
  if (regionCache) return regionCache;
  const byKind = new Map<TerrainKind, RegionTiles>();
  for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y += 1) {
    for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 1) {
      const kind = terrainKindAt(x, y);
      const region = byKind.get(kind) ?? { tiles: [] };
      region.tiles.push({ x, y });
      byKind.set(kind, region);
    }
  }
  regionCache = byKind;
  return byKind;
}

/** Test-only: clears terrain and accepted berth reservations. */
export function resetGardenFleetPlacementCache(): void {
  regionCache = null;
  berthCache = null;
}

/**
 * Density weight for a candidate tile: how much this spot wants a ship.
 *
 * Zero means "never place here". The empty inlet (`garden-inlet.ts`) is
 * authored water, not spare capacity: every pass excludes it, the relaxed
 * one included. The lighthouse clearance keeps the monument's approach open;
 * the edge falloff thins the outer frame so the composition stays asymmetric
 * instead of filling to the borders.
 */
function densityWeight(
  x: number,
  y: number,
  lighthouseTile: { x: number; y: number },
): number {
  if (gardenInletDistance(x, y) <= GARDEN_EMPTY_INLET.halfWidth) return 0;
  if (restChromeKeepoutDistance(x, y) <= 0) return 0;
  const lighthouseDistance = Math.hypot(x - lighthouseTile.x, y - lighthouseTile.y);
  if (lighthouseDistance < LIGHTHOUSE_CLEARANCE_TILES) return 0;

  const edgeDistance = Math.min(
    x,
    y,
    PHAROSVILLE_MAP_WIDTH - 1 - x,
    PHAROSVILLE_MAP_HEIGHT - 1 - y,
  );
  if (edgeDistance <= 0) return 0;
  return Math.min(1, edgeDistance / EDGE_FALLOFF_TILES);
}

interface PlacedHull {
  x: number;
  y: number;
  margin: number;
}

/**
 * Water a hull may rest on for its whole stay.
 *
 * Dock aprons and moles count as obstacles here: a hull resting at home is
 * displayed with them as obstacles, and a berth that ignored them was shoved
 * to the nearest clear water at draw time — blind to its neighbours, which is
 * how settled hulls ended up stacked. The inlet and the chrome keep-out are
 * widened by the hull so no part of it enters either.
 */
function isBerthWater(tile: { x: number; y: number }, margin: number): boolean {
  return gardenInletDistance(tile.x, tile.y) > GARDEN_EMPTY_INLET.halfWidth + margin
    && restChromeKeepoutDistance(tile.x, tile.y) > margin
    && isGardenShipWater(tile, margin, true);
}

interface Anchorage {
  berths: number;
  index: number;
  radius: number;
  x: number;
  y: number;
}

/**
 * Seeds a band's moorings: odd count, widely separated, unequal in size.
 *
 * Best-candidate over the band's own tiles, which is blue noise — and blue
 * noise is exactly right HERE, one level up. The anchorages want to be spread
 * as evenly as the water allows; it is the ships within them that must not be.
 */
function seedAnchorages(
  zone: ShipWaterZone,
  tiles: readonly { x: number; y: number }[],
  shipCount: number,
  hullGap: number,
  lighthouseTile: { x: number; y: number },
): Anchorage[] {
  const count = Math.min(anchorageCount(shipCount), Math.max(1, Math.floor(shipCount)));
  const weights = Array.from({ length: count }, (_, index) => anchorageWeight(index, count));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  // Berths and radii BEFORE positions: a mooring's separation requirement
  // depends on how big it is, so it cannot be seeded until its size is known.
  let assigned = 0;
  const planned = weights.map((weight, index) => {
    const berths = index === count - 1
      ? shipCount - assigned
      : Math.max(1, Math.round(shipCount * (weight / totalWeight)));
    assigned += berths;
    return { berths: Math.max(0, berths), radius: anchorageRadius(Math.max(0, berths), hullGap) };
  });

  const anchorages: Anchorage[] = [];
  const orphaned: number[] = [];
  for (const [index, plan] of planned.entries()) {
    if (plan.berths <= 0) continue;
    const seeded = seedOneAnchorage(zone, tiles, index, plan.radius, anchorages, lighthouseTile);
    if (!seeded) {
      // No water left that can hold this mooring at a respectful distance.
      // Its berths go to the anchorages that did fit rather than being lost.
      orphaned.push(plan.berths);
      continue;
    }
    anchorages.push({
      berths: plan.berths,
      index,
      radius: plan.radius,
      x: seeded.x,
      y: seeded.y,
    });
  }

  const orphanTotal = orphaned.reduce((sum, berths) => sum + berths, 0);
  if (orphanTotal > 0 && anchorages.length > 0) {
    const host = anchorages[0]!;
    host.berths += orphanTotal;
    host.radius = anchorageRadius(host.berths, hullGap);
  }
  return anchorages;
}

/** Finds water for one mooring, backing off its separation before giving up. */
function seedOneAnchorage(
  zone: ShipWaterZone,
  tiles: readonly { x: number; y: number }[],
  index: number,
  radius: number,
  placed: readonly Anchorage[],
  lighthouseTile: { x: number; y: number },
): { x: number; y: number } | null {
  for (const relaxation of ANCHORAGE_SEPARATION_RELAXATIONS) {
    let best: { x: number; y: number } | null = null;
    let bestScore = -1;
    for (let attempt = 0; attempt < ANCHORAGE_CANDIDATES; attempt += 1) {
      const pick = tiles[
        Math.floor(stableUnit(`${zone}.anchor.${index}.${attempt}`) * tiles.length)
      ];
      if (!pick) continue;
      const weight = densityWeight(pick.x, pick.y, lighthouseTile);
      if (weight <= 0) continue;
      if (!isGardenShipWater(pick, 2)) continue;

      let nearest = Number.POSITIVE_INFINITY;
      let clears = true;
      for (const other of placed) {
        const distance = Math.hypot(pick.x - other.x, pick.y - other.y);
        if (distance < nearest) nearest = distance;
        const required = (radius + other.radius) * ANCHORAGE_SEPARATION_FACTOR * relaxation;
        if (distance < required) clears = false;
      }
      if (!clears) continue;
      // The first mooring has no neighbour, so density alone decides where the
      // band's main harbour wants to be.
      const score = (nearest === Number.POSITIVE_INFINITY ? 64 : nearest) * weight;
      if (score > bestScore) {
        bestScore = score;
        best = pick;
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * Separation is a preference, not a law.
 *
 * A band whose water is a narrow ribbon cannot hold seven well-spaced moorings,
 * and refusing to seed them at all would send its whole fleet through the
 * region-wide fallback — back to the uniform scatter. Backing the requirement
 * off in two steps keeps the clustering in tight water while still preferring
 * generous spacing wherever the sea allows it.
 */
const ANCHORAGE_SEPARATION_RELAXATIONS = [1, 0.72, 0.5] as const;

/**
 * Scatters the fleet across its regions, mooring by mooring.
 *
 * Retained ids with unchanged bands and hull margins reserve their accepted
 * water before any new candidates are considered. Departures release berths.
 * New ships choose their mooring by an id+band hash, reject illegal or crowded
 * candidates, and take the innermost survivor. Only an exhausted ship scans
 * the remaining legal region; previously accepted ships are never re-solved.
 */
export function placeGardenFleet(
  ships: readonly ShipNode[],
  lighthouseTile: { x: number; y: number },
): GardenFleetPlacement {
  const regions = regionTiles();
  const tileByShipId = new Map<string, { x: number; y: number }>();
  const mooringByShipId = new Map<string, GardenFleetMooringPlacement>();

  const byZone = new Map<ShipWaterZone, ShipNode[]>();
  for (const ship of ships) {
    const group = byZone.get(ship.riskZone) ?? [];
    group.push(ship);
    byZone.set(ship.riskZone, group);
  }

  // Hull separation is shared across risk-band borders, not reset per band.
  const placed: PlacedHull[] = [];
  const retained = new Map<string, RetainedBerth>();
  const nextBerths = new Map<string, RetainedBerth>();
  if (berthCache?.lighthouseX === lighthouseTile.x && berthCache.lighthouseY === lighthouseTile.y) {
    for (const ship of ships) {
      const previous = berthCache.byShipId.get(ship.id);
      const margin = gardenShipWaterMarginTiles(
        gardenShipVisualScale(ship.visual.scale || 1),
        GARDEN_SILHOUETTE_FOR_HULL[ship.visual.hull],
      );
      if (!previous || previous.mooring.riskBand !== ship.riskZone || previous.margin !== margin) continue;
      retained.set(ship.id, previous);
      placed.push({ x: previous.tile.x, y: previous.tile.y, margin: previous.margin });
    }
  }
  for (const [zone, group] of [...byZone].sort(([left], [right]) => left.localeCompare(right))) {
    // Largest hulls berth first: their gap is the widest, and a big hull left
    // to last finds only gaps sized for small ones. Ids break ties stably.
    const marginById = new Map(group.map((ship) => [ship.id, gardenShipWaterMarginTiles(
      gardenShipVisualScale(ship.visual.scale || 1),
      GARDEN_SILHOUETTE_FOR_HULL[ship.visual.hull],
    )]));
    const ordered = group.toSorted((left, right) => (
      marginById.get(right.id)! - marginById.get(left.id)! || left.id.localeCompare(right.id)
    ));
    const region = regions.get(TERRAIN_FOR_ZONE[zone]);
    const candidates = region?.tiles ?? [];
    if (candidates.length === 0) {
      // A band with no painted water of its own (possible when a band is
      // empty in the data) falls back to one deterministic dominant mooring.
      for (const [rankWithinMooring, ship] of ordered.entries()) {
        tileByShipId.set(ship.id, { ...ship.tile });
        mooringByShipId.set(ship.id, {
          dominantMooring: true,
          mooringId: `${zone}.0`,
          mooringSize: ordered.length,
          rankWithinMooring,
          riskBand: zone,
        });
      }
      continue;
    }

    const terrain = TERRAIN_FOR_ZONE[zone];
    // Moorings are sized against the band's typical hull, since that is what
    // sets how much water each berth actually consumes.
    const meanHullGap = (ordered.reduce(
      (sum, entry) => sum + gardenShipWaterMarginTiles(
        gardenShipVisualScale(entry.visual.scale || 1),
        GARDEN_SILHOUETTE_FOR_HULL[entry.visual.hull],
      ),
      0,
    ) / Math.max(1, ordered.length)) * MIN_HULL_GAP;
    const anchorages = seedAnchorages(zone, candidates, ordered.length, meanHullGap, lighthouseTile);
    const nextRankByAnchorage = new Map<Anchorage, number>();

    for (const [shipIndex, ship] of ordered.entries()) {
      const margin = gardenShipWaterMarginTiles(
        gardenShipVisualScale(ship.visual.scale || 1),
        GARDEN_SILHOUETTE_FOR_HULL[ship.visual.hull],
      );
      const previous = retained.get(ship.id);
      const anchorage = previous
        ? anchorages.find((entry) => `${zone}.${entry.index}` === previous.mooring.mooringId) ?? null
        : anchorageForShip(anchorages, ship.id, zone);
      const rankWithinMooring = anchorage
        ? nextRankByAnchorage.get(anchorage) ?? 0
        : shipIndex;
      if (anchorage) nextRankByAnchorage.set(anchorage, rankWithinMooring + 1);
      mooringByShipId.set(ship.id, {
        dominantMooring: anchorage ? anchorage === anchorages[0] : true,
        mooringId: `${zone}.${anchorage?.index ?? 0}`,
        mooringSize: anchorage?.berths ?? ordered.length,
        rankWithinMooring,
        riskBand: zone,
      });
      if (previous) {
        tileByShipId.set(ship.id, previous.tile);
        mooringByShipId.set(ship.id, { ...previous.mooring, rankWithinMooring });
        nextBerths.set(ship.id, previous);
        continue;
      }

      // Two passes, run in ORDER and short-circuited — never interleaved.
      //
      // The anchorage pass ranks candidates by how close they are to the
      // mooring's heart (small is good); the region pass ranks them by how far
      // they are from any neighbour (so it negates, and large separation scores
      // small). Those two rankings are not comparable, and scoring them in one
      // loop against a shared best silently handed every berth to the region
      // pass, because a negated separation is always below a positive radius.
      // The clustering was all present in the code and entirely absent from the
      // picture. The region pass now only runs for a ship the anchorage could
      // not berth at all.
      //
      // What neither pass does is fall back to the ship's authored tile: that
      // belongs to the world model, sits in whatever water the data put it in,
      // and is shared by every ship in the fixtures — so it both stacks hulls
      // and drops them in the wrong band.
      let relaxedBest: { x: number; y: number } | null = null;
      let relaxedScore = Number.NEGATIVE_INFINITY;
      let berth: { x: number; y: number } | null = null;

      const passes = anchorage ? (["anchorage", "region"] as const) : (["region"] as const);
      for (const pass of passes) {
        let best: { x: number; y: number } | null = null;
        let bestRank = Number.POSITIVE_INFINITY;

        for (let attempt = 0; attempt < CANDIDATES_PER_SHIP; attempt += 1) {
          const tile = pass === "anchorage" && anchorage
            ? sampleWithinAnchorage(anchorage, ship.id, attempt)
            : sampleAcrossRegion(candidates, ship.id, attempt);
          if (!tile) continue;
          const weight = densityWeight(tile.x, tile.y, lighthouseTile);
          if (weight <= 0) continue;
          // Sampling a DISC rather than the region's own tile list means a
          // candidate can drift over the band's boundary, so the region check
          // that used to be structural has to be explicit. Without it a mooring
          // near an edge would quietly leak ships into the neighbouring body
          // and break the one thing this file is not allowed to break.
          if (terrainKindAt(Math.round(tile.x), Math.round(tile.y)) !== terrain) continue;
          if (!isBerthWater(tile, margin)) continue;

          let nearest = Number.POSITIVE_INFINITY;
          let separation = Number.POSITIVE_INFINITY;
          for (const other of placed) {
            const distance = Math.hypot(tile.x - other.x, tile.y - other.y);
            if (distance < nearest) nearest = distance;
            const ratio = distance / Math.max(margin, other.margin);
            if (ratio < separation) separation = ratio;
          }
          if (nearest * weight > relaxedScore) {
            relaxedScore = nearest * weight;
            relaxedBest = tile;
          }
          // R11: a hard floor on hull separation. This is what stops an
          // anchorage becoming the raft that blue noise was brought in to
          // prevent.
          if (separation < MIN_HULL_GAP) continue;

          // Filling inward-out is what makes a cluster read as a harbour with a
          // middle, rather than as a disc of scattered points.
          const rank = pass === "anchorage" && anchorage
            ? Math.hypot(tile.x - anchorage.x, tile.y - anchorage.y)
            : -nearest;
          if (rank < bestRank) {
            bestRank = rank;
            best = tile;
          }
        }

        if (best) {
          berth = best;
          break;
        }
      }

      // Random draws may exhaust a narrow anchorage; scan its legal water
      // rather than returning to an authored tile inside the empty channel.
      // Any tile that still clears the hull gap wins; only a band with no such
      // water left falls back to the most open spot it has.
      if (!berth) {
        let scanNearest = -1;
        for (const tile of candidates) {
          if (densityWeight(tile.x, tile.y, lighthouseTile) <= 0 || !isBerthWater(tile, margin)) continue;
          let nearest = Number.POSITIVE_INFINITY;
          let separation = Number.POSITIVE_INFINITY;
          for (const other of placed) {
            const distance = Math.hypot(tile.x - other.x, tile.y - other.y);
            if (distance < nearest) nearest = distance;
            const ratio = distance / Math.max(margin, other.margin);
            if (ratio < separation) separation = ratio;
          }
          if (separation >= MIN_HULL_GAP && nearest > scanNearest) {
            berth = tile;
            scanNearest = nearest;
          }
          if (nearest > relaxedScore) {
            relaxedBest = tile;
            relaxedScore = nearest;
          }
        }
      }
      // Tier 1 is `relaxedBest`: apron-clear water, gap relaxed.
      const resolved = berth ?? relaxedBest ?? fallbackBerth(candidates, margin, placed, lighthouseTile, ship.tile);
      placed.push({ x: resolved.x, y: resolved.y, margin });
      tileByShipId.set(ship.id, resolved);
      nextBerths.set(ship.id, { tile: resolved, margin, mooring: mooringByShipId.get(ship.id)! });
    }
  }

  // Metadata follows occupancy, including retained moorings whose planned
  // capacity changed. It must not claim ranks or sizes from a previous roster.
  const membersByMooring = new Map<string, string[]>();
  for (const [id, mooring] of mooringByShipId) {
    const members = membersByMooring.get(mooring.mooringId) ?? [];
    members.push(id);
    membersByMooring.set(mooring.mooringId, members);
  }
  for (const members of membersByMooring.values()) {
    for (const [rankWithinMooring, id] of members.entries()) {
      const mooring = { ...mooringByShipId.get(id)!, mooringSize: members.length, rankWithinMooring };
      mooringByShipId.set(id, mooring);
      const berth = nextBerths.get(id);
      if (berth) nextBerths.set(id, { ...berth, mooring });
    }
  }
  berthCache = { lighthouseX: lighthouseTile.x, lighthouseY: lighthouseTile.y, byShipId: nextBerths };

  return { mooringByShipId, tileByShipId };
}

/**
 * Last resorts for a band with no apron-clear water left, so a world always
 * renders rather than failing placement.
 *
 * Tier 2 is the earlier rule: navigable water outside the inlet, dock aprons
 * allowed (the display then eases the hull off the apron). Tier 3 is the
 * least-bad navigable tile of the band: outside the inlet if any is, else the
 * one farthest from it. Only a band with no navigable tile at all keeps the
 * ship's data tile. Each tier prefers the spot farthest from placed hulls.
 */
function fallbackBerth(
  candidates: readonly { x: number; y: number }[],
  margin: number,
  placed: readonly PlacedHull[],
  lighthouseTile: { x: number; y: number },
  dataTile: { x: number; y: number },
): { x: number; y: number } {
  let navigable: { x: number; y: number } | null = null;
  let navigableScore = Number.NEGATIVE_INFINITY;
  let previousRule: { x: number; y: number } | null = null;
  let previousRuleNearest = Number.NEGATIVE_INFINITY;
  for (const tile of candidates) {
    if (!isGardenShipWater(tile, 0)) continue;
    let nearest = Number.POSITIVE_INFINITY;
    for (const other of placed) nearest = Math.min(nearest, Math.hypot(tile.x - other.x, tile.y - other.y));
    const inlet = gardenInletDistance(tile.x, tile.y);
    if (densityWeight(tile.x, tile.y, lighthouseTile) > 0
      && inlet > GARDEN_EMPTY_INLET.halfWidth + margin
      && isGardenShipWater(tile, margin)
      && nearest > previousRuleNearest) {
      previousRule = tile;
      previousRuleNearest = nearest;
    }
    // Outside the inlet ranks above inside it; then open water, then distance
    // from the inlet.
    const score = inlet > GARDEN_EMPTY_INLET.halfWidth
      ? PHAROSVILLE_MAP_WIDTH + PHAROSVILLE_MAP_HEIGHT + Math.min(nearest, PHAROSVILLE_MAP_WIDTH)
      : inlet;
    if (score > navigableScore) {
      navigable = tile;
      navigableScore = score;
    }
  }
  return previousRule ?? navigable ?? { x: dataTile.x, y: dataTile.y };
}

/** Choose a mooring by identity, never by a ship's ordinal in the roster. */
function anchorageForShip(anchorages: readonly Anchorage[], shipId: string, zone: ShipWaterZone): Anchorage | null {
  const berths = anchorages.reduce((sum, anchorage) => sum + anchorage.berths, 0);
  let remaining = stableUnit(`${zone}.${shipId}.mooring`) * berths;
  for (const anchorage of anchorages) {
    if (remaining < anchorage.berths) return anchorage;
    remaining -= anchorage.berths;
  }
  return anchorages.at(-1) ?? null;
}

/**
 * A point inside a mooring, biased toward its middle.
 *
 * `sqrt(u)` would sample the disc uniformly by area; the gentler exponent
 * deliberately over-weights the centre so anchorages have a dense heart and a
 * thinning edge, the way moored boats actually gather. The half-tile of extra
 * jitter keeps the result off any lattice the trigonometry might imply.
 */
function sampleWithinAnchorage(
  anchorage: Anchorage,
  shipId: string,
  attempt: number,
): { x: number; y: number } {
  const angle = stableUnit(`${shipId}.theta.${attempt}`) * Math.PI * 2;
  const radius = anchorage.radius * stableUnit(`${shipId}.rad.${attempt}`) ** 0.68;
  return {
    x: anchorage.x + Math.cos(angle) * radius + stableUnit(`${shipId}.jx.${attempt}`) - 0.5,
    y: anchorage.y + Math.sin(angle) * radius + stableUnit(`${shipId}.jy.${attempt}`) - 0.5,
  };
}

/** Fallback for a band that could not seed a single mooring: the old scatter. */
function sampleAcrossRegion(
  tiles: readonly { x: number; y: number }[],
  shipId: string,
  attempt: number,
): { x: number; y: number } | null {
  const pick = tiles[Math.floor(stableUnit(`${shipId}.place.${attempt}`) * tiles.length)];
  if (!pick) return null;
  return {
    x: pick.x + stableUnit(`${shipId}.jx.${attempt}`) - 0.5,
    y: pick.y + stableUnit(`${shipId}.jy.${attempt}`) - 0.5,
  };
}

function stableUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}
