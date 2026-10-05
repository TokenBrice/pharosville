import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Object3D,
  ShaderMaterial,
} from "three";
import { HARBOR_PALETTE, oklchToHex } from "../systems/palette";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import { stableUnit, TILE_SCALE } from "./garden-util";

export const GARDEN_KOI_COUNT = 4;
export const GARDEN_KOI_DISPLACEMENT = "island-reflection-basin koi";
export const GARDEN_KOI_TRAVEL_SECONDS_RANGE = [24, 42] as const;
export const GARDEN_ENGAWA_KOI_TILE = { x: 63, y: 127 } as const;
export const GARDEN_ENGAWA_KOI_WORLD = {
  x: GARDEN_ENGAWA_KOI_TILE.x * TILE_SCALE,
  y: GARDEN_WATER_Y + 0.025,
  z: GARDEN_ENGAWA_KOI_TILE.y * TILE_SCALE,
} as const;

interface KoiLeg {
  x: number;
  z: number;
  nextX: number;
  nextZ: number;
  heading: number;
  turn: number;
  travelSeconds: number;
  pauseSeconds: number;
  turnSeconds: number;
  endSeconds: number;
}

const KOI_PLAN = [
  { depth: 0.045, scale: 1.82 },
  { depth: 0.075, scale: 1.48 },
  { depth: 0.1, scale: 1.64 },
  { depth: 0.065, scale: 1.42 },
] as const;

// Bake the seeded itinerary once. The convex habitat stays inside the whole-fish
// clearance ellipse, biased to the near (+z), tea-side (+x) bank.
const KOI_ROUTES: readonly (readonly KoiLeg[])[] = KOI_PLAN.map((_, fish) => {
  const points = Array.from({ length: 16 }, (_, station) => {
    const angle = stableUnit(`koi.${fish}.${station}.bearing`) * Math.PI * 2;
    const reach = 0.4 + stableUnit(`koi.${fish}.${station}.reach`) * 0.6;
    return { x: 0.25 + Math.cos(angle) * 1.75 * reach, z: 0.3 + Math.sin(angle) * 0.65 * reach };
  });
  let endSeconds = 0;
  return points.map((point, station) => {
    const next = points[(station + 1) % points.length]!;
    const after = points[(station + 2) % points.length]!;
    const heading = Math.atan2(point.z - next.z, next.x - point.x);
    const nextHeading = Math.atan2(next.z - after.z, after.x - next.x);
    const turn = Math.atan2(Math.sin(nextHeading - heading), Math.cos(nextHeading - heading));
    const travelSeconds = GARDEN_KOI_TRAVEL_SECONDS_RANGE[0]
      + stableUnit(`koi.${fish}.${station}.travel`) * (GARDEN_KOI_TRAVEL_SECONDS_RANGE[1] - GARDEN_KOI_TRAVEL_SECONDS_RANGE[0]);
    const pauseSeconds = 5 + stableUnit(`koi.${fish}.${station}.pause`) * 9;
    const turnSeconds = 3 + stableUnit(`koi.${fish}.${station}.turn`) * 4;
    endSeconds += travelSeconds + pauseSeconds + turnSeconds;
    return { ...point, nextX: next.x, nextZ: next.z, heading, turn, travelSeconds, pauseSeconds, turnSeconds, endSeconds };
  });
});

export type GardenKoiState = "travel" | "pause" | "turn";

export interface GardenKoiSample {
  depth: number;
  heading: number;
  scale: number;
  state: GardenKoiState;
  x: number;
  z: number;
}

export interface GardenKoiFrame {
  daylight: number;
  night: number;
  reducedMotion: boolean;
  timeSeconds: number;
}

