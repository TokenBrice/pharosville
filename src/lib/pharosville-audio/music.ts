/**
 * Music (O13, separate consent, off by default): a sparse line for a plucked
 * string or a breathy end-blown flute. Anhemitonic D major pentatonic in just
 * intonation — no semitones, so no overlap can sour — with no bends, tremolo
 * or vibrato (no costume). Onsets fall only on the breath's inhale start or
 * inhale peak; at most one phrase every 40–90 s; silent during director
 * rituals and in the 00:00–04:45 night plateau. It maps no data.
 */
import { GARDEN_BREATH_SECONDS } from "../../systems/weather";
import { renderPluck, seededRandom } from "./dsp";
import { claimVoice, foldToMono, panPeakCompensation, type AudioGraph } from "./graph";
import { dbToGain, stemLevelDb } from "./mix";
import type { StemTargetSink } from "./bed";

/** D major pentatonic, just ratios over D; A3 … A5. */
const D4 = 293.66;
const SCALE_HZ = [0.75, 5 / 6, 1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2, 3].map((ratio) => D4 * ratio);
/** Indices of D and A: every phrase comes home to one of them. */
const HOME_INDICES = [2, 5, 7, 10];
/** Onset grid: inhale start (phase 0) and inhale peak (phase 0.4) of the shared breath. */
const GRID_OFFSETS = [0, 0.4];
const PHRASE_GAP_MIN_SECONDS = 40;
const PHRASE_GAP_SPAN_SECONDS = 50;
const NIGHT_TACET_END_HOUR = 4.75;

export interface MusicFrame {
  at: number;
  breathTime: number;
  enabled: boolean;
  ritual: boolean;
  hour: number;
  stormLevel: number;
  beaconPresence: number;
  /** Wall-clock minute: everyone watching in the same minute hears the same phrase. */
  minute: number;
}

export interface GardenMusic {
  update: (frame: MusicFrame, targets: StemTargetSink | null) => void;
  /** Next phrase no earlier than this context time (consent, resume). */
  deferTo: (ctxTime: number) => void;
}

