import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  ShaderMaterial,
} from "three";
import { HARBOR_PALETTE } from "../systems/palette";

export const GARDEN_GULL_COUNT = 5;
export const GARDEN_GULL_LOOP_COUNT = 4;
export const GARDEN_GULL_SHIP_COUNT = 3;
export const GARDEN_GULL_FLOCK_NAME = "ship-gull-flock";
export const GARDEN_GULL_WINGSPAN = 0.92;
export const GARDEN_GULL_LOOP_SECONDS = 180;

export interface GardenShipGulls {
  update(input: {
    reducedMotion: boolean;
    timeSeconds: number;
    visible: boolean;
  }): void;
}

export interface GardenGullShip {
  mastheadHeight: number;
  root: Object3D;
  ship: { id: string };
}

/**
 * One five-bird harbour composition: two gull pairs make wide, slow loops and
 * the fifth holds a masthead station. It replaces the former three per-ship
 * sortie draws with one draw, a net reduction of two.
 */
export function createGardenShipGulls(ships: readonly GardenGullShip[]): GardenShipGulls {
  const station = ships[0];
  if (!station) return { update() {} };

  const halfWing = GARDEN_GULL_WINGSPAN * 0.5;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([
    0.2, 0, 0, -0.18, 0, 0.04, 0.01, 0, -halfWing,
    0.2, 0, 0, -0.18, 0, -0.04, 0.01, 0, halfWing,
  ], 3));
  geometry.setAttribute("aWing", new Float32BufferAttribute([0, 0, -1, 0, 0, 1], 1));
  // Pair members share a phase family but sit opposite one another; 1 marks
  // the sole perched bird.
  geometry.setAttribute("aPhase", new InstancedBufferAttribute(
    new Float32Array([0, 0.5, 0.12, 0.62, 1]),
    1,
  ));
  geometry.setAttribute("aStation", new InstancedBufferAttribute(new Float32Array([
    0.35, 0.0, -0.28,
    0.35, 0.06, 0.32,
    0.35, 1.68, -1.18,
    0.35, 1.68, 1.16,
    0.35, 0.02, 0.08,
  ]), 3));

  const material = new ShaderMaterial({
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }
    `,
    side: DoubleSide,
    uniforms: {
      uColor: { value: new Color(HARBOR_PALETTE.iron_dark) },
      uFlight: { value: 1 },
      uHeight: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */`
      attribute float aPhase;
      attribute vec3 aStation;
      attribute float aWing;
      uniform float uFlight;
      uniform float uHeight;
      uniform float uTime;
      void main() {
        float loops = step(aPhase, 0.99) * uFlight;
        float theta = (uTime / ${GARDEN_GULL_LOOP_SECONDS.toFixed(1)} + aPhase) * 6.2831853;
        float pair = step(0.06, fract(aPhase * 2.0));
        float radius = mix(4.4, 5.2, pair);
        vec3 perch = vec3(aStation.x, uHeight - aStation.y, aStation.z);
        vec3 center = perch + loops * vec3(
          sin(theta) * radius,
          2.4 + sin(theta * 2.0) * 0.55,
          (1.0 - cos(theta)) * radius
        );
        vec3 p = position;
        p.z *= mix(0.38, 1.0, loops);
        p.y += sin(uTime * 4.8 + aPhase * 13.0) * 0.1 * abs(aWing) * loops;
        float heading = -theta;
        float c = cos(heading);
        float s = sin(heading);
        p = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(center + p, 1.0);
      }
    `,
  });
  const mesh = new InstancedMesh(geometry, material, GARDEN_GULL_COUNT);
  mesh.name = "ship-gulls";
  mesh.frustumCulled = false;
  const flock = new Group();
  flock.name = GARDEN_GULL_FLOCK_NAME;
  flock.add(mesh);
  station.root.add(flock);

  return {
    update({ reducedMotion, timeSeconds, visible }) {
      mesh.visible = visible;
      if (!visible) return;
      material.uniforms.uHeight!.value = station.mastheadHeight;
      material.uniforms.uFlight!.value = reducedMotion ? 0 : 1;
      material.uniforms.uTime!.value = reducedMotion ? 0 : Math.max(0, timeSeconds);
    },
  };
}
