import type { EngineContext } from "../engine/types";
import { worldToday } from "../model/anniversary";
import type { Ambience, CueName } from "./ambience";
import type { Feeder } from "./feed";
import type { Music } from "./music";

/**
 * The opt-in sound switch (D13). Off by default; the visitor's choice is remembered per browser.
 *
 * Autoplay: the page's Permissions-Policy denies autoplay, so the AudioContext is only ever created inside a
 * user gesture: the toggle's own click, or — when the visitor left sound on last time — their first
 * click / key press on this visit. The synth (ambience.ts) and its world reader (feed.ts) are loaded lazily on
 * that first start; the music (music.ts) only when the visitor picks it.
 */

const KEY = "harbour.sound";
/** The music's own remembered choice (D-7): off unless the visitor picked "ambient sound and music". */
const MUSIC_KEY = "harbour.music";

/** The three sound states: off → the ambience → the ambience with music. */
export type SoundMode = "off" | "ambient" | "music";
export type SoundStatus = "off" | "starting" | "playing" | "paused" | "unavailable";
export interface SoundSnapshot { readonly mode: SoundMode; readonly status: SoundStatus; readonly musicFailed?: boolean }

export interface SoundController {
  /** the visitor's choice: any sound at all */
  readonly on: boolean;
  /** the visitor's choice of the three states */
  readonly mode: SoundMode;
  /** Call from a click handler (it may create the AudioContext). */
  setMode(mode: SoundMode): void;
  /** audio is actually running (on, and started by a gesture) */
  readonly playing: boolean;
  /** Call from a click handler: off ↔ the visitor's last sound choice (the ambience unless they picked music). */
  toggle(): void;
  readonly snapshot: SoundSnapshot;
  /** Gesture-bound retry that preserves the selected mode. */
  retry(): void;
  subscribe(fn: () => void): () => void;
  /** Stop and release the audio (the choice stays). */
  stop(): void;
  /** A UI foley cue (panel open/close, ledger page): a no-op unless the sound is playing. */
  cue(name: CueName): void;
  /** Engine-owned teardown: removes listeners and releases audio immediately, without changing the choice. */
  dispose(): void;
}

/** Inputs that count as watching (pointer moves included: a hand on the mouse is attention). */
const ATTENTION_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel"] as const;


function readChoice(): SoundMode {
  try {
    if (localStorage.getItem(KEY) !== "on") return "off";
    return localStorage.getItem(MUSIC_KEY) === "on" ? "music" : "ambient";
  } catch { return "off"; }
}
/** The music's remembered choice survives "off", so the speaker turns back on to what the visitor last chose. */
function readMusic(): boolean {
  try { return localStorage.getItem(MUSIC_KEY) === "on"; } catch { return false; }
}
function writeChoice(mode: SoundMode): void {
  try {
    localStorage.setItem(KEY, mode !== "off" ? "on" : "off");
    if (mode !== "off") localStorage.setItem(MUSIC_KEY, mode === "music" ? "on" : "off");
  } catch { /* private window: not remembered */ }
}

class Controller implements SoundController {
  mode = readChoice();
  /** the last sound chosen this visit (or remembered), for the speaker's one-click toggle */
  private lastOn: SoundMode = readMusic() ? "music" : "ambient";
  private amb: Ambience | null = null;
  private music: Music | null = null;
  private musicLoading = false;
  private musicFailed = false;
  private ac: AudioContext | null = null;
  private poll = 0;
  private starting = false;
  private failed = false;
  snapshot: SoundSnapshot = { mode: this.mode, status: this.on ? "paused" : "off" };
  private feeder: Feeder | null = null;
  private contextTask: Promise<void> = Promise.resolve();
  private transition = 0;
  private disposed = false;
  private readonly retiring = new Set<Ambience>();
  private readonly listeners = new Set<() => void>();
  private lastInput = 0;
  private readonly onInput = () => { this.lastInput = performance.now(); };
  private readonly onGesture = () => { if (this.on) this.retry(); };
  private readonly onState = () => { this.reconcile(); };
  private readonly onVisibility = () => {
    if (this.disposed) return;
    this.reconcile();
    if (document.hidden) for (const amb of this.retiring) void amb.dispose(false);
    const ac = this.ac;
    if (!ac) return;
    const transition = ++this.transition;
    // Serialize native transitions: a late suspend must not defeat a newer visible session.
    this.contextTask = this.contextTask.then(async () => {
      if (this.disposed || this.ac !== ac || transition !== this.transition || ac.state === "closed") return;
      if (document.hidden) await ac.suspend();
      else if (this.on) await ac.resume();
    }).catch(() => {
      if (this.ac === ac && transition === this.transition) this.failed = true;
    }).finally(() => { if (this.ac === ac && transition === this.transition) this.reconcile(); });
  };

