/**
 * 05-P2 the daylight heliograph on the water (decorative; the gain already carries the beam's reach, the sun and the
 * DEWS cloud: beam-system uBeamSun). Polish #2: the mirror's sun coin is SPECULAR ONLY. Inside the coin the sea's own
 * sun glitter grows denser and a little brighter; nothing diffuse is ever added, so the water's albedo never lifts
 * toward grey-white (a pale patch on the harbour would read as fog, and fog means stale data). Where the sun does not
 * glint (shadow, cloud, overcast, night) the coin is invisible.
 *
 * Included by ocean-material after the beam uniforms. Returns 0..1, the coin's weight at the sea point `rel` (from the
 * lantern's foot), already normalised by the sun so a pale winter sun and a strong summer one scale the same way.
 */
export const SEA_HELIO_GLSL = /* glsl */ `
float hbHelioCoin(vec2 rel) {
  float g = dot(uBeamSun.rgb, vec3(0.3333));
  if (g < 1e-4) return 0.0;
  vec2 hbd = vec2(cos(uBeamAngle), sin(uBeamAngle));
  // (same ellipse as beam-light-glsl.ts, a touch smaller on the water)
  float ha = (dot(rel, hbd) - uBeamSun.w) / (13.0 + uBeamSun.w * 0.11);
  float hb = abs(rel.x * hbd.y - rel.y * hbd.x) / (6.0 + uBeamSun.w * 0.04);
  float coin = exp(-(ha * ha + hb * hb) * 1.6) * step(0.0, dot(rel, hbd));
  // the gain relative to the sun itself (HELIO_GAIN 0.2 at full reach): 0..1
  return coin * clamp(g / max(dot(uSunColor, vec3(0.3333)) * 0.2, 1e-4), 0.0, 1.0);
}
// the coin's glitter: the sun's own facets packed denser (a broader facet lobe) and brighter, still capped points
vec3 hbHelioGlint(vec3 glint, float k, vec3 Nsp, vec3 Hs, float nBa, float sparkMask, float far01) {
  if (k < 0.002) return glint;
  float dense = pow(max(dot(Nsp, Hs), 0.0), 380.0) * smoothstep(0.35, 0.75, nBa) * sparkMask * (1.0 - far01 * 0.85);
  return glint * (1.0 + 0.9 * k) + uSunColor * min(dense, 1.0) * 0.35 * k;
}
`;
