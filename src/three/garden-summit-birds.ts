import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  ShaderMaterial,
} from "three";
import type { GardenBeatRequest } from "../systems/garden-director";
import { HARBOR_PALETTE } from "../systems/palette";

/**
 * Shared closed-sortie arithmetic for the harbour's remaining station birds,
 * plus the W4.9 heron that replaces the invisible eight-bird summit flock.
 * The heron rests on the camera-side island rock and moves only during a
 * director-admitted weather beat; reduced motion is the same perched pose.
 */

export const GARDEN_SUMMIT_BIRD_COUNT = 1;
// C1: palette-derived silhouette (dark iron against the sky bands).
const BIRD_COLOR = new Color(HARBOR_PALETTE.iron_dark);

/**
 * Shared station-bird sorties are deliberately rare: a successful window uses
 * only 18% of its minute, for a design occupancy below one bird in ten.
 * The heron does not use this stochastic clock; its dusk flight is admitted by
 * the garden director through the request below.
 */
export const GARDEN_BIRD_SORTIE_PERIOD = 62;
export const GARDEN_BIRD_SORTIE_CHANCE = 0.55;
export const GARDEN_BIRD_SORTIE_SHARE = 0.18;

/**
 * Shared choreography for CPU-side station birds in `garden-harbor-life.ts`.
 * `gardenBirdSortieAt` returns eased progress through one closed excursion.
 * [0, 1]: 0 while she is sitting (before her turn), 1 once she is back down
 * (after it), and the eased sweep between while she is up. Both resting values
 * put her on her perch and both approach it with zero speed, so a sortie has no
 * take-off pop and no landing snap — the eased progress does that work, not a
 * separate envelope.
 */
export const GARDEN_BIRD_SORTIE_GLSL = /* glsl */`
  float gardenBirdHash(float n) {
    return fract(sin(n) * 43758.5453123);
  }

  float gardenBirdSortieAt(float seed, float t, float period, float chance, float share) {
    // The bird's own window clock, offset by her seed so no two birds share a
    // window boundary and the flock can never lift as one.
    float cycle = t / period + seed * 7.13;
    float window = floor(cycle);
    float frac = cycle - window;
    // One deterministic die per (bird, window): does she fly this one at all?
    float flies = step(gardenBirdHash(window * 1.37 + seed * 91.7), chance);
    // And where in the window her turn falls, so sorties do not line up.
    float start = gardenBirdHash(window * 3.91 + seed * 17.3) * (1.0 - share);
    float u = clamp((frac - start) / share, 0.0, 1.0);
    // Eased: zero rate of change at both ends, so she leaves and rejoins her
    // perch at a standstill.
    return flies * u * u * (3.0 - 2.0 * u);
  }
`;

/**
 * The CPU twin of `gardenBirdSortieAt`, for the flock that writes instance
 * matrices instead of running a vertex shader. Same arithmetic, same hash, same
 * meaning — keep the two in step.
 */
export function gardenBirdSortie(
  seed: number,
  timeSeconds: number,
  period: number = GARDEN_BIRD_SORTIE_PERIOD,
  chance: number = GARDEN_BIRD_SORTIE_CHANCE,
  share: number = GARDEN_BIRD_SORTIE_SHARE,
): number {
  if (share <= 0 || chance <= 0) return 0;
  const cycle = timeSeconds / period + seed * 7.13;
  const window = Math.floor(cycle);
  const frac = cycle - window;
  const flies = gardenBirdHash(window * 1.37 + seed * 91.7) <= chance ? 1 : 0;
  const start = gardenBirdHash(window * 3.91 + seed * 17.3) * (1 - share);
  const u = Math.min(1, Math.max(0, (frac - start) / share));
  return flies * u * u * (3 - 2 * u);
}

/** `fract(sin(n) * 43758.5453123)` — the GLSL hash above, in TypeScript. */
export function gardenBirdHash(n: number): number {
  const value = Math.sin(n) * 43758.5453123;
  return value - Math.floor(value);
}

/**
 * Where a bird is, relative to her perch, at sortie progress `sortie`.
 *
 * The sortie is ONE CLOSED LOOP: a circle of radius `loopRadius` tangent to the
 * perch, on the seaward side of whatever she is sitting on (`outX`/`outZ` is the
 * outward direction), so she never flies through the thing she just left. At
 * progress 0 and 1 the offset is exactly zero — she is back on her perch, in the
 * spot she took off from — and the climb term is zero at both ends too.
 *
 * `heading` is exact rather than approximated: the loop's tangent at progress a
 * is simply the launch bearing turned by the same 2πa, so the bird always faces
 * where she is going and faces the same way sitting as she did the instant she
 * left. Returns `[x, y, z, heading]` in the flock's own space.
 */
