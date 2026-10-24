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
  strikeKm: [number, number];
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

/** An optional caller-owned target keeps the frame path allocation-free; standalone callers get a fresh value. */
export function targetsForLevel(level: number, out: WeatherTargets = {
  cloud: 0, wind: 0, gust: 0, steady: 0, shower: 0, showerOn: 0, strikesPerMin: 0, strikeKm: [0, 0], gloom: 0,
}): WeatherTargets {
  const l = Math.min(4, Math.max(0, level));
  out.cloud = Math.min(1, 0.15 + l * 0.22);
  out.wind = Math.min(1, 0.2 + l * 0.2);
  out.gust = 0.04 + 0.11 * l;
  out.steady = table(STEADY, l);
  out.shower = table(SHOWER, l);
  out.showerOn = smoothstep(1.2, 1.9, l);
  // lightning only from Warning up (2.6 = the Warning band's lower edge after rounding)
  out.strikesPerMin = l < 2.5 ? 0 : table(STRIKES, l) * smoothstep(2.5, 2.9, l);
  out.strikeKm[0] = lerp(12, 2.5, smoothstep(3, 4, l));
  out.strikeKm[1] = lerp(18, 9, smoothstep(3, 4, l));
  out.gloom = smoothstep(2.6, 4, l);
  return out;
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
  /** Rainbow strength 0..1 (recovery; by day, or a moonbow under a bright moon). */
  rainbow: number;
  /**
   * W01 the weather front crossing the bay (null when none): the DEWS level it brings (`to`), the level it
   * replaces (`from`) and how far it has swept, 0 = on the upwind horizon … 1 = past the downwind one.
   * Rising (to > from): a storm front with a shelf-cloud lip; easing: a clearing line.
   */
  front: FrontState | null;
  /**
   * W03 sunbreaks 0..1: the rain is easing off (a shower trough at Watch/Alert, a clearing front) or a recovery
   * is fresh — sunlit patches drift over a shadowed land. Decorative aftermath of a DEWS easing; never at Danger.
   */
  breaks: number;
  /**
   * W09 the passing squall at Watch/Alert: the shower cell as a place. `pos` 0 = on the upwind horizon,
   * 1 = overhead (the shower's crest, when it rains here), 2 = on the downwind horizon; `k` its strength.
   */
  squall: { pos: number; k: number };
  /** The last recovery seen during the visit (≥ Alert → ≤ Watch), or null. */
  recovery: { fromBand: WeatherBand; atSec: number } | null;
}

export interface FrontState { readonly from: number; readonly to: number; readonly progress: number }

/**
 * A new reading at least this far (DEWS levels, supply-weighted) from the weather being shown sends a front
 * across the bay; smaller moves just ease in place. Also the threshold of the Storm panel's trend line.
 */
export const FRONT_MIN = 0.35;
/** Seconds a front takes to cross from the upwind to the downwind horizon. */
export const FRONT_SEC = 70;
/** Where the front is overhead (progress) — the local weather turns over this span. */
export const FRONT_HERE: readonly [number, number] = [0.32, 0.72];

export const bandOfLevel = (level: number): WeatherBand =>
  (["CALM", "WATCH", "ALERT", "WARNING", "DANGER"] as const)[Math.min(4, Math.max(0, Math.round(level)))];

/** W07 moonbow gate: the moon's illuminated fraction × night (a moonbow needs a bright moon, ≥ ~40 %). */
export const moonbowLight = (illumination: number, night: number): number => smoothstep(0.35, 0.5, illumination) * smoothstep(0.5, 0.9, night);

/**
 * The DOM twin of the recovery rainbow / moonbow (same window, same words): "Recovered from Alert 3 min ago"
 * while the recovery window lasts (RAINBOW_SEC), null otherwise.
 */
export function recoveryLine(rec: { fromBand: WeatherBand; atSec: number } | null, nowSec: number): string | null {
  if (!rec) return null;
  const ago = nowSec - rec.atSec;
  if (ago < 0 || ago > RAINBOW_SEC) return null;
  const min = Math.round(ago / 60);
  return `Recovered from ${rec.fromBand[0]}${rec.fromBand.slice(1).toLowerCase()} ${min < 1 ? "just now" : `${min} min ago`}`;
}

/**
 * The Storm panel's trend line (the DOM twin of the visible front, same words): "rising toward Alert" while
 * a storm front crosses, "easing toward Watch" while a clearing line does; null when the weather is settled.
 */
export function stormTrend(front: FrontState | null): { dir: "rising" | "easing"; toward: WeatherBand; text: string } | null {
  if (!front || front.progress >= 1 || Math.abs(front.to - front.from) < FRONT_MIN) return null;
  const dir = front.to > front.from ? "rising" : "easing";
  const toward = bandOfLevel(front.to);
  return { dir, toward, text: `${dir} toward ${toward[0]}${toward.slice(1).toLowerCase()}` };
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
  /** W07: 0 … 1 a bright moon up at night (illumination gated): a recovery at night hangs a moonbow. */
  moonUp?: number;
  /** ?rainbow=1 */
  forceRainbow?: boolean;
  /** Reduced motion: no sweeping front, the weather eases in place. */
  still?: boolean;
  /** Dev ?frontAt=: hold a front at this progress (0..1). */
  frontPin?: number | undefined;
  /** Dev ?breaks=1: open the sunbreaks. */
  forceBreaks?: boolean;
  /** Dev ?squall=0..2: hold the squall there. */
  squallPin?: number | undefined;
}

/** Easing time constants (s). */
export const TAU = { cloud: 25, wind: 15, precipUp: 20, precipDown: 45, wetUp: 40, dry: 240, rainbowIn: 10, rainbowOut: 25 } as const;
/** How long a recovery rainbow stays (s). */
export const RAINBOW_SEC = 210;

