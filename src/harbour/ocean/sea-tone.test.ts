import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_KEYFRAMES, seasonalKeyHour, TimeOfDay, type SeasonalDay } from "../engine/time-of-day";
import { createWorldUniforms } from "../engine/uniforms";
import { solarDay } from "../season/calendar";
import { CLOUD_SHADOW_GLSL } from "../sky/cloud-shadow";
import { DEWS_LEVELS, targetsForLevel, type WeatherBand } from "../weather/director";
import { OCEAN_FRAG } from "./ocean-material";
import { glintCap, lobe, SEA_HOUR, SEA_TONE_GLSL, seaHour } from "./sea-tone";

/**
 * E01 (O3-F13 / O4-F1): the sea's clouds in the mirror under a weather front. A TS twin of the GLSL
 * (sky/cloud-shadow.ts hbCloudShadow, ocean/sea-tone.ts hbMirrorClouds' weight), driven by the uniforms the sky
 * writes (sky-system.ts, drifting cloud shadows) and pinned to both sources below.
 */
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// the sky's side (sky-system.ts): storm grade, coverage threshold and shadow strength from the DEWS cover
const stormOf = (cover: number) => smoothstep(0.38, 0.75, cover);
const thresholdOf = (cover: number) => 0.66 - 0.3 * cover;
const strengthOf = (cover: number, sunUp: number, night: number) =>
  (0.42 + 0.2 * stormOf(cover)) * sunUp * smoothstep(0.12, 0.45, cover) * (1 - 0.7 * night);
const coverOf = (band: WeatherBand) => targetsForLevel(DEWS_LEVELS[band]).cloud;
const BANDS = Object.keys(DEWS_LEVELS) as WeatherBand[];

interface Sky { w: number; k: number; wBehind: number; kBehind: number; front: boolean; breaks: number; squall: number }
/** The uniforms for weather `from`, with a front bringing `to` (or none when they match). */
function sky(from: WeatherBand, to: WeatherBand, sunUp: number, night: number, breaks = 0, squall = 0): Sky {
  const a = coverOf(from), b = coverOf(to);
  return { w: strengthOf(a, sunUp, night), k: thresholdOf(a), wBehind: strengthOf(b, sunUp, night), kBehind: thresholdOf(b), front: from !== to, breaks, squall };
}

/** hbCloudShadow at one point: bh 0 ahead … 1 behind the line; n the deck noise, nb the sunbreak noise, g the squall's exp(-d²). */
function cloudShadow(s: Sky, bh: number, n: number, nb: number, g: number) {
  const b = s.front ? bh : 0;
  const w = mix(s.w, s.wBehind, b), k = mix(s.k, s.kBehind, b);
  const deck = { cover: 0, storm: 1 - smoothstep(0.435, 0.546, k) };
  let r = 1;
  if (w > 0.001) {
    deck.cover = smoothstep(k, k + 0.16, n);
    r = 1 - w * deck.cover;
  }
  if (s.breaks > 0.001) r = mix(r, 1 - 0.55 * smoothstep(0.4, 0.47, nb), s.breaks);
  if (s.squall > 0.001) r *= 1 - s.squall * g;
  return { r, deck };
}
/** The mirror-cloud weight as shipped in v1.4.1 (divided by the sky-ahead strength) … */
function weightBefore(s: Sky, bh: number, n: number, nb: number, g: number): number {
  if (s.w < 0.001) return 0;
  return (1 - cloudShadow(s, bh, n, nb, g).r) / s.w;
}
/** … and now: the deck's own coverage (both are then × 0.55 × the reflected ray's elevation fade). */
function weightNow(s: Sky, bh: number, n: number, nb: number, g: number): number {
  if (Math.max(s.w, s.front ? s.wBehind : 0) < 0.001) return 0;
  return clamp01(cloudShadow(s, bh, n, nb, g).deck.cover);
}

const steps = (k: number) => Array.from({ length: k + 1 }, (_, i) => i / k);