export function gardenBirdSortieOffset(
  sortie: number,
  outX: number,
  outZ: number,
  loopRadius: number,
  climb: number,
): [number, number, number, number] {
  const theta = sortie * Math.PI * 2;
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  // Tangent to the perch, 90° from the outward direction.
  const tanX = -outZ;
  const tanZ = outX;
  return [
    (tanX * sin + outX * (1 - cos)) * loopRadius,
    Math.sin(Math.PI * sortie) * climb,
    (tanZ * sin + outZ * (1 - cos)) * loopRadius,
    Math.atan2(outX, -outZ) - theta,
  ];
}

/** At a 35° vertical field of view and 900 px viewport, this reads as 12.5 px at 120 u. */
export const GARDEN_HERON_WINGSPAN = 1.05;
export const GARDEN_HERON_PERCH = { x: -10.8, y: 2.05, z: 8.4 } as const;
export const GARDEN_HERON_BEAT_REQUEST: GardenBeatRequest = {
  durationSeconds: 28,
  foreground: false,
  kind: "weather",
  priority: 18,
  subject: "heron-dusk-flight",
};

export function gardenBirdPixelSpan(
  wingspan: number,
  distance: number,
  viewportHeight = 900,
  verticalFovDegrees = 35,
): number {
  return wingspan * viewportHeight
    / (2 * distance * Math.tan(verticalFovDegrees * Math.PI / 360));
}

export interface GardenSummitBirdsUpdate {
  reducedMotion: boolean;
  timeSeconds: number;
  visible: boolean;
  /** True only while the director's admitted heron weather beat is active. */
  weatherBeatActive?: boolean;
}

export interface GardenSummitBirds {
  root: Group;
  dispose: () => void;
  update: (input: GardenSummitBirdsUpdate) => void;
}

/**
 * The former eight-bird summit micro-flock is now one readable heron. Its root
 * is authored at the camera-side rock station; the renderer must parent it to
 * the island rather than the lighthouse beacon.
 */
export function createGardenSummitBirds(): GardenSummitBirds {
  const root = new Group();
  root.name = "island-heron-root";
  root.position.set(GARDEN_HERON_PERCH.x, GARDEN_HERON_PERCH.y, GARDEN_HERON_PERCH.z);

  const halfWing = GARDEN_HERON_WINGSPAN * 0.5;
  const positions = new Float32Array([
    0.32, 0, 0, -0.28, 0, 0.06, 0.01, 0, -halfWing,
    0.32, 0, 0, -0.28, 0, -0.06, 0.01, 0, halfWing,
  ]);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aWing", new Float32BufferAttribute([0, 0, -1, 0, 0, 1], 1));
  const material = new ShaderMaterial({
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }
    `,
    side: DoubleSide,
    uniforms: {
      uBeat: { value: 0 },
      uColor: { value: BIRD_COLOR },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */`
      attribute float aWing;
      uniform float uBeat;
      uniform float uTime;
      void main() {
        float progress = clamp(uTime / ${GARDEN_HERON_BEAT_REQUEST.durationSeconds.toFixed(1)}, 0.0, 1.0);
        float eased = progress * progress * (3.0 - 2.0 * progress);
        float theta = eased * 6.2831853;
        float air = uBeat * sin(3.14159265 * eased);
        vec3 center = vec3(
          sin(theta) * 5.2,
          air * 3.4,
          (1.0 - cos(theta)) * 3.8
        );
        vec3 p = position;
        p.z *= mix(0.34, 1.0, air);
        p.y += sin(uTime * 4.2) * 0.11 * abs(aWing) * air;
        float c = cos(-theta);
        float s = sin(-theta);
        p = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(center * uBeat + p, 1.0);
      }
    `,
  });
  const bird = new InstancedMesh(geometry, material, GARDEN_SUMMIT_BIRD_COUNT);
  bird.name = "island-heron";
  bird.frustumCulled = false;
  root.add(bird);

  return {
    dispose() {
      geometry.dispose();
      material.dispose();
    },
    root,
    update({ reducedMotion, timeSeconds, visible, weatherBeatActive = false }) {
      root.visible = visible;
      if (!visible) return;
      const flying = !reducedMotion && weatherBeatActive;
      material.uniforms.uBeat!.value = flying ? 1 : 0;
      material.uniforms.uTime!.value = flying ? Math.max(0, timeSeconds) : 0;
    },
  };
}
