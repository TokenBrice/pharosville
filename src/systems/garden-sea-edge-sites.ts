import { distanceToStationFootprint, stationFootprintRect } from "./dock-layout";
import { SEA_REGION_ID, seaRegionAtTile } from "./garden-sea-regions";
import { RIM_COVES, rimDepthAt, rimLandAt } from "./garden-rim";
import { SHIP_WATER_ANCHORS } from "./risk-water-areas";
import type { SeaBodyId, SeaBodyName } from "./sea-bodies";
import {
  EVM_BAY_STATION_SLOTS,
  OUTER_HARBOR_STATION_SLOTS,
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
  PIGEONNIER_STATION_SLOT,
  isWaterTileKind,
  terrainKindAt,
} from "./world-layout";

/**
 * Physical geography at the seven named waters' edges.
 *
 * The authored numbers below are GUIDE POINTS, not final classifications. Each
 * guide resolves to the nearest tile where the live region field meets the
 * requested neighbouring body (or the authored rim). This keeps the renderer
 * on the same coastline as ship placement and motion when the field moves.
 *
 * Decorative only: the forms help a body read as a place, but carry no market
 * meaning. In particular they do not add a new water classification, and the
 * unnamed open approach intentionally has no recipes.
 */

export type GardenSeaEdgeForm =
  | "cliff"
  | "inlet-stone"
  | "low-bank"
  | "reed-lily"
  | "shoal-bar"
  | "slate-edge"
  | "stone-tongue"
  | "timber-pile"
  | "watch-reed"
  | "warning-buoy";

export type GardenSeaEdgeMaterial = "dark" | "natural" | "pale" | "slate" | "vegetation" | "wood";

export interface GardenSeaEdgeSite {
  readonly bearing: number;
  readonly body: SeaBodyId;
  readonly form: GardenSeaEdgeForm;
  /** Conservative circular footprint used by ship placement and motion. */
  readonly footprintRadius: number;
  readonly height: number;
  readonly id: string;
  readonly length: number;
  readonly material: GardenSeaEdgeMaterial;
  readonly surface: "rim-land" | "water";
  readonly tile: { readonly x: number; readonly y: number };
  readonly width: number;
}

export interface GardenSeaEdgeObstacle {
  readonly body: SeaBodyId;
  readonly id: string;
  readonly r: number;
  readonly x: number;
  readonly y: number;
}

/**
 * Clear water left around every authored mooring/cove before a site's own
 * footprint begins. Four tiles is the existing ordinary-hull apron; larger
 * hulls add their exact family/scale margin when `isGardenShipWater` expands
 * the exported footprints.
 */
export const GARDEN_SEA_EDGE_HULL_CLEARANCE_TILES = 4;

/**
 * The operator-requested geography enlargement, applied once to authored guide
 * dimensions before BOTH siting and exported obstacle footprints. Keeping the
 * renderer and water-safety radius on the same scaled values is the difference
 * between a larger-looking bar and a physically larger bar ships can respect.
 */
export const GARDEN_SEA_EDGE_SCALE_FACTOR = 1.5;

function guideScale(guide: EdgeGuide): number {
  // The Danger cliff is already a rim-land wall, and no 1.5x candidate keeps
  // the existing cove/mooring apron. The requested tongues, bars and piles —
  // plus the other water-edge forms — take the full enlargement; the gorge
  // keeps its reviewed land footprint rather than narrowing the strait.
  return guide.form === "cliff" ? 1 : GARDEN_SEA_EDGE_SCALE_FACTOR;
}

/**
 * Rendered island waterline used only to reject edge-geography candidates.
 * Kept structurally equal to `GARDEN_ISLAND_OBSTACLE`; the focused exclusion
 * test guards that shared contract without introducing a systems import cycle.
 */
export const GARDEN_SEA_EDGE_ISLAND_WATERLINE = {
  x: 72.42,
  y: 78.85,
  rx: 13.9,
  ry: 10.5,
} as const;

