// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_KEYFRAMES, seasonalKeyHour as engineKeyHour, TimeOfDay } from "../src/harbour/engine/time-of-day";
import { createWorldUniforms } from "../src/harbour/engine/uniforms";
import * as THREE from "three";
import { dayOfYear, isSouthernZone, NOMINAL_LATITUDE, solarDay } from "../src/harbour/season/calendar";
import {
  NIGHT_KEYS, NIGHT_POSTER_FROM, nightAtKeyHour, nightShell, seasonalKeyHour, visitorNightShare, wantsNightPoster, zonedTime,
} from "./_poster";

const SHELL_HTML = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const at = (iso: string) => Date.parse(iso);
const none = new URLSearchParams();

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("the night key art follows the harbour's own clock", () => {
  it("keeps the keyframes' night shares and easing (engine/time-of-day.ts)", () => {
    expect(NIGHT_KEYS.map(([h, n]) => [h, n])).toEqual(DEFAULT_KEYFRAMES.map((k) => [k.hour, k.night]));
    vi.stubGlobal("location", { search: "", hash: "" });
    const tod = new TimeOfDay(), u = createWorldUniforms();
    for (let h = 0; h < 24; h += 0.0625) {
      tod.hour = h; tod.apply(u);
      expect(nightAtKeyHour(h), `key hour ${h}`).toBeCloseTo(u.uNight.value, 12);
    }
  });

  it("maps the clock onto the season's real day as the engine does", () => {
    for (const [rise, set] of [[6, 19.85], [7.4, 16.9], [4.3, 21.2], [6.86, 17.14], [8.9, 15.2]]) {
      for (let h = 0; h < 24; h += 0.1) expect(seasonalKeyHour(h, rise, set)).toBeCloseTo(engineKeyHour(h, rise, set), 12);
    }
  });

  it("reads the visitor's wall clock and offset from an IANA zone, and refuses unknown zones", () => {
    expect(zonedTime("Europe/Paris", at("2026-01-15T12:00:00Z"))).toMatchObject({ hour: 13, offsetMin: 60, month: 1, day: 15 });
    expect(zonedTime("Europe/Paris", at("2026-07-15T12:00:00Z"))).toMatchObject({ hour: 14, offsetMin: 120 });
    expect(zonedTime("America/New_York", at("2026-11-09T03:30:00Z"))).toMatchObject({ day: 8, hour: 22.5, offsetMin: -300 });
    expect(zonedTime("Asia/Kolkata", at("2026-11-09T00:00:00Z"))).toMatchObject({ hour: 5.5, offsetMin: 330 });
    expect(zonedTime("Mars/Olympus_Mons", 0)).toBeNull();
    expect(zonedTime("<script>", 0)).toBeNull();
  });

  // The whole chain against the engine itself, with the process clock in each zone (season-system.ts + TimeOfDay).
  it.each([
    ["Europe/Belgrade", "2026-11-09T21:00:00Z"], ["Europe/Belgrade", "2026-11-09T10:00:00Z"], ["Europe/Belgrade", "2026-11-09T16:05:00Z"],
    ["America/New_York", "2026-11-09T22:10:00Z"], ["America/New_York", "2026-07-01T00:30:00Z"], ["Australia/Sydney", "2026-01-10T09:20:00Z"],
    ["Australia/Sydney", "2026-07-10T08:00:00Z"], ["Asia/Kolkata", "2026-03-20T13:15:00Z"], ["UTC", "2026-12-21T16:40:00Z"],
  ])("matches the live harbour's first-frame night share in %s at %s", (zone, iso) => {
    vi.stubEnv("TZ", zone);
    vi.stubGlobal("location", { search: "", hash: "" });
    const now = new Date(at(iso));
    const jan = new Date(now.getFullYear(), 0, 1).getTimezoneOffset(), jul = new Date(now.getFullYear(), 6, 1).getTimezoneOffset();
    const southern = isSouthernZone(zone, jan, jul);
    const doy = dayOfYear(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const std = Math.max(jan, jul), dst = (std - new Date(now.getFullYear(), 0, doy, 12).getTimezoneOffset()) / 60;
    const sd = solarDay(doy, southern ? -NOMINAL_LATITUDE : NOMINAL_LATITUDE, dst);
    const tod = new TimeOfDay(), u = createWorldUniforms();
    tod.season = { sunrise: sd.sunrise, sunset: sd.sunset, noonElevation: sd.noonElevation, sunTint: new THREE.Color(1, 1, 1), saturation: 1, skyPale: 0 };
    tod.update(now.getTime(), 0, u);
    expect(visitorNightShare({ timeZone: zone, nowMs: now.getTime(), search: none })).toBeCloseTo(u.uNight.value, 6);
  });

  it("opens on the night key art from a night share of one half, as the overlay's night bridge does", () => {
    expect(NIGHT_POSTER_FROM).toBe(0.5);
    expect(wantsNightPoster({ timeZone: "Europe/Belgrade", nowMs: at("2026-11-09T21:00:00Z"), search: none })).toBe(true); // 22:00
    expect(wantsNightPoster({ timeZone: "Europe/Belgrade", nowMs: at("2026-11-09T10:00:00Z"), search: none })).toBe(false); // 11:00
    // dusk on 9 November at the nominal latitude (sunset ≈ 17.14): golden light keeps the day art, the blue hour opens night
    expect(wantsNightPoster({ timeZone: "Europe/Belgrade", nowMs: at("2026-11-09T15:30:00Z"), search: none })).toBe(false); // 16:30
    expect(wantsNightPoster({ timeZone: "Europe/Belgrade", nowMs: at("2026-11-09T17:00:00Z"), search: none })).toBe(true); // 18:00
  });

  it("follows a pinned ?t= (and its season), and keeps the day art for an unknown clock", () => {
    const t = (q: string) => new URLSearchParams(q);
    expect(wantsNightPoster({ nowMs: at("2026-11-09T12:00:00Z"), search: t("t=22") })).toBe(true);
    expect(wantsNightPoster({ timeZone: "Europe/Belgrade", nowMs: at("2026-11-09T21:00:00Z"), search: t("t=11") })).toBe(false);
    expect(wantsNightPoster({ nowMs: at("2026-11-09T12:00:00Z"), search: t("t=-2") })).toBe(true);
    // 19:30 is still golden light in midsummer and already night in midwinter
    expect(wantsNightPoster({ timeZone: "Europe/Paris", nowMs: at("2026-11-09T12:00:00Z"), search: t("t=19.5&season=summer") })).toBe(false);
    expect(wantsNightPoster({ timeZone: "Europe/Paris", nowMs: at("2026-11-09T12:00:00Z"), search: t("t=19.5&season=winter") })).toBe(true);
    for (const timeZone of [undefined, null, "", 42, "Not/AZone", "x".repeat(200)]) {
      expect(wantsNightPoster({ timeZone, nowMs: at("2026-11-09T21:00:00Z"), search: none })).toBe(false);
    }
    expect(wantsNightPoster({ timeZone: "Europe/Belgrade", nowMs: at("2026-11-09T21:00:00Z"), search: t("t=nonsense") })).toBe(true);
  });
});

describe("the night shell", () => {
  const night = nightShell(SHELL_HTML);

  it("names the night poster everywhere the day poster was named, before any image request", () => {
    const doc = new DOMParser().parseFromString(night, "text/html");
    expect(doc.documentElement.getAttribute("data-pv-hour")).toBe("night");
    const urls = [
      doc.querySelector('link[rel="preload"][as="image"]')?.getAttribute("imagesrcset"),
      ...[...doc.querySelectorAll("#pv-poster source")].map((s) => s.getAttribute("srcset")),
      doc.querySelector("#pv-poster img")?.getAttribute("src"),
    ];
    expect(urls).toEqual([
      "/harbour/poster-night-960.avif 960w, /harbour/poster-night-1600.avif 1600w",
      "/harbour/poster-night-960.avif 960w, /harbour/poster-night-1600.avif 1600w",
      "/harbour/poster-night-960.webp 960w, /harbour/poster-night-1600.webp 1600w",
      "/harbour/poster-night-1600.webp",
    ]);
    const welcome = (doc.getElementById("pv-welcome") as HTMLTemplateElement).content;
    expect(welcome.querySelector("img")?.getAttribute("src")).toBe("/harbour/poster-night-960.webp");
    expect(welcome.querySelector("img")?.getAttribute("alt")).toMatch(/^The PharosVille harbour at night: .*Illustration, not live readings\.$/);
    expect([...welcome.querySelectorAll("source")].map((s) => s.getAttribute("srcset"))).toEqual(urls.slice(1, 3));
    // no day poster is named anywhere, and no marker attribute is left behind
    expect(night).not.toMatch(/poster-(?:960|1600)\./);
    expect(night).not.toMatch(/data-pv-night/);
  });

  it("changes nothing else: the same markup, scripts, styles and metadata", () => {
    const strip = (html: string) => html
      .replace(/ data-pv-hour="night"/, "")
      .replace(/ data-pv-night(?:-alt)?="[^"]*"/g, "")
      .replace(/poster-night-/g, "poster-")
      .replace(/alt="The PharosVille harbour at [^"]*"/g, "alt=\"\"");
    expect(strip(night)).toBe(strip(SHELL_HTML));
    expect(nightShell(night)).toBe(night);
    expect(night.match(/<script\b/g)).toEqual(SHELL_HTML.match(/<script\b/g));
    expect(night).not.toMatch(/\sstyle=/);
  });
});
