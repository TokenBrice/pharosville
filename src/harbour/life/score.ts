import { cranePassage, murmurationSeason } from "../season/calendar";
import { rng } from "./walkways";

/**
 * THE DECORATIVE SCORE (V26; O7-I10/I11; PLAN §2's calm budget) — declared decorative. One deterministic, seeded
 * scheduler for the rare decorative cues: the crane V, the starling murmuration and the dolphins' splash ring, AT
 * MOST ONE per 20 minutes of a visit (start to start), chosen among the cues the calendar and the clock allow right
 * now. The first chance comes 3–12 minutes into the visit (never on arrival). Nothing here reads data: the calendar
 * (the season service's day and sunset), the clock (TimeOfDay.clockHour) and the visit's own seconds decide. The
 * weather only takes cues away (T5: in rough weather the town and its animals take shelter): none in Warning or
 * Danger, none while a staged moment runs, none under reduced motion or Still world. No sound, no camera move.
 * The doves on the hour sit outside this budget (V26 "plus doves on the hour").
 */
export type ScoreCue = "cranes" | "murmuration" | "splash";
export const SCORE_CUES: readonly ScoreCue[] = ["cranes", "murmuration", "splash"];
/** Start-to-start spacing of the rare cues (s). */
export const SCORE_GAP_S = 20 * 60;
/** The first chance: 3 min + up to 9 min into the visit. */
const FIRST_S = 180, FIRST_SPAN_S = 540;
/** A chance that finds nothing allowed looks again this much later (s). */
const RETRY_S = 5;
/** How long each cue holds the sky (s), for the dev repeat (`?score=`). */
export const CUE_S: Record<ScoreCue, number> = { cranes: 70, murmuration: 100, splash: 20 };

/** DEWS level index (weather director: CALM 0 … WARNING 3, DANGER 4) at or above which life shelters. */
export const SHELTER_LEVEL = 2.5;
export const shelters = (level: number | null): boolean => level !== null && level >= SHELTER_LEVEL;

/** What the calendar and the clock show right now (all decorative). */
export interface ScoreSky {
  /** northern-equivalent day of the year (calendar.northernDay) */
  nDay: number;
  /** the clock hour (TimeOfDay.clockHour), local */
  clock: number;
  /** local clock hours (season service) */
  sunrise: number;
  sunset: number;
  /** the dolphins may roll now (their own calm gate: DEWS Calm/Watch with a fresh reading) */
  dolphins: boolean;
}

/** The cues the calendar and the clock allow: cranes by day in their passage, starlings at winter dusk, a splash by day in calm. */
export function cueAllowed(cue: ScoreCue, s: ScoreSky): boolean {
  if (cue === "cranes") return cranePassage(s.nDay) !== null && s.clock > s.sunrise + 1 && s.clock < s.sunset - 1;
  if (cue === "murmuration") return murmurationSeason(s.nDay) && s.clock > s.sunset - 0.75 && s.clock < s.sunset + 0.25;
  return s.dolphins && s.clock > s.sunrise + 0.5 && s.clock < s.sunset - 0.5;
}

/** The gate the score reads every frame. */
export interface ScoreGate {
  /** seconds of the visit (the frame clock, monotonic) */
  t: number;
  /** false under reduced motion or Still world */
  moving: boolean;
  /** a staged moment is running (events.current) */
  staged: boolean;
  /** DEWS Warning or Danger */
  shelter: boolean;
  allowed: (cue: ScoreCue) => boolean;
}

export class Score {
  private next: number;
  private readonly r: () => number;
  /** cues started this visit (tests, captures: window.__harbourLife.life.score) */
  readonly log: Array<{ cue: ScoreCue; t: number }> = [];

  /**
   * @param seed the visit's seed (the same seed and the same sky give the same score)
   * @param force dev `?score=`: that cue only, from 2 s in, again as soon as it has finished (captures, gates)
   */
  constructor(seed: number, private readonly force: ScoreCue | null = null) {
    this.r = rng(seed);
    this.next = force ? 2 : FIRST_S + this.r() * FIRST_SPAN_S;
  }

  /** The cue to start now, or null (one comparison on most frames). */
  step(g: ScoreGate): ScoreCue | null {
    if (g.t < this.next || !g.moving || g.staged || g.shelter) return null;
    let open = 0, pick: ScoreCue | null = null;
    for (const c of SCORE_CUES) if ((this.force === null || c === this.force) && g.allowed(c)) open++;
    if (!open) { this.next = g.t + RETRY_S; return null; }
    let k = Math.floor(this.r() * open);
    for (const c of SCORE_CUES) if ((this.force === null || c === this.force) && g.allowed(c) && k-- === 0) { pick = c; break; }
    if (!pick) return null;
    this.next = g.t + (this.force ? CUE_S[pick] + 5 : SCORE_GAP_S);
    this.log.push({ cue: pick, t: g.t });
    return pick;
  }
}

/** The dev `?score=` value, or null. */
export function parseScoreForce(v: string | null): ScoreCue | null {
  return v && (SCORE_CUES as readonly string[]).includes(v) ? v as ScoreCue : null;
}

/** O7-I10: the doves lift on the hour bell's hours, 06–22 (audio/ambience.ts hourStrikes > 0; parity-tested). */
export const doveHour = (h: number): boolean => h >= 6 && h <= 22;