/**
 * Attention shed-list for the integration pass. `garden-water.ts` is owned by
 * Wave 2a, so this slice records the boundary term each physical edge permits
 * the integrator to demote without editing that shader concurrently.
 */
export const GARDEN_SEA_EDGE_SHED_LIST: Readonly<Record<SeaBodyId, string>> = {
  calm: "Demote the Calm/open mouth boundary seam and edge-fade where reed/lily islets now carry the enclosure.",
  watch: "Demote the Watch/open boundary seam and continuous edge foam where low banks now carry the margin.",
  alert: "Demote generic Alert boundary-buoy repetition and the seam at the stone constriction; retain only the authored pair.",
  warning: "Demote the continuous Warning boundary foam band where pale broken bars now carry the shoal edge.",
  danger: "Demote the Danger/rim edge-fade and shore-foam emphasis where the dark cliff now carries the gorge wall.",
  ledger: "Demote the Ledger/open shader seam where the slate lip and aligned piles now carry the basin edge.",
  wreck: "Demote the Wreck/Calm inlet seam where the three mouth stones now carry the threshold.",
};

type BoundaryTarget = SeaBodyName | "rim";

interface EdgeGuide {
  readonly body: SeaBodyId;
  readonly form: GardenSeaEdgeForm;
  readonly guide: { readonly x: number; readonly y: number };
  readonly height: number;
  readonly id: string;
  readonly length: number;
  readonly material: GardenSeaEdgeMaterial;
  /** Whether the resolved centre belongs to navigable water or the authored rim. */
  readonly surface?: "rim-land";
  readonly target: BoundaryTarget;
  readonly width: number;
}

