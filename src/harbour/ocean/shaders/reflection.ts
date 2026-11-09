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
  // the sky band is reflected through a smoothed normal (swell + a little ripple): a low-frequency,
  // view-dependent sheen; ripple-scale detail is left to the sparkle path, so no blotches tile the bay
  vec3 Nr = normalize(vec3((gN.x + dn.x * 0.3) * 0.6, gN.y, (gN.z + dn.y * 0.3) * 0.6));
  vec3 Rr = reflect(vd, Nr);
  Rr.y = max(Rr.y, 0.01);
  float thR = degrees(wrapPi(atan(Rr.x, -Rr.z) - uFwdAz));
  float eR = degrees(asin(clamp(Rr.y, -1.0, 1.0)) - uHorizonDepr);
  vec3 sky = band(thR, eR, 2.6 + 1.2 * rough + clamp(eR * 0.12, 0.0, 1.8));
  vec4 mCloud = hbMirrorClouds(sky, vWorld, Rr);
  float NdV = max(dot(Nr, V), 0.0);
  float F = 0.03 + 0.97 * pow(1.0 - NdV, 5.0);
  F = min(F * (0.8 + 0.5 * rough) * (1.0 + 0.4 * zm.b), 0.6 + 0.12 * zm.b);
  F = max(F, uSeaLow.y * zm.b);
  vec3 col = body * (1.0 - F) + sky * F;
  // clouds in the mirror: a Fresnel floor so they still pass across the basin seen from above (calm water best)
  // (E01: a weight, never an extrapolation)
  float mA = clamp(mCloud.a, 0.0, 1.0);
  col += (mCloud.rgb - sky) * mA * max(F, 0.2 * (1.0 - 0.5 * min(rough, 1.0)));
  sky = mix(sky, mCloud.rgb, mA);

  // ---------------------------------------------------------------- the lit town in the water (night)
  // planar-like: a light h metres up at foot P mirrors onto the water at P - away * D * h / Hc, so the
  // pool texture is read back along the view ray (taps for 1-14 m sources) and smeared by the ripple
  // normals into soft, shimmering streaks of windows and lamps. Calm harbour water mirrors best.
  if (uWindowGlow > 0.02) {
    vec2 away = -toCam.xz / max(camD, 1.0);
    vec2 side = vec2(-away.y, away.x);
    float Hc = max(uCameraPos.y - vWorld.y, 15.0);
    float smear = dot(dn, side) * (4.0 + 7.0 * rough) + dot(gN.xz, side) * 14.0;
    float wav = dot(dn, away) * 4.0 + dot(gN.xz, away) * 20.0;
    vec3 acc = vec3(0.0);
    // calm water draws each light out into a longer column (03-O11): the taps stride further along the view
    float calmCol = (1.0 - smoothstep(0.35, 0.9, rough)) * (1.0 - uPrecip.x);
    #ifdef HB_LITE
    for (int tap = 0; tap < 2; tap++) {
      int i = 1 + tap * 3;
      float weight = tap == 0 ? 2.76 : 2.04;
    #else
    for (int i = 0; i < 6; i++) {
      float weight = 1.0 - 0.08 * float(i);
    #endif
      float h = 1.2 + float(i) * 3.0;
      vec2 q = xz + away * (camD * h / Hc * (1.0 + 0.55 * calmCol) + wav * (0.4 + 0.12 * float(i)) + calmCol * float(i) * 1.1) + side * smear * (0.5 + 0.1 * float(i));
      vec2 puv = (q - uPoolBounds.xy) * uPoolBounds.zw;
      float ok = step(0.0, puv.x) * step(puv.x, 1.0) * step(0.0, puv.y) * step(puv.y, 1.0);
      acc += texture2D(uPoolTex, clamp(puv, 0.0, 1.0)).rgb * ok * weight;
    }
    // keep each pool's core (a column, not a round blob), broken into ripple-lit dashes
    acc *= smoothstep(0.03, 0.32, dot(acc, vec3(0.333))) * 1.5;
    float shim = 0.15 + 1.9 * smoothstep(0.42, 0.8, r2.a * 0.6 + r1.a * 0.5 + 0.1 * sin(dot(xz, away) * 2.2 - t * 1.3));
    // a rain-pitted surface scatters the mirrored lights into a dimmer, broken shimmer
    float calmK = mix(1.0, 1.35, zm.b) * (1.0 - 0.5 * storm) * (1.0 - 0.5 * uPrecip.x);
    float fadeD = 1.0 - 0.55 * smoothstep(300.0, 1100.0, camD);
    col += acc * smoothstep(0.02, 0.55, uWindowGlow) * shim * calmK * fadeD * (0.28 + 0.6 * F) * step(0.0, coast);
  }

  // ---------------------------------------------------------------- golden-hour light through the crests
  // a low sun shines through the thin wave tops: a teal-green glow on crests facing the viewer
  float golden = smoothstep(0.0, 0.08, uSunDir.y) * (1.0 - smoothstep(0.22, 0.42, uSunDir.y)) * (1.0 - uNight);
  if (golden > 0.0) {
    vec2 sunH = normalize(uSunDir.xz + 1e-4);
    float back = clamp(dot(-toCam.xz / max(camD, 1.0), sunH), 0.0, 1.0);
    float ch = crestH * 1.7 + (nB.g - 0.5) * 0.6;
    float face = clamp(dot(gN.xz, toCam.xz / max(camD, 1.0)) * 6.0 + 0.3, 0.0, 1.0);
    float sssK = golden * (0.3 + 0.7 * back * back) * smoothstep(0.15, 0.9, ch) * face * smoothstep(0.04, 0.35, amp) * (1.0 - far01 * 0.5) * (1.0 - cover * 0.6);
    col += uSunColor * vec3(0.20, 0.62, 0.48) * sssK * 0.16 * step(1.0, coast) * sunSh;
  }

  // ---------------------------------------------------------------- sun / moon glitter path
  // a column under the painted disc (envelope from a calmer normal), twinkling facets inside it
  vec3 gT = gerstnerNormalOf(gS, amp * groups);                       // true swell for the glitter path
  vec3 Nenv = normalize(vec3(gT.x + dn.x * 0.15, gT.y, gT.z + dn.y * 0.15));
  float rsE = max(dot(reflect(vd, Nenv), uGlintDir), 0.0);
  float rs = mix(max(dot(R, uGlintDir), 0.0), rsE, unres);
  float rsp = mix(max(dot(reflect(vd, Nsp), uGlintDir), 0.0), rsE, unres);
  // crisp facets in a tight column with a smooth core; facets finer than the pixel melt into the sheen
  float aa = unres;
  float tw = mix(smoothstep(0.8, 0.97, r2.a * 0.6 + r1.a * 0.4 + 0.22 * sin(t * 1.3 + nC.a * 30.0)), 0.03, aa);
  float env = pow(rsE, mix(70.0, 120.0, uNight));
  float core = pow(rsE, 260.0);
  float overcast = 1.0 - 0.9 * smoothstep(0.35, 0.8, uWeatherSea.x);
  // the facets are capped (no blown-out pixels) and gentler under the moon
  float sparks = min(hbLobe(rs, 300.0, 4.0 * spread) * 3.6 + hbLobe(rsp, 1100.0, 4.0 * spread) * 8.0, 2.4) * mix(1.0, 0.6, uNight);
  #ifdef HB_LITE
  sparks = 0.0;
  #endif
  vec3 glint = uGlintCol * (env * (0.1 + 0.1 * far01) + core * 0.16 + pow(rsE, 30.0) * 0.01
    + sparks * tw * (0.03 + 0.97 * env) * (1.0 - 0.55 * far01));
  // crest glints everywhere by day (facets catching a broad virtual light)
  vec3 Hs = normalize(normalize(uGlintDir + vec3(0.0, 0.6, 0.0)) + V);
  float nhF = mix(max(dot(Nsp, Hs), 0.0), max(dot(gN, Hs), 0.0), unres);
  float facet = hbLobe(nhF, 1400.0, spread) * mix(smoothstep(0.5, 0.8, nB.a), 0.2, aa) * (1.0 - far01 * 0.85);
  float sparkMask = mix(smoothstep(0.45, 0.85, nC.a + 0.25 * nB.b), 0.45, aa);
  glint += uSunColor * facet * 0.7 * sunUp;
  glint *= sunSh;

  // ---------------------------------------------------------------- low-sun sheen on the far water toward the sun (style C)
  float lowSun = (1.0 - smoothstep(0.12, 0.6, uSunDir.y)) * (1.0 - uNight);
  if (lowSun > 0.0) {
    vec2 fromC = xz - uSceneCenter;
    float rc = length(fromC) + 1.0;
    vec2 sunH = normalize(uSunDir.xz + 1e-4);
    float sd = clamp(dot(fromC / rc, sunH), 0.0, 1.0);
    float sheen = pow(sd, 3.0) * smoothstep(uSceneRadius * 0.35, uSceneRadius * 1.3, rc) * lowSun;
    col += normalize(uSunColor + 1e-4) * sheen * 0.5 * (0.6 + 0.4 * rough);
  }
  // ---------------------------------------------------------------- far band: swell lines + crest glints
  if (camD > 600.0 && fwdD < uHorizonDist * 0.99) {
    float swPh = dot(xz, SWELL) * 0.105 - t * 0.55 + (nA.b - 0.5) * 7.0;
    float crest = pow(0.5 + 0.5 * sin(swPh), 14.0) * smoothstep(0.5, 0.72, nA.a + 0.2 * nB.r) * smoothstep(0.3, 0.6, nC.b);
    float farBand = smoothstep(600.0, 1100.0, camD) * (1.0 - smoothstep(uHorizonDist * 0.85, uHorizonDist * 0.99, fwdD));
    col += sky * crest * farBand * 0.12 * (0.6 + uSea.y);
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
    // the fire's own reflection: a soft column under the lantern (through the calm envelope normal) with a few
    // capped ripple twinkles inside it, not a wide spray of sparks across the basin; it swells on the mirror's flash
    float lrE = max(dot(reflect(vd, Nenv), Lb), 0.0);
    float lr = max(dot(R, Lb), 0.0);
    float lTw = min(pow(lr, 900.0) * 3.0 * sparkMask, 1.0) * smoothstep(0.05, 0.7, pow(lrE, 70.0));
    // a rain-pitted sea breaks the column up: the sharp core and twinkles scatter
    beam += uBeamCol * (lTw * 0.85 * (1.0 - 0.55 * uPrecip.x) + pow(lrE, 260.0) * 0.17 * (1.0 - 0.45 * uPrecip.x) + pow(lr, 160.0) * 0.06) * (0.25 + 0.6 * min(uBeamShape.w, 2.5));
  }

`;
