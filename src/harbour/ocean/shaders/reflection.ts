/**
 * Sky mirror, golden crests, the sun/moon glitter, sheen, far band and the beam on the water. (Notes here: shader text
 * ships in the first-frame bytes.) E11: a low sun or twilight lays a Fresnel floor on the basin (uSeaLow.y, 0 at noon).
 * E13: the spark and facet lobes read the resolved facets, else the calm glitter/swell normals (unres), widened by the
 * footprint with their energy held (sea-tone.ts hbLobe); the spark masks melt into their mean coverage (aa); no sun or
 * moon glint lifts its pixel over 0.85 × the bloom threshold (hbGlintCap; the heliograph after it keeps its scale); the
 * Low tier drops the twinkling facets. The golden-crest, low-sun sheen and far-band blocks are skipped (coherently)
 * where they add exactly nothing.
 */
export const OCEAN_REFLECTION = /* glsl */ `  // ---------------------------------------------------------------- reflection of the painted sky
  vec3 vd = -V;
  vec3 R = reflect(vd, N);
  R.y = max(R.y, 0.01);
  // silky sky-mirror normal: resolved medium wave trains + whisper of close capillary detail (no grazing sandpaper)
  // (a storm sea mirrors the sky through its rough swell: the slate swirls are its drama)
  vec2 dnMirror = mix(dnWave * 0.54 + dnFine * 0.10, dn * 0.18, stormSea);
  float gMirror = mix(0.34, 0.6, stormSea);
  vec3 Nr = normalize(vec3(gN.x * gMirror + dnMirror.x, gN.y, gN.z * gMirror + dnMirror.y));
  vec3 Rr = reflect(vd, Nr);
  Rr.y = max(Rr.y, 0.01);
  float thR = degrees(wrapPi(atan(Rr.x, -Rr.z) - uFwdAz));
  float eR = degrees(asin(clamp(Rr.y, -1.0, 1.0)) - uHorizonDepr);
  // smooth elevation bias near grazing angles prevents hard sky-band snapping across low wave backs
  vec3 sky = band(thR, max(eR, -0.4), 2.8 + 1.35 * rough + clamp(eR * 0.12, 0.0, 1.8));
  vec4 mCloud = hbMirrorClouds(sky, vWorld, Rr);
  vec3 Nf = normalize(mix(Nr, N, 0.22 * grazeDamp));
  float NdV = max(dot(Nf, V), 0.0);
  float F = 0.03 + 0.97 * pow(1.0 - NdV, 5.0);
  F = min(F * (0.78 + 0.45 * rough) * (1.0 + 0.38 * zm.b), 0.58 + 0.12 * zm.b);
  // keep open night sea deep velvet sapphire-indigo (prevent broad milky horizon glare sheet)
  F *= mix(1.0, 0.68, uNight * (1.0 - 0.55 * zm.b));
  F *= 1.0 - 0.32 * max(quayOcc, pierOcc);
  F = max(F, uSeaLow.y * zm.b);
  vec3 col = body * (1.0 - F) + sky * F;
  // clouds in the mirror: a Fresnel floor so they still pass across the basin seen from above (suppressed at night: no sea-ice blotches)
  // (E01: a weight, never an extrapolation)
  float mA = clamp(mCloud.a, 0.0, 1.0);
  mA *= 1.0 - 0.90 * smoothstep(0.25, 0.75, uNight);
  col += (mCloud.rgb - sky) * mA * max(F, 0.2 * (1.0 - 0.5 * min(rough, 1.0)));
  sky = mix(sky, mCloud.rgb, mA);

  // ---------------------------------------------------------------- the lit town in the water (night)
  // organic, non-periodic horizontally-stretched liquid-gold ripples (zero regular Venetian-blind ladder bars)
  if (uWindowGlow > 0.02) {
    vec2 away = -toCam.xz / max(camD, 1.0);
    vec2 side = vec2(-away.y, away.x);
    float Hc = max(uCameraPos.y - vWorld.y, 15.0);
    // multi-scale organic wave distortion breaks uniform spacing into natural Mediterranean harbour ripples
    float smear = dot(dnWave, side) * (2.2 + 3.8 * rough) + dot(gN.xz, side) * 7.5 + (nB.r - 0.5) * 1.4;
    float wav = dot(dnWave, away) * 3.4 + dot(gN.xz, away) * 12.0 + (nB.g - 0.5) * 2.2;
    vec3 acc = vec3(0.0);
    float calmCol = (1.0 - smoothstep(0.35, 0.9, rough)) * (1.0 - uPrecip.x);
    // Lite: the column's taps 1 and 2 (4.2 and 7.2 m, the quay lamps' and the windows' heights) at twice the richer tiers'
    // weights, so each light's reflection lies by its quay and the basin keeps the richer tiers' value (taps 1 and 4 left
    // each pool a bright copy floating 45-65 m out in the basin)
    #ifdef HB_LITE
    for (int tap = 0; tap < 2; tap++) {
      int i = 1 + tap;
      float weight = tap == 0 ? 1.84 : 1.68;
    #else
    for (int i = 0; i < 6; i++) {
      float weight = 1.0 - 0.08 * float(i);
    #endif
      float h = 1.2 + float(i) * 3.0;
      vec2 q = xz + away * (camD * h / Hc * (1.0 + 0.55 * calmCol) + wav * (0.4 + 0.12 * float(i)) + calmCol * float(i) * 1.1) + side * smear * (0.5 + 0.1 * float(i));
      vec2 puv = (q - uPoolBounds.xy) * uPoolBounds.zw;
      vec2 pe = min(puv, 1.0 - puv);
      float ok = smoothstep(0.0, 0.04, min(pe.x, pe.y));
      acc += texture2D(uPoolTex, clamp(puv, 0.0, 1.0)).rgb * ok * weight;
    }
    acc *= 0.68;   // (the roll-off below was tuned on a lighter, eight-tap column)
    // soft organic roll-off + Reinhard compression so Burn Altar stays rich molten gold
    float poolLum = dot(acc, vec3(0.2126, 0.7152, 0.0722));
    acc *= smoothstep(0.008, 0.20, poolLum) * 1.38;
    acc = acc / (1.0 + acc * 0.48);
    // irregular, domain-warped anisotropic wavelet shimmer (replaces regular periodic sin bars)
    float along = dot(xz, away), across = dot(xz, side);
    vec2 rUv = vec2(across * 0.011 + (nA.g - 0.5) * 0.16, along * 0.046 - t * 0.014 + (r3.g - 0.5) * 0.12);
    float nr1 = texture2D(uNoise, rUv).g;
    float nr2 = texture2D(uNoise, vec2(rUv.x * 1.85 + 0.37, rUv.y * 2.15 + t * 0.019) + (nB.rg - 0.5) * 0.09).b;
    float ripSlope = clamp(0.5 + dot(dnWave, away) * 2.6 + (r1.a - 0.5) * 0.72, 0.0, 1.0);
    float ribbon = smoothstep(0.22, 0.86, nr1 * 0.44 + nr2 * 0.26 + ripSlope * 0.36);
    float shim = 0.38 + 1.15 * ribbon;
    vec3 townRefl = acc * mix(vec3(0.96, 0.88, 0.78), vec3(1.10, 0.96, 0.76), ribbon) * shim;
    // a rain-pitted surface scatters the mirrored lights into a dimmer, softer shimmer
    float calmK = mix(1.0, 1.32, zm.b) * (1.0 - 0.5 * storm) * (1.0 - 0.5 * uPrecip.x);
    float fadeD = 1.0 - 0.58 * smoothstep(280.0, 1050.0, camD);
    col += townRefl * smoothstep(0.02, 0.55, uWindowGlow) * calmK * fadeD * (0.34 + 0.58 * F) * step(0.0, coast);
  }

  // ---------------------------------------------------------------- sunlit wave-crest subsurface scattering (SSS)
  // translucent emerald-turquoise glow through thin sunlit crests (backlit golden-hour fire + crisp Aegean noon translucency)
  if (sunUp > 0.01 && cover < 0.95) {
    float golden = smoothstep(0.0, 0.07, uSunDir.y) * (1.0 - smoothstep(0.24, 0.48, uSunDir.y)) * (1.0 - uNight);
    vec3 sssDir = normalize(-uSunDir + N * 0.48);
    float backScatter = pow(clamp(dot(V, sssDir), 0.0, 1.0), 3.0);
    vec2 sunH = normalize(uSunDir.xz + 1e-4);
    float backH = clamp(dot(-toCam.xz / max(camD, 1.0), sunH), 0.0, 1.0);
    float thinCrest = smoothstep(0.08, 0.85, organicCrest + 0.22 * (r1.a - 0.5));
    float openWater = (1.0 - 0.55 * zm.b) * step(1.0, coast) * (1.0 - far01 * 0.48) * (1.0 - cover * 0.72) * sunSh;
    float sssWave = smoothstep(0.03, 0.32, amp + 0.08 * rough);
    float sssLow = golden * (0.28 + 0.72 * max(backScatter, backH * backH)) * thinCrest * sssWave;
    float sssDay = sunUp * (1.0 - golden * 0.55) * (0.22 + 0.78 * backScatter) * smoothstep(0.22, 0.88, organicCrest) * sssWave;
    vec3 sssColLow = mix(vec3(0.08, 0.72, 0.58), vec3(0.24, 0.84, 0.62), backScatter);
    vec3 sssColDay = vec3(0.05, 0.64, 0.58);
    col += (uSunColor * sssColLow * sssLow * 0.34 + uSunColor * sssColDay * sssDay * 0.19) * openWater;
  }

  // ---------------------------------------------------------------- sun / moon glitter path
  // a focused, directional column under the painted disc (tight silver-blue moon path at night, sparkling Mediterranean gold by day)
  vec3 gT = gerstnerNormalOf(gS, amp * groups);                       // true swell for the glitter path
  vec3 Nenv = normalize(vec3(gT.x * 0.62 + dnWave.x * 0.24, gT.y, gT.z * 0.62 + dnWave.y * 0.24));
  float rsE = max(dot(reflect(vd, Nenv), uGlintDir), 0.0);
  float rs = mix(max(dot(R, uGlintDir), 0.0), rsE, unres);
  float rsp = mix(max(dot(reflect(vd, Nsp), uGlintDir), 0.0), rsE, unres);
  // crisp facets in a tight column with a smooth core; facets finer than the pixel melt into the sheen
  float aa = unres;
  float tw = mix(smoothstep(0.8, 0.97, r2.a * 0.6 + r1.a * 0.4 + 0.22 * sin(t * 1.3 + nC.a * 30.0)), 0.03, aa);
  float env = pow(rsE, mix(75.0, 320.0, uNight));
  float core = pow(rsE, mix(260.0, 620.0, uNight));
  float overcast = 1.0 - 0.9 * smoothstep(0.35, 0.8, uWeatherSea.x);
  // the facets are capped (no blown-out pixels) and gentler under the moon
  float sparks = min(hbLobe(rs, 300.0, 4.0 * spread) * 3.6 + hbLobe(rsp, 1100.0, 4.0 * spread) * 8.0, 2.4) * mix(1.0, 0.6, uNight);
  #ifdef HB_LITE
  sparks = 0.0;
  #endif
  // delicate organic shimmer along the sun/moon path: crisp sparkling silver-sapphire moon wavelets at night (never a matte grey smudge)
  float microSh = 0.76 + 0.48 * smoothstep(0.30, 0.85, r1.a * 0.65 + r3.a * 0.35);
  float moonWave = smoothstep(0.38, 0.92, r1.a * 0.45 + r3.a * 0.35 + nB.g * 0.25);
  float rMoon = max(dot(Rr, uGlintDir), 0.0);
  float moonFacet = pow(rMoon, 380.0) * smoothstep(0.44, 0.88, r1.a * 0.50 + r2.a * 0.28 + nC.a * 0.28) * (0.28 + 0.72 * env) * uNight;
  float nightBroad = 1.0 - 0.98 * uNight;
  vec3 glintTint = mix(vec3(1.0), vec3(0.70, 0.85, 1.15), uNight);
  vec3 glint = uGlintCol * glintTint * (
    env * mix((0.11 + 0.08 * far01) * microSh, 0.018 * (0.25 + 0.75 * moonWave), uNight)
    + core * mix(0.20, 0.055 * (0.30 + 0.70 * moonWave), uNight)
    + moonFacet * 0.62
    + pow(rsE, 30.0) * 0.010 * nightBroad
    + sparks * tw * mix(1.0, 2.85, uNight) * (0.04 + 0.96 * env) * (1.0 - 0.48 * far01));
  // the moon's path down the water: a broad, rippled silver column under the disc, its facets twinkling along it
  // (deep night only: through twilight the sun's own, tighter glitter above is left as it is)
  float moonK = smoothstep(0.6, 0.95, uNight);
  if (moonK > 0.0) {
    float mEnv = pow(rsE, 170.0);
    glint += uGlintCol * glintTint * moonK * (
      mEnv * (0.22 + 0.08 * far01) * (0.55 + 0.45 * moonWave)
      + pow(rsE, 260.0) * 0.22 * (0.55 + 0.45 * moonWave)
      + pow(rsE, 30.0) * 0.03
      // the path breaks into rippled silver on the wave faces (the full ripple normal, not the calm envelope)
      // (confined to a column round the path: looking toward a low moon they would otherwise sheet the whole sea)
      + pow(max(dot(R, uGlintDir), 0.0), 90.0) * 0.32 * (0.4 + 0.6 * moonWave) * smoothstep(0.965, 0.995, rsE)
      + sparks * tw * 2.85 * 0.96 * (mEnv - env) * (1.0 - 0.48 * far01));
  }
  // crest glints everywhere by day (facets catching a broad virtual light)
  vec3 Hs = normalize(normalize(uGlintDir + vec3(0.0, 0.6, 0.0)) + V);
  float nhF = mix(max(dot(Nsp, Hs), 0.0), max(dot(gN, Hs), 0.0), unres);
  float facet = hbLobe(nhF, 1400.0, spread) * mix(smoothstep(0.5, 0.8, nB.a), 0.2, aa) * (1.0 - far01 * 0.85);
  float sparkMask = mix(smoothstep(0.45, 0.85, nC.a + 0.25 * nB.b), 0.45, aa);
  glint += uSunColor * facet * 0.75 * sunUp;
  glint *= sunSh;

  // ---------------------------------------------------------------- low-sun sheen on the far water toward the sun (style C)
  float lowSun = (1.0 - smoothstep(0.12, 0.6, uSunDir.y)) * (1.0 - uNight);
  if (lowSun > 0.0) {
    vec2 fromC = xz - uSceneCenter;
    float rc = length(fromC) + 1.0;
    vec2 sunH = normalize(uSunDir.xz + 1e-4);
    float sd = clamp(dot(fromC / rc, sunH), 0.0, 1.0);
    float sheen = pow(sd, 3.0) * smoothstep(uSceneRadius * 0.35, uSceneRadius * 1.3, rc) * lowSun;
    col += normalize(uSunColor + 1e-4) * sheen * 0.34 * (0.65 + 0.35 * rough) * (0.76 + 0.24 * smoothstep(-0.3, 0.6, organicCrest));
  }
  // ---------------------------------------------------------------- far band: organic open-sea swell glints (no horizontal stripes)
  if (camD > 600.0 && fwdD < uHorizonDist * 0.99) {
    float swPh = dot(xz, SWELL) * 0.105 - t * 0.55 + (nA.b - 0.5) * 9.5;
    float swPh2 = dot(xz, vec2(-SWELL.y * 0.68 + SWELL.x * 0.73, SWELL.x * 0.68 + SWELL.y * 0.73)) * 0.135 - t * 0.68 + (nB.b - 0.5) * 6.0;
    float crest = pow(0.5 + 0.32 * sin(swPh) + 0.18 * sin(swPh2), 14.0) * smoothstep(0.48, 0.74, nA.a + 0.22 * nB.r) * smoothstep(0.28, 0.62, nC.b);
    float farBand = smoothstep(600.0, 1100.0, camD) * (1.0 - smoothstep(uHorizonDist * 0.85, uHorizonDist * 0.99, fwdD));
    col += sky * crest * farBand * 0.08 * (0.6 + uSea.y);
    float dash = smoothstep(0.55, 0.8, nC.r * 0.6 + nB.g * 0.5);
    glint += uGlintCol * crest * dash * farBand * env * 0.35 + uSunColor * crest * farBand * smoothstep(0.75, 0.95, nC.b) * 0.06 * sunUp;
  }
  glint = hbGlintCap(glint, dot(col, vec3(0.2126, 0.7152, 0.0722)));

  // ---------------------------------------------------------------- lighthouse beam sweeping the water
  vec3 beam = vec3(0.0);
  if (uBeamPos.y > -100.0 && dot(uBeamCol, vec3(1.0)) > 0.001) {
    vec2 rel = xz - uBeamPos.xz;
    float dist = length(rel);
    vec3 Lb = normalize(uBeamPos - vWorld);
    vec3 Hb = normalize(Lb + V);
    float bspec = pow(max(dot(Nsp, Hb), 0.0), 260.0);
    // The Pharos has one mirror/one forward beam; no opposite sea foot is emitted.
    float a = uBeamAngle;
    vec2 bd = vec2(cos(a), sin(a));
    float along = dot(rel, bd);
    float lat = abs(rel.x * bd.y - rel.y * bd.x);
    // the shaft rides ~85 m up: what reaches the water is scattered light, a broad soft swath (the same width
    // as the beam's light on the town, beam-light-glsl.ts) that gathers away from the tower; a narrow bright
    // track running from the tower's foot read as a second, lower beam
    float w = (2.3 + along * tan(uBeamShape.y)) * 2.2 + 4.0;
    float lw = lat / w;   // (w turns negative far behind the tower)
    float foot = exp(-lw * lw * 1.4) * smoothstep(30.0, 90.0, along) * exp(-along / (uBeamShape.x * 0.55));
    beam += uBeamCol * foot * (0.025 + bspec * 3.5 * sparkMask);
    // 05-P2 the heliograph by day: the mirror's sun coin crossing the water, specular only (sea-helio.ts): it packs
    // the sea's own (already shadowed) sun glitter denser and brighter, never a diffuse wash
    glint = hbHelioGlint(glint, hbHelioCoin(rel), nhF, nB.a, sparkMask, far01, spread);
    // the fire's own reflection under the lantern: suppressed inside the enclosed inner harbour (zm.b) so no detached
    // beige oval floats south-west of the Burn Altar, and broken into crisp organic golden wavelets on open channel water
    float lanternShelter = 1.0 - smoothstep(0.05, 0.55, zm.b);
    float lrE = max(dot(reflect(vd, Nenv), Lb), 0.0);
    float lr = max(dot(reflect(vd, Nr), Lb), 0.0);
    float lWave = smoothstep(0.32, 0.88, r1.a * 0.48 + r2.a * 0.28 + nB.g * 0.28);
    float lTw = min(pow(lr, 480.0) * 2.1 * lWave, 1.15) * smoothstep(0.08, 0.68, pow(lrE, 85.0));
    // a rain-pitted sea breaks the column up: the sharp core and wavelets scatter
    beam += uBeamCol * (lTw * 0.78 * (1.0 - 0.55 * uPrecip.x) + pow(lrE, 260.0) * 0.05 * lWave * (1.0 - 0.45 * uPrecip.x) + pow(lr, 180.0) * 0.05 * lWave) * lanternShelter * (0.28 + 0.62 * min(uBeamShape.w, 2.5));
  }

`;
