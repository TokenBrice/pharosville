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
import {
  GARDEN_BIRD_SORTIE_CHANCE,
  GARDEN_BIRD_SORTIE_GLSL,
  GARDEN_BIRD_SORTIE_PERIOD,
  GARDEN_BIRD_SORTIE_SHARE,
} from "./garden-summit-birds";
import { stableUnit } from "./garden-util";

/**
 * Gulls over the three largest hulls in the fleet (fleet plan §9).
 *
 * Working harbours have birds over the big ships, and small moving things
 * beside a big static thing is the cheapest presence there is — the same reason
 * `garden-summit-birds.ts` puts a flock over the Pharos crown. This marks the
 * three largest market caps as ALIVE without spending a legend entry on it: a
 * visitor reads "that one matters" from the traffic over it, and if they never
 * notice, nothing has been taken away. Decoration, and honest about it.
 *
 * Each flock is parented to its ship's own root, so it inherits the hull's
 * position, heading, heel and bob for free and needs no per-frame placement in
 * world-renderer — the only per-frame work is advancing three clocks.
 *
 * ## W3.4: they sit on the rig
 *
 * These gulls used to ride permanent rings around the masthead — five per hull,
 * airborne forever, orbiting empty air a metre clear of the rig. Now they SIT,
 * on the two horizontal spars every hero rig has: the masthead truck and the
 * identity frame's head spar about 1.7 below it (`generate-garden-heroes.mjs`
 * puts the head spar at 6.4/6.5/6.7 under mastheads at 8.05/8.25/8.35 — the same
 * gap on all three bespoke hulls, so the offset is taken off the LIVE masthead
 * rather than off any one model). Every so often one lifts, flies a single wide
 * turn out abeam over the water, and settles back where she was.
 *
 * The choreography is `garden-summit-birds.ts`'s, shared with the whole harbour,
 * so the flock is still a pure function of the one clock and reduced motion is
 * still a composed still — now a still of five birds sitting on a yard, which is
 * a truer picture of a moored ship than five birds frozen mid-orbit ever was.
 */

const GULLS_PER_SHIP = 5;
/** How many hulls carry a flock. The three largest, by market cap. */
export const GARDEN_GULL_SHIP_COUNT = 3;
/** The LOD name every flock group answers to; see `garden-overview-lod`. */
export const GARDEN_GULL_FLOCK_NAME = "ship-gull-flock";

// Dark iron, the same silhouette read the summit birds use. Foam white was
// tried first and vanished: at seven pixels against pale sunlit water and the
// sea's own foam, a white bird is camouflage.
const GULL_COLOR = new Color(HARBOR_PALETTE.iron_dark);

/**
 * Perches, in ship-local units, as (x, height BELOW the live masthead, z).
 *
 * Two on the truck itself, either side of the pole; three spread along the head
 * spar, which reaches ±1.37 at its narrowest of the three hero rigs — so |z|
 * stays inside 1.3. Unequal on purpose: a symmetric five would read as fittings
 * rather than as birds. The x is the mean of the three rigs' spar stations; they
 * differ by about half a unit, which is under a bird length at this scale.
 */
const PERCHES: readonly [number, number, number][] = [
  [0.35, 0.0, -0.19],
  [0.35, 0.06, 0.21],
  [0.35, 1.68, -1.24],
  [0.35, 1.68, 0.57],
  [0.35, 1.72, 1.29],
];

/**
 * The turn: a wide circle abeam. D2 (2026-09-05) widened it 1.4 ± 0.7 →
 * 2.4 ± 0.7 so the far side of the sweep runs 4.8–6.2 out over the water —
 * past where the old permanent ring ever reached — and the sortie reads at the
 * zoom-1.0 rest. The tangent property is width-independent: the loop never
 * comes back inboard of its perch's side of the rig, so she still crosses
 * neither rig nor hull, and the mast is only ever beside her at truck height,
 * where the pole is below her. Displacement: none new — the same oscillator,
 * tuned.
 */
const LOOP_RADIUS = 2.4;
const LOOP_RADIUS_SPREAD = 0.7;
/** Lifts her to roughly the old flock height at the top of the turn. */
const CLIMB = 2.8;
const CLIMB_SPREAD = 0.8;

export interface GardenShipGulls {
  update(input: {
    reducedMotion: boolean;
    timeSeconds: number;
    visible: boolean;
  }): void;
}

/** Structurally satisfied by `ShipVisual`, which is what the renderer passes. */
export interface GardenGullShip {
  /**
   * Ship-local units. Read LIVE each frame, not captured: a hero's masthead is
   * the procedural rig's until its GLB resolves and then the model's, and a
   * flock cut to the first of those would perch on the rig that is no longer
   * there.
   */
  mastheadHeight: number;
  root: Object3D;
  ship: { id: string };
}

