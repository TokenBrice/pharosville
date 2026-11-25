import * as THREE from "three";
import type { WorldUniforms } from "./uniforms";

/**
 * Visitor-local time of day (declared decorative, PLAN §4.1). `?t=<hour>` (or `#t=`) pins it for
 * reproducible gate frames; `?speed=<x>` accelerates for review.
 *
 * Keyframes are ported from style C "Northern Light" (p1/style-c/palette.json `time_of_day` +
 * nl_world.py STATE): noon 12, golden 18.5, night 22, plus authored dawn / afternoon / dusk / blue hour.
 * Units follow the Blender scene so the port is 1:1 with three's physically-correct lights:
 *   sun/fill strength = Blender W/m² = three DirectionalLight intensity;
 *   world strength k = three HemisphereLight intensity / π (we store radiance; the light × π);
 *   emission strengths (lamp, lens, windows) = Blender emission strength = three emissive radiance;
 *   exposure = Blender film exposure in stops (applied as renderer.toneMappingExposure = 2^stops).
 * Angles use style C's Blender convention (azimuth from +X counter-clockwise, camera at az 225°) and
 * are converted so the light keeps the same relation to the runtime camera (yaw 45°).
 */
export interface Grade {
  lift: [number, number, number];
  gamma: [number, number, number];
  gain: [number, number, number];
  saturation: number;
  /** AgX "Medium High Contrast"-like S-curve strength in display space (1 = none). */
  contrast: number;
  /** Saturation multiplier for the darkest tones, blended to 1 by mid-grey (night: shadows go slate, lights stay warm). */
  shadowSat?: number;
  /** Saturation multiplier for cyan→blue hues (the sea and sky recede; 1 = none). */
  blueSat?: number;
  /** Saturation multiplier for red→green hues (roofs, brand sails, vegetation carry the colour; 1 = none). */
  warmSat?: number;
}

export interface TimeKeyframe {
  hour: number;
  sunColor: string; sunIntensity: number;
  ambient: string; zenith: string; horizon: string; haze: string;
  fogDensity: number; night: number; windowGlow: number;
  // ---- style C port (optional so other agents can author partial keyframes; defaults below)
  /** Key light azimuth / elevation, degrees, style C Blender convention. */
  sunAz?: number; sunEl?: number;
  fillColor?: string; fillIntensity?: number; fillAz?: number; fillEl?: number;
  /** World light: sky-side / ground-side radiance colours and Blender world strength. */
  hemiSky?: string; hemiGround?: string; worldK?: number;
  exposure?: number;
  /** pmndrs bloom intensity / luminance threshold (scene-linear). */
  bloom?: [number, number];
  lamp?: number; lens?: number;
  grade?: Grade;
  /** Share of windows lit (deterministic per window). Default follows windowGlow. */
  windowOcc?: number;
  /** Moonlight fill on kit/fleet albedo (linear radiance), so hulls and sail covers stay readable at night. */
  nightLift?: number;
}

const G0: Grade = { lift: [1, 1, 1], gamma: [1, 1, 1], gain: [1, 1, 1], saturation: 1, contrast: 1 };
const BLOOM0: [number, number] = [0.5, 1.5];

/**
 * E03a hero value lock (O1-I1 at the O10 full strength): the day keys' horizon and haze are their authored colours
 * × DAY_AIR in linear light (≈ −18 % sRGB), so the band and far sea behind the Pharos sit a step below its lit
 * limewash. One air: the sky card, the sea's haze and reflection, the aerial tint and the stale bank all read
 * these uniforms. Dawn, golden, dusk and night keys keep their own light.
 */
export const DAY_AIR = 0.64;
/**
 * The morning (8.5) key: on a short day the 9:00 sun stands low behind the Pharos, so its air is a step clearer
 * than noon's (× MORNING_AIR on top of DAY_AIR) and its key a touch stronger (4.8, the afternoon's): the back-lit
 * tower holds its band. Dawn, noon and the afternoon keep their air.
 */
export const MORNING_AIR = 0.85;
const dayAir = (hex: string, k = 1): string => `#${new THREE.Color(hex).multiplyScalar(DAY_AIR * k).getHexString()}`;

/**
 * Night (style C night still): deep navy-teal value structure. The sky is slate-indigo with a dark zenith,
 * so the sea (which reflects it) sits around 10–15 % value and the land, lit by a desaturated moon key
 * plus the moon fill (nightLift), reads slightly ABOVE the sea; warm lamps and windows carry the colour.
 */
