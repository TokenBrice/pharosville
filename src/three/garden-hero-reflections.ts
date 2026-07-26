import {
  Color,
  FrontSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  UniformsLib,
  Vector3,
} from "three";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import {
  SEA_REGION_CHARACTER,
  SEA_REGION_ORDER,
  seaRegionAtTile,
} from "../systems/garden-sea-regions";

/**
 * W6.4: the fleet standing upside-down in the water beneath itself.
 *
 * The concept render's defining image, and until now only the Pharos had it.
 * `garden-water.ts` draws the tower's mirror column analytically inside the
 * water fragment, exploiting the fixed ortho-iso view direction so a reflection
 * is a vertical streak in water-local space rather than a real planar pass.
 *
 * That trick does not scale to a fleet — the tower is one hard-coded column,
 * and twenty-nine of them would be twenty-nine iterations of ALU on every water
 * fragment in the frame. So the heroes get the same image by the cheapest route
 * this renderer already trusts for per-ship work on the sea: one InstancedMesh,
 * exactly as `createShipShadows` does. One draw call for the whole hero fleet,
 * no second render pass, no extra target.
 *
 * It is not decoration. How mirror-like the water is belongs to the sea REGION
 * (`SEA_REGION_CHARACTER`: calm mirrors at 1.5, danger swallows light at 0.42),
 * so a hull's reflection reports the water it is riding: crisp in a calm
 * anchorage, a bare smear in the Danger Strait. Same encoding the water surface
 * already uses, read from the same field, now attached to the objects a visitor
 * is actually looking at.
 */

/** On the water, above the shadow discs, below the hulls. */
const REFLECTION_Y = GARDEN_WATER_Y + 0.018;

/** Restrained screen-space reach per world unit of mast height. */
const REFLECTION_LENGTH_PER_HEIGHT = 1.12;

/**
 * Peak opacity at the near end of a calm-water column. The reflection remains
 * readable without becoming an opaque rectangular light pool.
 */
const REFLECTION_PEAK_ALPHA = 0.42;

const REGION_REFLECTIVITY: readonly number[] = SEA_REGION_ORDER
  .map((name) => SEA_REGION_CHARACTER[name].reflectivity);

const vertexShader = /* glsl */`
  #include <fog_pars_vertex>
  varying vec2 vReflectUv;
  varying vec3 vReflectColor;
  varying float vReflectAlpha;
  attribute float aReflectAlpha;
  void main() {
    vReflectUv = uv;
    vReflectColor = instanceColor;
    vReflectAlpha = aReflectAlpha;
    #include <begin_vertex>
    #include <project_vertex>
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */`
  uniform float uTime;
  #include <fog_pars_fragment>
  varying vec2 vReflectUv;
  varying vec3 vReflectColor;
  varying float vReflectAlpha;
  void main() {
    // The quad is anchored at the hull, so v = 1 there; this runs the other
    // way, from the hull (0) out to the far end of the column (1).
    float along = 1.0 - vReflectUv.y;
    float across = abs(vReflectUv.x - 0.5) * 2.0;
    // A reflection frays as it travels: nearly the hull's own beam where it
    // leaves the waterline, wide and weak at the far end.
    float spread = 0.46 + along * 0.24;
    float width = 1.0 - smoothstep(spread * 0.28, spread, across);
    float reach = smoothstep(0.0, 0.05, along) * (1.0 - smoothstep(0.38, 0.9, along));
    // Broken into drifting bands, the same reading the Pharos column uses — a
    // reflection on moving water is never solid.
    float bands = 0.3 + 0.7 * smoothstep(
      0.3, 0.82,
      0.5 + 0.5 * sin(along * 21.0 - uTime * 0.55)
    );
    // A second, slower breakup removes the rectangular far edge of the
    // instanced plane without adding another texture or pass.
    float breakup = smoothstep(
      0.22,
      0.76,
      0.5 + 0.5 * sin(along * 9.0 + across * 4.0 + uTime * 0.18)
    );
    float alpha = width * reach * bands * (0.55 + breakup * 0.45) * vReflectAlpha;
    #ifdef USE_FOG
      // The sea it lies on fades into the fog, so the image on it must too.
      // Attenuating alpha rather than mixing toward fogColor keeps a distant
      // reflection from lighting up against the haze it should be dissolving in.
      alpha *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(vReflectColor, alpha);
  }
