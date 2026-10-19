// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineContext } from "../engine/types";
import { Ambience } from "./ambience";
import { ClipBank } from "./bank";
import { getSoundController, type SoundController } from "./controller";

class AudioParamStub {
  value = 0;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
  setTargetAtTime = vi.fn();
  cancelScheduledValues = vi.fn();
}

class AudioNodeStub {
  gain = new AudioParamStub();
  frequency = new AudioParamStub();
  Q = new AudioParamStub();
  threshold = new AudioParamStub();
  knee = new AudioParamStub();
  ratio = new AudioParamStub();
  attack = new AudioParamStub();
  release = new AudioParamStub();
  delayTime = new AudioParamStub();
  pan = new AudioParamStub();
  playbackRate = new AudioParamStub();
  buffer: AudioBuffer | null = null;
  loop = false;
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
  connect(node: AudioNodeStub): AudioNodeStub { return node; }
}

class AudioContextStub {
  static instances: AudioContextStub[] = [];
  sampleRate = 100;
  currentTime = 0;
  state = "running";
  destination = new AudioNodeStub();
  sources: AudioNodeStub[] = [];
  resume = vi.fn(async () => { this.state = "running"; });
  suspend = vi.fn(async () => { this.state = "suspended"; });
  close = vi.fn(async () => { this.state = "closed"; });
  constructor() { AudioContextStub.instances.push(this); }
  createGain = () => new AudioNodeStub();
  createBiquadFilter = () => new AudioNodeStub();
  createStereoPanner = () => new AudioNodeStub();
  createDynamicsCompressor = () => new AudioNodeStub();
  createWaveShaper = () => new AudioNodeStub();
  createDelay = () => new AudioNodeStub();
  createOscillator = () => new AudioNodeStub();
  createBufferSource = () => {
    const source = new AudioNodeStub();
    this.sources.push(source);
    return source;
  };
  createBuffer(channels: number, length: number, sr: number): AudioBuffer {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    // Only the PCM API used by the synthesiser is modelled at this Web Audio test boundary.
    const buffer = { duration: length / sr, copyToChannel: (pcm: Float32Array, ch: number) => data[ch].set(pcm) } as AudioBuffer;
    return buffer;
  }
}

function engineContext(): EngineContext {
  // The controller reads these engine services; no renderer or world systems are needed in this test.
  const ctx = {
    services: new Map<string, unknown>(),
    rig: { distance: 300 },
    uniforms: { uNight: { value: 0 } },
    timeOfDay: { hour: 9 },
  } as unknown as EngineContext;
  return ctx;
}

function audioContext(ac: AudioContextStub): AudioContext {
  // The native graph API is supplied by the focused stub above.
  return ac as unknown as AudioContext;
}

