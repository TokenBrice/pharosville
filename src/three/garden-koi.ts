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
import { HARBOR_PALETTE } from "../systems/palette";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import { TILE_SCALE } from "./garden-util";

export const GARDEN_KOI_COUNT = 4;
export const GARDEN_KOI_DISPLACEMENT = "island-reflection-basin koi";
export const GARDEN_KOI_SWIM_RATE_RANGE = [0.026, 0.032] as const;
export const GARDEN_ENGAWA_KOI_TILE = { x: 63, y: 127 } as const;
export const GARDEN_ENGAWA_KOI_WORLD = {
  x: GARDEN_ENGAWA_KOI_TILE.x * TILE_SCALE,
  y: GARDEN_WATER_Y + 0.025,
  z: GARDEN_ENGAWA_KOI_TILE.y * TILE_SCALE,
} as const;

interface KoiPlan {
  depth: number;
  phase: number;
  scale: number;
  x: number;
  z: number;
}

const KOI_PLAN: readonly KoiPlan[] = [
  { depth: 0.045, phase: 0.4, scale: 1.82, x: -0.86, z: -0.18 },
  { depth: 0.075, phase: 2.1, scale: 1.48, x: 0.38, z: 0.36 },
  { depth: 0.1, phase: 4.4, scale: 1.64, x: 1.08, z: -0.25 },
  { depth: 0.065, phase: 5.7, scale: 1.42, x: -0.12, z: -0.48 },
];

export interface GardenKoiSample {
  depth: number;
  heading: number;
  scale: number;
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
 * A clock-pure, closed wandering spline. The very low frequencies keep the
 * four fish from circling like a tank display; reduced motion samples t=0 and
 * therefore holds a deliberately composed station.
 */
export function sampleGardenKoi(
  index: number,
  timeSeconds: number,
  reducedMotion = false,
): GardenKoiSample {
  const plan = KOI_PLAN[index % KOI_PLAN.length]!;
  const time = reducedMotion ? 0 : Math.max(0, timeSeconds);
  const primaryRate = GARDEN_KOI_SWIM_RATE_RANGE[0] + index * 0.002;
  const secondaryRate = 0.014 + index * 0.0015;
  const a = time * primaryRate + plan.phase;
  const b = time * secondaryRate + plan.phase * 1.73;
  const x = plan.x + Math.sin(a) * (0.2 + index * 0.025) + Math.sin(b) * 0.08;
  const z = plan.z + Math.cos(a * 0.82) * (0.11 + index * 0.014) + Math.sin(b * 1.19) * 0.06;
  const dx = Math.cos(a) * (0.2 + index * 0.025) * primaryRate
    + Math.cos(b) * 0.08 * secondaryRate;
  const dz = -Math.sin(a * 0.82) * (0.11 + index * 0.014) * primaryRate * 0.82
    + Math.cos(b * 1.19) * 0.06 * secondaryRate * 1.19;
  return {
    depth: plan.depth,
    heading: Math.atan2(-dz, dx),
    scale: plan.scale,
    x,
    z,
  };
}

/** A tiny lens body plus forked tail, painted in one instanced shader draw. */
function createKoiGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions: number[] = [];
  const whiteMark: number[] = [];
  const indices: number[] = [];
  const vertex = (x: number, z: number, mark: number): number => {
    const index = positions.length / 3;
    positions.push(x, 0, z);
    whiteMark.push(mark);
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
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aWhiteMark", new Float32BufferAttribute(whiteMark, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createKoiMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    depthWrite: false,
    side: DoubleSide,
    transparent: true,
    uniforms: {
      uVisibility: { value: 0.88 },
      uWaterTint: { value: new Color(HARBOR_PALETTE.shallow_teal_lit) },
      uWhite: { value: new Color(HARBOR_PALETTE.foam_white) },
    },
    vertexShader: /* glsl */ `
      attribute float aFishAccent;
      attribute vec3 aFishColor;
      attribute float aFishDepthFade;
      attribute float aWhiteMark;
      uniform vec3 uWaterTint;
      uniform vec3 uWhite;
      varying vec3 vColor;
      varying float vDepthFade;
      void main() {
        vec3 marked = mix(aFishColor, uWhite, aWhiteMark * aFishAccent);
        vColor = mix(uWaterTint, marked, 0.9);
        vDepthFade = aFishDepthFade;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uVisibility;
      varying vec3 vColor;
      varying float vDepthFade;
      void main() {
        gl_FragColor = vec4(vColor, uVisibility * vDepthFade);
      }
    `,
  });
}

