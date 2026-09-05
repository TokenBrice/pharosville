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
 * W7 presence — the summit bird flock (Pharos Wonder plan §3.4), rewritten at
 * W3.4 as the harbour's SHARED rest-and-sortie choreography. This module owns
 * that choreography for every bird in the world; `garden-ship-gulls.ts` and
 * `garden-harbor-life.ts` import it (the GLSL chunk below and its exact
 * TypeScript twin) so the whole harbour keeps one bird behaviour.
 *
 * ## Presence through intermittency
 *
 * Eight instanced two-triangle birds used to orbit the Pharos crown forever. So
 * did the gulls over the hero hulls, the island flock and every quay's pair —
 * roughly forty birds, all airborne, all the time, wheeling on permanent rings.
 * Real flocks do not do that. They SIT: on rails, cornices, mastheads and
 * bollards, and every so often one lifts, flies a turn, and settles again. Forty
 * birds circling forever reads as clockwork; eight birds sitting still with two
 * or three of them up reads as a harbour that happens to have birds in it — and
 * it is quieter, which is the whole of Wave 3.
 *
 * So each bird now sits on a real ledge of the monument (the cornice ring at the
 * head of the octagonal drum, just under the brazier) and leaves it only for a
 * deterministic sortie: one wide circle out over the sea that begins and ends on
 * the very perch it left. At any instant about a third of the flock is up
 * (warm-village D2, 2026-09-05: the W3.4 quarter became a third — amplitude,
 * not count; the same eight birds, aloft longer on wider turns).
 *
 * ## Still a pure function of the one clock
 *
 * Nothing here accumulates. A bird's whole state is `f(seed, uTime)`: the sortie
 * windows come from hashing (bird, window index), the flight path is a closed
 * loop parameterised by one eased progress value, and a bird outside a sortie
 * window evaluates to exactly its perch. Reduced motion sets `uFlight` to 0,
 * which resolves every bird to that perch — a complete static composition of the
 * flock at rest, with the clock read nowhere.
 *
 * One instanced draw call, unchanged. Full/balanced tiers only.
 */

const BIRD_COUNT = 8;
// C1: palette-derived silhouette (dark iron against the sky bands).
const BIRD_COLOR = new Color(HARBOR_PALETTE.iron_dark);

/**
 * Seconds between a bird's own sortie windows. One roll of the die per window
 * per bird; a bird that rolls a sortie spends `SORTIE_SHARE` of that window in
 * the air, so the share of the flock airborne at any instant is
 * `SORTIE_CHANCE * SORTIE_SHARE` — about a third (0.55 × 0.6), deliberately.
 *
 * Long on purpose: the eye must never be able to count the beat. A bird's next
 * turn is somewhere in the next minute or two, and the windows are offset per
 * bird, so the flock has no shared phase to notice.
 *
 * D2 (2026-09-05) raised the share 0.45 → 0.6 so flight reads at the zoom-1.0
 * rest; the chance, the period and the per-bird phase offsets are untouched
 * (the W3.4 clockwork critique stands). Displacement: none — this re-tunes an
 * existing oscillator, adds no clock, no draw and no bird, and slows or stops
 * nothing else.
 */
export const GARDEN_BIRD_SORTIE_PERIOD = 62;
export const GARDEN_BIRD_SORTIE_CHANCE = 0.55;
export const GARDEN_BIRD_SORTIE_SHARE = 0.6;

/**
 * The shared choreography, as GLSL. Inlined into the bird vertex shaders (this
 * module's and `garden-ship-gulls.ts`'s); `gardenBirdSortie` below is its exact
 * twin for the CPU-side flock in `garden-harbor-life.ts`.
 *
 * `gardenBirdSortieAt` returns the bird's progress through her sortie, in
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

/**
 * The perch is relative to the brazier origin (30.2 lighthouse-local).
 * Epic Pharos 2026-09-05 shares a drum-head ledge in shell and GLB:
 * y 29.0–29.4, outer radius 2.55. Birds stand just above its top and
 * outside the lantern columns (radius 1.9), with wing clearance at the lip.
 */
const PERCH_RADIUS = 2.6;
const PERCH_Y = 29.44 - 30.2;
/**
 * The turn. Warm-village D2 (2026-09-05) widened the W3.4 loop 3.6 ± 0.9 →
 * 6 ± 1.2 and lifted the climb 4.4 → 6 so a sortie reads at the zoom-1.0 rest:
 * the far side of the circle now sweeps 12.2–17.0 from the tower's axis,
 * past where the old permanent orbit ran (8.2–9.8), and mid-turn carries her
 * above the brazier plane — the composition the flock always
 * had, now visited on a wider beat rather than inhabited.
 *
 * Epic Pharos clearances: the loop is tangent to the perch, and its closest
 * approach to the axis is the perch radius itself — 2.6 — because the outward
 * component is never negative. It clears the lantern columns (radius 1.9
 * plus their capitals) and the 2.17-radius cap throughout the climb; the
 * figure above the cap is narrower still. No oscillator or bird count changes.
 */