export function createGardenMusic(graph: AudioGraph, firstPhraseAt: number): GardenMusic {
  const { ctx } = graph;
  const plucks = new Map<number, AudioBuffer>();
  let nextPhraseAt = firstPhraseAt;
  let gateOpen: boolean | null = null;

  const pluckBuffer = (period: number) => {
    let buffer = plucks.get(period);
    if (!buffer) {
      buffer = renderPluck(ctx, period, 3.6, period);
      plucks.set(period, buffer);
    }
    return buffer;
  };

  const playPluck = (when: number, frequency: number, peak: number, pan: number) => {
    if (!claimVoice(graph, when, when + 3.6)) return;
    const source = ctx.createBufferSource();
    const period = Math.round(ctx.sampleRate / frequency);
    source.buffer = pluckBuffer(period);
    source.playbackRate.value = (frequency * period) / ctx.sampleRate;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak * panPeakCompensation(pan), when);
    gain.gain.setTargetAtTime(0, when + 3.1, 0.15);
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    source.connect(gain).connect(panner).connect(graph.stems.music);
    source.start(when);
    source.stop(when + 3.6);
  };

  const playFlute = (when: number, frequency: number, peak: number, pan: number, hold: number) => {
    const end = when + hold + 2.6;
    if (!claimVoice(graph, when, end)) return;
    const tone = ctx.createOscillator();
    tone.frequency.value = frequency;
    const overtone = ctx.createOscillator();
    overtone.frequency.value = frequency * 2;
    const overtoneGain = ctx.createGain();
    overtoneGain.gain.value = 0.18;
    const breath = ctx.createBufferSource();
    breath.buffer = graph.noise;
    const breathBand = ctx.createBiquadFilter();
    breathBand.type = "bandpass";
    breathBand.frequency.value = frequency * 2;
    breathBand.Q.value = 1.6;
    foldToMono(breathBand);
    const breathGain = ctx.createGain();
    breathGain.gain.value = (0.05 * Math.SQRT2) / graph.noisePassRms([{ type: "bandpass", frequency: frequency * 2, q: 1.6 }]);
    const envelope = ctx.createGain();
    const level = (peak * panPeakCompensation(pan)) / 1.18;
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(level, when + 0.35);
    envelope.gain.setValueAtTime(level, when + hold);
    envelope.gain.setTargetAtTime(0, when + hold, 0.45);
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    tone.connect(envelope);
    overtone.connect(overtoneGain).connect(envelope);
    breath.connect(breathBand).connect(breathGain).connect(envelope);
    envelope.connect(panner).connect(graph.stems.music);
    tone.start(when);
    overtone.start(when);
    breath.start(when, (frequency % 7) + 0.1);
    tone.stop(end);
    overtone.stop(end);
    breath.stop(end);
  };

  const schedulePhrase = (frame: MusicFrame, targets: StemTargetSink | null) => {
    const random = seededRandom(Math.imul(frame.minute, 2654435761) ^ Math.floor(frame.breathTime / GARDEN_BREATH_SECONDS));
    const flute = random() < 0.3 + 0.35 * frame.beaconPresence;
    const levelDb = stemLevelDb("music", frame.stormLevel > 0.5 ? (frame.stormLevel - 0.5) * 2 : 0);
    // First grid point at least half a second ahead.
    const cycleStart = (cycle: number) => (cycle - 0.2) * GARDEN_BREATH_SECONDS;
    let cycle = Math.floor(frame.breathTime / GARDEN_BREATH_SECONDS + 0.2);
    let slot = 0;
    while (cycleStart(cycle) + GRID_OFFSETS[slot]! * GARDEN_BREATH_SECONDS < frame.breathTime + 0.5) {
      slot += 1;
      if (slot === GRID_OFFSETS.length) {
        slot = 0;
        cycle += 1;
      }
    }
    const notes = 3 + Math.floor(random() * 3);
    let degree = 2 + Math.floor(random() * 4);
    let lastWhen = frame.at;
    for (let note = 0; note < notes; note += 1) {
      if (note === notes - 1) {
        degree = HOME_INDICES.reduce((best, home) => (Math.abs(home - degree) < Math.abs(best - degree) ? home : best), HOME_INDICES[0]!);
      }
      const onset = cycleStart(cycle) + GRID_OFFSETS[slot]! * GARDEN_BREATH_SECONDS + (random() * 2 - 1) * 0.06;
      const when = frame.at + (onset - frame.breathTime);
      const peakDb = levelDb + 20 * Math.log10(0.7 + 0.3 * random());
      const pan = (random() * 2 - 1) * 0.25;
      if (flute) playFlute(when, SCALE_HZ[degree]!, dbToGain(peakDb), pan, 1.8 + random() * 0.8);
      else playPluck(when, SCALE_HZ[degree]!, dbToGain(peakDb), pan);
      targets?.("music", peakDb);
      lastWhen = when;
      // Mostly one note per breath (two grid steps), sometimes the next half, sometimes a breath and a half.
      const roll = random();
      const steps = roll < 0.3 ? 1 : roll < 0.85 ? 2 : 3;
      for (let step = 0; step < steps; step += 1) {
        slot += 1;
        if (slot === GRID_OFFSETS.length) {
          slot = 0;
          cycle += 1;
        }
      }
      const move = random();
      const delta = move < 0.7 ? (random() < 0.5 ? -1 : 1) : move < 0.9 ? (random() < 0.5 ? -2 : 2) : 0;
      degree = Math.min(SCALE_HZ.length - 1, Math.max(0, degree + delta));
    }
    nextPhraseAt = Math.max(frame.at + PHRASE_GAP_MIN_SECONDS + random() * PHRASE_GAP_SPAN_SECONDS, lastWhen + 12);
  };

  return {
    deferTo(ctxTime) {
      nextPhraseAt = Math.max(nextPhraseAt, ctxTime);
    },
    update(frame, targets) {
      const tacet = frame.hour >= 0 && frame.hour < NIGHT_TACET_END_HOUR;
      const open = frame.enabled && !frame.ritual && !tacet;
      if (open !== gateOpen) {
        // A ritual takes the harbour over 1.5 s; consent and the hour switch quicker.
        graph.musicGate.gain.setTargetAtTime(open ? 1 : 0, frame.at, frame.ritual ? 0.5 : 0.25);
        gateOpen = open;
      }
      if (frame.at < nextPhraseAt) return;
      if (!open) {
        // Wait out the ritual or the night, a breath at a time.
        nextPhraseAt = frame.at + GARDEN_BREATH_SECONDS;
        return;
      }
      schedulePhrase(frame, targets);
    },
  };
}