`;

export interface GardenHeroReflections {
  readonly mesh: InstancedMesh<PlaneGeometry, ShaderMaterial>;
  /**
   * Writes one hull's column. `strength` is the caller's own gate (the overview
   * LOD fade); the sea region's contribution is looked up here. `width` is the
   * hull's footprint on the water.
   */
  place(input: {
    color: Color;
    index: number;
    mastheadHeight: number;
    strength: number;
    tileX: number;
    tileY: number;
    width: number;
    worldX: number;
    worldZ: number;
  }): void;
  /** One upload per buffer per frame, after the last `place`. */
  flush(timeSeconds: number): void;
}

const scratchMatrix = new Matrix4();
const scratchPosition = new Vector3();
const scratchScale = new Vector3();
const scratchColor = new Color();
/**
 * A mirror image hangs STRAIGHT DOWN the screen from the thing it reflects. In
 * this rig that is the world ground direction (1, 0, 1)/sqrt2 — not +z, which
 * would rake the column off to one side — so every column is yawed 45°, and its
 * width then runs along (1, 0, -1), the screen horizontal.
 */
const REFLECTION_ROTATION = new Quaternion()
  .setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4);

/**
 * How mirror-like a sea region is, normalised so calm water reads as a
 * full-strength column and danger water as a residue.
 *
 * 0.42 (danger) -> 0.1, 1 (open) -> 0.58, 1.5 (calm) -> 1. It never reaches
 * zero: "gone" would be indistinguishable from a hull with no reflection wired
 * at all, and the reading wanted is failing, not absent.
 */
export function heroReflectionStrengthForRegion(regionId: number): number {
  const reflectivity = REGION_REFLECTIVITY[regionId] ?? 1;
  return Math.min(1, Math.max(0.1, (reflectivity - 0.29) / 1.21));
}

/** The same, for the water under a tile. */
export function heroReflectionSeaStrength(tileX: number, tileY: number): number {
  return heroReflectionStrengthForRegion(
    seaRegionAtTile(Math.round(tileX), Math.round(tileY)),
  );
}

export function createGardenHeroReflections(count: number): GardenHeroReflections {
  // Anchored at the hull end so a column grows away from the ship rather than
  // out of both sides of it, then laid flat on the water: local +z is the
  // column's reach, local x its width.
  const geometry = new PlaneGeometry(1, 1);
  geometry.translate(0, -0.5, 0);
  geometry.rotateX(-Math.PI / 2);
  const material = new ShaderMaterial({
    depthWrite: false,
    fog: true,
    fragmentShader,
    side: FrontSide,
    transparent: true,
    uniforms: {
      ...UniformsLib.fog,
      uTime: { value: 0 },
    },
    vertexShader,
  });
  const instances = Math.max(1, count);
  const alphas = new InstancedBufferAttribute(new Float32Array(instances), 1);
  geometry.setAttribute("aReflectAlpha", alphas);
  const mesh = new InstancedMesh(geometry, material, instances);
  mesh.name = "garden-hero-reflections";
  // Every column is written every frame from a live hull transform, and the
  // instance bounds would have to be recomputed to cull honestly.
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  // Allocates the colour buffer, which the program needs at compile time.
  mesh.setColorAt(0, scratchColor.set("#ffffff"));
  return {
    mesh,
    place({ color, index, mastheadHeight, strength, tileX, tileY, width, worldX, worldZ }) {
      const alpha = Math.max(0, strength)
        * heroReflectionSeaStrength(tileX, tileY)
        * REFLECTION_PEAK_ALPHA;
      // The column always hangs toward the viewer — +z in this fixed ortho-iso
      // rig — so it never takes the hull's heading, only its footprint width.
      scratchScale.set(width * 0.68, 1, mastheadHeight * REFLECTION_LENGTH_PER_HEIGHT);
      scratchPosition.set(worldX, REFLECTION_Y, worldZ);
      scratchMatrix.compose(scratchPosition, REFLECTION_ROTATION, scratchScale);
      mesh.setMatrixAt(index, scratchMatrix);
      mesh.setColorAt(index, scratchColor.copy(color));
      alphas.setX(index, alpha);
    },
    flush(timeSeconds) {
      mesh.material.uniforms.uTime!.value = timeSeconds;
      mesh.instanceMatrix.needsUpdate = true;
      alphas.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}
