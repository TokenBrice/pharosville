import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
  GARDEN_WATER_Y as WATER_LEVEL,
  gardenIslandDisplayTile,
} from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import type { PharosVilleWorld } from "../systems/world-types";
import { createLighthouse } from "./garden-lighthouse";
import { setTilePosition, stableUnit } from "./garden-util";
import type { GardenCloudShadowSource } from "./garden-water-contract";

const scratchMatrix = new Matrix4();
const scratchLeanAxis = new Vector3();
const scratchLeanQuaternion = new Quaternion();

// Height-graded rock ramp: dark wet stone at the waterline climbs to pale
// weathered limestone at the crown. Terrace tops carry a planted colour.
const WATERLINE_Y = WATER_LEVEL;
const CROWN_RAMP_Y = 3.4;
const STONE_WET = new Color("#242d28");
const STONE_MID = new Color("#828874");
const STONE_PALE = new Color("#d2cba9");
const TERRACE_WET = new Color("#33403a");
const TERRACE_MOSS = new Color("#6f8557");
const UP_AXIS = new Vector3(0, 1, 0);
const scratchPosition = new Vector3();
const scratchScale = new Vector3();
const scratchQuaternion = new Quaternion();

// Stone lanterns lining the garden path (root-relative). Their warm tops feed
// the shared light-lane registry; the orchestrator wires the registration
// using `gardenIslandLanternWorldOffsets()`.
const ISLAND_LANTERN_POSITIONS = [
  [5.5, 1.22, 3.45],
  [3.4, 1.55, 3.6],
  [1.4, 2.12, 2.52],
  [-0.7, 2.16, 2.4],
  [-3.2, 2.78, 0.65],
  [-3.9, 2.62, -0.3],
] as const;
const LANTERN_LAMP_LOCAL_Y = 0.88;

/**
 * The four craggy rock tiers, as
 * `[topRadius, bottomRadius, height, segments, seed, x, y, z, scaleZ, rotation, topColor]`.
 * Hoisted from the build loop so `islandTerrainHeight()` seats the W4.9
 * additions (stair, talus, planting) against the same numbers the geometry is
 * cut from — a stair floating a hand-tuned distance above the rock was the
 * failure mode this avoids.
 */
const ISLAND_TIERS = [
  [16.8, 18.4, 1.45, 32, 0.3, 0.6, -0.74, 1.2, 0.75, 0.08, TERRACE_WET],
  [13.7, 15.7, 1.72, 30, 1.25, -1.8, 0.05, 0.65, 0.7, -0.12, TERRACE_WET],
  [10.1, 12.3, 1.55, 28, 2.2, -4.45, 1.22, 0.05, 0.64, 0.18, TERRACE_MOSS],
  [6.1, 8.1, 1.15, 24, 3.35, -6.7, 2.18, -1.1, 0.66, -0.08, TERRACE_MOSS],
] as const;

/**
 * Height of the rock surface at a root-relative point: the highest tier whose
 * top cap covers it, or an interpolation down the battered face of whichever
 * tier it sits on. The tier meshes are also radially displaced and yawed a few
 * degrees, so this is an approximation — close enough to seat props on, which
 * is all it is used for.
 */
