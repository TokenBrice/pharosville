/**
 * The sky clock (plan W2.14 / O11, sky-5, sky-7): where the sun and the moon
 * are for the visitor's date and hour. Pure and three-free, so the DOM time
 * sentence and the renderer read the same answer.
 *
 * Latitude is not known and is not asked for. It is a nominal 35°. The
 * hemisphere is inferred from the visitor's time zone, so a visitor in Sydney
 * gets a short June day, not a long one. Solar noon is 12:00 standard time plus
 * the zone's daylight-saving hour. Longitude inside the zone is ignored.
 *
 * Positions are painterly where the rest frame needs them. The sun keeps the
 * compressed ±57° azimuth arc in `garden-sun.ts`. The moon's displayed pose
 * crosses the rest view's own sky window, left to right, from rise to set,
 * because a real moon at 50° altitude could never be seen from the seat.
 * Timing, phase and elevation above or below the horizon are real.
 */
import { REST_SEAT_VFOV_DEG, REST_SEAT_YAW_RAD } from "./rest-seat";
import { worldCalendarDate } from "./season";

const DEG = Math.PI / 180;
const NOMINAL_LATITUDE_RAD = 35 * DEG;
/** Standard-time clock hour of solar noon at the zone's nominal meridian. */
const SOLAR_NOON_STANDARD_HOUR = 12;
const SYNODIC_MONTH_DAYS = 29.530589;
/** A known new moon (2000-01-06 14:24 TT) as a Julian day. */
const NEW_MOON_EPOCH_JD = 2451550.1;
/** The moon transits ~48.7 min later each day: 24 h over a synodic month. */
const MOON_TRANSIT_DRIFT_HOURS_PER_DAY = 24 / SYNODIC_MONTH_DAYS;
/** Hours from moonrise to transit (and transit to moonset). */
const MOON_HALF_ARC_HOURS = 6.2;
/** The displayed moon's azimuth span, as a fraction of the rest view's horizontal half-FOV. */
const MOON_ARC_FILL = 0.85;
/** The displayed moon's elevation at rise/set and at transit. It rises out of the sea, not onto the sky. */
const MOON_HORIZON_ELEVATION_RAD = -1.2 * DEG;
const MOON_TRANSIT_ELEVATION_RAD = 9 * DEG;
/** Half the displayed disc; presence is complete once the whole disc has cleared ~1.4°. */
const MOON_PRESENCE_START_RAD = -0.6 * DEG;
const MOON_PRESENCE_FULL_RAD = 1.4 * DEG;

/**
 * Azimuth of the rest view's forward axis in the `garden-sun` convention,
 * direction = (cos az, 0, sin az). The seat looks along
 * (−sin yaw, 0, −cos yaw). Azimuth increases toward the frame's right.
 */
export const GARDEN_REST_VIEW_AZIMUTH = -Math.PI / 2 - REST_SEAT_YAW_RAD;

export interface GardenSkyLatitude {
  latitudeRad: number;
  southern: boolean;
}

export interface GardenSkyDay {
  /** Julian day at the local calendar day's 00:00. */
  julianDayAtLocalMidnight: number;
  /** The local clock's offset from UTC that day, hours (CEST = +2). */
  utcOffsetHours: number;
  latitudeRad: number;
  southern: boolean;
  declinationRad: number;
  /** Clock hour of solar noon (12 + the daylight-saving hour). */
  solarNoonHour: number;
  /** Clock hours at which the sun's centre crosses the horizon. */
  sunriseHour: number;
  sunsetHour: number;
  /** The sun's elevation at solar noon, radians. */
  apexElevationRad: number;
}

export interface GardenMoonState {
  /** Any part of the displayed disc above the horizon. */
  up: boolean;
  /** Displayed azimuth, same world convention as the sun in `garden-sun.ts`. */
  azimuthRad: number;
  /** Displayed elevation, radians; inside the rest view's sky window while up. */
  elevationRad: number;
  /** Lit fraction of the disc, 0 (new) … 1 (full). */
  illumination: number;
  /** Waxing: the lit limb faces the sun's side (west, frame right, in the evening). */
  waxing: boolean;
  /** 0…1 fade as the disc clears the horizon; 0 whenever the moon is down. */
  presence: number;
  /** Moon age in days since new, 0 … 29.53. */
  ageDays: number;
}

