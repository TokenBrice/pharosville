import * as THREE from "three";

/**
 * W12 DEW AND RIME (decorative: calendar and hour, never data). Fog is reserved for stale data, so the cool
 * mornings get no mist: spring and autumn dawns get sparse sun-facing dew glints on grass and leaves that burn off
 * as the sun climbs; winter dawns below ~2 °C get rime, thin white frosted edges on grass and roof tiles (not snow
 * cover), melting by about 10:00. No volume, no veil. Module-level uniforms, like the cloud shadows: the weather
 * system writes them, the island materials read `hbDewRime` / `hbDewGlint`.
 */
export const dewUniforms = {
  /** x dew 0..1, y rime 0..1 */
  uHbDew: { value: new THREE.Vector2(0, 0) } as THREE.IUniform<THREE.Vector2>,
};

const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/**
 * Pure (tested): dew and rime for a morning. `weights` spring, summer, autumn, winter; `sunY` the sun's height
 * (direction y); `hour` local clock; `sunrise` local clock; `temperatureC` decorative air temperature; `precip` 0..1.
 */
export function dewRime(weights: readonly number[], sunY: number, hour: number, sunrise: number, temperatureC: number, precip: number): [number, number] {
  const morning = smooth(sunrise - 0.6, sunrise + 0.2, hour) * (1 - smooth(sunrise + 2.5, sunrise + 4, hour));
  const dry = 1 - smooth(0.05, 0.3, precip);
  const dew = (weights[0] + weights[2]) * morning * (1 - smooth(0.12, 0.38, sunY)) * dry;
  const rime = weights[3] * (1 - smooth(1, 3, temperatureC)) * smooth(sunrise - 0.6, sunrise, hour) * (1 - smooth(8.5, 10, hour)) * dry;
  return [dew, rime];
}

export const DEW_GLSL = /* glsl */ `
uniform vec2 uHbDew;
// rime: thin frosted edges on grass (pid 6) and roof tiles (pid 7), crisp and patchy, never a cover
void hbDewRime(inout vec3 alb, inout float rough, float pid, vec3 W, vec3 N, float snow) {
  #ifdef HB_LITE
  return;
  #endif
  if (uHbDew.y < 0.002) return;
  float host = hbIs(pid, 6.0) + hbIs(pid, 7.0) * 0.8;
  float n = hbNoise(W * 1.7) * 0.6 + hbNoise(W * 7.0) * 0.4;
  float frost = uHbDew.y * host * smoothstep(0.35, 0.8, N.y) * smoothstep(0.42, 0.62, n) * (1.0 - snow);
  alb = mix(alb, vec3(0.74, 0.79, 0.84), frost * 0.6);
  rough = mix(rough, 0.45, frost);
}
// dew: sparse sun-facing glints on grass (6) and leaves (8), faded where sub-pixel
float hbDewGlint(float pid, vec3 W, vec3 N, vec3 V, vec3 L, float dW) {
  #ifdef HB_LITE
  return 0.0;
  #endif
  if (uHbDew.x < 0.002) return 0.0;
  float host = hbIs(pid, 6.0) + hbIs(pid, 8.0) * 0.6;
  float g = step(0.985, hbWhite(floor(W * 6.0) + 37.0)) * hbFine(dW, 0.17);
  return uHbDew.x * host * g * pow(max(dot(reflect(-V, N), L), 0.0), 6.0);
}
`;
