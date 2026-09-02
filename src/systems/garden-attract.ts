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
    { tile: { x: island.x + 7, y: island.y + 12 }, zoom: 0.76 }, // tower past engawa
    { tile: { x: map.width * 0.61, y: map.height * 0.44 }, zoom: 0.68 }, // anchorage ma
    { tile: { x: map.width * 0.33, y: map.height * 0.58 }, zoom: 0.74 }, // rim and cove
    { tile: { x: island.x - 3, y: island.y - 1 }, zoom: 0.84 }, // dusk beam
  ] as const;
  return postcards.map((postcard, beatIndex) => {
    const iso = tileToIso(postcard.tile);
    return { beatIndex, isoX: iso.x, isoY: iso.y, zoom: postcard.zoom };
  });
}
