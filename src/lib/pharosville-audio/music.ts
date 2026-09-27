/**
 * Music (O13, separate consent, off by default): a sparse line for a soft felt
 * mallet (a struck bar: modal partials 1 : 4 : 9.2) above a low, round plucked
 * string. Anhemitonic D major pentatonic in just intonation — no semitones, so
 * no overlap can sour. Onsets fall only on the breath's inhale start or inhale
 * peak; at most one phrase every 40–90 s; silent during director rituals and in
 * the 00:00–04:45 night plateau. It maps no data.
 *
 * G6 costume (X8 audit): no in scale, no koto idiom (no bright plectrum attack
 * in the zither register, no oshide bends, no tremolo — the string sits an
 * octave down with a twice-rounded pluck, a harp/guitar harmonic rather than a
 * koto), no shakuhachi (the breathy end-blown flute was removed: breath noise
 * over a pentatonic long tone is that costume however plain its pitch), no
 * temple bell, shō or taiko.
 */
import { GARDEN_BREATH_SECONDS } from "../../systems/weather";
import { renderPluck, seededRandom } from "./dsp";
import { claimVoice, foldToMono, panPeakCompensation, type AudioGraph } from "./graph";
import { dbToGain, stemLevelDb } from "./mix";
import type { StemTargetSink } from "./bed";

/** D major pentatonic, just ratios over D; A3 … A5 for the mallet, an octave lower for the string. */
const D4 = 293.66;
const SCALE_HZ = [0.75, 5 / 6, 1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2, 3].map((ratio) => D4 * ratio);
/** Felt-mallet bar partials: [ratio, amplitude, T60 seconds] (−18 dB and −30 dB overtones). */
const MALLET_PARTIALS: readonly (readonly [number, number, number])[] = [[1, 1, 2.6], [4, 0.126, 0.3], [9.2, 0.032, 0.08]];
const T60_TO_TAU = 1 / Math.log(1000);
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

  const playMallet = (when: number, frequency: number, peak: number, pan: number) => {
    const end = when + 3;
    if (!claimVoice(graph, when, end)) return;
    const body = ctx.createGain();
    // Partials start in phase at the strike; their sum crests ≈ 1.11 in the first milliseconds.
    body.gain.value = (peak * panPeakCompensation(pan)) / 1.11;
    for (const [ratio, amplitude, t60] of MALLET_PARTIALS) {
      const partial = ctx.createOscillator();
      partial.frequency.value = frequency * ratio;
      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(0, when);
      envelope.gain.linearRampToValueAtTime(amplitude, when + 0.004);
      envelope.gain.setTargetAtTime(0, when + 0.004, t60 * T60_TO_TAU);
      partial.connect(envelope).connect(body);
      partial.start(when);
      partial.stop(end);
    }
    // The felt: a −30 dB lowpassed tick under the strike.
    const felt = ctx.createBufferSource();
    felt.buffer = graph.noise;
    const feltTone = ctx.createBiquadFilter();
    feltTone.type = "lowpass";
    feltTone.frequency.value = 1800;
    feltTone.Q.value = -3;
    foldToMono(feltTone);
    const feltGain = ctx.createGain();
    feltGain.gain.setValueAtTime(0.0316 * Math.SQRT2 / graph.noisePassRms([{ type: "lowpass", frequency: 1800, q: -3 }]), when);
    feltGain.gain.setTargetAtTime(0, when, 0.006);
    felt.connect(feltTone).connect(feltGain).connect(body);
    felt.start(when, (frequency % 7) + 0.1);
    felt.stop(when + 0.1);
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    body.connect(panner).connect(graph.stems.music);
  };

  const schedulePhrase = (frame: MusicFrame, targets: StemTargetSink | null) => {
    const random = seededRandom(Math.imul(frame.minute, 2654435761) ^ Math.floor(frame.breathTime / GARDEN_BREATH_SECONDS));
    // The low string more often under the beacon (night), the mallet by day.
    const string = random() < 0.35 + 0.3 * frame.beaconPresence;
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
      if (string) playPluck(when, SCALE_HZ[degree]! / 2, dbToGain(peakDb), pan);
      else playMallet(when, SCALE_HZ[degree]!, dbToGain(peakDb), pan);
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
