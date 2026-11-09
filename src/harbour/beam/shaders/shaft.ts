import * as THREE from "three";
import { Effect, EffectAttribute, BlendFunction } from "postprocessing";

export const BEAM_FRAG = /* glsl */ `
uniform mat4 uCamWorld;
uniform mat4 uInvProj;
uniform vec3 uBeamPos, uColor, uAx0;
uniform float uTime, uIntensity, uL, uWind, uNear;
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

float beamDensity(vec3 p, vec3 ax, float L, float fine) {
  vec3 q = p - uBeamPos;
  float s = dot(q, ax);
  float r = length(q - ax * s);
  float Rn = R0 + max(s, 0.0) * TANA;
  float x2 = (r * r) / (Rn * Rn);
  // golden core + a broad faint sheath of scattered firelight
  float prof = exp(-x2 * 2.2) * 0.62 + exp(-x2 * 10.0) * 0.5 + exp(-x2 * 0.9) * 0.1;
  // born at the mirror, brightest there, thinning over the water, gone well before the reach
  // (it clears the colonnade before it gathers: inside the lantern the fire itself carries the light)
  float fall = smoothstep(4.0, 16.0, s) * (0.08 + 0.92 * exp(-s / (L * 0.22))) * (1.0 - smoothstep(L * 0.5, L, s));
  // light spreads as the shaft widens
  float spread = pow(3.2 / (Rn + 2.2), 1.7);
  // drifting sea-mist breakup (world space, does not rotate with the beam)
  vec2 drift = vec2(uTime * (0.6 + 2.0 * uWind), uTime * 0.25);
  // a tiled noise texture repeats every few tens of metres and a long shaft integrates those repeats into
  // regular blotches: two octaves of hash value noise (banks ~60 m and ~25 m across) never repeat
  float n1 = bmVNoise((p.xz + drift) / 60.0 + p.y * 0.012);
  vec2 q2 = p.xz - drift * 0.6;
  float n2 = bmVNoise(mat2(0.799, -0.602, 0.602, 0.799) * q2 / 24.0 + vec2(17.3, p.y * 0.03));
  float n3 = texture2D(uNoise, (p.xz + drift * 1.7) * 0.05 + vec2(p.y * 0.04, 0.5)).b;
  // n3's ~1 m grain is only kept where the march resolves it: across a wide far shaft one step spans many
  // grains, and the undersampled field beats against the texture tile into regular ribs
  // (the same mean as before, a gentler swing: smooth banks over a full 0.16..1.86 range read as separate blobs)
  float mist = (0.6 + 1.2 * smoothstep(0.25, 0.95, n1 * 0.7 + n2 * 0.55)) * mix(1.0, 0.75 + 0.5 * n3, fine);
  return prof * fall * spread * mist;
}

// integrate one shaft along the ray [0, tMax]
float shaft(vec3 ro, vec3 rd, float tMax, vec3 ax, float jitter) {
  vec3 w0 = uBeamPos - ro;
  float b = dot(ax, rd);
  float d = dot(ax, w0), e = dot(rd, w0);
  float den = max(1.0 - b * b, 1e-4);
  float sc = clamp((b * e - d) / den, 0.0, uL);
  vec3 pa = uBeamPos + ax * sc;
  float tc = dot(pa - ro, rd);
  float dist = length(pa - (ro + rd * tc));
  float Rn = R0 + sc * TANA;
  if (dist > Rn * 3.2) return 0.0;
  float sinT = sqrt(den);
  float chord = min(Rn * 3.2 / max(sinT, 0.05), uL * 0.45);
  float t0 = max(tc - chord, 0.0), t1 = min(tc + chord, tMax);
  if (t1 <= t0) return 0.0;
  const int N = 18;
  float dt = (t1 - t0) / float(N);
  float acc = 0.0;
  float fine = 1.0 - smoothstep(1.5, 4.0, dt);
  for (int i = 0; i < N; i++) {
    float t = t0 + (float(i) + jitter) * dt;
    acc += beamDensity(ro + rd * t, ax, uL, fine) * smoothstep(uNear * 0.35, uNear, t);
  }
  // a shaft seen end-on, or swinging toward the viewer, would wash the frame: the lantern flare carries
  // that read instead
  vec2 toCam = normalize(ro.xz - uBeamPos.xz);
  float toward = dot(normalize(ax.xz), toCam);
  return acc * dt * mix(0.3, 1.0, smoothstep(0.08, 0.45, sinT)) * (1.0 - 0.85 * smoothstep(0.2, 0.95, toward));
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
  // interleaved-gradient (blue-ish) dither, rotated per frame: the 18-step march leaves no grain pattern
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy + mod(floor(uTime * 60.0), 64.0) * 5.588238, vec2(0.06711056, 0.00583715))));
  float acc = shaft(ro, rd, tMax, uAx0, jitter);
  // optical-depth cap: the shaft saturates softly instead of blowing out what lies behind it
  float a = 1.0 - exp(-acc * 0.7);
  // over the sky the shaft stands in front of the painted cloud banks: let it thin where they are lit brighter
  // than the horizon sky, so it never paints over them
  if (tMax > uSkyT) {
    float sky = max(dot(uSkyRef, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
    float bg = dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    a *= 1.0 - 0.45 * smoothstep(1.4, 3.2, bg / sky);
  }
  outputColor = vec4(inputColor.rgb + uColor * a * uIntensity, inputColor.a);
}`;

export class BeamEffect extends Effect {
  constructor(uniforms: Map<string, THREE.Uniform>) {
    super("HarbourBeamEffect", BEAM_FRAG, { blendFunction: BlendFunction.SET, attributes: EffectAttribute.DEPTH, uniforms });
  }
}
