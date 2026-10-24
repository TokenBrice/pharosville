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
 */
export const SEA_TONE_GLSL = /* glsl */ `
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
// Posidonia: dark sea-grass meadows in patches on the bed (not in the very shallows, never on the reef)
vec3 hbPosidonia(vec3 bed, vec2 xz, float bedDep, float zr) {
  float p = texture2D(uNoise, xz * 0.011 + 0.43).r * 0.7 + texture2D(uNoise, xz * 0.047 + 0.11).g * 0.4;
  float k = smoothstep(0.66, 0.76, p) * smoothstep(0.7, 2.2, bedDep) * (1.0 - zr);
  return mix(bed, vec3(0.045, 0.07, 0.04), k * 0.85);
}
// clouds drifting across the mirror: the cloud-shadow field sampled where the reflected ray meets the deck.
// Returns (lit cloud colour, weight); the material lays it over the reflected sky with a Fresnel floor, so the soft
// patches read at the hero pitch too (decorative)
vec4 hbMirrorClouds(vec3 sky, vec3 p, vec3 Rr) {
  if (uCloudShadow.w < 0.001) return vec4(sky, 0.0);
  float up = max(Rr.y, 0.04);
  vec2 q = p.xz + Rr.xz / up * (650.0 - p.y);
  float cc = (1.0 - hbCloudShadow(q)) / uCloudShadow.w;
  float l = dot(sky, vec3(0.2126, 0.7152, 0.0722));
  vec3 cloud = max(sky * 1.25, vec3(l * 1.55)) * mix(vec3(1.0), uSunColor / max(max(uSunColor.r, uSunColor.g), 1e-3), 0.25);
  return vec4(cloud, cc * 0.55 * smoothstep(0.03, 0.2, Rr.y));
}
uniform vec4 uFoliage;   // season weights (spring, summer, autumn, winter): calendar, decorative
vec3 hbBiolum(float churn, float zr, float t, float tw) {
  float k = uFoliage.y * uNight * (1.0 - smoothstep(0.05, 0.3, zr));
  if (k < 0.01) return vec3(0.0);
  float pulse = 0.7 + 0.3 * sin(t * 2.1 + tw * 25.0);
  return vec3(0.16, 0.62, 0.5) * clamp(churn, 0.0, 1.0) * pulse * k * 0.11;
}
`;
