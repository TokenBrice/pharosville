import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  ShaderMaterial,
} from "three";
import { HARBOR_PALETTE } from "../systems/palette";
import { stableUnit } from "./garden-util";

/**
 * W7 presence — the summit bird flock (Pharos Wonder plan §3.4). Eight
 * instanced two-triangle birds orbit the Pharos crown at radius ~9: small
 * moving things beside a big static thing is the cheapest "epic" there is.
 * One instanced draw call; orbit and slow sin-flap run entirely in the vertex
 * shader from deterministic per-instance seeds, so reduced motion freezes the
 * flock at its composed time-zero pose (uTime = 0). Full/balanced tiers only.
 */

const BIRD_COUNT = 8;
// C1: palette-derived silhouette (dark iron against the sky bands).
const BIRD_COLOR = new Color(HARBOR_PALETTE.iron_dark);

export interface GardenSummitBirdsUpdate {
  reducedMotion: boolean;
  timeSeconds: number;
  visible: boolean;
}

export interface GardenSummitBirds {
  root: Group;
  dispose: () => void;
  update: (input: GardenSummitBirdsUpdate) => void;
}

export function createGardenSummitBirds(): GardenSummitBirds {
  const root = new Group();
  root.name = "lighthouse-birds-root";

  // Two triangles sharing the body edge: nose → tail → wingtip, mirrored.
  // aWing marks the wingtips (±1) so the flap displaces them only.
  const positions = new Float32Array([
    0.22, 0, 0, -0.2, 0, 0.05, 0.02, 0, -0.4,
    0.22, 0, 0, -0.2, 0, -0.05, 0.02, 0, 0.4,
  ]);
  const wing = new Float32Array([0, 0, -1, 0, 0, 1]);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aWing", new Float32BufferAttribute(wing, 1));
  const seeds: number[] = [];
  for (let index = 0; index < BIRD_COUNT; index += 1) {
    seeds.push(stableUnit(`summit-bird.${index}`));
  }
  geometry.setAttribute("aSeed", new InstancedBufferAttribute(new Float32Array(seeds), 1));

  const material = new ShaderMaterial({
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;

      void main() {
        gl_FragColor = vec4(uColor, 1.0);
      }
    `,
    side: DoubleSide,
    uniforms: {
      uColor: { value: BIRD_COLOR },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      attribute float aWing;
      uniform float uTime;

      void main() {
        // Slow shared orbit; seeds spread the flock around the ring, stagger
        // the ring radius and height, and detune each bird's flap.
        float orbit = uTime * 0.11 + aSeed * 6.2831;
        // Ring radius ~9 (8.2–9.8), seeded per bird.
        float radius = 8.2 + aSeed * 1.6;
        vec3 center = vec3(
          cos(orbit) * radius,
          1.6 + sin(aSeed * 40.0) * 1.7,
          sin(orbit) * radius
        );
        vec3 p = position;
        p.y += sin(uTime * (5.0 + aSeed * 2.5) + aSeed * 21.0) * 0.17 * abs(aWing);
        // Face along the orbit tangent (direction of travel).
        float heading = orbit + 1.5708;
        float c = cos(heading);
        float s = sin(heading);
        p = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(center + p, 1.0);
      }
    `,
  });

  const birds = new InstancedMesh(geometry, material, BIRD_COUNT);
  birds.name = "lighthouse-birds";
  birds.frustumCulled = false;
  root.add(birds);

  return {
    dispose() {
      geometry.dispose();
      material.dispose();
    },
    root,
    update({ reducedMotion, timeSeconds, visible }) {
      root.visible = visible;
      if (!visible) return;
      material.uniforms.uTime.value = reducedMotion ? 0 : Math.max(0, timeSeconds);
    },
  };
}
