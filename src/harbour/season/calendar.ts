/**
 * SEASON CALENDAR (pure, unit-tested). Season is CALENDAR, declared decorative like the time of day:
 * the visitor's local date and hemisphere (time zone → southern, the old sky-almanac rule) pick the
 * season, its blends, the length of the day and the height of the noon sun at a nominal 35° latitude.
 * Nothing here reads data. Weather (DEWS) owns how stormy it is; the season owns only what it looks like.
 */

export type SeasonName = "spring" | "summer" | "autumn" | "winter";
/** Contract order (uFoliage): spring, summer, autumn, winter. Sum 1. */
export type SeasonWeights = [number, number, number, number];
export const SEASONS: readonly SeasonName[] = ["spring", "summer", "autumn", "winter"];

const DEG = Math.PI / 180;
/** Nominal latitude (the old index.html / sky-almanac rule), sign = hemisphere. */
export const NOMINAL_LATITUDE = 35;

/** Zones south of the equator (the old sky-almanac list); a January-DST zone counts too. */
const SOUTHERN_ZONE_PREFIXES = [
  "Antarctica/", "Australia/", "America/Argentina/", "Africa/Johannesburg", "Africa/Maputo", "Africa/Harare",
  "Africa/Lusaka", "Africa/Windhoek", "Africa/Gaborone", "Africa/Maseru", "Africa/Mbabane", "Africa/Luanda",
  "Africa/Lubumbashi", "Africa/Blantyre", "Africa/Dar_es_Salaam", "America/Asuncion", "America/Bahia",
  "America/Buenos_Aires", "America/Campo_Grande", "America/Cuiaba", "America/La_Paz", "America/Lima",
  "America/Montevideo", "America/Punta_Arenas", "America/Recife", "America/Santiago", "America/Sao_Paulo",
  "Asia/Jakarta", "Indian/Antananarivo", "Indian/Mauritius", "Indian/Reunion", "Pacific/Apia", "Pacific/Auckland",
  "Pacific/Chatham", "Pacific/Fiji", "Pacific/Noumea", "Pacific/Port_Moresby", "Pacific/Tahiti", "Pacific/Tongatapu",
] as const;

/** Southern hemisphere from the zone name, or from daylight saving in force in January (runtime zone only). */
export function isSouthernZone(timeZone: string, januaryOffsetMin?: number, julyOffsetMin?: number): boolean {
  if (SOUTHERN_ZONE_PREFIXES.some((p) => timeZone.startsWith(p))) return true;
  // getTimezoneOffset is minutes WEST of UTC: the DST half of the year has the smaller value
  return januaryOffsetMin !== undefined && julyOffsetMin !== undefined && januaryOffsetMin !== julyOffsetMin && januaryOffsetMin < julyOffsetMin;
}

/** 1-based day of the year of a local calendar date. */
export function dayOfYear(year: number, month: number, day: number): number {
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86_400_000) + 1;
}

/** Day of the year as the northern hemisphere would live it (southern: half a year on). 1..365. */
export function northernDay(doy: number, southern: boolean): number {
  const d = southern ? doy + 182 : doy;
  return ((((d - 1) % 365) + 365) % 365) + 1;
}

/**
 * Meteorological season starts (northern day of year) and the blend half-width (days): each change of
 * season is a ~2-week cross-fade centred on the boundary.
 */
const STARTS = [60, 152, 244, 335] as const; // Mar 1, Jun 1, Sep 1, Dec 1
const BLEND = 7;

const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/** Season weights for a northern-equivalent day of the year (sum 1, smooth, periodic). */
export function seasonWeights(nDay: number): SeasonWeights {
  const w: SeasonWeights = [0, 0, 0, 0];
  for (let s = 0; s < 4; s++) {
    const start = STARTS[s], end = STARTS[(s + 1) % 4] + (s === 3 ? 365 : 0);
    let best = 0;
    for (const d of [nDay - 365, nDay, nDay + 365]) {
      best = Math.max(best, smooth((d - start + BLEND) / (2 * BLEND)) * smooth((end + BLEND - d) / (2 * BLEND)));
    }
    w[s] = best;
  }
  const sum = w[0] + w[1] + w[2] + w[3];
  for (let s = 0; s < 4; s++) w[s] /= sum;
  return w;
}

export function dominantSeason(w: readonly number[]): SeasonName {
  let k = 0;
  for (let s = 1; s < 4; s++) if (w[s] > w[k]) k = s;
  return SEASONS[k];
}

export interface SolarDay {
  /** Local clock hours (DST included). */
  sunrise: number;
  sunset: number;
  dayLengthHours: number;
  /** Elevation of the noon sun, degrees. */
  noonElevation: number;
}

/** Sunrise, sunset and noon height at the nominal latitude for a real day of the year (sign of lat = hemisphere). */
export function solarDay(doy: number, latitudeDeg: number, dstHours: number): SolarDay {
  const decl = 23.44 * DEG * Math.sin((2 * Math.PI * (284 + doy)) / 365);
  const lat = latitudeDeg * DEG;
  const cosH0 = -Math.tan(lat) * Math.tan(decl);
  const half = Math.acos(Math.min(1, Math.max(-1, cosH0))) / (15 * DEG);
  const noon = 12 + dstHours;
  return { sunrise: noon - half, sunset: noon + half, dayLengthHours: 2 * half, noonElevation: 90 - Math.abs(latitudeDeg - decl / DEG) };
}

/** Representative calendar day per season (northern day of year): mid-season, autumn at its colour peak. */
const SEASON_DAY: Record<SeasonName, number> = { spring: 115, summer: 196, autumn: 293, winter: 20 };

export interface SeasonOverride { month?: number; season?: SeasonName }

/** `?season=` / `?month=` dev overrides (gates). Unknown values are ignored. */
export function parseSeasonOverride(get: (k: string) => string | null): SeasonOverride {
  const s = get("season")?.toLowerCase();
  const m = Number.parseInt(get("month") ?? "", 10);
  const out: SeasonOverride = {};
  if (s === "fall") out.season = "autumn";
  else if (s && (SEASONS as readonly string[]).includes(s)) out.season = s as SeasonName;
  if (Number.isFinite(m) && m >= 1 && m <= 12) out.month = m;
  return out;
}

/** The calendar day (real day of the year) the override asks for, in the visitor's hemisphere; null = today. */
export function overrideDay(o: SeasonOverride, year: number, southern: boolean): number | null {
  if (o.season) {
    const n = SEASON_DAY[o.season];
    return southern ? northernDay(n, true) : n; // half a year on is its own inverse (182 ≈ 365/2)
  }
  if (o.month) return dayOfYear(year, o.month, 15);
  return null;
}

/** Share of precipitation falling as snow (calendar temperature): winter snows, its edges mix. */
export function snowShareFor(w: readonly number[]): number {
  return smooth((w[3] - 0.35) / 0.4);
}

/** A decorative air temperature (°C) for the calendar day: cold in winter, warm in summer. */
export function temperatureFor(nDay: number): number {
  // coldest ≈ 20 Jan, warmest ≈ 22 Jul
  return 12 - 11 * Math.cos((2 * Math.PI * (nDay - 20)) / 365);
}
