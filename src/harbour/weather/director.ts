/**
 * WEATHER DIRECTOR (pure, unit-tested): the supply-weighted DEWS level → the weather the world eases
 * toward. STORMINESS IS DATA (research/04 §3: "no random weather, so a storm always means data"):
 *
 *   Calm    0  fair sky, light air, nothing falls
 *   Watch   1  scattered cloud, a fresh breeze, at most a brief passing drizzle (or flurries)
 *   Alert   2  overcast, passing showers
 *   Warning 3  heavy rain (snow in winter), gusts, distant lightning
 *   Danger  4  full storm: lightning and thunder, driving rain or snow, whitecaps and spray, darkened light
 *
 * The level is continuous (2.4 sits between Alert and Warning). The SEASON (calendar, declared
 * decorative) picks only the precipitation TYPE; its INTENSITY is the band. Everything eases over
 * 20–60 s (no popping); precipitation lingers and wetness dries slowly after the rain. A recovery from
 * ≥ Alert to ≤ Watch seen during the visit hangs a rainbow over the harbour for a few minutes (daylight
 * only): honest recovery, never replayed on load.
 */

export const DEWS_LEVELS = { CALM: 0, WATCH: 1, ALERT: 2, WARNING: 3, DANGER: 4 } as const;
export type WeatherBand = keyof typeof DEWS_LEVELS;
export type Season = "spring" | "summer" | "autumn" | "winter";
/** Season weights in contract order: spring, summer, autumn, winter (sum 1). */
export type SeasonWeights = readonly [number, number, number, number];

