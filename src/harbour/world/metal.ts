/**
 * 02-L5 / 06-F7a gilt and bronze as metals (decorative). The kit is authored all-dielectric; its precious trim is
 * identified by the baked albedo (COLOR_0, after the pattern and the fleet livery):
 *   gilt   #D9A93E (linear ≈ 0.69, 0.40, 0.05) on plain / tiles / strakes / metal patterns (0, 7, 9, 12): the
 *          titans' swan necks, aphlastons, temple roof, the trireme bands, the Pharos's Helios and finials,
 *          civic acroteria and shields; ochre paint (#C99A3E, r ≈ 0.58) stays below the threshold;
 *   bronze the metal pattern (12) in a warm hue: rams, fire bowls, lantern brass (dark iron and verdigris stay as
 *          they are: patina is a dull crust).
 * They become metals: albedo-tinted F0 through three's own GGX (shadowed like everything else), a sky reflection
 * tinted by the metal, the sun lobe capped so a polished curve never blooms by day (a little more headroom when the
 * sun is low), and sparse static glints: hashed per object-space cell and facet, so they never crawl on a moving
 * hull, and change only as the camera, the sun or the hull's roll move (still under reduced motion).
 * On the fleet, only unpainted hull trim counts (HB_FLEET: no sails, pennants, livery or boot-top).
 */
export const METAL_GLSL = /* glsl */ `
// 0 dielectric · 1 gilt · 2 bronze
float hbMetalKind(float pid, vec3 c) {
  #ifdef HB_FLEET
    if (vFleetMisc.z > 0.5 || vPaintA.w > 0.5 || vFleetRig.z > 0.5 || vFleetMisc.w > 0.01) return 0.0;
  #endif
  float r = max(c.r, 1e-4);
  bool pidOk = pid < 0.5 || abs(pid - 7.0) < 0.5 || abs(pid - 9.0) < 0.5 || abs(pid - 12.0) < 0.5;
  if (pidOk && c.r > 0.6 && c.g > 0.5 * r && c.g < 0.68 * r && c.b < 0.13 * r) return 1.0;
  if (abs(pid - 12.0) < 0.5 && c.r > 0.05 && c.r > 1.4 * c.g && c.g > 1.3 * c.b) return 2.0;
  return 0.0;
}
// sets the metal's F0 tint (as diffuseColor) and roughness; returns metalness
float hbMetal(float pid, inout vec3 c, inout float rough) {
  float k = hbMetalKind(pid, c);
  if (k < 0.5) return 0.0;
  if (k < 1.5) { c = mix(c, vec3(0.86, 0.6, 0.2), 0.45); rough = 0.4; return 0.85; }   // gilt #E0B04A toward gold's F0
  c = mix(c, vec3(0.48, 0.17, 0.03), 0.5);             // bronze #B87333
  rough = 0.46;
  return 0.75;
}
// the sun lobe of a metal: capped under the bloom threshold by day, a soft flare allowed against a low sun
void hbMetalCap(inout vec3 spec, float metal) {
  if (metal <= 0.0) return;
  float low = 1.0 - smoothstep(0.12, 0.4, uHbSunDir.y);
  float cap = mix(0.7, 1.4, low);
  spec *= mix(1.0, min(1.0, cap / max(hbLuma(spec), 1e-5)), metal);
}
// the sky in the metal (no env map: the analytic sky of hbEnvSpec, tinted by the metal), + sparse static glints
vec3 hbMetalLight(float metal, vec3 albedo, vec3 n, vec3 v, float rough, vec3 specLit) {
  if (metal <= 0.0) return vec3(0.0);
  vec3 col = hbEnvSpec(n, v, rough, 0.6) * albedo * metal;
  vec3 cell = floor(vHbLocal * 3.0) + floor(vHbLocalN * 5.0) * 7.0;
  float pick = step(0.86, hbWhite(cell + 211.0));
  float rl = max(dot(reflect(-v, n), uHbSunDir), 0.0);
  float fine = hbFine(fwidth(vHbLocal.x) + fwidth(vHbLocal.y), 0.66);
  float lit = clamp(hbLuma(specLit) * 6.0, 0.0, 1.0);    // only where the sun lobe is unshadowed
  col += uHbSunColor * normalize(albedo + 0.15) * pow(rl, 160.0) * pick * fine * lit * metal * 0.22;
  return col;
}
`;
