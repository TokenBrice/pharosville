import { describe, expect, it, vi } from "vitest";
import { gardenGustAtWorldPosition, writeWeatherPlan, type WeatherPlan } from "../../systems/weather";
import { createGardenBed, playBasinDrip, type BedFrame } from "./bed";
import { createGardenAudioEngine, writeGardenAcousticForeground } from "./engine";
import { createAudioGraph } from "./graph";
import { AUDIO_MASTER, createAudioMixOverrides } from "./mix";
import { audioSceneSnapshot, writeAudioSceneFrame, writeAudioSceneView } from "./scene-snapshot";

class Parameter {
  value = 0;
  setValueAtTime = vi.fn((value: number) => { this.value = value; });
  linearRampToValueAtTime = vi.fn((value: number) => { this.value = value; });
  exponentialRampToValueAtTime = vi.fn((value: number) => { this.value = value; });
  setTargetAtTime = vi.fn((value: number) => { this.value = value; });
  cancelScheduledValues = vi.fn();
}

class Node {
  gain = new Parameter();
  frequency = new Parameter();
  Q = new Parameter();
  pan = new Parameter();
  playbackRate = new Parameter();
  type = "";
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  connect = vi.fn((target: Node) => target);
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
  getFrequencyResponse = vi.fn((_frequencies: Float32Array, magnitude: Float32Array, phase: Float32Array) => {
    magnitude.fill(1);
    phase.fill(0);
  });
}

function contextFixture() {
  const nodes: Node[] = [];
  const oscillators: Node[] = [];
  const createNode = () => {
    const node = new Node();
    nodes.push(node);
    return node;
  };
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    destination: new Node(),
    createGain: createNode,
    createBiquadFilter: createNode,
    createBufferSource: createNode,
    createStereoPanner: createNode,
    createWaveShaper: createNode,
    createConvolver: createNode,
    createOscillator: () => {
      const node = createNode();
      oscillators.push(node);
      return node;
    },
    createBuffer: (channels: number, length: number, sampleRate: number) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { length, duration: length / sampleRate, sampleRate, numberOfChannels: channels, getChannelData: (channel: number) => data[channel]! };
    },
  };
  return { ctx: ctx as unknown as BaseAudioContext, nodes, oscillators };
}

function frameFixture(): BedFrame {
  return {
    at: 0, breathTime: 0, still: false, sea: 0, near: 1,
    beaconPresence: 0, beamFacing: -1, windSpeed: 0.5, gustLeft: 0, gustRight: 0,
    pineGust: 0, pinePresence: 1, pinePan: 0, basinPresence: 1, basinPan: 0,
    shelter: 1, lapOpen: true,
  };
}

const options = () => ({ music: false, overrides: createAudioMixOverrides(), firstPhraseAt: 1000, firstBorrowedAt: 1000, logTargets: true });

