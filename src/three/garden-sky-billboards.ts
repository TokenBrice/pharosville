import {
  InstancedBufferAttribute,
  InstancedMesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
} from "three";
import type { EpistemicFogBank } from "../systems/epistemic-haze";

/**
 * Phase 2 (Breathtaking Rendering, items 2d/6): one layer of billboard cumulus
 * and the stale-source fog banks.
 *
 * Clouds occupy the visible sky, re-anchored to the camera target every frame
 * by garden-sky's root. Each quad faces the eye independently, so perspective
 * does not expose the far cards edge-on.
 *
 * Contracts kept:
 * - ONE InstancedMesh and ONE draw call per system; per-instance state is
 *   attributes, drift is a pure function of the world clock in the vertex
 *   shader. No per-frame CPU writes, no per-frame allocation.
 * - Determinism: positions, sizes and seeds are authored constants below;
 *   drift wraps over a fixed span with a sine edge fade so a card never pops.
 *   Reduced motion pins uTime to 0 and the whole layer freezes into the
 *   static composition.
 * - Palette authority: these meshes carry NO colour constants. Body, shade,
 *   lit-edge and haze colours are all derived per frame from the day-cycle
 *   presets by garden-sky and handed in as uniforms.
 * W2.3/W2.5 (sky-3, data-poetry-1): the nine far mist banks are deleted. By
 * day, low mist means a stale source, so the only mist here is the bounded
 * `localMist` bank of a stale feed; the scenic kasumi lives in garden-horizon.
 */

export interface GardenSkyBillboardLayer {
  material: ShaderMaterial;
  mesh: InstancedMesh;
}

export interface GardenSkyBillboards {
  clouds: GardenSkyBillboardLayer;
  dispose: () => void;
  localMist: GardenSkyBillboardLayer;
  setFogBanks: (banks: readonly EpistemicFogBank[], targetX: number, targetZ: number) => void;
}

export const CLOUD_COUNT = 5;

/**
 * Cloud anchors in sky-root local space (the root re-anchors to the camera
 * target, so these ride the frame's far edge under pan).
 */
const CLOUDS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [-85, 22, -85, 46, 16],
  [-130, 30, -55, 38, 13],
  [-55, 26, -135, 42, 14],
  [-160, 34, -100, 52, 17],
  [-95, 20, -150, 34, 11],
];

/**
 * Authored per-instance seeds (no RNG anywhere near the frame path).
 *
 * One per mist bank and then some: seeds are handed out modulo this list, so a
 * list shorter than the layer would give two banks the same drift phase, and a
 * matched pair sliding in lockstep is exactly the kind of repetition that reads
 * as tiling rather than as weather.
 */
const SEEDS = [0.13, 0.41, 0.62, 0.87, 0.29, 0.07, 0.53, 0.71, 0.95];

// Sin-free hash/value noise, same family as the water shader's (its S4 note:
// the classic fract(sin) hash is unstable on some GPUs). The breakup is
// static in cloud space — the drift supplies all the motion.
const NOISE_GLSL = /* glsl */ `
  float bbHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float bbNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(bbHash(i), bbHash(i + vec2(1.0, 0.0)), u.x),
      mix(bbHash(i + vec2(0.0, 1.0)), bbHash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
`;

const VERTEX_SHADER = /* glsl */ `
  attribute vec3 aAnchor;
  attribute vec2 aScale;
  attribute float aSeed;
  uniform float uTime;
  uniform vec2 uWindDir;
  uniform float uWindSpeed;
  uniform float uDriftSpeed;
  uniform float uDriftSpan;
  varying vec2 vUv;
  varying float vSeed;
  varying float vFade;
  varying vec3 vWorldPosition;
  void main() {
    vUv = uv;
    vSeed = aSeed;
    float travel = mod(
      aSeed * uDriftSpan + uTime * uDriftSpeed * (0.4 + uWindSpeed * 0.6),
      uDriftSpan
    );
    vFade = sin(3.14159265 * (travel / uDriftSpan));
    vec3 center = aAnchor;
    center.xz += uWindDir * (travel - uDriftSpan * 0.5);
    vec3 worldCenter = (modelMatrix * vec4(center, 1.0)).xyz;
    vec3 facing = normalize(cameraPosition - worldCenter);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), facing));
    vec3 up = cross(facing, right);
    vec3 offset = right * (position.x * aScale.x) + up * (position.y * aScale.y);
    vWorldPosition = worldCenter + offset;
    gl_Position = projectionMatrix * viewMatrix * vec4(worldCenter + offset, 1.0);
  }
`;

