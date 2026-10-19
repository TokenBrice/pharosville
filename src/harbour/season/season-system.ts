import * as THREE from "three";
import type { EngineContext, FrameState, PreparationService, WorldSystem } from "../engine/types";
import type { SeasonalDay } from "../engine/time-of-day";
import { getHarbourMaterials, leafFallAt } from "../world/materials";
import { isPreparationAbort } from "../engine/prepare";
import {
  NOMINAL_LATITUDE, dayOfYear, dominantSeason, isSouthernZone, northernDay, overrideDay, parseSeasonOverride,
  seasonWeights, snowShareFor, solarDay, temperatureFor, type SeasonName, type SeasonWeights,
} from "./calendar";

/**
 * 'season' service — CALENDAR, declared decorative (like the time of day). Weather (DEWS) owns how stormy
 * it is; the season owns only what it looks like: foliage, snow lying in winter, day length, sun height,
 * and whether precipitation falls as rain or snow (the weather director reads `snowShare`).
 */
export interface SeasonService {
  readonly season: SeasonName;
  /** spring, summer, autumn, winter (sum 1) */
  readonly weights: SeasonWeights;
  /** 0..1 snow lying on roofs and land (winter + recent snowfall) */
  readonly snowCover: number;
  readonly dayLengthHours: number;
  /** local clock hours */
  readonly sunrise: number;
  readonly sunset: number;
  readonly southern: boolean;
  /** share of precipitation that falls as snow, 0..1 (calendar temperature) */
  readonly snowShare: number;
  /** decorative air temperature, °C */
  readonly temperatureC: number;
  /** real day of the year shown (1..366) */
  readonly dayOfYear: number;
  readonly overridden: boolean;
}

/** Season light: autumn warm and low, winter pale and cool, summer bright. Multipliers on the key light. */
const SUN_TINT: Record<SeasonName, THREE.Color> = {
  spring: new THREE.Color(1.05, 1.06, 1.02),
  summer: new THREE.Color(1.05, 1.0, 0.88),
  autumn: new THREE.Color(1.05, 0.97, 0.86),
  winter: new THREE.Color(0.93, 0.97, 1.05),
};
const SATURATION: Record<SeasonName, number> = { spring: 1.0, summer: 1.07, autumn: 1.02, winter: 0.9 };
/**
 * Day grade per season, on top of the hour's grade (weighted by the calendar, faded out at night): spring
 * soft and bright (lifted shadows, gentler curve), summer deep and warm (golden gain, richer warm hues).
 */
const GRADE: Record<SeasonName, { contrast: number; lift: number; gain: [number, number, number]; warmSat: number }> = {
  spring: { contrast: 0.9, lift: 0.012, gain: [1.04, 1.05, 1.03], warmSat: 1.0 },
  summer: { contrast: 1.04, lift: 0, gain: [1.035, 1.0, 0.93], warmSat: 1.1 },
  autumn: { contrast: 1, lift: 0, gain: [1, 1, 1], warmSat: 1 },
  winter: { contrast: 1, lift: 0, gain: [1, 1, 1], warmSat: 1 },
};

const SEASONS_ORDER = ["spring", "summer", "autumn", "winter"] as const;

function zone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""; } catch { return ""; }
}