describe("harbour sound: visibility and lifetime", () => {
  let hidden = false;
  let idleId = 0;
  let idle: Map<number, IdleRequestCallback>;
  let controllers: SoundController[];
  let ambiences: Ambience[];

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    hidden = false;
    idleId = 0;
    idle = new Map();
    controllers = [];
    ambiences = [];
    AudioContextStub.instances = [];
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    vi.stubGlobal("AudioContext", AudioContextStub);
    vi.stubGlobal("requestIdleCallback", vi.fn((cb: IdleRequestCallback) => { idle.set(++idleId, cb); return idleId; }));
    vi.stubGlobal("cancelIdleCallback", vi.fn((id: number) => { idle.delete(id); }));
    // Lifecycle tests never spend time generating actual clips (DSP has its own deterministic suite).
    vi.spyOn(ClipBank.prototype, "work").mockReturnValue(true);
  });

  afterEach(async () => {
    for (const ctl of controllers) ctl.dispose();
    for (const amb of ambiences) await amb.dispose(false);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function controller(ctx = engineContext()): SoundController {
    const ctl = getSoundController(ctx);
    controllers.push(ctl);
    return ctl;
  }

  function visibility(value: boolean): void {
    hidden = value;
    document.dispatchEvent(new Event("visibilitychange"));
  }

  it("stops both intervals and the idle pump while hidden, then resumes only once on the frozen clock", async () => {
    const ctx = engineContext(), ctl = controller(ctx);
    ctl.toggle();
    await vi.dynamicImportSettled();
    const ac = AudioContextStub.instances[0];
    const beds = ac.sources.slice();
    const oldIdle = [...idle.values()][0];
    expect(ctl.playing).toBe(true);
    expect(vi.getTimerCount()).toBe(2);
    expect(idle.size).toBe(1);

    visibility(true);
    await Promise.resolve();
    expect(ac.suspend).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(idle.size).toBe(0);
    const reads = vi.spyOn(ctx.services, "get");
    vi.advanceTimersByTime(60_000);
    oldIdle({ timeRemaining: () => 6, didTimeout: false });
    expect(reads).not.toHaveBeenCalled();
    expect(ClipBank.prototype.work).not.toHaveBeenCalled();
    expect(ac.currentTime).toBe(0);

    visibility(false);
    visibility(false);
    expect(vi.getTimerCount()).toBe(2);
    expect(idle.size).toBe(1);
    oldIdle({ timeRemaining: () => 6, didTimeout: false });
    expect(ClipBank.prototype.work).not.toHaveBeenCalled();
    expect(ac.sources).toEqual(beds);
    for (const source of beds) {
      expect(source.start).toHaveBeenCalledOnce();
      expect(source.stop).not.toHaveBeenCalled();
    }
    visibility(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(idle.size).toBe(0);
  });

  it("cancels the between-slice continuation as well as the idle callback", async () => {
    const ctl = controller();
    ctl.toggle();
    await vi.dynamicImportSettled();
    const [id, callback] = [...idle.entries()][0];
    idle.delete(id);
    callback({ timeRemaining: () => 6, didTimeout: false });
    expect(ClipBank.prototype.work).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(3);
    visibility(true);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(ClipBank.prototype.work).toHaveBeenCalledOnce();
  });

  it("preserves seeded event times and beds across a pause without replaying the hidden duration", () => {
    const uninterrupted = new AudioContextStub(), interrupted = new AudioContextStub();
    const clip = uninterrupted.createBuffer(2, 100, 100);
    vi.spyOn(ClipBank.prototype, "pick").mockReturnValue(clip);
    const a = new Ambience(audioContext(uninterrupted), { seed: 7 });
    const b = new Ambience(audioContext(interrupted), { seed: 7 });
    ambiences.push(a, b);
    for (const time of [0.12, 0.24]) {
      uninterrupted.currentTime = interrupted.currentTime = time;
      a.step(); b.step();
    }
    b.pause();
    b.resume();
    b.resume();
    for (const time of [0.36, 0.48, 0.6, 0.72, 1.2, 2.4, 4.8]) {
      uninterrupted.currentTime = interrupted.currentTime = time;
      a.step(); b.step();
    }
    expect(interrupted.sources.map((s) => s.start.mock.calls)).toEqual(uninterrupted.sources.map((s) => s.start.mock.calls));
    expect(interrupted.sources.map((s) => s.playbackRate.value)).toEqual(uninterrupted.sources.map((s) => s.playbackRate.value));
    for (const source of interrupted.sources.filter((s) => s.loop)) {
      expect(source.start).toHaveBeenCalledOnce();
      expect(source.stop).not.toHaveBeenCalled();
    }
  });

  it("keeps a late synth import paused if visibility changed during startup", async () => {
    const ctl = controller();
    ctl.toggle();
    visibility(true);
    await vi.dynamicImportSettled();
    expect(ctl.playing).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(idle.size).toBe(0);
    visibility(false);
    expect(vi.getTimerCount()).toBe(2);
    expect(idle.size).toBe(1);
  });

  it("lets resume win when a native suspend settles after the page becomes visible again", async () => {
    const ctl = controller();
    ctl.toggle();
    await vi.dynamicImportSettled();
    const ac = AudioContextStub.instances[0];
    let finishSuspend: () => void = () => { throw new Error("suspend was not requested"); };
    ac.suspend.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishSuspend = () => { ac.state = "suspended"; resolve(); };
    }));
    visibility(true);
    await Promise.resolve();
    expect(ac.suspend).toHaveBeenCalledOnce();
    visibility(false);
    expect(ac.resume).toHaveBeenCalledOnce();
    finishSuspend();
    // Drain both serialized transitions, including their await/catch continuations.
    for (let n = 0; n < 8; n++) await Promise.resolve();
    expect(ac.state).toBe("running");
    expect(ac.resume).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(2);
    expect(idle.size).toBe(1);
  });

  it("disposes listeners, weather subscription, PCM and context idempotently without changing the saved choice", async () => {
    const ctx = engineContext(), unsub = vi.fn();
    ctx.services.set("weather", { onLightning: () => unsub });
    const ctl = controller(ctx);
    ctl.toggle();
    await vi.dynamicImportSettled();
    const ac = AudioContextStub.instances[0], oldIdle = [...idle.values()][0];
    const disposeBank = vi.spyOn(ClipBank.prototype, "dispose");
    ctl.dispose();
    ctl.dispose();
    expect(unsub).toHaveBeenCalledOnce();
    expect(disposeBank).toHaveBeenCalledOnce();
    expect(ac.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(idle.size).toBe(0);
    expect(ctx.services.has("sound")).toBe(false);
    expect(localStorage.getItem("harbour.sound")).toBe("on");
    for (const source of ac.sources) expect(source.buffer).toBeNull();
    oldIdle({ timeRemaining: () => 6, didTimeout: false });
    visibility(true);
    visibility(false);
    ctl.toggle();
    expect(ac.suspend).not.toHaveBeenCalled();
    expect(ac.resume).toHaveBeenCalledOnce();
    expect(AudioContextStub.instances).toHaveLength(1);
    expect(ClipBank.prototype.work).not.toHaveBeenCalled();
  });

  it("disarms remembered-on gestures and cancels a pending start on teardown", async () => {
    localStorage.setItem("harbour.sound", "on");
    controller().dispose();
    window.dispatchEvent(new Event("pointerdown"));
    window.dispatchEvent(new Event("keydown"));
    expect(AudioContextStub.instances).toHaveLength(0);
    const ctl = controller();
    window.dispatchEvent(new Event("pointerdown"));
    expect(AudioContextStub.instances).toHaveLength(1);
    ctl.dispose();
    await vi.dynamicImportSettled();
    expect(AudioContextStub.instances[0].close).toHaveBeenCalledOnce();
    expect(ctl.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(idle.size).toBe(0);
  });

  it("retains the visible toggle-off fade but interrupts it during engine teardown", async () => {
    const ctl = controller();
    ctl.toggle();
    await vi.dynamicImportSettled();
    const ac = AudioContextStub.instances[0];
    ctl.toggle();
    expect(ac.close).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    ctl.dispose();
    await Promise.resolve();
    expect(ac.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the fallback synthesis timeout and prevents a disposed ambience from restarting", async () => {
    vi.stubGlobal("requestIdleCallback", undefined);
    const ac = new AudioContextStub(), amb = new Ambience(audioContext(ac), { seed: 7 });
    ambiences.push(amb);
    expect(vi.getTimerCount()).toBe(2);
    amb.pause();
    vi.advanceTimersByTime(10_000);
    expect(vi.getTimerCount()).toBe(0);
    expect(ClipBank.prototype.work).not.toHaveBeenCalled();
    amb.resume();
    amb.resume();
    expect(vi.getTimerCount()).toBe(2);
    const disposal = amb.dispose(false);
    expect(amb.dispose(false)).toBe(disposal);
    await disposal;
    amb.resume();
    vi.advanceTimersByTime(10_000);
    expect(ac.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(ClipBank.prototype.work).not.toHaveBeenCalled();
  });

  it("drops queued bank work on repeated disposal", () => {
    const ac = new AudioContextStub(), bank = new ClipBank(audioContext(ac), 7);
    expect(bank.pending).toBe(true);
    bank.dispose();
    bank.dispose();
    expect(bank.pending).toBe(false);
    expect(bank.pick("shore", () => 0)).toBeNull();
  });
});
