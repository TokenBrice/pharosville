/**
 * The world's tile-grid scale factor, in its own module so both
 * `world-layout.ts` and `risk-water-areas.ts` can read it without an import
 * cycle (world-layout imports the authored risk-water region tiles).
 *
 * N1 (2026-07-25): the world grew 2x on each axis — 4x the sea — because at
 * 56x56 the island and its halo left only ~10 eligible water tiles per ship,
 * which read as a packed quay with no room to sail or manoeuvre.
 *
 * H4 (2026-07-25): 2 -> 2.5, so 140x140 and 6.25x the original sea. At 2x the
 * fleet still read as crowded (operator: "it still feels crowdy... we could
 * increase map size again"). The island keeps its absolute size, so this is
 * paid for in apparent island scale at whole-map framing — the trade the
 * operator asked for.
 *
 * Terrain and zone anchors stay authored in the original 56-tile DESIGN SPACE.
 * Zone geometry is SCALED onto the larger grid (so every band gains
 * proportional water); landmasses are OFFSET (so the island keeps its exact
 * authored size and simply sits in a bigger sea).
 */
export const PHAROSVILLE_MAP_SCALE = 2.5;

/** The tile span every terrain and zone feature is authored in. */
export const PHAROSVILLE_DESIGN_SPAN = 56;

/** Offset that centres the design-space landmasses on the enlarged grid. */
export const PHAROSVILLE_LAND_OFFSET =
  (PHAROSVILLE_DESIGN_SPAN * PHAROSVILLE_MAP_SCALE - PHAROSVILLE_DESIGN_SPAN) / 2;

/**
 * Design tile -> world tile for ZONE geometry (stretched to fill the map).
 *
 * The result is a TILE INDEX, so it must be an integer: these anchors are fed
 * to flood fills and to row-major mask lookups (`isNavigableWaterTile`), and a
 * fractional coordinate there indexes nothing and walks a lattice of its own.
 * At an integer scale that never surfaced; at 2.5 (H4) every odd design tile
 * would land on a half-tile.
 *
 * The map is EDGE-PRESERVING rather than a plain multiply: design 0 lands on
 * world 0 and design 55 on the last world tile. Several zones are authored
 * flush against the map edge and are asserted to stay there, which a plain
 * `n * scale` breaks the moment the scale is not an integer.
 */
const DESIGN_LAST = PHAROSVILLE_DESIGN_SPAN - 1;
const WORLD_LAST = PHAROSVILLE_DESIGN_SPAN * PHAROSVILLE_MAP_SCALE - 1;

function zoneWorldAxis(designTile: number): number {
  return Math.round((designTile * WORLD_LAST) / DESIGN_LAST);
}

export function zoneWorldTile<T extends { x: number; y: number }>(tile: T): { x: number; y: number } {
  return { x: zoneWorldAxis(tile.x), y: zoneWorldAxis(tile.y) };
}

/** Design tile -> world tile for LANDMASS anchors (absolute size preserved). */
export function landWorldTile<T extends { x: number; y: number }>(tile: T): { x: number; y: number } {
  return {
    x: tile.x + PHAROSVILLE_LAND_OFFSET,
    y: tile.y + PHAROSVILLE_LAND_OFFSET,
  };
}
