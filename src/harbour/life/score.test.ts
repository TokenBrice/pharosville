import { describe, expect, it } from "vitest";
import { hourStrikes } from "../audio/ambience";
import { cranePassage, dayOfYear, murmurationSeason, northernDay, overrideDay } from "../season/calendar";
import { CUE_S, cueAllowed, doveHour, parseScoreForce, Score, SCORE_GAP_S, shelters, type ScoreCue, type ScoreGate, type ScoreSky } from "./score";

const ALL: ScoreGate["allowed"] = () => true;
/** Run the score at 60 fps for `seconds`, the gate built per frame; returns the starts. */
function run(score: Score, seconds: number, gate: (t: number) => Omit<ScoreGate, "t"> = () => ({ moving: true, staged: false, shelter: false, allowed: ALL })) {
  const out: Array<{ cue: ScoreCue; t: number }> = [];
  for (let f = 0; f <= seconds * 60; f++) {
    const t = f / 60, c = score.step({ t, ...gate(t) });
    if (c) out.push({ cue: c, t });
  }
  return out;
}

describe("the decorative score", () => {
  it("keeps the budget: at most one rare cue per 20 minutes, never in the first 3 minutes", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const hour = run(new Score(seed), 3600);
      expect(hour.length).toBeGreaterThanOrEqual(2);              // a simulated hour with every cue allowed
      expect(hour.length).toBeLessThanOrEqual(3);
      expect(hour[0].t).toBeGreaterThanOrEqual(180);
      expect(hour[0].t).toBeLessThanOrEqual(720);
      for (let k = 1; k < hour.length; k++) expect(hour[k].t - hour[k - 1].t).toBeGreaterThanOrEqual(SCORE_GAP_S - 1e-6);
    }
  });

  it("is deterministic for a seed and varies between seeds", () => {
    const a = run(new Score(7), 3600), b = run(new Score(7), 3600);
    expect(a).toEqual(b);
    const firsts = new Set(Array.from({ length: 12 }, (_, s) => Math.round(run(new Score(s + 100), 800)[0]?.t ?? -1)));
    expect(firsts.size).toBeGreaterThan(6);
  });

  it("starts nothing under reduced motion / Still world, in Warning or Danger, or while a staged moment runs", () => {
    for (const blocked of [{ moving: false }, { shelter: true }, { staged: true }]) {
      expect(run(new Score(3), 3600, () => ({ moving: true, staged: false, shelter: false, allowed: ALL, ...blocked }))).toEqual([]);
    }
    expect(run(new Score(3), 3600, () => ({ moving: true, staged: false, shelter: false, allowed: () => false }))).toEqual([]);
  });

  it("waits out an exclusion and keeps the spacing after it (a moment on stage delays, never doubles)", () => {
    const free = run(new Score(11), 3600)[0].t;
    // a staged moment covering the first chance: the cue comes after it, once
    const late = run(new Score(11), 3600, (t) => ({ moving: true, staged: t >= free - 1 && t < free + 20, shelter: false, allowed: ALL }));
    expect(late[0].t).toBeGreaterThanOrEqual(free + 20);
    expect(late[0].t).toBeLessThan(free + 20 + 6);
    for (let k = 1; k < late.length; k++) expect(late[k].t - late[k - 1].t).toBeGreaterThanOrEqual(SCORE_GAP_S - 1e-6);
  });

  it("only picks cues the calendar allows", () => {
    const cues = run(new Score(5), 7200, () => ({ moving: true, staged: false, shelter: false, allowed: (c) => c === "murmuration" }));
    expect(cues.length).toBeGreaterThan(0);
    expect(cues.every((c) => c.cue === "murmuration")).toBe(true);
    // all three allowed: over many visits each cue is chosen
    const seen = new Set<ScoreCue>();
    for (let s = 0; s < 30; s++) for (const c of run(new Score(s), 1500)) seen.add(c.cue);
    expect([...seen].sort()).toEqual(["cranes", "murmuration", "splash"]);
  });

  it("the dev force stages one cue from 2 s and repeats it after its run, still honouring the exclusions", () => {
    const forced = run(new Score(1, "cranes"), 200);
    expect(forced[0]).toEqual({ cue: "cranes", t: 2 });
    expect(forced[1].t - forced[0].t).toBeCloseTo(CUE_S.cranes + 5, 1);
    expect(forced.every((c) => c.cue === "cranes")).toBe(true);
    expect(run(new Score(1, "cranes"), 200, () => ({ moving: true, staged: false, shelter: true, allowed: ALL }))).toEqual([]);
    expect(run(new Score(1, "cranes"), 200, () => ({ moving: false, staged: false, shelter: false, allowed: ALL }))).toEqual([]);
    // whatever the calendar (captures stage a cue at any hour)
    expect(run(new Score(1, "murmuration"), 10, () => ({ moving: true, staged: false, shelter: false, allowed: () => false }))[0]?.cue).toBe("murmuration");
    expect(parseScoreForce("splash")).toBe("splash");
    expect(parseScoreForce("swarm")).toBeNull();
    expect(parseScoreForce(null)).toBeNull();
  });

  it("shelters in Warning and Danger only (an unknown reading is not rough weather)", () => {
    expect([0, 1, 2, 3, 4].map(shelters)).toEqual([false, false, false, true, true]);
    expect(shelters(null)).toBe(false);
  });
});

