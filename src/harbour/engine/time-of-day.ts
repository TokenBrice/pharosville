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
 * Night (style C night still): deep navy-teal value structure. The sky is slate-indigo with a dark zenith,
 * so the sea (which reflects it) sits around 10–15 % value and the land, lit by a desaturated moon key
 * plus the moon fill (nightLift), reads slightly ABOVE the sea; warm lamps and windows carry the colour.
 */
const NIGHT: Omit<TimeKeyframe, "hour"> = {
  sunColor: "#B4C3E8", sunIntensity: 1.5, sunAz: 50, sunEl: 26,
  fillColor: "#6A7AA8", fillIntensity: 0.2, fillAz: 230, fillEl: 40,
  hemiSky: "#22304F", hemiGround: "#2A3550", worldK: 1.2,
  ambient: "#1F2A44", zenith: "#05081A", horizon: "#1D2740", haze: "#151C30",
  fogDensity: 0.0012, night: 1, windowGlow: 1, exposure: 0.42, bloom: [0.85, 1.0], lamp: 46, lens: 14,
  windowOcc: 0.45, nightLift: 0.08,
  grade: { lift: [0.985, 0.99, 1.03], gamma: [0.98, 1.0, 1.02], gain: [1.04, 1.0, 0.97], saturation: 1.05, contrast: 1.32, shadowSat: 0.62, blueSat: 0.82, warmSat: 1.08 },
};

