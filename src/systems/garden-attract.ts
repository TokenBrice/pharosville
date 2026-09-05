import { gardenIslandDisplayTile } from "./garden-observatory-slice";
import { RIM_COVES } from "./garden-rim";
import type { ObserveTourKeyframe } from "./observe-tour";
import { tileToIso, type ScreenPoint } from "./projection";

export const GARDEN_ATTRACT_IDLE_MS = 120_000;
export const GARDEN_ATTRACT_SEGMENT_SECONDS = 36;
export const GARDEN_ATTRACT_TRAVEL_SECONDS = 28;
/** Cove-mouth tile of the Ethereum Mole — anchor of the quay postcard. */
const MOLE_POSTCARD_TILE = RIM_COVES.find((cove) => cove.id === "ethereum-mole")!.tile;
/** Cove tile at the wreck shoal's eastern mouth — anchor of the shoal postcard. */
const WRECK_SHOAL_POSTCARD_TILE = RIM_COVES.find((cove) => cove.id === "wreck-shoal-east")!.tile;
/**
 * Four fixed postcard framings; no camera noise and no data-driven salience.
 *
 * Warm-village A1 (2026-09-05): the rest frame is a sailed-in 1.0, so the
 * idle tour is no longer wider than rest. Each postcard is now a close-up of
 * one named precinct in the 1.0–1.4 zoom band — Pharos precinct, Ethereum
 * Mole quay, the NE arc stations, the wreck shoal — with every centre tile
 * carried by the plate.
 */
export function gardenAttractKeyframes(
  lighthouseTile: ScreenPoint,
): ObserveTourKeyframe[] {
  const island = gardenIslandDisplayTile(lighthouseTile);
  const mole = MOLE_POSTCARD_TILE;
  const wreckShoal = WRECK_SHOAL_POSTCARD_TILE;
  const postcards = [
    // Pharos precinct: centred at the tower's mid-height, so the crown and
    // the quay water both seat from the 640px gate upward.
    { tile: { x: island.x - 18, y: island.y - 20 }, zoom: 1.15 },
    // The Mole quay at its cove mouth, with the eastward approach water.
    { tile: { x: mole.x + 4, y: mole.y - 3 }, zoom: 1.1 },
    // The NE arc stations: from this mid-arc centre at the rest zoom, the
    // warning-stone-notch (118,10) and watch-east-bay (132,80) mouths frame
    // together on a 1568px window.
    { tile: { x: 125, y: 45 }, zoom: 1.0 },
    // The wreck shoal: the tidal inlet and the grave scatter it bites out of
    // the camera-near south-west lobe.
    { tile: { x: wreckShoal.x - 7, y: wreckShoal.y - 2 }, zoom: 1.15 },
  ] as const;
  return postcards.map((postcard, beatIndex) => {
    const iso = tileToIso(postcard.tile);
    return { beatIndex, isoX: iso.x, isoY: iso.y, zoom: postcard.zoom };
  });
}
