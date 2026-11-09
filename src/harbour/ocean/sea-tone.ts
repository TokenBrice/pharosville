import type * as THREE from "three";

/**
 * The sea's value structure (FRAME lane, decorative only; no data reads). GLSL included by ocean-material after its
 * uniforms (uses uNoise). The zones keep their meaning: the Shoals (zm.r) are never touched, so they still read as the
 * lighter, turquoise reef water; the off-peg sea state and DEWS wind layers are untouched.
 *
 *  - 01-A4 value bands: harbour channel a step deeper in its middle, the outer sea a darker, cooler mid band before
 *    the haze lifts it at the horizon, so the sea sits below the limewash and the Pharos holds the top value.
 *  - 03-O6 basin floor: sandy-green shallows along the natural shores of the harbours (sandier than reef turquoise),
 *    and dark Posidonia meadow patches on the visible bed.
 *  - 03-O2 clouds in the mirror: the reflected ray meets the cloud-shadow deck, so the same drifting clouds that
 *    shade the sea also pass across it as soft bright patches (cover is DEWS-driven already; nothing new is encoded).
 *  - 03-O5 summer-night bioluminescence (decorative, season-bound): churned water in wakes, hull contact rings and the
 *    swash glows a faint pale cyan-green on summer nights. Never in open water, never in the Shoals (their own night
 *    glimmer stays theirs), kept far below the night bloom threshold; the pulse rides the sea clock (still when reduced).
 *
 *  - polish #11 basin lift (hbBasinLift): the inner basin gets back part of v1.2.1's luminous turquoise by day, most
 *    along the quays and in the shallows (+~18 % green-blue body, ≈ +8-10 % value on screen after the mirror; red held,
 *    so it stays saturated), so the harbour reads light and the channel middle still sits a step deeper (the lift is
 *    multiplicative and weaker there). The Shoals keep their own, lighter reef. E11 gates it by the sun's height.
 *  - E11 the hour on the water (decorative: the time of day and the calendar only): the body takes the hour's light
 *    relative to this day's noon (seaHour, below, on the CPU), the basin's luminous lift holds only while the sun is
 *    well up, and a low sun lets the basin mirror a little more of the hour's sky. Noon is exactly unchanged. The
 *    hour's light falls on every water, the reef included, so the Shoals keep their contrast with the sea round them.
 *  - E13 glints the pixel can hold: sharp lobes widen by the normals' spread across the pixel with their energy held
 *    (hbLobe) and no glint takes a pixel over 0.85 × the bloom threshold (hbGlintCap): no salt crawling, no specks
 *    growing halos.
 *
 * PERF: the Low tier compiles HB_LITE (no mirror clouds, no Posidonia: ≈ 3 texture taps per sea pixel; E13: its glints
 * read the calm normals only and the glitter column drops its twinkling facets, so Low never pays more); the summer
 * glow compiles in only when the visit's calendar has summer weight (HB_BIOLUM). The GLSL comments stay terse: shader
 * text ships in the first-frame bytes, so the reasoning lives here and in the shader modules' TS comments.
 */
