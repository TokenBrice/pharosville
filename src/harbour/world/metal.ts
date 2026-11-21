/**
 * 02-L5 / 06-F7a gilt, silver and bronze as metals (decorative). The kit is authored all-dielectric; its precious trim
 * is identified from pre-pattern vertex albedo (`hbVc`, so tiled roofs and E15 AO never knock gilt out of PBR metal):
 *   1 gilt    #D9A93E / #E4B444 on plain / tiles / strakes / metal patterns (0, 7, 9, 12): titans' swan necks,
 *             aphlastons, temple roof, trireme bands, Pharos Helios & finials, civic acroteria and shields;
 *   2 bronze  pattern 12 in a warm hue (rams, fire bowls, lantern brass), plus a fleet-only fallback for existing
 *             PAL['bronze'] (#A0703A) rams/washers/braziers on plain pattern 0;
 *   3 patina  pattern 12 verdigris bronze (Pharos Tritons & Pharaohs);
 *   4 silver  satin silver / pewter on pattern 12 neutral-cool metal (USDe / PYUSD trim), plus a fleet-only match
 *             for cool silver on pattern 0.
 * On the fleet, only unpainted hull trim counts (HB_FLEET: no sails, pennants, livery or boot-top). Also supplies
 * subtle Aegean turquoise sea-bounce fill on curved lower hull bilges (#ifndef HB_LITE).
 */
export const METAL_GLSL = /* glsl */ `
// 0 dielectric · 1 gilt · 2 aged warm bronze · 3 weathered verdigris-patina bronze · 4 satin silver / pewter
float hbMetalKind(float pid, vec3 c) {
  #ifdef HB_FLEET
    if (vFleetMisc.z > 0.5 || vPaintA.w > 0.5 || vFleetRig.z > 0.5 || vFleetMisc.w > 0.01) return 0.0;
  #endif
  float r = max(c.r, 1e-4);
  bool pidOk = pid < 0.5 || abs(pid - 7.0) < 0.5 || abs(pid - 9.0) < 0.5 || abs(pid - 12.0) < 0.5;
  if (pidOk && c.r > 0.6 && c.r < 0.92 && c.g > 0.5 * r && c.g < 0.68 * r && c.b < 0.13 * r) return 1.0;
  if (abs(pid - 12.0) < 0.5) {
    if (c.r > 0.05 && c.r > 1.4 * c.g && c.g > 1.3 * c.b) return 2.0;
    if (c.g > 0.10 && c.g > c.r * 1.12 && c.b > c.r * 1.02) return 3.0;
    float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
    if (c.r > 0.20 && c.b >= c.r * 0.96 && (mx - mn) < 0.16 * max(mx, 1e-4)) return 4.0;
  }
  #ifdef HB_FLEET
    if (pid < 0.5) {
      // fallback for existing PAL['bronze'] (#A0703A -> linear 0.352, 0.162, 0.042) rams, washers & braziers
      if (distance(c, vec3(0.352, 0.162, 0.042)) < 0.032) return 2.0;
      // cool satin silver trim on Titans (e.g. USDe #B9BFC4 / #C4CACF)
      if (c.r > 0.42 && c.b > c.r * 1.05 && c.b < c.r * 1.26 && c.g > c.r * 1.02 && c.g < c.b) return 4.0;
    }
  #endif
  return 0.0;
}
// sets the metal's F0 tint (as diffuseColor) and roughness using pre-pattern hbVc for classification; returns metalness
float hbMetal(float pid, inout vec3 c, vec3 vc, inout float rough) {
  #ifdef HB_LITE
  return 0.0;   // (Low tier: no metal sheen; the gilt keeps its paint colour)
  #endif
  float k = hbMetalKind(pid, vc);
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
  if (k < 3.5) {
    // weathered verdigris bronze statues (Pharos Tritons & Pharaohs): refined antique patina with warm rubbed-bronze sheen
    float rubN = hbFbm(vHbLocal * 0.9) * 0.65 + hbNoise(vHbLocal * 3.8) * 0.35;
    float rubbed = smoothstep(0.32, 0.84, rubN) * (0.35 + 0.65 * clamp(abs(vHbLocalN.x) + abs(vHbLocalN.z), 0.0, 1.0));
    c = mix(c * vec3(0.86, 0.95, 0.92), vec3(0.44, 0.29, 0.14), rubbed * 0.22);
    rough = mix(0.46, 0.30, rubbed);
    return mix(0.48, 0.74, rubbed);
  }
  // 4: satin silver / pewter (USDe / PYUSD classical fittings)
  float sVar = hbNoise(vHbLocal * 4.0);
  c = mix(c, vec3(0.84, 0.87, 0.90), 0.82);
  rough = 0.26 + 0.04 * (sVar - 0.5);
  return 0.90;
}
// the sun lobe of a metal: capped under the bloom threshold by day, a soft flare allowed against a low sun
void hbMetalCap(inout vec3 spec, float metal) {
  if (metal <= 0.0) return;
  float low = 1.0 - smoothstep(0.12, 0.42, uHbSunDir.y);
  float cap = mix(0.75, 1.55, low);
  spec *= mix(1.0, min(1.0, cap / max(hbLuma(spec), 1e-5)), metal);
}
// sky reflection, golden low-sun sheen, sparse static hammered glints, night moonlight sheen & Pharos firelight catch
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
  // subtle silver moonlight grazing catch on metals at night
  if (uNight > 0.05 && uHbSunDir.y > 0.02) {
    float mF = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.2);
    col += vec3(0.42, 0.54, 0.76) * mix(albedo, vec3(0.85, 0.90, 1.0), 0.4) * (0.25 * mF + pow(rl, 22.0) * 0.45) * metal * uNight * smoothstep(0.02, 0.15, uHbSunDir.y) * 0.24;
  }
  // warm Pharos firelight specular sheen on Helios, dome ribs, brazier & Tritons
  if (dot(fireLight, vec3(1.0)) > 1e-4) {
    float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
    col += fireLight * mix(albedo, vec3(1.0, 0.72, 0.32), 0.4) * (0.45 + 0.9 * fres) * metal * 0.55;
  }
  return col;
}
#ifdef HB_FLEET
// subtle Aegean turquoise sea-bounce fill reflected up onto curved lower hull bilges by day
vec3 hbFleetSeaBounce(vec3 albedo, vec3 n, vec3 sunDir, vec3 sunColor, float occ, float night) {
  #ifdef HB_LITE
  return vec3(0.0);
  #endif
  if (vFleetMisc.z > 0.5 || vHbLocal.y > 2.2 || n.y > 0.3) return vec3(0.0);
  float day = smoothstep(-0.02, 0.15, sunDir.y) * (1.0 - night);
  if (day <= 1e-4) return vec3(0.0);
  float lowH = 1.0 - smoothstep(0.15, 2.2, max(vHbLocal.y, 0.0));
  float downFace = 1.0 - smoothstep(-0.45, 0.3, n.y);
  float sunL = min(dot(sunColor, vec3(0.2126, 0.7152, 0.0722)), 2.5);
  vec3 seaTint = mix(vec3(0.18, 0.58, 0.64), vec3(0.32, 0.52, 0.50), 1.0 - smoothstep(0.08, 0.42, sunDir.y));
  return albedo * seaTint * sunL * lowH * downFace * mix(0.5, 1.0, occ) * day * 0.14;
}
#endif
`;