const LOOP_RADIUS = 6;
const LOOP_RADIUS_SPREAD = 1.2;
const CLIMB = 6;
const CLIMB_SPREAD = 2.4;

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
  // aWing marks the wingtips (±1) so the flap displaces them only, and so the
  // wings can fold on the perch.
  const positions = new Float32Array([
    0.22, 0, 0, -0.2, 0, 0.05, 0.02, 0, -0.4,
    0.22, 0, 0, -0.2, 0, -0.05, 0.02, 0, 0.4,
  ]);
  const wing = new Float32Array([0, 0, -1, 0, 0, 1]);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aWing", new Float32BufferAttribute(wing, 1));
  const seeds: number[] = [];
  const perches: number[] = [];
  for (let index = 0; index < BIRD_COUNT; index += 1) {
    // The index LEADS the name on purpose. `stableUnit` is FNV-1a, and FNV on
    // names that differ only in their last character returns values a few
    // thousandths apart — eight birds seeded `summit-bird.0..7` all came out
    // between 0.576 and 0.604, which would have given the flock one shared loop
    // radius, one shared climb and eight window boundaries within 3 % of each
    // other. Leading with the index avalanches the whole hash.
    const seed = stableUnit(`${index}.summit-bird`);
    seeds.push(seed);
    // Spread round the ring by index and then jittered by seed: an even ring of
    // eight would read as a machined collar, and two hashed seeds landing close
    // together would read as one bird. Unequal spacing is the point (fukinsei).
    perches.push(((index + 0.5) / BIRD_COUNT + (seed - 0.5) * 0.42) * Math.PI * 2);
  }
  geometry.setAttribute("aSeed", new InstancedBufferAttribute(new Float32Array(seeds), 1));
  geometry.setAttribute("aPerch", new InstancedBufferAttribute(new Float32Array(perches), 1));

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
      // 0 under reduced motion: every bird resolves to her perch and the clock
      // is never consulted, so the still frame is one composed roost.
      uFlight: { value: 1 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      attribute float aPerch;
      attribute float aWing;
      uniform float uFlight;
      uniform float uTime;

      ${GARDEN_BIRD_SORTIE_GLSL}

      void main() {
        float sortie = uFlight * gardenBirdSortieAt(
          aSeed, uTime, ${GARDEN_BIRD_SORTIE_PERIOD.toFixed(1)},
          ${GARDEN_BIRD_SORTIE_CHANCE.toFixed(2)}, ${GARDEN_BIRD_SORTIE_SHARE.toFixed(2)}
        );

        // Her place on the cornice ring, and the outward direction from it.
        vec2 out2 = vec2(cos(aPerch), sin(aPerch));
        vec3 perch = vec3(out2.x * ${PERCH_RADIUS.toFixed(2)}, ${PERCH_Y.toFixed(2)}, out2.y * ${PERCH_RADIUS.toFixed(2)});

        // One closed seaward circle, beginning and ending on the perch.
        float theta = sortie * 6.2831853;
        float loop = ${LOOP_RADIUS.toFixed(2)} + aSeed * ${LOOP_RADIUS_SPREAD.toFixed(2)};
        vec2 tangent = vec2(-out2.y, out2.x);
        vec2 offset = (tangent * sin(theta) + out2 * (1.0 - cos(theta))) * loop;
        float climb = sin(3.14159265 * sortie)
          * (${CLIMB.toFixed(2)} + aSeed * ${CLIMB_SPREAD.toFixed(2)});
        vec3 center = perch + vec3(offset.x, climb, offset.y);

        // Wings fold on the stone and only beat once she is up.
        float air = smoothstep(0.0, 0.22, sin(3.14159265 * sortie));
        vec3 p = position;
        p.z *= mix(0.58, 1.0, air);
        p.y += sin(uTime * (5.0 + aSeed * 2.5) + aSeed * 21.0) * 0.17 * abs(aWing) * air;

        // Facing: the launch bearing, turned by the same angle the loop has.
        float heading = aPerch + 1.5707963 - theta;
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
      material.uniforms.uFlight.value = reducedMotion ? 0 : 1;
      material.uniforms.uTime.value = reducedMotion ? 0 : Math.max(0, timeSeconds);
    },
  };
}