export const SEA_TONE_GLSL = /* glsl */ `
uniform vec4 uSeaHour;
uniform vec2 uSeaLow;
uniform float uBloomT;
vec3 hbSeaTone(vec3 body, float zb, float zr, float dep, float sdist, float sunUp, float nb, float camD) {
  // dredged channel: harbour water a step deeper and cooler mid-basin
  float chan = smoothstep(5.0, 13.0, dep) * zb * (1.0 - zr);
  body *= 1.0 - 0.16 * chan;
  // sandy shallows inside the harbours, off natural shores (quay walls drop straight to depth)
  float shelf = zb * (1.0 - smoothstep(1.2, 5.0, dep)) * smoothstep(2.0, 6.0, sdist) * (1.0 - zr);
  body = mix(body, vec3(0.10, 0.15, 0.095) * (0.9 + 0.2 * nb), shelf * (0.18 + 0.27 * sunUp));
  // the outer sea: a darker, cooler mid band (the haze lifts it again near the horizon)
  float mid = smoothstep(450.0, 1100.0, camD) * (1.0 - zb) * (1.0 - zr);
  body *= 1.0 - 0.12 * mid;
  return body;
}
vec3 hbBasinLift(vec3 body, float zb, float zr, float dep, float coast) {
  float near = max(1.0 - smoothstep(6.0, 45.0, coast), 1.0 - smoothstep(2.0, 7.0, dep));
  float w = zb * (1.0 - zr) * mix(0.45, 1.0, near) * uSeaLow.x;
  return body * (1.0 + w * vec3(-0.02, 0.22, 0.17));
}
vec3 hbSeaHour(vec3 body) {
  body *= uSeaHour.rgb;
  return mix(vec3(dot(body, vec3(0.2126, 0.7152, 0.0722))), body, uSeaHour.a);
}
float hbLobe(float c, float n, float spread) {
  float m = n / (1.0 + n * spread);
  return pow(c, m) * ((m + 2.0) / (n + 2.0));
}
vec3 hbGlintCap(vec3 glint, float base) {
  float g = dot(glint, vec3(0.2126, 0.7152, 0.0722));
  return glint * min(1.0, max(0.85 * uBloomT - base, 0.0) / max(g, 1e-4));
}
// Posidonia: dark sea-grass meadows in patches on the bed (not in the very shallows, never on the reef)
vec3 hbPosidonia(vec3 bed, vec2 xz, float bedDep, float zr) {
  #ifdef HB_LITE
  return bed;   // (Low tier: the plain sandy bed)
  #endif
  float p = texture2D(uNoise, xz * 0.011 + 0.43).r * 0.7 + texture2D(uNoise, xz * 0.047 + 0.11).g * 0.4;
  float k = smoothstep(0.66, 0.76, p) * smoothstep(0.7, 2.2, bedDep) * (1.0 - zr);
  return mix(bed, vec3(0.045, 0.07, 0.04), k * 0.85);
}
// clouds drifting across the mirror: the cloud-shadow field sampled where the reflected ray meets the deck.
// Returns (lit cloud colour, weight); the material lays it over the reflected sky with a Fresnel floor, so the soft
// patches read at the hero pitch too (decorative)
vec4 hbMirrorClouds(vec3 sky, vec3 p, vec3 Rr) {
  #ifdef HB_LITE
  return vec4(sky, 0.0);   // (Low tier: no clouds in the mirror; their shadows still cross the water)
  #endif
  // (E01: a front's deck counts as well as the sky ahead of it, which may have none)
  if (max(uCloudShadow.w, uCloudShadowG.y * step(0.5, uCloudShadowF.w)) < 0.001) return vec4(sky, 0.0);
  // polish #12: the deck is ~650 m up, so the ripple normal swung the reflected point by hundreds of metres and broke
  // the clouds into wave-sized camouflage blots (worst under a front). Reflect them off the mean surface instead,
  // with only a trace of the waves: soft, whole cloud shapes drifting across the mirror
  vec3 vf = normalize(p - uCameraPos);
  vec3 Rm = normalize(mix(vec3(vf.x, abs(vf.y), vf.z), Rr, 0.12));
  float up = max(Rm.y, 0.04);
  vec2 q = p.xz + Rm.xz / up * (650.0 - p.y);
  // E01: the deck's own coverage there, 0..1. (Recovering it from the shadow over the sky-ahead strength put a
  // front's new strength behind its line over the old sky's, ~0.01 at Calm: weights of 35-60 blew a rising storm
  // out into cream banks, the stale-fog look)
  vec2 deck;
  hbCloudShadow(q, deck);
  float cc = clamp(deck.x, 0.0, 1.0);
  float l = dot(sky, vec3(0.2126, 0.7152, 0.0722));
  vec3 cloud = max(sky * 1.25, vec3(l * 1.55)) * mix(vec3(1.0), uSunColor / max(max(uSunColor.r, uSunColor.g), 1e-3), 0.25);
  // under a storm deck the clouds in the mirror are its cold slate cells, a shade under the sky they cross: never
  // pale, milky patches (the stale-data grammar)
  cloud = mix(cloud, vec3(l) * vec3(0.86, 0.94, 1.07) * 0.85, deck.y);
  return vec4(cloud, cc * 0.55 * smoothstep(0.03, 0.2, Rm.y));
}
uniform vec4 uFoliage;   // season weights (spring, summer, autumn, winter): calendar, decorative
vec3 hbBiolum(float churn, float zr, float t, float tw) {
  #ifndef HB_BIOLUM
  return vec3(0.0);   // (compiled in only for a visit with summer in the calendar: ocean-system)
  #endif
  float k = uFoliage.y * uNight * (1.0 - smoothstep(0.05, 0.3, zr));
  if (k < 0.01) return vec3(0.0);
  float pulse = 0.7 + 0.3 * sin(t * 2.1 + tw * 25.0);
  return vec3(0.16, 0.62, 0.5) * clamp(churn, 0.0, 1.0) * pulse * k * 0.11;
}
`;