export interface GardenKoi {
  mesh: InstancedMesh<BufferGeometry, ShaderMaterial>;
  update(frame: GardenKoiFrame): void;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

/**
 * Pond-local seeded travel, still-water pauses and in-place turns. Sampling is
 * independent of frame history, so hidden resume never catches up missed legs.
 * Reduced motion holds the entire deliberate time-zero pose, including heading.
 */
export function sampleGardenKoi(
  index: number,
  timeSeconds: number,
  reducedMotion = false,
  target: GardenKoiSample = { depth: 0, heading: 0, scale: 1, state: "travel", x: 0, z: 0 },
): GardenKoiSample {
  const fish = ((Math.trunc(index) % GARDEN_KOI_COUNT) + GARDEN_KOI_COUNT) % GARDEN_KOI_COUNT;
  const plan = KOI_PLAN[fish]!;
  const route = KOI_ROUTES[fish]!;
  const time = reducedMotion || !Number.isFinite(timeSeconds) ? 0 : Math.max(0, timeSeconds);
  const local = (time + fish * 17) % route[route.length - 1]!.endSeconds;
  let startSeconds = 0;
  let leg = route[0]!;
  for (const candidate of route) {
    leg = candidate;
    if (local < candidate.endSeconds) break;
    startSeconds = candidate.endSeconds;
  }
  const age = local - startSeconds;
  const travel = smoothstep01(age / leg.travelSeconds);
  target.depth = plan.depth;
  target.scale = plan.scale;
  target.x = leg.x + (leg.nextX - leg.x) * travel;
  target.z = leg.z + (leg.nextZ - leg.z) * travel;
  const turnAge = age - leg.travelSeconds - leg.pauseSeconds;
  target.heading = leg.heading + leg.turn * smoothstep01(turnAge / leg.turnSeconds);
  target.state = age < leg.travelSeconds ? "travel" : turnAge < 0 ? "pause" : "turn";
  return target;
}

/** A tiny lens body plus forked tail, painted in one instanced shader draw. */
function createKoiGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions: number[] = [];
  const whiteMark: number[] = [];
  const shade: number[] = [];
  const indices: number[] = [];
  // The spine catches the light, the flanks and fins fall off: a rounded body.
  const vertex = (x: number, z: number, mark: number, y = 0): number => {
    const index = positions.length / 3;
    positions.push(x, y, z);
    whiteMark.push(mark);
    shade.push(1 - Math.min(1, Math.max(Math.abs(z) / 0.22, y < 0 ? -y / 0.07 : 0)) * 0.38);
    return index;
  };
  const centre = vertex(0.08, 0, 1);
  const nose = vertex(0.62, 0, 0);
  const upper = vertex(0.03, 0, 0.2);
  const tail = vertex(-0.43, 0, 0);
  const lower = vertex(0.03, 0, -0.2);
  indices.push(centre, nose, upper, centre, upper, tail, centre, tail, lower, centre, lower, nose);
  const fork = vertex(-0.76, 0, 0);
  const tailUpper = vertex(-0.42, 0, 0.22);
  const tailLower = vertex(-0.42, 0, -0.22);
  indices.push(tail, tailUpper, fork, tail, fork, tailLower);
  // X5: the body's side profile. From the rest seat the pond is seen at a
  // few degrees above grazing, where a flat top-view fish is edge-on and
  // vanishes; the profile gives each koi a sliver of colour that reads there.
  const sideNose = vertex(0.62, 0, 0, 0.005);
  const sideBack = vertex(0.06, 0, 1, 0.075);
  const sideTail = vertex(-0.43, 0, 0, 0.012);
  const sideBelly = vertex(0.06, 0, 0, -0.065);
  indices.push(sideNose, sideBack, sideTail, sideNose, sideTail, sideBelly);
  const sideFork = vertex(-0.76, 0, 0, 0.012);
  const finUpper = vertex(-0.44, 0, 0, 0.06);
  const finLower = vertex(-0.44, 0, 0, -0.04);
  indices.push(sideTail, finUpper, sideFork, sideTail, sideFork, finLower);
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aWhiteMark", new Float32BufferAttribute(whiteMark, 1));
  geometry.setAttribute("aBodyShade", new Float32BufferAttribute(shade, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * X5 (life-6): the koi are seen THROUGH the water, not under an opaque skin.
 * They draw after the pond's translucent skin (which used to wash 82 % over
 * them, so no fish was ever visible), blended toward the water's tint by
 * depth and by the view's Fresnel term — at the rest seat's grazing angle the
 * surface reflects more and the fish show less, as real water does — and lit
 * by the day's key (`uLight`), so they are shaded bodies, not stickers.
 */
function createKoiMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    depthWrite: false,
    // The fish swim a few centimetres over the basin floor; at the rest
    // distance that is inside the depth buffer's precision, so they are pulled
    // toward the eye rather than lost in the floor.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -8,
    side: DoubleSide,
    transparent: true,
    uniforms: {
      uLight: { value: 1 },
      uVisibility: { value: 0.88 },
      uWaterTint: { value: new Color("#244c4f") },
      uWhite: { value: new Color(HARBOR_PALETTE.foam_white) },
    },
    vertexShader: /* glsl */ `
      attribute float aFishAccent;
      attribute vec3 aFishColor;
      attribute float aFishDepthFade;
      attribute float aWhiteMark;
      attribute float aBodyShade;
      uniform vec3 uWhite;
      varying vec3 vColor;
      varying float vClarity;
      void main() {
        vColor = mix(aFishColor, uWhite, aWhiteMark * aFishAccent) * aBodyShade;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        // Fresnel against the pond's (world-up) surface: grazing views see sky.
        vec3 surfaceNormal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
        float facing = abs(dot(normalize(-mvPosition.xyz), surfaceNormal));
        float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
        vClarity = aFishDepthFade * (1.0 - 0.65 * fresnel);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uLight;
      uniform float uVisibility;
      uniform vec3 uWaterTint;
      varying vec3 vColor;
      varying float vClarity;
      void main() {
        vec3 fish = mix(uWaterTint, vColor, 0.35 + 0.55 * vClarity) * uLight;
        gl_FragColor = vec4(fish, uVisibility * clamp(vClarity * 1.25, 0.0, 1.0));
      }
    `,
  });
}