const NIGHT: Omit<TimeKeyframe, "hour"> = {
  sunColor: "#B6C9F0", sunIntensity: 1.65, sunAz: 50, sunEl: 26,
  fillColor: "#5C70A8", fillIntensity: 0.22, fillAz: 230, fillEl: 40,
  hemiSky: "#1C2B4D", hemiGround: "#25304C", worldK: 1.16,
  ambient: "#1C2844", zenith: "#040718", horizon: "#1D2740", haze: "#151C30",
  fogDensity: 0.0012, night: 1, windowGlow: 1, exposure: 0.42, bloom: [0.68, 1.0], lamp: 44, lens: 15,
  windowOcc: 0.46, nightLift: 0.048,
  grade: { lift: [0.98, 0.988, 1.035], gamma: [0.98, 1.0, 1.02], gain: [1.05, 1.0, 0.96], saturation: 1.08, contrast: 1.35, shadowSat: 0.66, blueSat: 0.86, warmSat: 1.12 },
};

export const DEFAULT_KEYFRAMES: TimeKeyframe[] = [
  { hour: 0, ...NIGHT, windowOcc: 0.2 },
  { hour: 4.6, ...NIGHT, night: 0.95, windowGlow: 0.85, windowOcc: 0.12 },
  // polish #6 first light (~35 min before sunrise): the mirror of dusk, a rose-peach band on the horizon under a
  // clear blue zenith, the sun's glow just warming the tower tops, lamps still lit; cool blue shade, not lavender-grey
  { hour: 5.5, sunColor: "#FF875A", sunIntensity: 1.7, sunAz: 60, sunEl: 1.5,
    fillColor: "#647EC8", fillIntensity: 0.32, fillAz: 200, fillEl: 35,
    hemiSky: "#4E65A8", hemiGround: "#9A8484", worldK: 0.72,
    ambient: "#4E65A8", zenith: "#32478B", horizon: "#F4A88A", haze: "#96889A",
    fogDensity: 0.0011, night: 0.5, windowGlow: 0.62, exposure: 0.36, bloom: [0.76, 1.08], lamp: 18, lens: 9,
    windowOcc: 0.42, nightLift: 0.03,
    grade: { lift: [0.985, 0.99, 1.05], gamma: [1, 1, 1.02], gain: [1.055, 1.0, 0.945], saturation: 1.18, contrast: 1.32, shadowSat: 0.86, blueSat: 0.93, warmSat: 1.12 } },
  // dawn: low warm sun behind the island (back light). Polish #6: the golden hour's warm/cool split at the other end
  // of the day: a peach key and warm sunlit side against clear cool-blue shade and sky, no lavender-grey wash
  { hour: 6.4, sunColor: "#FFA470", sunIntensity: 4.3, sunAz: 62, sunEl: 5,
    fillColor: "#7290D8", fillIntensity: 0.36, fillAz: 200, fillEl: 35,
    hemiSky: "#708BC4", hemiGround: "#C49E90", worldK: 0.6,
    ambient: "#708BC4", zenith: "#4B6DB0", horizon: "#FAC8A4", haze: "#D2B2A6",
    fogDensity: 0.0011, night: 0.25, windowGlow: 0.35, exposure: 0.28, bloom: [0.62, 1.25], lamp: 6, lens: 6,
    windowOcc: 0.3, nightLift: 0.012,
    grade: { lift: [0.985, 0.995, 1.045], gamma: [1, 1, 1], gain: [1.055, 1.0, 0.945], saturation: 1.22, contrast: 1.30, blueSat: 0.91, warmSat: 1.10 } },
  { hour: 8.5, sunColor: "#FFE4C6", sunIntensity: 4.9, sunAz: 110, sunEl: 30,
    fillColor: "#9ABCEB", fillIntensity: 0.4, fillAz: 250, fillEl: 40,
    hemiSky: "#7EA2CA", hemiGround: "#C8C8BE", worldK: 0.58,
    ambient: "#7EA2CA", zenith: "#4E88CC", horizon: dayAir("#E6EEF0", MORNING_AIR), haze: dayAir("#C2D3DC", MORNING_AIR),
    fogDensity: 0.00055, night: 0, windowGlow: 0, exposure: 0.04, bloom: [0.32, 1.92], lamp: 0.4, lens: 3,
    grade: { lift: [0.985, 0.99, 1.005], gamma: [1, 1, 1], gain: [1.018, 1, 0.985], saturation: 1.13, contrast: 1.34, blueSat: 0.84, warmSat: 1.09 } },
  // noon (palette.json time_of_day.noon) — crisp Aegean sun brilliance against luminous sapphire sky fill
  { hour: 12, sunColor: "#FFF0DA", sunIntensity: 4.85, sunAz: 160, sunEl: 58,
    fillColor: "#9ABCEB", fillIntensity: 0.36, fillAz: 30, fillEl: 40,
    hemiSky: "#7D9EC8", hemiGround: "#CAC8BA", worldK: 0.56,
    ambient: "#7D9EC8", zenith: "#4B84CA", horizon: dayAir("#E8F1F4"), haze: dayAir("#BCD3DF"),
    fogDensity: 0.00045, night: 0, windowGlow: 0, exposure: 0, bloom: [0.28, 1.98], lamp: 0.4, lens: 3,
    grade: { lift: [0.982, 0.985, 1.0], gamma: [1, 1, 1], gain: [1.015, 1, 0.988], saturation: 1.12, contrast: 1.37, blueSat: 0.84, warmSat: 1.08 } },
  { hour: 16, sunColor: "#FFE0B4", sunIntensity: 5.0, sunAz: 240, sunEl: 30,
    fillColor: "#88A4DF", fillIntensity: 0.34, fillAz: 80, fillEl: 38,
    hemiSky: "#7D97C2", hemiGround: "#C8C2B8", worldK: 0.57,
    ambient: "#7D97C2", zenith: "#4C78BE", horizon: dayAir("#F2E6D6"), haze: dayAir("#C9C6C8"),
    fogDensity: 0.0008, night: 0, windowGlow: 0, exposure: 0.08, bloom: [0.36, 1.75], lamp: 0.8, lens: 3.5,
    grade: { lift: [0.982, 0.988, 1.015], gamma: [1, 1, 1], gain: [1.035, 1, 0.968], saturation: 1.15, contrast: 1.35, blueSat: 0.86, warmSat: 1.10 } },
  // golden (palette.json time_of_day.golden) — sculpted apricot-gold key against luminous Mediterranean cerulean-indigo shadows
  { hour: 18.5, sunColor: "#FF9D4E", sunIntensity: 5.95, sunAz: 288, sunEl: 9,
    fillColor: "#6A88D6", fillIntensity: 0.34, fillAz: 110, fillEl: 35,
    hemiSky: "#7288C2", hemiGround: "#B8988E", worldK: 0.58,
    ambient: "#7288C2", zenith: "#435C9C", horizon: "#FFD8A8", haze: "#CFAFA6",
    fogDensity: 0.0009, night: 0.05, windowGlow: 0.2, exposure: 0.24, bloom: [0.50, 1.35], lamp: 4.5, lens: 5.5,
    windowOcc: 0.5,
    grade: { lift: [0.985, 0.995, 1.045], gamma: [1, 1, 1], gain: [1.06, 1.0, 0.93], saturation: 1.22, contrast: 1.31, blueSat: 0.88, warmSat: 1.08 } },
  // 01-A8 golden hold: the warm key lasts until ~40 min before sunset, the sun lower and deeper (real hours: see
  // seasonalKeyHour), so the most screenshot-worthy light is a window, not an instant
  { hour: 19.2, sunColor: "#FF8D44", sunIntensity: 5.1, sunAz: 293, sunEl: 5,
    fillColor: "#6480CE", fillIntensity: 0.34, fillAz: 115, fillEl: 35,
    hemiSky: "#687EBA", hemiGround: "#B08E86", worldK: 0.6,
    ambient: "#687EBA", zenith: "#3C5394", horizon: "#FFCB98", haze: "#C9A59E",
    fogDensity: 0.001, night: 0.1, windowGlow: 0.32, exposure: 0.26, bloom: [0.56, 1.28], lamp: 8, lens: 6.5,
    windowOcc: 0.56,
    grade: { lift: [0.985, 0.995, 1.045], gamma: [1, 1, 1], gain: [1.06, 1.0, 0.93], saturation: 1.20, contrast: 1.31, blueSat: 0.88, warmSat: 1.08 } },
  // dusk: sun on the horizon, windows coming on. 01-A8 warm/cool split: the lit limewash stays warm under a
  // stronger low key, the shade and sky light go cool blue rather than violet, so the frame is not one magenta
  { hour: 19.7, sunColor: "#FF6E40", sunIntensity: 2.35, sunAz: 298, sunEl: 1.5,
    fillColor: "#5A72C2", fillIntensity: 0.32, fillAz: 120, fillEl: 35,
    hemiSky: "#485E9C", hemiGround: "#8E7A7C", worldK: 0.72,
    ambient: "#485E9C", zenith: "#243574", horizon: "#F09A78", haze: "#6E7890", // E11: cool dusk haze
    fogDensity: 0.0011, night: 0.45, windowGlow: 0.7, exposure: 0.35, bloom: [0.74, 1.0], lamp: 22, lens: 10.5,
    windowOcc: 0.74, nightLift: 0.028,
    grade: { lift: [0.985, 0.99, 1.05], gamma: [1, 1, 1.02], gain: [1.05, 1.0, 0.95], saturation: 1.14, contrast: 1.32, shadowSat: 0.84, blueSat: 0.92, warmSat: 1.10 } },
  // blue hour: the moon takes over as key
  { hour: 20.7, ...NIGHT, sunIntensity: 1.15, hemiSky: "#20315C", hemiGround: "#2D3860", horizon: "#2B3A66", zenith: "#070E2A",
    haze: "#1E2848", night: 0.85, windowGlow: 0.95, exposure: 0.4, bloom: [0.70, 1.0], windowOcc: 0.68 },
  { hour: 22, ...NIGHT },
  { hour: 24, ...NIGHT, windowOcc: 0.2 },
];

