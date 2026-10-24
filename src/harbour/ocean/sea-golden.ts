/**
 * Golden-hour light on the sea body (decorative: time of day only). 02-L1 the key light's shadow takes the
 * sun-lit share of the upwelling body colour; 02-L11 a low sun warms the lit body toward its own hue, so the
 * harbour joins the amber frame instead of staying pool-cyan, while the water in shadow keeps its cool blue
 * (the warm/cool split of a painted evening).
 */
export const SEA_GOLDEN_GLSL = /* glsl */ `
vec3 hbSeaGolden(vec3 body, float sunSh, float sunUp) {
  // ~35 % of the body is sun-lit upwelling: shade it (the moon's shadow is fainter still)
  body *= 1.0 - (1.0 - sunSh) * mix(0.42, 0.15, uNight);
  float lumS = max(dot(uSunColor, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
  vec3 hue = min(uSunColor / lumS, vec3(2.2));
  float low = (1.0 - smoothstep(0.07, 0.42, uSunDir.y)) * smoothstep(0.0, 0.05, uSunDir.y) * (1.0 - uNight);
  float k = low * sunSh * smoothstep(0.0, 0.3, sunUp);
  float lumB = dot(body, vec3(0.2126, 0.7152, 0.0722));
  body = mix(body, vec3(lumB), 0.18 * k);
  return mix(body, body * hue, 0.32 * k);
}
`;