describe("E01 clouds in the mirror under a weather front", () => {
  it("stays a bounded, finite weight for every from/to band, hour, sunbreak and squall", () => {
    let finite = true, lo = Infinity, hi = -Infinity, stormLo = Infinity, stormHi = -Infinity, worstBefore = 0;
    for (const from of BANDS) for (const to of BANDS) {
      for (const sunUp of [0, 0.05, 0.3, 1]) for (const night of [0, 0.5, 1]) for (const breaks of [0, 0.6, 1]) for (const squall of [0, 0.32]) {
        const s = sky(from, to, sunUp, night, breaks, squall);
        for (const bh of steps(4)) for (const n of steps(20)) for (const nb of [0, 0.43, 1]) for (const g of [0, 1]) {
          const w = weightNow(s, bh, n, nb, g), { storm } = cloudShadow(s, bh, n, nb, g).deck;
          finite &&= Number.isFinite(w) && Number.isFinite(storm);
          lo = Math.min(lo, w); hi = Math.max(hi, w);
          stormLo = Math.min(stormLo, storm); stormHi = Math.max(stormHi, storm);
          worstBefore = Math.max(worstBefore, weightBefore(s, bh, n, nb, g));
        }
      }
    }
    expect(finite).toBe(true);
    expect([lo, hi]).toEqual([0, 1]);
    expect([stormLo, stormHi]).toEqual([0, 1]);
    // the defect this replaces: a front's strength over the old sky's (~0.0098 at Calm) blew the weight out
    expect(worstBefore).toBeGreaterThan(30);
  });

  it("renders a rising Calm → Warning front from its own deck, not ~40× it", () => {
    const s = sky("CALM", "WARNING", 1, 0);
    expect(s.w).toBeCloseTo(0.0098, 3);
    expect(weightBefore(s, 1, 1, 0, 0)).toBeGreaterThan(35);
    expect(weightNow(s, 1, 1, 0, 0)).toBe(1);
    // ahead of the line the Calm sky keeps its few fair-weather clouds
    expect(weightNow(s, 0, 1, 0, 0)).toBe(1);
    expect(weightNow(s, 0, 0.5, 0, 0)).toBe(0);
  });

  it("leaves settled weather exactly as it was (Calm included), by day and by night", () => {
    for (const band of BANDS) for (const sunUp of [0, 0.02, 0.3, 1]) for (const night of [0, 1]) {
      const s = sky(band, band, sunUp, night);
      for (const n of steps(40)) expect(weightNow(s, 0, n, 0, 0)).toBeCloseTo(weightBefore(s, 0, n, 0, 0), 12);
    }
    // a clear sky with no front still has no clouds in the mirror (the early-out holds)
    const calmNight = sky("CALM", "CALM", 0, 1);
    expect(weightNow(calmNight, 0, 1, 0, 0)).toBe(0);
  });

  it("slates the mirrored clouds only under a storm deck, side by side across a front", () => {
    const storm = (from: WeatherBand, to: WeatherBand, bh: number) => cloudShadow(sky(from, to, 1, 0), bh, 0.9, 0, 0).deck.storm;
    for (const band of BANDS) expect(storm(band, band, 0)).toBeCloseTo(stormOf(coverOf(band)), 2);
    expect(storm("CALM", "CALM", 0)).toBe(0);
    expect(storm("WATCH", "WATCH", 0)).toBe(0);
    expect(storm("WARNING", "WARNING", 0)).toBe(1);
    expect(storm("CALM", "WARNING", 0)).toBe(0);     // ahead of a rising front: the fair-weather mirror
    expect(storm("CALM", "WARNING", 1)).toBe(1);     // behind it: the deck's slate
    expect(storm("WARNING", "CALM", 1)).toBe(0);     // behind a clearing line: fair clouds again
    // the reef's storm grade reads the DEWS cover alone (OCEAN_FRAG's `cover`): nothing at Calm or Watch
    for (const band of ["CALM", "WATCH"] as const) expect(smoothstep(0.4, 0.95, coverOf(band))).toBe(0);
  });

  it("pins the twin to the shaders", () => {
    expect(CLOUD_SHADOW_GLSL).toContain("float hbCloudShadow(vec2 xz, out vec2 deck) {");
    expect(CLOUD_SHADOW_GLSL).toContain("deck = vec2(0.0, 1.0 - smoothstep(0.435, 0.546, k));");
    expect(CLOUD_SHADOW_GLSL).toContain("deck.x = smoothstep(k, k + uCloudShadowK.y, n);");
    expect(CLOUD_SHADOW_GLSL).toContain("r = 1.0 - w * deck.x;");
    expect(CLOUD_SHADOW_GLSL).toContain("float hbCloudShadow(vec2 xz) { vec2 deck; return hbCloudShadow(xz, deck); }");
    expect(SEA_TONE_GLSL).toContain("if (max(uCloudShadow.w, uCloudShadowG.y * step(0.5, uCloudShadowF.w)) < 0.001) return vec4(sky, 0.0);");
    expect(SEA_TONE_GLSL).toContain("hbCloudShadow(q, deck);");
    expect(SEA_TONE_GLSL).toContain("float cc = clamp(deck.x, 0.0, 1.0);");
    expect(SEA_TONE_GLSL).toContain("cloud = mix(cloud, vec3(l) * vec3(0.86, 0.94, 1.07) * 0.85, deck.y);");
    expect(SEA_TONE_GLSL).not.toMatch(/\/\s*uCloudShadow\.w/);
    expect(OCEAN_FRAG).toContain("float mA = clamp(mCloud.a, 0.0, 1.0);");
    expect(OCEAN_FRAG).not.toMatch(/mCloud\.a\s*\*/);
    expect(OCEAN_FRAG).toContain("cover * 0.45) * (1.0 - 0.15 * cover);");
  });

  it("keeps the sky mapping that the twin and the slate threshold assume", () => {
    const src = readFileSync(resolve(__dirname, "../sky/sky-system.ts"), "utf8");
    expect(src).toContain("const stormOf = (cover: number) => THREE.MathUtils.smoothstep(cover, 0.38, 0.75);");
    expect(src).toContain("cs.uCloudShadowK.value.set(0.66 - 0.3 * this.coverS, 0.16);");
    expect(src).toContain("cs.uCloudShadowK.value.x = 0.66 - 0.3 * fr.coverFrom;");
    expect(src).toContain("cs.uCloudShadowG.value.set(0.66 - 0.3 * fr.coverTo, shadowW(fr.coverTo), 0);");
    expect(src).toContain("(0.42 + 0.2 * stormOf(cov)) * sunUp * THREE.MathUtils.smoothstep(cov, 0.12, 0.45) * (1 - 0.7 * night)");
    expect(src).toContain("(0.42 + 0.2 * storm) * sunUp * THREE.MathUtils.smoothstep(this.coverS, 0.12, 0.45) * (1 - 0.7 * night),");
    // the slate edges are that threshold at the storm grade's own edges
    expect(thresholdOf(0.38)).toBeCloseTo(0.546, 6);
    expect(thresholdOf(0.75)).toBeCloseTo(0.435, 6);
  });
});