const ease = (cur: number, goal: number, dt: number, tau: number) => cur + (goal - cur) * (1 - Math.exp(-dt / tau));

export class WeatherDirector {
  readonly state: WeatherState = {
    level: null, band: null, cloud: 0.38, wind: 0.3, windNow: 0.3, precip: 0, rain: 0, snow: 0,
    strikesPerMin: 0, strikeKm: [12, 18], gloom: 0, wetness: 0, rainbow: 0, front: null, recovery: null,
    breaks: 0, squall: { pos: 0, k: 0 },
  };
  private front: { from: number; to: number; progress: number } | null = null;
  private shown: number | null = null;
  private lastBandLevel: number | null = null;
  private rainbowLeft = 0;
  private snowS = 0;
  private readonly targets = targetsForLevel(0);

  /** Jump straight to the weather of `input` (first reading, dev overrides): no 60 s wait. */
  snap(input: DirectorInput): void {
    if (input.level == null) return;
    this.shown = input.level;
    this.front = null; this.state.front = null;
    const t = targetsForLevel(input.level, this.targets);
    const s = this.state;
    s.cloud = t.cloud; s.wind = t.wind; s.gloom = t.gloom; s.strikesPerMin = t.strikesPerMin;
    s.strikeKm[0] = t.strikeKm[0]; s.strikeKm[1] = t.strikeKm[1];
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
    s.windNow = clamp01(s.wind + (this.shown == null ? 0 : this.targets.gust) * gustEnvelope(input.time) * (0.4 + 0.6 * s.wind));
  }

  step(dt: number, input: DirectorInput): WeatherState {
    const s = this.state;
    if (input.level != null) {
      if (this.shown == null) { this.snap(input); return s; }
      // W01: a reading far enough from the weather shown sends a front across from the upwind horizon (a
      // clearing line when easing); the local weather turns as it passes overhead. Smaller moves, and reduced
      // motion, ease in place: the shown level moves slowly, so every channel crosses the bands in order.
      const f = this.front;
      if (f && Math.abs(input.level - f.to) > 0.1) this.front = null;
      if (!this.front && !input.still && Math.abs(input.level - this.shown) >= FRONT_MIN) {
        this.front = { from: this.shown, to: input.level, progress: 0 };
      }
      const fr = this.front;
      if (fr) {
        fr.progress = input.frontPin != null ? clamp01(input.frontPin) : Math.min(1, fr.progress + dt / FRONT_SEC);
        this.shown = lerp(fr.from, fr.to, smoothstep(FRONT_HERE[0], FRONT_HERE[1], fr.progress));
        if (fr.progress >= 1) { this.shown = fr.to; this.front = null; }
      } else {
        this.shown = ease(this.shown, input.level, dt, TAU.cloud);
      }
      // a recovery seen during the visit: from ≥ Alert to ≤ Watch
      const bandLevel = input.band ? DEWS_LEVELS[input.band] : Math.round(input.level);
      if (this.lastBandLevel != null && this.lastBandLevel >= 2 && bandLevel <= 1) {
        this.rainbowLeft = RAINBOW_SEC;
        s.recovery = { fromBand: bandOfLevel(this.lastBandLevel), atSec: input.time };
      }
      this.lastBandLevel = bandLevel;
    }
    s.level = this.shown;
    s.band = input.band;
    s.front = this.front;
    if (this.shown != null) {
      const t = targetsForLevel(this.shown, this.targets);
      // the shown level already eases (TAU.cloud): the deck, gloom and lightning follow it directly
      s.cloud = t.cloud; s.gloom = t.gloom; s.strikesPerMin = t.strikesPerMin;
      s.strikeKm[0] = t.strikeKm[0]; s.strikeKm[1] = t.strikeKm[1];
      s.wind = ease(s.wind, t.wind, dt, TAU.wind);
      const goal = this.precipGoal(t, input.time);
      s.precip = ease(s.precip, goal, dt, goal > s.precip ? TAU.precipUp : TAU.precipDown);
      // W03: breaks open while the rain falls away faster than it lingers (or a recovery is fresh)
      const easing = smoothstep(0.03, 0.15, s.precip - goal) * smoothstep(0.02, 0.1, s.precip + s.wetness * 0.3);
      const wantBreaks = Math.max(easing, this.rainbowLeft > 0 || input.forceBreaks ? 1 : 0) * (1 - smoothstep(0.8, 0.95, t.cloud));
      s.breaks = ease(s.breaks, wantBreaks, dt, 5);
      // W09: the squall walks in with the shower cell's rise and away with its fall
      const env = showerEnvelope(input.time, t.showerOn), next = showerEnvelope(input.time + 1, t.showerOn);
      s.squall.pos = input.squallPin ?? (next >= env ? env : 2 - env);
      s.squall.k = smoothstep(0.05, 0.2, t.shower) * (1 - smoothstep(0.3, 0.6, t.steady));
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
    const want = (input.forceRainbow || this.rainbowLeft > 0 ? 1 : 0) * Math.max(smoothstep(0.15, 0.5, input.sunUp), input.moonUp ?? 0) *
      (input.forceRainbow ? 1 : 1 - smoothstep(0.25, 0.5, s.precip)) * (1 - smoothstep(0.55, 0.75, s.cloud));
    s.rainbow = ease(s.rainbow, want, dt, want > s.rainbow ? TAU.rainbowIn : TAU.rainbowOut);
    if (s.rainbow < 1e-3 && want === 0) s.rainbow = 0;
    return s;
  }

  /** Seconds of recovery rainbow left (tests / UI). */
  get rainbowRemaining(): number { return this.rainbowLeft; }
}
