export const DITHER_FRAG = /* glsl */ `
uniform float uTooth;
float hbIgn(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float hbH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hbVal(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hbH(i), hbH(i + vec2(1.0, 0.0)), f.x), mix(hbH(i + vec2(0.0, 1.0)), hbH(i + 1.0), f.x), f.y);
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  if (uTooth > 0.0) {
    vec2 fc = gl_FragCoord.xy;
    float g = hbVal(fc / 2.6) * 0.6 + hbVal(fc / 9.0 + 17.3) * 0.4 - 0.5;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float mid = smoothstep(0.08, 0.35, l) * (1.0 - smoothstep(0.7, 0.95, l));
    vec2 e = min(uv, 1.0 - uv);
    float edge = smoothstep(0.02, 0.1, min(e.x, e.y));
    c *= 1.0 + g * 2.0 * uTooth * mid * edge;
  }
  float d = hbIgn(gl_FragCoord.xy) + hbIgn(gl_FragCoord.xy + vec2(5.588, 7.31)) - 1.0;
  outputColor = vec4(c + d / 255.0, inputColor.a);
}`;
