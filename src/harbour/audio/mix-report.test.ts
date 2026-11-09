import { describe, expect, it } from "vitest";
import { energyAbove, integrated, loudnessRange, meter, peaks, segments, windows } from "../../../scripts/audio/loudness.mjs";

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
