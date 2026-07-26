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
 * world-renderer — the only per-frame work is advancing three clocks. Orbit and
 * flap run in the vertex shader from deterministic seeds, so reduced motion
 * freezes the flock at its composed time-zero pose.
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
   * flock cut to the first of those would circle through the rig.
   */
  mastheadHeight: number;
  root: Object3D;
  ship: { id: string };
}

const vertexShader = /* glsl */`
  attribute float aSeed;
  attribute float aWing;
  uniform float uHeight;
  uniform float uTime;

  void main() {
    // Each gull rides its own slow ring, seeded so the flock never stacks.
    float orbit = uTime * (0.24 + aSeed * 0.12) + aSeed * 6.2831;
    // Ship-local, so a bigger hull carries a proportionally wider ring.
    float radius = 2.4 + aSeed * 1.8;
    vec3 center = vec3(
      cos(orbit) * radius,
      uHeight + sin(aSeed * 33.0) * 1.1,
      sin(orbit) * radius
    );
    vec3 p = position;
    p.y += sin(uTime * (6.0 + aSeed * 3.0) + aSeed * 17.0) * 0.14 * abs(aWing);
    float heading = orbit + 1.5708;
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
    const seeds = new Float32Array(GULLS_PER_SHIP);
    for (let index = 0; index < GULLS_PER_SHIP; index += 1) {
      seeds[index] = stableUnit(`ship-gull.${ship.ship.id}.${index}`);
    }
    geometry.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 1));

    const material = new ShaderMaterial({
      fragmentShader,
      side: DoubleSide,
      uniforms: {
        uColor: { value: GULL_COLOR },
        // Just clear of the masthead, so the flock reads over the rig rather
        // than through it. Driven per frame; see GardenGullShip.
        uHeight: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader,
    });

    const mesh = new InstancedMesh(geometry, material, GULLS_PER_SHIP);
    mesh.name = "ship-gulls";
    // The orbit is computed in the shader, not from instance matrices, so the
    // instance bounds say nothing useful about where these end up.
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
        mesh.material.uniforms.uHeight!.value = ship.mastheadHeight + 1.1;
        mesh.material.uniforms.uTime!.value = reducedMotion ? 0 : Math.max(0, timeSeconds);
      }
    },
  };
}
