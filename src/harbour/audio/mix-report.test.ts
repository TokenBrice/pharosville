import { describe, expect, it } from "vitest";
import { cueOverFloor, energyAbove, integrated, loudnessRange, meter, peaks, segments, windows } from "../../../scripts/audio/loudness.mjs";
import { SCENES } from "../../../scripts/audio/mix-scenes";
import { mixTargets } from "../../../scripts/audio/mix-targets.mjs";

/** Self-tests of the offline mix gate's meters (scripts/audio/loudness.mts) against EBU Tech 3341/3342 cases. */
const SR = 48000;

/** A sine of `dbfs` peak level (each channel), as segments [dbfs, seconds] back to back. */
function tones(parts: ReadonlyArray<readonly [number, number]>, hz = 1000, phase = 0): Float32Array {
  const n = parts.reduce((a, [, s]) => a + Math.round(s * SR), 0), x = new Float32Array(n);
  let i = 0;
  for (const [db, s] of parts) {
    const a = 10 ** (db / 20);
    for (const end = i + Math.round(s * SR); i < end; i++) x[i] = a * Math.sin((2 * Math.PI * hz * i) / SR + phase);
  }
  return x;
}
const stereo = (x: Float32Array) => [x, x];
const loud = (ch: Float32Array[]) => integrated(windows(segments(ch, SR), 4));

describe("offline mix gate: forced near clap", () => {
  it("renders a Danger storm over rough seas with exactly one full near strike inside the window", () => {
    const scene = SCENES["storm-near"];
    expect(scene).toBeDefined();
    expect(scene.inputs(12)).toMatchObject({ storm: 1, seaAvailable: true, sea: SCENES["storm-rough"].inputs(12).sea });
    expect(scene.lightning).toBeUndefined();
    expect(scene.log).toBe(true);
    expect(scene.strikes).toHaveLength(1);
    const strike = scene.strikes![0];
    expect(strike.km).toBeGreaterThan(0);
    expect(strike.km).toBeLessThanOrEqual(2);
    expect(strike.intensity).toBe(1);
    expect(strike.t).toBeGreaterThan(1.4);
    expect(strike.t + strike.km * 1000 / 343 + 10).toBeLessThan(scene.seconds);
  });

  it("gates the near-clap true peak at −1 dBTP and reports its integrated LU over storm", () => {
    const scenes = { storm: { integrated: -21, truePeak: -4 }, "storm-near": { integrated: -18, truePeak: -1, nearClaps: 1 } };
    expect(mixTargets(scenes)).toContainEqual({ id: "storm-near-over-storm", goal: "LU over storm (reported)", value: 3, pass: null });
    const peak = () => mixTargets(scenes).find((t) => t.id === "storm-near-true-peak");
    expect(peak()?.pass).toBe(true);
    scenes["storm-near"].truePeak = -0.9;
    expect(peak()?.pass).toBe(false);
    scenes["storm-near"].truePeak = -0.99;
    expect(peak()?.pass).toBe(false);
    expect(mixTargets(scenes).find((t) => t.id === "storm-near-clap")?.pass).toBe(true);
    scenes["storm-near"].nearClaps = 0;
    expect(mixTargets(scenes).find((t) => t.id === "storm-near-clap")?.pass).toBe(false);
    expect(mixTargets({ "storm-near": { integrated: -18, truePeak: null, nearClaps: 1 } }).find((t) => t.id === "storm-near-true-peak")?.pass).toBe(false);
  });

  it("preserves the existing scene targets, including failed silent storm and music renders", () => {
    const targets = mixTargets({
      calm: { integrated: -26, truePeak: -1 }, storm: { integrated: -20, truePeak: -1 },
      "music-alone": { integrated: -32, truePeak: -1 }, "breath-12": { integrated: -36, truePeak: -1, energyAbove250: 0.6, duty: 0.85 },
    });
    expect(targets).toHaveLength(9);
    expect(targets.every((t) => t.pass === true)).toBe(true);
    const silent = mixTargets({ calm: { integrated: -26, truePeak: -1 }, storm: { integrated: null, truePeak: null }, "music-alone": { integrated: null, truePeak: null } });
    expect(silent.find((t) => t.id === "storm-over-calm")?.pass).toBe(false);
    expect(silent.find((t) => t.id === "music-under-calm")?.pass).toBe(false);
  });
});

