import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
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
  RepeatWrapping,
  RGBAFormat,
  RingGeometry,
  SphereGeometry,
  Vector2,
  Vector3,
  UnsignedByteType,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
  GARDEN_WATER_Y as WATER_LEVEL,
  gardenIslandDisplayTile,
} from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import type { GardenSeason } from "../systems/season";
import type { SupplyTide } from "../systems/supply-tide";
import type { PharosVilleWorld } from "../systems/world-types";
import { createLighthouse } from "./garden-lighthouse";
import { applyGardenHeightFog } from "./garden-height-fog";
import { createGardenKoi } from "./garden-koi";
import { MOON_COLOR, type DayCyclePhase } from "./garden-day-cycle";
import { setTilePosition, stableUnit } from "./garden-util";
import { sampleTideLine } from "./garden-tide-line";
import type { GardenCloudShadowSource } from "./garden-water-contract";

const scratchMatrix = new Matrix4();
const scratchLeanAxis = new Vector3();
const scratchLeanQuaternion = new Quaternion();

// Height-graded rock ramp: dark wet stone at the waterline climbs to pale
// weathered limestone at the crown. Terrace tops carry a planted colour.
const WATERLINE_Y = WATER_LEVEL;

/** The datum notch: scored iron, not the salt crust the PSI mark already uses. */
const TIDE_DATUM_IRON = new Color(HARBOR_PALETTE.iron_dark);
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