/**
 * Southern zones without daylight saving, where the offset direction cannot
 * tell. Zones with DST are classified by which half of the year it runs.
 */
const SOUTHERN_ZONE_PREFIXES = [
  "Antarctica/",
  "Australia/",
  "America/Argentina/",
  "Africa/Johannesburg",
  "Africa/Maputo",
  "Africa/Harare",
  "Africa/Lusaka",
  "Africa/Windhoek",
  "Africa/Gaborone",
  "Africa/Maseru",
  "Africa/Mbabane",
  "Africa/Luanda",
  "Africa/Lubumbashi",
  "Africa/Blantyre",
  "Africa/Dar_es_Salaam",
  "America/Asuncion",
  "America/Bahia",
  "America/Buenos_Aires",
  "America/Campo_Grande",
  "America/Cuiaba",
  "America/La_Paz",
  "America/Lima",
  "America/Montevideo",
  "America/Punta_Arenas",
  "America/Recife",
  "America/Santiago",
  "America/Sao_Paulo",
  "Asia/Jakarta",
  "Indian/Antananarivo",
  "Indian/Mauritius",
  "Indian/Reunion",
  "Pacific/Apia",
  "Pacific/Auckland",
  "Pacific/Chatham",
  "Pacific/Fiji",
  "Pacific/Noumea",
  "Pacific/Port_Moresby",
  "Pacific/Tahiti",
  "Pacific/Tongatapu",
] as const;

let cachedLatitude: GardenSkyLatitude | null = null;

/** Nominal 35°, hemisphere from the visitor's time zone (O11). */
export function gardenSkyLatitude(): GardenSkyLatitude {
  if (cachedLatitude) return cachedLatitude;
  cachedLatitude = gardenSkyLatitudeForZone(resolvedTimeZone(), new Date().getFullYear());
  return cachedLatitude;
}

/** Exposed for tests: the hemisphere rule for one IANA zone name. */
export function gardenSkyLatitudeForZone(timeZone: string, year: number): GardenSkyLatitude {
  const january = new Date(year, 0, 1).getTimezoneOffset();
  const july = new Date(year, 6, 1).getTimezoneOffset();
  // getTimezoneOffset is minutes WEST of UTC, so the daylight-saving half of
  // the year has the smaller value. This only holds for the runtime's own zone,
  // which is the zone `resolvedTimeZone` returns.
  const southernByDst = january !== july && january < july && timeZone === resolvedTimeZone();
  const southernByName = SOUTHERN_ZONE_PREFIXES.some((prefix) => timeZone.startsWith(prefix));
  const southern = southernByDst || southernByName;
  return { latitudeRad: southern ? -NOMINAL_LATITUDE_RAD : NOMINAL_LATITUDE_RAD, southern };
}

function resolvedTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

export interface GardenSkyDayParts {
  year: number;
  /** 1 … 12 */
  month: number;
  day: number;
  utcOffsetHours: number;
  /** Daylight-saving hours in force that day (usually 0 or 1). */
  dstHours: number;
  latitude: GardenSkyLatitude;
}

