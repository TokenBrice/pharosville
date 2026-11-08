/**
 * Foam, wakes, caps and surf. (Notes here: shader text ships in the first-frame bytes.)
 * Swell trains that arrive (03-O3): coast-parallel crest lines travel shoreward, bunching and slowing as the water
 * shoals (wavenumber rises with falling depth), steepening into a thin foam lip that breaks near the contact line.
 * Scaled by the declared sea state's foam bands (uSea.w) exactly like the old in-place bands; the sea clock stills them.
 * E14: the coast trains, the swash
 * and the reef surf run on the main swell's phase (waves.ts hbSwellPhase) plus fixed per-stretch offsets, in step with
 * the hulls' bob and the run-up on stone; the reef's lines sharpen (pow 10 -> 16) on that longer 62 m spacing. E12: only
 * the strongest Kelvin crests whiten (threshold .3, gain .6), the rest of an arm is lighter, rougher water; where a crest
 * is a pixel (fp) the white fades.
 */
export const OCEAN_FOAM = /* glsl */ `  // ---------------------------------------------------------------- foam
  float bands = uSea.w;
  float dnC = coast + (nB.r - 0.5) * 2.4 + (nC.g - 0.5) * 0.8;
  float fContact = 1.0 - smoothstep(0.25, 1.05, dnC);
  // swell trains that arrive (03-O3, see above)
  float shoalW = mix(0.62, 1.25, 1.0 - smoothstep(1.0, 9.0, depth));
  float trainPh = dnC * shoalW - hbSwellPhase(xz, t) + nA.b * 5.0 + nA.a * 0.8;
  float crestL = pow(0.5 + 0.5 * cos(trainPh), mix(10.0, 22.0, smoothstep(2.0, 8.0, dnC)));
  float trainK = (1.0 - smoothstep(5.0, 9.5, dnC)) * smoothstep(0.7, 1.6, dnC) * (0.45 + 0.55 * (1.0 - smoothstep(1.5, 7.0, dnC)));
  float band2 = crestL * trainK * smoothstep(0.38, 0.6, nB.g + 0.1 * nC.r);
  float coastFoam = max(fContact, band2 * 0.9 * bands) * step(-1.0, coast);
  // lace: a fine drifting net of bubble threads (shared by the swash, the eddies and old wakes);
  // beyond the heart view it melts into its mean coverage instead of shimmering
  float lA = texture2D(uNoise, xz * 0.071 + t * vec2(0.003, -0.002)).b;
  float lB = texture2D(uNoise, (rot * xz) * 0.083 - t * vec2(0.002, 0.003) + 0.61).b;
  float laceFar = smoothstep(260.0, 760.0, camD);
  float lace = mix(hbNet(lA, lB, 0.05), 0.3, laceFar);
  // swash: a foam sheet runs in with each crest of the main swell and drains back, tearing open as it thins
  {
    float swPh = hbSwellPhase(xz, t) + nA.b * 2.2 + nA.a * 1.2;
    float sw = 0.5 + 0.5 * sin(swPh);
    sw = sw * sw * (3.0 - 2.0 * sw);
    float beachK = 1.0 - smoothstep(2.5, 9.0, depth);
    float sheetW = (0.45 + 2.5 * sw) * bands * mix(0.45, 1.0, beachK) * (0.7 + 0.6 * nB.g);
    float inSheet = 1.0 - smoothstep(sheetW - 0.35, sheetW + 0.2, dnC);
    float lip = (1.0 - smoothstep(0.0, 0.32, abs(dnC - sheetW))) * (0.45 + 0.55 * sw) * smoothstep(0.3, 0.55, nC.g + 0.15);
    float torn = smoothstep(0.3 + 0.35 * (1.0 - sw), 0.55 + 0.35 * (1.0 - sw), mix(lA, 0.5, laceFar) * 0.8 + nC.r * 0.4);
    float sheet = inSheet * max(lace * 0.95, (1.0 - torn) * 0.6);
    coastFoam = max(coastFoam, max(sheet, lip * 0.9) * step(-1.0, coast) * step(dnC, 6.0));
  }
  float sdN = sdist + (nC.g - 0.5) * 0.6;
  float fStruct = (1.0 - smoothstep(0.0, 0.3, sdN)) * 0.3 * smoothstep(0.35, 0.6, nC.g + 0.2) + (1.0 - smoothstep(0.08, 0.22, abs(sdN - 1.1))) * smoothstep(0.62, 0.75, nC.b) * 0.25;
  // foam lingering in the eddies behind piles and quay corners: slow-turning scum and lace, not a ring
  {
    vec2 sw2 = vec2(sin(t * 0.05 + nA.g * 6.2831), cos(t * 0.041 + nA.b * 6.2831)) * 0.05;
    float scum = smoothstep(0.58, 0.8, texture2D(uNoise, xz * 0.09 + sw2).g * 0.8 + nC.a * 0.35);
    float eddyK = (1.0 - smoothstep(0.5, 3.6, sdN)) * smoothstep(0.0, 0.25, sdN);
    // (open water off the coast: a mooring buoy keeps a thin contact ring, not a cotton-wool blotch of eddy scum)
    fStruct = max(fStruct, max(scum * 0.5, lace * 0.45) * eddyK * (1.0 - 0.92 * smoothstep(18.0, 50.0, coast)));
  }
  // calm water keeps only a faint contact line round piles, buoys and quays; the foam builds with sea state and rain
  fStruct *= mix(0.35, 1.0, max(storm, uPrecip.x));
  // broken, translucent foam: noise eats the wake so it reads as lines of bubbles, not ribbons
  float fTrail = smoothstep(0.25, 0.85, trail * (0.2 + 1.3 * nC.g * nB.b * 1.6)) * (0.4 + 0.35 * smoothstep(0.4, 1.0, trail));
  // as a wake ages it breaks into lace threads and drifting patches before it is gone
  fTrail = max(fTrail, lace * smoothstep(0.06, 0.3, trail) * (1.0 - smoothstep(0.55, 0.95, trail)) * (0.35 + 0.4 * nB.g) * (1.0 - laceFar * 0.6));
  float fKel = smoothstep(0.3, 0.62, live.r * (0.45 + 1.0 * nC.r)) * 0.6 * (1.0 - 0.65 * smoothstep(0.8, 2.0, fp));
  float fRing = smoothstep(0.3, 0.75, live.g * (0.35 + 1.0 * nC.b)) * 0.5;
  float caps = smoothstep(0.82 - 0.1 * storm, 0.97, crestH * 0.55 + nB.a * 0.55 + nC.r * 0.12) * uSea.z * smoothstep(25.0, 90.0, coast);
  // scattered whitecap flecks riding the crests across the whole bay once the declared sea is choppy
  // (uSea.z > 0: off-peg step 2+), so a rough sea reads at the heart view, not only in patches (readings)
  if (uSea.z > 0.01) {
    float fl = texture2D(uNoise, xz * 0.029 + wdir * t * 0.006).a * 0.55 + nC.r * 0.4 + crestH * 0.4;
    caps = max(caps, smoothstep(0.82 - 0.05 * uSea.z, 0.93, fl) * smoothstep(0.0, 0.6, uSea.z) * (1.0 - far01 * 0.5) * smoothstep(25.0, 90.0, coast));
  }
  // wind-driven foam streaks (spindrift lanes) in rough weather, aligned with the wind
  // (weighted by a uniform: a calm sea skips the taps; the result was exactly zero)
  float laneK = max(smoothstep(0.35, 1.0, storm), windSea * 0.85);
  if (laneK > 0.0) {
    vec2 wl = vec2(dot(xz, wdir), dot(xz, vec2(-wdir.y, wdir.x)));
    float lane = texture2D(uNoise, vec2(wl.x * 0.0035 - t * 0.004, wl.y * 0.045)).g * 0.75 + texture2D(uNoise, vec2(wl.x * 0.011, wl.y * 0.13) + 0.41).b * 0.4;
    float streaks = smoothstep(0.7, 0.88, lane) * laneK * smoothstep(20.0, 70.0, coast) * (0.35 + 0.65 * nC.r);
    caps = max(caps, streaks * 0.75);
  }
  // wind-raised whitecaps (DEWS Warning / Danger), sparse, riding the crests, more in the open Roads
  if (windSea > 0.01) {
    float wf = texture2D(uNoise, xz * 0.041 - wdir * t * 0.02).a * 0.5 + nC.r * 0.45 + crestH * 0.45 + 0.08 * zm.a;
    caps = max(caps, smoothstep(0.86 - 0.08 * windSea, 0.95, wf) * windSea * (1.0 - far01 * 0.5) * smoothstep(15.0, 60.0, coast) * (1.0 - 0.6 * zm.b));
  }
  // snowflakes melt the instant they land: a white speck that is gone
  caps = max(caps, snowSpeck * 0.8);
  // the Shoals: lines of surf breaking across the reef, rolling in with the swell
  {
    float sPh = hbSwellPhase(xz, t) + (nA.b - 0.5) * 5.0;
    float brk = pow(0.5 + 0.5 * sin(sPh), 16.0) * smoothstep(0.35, 0.62, nB.g * 0.8 + nC.r * 0.35);
    float spray = smoothstep(0.62, 0.8, nC.a * 0.7 + nB.b * 0.4) * 0.35;
    caps = max(caps, (brk * 0.95 + spray * brk) * smoothstep(0.25, 0.8, zm.r) * (1.0 - far01 * 0.4));
  }
  float foam = clamp(max(max(coastFoam, fStruct), max(max(fTrail, fKel), max(fRing, caps))), 0.0, 1.0);
  foam *= 1.0 - smoothstep(uHorizonDist * 0.86, uHorizonDist * 0.99, fwdD);
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 foamLit = mix(uFoamCol, uFoamNight, uNight * 0.6) * (uAmbient * 1.1 + uSunColor * (0.25 + 0.75 * ndl) * 0.3183 * mix(1.0, sunSh, 0.8));
  // overview: the coast foam stays under the bloom threshold (no glowing outline round the island, 01-A6)
  foamLit *= 1.0 - 0.38 * smoothstep(310.0, 500.0, uCameraPos.y) * (1.0 - uNight);

  // visible low swell: crests catch the sky, troughs hold the body colour
  {
    float sk = smoothstep(0.04, 0.5, amp) * (1.0 - far01 * 0.6);
    float ch = crestH * 1.6 + (nB.g - 0.5) * 0.5;
    col += mix(sky, uSunColor * 0.12, 0.3) * smoothstep(0.2, 0.95, ch) * 0.15 * sk;
    col *= 1.0 - 0.15 * (1.0 - smoothstep(-0.9, 0.1, ch)) * sk;
  }
  float cShade = hbCloudShadow(xz);
  col *= mix(1.0, cShade, 0.55);
  col += glint * overcast * (1.0 - foam) * cShade;
  col += beam * (1.0 - foam * 0.5);
  col = mix(col, foamLit, foam);
  // summer nights: the churned water of wakes, contact rings and the swash glows faintly (decorative, sea-tone.ts)
  col += hbBiolum(trail * 0.9 + live.r * 1.4 + live.g * 0.7 + max(coastFoam - fContact * 0.6, 0.0) * step(dnC, 7.0), zm.r, t, nC.a);

`;