const GUIDES: readonly EdgeGuide[] = [
  // Calm Anchorage: a loose, odd-numbered mouth near the torii, leaving the
  // bay's centre untouched. Lily leaves are part of the reed instance shape.
  { body: "calm", form: "reed-lily", guide: { x: 75, y: 97 }, height: 1.7, id: "calm-mouth-north", length: 2.4, material: "vegetation", target: "open", width: 1.8 },
  { body: "calm", form: "reed-lily", guide: { x: 75, y: 99 }, height: 2.0, id: "calm-mouth-middle", length: 2.9, material: "vegetation", target: "open", width: 2.0 },
  { body: "calm", form: "reed-lily", guide: { x: 75, y: 107 }, height: 1.5, id: "calm-mouth-south", length: 2.2, material: "vegetation", target: "open", width: 1.6 },

  // Watch Reach: two low banks across the long open-water edge, with sparse
  // reed punctuation rather than a continuous green wall.
  { body: "watch", form: "low-bank", guide: { x: 100, y: 79 }, height: 0.75, id: "watch-bank-north", length: 6.8, material: "natural", target: "open", width: 1.8 },
  { body: "watch", form: "watch-reed", guide: { x: 100, y: 88 }, height: 1.35, id: "watch-reed-north", length: 1.8, material: "vegetation", target: "open", width: 1.0 },
  { body: "watch", form: "low-bank", guide: { x: 101, y: 101 }, height: 0.68, id: "watch-bank-south", length: 7.4, material: "natural", target: "open", width: 2.0 },
  { body: "watch", form: "watch-reed", guide: { x: 102, y: 110 }, height: 1.2, id: "watch-reed-south", length: 1.6, material: "vegetation", target: "open", width: 0.9 },

  // Alert Channel: opposing stone tongues read from the open and Warning
  // banks; the two low markers are one unmistakable buoy pair.
  { body: "alert", form: "stone-tongue", guide: { x: 88, y: 42 }, height: 1.25, id: "alert-tongue-west", length: 7.2, material: "natural", target: "open", width: 2.2 },
  { body: "alert", form: "stone-tongue", guide: { x: 107, y: 42 }, height: 1.5, id: "alert-tongue-east", length: 7.8, material: "natural", target: "warning", width: 2.4 },
  { body: "alert", form: "warning-buoy", guide: { x: 107, y: 34 }, height: 2.1, id: "alert-buoy-north", length: 0.7, material: "wood", target: "warning", width: 0.7 },
  { body: "alert", form: "warning-buoy", guide: { x: 109, y: 47 }, height: 2.1, id: "alert-buoy-south", length: 0.7, material: "wood", target: "warning", width: 0.7 },

  // Warning Shoals: three pale broken bars, never a continuous breakwater.
  { body: "warning", form: "shoal-bar", guide: { x: 114, y: 18 }, height: 0.48, id: "warning-bar-inner", length: 5.4, material: "pale", target: "alert", width: 2.0 },
  { body: "warning", form: "shoal-bar", guide: { x: 119, y: 27 }, height: 0.6, id: "warning-bar-middle", length: 6.4, material: "pale", target: "alert", width: 1.8 },
  { body: "warning", form: "shoal-bar", guide: { x: 121, y: 35 }, height: 0.42, id: "warning-bar-outer", length: 5.0, material: "pale", target: "danger", width: 2.2 },

  // The fishing-pier's measured landward hall now occupies the former rim
  // anchor at (137,57). Keep the dark gorge wall on the adjacent Danger/Watch
  // seam instead of layering scenery through the station.
  { body: "danger", form: "cliff", guide: { x: 121, y: 50 }, height: 5.2, id: "danger-rim-cliff", length: 5.4, material: "dark", target: "watch", width: 1.2 },

  // Ledger Mooring: a right-angled slate lip and an orderly run of piles.
  { body: "ledger", form: "slate-edge", guide: { x: 71, y: 13 }, height: 0.85, id: "ledger-slate-west", length: 4.2, material: "slate", target: "open", width: 1.4 },
  { body: "ledger", form: "slate-edge", guide: { x: 72, y: 14 }, height: 0.75, id: "ledger-slate-east", length: 4.0, material: "slate", target: "open", width: 1.4 },
  { body: "ledger", form: "timber-pile", guide: { x: 66, y: 3 }, height: 2.7, id: "ledger-pile-1", length: 0.55, material: "wood", target: "open", width: 0.55 },
  { body: "ledger", form: "timber-pile", guide: { x: 66, y: 6 }, height: 2.9, id: "ledger-pile-2", length: 0.55, material: "wood", target: "open", width: 0.55 },
  { body: "ledger", form: "timber-pile", guide: { x: 67, y: 9 }, height: 2.6, id: "ledger-pile-3", length: 0.55, material: "wood", target: "open", width: 0.55 },
  { body: "ledger", form: "timber-pile", guide: { x: 70, y: 12 }, height: 2.8, id: "ledger-pile-4", length: 0.55, material: "wood", target: "open", width: 0.55 },

  // Wreck Shoal: an uneven three-stone mouth where Wreck water meets Calm.
  { body: "wreck", form: "inlet-stone", guide: { x: 37, y: 108 }, height: 1.2, id: "wreck-mouth-west", length: 2.2, material: "natural", target: "calm", width: 1.8 },
  { body: "wreck", form: "inlet-stone", guide: { x: 39, y: 110 }, height: 1.55, id: "wreck-mouth-middle", length: 2.6, material: "natural", target: "calm", width: 2.0 },
  { body: "wreck", form: "inlet-stone", guide: { x: 42, y: 112 }, height: 0.9, id: "wreck-mouth-east", length: 1.8, material: "natural", target: "calm", width: 1.5 },
] as const;

const CARDINAL_NEIGHBOURS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
] as const;

const MOORINGS = Object.values(SHIP_WATER_ANCHORS).flat();

/**
 * R4 keep-outs for the nine rendered stations. Each uses the complete measured
 * recipe envelope, rotated by the cove's authored seaward bearing and rooted
 * at its tile, so scenery clears the landward hall and apron rather than an
 * invented seaward-centred box. Sites are authored without a live feed, and
 * the measured maximum-recipe bounds are therefore the conservative contract.
 */
