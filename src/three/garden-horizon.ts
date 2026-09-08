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
  cameraPosition: { x: number; y: number; z: number };
  fogColor: Color;
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

/**
 * Warm-village B3 (2026-09-05): the ridges read as THREE PLANES, not one fog
 * band. The old 0.98/0.97/0.96 kept every layer within 2–4% of the fog colour,
 * which graded into a single flat strip. Each ridge now steps a further ~10%
 * down in value from far to near (fog-close far ridge, silhouette near ridge),
 * ordered the way aerial perspective actually works.
 */
export const GARDEN_HORIZON_VALUE_SCALES = [0.9, 0.8, 0.7] as const;

// The GLSL reads the exported scales so the shader and the contract constant
// cannot drift apart (they did once: the shader hardcoded 0.98/0.97/0.96).
const HORIZON_VALUE_SCALE_GLSL = `
        float valueScale = vLayer < 0.5 ? ${GARDEN_HORIZON_VALUE_SCALES[0].toFixed(2)}
          : (vLayer < 1.5 ? ${GARDEN_HORIZON_VALUE_SCALES[1].toFixed(2)} : ${GARDEN_HORIZON_VALUE_SCALES[2].toFixed(2)});
      `;

const RIDGES = [
  {
    depth: 390,
    height: 22,
    offset: -172,
    profile: [0, 0.22, 0.16, 0.42, 0.35, 0.58, 0.91, 0.64, 0.31, 0.14, 0],
    width: 160,
  },
  {
    depth: 350,
    height: 28,
    offset: 170,
    profile: [0, 0.11, 0.3, 0.2, 0.48, 0.82, 0.52, 0.38, 0.16, 0.22, 0],
    width: 172,
  },
  {
    depth: 320,
    height: 18,
    offset: -104,
    profile: [0, 0.18, 0.12, 0.38, 0.29, 0.62, 0.43, 0.24, 0.34, 0.12, 0],
    width: 104,
  },
] as const;

function createGeometry(): BufferGeometry {
  const positions: number[] = [];
  const layers: number[] = [];
  const reliefs: number[] = [];
  const verticals: number[] = [];
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
      positions.push(x, -6, z, x, ridge.profile[point]! * ridge.height, z);
      layers.push(layer, layer);
      reliefs.push(ridge.profile[point]!, ridge.profile[point]!);
      verticals.push(0, 1);
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
  geometry.setAttribute("aRelief", new BufferAttribute(new Float32Array(reliefs), 1));
  geometry.setAttribute("aVertical", new BufferAttribute(new Float32Array(verticals), 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function createMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    // The transparent draw sorts after the opaque garden, so the depth buffer
    // is what keeps borrowed scenery behind every rim, ship and building.
    depthTest: true,
    depthWrite: false,
    fog: false,
    side: DoubleSide,
    transparent: true,
    uniforms: {
      uFogColor: { value: DAY_CYCLE_SKY_PRESETS.night.fog.clone() },
      uSkyColor: { value: DAY_CYCLE_SKY_PRESETS.night.zenith.clone() },
    },
    vertexShader: /* glsl */ `
      attribute float aLayer;
      attribute float aRelief;
      attribute float aVertical;
      varying float vLayer;
      varying float vRelief;
      varying float vDepth;
      varying float vVertical;
      void main() {
        vLayer = aLayer;
        vRelief = aRelief;
        vVertical = aVertical;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vDepth = -viewPosition.z;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uFogColor;
      uniform vec3 uSkyColor;
      varying float vLayer;
      varying float vRelief;
      varying float vDepth;
      varying float vVertical;
      void main() {
        ${HORIZON_VALUE_SCALE_GLSL.trim()}
        float profile = smoothstep(0.035, 0.48, vRelief);
        float baseFade = smoothstep(0.0, 0.5, vVertical);
        float distanceCool = (2.0 - vLayer) * 0.08;
        float skyMix = 0.08 + smoothstep(0.12, 0.82, vRelief) * 0.16 + distanceCool;
        float alpha = profile * baseFade * (0.34 + vLayer * 0.035);
        if (alpha < 0.004) discard;
        vec3 silhouette = mix(uFogColor, uSkyColor, skyMix) * valueScale;
        float distanceFade = smoothstep(280.0, 580.0, vDepth);
        gl_FragColor = vec4(mix(silhouette, uFogColor, distanceFade * 0.7), alpha);
      }
    `,
  });
}

/**
 * Three partial headlands beyond the north/west plate, with open sky between
 * their unequal profiles. A single depth-tested draw softens their feet into
 * the sea haze; there is no full-width curtain or extra mist strip.
 */
export function createGardenHorizon(): GardenHorizon {
  const root = new Group();
  root.name = "garden-horizon";
  const geometry = createGeometry();
  const material = createMaterial();
  const mesh = new Mesh(geometry, material);
  mesh.name = "garden-horizon-headlands";
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.raycast = () => {};
  root.add(mesh);
  const fogColor = material.uniforms.uFogColor.value as Color;
  const skyColor = material.uniforms.uSkyColor.value as Color;
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
      // Distant flat sea meets the horizontal plane through the current eye.
      root.position.set(frame.targetX, frame.cameraPosition.y, frame.targetZ);
      root.visible = frame.tier !== "constrained";
      fogColor.copy(frame.fogColor);
      blendDayCycleColor(
        skyColor,
        DAY_CYCLE_SKY_PRESETS.night.zenith,
        DAY_CYCLE_SKY_PRESETS.dusk.zenith,
        DAY_CYCLE_SKY_PRESETS.day.zenith,
        phase.dusk,
        phase.daylight,
      );
    },
  };
}
