import { describe, expect, it, vi } from "vitest";
import { ClipBank } from "./bank";
import { SYNTHS, makeRng, renderNow, type ClipKind } from "./dsp";
import { frameDrum, lyreString } from "./music";

/** Just enough of a BaseAudioContext for the bank: buffers that keep their channels. */
export function fakeContext(): BaseAudioContext {
  return {
    currentTime: 0,
    createBuffer(channels: number, length: number, sampleRate: number) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        length, sampleRate, numberOfChannels: channels, duration: length / sampleRate,
        copyToChannel(src: Float32Array, ch: number, offset = 0) { data[ch].set(src, offset); },
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

it("retires old weather without refreshing it, retains active buffers, and rebuilds only on new demand", () => {
  const ac = fakeContext() as BaseAudioContext & { currentTime: number };
  const bank = new ClipBank(ac, 12345);
  bank.want("thunder"); bank.buildAll();
  const playing = bank.pick("thunder", makeRng(2))!, before = bank.bytes;
  ac.currentTime = 31;
  for (let n = 0; n < 16; n++) {
    bank.refresh();
    const queued = bank as unknown as { queue: Array<{ kind: ClipKind }> };
    expect(queued.queue.every(({ kind }) => kind !== "thunder")).toBe(true);
    bank.buildAll();
  }
  ac.currentTime = 121;
  bank.refresh();
  expect(bank.pick("thunder", makeRng(2))).toBeNull();
  expect(bank.bytes).toBeLessThan(before);
  expect(playing.getChannelData(0).some((value) => value !== 0)).toBe(true);
  expect(bank.want("thunder")).toBe(true);
  bank.buildAll();
  expect(bank.pick("thunder", makeRng(2))).toBeTruthy();
}, 60000);

it("bounds complete warmed-scene PCM, then releases seasonal/storm variants after a quiet transition", () => {
  const ac = fakeContext() as BaseAudioContext & { currentTime: number };
  const bank = new ClipBank(ac, 12345);
  bank.buildAll();
  const eager = bank.bytes;
  for (const kind of Object.keys(SYNTHS) as ClipKind[]) bank.want(kind);
  bank.buildAll();
  const noiseBytes = 2 * (Math.floor(48000 * 8.7) + Math.floor(48000 * 9.3)) * 4;
  const musicBytes = [50, 55, 60, 65, 70, 75].reduce((sum, midi) => sum + lyreString(midi, 16000, midi * 7919).byteLength, 0)
    + frameDrum(16000, 77).byteLength + 16000 * 2 * 4;
  expect(bank.bytes).toBeLessThan(28e6);
  expect(bank.bytes + noiseBytes + musicBytes).toBeLessThan(36e6);
  ac.currentTime = 100;
  bank.want("rain");
  ac.currentTime = 121;
  bank.refresh();
  expect(bank.pick("rain", () => 0)).toBeTruthy();
  expect(bank.pick("thunder", () => 0)).toBeNull();
  ac.currentTime = 221;
  bank.refresh();
  expect(bank.bytes).toBe(eager);
}, 60000);

it("slices native copies and preserves the exact mono conversion", () => {
  const ac = fakeContext(), create = ac.createBuffer.bind(ac), copies: number[] = [];
  vi.spyOn(ac, "createBuffer").mockImplementation((...args) => {
    const buffer = create(...args), copy = buffer.copyToChannel.bind(buffer);
    vi.spyOn(buffer, "copyToChannel").mockImplementation((pcm, channel, offset) => {
      copies.push(pcm.length); copy(pcm, channel, offset);
    });
    return buffer;
  });
  const bank = new ClipBank(ac, 12345);
  bank.buildAll();
  expect(Math.max(...copies)).toBeLessThanOrEqual(6144);
  // The first lap is the first job in FIRST (E32: the lap leads the on-ramp); its seed advances once.
  let seed = 12345;
  for (let i = 0; i < 1; i++) seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const source = renderNow(SYNTHS.lap(seed, 16000)), actual = bank.pick("lap", () => 0)!.getChannelData(0);
  const expected = Float32Array.from(source.L, (value, i) => (value + source.R[i]) * 0.5);
  expect(actual).toEqual(expected);
}, 60000);