/** A sky day from explicit parts: deterministic, independent of the runtime zone. */
export function gardenSkyDayFromParts(parts: GardenSkyDayParts): GardenSkyDay {
  const midnightUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day);
  const julianDayAtLocalMidnight = midnightUtcMs / 86_400_000 + 2440587.5 - parts.utcOffsetHours / 24;
  const dayOfYear = Math.round((midnightUtcMs - Date.UTC(parts.year, 0, 1)) / 86_400_000) + 1;
  const declinationRad = 23.44 * DEG * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365);
  const latitudeRad = parts.latitude.latitudeRad;
  const solarNoonHour = SOLAR_NOON_STANDARD_HOUR + parts.dstHours;
  const cosH0 = -Math.tan(latitudeRad) * Math.tan(declinationRad);
  const halfDayHours = Math.acos(Math.min(1, Math.max(-1, cosH0))) / (15 * DEG);
  return {
    julianDayAtLocalMidnight,
    utcOffsetHours: parts.utcOffsetHours,
    latitudeRad,
    southern: parts.latitude.southern,
    declinationRad,
    solarNoonHour,
    sunriseHour: solarNoonHour - halfDayHours,
    sunsetHour: solarNoonHour + halfDayHours,
    apexElevationRad: Math.PI / 2 - Math.abs(latitudeRad - declinationRad),
  };
}

/** The sky day for a date's local calendar day in the runtime's zone. */
export function gardenSkyDay(date: Date, latitude: GardenSkyLatitude = gardenSkyLatitude()): GardenSkyDay {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const noonOffsetMinutes = new Date(year, month, day, 12).getTimezoneOffset();
  const standardOffsetMinutes = Math.max(
    new Date(year, 0, 1).getTimezoneOffset(),
    new Date(year, 6, 1).getTimezoneOffset(),
  );
  return gardenSkyDayFromParts({
    year,
    month: month + 1,
    day,
    utcOffsetHours: -noonOffsetMinutes / 60,
    dstHours: (standardOffsetMinutes - noonOffsetMinutes) / 60,
    latitude,
  });
}

let pinnedDay: GardenSkyDay | null = null;
let cachedDay: GardenSkyDay | null = null;
let cachedAtMs = Number.NaN;

/**
 * The world's sky day: the world calendar (a debug `d=` pin, else the wall
 * clock), recomputed at most once a minute. Every hour-only consumer
 * (`dayCycleBeats`, `gardenSunPose`, `gardenMoonPose`) reads this, so the
 * dome, the light rigs, the water and the DOM sentence agree on one date.
 */
export function gardenSkyToday(): GardenSkyDay {
  if (pinnedDay) return pinnedDay;
  const nowMs = Date.now();
  if (cachedDay && nowMs >= cachedAtMs && nowMs - cachedAtMs < 60_000) return cachedDay;
  cachedDay = gardenSkyDay(worldCalendarDate(new Date(nowMs)));
  cachedAtMs = nowMs;
  return cachedDay;
}

/** Pin the sky day (tests); `null` returns to the world calendar. */
export function pinGardenSkyDay(day: GardenSkyDay | null): void {
  pinnedDay = day;
  cachedDay = null;
}

let viewAspect = 1.6;

/** The live viewport aspect; the moon's displayed arc is scaled to it (K3). */
export function setGardenSkyViewAspect(aspect: number): void {
  if (Number.isFinite(aspect) && aspect > 0) viewAspect = aspect;
}

export function gardenSkyViewAspect(): number {
  return viewAspect;
}

/** Hour angle in hours, wrapped to [−12, 12): negative before solar noon. */
export function gardenSolarHourAngle(day: GardenSkyDay, hour: number): number {
  const delta = hour - day.solarNoonHour;
  return delta - 24 * Math.floor((delta + 12) / 24);
}

/** True solar elevation at a clock hour of a sky day, radians. */
export function gardenSolarElevationAt(day: GardenSkyDay, hour: number): number {
  const hourAngle = gardenSolarHourAngle(day, hour) * 15 * DEG;
  const sinElevation = Math.sin(day.latitudeRad) * Math.sin(day.declinationRad)
    + Math.cos(day.latitudeRad) * Math.cos(day.declinationRad) * Math.cos(hourAngle);
  return Math.asin(Math.min(1, Math.max(-1, sinElevation)));
}

/** Contract C2: the sun's true elevation for a date and clock hour, radians. */
export function gardenSolarElevationRad(date: Date, hour: number): number {
  return gardenSolarElevationAt(gardenSkyDay(date), hour);
}

