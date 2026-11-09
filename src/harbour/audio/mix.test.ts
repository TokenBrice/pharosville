// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineContext } from "../engine/types";
import { Ambience, BREATH, BREATH_SEC, HORN_GAIN, ONRAMP, ONRAMP_FLOOR, POCKET, STACK_DB, type AmbienceInputs } from "./ambience";
import { ClipBank } from "./bank";
import { makeRng, type ClipKind } from "./dsp";
import { Feeder } from "./feed";
import { composePhrase, makeMotif, Music, MUSIC_GAIN } from "./music";

/**
 * Lamplighter's mix (E31–E34) at the Web Audio boundary: the graph's shape and automation, the scheduler's
 * composed arrival, the Pharos's breath and the music's pocket. The loudness itself is measured offline, on the
 * real graph, by scripts/audio/mix-report.mjs (meters self-tested in mix-report.test.ts).
 */

class Param {
  value = 0;
  setValueAtTime = vi.fn(); linearRampToValueAtTime = vi.fn(); exponentialRampToValueAtTime = vi.fn();
  setTargetAtTime = vi.fn(); cancelScheduledValues = vi.fn();
}
class Node {
  readonly to: Node[] = [];
  gain = new Param(); frequency = new Param(); Q = new Param(); detune = new Param(); pan = new Param(); playbackRate = new Param();
  threshold = new Param(); knee = new Param(); ratio = new Param(); attack = new Param(); release = new Param(); delayTime = new Param();
  type = ""; curve: Float32Array | null = null; buffer: unknown = null; loop = false;
  disconnect = vi.fn(); start = vi.fn(); stop = vi.fn();
  constructor(readonly kind: string) {}
  connect<T>(n: T): T { this.to.push(n as unknown as Node); return n; }
}
/** Just enough of a context: every node it makes is kept, with its connections and automation. */
class Ctx {
  sampleRate = 100;
  currentTime = 0;
  state = "running";
  readonly nodes: Node[] = [];
  readonly destination = new Node("destination");
  private readonly make = (kind: string) => () => { const n = new Node(kind); this.nodes.push(n); return n; };
  createGain = this.make("gain"); createBiquadFilter = this.make("biquad"); createStereoPanner = this.make("panner");
  createDynamicsCompressor = this.make("compressor"); createWaveShaper = this.make("shaper"); createDelay = this.make("delay");
  createOscillator = this.make("oscillator"); createBufferSource = this.make("source");
  createBuffer(channels: number, length: number, sampleRate: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      length, sampleRate, numberOfChannels: channels, duration: length / sampleRate,
      copyToChannel: (pcm: Float32Array, ch: number, offset = 0) => data[ch].set(pcm, offset), getChannelData: (ch: number) => data[ch],
    };
  }
  resume = vi.fn(async () => undefined); suspend = vi.fn(async () => undefined); close = vi.fn(async () => undefined);
}
interface Graph {
  out: Node; pocket: Node; duck: Node; stack: Node; bedGain: Node; windLow: Node; howlBus: Node;
  shoreBus: Node; reefBus: Node; lapBus: Node; thunderBus: Node; hornBus: Node;
  next: { wave: number; lap: number; gull: number };
  rnd(): number;
  play(kind: ClipKind, at: number, to: unknown, level: number, pan?: number, rate?: number): boolean;
}

const made: Ambience[] = [];
function ambience(inputs: Partial<AmbienceInputs> = {}) {
  const ac = new Ctx(), amb = new Ambience(ac as unknown as BaseAudioContext, { seed: 7 });
  made.push(amb);
  const g = amb as unknown as Graph;
  vi.spyOn(g, "rnd").mockReturnValue(0.5);
  amb.set(inputs);
  return { ac, amb, g };
}
/** Step the scheduler every 120 ms of audio time up to `until` s. */
function run(ac: Ctx, amb: Ambience, from: number, until: number): void {
  for (let t = from; t < until; t += 0.12) { ac.currentTime = t; amb.step(); }
}

