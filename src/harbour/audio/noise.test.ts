import { describe, expect, it, vi } from "vitest";
import { makeRng } from "./dsp";
import { fillNoise } from "./noise";

function buffer(length: number, sr: number): AudioBuffer {
  const channels = [new Float32Array(length), new Float32Array(length)];
  return {
    length, sampleRate: sr, numberOfChannels: 2,
    getChannelData: (ch: number) => channels[ch],
    copyToChannel: vi.fn((pcm: Float32Array, ch: number, offset = 0) => channels[ch].set(pcm, offset)),
  } as unknown as AudioBuffer;
}

describe("incremental noise beds", () => {
  it.each(["white", "pink"] as const)("preserves %s samples and seams while bounding generation and copy chunks", (color) => {
    const sr = 48000, n = Math.floor(sr * 9.3), actual = buffer(n, sr);
    const rnd = makeRng(7), job = fillNoise(actual, color, rnd);
    let slices = 0;
    while (!job.next().done) slices++;
    expect(slices).toBeGreaterThan(200);
    expect(vi.mocked(actual.copyToChannel).mock.calls.every(([pcm]) => pcm.length <= 6144)).toBe(true);
    const reference = makeRng(7);
    for (let ch = 0; ch < 2; ch++) {
      const d = new Float32Array(n);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < n; i++) {
        const w = reference() * 2 - 1;
        if (color === "white") d[i] = w * 0.5;
        else {
          b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
        }
      }
      const f = Math.min(sr >> 1, n >> 3);
      for (let i = 0; i < f; i++) {
        const a = (i / f) * Math.PI * 0.5;
        d[n - f + i] = d[n - f + i] * Math.cos(a) + d[i] * Math.sin(a);
      }
      expect(actual.getChannelData(ch)).toEqual(d);
    }
  });

  it.each([44100, 48000, 96000])("reserves noise draws without changing the event stream at %s Hz", (sr) => {
    const skip = 2 + 2 * (Math.floor(sr * 8.7) + Math.floor(sr * 9.3));
    const original = makeRng(7), reserved = makeRng(7, skip);
    for (let i = 0; i < skip; i++) original();
    expect(Array.from({ length: 10 }, original)).toEqual(Array.from({ length: 10 }, reserved));
  });
});
