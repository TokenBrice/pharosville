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
  mistBandCount: number;
  root: Group;
  silhouetteCount: number;
  triangleCount: number;
  dispose: () => void;
  update: (phase: DayCyclePhase, frame: GardenHorizonFrame) => void;
}

/** Three fog-close values: enough separation to layer, never enough to cut out. */
export const GARDEN_HORIZON_VALUE_SCALES = [0.98, 0.97, 0.96] as const;
export const GARDEN_HORIZON_DISPLACEMENT = "screen-space backdrop ridge impressions";

const RIDGES = [
  {
    depth: 122,
    height: 21,
    offset: -62,
    profile: [0, 0.22, 0.16, 0.42, 0.35, 0.58, 0.91, 0.64, 0.31, 0.14, 0],
    width: 276,
  },
  {
    depth: 108,
    height: 17,
    offset: 18,
    profile: [0, 0.11, 0.3, 0.2, 0.48, 0.82, 0.52, 0.38, 0.16, 0.22, 0],
    width: 242,
  },
  {
    depth: 94,
    height: 14,
    offset: 92,
    profile: [0, 0.18, 0.12, 0.38, 0.29, 0.62, 0.43, 0.24, 0.34, 0.12, 0],
    width: 205,
  },
] as const;

function createGeometry(): BufferGeometry {
  const positions: number[] = [];
  const layers: number[] = [];
  const reliefs: number[] = [];
  const kinds: number[] = [];
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
      positions.push(x, -7, z, x, ridge.profile[point]! * ridge.height, z);
      layers.push(layer, layer);
      kinds.push(0, 0);
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
  // One thin fog-coloured band between the plate rim and the ridge feet. It is
  // part of this draw and displaces the former diffuse base fade; it is not a
  // second billboard mist vocabulary.
  const mistBase = positions.length / 3;
  const mistDepth = 86;
  const mistWidth = 310;
  for (const [lateral, vertical] of [
    [-mistWidth / 2, 0],
    [-mistWidth / 2, 1],
    [mistWidth / 2, 0],
    [mistWidth / 2, 1],
  ] as const) {
    const x = farX * mistDepth + lateralX * lateral;
    const z = farZ * mistDepth + lateralZ * lateral;
    positions.push(x, -2.5 + vertical * 5.5, z);
    layers.push(0);
    kinds.push(1);
    reliefs.push(0.18);
    verticals.push(vertical);
  }
  indices.push(
    mistBase, mistBase + 3, mistBase + 1,
    mistBase, mistBase + 2, mistBase + 3,
  );
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("aLayer", new BufferAttribute(new Float32Array(layers), 1));
  geometry.setAttribute("aKind", new BufferAttribute(new Float32Array(kinds), 1));
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
      attribute float aKind;
      attribute float aRelief;
      attribute float aVertical;
      varying float vLayer;
      varying float vKind;
      varying float vRelief;
      varying float vVertical;
      void main() {
        vLayer = aLayer;
        vKind = aKind;
        vRelief = aRelief;
        vVertical = aVertical;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uFogColor;
      uniform vec3 uSkyColor;
      varying float vLayer;
      varying float vKind;
      varying float vRelief;
      varying float vVertical;
      void main() {
        if (vKind > 0.5) {
          float mist = sin(clamp(vVertical, 0.0, 1.0) * 3.14159265);
          if (mist < 0.015) discard;
          gl_FragColor = vec4(uFogColor * 1.015, mist * 0.24);
          return;
        }
        float valueScale = vLayer < 0.5 ? 0.98 : (vLayer < 1.5 ? 0.97 : 0.96);
        float profile = smoothstep(0.035, 0.48, vRelief);
        float baseFade = smoothstep(0.0, 0.5, vVertical);
        float distanceCool = (2.0 - vLayer) * 0.08;
        float skyMix = 0.08 + smoothstep(0.12, 0.82, vRelief) * 0.16 + distanceCool;
        float alpha = profile * baseFade * (0.34 + vLayer * 0.035);
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(mix(uFogColor, uSkyColor, skyMix) * valueScale, alpha);
      }
    `,
  });
}

/**
 * Shakkei beyond the finite plate: three wide, overlapping ridge strips in one
 * draw. Every profile meets a transparent broad base below the fog seam and
 * both frame sides; there are no closed silhouettes that can read as detached
 * pills or opaque curtains.
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
  const skyColor = material.uniforms.uSkyColor.value as Color;
  let disposed = false;

  return {
    drawCallCount: 1,
    mistBandCount: 1,
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