function readParam(name: string): string | null {
  const search = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#\??/, ""));
  return search.get(name) ?? hash.get(name);
}

const D2R = Math.PI / 180;
/** Style C Blender azimuth/elevation (deg) → runtime glTF direction (toward the light). */
export function styleCDirection(azDeg: number, elDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const phi = (-azDeg - 90) * D2R;
  const el = elDeg * D2R;
  return out.set(Math.cos(el) * Math.cos(phi), Math.sin(el), Math.cos(el) * Math.sin(phi)).normalize();
}

function lerpAngleDeg(a: number, b: number, f: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return a + d * f;
}

/**
 * The keyframes above are authored for a reference day (sun up ≈ 6.0, down ≈ 19.85, noon sun 58°). The season
 * system (calendar, declared decorative) hands TimeOfDay the visitor's real day: the clock is remapped so dawn,
 * golden hour, dusk and the blue hour land at the real sunrise / sunset (short winter days, long summer ones),
 * and the day sun's height scales with the season's noon elevation. Night keys are untouched (the moon).
 */
export interface SeasonalDay {
  sunrise: number;
  sunset: number;
  noonElevation: number;
  /** Multiplier on the key light colour (autumn warm, winter pale); white = none. */
  sunTint: THREE.Color;
  /** Grade saturation multiplier (summer lush, winter muted). */
  saturation: number;
  /** 0..1 how much the day zenith pales toward the horizon (a thin winter sky). */
  skyPale: number;
}
const REF_RISE = 6.0, REF_SET = 19.85, REF_NOON_EL = 58, REF_NOON_AZ = 160;

