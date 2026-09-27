/**
 * W7.3 (sound-4) beats you can hear, ready for the director to call. Each is
 * synthesised (0 bytes). The arrival sounds the same for a supply rise and a
 * fall; market beats get no sound, ever; the meteor is a held breath.
 */
import { claimVoice, foldToMono, NOISE_BURST_CREST, panPeakCompensation, type AudioGraph } from "./graph";
import { AUDIO_MASTER, BEAT_LEVEL_DB, dbToGain } from "./mix";
import type { StemTargetSink } from "./bed";

export type GardenSoundBeat = "arrival-luff" | "fender" | "kindling-tock" | "heron-wings" | "meteor-silence";

export const GARDEN_SOUND_BEATS: readonly GardenSoundBeat[] = ["arrival-luff", "fender", "kindling-tock", "heron-wings", "meteor-silence"];

/** How long each beat holds an event voice. */
const BEAT_SPAN_SECONDS: Readonly<Record<Exclude<GardenSoundBeat, "meteor-silence">, number>> = {
  "arrival-luff": 1.3,
  fender: 0.6,
  "kindling-tock": 1,
  "heron-wings": 2.8,
};

/** Band-limited noise burst whose peak lands near `peak`. */
function noiseBurst(
  graph: AudioGraph,
  when: number,
  type: BiquadFilterType,
  frequency: number,
  q: number,
  peak: number,
  destination: AudioNode,
): { source: AudioBufferSourceNode; envelope: GainNode } {
  const { ctx } = graph;
  const source = ctx.createBufferSource();
  source.buffer = graph.noise;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  foldToMono(filter);
  const scale = ctx.createGain();
  scale.gain.value = (peak * Math.SQRT2) / (NOISE_BURST_CREST * graph.noisePassRms([{ type, frequency, q }]));
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, when);
  source.connect(filter).connect(scale).connect(envelope).connect(destination);
  source.start(when, (when * 7.3) % 7);
  return { source, envelope };
}

function beatOutput(graph: AudioGraph, pan: number): StereoPannerNode {
  const panner = graph.ctx.createStereoPanner();
  panner.pan.value = Math.max(-0.9, Math.min(0.9, pan));
  panner.connect(graph.stems.beats);
  return panner;
}

/** Schedules one named beat at context time `when`; returns false when the voice cap refuses it. */
export function playGardenBeat(
  graph: AudioGraph,
  beat: GardenSoundBeat,
  when: number,
  pan: number,
  targets: StemTargetSink | null,
): boolean {
  const { ctx } = graph;
  if (beat === "meteor-silence") {
    // The harbour holds its breath: 3 s down, 4 s held, 6 s back.
    const duck = graph.bedDuck.gain;
    duck.cancelScheduledValues(when);
    duck.setTargetAtTime(dbToGain(AUDIO_MASTER.meteorDipDb), when, 1);
    duck.setTargetAtTime(1, when + 7, 2);
    return true;
  }
  if (!claimVoice(graph, when, when + BEAT_SPAN_SECONDS[beat])) return false;
  const peakDb = BEAT_LEVEL_DB[beat];
  const peak = dbToGain(peakDb) * panPeakCompensation(pan);
  const out = beatOutput(graph, pan);
  switch (beat) {
    case "arrival-luff": {
      // Canvas luffing as the sail dips: airy noise fluttering at ~11 Hz.
      // ×1.66: the flutter and the envelope rarely crest together (measured −4.4 dB without it).
      const { source, envelope } = noiseBurst(graph, when, "bandpass", 2400, 0.6, peak * 1.66, out);
      const flutter = ctx.createGain();
      flutter.gain.value = 0.55;
      const flutterRate = ctx.createOscillator();
      flutterRate.frequency.value = 11;
      const flutterDepth = ctx.createGain();
      flutterDepth.gain.value = 0.45;
      flutterRate.connect(flutterDepth).connect(flutter.gain);
      envelope.disconnect();
      envelope.connect(flutter).connect(out);
      envelope.gain.linearRampToValueAtTime(1, when + 0.15);
      envelope.gain.setTargetAtTime(0, when + 0.15, 0.22);
      flutterRate.start(when);
      flutterRate.stop(when + 1.3);
      source.stop(when + 1.3);
      break;
    }
    case "fender": {
      // A soft wooden knock as the hull settles: damped 180 Hz and a short tick.
      const knock = ctx.createOscillator();
      knock.frequency.value = 180;
      const knockGain = ctx.createGain();
      knockGain.gain.setValueAtTime(0, when);
      knockGain.gain.linearRampToValueAtTime(peak * 0.95, when + 0.003);
      knockGain.gain.setTargetAtTime(0, when + 0.003, 0.07);
      knock.connect(knockGain).connect(out);
      knock.start(when);
      knock.stop(when + 0.6);
      const { source, envelope } = noiseBurst(graph, when, "lowpass", 2000, -3, peak * 0.2, out);
      envelope.gain.linearRampToValueAtTime(1, when + 0.002);
      envelope.gain.setTargetAtTime(0, when + 0.002, 0.012);
      source.stop(when + 0.2);
      break;
    }
    case "kindling-tock": {
      // A small wood tock (modal pair 1 : 2.9) and a breath of flame.
      const tock = ctx.createOscillator();
      tock.frequency.value = 1050;
      const upper = ctx.createOscillator();
      upper.frequency.value = 1050 * 2.9;
      const upperGain = ctx.createGain();
      upperGain.gain.value = 0.2;
      const tockGain = ctx.createGain();
      tockGain.gain.setValueAtTime(0, when);
      tockGain.gain.linearRampToValueAtTime(peak * 0.9, when + 0.002);
      tockGain.gain.setTargetAtTime(0, when + 0.002, 0.025);
      tock.connect(tockGain);
      upper.connect(upperGain).connect(tockGain);
      tockGain.connect(out);
      tock.start(when);
      upper.start(when);
      tock.stop(when + 0.3);
      upper.stop(when + 0.3);
      const { source, envelope } = noiseBurst(graph, when, "lowpass", 600, -3, peak * 0.2, out);
      envelope.gain.linearRampToValueAtTime(1, when + 0.08);
      envelope.gain.setTargetAtTime(0, when + 0.08, 0.15);
      source.stop(when + 1);
      break;
    }
    case "heron-wings": {
      // Three slow wingbeats: soft low whooshes a little under a second apart.
      for (let index = 0; index < 3; index += 1) {
        const start = when + index * 0.95;
        const { source, envelope } = noiseBurst(graph, start, "bandpass", 420, 0.8, peak, out);
        envelope.gain.linearRampToValueAtTime(1, start + 0.14);
        envelope.gain.setTargetAtTime(0, start + 0.14, 0.12);
        source.stop(start + 0.9);
      }
      break;
    }
  }
  targets?.("beats", peakDb);
  return true;
}
