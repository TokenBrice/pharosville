/**
 * Golden-hour light on the sea body (decorative: time of day only). 02-L1 the key light's shadow takes the
 * sun-lit share of the upwelling body colour; 02-L11 a low sun warms the lit body toward its own hue, so the
 * harbour joins the amber frame instead of staying pool-cyan, while the water in shadow keeps its cool blue
 * (the warm/cool split of a painted evening).
 */
export const SEA_GOLDEN_GLSL = /* glsl */ `
vec3 hbSeaGolden(vec3 body, float sunSh, float sunUp) {
  // polish #1: on water the shadow mostly takes the glitter and the warmth (below); the body only darkens ~12 %
  // (the moon's shadow fainter still) and cools a touch, a gentle blue band rather than a dark slab
  // (a sun on the horizon is weak against the sky: its hull-long streaks fade rather than bar the water)
  float shK = (1.0 - sunSh) * mix(0.55, 1.0, smoothstep(0.0, 0.12, uSunDir.y + uNight));
  body *= 1.0 - shK * mix(0.12, 0.06, uNight);
  body *= mix(vec3(1.0), vec3(0.95, 0.99, 1.05), shK * (1.0 - uNight));
  float lumS = max(dot(uSunColor, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
  vec3 hue = min(uSunColor / lumS, vec3(2.2));
  float low = (1.0 - smoothstep(0.07, 0.42, uSunDir.y)) * smoothstep(0.0, 0.05, uSunDir.y) * (1.0 - uNight);
  float k = low * sunSh * smoothstep(0.0, 0.3, sunUp);
  float lumB = dot(body, vec3(0.2126, 0.7152, 0.0722));
  body = mix(body, vec3(lumB), 0.22 * k);
  return mix(body, body * hue, 0.45 * k);
}
`;