/**
 * 01-A8 solar windows: around sunrise (−1.4 h … +1.5 h) and sunset (−2.0 h … +1.2 h) the keys run in REAL hours,
 * so dawn, the golden hour, dusk and the blue hour keep their true length on a short winter day as on a long summer
 * one (the golden key sits 1.35 h before sunset whatever the season); only the middle of the day and the night
 * stretch. On a very short day the windows shrink with it.
 */
const RISE_PRE = 1.4, RISE_POST = 1.5, SET_PRE = 2.0, SET_POST = 1.2;

/** Clock hour → keyframe hour for a seasonal day (piecewise linear: real-hour solar windows, stretched day and night). */
export function seasonalKeyHour(hour: number, sunrise: number, sunset: number): number {
  const day = Math.max(1, sunset - sunrise), night = 24 - day;
  const kd = Math.min(1, (day * 0.75) / (RISE_POST + SET_PRE)), kn = Math.min(1, (night * 0.75) / (SET_POST + RISE_PRE));
  // anchors in hours since sunrise (clock) and in reference-day key hours, from sunrise round to the next sunrise
  const c = [0, RISE_POST * kd, day - SET_PRE * kd, day, day + SET_POST * kn, 24 - RISE_PRE * kn, 24];
  const r = [REF_RISE, REF_RISE + RISE_POST * kd, REF_SET - SET_PRE * kd, REF_SET, REF_SET + SET_POST * kn, REF_RISE + 24 - RISE_PRE * kn, REF_RISE + 24];
  const h = ((hour - sunrise) % 24 + 24) % 24; // hours since sunrise
  let i = 0;
  while (i < c.length - 2 && h > c[i + 1]) i++;
  const f = (h - c[i]) / Math.max(1e-6, c[i + 1] - c[i]);
  return (r[i] + f * (r[i + 1] - r[i])) % 24;
}

