/**
 * X8 borrowed sound (sound-5, shakkei for the ear): now and then something
 * beyond the frame — a bell buoy rocking off the harbour mouth, a swell
 * breaking on the outer rocks. Both synthesised (0 bytes), distant (lowpassed,
 * mostly reverb), panned off-frame, and harbour-universal: a buoy bell is a
 * small, bright bell struck two to four times by the sea's rocking, never a
 * single deep temple-bell hum.
 *
 * Rare by construction: each one asks the director for its background
 * environment slot (the same 6–10 min slot every ambient cue shares), and never
 * sooner than 10 minutes after the last. A frozen director (reduced motion,
 * Still) refuses, so the still picture has no far events either. It maps no
 * data: the level follows the bed's sea-state ladder like every bed stem.
 */
import { requestGardenBeat, type GardenDirectorState } from "../../systems/garden-director";
import { hash01 } from "./dsp";
import { claimVoice, foldToMono, NOISE_BURST_CREST, panPeakCompensation, type AudioGraph } from "./graph";
import { dbToGain, stemLevelDb } from "./mix";
import type { StemTargetSink } from "./bed";

export type BorrowedSound = "bell-buoy" | "outer-rocks";

export const BORROWED_SOUNDS: readonly BorrowedSound[] = ["bell-buoy", "outer-rocks"];

/** Director slot each far sound holds, and how long it rings. */
const BORROWED_SLOT_SECONDS = 6;
const BORROWED_SPAN_SECONDS: Readonly<Record<BorrowedSound, number>> = { "bell-buoy": 6.5, "outer-rocks": 5 };
/** Never two within ten minutes; a refusal asks again half a minute later. */
const BORROWED_GAP_MIN_SECONDS = 600;
const BORROWED_GAP_SPAN_SECONDS = 360;
const BORROWED_RETRY_SECONDS = 30;
/** Like the attract move: no ask within 90 s of any admitted beat. */
const BORROWED_BEAT_BACKOFF_SECONDS = 90;
/** Off-frame: the buoy at the harbour mouth (right), the rocks beyond the left point. */
const BORROWED_PAN: Readonly<Record<BorrowedSound, number>> = { "bell-buoy": 0.8, "outer-rocks": -0.75 };

/** A small cast bell's partials: [ratio, amplitude, T60 s]. Bright and short — a buoy, not a temple bell. */
const BUOY_PARTIALS: readonly (readonly [number, number, number])[] = [
  [0.5, 0.2, 2.2], [1, 1, 1.8], [1.19, 0.45, 1.2], [1.5, 0.3, 0.9], [2, 0.35, 0.7], [2.51, 0.2, 0.45],
];
const BUOY_HZ = 640;
const T60_TO_TAU = 1 / Math.log(1000);

export interface BorrowedFrame {
  at: number;
  /** Sea-state ladder 0 … 1, as the bed reads it. */
  sea: number;
  director: GardenDirectorState | null;
  directorSeconds: number;
}

export interface GardenBorrowed {
  update: (frame: BorrowedFrame, targets: StemTargetSink | null) => void;
}

export function createGardenBorrowed(graph: AudioGraph, firstAskAt: number): GardenBorrowed {
  let nextAskAt = firstAskAt;
  let count = 0;
  return {
    update(frame, targets) {
      if (frame.at < nextAskAt) return;
      const director = frame.director;
      const now = frame.directorSeconds;
      const last = director?.log[director.log.length - 1];
      if (!director || !Number.isFinite(now) || (last && now - last.startSeconds < BORROWED_BEAT_BACKOFF_SECONDS)) {
        nextAskAt = frame.at + BORROWED_RETRY_SECONDS;
        return;
      }
      const seed = Math.floor(now / 60) + count * 7919;
      const sound: BorrowedSound = hash01(seed) < 0.55 ? "bell-buoy" : "outer-rocks";
      const beat = requestGardenBeat(director, {
        kind: "weather",
        foreground: false,
        priority: 1,
        durationSeconds: BORROWED_SLOT_SECONDS,
        subject: `borrowed:${sound}`,
      }, now);
      if (!beat) {
        nextAskAt = frame.at + BORROWED_RETRY_SECONDS;
        return;
      }
      count += 1;
      playBorrowedSound(graph, sound, frame.at, stemLevelDb("borrowed", frame.sea), seed, targets);
      nextAskAt = frame.at + BORROWED_GAP_MIN_SECONDS + hash01(seed + 1) * BORROWED_GAP_SPAN_SECONDS;
    },
  };
}

