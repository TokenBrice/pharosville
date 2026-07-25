/**
 * The world's tile-grid scale factor, in its own module so both
 * `world-layout.ts` and `risk-water-areas.ts` can read it without an import
 * cycle (world-layout imports the authored risk-water region tiles).
 *
 * N1 (2026-07-25): the world grew 2x on each axis — 4x the sea — because at
 * 56x56 the island and its halo left only ~10 eligible water tiles per ship,
 * which read as a packed quay with no room to sail or manoeuvre.
 *
 * Terrain and zone anchors stay authored in the original 56-tile DESIGN SPACE.
 * Zone geometry is SCALED onto the larger grid (so every band gains
 * proportional water); landmasses are OFFSET (so the island keeps its exact
 * authored size and simply sits in a bigger sea).
 */
export const PHAROSVILLE_MAP_SCALE = 2;

/** The tile span every terrain and zone feature is authored in. */
export const PHAROSVILLE_DESIGN_SPAN = 56;

/** Offset that centres the design-space landmasses on the enlarged grid. */
export const PHAROSVILLE_LAND_OFFSET =
  (PHAROSVILLE_DESIGN_SPAN * PHAROSVILLE_MAP_SCALE - PHAROSVILLE_DESIGN_SPAN) / 2;

/** Design tile -> world tile for ZONE geometry (stretched to fill the map). */
export function zoneWorldTile<T extends { x: number; y: number }>(tile: T): { x: number; y: number } {
  return { x: tile.x * PHAROSVILLE_MAP_SCALE, y: tile.y * PHAROSVILLE_MAP_SCALE };
}

/** Design tile -> world tile for LANDMASS anchors (absolute size preserved). */
export function landWorldTile<T extends { x: number; y: number }>(tile: T): { x: number; y: number } {
  return {
    x: tile.x + PHAROSVILLE_LAND_OFFSET,
    y: tile.y + PHAROSVILLE_LAND_OFFSET,
  };
}
