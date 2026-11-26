/**
 * Sky IBL mirror, High PlanarMirror / Medium same-frame Hi-Z SSR compositing, nocturnal harbour pools + hero
 * anisotropic GGX glints, FFT-driven crest SSS, FFT slope-variance GGX solar/lunar glitter, and Pharos beam glint.
 * Strictly B07/C04 compliant (ascending `smoothstep`, squaring by multiplication, `hbGlintCap` <= 0.85 * uBloomT).
 */
export const OCEAN_REFLECTION = /* glsl */ `  vec3 vd = -V;
  vec3 R = reflect(vd, N);
  R.y = max(R.y, 0.01);
  vec2 dnMirror = mix(dnWave * 0.68 + dnFine * 0.14, dn * 0.72, stormSea);
  float gMirror = mix(0.52, 0.82, stormSea);
  vec3 Nr = normalize(vec3(gN.x * gMirror + dnMirror.x + kelSlope.x * 0.75, gN.y, gN.z * gMirror + dnMirror.y + kelSlope.y * 0.75));
  vec3 Rr = reflect(vd, Nr);
  Rr.y = max(Rr.y, 0.01);
  float thR = degrees(wrapPi(atan(Rr.x, -Rr.z) - uFwdAz));
  float eR = degrees(asin(clamp(Rr.y, -1.0, 1.0)) - uHorizonDepr);
  vec3 sky = band(thR, max(eR, -0.4), 0.7 + 1.85 * rough + clamp(eR * 0.08, 0.0, 1.2));
  vec4 mCloud = hbMirrorClouds(sky, vWorld, Rr);
  vec3 Nf = normalize(mix(Nr, N, 0.24 * grazeDamp));
  float NdV = clamp(dot(Nf, V), 0.0, 1.0);
  float F = 0.03 + 0.97 * pow(1.0 - NdV, 5.0);
  F *= mix(1.08, 0.64, clamp(rough * 0.75, 0.0, 1.0)) * (1.0 + 0.25 * zm.b);
  F = min(F * mix(1.0, 1.18, stormSea), 0.64 + 0.12 * zm.b);
  F *= mix(1.0, 0.68, uNight * (1.0 - 0.55 * zm.b));
  F *= 1.0 - 0.32 * max(quayOcc, pierOcc);
  F = max(F, uSeaLow.y * zm.b);
  F *= 1.0 - 0.55 * hullOcc;
  float mA = clamp(mCloud.a, 0.0, 1.0);
  mA *= 1.0 - smoothstep(0.20, 0.58, uNight);
  sky = mix(sky, mCloud.rgb, mA);

  float mirrorCov = 0.0;
  vec3 reflEnv = sky;
  #ifndef HB_LITE
  if (uReflectMode > 0.5 && uMirror.x > 0.001) {
    float mirrorW = (1.0 - uPrecip.x) * (1.0 - smoothstep(0.18, 0.55, stormSea) * 0.45);
    vec2 awayM = -toCam.xz / max(camD, 1.0);
    vec2 slopeM = Nr.xz / max(Nr.y, 0.45);
    float mContact = clamp(max(1.0 - smoothstep(1.5, 18.0, min(max(coast, 0.0), sdist)), smoothstep(0.05, 0.45, hullOcc + live.g * 0.5)), 0.0, 1.0);
    float mWob = mix(uMirror.y, min(uMirror.y, 0.006), mContact);
    vec2 wobUv = vec2(dot(slopeM, vec2(-awayM.y, awayM.x)) * 0.42, dot(slopeM, awayM) * 0.90) * mWob;
    vec2 muv;
    bool inBounds = false;
    float lodM = 0.0;
    if (uReflectMode > 1.5) {
      vec4 mc = uPlanarVP * vec4(vWorld.x, 0.0, vWorld.z, 1.0);
      if (mc.w > 0.01) {
        muv = mc.xy / mc.w * 0.5 + 0.5 + wobUv;
        inBounds = muv.x > 0.002 && muv.x < 0.998 && muv.y > 0.002 && muv.y < 0.998;
        lodM = clamp(0.45 + rough * 2.1 + fftSlopeVar * 2.8, 0.35, 3.0) * (1.0 - 0.35 * mContact);
      }
    } else {
      vec2 sUv = gl_FragCoord.xy / max(uCapSize, vec2(1.0));
      muv = sUv + wobUv * 0.72;
      inBounds = muv.x > 0.002 && muv.x < 0.998 && muv.y > 0.002 && muv.y < 0.998;
    }
    if (inBounds && mirrorW > 0.001) {
      vec4 m = textureLod(uMirrorTex, muv, lodM);
      float mEdge = smoothstep(0.0, 0.03, min(min(muv.x, 1.0 - muv.x), min(muv.y, 1.0 - muv.y)));
      float cov = clamp(m.a, 0.0, 1.0) * mEdge * mirrorW;
      if (cov > 0.001) {
        vec3 mCol = clamp(m.rgb / max(m.a, 1e-4), vec3(0.0), vec3(32.0));
        float strK = clamp(uMirror.x, 0.0, 1.0);
        mirrorCov = clamp(cov * strK, 0.0, 1.0);
        reflEnv = mix(sky, mCol, mirrorCov);
      }
    }
  }
  #endif
  float F_phys = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
  float F_eff = mix(F, clamp(F_phys, 0.02, 1.0), mirrorCov);
  vec3 col = body * (1.0 - F_eff) + reflEnv * F_eff;

  if (uWindowGlow > 0.02) {
    vec2 away = -toCam.xz / max(camD, 1.0);
    vec2 side = vec2(-away.y, away.x);
    float Hc = max(uCameraPos.y - vWorld.y, 15.0);
    float smear = dot(dnWave, side) * (1.35 + 2.2 * rough) + dot(gN.xz, side) * 4.2 + (nB.r - 0.5) * 0.75;
    float wav = dot(dnWave, away) * 2.2 + dot(gN.xz, away) * 6.8 + (nB.g - 0.5) * 1.1;
    vec3 acc = vec3(0.0);
    float calmCol = (1.0 - smoothstep(0.35, 0.9, rough)) * (1.0 - uPrecip.x);
    #ifdef HB_LITE
    for (int tap = 0; tap < 2; tap++) {
      int i = 1 + tap;
      float weight = tap == 0 ? 1.84 : 1.68;
    #else
    for (int i = 0; i < 6; i++) {
      float weight = 1.0 - 0.08 * float(i);
    #endif
      float h = 0.8 + float(i) * 1.85;
      vec2 q = xz + away * (camD * h / Hc * (1.0 + 0.30 * calmCol) + wav * (0.30 + 0.08 * float(i)) + calmCol * float(i) * 0.55) + side * smear * (0.35 + 0.07 * float(i));
      vec2 puv = (q - uPoolBounds.xy) * uPoolBounds.zw;
      vec2 pe = min(puv, 1.0 - puv);
      float ok = smoothstep(0.0, 0.04, min(pe.x, pe.y));
      acc += texture2D(uPoolTex, clamp(puv, 0.0, 1.0)).rgb * ok * weight;
    }
    acc *= 0.62 * mix(0.14, 1.0, uLampArrive);
    #ifndef HB_LITE
    if (uDynPool.x > 0.01) {
      vec2 dynInv = 1.0 / (uDynPoolBounds.zw - uDynPoolBounds.xy);
      vec3 dynAcc = vec3(0.0);
      for (int j = 0; j < 3; j++) {
        float dh = j == 0 ? 0.6 : (j == 1 ? 1.8 : 3.6);
        float dw = j == 0 ? 1.0 : (j == 1 ? 0.86 : 0.68);
        vec2 dq = xz + away * (camD * dh / Hc * (1.0 + 0.30 * calmCol) + wav * (0.25 + 0.10 * float(j)) + calmCol * float(j) * 0.45) + side * smear * (0.30 + 0.08 * float(j));
        vec2 duv = (dq - uDynPoolBounds.xy) * dynInv;
        vec2 de = min(duv, 1.0 - duv);
        float dok = smoothstep(0.0, 0.02, min(de.x, de.y));
        dynAcc += textureLod(uDynPoolTex, clamp(duv, 0.0, 1.0), 0.0).rgb * dok * dw;
      }
      acc += dynAcc * uDynPool.x;
    }
    #endif
    float poolLum = dot(acc, vec3(0.2126, 0.7152, 0.0722));
    acc *= smoothstep(0.008, 0.20, poolLum) * 1.32;
    acc = acc / (1.0 + acc * 0.48);
    float along = dot(xz, away), across = dot(xz, side);
    vec2 rUv = vec2(across * 0.014 + (nA.g - 0.5) * 0.12, along * 0.056 - t * 0.014 + (nB.g - 0.5) * 0.10);
    float nr1 = texture2D(uNoise, rUv).g;
    float nr2 = texture2D(uNoise, vec2(rUv.x * 1.85 + 0.37, rUv.y * 2.15 + t * 0.019) + (nB.rg - 0.5) * 0.08).b;
    float ripSlope = clamp(0.5 + dot(dnWave, away) * 4.2 + dot(gN.xz, away) * 5.0 + (ripMicro - 0.5) * 0.65, 0.0, 1.0);
    float ribbon = smoothstep(0.36, 0.84, nr1 * 0.30 + nr2 * 0.20 + ripSlope * 0.58);
    float sharpCrest = smoothstep(0.70, 0.96, ribbon);
    float shim = mix(0.10, 1.90, ribbon * ribbon * 0.55 + ribbon * 0.45);
    vec3 townTint = mix(vec3(0.86, 0.72, 0.56), vec3(1.18, 0.96, 0.68), ribbon) + vec3(0.28, 0.16, 0.04) * sharpCrest;
    vec3 townRefl = acc * townTint * shim * (1.0 - 0.70 * hullOcc) * (1.0 - 0.32 * mirrorCov);
    float calmK = mix(1.0, 1.32, zm.b) * (1.0 - 0.5 * storm) * (1.0 - 0.5 * uPrecip.x);
    float fadeD = 1.0 - 0.58 * smoothstep(280.0, 1050.0, camD);
    col += townRefl * smoothstep(0.02, 0.55, uWindowGlow) * calmK * fadeD * (0.34 + 0.58 * F) * step(0.0, coast);
    if (uNightGlintCount > 0.5 && coast > 0.0) {
      vec3 nGlint = vec3(0.0);
      vec3 nG = normalize(mix(normalize(mix(N, Nsp, 0.55)), N, unres));
      float ax = clamp(0.14 + 0.20 * rough + 0.06 * stormSea + spread * 1.4, 0.11, 0.58);
      float ay = clamp(0.020 + 0.040 * rough + 0.022 * stormSea + spread * 1.1, 0.016, 0.26);
      float brdfK = 0.044 * (0.24 + 0.76 * F) / max(NdV + 0.16, 0.22);
      #ifdef HB_LITE
      for (int g = 0; g < 4; g++) {
      #else
      for (int g = 0; g < 16; g++) {
      #endif
        if (float(g) >= uNightGlintCount) break;
        vec4 lp = uNightGlintPos[g];
        vec3 toL = lp.xyz - vWorld;
        float maxR = lp.w;
        float d2 = dot(toL, toL);
        if (d2 > maxR * maxR) continue;
        float d = sqrt(max(d2, 0.25));
        vec3 L = toL / d;
        if (L.y <= 0.005) continue;
        vec3 H = normalize(L + V);
        float ndh = max(dot(nG, H), 0.0);
        if (ndh <= 0.001) continue;
        vec2 cDir = dot(toL.xz, toL.xz) > 1e-4 ? normalize(toL.xz) : away;
        vec3 tRaw = vec3(cDir.x, 0.0, cDir.y);
        vec3 T = normalize(tRaw - nG * dot(tRaw, nG));
        vec3 B = cross(nG, T);
        float tdh = dot(T, H) / ax;
        float bdh = dot(B, H) / ay;
        float denom = tdh * tdh + bdh * bdh + ndh * ndh;
        float dGgx = 1.0 / (3.14159 * ax * ay * denom * denom + 1e-4);
        #ifndef HB_LITE
        float spK = hbLobe(max(dot(Nsp, H), 0.0), 420.0, 2.5 * spread) * (1.0 - unres * 0.75) * 0.85 * (0.25 + 0.75 * F);
        #else
        float spK = 0.0;
        #endif
        float att = (1.0 - smoothstep(maxR * 0.45, maxR, d)) / (1.0 + d2 * 0.0025);
        nGlint += uNightGlintCol[g].rgb * (dGgx * brdfK + spK) * att;
      }
      nGlint *= (1.0 - 0.85 * hullOcc) * (1.0 - 0.55 * uPrecip.x) * (1.0 - smoothstep(uHorizonDist * 0.80, uHorizonDist * 0.96, fwdD));
      col += hbGlintCap(nGlint, dot(col, vec3(0.2126, 0.7152, 0.0722)));
    }
  }

  if (uNight < 0.85 && (sunUp > 0.01 || stormSea > 0.2)) {
    float golden = smoothstep(0.0, 0.07, uSunDir.y) * (1.0 - smoothstep(0.24, 0.48, uSunDir.y)) * (1.0 - uNight);
    vec3 sssDir = normalize(-uSunDir + N * 0.48);
    float backScatter = pow(clamp(dot(V, sssDir), 0.0, 1.0), 3.0);
    vec2 viewH = toCam.xz / max(camD, 1.0);
    vec2 sunH = normalize(uSunDir.xz + 1e-4);
    float backH = clamp(dot(-viewH, sunH), 0.0, 1.0);
    float steepFwd = clamp(dot(N.xz, viewH) * 1.6, 0.0, 1.0);
    float fftCrestTerm = uFftOn > 0.5 ? (clamp(fftDispY * 0.85, 0.0, 1.0) * 0.65 + (1.0 - clamp(fftJMin, 0.0, 1.0)) * 0.55) : (organicCrest * 0.72);
    float thinCrest = smoothstep(0.12, 0.92, fftCrestTerm + steepFwd * 0.55 + 0.14 * (ripMicro - 0.5));
    float openWater = (1.0 - 0.52 * zm.b) * step(1.0, coast) * (1.0 - far01 * 0.45);
    float sssWave = smoothstep(0.025, 0.30, amp + 0.09 * rough);
    float sssClear = (1.0 - cover * 0.72) * (1.0 - stormSea * 0.65) * sunSh;
    float sssLow = golden * (0.28 + 0.72 * max(backScatter, backH * backH)) * thinCrest * sssWave * sssClear;
    float sssDay = sunUp * (1.0 - golden * 0.55) * (0.24 + 0.76 * backScatter) * thinCrest * sssWave * sssClear;
    vec3 sssColLow = mix(vec3(0.09, 0.68, 0.52), vec3(0.42, 0.86, 0.48), backScatter);
    vec3 sssColDay = vec3(0.04, 0.68, 0.64);
    float sssStorm = stormSea * (1.0 - uNight) * thinCrest * smoothstep(0.18, 0.75, steepFwd + max(organicCrest, 0.0) * 0.5) * 0.12;
    vec3 sssColStorm = vec3(0.03, 0.28, 0.22) * max(uAmbient * 1.6 + uSunColor * 0.18, vec3(0.15));
    col += (uSunColor * sssColLow * sssLow * 0.36 + uSunColor * sssColDay * sssDay * 0.22 + sssColStorm * sssStorm) * openWater;
  }

  vec3 gT = gerstnerNormalOf(gS, amp * groups);
  vec3 Nenv = uFftOn > 0.5 ? normalize(vec3(gN.x * 0.62 + dnWave.x * 0.24, gN.y, gN.z * 0.62 + dnWave.y * 0.24))
                           : normalize(vec3(gT.x * 0.62 + dnWave.x * 0.24, gT.y, gT.z * 0.62 + dnWave.y * 0.24));
  float rsE = max(dot(reflect(vd, Nenv), uGlintDir), 0.0);
  float rs = mix(max(dot(R, uGlintDir), 0.0), rsE, unres);
  float rsp = mix(max(dot(reflect(vd, Nsp), uGlintDir), 0.0), rsE, unres);
  float aa = unres;
  float tw = mix(smoothstep(0.8, 0.97, ripTw + 0.22 * sin(t * 1.3 + nC.a * 30.0)), 0.03, aa);
  float env = pow(rsE, mix(75.0, 320.0, uNight));
  float core = pow(rsE, mix(260.0, 620.0, uNight));
  float overcast = 1.0 - 0.9 * smoothstep(0.35, 0.8, uWeatherSea.x);
  #ifdef HB_LITE
  float sparks = 0.0;
  #else
  vec3 Hg = normalize(uGlintDir + V);
  float ndhG = max(dot(mix(Nsp, N, unres * 0.65), Hg), 0.0);
  float aGgx = clamp(sqrt(0.0022 + rough * rough * 0.014 + fftSlopeVar * 0.65 + spread * 0.45), 0.042, 0.52);
  float a2 = aGgx * aGgx;
  float ggxD = ndhG * ndhG * (a2 - 1.0) + 1.0;
  float ggxSpec = clamp((a2 / (3.14159 * ggxD * ggxD + 1e-4)) * (0.04 + 0.96 * F) * 0.048, 0.0, 2.4);
  float sparks = (uFftOn > 0.5 ? ggxSpec * 1.15 : min(hbLobe(rs, 300.0, 4.0 * spread) * 3.2 + hbLobe(rsp, 1100.0, 4.0 * spread) * 7.2, 2.4)) * mix(1.0, 0.6, uNight);
  #endif
  float microSh = 0.76 + 0.48 * smoothstep(0.30, 0.85, ripMicro);
  float moonWave = smoothstep(0.42, 0.90, ripMoon);
  float rMoon = max(dot(Rr, uGlintDir), 0.0);
  float moonFacet = hbLobe(rMoon, 380.0, 2.0 * spread) * smoothstep(0.44, 0.88, ripMoon * 0.72 + nC.a * 0.28) * (0.22 + 0.78 * env) * uNight;
  float nightBroad = 1.0 - 0.98 * uNight;
  vec3 glintTint = mix(vec3(1.0), vec3(0.72, 0.86, 1.16), uNight);
  vec3 glint = uGlintCol * glintTint * (
    env * mix((0.11 + 0.08 * far01) * microSh, 0.008 * (0.15 + 0.85 * moonWave), uNight)
    + core * mix(0.20, 0.018 * (0.15 + 0.85 * moonWave), uNight)
    + moonFacet * 0.58
    + pow(rsE, 30.0) * 0.010 * nightBroad
    + sparks * tw * mix(1.0, 2.85, uNight) * (0.04 + 0.96 * env) * (1.0 - 0.48 * far01));
  float moonK = smoothstep(0.6, 0.95, uNight);
  if (moonK > 0.0) {
    float mEnv = pow(rsE, 170.0);
    vec2 moonH = normalize(uGlintDir.xz + 1e-4);
    vec2 moonS = vec2(-moonH.y, moonH.x);
    float nAlong = dot(N.xz, moonH), nCross = dot(N.xz, moonS);
    vec3 Nmoon = normalize(vec3(moonH.x * nAlong * 1.25 + moonS.x * nCross * 0.38, N.y, moonH.y * nAlong * 1.25 + moonS.y * nCross * 0.38));
    float rFull = max(dot(reflect(vd, Nmoon), uGlintDir), 0.0);
    float moonGap = smoothstep(0.46, 0.86, ripMoon * 0.72 + organicCrest * 0.32 + 0.14);
    float moonColMask = smoothstep(0.955, 0.995, rsE);
    float moonAniso = hbLobe(rFull, 140.0, 2.0 * spread) * 1.35 * moonGap * moonColMask
                    + hbLobe(rFull, 440.0, 2.5 * spread) * 2.30 * smoothstep(0.56, 0.90, moonGap) * moonColMask;
    glint += uGlintCol * glintTint * moonK * (
      mEnv * (0.026 + 0.012 * far01) * (0.18 + 0.82 * moonWave)
      + pow(rsE, 260.0) * 0.036 * (0.15 + 0.85 * moonWave)
      + pow(rsE, 30.0) * 0.003
      + moonAniso
      + sparks * tw * 2.85 * 0.96 * (mEnv - env) * (1.0 - 0.48 * far01));
  }
  vec3 Hs = normalize(normalize(uGlintDir + vec3(0.0, 0.6, 0.0)) + V);
  float nhF = mix(max(dot(Nsp, Hs), 0.0), max(dot(gN, Hs), 0.0), unres);
  float facet = hbLobe(nhF, 1400.0, spread) * mix(smoothstep(0.5, 0.8, nB.a), 0.2, aa) * (1.0 - far01 * 0.85);
  float sparkMask = mix(smoothstep(0.45, 0.85, nC.a + 0.25 * nB.b), 0.45, aa);
  glint += uSunColor * facet * 0.75 * sunUp;
  glint *= sunSh * (1.0 - 0.65 * hullOcc);

  float lowSun = (1.0 - smoothstep(0.12, 0.58, uSunDir.y)) * (1.0 - uNight);
  if (lowSun > 0.0) {
    vec2 sunH = normalize(uSunDir.xz + 1e-4);
    vec2 fromC = xz - uSceneCenter;
    float rc = length(fromC) + 1.0;
    float sd = clamp(dot(fromC / rc, sunH), 0.0, 1.0);
    float roadAz = clamp(dot(-toCam.xz / max(camD, 1.0), sunH), 0.0, 1.0);
    float sunFace = smoothstep(-0.02, 0.22, dot(N.xz, sunH) + 0.14 * dot(gN.xz, sunH));
    float crestG = smoothstep(-0.15, 0.70, organicCrest);
    float sheen = max(pow(sd, 3.0) * smoothstep(uSceneRadius * 0.35, uSceneRadius * 1.25, rc), pow(roadAz, 5.5) * (1.0 - 0.55 * zm.b)) * lowSun * overcast;
    float slopeGate = sunFace * (0.25 + 0.75 * crestG);
    vec3 goldTint = normalize(uSunColor + 1e-4) * vec3(1.14, 0.96, 0.70);
    col += goldTint * sheen * (0.03 + 0.65 * slopeGate) * sunSh * (1.0 - 0.65 * hullOcc);
  }
  if (camD > 600.0 && fwdD < uHorizonDist * 0.99) {
    float swPh = dot(xz, SWELL) * 0.105 - t * 0.55 + (nA.b - 0.5) * 9.5;
    float swPh2 = dot(xz, vec2(-SWELL.y * 0.68 + SWELL.x * 0.73, SWELL.x * 0.68 + SWELL.y * 0.73)) * 0.135 - t * 0.68 + (nB.b - 0.5) * 6.0;
    float crest = pow(0.5 + 0.32 * sin(swPh) + 0.18 * sin(swPh2), 14.0) * smoothstep(0.48, 0.74, nA.a + 0.22 * nB.r) * smoothstep(0.28, 0.62, nC.b);
    float farBand = smoothstep(600.0, 1100.0, camD) * (1.0 - smoothstep(uHorizonDist * 0.85, uHorizonDist * 0.99, fwdD));
    col += sky * crest * farBand * 0.08 * (0.6 + uSea.y);
    float dash = smoothstep(0.55, 0.8, nC.r * 0.6 + nB.g * 0.5);
    glint += uGlintCol * crest * dash * farBand * env * 0.35 + uSunColor * crest * farBand * smoothstep(0.75, 0.95, nC.b) * 0.06 * sunUp;
  }
  glint *= 1.0 - smoothstep(uHorizonDist * 0.80, uHorizonDist * 0.96, fwdD);
  glint = hbGlintCap(glint, dot(col, vec3(0.2126, 0.7152, 0.0722)));

  vec3 beam = vec3(0.0);
  if (uBeamPos.y > -100.0 && dot(uBeamCol, vec3(1.0)) > 0.001) {
    vec2 rel = xz - uBeamPos.xz;
    vec3 Lb = normalize(uBeamPos - vWorld);
    vec3 Hb = normalize(Lb + V);
    float bspec = hbLobe(max(dot(Nsp, Hb), 0.0), 260.0, 2.0 * spread);
    float a = uBeamAngle;
    vec2 bd = vec2(cos(a), sin(a));
    float along = dot(rel, bd);
    float lat = abs(rel.x * bd.y - rel.y * bd.x);
    float w = (2.3 + along * tan(uBeamShape.y)) * 2.2 + 4.0;
    float lw = lat / w;
    float foot = exp(-lw * lw * 1.4) * smoothstep(30.0, 90.0, along) * exp(-along / (uBeamShape.x * 0.55));
    beam += uBeamCol * foot * (0.025 + bspec * 3.5 * sparkMask);
    glint = hbHelioGlint(glint, hbHelioCoin(rel), nhF, nB.a, sparkMask, far01, spread);
    float lanternShelter = 1.0 - smoothstep(0.05, 0.55, zm.b);
    float lrE = max(dot(reflect(vd, Nenv), Lb), 0.0);
    float lr = max(dot(reflect(vd, Nr), Lb), 0.0);
    float lWave = smoothstep(0.32, 0.88, ripMoon * 0.72 + nB.g * 0.28);
    float lTw = min(hbLobe(lr, 480.0, 2.5 * spread) * 2.1 * lWave, 1.15) * smoothstep(0.08, 0.68, pow(lrE, 85.0));
    beam += uBeamCol * (lTw * 0.78 * (1.0 - 0.55 * uPrecip.x) + hbLobe(lrE, 260.0, spread) * 0.05 * lWave * (1.0 - 0.45 * uPrecip.x) + hbLobe(lr, 180.0, 2.0 * spread) * 0.05 * lWave) * lanternShelter * (0.28 + 0.62 * min(uBeamShape.w, 2.5));
  }

`;
