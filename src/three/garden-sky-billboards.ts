import {
  AdditiveBlending,
  InstancedBufferAttribute,
  InstancedMesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
} from "three";

/**
 * Phase 2 (Breathtaking Rendering, items 2d/6): drifting billboard mist banks
 * and one layer of billboard cumulus — the VISIBLE half of the atmosphere
 * work.
 *
 * Why billboards carry the visible sky here: the locked isometric ortho
 * camera looks 30° down at a full-bleed water plane, so the sky DOME is never
 * on screen (it feeds the PMREM probe; see garden-environment). The visible
 * "sky" is the upper-frame haze zone where far water dissolves into the fog —
 * which is exactly where these billboards live, re-anchored to the camera
 * target every frame by garden-sky's root.
 *
 * Contracts kept:
 * - ONE InstancedMesh and ONE draw call per system; per-instance state is
 *   attributes, drift is a pure function of the world clock in the vertex
 *   shader. No per-frame CPU writes, no per-frame allocation.
 * - Determinism: positions, sizes and seeds are authored constants below;
 *   drift wraps over a fixed span with a sine edge fade so a bank never pops.
 *   Reduced motion pins uTime to 0 and the whole layer freezes into the
 *   static composition.
 * - Sea-first negative space: every anchor sits in the far quadrant (both
 *   local axes ≤ -40), so nothing ever drifts over the island. The horizon
 *   below the fog line stays geometry-free — clouds float in the haze zone
 *   above it, which is sky content, not silhouette.
 * - Palette authority: these meshes carry NO colour constants. Body, shade,
 *   lit-edge and haze colours are all derived per frame from the day-cycle
 *   presets by garden-sky and handed in as uniforms.
 * - W5.7 borrowed scenery is decorative only: one asymmetric, connected
 *   headland profile and one unexplained lantern point. Neither has, nor may
 *   acquire, a data input. The profile is static so it recedes with the haze
 *   instead of behaving like another drifting cloud impostor.
 */

export interface GardenSkyBillboardLayer {
  material: ShaderMaterial;
  mesh: InstancedMesh;
}

export interface GardenSkyBillboards {
  clouds: GardenSkyBillboardLayer;
  dispose: () => void;
  geese: GardenSkyBillboardLayer;
  headlands: GardenSkyBillboardLayer;
  mist: GardenSkyBillboardLayer;
}

export const MIST_BANK_COUNT = 9;
export const CLOUD_COUNT = 5;
export const HEADLAND_COUNT = 1;
export const GARDEN_AUTUMN_GEESE_COUNT = 7;

/**
 * Anchors in sky-root local space (the root re-anchors to the camera target,
 * so these ride the frame's far edge under pan). The camera looks toward
 * -X/-Z, so the far sea lanes are the negative quadrant; the island sits
 * within ±20 of the origin and nothing here comes near it.
 *
 * Screen check (whole-map zoom 0.28, half-height ~107; mid zoom 0.53, ~57):
 * a point's frame-top coordinate is `-0.3536(x+z) + 0.866y` over the
 * half-height — the mist banks land at ndc ~0.5–0.95 at mid zoom, the clouds
 * fill the same band at whole-map zoom and drift in and out at its top edge.
 *
 * Nine banks, not four, and layered in DEPTH rather than clustered.
 *
 * With the fog repaired (garden-sky.ts, 2026-08-13 — the reference view height
 * had switched aerial perspective off entirely), the far third of the frame
 * finally grades into haze, and mist reads against it instead of floating on
 * flat water. Four banks in one pocket of the negative quadrant were all the
 * old flat far-field could carry; against a real gradient there is room for
 * layers.
 *
 * A point's height up the frame goes as `-0.3536(x + z) + 0.866y`, so the sum
 * of x and z is the depth axis and their difference spreads laterally. The
 * banks below are sorted by that sum into three distinct shelves — near (~42),
 * middle (~46–55) and far (~76–99) — with the largest and highest kept
 * furthest away. Overlapping shelves at different scales is what turns haze
 * into distance rather than into a wash: the eye reads the near bank against
 * the far one and infers the space between them.
 *
 * Every anchor stays at or beyond -40 on BOTH axes, which is not a stylistic
 * preference: banks drift +/- half their span (21 units) along the wind, so -40
 * is what keeps the nearest one clear of an island that occupies +/-20 of the
 * origin. Two of the near-shelf banks were first authored at -35 and the sky
 * test caught them.
 */
const MIST_BANKS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  // x, y, z, width, height  — near shelf
  [-60, 2.0, -60, 30, 4.2],
  [-90, 2.2, -42, 40, 5.0],
  [-42, 3.4, -90, 44, 6.5],
  // middle shelf
  [-72, 3.0, -72, 46, 7.5],
  [-110, 4.0, -40, 38, 6],
  [-40, 2.5, -115, 34, 5.5],
  // far shelf
  [-130, 4.5, -85, 54, 8],
  [-115, 3.8, -160, 50, 7],
  [-150, 5.0, -130, 62, 9],
];

const CLOUDS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [-85, 22, -85, 46, 16],
  [-130, 30, -55, 38, 13],
  [-55, 26, -135, 42, 14],
  [-160, 34, -100, 52, 17],
  [-95, 20, -150, 34, 11],
];

/**
 * W5.7 shakkei. One profile only: the lighthouse already weights the left of
 * the frame, so this sits on the opposite, upper-right diagonal. Its broad
 * base continues below the haze line; only the feathered ridge is perceived,
 * which is the key distinction from the retired closed cumulus "pills".
 */
const HEADLANDS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [-105, 3.5, -155, 78, 15],
];