const vertexShader = /* glsl */`
  attribute float aSeed;
  attribute vec3 aPerch;
  attribute float aWing;
  uniform float uFlight;
  uniform float uHeight;
  uniform float uTime;

  ${GARDEN_BIRD_SORTIE_GLSL}

  void main() {
    float sortie = uFlight * gardenBirdSortieAt(
      aSeed, uTime, ${GARDEN_BIRD_SORTIE_PERIOD.toFixed(1)},
      ${GARDEN_BIRD_SORTIE_CHANCE.toFixed(2)}, ${GARDEN_BIRD_SORTIE_SHARE.toFixed(2)}
    );

    // Her spot on the rig, hung off the hull's LIVE masthead.
    vec3 perch = vec3(aPerch.x, uHeight - aPerch.y, aPerch.z);

    // One closed turn, bulging out to the side of the ship she sits on, so she
    // never flies through the rig or the hull.
    vec2 out2 = normalize(vec2((aSeed - 0.5) * 0.8, aPerch.z < 0.0 ? -1.0 : 1.0));
    float theta = sortie * 6.2831853;
    float loop = ${LOOP_RADIUS.toFixed(2)} + aSeed * ${LOOP_RADIUS_SPREAD.toFixed(2)};
    vec2 offset = (vec2(-out2.y, out2.x) * sin(theta) + out2 * (1.0 - cos(theta))) * loop;
    float climb = sin(3.14159265 * sortie)
      * (${CLIMB.toFixed(2)} + aSeed * ${CLIMB_SPREAD.toFixed(2)});
    vec3 center = perch + vec3(offset.x, climb, offset.y);

    // Wings fold on the spar and only beat once she is up.
    float air = smoothstep(0.0, 0.22, sin(3.14159265 * sortie));
    vec3 p = position;
    p.z *= mix(0.58, 1.0, air);
    p.y += sin(uTime * (6.0 + aSeed * 3.0) + aSeed * 17.0) * 0.14 * abs(aWing) * air;

    float heading = atan(out2.x, -out2.y) - theta;
    float c = cos(heading);
    float s = sin(heading);
    p = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(center + p, 1.0);
  }
`;

const fragmentShader = /* glsl */`
  uniform vec3 uColor;
  void main() {
    gl_FragColor = vec4(uColor, 1.0);
  }
`;

/**
 * One flock per ship, one draw call each. Returns the clock driver; the flocks
 * are already parented to the hulls they belong to.
 */
export function createGardenShipGulls(ships: readonly GardenGullShip[]): GardenShipGulls {
  // Two triangles sharing the body edge, as the summit birds do: nose, tail,
  // wingtip, mirrored. Smaller — these ride a hull, not a monument.
  const positions = new Float32Array([
    0.16, 0, 0, -0.15, 0, 0.04, 0.015, 0, -0.3,
    0.16, 0, 0, -0.15, 0, -0.04, 0.015, 0, 0.3,
  ]);
  const wing = new Float32Array([0, 0, -1, 0, 0, 1]);
  const positionAttribute = new Float32BufferAttribute(positions, 3);
  const wingAttribute = new Float32BufferAttribute(wing, 1);
  const perchAttribute = new InstancedBufferAttribute(
    new Float32Array(PERCHES.flat()),
    3,
  );
  const flocks: {
    mesh: InstancedMesh<BufferGeometry, ShaderMaterial>;
    ship: GardenGullShip;
  }[] = [];

  for (const ship of ships) {
    const geometry = new BufferGeometry();
    // The body attributes are shared objects across the flocks; only the seeds
    // differ, so one gull never mirrors another ship's gull.
    geometry.setAttribute("position", positionAttribute);
    geometry.setAttribute("aWing", wingAttribute);
    geometry.setAttribute("aPerch", perchAttribute);
    const seeds = new Float32Array(GULLS_PER_SHIP);
    for (let index = 0; index < GULLS_PER_SHIP; index += 1) {
      // Index first: FNV-1a barely moves for names differing in their last
      // character, and five gulls sharing a seed to three decimals would share
      // a loop radius, a climb and a window boundary. See garden-summit-birds.
      seeds[index] = stableUnit(`${index}.ship-gull.${ship.ship.id}`);
    }
    geometry.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 1));

    const material = new ShaderMaterial({
      fragmentShader,
      side: DoubleSide,
      uniforms: {
        uColor: { value: GULL_COLOR },
        // 0 under reduced motion: every gull resolves to her spar.
        uFlight: { value: 1 },
        // The hull's live masthead; the perches hang off it. Driven per frame;
        // see GardenGullShip.
        uHeight: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader,
    });

    const mesh = new InstancedMesh(geometry, material, GULLS_PER_SHIP);
    mesh.name = "ship-gulls";
    // The perch and the turn are computed in the shader, not from instance
    // matrices, so the instance bounds say nothing useful about where these
    // end up.
    mesh.frustumCulled = false;
    flocks.push({ mesh, ship });

    // The flock group is what the overview policy sheds; the mesh's own
    // visibility is the tier gate below, and the two never fight because
    // three's visibility is hierarchical.
    const flock = new Group();
    flock.name = GARDEN_GULL_FLOCK_NAME;
    flock.add(mesh);
    ship.root.add(flock);
  }

  return {
    update({ reducedMotion, timeSeconds, visible }) {
      for (const { mesh, ship } of flocks) {
        mesh.visible = visible;
        if (!visible) continue;
        mesh.material.uniforms.uHeight!.value = ship.mastheadHeight;
        mesh.material.uniforms.uFlight!.value = reducedMotion ? 0 : 1;
        mesh.material.uniforms.uTime!.value = reducedMotion ? 0 : Math.max(0, timeSeconds);
      }
    },
  };
}