/** Night moon-fill colour (slate blue, desaturated so night reads blue-teal, not "blue filter"). */
const NIGHT_LIFT = new THREE.Color("#93A6CF");

export class TimeOfDay {
  /**
   * Current LIGHT hour in [0, 24): the keyframe hour every hour-driven look reads (sky palette, moon,
   * townsfolk, smoke). Equals clockHour unless the season system remaps it to the visitor's real day.
   */
  hour = 12;
  /** The wall clock (or the pinned `?t=`) hour in [0, 24). */
  clockHour = 12;
  pinned: number | null;
  speed: number;
  keyframes: TimeKeyframe[] = DEFAULT_KEYFRAMES;
  /** Resolved non-uniform outputs of the last apply(); the Engine post chain reads these. */
  exposure = 0;
  bloomIntensity = 0.5;
  bloomThreshold = 1.5;
  /** The visitor's seasonal day (season system); null = the authored reference day. */
  season: SeasonalDay | null = null;
  /** Interpolated grade, rewritten IN PLACE every frame (others may scale it after TimeOfDay ran). */
  grade: Required<Grade> = { ...G0, lift: [1, 1, 1], gamma: [1, 1, 1], gain: [1, 1, 1], shadowSat: 1, blueSat: 1, warmSat: 1 };
  private readonly localDate = new Date();
  private localSecond = NaN;
  private localHour = 12;
  constructor() {
    const t = Number.parseFloat(readParam("t") ?? "");
    this.pinned = Number.isFinite(t) ? ((t % 24) + 24) % 24 : null;
    const s = Number.parseFloat(readParam("speed") ?? "");
    this.speed = Number.isFinite(s) && s > 0 ? s : 1;
  }

  /** Dev/gate control: pin an hour (null = follow the clock). */
  setHour(hour: number | null): void { this.pinned = hour === null ? null : ((hour % 24) + 24) % 24; }

  update(nowMs: number, elapsed: number, u: WorldUniforms): void {
    if (this.pinned !== null) {
      this.clockHour = this.speed !== 1 ? (this.pinned + (elapsed * this.speed) / 3600) % 24 : this.pinned;
    } else {
      const second = Math.floor(nowMs / 1000);
      if (second !== this.localSecond) {
        this.localSecond = second;
        this.localDate.setTime(nowMs);
        this.localHour = this.localDate.getHours() + this.localDate.getMinutes() / 60 + this.localDate.getSeconds() / 3600;
      }
      this.clockHour = (this.localHour + (elapsed * (this.speed - 1)) / 3600) % 24;
    }
    const sd = this.season;
    this.hour = sd ? seasonalKeyHour(this.clockHour, sd.sunrise, sd.sunset) : this.clockHour;
    // Always reapply the baseline: weather/season/sky mutate these outputs later in each frame.
    this.apply(u);
  }

  /** Keyframe hex → parsed colour, cached (Color.set(string) runs a regex: garbage every frame). */
  private readonly parsed = new Map<string, THREE.Color>();
  private readonly tinted = new THREE.Color();
  private col(hex: string): THREE.Color {
    let c = this.parsed.get(hex);
    if (!c) { c = new THREE.Color(hex); this.parsed.set(hex, c); }
    return c;
  }

  /** out = mix(ca, cb, f) × scale. No allocation. */
  private mixC(out: THREE.Color, ca: string, cb: string, f: number, scale = 1): void {
    out.copy(this.col(ca)).lerp(this.col(cb), f).multiplyScalar(scale);
  }