/** One far sound at context time `when`, peaking at `peakDb` on the `borrowed` stem. */
export function playBorrowedSound(
  graph: AudioGraph,
  sound: BorrowedSound,
  when: number,
  peakDb: number,
  seed: number,
  targets: StemTargetSink | null,
): boolean {
  if (!claimVoice(graph, when, when + BORROWED_SPAN_SECONDS[sound])) return false;
  const { ctx } = graph;
  const pan = BORROWED_PAN[sound];
  const peak = dbToGain(peakDb) * panPeakCompensation(pan);
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  panner.connect(graph.stems.borrowed);
  if (sound === "bell-buoy") {
    // Distance: the bell's brightness is the first thing the air takes.
    const air = ctx.createBiquadFilter();
    air.type = "lowpass";
    air.frequency.value = 2400;
    air.Q.value = -3;
    air.connect(panner);
    // The buoy rocks: two to four strikes, uneven in time and weight.
    const strikes = 2 + Math.floor(hash01(seed + 2) * 3);
    let strikeAt = when;
    for (let strike = 0; strike < strikes; strike += 1) {
      const weight = strike === 0 ? 1 : 0.55 + 0.45 * hash01(seed + 10 + strike);
      const body = ctx.createGain();
      // In-phase partials crest ≈ 1.9 × the prime at the strike (measured).
      body.gain.value = (peak * weight) / 1.9;
      body.connect(air);
      for (const [ratio, amplitude, t60] of BUOY_PARTIALS) {
        const partial = ctx.createOscillator();
        partial.frequency.value = BUOY_HZ * ratio;
        const envelope = ctx.createGain();
        envelope.gain.setValueAtTime(0, strikeAt);
        envelope.gain.linearRampToValueAtTime(amplitude, strikeAt + 0.003);
        envelope.gain.setTargetAtTime(0, strikeAt + 0.003, t60 * T60_TO_TAU);
        partial.connect(envelope).connect(body);
        partial.start(strikeAt);
        partial.stop(strikeAt + 2.6);
      }
      strikeAt += 0.7 + 0.9 * hash01(seed + 20 + strike);
    }
  } else {
    // A swell breaking on far rocks: a dark rush that opens and closes, then a smaller backwash.
    const source = ctx.createBufferSource();
    source.buffer = graph.noise;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.Q.value = -3;
    tone.frequency.setValueAtTime(320, when);
    tone.frequency.linearRampToValueAtTime(1300, when + 0.7);
    tone.frequency.setTargetAtTime(420, when + 0.7, 0.9);
    foldToMono(tone);
    const envelope = ctx.createGain();
    // Level set at the crest's cutoff, where the rush is loudest.
    const scale = (peak * Math.SQRT2) / (NOISE_BURST_CREST * graph.noisePassRms([{ type: "lowpass", frequency: 1300, q: -3 }]));
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(scale, when + 0.7);
    envelope.gain.setTargetAtTime(scale * 0.25, when + 0.7, 0.5);
    envelope.gain.setTargetAtTime(scale * 0.4, when + 2.2, 0.4);
    envelope.gain.setTargetAtTime(0, when + 2.8, 0.55);
    source.connect(tone).connect(envelope).connect(panner);
    source.start(when, hash01(seed + 3) * 6);
    source.stop(when + BORROWED_SPAN_SECONDS[sound]);
  }
  targets?.("borrowed", peakDb);
  return true;
}
