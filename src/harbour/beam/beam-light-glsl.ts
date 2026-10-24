import type * as THREE from "three";
import type { BeamUniforms } from "./uniforms";

/**
 * THE BEAM AS A LIGHT (05-P1, 05-P2): one GLSL chunk every lit consumer injects (the kit, so the fleet
 * through its kit base, the lamp sprites, the smoke plume), built from the shared BeamUniforms so all of
 * them agree with the shaft (beam-system.ts) and the sea's sweeping glint.
 *
 * Not a cone test: the shaft rides ~85 m up and tilts only ~1.6°, so it passes OVER the town. What reaches
 * the ground is the firelight its mist scatters down: a soft swath under the shaft's ground track, widest
 * and brightest near the harbour, decaying with the shaft's own falloff (uBeamFall.x, cut by the reach L),
 * weaker the further a surface sits below the shaft, turned toward the lantern by a wrap-diffuse.
 * Colour = the lamp colour (band); rhythm = the sweep (period); reach = the score. 0 draws.
 *
 * By day (P2) the mirror throws the sun instead: a soft sun-coloured coin landing ~0.35 L out along the
 * heading (uBeamSun.w), crossing the water and the walls once per revolution, dimmed by cloud (DEWS).
 */
export const BEAM_LIGHT_GLSL = /* glsl */ `
uniform vec3 uBeamPos;
uniform float uBeamAngle;
uniform vec4 uBeamShape;
uniform vec4 uBeamFall;
uniform vec3 uBeamLight;
uniform vec4 uBeamSun;
// x along the ground track (m), y lateral (m) of a world point in the beam frame
vec2 hbBeamFrame(vec3 p) {
  vec2 rel = p.xz - uBeamPos.xz;
  vec2 bd = vec2(cos(uBeamAngle), sin(uBeamAngle));
  return vec2(dot(rel, bd), abs(rel.x * bd.y - rel.y * bd.x));
}
// irradiance-like multiplier for albedo (add diffuse * this). n: world normal.
vec3 hbBeamLight(vec3 p, vec3 n) {
  vec3 o = vec3(0.0);
  if (uBeamPos.y < -100.0) return o;
  vec2 f = hbBeamFrame(p);
  vec3 toL = normalize(uBeamPos - p);
  float wrap = clamp(dot(n, toL) * 0.6 + 0.4, 0.0, 1.0);
  if (dot(uBeamLight, vec3(1.0)) > 1e-4) {
    float L = uBeamShape.x;
    // scattered swath: wider and softer than the shaft (the mist spreads the light as it falls)
    float w = (uBeamFall.y + max(f.x, 0.0) * uBeamFall.z) * 2.2 + 4.0;
    float lat = exp(-(f.y * f.y) / (w * w) * 1.4);
    // the light outlasts the visible shaft (lit mist reads far less than lit stone): the shaft's decay
    // length × 2.5, cut a little past the reach, so a low score lights only the near harbour
    float fall = smoothstep(30.0, 90.0, f.x) * exp(-f.x / max(uBeamFall.x * 2.5, 1.0)) * (1.0 - smoothstep(L * 0.75, L * 1.15, f.x));
    // the shaft rides high: surfaces far below it get less of what the mist scatters
    float shaftY = uBeamPos.y - f.x * tan(uBeamShape.z);
    float vert = 0.3 + 0.7 * exp(-max(shaftY - p.y, 0.0) / 80.0);
    o += uBeamLight * lat * fall * vert * wrap;
  }
  if (dot(uBeamSun.rgb, vec3(1.0)) > 1e-4) {
    // the heliograph's coin: a soft ellipse, long along the heading, no volume
    float a = (f.x - uBeamSun.w) / (16.0 + uBeamSun.w * 0.14);
    float b = f.y / (7.0 + uBeamSun.w * 0.05);
    float coin = exp(-(a * a + b * b) * 1.6) * step(0.0, f.x);
    o += uBeamSun.rgb * coin * clamp(dot(n, toL) * 0.75 + 0.25, 0.0, 1.0);
  }
  return o;
}
`;

/** The uniforms BEAM_LIGHT_GLSL reads (bind into a shader's uniforms). */
export function beamLightUniforms(bu: BeamUniforms): Record<string, THREE.IUniform> {
  return {
    uBeamPos: bu.uBeamPos, uBeamAngle: bu.uBeamAngle, uBeamShape: bu.uBeamShape,
    uBeamFall: bu.uBeamFall, uBeamLight: bu.uBeamLight, uBeamSun: bu.uBeamSun,
  };
}
