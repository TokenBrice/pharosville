import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  ShaderMaterial,
} from "three";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import type { GardenWakes } from "./garden-wakes";
import { TILE_SCALE } from "./garden-util";

/** The broad random silver arcs this single authored water event replaces. */
export const GARDEN_WATERFALL_DISPLACEMENT = "water-silver-accents";

export interface GardenWaterfallPoint {
  readonly tileX: number;
  readonly tileY: number;
  readonly width: number;
  readonly worldY: number;
}

/**
 * One short, crooked descent on the deep camera-side lobe. The final two
 * stations sit in Calm Anchorage; the Ethereum cove mouth remains clear.
 */
export const GARDEN_WATERFALL_POINTS: readonly GardenWaterfallPoint[] = [
  { tileX: 60.35, tileY: 136.1, width: 0.92, worldY: 1.68 },
  { tileX: 59.72, tileY: 135.0, width: 1.02, worldY: 1.53 },
  { tileX: 60.28, tileY: 133.8, width: 0.96, worldY: 1.18 },
  { tileX: 59.78, tileY: 132.7, width: 1.04, worldY: 0.82 },
  { tileX: 60.18, tileY: 131.55, width: 1.06, worldY: 0.38 },
  { tileX: 60.0, tileY: 130.35, width: 1.06, worldY: GARDEN_WATER_Y + 0.075 },
  { tileX: 60.05, tileY: 129.25, width: 1.28, worldY: GARDEN_WATER_Y + 0.06 },
  { tileX: 60.2, tileY: 128.35, width: 1.6, worldY: GARDEN_WATER_Y + 0.052 },
] as const;

export const GARDEN_WATERFALL_CASCADE_WIDTH_WORLD = 1.06 * 2 * TILE_SCALE;
export const GARDEN_WATERFALL_PLUNGE_WIDTH_WORLD = 1.6 * 2 * TILE_SCALE;

export const GARDEN_WATERFALL_POOL_WORLD = {
  x: GARDEN_WATERFALL_POINTS.at(-1)!.tileX * TILE_SCALE,
  z: GARDEN_WATERFALL_POINTS.at(-1)!.tileY * TILE_SCALE,
} as const;

export interface GardenWaterfallFrame {
  night: number;
  reducedMotion: boolean;
  timeSeconds: number;
}

export interface GardenWaterfall {
  readonly drawCallCount: 1;
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  readonly triangleCount: number;
  update(frame: GardenWaterfallFrame, wakes: GardenWakes): void;
}

function waterfallGeometry(): BufferGeometry {
  const positions: number[] = [];
  const across: number[] = [];
  const flow: number[] = [];
  const indices: number[] = [];

  for (const [index, point] of GARDEN_WATERFALL_POINTS.entries()) {
    const previous = GARDEN_WATERFALL_POINTS[Math.max(0, index - 1)]!;
    const next = GARDEN_WATERFALL_POINTS[Math.min(GARDEN_WATERFALL_POINTS.length - 1, index + 1)]!;
    const dx = next.tileX - previous.tileX;
    const dz = next.tileY - previous.tileY;
    const length = Math.hypot(dx, dz) || 1;
    const sideX = -dz / length;
    const sideZ = dx / length;
    for (const side of [-1, 0, 1] as const) {
      positions.push(
        (point.tileX + sideX * point.width * side) * TILE_SCALE,
        point.worldY,
        (point.tileY + sideZ * point.width * side) * TILE_SCALE,
      );
      across.push(side);
      flow.push(index / (GARDEN_WATERFALL_POINTS.length - 1));
    }
    if (index === 0) continue;
    const row = index * 3;
    const previousRow = row - 3;
    indices.push(
      previousRow, row, previousRow + 1,
      previousRow + 1, row, row + 1,
      previousRow + 1, row + 1, previousRow + 2,
      previousRow + 2, row + 1, row + 2,
    );
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aAcross", new Float32BufferAttribute(across, 1));
  geometry.setAttribute("aFlow", new Float32BufferAttribute(flow, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function waterfallMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    depthTest: true,
    depthWrite: true,
    fog: true,
    side: DoubleSide,
    transparent: false,
    uniforms: {
      uBase: { value: new Color(HARBOR_PALETTE.shallow_teal_lit).multiplyScalar(0.72) },
      uFoam: { value: new Color(HARBOR_PALETTE.foam_white) },
      uNight: { value: 0 },
      uTime: { value: 0 },
      ...{
        fogColor: { value: new Color() },
        fogNear: { value: 1 },
        fogFar: { value: 2_000 },
      },
    },
    vertexShader: /* glsl */ `
      attribute float aAcross;
      attribute float aFlow;
      varying float vAcross;
      varying float vFlow;
      #include <fog_pars_vertex>
      void main() {
        vAcross = abs(aAcross);
        vFlow = aFlow;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase;
      uniform vec3 uFoam;
      uniform float uNight;
      uniform float uTime;
      varying float vAcross;
      varying float vFlow;
      #include <fog_pars_fragment>

      float gardenDither(vec2 p) {
        return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
      }

      void main() {
        float edgeCoverage = 1.0 - smoothstep(0.68, 1.0, vAcross);
        if (gardenDither(gl_FragCoord.xy) > edgeCoverage) discard;
        float descent = smoothstep(0.12, 0.78, vFlow);
        float ribbon = sin(vFlow * 48.0 - uTime * 2.15 + vAcross * 5.0) * 0.5 + 0.5;
        float brokenFoam = smoothstep(0.58, 0.93, ribbon) * (0.28 + descent * 0.72);
        float foamCrest = (1.0 - smoothstep(0.04, 0.2, vFlow))
          * (0.72 + (1.0 - vAcross) * 0.28);
        float plungeFoam = smoothstep(0.82, 0.98, vFlow)
          * (0.76 + (1.0 - vAcross) * 0.24);
        float centreRun = (1.0 - smoothstep(0.0, 0.72, vAcross)) * 0.22;
        float foam = clamp(max(max(brokenFoam, foamCrest), plungeFoam) + centreRun, 0.0, 1.0);
        vec3 color = mix(uBase, uFoam * 1.08, foam);
        color = mix(color, uBase * 0.42, uNight * 0.72);
        gl_FragColor = vec4(color, 1.0);
        #include <fog_fragment>
      }
    `,
  });
}

/**
 * The fall is one opaque draw. Its pool borrows the existing persistent wake
 * field, so no particle system, transparent foam plane, texture, or oscillator
 * is introduced.
 */
export function createGardenWaterfall(): GardenWaterfall {
  const mesh = new Mesh(waterfallGeometry(), waterfallMaterial());
  mesh.name = "garden-hero-waterfall";
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  const triangleCount = (mesh.geometry.getIndex()?.count ?? 0) / 3;

  return {
    drawCallCount: 1,
    mesh,
    triangleCount,
    update(frame, wakes) {
      mesh.material.uniforms.uTime!.value = frame.reducedMotion ? 0 : Math.max(0, frame.timeSeconds);
      mesh.material.uniforms.uNight!.value = Math.max(0, Math.min(1, frame.night));
      if (frame.reducedMotion) return;
      // Three low-energy headings overlap into one irregular plunge patch in
      // the already-budgeted instanced wake stamp draw.
      for (let index = 0; index < 3; index += 1) {
        const angle = index * Math.PI * 2 / 3;
        wakes.stamp(
          GARDEN_WATERFALL_POOL_WORLD.x,
          GARDEN_WATERFALL_POOL_WORLD.z,
          Math.cos(angle),
          Math.sin(angle),
          0.18,
          0.9,
        );
      }
    },
  };
}
