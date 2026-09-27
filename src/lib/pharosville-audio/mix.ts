/**
 * W7.1 (sound-2): the mix sheet as data. Every level the engine sets comes
 * from here; code never inlines a level. Levels are dBFS at the stem bus,
 * before the master ceiling: RMS for beds, peak for events.
 *
 * `calm` / `storm` are the two ends of the sea-state ladder (the ledger's
 * "Sea state": swell from DEWS threat + PSI stress); the wind stems key on the
 * frame's wind speed instead, which the same stress drives. `null` = silent.
 */
export type AudioStemName = "sea" | "wash" | "lap" | "wind" | "whistle" | "air" | "music" | "beats";

export interface AudioStemLevel {
  measure: "rms" | "peak";
  calm: number | null;
  storm: number;
}

export const AUDIO_STEMS: readonly AudioStemName[] = ["sea", "wash", "lap", "wind", "whistle", "air", "music", "beats"];

export const AUDIO_MIX: Readonly<Record<AudioStemName, AudioStemLevel>> = Object.freeze({
  /** LP 380→900 Hz on the `water` breath; breath depth below. */
  sea: { measure: "rms", calm: -30, storm: -22 },
  /** BP 1.2 kHz, the same breath one tenth of a cycle later; sets every 5–7 breaths. */
  wash: { measure: "rms", calm: -36, storm: -26 },
  /** Stone lap × near detail: bursts on the `wakes` phase, 30 % skipped. */
  lap: { measure: "peak", calm: -34, storm: -30 },
  /** BP 250–1100 Hz from wind speed; the gust lifts it and travels across the stereo field. */
  wind: { measure: "rms", calm: -44, storm: -28 },
  /** Resonant band, only above wind speed 0.65 (storm). */
  whistle: { measure: "rms", calm: null, storm: -34 },
  /** Night air under the beacon × beacon presence; each pass toward the eye lifts it. */
  air: { measure: "rms", calm: -42, storm: -42 },
  /** Plucked string / breathy flute line (separate Music consent). Storm thins it. */
  music: { measure: "peak", calm: -30, storm: -39 },
  /** Named director beats (W7.3): identical for supply up and down. */
  beats: { measure: "peak", calm: -32, storm: -32 },
});

export const AUDIO_MASTER = Object.freeze({
  /** True-peak ceiling of the master safety shaper (G6: ≤ −6 dBTP). */
  ceilingDb: -6,
  /** Where the shaper's soft knee begins; below it the master is linear. */
  kneeDb: -9,
  /** Consent fade from silence after the Sound switch. */
  fadeInSeconds: 6,
  /** Hidden tab: fade to silence, then suspend (G6: muted within 0.7 s). */
  hiddenFadeSeconds: 0.6,
  /** Visible again: resume and rise. */
  resumeFadeSeconds: 2.5,
  /** Sound switched off: fade before the context closes. */
  stopFadeSeconds: 0.4,
  /** Breath depth of the sea body, ± dB: calm, storm, and under Still / reduced motion. */
  breathDepthDb: { calm: 3, storm: 6, still: 1 },
  /** Seeded per-breath amplitude spread and the "set" of bigger waves, dB. */
  breathSpreadDb: 2.5,
  setBoostDb: 2,
  /** The gust lifts the wind by up to this much. */
  gustBoostDb: 6,
  /** A beacon pass toward the eye lifts the night air by this much. */
  beaconPassDb: 3,
  /** The meteor is a held breath: the whole bed dips by this much. */
  meteorDipDb: -4,
  /** Reverb return and sends. */
  reverbReturnDb: -20,
  musicSendDb: -10,
  beatSendDb: -16,
  /** At most this many event voices (laps, beats) sound at once. */
  eventVoiceCap: 6,
});

/**
 * W7.3 (sound-4) named beats, peak dBFS on the `beats` stem. The arrival is
 * identical for a supply rise and fall; the meteor has no voice of its own —
 * it is the bed's `meteorDipDb`.
 */
export const BEAT_LEVEL_DB = Object.freeze({
  "arrival-luff": -32,
  fender: -32,
  "kindling-tock": -40,
  "heron-wings": -38,
});

/** Runtime overrides written by the `?debug=1` mixer: dB trims, mutes and one solo. */
export interface AudioMixOverrides {
  trimDb: Record<AudioStemName, number>;
  muted: Record<AudioStemName, boolean>;
  solo: AudioStemName | null;
}

export function createAudioMixOverrides(): AudioMixOverrides {
  const trimDb = {} as Record<AudioStemName, number>;
  const muted = {} as Record<AudioStemName, boolean>;
  for (const stem of AUDIO_STEMS) {
    trimDb[stem] = 0;
    muted[stem] = false;
  }
  return { trimDb, muted, solo: null };
}

/** The stem's nominal level for a state x∈[0,1] between calm and storm; −Infinity when silent. */
export function stemLevelDb(stem: AudioStemName, x: number): number {
  const level = AUDIO_MIX[stem];
  const t = Math.min(1, Math.max(0, x));
  if (level.calm === null) return t <= 0 ? Number.NEGATIVE_INFINITY : level.storm + 20 * Math.log10(t);
  return level.calm + (level.storm - level.calm) * t;
}

export function dbToGain(db: number): number {
  return db === Number.NEGATIVE_INFINITY ? 0 : 10 ** (db / 20);
}

export function gainToDb(gain: number): number {
  return gain > 0 ? 20 * Math.log10(gain) : Number.NEGATIVE_INFINITY;
}