/**
 * E11 hour-coherent water: seaHour (sea-tone.ts) against the real time-of-day evaluation, every day of the year.
 * The ocean evaluates the keys privately at this hour and at noon (ocean-system.ts hourLight), as here.
 */
describe("E11 the hour on the water", () => {
  beforeEach(() => vi.stubGlobal("location", { search: "", hash: "" }));
  afterEach(() => vi.unstubAllGlobals());
  const TINTS = [new THREE.Color(1, 1, 1), new THREE.Color(1.05, 1.0, 0.88), new THREE.Color(1.05, 0.97, 0.86), new THREE.Color(0.93, 0.97, 1.05)];
  const seasonOf = (doy: number, lat: number, tint: THREE.Color): SeasonalDay => {
    const d = solarDay(doy, lat, 0);
    return { sunrise: d.sunrise, sunset: d.sunset, noonElevation: d.noonElevation, sunTint: tint, saturation: 1, skyPale: 0.1 };
  };
  /** seaHour at key hour `hour` of `season` (null: the authored reference day), as the ocean computes it. */
  function at(hour: number, season: SeasonalDay | null) {
    const tod = new TimeOfDay(), now = createWorldUniforms(), noon = createWorldUniforms();
    tod.season = season;
    tod.hour = 12; tod.apply(noon);
    tod.hour = hour; tod.apply(now);
    const tint = new THREE.Vector4(), low = new THREE.Vector2();
    seaHour(now, noon, tint, low);
    return { tint, low, night: now.uNight.value };
  }

  it("leaves noon exactly as it was, on every day of the year, either hemisphere, any season tint", () => {
    for (let doy = 1; doy <= 365; doy += 2) for (const lat of [35, -35]) {
      const { tint, low } = at(12, seasonOf(doy, lat, TINTS[doy % TINTS.length]));
      expect(tint.toArray()).toEqual([1, 1, 1, 1]);
      expect(low.toArray()).toEqual([1, 0]);                     // the basin lift whole, no extra mirror
    }
    expect(at(12, null).tint.toArray()).toEqual([1, 1, 1, 1]);
    // the clock's noon on the authored day runs the live TimeOfDay through the same keys: identical uniforms
    const live = new TimeOfDay(), u = createWorldUniforms();
    live.setHour(12); live.update(0, 0, u);
    const ref = createWorldUniforms(), s = new TimeOfDay(); s.hour = 12; s.apply(ref);
    expect(u.uAmbient.value.toArray()).toEqual(ref.uAmbient.value.toArray());
    expect(u.uSunColor.value.toArray()).toEqual(ref.uSunColor.value.toArray());
  });

  it("stays finite and bounded at every hour and season; deep night is the v1.5.0 night exactly", () => {
    for (const doy of [20, 115, 196, 293, 312]) for (const tint of TINTS) {
      const season = seasonOf(doy, 35, tint);
      for (let h = 0; h < 24; h += 0.05) {
        const { tint: t, low, night } = at(h, season);
        for (const v of [...t.toArray(), ...low.toArray()]) expect(Number.isFinite(v)).toBe(true);
        for (const c of [t.x, t.y, t.z]) { expect(c).toBeGreaterThan(0.3); expect(c).toBeLessThanOrEqual(SEA_HOUR.hueMax); }
        expect(t.w).toBeGreaterThanOrEqual(1 - SEA_HOUR.twilightChroma - 1e-12); expect(t.w).toBeLessThanOrEqual(1);
        expect(low.x).toBeGreaterThanOrEqual(0); expect(low.x).toBeLessThanOrEqual(1 - night + 1e-12);   // never above v1.5.0's lift
        expect(low.y).toBeGreaterThanOrEqual(0); expect(low.y).toBeLessThanOrEqual(SEA_HOUR.floor);
        if (night >= 1) { expect(t.toArray()).toEqual([1, 1, 1, 1]); expect(low.toArray()).toEqual([0, 0]); }
      }
    }
  });

  it("follows the hour: dawn, the golden hour and dusk deepen, cool and calm the basin; its lift waits for a high sun", () => {
    const nov8 = seasonOf(312, 35, TINTS[2]);
    const hourOf = (clock: number) => seasonalKeyHour(clock, nov8.sunrise, nov8.sunset);
    const lum = (t: THREE.Vector4) => 0.2126 * t.x + 0.7152 * t.y + 0.0722 * t.z;
    const dawn = at(hourOf(6.9), nov8), morning = at(hourOf(9), nov8), noon = at(hourOf(11), nov8);
    const golden = at(hourOf(16.4), nov8), dusk = at(hourOf(17.1), nov8), blue = at(hourOf(17.6), nov8);
    expect(lum(noon.tint)).toBeGreaterThan(0.97);                                    // the "noon" frame (11 h) is as it was
    for (const low of [dawn, golden, dusk]) {
      expect(lum(low.tint)).toBeLessThan(0.8);
      expect(low.low.x).toBeLessThan(0.05);                                           // no luminous lift under a low sun
      expect(low.low.y).toBeGreaterThan(0.05);                                        // the basin mirrors more of the hour's sky
      expect(low.tint.z).toBeGreaterThan(low.tint.x);                                 // cooler than its noon
    }
    expect(dawn.tint.w).toBeCloseTo(0.8, 6); expect(dusk.tint.w).toBeCloseTo(0.8, 6); // twilight chroma cut
    expect(golden.tint.w).toBeLessThan(0.9);
    expect(blue.tint.w).toBeLessThan(0.9);
    expect(lum(morning.tint)).toBeGreaterThan(lum(golden.tint));
    expect(morning.low.x).toBeGreaterThan(0.95);
  });

  it("retunes only the dusk haze, cool instead of mauve", () => {
    const dusk = DEFAULT_KEYFRAMES.find((k) => k.hour === 19.7)!;
    expect(dusk.haze).toBe("#6E7890");
    const c = new THREE.Color(dusk.haze);
    expect(c.b).toBeGreaterThan(c.g); expect(c.g).toBeGreaterThan(c.r);
  });

  it("pins the twin to the shaders and to the ocean's private evaluation", () => {
    expect(SEA_TONE_GLSL).toContain("float w = zb * (1.0 - zr) * mix(0.45, 1.0, near) * uSeaLow.x;");
    expect(SEA_TONE_GLSL).not.toContain("mix(0.45, 1.0, near) * (1.0 - uNight)");
    expect(SEA_TONE_GLSL).toContain("body *= uSeaHour.rgb;");
    expect(SEA_TONE_GLSL).toContain("return mix(vec3(dot(body, vec3(0.2126, 0.7152, 0.0722))), body, uSeaHour.a);");
    expect(OCEAN_FRAG).toContain("body = hbSeaGolden(body, sunSh, sunUp);\n  body = hbSeaHour(body);");
    expect(OCEAN_FRAG).toContain("body = hbSeaHour(body);\n  // day/night exposure of the unlit tint");
    expect(OCEAN_FRAG).toContain("F = max(F, uSeaLow.y * zm.b);\n  vec3 col = body * (1.0 - F) + sky * F;");
    const sys = readFileSync(resolve(__dirname, "ocean-system.ts"), "utf8");
    expect(sys).toContain("s.hour = 12; s.apply(this.noonU);");
    expect(sys).toContain("s.hour = tod.hour; s.apply(this.hourU);");
    expect(sys).toContain("seaHour(this.hourU, this.noonU, u.uSeaHour.value as THREE.Vector4, u.uSeaLow.value as THREE.Vector2);");
    expect(sys).toContain("u.uBloomT.value = tod.bloomThreshold;");
  });
});