describe("offline mix gate: v1.8.0 targets (S1, S4)", () => {
  it("gates both storms at once at calm + 7 LU", () => {
    const over = (storm: number) => mixTargets({ calm: { integrated: -26, truePeak: -10 }, "storm-rough": { integrated: storm, truePeak: -3 } })
      .find((t) => t.id === "storm-rough-over-calm");
    expect(over(-19)).toEqual({ id: "storm-rough-over-calm", goal: "both storms at once ≤ calm + 7 LU", value: 7, pass: true });
    expect(over(-18.9)?.pass).toBe(false);
  });

  it("gates the stale foghorn at +8 LU over the stale floor, and fails a stale render without a horn", () => {
    const horn = (hornOverFloor: number | null) => mixTargets({ stale: { integrated: -31, truePeak: -14, hornOverFloor } })
      .find((t) => t.id === "stale-horn-over-floor");
    expect(horn(8)).toEqual({ id: "stale-horn-over-floor", goal: "foghorn ≤ +8 LU over the stale floor", value: 8, pass: true });
    expect(horn(8.1)?.pass).toBe(false);
    expect(horn(null)?.pass).toBe(false);
    expect(mixTargets({ calm: { integrated: -26, truePeak: -10 } }).some((t) => t.id === "stale-horn-over-floor")).toBe(false);
  });

  it("measures a cue's loudest moment over the median floor of the 3 s windows clear of every cue", () => {
    // 10 s at 100 ms: an on-ramp (−45) until 2.5 s, a floor at −33, one cue at 6 s for 3 s. The 3 s windows that
    // touch the cue read −20 and outnumber the clear ones; with the ramp's they would hold the median
    const cue = 6, span = 3, k10 = (k: number) => k / 10;
    const shortTerm = Array.from({ length: 100 }, (_, k) => (k < 25 ? -45 : k10(k) + 3 > cue && k10(k) < cue + span ? -20 : -33));
    const momentary = Array.from({ length: 100 }, (_, k) => (k10(k) >= cue && k10(k) + 0.4 <= cue + span ? (k === 70 ? -26 : -29) : -35));
    expect(cueOverFloor(momentary, shortTerm, [cue], span, 2.5)).toEqual({ floor: -33, levels: [-26], over: 7 });
    expect(cueOverFloor(momentary, shortTerm, [], span, 2.5).over).toBeNull();
  });
});

describe("offline mix gate: BS.1770-4 meters", () => {
  it("a stereo 1 kHz sine at −23 / −33 dBFS reads −23 / −33 LUFS, momentary and short-term alike (Tech 3341 #1, #2)", () => {
    for (const db of [-23, -33]) {
      const m = meter(stereo(tones([[db, 20]])), SR);
      expect(m.integrated).toBeCloseTo(db, 1);
      expect(Math.abs(m.momentaryMax - db)).toBeLessThan(0.1);
      expect(Math.abs(m.shortTermMax - db)).toBeLessThan(0.1);
    }
  });

  it("gates quiet passages: relative (−36 around −23) and absolute (−72) (Tech 3341 #3, #4, shortened)", () => {
    expect(Math.abs(loud(stereo(tones([[-36, 2], [-23, 12], [-36, 2]]))) + 23)).toBeLessThan(0.1);
    expect(Math.abs(loud(stereo(tones([[-72, 2], [-36, 2], [-23, 12], [-36, 2], [-72, 2]]))) + 23)).toBeLessThan(0.1);
    expect(loud(stereo(new Float32Array(SR * 2)))).toBe(-Infinity);
  });

  it("a full-scale 997 Hz sine in one channel reads −3.01 LUFS (the K-weighting's calibration)", () => {
    const m = meter([tones([[0, 10]], 997), new Float32Array(10 * SR)], SR);
    expect(Math.abs(m.integrated + 3.01)).toBeLessThan(0.05);
  });

  it("the loudness range of −20 then −30 dBFS is 10 LU (Tech 3342 #1)", () => {
    const x = tones([[-20, 20], [-30, 20]]);
    expect(Math.abs(loudnessRange(windows(segments(stereo(x), SR), 30)) - 10)).toBeLessThan(1);
  });

  it("the true peak finds the over between samples: a quarter-rate sine sampled at ±45° peaks 3 dB above its samples", () => {
    // faded in and out over 20 ms, so the only overs are the sine's own (an abrupt edge rings, as on any meter)
    const fade = Math.round(0.02 * SR), x = tones([[0, 1]], SR / 4, Math.PI / 4);
    for (let i = 0; i < fade; i++) { const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / fade); x[i] *= g; x[x.length - 1 - i] *= g; }
    const p = peaks(stereo(x));
    expect(p.sample).toBeCloseTo(-3.01, 1);
    expect(Math.abs(p.truePeak)).toBeLessThan(0.1);
    const q = peaks(stereo(tones([[-6, 1]], 997)));
    expect(Math.abs(q.truePeak + 6)).toBeLessThan(0.05);
    expect(q.truePeak).toBeGreaterThanOrEqual(q.sample);
  });

  it("the laptop view drops the low end but leaves the mids", () => {
    const mid = meter(stereo(tones([[-20, 5]], 1000)), SR), low = meter(stereo(tones([[-20, 5]], 100)), SR);
    expect(Math.abs(mid.laptop - mid.integrated)).toBeLessThan(0.3);
    expect(low.laptop).toBeLessThan(mid.laptop - 20);
  });

  it("measures the share of energy above a frequency", () => {
    const a = tones([[-12, 4]], 110), b = tones([[-12, 4]], 440), mix = a.map((v, i) => v + b[i]);
    expect(Math.abs(energyAbove([mix], SR, 250) - 0.5)).toBeLessThan(0.02);
    expect(energyAbove([tones([[-12, 4]], 1000)], SR, 250)).toBeGreaterThan(0.99);
    expect(energyAbove([tones([[-12, 4]], 100)], SR, 250)).toBeLessThan(0.01);
  });
});
