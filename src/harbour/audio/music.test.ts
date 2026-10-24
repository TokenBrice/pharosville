import { describe, expect, it } from "vitest";
import { makeRng } from "./dsp";
import { composePhrase, daySeed, degreeToMidi, DORIAN, frameDrum, lyreString, makeMotif, musicMute, phraseGap, PHRYGIAN, sounding, MUSIC_GAIN } from "./music";

const motifsFor = (seed: number) => { const r = makeRng(seed); return [makeMotif(r), makeMotif(r), makeMotif(r)]; };

describe("harbour music (D-7): decorative, sparse, modal", () => {
  it("at least 60 % of the time is silence, by day and by night", () => {
    for (const night of [false, true]) {
      const r = makeRng(night ? 2 : 1), motifs = motifsFor(9);
      let busy = 0, total = 0;
      for (let k = 0; k < 400; k++) {
        const ev = composePhrase(r, motifs, night), s = sounding(ev), gap = phraseGap(r, s.span);
        expect(s.busy / (s.span + gap)).toBeLessThanOrEqual(0.4);
        busy += s.busy; total += s.span + gap;
      }
      expect(busy / total).toBeLessThan(0.4);
    }
  });

  it("Dorian on D by day, Phrygian on D at night", () => {
    expect(degreeToMidi(0, DORIAN)).toBe(50);
    expect(degreeToMidi(7, DORIAN)).toBe(62);
    expect(degreeToMidi(1, PHRYGIAN)).toBe(51);
    const pcs = (night: boolean) => {
      const r = makeRng(5), m = motifsFor(3), set = new Set<number>();
      for (let k = 0; k < 200; k++) for (const e of composePhrase(r, m, night)) if (e.voice !== "drum") set.add(((e.midi - 50) % 12 + 12) % 12);
      return set;
    };
    for (const pc of pcs(false)) expect(DORIAN).toContain(pc);
    for (const pc of pcs(true)) expect(PHRYGIAN).toContain(pc);
  });

  it("one piece per calendar day: the same day composes the same, another day differently", () => {
    const a = daySeed(new Date(2026, 9, 24, 9)), b = daySeed(new Date(2026, 9, 24, 21)), c = daySeed(new Date(2026, 9, 25, 9));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(JSON.stringify(motifsFor(a))).toBe(JSON.stringify(motifsFor(b)));
    expect(JSON.stringify(motifsFor(a))).not.toBe(JSON.stringify(motifsFor(c)));
  });

  it("the weather only mutes it: from a WARNING storm up, and in rain", () => {
    expect(musicMute(0, 0)).toBe(1);
    expect(musicMute(0.5, 0)).toBe(1);
    expect(musicMute(0.75, 0)).toBe(0);
    expect(musicMute(0, 0.2)).toBe(0);
  });

  it("the lyre string is in tune, decays to silence, has no DC, and stays quiet in the mix", () => {
    const sr = 16000;
    for (const midi of [50, 60, 70, 75]) {
      const x = lyreString(midi, sr, 7), f = 440 * 2 ** ((midi - 69) / 12);
      let peak = 0, mean = 0;
      for (const v of x) { expect(Number.isFinite(v)).toBe(true); peak = Math.max(peak, Math.abs(v)); mean += v / x.length; }
      expect(peak).toBeCloseTo(0.5, 5);
      expect(Math.abs(mean)).toBeLessThan(1e-3);
      expect(Math.abs(x[x.length - 1])).toBe(0);
      // pitch: the autocorrelation peak near one period, refined (within 10 cents)
      const a0 = 2000, W = 4000, ac = (lag: number) => { let s = 0; for (let i = a0; i < a0 + W; i++) s += x[i] * x[i + lag]; return s; };
      const P = sr / f; let best = 0, bl = 0;
      for (let lag = Math.floor(P * 0.9); lag <= Math.ceil(P * 1.1); lag++) { const v = ac(lag); if (v > best) { best = v; bl = lag; } }
      const y0 = ac(bl - 1), y1 = ac(bl), y2 = ac(bl + 1), lag = bl + (0.5 * (y0 - y2)) / (y0 - 2 * y1 + y2);
      expect(Math.abs(1200 * Math.log2(P / lag))).toBeLessThan(10);
      // decay: the last tenth is far below the first
      const rms = (a: number, b: number) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
      expect(rms(Math.floor(x.length * 0.9), x.length)).toBeLessThan(0.05 * rms(0, Math.floor(x.length * 0.1)));
    }
    // a note's peak after the bus and the master (0.7) stays near −28 dBFS
    expect(0.5 * MUSIC_GAIN * 0.7).toBeLessThan(10 ** (-27 / 20));
  });

  it("the frame drum is finite, sealed, and no louder than the lyre", () => {
    const x = frameDrum(16000, 3);
    let peak = 0;
    for (const v of x) { expect(Number.isFinite(v)).toBe(true); peak = Math.max(peak, Math.abs(v)); }
    expect(peak).toBeCloseTo(0.5, 5);
    expect(Math.abs(x[0])).toBe(0);
    expect(Math.abs(x[x.length - 1])).toBe(0);
  });
});
