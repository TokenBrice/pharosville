import { requestGardenBeat, type GardenDirectorState, type GardenRitualHandler } from "./garden-director";
import { inletCrossingTokensBetween, type InletCrossingToken } from "./motion-planning";
import type { PharosVilleMotionPlan } from "./motion-types";
import type { GardenSoundBeat } from "../lib/pharosville-audio/beats";

/**
 * W5.5 — the crossing (fleet-motion-5, §5.0 "Arrival ceremony ≤ 2/h, ≥ 15 min
 * apart; the only nameplate").
 *
 * One significant arrival holds the attention scheduler's crossing token
 * (`motion-planning.ts` hands each crossing slot to a titan or heritage ship
 * whose homecoming lands in it) and sails home straight through the mirror
 * inlet, doubled by its reflection. This module is its ceremony: the one
 * caption, the one nameplate and the two sounds. Every other arrival is
 * silent — continuous arrival captions are gone.
 *
 * - The ceremony is offered once the voyage is `GARDEN_CROSSING_ANNOUNCE_PROGRESS`
 *   through, so the words land while she is still under way, and only when the
 *   ship projects inside the CURRENT camera's frame; a visitor who has moved
 *   the camera away defers it, re-checked every second until she berths.
 * - The director admits it as a foreground `arrival` beat that lasts until
 *   berthing plus a short hold; that beat is the only nameplate.
 * - Sound: `arrival-luff` when admitted (the upper sails come in as she enters
 *   the inlet reach), `fender` at berthing.
 * - Reduced motion: motion is static, no voyage runs and no ceremony fires;
 *   the ship simply lies at her berth.
 *
 * The voyage runs on the motion clock; the director on the wall clock. Callers
 * pass both.
 */

export const GARDEN_CROSSING_ANNOUNCE_PROGRESS = 0.55;
/** The caption and nameplate hold this long after she berths. */
export const GARDEN_CROSSING_BERTHED_HOLD_SECONDS = 10;

export interface GardenCrossingSubject {
  assetName: string;
  detailId: string;
  harbourName: string;
  /** Measured 24h issuance direction; null (flat or unmeasured) omits the supply clause. */
  supplyTrend: "decreased" | "increased" | null;
}

export interface GardenCrossingCeremonyState {
  /** Identity of the crossing whose ceremony was admitted. */
  admittedKey: string | null;
  fenderPlayedKey: string | null;
}

export interface GardenCrossingCeremonyStep {
  /** Set only on the step the ceremony is admitted. */
  caption: { text: string; startSeconds: number; durationSeconds: number } | null;
  nameplate: { detailId: string; startSeconds: number; endSeconds: number } | null;
  sounds: GardenSoundBeat[];
}

export function createGardenCrossingCeremonyState(): GardenCrossingCeremonyState {
  return { admittedKey: null, fenderPlayedKey: null };
}

function crossingKey(token: InletCrossingToken): string {
  return `${token.shipId}:${token.cycleIndex}:${token.startSeconds}`;
}

/**
 * The caption may only claim a supply change the data measured: net minting or
 * redeeming over the 24h issuance window.
 */
export function gardenCrossingCaption(subject: GardenCrossingSubject): string {
  const supplyClause = subject.supplyTrend ? ` · supply ${subject.supplyTrend} over 24h` : "";
  return `${subject.assetName} arrives at ${subject.harbourName}${supplyClause}`;
}

/**
 * One step of the crossing ceremony (call about once a second). Allocates
 * only when it has something to say.
 */
export function stepGardenCrossingCeremony(
  state: GardenCrossingCeremonyState,
  input: {
    plan: PharosVilleMotionPlan;
    director: GardenDirectorState;
    motionTimeSeconds: number;
    wallTimeSeconds: number;
    /** The token holder's display facts, or null when it is not in this world. */
    subject: (shipId: string, dockId: string) => GardenCrossingSubject | null;
    /** Whether the ship projects inside the current camera's frame. */
    inFrame: (detailId: string) => boolean;
  },
): GardenCrossingCeremonyStep | null {
  const tokens = inletCrossingTokensBetween(
    input.plan,
    input.motionTimeSeconds - GARDEN_CROSSING_BERTHED_HOLD_SECONDS,
    input.motionTimeSeconds + 1e-3,
  );
  for (const token of tokens) {
    const key = crossingKey(token);
    const voyageSeconds = Math.max(1, token.endSeconds - token.startSeconds);
    const progress = (input.motionTimeSeconds - token.startSeconds) / voyageSeconds;
    if (state.admittedKey === key) {
      if (progress >= 1 && state.fenderPlayedKey !== key) {
        state.fenderPlayedKey = key;
        return { caption: null, nameplate: null, sounds: ["fender"] };
      }
      continue;
    }
    if (progress < GARDEN_CROSSING_ANNOUNCE_PROGRESS || progress >= 1) continue;
    const subject = input.subject(token.shipId, token.dockId);
    if (!subject || !input.inFrame(subject.detailId)) continue;
    const durationSeconds = (1 - progress) * voyageSeconds + GARDEN_CROSSING_BERTHED_HOLD_SECONDS;
    // A forced crossing (slot −1) is a ritual the director already admitted
    // when it started it; a scheduled one asks for its foreground beat now.
    const startSeconds = token.slotIndex < 0
      ? input.wallTimeSeconds
      : requestGardenBeat(input.director, {
        durationSeconds,
        foreground: true,
        kind: "arrival",
        priority: 90,
        subject: subject.detailId,
      }, input.wallTimeSeconds)?.startSeconds;
    if (startSeconds === undefined) continue;
    state.admittedKey = key;
    return {
      caption: { text: gardenCrossingCaption(subject), startSeconds, durationSeconds },
      nameplate: { detailId: subject.detailId, startSeconds, endSeconds: startSeconds + durationSeconds },
      sounds: ["arrival-luff"],
    };
  }
  return null;
}

/**
 * The director's `crossing` ritual (S-A `registerRitual("crossing", …)`). The
 * score never schedules it — scheduled crossings run from the motion plan's
 * own tokens — so `start` is the forced path (`forceRitual("crossing")`): the
 * most significant subject at anchor sets out through the inlet now, and the
 * ordinary ceremony above announces her. `cancel` leaves her voyage alone:
 * a hull under way never stops or jumps mid-inlet.
 */
export function createGardenCrossingHandler(deps: {
  /** Starts a crossing now on the live plan (`forceInletCrossing`). */
  force: () => InletCrossingToken | null;
  motionTimeSeconds: () => number;
}): GardenRitualHandler {
  let token: InletCrossingToken | null = null;
  return {
    start() {
      token = deps.force();
    },
    update() {
      if (!token) return true;
      if (deps.motionTimeSeconds() < token.endSeconds + GARDEN_CROSSING_BERTHED_HOLD_SECONDS) return false;
      token = null;
      return true;
    },
    cancel() {
      token = null;
    },
  };
}
