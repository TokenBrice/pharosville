import type { EngineContext } from "../engine/types";
import type { HarbourLayout } from "../layout/types";
import type { Ambience } from "./ambience";

/**
 * The opt-in sound switch (D13). Off by default; the visitor's choice is remembered per browser.
 *
 * Autoplay: the page's Permissions-Policy denies autoplay, so the AudioContext is only ever created inside a
 * user gesture: the toggle's own click, or — when the visitor left sound on last time — their first
 * click / key press on this visit. The synth itself (ambience.ts) is loaded lazily on that first start.
 */

const KEY = "harbour.sound";

export interface SoundController {
  /** the visitor's choice */
  readonly on: boolean;
  /** audio is actually running (on, and started by a gesture) */
  readonly playing: boolean;
  /** Call from a click handler. */
  toggle(): void;
  subscribe(fn: () => void): () => void;
  /** Stop and release the audio (the choice stays). */
  stop(): void;
}

interface Readings { fog?: number }
interface Life { wind?: number }

function readChoice(): boolean {
  try { return localStorage.getItem(KEY) === "on"; } catch { return false; }
}
function writeChoice(on: boolean): void {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* private window: not remembered */ }
}

class Controller implements SoundController {
  on = readChoice();
  private amb: Ambience | null = null;
  private ac: AudioContext | null = null;
  private poll = 0;
  private starting = false;
  private readonly listeners = new Set<() => void>();
  private readonly onGesture = () => { this.disarm(); if (this.on) this.start(); };
  private readonly onVisibility = () => {
    if (!this.ac) return;
    if (document.hidden) void this.ac.suspend(); else if (this.on) void this.ac.resume();
  };

  constructor(private readonly ctx: EngineContext) {
    if (this.on) this.arm();
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  get playing(): boolean { return !!this.amb; }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private emit(): void { for (const fn of this.listeners) fn(); }

  toggle(): void {
    this.on = !this.on;
    writeChoice(this.on);
    if (this.on) { this.disarm(); this.start(); } else this.stop();
    this.emit();
  }

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
    void import("./ambience").then(({ Ambience }) => {
      this.starting = false;
      if (!this.on || this.ac !== ac) { void ac.close(); return; }
      this.amb = new Ambience(ac);
      this.feed();
      this.poll = window.setInterval(() => this.feed(), 250);
      this.emit();
    }).catch(() => { this.starting = false; });
  }

  /** World → sound: zoom, wind (DEWS), stale fog, night. */
  private feed(): void {
    const amb = this.amb;
    if (!amb) return;
    const { ctx } = this;
    const L = ctx.services.get("layout") as HarbourLayout | undefined;
    const lo = L?.camera.minDistance ?? 90, hi = L?.camera.maxDistance ?? 1150;
    const zoom = Math.max(0, Math.min(1, (ctx.rig.distance - lo) / (hi - lo)));
    const fog = (ctx.services.get("readings") as Readings | undefined)?.fog ?? 0;
    const wind = (ctx.services.get("life") as Life | undefined)?.wind ?? 0.35;
    amb.set({ zoom: Math.sqrt(zoom), wind, fog, night: ctx.uniforms.uNight.value });
  }

  stop(): void {
    clearInterval(this.poll);
    const amb = this.amb, ac = this.ac;
    this.amb = null; this.ac = null;
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