describe("the score's calendar", () => {
  const sky = (o: Partial<ScoreSky>): ScoreSky => ({ nDay: 293, clock: 12, sunrise: 7, sunset: 17.5, dolphins: true, ...o });

  it("cranes pass in the real migration windows, by day, and in the southern hemisphere half a year on", () => {
    expect(cranePassage(dayOfYear(2026, 3, 10))).toBe("spring");
    expect(cranePassage(dayOfYear(2026, 10, 20))).toBe("autumn");
    expect(cranePassage(dayOfYear(2026, 7, 1))).toBeNull();
    expect(cranePassage(dayOfYear(2026, 1, 10))).toBeNull();
    // Sydney in April is the southern autumn
    expect(cranePassage(northernDay(dayOfYear(2026, 4, 20), true))).toBe("autumn");
    // the gates' ?season= days
    expect(cranePassage(overrideDay({ season: "autumn" }, 2026, false)!)).toBe("autumn");
    expect(cranePassage(overrideDay({ season: "spring" }, 2026, false)!)).toBe("spring");
    expect(cueAllowed("cranes", sky({ clock: 12 }))).toBe(true);
    expect(cueAllowed("cranes", sky({ clock: 7.5 }))).toBe(false);
    expect(cueAllowed("cranes", sky({ clock: 17 }))).toBe(false);
    expect(cueAllowed("cranes", sky({ nDay: 196 }))).toBe(false);
  });

  it("starlings murmur at winter dusk only", () => {
    expect(murmurationSeason(dayOfYear(2026, 12, 20))).toBe(true);
    expect(murmurationSeason(dayOfYear(2026, 1, 20))).toBe(true);
    expect(murmurationSeason(dayOfYear(2026, 6, 20))).toBe(false);
    const winter = overrideDay({ season: "winter" }, 2026, false)!;
    expect(cueAllowed("murmuration", sky({ nDay: winter, clock: 17.0, sunset: 17.05 }))).toBe(true);
    expect(cueAllowed("murmuration", sky({ nDay: winter, clock: 12, sunset: 17.05 }))).toBe(false);
    expect(cueAllowed("murmuration", sky({ nDay: winter, clock: 18, sunset: 17.05 }))).toBe(false);
    expect(cueAllowed("murmuration", sky({ nDay: 196, clock: 20.5, sunset: 20.6 }))).toBe(false);
  });

  it("the splash ring needs the dolphins' calm and daylight", () => {
    expect(cueAllowed("splash", sky({}))).toBe(true);
    expect(cueAllowed("splash", sky({ dolphins: false }))).toBe(false);
    expect(cueAllowed("splash", sky({ clock: 21 }))).toBe(false);
  });

  it("the doves keep the hour bell's hours (audio/ambience.ts hourStrikes)", () => {
    for (let h = 0; h < 24; h++) expect(doveHour(h)).toBe(hourStrikes(h) > 0);
  });
});
