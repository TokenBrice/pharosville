/**
 * The garden's one signal path, built identically on a live AudioContext and
 * on the OfflineAudioContext the recorder uses:
 *
 *   bed stems (sea, wash, lap, wind, whistle, air) → bed duck (meteor) ┐
 *   music stem → music gate (consent, rituals, night tacet) ────────────┤→ master fade → ceiling → out
 *   beats stem ──────────────────────────────────────────────────────────┤
 *   music / beats sends → one shared reverb → return ────────────────────┘
 *
 * Every stem bus is also the `?debug=1` mixer's fader (trim, mute, solo).
 */
import { createCeilingCurve, createNoiseBuffer, createReverbImpulse, NOISE_RMS } from "./dsp";
import { AUDIO_MASTER, AUDIO_STEMS, dbToGain, type AudioMixOverrides, type AudioStemName } from "./mix";

export interface AudioGraph {
  ctx: BaseAudioContext;
  noise: AudioBuffer;
  stems: Record<AudioStemName, GainNode>;
  bedDuck: GainNode;
  musicGate: GainNode;
  reverbIn: GainNode;
  masterFade: GainNode;
  /** Booked event voices (laps, beats, notes) against `AUDIO_MASTER.eventVoiceCap`. */
  voices: { start: number; end: number }[];
  /** RMS of white noise through a filter chain, relative to the unfiltered source. */
  noisePassRms: (stages: readonly FilterStage[]) => number;
}

export interface FilterStage {
  type: BiquadFilterType;
  frequency: number;
  q: number;
}

const STEM_GROUP: Readonly<Record<AudioStemName, "bed" | "music" | "master">> = {
  sea: "bed",
  wash: "bed",
  lap: "bed",
  wind: "bed",
  whistle: "bed",
  air: "bed",
  music: "music",
  beats: "master",
};

export function createAudioGraph(ctx: BaseAudioContext): AudioGraph {
  const noise = createNoiseBuffer(ctx, 8, 0x5eaf00d);
  const masterFade = ctx.createGain();
  masterFade.gain.value = 0;
  const ceiling = ctx.createWaveShaper();
  ceiling.curve = createCeilingCurve();
  ceiling.oversample = "4x";
  masterFade.connect(ceiling).connect(ctx.destination);

  const bedDuck = ctx.createGain();
  bedDuck.connect(masterFade);
  const musicGate = ctx.createGain();
  musicGate.gain.value = 0;
  musicGate.connect(masterFade);

  const reverb = ctx.createConvolver();
  reverb.normalize = false;
  reverb.buffer = createReverbImpulse(ctx, 3, 0x7a11);
  const reverbIn = ctx.createGain();
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = dbToGain(AUDIO_MASTER.reverbReturnDb);
  reverbIn.connect(reverb).connect(reverbReturn).connect(masterFade);

  const stems = {} as Record<AudioStemName, GainNode>;
  for (const stem of AUDIO_STEMS) {
    const bus = ctx.createGain();
    const group = STEM_GROUP[stem];
    bus.connect(group === "bed" ? bedDuck : group === "music" ? musicGate : masterFade);
    stems[stem] = bus;
  }
  const musicSend = ctx.createGain();
  musicSend.gain.value = dbToGain(AUDIO_MASTER.musicSendDb);
  stems.music.connect(musicSend).connect(reverbIn);
  const beatSend = ctx.createGain();
  beatSend.gain.value = dbToGain(AUDIO_MASTER.beatSendDb);
  stems.beats.connect(beatSend).connect(reverbIn);

  return {
    ctx,
    noise,
    stems,
    bedDuck,
    musicGate,
    reverbIn,
    masterFade,
    voices: [],
    noisePassRms: createNoisePassMeter(ctx),
  };
}

