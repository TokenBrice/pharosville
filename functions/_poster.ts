import {
  dayOfYear, isSouthernZone, NOMINAL_LATITUDE, overrideDay, parseSeasonOverride, solarDay,
} from "../src/harbour/season/calendar";

/**
 * E28 night key art: which poster the shell paints first, chosen before first paint (functions/index.ts; the dev
 * server's poster plugin runs the same code). The choice follows the harbour's own decorative clock — the visitor's
 * local time on the season's real day at the nominal latitude (engine/time-of-day.ts with season/calendar.ts) — so the
 * night key art opens exactly when the live harbour's first frame is night (its night share ≥ 0.5, where the overlay's
 * night bridge also opens, ui/palette.ts). The visitor's time zone comes from `request.cf.timezone`; when it is
 * missing or unknown the shell keeps the day key art (the arrival then dims it in step with its fade, wake.ts).
 * `?t=` pins the clock as the harbour does (with `?month=` / `?season=`). Pure: the caller passes the time; nothing
 * from the request is ever written into the page.
 */

/** The night share at which the shell opens on the night key art. */
export const NIGHT_POSTER_FROM = 0.5;

/** engine/time-of-day.ts DEFAULT_KEYFRAMES as [hour, night] (poster.test.ts keeps them equal). */
export const NIGHT_KEYS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [4.6, 0.95], [5.5, 0.5], [6.4, 0.25], [8.5, 0], [12, 0], [16, 0],
  [18.5, 0.05], [19.2, 0.1], [19.7, 0.45], [20.7, 0.85], [22, 1], [24, 1],
];

/** The night share at a keyframe hour, eased between keys exactly as TimeOfDay.apply does. */
export function nightAtKeyHour(keyHour: number): number {
  const k = NIGHT_KEYS;
  let i = 0;
  while (i < k.length - 2 && k[i + 1][0] <= keyHour) i++;
  const [ha, na] = k[i], [hb, nb] = k[i + 1];
  const lin = Math.min(1, Math.max(0, (keyHour - ha) / Math.max(1e-6, hb - ha)));
  return na + (nb - na) * lin * lin * (3 - 2 * lin);
}

const REF_RISE = 6.0, REF_SET = 19.85, RISE_PRE = 1.4, RISE_POST = 1.5, SET_PRE = 2.0, SET_POST = 1.2;

/** Clock hour → keyframe hour for a seasonal day: engine/time-of-day.ts seasonalKeyHour (poster.test.ts parity). */
export function seasonalKeyHour(hour: number, sunrise: number, sunset: number): number {
  const day = Math.max(1, sunset - sunrise), night = 24 - day;
  const kd = Math.min(1, (day * 0.75) / (RISE_POST + SET_PRE)), kn = Math.min(1, (night * 0.75) / (SET_POST + RISE_PRE));
  const c = [0, RISE_POST * kd, day - SET_PRE * kd, day, day + SET_POST * kn, 24 - RISE_PRE * kn, 24];
  const r = [REF_RISE, REF_RISE + RISE_POST * kd, REF_SET - SET_PRE * kd, REF_SET, REF_SET + SET_POST * kn, REF_RISE + 24 - RISE_PRE * kn, REF_RISE + 24];
  const h = ((hour - sunrise) % 24 + 24) % 24;
  let i = 0;
  while (i < c.length - 2 && h > c[i + 1]) i++;
  const f = (h - c[i]) / Math.max(1e-6, c[i + 1] - c[i]);
  return (r[i] + f * (r[i + 1] - r[i])) % 24;
}

interface ZonedTime { year: number; month: number; day: number; hour: number; offsetMin: number }
const formats = new Map<string, Intl.DateTimeFormat | null>();

