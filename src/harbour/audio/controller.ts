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
  private ac: AudioContext | null = null;
  private poll = 0;
  private starting = false;
  private feeder: Feeder | null = null;
  private contextTask: Promise<void> = Promise.resolve();
  private disposed = false;
  private readonly retiring = new Set<Ambience>();
  private readonly listeners = new Set<() => void>();
  private lastInput = 0;
  private readonly onInput = () => { this.lastInput = performance.now(); };
  private readonly onGesture = () => { this.disarm(); if (this.on) this.start(); };
  private readonly onVisibility = () => {
    if (this.disposed) return;
    if (document.hidden) {
      this.pausePolling();
      this.amb?.pause();
      this.music?.pause();
      for (const amb of this.retiring) void amb.dispose(false);
    } else if (this.on && this.ac) {
      this.feed();
      this.amb?.resume();
      this.music?.resume();
      this.startPolling();
    }
    const ac = this.ac;
    if (!ac) return;
    // Serialize native transitions too: a rapid hide/show must not let a late suspend win over resume.
    this.contextTask = this.contextTask.then(async () => {
      if (this.disposed || this.ac !== ac) return;
      if (document.hidden) await ac.suspend();
      else if (this.on) await ac.resume();
    }).catch(() => undefined);
  };

  constructor(private readonly ctx: EngineContext) {
    if (this.on) this.arm();
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  get on(): boolean { return this.mode !== "off"; }
  get playing(): boolean { return !!this.amb; }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private emit(): void { for (const fn of this.listeners) fn(); }

  toggle(): void { this.setMode(this.on ? "off" : this.lastOn); }

  setMode(mode: SoundMode): void {
    if (this.disposed || mode === this.mode) return;
    this.mode = mode;
    if (mode !== "off") this.lastOn = mode;
    writeChoice(mode);
    if (mode === "off") this.stop();
    else { this.disarm(); this.start(); this.tune(); }
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
    if (!amb || !ac || this.music || this.musicLoading) return;
    this.musicLoading = true;
    void import("./music").then(({ Music, daySeed }) => {
      this.musicLoading = false;
      if (this.disposed || this.mode !== "music" || this.amb !== amb || this.music) return;
      this.music = new Music(ac, amb.musicIn(), daySeed(worldToday()));
      if (document.hidden) this.music.pause();
    }).catch(() => { this.musicLoading = false; });
  }

  cue(name: CueName): void { if (!document.hidden) this.amb?.cue(name); }

  /** Remembered "on": wait for the first gesture of this visit. */
  private arm(): void {
    addEventListener("pointerdown", this.onGesture, { capture: true });
    addEventListener("keydown", this.onGesture, { capture: true });
  }
  private disarm(): void {
    removeEventListener("pointerdown", this.onGesture, { capture: true });
    removeEventListener("keydown", this.onGesture, { capture: true });
  }

  /** Must run inside a user gesture: the context is created and resumed synchronously here. */
  private start(): void {
    if (this.disposed || this.amb || this.starting) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ac = new Ctor({ latencyHint: "playback" });
    this.contextTask = (document.hidden ? ac.suspend() : ac.resume()).catch(() => undefined);
    this.ac = ac;
    this.starting = true;
    void Promise.all([import("./ambience"), import("./feed")]).then(([{ Ambience }, { Feeder }]) => {
      if (this.ac !== ac) return;
      this.starting = false;
      if (this.disposed || !this.on) { this.stop(); return; }
      this.amb = new Ambience(ac, { paused: document.hidden });
      this.feeder = new Feeder(this.ctx, this.amb);
      this.lastInput = performance.now();
      for (const t of ATTENTION_EVENTS) addEventListener(t, this.onInput, { capture: true, passive: true });
      this.feed();
      this.startPolling();
      this.tune();
      this.emit();
    }).catch(() => {
      if (this.ac !== ac) return;
      this.starting = false;
      this.ac = null;
      void ac.close().catch(() => undefined);
    });
  }

  private startPolling(): void {
    if (!this.disposed && this.on && this.amb && !document.hidden && !this.poll) {
      this.poll = window.setInterval(() => this.feed(), 250);
    }
  }

  private pausePolling(): void {
    clearInterval(this.poll); this.poll = 0;
  }

  /** World → sound (feed.ts), four times a second; the music hears only the light and the weather. */
  private feed(): void {
    if (!this.amb || this.disposed || document.hidden) return;
    const i = this.feeder?.feed((performance.now() - this.lastInput) / 1000);
    if (i) this.music?.set({ night: i.night ?? 0, storm: i.storm ?? 0, rain: i.rain ?? 0, attention: i.attention ?? 1 });
  }

  stop(): void {
    this.pausePolling();
    for (const t of ATTENTION_EVENTS) removeEventListener(t, this.onInput, { capture: true });
    this.feeder?.dispose(); this.feeder = null;
    const amb = this.amb, ac = this.ac, music = this.music;
    this.amb = null; this.ac = null; this.music = null;
    this.starting = false;
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
  let c = ctx.services.get("sound") as SoundController | undefined;
  if (!c) { c = new Controller(ctx); ctx.services.set("sound", c); }
  return c;
}