/** Applies the debug mixer's trims, mutes and solo to the stem faders. */
export function applyMixOverrides(graph: AudioGraph, overrides: AudioMixOverrides, atTime: number | null): void {
  for (const stem of AUDIO_STEMS) {
    const open = !overrides.muted[stem] && (overrides.solo === null || overrides.solo === stem);
    const gain = open ? dbToGain(overrides.trimDb[stem]) : 0;
    // `null`: at construction, before anything sounds (a solo must not leak its first block).
    if (atTime === null) graph.stems[stem].gain.value = gain;
    else graph.stems[stem].gain.setTargetAtTime(gain, atTime, 0.03);
  }
}

/**
 * White noise through a biquad chain passes the mean of |H(f)|² of its power;
 * measured on unconnected probe filters from the browser's own response, so
 * each bed layer can be set to its `AUDIO_MIX` RMS whatever its cutoff.
 */
function createNoisePassMeter(ctx: BaseAudioContext): (stages: readonly FilterStage[]) => number {
  const bins = 1024;
  const frequencies = new Float32Array(bins);
  for (let index = 0; index < bins; index += 1) frequencies[index] = ((index + 0.5) / bins) * (ctx.sampleRate / 2);
  const magnitude = new Float32Array(bins);
  const phase = new Float32Array(bins);
  const power = new Float32Array(bins);
  const probe = ctx.createBiquadFilter();
  return (stages) => {
    power.fill(1);
    for (const stage of stages) {
      probe.type = stage.type;
      probe.frequency.value = stage.frequency;
      probe.Q.value = stage.q;
      probe.getFrequencyResponse(frequencies, magnitude, phase);
      for (let index = 0; index < bins; index += 1) power[index] *= magnitude[index] * magnitude[index];
    }
    let sum = 0;
    for (let index = 0; index < bins; index += 1) sum += power[index];
    return NOISE_RMS * Math.sqrt(sum / bins);
  };
}

/** A looping noise voice read from its own offset and rate, so layers never share a period. */
export function startNoiseLoop(graph: AudioGraph, offsetSeconds: number, rate: number): AudioBufferSourceNode {
  const source = graph.ctx.createBufferSource();
  source.buffer = graph.noise;
  source.loop = true;
  source.playbackRate.value = rate;
  source.start(0, offsetSeconds);
  return source;
}

/**
 * A mono voice into a StereoPannerNode lands at cos/sin of the equal-power law
 * (−3 dB per side at centre). Events are specified by the peak of their louder
 * channel, so their gain is multiplied by this.
 */
export function panPeakCompensation(pan: number): number {
  const angle = ((Math.max(-1, Math.min(1, pan)) + 1) / 2) * (Math.PI / 2);
  return 1 / Math.max(Math.cos(angle), Math.sin(angle));
}

/** Gaussian-like noise over a short burst peaks at about this multiple of its RMS. */
export const NOISE_BURST_CREST = 4.2;

/**
 * Folds a node's (stereo noise) input to mono, as event voices need before a
 * StereoPannerNode: stereo input pans by balance, not by the equal-power law
 * `panPeakCompensation` assumes. The fold halves decorrelated L+R power, so
 * the mono signal's RMS is `noisePassRms / √2`.
 */
export function foldToMono(node: AudioNode): void {
  node.channelCount = 1;
  node.channelCountMode = "explicit";
}

/**
 * Books an event voice for [start, end] in context time; false (play nothing)
 * when `eventVoiceCap` voices already overlap it. Interval-based, so events
 * scheduled ahead (music phrases, the offline recorder) are counted correctly.
 */
export function claimVoice(graph: AudioGraph, start: number, end: number): boolean {
  const voices = graph.voices;
  const now = graph.ctx.currentTime;
  for (let index = voices.length - 1; index >= 0; index -= 1) {
    if (voices[index]!.end < now) voices.splice(index, 1);
  }
  let overlapping = 0;
  for (const voice of voices) if (voice.start < end && voice.end > start) overlapping += 1;
  if (overlapping >= AUDIO_MASTER.eventVoiceCap) return false;
  voices.push({ start, end });
  return true;
}
