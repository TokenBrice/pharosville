import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  ShaderMaterial,
} from "three";
import type { PharosVilleRenderSchedulerTier } from "../renderer/render-types";
import {
  blendDayCycleColor,
  DAY_CYCLE_SKY_PRESETS,
  type DayCyclePhase,
} from "./garden-day-cycle";

export interface GardenHorizonFrame {
  targetX: number;
  targetZ: number;
  tier: PharosVilleRenderSchedulerTier;
}

export interface GardenHorizon {
  drawCallCount: number;
  root: Group;
  silhouetteCount: number;
  triangleCount: number;
  dispose: () => void;
  update: (phase: DayCyclePhase, frame: GardenHorizonFrame) => void;
}

/** Three fog-close values: enough separation to layer, never enough to cut out. */
export const GARDEN_HORIZON_VALUE_SCALES = [0.975, 0.968, 0.96] as const;

const RIDGES = [
  {
    depth: 151,
    height: 7.2,
    offset: -38,
    profile: [0, 0.18, 0.12, 0.38, 0.29, 0.62, 0.43, 0.24, 0.34, 0.12, 0],
    width: 520,
  },
  {
    depth: 169,
    height: 10.5,
    offset: 34,
    profile: [0, 0.11, 0.3, 0.2, 0.48, 0.82, 0.52, 0.38, 0.16, 0.22, 0],
    width: 550,
  },
  {
    depth: 190,
    height: 14,
    offset: -8,
    profile: [0, 0.22, 0.16, 0.42, 0.35, 0.58, 0.91, 0.64, 0.31, 0.14, 0],
    width: 580,
  },
] as const;

function createGeometry(): BufferGeometry {
  const positions: number[] = [];
  const layers: number[] = [];
  const indices: number[] = [];
  const lateralX = Math.SQRT1_2;
  const lateralZ = -Math.SQRT1_2;
  const farX = -Math.SQRT1_2;
  const farZ = -Math.SQRT1_2;
  for (const [layer, ridge] of RIDGES.entries()) {
    const base = positions.length / 3;
    for (let point = 0; point < ridge.profile.length; point += 1) {
      const t = point / (ridge.profile.length - 1);
      const lateral = (t - 0.5) * ridge.width + ridge.offset;
      const x = farX * ridge.depth + lateralX * lateral;
      const z = farZ * ridge.depth + lateralZ * lateral;
      positions.push(x, -18, z, x, ridge.profile[point]! * ridge.height, z);
      layers.push(layer, layer);
      if (point === 0) continue;
      const a = base + (point - 1) * 2;
      const b = a + 1;
      const c = base + point * 2 + 1;
      const d = c - 1;
      indices.push(a, c, b, a, d, c);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("aLayer", new BufferAttribute(new Float32Array(layers), 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function createMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    depthTest: true,
    depthWrite: true,
    fog: false,
    side: DoubleSide,
    uniforms: {
      uFogColor: { value: DAY_CYCLE_SKY_PRESETS.night.fog.clone() },
    },
    vertexShader: /* glsl */ `
      attribute float aLayer;
      varying float vLayer;
      void main() {
        vLayer = aLayer;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uFogColor;
      varying float vLayer;
      void main() {
        float valueScale = vLayer < 0.5 ? 0.975 : (vLayer < 1.5 ? 0.968 : 0.96);
        gl_FragColor = vec4(uFogColor * valueScale, 1.0);
      }
    `,
  });
}

/**
 * Shakkei beyond the finite plate: three wide, overlapping ridge strips in one
 * draw. Every profile meets a broad base below the fog seam and both frame
 * sides; there are no closed silhouettes that can read as detached pills.
 */
export function createGardenHorizon(): GardenHorizon {
  const root = new Group();
  root.name = "garden-horizon";
  const geometry = createGeometry();
  const material = createMaterial();
  const mesh = new Mesh(geometry, material);
  mesh.name = "garden-horizon-borrowed-mountains";
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  root.add(mesh);
  const fogColor = material.uniforms.uFogColor.value as Color;
  let disposed = false;

  return {
    drawCallCount: 1,
    root,
    silhouetteCount: RIDGES.length,
    triangleCount: geometry.index!.count / 3,
    dispose() {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      material.dispose();
      root.clear();
    },
    update(phase, frame) {
      root.position.set(frame.targetX, 0, frame.targetZ);
      root.visible = frame.tier !== "constrained";
      blendDayCycleColor(
        fogColor,
        DAY_CYCLE_SKY_PRESETS.night.fog,
        DAY_CYCLE_SKY_PRESETS.dusk.fog,
        DAY_CYCLE_SKY_PRESETS.day.fog,
        phase.dusk,
        phase.daylight,
      );
    },
  };
}