/** E13 glint coverage: the reference twins of hbLobe and hbGlintCap (sea-tone.ts), pinned to the shader. */
describe("E13 glints the pixel can hold", () => {
  /** ∫ over the hemisphere of lobe(cos θ) cos θ dω (the projected energy), midpoint rule in θ. */
  const energy = (n: number, spread: number) => {
    let e = 0;
    const N = 200000;
    for (let i = 0; i < N; i++) {
      const th = ((i + 0.5) / N) * (Math.PI / 2), c = Math.cos(th);
      e += lobe(c, n, spread) * c * Math.sin(th);
    }
    return 2 * Math.PI * e * (Math.PI / 2) / N;
  };
  const halfAngle = (n: number, spread: number) => {
    const peak = lobe(1, n, spread);
    let th = 0;
    while (lobe(Math.cos(th), n, spread) > peak / 2) th += 1e-5;
    return th;
  };

  it("is the sharp lobe exactly where the ripples barely turn across a pixel, and holds its energy as it widens", () => {
    for (const n of [300, 380, 1100, 1400]) {
      for (const c of [0, 0.3, 0.9, 0.999, 1]) expect(lobe(c, n, 0)).toBe(Math.pow(c, n));
      const e0 = energy(n, 0);
      expect(e0).toBeCloseTo((2 * Math.PI) / (n + 2), 4);
      let prevHalf = 0, prevPeak = Infinity;
      for (const spread of [1e-4, 5e-4, 0.002, 0.01, 0.05, 0.3]) {
        expect(energy(n, spread) / e0).toBeCloseTo(1, 2);               // the facets' light stays …
        const half = halfAngle(n, spread), peak = lobe(1, n, spread);
        expect(half).toBeGreaterThan(prevHalf); expect(peak).toBeLessThan(prevPeak);   // … spread wider, lower
        prevHalf = half; prevPeak = peak;
      }
    }
    // ripples turning the normal ~6° across a pixel (spread 0.01 rad²) widen the 1400 crest facet from a 1.8° pinprick
    expect(halfAngle(1400, 0.01)).toBeGreaterThan(3 * halfAngle(1400, 0));
  });

  it("never lets a glint take its pixel over 0.85 × the bloom threshold, and leaves smaller glints and their hue alone", () => {
    const luma = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    let seed = 3;
    const r = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 5000; i++) {
      const bloomT = 1 + r() * 1.2, base = r() * bloomT, glint: [number, number, number] = [r() * 4, r() * 4, r() * 4];
      const capped = glintCap(glint, base, bloomT);
      expect(base + luma(capped)).toBeLessThanOrEqual(Math.max(0.85 * bloomT, base) + 1e-9);
      if (luma(glint) > 1e-6) for (let c = 0; c < 3; c++) expect(capped[c] * luma(glint)).toBeCloseTo(glint[c] * luma(capped), 9);
      if (base + luma(glint) <= 0.85 * bloomT) expect(capped).toEqual(glint);
      for (const v of capped) expect(v).toBeGreaterThanOrEqual(0);
    }
    // every hour's threshold leaves the water a ceiling: the lowest key threshold is the night's 1.0
    expect(Math.min(...DEFAULT_KEYFRAMES.map((k) => (k.bloom ?? [0.5, 1.5])[1]))).toBe(1);
  });

  it("widens every sun and moon glint lobe by footprint, melts the spark masks on ascending ramps, then caps", () => {
    expect(SEA_TONE_GLSL).toContain("float m = n / (1.0 + n * spread);\n  return pow(c, m) * ((m + 2.0) / (n + 2.0));");
    expect(SEA_TONE_GLSL).toContain("return glint * min(1.0, max(0.85 * uBloomT - base, 0.0) / max(g, 1e-4));");
    expect(OCEAN_FRAG).toContain("float unres = smoothstep(0.12, 0.35, fp);\n  #ifdef HB_LITE\n  unres = 1.0;\n  #endif\n  float spread = 0.3 * fp * fp;");
    // the Low tier never pays more: its glints read the calm normals only and the column drops its twinkling facets
    expect(OCEAN_FRAG).toContain("#ifdef HB_LITE\n  sparks = 0.0;\n  #endif");
    expect(OCEAN_FRAG).toContain("float aa = unres;");
    expect(OCEAN_FRAG).toContain("float sparks = min(hbLobe(rs, 300.0, 4.0 * spread) * 3.6 + hbLobe(rsp, 1100.0, 4.0 * spread) * 8.0, 2.4)");
    expect(OCEAN_FRAG).toContain("float rs = mix(max(dot(R, uGlintDir), 0.0), rsE, unres);");
    expect(OCEAN_FRAG).toContain("float rsp = mix(max(dot(reflect(vd, Nsp), uGlintDir), 0.0), rsE, unres);");
    expect(OCEAN_FRAG).toContain("float nhF = mix(max(dot(Nsp, Hs), 0.0), max(dot(gN, Hs), 0.0), unres);");
    expect(OCEAN_FRAG).toContain("float facet = hbLobe(nhF, 1400.0, spread) * mix(smoothstep(0.5, 0.8, nB.a), 0.2, aa)");
    expect(OCEAN_FRAG).toContain("float tw = mix(smoothstep(0.8, 0.97, r2.a * 0.6 + r1.a * 0.4 + 0.22 * sin(t * 1.3 + nC.a * 30.0)), 0.03, aa);");
    expect(OCEAN_FRAG).toContain("float sparkMask = mix(smoothstep(0.45, 0.85, nC.a + 0.25 * nB.b), 0.45, aa);");
    expect(OCEAN_FRAG).toContain("float dense = hbLobe(nh, 380.0, spread)");
    expect(OCEAN_FRAG).toContain("glint = hbHelioGlint(glint, hbHelioCoin(rel), nhF, nB.a, sparkMask, far01, spread);");
    expect(OCEAN_FRAG).not.toMatch(/pow\(rs, 300\.0\)|pow\(rsp, 1100\.0\)|1400\.0\) \* smoothstep|pow\(max\(dot\(Nsp, Hs\), 0\.0\), 380\.0\)/);
    // the cap follows the last sun/moon glint and precedes the heliograph (the beam's reach keeps its own scale)
    const cap = OCEAN_FRAG.indexOf("glint = hbGlintCap(glint, dot(col, vec3(0.2126, 0.7152, 0.0722)));");
    expect(cap).toBeGreaterThan(OCEAN_FRAG.indexOf("glint += uGlintCol * crest * dash * farBand"));
    expect(cap).toBeLessThan(OCEAN_FRAG.indexOf("glint = hbHelioGlint("));
    // footprint ramps ascend (B07): every literal edge pair low < high
    for (const m of OCEAN_FRAG.matchAll(/smoothstep\(([\d.]+), ([\d.]+), fp\)/g)) expect(Number(m[1])).toBeLessThan(Number(m[2]));
  });
});