/** One asymmetrical travelling line, high in the borrowed sky. */
const AUTUMN_GEESE: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [-86, 27.5, -116, 3.4, 1.3],
  [-91, 29.0, -120, 3.1, 1.2],
  [-96, 30.2, -124, 2.9, 1.15],
  [-101, 31.1, -128, 2.7, 1.05],
  [-106, 31.7, -132, 2.5, 1.0],
  [-111, 32.0, -136, 2.3, 0.92],
  [-116, 32.1, -140, 2.1, 0.86],
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
    vec3 offset = vec3(0.7071, 0.0, -0.7071) * (position.x * aScale.x)
      + vec3(0.0, 1.0, 0.0) * (position.y * aScale.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(center + offset, 1.0);
  }
`;

const STATIC_VERTEX_SHADER = /* glsl */ `
  attribute vec3 aAnchor;
  attribute vec2 aScale;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 offset = vec3(0.7071, 0.0, -0.7071) * (position.x * aScale.x)
      + vec3(0.0, 1.0, 0.0) * (position.y * aScale.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(aAnchor + offset, 1.0);
  }
`;

const MIST_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vSeed;
  varying float vFade;
  ${NOISE_GLSL}
  void main() {
    vec2 p = vUv - 0.5;
    float radial = smoothstep(0.5, 0.08, length(p * vec2(1.0, 2.1)));
    float breakup = bbNoise(vUv * vec2(5.0, 3.0) + vSeed * 17.0) * 0.65
      + bbNoise(vUv * vec2(11.0, 7.0) + vSeed * 29.0) * 0.35;
    float alpha = radial * smoothstep(0.25, 0.75, breakup + radial * 0.4)
      * uOpacity * vFade;
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
    float field = smoothstep(0.30, 0.02, length(p - vec2(s1 * 0.2, -0.04)))
      + smoothstep(0.24, 0.02, length(p - vec2(0.18 + s2 * 0.1, 0.06)))
      + smoothstep(0.22, 0.02, length(p - vec2(-0.2 + s1 * 0.1, 0.05)));
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

const HEADLAND_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uLanternColor;
  uniform float uLanternOpacity;
  uniform float uOpacity;
  varying vec2 vUv;
  ${NOISE_GLSL}
  void main() {
    float x = vUv.x;
    float mainRise = exp(-pow((x - 0.64) / 0.24, 2.0)) * 0.20;
    float shoulder = exp(-pow((x - 0.24) / 0.17, 2.0)) * 0.085;
    float grain = (bbNoise(vec2(x * 7.0, 0.37)) - 0.5) * 0.025;
    float ridge = 0.28 + mainRise + shoulder + grain;
    float belowRidge = smoothstep(ridge + 0.045, ridge - 0.055, vUv.y);
    float baseFade = smoothstep(0.015, 0.23, vUv.y);
    float sideFade = smoothstep(0.0, 0.13, x) * (1.0 - smoothstep(0.82, 1.0, x));
    float landAlpha = belowRidge * baseFade * sideFade * uOpacity;

    vec2 lanternDelta = vUv - vec2(0.69, 0.474);
    float lanternDistance = length(vec2(lanternDelta.x, lanternDelta.y * 0.2));
    float pixel = max(fwidth(vUv.x), 0.0015);
    float lantern = 1.0 - smoothstep(pixel * 0.55, pixel * 1.65, lanternDistance);
    lantern *= uLanternOpacity;

    float alpha = max(landAlpha, lantern);
    if (alpha < 0.003) discard;
    vec3 color = mix(uColor, uLanternColor, lantern);
    gl_FragColor = vec4(color, alpha);
  }
`;

const GEESE_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float wing = abs(abs(p.x) * 0.48 - (p.y + 0.12));
    float span = 1.0 - smoothstep(0.78, 0.98, abs(p.x));
    float stroke = 1.0 - smoothstep(0.07, 0.16, wing);
    float alpha = stroke * span * uOpacity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor, alpha);
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
  // Mist: additive, low and slow, coloured per frame from the fog presets.
  const mist = createLayer(
    "garden-sky-mist-banks",
    MIST_BANKS,
    MIST_FRAGMENT_SHADER,
    {
      uColor: { value: null },
      uOpacity: { value: 0 },
    },
    AdditiveBlending,
    0.55,
    42,
  );
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
  // Borrowed horizon: one static, normal-blended draw. Its colour, presence,
  // and lantern phase are all supplied by garden-sky from existing tokens.
  const headlands = createLayer(
    "garden-sky-borrowed-headlands",
    HEADLANDS,
    HEADLAND_FRAGMENT_SHADER,
    {
      uColor: { value: null },
      uLanternColor: { value: null },
      uLanternOpacity: { value: 0 },
      uOpacity: { value: 0 },
    },
    NormalBlending,
    0,
    1,
    STATIC_VERTEX_SHADER,
  );
  const geese = createLayer(
    "garden-sky-autumn-geese",
    AUTUMN_GEESE,
    GEESE_FRAGMENT_SHADER,
    {
      uColor: { value: null },
      uOpacity: { value: 0 },
    },
    NormalBlending,
    0,
    1,
    STATIC_VERTEX_SHADER,
  );
  return {
    clouds,
    geese,
    headlands,
    mist,
    dispose() {
      mist.mesh.geometry.dispose();
      mist.material.dispose();
      clouds.mesh.geometry.dispose();
      clouds.material.dispose();
      geese.mesh.geometry.dispose();
      geese.material.dispose();
      headlands.mesh.geometry.dispose();
      headlands.material.dispose();
    },
  };
}
