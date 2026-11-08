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
    // wreck lanterns: warm oil light × uLamp (the hb_emissive contract), a slow uneven flicker
    if (vFleetMisc.z > 3.5) {
      float fl = 0.86 + 0.08 * sin(uTime * 5.3 + vHbWorld.x * 1.7) + 0.06 * sin(uTime * 11.9 + vHbWorld.z * 2.3);
      // (a selected wreck's lantern, 'cove' focus hi = 1, burns bright day or night: her memorial light)
      if (vFleetBrand.a < -8.5) outgoingLight += vec3(1.0, 0.42, 0.095) * (uLamp * vFleetRig.x + smoothstep(0.7, 1.0, vFleetMisc.x) * (1.6 + 1.4 * uLamp)) * fl;
      // 06-F6 a hull's stern lantern: lit exactly when her stern lamp is (sternLampLit, texel 2.z), else a dark lantern
      else if (vFleetMisc.z < 4.5) outgoingLight += vec3(1.0, 0.42, 0.095) * uLamp * 0.3 * vFleetLamp * fl;
      // 06-F7b a titan's stern-gallery windows: warm from dusk (decorative, like the town's windows)
      else outgoingLight += vec3(1.0, 0.45, 0.14) * smoothstep(2.0, 22.0, uLamp) * 1.1 * (0.94 + 0.06 * fl);
    }
    // sail cloth glows when the low sun is behind it
    // (02-L2: view- and elevation-dependent, brightest against a low sun; 06-F12 seams and roundel in silhouette)
    if (vFleetMisc.z > 0.5 && vFleetMisc.z < 1.5) outgoingLight += hbSailGlow(diffuseColor.rgb, fN, fV, vFleetRig.x);
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