/** What one level asks of the sky, wind, rain and lightning (before easing). */
export interface WeatherTargets {
  /** Cloud cover 0..1 (the sky's deck; same law as model/readings.ts weatherReading). */
  cloud: number;
  /** Mean wind 0..1 (same law as the model). */
  wind: number;
  /** Gust amplitude 0..1 added on top of the mean in gust cells. */
  gust: number;
  /** Steady precipitation 0..1 (Warning / Danger). */
  steady: number;
  /** Peak of the passing showers 0..1 (Watch drizzle, Alert showers). */
  shower: number;
  /** Showers are brief at Watch (only the top of each cell rains) and long at Alert. */
  showerOn: number;
  /** Lightning strikes per minute (0 below Warning). */
  strikesPerMin: number;
  /** Strike distance range (km) — thunder delay ∝ distance. */
  strikeKm: readonly [number, number];
  /** Extra darkening of the day light beyond the overcast (Danger's "darkened light"), 0..1. */
  gloom: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smoothstep = (e0: number, e1: number, x: number) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

/** Piecewise-linear table over the integer levels 0..4. */
function table(v: readonly number[], level: number): number {
  const l = Math.min(4, Math.max(0, level));
  const i = Math.min(3, Math.floor(l));
  return lerp(v[i], v[i + 1], l - i);
}

const STEADY = [0, 0, 0.1, 0.62, 1] as const;
const SHOWER = [0, 0.14, 0.5, 0.3, 0] as const;
const STRIKES = [0, 0, 0, 1.6, 7.5] as const;

export function targetsForLevel(level: number): WeatherTargets {
  const l = Math.min(4, Math.max(0, level));
  return {
    cloud: Math.min(1, 0.15 + l * 0.22),
    wind: Math.min(1, 0.2 + l * 0.2),
    gust: 0.04 + 0.11 * l,
    steady: table(STEADY, l),
    shower: table(SHOWER, l),
    showerOn: smoothstep(1.2, 1.9, l),
    // lightning only from Warning up (2.6 = the Warning band's lower edge after rounding)
    strikesPerMin: l < 2.5 ? 0 : table(STRIKES, l) * smoothstep(2.5, 2.9, l),
    strikeKm: [lerp(12, 2.5, smoothstep(3, 4, l)), lerp(18, 9, smoothstep(3, 4, l))],
    gloom: smoothstep(2.6, 4, l),
  };
}

/**
 * Passing shower cells: a slow deterministic wave 0..1 (two incommensurate periods, ~2–4 min).
 * Brief at Watch (only the crest rains), long at Alert.
 */
export function showerEnvelope(timeSec: number, showerOn: number): number {
  const cell = 0.5 + 0.3 * Math.sin(timeSec * (2 * Math.PI / 170) + 1.3) + 0.2 * Math.sin(timeSec * (2 * Math.PI / 71) + 0.4);
  const brief = smoothstep(0.76, 0.95, cell);
  const long = smoothstep(0.22, 0.6, cell);
  return lerp(brief, long, showerOn);
}

/** Gust cells: 0..1, a few seconds each. */
export function gustEnvelope(timeSec: number): number {
  const g = Math.sin(timeSec * 0.61) * 0.5 + Math.sin(timeSec * 1.37 + 1.1) * 0.3 + Math.sin(timeSec * 0.23 + 2.2) * 0.2;
  return smoothstep(0.15, 0.85, g * 0.5 + 0.5);
}

/** Snow share of the precipitation from the season (winter snows; a late-autumn / early-spring edge mixes). */
export function snowShare(weights: SeasonWeights): number {
  return smoothstep(0.45, 0.8, weights[3]);
}

/** Calendar season fallback (when no 'season' service): month 1..12, southern hemisphere flips it. */
export function seasonForMonth(month: number, southern: boolean): Season {
  const m = ((((month - 1 + (southern ? 6 : 0)) % 12) + 12) % 12) + 1;
  return m === 12 || m <= 2 ? "winter" : m <= 5 ? "spring" : m <= 8 ? "summer" : "autumn";
}

export function weightsForSeason(s: Season): SeasonWeights {
  return s === "spring" ? [1, 0, 0, 0] : s === "summer" ? [0, 1, 0, 0] : s === "autumn" ? [0, 0, 1, 0] : [0, 0, 0, 1];
}

/** The eased state the world reads every frame. */
export interface WeatherState {
  /** Continuous DEWS level being shown (eased), or null before any reading. */
  level: number | null;
  band: WeatherBand | null;
  cloud: number;
  wind: number;
  /** Wind incl. gusts now (what flags, smoke and spray feel). */
  windNow: number;
  /** Precipitation intensity 0..1 (rain + snow). */
  precip: number;
  /** Split of `precip`: rain, snow. */
  rain: number;
  snow: number;
  strikesPerMin: number;
  strikeKm: [number, number];
  gloom: number;
  /** Surfaces' wetness 0..1: rises in rain, dries slowly. */
  wetness: number;
  /** Rainbow strength 0..1 (recovery, daylight only). */
  rainbow: number;
}

export interface DirectorInput {
  /** Continuous DEWS level, or null when there is no stress reading (the weather holds, never paints calm). */
  level: number | null;
  band: WeatherBand | null;
  snowShare: number;
  /** 0 night … 1 the sun well up: the rainbow needs the sun. */
  sunUp: number;
  /** Seconds since start (for shower and gust cells). */
  time: number;
  /** ?rainbow=1 */
  forceRainbow?: boolean;
}

/** Easing time constants (s). */
export const TAU = { cloud: 25, wind: 15, precipUp: 20, precipDown: 45, wetUp: 40, dry: 240, rainbowIn: 10, rainbowOut: 25 } as const;
/** How long a recovery rainbow stays (s). */
export const RAINBOW_SEC = 210;

const ease = (cur: number, goal: number, dt: number, tau: number) => cur + (goal - cur) * (1 - Math.exp(-dt / tau));

export class WeatherDirector {
  readonly state: WeatherState = {
    level: null, band: null, cloud: 0.38, wind: 0.3, windNow: 0.3, precip: 0, rain: 0, snow: 0,
    strikesPerMin: 0, strikeKm: [12, 18], gloom: 0, wetness: 0, rainbow: 0,
  };
  private shown: number | null = null;
  private lastBandLevel: number | null = null;
  private rainbowLeft = 0;
  private snowS = 0;

