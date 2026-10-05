import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  ShaderMaterial,
  Vector2,
} from "three";
import type { PharosVilleRenderSchedulerTier } from "../renderer/render-types";
import { HARBOR_PALETTE } from "../systems/palette";
import { farShoreRangeVisibility } from "../systems/psi-sky";
import { REST_SEAT_YAW_RAD } from "../systems/rest-seat";
import { dayCycleBeats, DAY_CYCLE_LIGHT_PRESETS } from "./garden-day-cycle";
import { GARDEN_AERIAL_GLSL_PARS, GARDEN_AIR, gardenAerialUniforms } from "./garden-aerial";

export interface GardenHorizonFrame {
  cameraPosition: { x: number; y: number; z: number };
  /** Displayed signed PSI clarity −1…+1 (garden-sky `signedClarity`). */
  clarity: number;
  tier: PharosVilleRenderSchedulerTier;
}

export interface GardenHorizon {
  drawCallCount: number;
  root: Group;
  silhouetteCount: number;
  triangleCount: number;
  dispose: () => void;
  update: (wallClockHour: number, frame: GardenHorizonFrame) => void;
}

/**
 * Shakkei: four sky ranges borrowed from beyond the harbour. The near
 * headland is fixed-world terrain in garden-rim-mesh, not a painted ridge.
 *
 * Authored in the rest seat's own frame: `left`/`right` are degrees from the
 * seat's view axis (positive right), `height` degrees above the horizon at
 * `depth` world units. The root follows the eye, so the ridges stand on the
 * true sea horizon with no parallax, like the dome.
 *
 * - The peak (right, pale, asymmetric, under 4°) is the composition's anchor
 *   beside the crown; it NEVER depends on PSI (K39).
 * - The far range, the western ridge and the eastern ridge carry market
 *   stability: the haze takes the far range first (psi-sky `FAR_SHORE_RANGES`).
 * - Opaque. Value = mix(ink, airlight, k) with the airlight ladder below, so
 *   each plane steps paler and cooler with distance; the feet dissolve into
 *   the same airlight the dome's lower hemisphere draws.
 * - The centre stays low (nothing above 1° inside ±9°): the sky gap behind the
 *   tower stays open at the seat.
 */
export const GARDEN_HORIZON_RIDGES = [
  // Peak: far right of the tower, pale; a steep inner flank, a long shoulder out.
  {
    name: "peak", depth: 500, left: 8.5, right: 27, height: 3.5, k: 0.88, psi: -1, roughness: 0.005,
    knots: [0, 0.08, 0.3, 0.64, 0.95, 1, 0.86, 0.66, 0.53, 0.47, 0.3, 0.12, 0],
  },
  // The far range: long and low on the left, the first to go when the market wavers.
  {
    name: "far-range", depth: 470, left: -28, right: -4, height: 1.6, k: 0.82, psi: 0, roughness: 0.01,
    knots: [0, 0.32, 0.55, 0.5, 0.72, 0.62, 0.84, 0.68, 0.5, 0.58, 0.3, 0.1, 0],
  },
  // The eastern ridge: overlaps the peak's outer foot, a step darker.
  {
    name: "eastern-ridge", depth: 380, left: 17, right: 33, height: 1.9, k: 0.68, psi: 2, roughness: 0.02,
    knots: [0, 0.35, 0.68, 0.6, 0.86, 1, 0.74, 0.52, 0.26, 0],
  },
  // The western ridge: over the far range's feet on the left.
  {
    name: "western-ridge", depth: 360, left: -27, right: -10, height: 2.4, k: 0.62, psi: 1, roughness: 0.025,
    knots: [0, 0.28, 0.6, 0.86, 1, 0.8, 0.56, 0.62, 0.38, 0.14, 0],
  },
] as const;

/** The airlight value ladder, far → near (the k of `mix(ink, air, k)`). */
export const GARDEN_HORIZON_VALUE_SCALES = GARDEN_HORIZON_RIDGES.map((ridge) => ridge.k);

/**
 * Three kasumi bands at the ridge feet (art-director-3, sky-3): scenery, high on
 * the horizon and below every crest — never low sea mist (K6).
 */