/** E11 tuning: the body follows 45 % of the hour light's hue and 60 % of its level, by day; twilight cuts its chroma. */
export const SEA_HOUR = { hue: 0.45, level: 0.6, hueMin: 0.8, hueMax: 1.25, twilightChroma: 0.2, floor: 0.12, liftLow: 0.08, liftHigh: 0.35 } as const;

/** The time-of-day outputs seaHour reads (WorldUniforms, or a scratch set the ocean evaluates at a given key hour). */
export interface HourLight {
  uAmbient: { value: THREE.Color };
  uSunColor: { value: THREE.Color };
  uSunDir: { value: THREE.Vector3 };
  uNight: { value: number };
}
const LUMA = [0.2126, 0.7152, 0.0722] as const;
const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const E = [0, 0, 0], N = [0, 0, 0];
/** The light falling on level water (sky + key light on a horizontal plane, the body's 0.3 sun share), linear RGB. */
function irradiance(l: HourLight, out: number[]): number[] {
  const y = Math.max(l.uSunDir.value.y, 0) * 0.3, a = l.uAmbient.value, s = l.uSunColor.value;
  out[0] = a.r + s.r * y; out[1] = a.g + s.g * y; out[2] = a.b + s.b * y;
  return out;
}
const lum = (c: number[]) => LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2];

/**
 * E11 hour-coherent water (CPU, uniform-only; decorative: the time of day and the calendar, no weather, no data).
 * `now` and `noon` are the time-of-day outputs at the current key hour and at this day's noon key (the same season):
 * the body is tinted by the hour light's hue and level relative to noon, by day (uSeaHour.rgb), twilight (and, by
 * three quarters, a low sun by day) cuts its chroma (uSeaHour.a), the basin lift follows the sun's height .08-.35
 * (uSeaLow.x) and a low sun or twilight lays a Fresnel floor of up to .12 on the basin (uSeaLow.y). At noon
 * now === noon: exactly (1, 1, 1, 1) and (1, 0).
 */
export function seaHour(now: HourLight, noon: HourLight, tint: THREE.Vector4, low: THREE.Vector2): void {
  irradiance(now, E); irradiance(noon, N);
  const lE = Math.max(lum(E), 1e-4), lN = Math.max(lum(N), 1e-4);
  const night = Math.min(1, Math.max(0, now.uNight.value)), day = 1 - night;
  const level = 1 + SEA_HOUR.level * day * (Math.min(lE / lN, 1) - 1);
  const hue = (c: number) => {
    const r = N[c] > 1e-6 ? (E[c] / lE) / (N[c] / lN) : 1;
    return 1 + SEA_HOUR.hue * day * (Math.min(SEA_HOUR.hueMax, Math.max(SEA_HOUR.hueMin, r)) - 1);
  };
  // twilight: dawn, dusk and the blue hour (the night key's half-way band), never noon or deep night; a low sun by
  // day (the golden hour) takes three quarters of the same chroma cut, so the evening basin deepens instead of glowing
  const twilight = smooth(0, 0.3, night) * (1 - smooth(0.6, 1, night));
  const sunY = now.uSunDir.value.y, high = smooth(SEA_HOUR.liftLow, SEA_HOUR.liftHigh, sunY), lowDay = (1 - high) * day;
  tint.set(hue(0) * level, hue(1) * level, hue(2) * level, 1 - SEA_HOUR.twilightChroma * Math.max(twilight, 0.75 * lowDay));
  low.set(high * day, SEA_HOUR.floor * Math.max(lowDay, twilight));
}

/**
 * E13 reference twin of hbLobe (GLSL above): a specular lobe cos^n over a pixel across which the normals spread by
 * `spread` (rad²; the ocean takes it from the pixel's footprint), widened Toksvig-style to n' = n / (1 + n spread)
 * with its peak scaled by (n' + 2) / (n + 2): the energy is held and only the aliasing salt goes. Zero spread is the
 * sharp lobe exactly. (The GLSL comments stay terse: shader text ships in the first-frame bytes.)
 */
export function lobe(c: number, n: number, spread: number): number {
  const m = n / (1 + n * spread);
  return Math.pow(c, m) * ((m + 2) / (n + 2));
}
/** E13 reference twin of hbGlintCap: scale the glint (hue kept) so base + glint stays at or under 0.85 × the bloom threshold. */
export function glintCap(glint: [number, number, number], base: number, bloomT: number): [number, number, number] {
  const g = LUMA[0] * glint[0] + LUMA[1] * glint[1] + LUMA[2] * glint[2];
  const k = Math.min(1, Math.max(0.85 * bloomT - base, 0) / Math.max(g, 1e-4));
  return [glint[0] * k, glint[1] * k, glint[2] * k];
}