/** The wall clock in an IANA zone (offsetMin: minutes EAST of UTC), or null when the runtime does not know the zone. */
export function zonedTime(timeZone: string, ms: number): ZonedTime | null {
  let format = formats.get(timeZone);
  if (format === undefined) {
    try {
      format = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    } catch { format = null; }
    if (formats.size < 512) formats.set(timeZone, format);
  }
  if (!format) return null;
  const p: Record<string, number> = {};
  for (const part of format.formatToParts(ms)) if (part.type !== "literal") p[part.type] = Number(part.value);
  const whole = ms - (((ms % 1000) + 1000) % 1000);
  const offsetMin = Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - whole) / 60_000);
  return Number.isFinite(offsetMin) ? { year: p.year, month: p.month, day: p.day, hour: (p.hour % 24) + p.minute / 60 + p.second / 3600, offsetMin } : null;
}

/** The harbour's night share for this visitor now (or at a pinned `?t=`), or null when their clock is unknown. */
export function visitorNightShare(input: { timeZone?: unknown; nowMs: number; search: URLSearchParams }): number | null {
  const pinned = Number.parseFloat(input.search.get("t") ?? "");
  const zone = typeof input.timeZone === "string" && input.timeZone.length <= 64 ? input.timeZone : null;
  const now = zone ? zonedTime(zone, input.nowMs) : null;
  if (!now && !Number.isFinite(pinned)) return null;
  const local = now ?? zonedTime("UTC", input.nowMs)!;
  // the hemisphere and daylight saving as the season system reads them from the visitor's zone (season-system.ts)
  const west = (ms: number) => -(zone ? zonedTime(zone, ms)?.offsetMin ?? 0 : 0);
  const jan = west(Date.UTC(local.year, 0, 1, 12)), jul = west(Date.UTC(local.year, 6, 1, 12));
  const southern = zone ? isSouthernZone(zone, jan, jul) : false;
  const forced = overrideDay(parseSeasonOverride((k) => input.search.get(k)), local.year, southern);
  const doy = forced ?? dayOfYear(local.year, local.month, local.day);
  const dst = (Math.max(jan, jul) - west(Date.UTC(local.year, 0, doy, 12))) / 60;
  const sd = solarDay(doy, southern ? -NOMINAL_LATITUDE : NOMINAL_LATITUDE, dst);
  const clock = Number.isFinite(pinned) ? ((pinned % 24) + 24) % 24 : local.hour;
  return nightAtKeyHour(seasonalKeyHour(clock, sd.sunrise, sd.sunset));
}

/** Does the shell open on the night key art? Unknown clocks keep the day key art. */
export function wantsNightPoster(input: { timeZone?: unknown; nowMs: number; search: URLSearchParams }): boolean {
  const night = visitorNightShare(input);
  return night != null && night >= NIGHT_POSTER_FROM;
}

const NIGHT_URL_ATTRIBUTE: Record<string, string> = { link: "imagesrcset", source: "srcset", img: "src" };

/**
 * The night shell: each `data-pv-night` value (authored in index.html; the build rewrites its URLs like any other)
 * takes the place of its element's own image URL, `data-pv-night-alt` of the alt text, and the root carries
 * `data-pv-hour="night"` for the arrival CSS. Only values already in the document move; nothing else changes.
 */
export function nightShell(html: string): string {
  return html
    .replace(/<html\b([^>]*)>/i, (tag, attrs: string) => (/\bdata-pv-hour=/.test(attrs) ? tag : `<html${attrs} data-pv-hour="night">`))
    .replace(/<(link|source|img)\b([^>]*?)(\/?)>/gi, (tag, name: string, attrs: string, close: string) => {
      const night = /\sdata-pv-night="([^"]*)"/.exec(attrs);
      if (!night) return tag;
      const target = NIGHT_URL_ATTRIBUTE[name.toLowerCase()];
      let out = attrs.replace(night[0], "");
      out = out.replace(new RegExp(`(\\s${target}=")[^"]*(")`), (_m, a: string, b: string) => `${a}${night[1]}${b}`);
      const alt = /\sdata-pv-night-alt="([^"]*)"/.exec(out);
      if (alt) out = out.replace(alt[0], "").replace(/(\salt=")[^"]*(")/, (_m, a: string, b: string) => `${a}${alt[1]}${b}`);
      return `<${name}${out}${close}>`;
    });
}
