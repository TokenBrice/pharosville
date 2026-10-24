/**
 * 02-L2 low-sun sail translucency + 06-F12 backlit seams and emblems (decorative: time of day only; the hue is
 * always the sail's own dye, never a data colour). When the sun stands low behind the cloth, sails glow like paper
 * lanterns: view-dependent (strongest looking toward the sun), elevation-dependent (a high sun barely shows through),
 * capped below the bloom threshold. Seams, tabling and the printed roundel block the light, so they read as darker
 * silhouettes in the glow. `hbSailOpaque` is written by the sail branch of hbFleetColor (fleet-material.ts).
 */
export const SAIL_LIGHT_GLSL = /* glsl */ `
float hbSailOpaque = 0.0;
vec3 hbSailGlow(vec3 dye, vec3 N, vec3 V, float furl) {
  float back = max(0.0, dot(-N, uSunDir));
  float lumS = dot(uSunColor, vec3(0.2126, 0.7152, 0.0722));
  if (back <= 0.0 || lumS <= 1e-4) return vec3(0.0);
  // 4°..22° (sin): a low sun shines through; below the horizon, nothing
  float low = (1.0 - smoothstep(0.07, 0.375, uSunDir.y)) * smoothstep(-0.02, 0.03, uSunDir.y);
  float toward = pow(max(0.0, dot(-V, uSunDir)), 3.0);
  float k = 0.12 + 0.55 * toward * low;
  vec3 hue = min(uSunColor / lumS, vec3(2.0));
  vec3 g = dye * mix(vec3(1.0), hue, 0.6) * lumS * back * k * (1.0 - furl) * (1.0 - hbSailOpaque);
  // calm: never a neon sail (stays under the golden/dusk bloom threshold with the cloth's own light)
  float lg = dot(g, vec3(0.2126, 0.7152, 0.0722));
  return g * min(1.0, 0.5 / max(lg, 1e-4));
}
`;
