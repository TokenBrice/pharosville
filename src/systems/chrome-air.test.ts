import { describe, expect, it } from "vitest";
import {
  CHROME_AIR_SCRIM_CORE,
  chromeAirTokens,
  chromePaperSheet,
  type ChromeAirTokenName,
  type ChromeAirTokens,
} from "./chrome-air";
import type { DayCycleBeatName, DayCycleBeats } from "./day-cycle-beats";

// Every text role the chrome paints must hold WCAG AA (≥ 4.5:1) on its own
// surface at every point of the score. The score is a partition of unity with
// at most two adjacent beats active, so sweeping each adjacent pair covers
// every minute of every date and hemisphere, the five anchors included.

type Rgb = [number, number, number];

function rgb(hex: string): Rgb {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16)) as Rgb;
}

function luminance(colour: Rgb): number {
  const [r, g, b] = colour.map((channel) => {
    const scaled = channel / 255;
    return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** The scrim core composited over a white scene: the brightest thing chrome text can sit over. */
function scrimOverWhite(tokens: ChromeAirTokens): Rgb {
  return rgb(tokens["--pv-air-ink"]).map((channel) => (
    channel * CHROME_AIR_SCRIM_CORE + 255 * (1 - CHROME_AIR_SCRIM_CORE)
  )) as Rgb;
}

const ROLES: ReadonlyArray<readonly [string, ChromeAirTokenName, (tokens: ChromeAirTokens) => Rgb]> = [
  ["caption and control text on the air", "--pv-text-on-air", scrimOverWhite],
  ["quiet text on the air", "--pv-text-on-air-quiet", scrimOverWhite],
  ["in-world names (ember after dusk) on the air", "--pv-label-ink", scrimOverWhite],
  ["card ink on paper", "--pv-paper-ink", (tokens) => rgb(tokens["--pv-paper"])],
  ["quiet ink on paper", "--pv-text-quiet", (tokens) => rgb(tokens["--pv-paper"])],
  ["link and focus ring on paper", "--pv-link", (tokens) => rgb(tokens["--pv-paper"])],
];

const BEATS: readonly DayCycleBeatName[] = ["dawn", "day", "golden", "blue", "night"];
const ADJACENT: ReadonlyArray<readonly [DayCycleBeatName, DayCycleBeatName]> = [
  ["night", "dawn"], ["dawn", "day"], ["day", "golden"], ["golden", "blue"], ["blue", "night"],
];

function score(from: DayCycleBeatName, to: DayCycleBeatName, t: number): DayCycleBeats {
  const beats: DayCycleBeats = { dawn: 0, day: 0, golden: 0, blue: 0, night: 0 };
  beats[from] = 1 - t;
  beats[to] += t;
  return beats;
}

const STEPS = 100;

describe("chrome air tokens (W6.5)", () => {
  it("keeps every text role at AA at the five beat anchors", () => {
    for (const beat of BEATS) {
      const tokens = chromeAirTokens(score(beat, beat, 0));
      for (const [role, token, surface] of ROLES) {
        expect(contrast(rgb(tokens[token]), surface(tokens)), `${beat}: ${role}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps every text role at AA through every crossfade between beats", () => {
    for (const [from, to] of ADJACENT) {
      for (let step = 0; step <= STEPS; step += 1) {
        const tokens = chromeAirTokens(score(from, to, step / STEPS));
        for (const [role, token, surface] of ROLES) {
          expect(contrast(rgb(tokens[token]), surface(tokens)), `${from}→${to} ${step}%: ${role}`)
            .toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("moves the air continuously — no crossfade step jumps a channel", () => {
    for (const [from, to] of ADJACENT) {
      for (let step = 1; step <= STEPS; step += 1) {
        const before = chromeAirTokens(score(from, to, (step - 1) / STEPS));
        const after = chromeAirTokens(score(from, to, step / STEPS));
        for (const token of ["--pv-air-ink", "--pv-text-on-air", "--pv-text-on-air-quiet", "--pv-label-ink"] as const) {
          const delta = Math.max(...rgb(before[token]).map((channel, index) => Math.abs(channel - rgb(after[token])[index]!)));
          expect(delta, `${from}→${to} ${step}%: ${token}`).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it("changes paper sheet only as blue hour deepens and as dawn comes", () => {
    const switches: string[] = [];
    for (const [from, to] of ADJACENT) {
      for (let step = 1; step <= STEPS; step += 1) {
        const before = chromePaperSheet(score(from, to, (step - 1) / STEPS));
        const after = chromePaperSheet(score(from, to, step / STEPS));
        if (before !== after) switches.push(`${from}→${to}: ${before}→${after}`);
      }
    }
    expect(switches).toEqual(["night→dawn: indigo→washi", "golden→blue: washi→indigo"]);
  });
});
