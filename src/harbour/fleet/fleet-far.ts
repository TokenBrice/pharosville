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
// LOD topsides far away: a pale sheer line and a bright waterline lip give the few-px hull a silhouette on the sea
void hbFarLodHull(inout vec3 c, float t, float aa) {
  float f = smoothstep(0.2, 0.9, hbFarK());
  float sheer = smoothstep(0.84 - aa, 0.9 + aa, t);
  float lip = 1.0 - smoothstep(0.12 - aa, 0.2 + aa, t);
  c = mix(c, vec3(0.74, 0.70, 0.60), sheer * 0.55 * f);
  c = mix(c, vec3(0.80, 0.84, 0.82), lip * 0.6 * f);
}
`;
