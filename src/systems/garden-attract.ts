import { gardenIslandDisplayTile } from "./garden-observatory-slice";
import { RIM_COVES } from "./garden-rim";
import type { ObserveTourKeyframe } from "./observe-tour";
import { tileToIso, type ScreenPoint } from "./projection";
import { stableUnit } from "./stable-random";

export const GARDEN_ATTRACT_IDLE_MS = 120_000;
export const GARDEN_ATTRACT_TRAVEL_SECONDS = 28;

export interface GardenPostcard extends ObserveTourKeyframe {
  name: string;
  subjectTile: ScreenPoint;
  preferredPhase: "dawn" | "day" | "golden" | "blue" | "night";
  holdSeconds: number;
  travelSeconds: number;
}

/** A stationary book of places, not a camera patrol. Phase is a preference,
 * never an instruction to change the wall-clock illumination. */
export function gardenAttractKeyframes(lighthouseTile: ScreenPoint, seed = "pharosville"): GardenPostcard[] {
  const cove = (id: string) => RIM_COVES.find((entry) => entry.id === id)!.tile;
  const postcards = [
    { name: "Pharos Dawn", subjectTile: gardenIslandDisplayTile(lighthouseTile), zoom: 1.15, preferredPhase: "dawn" },
    { name: "Mole Market", subjectTile: cove("ethereum-mole"), zoom: 1.1, preferredPhase: "day" },
    { name: "Storm Passage", subjectTile: cove("danger-gorge"), zoom: 1, preferredPhase: "blue" },
    { name: "Wreck Memorial", subjectTile: cove("wreck-shoal-east"), zoom: 1.15, preferredPhase: "night" },
    { name: "Garden Shore", subjectTile: cove("calm-engawa-south"), zoom: 1.2, preferredPhase: "golden" },
    { name: "Ledger Basin", subjectTile: cove("ledger-fog-hook"), zoom: 1.1, preferredPhase: "day" },
  ] as const;
  return postcards.map((postcard, beatIndex) => {
    const iso = tileToIso(postcard.subjectTile);
    return {
      ...postcard, beatIndex, isoX: iso.x, isoY: iso.y,
      holdSeconds: 180 + stableUnit(`${seed}:${postcard.name}:hold`) * 180,
      travelSeconds: 20 + stableUnit(`${seed}:${postcard.name}:travel`) * 15,
    };
  });
}