function islandTerrainHeight(x: number, z: number): number {
  let height = WATER_LEVEL;
  for (const [topRadius, bottomRadius, tierHeight, , , cx, cy, cz, scaleZ] of ISLAND_TIERS) {
    const top = cy + tierHeight / 2;
    const base = cy - tierHeight / 2;
    const inner = Math.hypot((x - cx) / topRadius, (z - cz) / (topRadius * scaleZ));
    if (inner <= 1) {
      height = Math.max(height, top);
      continue;
    }
    const outer = Math.hypot((x - cx) / bottomRadius, (z - cz) / (bottomRadius * scaleZ));
    if (outer > 1) continue;
    // On the battered face: the tier's skirt runs from `bottomRadius` at its
    // base up to `topRadius` at its cap.
    const across = (1 - outer) / Math.max(1e-3, 1 - topRadius / bottomRadius);
    height = Math.max(height, base + (top - base) * clamp01(across));
  }
  return height;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

// W4.9 sedimentary bedding. The rock ramp was a smooth wet→pale gradient,
// which is a large part of why the island read as a moulded blob: real sea
// rock is layered, and the bedding planes are what give a cliff its scale. One
// bed is ~0.62 world units, with a shadow line at each bed's base and
// alternating harder (proud, pale) and softer (recessed, dark) courses. This
// is the island's echo of the ashlar coursing on the tower above it.
const STRATA_PERIOD = 0.62;

function strataShade(worldY: number): number {
  const phase = (worldY - WATERLINE_Y) / STRATA_PERIOD;
  const bed = phase - Math.floor(phase);
  const bedding = 1 - 0.18 * (1 - smoothstep01(bed / 0.26));
  const alternating = (((Math.floor(phase) % 2) + 2) % 2) === 0 ? 1.05 : 0.93;
  return bedding * alternating;
}

/**
 * World offsets (relative to the island root) of each path lantern's warm lamp,
 * for the caller to register as light lanes on the sea.
 */
export function gardenIslandLanternWorldOffsets(): { x: number; y: number; z: number }[] {
  return ISLAND_LANTERN_POSITIONS.map(([x, y, z]) => ({
    x,
    y: y + LANTERN_LAMP_LOCAL_Y,
    z,
  }));
}

export function createWaterAccents(): Group {
  const root = new Group();
  const indices: number[] = [];
  const positions: number[] = [];
  for (let index = 0; index < 96; index += 1) {
    const centerX = (stableUnit(`water-accent-x.${index}`) - 0.5) * 172;
    const centerZ = (stableUnit(`water-accent-z.${index}`) - 0.5) * 128;
    const radius = 0.75 + stableUnit(`water-accent-r.${index}`) * 2.4;
    const start = -0.52 + stableUnit(`water-accent-a.${index}`) * 0.44;
    const arc = 0.22 + stableUnit(`water-accent-l.${index}`) * 0.34;
    for (let segment = 0; segment < 3; segment += 1) {
      const first = start + (segment / 3) * arc;
      const second = start + ((segment + 1) / 3) * arc;
      const ax = centerX + Math.cos(first) * radius * 2.5;
      const az = centerZ + Math.sin(first) * radius;
      const bx = centerX + Math.cos(second) * radius * 2.5;
      const bz = centerZ + Math.sin(second) * radius;
      const length = Math.max(0.001, Math.hypot(bx - ax, bz - az));
      const width = 0.12 + stableUnit(`water-accent-w.${index}.${segment}`) * 0.08;
      const px = (-(bz - az) / length) * width;
      const pz = ((bx - ax) / length) * width;
      const vertex = positions.length / 3;
      positions.push(
        ax + px, WATER_LEVEL + 0.052, az + pz,
        ax - px, WATER_LEVEL + 0.052, az - pz,
        bx + px, WATER_LEVEL + 0.052, bz + pz,
        bx - px, WATER_LEVEL + 0.052, bz - pz,
      );
      indices.push(
        vertex, vertex + 1, vertex + 2,
        vertex + 2, vertex + 1, vertex + 3,
      );
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const accents = new Mesh(
    geometry,
    new MeshBasicMaterial({
      color: "#d7e7d8",
      depthWrite: false,
      opacity: 0.28,
      side: DoubleSide,
      transparent: true,
    }),
  );
  accents.name = "water-silver-accents";
  accents.renderOrder = 3;
  root.add(accents);
  return root;
}

/**
 * I3 (contract C2(c)): when the integrator passes Lane W's shared cloud-shadow
 * source (`scene.water.cloudShadows`), every lit island material samples the
 * same world-XZ cloud mask the water uses, so light weather drifts across the
 * whole garden at once. With the option absent the island renders exactly as
 * before — the hook is purely additive.
 */
export function createTerracedIsland(
  world: PharosVilleWorld,
  cloudShadows?: GardenCloudShadowSource,
): {
  beacon: Mesh<SphereGeometry, MeshStandardMaterial>;
  beaconHalo: Mesh<SphereGeometry, MeshBasicMaterial>;
  beam: Group;
  decoration: Group;
  lighthouseLight: PointLight;
  lighthouseRoot: Group;
  lighthouseShell: Group;
  root: Group;
} {
  const root = new Group();
  setTilePosition(root, gardenIslandDisplayTile(world.lighthouse.tile), 0);

  const rockMaterial = new MeshStandardMaterial({
    flatShading: true,
    roughness: 0.95,
    vertexColors: true,
  });

  const shoal = new Mesh(
    createIrregularTerraceGeometry(19.6, 20.5, 0.16, 36, 0.8),
    new MeshBasicMaterial({
      color: "#5ca394",
      depthWrite: false,
      opacity: 0.28,
      transparent: true,
    }),
  );
  shoal.position.set(1.2, WATER_LEVEL + 0.055, 1.5);
  shoal.scale.z = 0.72;
  shoal.renderOrder = 1;
  root.add(shoal);

  // Craggy stone tiers: same footprint and top-shelf heights as before, but
  // re-skinned as displaced rock with a wet-base → pale-crown vertex gradient.
  for (const [topRadius, bottomRadius, height, segments, seed, x, y, z, scaleZ, rotation, topColor] of ISLAND_TIERS) {
    const tier = new Mesh(
      createRockTerraceGeometry(topRadius, bottomRadius, height, segments, seed, y, topColor),
      rockMaterial,
    );
    tier.position.set(x, y, z);
    tier.scale.z = scaleZ;
    tier.rotation.y = rotation;
    tier.castShadow = true;
    tier.receiveShadow = true;
    root.add(tier);
  }

  for (const [radius, x, y, z, scaleZ, seed] of [
    [4.55, 3.55, 0.92, 2.9, 0.48, 0.4],
    [3.65, -6.0, 1.9, 2.0, 0.43, 1.8],
    [2.9, 2.25, 2.42, -3.7, 0.52, 2.7],
  ] as const) {
    const plantedShelf = new Mesh(
      createRockTerraceGeometry(radius, radius * 1.06, 0.2, 16, seed, y, TERRACE_MOSS, 0.06),
      rockMaterial,
    );
    plantedShelf.position.set(x, y, z);
    plantedShelf.scale.z = scaleZ;
    plantedShelf.rotation.y = x * 0.08;
    plantedShelf.castShadow = true;
    plantedShelf.receiveShadow = true;
    root.add(plantedShelf);
  }

  root.add(createShorelineBoulders());

  const pathMaterial = new MeshStandardMaterial({
    color: "#d2c9af",
    flatShading: true,
    roughness: 1,
  });
  for (const [x, y, z, width, rotation] of [
    [5.3, 1.16, 3.35, 2.7, -0.46],
    [3.25, 1.45, 3.0, 2.35, -0.3],
    [1.25, 1.78, 2.45, 2.1, -0.23],
    [-0.55, 2.06, 1.8, 1.9, -0.18],
    [-2.2, 2.32, 1.1, 1.75, -0.13],
    [-3.75, 2.55, 0.35, 1.55, -0.03],
    [-5.2, 2.72, -0.35, 1.4, 0.08],
  ] as const) {
    const pathStep = new Mesh(new BoxGeometry(width, 0.18, 0.82), pathMaterial);
    pathStep.position.set(x, y, z);
    pathStep.rotation.y = rotation;
    root.add(pathStep);
  }

  const lighthouseRoot = new Group();
  lighthouseRoot.position.set(
    GARDEN_LIGHTHOUSE_ROOT_OFFSET.x,
    GARDEN_LIGHTHOUSE_ROOT_OFFSET.y,
    GARDEN_LIGHTHOUSE_ROOT_OFFSET.z,
  );
  root.add(lighthouseRoot);
  const lighthouse = createLighthouse();
  lighthouseRoot.add(lighthouse.root);

  const decoration = createIslandDecoration();
  root.add(decoration);
  root.add(
    createKeeperCottage(),
    createObservatoryPavilion(),
    createIslandReflectionPond(),
  );
  // W7b (Pharos Wonder 2026-07-24, decision D8 — full precinct dressing):
  // monumental stone additions around the untouched garden — an obelisk pair
  // flanking the terrace approach, a ruined crenellated sea-wall arc at the
  // waterline, and half-sunk column drums in the shallows. All static meshes;
  // reduced motion has nothing to freeze.
  root.add(
    createPrecinctObelisks(),
    createSeaWallArc(),
    createSunkenColumnDrums(),
  );
  // W4.9 (grand-scale revamp 2026-07-25): the rock the Wonder stands on reads
  // as terrain rather than a green mass — fractured cliffs at the rim, the
  // scree they shed, a cut-stone stair from the quay head to the tower
  // terrace, and a denser planting. All instanced; all static.
  root.add(
    createSeaCliffs(),
    createCliffTalus(),
    createQuayStair(),
    createIslandPlanting(),
    createTerraceLanterns(),
  );
  if (cloudShadows) applyGardenCloudShadows(root, cloudShadows);

  return {
    beacon: lighthouse.beacon,
    beaconHalo: lighthouse.beaconHalo,
    beam: lighthouse.beam,
    decoration,
    lighthouseLight: lighthouse.light,
    lighthouseRoot,
    lighthouseShell: lighthouse.shell,
    root,
  };
}

// I3 cloud-shadow GLSL (C2(c)): the land samples Lane W's noise texture with
// the same world-XZ mapping the water shader uses — uv = worldXZ * scale +
// offset — so a cloud darkens the sea and the shore in one coherent drift.
const CLOUD_SHADOW_VERTEX_PARS = "varying vec3 vGardenCloudWorldPos;";
const CLOUD_SHADOW_VERTEX_CHUNK = /* glsl */ `
  vec4 gardenCloudWorldPosition = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    gardenCloudWorldPosition = instanceMatrix * gardenCloudWorldPosition;
  #endif
  gardenCloudWorldPosition = modelMatrix * gardenCloudWorldPosition;
  vGardenCloudWorldPos = gardenCloudWorldPosition.xyz;
`;
const CLOUD_SHADOW_FRAGMENT_PARS = /* glsl */ `
  uniform sampler2D uCloudShadow;
  uniform vec4 uCloudShadowTransform;
  uniform float uCloudShadowStrength;
  varying vec3 vGardenCloudWorldPos;
`;
const CLOUD_SHADOW_FRAGMENT_CHUNK = /* glsl */ `
  {
    vec2 gardenCloudUv = vGardenCloudWorldPos.xz * uCloudShadowTransform.xy
      + uCloudShadowTransform.zw;
    float gardenCloudCover = texture2D( uCloudShadow, gardenCloudUv ).r;
    float gardenCloudLight = 1.0 - gardenCloudCover * uCloudShadowStrength;
    reflectedLight.directDiffuse *= gardenCloudLight;
    reflectedLight.indirectDiffuse *= gardenCloudLight;
  }
`;

/**
 * Applies the shared cloud-shadow source (C2(c)) to every lit material under
 * `root` via onBeforeCompile: the diffuse light term is multiplied by the
 * cloud mask sampled in world XZ, matching Lane W's water-side sampling. The
 * uniform objects are shared, not copied, so Lane W's per-frame drift and the
 * tier/reduced-motion gating (strength 0 below balanced, drift frozen) apply
 * here unchanged. Exported so the integrator can also hook late-attached
 * geometry (e.g. the lighthouse GLB shell) with the same helper. Idempotent.
 */
export function applyGardenCloudShadows(
  root: Group,
  source: GardenCloudShadowSource,
): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      if (material.userData.gardenCloudShadows) continue;
      material.userData.gardenCloudShadows = true;
      material.onBeforeCompile = (shader) => {
        // Share Lane W's uniform objects — never copy — so every consumer
        // samples the same texture, transform, and strength by construction.
        shader.uniforms.uCloudShadow = source.uniforms.uCloudShadow;
        shader.uniforms.uCloudShadowTransform = source.uniforms.uCloudShadowTransform;
        shader.uniforms.uCloudShadowStrength = source.uniforms.uCloudShadowStrength;
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            `#include <common>\n${CLOUD_SHADOW_VERTEX_PARS}`,
          )
          .replace(
            "#include <worldpos_vertex>",
            `#include <worldpos_vertex>\n${CLOUD_SHADOW_VERTEX_CHUNK}`,
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>\n${CLOUD_SHADOW_FRAGMENT_PARS}`,
          )
          .replace(
            "#include <lights_fragment_end>",
            `#include <lights_fragment_end>\n${CLOUD_SHADOW_FRAGMENT_CHUNK}`,
          );
      };
    }
  });
}

