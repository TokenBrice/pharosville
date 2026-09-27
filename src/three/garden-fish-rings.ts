import type { GardenRitualHandler } from "../systems/garden-director";
import { GARDEN_EMPTY_INLET } from "../systems/garden-inlet";
import { TILE_SCALE } from "../systems/projection";
import type { GardenRippleRingEmitter } from "./garden-water-contract";

/**
 * X5 (life-6): a fish rising on still water.
 *
 * Now and then (the score's background `fish-rings` ritual: daylight away from
 * noon, at most one every twenty minutes) a single ring rises on the empty
 * inlet — the mirror between the viewer and the island — spreads, fades and is
 * gone. One ring source only, through the water's one-shot pulse, so it can
 * never read as a standing cue. Nothing here encodes data. Reduced motion: the
 * driver never starts it and the water refuses pulses on a frozen clock, so
 * there are no rings.
 */

export const GARDEN_FISH_RING_SECONDS = 8;
export const GARDEN_FISH_RING_RADIUS = 4.6;
const RING_PERIOD_SECONDS = 5.5;
const RING_STRENGTH = 1;
const RING_ID = "fish-rise";

/** `fract(sin(n)·43758.5)`. */
function hash(n: number): number {
  const value = Math.sin(n * 12.9898 + 4.1414) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Where a rise happens for `seed`: along the inlet spine between 30 % and 75 %
 * of the way from the viewer's shore to the island, a few tiles either side
 * of the sight line, never in the ships' corridor edges. World x/z.
 */
export function gardenFishRiseSite(seed: number): { x: number; z: number } {
  const [near, far] = GARDEN_EMPTY_INLET.polyline;
  const along = 0.3 + hash(seed) * 0.45;
  const dx = far.x - near.x;
  const dy = far.y - near.y;
  const length = Math.hypot(dx, dy);
  const across = (hash(seed + 7.3) - 0.5) * 2 * (GARDEN_EMPTY_INLET.halfWidth - 5);
  const tileX = near.x + dx * along + (-dy / length) * across;
  const tileY = near.y + dy * along + (dx / length) * across;
  return { x: tileX * TILE_SCALE, z: tileY * TILE_SCALE };
}

export interface GardenFishRings {
  /** The S-A `fish-rings` ritual handler. */
  ritual: GardenRitualHandler;
  dispose: () => void;
}

export function createGardenFishRings(options: {
  emitter: Pick<GardenRippleRingEmitter, "pulseRing" | "removeRing">;
  /** S-A `registerRitual`; `dispose` releases it. Omit in tests. */
  registerRitual?: (kind: "fish-rings", handler: GardenRitualHandler) => () => void;
}): GardenFishRings {
  let started: number | null = null;
  const ritual: GardenRitualHandler = {
    start(t) {
      started = t;
      options.emitter.pulseRing({
        center: gardenFishRiseSite(Math.floor(t)),
        id: RING_ID,
        periodSeconds: RING_PERIOD_SECONDS,
        radius: GARDEN_FISH_RING_RADIUS,
        strength: RING_STRENGTH,
      });
    },
    update(t) {
      if (started === null) return true;
      if (Math.abs(t - started) > GARDEN_FISH_RING_SECONDS * 4) started = t;
      if (t - started < GARDEN_FISH_RING_SECONDS) return false;
      started = null;
      return true;
    },
    cancel() {
      started = null;
      options.emitter.removeRing(RING_ID);
    },
  };
  const release = options.registerRitual?.("fish-rings", ritual) ?? null;
  return {
    dispose() {
      release?.();
    },
    ritual,
  };
}
