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
// 0 dielectric · 1 gilt · 2 aged warm bronze · 3 weathered verdigris-patina bronze
float hbMetalKind(float pid, vec3 c) {
  #ifdef HB_FLEET
    if (vFleetMisc.z > 0.5 || vPaintA.w > 0.5 || vFleetRig.z > 0.5 || vFleetMisc.w > 0.01) return 0.0;
  #endif
  float r = max(c.r, 1e-4);
  bool pidOk = pid < 0.5 || abs(pid - 7.0) < 0.5 || abs(pid - 9.0) < 0.5 || abs(pid - 12.0) < 0.5;
  if (pidOk && c.r > 0.6 && c.g > 0.5 * r && c.g < 0.68 * r && c.b < 0.13 * r) return 1.0;
  if (abs(pid - 12.0) < 0.5) {
    if (c.r > 0.05 && c.r > 1.4 * c.g && c.g > 1.3 * c.b) return 2.0;
    if (c.g > 0.10 && c.g > c.r * 1.12 && c.b > c.r * 1.02) return 3.0;
  }
  return 0.0;
}
// sets the metal's F0 tint (as diffuseColor) and roughness with aged Mediterranean bronze / verdigris patina; returns metalness
float hbMetal(float pid, inout vec3 c, inout float rough) {
  #ifdef HB_LITE
  return 0.0;   // (Low tier: no metal sheen; the gilt keeps its paint colour)
  #endif
  float k = hbMetalKind(pid, c);
  if (k < 0.5) return 0.0;
  if (k < 1.5) {
    float gVar = hbNoise(vHbLocal * 3.5);
    c = mix(c, vec3(0.92, 0.65, 0.21), 0.48);           // burnished Mediterranean gilt
    rough = 0.32 + 0.08 * gVar;
    return 0.88;
  }
  if (k < 2.5) {
    float patN = hbFbm(vHbLocal * 2.2);
    float patMask = smoothstep(0.56, 0.82, patN) * (0.45 + 0.55 * max(vHbLocalN.y, 0.0));
    vec3 bronzeF0 = mix(c, vec3(0.54, 0.21, 0.045), 0.52);   // warm antique bronze
    c = mix(bronzeF0, vec3(0.18, 0.34, 0.26), patMask * 0.32);
    rough = mix(0.36, 0.58, patMask);
    return mix(0.82, 0.44, patMask);
  }
  // weathered verdigris bronze statues (Pharos Tritons & Pharaohs): refined antique patina with warm rubbed-bronze sheen
  float rubN = hbFbm(vHbLocal * 0.9) * 0.65 + hbNoise(vHbLocal * 3.8) * 0.35;
  float rubbed = smoothstep(0.32, 0.84, rubN) * (0.35 + 0.65 * clamp(abs(vHbLocalN.x) + abs(vHbLocalN.z), 0.0, 1.0));
  c = mix(c * vec3(0.86, 0.95, 0.92), vec3(0.44, 0.29, 0.14), rubbed * 0.22);
  rough = mix(0.46, 0.30, rubbed);
  return mix(0.48, 0.74, rubbed);
}
// the sun lobe of a metal: capped under the bloom threshold by day, a soft flare allowed against a low sun
void hbMetalCap(inout vec3 spec, float metal) {
  if (metal <= 0.0) return;
  float low = 1.0 - smoothstep(0.12, 0.42, uHbSunDir.y);
  float cap = mix(0.75, 1.55, low);
  spec *= mix(1.0, min(1.0, cap / max(hbLuma(spec), 1e-5)), metal);
}
// sky reflection, golden low-sun sheen, sparse static hammered glints & Pharos firelight catch on bronze / gilt
vec3 hbMetalLight(float metal, vec3 albedo, vec3 n, vec3 v, float rough, vec3 specLit, vec3 fireLight) {
  if (metal <= 0.0) return vec3(0.0);
  vec3 col = hbEnvSpec(n, v, rough, 0.65) * albedo * metal * 1.15;
  vec3 refl = reflect(-v, n);
  float rl = max(dot(refl, uHbSunDir), 0.0);
  float low = 1.0 - smoothstep(0.10, 0.42, uHbSunDir.y);
  float lit = clamp(hbLuma(specLit) * 6.0, 0.0, 1.0);    // only where the sun lobe is unshadowed
  // broad warm gilded highlight catching low sunlight
  col += uHbSunColor * mix(albedo, vec3(1.0, 0.78, 0.38), 0.35) * pow(rl, 26.0) * low * lit * metal * 0.20;
  // sparse static specular glints hashed per object-space cell and facet
  vec3 cell = floor(vHbLocal * 3.0) + floor(vHbLocalN * 5.0) * 7.0;
  float pick = step(0.86, hbWhite(cell + 211.0));
  float fine = hbFine(fwidth(vHbLocal.x) + fwidth(vHbLocal.y), 0.66);
  col += uHbSunColor * normalize(albedo + 0.15) * pow(rl, 140.0) * pick * fine * lit * metal * 0.28;
  // warm Pharos firelight specular sheen on Helios, dome ribs, brazier & Tritons
  if (dot(fireLight, vec3(1.0)) > 1e-4) {
    float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
    col += fireLight * mix(albedo, vec3(1.0, 0.72, 0.32), 0.4) * (0.45 + 0.9 * fres) * metal * 0.55;
  }
  return col;
}
`;
