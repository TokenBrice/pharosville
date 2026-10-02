import { describe, expect, it } from "vitest";
import { createGardenDirector, registerRitual, requestGardenBeat, type GardenRitualKind } from "./garden-director";
import {
  cancelGardenRituals,
  forceGardenRitual,
  gardenDayScore,
  gardenScoreBudgetViolations,
  gardenScoreDusk,
  gardenScoreMotionGifts,
  setGardenDayScore,
  subscribeGardenRituals,
  tickGardenScore,
  type GardenScoreEntry,
} from "./garden-score";
import { gardenSkyDayFromParts, type GardenSkyLatitude } from "./sky-almanac";

const NORTH: GardenSkyLatitude = { latitudeRad: (35 * Math.PI) / 180, southern: false };

/** A CET/CEST-like zone: daylight saving from the last Sunday of March to the last of October. */
function skyDayFor(dayOfYear: number) {
  const date = new Date(Date.UTC(2026, 0, 1 + dayOfYear));
  const month = date.getUTCMonth() + 1;
  const summer = month > 3 && month < 11;
  return {
    date,
    seed: date.toISOString().slice(0, 10),
    day: gardenSkyDayFromParts({
      year: 2026, month, day: date.getUTCDate(), utcOffsetHours: summer ? 2 : 1, dstHours: summer ? 1 : 0, latitude: NORTH,
    }),
  };
}

const PINNED = skyDayFor(268); // 2026-09-26
const hhmm = (seconds: number): string => `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}`;

describe("garden day score (W5.1)", () => {
  it("never breaks the §5.0 ceilings over a year of seeds", () => {
    const skeinMonths = new Set<number>();
    let ringDays = 0;
    for (let dayOfYear = 0; dayOfYear < 365; dayOfYear += 1) {
      const { date, seed, day } = skyDayFor(dayOfYear);
      const score = gardenDayScore({ seed, date, latitude: NORTH, day });
      expect(gardenScoreBudgetViolations(score, gardenScoreDusk(day)), seed).toEqual([]);
      // The same day always scores the same.
      expect(gardenDayScore({ seed, date, latitude: NORTH, day })).toEqual(score);
      const skein = score.find((entry) => entry.kind === "dawn-skein");
      if (skein) {
        skeinMonths.add(date.getUTCMonth() + 1);
        // First light: within twenty minutes before to forty after sunrise.
        expect(skein.startSec).toBeGreaterThanOrEqual((day.sunriseHour - 20 / 60) * 3600 - 1);
        expect(skein.startSec + skein.windowSec).toBeLessThanOrEqual((day.sunriseHour + 40 / 60) * 3600 + 1);
      }
      const rings = score.filter((entry) => entry.kind === "fish-rings");
      if (rings.length > 0) ringDays += 1;
      // The midday water stands still.
      for (const ring of rings) expect(Math.abs(ring.startSec / 3600 - day.solarNoonHour)).toBeGreaterThanOrEqual(2 - 1e-6);
    }
    // Geese in the migration kō only (autumn into late winter), never in high summer.
    expect(skeinMonths.has(10)).toBe(true);
    for (const month of [5, 6, 7, 8]) expect(skeinMonths.has(month)).toBe(false);
    expect(ringDays).toBeGreaterThan(300);
    // The island maple lets go on exactly one day of the year, in the afternoon.
    const letsGo = Array.from({ length: 365 }, (_, dayOfYear) => skyDayFor(dayOfYear))
      .map(({ date, seed, day }) => ({ seed, day, entry: gardenDayScore({ seed, date, latitude: NORTH, day }).find((entry) => entry.kind === "tree-lets-go") }))
      .filter((found) => found.entry);
    expect(letsGo).toHaveLength(1);
    expect(letsGo[0]!.entry!.startSec / 3600).toBeGreaterThanOrEqual(letsGo[0]!.day.solarNoonHour + 1.5 - 1e-6);
  });

  it("gives the pinned evening its heron and its kindling, 8+ minutes apart, around sunset", () => {
    const score = gardenDayScore({ seed: PINNED.seed, date: PINNED.date, latitude: NORTH, day: PINNED.day });
    const departs = score.find((entry) => entry.kind === "heron-departs")!;
    const kindling = score.find((entry) => entry.kind === "kindling")!;
    // Solar-relative G4 window: golden onset → blue-hour edge (17:55–19:10 on 26 Sep).
    for (const entry of [departs, kindling]) {
      expect(hhmm(entry.startSec) >= "17:55" && hhmm(entry.startSec + entry.windowSec) <= "19:10", entry.id).toBe(true);
    }
    expect(kindling.startSec - (departs.startSec + departs.windowSec + departs.holdSec)).toBeGreaterThanOrEqual(480);
    // Kindling waits for the sun to go (sunset ≈ 18:54): no lamp is lit in daylight.
    expect(hhmm(kindling.startSec) >= "18:54").toBe(true);
    // The noon hour holds at most one decorative beat.
    const noon = score.filter((entry) => entry.kind !== "crossing" && entry.startSec >= 11 * 3600 && entry.startSec < 12 * 3600);
    expect(noon.length).toBeLessThanOrEqual(1);
  });

  it("keeps the motion lattice's crossings 8 minutes clear of every foreground ritual", () => {
    const score = gardenDayScore({ seed: PINNED.seed, date: PINNED.date, latitude: NORTH, day: PINNED.day });
    const clockAtMotionZero = 17 * 3600;
    const gifts = gardenScoreMotionGifts(score, clockAtMotionZero);
    const kindling = score.find((entry) => entry.kind === "kindling")!;
    const start = kindling.startSec - clockAtMotionZero;
    expect(gifts.some((gift) => gift.requestId === kindling.id)).toBe(true);
    for (const gift of gifts.filter((entry) => entry.requestId === kindling.id)) {
      expect(gift.startSeconds < start + kindling.windowSec + kindling.holdSec + 480 && start < gift.endSeconds + 480).toBe(true);
    }
  });
});