const STATION_FOOTPRINT_RECTS = Object.freeze(
  [
    ...EVM_BAY_STATION_SLOTS,
    ...OUTER_HARBOR_STATION_SLOTS,
    PIGEONNIER_STATION_SLOT,
  ].map((slot) => stationFootprintRect(
    slot.type,
    slot.cove.tile,
    slot.cove.seawardBearing,
    slot.cove.id,
  )),
);


function regionId(body: SeaBodyName): number {
  return SEA_REGION_ID[body];
}

function footprintRadius(guide: EdgeGuide): number {
  const scale = guideScale(guide);
  return Math.hypot(
    guide.length * scale,
    guide.width * scale,
  ) * 0.5 + 0.25;
}

function insideMap(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < PHAROSVILLE_MAP_WIDTH && y < PHAROSVILLE_MAP_HEIGHT;
}

/** True when this water tile meets any other region or the land rim. */
export function seaEdgeBoundaryAt(tile: { x: number; y: number }, body: SeaBodyId): boolean {
  if (!insideMap(tile.x, tile.y) || seaRegionAtTile(tile.x, tile.y) !== regionId(body)) return false;
  return CARDINAL_NEIGHBOURS.some((offset) => (
    !insideMap(tile.x + offset.x, tile.y + offset.y)
    || rimLandAt(tile.x + offset.x, tile.y + offset.y)
    || seaRegionAtTile(tile.x + offset.x, tile.y + offset.y) !== regionId(body)
  ));
}

function meetsTarget(x: number, y: number, target: BoundaryTarget): boolean {
  return CARDINAL_NEIGHBOURS.some((offset) => {
    const neighbourX = x + offset.x;
    const neighbourY = y + offset.y;
    if (!insideMap(neighbourX, neighbourY)) return false;
    if (target === "rim") return rimLandAt(neighbourX, neighbourY);
    return isWaterTileKind(terrainKindAt(neighbourX, neighbourY))
      && seaRegionAtTile(neighbourX, neighbourY) === regionId(target);
  });
}

/** The openings are empty at the map edge; interior water sharing their bearing is not an opening. */
export function seaEdgeTileInOpening(tile: { x: number; y: number }): boolean {
  const edgeInset = Math.min(
    tile.x,
    tile.y,
    PHAROSVILLE_MAP_WIDTH - 1 - tile.x,
    PHAROSVILLE_MAP_HEIGHT - 1 - tile.y,
  );
  // The passage itself is the outermost two tile rows. A water tile two rows
  // in may border the first headland tile immediately outside the arc (the
  // Danger cliff does exactly that), so it is shore, not open passage.
  if (edgeInset >= 2) return false;
  const bearing = Math.atan2(
    tile.y - (PHAROSVILLE_MAP_HEIGHT - 1) / 2,
    tile.x - (PHAROSVILLE_MAP_WIDTH - 1) / 2,
  );
  return rimDepthAt(bearing) === 0;
}

function clearOfIsland(x: number, y: number, radius: number): boolean {
  const island = GARDEN_SEA_EDGE_ISLAND_WATERLINE;
  return ((x - island.x) / (island.rx + radius + GARDEN_SEA_EDGE_HULL_CLEARANCE_TILES)) ** 2
    + ((y - island.y) / (island.ry + radius + GARDEN_SEA_EDGE_HULL_CLEARANCE_TILES)) ** 2 >= 1;
}

function candidateIsClear(x: number, y: number, radius: number): boolean {
  if (!clearOfIsland(x, y, radius)) return false;
  if (MOORINGS.some((mooring) => (
    Math.hypot(x - mooring.x, y - mooring.y) < radius + GARDEN_SEA_EDGE_HULL_CLEARANCE_TILES
  ))) return false;
  if (STATION_FOOTPRINT_RECTS.some((station) => (
    distanceToStationFootprint({ x, y }, station) < radius
  ))) return false;
  return RIM_COVES.every((cove) => (
    Math.hypot(x - cove.tile.x, y - cove.tile.y)
      >= radius + GARDEN_SEA_EDGE_HULL_CLEARANCE_TILES
  ));
}

