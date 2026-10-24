import { describe, expect, it } from "vitest";
import { ClipBank } from "./bank";

/** Just enough of a BaseAudioContext for the bank: buffers that keep their channels. */
export function fakeContext(): BaseAudioContext {
  return {
    createBuffer(channels: number, length: number, sampleRate: number) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        length, sampleRate, numberOfChannels: channels, duration: length / sampleRate,
        copyToChannel(src: Float32Array, ch: number) { data[ch].set(src); },
        getChannelData(ch: number) { return data[ch]; },
      };
    },
  } as unknown as BaseAudioContext;
}

describe("harbour sound: the clip bank's PCM diet", () => {
  it("holds at most 8 MB before any lazy kind is asked for, every clip finite and below full scale", () => {
    const bank = new ClipBank(fakeContext(), 12345);
    bank.buildAll();
    expect(bank.bytes).toBeLessThanOrEqual(8e6);
    expect(bank.bytes).toBeGreaterThan(4e6);
    for (const kind of ["shore", "lap", "reef", "crackle", "press", "halyard", "bell", "gull", "creak"] as const) {
      const b = bank.pick(kind, () => 0.5)!;
      expect(b).toBeTruthy();
      for (let c = 0; c < b.numberOfChannels; c++) {
        let peak = 0;
        for (const v of b.getChannelData(c)) { expect(Number.isFinite(v)).toBe(true); peak = Math.max(peak, Math.abs(v)); }
        expect(peak).toBeLessThan(1);
      }
    }
    // single placed sources are stored mono; the shore keeps its stereo peel
    expect(bank.pick("gull", () => 0)!.numberOfChannels).toBe(1);
    expect(bank.pick("shore", () => 0)!.numberOfChannels).toBe(2);
  }, 60000);
});
