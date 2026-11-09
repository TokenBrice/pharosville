// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineContext } from "../engine/types";
import type { SoundController } from "./controller";

const harness = vi.hoisted(() => ({
  ready: Promise.resolve(), loading: false,
  Ambience: vi.fn(class {
    constructor(readonly ac: AudioContext) {}
    pause = vi.fn(); resume = vi.fn(); dispose = vi.fn(async () => {});
    musicIn = vi.fn(() => ({})); cue = vi.fn();
  }),
  Music: vi.fn(class {
    constructor(readonly ac: AudioContext, readonly destination: unknown) {}
    pause = vi.fn(); resume = vi.fn(); dispose = vi.fn(async () => {}); set = vi.fn();
  }),
  Feeder: vi.fn(class { feed = vi.fn(); dispose = vi.fn(); }),
}));
vi.mock("./ambience", () => ({ Ambience: harness.Ambience }));
vi.mock("./feed", () => ({ Feeder: harness.Feeder }));


class Context extends EventTarget {
  static instances: Context[] = [];
  state = "suspended";
  resume = vi.fn(async () => this.change("running"));
  suspend = vi.fn(async () => this.change("suspended"));
  close = vi.fn(async () => this.change("closed"));
  constructor() { super(); Context.instances.push(this); }
  change(state: string): void { this.state = state; this.dispatchEvent(new Event("statechange")); }
}

let ctl: SoundController;
async function controller(): Promise<SoundController> {
  const { getSoundController } = await import("./controller");
  ctl = getSoundController({ services: new Map() } as unknown as EngineContext);
  return ctl;
}

