import { describe, expect, it } from "vitest";
import { SYNTHS, renderNow, rumble, shoreWash, thunder, type ClipKind } from "./dsp";

const SR = 48000;

function stats(x: Float32Array) {
  let peak = 0, ss = 0;
  for (const v of x) { peak = Math.max(peak, Math.abs(v)); ss += v * v; }
  return { peak, rms: Math.sqrt(ss / x.length) };
}

describe("harbour sound DSP", () => {
  it.each(Object.keys(SYNTHS) as ClipKind[])("%s: finite, below full scale, silent at both ends (no clicks)", (kind) => {
    for (const seed of [1, 99, 4242]) {
      const c = renderNow(SYNTHS[kind](seed, SR));
      expect(c.L.length).toBe(c.R.length);
      for (const ch of [c.L, c.R]) {
        const s = stats(ch);
        expect(Number.isFinite(s.rms)).toBe(true);
        expect(s.peak).toBeLessThan(1);
        expect(s.rms).toBeGreaterThan(1e-4);
        expect(Math.abs(ch[0])).toBeLessThan(1e-3);
        expect(Math.abs(ch[ch.length - 1])).toBeLessThan(1e-3);
      }
    }
  });

  it("is deterministic per seed and different across seeds", () => {
    const a = renderNow(shoreWash(7, SR)), b = renderNow(shoreWash(7, SR)), c = renderNow(shoreWash(8, SR));
    expect(a.L).toEqual(b.L);
    expect(a.L.length === c.L.length && a.L.every((v, i) => v === c.L[i])).toBe(false);
  });

  it("a wave has a break, a lull and a backwash: the energy is not one flat block", () => {
    const c = renderNow(shoreWash(3, SR, { size: 0.9 }));
    const win = Math.floor(0.25 * SR), env: number[] = [];
    for (let i = 0; i + win < c.L.length; i += win) {
      let ss = 0;
      for (let k = i; k < i + win; k++) ss += c.L[k] * c.L[k] + c.R[k] * c.R[k];
      env.push(Math.sqrt(ss / win));
    }
    const peak = Math.max(...env);
    // quiet before the break, loud at it, and it dies away by the end
    expect(env[0]).toBeLessThan(peak * 0.25);
    expect(env[env.length - 1]).toBeLessThan(peak * 0.25);
  });

  it("stereo is wide but mono-safe (independent noise, not a delayed copy)", () => {
    const c = renderNow(shoreWash(5, SR));
    let lr = 0, ll = 0, rr = 0;
    for (let i = 0; i < c.L.length; i++) { lr += c.L[i] * c.R[i]; ll += c.L[i] ** 2; rr += c.R[i] ** 2; }
    const corr = lr / Math.sqrt(ll * rr);
    expect(corr).toBeGreaterThan(-0.2);
    expect(corr).toBeLessThan(0.8);
  });

  /** Energy above ~1.5 kHz (first difference ≈ a highpass) vs total, over [a, b) seconds. */
  function brightness(x: Float32Array, sr: number, a: number, b: number) {
    let hi = 0, all = 0;
    for (let i = Math.max(1, Math.floor(a * sr)); i < Math.min(x.length, b * sr); i++) { const d = x[i] - x[i - 1]; hi += d * d; all += x[i] * x[i]; }
    return hi / (all + 1e-12);
  }

  it("near thunder tears first (bright), then rolls (dark); far thunder is only the low roll", () => {
    const sr = 24000, near = renderNow(thunder(11, sr)), far = renderNow(rumble(12, sr));
    expect(brightness(near.L, sr, 0, 0.4)).toBeGreaterThan(5 * brightness(near.L, sr, 2, 6));
    expect(brightness(far.L, sr, 0, far.L.length / sr)).toBeLessThan(brightness(near.L, sr, 0, 0.4) / 5);
  });
});