describe("garden acoustic foreground", () => {
  it("writes the actual eye and source coordinates and the visual solar hour/score", () => {
    const before = { ...audioSceneSnapshot };
    try {
      writeAudioSceneFrame({ timeSeconds: 321, reducedMotion: false, wallClockHour: 22, seaState: { swell: 0.12, wind: 0.4, source: { psiStress: 0.1 } } }, { night: 1, blue: 0, day: 0, dawn: 0, golden: 0 });
      writeAudioSceneView({ x: 50, y: 18, z: 60 }, 1, 0, { x: 20, z: 30 }, 40, 13, 28.75, 0, -1.45, 2.43);
      expect(audioSceneSnapshot).toMatchObject({ hour: 22, timeSeconds: 321, daylightPresence: 0, beaconPresence: 1, eyeX: 50, eyeY: 18, eyeZ: 60, basinX: 23.8, basinY: 2.43, basinZ: 36.75, pineX: 15.2, pineZ: 38.3 });
    } finally {
      Object.assign(audioSceneSnapshot, before);
    }
  });

  it("samples the canonical root gust at the visual clock, attenuating and panning real sources", () => {
    const snapshot = { ...audioSceneSnapshot, eyeX: 0, eyeY: 10, eyeZ: 0, eyeHeight: 10, targetX: 5, targetZ: 5, pineX: 4, pineZ: 5, basinX: 5, basinY: 1, basinZ: 5, hour: 15, baseWind: 0.6, psiStress: 0.2 };
    const weather: WeatherPlan = { wind: { x: 1, y: 0, speed: 0, gust: 0 }, breath: 0, stormLevel: 0, lightning: 0 };
    const out = frameFixture();
    for (const timeSeconds of [0, 590, 603, 620, 1205]) {
      writeWeatherPlan({ timeSeconds, wallClockHour: snapshot.hour, reducedMotion: false, baseWind: snapshot.baseWind, psiStress: snapshot.psiStress }, weather);
      writeGardenAcousticForeground(snapshot, weather, timeSeconds, out);
      expect(out.pineGust).toBe(gardenGustAtWorldPosition(timeSeconds, 4, 5, weather, false));
    }
    const near = out.basinPresence;
    expect(out.basinPan).toBeGreaterThan(0);
    snapshot.eyeX = 200;
    writeGardenAcousticForeground(snapshot, weather, 1205, out);
    expect(out.basinPresence).toBeLessThan(near / 10);
    expect(out.basinPan).toBeLessThan(0);
    snapshot.eyeX = Number.NaN;
    writeGardenAcousticForeground(snapshot, weather, 1205, out);
    expect(out.basinPresence).toBe(0);
    expect(out.basinPan).toBe(0);
    expect(Number.isFinite(out.shelter)).toBe(true);
  });

  it("hushes shore and pine levels with the exact visual night weight", () => {
    const fixture = contextFixture();
    const snapshot = { ...audioSceneSnapshot, reducedMotion: false, hour: 12, beaconPresence: 0, daylightPresence: 1 };
    const engine = createGardenAudioEngine(fixture.ctx, snapshot, options());
    engine.tick(0, 1, 0, 0);
    const dayPower = engine.targets!.power.sea;
    snapshot.hour = 22;
    snapshot.beaconPresence = 1;
    snapshot.daylightPresence = 0;
    engine.tick(1, 1, 0, 1);
    const nightPower = engine.targets!.power.sea - dayPower;
    expect(10 * Math.log10(nightPower / dayPower)).toBeCloseTo(AUDIO_MASTER.nightBedDb, 6);
  });

  it("is silent under reduced motion and never schedules muted lap/basin voices", () => {
    const fixture = contextFixture();
    const snapshot = { ...audioSceneSnapshot, reducedMotion: true };
    const mix = options();
    const engine = createGardenAudioEngine(fixture.ctx, snapshot, mix);
    const allocations = fixture.nodes.length;
    engine.graph.masterFade.gain.value = 1;
    engine.tick(0, 10, 0, 0);
    expect(engine.graph.masterFade.gain.value).toBe(0);
    expect(fixture.nodes).toHaveLength(allocations);
    expect(engine.playBeat("fender", 0, 0)).toBe(false);
    expect(engine.playBorrowed("harbour-work", 0, 0)).toBe(false);
    snapshot.reducedMotion = false;
    mix.overrides.muted.lap = true;
    for (let t = 0; t < 40; t += 0.25) engine.tick(t, t, 0, t);
    expect(fixture.oscillators).toHaveLength(0);
  });

  it("ties basin events to the existing shore breath, without duplicate ticks or pause backlogs", () => {
    const fixture = contextFixture();
    const bed = createGardenBed(createAudioGraph(fixture.ctx));
    const frame = frameFixture();
    const targets = vi.fn();
    for (let t = 0; t < 40; t += 0.25) {
      frame.at = t;
      frame.breathTime = t;
      bed.update(frame, targets);
    }
    expect(fixture.oscillators.length).toBeGreaterThan(0);
    const voices = fixture.oscillators.length;
    bed.update(frame, targets);
    expect(fixture.oscillators).toHaveLength(voices);
    frame.still = true;
    frame.breathTime = 10000;
    bed.update(frame, targets);
    expect(fixture.oscillators).toHaveLength(voices);
    bed.resetEvents();
    frame.still = false;
    bed.update(frame, targets);
    expect(fixture.oscillators.length - voices).toBeLessThanOrEqual(4);
  });

  it("keeps modal drips inside the six-voice ceiling and disconnects completed modes", () => {
    const fixture = contextFixture();
    const graph = createAudioGraph(fixture.ctx);
    const start = fixture.nodes.length;
    expect(playBasinDrip(graph, 0, -40, 0.2, 3)).toBe(true);
    const transient = fixture.nodes.slice(start);
    expect(fixture.oscillators).toHaveLength(3);
    for (const oscillator of fixture.oscillators) {
      expect(oscillator.stop).toHaveBeenCalledWith(0.8);
      oscillator.onended?.();
    }
    for (const node of transient) expect(node.disconnect).toHaveBeenCalledTimes(1);
    for (let voice = 1; voice < AUDIO_MASTER.eventVoiceCap; voice += 1) expect(playBasinDrip(graph, 0, -40, 0, voice)).toBe(true);
    const allocations = fixture.nodes.length;
    expect(playBasinDrip(graph, 0, -40, 0, 99)).toBe(false);
    expect(fixture.nodes).toHaveLength(allocations);
    expect(AUDIO_MASTER.ceilingDb).toBe(-6);
  });
});
