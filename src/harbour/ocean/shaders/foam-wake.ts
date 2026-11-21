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
  // sheltered inner-harbour stone quays (zm.b) stay calm and crystal-clear instead of chalk-outlined;
  // exposed rocky cliffs, Wreck Cove beach and The Shoals keep lacy breaking surf
  float shelter = zm.b * (1.0 - stormSea);
  float exposed = 1.0 - shelter;
  // lace: delicate drifting cellular bubble web (shared by breaking surf, swash, eddies and aging wakes)
  // (beyond the heart view the lace melts into its mean coverage: skip its taps; explicit gradients keep the
  // conditional reads safe)
  float laceFar = smoothstep(260.0, 760.0, camD);
  float lA = 0.5, lB = 0.5;
  if (laceFar < 1.0) {
    lA = textureGrad(uNoise, xz * 0.071 + t * vec2(0.003, -0.002), dx * 0.071, dy * 0.071).b;
    lB = textureGrad(uNoise, (rot * xz) * 0.083 - t * vec2(0.002, 0.003) + 0.61, (rot * dx) * 0.083, (rot * dy) * 0.083).b;
  }
  float lace = mix(hbNet(lA, lB, 0.05), 0.3, laceFar);
  float bubbleHoles = smoothstep(0.28, 0.74, mix(nC.g * 0.62 + nB.a * 0.50, 0.52, laceFar));
  float foamWeb = clamp(max(lace * 0.95, bubbleHoles * (1.0 - 0.55 * smoothstep(0.55, 0.82, nC.r))), 0.0, 1.0);
  // a rough sea keeps its full surf, swash and spindrift: the lace breaks up calm-water foam only
  float roughFoam = stormSea;
  foamWeb = mix(foamWeb, 1.0, roughFoam);
  bubbleHoles = mix(bubbleHoles, 1.0, roughFoam);
  float dnC = coast + (nB.r - 0.5) * 2.4 + (nC.g - 0.5) * 0.8;
  // exposed shoreline contact: lacy broken surf edge (never a solid chalk ribbon)
  float fContactExp = (1.0 - smoothstep(0.18, 1.05, dnC)) * (0.42 + 0.58 * foamWeb);
  // sheltered stone quays: whisper-thin, broken organic meniscus clinging right at the wet stone edge
  float fContactCalm = (1.0 - smoothstep(0.02, 0.48, coast + (nC.g - 0.5) * 0.32)) * smoothstep(0.45, 0.82, foamWeb + 0.15 * nC.b) * (0.16 + 0.22 * uSea.y);
  float fContact = mix(fContactExp, fContactCalm, shelter);
  // swell trains that arrive (03-O3, see above): strong on exposed coasts/beaches, nearly quiet in sheltered basins
  float shoalW = mix(0.62, 1.25, 1.0 - smoothstep(1.0, 9.0, depth));
  float trainPh = dnC * shoalW - hbSwellPhase(xz, t) + nA.b * 5.0 + nA.a * 0.8;
  float crestL = pow(0.5 + 0.5 * cos(trainPh), mix(10.0, 22.0, smoothstep(2.0, 8.0, dnC)));
  float trainK = (1.0 - smoothstep(5.0, 9.5, dnC)) * smoothstep(0.7, 1.6, dnC) * (0.45 + 0.55 * (1.0 - smoothstep(1.5, 7.0, dnC)));
  float band2 = crestL * trainK * smoothstep(0.36, 0.62, nB.g + 0.12 * nC.r) * (0.48 + 0.52 * foamWeb) * mix(0.08, 1.0, exposed);
  float coastFoam = max(fContact, band2 * 0.9 * bands) * step(-1.0, coast);
  // swash: lacy foam sheet running in with each swell crest on beaches & outer coasts, tearing open as it drains
  {
    float swPh = hbSwellPhase(xz, t) + nA.b * 2.2 + nA.a * 1.2;
    float sw = 0.5 + 0.5 * sin(swPh);
    sw = sw * sw * (3.0 - 2.0 * sw);
    float beachK = 1.0 - smoothstep(2.5, 9.0, depth);
    float sheetW = (0.45 + 2.5 * sw) * bands * mix(0.45, 1.0, beachK) * (0.7 + 0.6 * nB.g);
    float inSheet = 1.0 - smoothstep(sheetW - 0.4, sheetW + 0.25, dnC);
    float lip = (1.0 - smoothstep(0.0, 0.30, abs(dnC - sheetW))) * (0.45 + 0.55 * sw) * smoothstep(0.32, 0.58, nC.g + 0.15) * (0.55 + 0.45 * foamWeb);
    float torn = smoothstep(0.28 + 0.38 * (1.0 - sw), 0.54 + 0.36 * (1.0 - sw), mix(lA, 0.5, laceFar) * 0.8 + nC.r * 0.4);
    float sheet = inSheet * max(lace * 0.95, (1.0 - torn) * 0.52 * bubbleHoles);
    coastFoam = max(coastFoam, max(sheet, lip * 0.92) * mix(0.08, 1.0, exposed) * step(-1.0, coast) * step(dnC, 6.0));
  }
  float sdN = sdist + (nC.g - 0.5) * 0.6;
  float fStruct = (1.0 - smoothstep(0.0, 0.28, sdN)) * 0.26 * smoothstep(0.38, 0.65, nC.g + 0.2) + (1.0 - smoothstep(0.08, 0.22, abs(sdN - 1.1))) * smoothstep(0.64, 0.78, nC.b) * 0.22;
  // foam lingering in the eddies behind piles and quay corners: slow-turning scum and lace, not a ring
  {
    vec2 sw2 = vec2(sin(t * 0.05 + nA.g * 6.2831), cos(t * 0.041 + nA.b * 6.2831)) * 0.05;
    float scum = smoothstep(0.60, 0.82, texture2D(uNoise, xz * 0.09 + sw2).g * 0.8 + nC.a * 0.35);
    float eddyK = (1.0 - smoothstep(0.5, 3.2, sdN)) * smoothstep(0.0, 0.25, sdN);
    // (open water off the coast: a mooring buoy keeps a thin contact ring, not a cotton-wool blotch of eddy scum)
    fStruct = max(fStruct, max(scum * 0.45, lace * 0.42) * eddyK * (1.0 - 0.92 * smoothstep(18.0, 50.0, coast)));
  }
  // calm water keeps only a faint broken meniscus round piles, buoys and quays; foam builds with sea state and rain
  fStruct *= mix(0.24, 1.0, max(storm, uPrecip.x)) * mix(1.0, 0.55, shelter);
  // broken, translucent foam: noise eats the wake so it reads as lines of bubbles, not ribbons
  float fTrail = smoothstep(0.14, 0.68, trail * (0.35 + 1.15 * nC.g * nB.b * 1.4)) * (0.48 + 0.42 * smoothstep(0.25, 0.85, trail));
  // as a wake ages it breaks into lace threads and drifting patches before it is gone
  fTrail = max(fTrail, lace * smoothstep(0.06, 0.3, trail) * (1.0 - smoothstep(0.55, 0.95, trail)) * (0.35 + 0.4 * nB.g) * (1.0 - laceFar * 0.6));
  float fKel = smoothstep(0.16, 0.52, live.r * (0.55 + 0.9 * nC.r)) * 0.75 * (1.0 - 0.45 * smoothstep(1.0, 2.5, fp));
  float fRing = smoothstep(0.3, 0.75, live.g * (0.35 + 1.0 * nC.b)) * 0.5;
  // E08: a hull's contact ring has a fixed world width; under ~2 px (overview) it would print a white outline, so it
  // fades with the pixel footprint (the coast's own contact line is kept)
  fRing *= 1.0 - smoothstep(0.45, 0.9, length(fwidth(xz)));
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
  // the Shoals: delicate lacy surf breaking across the shallow limestone reef, rolling in with the swell
  {
    float sPh = hbSwellPhase(xz, t) + (nA.b - 0.5) * 5.0;
    float brk = pow(0.5 + 0.5 * sin(sPh), 16.0) * smoothstep(0.34, 0.62, nB.g * 0.78 + nC.r * 0.36) * (0.45 + 0.55 * foamWeb);
    float trailLace = pow(0.5 + 0.5 * sin(sPh - 0.7), 6.0) * lace * 0.55;
    float spray = smoothstep(0.62, 0.8, nC.a * 0.7 + nB.b * 0.4) * 0.35;
    caps = max(caps, (brk * 0.92 + trailLace + spray * brk) * smoothstep(0.22, 0.78, zm.r) * (1.0 - far01 * 0.4));
  }
  float foam = clamp(max(max(coastFoam, fStruct), max(max(fTrail, fKel), max(fRing, caps))), 0.0, 1.0);
  foam *= 1.0 - smoothstep(uHorizonDist * 0.86, uHorizonDist * 0.99, fwdD);
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 foamLit = mix(uFoamCol, uFoamNight, uNight * 0.6) * (uAmbient * 1.1 + uSunColor * (0.25 + 0.75 * ndl) * 0.3183 * mix(1.0, sunSh, 0.8));
  // overview: the coast foam stays under the bloom threshold (no glowing outline round the island, 01-A6)
  foamLit *= 1.0 - 0.38 * smoothstep(310.0, 500.0, uCameraPos.y) * (1.0 - uNight);

  // gentle organic swell relief: crests catch a whisper of sky without banding into horizontal stripes
  {
    float sk = smoothstep(0.05, 0.55, amp) * (1.0 - far01 * 0.65);
    col += mix(sky, uSunColor * 0.12, 0.25) * smoothstep(0.25, 0.95, organicCrest) * mix(0.075, 0.15, stormSea) * sk;
    col *= 1.0 - mix(0.08, 0.15, stormSea) * (1.0 - smoothstep(-0.85, 0.15, organicCrest)) * sk;
  }
  float cShade = hbCloudShadow(xz);
  col *= mix(1.0, cShade, 0.55);
  col += glint * overcast * (1.0 - foam) * cShade;
  col += beam * (1.0 - foam * 0.5);
  // thin aerated foam fringes tint toward translucent turquoise-jade before thick crests turn crisp sunlit white
  // (a rough sea and active wake crests stay crisp white rather than crushing through the calm double-smoothstep)
  float wakeWhite = max(fKel, fTrail * 0.85);
  float foamWhite = max(mix(smoothstep(0.14, 0.82, foam), 1.0, roughFoam), smoothstep(0.12, 0.55, wakeWhite));
  vec3 foamEdge = mix(col + uSunlitShoal * 0.16 * mix(1.0, 0.25, uNight) * (1.0 - cover * 0.5), foamLit, foamWhite);
  col = mix(col, foamEdge, max(mix(smoothstep(0.03, 0.92, foam), foam, roughFoam), smoothstep(0.04, 0.65, wakeWhite)));
  // summer nights: the churned water of wakes, contact rings and the swash glows faintly (decorative, sea-tone.ts)
  col += hbBiolum(trail * 0.9 + live.r * 1.4 + live.g * 0.7 + max(coastFoam - fContact * 0.6, 0.0) * step(dnC, 7.0), zm.r, t, nC.a);

`;