export const GARDEN_HORIZON_KASUMI = [
  { depth: 480, left: -30, right: -2, bottom: 0.12, top: 0.5 },
  { depth: 490, left: 5, right: 31, bottom: 0.18, top: 0.72 },
  { depth: 350, left: -29, right: -8, bottom: 0.08, top: 0.42 },
] as const;
const KASUMI_ALPHA = 0.55;
const KASUMI_SEGMENTS = 16;

const RIDGE_SAMPLES = 64;
/**
 * Feet sink this far below the horizon (still above the sea annulus's rim at the
 * seat); below −0.35° they are pure airlight, the same colour the dome's lower
 * hemisphere draws, so no ridge has a cut edge.
 */
const FOOT_DEPTH_DEG = 1.6;
const DEG = Math.PI / 180;

function catmullRom(knots: readonly number[], t: number): number {
  const scaled = t * (knots.length - 1);
  const i = Math.min(knots.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const p0 = knots[Math.max(0, i - 1)]!;
  const p1 = knots[i]!;
  const p2 = knots[i + 1]!;
  const p3 = knots[Math.min(knots.length - 1, i + 2)]!;
  return 0.5 * (
    2 * p1
    + (-p0 + p2) * f
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f
    + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f
  );
}

/** Deterministic 1-D value noise, −1…1. */
function valueNoise(x: number, seed: number): number {
  const hash = (n: number) => {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

function createGeometry(): BufferGeometry {
  const positions: number[] = [];
  const kinds: number[] = [];
  const verticals: number[] = [];
  const normals: number[] = [];
  const alongs: number[] = [];
  const indices: number[] = [];
  const forwardX = -Math.sin(REST_SEAT_YAW_RAD);
  const forwardZ = -Math.cos(REST_SEAT_YAW_RAD);
  const rightX = Math.cos(REST_SEAT_YAW_RAD);
  const rightZ = -Math.sin(REST_SEAT_YAW_RAD);
  const place = (depth: number, angleDeg: number, elevationDeg: number) => {
    const a = angleDeg * DEG;
    const x = depth * (forwardX * Math.cos(a) + rightX * Math.sin(a));
    const z = depth * (forwardZ * Math.cos(a) + rightZ * Math.sin(a));
    positions.push(x, depth * Math.tan(elevationDeg * DEG), z);
  };

  // Ridges, far to near, so the painter's order inside the one draw agrees
  // with depth.
  for (const [index, ridge] of GARDEN_HORIZON_RIDGES.entries()) {
    const samples = RIDGE_SAMPLES;
    const heights: number[] = [];
    const spanDeg = ridge.right - ridge.left;
    for (let s = 0; s <= samples; s += 1) {
      const t = s / samples;
      const base = Math.max(0, catmullRom(ridge.knots, t));
      const lateralUnits = t * spanDeg * DEG * ridge.depth;
      // Two octaves of 1-D noise × roughness, in degrees: far ridges smooth,
      // near ridges textured (detail as aerial perspective).
      const noise = valueNoise(lateralUnits / 9, index) + 0.5 * valueNoise(lateralUnits / 3.5, index + 7);
      const height = base * ridge.height + (base > 0.05 ? noise * ridge.roughness * 4 * ridge.height : 0);
      heights.push(Math.max(0, height));
    }
    for (let s = 0; s <= samples; s += 1) {
      const angle = ridge.left + (s / samples) * spanDeg;
      const previous = heights[Math.max(0, s - 1)]!;
      const next = heights[Math.min(samples, s + 1)]!;
      // Outward normal of the crest in (lateral, up), both in degrees.
      const dLateral = (Math.min(samples, s + 1) - Math.max(0, s - 1)) / samples * spanDeg;
      const dUp = next - previous;
      const length = Math.hypot(dUp, dLateral) || 1;
      const nx = -dUp / length;
      const ny = dLateral / length;
      place(ridge.depth, angle, -FOOT_DEPTH_DEG);
      place(ridge.depth, angle, heights[s]!);
      kinds.push(index, index);
      verticals.push(0, 1);
      normals.push(nx, ny, nx, ny);
      alongs.push(s / samples, s / samples);
      if (s === 0) continue;
      const a = positions.length / 3 - 4;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }

  // Kasumi last: blended over the ridges already drawn in this same call.
  for (const [band, kasumi] of GARDEN_HORIZON_KASUMI.entries()) {
    for (let s = 0; s <= KASUMI_SEGMENTS; s += 1) {
      const t = s / KASUMI_SEGMENTS;
      const angle = kasumi.left + t * (kasumi.right - kasumi.left);
      place(kasumi.depth, angle, kasumi.bottom);
      place(kasumi.depth, angle, kasumi.top);
      kinds.push(GARDEN_HORIZON_RIDGES.length + band, GARDEN_HORIZON_RIDGES.length + band);
      verticals.push(0, 1);
      normals.push(0, 1, 0, 1);
      alongs.push(t, t);
      if (s === 0) continue;
      const a = positions.length / 3 - 4;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("aKind", new BufferAttribute(new Float32Array(kinds), 1));
  geometry.setAttribute("aVertical", new BufferAttribute(new Float32Array(verticals), 1));
  geometry.setAttribute("aNormal2", new BufferAttribute(new Float32Array(normals), 2));
  geometry.setAttribute("aAlong", new BufferAttribute(new Float32Array(alongs), 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

const RIDGE_COUNT = GARDEN_HORIZON_RIDGES.length;

function createMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    // Opaque ridges and feathered kasumi share one draw: the kasumi triangles
    // come last in the index buffer, so they blend over the ridges already
    // written. Depth-tested so every rim, ship and building stays in front.
    depthTest: true,
    depthWrite: true,
    fog: false,
    side: DoubleSide,
    transparent: true,
    uniforms: {
      ...gardenAerialUniforms,
      uRidgeK: { value: GARDEN_HORIZON_RIDGES.map((ridge) => ridge.k) },
      uInk: { value: new Color() },
      uSunColor: { value: new Color() },
      uSunScreen: { value: new Vector2(0, 1) },
      uRim: { value: 0 },
      uKasumi: { value: KASUMI_ALPHA },
    },
    vertexShader: /* glsl */ `
      attribute float aKind;
      attribute float aVertical;
      attribute vec2 aNormal2;
      attribute float aAlong;
      varying float vKind;
      varying float vVertical;
      varying vec2 vNormal2;
      varying float vAlong;
      varying vec3 vWorld;
      void main() {
        vKind = aKind;
        vVertical = aVertical;
        vNormal2 = aNormal2;
        vAlong = aAlong;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      ${GARDEN_AERIAL_GLSL_PARS}
      uniform float uRidgeK[${RIDGE_COUNT}];
      uniform vec3 uInk;
      uniform vec3 uSunColor;
      uniform vec2 uSunScreen;
      uniform float uRim;
      uniform float uKasumi;
      varying float vKind;
      varying float vVertical;
      varying vec2 vNormal2;
      varying float vAlong;
      varying vec3 vWorld;

      float gardenKasumiNoise(float x) {
        float i = floor(x);
        float f = fract(x);
        float a = fract(sin(i * 127.1) * 43758.5453);
        float b = fract(sin((i + 1.0) * 127.1) * 43758.5453);
        return mix(a, b, f * f * (3.0 - 2.0 * f));
      }

      void main() {
        vec3 dir = normalize(vWorld - cameraPosition);
        vec3 air = gardenAirlightBase(dir);
        if (vKind > ${RIDGE_COUNT}.0 - 0.5) {
          float ends = smoothstep(0.0, 0.2, vAlong) * (1.0 - smoothstep(0.8, 1.0, vAlong));
          float broken = 0.6 + 0.4 * gardenKasumiNoise(vAlong * 7.0 + vKind * 3.7);
          float feather = sin(3.14159265 * clamp(vVertical, 0.0, 1.0));
          float alpha = uKasumi * ends * broken * feather * feather;
          if (alpha < 0.004) discard;
          gl_FragColor = vec4(air * 1.06, alpha);
          return;
        }
        float k = uRidgeK[int(vKind + 0.5)];
        // The feet dissolve into the same air as the dome below the horizon.
        k = mix(1.0, k, smoothstep(-0.006, 0.008, dir.y));
        vec3 color = mix(uInk, air, k);
        // Crest a shade darker than the foot.
        color *= 1.0 - 0.05 * smoothstep(0.88, 1.0, vVertical);
        // Low sun: a hair of sun colour on the slopes that face it.
        float rim = max(dot(normalize(vNormal2), uSunScreen), 0.0)
          * smoothstep(0.82, 1.0, vVertical) * uRim;
        color += uSunColor * rim;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

// Per-beat ink: the palette's violet-grey mist at the value each hour prints.
const INK_BASE = new Color(HARBOR_PALETTE.fog_blue);
const INK_SCALE = { dawn: 0.8, day: 0.55, golden: 0.7, blue: 0.45, night: 0.22 } as const;
const BEAT_NAMES = ["dawn", "day", "golden", "blue", "night"] as const;

/**
 * Four borrowed sky ridges and three kasumi bands, one depth-tested
 * draw. Hidden on the constrained tier.
 */
export function createGardenHorizon(): GardenHorizon {
  const root = new Group();
  root.name = "garden-horizon";
  const geometry = createGeometry();
  const material = createMaterial();
  const mesh = new Mesh(geometry, material);
  mesh.name = "garden-horizon-shakkei";
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.raycast = () => {};
  root.add(mesh);
  const ridgeK = material.uniforms.uRidgeK.value as number[];
  const ink = material.uniforms.uInk.value as Color;
  const sunColor = material.uniforms.uSunColor.value as Color;
  const sunScreen = material.uniforms.uSunScreen.value as Vector2;
  const rightX = Math.cos(REST_SEAT_YAW_RAD);
  const rightZ = -Math.sin(REST_SEAT_YAW_RAD);
  let disposed = false;

  return {
    drawCallCount: 1,
    root,
    silhouetteCount: GARDEN_HORIZON_RIDGES.length,
    triangleCount: geometry.index!.count / 3,
    dispose() {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      material.dispose();
      root.clear();
    },
    update(wallClockHour, frame) {
      root.position.set(frame.cameraPosition.x, frame.cameraPosition.y, frame.cameraPosition.z);
      root.visible = frame.tier !== "constrained";
      const beats = dayCycleBeats(wallClockHour);
      let inkScale = 0;
      sunColor.setRGB(0, 0, 0);
      for (const beat of BEAT_NAMES) {
        inkScale += INK_SCALE[beat] * beats[beat];
        const key = DAY_CYCLE_LIGHT_PRESETS[beat].dirColor;
        sunColor.r += key.r * beats[beat];
        sunColor.g += key.g * beats[beat];
        sunColor.b += key.b * beats[beat];
      }
      ink.copy(INK_BASE).multiplyScalar(inkScale);
      // K39: the three PSI ranges fade into the air as clarity falls; clear air
      // also steps them a little nearer in value. The anchor peak holds.
      const clear = Math.max(frame.clarity, 0);
      for (const [index, ridge] of GARDEN_HORIZON_RIDGES.entries()) {
        if (ridge.psi < 0) {
          ridgeK[index] = ridge.k;
          continue;
        }
        const visibility = farShoreRangeVisibility(frame.clarity, ridge.psi);
        ridgeK[index] = 0.985 + (ridge.k - 0.06 * clear - 0.985) * visibility;
      }
      // Sun rim at low sun only (sky-3): the sun's side in the seat's frame.
      const sun = GARDEN_AIR.sunDir;
      sunScreen.set(sun.x * rightX + sun.z * rightZ, Math.max(sun.y, 0));
      if (sunScreen.lengthSq() < 1e-8) sunScreen.set(0, 1);
      else sunScreen.normalize();
      const elevation = Math.asin(Math.min(1, Math.max(-1, sun.y)));
      const low = 1 - Math.min(1, Math.max(0, (elevation - 0.05) / 0.25));
      const up = Math.min(1, Math.max(0, (elevation + 0.03) / 0.05));
      material.uniforms.uRim.value = 0.12 * low * low * (3 - 2 * low) * up;
    },
  };
}
