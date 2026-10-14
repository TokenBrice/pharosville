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
}

const G0: Grade = { lift: [1, 1, 1], gamma: [1, 1, 1], gain: [1, 1, 1], saturation: 1, contrast: 1 };

const NIGHT: Omit<TimeKeyframe, "hour"> = {
  sunColor: "#A9BCFF", sunIntensity: 1.45, sunAz: 50, sunEl: 26,
  fillColor: "#5A6FB0", fillIntensity: 0.2, fillAz: 230, fillEl: 40,
  hemiSky: "#1C2B55", hemiGround: "#2C3F6E", worldK: 1.25,
  ambient: "#1C2B55", zenith: "#080D22", horizon: "#3A4E80", haze: "#1E2C50",
  fogDensity: 0.0012, night: 1, windowGlow: 1, exposure: 0.55, bloom: [0.9, 1.0], lamp: 40, lens: 14,
  grade: { lift: [0.98, 0.99, 1.05], gamma: [0.98, 1.0, 1.03], gain: [1.03, 1.0, 0.98], saturation: 1.18, contrast: 1.28 },
};

export const DEFAULT_KEYFRAMES: TimeKeyframe[] = [
  { hour: 0, ...NIGHT },
  { hour: 4.6, ...NIGHT, night: 0.95, windowGlow: 0.85 },
  // dawn: low pink sun behind the island (back light), cool lavender world
  { hour: 6.4, sunColor: "#FFB48A", sunIntensity: 3.6, sunAz: 62, sunEl: 5,
    fillColor: "#8E9BD8", fillIntensity: 0.35, fillAz: 200, fillEl: 35,
    hemiSky: "#8A93BE", hemiGround: "#C6A6A8", worldK: 0.62,
    ambient: "#8A93BE", zenith: "#5C6EA4", horizon: "#F6CDB4", haze: "#CBB0B4",
    fogDensity: 0.0011, night: 0.25, windowGlow: 0.35, exposure: 0.3, bloom: [0.7, 1.2], lamp: 6, lens: 6,
    grade: { lift: [1.0, 0.99, 1.04], gamma: [1, 1, 1.01], gain: [1.04, 1.0, 0.97], saturation: 1.18, contrast: 1.28 } },
  { hour: 8.5, sunColor: "#FFE2C4", sunIntensity: 4.4, sunAz: 110, sunEl: 30,
    fillColor: "#A9C4EE", fillIntensity: 0.4, fillAz: 250, fillEl: 40,
    hemiSky: "#8AAED2", hemiGround: "#C3CDD4", worldK: 0.62,
    ambient: "#8AAED2", zenith: "#5A8FCC", horizon: "#E6EEF0", haze: "#C2D3DC",
    fogDensity: 0.0008, night: 0, windowGlow: 0, exposure: 0.05, bloom: [0.35, 1.9], lamp: 0.4, lens: 3,
    grade: { lift: [1, 1, 1.01], gamma: [1, 1, 1], gain: [1.01, 1, 0.99], saturation: 1.17, contrast: 1.26 } },
  // noon (palette.json time_of_day.noon)
  { hour: 12, sunColor: "#FFF4E4", sunIntensity: 4.3, sunAz: 160, sunEl: 58,
    fillColor: "#A9C4EE", fillIntensity: 0.4, fillAz: 30, fillEl: 40,
    hemiSky: "#8AAED2", hemiGround: "#C3D3DC", worldK: 0.62,
    ambient: "#8AAED2", zenith: "#5A8FCC", horizon: "#E8F1F4", haze: "#BCD3DF",
    fogDensity: 0.0007, night: 0, windowGlow: 0, exposure: 0, bloom: [0.3, 2.0], lamp: 0.4, lens: 3,
    grade: { lift: [1.0, 1.0, 1.01], gamma: [1, 1, 1], gain: [1, 1, 1], saturation: 1.17, contrast: 1.26 } },
  { hour: 16, sunColor: "#FFE4C2", sunIntensity: 4.8, sunAz: 240, sunEl: 30,
    fillColor: "#93A9DE", fillIntensity: 0.35, fillAz: 80, fillEl: 38,
    hemiSky: "#8AA2CC", hemiGround: "#C6C6CC", worldK: 0.61,
    ambient: "#8AA2CC", zenith: "#5880BE", horizon: "#F2E6D6", haze: "#C9C6C8",
    fogDensity: 0.0008, night: 0, windowGlow: 0, exposure: 0.1, bloom: [0.4, 1.7], lamp: 0.8, lens: 3.5,
    grade: { lift: [0.995, 1, 1.02], gamma: [1, 1, 1], gain: [1.025, 1, 0.97], saturation: 1.18, contrast: 1.28 } },
  // golden (palette.json time_of_day.golden)
  { hour: 18.5, sunColor: "#FFA257", sunIntensity: 5.6, sunAz: 288, sunEl: 9,
    fillColor: "#7F98D6", fillIntensity: 0.3, fillAz: 110, fillEl: 35,
    hemiSky: "#8C9AC0", hemiGround: "#C9A89A", worldK: 0.6,
    ambient: "#8C9AC0", zenith: "#55689C", horizon: "#FFD8A8", haze: "#D2B2A6",
    fogDensity: 0.0009, night: 0.05, windowGlow: 0.2, exposure: 0.25, bloom: [0.55, 1.3], lamp: 4, lens: 5,
    grade: { lift: [0.99, 1.0, 1.04], gamma: [1, 1, 1], gain: [1.05, 1.0, 0.94], saturation: 1.20, contrast: 1.28 } },
  // dusk: sun on the horizon, red-violet world, windows coming on
  { hour: 19.7, sunColor: "#FF7448", sunIntensity: 1.6, sunAz: 298, sunEl: 1.5,
    fillColor: "#6A78C0", fillIntensity: 0.3, fillAz: 120, fillEl: 35,
    hemiSky: "#5E6496", hemiGround: "#A7808A", worldK: 0.75,
    ambient: "#5E6496", zenith: "#2F3D78", horizon: "#F09A78", haze: "#8E6E86",
    fogDensity: 0.0011, night: 0.45, windowGlow: 0.7, exposure: 0.35, bloom: [0.9, 1.0], lamp: 22, lens: 10,
    grade: { lift: [0.99, 0.99, 1.05], gamma: [1, 1, 1.02], gain: [1.04, 1.0, 0.96], saturation: 1.18, contrast: 1.28 } },
  // blue hour: the moon takes over as key
  { hour: 20.7, ...NIGHT, sunIntensity: 0.9, hemiSky: "#24356A", hemiGround: "#3A4778", horizon: "#4A5A8E", zenith: "#0C1430",
    haze: "#28355E", night: 0.85, windowGlow: 0.95, exposure: 0.35 },
  { hour: 22, ...NIGHT },
  { hour: 24, ...NIGHT },
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

const lerp3 = (a: [number, number, number], b: [number, number, number], f: number): [number, number, number] =>
  [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];

export class TimeOfDay {
  /** Current hour in [0, 24). */
  hour = 12;
  pinned: number | null;
  speed: number;
  keyframes: TimeKeyframe[] = DEFAULT_KEYFRAMES;
  /** Resolved non-uniform outputs of the last apply(); the Engine post chain reads these. */
  exposure = 0;
  bloomIntensity = 0.5;
  bloomThreshold = 1.5;
  grade: Grade = { ...G0, lift: [1, 1, 1], gamma: [1, 1, 1], gain: [1, 1, 1] };
  private readonly tmpA = new THREE.Color();
  private readonly tmpB = new THREE.Color();

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
      this.hour = this.speed !== 1 ? (this.pinned + (elapsed * this.speed) / 3600) % 24 : this.pinned;
    } else {
      const d = new Date(nowMs);
      this.hour = (d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 + (elapsed * (this.speed - 1)) / 3600) % 24;
    }
    this.apply(u);
  }

  apply(u: WorldUniforms): void {
    const k = this.keyframes;
    let i = 0;
    while (i < k.length - 2 && k[i + 1].hour <= this.hour) i++;
    const a = k[i], b = k[i + 1];
    const lin = THREE.MathUtils.clamp((this.hour - a.hour) / Math.max(1e-6, b.hour - a.hour), 0, 1);
    const f = lin * lin * (3 - 2 * lin); // ease between keys: holds each look a little longer
    const L = THREE.MathUtils.lerp;
    const mixC = (out: THREE.Color, ca: string, cb: string, scale = 1) => out.copy(this.tmpA.set(ca)).lerp(this.tmpB.set(cb), f).multiplyScalar(scale);
    mixC(u.uSunColor.value, a.sunColor, b.sunColor, L(a.sunIntensity, b.sunIntensity, f));
    mixC(u.uZenith.value, a.zenith, b.zenith);
    mixC(u.uHorizon.value, a.horizon, b.horizon);
    mixC(u.uHaze.value, a.haze, b.haze);
    u.uFogDensity.value = L(a.fogDensity, b.fogDensity, f);
    u.uNight.value = L(a.night, b.night, f);
    u.uWindowGlow.value = L(a.windowGlow, b.windowGlow, f);

    const worldK = L(a.worldK ?? 0.6, b.worldK ?? 0.6, f);
    mixC(u.uHemiSky.value, a.hemiSky ?? a.ambient, b.hemiSky ?? b.ambient, worldK);
    mixC(u.uHemiGround.value, a.hemiGround ?? a.haze, b.hemiGround ?? b.haze, worldK);
    mixC(u.uAmbient.value, a.ambient, b.ambient, worldK);
    mixC(u.uFillColor.value, a.fillColor ?? a.ambient, b.fillColor ?? b.ambient, L(a.fillIntensity ?? 0, b.fillIntensity ?? 0, f));
    u.uLamp.value = L(a.lamp ?? 0.4 + 40 * a.windowGlow, b.lamp ?? 0.4 + 40 * b.windowGlow, f);
    u.uLens.value = L(a.lens ?? 5 + 75 * a.night, b.lens ?? 5 + 75 * b.night, f);

    styleCDirection(lerpAngleDeg(a.sunAz ?? 200, b.sunAz ?? 200, f), L(a.sunEl ?? 30, b.sunEl ?? 30, f), u.uSunDir.value);
    styleCDirection(lerpAngleDeg(a.fillAz ?? 60, b.fillAz ?? 60, f), L(a.fillEl ?? 35, b.fillEl ?? 35, f), u.uFillDir.value);

    this.exposure = L(a.exposure ?? 0, b.exposure ?? 0, f);
    const ba = a.bloom ?? [0.5, 1.5], bb = b.bloom ?? [0.5, 1.5];
    this.bloomIntensity = L(ba[0], bb[0], f);
    this.bloomThreshold = L(ba[1], bb[1], f);
    const ga = a.grade ?? G0, gb = b.grade ?? G0;
    this.grade = {
      lift: lerp3(ga.lift, gb.lift, f), gamma: lerp3(ga.gamma, gb.gamma, f), gain: lerp3(ga.gain, gb.gain, f),
      saturation: L(ga.saturation, gb.saturation, f), contrast: L(ga.contrast, gb.contrast, f),
    };
  }
}