const MIST_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uLocal;
  varying vec2 vUv;
  varying float vSeed;
  varying float vFade;
  varying vec3 vWorldPosition;
  ${NOISE_GLSL}
  void main() {
    vec2 p = vUv - 0.5;
    float radial = (1.0 - smoothstep(0.08, 0.5, length(p * vec2(1.0, 2.1))));
    float breakup = bbNoise(vUv * vec2(5.0, 3.0) + vSeed * 17.0) * 0.65
      + bbNoise(vUv * vec2(11.0, 7.0) + vSeed * 29.0) * 0.35;
    float alpha = radial * smoothstep(0.25, 0.75, breakup + radial * 0.4)
      * uOpacity * vFade * mix(smoothstep(60.0, 100.0, distance(cameraPosition, vWorldPosition)), 1.0, uLocal);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

const CLOUD_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uBodyColor;
  uniform vec3 uShadeColor;
  uniform vec3 uLitColor;
  uniform vec2 uSunQuadDir;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vSeed;
  varying float vFade;
  ${NOISE_GLSL}
  void main() {
    vec2 p = vUv - 0.5;
    float s1 = bbHash(vec2(vSeed, 1.0)) - 0.5;
    float s2 = bbHash(vec2(vSeed, 2.0)) - 0.5;
    float field = (1.0 - smoothstep(0.02, 0.30, length(p - vec2(s1 * 0.2, -0.04))))
      + (1.0 - smoothstep(0.02, 0.24, length(p - vec2(0.18 + s2 * 0.1, 0.06))))
      + (1.0 - smoothstep(0.02, 0.22, length(p - vec2(-0.2 + s1 * 0.1, 0.05))));
    float breakup = bbNoise(vUv * 4.5 + vSeed * 13.0) * 0.6
      + bbNoise(vUv * 9.0 + vSeed * 31.0) * 0.4;
    float shape = smoothstep(0.42, 0.8, field * (0.7 + breakup * 0.6));
    shape *= smoothstep(-0.16, -0.06, p.y + breakup * 0.05);
    if (shape < 0.004) discard;
    float lit = pow(max(dot(normalize(p + vec2(1e-4)), uSunQuadDir), 0.0), 2.0);
    float rim = 1.0 - smoothstep(0.35, 0.9, field);
    vec3 color = mix(uShadeColor, uBodyColor, smoothstep(-0.1, 0.25, p.y));
    color += uLitColor * lit * rim * shape * 0.85;
    float alpha = shape * uOpacity * vFade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

function createLayer(
  name: string,
  anchors: ReadonlyArray<readonly [number, number, number, number, number]>,
  fragmentShader: string,
  uniforms: ShaderMaterial["uniforms"],
  blending: ShaderMaterial["blending"],
  driftSpeed: number,
  driftSpan: number,
  vertexShader = VERTEX_SHADER,
): GardenSkyBillboardLayer {
  const geometry = new PlaneGeometry(1, 1);
  const count = anchors.length;
  const anchorData = new Float32Array(count * 3);
  const scaleData = new Float32Array(count * 2);
  const seedData = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const [x, y, z, width, height] = anchors[i]!;
    anchorData[i * 3] = x;
    anchorData[i * 3 + 1] = y;
    anchorData[i * 3 + 2] = z;
    scaleData[i * 2] = width;
    scaleData[i * 2 + 1] = height;
    seedData[i] = SEEDS[i % SEEDS.length]!;
  }
  geometry.setAttribute("aAnchor", new InstancedBufferAttribute(anchorData, 3));
  geometry.setAttribute("aScale", new InstancedBufferAttribute(scaleData, 2));
  geometry.setAttribute("aSeed", new InstancedBufferAttribute(seedData, 1));
  const material = new ShaderMaterial({
    blending,
    depthWrite: false,
    fog: false,
    fragmentShader,
    transparent: true,
    uniforms: {
      uDriftSpeed: { value: driftSpeed },
      uDriftSpan: { value: driftSpan },
      uTime: { value: 0 },
      uWindDir: { value: { x: -0.855, y: 0.519 } },
      uWindSpeed: { value: 0.3 },
      ...uniforms,
    },
    vertexShader,
  });
  // The shader places instances from attributes; the per-instance matrix is
  // deliberately unused (left at identity).
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return { material, mesh };
}

export function createGardenSkyBillboards(): GardenSkyBillboards {
  // Clouds: alpha-blended and slower, lit per frame from the phase palette.
  const clouds = createLayer(
    "garden-sky-clouds",
    CLOUDS,
    CLOUD_FRAGMENT_SHADER,
    {
      uBodyColor: { value: null },
      uShadeColor: { value: null },
      uLitColor: { value: null },
      uSunQuadDir: { value: { x: 0, y: 1 } },
      uOpacity: { value: 0 },
    },
    NormalBlending,
    0.9,
    64,
  );
  // Bounded banks use world anchors, never the sky's camera-following anchors.
  const localMist = createLayer(
    "garden-source-fog",
    Array.from({ length: 64 }, () => [0, 0.7, 0, 1, 1] as const),
    MIST_FRAGMENT_SHADER,
    { uColor: { value: null }, uOpacity: { value: 0.32 }, uLocal: { value: 1 } },
    NormalBlending, 0, 1,
    VERTEX_SHADER.replace("attribute float aSeed;", "attribute float aSeed;\nattribute float aStrength;")
      .replace("vFade = sin(3.14159265 * (travel / uDriftSpan));", "vFade = aStrength;")
      .replace("center.xz += uWindDir * (travel - uDriftSpan * 0.5);", ""),
  );
  localMist.mesh.geometry.setAttribute("aStrength", new InstancedBufferAttribute(new Float32Array(64), 1));
  localMist.mesh.count = 0;
  return {
    clouds,
    localMist,
    setFogBanks(banks, targetX, targetZ) {
      const anchors = localMist.mesh.geometry.getAttribute("aAnchor") as InstancedBufferAttribute;
      const scales = localMist.mesh.geometry.getAttribute("aScale") as InstancedBufferAttribute;
      const strengths = localMist.mesh.geometry.getAttribute("aStrength") as InstancedBufferAttribute;
      localMist.mesh.count = Math.min(64, banks.length);
      for (let i = 0; i < localMist.mesh.count; i += 1) {
        const bank = banks[i]!;
        anchors.setXYZ(i, bank.centre.x - targetX - bank.radius * (1 - bank.arrival), 0.7, bank.centre.z - targetZ);
        scales.setXY(i, bank.radius * 2, bank.radius * 0.55);
        strengths.setX(i, bank.strength);
      }
      anchors.needsUpdate = scales.needsUpdate = strengths.needsUpdate = true;
    },
    dispose() {
      clouds.mesh.geometry.dispose();
      clouds.material.dispose();
      localMist.mesh.geometry.dispose();
      localMist.material.dispose();
    },
  };
}