function boundaryTangent(x: number, y: number, body: SeaBodyId, form: GardenSeaEdgeForm): number {
  const id = regionId(body);
  const inside = (sampleX: number, sampleY: number) => (
    insideMap(sampleX, sampleY) && seaRegionAtTile(sampleX, sampleY) === id ? 1 : 0
  );
  const gradientX = inside(x + 1, y) - inside(x - 1, y);
  const gradientY = inside(x, y + 1) - inside(x, y - 1);
  let tangent = Math.atan2(gradientY, gradientX) + Math.PI / 2;
  if (Math.abs(gradientX) + Math.abs(gradientY) < 0.5) tangent = 0;
  if (form === "slate-edge" || form === "timber-pile") {
    tangent = Math.round(tangent / (Math.PI / 2)) * (Math.PI / 2);
  }
  return tangent;
}

function resolveGuide(
  guide: EdgeGuide,
  resolved: readonly GardenSeaEdgeSite[],
): GardenSeaEdgeSite {
  const radius = footprintRadius(guide);
  let best: { x: number; y: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let y = 1; y < PHAROSVILLE_MAP_HEIGHT - 1; y += 1) {
    for (let x = 1; x < PHAROSVILLE_MAP_WIDTH - 1; x += 1) {
      const rimSite = guide.surface === "rim-land";
      if (rimSite) {
        // The Danger face belongs to the shore, not the strait: resolve a rim
        // tile whose cardinal neighbour is live Danger water on the opening's
        // flank. It therefore cannot narrow the navigable field.
        if (!rimLandAt(x, y) || !meetsTarget(x, y, guide.body)) continue;
      } else {
        if (seaRegionAtTile(x, y) !== regionId(guide.body)) continue;
        if (!isWaterTileKind(terrainKindAt(x, y)) || rimLandAt(x, y)) continue;
        if (!meetsTarget(x, y, guide.target)) continue;
      }
      if (seaEdgeTileInOpening({ x, y })) continue;
      if (!candidateIsClear(x, y, radius)) continue;
      if (resolved.some((site) => site.form === guide.form
        && Math.hypot(x - site.tile.x, y - site.tile.y) < 1.5)) continue;
      const distance = (x - guide.guide.x) ** 2 + (y - guide.guide.y) ** 2;
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      best = { x, y };
    }
  }
  if (!best) throw new Error(`Could not site sea-edge geography: ${guide.id}`);
  const scale = guideScale(guide);
  return Object.freeze({
    bearing: boundaryTangent(best.x, best.y, guide.body, guide.form),
    body: guide.body,
    form: guide.form,
    footprintRadius: radius,
    height: guide.height * scale,
    id: guide.id,
    length: guide.length * scale,
    material: guide.material,
    tile: Object.freeze(best),
    surface: guide.surface ?? "water",
    width: guide.width * scale,
  });
}

/** Deterministic resolved placements consumed verbatim by the renderer. */
export const GARDEN_SEA_EDGE_SITES: readonly GardenSeaEdgeSite[] = Object.freeze(
  GUIDES.reduce<GardenSeaEdgeSite[]>((sites, guide) => {
    sites.push(resolveGuide(guide, sites));
    return sites;
  }, []),
);

/**
 * Ship-safety footprints for every physical edge feature placed on water. The
 * historical "edge stones" name is retained for the obstacle lane, but reeds,
 * piles and buoys are included too: decorative does not mean navigable. The
 * Danger cliff is already rim land and must not narrow the strait a second time.
 */
export const GARDEN_EDGE_STONE_OBSTACLES: readonly GardenSeaEdgeObstacle[] = Object.freeze(
  GARDEN_SEA_EDGE_SITES.filter((site) => site.surface === "water")
    .map((site) => Object.freeze({
      body: site.body,
      id: site.id,
      r: site.footprintRadius,
      x: site.tile.x,
      y: site.tile.y,
    })),
);
