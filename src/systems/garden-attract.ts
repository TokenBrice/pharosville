import { gardenIslandDisplayTile } from "./garden-observatory-slice";
import type { ObserveTourKeyframe } from "./observe-tour";
import { tileToIso, type MapLike, type ScreenPoint } from "./projection";

export const GARDEN_ATTRACT_IDLE_MS = 120_000;
export const GARDEN_ATTRACT_SEGMENT_SECONDS = 36;
export const GARDEN_ATTRACT_TRAVEL_SECONDS = 28;

/** Four fixed postcard framings; no camera noise and no data-driven salience. */
export function gardenAttractKeyframes(
  lighthouseTile: ScreenPoint,
  map: MapLike,
): ObserveTourKeyframe[] {
  const island = gardenIslandDisplayTile(lighthouseTile);
  const postcards = [
    { tile: { x: island.x + 5, y: island.y + 3 }, zoom: 0.94 }, // tower past torii
    { tile: { x: map.width * 0.62, y: map.height * 0.43 }, zoom: 0.82 }, // anchorage void
    { tile: { x: island.x + 1.5, y: island.y + 1 }, zoom: 1.12 }, // grove
    { tile: { x: island.x - 4, y: island.y - 2 }, zoom: 1.02 }, // dusk beam
  ] as const;
  return postcards.map((postcard, beatIndex) => {
    const iso = tileToIso(postcard.tile);
    return { beatIndex, isoX: iso.x, isoY: iso.y, zoom: postcard.zoom };
  });
}
