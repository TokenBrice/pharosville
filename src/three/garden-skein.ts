import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  ShaderMaterial,
  Vector3,
} from "three";
import type { GardenRitualHandler } from "../systems/garden-director";
import { HARBOR_PALETTE } from "../systems/palette";
import { REST_SEAT_EYE_LANDSCAPE, REST_SEAT_YAW_RAD } from "../systems/rest-seat";

/**
 * X5 (O16, life-8): the seasonal dawn skein.
 *
 * On a few autumn and winter dawns (the score's `dawn-skein` ritual, only in
 * the migration kō) a loose V of geese crosses the dawn sky high and far:
 * nine to fifteen dark wing-strokes coming in over the top of the frame left
 * of the tower and slanting away into the haze on the left, well clear of the
 * tower and its crown. Silent (no sound beat is scheduled for it). Nothing here encodes
 * data. Reduced motion: the driver never starts it, so there is no skein.
 *
 * One instanced draw of ≤ 15 four-triangle glyphs. The formation offsets are
 * written once per crossing; per frame only the group root moves and one
 * clock uniform advances (wingbeats run in the vertex shader).
 */

export const GARDEN_SKEIN_MIN = 9;
export const GARDEN_SKEIN_MAX = 15;
export const GARDEN_SKEIN_SECONDS = 45;
/** Wingspan, world units: ≈ 33 px at 1600×1000 where the crossing starts, ≈ 18 where it fades. */
export const GARDEN_SKEIN_WINGSPAN = 3.4;
/** Geese beat steadily, never gliding: ~2.4 strokes a second. */
const WINGBEAT_HZ = 2.4;

/**
 * The crossing in rest-seat terms: `right` (world units across the view,
 * + = screen-right), `depth` (along the view from the rest eye) and
 * `elevation` (degrees above horizontal). It comes in over the top of the
 * frame left of the tower (x ≈ 0.5 of 1600×1000; the tower stands at 0.62)
 * and slants down and away across the open sky between the threshold pine and
 * the borrowed ridges, fading into the haze near x ≈ 0.16 before the pine's
 * pads — never in front of the tower or its crown.
 */
const CROSSING_FROM = { depth: 180, elevation: 11.5, right: 4 } as const;
const CROSSING_TO = { depth: 330, elevation: 4.8, right: -104 } as const;

const SEAT_RIGHT = new Vector3(Math.cos(REST_SEAT_YAW_RAD), 0, -Math.sin(REST_SEAT_YAW_RAD));
const SEAT_FORWARD = new Vector3(-Math.sin(REST_SEAT_YAW_RAD), 0, -Math.cos(REST_SEAT_YAW_RAD));

/** World position of a point on the crossing at progress `u` (0..1). */
export function gardenSkeinCrossingPoint(u: number, target = new Vector3()): Vector3 {
  const t = Math.min(1, Math.max(0, u));
  const depth = CROSSING_FROM.depth + (CROSSING_TO.depth - CROSSING_FROM.depth) * t;
  const right = CROSSING_FROM.right + (CROSSING_TO.right - CROSSING_FROM.right) * t;
  const elevation = (CROSSING_FROM.elevation + (CROSSING_TO.elevation - CROSSING_FROM.elevation) * t) * Math.PI / 180;
  const eye = REST_SEAT_EYE_LANDSCAPE.world;
  return target.set(eye.x, eye.y + depth * Math.tan(elevation), eye.z)
    .addScaledVector(SEAT_FORWARD, depth)
    .addScaledVector(SEAT_RIGHT, right);
}