  constructor(private readonly ctx: EngineContext) {
    if (this.on) this.arm();
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  get on(): boolean { return this.mode !== "off"; }
  get playing(): boolean { return this.snapshot.status === "playing"; }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private emit(): void {
    const status: SoundStatus = !this.on ? "off" : this.failed || this.ac?.state === "closed" ? "unavailable"
      : this.starting ? "starting" : this.amb && this.ac?.state === "running" && !document.hidden ? "playing" : "paused";
    const musicFailed = this.mode === "music" && this.musicFailed;
    if (this.snapshot.mode === this.mode && this.snapshot.status === status && !!this.snapshot.musicFailed === musicFailed) return;
    this.snapshot = { mode: this.mode, status, ...(musicFailed ? { musicFailed: true } : {}) };
    for (const fn of this.listeners) fn();
  }

  private reconcile(): void {
    if (this.disposed) return;
    if (this.on && !this.failed && this.ac?.state === "running" && !document.hidden) {
      this.disarm();
      // Refresh event bindings while still paused: cues missed during an interruption stay silent.
      this.feed();
      this.amb?.resume();
      this.music?.resume();
      this.startPolling();
    } else {
      this.pausePolling();
      this.amb?.pause();
      this.music?.pause();
      if (this.failed && this.ac?.state === "running") {
        const ac = this.ac;
        void ac.suspend().then(() => {
          // A late failure suspension must not defeat a newer successful gesture.
          if (this.ac === ac && !this.failed && !document.hidden) this.onVisibility();
        }).catch(() => undefined);
      }
    }
    this.emit();
  }

  retry(): void {
    if (this.disposed || !this.on) return;
    const musicOnly = this.playing && this.musicFailed;
    if (this.ac?.state === "closed") this.stop();
    this.failed = false;
    this.musicFailed = false;
    if (!musicOnly) this.start();
    this.tune();
    this.emit();
  }

  toggle(): void { this.setMode(this.on ? "off" : this.lastOn); }

  setMode(mode: SoundMode): void {
    if (this.disposed) return;
    if (mode === this.mode) { if (this.on && (!this.playing || this.musicFailed)) this.retry(); return; }
    this.mode = mode;
    if (mode !== "off") this.lastOn = mode;
    writeChoice(mode);
    if (mode === "off") this.stop();
    else this.retry();
    this.emit();
  }

  /** The music follows the choice: loaded (its own lazy chunk) once the ambience runs, released when not wanted. */
  private tune(): void {
    if (this.mode !== "music" || this.disposed) {
      const m = this.music; this.music = null;
      if (m) void m.dispose(!this.disposed && !document.hidden);
      return;
    }
    const amb = this.amb, ac = this.ac;
    if (!amb || !ac || this.music || this.musicLoading || this.musicFailed) return;
    this.musicLoading = true;
    void import("./music").then(({ Music, daySeed }) => {
      this.musicLoading = false;
      const currentAmb = this.amb, currentAc = this.ac;
      if (this.disposed || this.mode !== "music" || !currentAmb || !currentAc || currentAc.state === "closed" || this.music) return;
      this.music = new Music(currentAc, currentAmb.musicIn(), daySeed(worldToday()));
      this.reconcile();
    }).catch(() => {
      this.musicLoading = false;
      if (!this.disposed && this.mode === "music") { this.musicFailed = true; this.emit(); }
    });
  }

  cue(name: CueName): void { if (this.playing) this.amb?.cue(name); }

  /** Remembered "on": wait for the first gesture of this visit. */
  private arm(): void {
    addEventListener("pointerdown", this.onGesture, { capture: true });
    addEventListener("pointerup", this.onGesture, { capture: true });
    addEventListener("click", this.onGesture, { capture: true });
    addEventListener("keydown", this.onGesture, { capture: true });
  }
  private disarm(): void {
    removeEventListener("pointerdown", this.onGesture, { capture: true });
    removeEventListener("pointerup", this.onGesture, { capture: true });
    removeEventListener("click", this.onGesture, { capture: true });
    removeEventListener("keydown", this.onGesture, { capture: true });
  }

  /** Must run inside a user gesture: the context is created and resumed synchronously here. */
  private start(): void {
    if (this.disposed) return;
    if (this.ac) { this.resumeContext(this.ac); return; }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    let ac: AudioContext;
    try {
      if (!Ctor) throw new Error("Audio unavailable");
      ac = new Ctor({ latencyHint: "playback" });
    } catch { this.failed = true; this.emit(); return; }
    this.ac = ac;
    ac.addEventListener("statechange", this.onState);
    this.starting = true;
    this.resumeContext(ac);
    void Promise.all([import("./ambience"), import("./feed")]).then(([{ Ambience }, { Feeder }]) => {
      if (this.ac !== ac) return;
      this.starting = false;
      if (this.disposed || !this.on) { this.stop(); return; }
      this.amb = new Ambience(ac, { paused: document.hidden || ac.state !== "running" || this.failed });
      this.feeder = new Feeder(this.ctx, this.amb);
      this.lastInput = performance.now();
      for (const t of ATTENTION_EVENTS) addEventListener(t, this.onInput, { capture: true, passive: true });
      this.tune();
      this.reconcile();
    }).catch(() => {
      if (this.ac !== ac) return;
      this.stop();
      this.failed = true;
      this.emit();
    });
  }

  private resumeContext(ac: AudioContext): void {
    const transition = ++this.transition;
    // Invoke before any await/import so a retry retains the trusted gesture.
    try {
      this.contextTask = (document.hidden ? ac.suspend() : ac.resume()).catch(() => {
        if (this.ac === ac && transition === this.transition) this.failed = true;
      }).finally(() => { if (this.ac === ac && transition === this.transition) this.reconcile(); });
    } catch { if (this.ac === ac && transition === this.transition) this.failed = true; }
    this.reconcile();
  }

  private startPolling(): void {
    if (!this.disposed && this.on && this.amb && this.ac?.state === "running" && !this.failed && !document.hidden && !this.poll) {
      this.poll = window.setInterval(() => this.feed(), 250);
    }
  }

  private pausePolling(): void {
    clearInterval(this.poll); this.poll = 0;
  }

  /** World → sound (feed.ts), four times a second; the music hears only the light and the weather. */
  private feed(): void {
    if (!this.amb || this.disposed || this.failed || this.ac?.state !== "running" || document.hidden) return;
    const i = this.feeder?.feed((performance.now() - this.lastInput) / 1000);
    if (i) this.music?.set({ night: i.night ?? 0, storm: i.storm ?? 0, rain: i.rain ?? 0, attention: i.attention ?? 1 });
  }

  stop(): void {
    this.transition++;
    this.disarm();
    this.pausePolling();
    for (const t of ATTENTION_EVENTS) removeEventListener(t, this.onInput, { capture: true });
    this.feeder?.dispose(); this.feeder = null;
    const amb = this.amb, ac = this.ac, music = this.music;
    this.amb = null; this.ac = null; this.music = null;
    this.starting = false;
    this.failed = false;
    this.musicFailed = false;
    ac?.removeEventListener("statechange", this.onState);
    const fade = !this.disposed && !document.hidden;
    if (music) void music.dispose(fade);
    if (amb) {
      this.retiring.add(amb);
      void amb.dispose(fade).finally(() => this.retiring.delete(amb));
    } else if (ac) void ac.close().catch(() => undefined);
    this.emit();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disarm();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.stop();
    for (const amb of this.retiring) void amb.dispose(false);
    this.listeners.clear();
    if (this.ctx.services.get("sound") === this) this.ctx.services.delete("sound");
  }
}

/** One controller per engine (kept in ctx.services as 'sound'). */
export function getSoundController(ctx: EngineContext): SoundController {
  let c = ctx.services.get("sound");
  if (!c) { c = new Controller(ctx); ctx.services.set("sound", c); }
  return c;
}
