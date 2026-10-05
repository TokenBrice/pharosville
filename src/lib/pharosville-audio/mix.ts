/**
 * W7.1 (sound-2): the mix sheet as data. Every level the engine sets comes
 * from here; code never inlines a level. Levels are dBFS at the stem bus,
 * before the master ceiling: RMS for beds, peak for events.
 *
 * `calm` / `storm` are the two ends of the sea-state ladder (the ledger's
 * "Sea state": swell from DEWS threat + PSI stress); the wind stems key on the
 * frame's wind speed instead, which the same stress drives. `null` = silent.
 */
export type AudioStemName = "sea" | "wash" | "lap" | "wind" | "whistle" | "air" | "borrowed" | "music" | "beats";

export interface AudioStemLevel {
  measure: "rms" | "peak";
  calm: number | null;
  storm: number;
}

export const AUDIO_STEMS: readonly AudioStemName[] = ["sea", "wash", "lap", "wind", "whistle", "air", "borrowed", "music", "beats"];

export const AUDIO_MIX: Readonly<Record<AudioStemName, AudioStemLevel>> = Object.freeze({
  /** LP 380→900 Hz on the `water` breath; breath depth below. */
  sea: { measure: "rms", calm: -30, storm: -22 },
  /** BP 1.2 kHz, the same breath one tenth of a cycle later; sets every 5–7 breaths. */
  wash: { measure: "rms", calm: -36, storm: -26 },
  /** Shore laps and quiet inharmonic basin drips share this event budget and bus. */
  lap: { measure: "peak", calm: -34, storm: -30 },
  /** Pine rustle from the real root gust replaces part of the broad wind hiss. */
  wind: { measure: "rms", calm: -44, storm: -28 },
  /** Resonant band, only above wind speed 0.65 (storm). */
  whistle: { measure: "rms", calm: null, storm: -34 },
  /** Night air under the beacon × beacon presence; each pass toward the eye lifts it. */
  air: { measure: "rms", calm: -42, storm: -42 },
  /**
   * X8 borrowed sound (sound-5): far events from beyond the frame — a bell
   * buoy rocking off the harbour mouth, a wash breaking on the outer rocks.
   * Rare (≤ 1 per 10 min, through the director's environment slot), mostly reverb.
   */
  borrowed: { measure: "peak", calm: -38, storm: -34 },
  /** Soft mallet above, low round string below (separate Music consent). Storm thins it. */
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
  /** Breath depth of the sea body, ± dB; Still never runs an audio clock. */
  breathDepthDb: { calm: 3, storm: 6 },
  /** Seeded per-breath amplitude spread and the "set" of bigger waves, dB. */
  breathSpreadDb: 2.5,
  setBoostDb: 2,
  /** The gust lifts the wind by up to this much. */
  gustBoostDb: 6,
  /** Night hush from the visual blue/night score, not another hour clock. */
  nightBedDb: -4,
  borrowedNightDb: -8,
  /** Salience displacement: reduce shore lap/wash and hiss to fund basin and pine detail. */
  shoreDisplacementDb: -3,
  windHissDisplacementDb: -4,
  basinTrimDb: -3,
  rustleTrimDb: -5,
  /** A beacon pass toward the eye lifts the night air by this much. */
  beaconPassDb: 3,
  /** The meteor is a held breath: the whole bed dips by this much. */
  meteorDipDb: -4,
  /** Reverb return and sends. */
  reverbReturnDb: -20,
  musicSendDb: -10,
  beatSendDb: -16,
  /** Far sounds are mostly room: a strong send. */
  borrowedSendDb: -4,
  /**
   * X8 listening pose (sound-7): idle in Stay with sound on, the near bed
   * steps back and the far sounds come forward, slowly; any input returns it.
   */
  listen: { nearDb: -2, farDb: 2, idleSeconds: 8, inSeconds: 20, outSeconds: 4 },
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