/** A seeded, deterministic hash in [0, 1). */
function hash(n: number): number {
  const value = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export interface GardenSkeinGoose {
  /** Formation offset, world units: `back` behind the leader, `side` ±. */
  back: number;
  side: number;
  up: number;
  phase: number;
}

/**
 * A loose V for `seed`: a leader and two unequal arms at ~35° either side of
 * the line of flight, a little ragged, so it reads as birds and not a glyph.
 */
export function gardenSkeinFormation(seed: number): GardenSkeinGoose[] {
  const count = GARDEN_SKEIN_MIN + Math.floor(hash(seed) * (GARDEN_SKEIN_MAX - GARDEN_SKEIN_MIN + 1));
  const leftShare = 0.35 + hash(seed + 1) * 0.3;
  const geese: GardenSkeinGoose[] = [{ back: 0, phase: hash(seed + 2), side: 0, up: 0 }];
  let left = 0;
  let right = 0;
  for (let index = 1; index < count; index += 1) {
    const onLeft = hash(seed + index * 3.1) < leftShare ? left <= right * 2 : left * 2 < right;
    const rank = onLeft ? ++left : ++right;
    const spacing = 5.2 + hash(seed + index * 5.7) * 1.4;
    geese.push({
      back: rank * spacing * Math.cos(0.62) + (hash(seed + index * 7.3) - 0.5) * 1.1,
      phase: hash(seed + index * 11.9),
      side: (onLeft ? -1 : 1) * rank * spacing * Math.sin(0.62) + (hash(seed + index * 13.1) - 0.5) * 0.9,
      up: (hash(seed + index * 17.3) - 0.5) * 1.2,
    });
  }
  return geese;
}

/** One goose: long neck, body and two wings as four triangles, nose at +x. */
function createGooseGeometry(): BufferGeometry {
  const half = GARDEN_SKEIN_WINGSPAN / 2;
  const positions = [
    // Body and neck: a long thin lozenge.
    0.9, 0, 0, 0, 0, 0.1, -0.55, 0, 0,
    0.9, 0, 0, -0.55, 0, 0, 0, 0, -0.1,
    // Wings, swept a touch back.
    0.18, 0, 0, -0.18, 0, 0, -0.1, 0, half,
    0.18, 0, 0, -0.1, 0, -half, -0.18, 0, 0,
  ];
  const span = positions.map((_, index) => index).filter((index) => index % 3 === 2)
    .map((index) => positions[index]! / half);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSpan", new Float32BufferAttribute(span, 1));
  return geometry;
}

export interface GardenSkein {
  mesh: InstancedMesh<BufferGeometry, ShaderMaterial>;
  root: Group;
  /** The S-A `dawn-skein` ritual handler. */
  ritual: GardenRitualHandler;
  dispose: () => void;
  /** For tests: whether a crossing is in progress. */
  flying: () => boolean;
}

export interface GardenSkeinOptions {
  /** S-A `registerRitual`; `dispose` releases it. Omit in tests. */
  registerRitual?: (kind: "dawn-skein", handler: GardenRitualHandler) => () => void;
}

export function createGardenSkein(options: GardenSkeinOptions = {}): GardenSkein {
  const geometry = createGooseGeometry();
  const phases = new InstancedBufferAttribute(new Float32Array(GARDEN_SKEIN_MAX), 1);
  geometry.setAttribute("aPhase", phases);
  const material = new ShaderMaterial({
    depthWrite: false,
    side: DoubleSide,
    transparent: true,
    uniforms: {
      uClock: { value: 0 },
      uInk: {
        value: new Color(HARBOR_PALETTE.iron_dark).lerp(new Color(HARBOR_PALETTE.fog_blue), 0.42),
      },
      uOpacity: { value: 0 },
    },
    vertexShader: /* glsl */`
      attribute float aSpan;
      attribute float aPhase;
      uniform float uClock;
      void main() {
        vec3 p = position;
        // Steady deep strokes: the wing hinges at the body, tips lead.
        float stroke = sin(6.2831853 * (${WINGBEAT_HZ.toFixed(2)} * uClock + aPhase));
        float reach = abs(aSpan);
        p.y += stroke * 0.55 * reach * ${(GARDEN_SKEIN_WINGSPAN / 2).toFixed(3)};
        p.z *= 1.0 - 0.18 * reach * max(0.0, stroke);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uInk;
      uniform float uOpacity;
      void main() {
        gl_FragColor = vec4(uInk, uOpacity);
      }
    `,
  });
  const mesh = new InstancedMesh(geometry, material, GARDEN_SKEIN_MAX);
  mesh.name = "garden-dawn-skein";
  mesh.frustumCulled = false;
  mesh.count = 0;
  const root = new Group();
  root.name = "garden-dawn-skein-root";
  root.visible = false;
  root.add(mesh);

  let crossing: { formation: GardenSkeinGoose[]; start: number } | null = null;
  const point = new Vector3();
  const ahead = new Vector3();
  const matrix = new Matrix4();
  const heading = new Vector3();
  const lateral = new Vector3();
  const up = new Vector3(0, 1, 0);

  const place = (age: number) => {
    const u = age / GARDEN_SKEIN_SECONDS;
    gardenSkeinCrossingPoint(u, point);
    gardenSkeinCrossingPoint(u + 0.01, ahead);
    heading.copy(ahead).sub(point).normalize();
    lateral.crossVectors(heading, up).normalize();
    root.position.copy(point);
    // Group frame: +x along the line of flight, z lateral.
    matrix.makeBasis(heading, up, lateral);
    root.quaternion.setFromRotationMatrix(matrix);
    material.uniforms.uClock!.value = age;
    const fadeIn = Math.min(1, u / 0.1);
    const fadeOut = Math.min(1, (1 - u) / 0.3);
    material.uniforms.uOpacity!.value = 0.86 * Math.max(0, Math.min(fadeIn, fadeOut));
    // Loose: each bird drifts a little in its slot.
    const formation = crossing!.formation;
    for (let index = 0; index < formation.length; index += 1) {
      const goose = formation[index]!;
      matrix.makeTranslation(
        -goose.back + Math.sin(age * 0.37 + goose.phase * 6.28) * 0.35,
        goose.up + Math.sin(age * 0.29 + goose.phase * 9.1) * 0.3,
        goose.side + Math.cos(age * 0.31 + goose.phase * 4.7) * 0.3,
      );
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  const ritual: GardenRitualHandler = {
    start(t) {
      const formation = gardenSkeinFormation(Math.floor(t / 86_400) + 0.5);
      crossing = { formation, start: t };
      mesh.count = formation.length;
      for (let index = 0; index < formation.length; index += 1) phases.setX(index, formation[index]!.phase);
      phases.needsUpdate = true;
      root.visible = true;
      place(0);
    },
    update(t) {
      if (!crossing) return true;
      // A start stamped on another clock re-anchors instead of ending at once.
      if (Math.abs(t - crossing.start) > GARDEN_SKEIN_SECONDS * 4) crossing.start = t;
      const age = Math.max(0, t - crossing.start);
      if (age >= GARDEN_SKEIN_SECONDS) {
        crossing = null;
        root.visible = false;
        return true;
      }
      place(age);
      return false;
    },
    cancel() {
      crossing = null;
      root.visible = false;
    },
  };

  const release = options.registerRitual?.("dawn-skein", ritual) ?? null;
  return {
    dispose() {
      release?.();
      geometry.dispose();
      material.dispose();
    },
    flying: () => crossing !== null,
    mesh,
    ritual,
    root,
  };
}
