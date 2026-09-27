/**
 * W7.1 (sound-2) `&audio=record:N`: renders N seconds of the live scene
 * offline (OfflineAudioContext — no device, no consent needed, no sound
 * played) through the very engine that plays, then once more per stem soloed,
 * and prints the stem table against `AUDIO_MIX`. Tuning becomes evidence.
 */
import { AUDIO_TICK_SECONDS, createGardenAudioEngine, type GardenAudioEngine } from "./engine";
import { GARDEN_SOUND_BEATS } from "./beats";
import { AUDIO_MIX, AUDIO_STEMS, createAudioMixOverrides, gainToDb, type AudioMixOverrides, type AudioStemName } from "./mix";
import type { AudioSceneSnapshot } from "./scene-snapshot";

const RECORD_SAMPLE_RATE = 48000;

export interface AudioStemReport {
  stem: AudioStemName;
  measure: "rms" | "peak";
  /** What the engine asked for (power mean for beds, loudest intended peak for events); null = silent. */
  targetDb: number | null;
  measuredDb: number | null;
  deltaDb: number | null;
}

export interface AudioRecordReport {
  seconds: number;
  sampleRate: number;
  /** The scene the render was taken from. */
  scene: { swell: number; psiStress: number; hour: number; eyeHeight: number; reducedMotion: boolean };
  peakDbfs: number;
  /** 4× interpolated peak of the full mix (true-peak estimate). */
  truePeakDbtp: number;
  stems: AudioStemReport[];
  wavBytes: number;
}

export async function recordGardenAudio(
  live: Readonly<AudioSceneSnapshot>,
  seconds: number,
  liveOverrides: AudioMixOverrides | null,
): Promise<{ report: AudioRecordReport; wav: Blob }> {
  const snapshot: AudioSceneSnapshot = { ...live };
  const minute = Math.floor(Date.now() / 60000);
  const full = await renderScene(snapshot, seconds, minute, liveOverrides, null);
  const stems: AudioStemReport[] = [];
  for (const stem of AUDIO_STEMS) {
    const solo = await renderScene(snapshot, seconds, minute, liveOverrides, stem);
    const measure = AUDIO_MIX[stem].measure;
    const targets = solo.engine.targets!;
    const targetDb = measure === "rms"
      ? (targets.samples[stem] > 0 ? 10 * Math.log10(targets.power[stem] / targets.samples[stem]) : null)
      : targets.peak[stem];
    const measuredDb = measure === "rms" ? gainToDb(rms(solo.buffer)) : gainToDb(samplePeak(solo.buffer));
    const target = targetDb !== null && Number.isFinite(targetDb) ? targetDb : null;
    const measured = Number.isFinite(measuredDb) && measuredDb > -120 ? measuredDb : null;
    stems.push({
      stem,
      measure,
      targetDb: target,
      measuredDb: measured,
      deltaDb: target !== null && measured !== null ? measured - target : null,
    });
  }
  const wav = encodeWav(full.buffer);
  return {
    wav,
    report: {
      seconds,
      sampleRate: RECORD_SAMPLE_RATE,
      scene: {
        swell: snapshot.swell,
        psiStress: snapshot.psiStress,
        hour: snapshot.hour,
        eyeHeight: snapshot.eyeHeight,
        reducedMotion: snapshot.reducedMotion,
      },
      peakDbfs: gainToDb(samplePeak(full.buffer)),
      truePeakDbtp: gainToDb(interpolatedPeak(full.buffer)),
      stems,
      wavBytes: wav.size,
    },
  };
}

async function renderScene(
  snapshot: Readonly<AudioSceneSnapshot>,
  seconds: number,
  minute: number,
  liveOverrides: AudioMixOverrides | null,
  solo: AudioStemName | null,
): Promise<{ buffer: AudioBuffer; engine: GardenAudioEngine }> {
  const ctx = new OfflineAudioContext(2, Math.round(seconds * RECORD_SAMPLE_RATE), RECORD_SAMPLE_RATE);
  const overrides = createAudioMixOverrides();
  if (liveOverrides) {
    Object.assign(overrides.trimDb, liveOverrides.trimDb);
    Object.assign(overrides.muted, liveOverrides.muted);
  }
  overrides.solo = solo;
  // The first phrase a second in, so a short render still hears the music stem.
  const engine = createGardenAudioEngine(ctx, snapshot, { music: true, overrides, firstPhraseAt: 1, logTargets: true });
  // Levels as the mix sheet states them: no consent fade in the measurement.
  engine.graph.masterFade.gain.value = 1;
  for (let at = 0; at <= seconds; at += AUDIO_TICK_SECONDS) {
    engine.tick(at, snapshot.timeSeconds + at, minute);
  }
  // Audition every named beat once, spread across the render (W7.3 costume review).
  GARDEN_SOUND_BEATS.forEach((beat, index) => {
    const at = seconds * (0.15 + 0.7 * (index / GARDEN_SOUND_BEATS.length));
    engine.playBeat(beat, at, index % 2 === 0 ? -0.3 : 0.3);
  });
  const buffer = await ctx.startRendering();
  return { buffer, engine };
}

function rms(buffer: AudioBuffer): number {
  let sum = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) sum += data[index] * data[index];
  }
  return Math.sqrt(sum / (buffer.length * buffer.numberOfChannels));
}

function samplePeak(buffer: AudioBuffer): number {
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) peak = Math.max(peak, Math.abs(data[index]));
  }
  return peak;
}

/** 4× Catmull-Rom interpolation between samples: a close true-peak estimate. */
function interpolatedPeak(buffer: AudioBuffer): number {
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 1; index < data.length - 2; index += 1) {
      const p0 = data[index - 1];
      const p1 = data[index];
      const p2 = data[index + 1];
      const p3 = data[index + 2];
      peak = Math.max(peak, Math.abs(p1));
      for (let step = 1; step < 4; step += 1) {
        const t = step / 4;
        const value = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
        peak = Math.max(peak, Math.abs(value));
      }
    }
  }
  return peak;
}

/** 16-bit PCM WAV. */
function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytes = new ArrayBuffer(44 + frames * channels * 2);
  const view = new DataView(bytes);
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + frames * channels * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, frames * channels * 2, true);
  const data = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, data[channel]![frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([bytes], { type: "audio/wav" });
}

/** Saves the render and prints the stem table (`?debug=1&audio=record:N`). */
export function deliverAudioRecord(report: AudioRecordReport, wav: Blob): void {
  const url = URL.createObjectURL(wav);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pharosville-audio-${report.seconds}s.wav`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  const format = (value: number | null) => (value === null ? "off" : value.toFixed(1));
  console.info(`[pharosville audio] ${report.seconds}s render: peak ${report.peakDbfs.toFixed(1)} dBFS, true peak ≈ ${report.truePeakDbtp.toFixed(1)} dBTP`);
  console.table(report.stems.map((row) => ({
    stem: row.stem,
    measure: row.measure,
    target: format(row.targetDb),
    measured: format(row.measuredDb),
    delta: format(row.deltaDb),
  })));
}
