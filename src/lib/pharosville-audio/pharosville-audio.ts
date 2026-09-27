/**
 * Lazy chunk entry (`pharosville-audio-*.js`). Nothing here loads until the
 * visitor switches Sound on (or a `?debug=1&audio=record:N` harness run), and
 * the AudioContext it drives was already created inside that click.
 *
 * Lifecycle: consent fade from silence; hidden tab → fade to silence in 0.6 s
 * and suspend; visible → resume and rise, dropping (never replaying) whatever
 * was missed; off → fade and close, so the audio thread returns to zero.
 */
import { AUDIO_LOOKAHEAD_SECONDS, AUDIO_TICK_SECONDS, createGardenAudioEngine } from "./engine";
import type { GardenSoundBeat } from "./beats";
import { mountAudioDebugMixer } from "./debug-mixer";
import { AUDIO_MASTER, createAudioMixOverrides } from "./mix";
import { deliverAudioRecord, recordGardenAudio, type AudioRecordReport } from "./record";
import type { AudioSceneSnapshot } from "./scene-snapshot";

export type { GardenSoundBeat } from "./beats";

export interface GardenAudioHandle {
  setMusic: (on: boolean) => void;
  /** W7.3: one named beat, now, panned −1…1. No sound while the tab is hidden. */
  playBeat: (beat: GardenSoundBeat, pan?: number) => void;
  close: () => void;
}

/** Past this age the render clock is treated as paused and the bed runs on the audio clock. */
const SNAPSHOT_FRESH_MS = 500;

export function startGardenAudio(
  ctx: AudioContext,
  snapshot: Readonly<AudioSceneSnapshot>,
  options: { music: boolean; debug: boolean },
): GardenAudioHandle {
  const overrides = createAudioMixOverrides();
  const engine = createGardenAudioEngine(ctx, snapshot, {
    music: options.music,
    overrides,
    firstPhraseAt: ctx.currentTime + 12 + Math.random() * 8,
    logTargets: false,
  });
  const fade = engine.graph.masterFade.gain;
  const fadeTo = (value: number, seconds: number) => {
    const now = ctx.currentTime;
    fade.cancelScheduledValues(now);
    fade.setValueAtTime(fade.value, now);
    // Five time constants land within 1 % (−43 dB) of the target.
    fade.setTargetAtTime(value, now, seconds / 5);
  };
  // Render seconds minus context seconds: re-anchored while frames arrive, held while they don't.
  let renderOffset = Number.NaN;
  let hiddenTimer = 0;
  let closed = false;

  const tick = () => {
    if (closed || ctx.state !== "running") return;
    const now = ctx.currentTime;
    const age = performance.now() - snapshot.wallMs;
    if (snapshot.frames > 0 && age < SNAPSHOT_FRESH_MS) renderOffset = snapshot.timeSeconds + age / 1000 - now;
    else if (!Number.isFinite(renderOffset)) renderOffset = snapshot.timeSeconds - now;
    const at = now + AUDIO_LOOKAHEAD_SECONDS;
    engine.tick(at, at + renderOffset, Math.floor(Date.now() / 60000));
  };
  tick();
  fadeTo(1, AUDIO_MASTER.fadeInSeconds);
  const interval = window.setInterval(tick, AUDIO_TICK_SECONDS * 1000);

  const onVisibility = () => {
    if (closed) return;
    window.clearTimeout(hiddenTimer);
    if (document.visibilityState === "hidden") {
      fadeTo(0, AUDIO_MASTER.hiddenFadeSeconds);
      hiddenTimer = window.setTimeout(() => {
        if (!closed && document.visibilityState === "hidden") void ctx.suspend();
      }, AUDIO_MASTER.hiddenFadeSeconds * 1000 + 20);
      return;
    }
    void ctx.resume().then(() => {
      if (closed) return;
      engine.resetEvents();
      tick();
      fadeTo(1, AUDIO_MASTER.resumeFadeSeconds);
    });
  };
  document.addEventListener("visibilitychange", onVisibility);
  const unmountMixer = options.debug
    ? mountAudioDebugMixer(overrides, (seconds) => void runAudioRecord(snapshot, seconds, overrides))
    : null;

  return {
    setMusic(on) {
      engine.setMusic(on, ctx.currentTime);
    },
    playBeat(beat, pan = 0) {
      if (closed || ctx.state !== "running") return;
      engine.playBeat(beat, ctx.currentTime + 0.05, pan);
    },
    close() {
      if (closed) return;
      closed = true;
      window.clearInterval(interval);
      window.clearTimeout(hiddenTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      unmountMixer?.();
      if (ctx.state === "closed") return;
      fadeTo(0, AUDIO_MASTER.stopFadeSeconds);
      window.setTimeout(() => void ctx.close(), AUDIO_MASTER.stopFadeSeconds * 1000 + 50);
    },
  };
}

/**
 * `&audio=record:N`: waits for the renderer's first frames, renders offline,
 * downloads the WAV and publishes the stem table for the harness.
 */
export async function runAudioRecord(
  snapshot: Readonly<AudioSceneSnapshot>,
  seconds: number,
  overrides: Parameters<typeof recordGardenAudio>[2] = null,
): Promise<AudioRecordReport> {
  const deadline = performance.now() + 60_000;
  while (snapshot.frames < 30 && performance.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const { report, wav } = await recordGardenAudio(snapshot, seconds, overrides);
  deliverAudioRecord(report, wav);
  (window as { __pharosVilleAudioRecord?: AudioRecordReport }).__pharosVilleAudioRecord = report;
  return report;
}