function gardenSurfaceTexture(
  size: number,
  sample: (x: number, y: number) => readonly [number, number, number],
): DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = sample(x, y);
      const offset = (y * size + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createMossRoughnessTexture(): DataTexture {
  const texture = gardenSurfaceTexture(32, (x, y) => {
    const coarse = Math.sin(x * 0.63 + y * 0.31) * 0.5 + 0.5;
    const fine = Math.sin(x * 2.17 - y * 1.43) * 0.5 + 0.5;
    const roughness = Math.round(188 + coarse * 40 + fine * 22);
    return [roughness, roughness, roughness];
  });
  texture.repeat.set(3, 3);
  return texture;
}

function createRakedGravelNormalTexture(): DataTexture {
  const texture = gardenSurfaceTexture(64, (_x, y) => {
    const slope = Math.cos((y / 64) * Math.PI * 16) * 0.34;
    const normalY = -slope;
    const normalZ = 1 / Math.sqrt(1 + normalY * normalY);
    return [128, Math.round((normalY * normalZ * 0.5 + 0.5) * 255), Math.round((normalZ * 0.5 + 0.5) * 255)];
  });
  texture.repeat.set(4, 4);
  return texture;
}

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
  season: GardenSeason = "summer",
): {
  beacon: Mesh<SphereGeometry, MeshStandardMaterial>;
  beaconHalo: Mesh<SphereGeometry, MeshBasicMaterial>;
  beam: Group;
  decoration: Group;
  lighthouseLight: PointLight;
  lighthouseRoot: Group;
  lighthouseShell: Group;
  pondReflection: GardenPondReflection;
  root: Group;
} {
  const root = new Group();
  setTilePosition(root, gardenIslandDisplayTile(world.lighthouse.tile), 0);

  const rockMaterial = new MeshStandardMaterial({
    flatShading: true,
    roughness: 0.95,
    roughnessMap: createMossRoughnessTexture(),
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
      createRockTerraceGeometry(
        topRadius,
        bottomRadius,
        height,
        segments,
        seed,
        y,
        topColor,
        0.11,
        world.supplyTide,
        { rotation, scaleZ, x, z },
      ),
      rockMaterial,
    );
    tier.position.set(x, y, z);
    tier.scale.z = scaleZ;
    tier.rotation.y = rotation;
    tier.castShadow = true;
    tier.receiveShadow = true;
    root.add(tier);
  }

  for (const [shelfIndex, [radius, x, y, z, scaleZ, seed]] of ([
    [4.55, 3.55, 0.92, 2.9, 0.48, 0.4],
    [3.65, -6.0, 1.9, 2.0, 0.43, 1.8],
    [2.9, 2.25, 2.42, -3.7, 0.52, 2.7],
  ] as const).entries()) {
    const plantedShelf = new Mesh(
      createRockTerraceGeometry(
        radius,
        radius * 1.06,
        0.2,
        16,
        seed,
        y,
        TERRACE_MOSS,
        0.06,
        undefined,
        { rotation: x * 0.08, scaleZ, x, z },
      ),
      rockMaterial,
    );
    plantedShelf.position.set(x, y, z);
    plantedShelf.name = `island-planted-shelf-${shelfIndex}`;
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

  const decoration = createIslandDecoration(season);
  root.add(decoration);
  const reflectionPond = createIslandReflectionPond();
  root.add(
    createKeeperCottage(),
    createObservatoryPavilion(),
    reflectionPond.root,
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
    createIslandPlanting(season),
    createTerraceLanterns(),
    createRakedGravel(),
  );
  if (cloudShadows) applyGardenCloudShadows(root, cloudShadows);
  applyGardenHeightFog(root);

  return {
    beacon: lighthouse.beacon,
    beaconHalo: lighthouse.beaconHalo,
    beam: lighthouse.beam,
    decoration,
    lighthouseLight: lighthouse.light,
    lighthouseRoot,
    lighthouseShell: lighthouse.shell,
    pondReflection: reflectionPond.reflection,
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
      const previousCompile = material.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => {
        previousCompile.call(material, shader, renderer);
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
  // The same helper is used for asynchronously attached lighthouse geometry;
  // keep that late material in the shared air as well as the shared cloud.
  applyGardenHeightFog(root);
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

function stoneRampColor(worldY: number, target: Color, tide?: SupplyTide): Color {
  const t = clamp01((worldY - WATERLINE_Y) / (CROWN_RAMP_Y - WATERLINE_Y));
  if (t < 0.5) target.copy(STONE_WET).lerp(STONE_MID, t / 0.5);
  else target.copy(STONE_MID).lerp(STONE_PALE, (t - 0.5) / 0.5);
  target.multiplyScalar(strataShade(worldY));
  // The tide line rides the ramp the shore rock already paints, so the band
  // costs no geometry and no draw call. Wetting pulls the stone back toward its
  // own submerged colour rather than toward some new ink, which is what keeps
  // the band reading as water on rock instead of as a decal.
  if (tide) {
    const { datum, wet } = sampleTideLine(worldY - WATERLINE_Y, tide);
    if (wet > 0) target.lerp(STONE_WET, wet * 0.6);
    if (datum > 0) target.lerp(TIDE_DATUM_IRON, 0.7);
  }
  // W5.3: salt-polished stone is darkest exactly where the water repeatedly
  // reaches it. This is vertex colour on the existing rock, not another band
  // mesh, so the waterline gains age without a draw call or data meaning.
  const waterlineWear = 1 - smoothstep01((worldY - WATERLINE_Y) / 0.42);
  target.multiplyScalar(1 - waterlineWear * 0.14);
  return target;
}

interface TerraceGroundTransform {
  rotation: number;
  scaleZ: number;
  x: number;
  z: number;
}

function ringWear(distance: number, radius: number, width: number): number {
  return 1 - smoothstep01(Math.abs(distance - radius) / width);
}

/** Wear gathered where feet, roots and pond wash meet the planted cap. */
function gardenGroundWear(x: number, z: number): number {
  let wear = ringWear(Math.hypot(x - 4.4, z - 2.35), 2.28, 0.52); // pavilion sill
  wear = Math.max(wear, ringWear(Math.hypot(x + 1.2, z + 0.3), 2.15, 0.48)); // cottage
  const pondRadius = Math.hypot((x - 1.45) / 2.72, (z + 2.05) / 1.7);
  wear = Math.max(wear, 1 - smoothstep01(Math.abs(pondRadius - 1) / 0.18));
  for (const [px, , pz] of ISLAND_LANTERN_POSITIONS) {
    wear = Math.max(wear, 1 - smoothstep01(Math.hypot(x - px, z - pz) / 0.48));
  }
  wear = Math.max(wear, 1 - smoothstep01(Math.hypot(x - 7.2, z - 3.2) / 0.7));
  for (const [px, pz] of [[5.6, -0.1], [-1.5, -4.8]] as const) {
    wear = Math.max(wear, 1 - smoothstep01(Math.hypot(x - px, z - pz) / 0.62));
  }
  return wear;
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
  tide?: SupplyTide,
  groundTransform?: TerraceGroundTransform,
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
    stoneRampColor(colorY, color, tide).multiplyScalar(ao);
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
          stoneRampColor(baseElevation + vy, capColor, tide);
          color.copy(topColor).lerp(capColor, bare);
          // W5.3: two deterministic scales keep moss from reading as one
          // uniform green band. The coarse value drift reads at the default
          // camera; the fine mottle breaks it up in inspection framing.
          const coarse = stableUnit(
            `${seed}~moss-coarse~${Math.round(vx * 0.75)}~${Math.round(vz * 0.75)}`,
          );
          const fine = stableUnit(
            `${seed}~moss-fine~${Math.round(vx * 3)}~${Math.round(vz * 3)}`,
          );
          color.multiplyScalar(0.82 + coarse * 0.2 + fine * 0.14);
          if (groundTransform) {
            const scaledZ = vz * groundTransform.scaleZ;
            const cos = Math.cos(groundTransform.rotation);
            const sin = Math.sin(groundTransform.rotation);
            const rootX = groundTransform.x + vx * cos + scaledZ * sin;
            const rootZ = groundTransform.z - vx * sin + scaledZ * cos;
            color.multiplyScalar(1 - gardenGroundWear(rootX, rootZ) * 0.2);
          }
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

function createIslandDecoration(season: GardenSeason): Group {
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
      flatShading: true,
      roughness: 0.96,
    }),
    treePoints.length,
  );
  crowns.name = "island-tree-crowns";
  treePoints.forEach(([x, y, z, scale, wind], index) => {
    scratchMatrix.makeScale(scale, scale, scale);
    scratchMatrix.setPosition(x, y + 0.9, z);
    trunks.setMatrixAt(index, scratchMatrix);
    scratchMatrix.makeScale(scale * 1.55, scale * 0.62, scale * 1.12);
    scratchMatrix.setPosition(x + wind, y + 2.18, z);
    crowns.setMatrixAt(index, scratchMatrix);
    const crownColor = new Color("#6f8058");
    // W6.1 momiji: exactly one ordinary grove tree, not the whole island,
    // turns against the retained matsuba pines.
    if (season === "autumn" && index === 7) {
      crownColor.copy(new Color(HARBOR_PALETTE.vermillion))
        .lerp(new Color(HARBOR_PALETTE.lantern_warm), 0.38);
    } else if (season === "winter") {
      const luma = crownColor.r * 0.2126 + crownColor.g * 0.7152 + crownColor.b * 0.0722;
      crownColor.lerp(new Color(luma, luma, luma), 0.16);
    }
    crowns.setColorAt(index, crownColor);
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  root.add(trunks, crowns);
  root.add(createNiwakiGrove());

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
      // W3.1: ember level. These six are the brightest painted glow on the
      // island and they sit a few metres from each other along the path, so
      // they were reading as one lit strip against a beacon that has to stay
      // the only dominant light in the frame. Still unmistakably lamps, still
      // untouched by tone mapping — a step down, not out.
      emissiveIntensity: 1.15,
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

interface NiwakiPadSpec {
  offsetX: number;
  offsetZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  t: number;
  tone: number;
  yaw: number;
}

interface NiwakiSpec {
  height: number;
  leanX: number;
  leanZ: number;
  pads: readonly NiwakiPadSpec[];
  x: number;
  z: number;
}

/** Two asymmetrical heroes: odd pad counts, unequal clouds, obvious lean. */
export const GARDEN_NIWAKI_SPECS: readonly NiwakiSpec[] = [
  {
    height: 5.35,
    leanX: -4.3,
    leanZ: -0.7,
    x: 5.6,
    z: -0.1,
    pads: [
      { t: 0.44, offsetX: -0.28, offsetZ: 0.16, scaleX: 1.55, scaleY: 0.28, scaleZ: 0.88, tone: 0, yaw: -0.22 },
      { t: 0.57, offsetX: 0.52, offsetZ: -0.22, scaleX: 1.18, scaleY: 0.23, scaleZ: 0.72, tone: 1, yaw: 0.18 },
      { t: 0.69, offsetX: -0.6, offsetZ: 0.12, scaleX: 1.75, scaleY: 0.3, scaleZ: 0.96, tone: 0, yaw: -0.1 },
      { t: 0.82, offsetX: 0.35, offsetZ: 0.2, scaleX: 1.32, scaleY: 0.24, scaleZ: 0.78, tone: 1, yaw: 0.27 },
      { t: 0.95, offsetX: -0.2, offsetZ: -0.04, scaleX: 0.9, scaleY: 0.21, scaleZ: 0.58, tone: 0, yaw: -0.3 },
    ],
  },
  {
    height: 4.55,
    leanX: -2.55,
    leanZ: 0.15,
    x: -1.5,
    z: -4.8,
    pads: [
      { t: 0.5, offsetX: 0.42, offsetZ: -0.12, scaleX: 1.42, scaleY: 0.27, scaleZ: 0.84, tone: 1, yaw: 0.2 },
      { t: 0.71, offsetX: -0.52, offsetZ: 0.18, scaleX: 1.7, scaleY: 0.3, scaleZ: 0.94, tone: 0, yaw: -0.18 },
      { t: 0.94, offsetX: 0.12, offsetZ: -0.08, scaleX: 0.88, scaleY: 0.2, scaleZ: 0.56, tone: 1, yaw: 0.32 },
    ],
  },
];

function niwakiPoint(spec: NiwakiSpec, t: number): Vector3 {
  const bend = t * t * (1.08 - t * 0.08);
  return new Vector3(
    spec.x + spec.leanX * bend,
    islandTerrainHeight(spec.x, spec.z) + spec.height * t,
    spec.z + spec.leanZ * bend,
  );
}

function cylinderBetween(
  from: Vector3,
  to: Vector3,
  bottomRadius: number,
  topRadius: number,
): CylinderGeometry {
  const direction = to.clone().sub(from);
  const geometry = new CylinderGeometry(topRadius, bottomRadius, direction.length(), 7, 1);
  const midpoint = from.clone().add(to).multiplyScalar(0.5);
  const rotation = new Quaternion().setFromUnitVectors(UP_AXIS, direction.normalize());
  geometry.applyQuaternion(rotation);
  geometry.translate(midpoint.x, midpoint.y, midpoint.z);
  return geometry;
}

function colorGeometry(geometry: BufferGeometry, color: Color): void {
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) color.toArray(colors, index * 3);
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
}

/**
 * W5.1 decorative niwaki, with no data meaning. The camera-side pine reaches
 * inward over the pond toward the tower in the locked +X/+Z view. Every trunk
 * and branch is merged into one draw, and every matsuba-iro cloud into one.
 */
function createNiwakiGrove(): Group {
  const root = new Group();
  root.name = "island-niwaki";
  const trunkParts: BufferGeometry[] = [];
  const foliageParts: BufferGeometry[] = [];
  const matsuba = new Color(HARBOR_PALETTE.aurora_green)
    .lerp(new Color(HARBOR_PALETTE.timber_dark), 0.42);
  const matsubaLight = matsuba.clone().lerp(new Color(HARBOR_PALETTE.fog_day), 0.13);

  GARDEN_NIWAKI_SPECS.forEach((spec) => {
    const nodes = [0, 0.23, 0.46, 0.68, 0.84, 1].map((t) => niwakiPoint(spec, t));
    for (let index = 0; index < nodes.length - 1; index += 1) {
      trunkParts.push(cylinderBetween(
        nodes[index]!,
        nodes[index + 1]!,
        0.24 - index * 0.025,
        0.215 - index * 0.025,
      ));
    }
    spec.pads.forEach((pad) => {
      const stem = niwakiPoint(spec, Math.max(0.25, pad.t - 0.08));
      const centre = niwakiPoint(spec, pad.t).add(new Vector3(pad.offsetX, 0, pad.offsetZ));
      trunkParts.push(cylinderBetween(stem, centre, 0.09, 0.055));
      const cloud = new SphereGeometry(1, 10, 6);
      cloud.scale(pad.scaleX, pad.scaleY, pad.scaleZ);
      cloud.rotateY(pad.yaw);
      cloud.translate(centre.x, centre.y, centre.z);
      colorGeometry(cloud, pad.tone ? matsubaLight : matsuba);
      foliageParts.push(cloud);
    });
  });

  const trunks = new Mesh(
    mergeGeometries(trunkParts, false),
    new MeshStandardMaterial({
      color: HARBOR_PALETTE.timber_dark,
      flatShading: true,
      roughness: 1,
    }),
  );
  trunks.name = "island-niwaki-trunks";
  const foliage = new Mesh(
    mergeGeometries(foliageParts, false),
    new MeshStandardMaterial({
      flatShading: true,
      roughness: 0.98,
      vertexColors: true,
    }),
  );
  foliage.name = "island-niwaki-pads";
  for (const mesh of [trunks, foliage]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  root.add(trunks, foliage);
  return root;
}

/**
 * The keeper's cottage: foundation, walls, roof, one lit window. That is the
 * whole accessory list, and W3.1 (The Great Quieting) is why — the paper-
 * lantern string along the east eave (three instanced lanterns on two sagging
 * cords, shipped as "I4 warm micro-life") is deleted. It was a fifth glow
 * vocabulary spent on a detail the fixed 30° camera reads at a handful of
 * pixels, and at night it put three more warm points beside the one that says
 * something: the lit window, which is the keeper being home. One light per
 * building; the cottage says it with the window.
 */
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

const POND_CENTER_X = 1.45;
const POND_CENTER_Z = -2.05;
const POND_YAW = -0.18;

/**
 * The two image bearings in the pond's local XY plane. Exported as a small,
 * deterministic geometry contract: the tower streak must point at the actual
 * tower root, while the moon streak must agree with the one light arc.
 * The focused test derives both again from those canonical sources, so a
 * future light or tower move cannot leave these shader constants stale.
 */
export const GARDEN_POND_REFLECTION_AXES = {
  moon: new Vector2(-0.19572, -0.98066),
  tower: new Vector2(-0.96259, -0.27096),
} as const;

interface GardenPondReflectionUniforms {
  uGardenPondMoonColor: { value: Color };
  /** x = tower ink, y = moon light. */
  uGardenPondStrength: { value: Vector2 };
}

export interface GardenPondReflection {
  update: (phase: DayCyclePhase) => void;
}

function pondReflectionGlsl(): string {
  return /* glsl */ `
    vec2 p=vGardenPondPosition;
    vec2 tp=vec2(dot(p,vec2(-.96259,-.27096)),dot(p,vec2(.27096,-.96259)));
    float t=(1.95-tp.x)/3.75;
    float w=mix(.55,.17,t)+.17*smoothstep(.67,.72,t)*(1.-smoothstep(.82,.87,t));
    float a=max(fwidth(tp.y),.012);
    float tm=smoothstep(0.,.035,t)*(1.-smoothstep(.965,1.,t))
      *(1.-smoothstep(w-a,w+a,abs(tp.y)))
      *(.62+.38*smoothstep(-.3,.5,sin(tp.x*17.+tp.y*5.)));
    vec2 mp=vec2(dot(p,vec2(-.19572,-.98066)),dot(p,vec2(.98066,-.19572)));
    float mm=exp(-mp.y*mp.y/.09)*(1.-smoothstep(1.75,2.6,abs(mp.x)))
      *mix(.38,1.,smoothstep(.1,.78,sin(mp.x*19.+mp.y*4.)*.5+.5));
    outgoingLight*=1.-clamp(tm*uGardenPondStrength.x,0.,.32);
    outgoingLight += uGardenPondMoonColor
      *clamp(mm*uGardenPondStrength.y,0.,.34);
  `;
}

function patchGardenPondReflection(
  material: MeshStandardMaterial,
  uniforms: GardenPondReflectionUniforms,
): void {
  const previousCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec2 vGardenPondPosition;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvGardenPondPosition = position.xy;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vGardenPondPosition;
uniform vec3 uGardenPondMoonColor;
uniform vec2 uGardenPondStrength;`,
      )
      .replace(
        "#include <opaque_fragment>",
        `${pondReflectionGlsl()}\n#include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => "garden-pond-reflection-v1";
}

function createIslandReflectionPond(): { reflection: GardenPondReflection; root: Group } {
  const root = new Group();
  root.position.set(POND_CENTER_X, 2.03, POND_CENTER_Z);
  root.rotation.y = POND_YAW;
  const uniforms: GardenPondReflectionUniforms = {
    uGardenPondMoonColor: { value: MOON_COLOR.clone() },
    uGardenPondStrength: { value: new Vector2(0.08, 0) },
  };
  const pondMaterial = new MeshStandardMaterial({
    color: "#315f60",
    depthWrite: false,
    metalness: 0.08,
    opacity: 0.72,
    roughness: 0.28,
    side: DoubleSide,
    transparent: true,
  });
  patchGardenPondReflection(pondMaterial, uniforms);
  const pond = new Mesh(
    new CircleGeometry(2.65, 32),
    pondMaterial,
  );
  pond.name = "island-reflection-pond-skin";
  pond.rotation.x = -Math.PI / 2;
  pond.scale.z = 0.62;
  // The koi draw first and the translucent skin washes over them; opaque rim
  // and stepping stones still write depth, so no fish appears through stone.
  pond.renderOrder = 5;
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
  const koi = createGardenKoi();
  root.add(steppingStones, koi.mesh);
  const reflection: GardenPondReflection = {
    update: (phase) => {
      uniforms.uGardenPondStrength.value.set(
        phase.daylight * 0.08 + phase.dusk * 0.24 + phase.night * 0.15,
        phase.night * 0.3 + phase.dusk * 0.16,
      );
    },
  };
  return { reflection, root };
}

/**
 * W5.3 decorative karesansui apron by the pavilion. A coarse 0.5-unit rake
 * pitch survives the default camera without moire: straight combing eases
 * into rings around the pavilion sill, with shallow vertex relief and colour
 * darkening in the troughs. No texture or binary asset is required.
 */
function createRakedGravel(): Mesh<BufferGeometry, MeshStandardMaterial> {
  const centreX = 7.9;
  const centreZ = 1.1;
  const width = 2.4;
  const depth = 2.35;
  const columns = 28;
  const rows = 18;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const gravel = STONE_PALE.clone().lerp(new Color(HARBOR_PALETTE.fog_day), 0.34);
  const color = new Color();
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      const x = centreX + (column / columns - 0.5) * width;
      const z = centreZ + (row / rows - 0.5) * depth;
      const linearPhase = (z + Math.sin(x * 0.7) * 0.08) * Math.PI * 2 / 0.56;
      const radius = Math.hypot(x - 4.4, z - 2.35);
      const ringPhase = radius * Math.PI * 2 / 0.58;
      const ringMix = smoothstep01((x - 6.1) / 1.7);
      const rake = Math.cos(linearPhase) * (1 - ringMix) + Math.cos(ringPhase) * ringMix;
      const relief = 0.018 + (0.5 + rake * 0.5) * 0.055;
      positions.push(x, islandTerrainHeight(x, z) + relief, z);
      uvs.push(column / columns, row / rows);
      color.copy(gravel).multiplyScalar(
        (0.78 + (rake + 1) * 0.09) * (1 - gardenGroundWear(x, z) * 0.18),
      );
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({
      flatShading: false,
      normalMap: createRakedGravelNormalTexture(),
      roughness: 1,
      vertexColors: true,
    }),
  );
  mesh.name = "island-raked-gravel";
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// W7b — Pharos precinct dressing (2026-07-24 wonder plan, decision D8)
// ---------------------------------------------------------------------------

// Two obelisks — Empereur's precinct finds — flanking the head of the cut
// stone stair from the quay, as its gateposts.
//
// W3.1 (The Great Quieting): they used to stand free on the middle shelf at
// (-9.2, 4.1) and (-4.8, 4.1), a third monument competing with the pavilion
// and the tower for the same seaward read. Nothing is deleted: the pair is
// TRANSFORMED into the stair's threshold, where it earns its stone by giving
// the climb from the water a gate to pass through — one composition instead of
// two. Seated on the rock the stair head lands on, squared to the flight, set
// just outside the cheek walls, and deliberately unequal (fukinsei — a matched
// pair reads as a monument, an unmatched one as a place).
const OBELISK_STAIR_OFFSET = 1.55;
const OBELISK_HEIGHT_SCALES = [1, 0.86] as const;

/**
 * The gatepost pair, derived from the stair itself so the two can never drift
 * apart: seated on the rock at the stair head, squared to the flight, one to
 * each side just outside the cheek walls.
 */
export function gardenPrecinctObeliskGateposts(): {
  scale: number;
  x: number;
  y: number;
  yaw: number;
  z: number;
}[] {
  const yaw = Math.atan2(
    QUAY_STAIR_END.x - QUAY_STAIR_START.x,
    QUAY_STAIR_END.z - QUAY_STAIR_START.z,
  );
  const acrossX = Math.cos(yaw) * OBELISK_STAIR_OFFSET;
  const acrossZ = -Math.sin(yaw) * OBELISK_STAIR_OFFSET;
  return OBELISK_HEIGHT_SCALES.map((scale, index) => {
    const side = index === 0 ? 1 : -1;
    const x = QUAY_STAIR_END.x + side * acrossX;
    const z = QUAY_STAIR_END.z + side * acrossZ;
    // Sunk a finger into the rock: nothing in this garden sits ON the ground.
    return { scale, x, y: islandTerrainHeight(x, z) - 0.05, yaw, z };
  });
}

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
  // Four-sided tapered cylinders read as square shafts; the stair's own yaw
  // squares their faces with the flight they now gate.
  const stoneParts: BufferGeometry[] = [];
  const giltParts: BufferGeometry[] = [];
  for (const post of gardenPrecinctObeliskGateposts()) {
    const place = (geometry: BufferGeometry, localY: number) => {
      // Faces squared to the flight below, so the pair reads as the stair's
      // gate rather than as two stones that happen to stand near it.
      geometry.rotateY(post.yaw);
      geometry.translate(post.x, post.y + localY, post.z);
    };
    const shaftHeight = 3.05 * post.scale;
    const plinth = new BoxGeometry(0.74, 0.3, 0.74);
    place(plinth, 0.15);
    stoneParts.push(plinth);
    const shaft = new CylinderGeometry(0.17, 0.27, shaftHeight, 4);
    place(shaft, 0.3 + shaftHeight / 2);
    stoneParts.push(shaft);
    const cap = new ConeGeometry(0.26, 0.42, 4);
    place(cap, 0.3 + shaftHeight + 0.21);
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
// The stair head is the precinct's threshold — the obelisk gateposts and their
// planting keep-outs are derived from it, so it is contract, not decoration.
export {
  QUAY_STAIR_END as GARDEN_QUAY_STAIR_HEAD,
  QUAY_STAIR_TOP_Y as GARDEN_QUAY_STAIR_TOP_Y,
};
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
  // The obelisk gateposts, wherever the stair head puts them (W3.1).
  ...gardenPrecinctObeliskGateposts().map(
    (post) => [post.x, post.z, 1.4] as readonly [number, number, number],
  ),
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
 * Planting drifts, as `[x, z, radius, share of the attempt budget]`.
 *
 * The rockwork on this island is composed in odd-numbered groups with open
 * ground between them, and the planting has to obey the same rule: an even
 * scatter across the whole shelf reads as ground cover, not as a garden. Five
 * drifts of unequal size and weight sit under the existing tree grove —
 * understory follows canopy — while the harbour approach, the lighthouse
 * precinct and the whole south-east shelf are left deliberately bare.
 */
const PLANTING_DRIFTS: readonly (readonly [number, number, number, number])[] = [
  [-4.4, -7.2, 3.9, 0.26],
  [-12.4, 4.4, 3.6, 0.22],
  [2.0, -6.6, 3.2, 0.2],
  [11.0, 1.2, 3.0, 0.18],
  [-2.0, 6.6, 2.6, 0.14],
];

/**
 * Deterministic scatter over the planted shelves, filtered by the keep-outs and
 * by the height band each species tolerates. Each drift is filled by its own
 * golden-angle spiral, so a thicket covers its ground evenly without clumping
 * into a lump, while the island-scale distribution stays grouped. No rejection
 * loop, so the result cannot vary with seeding.
 */
function plantingPoints(
  seed: string,
  attempts: number,
  minHeight: number,
  maxHeight: number,
): { height: number; x: number; z: number }[] {
  const points: { height: number; x: number; z: number }[] = [];
  PLANTING_DRIFTS.forEach(([centerX, centerZ, radius, share], drift) => {
    const budget = Math.max(1, Math.round(attempts * share));
    for (let index = 0; index < budget; index += 1) {
      const angle = index * 2.399963;
      const reach = radius * Math.sqrt((index + 0.5) / budget);
      const x = centerX + Math.cos(angle) * reach
        + (stableUnit(`${seed}.${drift}.x.${index}`) - 0.5) * 1.1;
      const z = centerZ + Math.sin(angle) * reach * 0.7
        + (stableUnit(`${seed}.${drift}.z.${index}`) - 0.5) * 0.9;
      const height = islandTerrainHeight(x, z);
      if (height < minHeight || height > maxHeight) continue;
      if (!isPlantable(x, z)) continue;
      points.push({ height, x, z });
    }
  });
  return points;
}

/**
 * The denser planting the concept render carries: low shrub mounds across the
 * middle shelves and grass tufts on the exposed rock, both instanced, both
 * seated on `islandTerrainHeight`. Deliberately unlit and matte — the warm
 * pools stay with the lanterns.
 */
function createIslandPlanting(season: GardenSeason): Group {
  const root = new Group();
  root.name = "island-planting";

  const shrubPoints = plantingPoints("shrub", 96, -0.2, 2.4);
  const shrubColor = new Color("#5c7350");
  if (season === "spring") {
    shrubColor.lerp(new Color(HARBOR_PALETTE.vermillion), 0.18);
  } else if (season === "winter") {
    const luma = shrubColor.r * 0.2126 + shrubColor.g * 0.7152 + shrubColor.b * 0.0722;
    shrubColor.lerp(new Color(luma, luma, luma), 0.2);
  }
  const shrubs = new InstancedMesh(
    new DodecahedronGeometry(0.5, 0),
    new MeshStandardMaterial({ color: shrubColor, flatShading: true, roughness: 1 }),
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
//
// W3.1 (The Great Quieting): this was a ring of TWELVE at near-even angular
// spacing around the whole rim — a uniform placement field of light, which the
// anchorage contract bans for moorings for exactly the reason it fails here:
// evenly spaced points read as a fairground perimeter, and they crowded the
// beacon at the top of the night hierarchy. Five remain, at unequal intervals
// and with a whole quiet quadrant (the north-west shelf) left dark, so the eye
// reads lamps standing in a garden rather than a rope of lights.
const TERRACE_LANTERN_POSTS: readonly (readonly [number, number])[] = [
  [2.4, -7.4], // far shelf, behind the crown — depth, seen past the tower
  [10.4, 0.6], // east rim, above the quay stair's landing
  [3.4, 6.4], // camera-facing shelf
  [-6.4, 6.6], // its far, unequal partner across the front
  [-11.4, -0.4], // west rim, alone
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
      // W3.1: ember level, one step under the path lanterns that own the
      // sea's lanes — the shelves are lit, the path is walked.
      emissiveIntensity: 1.02,
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
