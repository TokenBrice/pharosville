import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CLOUD_SHADOW_GLSL } from "../sky/cloud-shadow";
import { DEWS_LEVELS, targetsForLevel, type WeatherBand } from "../weather/director";
import { OCEAN_FRAG } from "./ocean-material";
import { SEA_TONE_GLSL } from "./sea-tone";

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