/** The moon's age in days at a clock hour of a sky day. */
export function gardenMoonAgeDays(day: GardenSkyDay, hour: number): number {
  const julianDay = day.julianDayAtLocalMidnight + hour / 24;
  const age = (julianDay - NEW_MOON_EPOCH_JD) % SYNODIC_MONTH_DAYS;
  return age < 0 ? age + SYNODIC_MONTH_DAYS : age;
}

/** Half the rest view's horizontal FOV at an aspect, radians. */
export function gardenRestViewHalfWidthRad(aspect: number): number {
  return Math.atan(Math.tan((REST_SEAT_VFOV_DEG * DEG) / 2) * aspect);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** The moon at a clock hour of a sky day, displayed for a viewport aspect. */
export function gardenMoonStateAt(
  day: GardenSkyDay,
  hour: number,
  aspect: number,
  target: GardenMoonState = emptyMoonState(),
): GardenMoonState {
  const ageDays = gardenMoonAgeDays(day, hour);
  const transitHour = day.solarNoonHour + ageDays * MOON_TRANSIT_DRIFT_HOURS_PER_DAY;
  const sinceRise = hour - (transitHour - MOON_HALF_ARC_HOURS);
  const hoursUp = sinceRise - 24 * Math.floor(sinceRise / 24);
  const span = 2 * MOON_HALF_ARC_HOURS;
  // Below the horizon the pose sinks and swings back to the rising side out of
  // sight; its presence is 0 there, so a consumer that fades by it never sees
  // the swing.
  const progress = Math.min(1, hoursUp / span);
  const risen = hoursUp < span;
  const arc = risen ? Math.sin(Math.PI * progress) : -Math.sin(Math.PI * Math.min(1, (hoursUp - span) / (24 - span)));
  const halfArc = MOON_ARC_FILL * gardenRestViewHalfWidthRad(aspect);
  const azimuthProgress = risen ? progress : progress - (hoursUp - span) / (24 - span);
  target.azimuthRad = GARDEN_REST_VIEW_AZIMUTH + (azimuthProgress - 0.5) * 2 * halfArc;
  target.elevationRad = MOON_HORIZON_ELEVATION_RAD
    + (MOON_TRANSIT_ELEVATION_RAD - MOON_HORIZON_ELEVATION_RAD) * arc;
  target.up = risen && target.elevationRad > MOON_PRESENCE_START_RAD;
  target.presence = risen ? smoothstep(MOON_PRESENCE_START_RAD, MOON_PRESENCE_FULL_RAD, target.elevationRad) : 0;
  target.illumination = (1 - Math.cos((2 * Math.PI * ageDays) / SYNODIC_MONTH_DAYS)) / 2;
  target.waxing = ageDays < SYNODIC_MONTH_DAYS / 2;
  target.ageDays = ageDays;
  return target;
}

/** Contract C2: the displayed moon for a date, clock hour and viewport aspect. */
export function gardenMoonState(date: Date, hour: number, aspect: number): GardenMoonState {
  return gardenMoonStateAt(gardenSkyDay(date), hour, aspect);
}

function emptyMoonState(): GardenMoonState {
  return {
    up: false,
    azimuthRad: GARDEN_REST_VIEW_AZIMUTH,
    elevationRad: MOON_HORIZON_ELEVATION_RAD,
    illumination: 0,
    waxing: true,
    presence: 0,
    ageDays: 0,
  };
}

/**
 * The moon in words for the caption's ambient slot (K18: Almanac/phase text
 * only, never the live region), or null when it is down or new.
 */
export function gardenMoonPhrase(hour: number, day: GardenSkyDay = gardenSkyToday()): string | null {
  const moon = gardenMoonStateAt(day, hour, viewAspect);
  if (!moon.up) return null;
  const eighth = Math.floor(((moon.ageDays / SYNODIC_MONTH_DAYS) * 8 + 0.5) % 8);
  return [
    null,
    "a young crescent moon",
    "a half moon",
    "a waxing gibbous moon",
    "a full moon",
    "a waning gibbous moon",
    "a half moon",
    "an old crescent moon",
  ][eighth] ?? null;
}