describe("garden score driver", () => {
  const entry = (kind: GardenRitualKind, startSec: number): GardenScoreEntry => ({
    id: `${kind}:test`, kind, startSec, windowSec: 240, holdSec: 20, foreground: true,
  });

  it("starts a scored ritual inside its window, runs it to done, and never replays it", () => {
    const calls: string[] = [];
    let frames = 0;
    const unregister = registerRitual("heron-departs", {
      start: () => calls.push("start"),
      update: () => { frames += 1; return frames >= 3; },
      cancel: () => calls.push("cancel"),
    });
    const heard: string[] = [];
    const unsubscribe = subscribeGardenRituals((event) => heard.push(`${event.kind}:${event.forced}`));
    setGardenDayScore([entry("heron-departs", 18 * 3600)]);
    const director = createGardenDirector("score-driver");
    const t0 = 1_000_000;
    tickGardenScore({ director, directorSeconds: t0, clockHour: 17.99, reducedMotion: false });
    expect(calls).toEqual([]);
    for (let frame = 1; frame <= 6; frame += 1) {
      tickGardenScore({ director, directorSeconds: t0 + frame, clockHour: 18 + frame / 3600, reducedMotion: false });
    }
    expect(calls).toEqual(["start"]);
    expect(frames).toBe(3);
    expect(heard).toEqual(["heron-departs:false"]);
    expect(director.log.at(-1)?.kind).toBe("ritual");
    // Another arrival cannot take the 8 minutes after it.
    expect(requestGardenBeat(director, { kind: "arrival", foreground: true, durationSeconds: 9, priority: 20 }, t0 + 200)).toBeNull();
    // The debug seam starts it again, outside the score.
    expect(forceGardenRitual("heron-departs", t0 + 10)).toBe(true);
    expect(heard.at(-1)).toBe("heron-departs:true");
    unsubscribe();
    unregister();
    setGardenDayScore([]);
  });

  it("keeps other foreground beats 8 minutes clear of the next scored ritual", () => {
    const unregister = registerRitual("kindling", { start() {}, update: () => true, cancel() {} });
    setGardenDayScore([entry("kindling", 19 * 3600)]);
    const director = createGardenDirector("reserve");
    const t0 = 2_000_000;
    // 18:50 on the clock: the kindling is 10 minutes away.
    tickGardenScore({ director, directorSeconds: t0, clockHour: 18 + 50 / 60, reducedMotion: false });
    const arrival = { kind: "arrival", foreground: true, durationSeconds: 540, priority: 20 } as const;
    expect(requestGardenBeat(director, arrival, t0)).toBeNull();
    expect(requestGardenBeat(director, { ...arrival, durationSeconds: 60 }, t0)).not.toBeNull();
    unregister();
    setGardenDayScore([]);
  });

  it("lights the anniversary lantern with the kindling, after its stagger, at no §5.0 cost", () => {
    const score = gardenDayScore({ seed: PINNED.seed, date: PINNED.date, latitude: NORTH, day: PINNED.day, anniversaryEvening: true });
    const lantern = score.find((entry) => entry.kind === "anniversary-lantern")!;
    expect(lantern.companionOf).toBe("kindling");
    expect(gardenScoreBudgetViolations(score, gardenScoreDusk(PINNED.day))).toEqual([]);
    expect(gardenScoreBudgetViolations(score)).toEqual(gardenScoreBudgetViolations(score.filter((entry) => entry !== lantern)));
    const started: string[] = [];
    const offKindling = registerRitual("kindling", { start: () => started.push("kindling"), update: () => false, cancel() {} });
    const offLantern = registerRitual("anniversary-lantern", { start: () => started.push("lantern"), update: () => true, cancel() {} });
    try {
      setGardenDayScore(score);
      const director = createGardenDirector("anniversary");
      const t0 = 4_000_000;
      tickGardenScore({ director, directorSeconds: t0, clockHour: 19, reducedMotion: false });
      forceGardenRitual("kindling", t0);
      tickGardenScore({ director, directorSeconds: t0 + 59, clockHour: 19, reducedMotion: false });
      expect(started).toEqual(["kindling"]);
      tickGardenScore({ director, directorSeconds: t0 + 60, clockHour: 19, reducedMotion: false });
      expect(started).toEqual(["kindling", "lantern"]);
    } finally {
      cancelGardenRituals();
      offKindling();
      offLantern();
      setGardenDayScore([]);
    }
  });

  it("does not start a stagger at the parent's hold boundary", () => {
    const score = gardenDayScore({ seed: PINNED.seed, date: PINNED.date, latitude: NORTH, day: PINNED.day, anniversaryEvening: true });
    const parent = score.find((ritual) => ritual.kind === "kindling")!;
    const started: string[] = [];
    const heard: string[] = [];
    const offKindling = registerRitual("kindling", { start: () => started.push("kindling"), update: () => true, cancel() {} });
    const offLantern = registerRitual("anniversary-lantern", { start: () => started.push("lantern"), update: () => true, cancel() {} });
    const unsubscribe = subscribeGardenRituals((event) => heard.push(event.kind));
    try {
      setGardenDayScore(score);
      const director = createGardenDirector("hold-boundary-anniversary");
      const t0 = 4_500_000;
      tickGardenScore({ director, directorSeconds: t0, clockHour: parent.startSec / 3600, reducedMotion: false });
      tickGardenScore({ director, directorSeconds: t0 + parent.holdSec, clockHour: (parent.startSec + parent.holdSec) / 3600, reducedMotion: false });
      expect(started).toEqual(["kindling"]);
      expect(heard).toEqual(["kindling"]);
    } finally {
      cancelGardenRituals();
      unsubscribe();
      offKindling();
      offLantern();
      setGardenDayScore([]);
    }
  });

  it("two-hour resume skips an expired anniversary stagger", () => {
    const score = gardenDayScore({ seed: PINNED.seed, date: PINNED.date, latitude: NORTH, day: PINNED.day, anniversaryEvening: true });
    const parent = score.find((ritual) => ritual.kind === "kindling")!;
    const started: string[] = [];
    const heard: string[] = [];
    const offKindling = registerRitual("kindling", {
      start: () => started.push("kindling"), update: () => true, cancel() {},
    });
    const offLantern = registerRitual("anniversary-lantern", {
      start: () => started.push("lantern"), update: () => true, cancel() {},
    });
    const unsubscribe = subscribeGardenRituals((event) => heard.push(event.kind));
    try {
      setGardenDayScore(score);
      const director = createGardenDirector("expired-anniversary");
      const t0 = 5_000_000;
      tickGardenScore({ director, directorSeconds: t0, clockHour: parent.startSec / 3600, reducedMotion: false });
      expect(started).toEqual(["kindling"]);
      tickGardenScore({ director, directorSeconds: t0 + 7200, clockHour: (parent.startSec + 7200) / 3600, reducedMotion: false });
      expect(started).not.toContain("lantern");
      expect(heard).not.toContain("anniversary-lantern");
      setGardenDayScore(score.map((ritual) => ({ ...ritual })));
      forceGardenRitual("kindling", t0 + 7201);
      tickGardenScore({ director, directorSeconds: t0 + 7261, clockHour: (parent.startSec + 7261) / 3600, reducedMotion: false });
      expect(started).not.toContain("lantern");
      expect(heard).not.toContain("anniversary-lantern");
    } finally {
      cancelGardenRituals();
      unsubscribe();
      offKindling();
      offLantern();
      setGardenDayScore([]);
    }
  });

  it("in-window stagger starts once", () => {
    const score = gardenDayScore({ seed: PINNED.seed, date: PINNED.date, latitude: NORTH, day: PINNED.day, anniversaryEvening: true });
    const parent = score.find((ritual) => ritual.kind === "kindling")!;
    const companion = score.find((ritual) => ritual.kind === "anniversary-lantern")!;
    const started: number[] = [];
    const heard: number[] = [];
    const offKindling = registerRitual("kindling", { start() {}, update: () => true, cancel() {} });
    const offLantern = registerRitual("anniversary-lantern", { start: (t) => started.push(t), update: () => true, cancel() {} });
    const unsubscribe = subscribeGardenRituals((event) => {
      if (event.kind === "anniversary-lantern") heard.push(event.directorSeconds);
    });
    try {
      setGardenDayScore(score);
      const director = createGardenDirector("in-window-anniversary");
      const t0 = 6_000_000;
      const tick = (offset: number) => tickGardenScore({
        director, directorSeconds: t0 + offset, clockHour: (parent.startSec + offset) / 3600, reducedMotion: false,
      });
      tick(0);
      tick(companion.startSec - 1);
      expect(started).toEqual([]);
      tick(companion.startSec);
      tick(companion.startSec + 1);
      tick(parent.holdSec);
      expect(started).toEqual([t0 + companion.startSec]);
      expect(heard).toEqual(started);
    } finally {
      cancelGardenRituals();
      unsubscribe();
      offKindling();
      offLantern();
      setGardenDayScore([]);
    }
  });

  it("same-day rebuild does not replay; a next-day occurrence plays once", () => {
    const makeScore = (day: typeof PINNED) => gardenDayScore({
      seed: day.seed, date: day.date, latitude: NORTH, day: day.day, anniversaryEvening: true,
    });
    const score = makeScore(PINNED);
    const nextScore = makeScore(skyDayFor(269));
    const started: number[] = [];
    const heard: string[] = [];
    const offKindling = registerRitual("kindling", { start() {}, update: () => true, cancel() {} });
    const offLantern = registerRitual("anniversary-lantern", { start: (t) => started.push(t), update: () => true, cancel() {} });
    const unsubscribe = subscribeGardenRituals((event) => {
      if (event.kind === "anniversary-lantern") heard.push(event.id);
    });
    try {
      const t0 = 7_000_000;
      const parent = score.find((ritual) => ritual.kind === "kindling")!;
      const nextParent = nextScore.find((ritual) => ritual.kind === "kindling")!;
      const director = createGardenDirector("rebuild-anniversary");
      setGardenDayScore(score);
      tickGardenScore({ director, directorSeconds: t0, clockHour: parent.startSec / 3600, reducedMotion: false });
      setGardenDayScore(makeScore(PINNED));
      tickGardenScore({ director, directorSeconds: t0 + 60, clockHour: (parent.startSec + 60) / 3600, reducedMotion: false });
      expect(started).toEqual([t0 + 60]);
      setGardenDayScore(makeScore(PINNED));
      forceGardenRitual("kindling", t0 + 100);
      tickGardenScore({ director, directorSeconds: t0 + 160, clockHour: (parent.startSec + 160) / 3600, reducedMotion: false });
      expect(started).toEqual([t0 + 60]);
      // A newly queued old-day companion must not survive the day's replacement.
      setGardenDayScore([]);
      setGardenDayScore(score);
      forceGardenRitual("kindling", t0 + 200);
      setGardenDayScore(nextScore);
      tickGardenScore({ director: undefined, directorSeconds: t0 + 260, clockHour: 12, reducedMotion: false });
      expect(started).toEqual([t0 + 60]);
      const nextT0 = t0 + 86400;
      const nextDirector = createGardenDirector("next-day-anniversary");
      // Start inside the window, not on a floating-point hour conversion boundary.
      tickGardenScore({ director: nextDirector, directorSeconds: nextT0, clockHour: (nextParent.startSec + 1) / 3600, reducedMotion: false });
      expect(nextDirector.log.at(-1)?.subject).toBe(nextParent.id);
      tickGardenScore({ director: nextDirector, directorSeconds: nextT0 + 60, clockHour: (nextParent.startSec + 61) / 3600, reducedMotion: false });
      setGardenDayScore(makeScore(skyDayFor(269)));
      tickGardenScore({ director: nextDirector, directorSeconds: nextT0 + 61, clockHour: (nextParent.startSec + 62) / 3600, reducedMotion: false });
      expect(started).toEqual([t0 + 60, nextT0 + 60]);
      expect(heard).toEqual([`anniversary-lantern:${PINNED.seed}`, `anniversary-lantern:${skyDayFor(269).seed}`]);
    } finally {
      cancelGardenRituals();
      unsubscribe();
      offKindling();
      offLantern();
      setGardenDayScore([]);
    }
  });

  it("starts nothing under reduced motion", () => {
    let started = false;
    const unregister = registerRitual("meteor", { start: () => { started = true; }, update: () => true, cancel: () => {} });
    setGardenDayScore([entry("meteor", 3600)]);
    const director = createGardenDirector("still");
    tickGardenScore({ director, directorSeconds: 3_000_000, clockHour: 1.01, reducedMotion: true });
    expect(started).toBe(false);
    unregister();
    setGardenDayScore([]);
  });
});
