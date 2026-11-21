/** Physical hover (12-M5): a soft sun-coloured sheen on the sail cloth only, by day (uLamp fades it at dusk). */
export const HOVER_SHEEN = /* glsl */ `
vec3 hbHoverSheen(vec3 base, float kind, float hi) {
  if (kind < 0.5 || kind > 1.5) return vec3(0.0);
  // uLamp runs from 0.4 at noon to 40 at night (engine/uniforms.ts): the day sheen fades out as the lamps come up;
  // unclamped it went to about -39 at night, and the negative light turned a selected ship's sails NaN-black (v1.5.1)
  return base * uSunColor * 0.14 * hi * max(1.0 - uLamp, 0.0);
}
`;

/**
 * E27: what a widened rig line gives way to: a neutral grey at this share of the distance air's value (haze and
 * horizon). The sea and the cloth a stay is mostly seen against from the harbour's 26–30° cameras sit well below the
 * bright horizon air, and a grey casts no cool line across a warm sail.
 */
export const RIG_AIR = 0.45;

export const FLEET_LIGHTING = /* glsl */ `
  {
    vec3 fN = inverseTransformDirection(normal, viewMatrix);
    vec3 fV = normalize(cameraPosition - vHbWorld);
    // wreck lanterns, hull stern lanterns & Titan gallery/sanctuary windows
    if (vFleetMisc.z > 3.5) {
      float fl = 0.86 + 0.08 * sin(uTime * 5.3 + vHbWorld.x * 1.7) + 0.06 * sin(uTime * 11.9 + vHbWorld.z * 2.3);
      // (a selected wreck's lantern, 'cove' focus hi = 1, burns bright day or night: her memorial light)
      if (vFleetBrand.a < -8.5) outgoingLight += vec3(1.0, 0.42, 0.095) * (uLamp * vFleetRig.x + smoothstep(0.7, 1.0, vFleetMisc.x) * (1.6 + 1.4 * uLamp)) * fl;
      // 06-F6 a hull's stern lantern: lit exactly when her stern lamp is (sternLampLit, texel 2.z), else a dark lantern
      else if (vFleetMisc.z < 4.5) outgoingLight += vec3(1.0, 0.42, 0.095) * uLamp * 0.55 * vFleetLamp * fl;
      // 06-F7b Titan stern-gallery / sanctuary / temple / vault windows: warm candle-to-oil variety,
      // gated by hbLampGlow (05-P3 lamplighting wave & E29 uLampArrive = 0 compliance)
      else {
        vec3 wCell = floor(vHbLocal * 1.6);
        float wJitter = hbWhite(wCell + 19.0);
        float wGlow = hbLampGlow(uWindowGlow, hbLampRank(vHbWorld, wJitter));
        float wTone = hbWhite(wCell + 37.0);
        vec3 wCandle = vec3(1.0, 0.34, 0.06);
        vec3 wOil = vec3(1.0, 0.54, 0.18);
        vec3 wHoney = vec3(1.0, 0.68, 0.34);
        vec3 wCol = wTone < 0.55 ? mix(wCandle, wOil, wTone / 0.55) : mix(wOil, wHoney, (wTone - 0.55) / 0.45);
        float wLevel = 0.72 + 0.28 * hbWhite(wCell + 53.0);
        float wFlick = 0.92 + 0.05 * sin(uTime * (4.7 + 1.8 * wJitter) + wJitter * 6.283)
                            + 0.03 * sin(uTime * 11.3 + wTone * 9.0);
        outgoingLight += wCol * smoothstep(0.05, 0.72, wGlow) * 2.4 * wLevel * wFlick;
      }
    }
    // USDS signal-tower living amber brazier (unpainted flame cones high above deck, hbLampGlow gated)
    if (vFleetMisc.z < 0.5 && vPaintA.w < 0.5 && vFleetRig.z < 0.5 && vFleetMisc.w < 0.01 && vHbLocal.y > 3.5) {
      bool bOut = hbVc.r > 0.78 && hbVc.g > 0.14 && hbVc.g < 0.42 && hbVc.b < 0.06;
      bool bIn  = hbVc.r > 0.94 && hbVc.g > 0.52 && hbVc.g < 0.78 && hbVc.b < 0.16;
      if (bOut || bIn) {
        float bGlow = hbLampGlow(uWindowGlow, hbLampRank(vHbWorld, 0.25));
        float bFl = 0.84 + 0.10 * sin(uTime * 8.3 + vHbLocal.y * 6.0) + 0.06 * sin(uTime * 15.7 + vHbLocal.x * 4.0);
        vec3 bCol = bIn ? vec3(1.0, 0.52, 0.09) : vec3(1.0, 0.28, 0.03);
        outgoingLight += bCol * (0.30 * (1.0 - uNight) + smoothstep(0.04, 0.65, bGlow) * (bIn ? 2.15 : 1.75)) * bFl;
      }
    }
    // sail cloth glows when the low sun is behind it, plus soft woven-linen billow rim sheen by day
    // (02-L2: view- and elevation-dependent, brightest against a low sun; 06-F12 seams and roundel in silhouette)
    if (vFleetMisc.z > 0.5 && vFleetMisc.z < 1.5) {
      outgoingLight += hbSailGlow(diffuseColor.rgb, fN, fV, vFleetRig.x, vHbAerial);
      #ifndef HB_LITE
        float billowRim = pow(1.0 - clamp(abs(dot(fN, fV)), 0.0, 1.0), 2.8);
        float sunFace = max(dot(fN, uSunDir), 0.0);
        outgoingLight += diffuseColor.rgb * uSunColor * billowRim * sunFace * 0.14 * (1.0 - uNight) * (1.0 - vFleetRig.x * 0.7);
      #endif
    } else if (vFleetRig.z > 0.5 && vFleetMisc.z < 0.5) {
      // subtle backlit glow on fluttering house pennants
      outgoingLight += hbSailGlow(diffuseColor.rgb, fN, fV, 0.25, vHbAerial) * 0.65;
    }
    #ifndef HB_LITE
      // soft #FF9E44 stern self-bounce on aft transoms/swan-necks from lit stern lanterns (D11) & Titan galleries (hbLampGlow)
      if (vFleetMisc.z < 0.5 && vFleetRig.z < 0.5 && vPaintA.w < 4.5 && vPaintC.x < -0.42) {
        float flS = 0.92 + 0.08 * sin(uTime * 5.7 + vHbWorld.x * 1.9);
        float sternProx = smoothstep(-0.55, -0.92, vPaintC.x) * smoothstep(0.1, 0.7, vHbLocal.y) * (1.0 - smoothstep(3.8, 6.5, vHbLocal.y));
        float bAmt = max(vFleetLamp, 0.0) * smoothstep(1.5, 22.0, uLamp) * sternProx * 0.32;
        float titanAft = step(vPaintA.w, 0.5) * step(4.5, -vHbLocal.x) * smoothstep(-0.42, -0.82, vPaintC.x)
                       * smoothstep(0.2, 1.0, vHbLocal.y) * (1.0 - smoothstep(4.5, 7.5, vHbLocal.y));
        if (titanAft > 0.01 && uWindowGlow > 0.02) {
          bAmt += titanAft * smoothstep(0.05, 0.72, hbLampGlow(uWindowGlow, hbLampRank(vHbWorld, 0.5))) * 0.24;
        }
        outgoingLight += diffuseColor.rgb * vec3(1.0, 0.38, 0.08) * bAmt * flS;
      }
      // silver moonlight grazing rim on dark sails & wet hulls at night (uSunDir holds moon direction at night)
      if (uNight > 0.05 && uSunDir.y > 0.02) {
        float mElev = smoothstep(0.02, 0.14, uSunDir.y) * uNight;
        float mRim = pow(1.0 - clamp(abs(dot(fN, fV)), 0.0, 1.0), 3.0) * (0.25 + 0.75 * smoothstep(-0.2, 0.6, dot(fN, uSunDir)));
        vec3 mSilver = vec3(0.46, 0.58, 0.78);
        if (vFleetMisc.z > 0.5 && vFleetMisc.z < 1.5) {
          outgoingLight += mSilver * mix(vec3(0.18), diffuseColor.rgb, 0.45) * mRim * mElev * (1.0 - vFleetRig.x * 0.5) * 0.42;
        } else if (vFleetMisc.z < 0.5 && vPaintA.w < 4.5) {
          outgoingLight += mSilver * mRim * mElev * (0.09 + 0.18 * hbFleetWaterline);
        }
      }
      // grazing Pharos-beam rim-catch on hulls & translucent sail-flash as the PSI beam sweeps the bay
      if (dot(uBeamLight, vec3(1.0)) > 1e-4 && uBeamPos.y > -100.0) {
        vec2 bf = hbBeamFrame(vHbWorld);
        if (bf.x > 18.0 && bf.x < uBeamShape.x * 1.15) {
          float bw = (uBeamFall.y + bf.x * uBeamFall.z) * 1.8 + 4.5;
          float bMask = exp(-(bf.y * bf.y) / (bw * bw) * 1.8)
                      * smoothstep(18.0, 75.0, bf.x)
                      * exp(-bf.x / max(uBeamFall.x * 2.4, 1.0))
                      * (1.0 - smoothstep(uBeamShape.x * 0.78, uBeamShape.x * 1.15, bf.x));
          if (bMask > 0.005) {
            vec3 toPharos = normalize(uBeamPos - vHbWorld);
            float bRim = pow(1.0 - clamp(abs(dot(fN, fV)), 0.0, 1.0), 2.6);
            if (vFleetMisc.z > 0.5 && vFleetMisc.z < 1.5) {
              float sCatch = 0.35 + 0.65 * abs(dot(fN, toPharos));
              outgoingLight += diffuseColor.rgb * uBeamLight * bMask * (sCatch * 0.55 + bRim * 0.45) * (1.0 - vFleetRig.x * 0.65) * (1.0 - hbSailOpaque * 0.35);
            } else if (vFleetMisc.z < 0.5 && vPaintA.w < 4.5) {
              float hFace = smoothstep(-0.25, 0.55, dot(fN, toPharos));
              outgoingLight += uBeamLight * mix(diffuseColor.rgb, vec3(0.95, 0.86, 0.68), 0.35) * bMask * bRim * hFace * 0.42;
            }
          }
        }
      }
    #endif
    // hover / selection: soft warm rim + lift
    float hi = vFleetMisc.x;
    if (hi > 0.001) {
      float rim = pow(1.0 - clamp(abs(dot(fN, fV)), 0.0, 1.0), 3.0);
      float lum = max(dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722)), 0.02);
      // relative to the scene's own exposure, so it reads the same at noon and at night
      outgoingLight += (vec3(1.0, 0.84, 0.6) * rim * 0.4 * lum * 3.0 + outgoingLight * 0.10) * hi;
      outgoingLight += hbHoverSheen(diffuseColor.rgb, vFleetMisc.z, hi);
    }
    // E27: widened rig gives way by (1 - coverage) (pose.ts)
    if (vFleetLamp < 0.0) outgoingLight = mix(vec3(dot(mix(uAerialHaze, uHorizon, 0.4), vec3(0.2126, 0.7152, 0.0722)) * ${RIG_AIR.toFixed(2)}), outgoingLight, -vFleetLamp);
  }
  #include <opaque_fragment>`;