describe("harbour sound mix (E31–E34)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", vi.fn(() => 1));
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    // the scheduler's tests never synthesise a clip (DSP and the bank have their own suites)
    vi.spyOn(ClipBank.prototype, "work").mockReturnValue(true);
  });
  afterEach(async () => {
    for (const a of made.splice(0)) await a.dispose(false);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("E31: ends the master in the glue, a 20:1 ceiling at −6 dB (2 ms), then the safety clip", () => {
    const { ac } = ambience();
    const [glue, ceiling, ...more] = ac.nodes.filter((n) => n.kind === "compressor");
    expect(more).toHaveLength(0);
    expect(ceiling).toMatchObject({ threshold: { value: -6 }, knee: { value: 0 }, ratio: { value: 20 }, attack: { value: 0.002 } });
    const shaper = ac.nodes.find((n) => n.kind === "shaper")!;
    expect(glue.to).toHaveLength(1);
    expect(glue.to[0]).toBe(ceiling);
    expect(ceiling.to).toHaveLength(1);
    expect(ceiling.to[0]).toBe(shaper);
    expect(shaper.to[0]).toBe(ac.destination);
  });

  it("E31: re-voices the storm: rain hiss in a 4 kHz band under a 9 kHz lowpass, spray in a 3 kHz band, a lighter low wind and howl", () => {
    const { ac, amb, g } = ambience({ wind: 1, storm: 1, gust: 1, zoom: 1, rain: 1 });
    vi.spyOn(g, "play").mockReturnValue(true);
    run(ac, amb, 1, 1.1);
    const biquads = ac.nodes.filter((n) => n.kind === "biquad");
    const hiss = biquads.find((b) => b.type === "bandpass" && b.frequency.value === 4000)!;
    expect(hiss.to[0]).toMatchObject({ type: "lowpass", frequency: { value: 9000 } });
    expect(biquads.some((b) => b.type === "bandpass" && b.frequency.value === 3000)).toBe(true);
    expect(biquads.some((b) => b.type === "highpass" && b.frequency.value > 1000)).toBe(false);
    expect(g.windLow.gain.setTargetAtTime.mock.calls.at(-1)?.[0]).toBeCloseTo(0.35);
    expect(g.howlBus.gain.setTargetAtTime.mock.calls.at(-1)?.[0]).toBeCloseTo(0.9);
  });

  it("E32: rises dB-linearly from a finite floor to the master in 1.4 s, every level landing at once", () => {
    const { ac, amb, g } = ambience();
    vi.spyOn(g, "play").mockReturnValue(true);
    const [[floor, t0]] = g.out.gain.setValueAtTime.mock.calls, [[master, t1]] = g.out.gain.exponentialRampToValueAtTime.mock.calls;
    expect([t0, t1]).toEqual([0, ONRAMP]);
    expect(ONRAMP).toBe(1.4);
    expect(floor / master).toBeCloseTo(ONRAMP_FLOOR);
    expect(20 * Math.log10(ONRAMP_FLOOR)).toBeCloseTo(-24);
    expect(g.out.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    run(ac, amb, 0.12, 0.13);
    // the beds reach their levels within the on-ramp's first steps; later moves keep their slow time constants
    expect(g.bedGain.gain.setTargetAtTime.mock.calls[0][2]).toBeLessThanOrEqual(0.05);
  });

  it("E32: composes the arrival: a lap first, a full wash at 1.5 s, a gull near 4 s, the buoy on the second swell", () => {
    const { ac, amb, g } = ambience({ seaAvailable: true, sea: [0.1, 0.35, 0, 0.8] });
    const play = vi.spyOn(g, "play").mockReturnValue(true);
    run(ac, amb, 0.12, 14);
    const at = (k: ClipKind) => play.mock.calls.filter((c) => c[0] === k).map((c) => c[1]).sort((a, b) => a - b);
    expect(at("lap")[0]).toBeCloseTo(0.3);
    expect(at("lap")[0]).toBeLessThan(Math.min(...at("shore"), ...at("gull"), ...at("bell")));
    const wash = play.mock.calls.find((c) => c[0] === "shore")!;
    expect(wash[1]).toBeCloseTo(1.5);
    expect(wash[3]).toBeCloseTo(0.9 * 0.85);          // the full wash (its size at the top of the range, calm sea)
    expect(at("gull")[0]).toBeGreaterThanOrEqual(3.7);
    expect(at("gull")[0]).toBeLessThanOrEqual(4.3);
    const second = at("shore").filter((t) => t > wash[1] + 5)[0];
    expect(at("bell").length).toBeGreaterThan(0);
    expect(at("bell")[0]).toBeGreaterThan(second);    // never on the first swell, rung on the second
  });

  it("E32: a swell waits for its wash's clip, and a lap for its own, rather than pass unheard", () => {
    const { ac, amb, g } = ambience({ seaAvailable: true });
    let ready = false;
    const play = vi.spyOn(g, "play").mockImplementation((kind) => ready || (kind !== "shore" && kind !== "lap"));
    run(ac, amb, 0.12, 3);
    expect(g.next.wave).toBe(1.5);
    expect(g.next.lap).toBeCloseTo(0.3);
    expect(play.mock.calls.some((c) => c[0] === "bell")).toBe(false);
    ready = true;
    play.mockClear();
    run(ac, amb, 3.12, 3.2);
    expect(play.mock.calls.filter((c) => c[0] === "shore")[0][1]).toBeCloseTo(3.12);
    expect(play.mock.calls.filter((c) => c[0] === "lap").length).toBeGreaterThan(1);
    expect(g.next.wave).toBeGreaterThan(9);
  });

  it("E33: the breath is an open fifth in D (D3 A3 D4 A4), ≥ 60 % of its energy above 250 Hz, never above its envelope", () => {
    const et = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
    for (const [i, [f]] of BREATH.entries()) expect(Math.abs(1200 * Math.log2(f / et([50, 57, 62, 69][i])))).toBeLessThan(1);
    const energy = (keep: (f: number) => boolean) => BREATH.filter(([f]) => keep(f)).reduce((s, [, a]) => s + a * a, 0);
    expect(energy((f) => f > 250) / energy(() => true)).toBeGreaterThanOrEqual(0.6);
    expect(BREATH.reduce((s, [, a]) => s + a, 0)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it.each([12, 9, 6, 4, 2.5, 1.2])("E33: one breath at a time at a %s s sweep, its envelope within 0.8 of the sweep", (period) => {
    const { ac, amb } = ambience();
    const from = ac.nodes.length, breaths = () => ac.nodes.slice(from).filter((n) => n.kind === "oscillator");
    amb.beamPass(0.05, 0, period, 10);
    expect(breaths()).toHaveLength(4);
    const env = ac.nodes.slice(from).find((n) => n.kind === "gain" && n.gain.exponentialRampToValueAtTime.mock.calls.length)!;
    const len = env.gain.exponentialRampToValueAtTime.mock.calls[0][1] - 10;
    expect(len).toBeLessThanOrEqual(Math.min(BREATH_SEC, 0.8 * period) + 1e-9);
    expect(env.gain.linearRampToValueAtTime.mock.calls[0][0]).toBeCloseTo(0.05);
    // dry: the walls' slap-back would comb the held fifth
    expect(env.to[0].to).toHaveLength(1);
    expect(env.to[0].to[0].to[0]).toBe((amb as unknown as Graph).out);
    expect(env.to[0].to[0].gain.value).toBe(1);
    amb.beamPass(0.05, 0, period, 10 + 0.5 * len);
    expect(breaths()).toHaveLength(4);
    amb.beamPass(0.05, 0, period, 10 + period);
    expect(breaths()).toHaveLength(8);
  });

  it.each(["stale", "missing", "reduced", "held"] as const)("releases queued and active breaths when the beam becomes %s", (invalid) => {
    for (const time of [10.6, 11]) {
      const { ac, amb } = ambience(), w = beamWorld(12, {}, amb);
      for (const t of [10, 10.25, 10.5]) { ac.currentTime = w.clock.t = t; w.feeder.feed(0); }
      const from = ac.nodes.length;
      amb.beamPass(0.05, 0, 12, 10.75);
      const oscillator = ac.nodes.slice(from).find((n) => n.kind === "oscillator")!;
      const env = oscillator.to[0].to[0], gate = env.to[0].to[0];
      if (invalid === "missing") w.services.delete("readings");
      else if (invalid === "stale") (w.services.get("readings") as { psi: { lit: boolean } }).psi.lit = false;
      else if (invalid === "reduced") w.motion.reduced = true;
      else {
        const lh = w.services.get("lighthouse") as { sweepAngle(): number };
        const held = lh.sweepAngle(); lh.sweepAngle = () => held;
      }
      ac.currentTime = w.clock.t = time; w.feeder.feed(0);
      expect(gate.gain.setValueAtTime).toHaveBeenLastCalledWith(1, time);
      expect(gate.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, time + 0.03);
      expect(env.gain.exponentialRampToValueAtTime).toHaveBeenCalledOnce();
    }
  });

  it("releases both an active breath and the following queued breath at a fast sweep", () => {
    const { ac, amb } = ambience(), from = ac.nodes.length;
    amb.beamPass(0.05, 0, 1.2, 0);
    ac.currentTime = 0.8;
    amb.beamPass(0.05, 0, 1.2, 1.2);
    const oscillators = ac.nodes.slice(from).filter((n) => n.kind === "oscillator");
    expect(oscillators).toHaveLength(8);
    ac.currentTime = 0.85;
    amb.cancelBeam();
    for (const o of [oscillators[0], oscillators[4]]) {
      expect(o.to[0].to[0].to[0].to[0].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 0.88);
    }
  });

  it("S1: the foghorn still sounds over stale data, 12 dB under its first level (set against the stale harbour)", () => {
    const { ac, amb, g } = ambience({ fog: 1, seaAvailable: false });
    vi.spyOn(g, "play").mockReturnValue(true);
    const from = ac.nodes.length;
    run(ac, amb, 0.12, 4);
    expect(g.hornBus.gain.value).toBe(HORN_GAIN);
    expect(20 * Math.log10(HORN_GAIN / 0.26)).toBeCloseTo(-12, 0);
    expect(ac.nodes.slice(from).filter((n) => n.type === "sawtooth")).toHaveLength(3);
  });

  it("S4: both storms at once trim both storms' beds by STACK_DB × min(storm, sea state); either storm alone is untouched", () => {
    const rough: AmbienceInputs["sea"] = [0.85, 1, 1, 1.35], flat: AmbienceInputs["sea"] = [0.1, 0.35, 0, 0.8];
    const trim = (inputs: Partial<AmbienceInputs>) => {
      const { ac, amb, g } = ambience(inputs);
      vi.spyOn(g, "play").mockReturnValue(true);
      run(ac, amb, 0.12, 0.5);
      return g.stack.gain.setTargetAtTime.mock.calls.at(-1)?.[0];
    };
    expect(trim({ storm: 1, rain: 1, wind: 1, seaAvailable: true, sea: rough })).toBeCloseTo(10 ** (STACK_DB / 20));
    expect(trim({ storm: 0.5, seaAvailable: true, sea: rough })).toBeCloseTo(10 ** (STACK_DB / 40));
    expect(trim({ storm: 1, rain: 1, wind: 1, seaAvailable: true, sea: flat })).toBe(1);
    expect(trim({ storm: 0, seaAvailable: true, sea: rough })).toBe(1);
    // no sea reading: the truth rule silences the surf, so nothing stacks
    expect(trim({ storm: 1, seaAvailable: false, sea: rough })).toBe(1);
    // the trim carries the weather beds (through the duck and the pocket) and the analytical surf; never the
    // thunder, the laps, the foghorn or the music
    const { amb, g } = ambience();
    expect(g.duck.to).toEqual([g.pocket]);
    expect(g.pocket.to).toEqual([g.stack]);
    expect(g.stack.to).toEqual([g.out]);
    expect(g.shoreBus.to).toEqual([g.stack]);
    expect(g.reefBus.to).toEqual([g.stack]);
    for (const n of [g.thunderBus, g.lapBus, g.hornBus, amb.musicIn() as unknown as Node]) expect(n.to).not.toContain(g.stack);
  });

  it("S7: each overlapped stream starts its next clip where the last one's fade-out begins, at that clip's playback rate", () => {
    const stream = (inputs: Partial<AmbienceInputs>, kind: ClipKind, until: number) => {
      const { ac, amb, g } = ambience(inputs);
      vi.spyOn(g, "rnd").mockImplementation(makeRng(5));
      const play = vi.spyOn(g, "play").mockReturnValue(true);
      run(ac, amb, 0.12, until);
      return play.mock.calls.filter((c) => c[0] === kind).map((c) => ({ at: c[1], pan: c[4] ?? 0, rate: c[5] ?? 1 }));
    };
    const joined = (clips: Array<{ at: number; rate: number }>, fadeOutAt: number) => {
      expect(clips.length).toBeGreaterThan(3);
      expect(new Set(clips.map((c) => c.rate)).size).toBeGreaterThan(1);
      for (let k = 1; k < clips.length; k++) expect(clips[k].at - clips[k - 1].at).toBeCloseTo(fadeOutAt / clips[k - 1].rate, 9);
    };
    // a downpour's two streams of rain (one about the town's pan, one hard to a side), crickets, cicadas
    const rain = stream({ rain: 1, town: 0.5, townPan: 0 }, "rain", 20);
    joined(rain.filter((c) => Math.abs(c.pan) < 0.5), 3.5);
    joined(rain.filter((c) => Math.abs(c.pan) === 0.6), 3.5);
    joined(stream({ night: 1, autumn: 1, land: 0.4 }, "cricket", 20), 3.5);
    joined(stream({ summer: 1, hour: 15, trees: 0.7 }, "cicada", 25), 4.5);
  });
});

/** A lighthouse turning at `period`, a camera due south of it, and an ambience that records the breaths. */
function beamWorld(period: number, o: { lit?: boolean; readings?: boolean; held?: boolean } = {}, realAmb?: Ambience) {
  const services = new Map<string, unknown>(), clock = { t: 0 };
  services.set("lighthouse", {
    lanternPosition: { x: 0, y: 80, z: 0 }, period, lit: true,
    sweepAngle: () => (o.held ? 1 : (2 * Math.PI * clock.t) / period + 0.3),
  });
  if (o.readings !== false) services.set("readings", { psi: { lit: o.lit ?? true, reach: 0.8 }, fog: 0 });
  services.set("beam", { reach: () => 0.8 });
  const ctx = { services, rig: { distance: 500, camera: { position: { x: 0, y: 200, z: 500 } } }, uniforms: { uNight: { value: 1 } }, timeOfDay: { hour: 23, clockHour: 23 } };
  const motion = { reduced: false };
  services.set("motion", motion);
  const beamPass = vi.fn();
  const amb = realAmb ?? { ac: { get currentTime() { return clock.t; } }, set: vi.fn(), beamPass, cancelBeam: vi.fn() } as unknown as Ambience;
  return { feeder: new Feeder(ctx as unknown as EngineContext, amb), clock, beamPass, ctx, services, motion };
}
/**
 * Feed every 200–300 ms through `revolutions` sweeps; `late`: on time every 250 ms, but for one reading that
 * comes 550 ms late, 450 ms after the last one before the third crossing. Returns the crossings' times.
 */
function feedFor(w: ReturnType<typeof beamWorld>, period: number, revolutions: number, late = false): number[] {
  const R = makeRng(3), crossings: number[] = [];
  for (let k = 1; k <= revolutions; k++) crossings.push((k - 0.3 / (2 * Math.PI)) * period);
  const end = crossings.at(-1)! + 0.3 * period, times: number[] = [];
  if (late) {
    const gap = crossings[2] - 0.45;
    for (let t = 0.25; t < end; t += 0.25) if (t < gap - 0.249 || t > gap + 0.55) times.push(t);
    times.push(gap, gap + 0.55);
    times.sort((a, b) => a - b);
  } else for (let t = 0.2 + 0.1 * R(); t < end; t += 0.2 + 0.1 * R()) times.push(t);
  for (const t of times) { w.clock.t = t; w.feeder.feed(0); }
  return crossings;
}

describe("harbour sound: the Pharos's breath follows the sweep (E33)", () => {
  it.each([false, true])("does not voice a held beam when the camera moves toward it (reduced=%s)", (reduced) => {
    const w = beamWorld(4, { held: true });
    w.motion.reduced = reduced;
    for (let t = 0; t <= 1; t += 0.25) {
      const bearing = 1.4 - 0.5 * t;
      Object.assign(w.ctx.rig.camera.position, { x: 500 * Math.sin(bearing), z: 500 * Math.cos(bearing) });
      w.clock.t = t; w.feeder.feed(0);
    }
    expect(w.beamPass).not.toHaveBeenCalled();
  });

  it.each([12, 9, 4, 2.5, 1.2])("foresees each crossing of a %s s sweep once, on the audio clock", (period) => {
    const w = beamWorld(period), crossings = feedFor(w, period, 6);
    const breaths = w.beamPass.mock.calls;
    expect(breaths.map((c) => c[3])).toHaveLength(crossings.length);
    breaths.forEach((c, i) => {
      expect(c[3]).toBeCloseTo(crossings[i], 6);
      expect(c[2]).toBeCloseTo(period, 6);
      expect(c[0]).toBeGreaterThan(0);
    });
  });

  it("misses no crossing at the fastest sweep when one reading comes late", () => {
    const w = beamWorld(1.2), crossings = feedFor(w, 1.2, 8, true);
    expect(w.beamPass.mock.calls.map((c) => c[3])).toHaveLength(crossings.length);
  });

  it("is silent when the PSI reading is unavailable or stale, or no readings exist; never breathes while the beam is held", () => {
    for (const o of [{ lit: false }, { readings: false }]) {
      const w = beamWorld(4, o);
      feedFor(w, 4, 3);
      expect(w.beamPass).not.toHaveBeenCalled();
    }
    const held = beamWorld(4, { held: true });
    feedFor(held, 4, 3);
    expect(held.beamPass).not.toHaveBeenCalled();
  });
});

describe("harbour music: audible and given room (E34)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", vi.fn(() => 1));
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    vi.spyOn(ClipBank.prototype, "work").mockReturnValue(true);
  });
  afterEach(async () => {
    for (const a of made.splice(0)) await a.dispose(false);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("plays +6 dB over the first mix, the lyre an octave up (A3 to C6)", () => {
    expect(20 * Math.log10(MUSIC_GAIN / 0.1)).toBeCloseTo(6, 0);
    const r = makeRng(4), motifs = [makeMotif(r), makeMotif(r), makeMotif(r)], lyre: number[] = [];
    for (let k = 0; k < 400; k++) for (const e of composePhrase(r, motifs, k % 2 === 1)) if (e.voice === "lyre") lyre.push(e.midi);
    expect(Math.min(...lyre)).toBeGreaterThanOrEqual(57);
    expect(Math.max(...lyre)).toBeLessThanOrEqual(84);
  });

  it("opens the beds' pocket for each phrase: 2 dB down from just before it until just after it", async () => {
    const { ac, amb, g } = ambience();
    const input = amb.musicIn() as unknown as Node & { pocket(at: number, span: number): void };
    // the beds (the far sea, the weather) pass through the pocket; the music joins after it
    expect(g.bedGain.to).toContain(g.pocket);
    expect(g.duck.to).toContain(g.pocket);
    expect(g.pocket.to).toEqual([g.stack]);
    expect(g.stack.to).toEqual([g.out]);
    expect(input.to).toContain(g.out);
    const pocket = vi.spyOn(input, "pocket");
    const music = new Music(ac as unknown as BaseAudioContext, amb.musicIn(), 7);
    try {
      ac.currentTime = 30;
      vi.advanceTimersByTime(300);
      expect(pocket).toHaveBeenCalledOnce();
      const [at, span] = pocket.mock.calls[0];
      expect(at).toBeCloseTo(30.1);
      expect(span).toBeGreaterThan(0);
      // (the music schedules 0.1–0.4 s ahead: the pocket opens at once and is down by the first note's bloom)
      expect(g.pocket.gain.setTargetAtTime.mock.calls).toEqual([[POCKET, 30, 0.2], [1, at + span + 0.5, 1.5]]);
      expect(20 * Math.log10(POCKET)).toBeCloseTo(-2);
    } finally { await music.dispose(false); }
  });
});

describe("harbour sound: the clip bank's first clip (E32)", () => {
  it("synthesises a lap before anything else, so the arrival's first sound is ready first", () => {
    const bank = new ClipBank(new Ctx() as unknown as BaseAudioContext, 12345);
    while (!bank.pick("lap", () => 0)) bank.work(1);
    expect(bank.pick("shore", () => 0)).toBeNull();
  });
});