beforeEach(() => {
  vi.resetModules();
  vi.doMock("./music", async () => {
    harness.loading = true;
    await harness.ready;
    return { Music: harness.Music, daySeed: () => 7 };
  });
  vi.clearAllMocks();
  localStorage.clear();
  harness.ready = Promise.resolve(); harness.loading = false;
  Context.instances = [];
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.stubGlobal("AudioContext", Context);
});
afterEach(() => { ctl?.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("sound recovery follows the current opted-in owner", () => {
  it.each(["interrupted", "suspended"])("reports %s honestly and resumes the same context synchronously from a retry", async (state) => {
    const ctl = await controller(), changed = vi.fn();
    ctl.subscribe(changed);
    ctl.setMode("ambient");
    expect(Context.instances).toHaveLength(1);
    expect(Context.instances[0].resume).toHaveBeenCalledOnce();
    expect(ctl.snapshot.status).toBe("starting");
    await vi.dynamicImportSettled();
    const ac = Context.instances[0], amb = harness.Ambience.mock.results[0].value;
    expect(ctl.playing).toBe(true);
    const playing = ctl.snapshot;
    ac.change("running");
    expect(ctl.snapshot).toBe(playing);
    ac.change(state);
    expect(ctl.snapshot).toEqual({ mode: "ambient", status: "paused" });
    expect(ctl.playing).toBe(false);
    expect(amb.pause).toHaveBeenCalled();
    ctl.cue("open");
    expect(amb.cue).not.toHaveBeenCalled();
    const paused = ctl.snapshot, calls = changed.mock.calls.length;
    ac.change(state);
    expect(ctl.snapshot).toBe(paused);
    expect(changed).toHaveBeenCalledTimes(calls);
    ctl.retry();
    expect(ac.resume).toHaveBeenCalledTimes(2);
    await Promise.resolve();
    expect(ctl.playing).toBe(true);
    expect(amb.resume).toHaveBeenCalled();
    expect(harness.Ambience).toHaveBeenCalledOnce();
    expect(Context.instances).toHaveLength(1);
    expect(localStorage.getItem("harbour.sound")).toBe("on");
  });

  it("exposes a rejected resume and retries the existing session without changing preference", async () => {
    const ctl = await controller();
    ctl.setMode("ambient");
    await vi.dynamicImportSettled();
    const ac = Context.instances[0];
    ac.change("interrupted");
    ac.resume.mockRejectedValueOnce(new Error("gesture needed"));
    ctl.retry();
    await vi.dynamicImportSettled();
    expect(ctl.snapshot).toEqual({ mode: "ambient", status: "unavailable" });
    ctl.setMode("ambient");
    expect(ac.resume).toHaveBeenCalledTimes(3);
    await vi.dynamicImportSettled();
    expect(ctl.playing).toBe(true);
    expect(Context.instances).toHaveLength(1);
  });

  it("handles construction failure visibly and recreates a closed context only on a gesture", async () => {
    vi.stubGlobal("AudioContext", class { constructor() { throw new Error("device unavailable"); } });
    const ctl = await controller();
    expect(() => ctl.toggle()).not.toThrow();
    expect(ctl.snapshot).toEqual({ mode: "ambient", status: "unavailable" });
    vi.stubGlobal("AudioContext", Context);
    ctl.retry();
    await vi.dynamicImportSettled();
    const old = Context.instances[0], amb = harness.Ambience.mock.results[0].value;
    old.change("closed");
    expect(ctl.snapshot.status).toBe("unavailable");
    expect(Context.instances).toHaveLength(1);
    ctl.retry();
    expect(Context.instances).toHaveLength(2);
    await vi.dynamicImportSettled();
    expect(amb.dispose).toHaveBeenCalledOnce();
    expect(ctl.playing).toBe(true);
    const snapshot = ctl.snapshot;
    old.change("interrupted");
    expect(ctl.snapshot).toBe(snapshot);
  });

  it("reports unsupported audio and an initial resume failure without losing the chosen mode", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const ctl = await controller();
    ctl.toggle();
    expect(ctl.snapshot).toEqual({ mode: "ambient", status: "unavailable" });
    class RejectedContext extends Context {
      resume = vi.fn(async () => this.change("running")).mockRejectedValueOnce(new Error("unlock denied"));
    }
    vi.stubGlobal("AudioContext", RejectedContext);
    ctl.retry();
    await vi.dynamicImportSettled();
    expect(ctl.snapshot.status).toBe("unavailable");
    const amb = harness.Ambience.mock.results[0].value;
    expect(amb.pause).toHaveBeenCalled();
    ctl.retry();
    expect(Context.instances[0].resume).toHaveBeenCalledTimes(2);
    await vi.dynamicImportSettled();
    expect(ctl.playing).toBe(true);
    expect(Context.instances).toHaveLength(1);
  });

  it("ignores a rejected older resume after a newer gesture recovered the same context", async () => {
    const ctl = await controller();
    ctl.toggle();
    await vi.dynamicImportSettled();
    const ac = Context.instances[0];
    ac.change("interrupted");
    let reject: (reason: Error) => void = () => {};
    ac.resume.mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; }));
    ctl.retry();
    ctl.retry();
    await vi.dynamicImportSettled();
    expect(ctl.playing).toBe(true);
    reject(new Error("superseded unlock"));
    await vi.dynamicImportSettled();
    expect(ctl.snapshot).toEqual({ mode: "ambient", status: "playing" });
    expect(Context.instances).toHaveLength(1);
  });

  it("a late resume rejection cannot poison a newer session", async () => {
    const ctl = await controller();
    ctl.toggle();
    await vi.dynamicImportSettled();
    let reject: (reason: Error) => void = () => {};
    Context.instances[0].resume.mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; }));
    ctl.retry();
    ctl.setMode("off");
    ctl.setMode("ambient");
    await vi.dynamicImportSettled();
    reject(new Error("obsolete"));
    await vi.dynamicImportSettled();
    expect(ctl.snapshot).toEqual({ mode: "ambient", status: "playing" });
  });

  it.each(["music", "off", "dispose"])("reconciles a deferred music import after off/on, ending in %s", async (finish) => {
    let resolve: () => void = () => {};
    harness.ready = new Promise<void>((done) => { resolve = done; });
    const ctl = await controller();
    ctl.setMode("ambient");
    await vi.dynamicImportSettled();
    ctl.setMode("music");
    await vi.waitFor(() => expect(harness.loading).toBe(true));
    ctl.setMode("off");
    ctl.setMode("music");
    await vi.waitFor(() => expect(harness.Ambience).toHaveBeenCalledTimes(2));
    const current = Context.instances[1];
    if (finish === "dispose") ctl.dispose();
    else if (finish === "off") ctl.setMode("off");
    resolve();
    await vi.dynamicImportSettled();
    if (finish === "music") {
      expect(harness.Music).toHaveBeenCalledOnce();
      expect(harness.Music.mock.calls[0][0]).toBe(current);
      expect(ctl.snapshot).toEqual({ mode: "music", status: "playing" });
      ctl.setMode("music");
      expect(harness.Music).toHaveBeenCalledOnce();
    } else {
      expect(harness.Music).not.toHaveBeenCalled();
      expect(ctl.playing).toBe(false);
    }
    expect(Context.instances).toHaveLength(2);
  });
});