function waterFrameFromScene(scene: Object3D): GardenKoiFrame | null {
  const water = scene.getObjectByName("garden-water") as { material?: ShaderMaterial } | undefined;
  const uniforms = water?.material?.uniforms;
  if (!uniforms?.uTime || !uniforms.uNight) return null;
  const timeSeconds = Number(uniforms.uTime.value) || 0;
  return {
    daylight: Number(uniforms.uDaylight?.value) || 0,
    night: Number(uniforms.uNight.value) || 0,
    // garden-water deliberately writes uTime=0 for reduced motion. Sharing
    // that already-authored clock avoids a second clock or renderer coupling.
    reducedMotion: timeSeconds === 0,
    timeSeconds,
  };
}

/**
 * Four precious glints in the calm shallows below the engawa. They carry no
 * meaning. Re-siting this existing draw displaces the reflection-basin koi so
 * the island's mirror stays an empty secondary read. One shu-vermilion-and-
 * white fish is the explicit koi exception to the reserved accent; the other
 * three are pale yamabuki.
 */
export function createGardenKoi(): GardenKoi {
  const geometry = createKoiGeometry();
  const material = createKoiMaterial();
  const mesh = new InstancedMesh(geometry, material, GARDEN_KOI_COUNT);
  mesh.name = "island-koi";
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  // The koi remain lifecycle-owned by the island pond group, but their draw is
  // deliberately world-locked in Calm Anchorage. This avoids a second koi
  // mesh or a world-renderer timer while leaving the basin itself empty.
  mesh.matrixAutoUpdate = false;
  mesh.matrixWorldAutoUpdate = false;
  mesh.matrixWorld.makeTranslation(
    GARDEN_ENGAWA_KOI_WORLD.x,
    GARDEN_ENGAWA_KOI_WORLD.y,
    GARDEN_ENGAWA_KOI_WORLD.z,
  );

  const colors = new Float32Array(GARDEN_KOI_COUNT * 3);
  const accent = new Float32Array(GARDEN_KOI_COUNT);
  const depthFade = new Float32Array(GARDEN_KOI_COUNT);
  const vermilion = new Color(HARBOR_PALETTE.vermillion)
    .lerp(new Color(HARBOR_PALETTE.lantern_warm), 0.18);
  const paleGold = new Color(HARBOR_PALETTE.lantern_warm)
    .lerp(new Color(HARBOR_PALETTE.foam_white), 0.14);
  for (let index = 0; index < GARDEN_KOI_COUNT; index += 1) {
    const color = index === 0 ? vermilion : paleGold;
    color.toArray(colors, index * 3);
    accent[index] = index === 0 ? 1 : 0;
    depthFade[index] = 1 - KOI_PLAN[index]!.depth * 2.2;
  }
  geometry.setAttribute("aFishColor", new InstancedBufferAttribute(colors, 3));
  geometry.setAttribute("aFishAccent", new InstancedBufferAttribute(accent, 1));
  geometry.setAttribute("aFishDepthFade", new InstancedBufferAttribute(depthFade, 1));

  const dummy = new Object3D();
  const matrix = new Matrix4();
  const update = (frame: GardenKoiFrame): void => {
    // Koi are a daylight glint only; the dusk water and night road keep the
    // shallows once daylight yields.
    material.uniforms.uVisibility!.value = 0.98
      * smoothstep01((frame.daylight - 0.08) / 0.42);
    for (let index = 0; index < GARDEN_KOI_COUNT; index += 1) {
      const sample = sampleGardenKoi(index, frame.timeSeconds, frame.reducedMotion);
      dummy.position.set(sample.x, -sample.depth, sample.z);
      dummy.rotation.set(0, sample.heading, 0);
      dummy.scale.set(sample.scale, sample.scale, sample.scale);
      dummy.updateMatrix();
      matrix.copy(dummy.matrix);
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  update({ daylight: 1, night: 0, reducedMotion: true, timeSeconds: 0 });

  // Read only the canonical water clock/phase immediately before drawing.
  // This stays allocation-free and lets garden-island own the fish without a
  // world-renderer edit (that file is intentionally outside this task).
  mesh.onBeforeRender = (_renderer, scene) => {
    const frame = waterFrameFromScene(scene);
    if (frame) update(frame);
  };
  return { mesh, update };
}
