import type { ShipMotionSample } from "./motion-types";

export const GARDEN_ARRIVAL_BEAT_WINDOW_SECONDS = 4;
export const GARDEN_DEPARTURE_BEAT_WINDOW_SECONDS = 4;
export const GARDEN_DEPARTURE_TRANSIT_BEAT_SECONDS = 2;
export const GARDEN_ARRIVAL_NAMEPLATE_SECONDS = 3;
export const GARDEN_SAIL_DIP_ATTACK_SECONDS = 1.2;
export const GARDEN_SAIL_DIP_HOLD_SECONDS = 1;
export const GARDEN_SAIL_DIP_MIN_SCALE = 0.6;
export const GARDEN_ARRIVAL_BEAT_CAP_FULL = 6;

export interface GardenArrivalBeatEnvelope {
  /** Transient sail dip: 0 is fully set, 1 is the brief 0.6-scale minimum. */
  furl: number;
  /** Strength of the existing wake-field stamp flourish. */
  bowWave: number;
  /** Whether the short DOM ship chip is eligible for the simultaneity cap. */
  nameplate: boolean;
}

export interface GardenArrivalBeatShip {
  detailId: string;
  id: string;
  marketCapUsd: number;
}
type GardenArrivalBeatShipSource = GardenArrivalBeatShip | { ship: GardenArrivalBeatShip };


/**
 * Clock-pure arrival/departure flourish derived only from the sampled route
 * segment. Sails dip briefly, never hold furled at berth; wakes reuse the
 * existing field. These beats displace the beam's monopoly on large motion
 * and 30% of ambient moored-bob amplitude, adding no draw or texture.
 * No entity owns a timer. Reduced motion always returns the exact static frame.
 */
export function gardenArrivalBeatEnvelopeInto(
  sample: Pick<ShipMotionSample, "segment"> | null | undefined,
  reducedMotion: boolean,
  out: GardenArrivalBeatEnvelope,
): GardenArrivalBeatEnvelope {
  out.furl = 0;
  out.bowWave = 0;
  out.nameplate = false;
  if (reducedMotion || !sample?.segment) return out;

  const { kind, secondsInto, secondsRemaining } = sample.segment;
  if (kind === "dock-dwell") {
    out.furl = Math.max(
      sailDip(secondsInto, GARDEN_ARRIVAL_BEAT_WINDOW_SECONDS),
      sailDip(
        GARDEN_DEPARTURE_BEAT_WINDOW_SECONDS - secondsRemaining,
        GARDEN_DEPARTURE_BEAT_WINDOW_SECONDS + GARDEN_DEPARTURE_TRANSIT_BEAT_SECONDS,
      ),
    );

    if (secondsInto < GARDEN_ARRIVAL_BEAT_WINDOW_SECONDS) {
      out.bowWave = 1 - smoothstep01(secondsInto / GARDEN_DEPARTURE_TRANSIT_BEAT_SECONDS);
      out.nameplate = secondsInto < GARDEN_ARRIVAL_NAMEPLATE_SECONDS;
    } else if (secondsRemaining <= GARDEN_DEPARTURE_BEAT_WINDOW_SECONDS) {
      out.nameplate = secondsRemaining <= GARDEN_ARRIVAL_NAMEPLATE_SECONDS;
    }
    return out;
  }

  if (kind === "departure-transit" && secondsInto < GARDEN_DEPARTURE_TRANSIT_BEAT_SECONDS) {
    out.furl = sailDip(
      GARDEN_DEPARTURE_BEAT_WINDOW_SECONDS + secondsInto,
      GARDEN_DEPARTURE_BEAT_WINDOW_SECONDS + GARDEN_DEPARTURE_TRANSIT_BEAT_SECONDS,
    );
    out.bowWave = 1 - smoothstep01(secondsInto / GARDEN_DEPARTURE_TRANSIT_BEAT_SECONDS);
  }
  return out;
}

export function gardenArrivalBeatEnvelope(
  sample: Pick<ShipMotionSample, "segment"> | null | undefined,
  reducedMotion = false,
): GardenArrivalBeatEnvelope {
  return gardenArrivalBeatEnvelopeInto(sample, reducedMotion, {
    furl: 0,
    bowWave: 0,
    nameplate: false,
  });
}

/**
 * Selects the readable wake/nameplate beats without suppressing transient sail dips.
 * A fixed-size insertion keeps priority deterministic and avoids sorting the
 * full fleet: market cap descending, then stable detail id ascending.
 */
export function selectGardenArrivalBeatShipDetailIds(
  ships: readonly GardenArrivalBeatShipSource[],
  samples: ReadonlyMap<string, Pick<ShipMotionSample, "segment">>,
  reducedMotion: boolean,
  limit = GARDEN_ARRIVAL_BEAT_CAP_FULL,
): string[] {
  if (reducedMotion || limit <= 0) return [];
  const selected: GardenArrivalBeatShip[] = [];
  const envelope: GardenArrivalBeatEnvelope = { furl: 0, bowWave: 0, nameplate: false };
  for (const source of ships) {
    const ship = "ship" in source ? source.ship : source;
    gardenArrivalBeatEnvelopeInto(samples.get(ship.id), false, envelope);
    if (envelope.bowWave <= 0 && !envelope.nameplate) continue;
    let insertAt = selected.length;
    while (insertAt > 0 && comparePriority(ship, selected[insertAt - 1]!) < 0) insertAt -= 1;
    if (insertAt >= limit) continue;
    selected.splice(insertAt, 0, ship);
    if (selected.length > limit) selected.pop();
  }
  return selected.map((ship) => ship.detailId);
}

function comparePriority(left: GardenArrivalBeatShip, right: GardenArrivalBeatShip): number {
  return right.marketCapUsd - left.marketCapUsd || left.detailId.localeCompare(right.detailId);
}

function sailDip(secondsInto: number, duration: number): number {
  if (secondsInto <= 0 || secondsInto >= duration) return 0;
  if (secondsInto < GARDEN_SAIL_DIP_ATTACK_SECONDS) {
    return smoothstep01(secondsInto / GARDEN_SAIL_DIP_ATTACK_SECONDS);
  }
  const recoveryStart = GARDEN_SAIL_DIP_ATTACK_SECONDS + GARDEN_SAIL_DIP_HOLD_SECONDS;
  return 1 - smoothstep01((secondsInto - recoveryStart) / (duration - recoveryStart));
}

function smoothstep01(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}
