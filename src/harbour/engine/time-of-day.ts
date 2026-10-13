import * as THREE from "three";
import type { WorldUniforms } from "./uniforms";

/**
 * Visitor-local time of day (declared decorative, PLAN §4.1). `?t=<hour>` (or `#t=`) pins it for
 * reproducible gate frames; `?speed=<x>` accelerates for review. The atmosphere system refines the
 * palette keyframes; this owns the clock and the sun/moon direction.
 */
export interface TimeKeyframe {
  hour: number;
  sunColor: string; sunIntensity: number;
  ambient: string; zenith: string; horizon: string; haze: string;
  fogDensity: number; night: number; windowGlow: number;
}

export const DEFAULT_KEYFRAMES: TimeKeyframe[] = [
  { hour: 0,    sunColor: "#9fb4ff", sunIntensity: 0.35, ambient: "#1b2a4a", zenith: "#060c1e", horizon: "#16264a", haze: "#14223f", fogDensity: 0.0012, night: 1, windowGlow: 1 },
  { hour: 5.5,  sunColor: "#9fb4ff", sunIntensity: 0.3,  ambient: "#22304f", zenith: "#0d1630", horizon: "#3a3d62", haze: "#2c3352", fogDensity: 0.0012, night: 0.9, windowGlow: 0.9 },
  { hour: 7,    sunColor: "#ffb48a", sunIntensity: 1.4,  ambient: "#5a6a8a", zenith: "#5d7fb0", horizon: "#f2c4a0", haze: "#d9b8a8", fogDensity: 0.001, night: 0.15, windowGlow: 0.2 },
  { hour: 12,   sunColor: "#fff3e0", sunIntensity: 2.6,  ambient: "#7d93b0", zenith: "#3f78c0", horizon: "#cfe0ea", haze: "#c0d2dc", fogDensity: 0.0007, night: 0, windowGlow: 0 },
  { hour: 17.5, sunColor: "#ffc690", sunIntensity: 2.0,  ambient: "#6d7392", zenith: "#5873a8", horizon: "#f5c9a0", haze: "#e2bfae", fogDensity: 0.0009, night: 0, windowGlow: 0.15 },
  { hour: 19.3, sunColor: "#ff8a5c", sunIntensity: 1.1,  ambient: "#4a4870", zenith: "#2c3a70", horizon: "#e6906e", haze: "#8a6a7a", fogDensity: 0.0011, night: 0.45, windowGlow: 0.8 },
  { hour: 21,   sunColor: "#9fb4ff", sunIntensity: 0.4,  ambient: "#1e2c50", zenith: "#08122a", horizon: "#1d2c55", haze: "#18264a", fogDensity: 0.0012, night: 1, windowGlow: 1 },
  { hour: 24,   sunColor: "#9fb4ff", sunIntensity: 0.35, ambient: "#1b2a4a", zenith: "#060c1e", horizon: "#16264a", haze: "#14223f", fogDensity: 0.0012, night: 1, windowGlow: 1 },
];

function readParam(name: string): string | null {
  const search = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#\??/, ""));
  return search.get(name) ?? hash.get(name);
}

export class TimeOfDay {
  /** Current hour in [0, 24). */
  hour = 12;
  pinned: number | null;
  speed: number;
  keyframes: TimeKeyframe[] = DEFAULT_KEYFRAMES;
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
    const f = THREE.MathUtils.clamp((this.hour - a.hour) / Math.max(1e-6, b.hour - a.hour), 0, 1);
    const mixC = (out: THREE.Color, ca: string, cb: string, scale = 1) => out.copy(this.tmpA.set(ca)).lerp(this.tmpB.set(cb), f).multiplyScalar(scale);
    mixC(u.uSunColor.value, a.sunColor, b.sunColor, THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, f));
    mixC(u.uAmbient.value, a.ambient, b.ambient);
    mixC(u.uZenith.value, a.zenith, b.zenith);
    mixC(u.uHorizon.value, a.horizon, b.horizon);
    mixC(u.uHaze.value, a.haze, b.haze);
    u.uFogDensity.value = THREE.MathUtils.lerp(a.fogDensity, b.fogDensity, f);
    u.uNight.value = THREE.MathUtils.lerp(a.night, b.night, f);
    u.uWindowGlow.value = THREE.MathUtils.lerp(a.windowGlow, b.windowGlow, f);
    // Sun path: rises ~6h in the east (+x), sets ~19h in the west; key light swaps to the moon at night.
    const dayPhase = ((this.hour - 6) / 13) * Math.PI;           // 0 at sunrise … π at sunset
    const sunUp = Math.sin(dayPhase);
    if (sunUp > -0.05) {
      u.uSunDir.value.set(Math.cos(dayPhase) * 0.8, Math.max(0.06, sunUp * 0.9), 0.45).normalize();
    } else {
      const moonPhase = ((this.hour + 24 - 19) % 24) / 11 * Math.PI;
      u.uSunDir.value.set(-Math.cos(moonPhase) * 0.6, Math.max(0.25, Math.sin(moonPhase) * 0.8), -0.35).normalize();
    }
  }
}
