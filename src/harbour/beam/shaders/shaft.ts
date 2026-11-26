import * as THREE from "three";
import { Effect, EffectAttribute, BlendFunction } from "postprocessing";

export const BEAM_FRAG = /* glsl */ `
uniform mat4 uCamWorld;
uniform mat4 uInvProj;
uniform vec3 uBeamPos, uColor, uAx0;
uniform float uTime, uIntensity, uL, uWind, uNear, uSteps, uPrecip;
uniform sampler2D uNoise;
uniform vec3 uSkyRef;      // the horizon sky (cloud fade on sky pixels)
uniform float uSkyT;       // view-ray distance (m) beyond which the surface hit is the sky backdrop
// mirror radius and cone half-angle tangent: the horn shutter (DA-09) narrows both
uniform float R0, TANA;

float bmHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// low-frequency value noise from a hash: it never tiles, so no blotch repeats down a long shaft
float bmVNoise(vec2 x) {
  vec2 i = floor(x), f = fract(x), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(bmHash(i), bmHash(i + vec2(1.0, 0.0)), u.x), mix(bmHash(i + vec2(0.0, 1.0)), bmHash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// returns (total density, incandescent core density)
vec2 beamDensity(vec3 p, vec3 ax, float L, float fine) {
  vec3 q = p - uBeamPos;
  float s = dot(q, ax);
  float r = length(q - ax * s);
  float Rn = R0 + max(s, 0.0) * TANA;
  float x2 = (r * r) / (Rn * Rn);
  // incandescent mirror core + luminous golden shaft + soft atmospheric scatter sheath
  float rainMist = smoothstep(0.25, 0.90, uPrecip);
  float coreP = exp(-x2 * 11.5) * 0.58;
  float bodyP = exp(-x2 * 2.15) * 0.64;
  float sheathP = exp(-x2 * mix(0.68, 0.50, rainMist)) * (0.14 + 0.14 * rainMist);
  // born at the bronze mirror, brightest exiting the tholos colonnade, thinning smoothly over the sea
  float exitRamp = smoothstep(2.5, 13.5, s);
  float fall = exitRamp * (0.08 + 0.92 * exp(-s / (L * 0.24))) * (1.0 - smoothstep(L * 0.48, L, s));
  // delicate warm scatter halo right around the tholos lantern columns
  float tholosGlow = exp(-dot(q, q) / 145.0) * smoothstep(-3.0, 6.0, s) * (1.0 - smoothstep(10.0, 26.0, s)) * 0.26;
  // light spreads as the shaft widens
  float spread = pow(3.2 / (Rn + 2.2), 1.65);
  // drifting sea-mist & atmospheric dust modulation (world space, height-stratified marine vapour)
  vec2 drift = vec2(uTime * (0.65 + 2.1 * uWind), uTime * 0.28);
  float n1 = bmVNoise((p.xz + drift) / 58.0 + p.y * 0.013);
  vec2 q2 = p.xz - drift * 0.55;
  float n2 = bmVNoise(mat2(0.799, -0.602, 0.602, 0.799) * q2 / 22.0 + vec2(17.3, p.y * 0.032));
  float n3 = texture2D(uNoise, (p.xz + drift * 1.65) * 0.055 + vec2(p.y * 0.042, 0.5)).b;
  float n4 = texture2D(uNoise, (p.xz - drift * 1.1) * 0.11 + vec2(0.3, p.y * 0.07)).g;
  // marine humidity thickens gently toward the sea surface while staying airy above
  float seaVapour = 0.88 + 0.30 * exp(-max(p.y - 12.0, 0.0) / 55.0);
  // drifting precipitation moisture veil modulates scatter gently in rain/snow without washing out PSI hue or reach
  float rainVeil = 1.0;
  if (rainMist > 0.001) {
    vec2 fallUv = vec2((p.x + p.z) * 0.042 - uTime * (0.28 + 0.9 * uWind), p.y * 0.022 + uTime * 0.72);
    float rSheet = texture2D(uNoise, fallUv).r;
    float rGust = bmVNoise((p.xz + drift * 1.35) / 34.0 + vec2(0.0, p.y * 0.025 + uTime * 0.45));
    float veilMod = 0.84 + 0.46 * smoothstep(0.24, 0.88, rSheet * 0.55 + rGust * 0.55);
    rainVeil = mix(1.0, veilMod * 1.18, rainMist);
  }
  float mist = (0.58 + 1.24 * smoothstep(0.22, 0.94, n1 * 0.68 + n2 * 0.56)) * seaVapour * rainVeil;
  // fine dust motes / spray shimmer resolved only when step size resolves the texture frequency
  float motes = mix(1.0, 0.74 + 0.42 * n3 + 0.22 * n4, fine);
  float k = fall * spread * mist * motes;
  float total = (coreP + bodyP + sheathP) * k + tholosGlow * (0.75 + 0.25 * n2);
  float coreD = coreP * k * (0.6 + 0.4 * exp(-max(s, 0.0) / (L * 0.16))) + tholosGlow * 0.45;
  return vec2(total, coreD);
}

// integrate one shaft along the ray [0, tMax]; returns (total, core)
vec2 shaft(vec3 ro, vec3 rd, float tMax, vec3 ax, float jitter) {
  vec3 w0 = uBeamPos - ro;
  float b = dot(ax, rd);
  float d = dot(ax, w0), e = dot(rd, w0);
  float den = max(1.0 - b * b, 1e-4);
  float sc = clamp((b * e - d) / den, 0.0, uL);
  vec3 pa = uBeamPos + ax * sc;
  float tc = dot(pa - ro, rd);
  float dist = length(pa - (ro + rd * tc));
  float Rn = R0 + sc * TANA;
  if (dist > Rn * 3.5) return vec2(0.0);
  float sinT = sqrt(den);
  float chord = min(Rn * 3.5 / max(sinT, 0.05), uL * 0.45);
  float t0 = max(tc - chord, 0.0), t1 = min(tc + chord, tMax);
  if (t1 <= t0) return vec2(0.0);
  float steps = clamp(uSteps, 12.0, 28.0);
  float dt = (t1 - t0) / steps;
  vec2 acc = vec2(0.0);
  float fine = 1.0 - smoothstep(1.4, 4.2, dt);
  for (int i = 0; i < 28; i++) {
    if (float(i) >= steps) break;
    float t = t0 + (float(i) + jitter) * dt;
    float nearFade = smoothstep(uNear * 0.35, uNear, t);
    acc += beamDensity(ro + rd * t, ax, uL, fine) * nearFade;
  }
  // a shaft seen end-on, or swinging toward the viewer, would wash the frame: the lantern flare carries
  // that read instead
  vec2 toCam = normalize(ro.xz - uBeamPos.xz);
  float toward = dot(normalize(ax.xz), toCam);
  float viewK = dt * mix(0.32, 1.0, smoothstep(0.08, 0.45, sinT)) * (1.0 - 0.84 * smoothstep(0.2, 0.95, toward));
  return acc * viewK;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  outputColor = inputColor;
  if (uIntensity < 0.002) return;
  float viewZ = perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
  vec4 ray = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 vp = ray.xyz / ray.w;
  vec3 rdV = normalize(vp);
  vec3 ro = uCamWorld[3].xyz;
  vec3 rd = normalize((uCamWorld * vec4(rdV, 0.0)).xyz);
  float tMax = viewZ / rdV.z;   // both negative: distance along the ray to the surface
  // interleaved-gradient dither rotated smoothly per frame: leaves zero raymarch banding
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy + mod(floor(uTime * 60.0), 64.0) * 5.588238, vec2(0.06711056, 0.00583715))));
  vec2 acc = shaft(ro, rd, tMax, uAx0, jitter);
  // optical-depth cap: the shaft saturates softly instead of blowing out what lies behind it
  float a = 1.0 - exp(-acc.x * 0.74);
  float coreFrac = clamp(acc.y / max(acc.x, 1e-4), 0.0, 1.0);
  // over the sky the shaft stands in front of the painted cloud banks: let it thin where they are lit brighter
  // than the horizon sky, so it never paints over them
  if (tMax > uSkyT) {
    float sky = max(dot(uSkyRef, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
    float bg = dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    a *= 1.0 - 0.45 * smoothstep(1.4, 3.2, bg / sky);
  }
  // incandescent warm-gold core transitioning cleanly into rich golden-amber atmospheric sheath (preserving PSI hue)
  vec3 sheathCol = uColor * vec3(1.02, 0.91, 0.78);
  vec3 coreCol = mix(uColor, vec3(1.0, 0.95, 0.84), 0.48);
  vec3 beamCol = mix(sheathCol, coreCol, smoothstep(0.15, 0.72, coreFrac));
  outputColor = vec4(inputColor.rgb + beamCol * a * uIntensity, inputColor.a);
}`;

export class BeamEffect extends Effect {
  constructor(uniforms: Map<string, THREE.Uniform>) {
    super("HarbourBeamEffect", BEAM_FRAG, { blendFunction: BlendFunction.SET, attributes: EffectAttribute.DEPTH, uniforms });
  }
}