  apply(u: WorldUniforms): void {
    const k = this.keyframes;
    const sd = this.season;
    const kh = this.hour;
    let i = 0;
    while (i < k.length - 2 && k[i + 1].hour <= kh) i++;
    const a = k[i], b = k[i + 1];
    const lin = THREE.MathUtils.clamp((kh - a.hour) / Math.max(1e-6, b.hour - a.hour), 0, 1);
    const f = lin * lin * (3 - 2 * lin); // ease between keys: holds each look a little longer
    const L = THREE.MathUtils.lerp;
    this.mixC(u.uSunColor.value, a.sunColor, b.sunColor, f, L(a.sunIntensity, b.sunIntensity, f));
    const night = L(a.night, b.night, f);
    if (sd) u.uSunColor.value.lerp(this.tinted.copy(u.uSunColor.value).multiply(sd.sunTint), 1 - night);
    this.mixC(u.uZenith.value, a.zenith, b.zenith, f);
    this.mixC(u.uHorizon.value, a.horizon, b.horizon, f);
    this.mixC(u.uHaze.value, a.haze, b.haze, f);
    if (sd && sd.skyPale > 0) u.uZenith.value.lerp(u.uHorizon.value, sd.skyPale * (1 - night));
    u.uFogDensity.value = L(a.fogDensity, b.fogDensity, f);
    u.uNight.value = night;
    u.uWindowGlow.value = L(a.windowGlow, b.windowGlow, f);
    u.uWindowOcc.value = L(a.windowOcc ?? 0.35 + 0.35 * a.windowGlow, b.windowOcc ?? 0.35 + 0.35 * b.windowGlow, f);
    u.uNightLift.value.copy(NIGHT_LIFT).multiplyScalar(L(a.nightLift ?? 0, b.nightLift ?? 0, f));

    const worldK = L(a.worldK ?? 0.6, b.worldK ?? 0.6, f);
    this.mixC(u.uHemiSky.value, a.hemiSky ?? a.ambient, b.hemiSky ?? b.ambient, f, worldK);
    this.mixC(u.uHemiGround.value, a.hemiGround ?? a.haze, b.hemiGround ?? b.haze, f, worldK);
    this.mixC(u.uAmbient.value, a.ambient, b.ambient, f, worldK);
    this.mixC(u.uFillColor.value, a.fillColor ?? a.ambient, b.fillColor ?? b.ambient, f, L(a.fillIntensity ?? 0, b.fillIntensity ?? 0, f));
    u.uLamp.value = L(a.lamp ?? 0.4 + 40 * a.windowGlow, b.lamp ?? 0.4 + 40 * b.windowGlow, f);
    u.uLens.value = L(a.lens ?? 5 + 75 * a.night, b.lens ?? 5 + 75 * b.night, f);

    let az = lerpAngleDeg(a.sunAz ?? 200, b.sunAz ?? 200, f), el = L(a.sunEl ?? 30, b.sunEl ?? 30, f);
    if (sd) {
      // the day sun climbs higher in summer and stays low in winter; its arc swings wider on a long day
      const day = 1 - night;
      el *= L(1, THREE.MathUtils.clamp(sd.noonElevation / REF_NOON_EL, 0.45, 1.4), day);
      const swing = THREE.MathUtils.clamp((sd.sunset - sd.sunrise) / (REF_SET - REF_RISE), 0.7, 1.12);
      az = REF_NOON_AZ + ((((az - REF_NOON_AZ) % 360) + 540) % 360 - 180) * L(1, swing, day);
    }
    styleCDirection(az, el, u.uSunDir.value);
    styleCDirection(lerpAngleDeg(a.fillAz ?? 60, b.fillAz ?? 60, f), L(a.fillEl ?? 35, b.fillEl ?? 35, f), u.uFillDir.value);

    this.exposure = L(a.exposure ?? 0, b.exposure ?? 0, f);
    const ba = a.bloom ?? BLOOM0, bb = b.bloom ?? BLOOM0;
    this.bloomIntensity = L(ba[0], bb[0], f);
    this.bloomThreshold = L(ba[1], bb[1], f);
    const ga = a.grade ?? G0, gb = b.grade ?? G0, g = this.grade;
    // a reassigned array (another system replaced it) is simply written through
    for (let c = 0; c < 3; c++) {
      g.lift[c] = L(ga.lift[c], gb.lift[c], f);
      g.gamma[c] = L(ga.gamma[c], gb.gamma[c], f);
      g.gain[c] = L(ga.gain[c], gb.gain[c], f);
    }
    g.saturation = L(ga.saturation, gb.saturation, f) * (sd ? sd.saturation : 1);
    g.contrast = L(ga.contrast, gb.contrast, f);
    g.shadowSat = L(ga.shadowSat ?? 1, gb.shadowSat ?? 1, f);
    g.blueSat = L(ga.blueSat ?? 1, gb.blueSat ?? 1, f);
    g.warmSat = L(ga.warmSat ?? 1, gb.warmSat ?? 1, f);
  }
}