export const DEFAULT_KEYFRAMES: TimeKeyframe[] = [
  { hour: 0, ...NIGHT, windowOcc: 0.2 },
  { hour: 4.6, ...NIGHT, night: 0.95, windowGlow: 0.85, windowOcc: 0.12 },
  // dawn: low pink sun behind the island (back light), cool lavender world
  { hour: 6.4, sunColor: "#FFB48A", sunIntensity: 3.6, sunAz: 62, sunEl: 5,
    fillColor: "#8E9BD8", fillIntensity: 0.35, fillAz: 200, fillEl: 35,
    hemiSky: "#8A93BE", hemiGround: "#C6A6A8", worldK: 0.62,
    ambient: "#8A93BE", zenith: "#5C6EA4", horizon: "#F6CDB4", haze: "#CBB0B4",
    fogDensity: 0.0011, night: 0.25, windowGlow: 0.35, exposure: 0.3, bloom: [0.7, 1.2], lamp: 6, lens: 6,
    windowOcc: 0.3, nightLift: 0.012,
    grade: { lift: [1.0, 0.99, 1.04], gamma: [1, 1, 1.01], gain: [1.04, 1.0, 0.97], saturation: 1.18, contrast: 1.28, blueSat: 0.9, warmSat: 1.06 } },
  { hour: 8.5, sunColor: "#FFE2C4", sunIntensity: 4.4, sunAz: 110, sunEl: 30,
    fillColor: "#A9C4EE", fillIntensity: 0.4, fillAz: 250, fillEl: 40,
    hemiSky: "#8AAAC8", hemiGround: "#CBCBC2", worldK: 0.6,
    ambient: "#8AAAC8", zenith: "#5A8FCC", horizon: "#E6EEF0", haze: "#C2D3DC",
    fogDensity: 0.0008, night: 0, windowGlow: 0, exposure: 0.05, bloom: [0.35, 1.9], lamp: 0.4, lens: 3,
    grade: { lift: [0.99, 0.99, 1.0], gamma: [1, 1, 1], gain: [1.015, 1, 0.985], saturation: 1.12, contrast: 1.32, blueSat: 0.82, warmSat: 1.14 } },
  // noon (palette.json time_of_day.noon) — warmer key, firmer S-curve; the sea recedes, roofs/sails carry colour
  { hour: 12, sunColor: "#FFEDD6", sunIntensity: 4.5, sunAz: 160, sunEl: 58,
    fillColor: "#A9C4EE", fillIntensity: 0.35, fillAz: 30, fillEl: 40,
    hemiSky: "#8CA9C6", hemiGround: "#CECCBE", worldK: 0.58,
    ambient: "#8CA9C6", zenith: "#5A8FCC", horizon: "#E8F1F4", haze: "#BCD3DF",
    fogDensity: 0.0007, night: 0, windowGlow: 0, exposure: 0, bloom: [0.3, 2.0], lamp: 0.4, lens: 3,
    grade: { lift: [0.985, 0.985, 0.995], gamma: [1, 1, 1], gain: [1.01, 1, 0.99], saturation: 1.1, contrast: 1.36, blueSat: 0.8, warmSat: 1.12 } },
  { hour: 16, sunColor: "#FFE0B8", sunIntensity: 4.8, sunAz: 240, sunEl: 30,
    fillColor: "#93A9DE", fillIntensity: 0.32, fillAz: 80, fillEl: 38,
    hemiSky: "#8AA0C4", hemiGround: "#CCC6BC", worldK: 0.59,
    ambient: "#8AA0C4", zenith: "#5880BE", horizon: "#F2E6D6", haze: "#C9C6C8",
    fogDensity: 0.0008, night: 0, windowGlow: 0, exposure: 0.1, bloom: [0.4, 1.7], lamp: 0.8, lens: 3.5,
    grade: { lift: [0.985, 0.99, 1.01], gamma: [1, 1, 1], gain: [1.03, 1, 0.97], saturation: 1.14, contrast: 1.34, blueSat: 0.84, warmSat: 1.14 } },
  // golden (palette.json time_of_day.golden)
  { hour: 18.5, sunColor: "#FFA257", sunIntensity: 5.6, sunAz: 288, sunEl: 9,
    fillColor: "#7F98D6", fillIntensity: 0.3, fillAz: 110, fillEl: 35,
    hemiSky: "#8C9AC0", hemiGround: "#C9A89A", worldK: 0.6,
    ambient: "#8C9AC0", zenith: "#55689C", horizon: "#FFD8A8", haze: "#D2B2A6",
    fogDensity: 0.0009, night: 0.05, windowGlow: 0.2, exposure: 0.25, bloom: [0.55, 1.3], lamp: 4, lens: 5,
    windowOcc: 0.5,
    grade: { lift: [0.99, 1.0, 1.04], gamma: [1, 1, 1], gain: [1.05, 1.0, 0.94], saturation: 1.20, contrast: 1.28, blueSat: 0.9, warmSat: 1.04 } },
  // dusk: sun on the horizon, red-violet world, windows coming on
  { hour: 19.7, sunColor: "#FF7448", sunIntensity: 1.6, sunAz: 298, sunEl: 1.5,
    fillColor: "#6A78C0", fillIntensity: 0.3, fillAz: 120, fillEl: 35,
    hemiSky: "#5E6496", hemiGround: "#A7808A", worldK: 0.75,
    ambient: "#5E6496", zenith: "#2F3D78", horizon: "#F09A78", haze: "#8E6E86",
    fogDensity: 0.0011, night: 0.45, windowGlow: 0.7, exposure: 0.35, bloom: [0.9, 1.0], lamp: 22, lens: 10,
    windowOcc: 0.74, nightLift: 0.025,
    grade: { lift: [0.99, 0.99, 1.05], gamma: [1, 1, 1.02], gain: [1.04, 1.0, 0.96], saturation: 1.16, contrast: 1.3, shadowSat: 0.85, blueSat: 0.9, warmSat: 1.05 } },
  // blue hour: the moon takes over as key
  { hour: 20.7, ...NIGHT, sunIntensity: 1.0, hemiSky: "#26355E", hemiGround: "#353F66", horizon: "#33406A", zenith: "#0A1130",
    haze: "#222C4C", night: 0.85, windowGlow: 0.95, exposure: 0.4, windowOcc: 0.68 },
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

/** Clock hour → keyframe hour for a seasonal day (piecewise linear: the day and the night each stretch). */
export function seasonalKeyHour(hour: number, sunrise: number, sunset: number): number {
  const day = Math.max(1, sunset - sunrise), refDay = REF_SET - REF_RISE;
  const h = ((hour - sunrise) % 24 + 24) % 24; // hours since sunrise
  if (h <= day) return REF_RISE + (h / day) * refDay;
  const t = (h - day) / Math.max(1, 24 - day);
  return (REF_SET + t * (24 - refDay)) % 24;
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