  /** Jump straight to the weather of `input` (first reading, dev overrides): no 60 s wait. */
  snap(input: DirectorInput): void {
    if (input.level == null) return;
    this.shown = input.level;
    const t = targetsForLevel(input.level);
    const s = this.state;
    s.cloud = t.cloud; s.wind = t.wind; s.gloom = t.gloom; s.strikesPerMin = t.strikesPerMin;
    s.strikeKm = [t.strikeKm[0], t.strikeKm[1]];
    this.snowS = input.snowShare;
    const p = this.precipGoal(t, input.time);
    s.precip = p;
    s.wetness = clamp01(p * (1 - input.snowShare) * 1.6);
    this.lastBandLevel = input.band ? DEWS_LEVELS[input.band] : Math.round(input.level);
    this.split(input);
  }

  private precipGoal(t: WeatherTargets, time: number): number {
    return clamp01(t.steady + t.shower * showerEnvelope(time, t.showerOn));
  }

  private split(input: DirectorInput): void {
    const s = this.state;
    s.snow = s.precip * this.snowS;
    s.rain = s.precip - s.snow;
    s.windNow = clamp01(s.wind + (this.shown == null ? 0 : targetsForLevel(this.shown).gust) * gustEnvelope(input.time) * (0.4 + 0.6 * s.wind));
  }

  step(dt: number, input: DirectorInput): WeatherState {
    const s = this.state;
    if (input.level != null) {
      if (this.shown == null) { this.snap(input); return s; }
      // the shown level itself moves slowly, so every channel crosses the bands in order
      this.shown = ease(this.shown, input.level, dt, TAU.cloud);
      // a recovery seen during the visit: from ≥ Alert to ≤ Watch
      const bandLevel = input.band ? DEWS_LEVELS[input.band] : Math.round(input.level);
      if (this.lastBandLevel != null && this.lastBandLevel >= 2 && bandLevel <= 1) this.rainbowLeft = RAINBOW_SEC;
      this.lastBandLevel = bandLevel;
    }
    s.level = this.shown;
    s.band = input.band;
    if (this.shown != null) {
      const t = targetsForLevel(this.shown);
      // the shown level already eases (TAU.cloud): the deck, gloom and lightning follow it directly
      s.cloud = t.cloud; s.gloom = t.gloom; s.strikesPerMin = t.strikesPerMin;
      s.strikeKm[0] = t.strikeKm[0]; s.strikeKm[1] = t.strikeKm[1];
      s.wind = ease(s.wind, t.wind, dt, TAU.wind);
      const goal = this.precipGoal(t, input.time);
      s.precip = ease(s.precip, goal, dt, goal > s.precip ? TAU.precipUp : TAU.precipDown);
    }
    this.snowS = ease(this.snowS, input.snowShare, dt, 30);
    // wetness: soaks in rain (snow lies, it does not wet), dries slowly once it stops
    const rainNow = s.precip * (1 - this.snowS);
    s.wetness = rainNow > 0.04
      ? ease(s.wetness, Math.min(1, 0.35 + rainNow), dt, TAU.wetUp / (0.4 + rainNow))
      : ease(s.wetness, 0, dt, TAU.dry);
    this.split(input);
    // rainbow: the recovery window (or the dev switch), daylight only, once the rain has thinned
    this.rainbowLeft = Math.max(0, this.rainbowLeft - dt);
    const want = (input.forceRainbow || this.rainbowLeft > 0 ? 1 : 0) * smoothstep(0.15, 0.5, input.sunUp) *
      (input.forceRainbow ? 1 : 1 - smoothstep(0.25, 0.5, s.precip)) * (1 - smoothstep(0.55, 0.75, s.cloud));
    s.rainbow = ease(s.rainbow, want, dt, want > s.rainbow ? TAU.rainbowIn : TAU.rainbowOut);
    if (s.rainbow < 1e-3 && want === 0) s.rainbow = 0;
    return s;
  }

  /** Seconds of recovery rainbow left (tests / UI). */
  get rainbowRemaining(): number { return this.rainbowLeft; }
}
