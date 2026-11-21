/**
 * E21: the sails' low-sun window below (4°..22°, sin; nothing below the horizon) as a function of the sun's height,
 * for the backlit crowns (world/shaders/crowns.ts). hbSailGlow keeps its own literal copy (its program text is
 * unchanged); sail-light.test.ts holds the two to the same edges.
 */
export const LOW_SUN_GLSL = /* glsl */ `
float hbLowSun(float y) { return (1.0 - smoothstep(0.07, 0.375, y)) * smoothstep(-0.02, 0.03, y); }
`;

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
  float ndlBack = dot(-N, uSunDir);
  float back = clamp(ndlBack * 0.85 + 0.15, 0.0, 1.0) * smoothstep(-0.15, 0.06, ndlBack);
  float lumS = dot(uSunColor, vec3(0.2126, 0.7152, 0.0722));
  if (back <= 0.0 || lumS <= 1e-4) return vec3(0.0);
  // low-to-afternoon sun shines warmly through woven linen; below the horizon or at night, calm
  float nightK = smoothstep(3.0, 18.0, uLamp);
  // 4°..22° (sin): a low sun shines through; below the horizon, nothing (E21: the crowns share these edges)
  float low = (1.0 - smoothstep(0.07, 0.375, uSunDir.y)) * smoothstep(-0.02, 0.03, uSunDir.y);
  float cosV = dot(-V, uSunDir);
  float toward = 0.38 * pow(max(0.0, cosV), 2.0) + 0.34 * pow(clamp(cosV * 0.5 + 0.5, 0.0, 1.0), 4.0);
  float k = (0.16 + toward * (0.28 + 0.72 * low)) * (1.0 - nightK * 0.78);
  vec3 sunHue = min(uSunColor / lumS, vec3(2.2));
  // woven linen transmits warm honey-gold wavelengths preferentially when backlit by low sun
  vec3 honey = mix(vec3(1.06, 0.96, 0.78), vec3(1.22, 0.88, 0.44), low * (1.0 - nightK));
  vec3 tint = mix(vec3(1.0), sunHue * honey, 0.72);
  vec3 g = dye * tint * min(lumS, 3.0) * back * k * (1.0 - furl) * (1.0 - hbSailOpaque);
  // calm: luminous honey-gold parchment without blowing bloom or washing out the printed emblem
  float lg = dot(g, vec3(0.2126, 0.7152, 0.0722));
  return g * min(1.0, 0.68 / max(lg, 1e-4));
}
`;
