/**
 * Fleet fragment paint, FRAME lane (decorative only; no data reads): GLSL injected into `fleet-material.ts`
 * FRAG_PARS, so the hot file only carries call sites.
 *
 *  - far-ship silhouette (06-F1): with the rig's `far` (vPaintC.z: 0 near … 1 a few px; 0 for a hovered /
 *    selected hull) the emblem's white disc melts into a deeper shade of the brand dye, the cloth loses ~20 % of
 *    its value and chroma, and a LOD hull gains a pale sheer and a bright waterline lip, so far ships read
 *    hull-first, sail-second (a fleet at anchor, not confetti). The brand hue is kept.
 *  - earth-pigment dye (01-A3): `livery.sailDye` caps the dye's chroma; the hovered / selected hull gets it back
 *    (vFleetMisc.x = highlight: 1 hover, 0.5 selected).
 *  - wet waterline + weathering (06-F4): painted topsides (livery modes 2 / 4; titans carry no livery, so their
 *    gilt is exempt) get a dark wet band above the boot-top, a thin weed line, faint salt streaks under the sheer.
 */
export const FLEET_FAR_FRAG = /* glsl */ `
float hbFarK() { return vPaintC.z; }
// the emblem (premultiplied) melts into a deeper shade of the dye far away: a darker brand field, no white disc
vec4 hbFarEmblem(vec4 t, vec3 deep) {
  float melt = smoothstep(0.15, 0.85, hbFarK());
  return vec4(mix(t.rgb, deep * t.a, melt), t.a);
}
// far cloth: value and chroma down (~20 %), so a far sail is not the brightest thing on the water
void hbFarCloth(inout vec3 c) {
  float f = hbFarK();
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, vec3(l), 0.22 * f) * (1.0 - 0.2 * f);
}
// earth pigments: the dye's chroma is capped on the CPU (sailDye); a hovered / selected hull shows it at full chroma
vec3 hbDyeChroma(vec3 dye) {
  float l = dot(dye, vec3(0.2126, 0.7152, 0.0722));
  return max(mix(vec3(l), dye, 1.0 + 0.45 * smoothstep(0.05, 0.5, vFleetMisc.x)), vec3(0.0));
}
// LOD topsides far away: a pale sheer line and a bright waterline lip give the few-px hull a silhouette on the sea
void hbFarLodHull(inout vec3 c, float t, float aa) {
  float f = smoothstep(0.2, 0.9, hbFarK());
  float sheer = smoothstep(0.84 - aa, 0.9 + aa, t);
  float lip = 1.0 - smoothstep(0.12 - aa, 0.2 + aa, t);
  c = mix(c, vec3(0.74, 0.70, 0.60), sheer * 0.55 * f);
  c = mix(c, vec3(0.80, 0.84, 0.82), lip * 0.6 * f);
}
// wet waterline, weed line and salt: painted topsides sit in the water, used and loved (t: boot-top 0 … sheer 1)
void hbWeather(inout vec3 c, float t, float aa) {
  float u = vPaintC.x;
  float wet = 1.0 - smoothstep(0.0, 0.2 + aa, t);
  c *= 1.0 - 0.24 * wet * wet;
  float weed = 1.0 - smoothstep(0.0, 0.02 + aa, abs(t - 0.02));
  c = mix(c, vec3(0.07, 0.075, 0.045), weed * 0.3);
  // salt streaks: faint pale runs below the sheer, hashed along the hull
  float col = fract(sin(floor(u * 38.0) * 91.17) * 437.5);
  float run = smoothstep(0.55, 0.95, col) * smoothstep(0.35, 0.8, t) * (1.0 - smoothstep(0.8, 0.86, t));
  float fine = 1.0 - smoothstep(0.02, 0.06, fwidth(u * 38.0) * 0.1);
  c = mix(c, c * 0.85 + vec3(0.07, 0.07, 0.065), run * 0.35 * fine);
}
`;
