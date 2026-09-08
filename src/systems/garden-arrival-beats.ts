import { requestGardenBeat } from "./garden-director";
import type { GardenBeat, GardenDirectorState } from "./garden-director";
import type { ShipMotionSample } from "./motion-types";

export const GARDEN_ARRIVAL_BEAT_WINDOW_SECONDS = 10;
export const GARDEN_DEPARTURE_BEAT_WINDOW_SECONDS = 4;
export const GARDEN_DEPARTURE_TRANSIT_BEAT_SECONDS = 2;
export const GARDEN_ARRIVAL_NAMEPLATE_SECONDS = 10;
export const GARDEN_SAIL_DIP_ATTACK_SECONDS = 1.2;
export const GARDEN_SAIL_DIP_HOLD_SECONDS = 1;
export const GARDEN_SAIL_DIP_MIN_SCALE = 0.6;
export const GARDEN_ARRIVAL_BEAT_CAP_FULL = 1;
export const GARDEN_ARRIVAL_CEREMONY_MIN_INTERVAL_SECONDS = 120;
export const GARDEN_ARRIVAL_CEREMONY_MAX_INTERVAL_SECONDS = 240;

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

export interface GardenArrivalCandidate {
  assetName: string;
  detailId: string;
  harbourName: string;
  id: string;
  /** Arriving asset's share of tracked supply, in [0, 1]. */
  supplyShare: number;
  supplyTrend: "decreased" | "increased";
}

export interface GardenArrivalBeat {
  annotation: { text: string; startSeconds: number; durationSeconds: number } | null;
  arrival: GardenArrivalCandidate;
  directorBeat: GardenBeat;
}

export interface GardenArrivalCeremonyState {
  nextEligibleSeconds: number;
}

export function createGardenArrivalCeremonyState(): GardenArrivalCeremonyState {
  return { nextEligibleSeconds: Number.NEGATIVE_INFINITY };
}

/**
 * Offers the single most significant arrival to the garden director. The local
 * cooldown prevents a convoy from repeatedly asking for foreground attention.
 */
export function requestGardenArrivalCeremony(
  state: GardenArrivalCeremonyState,
  director: GardenDirectorState,
  arrivals: readonly GardenArrivalCandidate[],
  timeSeconds: number,
): GardenArrivalBeat | null {
  if (arrivals.length === 0 || timeSeconds < state.nextEligibleSeconds) return null;
  let arrival = arrivals[0]!;
  for (let index = 1; index < arrivals.length; index += 1) {
    const candidate = arrivals[index]!;
    if (
      normalizedShare(candidate.supplyShare) > normalizedShare(arrival.supplyShare)
      || (
        normalizedShare(candidate.supplyShare) === normalizedShare(arrival.supplyShare)
        && candidate.detailId.localeCompare(arrival.detailId) < 0
      )
    ) arrival = candidate;
  }
  const durationSeconds = 8 + seededUnit(`${arrival.id}:duration`) * 4;
  const directorBeat = requestGardenBeat(director, {
    durationSeconds,
    foreground: true,
    kind: "arrival",
    priority: Math.max(1, Math.round(normalizedShare(arrival.supplyShare) * 99)),
    subject: arrival.detailId,
  }, timeSeconds);
  if (!directorBeat) return null;
  state.nextEligibleSeconds = timeSeconds
    + GARDEN_ARRIVAL_CEREMONY_MIN_INTERVAL_SECONDS
    + seededUnit(`${arrival.id}:${directorBeat.id}:interval`)
      * (GARDEN_ARRIVAL_CEREMONY_MAX_INTERVAL_SECONDS - GARDEN_ARRIVAL_CEREMONY_MIN_INTERVAL_SECONDS);
  return {
    annotation: {
      durationSeconds,
      startSeconds: directorBeat.startSeconds,
      text: `${arrival.assetName} arrives at ${arrival.harbourName} · supply ${arrival.supplyTrend} in the window`,
    },
    arrival,
    directorBeat,
  };
}


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
      ceremonySailDip(secondsInto),
      sailDip(
        GARDEN_DEPARTURE_BEAT_WINDOW_SECONDS - secondsRemaining,
        GARDEN_DEPARTURE_BEAT_WINDOW_SECONDS + GARDEN_DEPARTURE_TRANSIT_BEAT_SECONDS,
      ),
    );

    if (secondsInto < GARDEN_ARRIVAL_BEAT_WINDOW_SECONDS) {
      out.bowWave = 1 - smoothstep01(secondsInto / GARDEN_DEPARTURE_TRANSIT_BEAT_SECONDS);
      out.nameplate = secondsInto < GARDEN_ARRIVAL_NAMEPLATE_SECONDS;
    } else if (secondsRemaining <= GARDEN_DEPARTURE_BEAT_WINDOW_SECONDS) {
      out.nameplate = secondsRemaining <= 3;
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
 * Transitional renderer selector. The director-facing ceremony above owns
 * eligibility; this keeps the existing render loop's readable subject capped
 * to that same single highest-supply arrival until it supplies the active id.
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

function ceremonySailDip(secondsInto: number): number {
  if (secondsInto <= 0 || secondsInto >= GARDEN_ARRIVAL_BEAT_WINDOW_SECONDS) return 0;
  if (secondsInto < 3) return smoothstep01(secondsInto / 3);
  if (secondsInto <= 7) return 1;
  return 1 - smoothstep01((secondsInto - 7) / 3);
}

function sailDip(secondsInto: number, duration: number): number {
  if (secondsInto <= 0 || secondsInto >= duration) return 0;
  if (secondsInto < GARDEN_SAIL_DIP_ATTACK_SECONDS) {
    return smoothstep01(secondsInto / GARDEN_SAIL_DIP_ATTACK_SECONDS);
  }
  const recoveryStart = GARDEN_SAIL_DIP_ATTACK_SECONDS + GARDEN_SAIL_DIP_HOLD_SECONDS;
  return 1 - smoothstep01((secondsInto - recoveryStart) / (duration - recoveryStart));
}

function normalizedShare(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function seededUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

function smoothstep01(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}
