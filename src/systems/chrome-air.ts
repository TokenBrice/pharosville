/**
 * W6.5 (chrome-6): the DOM chrome breathes with the same five-beat light score
 * as the world (`dayCycleBeats`). Each beat authors an anchor for the air the
 * chrome sits in (the caption, label and control scrims) and for the record
 * paper; the chrome is their beat-weighted mix, written to `:root` once a
 * minute (`useChromeAir`). Air stays continuous from umber to indigo.
 * The wall clock is the only input — never market data.
 *
 * The air never changes polarity: its ink is always dark and its text always
 * light, so it is continuous all day. The paper cannot be: a sheet that fades
 * from washi to indigo passes a mid-tone where no ink reaches AA. Each beat
 * therefore authors two sheets — a washi (light) one and an indigo (dark) one —
 * each continuous across the day, and the card wears the indigo sheet while
 * the blue and night beats hold at least half of the score. Paper and every
 * ink role switch together, atomically: CSS never interpolates their polarity.
 *
 * Anchors are the palette's dye lot (`HARBOR_UI_PALETTE`, `pharosville.css`
 * `:root`): day paper is mist 55 % + parchment 45 %, night paper is water-dark
 * (`--pv-panel-deep`) with a trace of parchment; inks are `--ink` and
 * `--pv-parchment`. The `:root` block in `pharosville.css` carries the day
 * values for first paint.
 */
import type { DayCycleBeatName, DayCycleBeats } from "./day-cycle-beats";

/** Opacity of the scrim core under chrome text; `pharosville.css` mixes `--pv-air-ink` at 80 %. */
export const CHROME_AIR_SCRIM_CORE = 0.8;

interface ChromeAirAnchor {
  /** Scrim ink behind text over the scene: slate by day, umber at golden, indigo at night. */
  ink: string;
  /** Text over the scrim. */
  text: string;
  /** Provenance and secondary words over the scrim. */
  quiet: string;
  /** In-world names (nameplates, hover): the air's text by day, ember ink after dusk. */
  label: string;
}

interface ChromePaperSheet {
  paper: string;
  ink: string;
  quiet: string;
  link: string;
}

interface ChromeBeatAnchor {
  air: ChromeAirAnchor;
  washi: ChromePaperSheet;
  indigo: ChromePaperSheet;
}

const WASHI_INK = "#1a1612";
const INDIGO_INK = "#e8eef0";

export const CHROME_BEAT_ANCHORS: Readonly<Record<DayCycleBeatName, ChromeBeatAnchor>> = {
  dawn: {
    air: { ink: "#231f33", text: "#f1e9e4", quiet: "#d6cbd0", label: "#f1e9e4" },
    washi: { paper: "#e4dcd2", ink: WASHI_INK, quiet: "#4c4139", link: "#56473a" },
    indigo: { paper: "#2c2745", ink: INDIGO_INK, quiet: "#c3bccf", link: "#e6d6b8" },
  },
  day: {
    air: { ink: "#16222f", text: "#eef0ec", quiet: "#cdd2d0", label: "#eef0ec" },
    washi: { paper: "#e5dfce", ink: WASHI_INK, quiet: "#4a4035", link: "#5a4a37" },
    indigo: { paper: "#28243f", ink: INDIGO_INK, quiet: "#c0bacc", link: "#e2d2b3" },
  },
  golden: {
    air: { ink: "#35271b", text: "#f5ead6", quiet: "#dccdb4", label: "#f7e6c6" },
    washi: { paper: "#e7d9c0", ink: WASHI_INK, quiet: "#4d4034", link: "#5a4834" },
    indigo: { paper: "#322a3e", ink: INDIGO_INK, quiet: "#c8bcc8", link: "#e8d4b2" },
  },
  blue: {
    air: { ink: "#1f1d36", text: "#ede9ee", quiet: "#cbc6d6", label: "#f2d9ad" },
    washi: { paper: "#dcd5d6", ink: WASHI_INK, quiet: "#473d3a", link: "#524336" },
    indigo: { paper: "#2b2643", ink: INDIGO_INK, quiet: "#c1bbd0", link: "#e4d4b5" },
  },
  night: {
    air: { ink: "#141129", text: "#e8eef0", quiet: "#c4c2d6", label: "#efd3a2" },
    washi: { paper: "#dad5d8", ink: WASHI_INK, quiet: "#463d3b", link: "#524437" },
    indigo: { paper: "#26223f", ink: INDIGO_INK, quiet: "#bfbad0", link: "#e2d2b3" },
  },
};

export const CHROME_AIR_TOKEN_NAMES = [
  "--pv-air-ink",
  "--pv-text-on-air",
  "--pv-text-on-air-quiet",
  "--pv-label-ink",
  "--pv-paper",
  "--pv-paper-ink",
  "--pv-text-quiet",
  "--pv-link",
] as const;

export type ChromeAirTokenName = typeof CHROME_AIR_TOKEN_NAMES[number];
export type ChromeAirTokens = Record<ChromeAirTokenName, string>;
export type ChromePaperSheetName = "washi" | "indigo";

const BEAT_NAMES: readonly DayCycleBeatName[] = ["dawn", "day", "golden", "blue", "night"];

/** Which sheet all DOM panels wear: indigo once blue and night hold half the score. */
export function chromePaperSheet(beats: DayCycleBeats): ChromePaperSheetName {
  return beats.blue + beats.night >= 0.5 ? "indigo" : "washi";
}

function mixHex(beats: DayCycleBeats, pick: (anchor: ChromeBeatAnchor) => string): string {
  let total = 0;
  const sum = [0, 0, 0];
  for (const name of BEAT_NAMES) {
    const weight = beats[name];
    if (!(weight > 0)) continue;
    total += weight;
    const hex = pick(CHROME_BEAT_ANCHORS[name]);
    for (let index = 0; index < 3; index += 1) {
      sum[index]! += Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) * weight;
    }
  }
  if (total <= 0) return pick(CHROME_BEAT_ANCHORS.day);
  return `#${sum.map((channel) => Math.round(channel / total).toString(16).padStart(2, "0")).join("")}`;
}

/** The chrome's colour roles for a beat score; every text role is AA on its surface. */
export function chromeAirTokens(beats: DayCycleBeats): ChromeAirTokens {
  const sheet = chromePaperSheet(beats);
  return {
    "--pv-air-ink": mixHex(beats, (anchor) => anchor.air.ink),
    "--pv-text-on-air": mixHex(beats, (anchor) => anchor.air.text),
    "--pv-text-on-air-quiet": mixHex(beats, (anchor) => anchor.air.quiet),
    "--pv-label-ink": mixHex(beats, (anchor) => anchor.air.label),
    "--pv-paper": mixHex(beats, (anchor) => anchor[sheet].paper),
    "--pv-paper-ink": mixHex(beats, (anchor) => anchor[sheet].ink),
    "--pv-text-quiet": mixHex(beats, (anchor) => anchor[sheet].quiet),
    "--pv-link": mixHex(beats, (anchor) => anchor[sheet].link),
  };
}