function readWaterFrame(scene: Object3D, target: GardenKoiFrame): boolean {
  const water = scene.getObjectByName("garden-water") as { material?: ShaderMaterial } | undefined;
  const uniforms = water?.material?.uniforms;
  if (!uniforms?.uTime || !uniforms.uNight) return false;
  target.timeSeconds = Number(uniforms.uTime.value) || 0;
  target.daylight = Number(uniforms.uDaylight?.value) || 0;
  target.night = Number(uniforms.uNight.value) || 0;
  // Water pins the shared canonical clock to zero under reduced motion.
  target.reducedMotion = target.timeSeconds === 0;
  return true;
}

/** Four subdued inhabitants of the pond's near-bank habitat, in one draw. */
export function createGardenKoi(): GardenKoi {
  const geometry = createKoiGeometry();
  const material = createKoiMaterial();
  const mesh = new InstancedMesh(geometry, material, GARDEN_KOI_COUNT);
  mesh.name = "island-koi";
  mesh.frustumCulled = false;
  // After the pond skin (5): the fish are drawn through the water, not under it.
  mesh.renderOrder = 6;
  // Basin-local coordinates: the parent basin group already sits at the pond
  // centre with its yaw, so samples must not add the centre a second time.

  const colors = new Float32Array(GARDEN_KOI_COUNT * 3);
  const accent = new Float32Array(GARDEN_KOI_COUNT);
  const depthFade = new Float32Array(GARDEN_KOI_COUNT);
  // Kohaku persimmon, yamabuki gold, a pale platinum and a dark karasu: under
  // the hand's C 0.12 rule (vermillion is the beacon's and danger water's).
  const koiColours = [
    new Color(oklchToHex({ c: 0.12, h: 48, l: 0.66 })),
    new Color(oklchToHex({ c: 0.1, h: 84, l: 0.8 })),
    new Color(oklchToHex({ c: 0.02, h: 90, l: 0.9 })),
    new Color(oklchToHex({ c: 0.02, h: 60, l: 0.34 })),
  ];
  for (let index = 0; index < GARDEN_KOI_COUNT; index += 1) {
    koiColours[index % koiColours.length]!.toArray(colors, index * 3);
    accent[index] = index === 0 ? 1 : 0;
    depthFade[index] = 1 - KOI_PLAN[index]!.depth * 2.2;
  }
  geometry.setAttribute("aFishColor", new InstancedBufferAttribute(colors, 3));
  geometry.setAttribute("aFishAccent", new InstancedBufferAttribute(accent, 1));
  geometry.setAttribute("aFishDepthFade", new InstancedBufferAttribute(depthFade, 1));

  const dummy = new Object3D();
  const matrix = new Matrix4();
  const sample: GardenKoiSample = { depth: 0, heading: 0, scale: 1, state: "travel", x: 0, z: 0 };
  const waterFrame: GardenKoiFrame = { daylight: 1, night: 0, reducedMotion: true, timeSeconds: 0 };
  const update = (frame: GardenKoiFrame): void => {
    // Koi are a daylight glint only; the dusk water and night road keep the
    // shallows once daylight yields.
    material.uniforms.uVisibility!.value = 0.98
      * smoothstep01((frame.daylight - 0.08) / 0.42);
    material.uniforms.uLight!.value = 0.55 + 0.45 * clamp01(frame.daylight);
    for (let index = 0; index < GARDEN_KOI_COUNT; index += 1) {
      sampleGardenKoi(index, frame.timeSeconds, frame.reducedMotion, sample);
      // Shallow enough that the profile rides just under the skin, over the
      // basin floor (the pond root sits 0.08 above the terrain).
      dummy.position.set(sample.x, -0.018 - sample.depth * 0.25, sample.z);
      dummy.rotation.set(0, sample.heading, 0);
      dummy.scale.set(sample.scale, sample.scale, sample.scale);
      dummy.updateMatrix();
      matrix.copy(dummy.matrix);
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  update({ daylight: 1, night: 0, reducedMotion: true, timeSeconds: 0 });

  // Read the canonical water clock immediately before drawing, without allocating.
  mesh.onBeforeRender = (_renderer, scene) => {
    if (readWaterFrame(scene, waterFrame)) update(waterFrame);
  };
  return { mesh, update };
}
