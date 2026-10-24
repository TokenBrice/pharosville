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
  /** Call from a click handler. */
  toggle(): void;
  subscribe(fn: () => void): () => void;
  /** Stop and release the audio (the choice stays). */
  stop(): void;
  /** A UI foley cue (panel open/close, ledger page): a no-op unless the sound is playing. */
  cue(name: CueName): void;
}

/** Inputs that count as watching (pointer moves included: a hand on the mouse is attention). */
const ATTENTION_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel"] as const;


function readChoice(): SoundMode {
  try {
    if (localStorage.getItem(KEY) !== "on") return "off";
    return localStorage.getItem(MUSIC_KEY) === "on" ? "music" : "ambient";
  } catch { return "off"; }
}
function writeChoice(mode: SoundMode): void {
  try {
    localStorage.setItem(KEY, mode !== "off" ? "on" : "off");
    localStorage.setItem(MUSIC_KEY, mode === "music" ? "on" : "off");
  } catch { /* private window: not remembered */ }
}

class Controller implements SoundController {
  mode = readChoice();
  private amb: Ambience | null = null;
  private music: Music | null = null;
  private musicLoading = false;
  private ac: AudioContext | null = null;
  private poll = 0;
  private starting = false;
  private feeder: Feeder | null = null;
  private readonly listeners = new Set<() => void>();
  private lastInput = 0;
  private readonly onInput = () => { this.lastInput = performance.now(); };
  private readonly onGesture = () => { this.disarm(); if (this.on) this.start(); };
  private readonly onVisibility = () => {
    if (!this.ac) return;
    if (document.hidden) void this.ac.suspend(); else if (this.on) void this.ac.resume();
  };

  constructor(private readonly ctx: EngineContext) {
    if (this.on) this.arm();
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  get on(): boolean { return this.mode !== "off"; }
  get playing(): boolean { return !!this.amb; }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private emit(): void { for (const fn of this.listeners) fn(); }

  toggle(): void { this.setMode(this.on ? "off" : "ambient"); }

  setMode(mode: SoundMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    writeChoice(mode);
    if (mode === "off") this.stop();
    else { this.disarm(); this.start(); this.tune(); }
    this.emit();
  }

  /** The music follows the choice: loaded (its own lazy chunk) once the ambience runs, released when not wanted. */
  private tune(): void {
    if (this.mode !== "music") {
      const m = this.music; this.music = null;
      if (m) void m.dispose();
      return;
    }
    const amb = this.amb, ac = this.ac;
    if (!amb || !ac || this.music || this.musicLoading) return;
    this.musicLoading = true;
    void import("./music").then(({ Music, daySeed }) => {
      this.musicLoading = false;
      if (this.mode !== "music" || this.amb !== amb || this.music) return;
      this.music = new Music(ac, amb.musicIn(), daySeed(worldToday()));
    }).catch(() => { this.musicLoading = false; });
  }

  cue(name: CueName): void { this.amb?.cue(name); }

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
    if (this.amb || this.starting) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ac = new Ctor({ latencyHint: "playback" });
    void ac.resume();
    this.ac = ac;
    this.starting = true;
    void Promise.all([import("./ambience"), import("./feed")]).then(([{ Ambience }, { Feeder }]) => {
      this.starting = false;
      if (!this.on || this.ac !== ac) { void ac.close(); return; }
      this.amb = new Ambience(ac);
      this.feeder = new Feeder(this.ctx, this.amb);
      this.lastInput = performance.now();
      for (const t of ATTENTION_EVENTS) addEventListener(t, this.onInput, { capture: true, passive: true });
      this.feed();
      this.poll = window.setInterval(() => this.feed(), 250);
      this.tune();
      this.emit();
    }).catch(() => { this.starting = false; });
  }

  /** World → sound (feed.ts), four times a second; the music hears only the light and the weather. */
  private feed(): void {
    const i = this.feeder?.feed((performance.now() - this.lastInput) / 1000);
    if (i) this.music?.set({ night: i.night ?? 0, storm: i.storm ?? 0, rain: i.rain ?? 0, attention: i.attention ?? 1 });
  }

  stop(): void {
    clearInterval(this.poll);
    for (const t of ATTENTION_EVENTS) removeEventListener(t, this.onInput, { capture: true });
    this.feeder?.dispose(); this.feeder = null;
    const amb = this.amb, ac = this.ac, music = this.music;
    this.amb = null; this.ac = null; this.music = null;
    if (music) void music.dispose();
    if (amb) void amb.dispose(); else if (ac) void ac.close().catch(() => undefined);
    this.emit();
  }
}

/** One controller per engine (kept in ctx.services as 'sound'). */
export function getSoundController(ctx: EngineContext): SoundController {
  let c = ctx.services.get("sound") as SoundController | undefined;
  if (!c) { c = new Controller(ctx); ctx.services.set("sound", c); }
  return c;
}