function createIrregularTerraceGeometry(
  topRadius: number,
  bottomRadius: number,
  height: number,
  segments: number,
  seed: number,
): CylinderGeometry {
  const geometry = new CylinderGeometry(
    topRadius,
    bottomRadius,
    height,
    segments,
    1,
    false,
  );
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const radius = Math.hypot(x, z);
    if (radius < 0.001) continue;
    const angle = Math.atan2(z, x);
    const variation = 1
      + Math.sin(angle * 3 + seed) * 0.045
      + Math.sin(angle * 7 - seed * 0.7) * 0.026
      + Math.sin(angle * 11 + seed * 1.3) * 0.012;
    positions.setX(index, x * variation);
    positions.setZ(index, z * variation);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function stoneRampColor(worldY: number, target: Color): Color {
  const t = clamp01((worldY - WATERLINE_Y) / (CROWN_RAMP_Y - WATERLINE_Y));
  if (t < 0.5) target.copy(STONE_WET).lerp(STONE_MID, t / 0.5);
  else target.copy(STONE_MID).lerp(STONE_PALE, (t - 0.5) / 0.5);
  return target.multiplyScalar(strataShade(worldY));
}

/**
 * A displaced, flat-shaded stone tier. Side vertices are pushed radially and
 * crag vertically (rims held so the flat planted shelf stays sealed), and each
 * vertex is coloured by its world height so the wet base reads far darker than
 * the crown. The top cap is coloured `topColor` (sand or moss). Determinism
 * comes from `seed` + `stableUnit` hashing — no `Math.random`.
 */
export function createRockTerraceGeometry(
  topRadius: number,
  bottomRadius: number,
  height: number,
  segments: number,
  seed: number,
  baseElevation: number,
  topColor: Color,
  amplitude = 0.11,
): CylinderGeometry {
  // W4.9: enough height rows to resolve a bedding step (~3 rows per bed at
  // STRATA_PERIOD). Three rows could carry a colour band but never an edge,
  // and an edge is what raking light needs — the same lesson the tower's
  // ashlar coursing taught.
  const heightSegments = Math.max(3, Math.round(height / 0.16));
  const geometry = new CylinderGeometry(topRadius, bottomRadius, height, segments, heightSegments, false);
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const color = new Color();
  const half = height / 2;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const oy = positions.getY(index);
    const z = positions.getZ(index);
    const radius = Math.hypot(x, z);
    const v = (oy + half) / height;
    let colorY = baseElevation + oy;
    if (radius >= 0.001) {
      const angle = Math.atan2(z, x);
      const jitter = stableUnit(`${seed}|${Math.round(angle * 57.29)}`) - 0.5;
      const noise = Math.sin(angle * 3 + seed) * 0.5
        + Math.sin(angle * 7 - seed * 1.3 + v * 4) * 0.3
        + Math.sin(angle * 13 + seed * 2.1) * 0.2
        + jitter * 0.6;
      // W4.9 bedding planes. A vertex's bed is keyed off a gently warped world
      // height so the ledges undulate like real strata instead of ringing the
      // tier as perfect circles; every vertex in a bed shares one radial
      // offset, so the side face steps at each bed boundary. Colour is sampled
      // from the same warped height, which puts the shadow band exactly on the
      // geometric edge rather than near it.
      colorY = baseElevation + oy
        + Math.sin(angle * 2 + seed * 1.7) * 0.13
        + Math.sin(angle * 5 - seed) * 0.06;
      const bed = Math.floor((colorY - WATERLINE_Y) / STRATA_PERIOD);
      const bedStep = ((((bed % 2) + 2) % 2) === 0 ? 0.03 : -0.03)
        + (stableUnit(`${seed}~bed~${bed}`) - 0.5) * 0.05;
      const radialScale = 1 + amplitude * noise + bedStep;
      positions.setX(index, x * radialScale);
      positions.setZ(index, z * radialScale);
      // Vertical crag, tapered to zero at both rims so caps never split open.
      const vignette = 1 - Math.abs(2 * v - 1);
      const crag = Math.sin(angle * 9 + seed * 3) * 0.5
        + (stableUnit(`${seed}#${Math.round(angle * 40)}`) - 0.5);
      positions.setY(index, oy + crag * vignette * height * 0.16);
    }
    const ao = 0.7 + 0.3 * v;
    stoneRampColor(colorY, color).multiplyScalar(ao);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  // Repaint the cap groups: top = planted colour, bottom = darkest wet stone.
  // W4.9: the top cap used to be one flat plate of moss, which is most of why
  // the island read as a smooth green mass from the fixed camera — the caps
  // are the surface it mostly sees. The planting now thins toward the rim and
  // in deterministic bare patches so the rock breaks through, and every cap
  // vertex carries a little mottle.
  const index = geometry.getIndex();
  const capColor = new Color();
  if (index) {
    for (const group of geometry.groups) {
      if (group.materialIndex !== 1 && group.materialIndex !== 2) continue;
      for (let k = group.start; k < group.start + group.count; k += 1) {
        const vertex = index.getX(k);
        if (group.materialIndex === 2) {
          color.copy(STONE_WET).multiplyScalar(0.62);
        } else {
          const vx = positions.getX(vertex);
          const vy = positions.getY(vertex);
          const vz = positions.getZ(vertex);
          const rim = smoothstep01(
            (Math.hypot(vx, vz) / Math.max(0.001, topRadius) - 0.68) / 0.3,
          );
          const patch = stableUnit(
            `${seed}~bare~${Math.round(vx * 2.2)}~${Math.round(vz * 2.2)}`,
          );
          const bare = clamp01(rim * 0.9 + (patch - 0.52) * 1.15);
          stoneRampColor(baseElevation + vy, capColor);
          color.copy(topColor).lerp(capColor, bare);
          color.multiplyScalar(
            0.86 + stableUnit(`${seed}~mottle~${Math.round(vx * 3)}~${Math.round(vz * 3)}`) * 0.3,
          );
        }
        colors[vertex * 3] = color.r;
        colors[vertex * 3 + 1] = color.g;
        colors[vertex * 3 + 2] = color.b;
      }
    }
  }

  positions.needsUpdate = true;
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.clearGroups();
  geometry.computeVertexNormals();
  return geometry;
}

// I1 Sakuteiki shoreline rockwork: instead of an even ring, the boulders
// gather into four triads (odd-numbered clusters) with two solitary stones
// and open water between the groups — composed ma. Each triad has one
// dominant vertical stone; the subordinates squat lower and lean toward it,
// and every stone yaws a broad face toward the fixed camera (azimuth 45°).
const SHORELINE_TRIAD_ANGLES = [0.55, 1.5, 3.0, 4.45] as const;
const SHORELINE_SOLITARY_ANGLES = [3.75, 5.6] as const;
const CAMERA_FACING_YAW = Math.PI / 4;

interface ShorelineBoulderSpec {
  angle: number;
  dominant: boolean;
  leanToward: number;
  seed: string;
}

function shorelineBoulderSpecs(): ShorelineBoulderSpec[] {
  const specs: ShorelineBoulderSpec[] = [];
  SHORELINE_TRIAD_ANGLES.forEach((center, cluster) => {
    for (let member = -1; member <= 1; member += 1) {
      specs.push({
        angle: center + member * 0.15,
        dominant: member === 0,
        leanToward: center,
        seed: `boulder.c${cluster}.${member + 1}`,
      });
    }
  });
  SHORELINE_SOLITARY_ANGLES.forEach((angle, index) => {
    specs.push({ angle, dominant: false, leanToward: angle, seed: `boulder.s${index}` });
  });
  return specs;
}

function createShorelineBoulders(): InstancedMesh {
  const geometry = displacedBoulderGeometry();
  const specs = shorelineBoulderSpecs();
  const boulders = new InstancedMesh(
    geometry,
    new MeshStandardMaterial({ flatShading: true, roughness: 0.96, vertexColors: true }),
    specs.length,
  );
  boulders.name = "island-shoreline-boulders";
  boulders.castShadow = true;
  boulders.receiveShadow = true;
  specs.forEach((spec, i) => {
    const angle = spec.angle + (stableUnit(`${spec.seed}.a`) - 0.5) * 0.06;
    const reach = 0.86 + stableUnit(`${spec.seed}.r`) * 0.22;
    const x = 1.0 + Math.cos(angle) * 18.6 * reach;
    const z = 1.4 + Math.sin(angle) * 12.4 * reach;
    const y = WATER_LEVEL + 0.1 + stableUnit(`${spec.seed}.y`) * 0.85;
    const scale = 0.9 + stableUnit(`${spec.seed}.s`) * 1.5;
    // Dominant stones stand tall; subordinates crouch and lean in toward the
    // triad's heart so the cluster reads as one conversation, not a spill.
    const yaw = CAMERA_FACING_YAW + (stableUnit(`${spec.seed}.rot`) - 0.5) * 0.5;
    scratchQuaternion.setFromAxisAngle(UP_AXIS, yaw);
    const leanTargetX = 1.0 + Math.cos(spec.leanToward) * 18.6 * reach;
    const leanTargetZ = 1.4 + Math.sin(spec.leanToward) * 12.4 * reach;
    let leanX = leanTargetX - x;
    let leanZ = leanTargetZ - z;
    // Solitary stones (lean target == own angle) lean subtly inland instead.
    if (Math.hypot(leanX, leanZ) < 0.01) {
      leanX = 1.0 - x;
      leanZ = 1.4 - z;
    }
    const leanLength = Math.max(0.001, Math.hypot(leanX, leanZ));
    const leanAngle = (spec.dominant ? 0.05 : 0.11) * (0.7 + stableUnit(`${spec.seed}.lean`) * 0.6);
    scratchLeanAxis.set(leanZ / leanLength, 0, -leanX / leanLength);
    scratchLeanQuaternion.setFromAxisAngle(scratchLeanAxis, leanAngle);
    scratchQuaternion.multiply(scratchLeanQuaternion);
    const verticality = spec.dominant
      ? 1.18 + stableUnit(`${spec.seed}.v`) * 0.22
      : 0.5 + stableUnit(`${spec.seed}.f`) * 0.3;
    scratchScale.set(scale, scale * verticality, scale * 0.92);
    scratchPosition.set(x, y, z);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    boulders.setMatrixAt(i, scratchMatrix);
  });
  boulders.instanceMatrix.needsUpdate = true;
  return boulders;
}

function displacedBoulderGeometry(
  low: Color = STONE_WET,
  high: Color = STONE_MID,
): IcosahedronGeometry {
  const geometry = new IcosahedronGeometry(1, 1);
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const color = new Color();
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const displace = 1
      + (stableUnit(`boulder.v.${Math.round(x * 20)}.${Math.round(y * 20)}.${Math.round(z * 20)}`) - 0.5) * 0.5;
    positions.setX(index, x * displace);
    positions.setY(index, Math.max(y * displace, -0.72));
    positions.setZ(index, z * displace);
    // Wet-dark base lightening toward the crown of each boulder. The talus
    // scatter reuses this with a paler top so dry scree above the tideline
    // separates from the wet shoreline stones.
    color.copy(low).lerp(high, clamp01((y + 1) / 2) * 0.7);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  positions.needsUpdate = true;
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// I1 Sakuteiki stone groupings (karesansui): the old uniform 18-stone scatter
// is recomposed into five triads — odd-numbered clusters, each with ONE
// dominant vertical stone and two subordinate horizontals leaning toward it,
// broad faces turned to the fixed camera. The three dropped stones are the
// deliberate subtraction (ma): open ground lets each grouping read.
export interface GardenIslandStoneSpec {
  /** Root-relative placement; y keys the stone to the local terrace shelf. */
  x: number;
  y: number;
  z: number;
  scale: number;
  /** The one vertical "father" stone of the triad; subordinates stay horizontal. */
  dominant?: boolean;
}

export const GARDEN_ISLAND_STONE_GROUPINGS: readonly (readonly GardenIslandStoneSpec[])[] = [
  // West shore triad.
  [
    { x: -13.9, y: -0.12, z: 2.7, scale: 1.15, dominant: true },
    { x: -12.55, y: -0.18, z: 3.65, scale: 0.68 },
    { x: -14.85, y: -0.2, z: 1.7, scale: 0.55 },
  ],
  // North-west shelf triad.
  [
    { x: -12.1, y: 0.28, z: -4.7, scale: 1.0, dominant: true },
    { x: -10.95, y: 0.12, z: -5.6, scale: 0.62 },
    { x: -13.05, y: 0.08, z: -3.6, scale: 0.5 },
  ],
  // East point triad.
  [
    { x: 8.4, y: -0.12, z: 3.7, scale: 1.1, dominant: true },
    { x: 9.6, y: -0.22, z: 2.4, scale: 0.66 },
    { x: 7.2, y: -0.24, z: 4.9, scale: 0.54 },
  ],
  // South shore triad.
  [
    { x: 2.5, y: -0.22, z: 7.55, scale: 1.05, dominant: true },
    { x: 1.1, y: -0.12, z: 8.25, scale: 0.6 },
    { x: 3.8, y: -0.3, z: 6.75, scale: 0.5 },
  ],
  // Upper terrace triad, by the path bend below the lighthouse.
  [
    { x: -6.1, y: 1.52, z: -4.25, scale: 0.78, dominant: true },
    { x: -5.0, y: 1.38, z: -3.55, scale: 0.5 },
    { x: -7.15, y: 1.34, z: -5.0, scale: 0.44 },
  ],
];

function createIslandDecoration(): Group {
  const root = new Group();
  const treePoints = [
    [-9.7, 1.12, -2.4, 1.06, -0.9],
    [-7.8, 1.55, 2.15, 0.9, -0.72],
    [-5.9, 1.45, -4.1, 0.84, -0.68],
    [-2.0, 1.33, 5.05, 1.02, -0.38],
    [0.55, 1.08, 4.55, 0.9, -0.25],
    [5.45, 0.92, 1.95, 0.96, 0.32],
    [-5.8, 2.42, 1.45, 0.72, -0.52],
    [2.8, 2.34, -3.55, 0.74, 0.22],
    [-5.4, 0.82, 6.15, 0.66, -0.35],
    [0.4, 0.36, 7.2, 0.58, 0.08],
    [5.7, 0.2, 5.2, 0.64, 0.3],
    // W4.9: the concept render's rock is tree-covered, so the grove thickens
    // on the lee and north shelves where nothing else is sited. Each point is
    // clear of the cottage, pavilion, pond, both routes to the summit and the
    // lighthouse terrace.
    [-11.2, 0.42, -1.6, 0.78, -0.82],
    [-9.4, 0.9, -6.0, 0.7, -0.6],
    [-2.6, 0.62, -7.6, 0.86, -0.2],
    [2.0, 0.5, -6.9, 0.72, 0.18],
    [7.4, 0.24, -4.4, 0.8, 0.42],
    [10.6, -0.02, 0.9, 0.68, 0.55],
    [8.9, 0.1, 4.6, 0.62, 0.36],
    [-8.6, 0.66, 5.4, 0.74, -0.58],
    [-13.4, 0.05, 2.2, 0.6, -0.9],
    [3.4, 1.02, -5.5, 0.64, 0.24],
  ] as const;
  const trunks = new InstancedMesh(
    new CylinderGeometry(0.11, 0.22, 2.15, 7),
    new MeshStandardMaterial({ color: HARBOR_PALETTE.timber_dark, roughness: 1 }),
    treePoints.length,
  );
  const crowns = new InstancedMesh(
    new DodecahedronGeometry(1, 0),
    new MeshStandardMaterial({
      color: "#6f8058",
      flatShading: true,
      roughness: 0.96,
    }),
    treePoints.length,
  );
  treePoints.forEach(([x, y, z, scale, wind], index) => {
    scratchMatrix.makeScale(scale, scale, scale);
    scratchMatrix.setPosition(x, y + 0.9, z);
    trunks.setMatrixAt(index, scratchMatrix);
    scratchMatrix.makeScale(scale * 1.55, scale * 0.62, scale * 1.12);
    scratchMatrix.setPosition(x + wind, y + 2.18, z);
    crowns.setMatrixAt(index, scratchMatrix);
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  root.add(trunks, crowns);
  const westPine = createWindPine(1.12, -0.72);
  westPine.position.set(-10.4, 1.18, 0.1);
  westPine.rotation.y = -0.28;
  root.add(westPine);
  const eastPine = createWindPine(0.9, 0.58);
  eastPine.position.set(4.7, 1.25, -2.2);
  eastPine.rotation.y = 0.4;
  root.add(eastPine);

  const stoneCount = GARDEN_ISLAND_STONE_GROUPINGS.reduce((sum, triad) => sum + triad.length, 0);
  const stones = new InstancedMesh(
    new DodecahedronGeometry(0.8, 0),
    new MeshStandardMaterial({
      color: "#989986",
      flatShading: true,
      roughness: 1,
    }),
    stoneCount,
  );
  let stoneIndex = 0;
  GARDEN_ISLAND_STONE_GROUPINGS.forEach((triad, triadIndex) => {
    // Each triad leans "in conversation": subordinates tilt toward the
    // dominant stone, the dominant tilts a few degrees back toward them.
    const dominant = triad.find((stone) => stone.dominant) ?? triad[0]!;
    // The dominant stone leans a few degrees back toward its subordinates.
    const subordinates = triad.filter((stone) => stone !== dominant);
    const heartX = subordinates.reduce((sum, stone) => sum + stone.x, 0) / Math.max(1, subordinates.length);
    const heartZ = subordinates.reduce((sum, stone) => sum + stone.z, 0) / Math.max(1, subordinates.length);
    triad.forEach((stone, memberIndex) => {
      const seed = `stone.t${triadIndex}.${memberIndex}`;
      const yaw = CAMERA_FACING_YAW + (stableUnit(seed) - 0.5) * (stone.dominant ? 0.24 : 0.9);
      scratchQuaternion.setFromAxisAngle(UP_AXIS, yaw);
      const targetX = stone.dominant ? heartX : dominant.x;
      const targetZ = stone.dominant ? heartZ : dominant.z;
      const leanX = targetX - stone.x;
      const leanZ = targetZ - stone.z;
      const leanLength = Math.max(0.001, Math.hypot(leanX, leanZ));
      const leanAngle = stone.dominant
        ? 0.05
        : 0.08 + stableUnit(`${seed}.lean`) * 0.06;
      scratchLeanAxis.set(leanZ / leanLength, 0, -leanX / leanLength);
      scratchLeanQuaternion.setFromAxisAngle(scratchLeanAxis, leanAngle);
      scratchQuaternion.multiply(scratchLeanQuaternion);
      if (stone.dominant) {
        scratchScale.set(stone.scale, stone.scale * 1.45, stone.scale * 0.92);
      } else {
        scratchScale.set(stone.scale, stone.scale * 0.55, stone.scale * 0.85);
      }
      scratchPosition.set(stone.x, stone.y, stone.z);
      scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
      stones.setMatrixAt(stoneIndex, scratchMatrix);
      stoneIndex += 1;
    });
  });
  stones.instanceMatrix.needsUpdate = true;
  root.add(stones);

  const reedPoints = [
    [8.7, -0.05, 2.6], [9.1, -0.08, 2.1], [9.35, -0.1, 1.5],
    [7.8, 0.02, 3.6], [7.35, 0.05, 4.05], [-11.8, 0.12, 4.0],
    [-12.35, 0.02, 3.5], [-12.7, -0.05, 2.9], [3.8, 0.12, 6.2],
    [4.4, 0.04, 5.9], [5.0, -0.02, 5.5], [-4.6, 0.08, 6.5],
  ] as const;
  const reeds = new InstancedMesh(
    new ConeGeometry(0.13, 1.15, 5),
    new MeshStandardMaterial({ color: "#526a4d", flatShading: true, roughness: 1 }),
    reedPoints.length,
  );
  reedPoints.forEach(([x, y, z], index) => {
    const scale = 0.74 + stableUnit(`reed.${index}`) * 0.5;
    scratchMatrix.makeScale(scale, scale, scale);
    scratchMatrix.setPosition(x, y + 0.52 * scale, z);
    reeds.setMatrixAt(index, scratchMatrix);
  });
  reeds.instanceMatrix.needsUpdate = true;
  root.add(reeds);

  const steppingPoints = [
    [6.1, 0.05, 6.5, 0.6],
    [5.3, -0.12, 7.2, 0.66],
    [4.4, -0.28, 7.85, 0.58],
    [3.35, -0.42, 8.4, 0.7],
    [2.2, -0.55, 8.85, 0.52],
    [7.6, 0.62, 4.4, 0.5],
  ] as const;
  const stepping = new InstancedMesh(
    new DodecahedronGeometry(0.62, 0),
    new MeshStandardMaterial({ color: "#7c7b68", flatShading: true, roughness: 1 }),
    steppingPoints.length,
  );
  stepping.name = "island-stepping-stones";
  stepping.receiveShadow = true;
  steppingPoints.forEach(([x, y, z, scale], index) => {
    scratchMatrix.makeScale(scale, scale * 0.24, scale * 0.86);
    scratchMatrix.setPosition(x, y, z);
    stepping.setMatrixAt(index, scratchMatrix);
  });
  stepping.instanceMatrix.needsUpdate = true;
  root.add(stepping);

  const lanternCount = ISLAND_LANTERN_POSITIONS.length;
  const pedestals = new InstancedMesh(
    new CylinderGeometry(0.16, 0.22, 0.72, 6),
    new MeshStandardMaterial({ color: "#807f71", flatShading: true, roughness: 1 }),
    lanternCount,
  );
  pedestals.name = "island-lantern-pedestals";
  const lamps = new InstancedMesh(
    new BoxGeometry(0.34, 0.32, 0.34),
    new MeshStandardMaterial({
      color: HARBOR_PALETTE.lantern_glow,
      emissive: HARBOR_PALETTE.lantern_warm,
      emissiveIntensity: 1.6,
      roughness: 0.42,
      toneMapped: false,
    }),
    lanternCount,
  );
  lamps.name = "island-lantern-lamps";
  const caps = new InstancedMesh(
    new ConeGeometry(0.32, 0.25, 4),
    new MeshStandardMaterial({ color: "#696a61", flatShading: true, roughness: 0.9 }),
    lanternCount,
  );
  caps.name = "island-lantern-caps";
  scratchQuaternion.setFromAxisAngle(UP_AXIS, Math.PI / 4);
  ISLAND_LANTERN_POSITIONS.forEach(([x, y, z], index) => {
    scratchMatrix.makeTranslation(x, y + 0.36, z);
    pedestals.setMatrixAt(index, scratchMatrix);
    scratchMatrix.makeTranslation(x, y + LANTERN_LAMP_LOCAL_Y, z);
    lamps.setMatrixAt(index, scratchMatrix);
    scratchPosition.set(x, y + 1.17, z);
    scratchScale.set(1, 1, 1);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    caps.setMatrixAt(index, scratchMatrix);
  });
  pedestals.instanceMatrix.needsUpdate = true;
  lamps.instanceMatrix.needsUpdate = true;
  caps.instanceMatrix.needsUpdate = true;
  root.add(pedestals, lamps, caps);
  return root;
}

function createWindPine(scale: number, bend: number): Group {
  const root = new Group();
  const trunkMaterial = new MeshStandardMaterial({
    color: "#514536",
    flatShading: true,
    roughness: 1,
  });
  const foliageMaterial = new MeshStandardMaterial({
    color: "#3f5d49",
    flatShading: true,
    roughness: 0.96,
  });
  const foliageLightMaterial = new MeshStandardMaterial({
    color: "#5a7a5c",
    flatShading: true,
    roughness: 0.96,
  });
  for (const [x, y, rotation, length, radius] of [
    [0, 0.75, bend * 0.12, 1.6, 0.2],
    [bend * 0.18, 2.05, bend * 0.18, 1.35, 0.16],
    [bend * 0.4, 3.12, bend * 0.24, 1.05, 0.12],
  ] as const) {
    const trunk = new Mesh(
      new CylinderGeometry(radius * 0.72, radius, length, 7),
      trunkMaterial,
    );
    trunk.position.set(x, y, 0);
    trunk.rotation.z = rotation;
    root.add(trunk);
  }
  // Layered wind-shaped pads: each canopy tier sits flatter and rakes further
  // downwind than the one below it, reading as a wind-combed pine silhouette.
  for (const [x, y, z, sx, sy, sz, light] of [
    [bend * 0.34, 2.3, 0.04, 1.75, 0.42, 1.05, 0],
    [bend * 0.62, 2.95, 0.16, 1.95, 0.4, 1.15, 1],
    [bend * 0.92, 3.5, -0.08, 1.6, 0.36, 0.95, 0],
    [bend * 1.22, 3.98, 0.1, 1.25, 0.32, 0.78, 1],
    [bend * 1.5, 4.34, -0.04, 0.82, 0.28, 0.58, 0],
  ] as const) {
    const crown = new Mesh(
      new DodecahedronGeometry(1, 0),
      light ? foliageLightMaterial : foliageMaterial,
    );
    crown.position.set(x, y, z);
    crown.scale.set(sx, sy, sz);
    crown.rotation.z = bend * 0.16;
    crown.castShadow = true;
    root.add(crown);
  }
  root.scale.setScalar(scale);
  return root;
}

function createKeeperCottage(): Group {
  const root = new Group();
  root.position.set(-1.2, 2.08, -0.3);
  root.rotation.y = -0.18;
  const foundation = new Mesh(
    new BoxGeometry(4.7, 0.38, 3.2),
    new MeshStandardMaterial({ color: "#8f8d7d", flatShading: true, roughness: 1 }),
  );
  foundation.position.y = 0.18;
  const walls = new Mesh(
    new BoxGeometry(4.1, 1.9, 2.7),
    new MeshStandardMaterial({ color: "#c7bea7", flatShading: true, roughness: 0.96 }),
  );
  walls.position.y = 1.25;
  const roof = new Mesh(
    new ConeGeometry(3.25, 1.5, 4),
    new MeshStandardMaterial({
      color: "#6b4a3e",
      flatShading: true,
      roughness: 0.84,
    }),
  );
  roof.position.y = 2.75;
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 0.72;
  const windowMaterial = new MeshStandardMaterial({
    color: "#dfbd73",
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity: 0.45,
    roughness: 0.38,
  });
  const window = new Mesh(new BoxGeometry(0.74, 0.65, 0.08), windowMaterial);
  window.position.set(0.8, 1.42, 1.39);
  root.add(foundation, walls, roof, window);
  root.add(createLanternString());
  return root;
}

// I4 warm micro-life, with restraint: one small lantern string strung along
// the keeper cottage's east eave (the window-less face) — three paper
// lanterns on a sagging cord. Static (no motion budget); the cord is two
// thin timber segments and the lanterns share one instanced draw. Palette-
// derived colours only. It hangs below the eave's sightline from the fixed
// 30° camera (the roof overhang hides anything higher than ~y 1.87).
const LANTERN_STRING_X = 2.15;
const LANTERN_STRING_SPAN = 1.2;
const LANTERN_STRING_SAG = 0.14;
const LANTERN_STRING_Y = 1.76;

function createLanternString(): Group {
  const root = new Group();
  root.name = "keeper-cottage-lantern-string";
  const cordMaterial = new MeshStandardMaterial({
    color: HARBOR_PALETTE.timber_dark,
    roughness: 1,
  });
  for (const side of [-1, 1] as const) {
    const length = Math.hypot(LANTERN_STRING_SPAN, LANTERN_STRING_SAG);
    const cord = new Mesh(new BoxGeometry(0.028, 0.028, length), cordMaterial);
    cord.position.set(
      LANTERN_STRING_X,
      LANTERN_STRING_Y - LANTERN_STRING_SAG / 2,
      (side * LANTERN_STRING_SPAN) / 2,
    );
    cord.rotation.x = side * Math.atan2(LANTERN_STRING_SAG, LANTERN_STRING_SPAN);
    root.add(cord);
  }
  const lanterns = new InstancedMesh(
    new BoxGeometry(0.14, 0.18, 0.14),
    new MeshStandardMaterial({
      color: HARBOR_PALETTE.lantern_glow,
      emissive: HARBOR_PALETTE.lantern_warm,
      emissiveIntensity: 0.7,
      roughness: 0.42,
    }),
    3,
  );
  lanterns.name = "keeper-cottage-lanterns";
  [0.28, 0.5, 0.72].forEach((t, index) => {
    const sag = LANTERN_STRING_SAG * (1 - (2 * t - 1) ** 2);
    scratchMatrix.makeTranslation(
      LANTERN_STRING_X,
      LANTERN_STRING_Y - sag - 0.12,
      -LANTERN_STRING_SPAN + 2 * LANTERN_STRING_SPAN * t,
    );
    lanterns.setMatrixAt(index, scratchMatrix);
  });
  lanterns.instanceMatrix.needsUpdate = true;
  root.add(lanterns);
  return root;
}

function createObservatoryPavilion(): Group {
  const root = new Group();
  root.position.set(4.4, 1.05, 2.35);
  root.rotation.y = 0.22;
  const stoneMaterial = new MeshStandardMaterial({
    color: "#a4a28e",
    flatShading: true,
    roughness: 1,
  });
  const timberMaterial = new MeshStandardMaterial({
    color: "#5d4635",
    roughness: 0.92,
  });
  const copperMaterial = new MeshStandardMaterial({
    color: "#4f7166",
    metalness: 0.28,
    roughness: 0.66,
  });
  const base = new Mesh(new CylinderGeometry(2.2, 2.4, 0.36, 8), stoneMaterial);
  base.position.y = 0.18;
  root.add(base);
  for (const [x, z] of [[-1.25, -0.8], [-1.25, 0.8], [1.25, -0.8], [1.25, 0.8]] as const) {
    const post = new Mesh(new CylinderGeometry(0.09, 0.12, 2.4, 6), timberMaterial);
    post.position.set(x, 1.45, z);
    root.add(post);
  }
  const roof = new Mesh(new ConeGeometry(2.55, 1.15, 8), copperMaterial);
  roof.position.y = 3.05;
  roof.scale.z = 0.72;
  root.add(roof);
  const instrument = new Mesh(
    new SphereGeometry(0.38, 10, 7),
    new MeshStandardMaterial({
      color: "#c79d52",
      metalness: 0.62,
      roughness: 0.38,
    }),
  );
  instrument.position.y = 1.08;
  root.add(instrument);
  return root;
}

function createIslandReflectionPond(): Group {
  const root = new Group();
  root.position.set(1.45, 2.03, -2.05);
  root.rotation.y = -0.18;
  const pond = new Mesh(
    new CircleGeometry(2.65, 32),
    new MeshStandardMaterial({
      color: "#315f60",
      metalness: 0.08,
      roughness: 0.28,
      side: DoubleSide,
    }),
  );
  pond.rotation.x = -Math.PI / 2;
  pond.scale.z = 0.62;
  root.add(pond);
  const rim = new Mesh(
    new RingGeometry(2.55, 2.83, 32),
    new MeshStandardMaterial({
      color: "#a8a590",
      flatShading: true,
      roughness: 1,
      side: DoubleSide,
    }),
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.035;
  rim.scale.z = 0.62;
  root.add(rim);

  const steppingStones = new InstancedMesh(
    new DodecahedronGeometry(0.35, 0),
    new MeshStandardMaterial({
      color: "#bbb6a0",
      flatShading: true,
      roughness: 1,
    }),
    6,
  );
  for (let index = 0; index < steppingStones.count; index += 1) {
    const progress = index / (steppingStones.count - 1);
    scratchMatrix.makeScale(
      1 + (index % 2) * 0.18,
      0.3,
      0.82 + ((index + 1) % 2) * 0.16,
    );
    scratchMatrix.setPosition(
      -1.85 + progress * 3.65,
      0.16 + Math.sin(progress * Math.PI) * 0.03,
      Math.sin(progress * Math.PI * 1.2) * 0.32,
    );
    steppingStones.setMatrixAt(index, scratchMatrix);
  }
  steppingStones.instanceMatrix.needsUpdate = true;
  root.add(steppingStones);
  return root;
}

// ---------------------------------------------------------------------------
// W7b — Pharos precinct dressing (2026-07-24 wonder plan, decision D8)
// ---------------------------------------------------------------------------

// Two obelisks flank the Pharos terrace steps on the seaward side — Empereur's
// precinct finds framing the ramp approach. They stand on the middle rock
// shelf (tier top y ~2.0) in front of the 9.2-wide bottom step, whose +z face
// ends at island-relative z 3.35, and clear of the winding garden path, the
// planted shelf (z <= 3.57), and the lighthouse square base.
const OBELISK_PLACEMENTS = [
  [-9.2, 1.99, 4.1],
  [-4.8, 1.99, 4.1],
] as const;

function createPrecinctObelisks(): Group {
  const root = new Group();
  root.name = "pharos-precinct-obelisks";
  const stoneMaterial = new MeshStandardMaterial({
    color: "#d2cba9",
    flatShading: true,
    roughness: 0.94,
  });
  // Bronze-gilt pyramidion tips carrying the same warm emissive whisper as
  // the crowning Zeus Soter (the vermillion accent stays spent on the flame).
  const giltMaterial = new MeshStandardMaterial({
    color: HARBOR_PALETTE.lantern_warm,
    emissive: HARBOR_PALETTE.lantern_glow,
    emissiveIntensity: 0.08,
    metalness: 0.82,
    roughness: 0.32,
  });
  // Geometry budget: the pair bakes into two merged meshes (stone + gilt).
  // Four-sided tapered cylinders read as square shafts; the pi/4 yaw squares
  // their faces with the terrace steps below the tower.
  const stoneParts: BufferGeometry[] = [];
  const giltParts: BufferGeometry[] = [];
  const place = (geometry: BufferGeometry, x: number, y: number, z: number, localY: number) => {
    geometry.rotateY(Math.PI / 4);
    geometry.translate(x, y + localY, z);
  };
  for (const [x, y, z] of OBELISK_PLACEMENTS) {
    const plinth = new BoxGeometry(0.74, 0.3, 0.74);
    place(plinth, x, y, z, 0.15);
    stoneParts.push(plinth);
    const shaft = new CylinderGeometry(0.17, 0.27, 3.05, 4);
    place(shaft, x, y, z, 0.3 + 3.05 / 2);
    stoneParts.push(shaft);
    const cap = new ConeGeometry(0.26, 0.42, 4);
    place(cap, x, y, z, 0.3 + 3.05 + 0.21);
    giltParts.push(cap);
  }
  const stone = new Mesh(mergeGeometries(stoneParts, false), stoneMaterial);
  stone.name = "pharos-obelisk-stone";
  const caps = new Mesh(mergeGeometries(giltParts, false), giltMaterial);
  caps.name = "pharos-obelisk-caps";
  for (const part of [stone, caps]) {
    part.castShadow = true;
    part.receiveShadow = true;
  }
  root.add(stone, caps);
  return root;
}

// A low crenellated fortification arc at the waterline on the seaward face —
// the fortress-Pharos of Caesar's siege, ruined down to broken runs (the
// wabi-sabi reading is deliberate). Segments and merlons share one instanced
// unit box whose baked vertex ramp grades from wet wash to weathered stone,
// matching the shoreline rockwork; it hugs the shore ellipse just inside the
// boulder triads.
const SEA_WALL_RUNS: readonly (readonly [number, number])[] = [
  [0.72, 1.34], // main run across the camera-facing shore corner
  [0.16, 0.34], // broken stub off the east rocks
];
const SEA_WALL_BASE_Y = WATER_LEVEL + 0.5;
const SEA_WALL_HEIGHT = 1.25;

function createSeaWallArc(): InstancedMesh {
  const placements: {
    sx: number;
    sy: number;
    x: number;
    y: number;
    yaw: number;
    z: number;
  }[] = [];
  SEA_WALL_RUNS.forEach(([start, end], runIndex) => {
    const steps = Math.max(1, Math.round((end - start) / 0.095));
    for (let index = 0; index < steps; index += 1) {
      const seed = `seawall.${runIndex}.${index}`;
      const theta = start + ((index + 0.5) / steps) * (end - start);
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);
      const x = 0.6 + cos * 17.2;
      const z = 1.2 + sin * 12.9;
      // Align each segment with the shoreline ellipse tangent.
      const yaw = Math.atan2(-12.9 * cos, -17.2 * sin);
      const arcStep = hypot2(17.2 * sin, 12.9 * cos) * ((end - start) / steps);
      // Broken silhouette: height and seat jitter, ends crumble lower.
      const endFall = Math.min(index, steps - 1 - index) === 0 ? 0.72 : 1;
      const broken = (0.86 + stableUnit(`${seed}.h`) * 0.22) * endFall;
      placements.push({
        sx: arcStep * 1.08,
        sy: broken,
        x,
        y: SEA_WALL_BASE_Y + (SEA_WALL_HEIGHT * broken) / 2,
        yaw,
        z,
      });
      // Crenellation: one merlon per segment, with ruined gaps.
      if (stableUnit(`${seed}.m`) > 0.3) {
        placements.push({
          sx: 0.38,
          sy: 0.26 / SEA_WALL_HEIGHT,
          x,
          y: SEA_WALL_BASE_Y + SEA_WALL_HEIGHT * broken + 0.13,
          yaw,
          z,
        });
      }
    }
  });
  const wall = new InstancedMesh(
    coloredStoneBoxGeometry(1, SEA_WALL_HEIGHT, 0.55, SEA_WALL_BASE_Y),
    new MeshStandardMaterial({
      flatShading: true,
      roughness: 0.95,
      vertexColors: true,
    }),
    placements.length,
  );
  wall.name = "pharos-sea-wall";
  wall.castShadow = true;
  wall.receiveShadow = true;
  placements.forEach((placement, index) => {
    scratchQuaternion.setFromAxisAngle(UP_AXIS, placement.yaw);
    scratchPosition.set(placement.x, placement.y, placement.z);
    scratchScale.set(placement.sx, placement.sy, 1);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    wall.setMatrixAt(index, scratchMatrix);
  });
  wall.instanceMatrix.needsUpdate = true;
  return wall;
}

// Half-sunk column drums tilted into the shallows — Empereur's underwater
// ruins off the Pharos rock. Sakuteiki-placed in the open water between the
// boulder triads (never a symmetric spacing), wet-dark graded like the
// shoreline stones.
const COLUMN_DRUM_PLACEMENTS = [
  // x, center y, z, tiltX, yaw, tiltZ
  [-12.3, WATER_LEVEL - 0.28, 10.4, 0.18, 0.7, 0.55],
  [8.6, WATER_LEVEL - 0.52, -10.6, 0.85, 2.4, 0.22],
  [19.6, WATER_LEVEL - 0.42, -0.8, 0.1, 4.2, 0.34],
] as const;

function createSunkenColumnDrums(): InstancedMesh {
  const drums = new InstancedMesh(
    brokenColumnDrumGeometry(),
    new MeshStandardMaterial({
      flatShading: true,
      roughness: 0.95,
      vertexColors: true,
    }),
    COLUMN_DRUM_PLACEMENTS.length,
  );
  drums.name = "pharos-sunken-column-drums";
  drums.castShadow = true;
  drums.receiveShadow = true;
  COLUMN_DRUM_PLACEMENTS.forEach(([x, y, z, tiltX, yaw, tiltZ], index) => {
    scratchQuaternion.setFromEuler(new Euler(tiltX, yaw, tiltZ));
    scratchPosition.set(x, y, z);
    scratchScale.set(1, 1, 1);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    drums.setMatrixAt(index, scratchMatrix);
  });
  drums.instanceMatrix.needsUpdate = true;
  return drums;
}

function brokenColumnDrumGeometry(): CylinderGeometry {
  const geometry = new CylinderGeometry(0.52, 0.56, 2.3, 10);
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const color = new Color();
  for (let index = 0; index < positions.count; index += 1) {
    const y = positions.getY(index);
    // Wet-dark drowned stone, lightening only slightly toward the broken top.
    color.copy(STONE_WET).lerp(STONE_MID, ((y + 1.15) / 2.3) * 0.55);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry;
}

/** A box with the rockwork wet-to-pale stone ramp baked into its vertices. */
function coloredStoneBoxGeometry(
  width: number,
  height: number,
  depth: number,
  baseWorldY: number,
): BoxGeometry {
  const geometry = new BoxGeometry(width, height, depth);
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const color = new Color();
  for (let index = 0; index < positions.count; index += 1) {
    stoneRampColor(baseWorldY + height / 2 + positions.getY(index), color);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry;
}

function hypot2(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}

// ---------------------------------------------------------------------------
// W4.9 — the island under the Wonder (grand-scale revamp 2026-07-25)
//
// The concept render's rock is layered, eroded and tree-covered, with cut
// stone stairs climbing to the tower; the tiers alone read as a smooth green
// mass. Everything below is additive and instanced: sea cliffs at the rim,
// scree gathered under them, a cut-stone stair from the quay head to the
// lighthouse terrace, and a denser planting of shrubs and grass. The tier
// silhouette, the Sakuteiki stone groupings and the garden path are untouched.
// ---------------------------------------------------------------------------

const CLIFF_BASE_Y = WATER_LEVEL - 0.4;
const CLIFF_HEIGHT = 2.65;
// Arcs of the island rim that break into a cliff rather than a talus slope.
// They leave the harbour approach open (the +x/+z quadrant the garden path and
// stepping stones climb), clear the sea-wall runs, and stop short of the quay
// stair head at theta ~5.76.
const SEA_CLIFF_RUNS: readonly (readonly [number, number])[] = [
  [1.62, 2.98],
  [3.18, 4.34],
  [4.66, 5.42],
];
const CLIFF_RIM_X = 17.6;
const CLIFF_RIM_Z = 13.2;

/**
 * Steep fractured rock plates standing along the island rim. Their outward
 * face is displaced and their inboard face is left flat so each plate beds
 * into the tier behind it; the wet→pale ramp and the bedding shade are baked
 * per vertex, and every instance shares one base height so the strata line up
 * across the whole face.
 */
function createSeaCliffs(): InstancedMesh {
  const placements: { sx: number; sy: number; x: number; yaw: number; z: number }[] = [];
  SEA_CLIFF_RUNS.forEach(([start, end], runIndex) => {
    const steps = Math.max(1, Math.round((end - start) / 0.13));
    for (let index = 0; index < steps; index += 1) {
      const seed = `cliff.${runIndex}.${index}`;
      const theta = start + ((index + 0.5) / steps) * (end - start);
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);
      // Outward normal of the rim ellipse, so each plate presents its face to
      // the open sea rather than to the tangent.
      const yaw = Math.atan2(CLIFF_RIM_Z * cos, CLIFF_RIM_X * sin);
      const arcStep = hypot2(CLIFF_RIM_X * sin, CLIFF_RIM_Z * cos) * ((end - start) / steps);
      const reach = 0.97 + stableUnit(`${seed}.r`) * 0.06;
      placements.push({
        sx: arcStep * 1.12,
        // Held near 1 so the bedding planes stay level plate to plate; the
        // silhouette variety comes from the baked crag and the yaw instead.
        sy: 0.9 + stableUnit(`${seed}.h`) * 0.3,
        x: 0.6 + cos * CLIFF_RIM_X * reach,
        yaw,
        z: 1.2 + sin * CLIFF_RIM_Z * reach,
      });
    }
  });
  const cliffs = new InstancedMesh(
    cliffSlabGeometry(),
    new MeshStandardMaterial({ flatShading: true, roughness: 0.97, vertexColors: true }),
    placements.length,
  );
  cliffs.name = "island-sea-cliffs";
  cliffs.castShadow = true;
  cliffs.receiveShadow = true;
  placements.forEach((placement, index) => {
    scratchQuaternion.setFromAxisAngle(UP_AXIS, placement.yaw);
    scratchPosition.set(placement.x, CLIFF_BASE_Y + (CLIFF_HEIGHT * placement.sy) / 2, placement.z);
    scratchScale.set(placement.sx, placement.sy, 1);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    cliffs.setMatrixAt(index, scratchMatrix);
  });
  cliffs.instanceMatrix.needsUpdate = true;
  return cliffs;
}

function cliffSlabGeometry(): BoxGeometry {
  const geometry = new BoxGeometry(1, CLIFF_HEIGHT, 1.15, 2, 6, 1);
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const color = new Color();
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const jitter = stableUnit(
      `cliff.v.${Math.round(x * 24)}.${Math.round(y * 24)}.${Math.round(z * 24)}`,
    ) - 0.5;
    // Fracture the seaward face only; the inboard face stays flat so the plate
    // buries cleanly in the tier it leans against.
    const seaward = Math.max(0, z / 0.575);
    positions.setZ(index, z + jitter * 0.44 * seaward);
    positions.setX(index, x + jitter * 0.14);
    stoneRampColor(CLIFF_BASE_Y + CLIFF_HEIGHT / 2 + y, color);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  positions.needsUpdate = true;
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Scree gathered at the foot of the cliff runs — the rubble the face shed.
 * Seated on the real rock surface so the pile hugs the slope, and kept
 * inboard of the shoreline boulder triads so the two rockworks read as one
 * geological story rather than two scatters.
 */
function createCliffTalus(): InstancedMesh {
  const placements: { scale: number; x: number; y: number; yaw: number; z: number }[] = [];
  SEA_CLIFF_RUNS.forEach(([start, end], runIndex) => {
    const steps = Math.max(1, Math.round((end - start) / 0.085));
    for (let index = 0; index < steps; index += 1) {
      const seed = `talus.${runIndex}.${index}`;
      const theta = start + ((index + 0.5) / steps) * (end - start)
        + (stableUnit(`${seed}.t`) - 0.5) * 0.07;
      const reach = 0.74 + stableUnit(`${seed}.r`) * 0.2;
      const x = 0.6 + Math.cos(theta) * CLIFF_RIM_X * reach;
      const z = 1.2 + Math.sin(theta) * CLIFF_RIM_Z * reach;
      const scale = 0.28 + stableUnit(`${seed}.s`) * 0.62;
      placements.push({
        scale,
        x,
        y: islandTerrainHeight(x, z) + scale * 0.32,
        yaw: stableUnit(`${seed}.y`) * Math.PI * 2,
        z,
      });
    }
  });
  const talus = new InstancedMesh(
    displacedBoulderGeometry(STONE_WET, STONE_PALE),
    new MeshStandardMaterial({ flatShading: true, roughness: 0.98, vertexColors: true }),
    placements.length,
  );
  talus.name = "island-cliff-talus";
  talus.castShadow = true;
  talus.receiveShadow = true;
  placements.forEach((placement, index) => {
    scratchQuaternion.setFromAxisAngle(UP_AXIS, placement.yaw);
    scratchPosition.set(placement.x, placement.y, placement.z);
    scratchScale.set(placement.scale, placement.scale * 0.62, placement.scale * 0.88);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    talus.setMatrixAt(index, scratchMatrix);
  });
  talus.instanceMatrix.needsUpdate = true;
  return talus;
}

// The cut-stone stair: quay head at the waterline on the lee (-z) shore, up to
// the +x edge of the lighthouse terrace. The line is chosen to clear the
// reflection pond, the keeper cottage, the upper stone triad and the garden
// path, so the stair is a second, formal route to the tower rather than a
// duplicate of the winding one.
const QUAY_STAIR_START = { x: 16.9, z: -5.79 } as const;
const QUAY_STAIR_END = { x: -2.0, z: -4.6 } as const;
const QUAY_STAIR_WIDTH = 1.55;
const QUAY_STAIR_TREAD = 0.44;
const QUAY_STAIR_TOP_Y = 2.62;

function quayStairTreads(): { x: number; y: number; z: number }[] {
  const dx = QUAY_STAIR_END.x - QUAY_STAIR_START.x;
  const dz = QUAY_STAIR_END.z - QUAY_STAIR_START.z;
  const run = Math.hypot(dx, dz);
  const count = Math.max(2, Math.round(run / QUAY_STAIR_TREAD));
  const treads: { x: number; y: number; z: number }[] = [];
  let y = WATER_LEVEL + 0.06;
  // Constant nominal rise, raised to meet the rock wherever the tier face
  // climbs faster: flights on the open slope, landings where it flattens.
  const rise = (QUAY_STAIR_TOP_Y - y) / count;
  for (let index = 0; index < count; index += 1) {
    const t = (index + 0.5) / count;
    const x = QUAY_STAIR_START.x + dx * t;
    const z = QUAY_STAIR_START.z + dz * t;
    y = Math.max(y + rise, islandTerrainHeight(x, z) + 0.07);
    treads.push({ x, y, z });
  }
  return treads;
}

function createQuayStair(): Group {
  const root = new Group();
  root.name = "island-quay-stair";
  const treads = quayStairTreads();
  const yaw = Math.atan2(
    QUAY_STAIR_END.x - QUAY_STAIR_START.x,
    QUAY_STAIR_END.z - QUAY_STAIR_START.z,
  );
  scratchQuaternion.setFromAxisAngle(UP_AXIS, yaw);

  const steps = new InstancedMesh(
    new BoxGeometry(QUAY_STAIR_WIDTH, 0.26, QUAY_STAIR_TREAD * 1.12),
    new MeshStandardMaterial({ color: "#a89e84", flatShading: true, roughness: 1 }),
    treads.length,
  );
  steps.name = "island-quay-stair-treads";
  steps.castShadow = true;
  steps.receiveShadow = true;
  treads.forEach((tread, index) => {
    scratchPosition.set(tread.x, tread.y - 0.13, tread.z);
    // Worn treads: a little width jitter keeps the flight from reading as an
    // extruded ramp at overview zoom.
    scratchScale.set(0.92 + stableUnit(`stair.w.${index}`) * 0.16, 1, 1);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    steps.setMatrixAt(index, scratchMatrix);
  });
  steps.instanceMatrix.needsUpdate = true;

  // Cheek walls: one low coping block per tread per side, riding the same
  // profile, so the flight reads as cut into the rock rather than laid on it.
  const cheeks = new InstancedMesh(
    new BoxGeometry(0.3, 0.36, QUAY_STAIR_TREAD * 1.12),
    new MeshStandardMaterial({ color: "#8e876f", flatShading: true, roughness: 1 }),
    treads.length * 2,
  );
  cheeks.name = "island-quay-stair-cheeks";
  cheeks.castShadow = true;
  cheeks.receiveShadow = true;
  const across = QUAY_STAIR_WIDTH / 2 + 0.15;
  treads.forEach((tread, index) => {
    for (const side of [-1, 1] as const) {
      scratchPosition.set(
        tread.x + side * across * Math.cos(yaw),
        tread.y + 0.06,
        tread.z - side * across * Math.sin(yaw),
      );
      scratchScale.set(1, 1, 1);
      scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
      cheeks.setMatrixAt(index * 2 + (side > 0 ? 1 : 0), scratchMatrix);
    }
  });
  cheeks.instanceMatrix.needsUpdate = true;

  root.add(steps, cheeks);
  return root;
}

// Keep-outs for the denser planting: the built precinct, the pond, and the
// tower's own terrace. Planting also stays off both routes to the summit.
const PLANTING_KEEP_OUT: readonly (readonly [number, number, number])[] = [
  [-7, -1.25, 6.4],
  [-1.2, -0.3, 3.5],
  [4.4, 2.35, 3.1],
  [1.45, -2.05, 3.3],
  [-9.2, 4.1, 1.4],
  [-4.8, 4.1, 1.4],
];
const GARDEN_PATH_POINTS: readonly (readonly [number, number])[] = [
  [5.3, 3.35], [3.25, 3.0], [1.25, 2.45], [-0.55, 1.8],
  [-2.2, 1.1], [-3.75, 0.35], [-5.2, -0.35],
];

function isPlantable(x: number, z: number): boolean {
  for (const [cx, cz, radius] of PLANTING_KEEP_OUT) {
    if (hypot2(x - cx, z - cz) < radius) return false;
  }
  for (const [px, pz] of GARDEN_PATH_POINTS) {
    if (hypot2(x - px, z - pz) < 1.7) return false;
  }
  // Off the cut-stone stair as well.
  const dx = QUAY_STAIR_END.x - QUAY_STAIR_START.x;
  const dz = QUAY_STAIR_END.z - QUAY_STAIR_START.z;
  const length2 = dx * dx + dz * dz;
  const t = clamp01(((x - QUAY_STAIR_START.x) * dx + (z - QUAY_STAIR_START.z) * dz) / length2);
  const nearX = QUAY_STAIR_START.x + dx * t;
  const nearZ = QUAY_STAIR_START.z + dz * t;
  return hypot2(x - nearX, z - nearZ) >= 2.2;
}

/**
 * Deterministic scatter over the planted shelves: a golden-angle spiral
 * (stable, non-clumping, no rejection loop that could vary with seeding) is
 * filtered by the keep-outs and by the height band each species tolerates.
 */
function plantingPoints(
  seed: string,
  attempts: number,
  minHeight: number,
  maxHeight: number,
): { height: number; x: number; z: number }[] {
  const points: { height: number; x: number; z: number }[] = [];
  for (let index = 0; index < attempts; index += 1) {
    const angle = index * 2.399963;
    const radius = 17.4 * Math.sqrt((index + 0.5) / attempts);
    const x = 0.6 + Math.cos(angle) * radius
      + (stableUnit(`${seed}.x.${index}`) - 0.5) * 1.6;
    const z = 1.2 + Math.sin(angle) * radius * 0.7
      + (stableUnit(`${seed}.z.${index}`) - 0.5) * 1.2;
    const height = islandTerrainHeight(x, z);
    if (height < minHeight || height > maxHeight) continue;
    if (!isPlantable(x, z)) continue;
    points.push({ height, x, z });
  }
  return points;
}

/**
 * The denser planting the concept render carries: low shrub mounds across the
 * middle shelves and grass tufts on the exposed rock, both instanced, both
 * seated on `islandTerrainHeight`. Deliberately unlit and matte — the warm
 * pools stay with the lanterns.
 */
function createIslandPlanting(): Group {
  const root = new Group();
  root.name = "island-planting";

  const shrubPoints = plantingPoints("shrub", 96, -0.2, 2.4);
  const shrubs = new InstancedMesh(
    new DodecahedronGeometry(0.5, 0),
    new MeshStandardMaterial({ color: "#5c7350", flatShading: true, roughness: 1 }),
    shrubPoints.length,
  );
  shrubs.name = "island-shrubs";
  shrubs.castShadow = true;
  shrubs.receiveShadow = true;
  shrubPoints.forEach((point, index) => {
    const scale = 0.55 + stableUnit(`shrub.s.${index}`) * 0.72;
    scratchQuaternion.setFromAxisAngle(UP_AXIS, stableUnit(`shrub.y.${index}`) * Math.PI * 2);
    scratchPosition.set(point.x, point.height + scale * 0.26, point.z);
    scratchScale.set(scale, scale * 0.66, scale * 0.9);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    shrubs.setMatrixAt(index, scratchMatrix);
  });
  shrubs.instanceMatrix.needsUpdate = true;

  const tuftPoints = plantingPoints("tuft", 150, -0.6, 2.9);
  const tufts = new InstancedMesh(
    new ConeGeometry(0.17, 0.5, 4, 1, true),
    new MeshStandardMaterial({
      color: "#7d8b5a",
      flatShading: true,
      roughness: 1,
      side: DoubleSide,
    }),
    tuftPoints.length,
  );
  tufts.name = "island-grass-tufts";
  tufts.receiveShadow = true;
  tuftPoints.forEach((point, index) => {
    const scale = 0.6 + stableUnit(`tuft.s.${index}`) * 0.8;
    scratchQuaternion.setFromAxisAngle(UP_AXIS, stableUnit(`tuft.y.${index}`) * Math.PI * 2);
    scratchPosition.set(point.x, point.height + scale * 0.22, point.z);
    scratchScale.set(scale, scale, scale);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    tufts.setMatrixAt(index, scratchMatrix);
  });
  tufts.instanceMatrix.needsUpdate = true;

  root.add(shrubs, tufts);
  return root;
}

// Terrace lanterns for the concept's lantern-lit shelves. Deliberately NOT
// registered through `gardenIslandLanternWorldOffsets()`: those six path
// lanterns own the sea's light lanes, and widening that set would change the
// lane budget the renderer sizes against. These are emissive decoration only —
// no lights, no lanes, no per-frame work.
const TERRACE_LANTERN_POSTS: readonly (readonly [number, number])[] = [
  [8.6, -2.4], [6.2, -5.4], [2.4, -7.4], [-2.4, -6.9],
  [-8.4, -4.6], [-11.4, -0.4], [-10.2, 3.9], [-6.4, 6.6],
  [-1.4, 7.4], [3.4, 6.4], [7.9, 3.6], [10.4, 0.6],
];

function createTerraceLanterns(): Group {
  const root = new Group();
  root.name = "island-terrace-lanterns";
  const seated = TERRACE_LANTERN_POSTS.map(([x, z]) => ({
    height: islandTerrainHeight(x, z),
    x,
    z,
  }));

  const posts = new InstancedMesh(
    new CylinderGeometry(0.13, 0.18, 0.62, 6),
    new MeshStandardMaterial({ color: "#7d7c6e", flatShading: true, roughness: 1 }),
    seated.length,
  );
  posts.name = "island-terrace-lantern-posts";
  posts.castShadow = true;
  posts.receiveShadow = true;
  const lamps = new InstancedMesh(
    new BoxGeometry(0.26, 0.24, 0.26),
    new MeshStandardMaterial({
      color: HARBOR_PALETTE.lantern_glow,
      emissive: HARBOR_PALETTE.lantern_warm,
      emissiveIntensity: 1.35,
      roughness: 0.44,
      toneMapped: false,
    }),
    seated.length,
  );
  lamps.name = "island-terrace-lantern-lamps";
  seated.forEach((post, index) => {
    scratchMatrix.makeTranslation(post.x, post.height + 0.31, post.z);
    posts.setMatrixAt(index, scratchMatrix);
    scratchMatrix.makeTranslation(post.x, post.height + 0.74, post.z);
    lamps.setMatrixAt(index, scratchMatrix);
  });
  posts.instanceMatrix.needsUpdate = true;
  lamps.instanceMatrix.needsUpdate = true;
  root.add(posts, lamps);
  return root;
}