export class SeasonSystem implements WorldSystem {
  readonly name = "season";
  private southern = false;
  private readonly override = parseSeasonOverride((k) => {
    const q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.replace(/^#\??/, ""));
    return q.get(k) ?? h.get(k);
  });
  private weights: SeasonWeights = [0, 1, 0, 0];
  private doy = 180;
  private nDay = 180;
  private sunrise = 6;
  private sunset = 20;
  private dayLen = 14;
  private baseSnow = 0;
  /** fresh snow from the weather's snowfall, 0..1, melts slowly */
  private fresh = 0;
  private snowCover = 0;
  private recheck = 0;
  private resolved = false;
  private pendingSeason = false;
  private readonly day: SeasonalDay = { sunrise: 6, sunset: 19.85, noonElevation: 58, sunTint: new THREE.Color(1, 1, 1), saturation: 1, skyPale: 0 };
  private readonly dayGrade = { contrast: 0, lift: 0, warm: 0, gain: [0, 0, 0] };

  init(ctx: EngineContext): void {
    const now = new Date();
    const jan = new Date(now.getFullYear(), 0, 1).getTimezoneOffset(), jul = new Date(now.getFullYear(), 6, 1).getTimezoneOffset();
    this.southern = isSouthernZone(zone(), jan, jul);
    this.resolve(ctx, now);
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the service getters read live state
    const sys = this;
    const svc: SeasonService = {
      get season() { return dominantSeason(sys.weights); },
      get weights() { return sys.weights; },
      get snowCover() { return sys.snowCover; },
      get dayLengthHours() { return sys.dayLen; },
      get sunrise() { return sys.sunrise; },
      get sunset() { return sys.sunset; },
      get southern() { return sys.southern; },
      get snowShare() { return snowShareFor(sys.weights); },
      get temperatureC() { return temperatureFor(sys.nDay); },
      get dayOfYear() { return sys.doy; },
      get overridden() { return Boolean(sys.override.season || sys.override.month); },
    };
    ctx.services.set("season", svc);
  }

  /** Recompute the calendar day (at load, then once a minute: a visit can cross midnight). */
  private resolve(ctx: EngineContext, now: Date): void {
    const year = now.getFullYear();
    const forced = overrideDay(this.override, year, this.southern);
    this.doy = forced ?? dayOfYear(year, now.getMonth() + 1, now.getDate());
    this.nDay = northernDay(this.doy, this.southern);
    this.weights = seasonWeights(this.nDay);
    // daylight saving in force on that day (minutes west of UTC: the standard half has the larger value)
    const date = new Date(year, 0, this.doy, 12);
    const std = Math.max(new Date(year, 0, 1).getTimezoneOffset(), new Date(year, 6, 1).getTimezoneOffset());
    const dst = (std - date.getTimezoneOffset()) / 60;
    const sd = solarDay(this.doy, this.southern ? -NOMINAL_LATITUDE : NOMINAL_LATITUDE, dst);
    this.sunrise = sd.sunrise; this.sunset = sd.sunset; this.dayLen = sd.dayLengthHours;
    this.baseSnow = 0.78 * THREE.MathUtils.smoothstep(this.weights[3], 0.2, 0.85);

    const u = ctx.uniforms;
    const foliage = new THREE.Vector4(...this.weights), phase = (this.nDay - 1) / 365;
    const previousFoliage = u.uFoliage.value.clone(), previousPhase = u.uSeasonPhase.value;
    const wasBare = leafFallAt(u) > 0.001;
    u.uFoliage.value.copy(foliage); u.uSeasonPhase.value = phase;
    const bare = leafFallAt(u) > 0.001;
    const preparation = ctx.services.get("preparation") as PreparationService | undefined;
    if (this.resolved && (wasBare !== bare || this.pendingSeason) && preparation) {
      this.pendingSeason = true;
      u.uFoliage.value.copy(previousFoliage); u.uSeasonPhase.value = previousPhase;
      const scope = () => {
        const oldFoliage = u.uFoliage.value.clone(), oldPhase = u.uSeasonPhase.value;
        u.uFoliage.value.copy(foliage); u.uSeasonPhase.value = phase;
        return () => { u.uFoliage.value.copy(oldFoliage); u.uSeasonPhase.value = oldPhase; };
      };
      void preparation.prepareSeason(scope, () => {
        u.uFoliage.value.copy(foliage); u.uSeasonPhase.value = phase;
        getHarbourMaterials(ctx).invalidateSeason(ctx.scene);
        ctx.renderer.shadowMap.needsUpdate = true;
        this.pendingSeason = false;
      }).catch((error: unknown) => { if (!isPreparationAbort(error)) console.error("[harbour] season preparation failed", error); });
    }
    this.resolved = true;
    const d = this.day;
    d.sunrise = sd.sunrise; d.sunset = sd.sunset; d.noonElevation = sd.noonElevation;
    d.sunTint.setRGB(0, 0, 0); d.saturation = 0;
    d.skyPale = 0.16 * this.weights[3] + 0.05 * this.weights[2] + 0.05 * this.weights[0];
    SEASONS_ORDER.forEach((s, i) => {
      d.sunTint.r += SUN_TINT[s].r * this.weights[i]; d.sunTint.g += SUN_TINT[s].g * this.weights[i]; d.sunTint.b += SUN_TINT[s].b * this.weights[i];
      d.saturation += SATURATION[s] * this.weights[i];
    });
    // Calendar-only sums retain the same season/component order, but need resolving only with the weights.
    const grade = this.dayGrade;
    grade.contrast = 0; grade.lift = 0; grade.warm = 0; grade.gain.fill(0);
    for (let i = 0; i < SEASONS_ORDER.length; i++) {
      const w = this.weights[i], k = GRADE[SEASONS_ORDER[i]];
      grade.contrast += k.contrast * w; grade.lift += k.lift * w; grade.warm += k.warmSat * w;
      for (let c = 0; c < 3; c++) grade.gain[c] += k.gain[c] * w;
    }
    ctx.timeOfDay.season = d;
    if (this.snowCover === 0) this.snowCover = this.baseSnow;
    u.uSnowCover.value = this.snowCover;
  }

  update(frame: FrameState, ctx: EngineContext): void {
    const dt = frame.delta;
    this.recheck += dt;
    if (this.recheck > 60) { this.recheck = 0; this.resolve(ctx, new Date(frame.nowMs)); }
    const u = ctx.uniforms;
    // fresh snow: the weather's snowfall builds it up over a few minutes; it melts slowly in winter, fast otherwise
    const snowing = u.uPrecip.value.y;
    const melt = this.weights[3] > 0.5 ? 1 / 1500 : 1 / 200;
    this.fresh = THREE.MathUtils.clamp(this.fresh + snowing * dt / 150 - melt * dt * (1 - snowing), 0, 1);
    const target = Math.min(1, this.baseSnow + this.fresh * (1 - this.baseSnow * 0.6));
    this.snowCover += (target - this.snowCover) * (1 - Math.exp(-dt / 8));
    u.uSnowCover.value = this.snowCover;
    this.grade(ctx);

  }

  /** The season's day grade, after TimeOfDay wrote the hour's (it runs before the systems each frame). */
  private grade(ctx: EngineContext): void {
    const day = 1 - ctx.uniforms.uNight.value;
    if (day <= 0) return;
    const g = ctx.timeOfDay.grade;
    const { contrast, lift, warm, gain } = this.dayGrade;
    g.contrast = 1 + (g.contrast - 1) * THREE.MathUtils.lerp(1, contrast, day);
    g.warmSat = (g.warmSat ?? 1) * THREE.MathUtils.lerp(1, warm, day);
    const lk = 1 + lift * day;
    for (let c = 0; c < 3; c++) {
      g.lift[c] *= lk;
      g.gain[c] *= THREE.MathUtils.lerp(1, gain[c], day);
    }
  }

  dispose(ctx: EngineContext): void {
    ctx.services.delete("season");
    ctx.timeOfDay.season = null;
  }
}
