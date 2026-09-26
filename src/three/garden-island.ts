import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  DodecahedronGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
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
import { GARDEN_ISLAND_OBSTACLE } from "../systems/garden-water-exclusion";
import { HARBOR_PALETTE } from "../systems/palette";
import { TILE_SCALE } from "../systems/projection";
import type { GardenSeason } from "../systems/season";
import type { SupplyTide } from "../systems/supply-tide";
import type { PharosVilleWorld } from "../systems/world-types";
import type { WeatherPlan } from "../systems/weather";
import { createLighthouse } from "./garden-lighthouse";
import { createGardenPrecinct, GARDEN_PRECINCT_GATE } from "./garden-precinct";
import { createGardenKoi } from "./garden-koi";
import { MOON_COLOR, type DayCyclePhase } from "./garden-day-cycle";
import { OVERVIEW_LOD_DETAIL_NAMES } from "./garden-overview-lod";
import { GARDEN_IDENTITY_ANISOTROPY, countDrawableObjects, setTilePosition, stableUnit } from "./garden-util";
import { sampleTideLine } from "./garden-tide-line";
import type { GardenCloudShadowSource } from "./garden-water-contract";
import {
  patchGardenInstancedWindSway,
  updateGardenInstancedWindSway,
  createFloraPadGeometry,
  patchGardenFloraNight,
} from "./garden-flora";

const scratchMatrix = new Matrix4();
const scratchLeanAxis = new Vector3();
const scratchLeanQuaternion = new Quaternion();

// Height-graded rock ramp: dark wet stone at the waterline climbs to pale
// weathered limestone at the crown. Terrace tops carry a planted colour.
// Golden Garden (2026-09-07): derived from HARBOR_PALETTE like the rim, so the
// rock's warmth and the terrace moss follow the dye lot instead of the grey
// green/khaki literals this carried.
const WATERLINE_Y = WATER_LEVEL;

/** The datum notch: scored iron, not the salt crust the PSI mark already uses. */
const TIDE_DATUM_IRON = new Color(HARBOR_PALETTE.iron_dark);
const CROWN_RAMP_Y = 3.4;
const STONE_WET = new Color(HARBOR_PALETTE.stone_dark)
  .lerp(new Color(HARBOR_PALETTE.deep_sea_1), 0.3);
const STONE_MID = new Color(HARBOR_PALETTE.stone_pale)
  .lerp(new Color(HARBOR_PALETTE.fog_day), 0.3);
const STONE_PALE = new Color(HARBOR_PALETTE.fog_day)
  .lerp(new Color(HARBOR_PALETTE.sun_day_warm), 0.35);
// W1.9 crag headland. The rock is kept dark (L* 20–30 at noon) so the tower
// stays the brightest mass: cool dark stone low, a greyer limestone high,
// moss held to a dark olive on the benches, a mid-value court, and the pale
// pebble beach only on the lee where the pond and pavilion rest.
const CRAG_ROCK_LOW = new Color(HARBOR_PALETTE.stone_mid)
  .lerp(new Color(HARBOR_PALETTE.fog_blue), 0.15);
const CRAG_ROCK_HIGH = new Color(HARBOR_PALETTE.stone_pale)
  .lerp(new Color(HARBOR_PALETTE.stone_mid), 0.25)
  .lerp(new Color(HARBOR_PALETTE.fog_day), 0.12);
const CRAG_MOSS = new Color(HARBOR_PALETTE.aurora_green)
  .multiplyScalar(0.5)
  .lerp(new Color(HARBOR_PALETTE.stone_dark), 0.45);
const CRAG_COURT = new Color(HARBOR_PALETTE.fog_day)
  .lerp(new Color(HARBOR_PALETTE.stone_pale), 0.5);
const CRAG_PEBBLE = new Color(HARBOR_PALETTE.stone_pale)
  .lerp(new Color(HARBOR_PALETTE.fog_day), 0.5);
/** pharos-6: the wet foot and the pale barnacle line one hand above it. */
const CRAG_WET_FOOT = STONE_WET.clone().multiplyScalar(0.55);
const CRAG_BARNACLE = new Color(HARBOR_PALETTE.foam_white).multiplyScalar(0.7);
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
  // The raked-gravel ridges and moss grain repeat several times across the
  // terrace; without a mip chain they alias into moiré under camera drift.
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = GARDEN_IDENTITY_ANISOTROPY;
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

// Two stone lanterns punctuate the path rather than outlining it. The former
// six-lamp run made the terrace read as a lit quay; these two retain the lane
// contract while leaving the pale gravel itself as the route's large read.
// W1.9: one at the garden landing, one where the path ends under the crag.
const ISLAND_LANTERN_POSITIONS = [
  [15.0, -3.4],
  [1.9, 1.7],
] as const;
const LANTERN_LAMP_LOCAL_Y = 0.88;

/** The lamp-box draw, by name, so the day cycle can find its one material. */
export const ISLAND_LANTERN_LAMP_NAME = "island-lantern-lamps";

/**
 * T0.2 (2026-09-07): the build-time emissive of the path lamps, i.e. the DAY
 * end of `updateDayCycle`'s island-lantern curve. The lamps were a frozen
 * 1.15 — bright enough at noon to read as lit windows in full sun, and no
 * brighter at midnight than at midday.
 */
export const ISLAND_LANTERN_DAY_EMBER = 0.22;

/**
 * The one path-lantern lamp material of a freshly built island, or null.
 * Handed to the day cycle by the integrator; per-build, so it cannot leak
 * across island rebuilds.
 */
export function gardenIslandLanternMaterial(decoration: Group): MeshStandardMaterial | null {
  const lamps = decoration.getObjectByName(ISLAND_LANTERN_LAMP_NAME);
  return lamps instanceof Mesh && lamps.material instanceof MeshStandardMaterial
    ? lamps.material
    : null;
}

// ---------------------------------------------------------------------------
// W1.9 — the crag headland (Hour-Print pharos-2 How 1/3/4, garden-master-6)
//
// One smooth-shaded height field replaces the three concentric tiers, the
// three planted shelves and the precinct's 19.2 × 4.4 × 19.2 cliff box. The
// Pharos stands on the crown (its court is the tower root, 8.55 world); the
// rock is cut sheer to the Danger water and the open sea on the north and
// west, and steps down toward the rest seat (south/south-east) in three
// unequal benches to the lee bench, a pale pebble beach and a low tide-shelf
// where the pond and the chaseki rest. The footprint is the shared island
// waterline ellipse, so fleet placement and water exclusion stay valid.
// Island-root-local: x east, z south (toward the rest seat), y world height.
// ---------------------------------------------------------------------------

/** The crown: the court the tower stands on is the tower root. */
export const GARDEN_CRAG_CROWN_Y = GARDEN_LIGHTHOUSE_ROOT_OFFSET.y;
const CRAG_BENCH_C_Y = 5.4;
const CRAG_BENCH_B_Y = 3.1;
/** The lee bench the pond, the chaseki and the signal mast stand on. */
const CRAG_BENCH_A_Y = 1.05;
/** The wave-cut platform at the foot of the seaward cliff. */
const CRAG_PLATFORM_Y = WATER_LEVEL + 0.35;
/**
 * The waterline: `GARDEN_ISLAND_OBSTACLE` in island-root-local units (its
 * local centre is (0.6, 1.2), as the island tests measure it).
 */
const CRAG_SHORE = {
  cx: 0.6,
  cz: 1.2,
  rx: GARDEN_ISLAND_OBSTACLE.rx * TILE_SCALE,
  rz: GARDEN_ISLAND_OBSTACLE.ry * TILE_SCALE,
} as const;

interface CragPlateau {
  cx: number;
  cz: number;
  east: number;
  west: number;
  south: number;
  north: number;
  /** Converts the superellipse overrun into approximate units of ground. */
  scale: number;
}

/**
 * The crown is two flat plateaus: the court round the tower (its 6.2-half
 * stylobate plus a narrow lip; deep on the north for the seaward parapet)
 * and the gate spur east of it that the quay stair climbs to.
 */
const CRAG_COURT_PLATEAU: CragPlateau = {
  cx: GARDEN_LIGHTHOUSE_ROOT_OFFSET.x,
  cz: GARDEN_LIGHTHOUSE_ROOT_OFFSET.z,
  east: 7.0,
  west: 7.3,
  south: 7.0,
  north: 8.9,
  scale: 7.5,
};
const CRAG_SPUR_PLATEAU: CragPlateau = {
  cx: 2.2,
  cz: GARDEN_PRECINCT_GATE.z - 0.4,
  east: 2.6,
  west: 2.6,
  south: 2.1,
  north: 2.1,
  scale: 2.3,
};

/** Signed distance-like overrun past a plateau's rounded-square lip (< 0 inside). */
function plateauOverrun(plateau: CragPlateau, x: number, z: number): number {
  const dx = x - plateau.cx;
  const dz = z - plateau.cz;
  const ax = Math.abs(dx) / (dx >= 0 ? plateau.east : plateau.west);
  const az = Math.abs(dz) / (dz >= 0 ? plateau.south : plateau.north);
  // (ax⁸ + az⁸)^(1/8): square enough to seat the stylobate, round at the corners.
  return (Math.hypot(ax ** 4, az ** 4) ** 0.25 - 1) * plateau.scale;
}

/**
 * Which way the ground falls at a bearing from the tower seat (0° east, 90°
 * south toward the seat, ±180° west, −90° north). `seaward` is 1 where the
 * crag is cut sheer (north-east Danger water round to the west); `width`
 * scales the benches — narrow ledges on the east flank above the pavilion,
 * full benches toward the viewer, narrowing again under the south-west pines.
 */
function cragSector(x: number, z: number): { seaward: number; width: number } {
  const theta = Math.atan2(z - CRAG_COURT_PLATEAU.cz, x - CRAG_COURT_PLATEAU.cx) * 180 / Math.PI;
  const seaward = theta > 130
    ? smoothstep01((theta - 130) / 20)
    : theta < -10 ? smoothstep01((-10 - theta) / 20) : 0;
  const width = theta <= 32
    ? 0.3
    : theta <= 95
      ? 0.3 + 0.7 * smoothstep01((theta - 32) / 20)
      : 1 - 0.6 * smoothstep01((theta - 95) / 17);
  return { seaward, width };
}

/** Low-frequency warp for bench risers and the shoreline (±1). */
function cragNoise(x: number, z: number): number {
  return 0.6 * Math.sin(0.9 * x + 0.4 * z + 1.3) + 0.4 * Math.sin(-0.55 * x + 1.1 * z + 0.2);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const CRAG_LIP_Y = GARDEN_CRAG_CROWN_Y - 0.12;

/**
 * The lee fall at `ground` units past the lip: riser, bench C, riser, bench
 * B, riser, then the lee bench A running out to the beach. `width` scales the
 * breakpoints (1 = the full camera-side benches).
 */
function cragBenchProfile(ground: number, width: number): number {
  const riser0 = 0.9 * width;
  const benchC = 2.5 * width;
  const riser1 = 3.1 * width;
  const benchB = 4.7 * width;
  const riser2 = 5.2 * width;
  if (ground < riser0) return mix(CRAG_LIP_Y, CRAG_BENCH_C_Y + 0.15, smoothstep01(ground / riser0));
  if (ground < benchC) return mix(CRAG_BENCH_C_Y + 0.15, CRAG_BENCH_C_Y - 0.15, (ground - riser0) / (benchC - riser0));
  if (ground < riser1) return mix(CRAG_BENCH_C_Y - 0.15, CRAG_BENCH_B_Y + 0.15, smoothstep01((ground - benchC) / (riser1 - benchC)));
  if (ground < benchB) return mix(CRAG_BENCH_B_Y + 0.15, CRAG_BENCH_B_Y - 0.15, (ground - riser1) / (benchB - riser1));
  if (ground < riser2) return mix(CRAG_BENCH_B_Y - 0.15, CRAG_BENCH_A_Y + 0.05, smoothstep01((ground - benchB) / (riser2 - benchB)));
  return CRAG_BENCH_A_Y + 0.05 - 0.15 * smoothstep01((ground - riser2) / 6);
}

/**
 * The shore: on the lee the bench runs out to a pale pebble beach, a low
 * tide-shelf and under the water; on the seaward side the cliff and its
 * platform run to the rim and drop straight in.
 */
function cragShoreCap(x: number, z: number, seaward: number): number {
  const reach = Math.hypot((x - CRAG_SHORE.cx) / CRAG_SHORE.rx, (z - CRAG_SHORE.cz) / CRAG_SHORE.rz)
    + 0.012 * cragNoise(z * 1.7, x * 1.7);
  const open = 99;
  let lee = open;
  if (reach >= 0.965) lee = mix(WATER_LEVEL + 0.12, WATER_LEVEL - 0.45, smoothstep01((reach - 0.965) / 0.035));
  else if (reach >= 0.92) lee = mix(WATER_LEVEL + 0.28, WATER_LEVEL + 0.12, (reach - 0.92) / 0.045);
  else if (reach >= 0.76) lee = mix(CRAG_BENCH_A_Y, WATER_LEVEL + 0.28, smoothstep01((reach - 0.76) / 0.16));
  const sea = reach >= 0.955
    ? mix(GARDEN_CRAG_CROWN_Y + 1, WATER_LEVEL - 0.45, smoothstep01((reach - 0.955) / 0.045))
    : open;
  return mix(lee, sea, seaward);
}

/**
 * Height of the headland surface at a root-relative point. This IS the
 * mesh's height function (the crag is sampled from it), so the stair,
 * lanterns, stones, path, pond, pines and karikomi seat on the real rock.
 */
export function islandTerrainHeight(x: number, z: number): number {
  const { seaward, width } = cragSector(x, z);
  const over = Math.min(
    plateauOverrun(CRAG_COURT_PLATEAU, x, z),
    plateauOverrun(CRAG_SPUR_PLATEAU, x, z),
  );
  let height: number;
  if (over <= 0) {
    // The court: the stylobate beds 0.02 into it; the last 0.2 u (clear of
    // the stylobate's corners) rounds over to the lip.
    height = mix(GARDEN_CRAG_CROWN_Y + 0.02, CRAG_LIP_Y, smoothstep01((over + 0.2) / 0.2));
  } else {
    const ground = over + 0.35 * cragNoise(x, z) * smoothstep01(over / 0.8);
    const lee = cragBenchProfile(ground, width);
    const cliff = mix(CRAG_LIP_Y, CRAG_PLATFORM_Y, smoothstep01(ground / 2.4));
    height = mix(lee, cliff, seaward);
  }
  height = quayStairBed(x, z, height);
  return Math.min(height, cragShoreCap(x, z, seaward));
}

// The quay stair climbs from the east shore to the gate spur: one flight to
// the garden landing on the lee bench (where the path leaves for the pond and
// the chaseki), then one long flight up the flank to the stair head at the
// precinct gate. The rock is raised into a causeway under it and cut down
// where the flight enters the crown, so every tread beds on stone.
const QUAY_STAIR_START = { x: 16.9, z: -5.79 } as const;
const QUAY_STAIR_END = { x: 3.4, z: GARDEN_PRECINCT_GATE.z } as const;
const QUAY_STAIR_TOP_Y = GARDEN_CRAG_CROWN_Y + 0.07;
const QUAY_STAIR_RUN = Math.hypot(QUAY_STAIR_END.x - QUAY_STAIR_START.x, QUAY_STAIR_END.z - QUAY_STAIR_START.z);
const QUAY_STAIR_DIR = {
  x: (QUAY_STAIR_END.x - QUAY_STAIR_START.x) / QUAY_STAIR_RUN,
  z: (QUAY_STAIR_END.z - QUAY_STAIR_START.z) / QUAY_STAIR_RUN,
} as const;
const QUAY_STAIR_LANDING_FROM = 3.6;
const QUAY_STAIR_LANDING_TO = 5.0;
const QUAY_STAIR_LANDING_Y = CRAG_BENCH_A_Y + 0.07;
const QUAY_STAIR_LANDING = {
  x: QUAY_STAIR_START.x + QUAY_STAIR_DIR.x * (QUAY_STAIR_LANDING_FROM + QUAY_STAIR_LANDING_TO) / 2,
  z: QUAY_STAIR_START.z + QUAY_STAIR_DIR.z * (QUAY_STAIR_LANDING_FROM + QUAY_STAIR_LANDING_TO) / 2,
} as const;
// The stair head is the precinct threshold; the landing is where the garden
// path and the torii begin.
export {
  QUAY_STAIR_END as GARDEN_QUAY_STAIR_HEAD,
  QUAY_STAIR_LANDING as GARDEN_QUAY_STAIR_LANDING,
};
const QUAY_STAIR_WIDTH = 1.55;
const QUAY_STAIR_TREAD = 0.44;

/** Tread-top height at `along` units up the stair line. */
function quayStairTreadY(along: number): number {
  const foot = WATER_LEVEL + 0.06;
  if (along <= QUAY_STAIR_LANDING_FROM) return mix(foot, QUAY_STAIR_LANDING_Y, along / QUAY_STAIR_LANDING_FROM);
  if (along <= QUAY_STAIR_LANDING_TO) return QUAY_STAIR_LANDING_Y;
  return mix(
    QUAY_STAIR_LANDING_Y,
    QUAY_STAIR_TOP_Y,
    (along - QUAY_STAIR_LANDING_TO) / (QUAY_STAIR_RUN - QUAY_STAIR_LANDING_TO),
  );
}

/** Raises a causeway under the stair and cuts its corridor into the crown. */
function quayStairBed(x: number, z: number, height: number): number {
  const px = x - QUAY_STAIR_START.x;
  const pz = z - QUAY_STAIR_START.z;
  const along = px * QUAY_STAIR_DIR.x + pz * QUAY_STAIR_DIR.z;
  if (along < -0.6 || along > QUAY_STAIR_RUN + 0.4) return height;
  const across = Math.abs(px * QUAY_STAIR_DIR.z - pz * QUAY_STAIR_DIR.x);
  const rock = quayStairTreadY(Math.max(0, Math.min(QUAY_STAIR_RUN, along))) - 0.3;
  // Buttress shoulders fall at ~77° either side of the treads and cheeks, so
  // the causeway stays a narrow flank rib clear of the lee bench below it.
  const raised = Math.max(height, rock - Math.max(0, across - 1.3) * 4.5);
  return mix(raised, Math.min(raised, rock), 1 - smoothstep01((across - 1.0) / 0.6));
}

export const GARDEN_CRAG_HEADLAND_NAME = "island-crag-headland";
/** Grid cells per side: ~0.49 × 0.37 u spacing, 12.8k triangles. */
const CRAG_GRID = 80;
const scratchCragRock = new Color();
const scratchCragPlane = new Color();

/**
 * Paints one headland vertex by its authored plane: bedded rock on the steep
 * faces (dark low, greyer high), dark moss on the benches, a mid-value court
 * on the crown, pale pebbles on the lee beach and a wet platform at the
 * seaward foot; then the wet foot and barnacle line at the waterline
 * (pharos-6) and the supply tide.
 */
function cragColor(
  x: number,
  y: number,
  z: number,
  slope: number,
  tide: SupplyTide | undefined,
  target: Color,
): Color {
  const above = y - WATERLINE_Y;
  const rock = scratchCragRock.copy(CRAG_ROCK_LOW)
    .lerp(CRAG_ROCK_HIGH, clamp01(above / (GARDEN_CRAG_CROWN_Y - WATERLINE_Y)))
    .multiplyScalar(strataShade(y));
  const { seaward } = cragSector(x, z);
  const reach = Math.hypot((x - CRAG_SHORE.cx) / CRAG_SHORE.rx, (z - CRAG_SHORE.cz) / CRAG_SHORE.rz);
  // Two deterministic mottle scales keep the moss from reading as one band;
  // bare patches let the rock break through; feet and roots wear it.
  const coarse = stableUnit(`crag-coarse~${Math.round(x * 0.75)}~${Math.round(z * 0.75)}`);
  const fine = stableUnit(`crag-fine~${Math.round(x * 3)}~${Math.round(z * 3)}`);
  const bare = clamp01((stableUnit(`crag-bare~${Math.round(x * 1.1)}~${Math.round(z * 1.1)}`) - 0.62) * 2.2);
  target.copy(CRAG_MOSS)
    .multiplyScalar((0.82 + coarse * 0.2 + fine * 0.14) * (1 - gardenGroundWear(x, z) * 0.2))
    .lerp(rock, bare * 0.6);
  target.lerp(
    scratchCragPlane.copy(CRAG_COURT).multiplyScalar(0.9 + fine * 0.14),
    smoothstep01((y - (GARDEN_CRAG_CROWN_Y - 0.5)) / 0.4),
  );
  target.lerp(
    scratchCragPlane.copy(STONE_WET).lerp(CRAG_ROCK_LOW, 0.35),
    seaward * smoothstep01((0.9 - above) / 0.5),
  );
  const steep = smoothstep01((slope - 0.47) / 0.23);
  target.lerp(rock, steep);
  // The pebble beach runs only on the lee where the pond and the chaseki
  // rest (east to east-south-east of the tower), from the bench edge down to
  // the tide-shelf whatever the bank's pitch; elsewhere the bank stays rock
  // and moss so the island never sits on a pale ring.
  const bearing = Math.atan2(z - CRAG_COURT_PLATEAU.cz, x - CRAG_COURT_PLATEAU.cx) * 180 / Math.PI;
  const beachSide = smoothstep01((bearing + 25) / 12) * (1 - smoothstep01((bearing - 38) / 12));
  target.lerp(
    scratchCragPlane.copy(CRAG_PEBBLE).multiplyScalar(0.9 + fine * 0.18),
    beachSide * smoothstep01((reach - 0.75) / 0.05) * (1 - smoothstep01((above - 1.9) / 0.4)),
  );
  target.lerp(CRAG_WET_FOOT, 0.75 * (1 - smoothstep01((above - 0.35) / 0.2)));
  target.lerp(CRAG_BARNACLE, steep * 0.45 * (1 - smoothstep01(Math.abs(above - 0.6) / 0.07)));
  if (tide) {
    const { datum, wet } = sampleTideLine(above, tide);
    if (wet > 0) target.lerp(STONE_WET, wet * 0.6);
    if (datum > 0) target.lerp(TIDE_DATUM_IRON, 0.7);
  }
  return target;
}

/**
 * The headland mesh: an (n+1)² grid squeezed onto the waterline ellipse by
 * the square→disc mapping (the rim ring is exact, the spacing stays even),
 * displaced by `islandTerrainHeight` and painted by slope and height.
 */
function createCragHeadlandGeometry(tide?: SupplyTide): BufferGeometry {
  const side = CRAG_GRID + 1;
  const positions = new Float32Array(side * side * 3);
  const colors = new Float32Array(side * side * 3);
  const uvs = new Float32Array(side * side * 2);
  const color = new Color();
  const probe = 0.3;
  for (let row = 0; row < side; row += 1) {
    const v = -1 + (2 * row) / CRAG_GRID;
    for (let column = 0; column < side; column += 1) {
      const u = -1 + (2 * column) / CRAG_GRID;
      const x = CRAG_SHORE.cx + CRAG_SHORE.rx * u * Math.sqrt(1 - (v * v) / 2);
      const z = CRAG_SHORE.cz + CRAG_SHORE.rz * v * Math.sqrt(1 - (u * u) / 2);
      const y = islandTerrainHeight(x, z);
      const slope = Math.hypot(
        islandTerrainHeight(x + probe, z) - islandTerrainHeight(x - probe, z),
        islandTerrainHeight(x, z + probe) - islandTerrainHeight(x, z - probe),
      ) / (2 * probe);
      cragColor(x, y, z, slope, tide, color);
      const vertex = row * side + column;
      positions[vertex * 3] = x;
      positions[vertex * 3 + 1] = y;
      positions[vertex * 3 + 2] = z;
      colors[vertex * 3] = color.r;
      colors[vertex * 3 + 1] = color.g;
      colors[vertex * 3 + 2] = color.b;
      uvs[vertex * 2] = x / 6;
      uvs[vertex * 2 + 1] = z / 6;
    }
  }
  const indices = new Uint16Array(CRAG_GRID * CRAG_GRID * 6);
  let cursor = 0;
  for (let row = 0; row < CRAG_GRID; row += 1) {
    for (let column = 0; column < CRAG_GRID; column += 1) {
      const a = row * side + column;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      // Counter-clockwise seen from above (+y), so the faces point up.
      indices[cursor++] = a;
      indices[cursor++] = c;
      indices[cursor++] = b;
      indices[cursor++] = b;
      indices[cursor++] = c;
      indices[cursor++] = d;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
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
  return ISLAND_LANTERN_POSITIONS.map(([x, z]) => ({
    x,
    y: islandTerrainHeight(x, z) + LANTERN_LAMP_LOCAL_Y,
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

const ISLAND_DYNAMIC_NAMES = new Set([
  "island-koi",
  "island-niwaki-pads",
  "island-niwaki-trunks",
  "island-path-sweep",
  "island-reflection-pond-skin",
  "lighthouse-beam",
  "lighthouse-beam-cone",
  "lighthouse-beam-dust",
]);

// These groups are visibility/LOD transform boundaries. Their descendants
// are static relative to the group and may merge with one another, but moving
// them to the island root would leave them behind when the group is hidden or
// scaled (notably when the procedural Pharos shell is replaced by its GLB).
const ISLAND_DYNAMIC_CONTAINER_NAMES = new Set([
  "lighthouse-procedural-shell",
  ...OVERVIEW_LOD_DETAIL_NAMES,
]);

const DEFAULT_STANDARD_ON_BEFORE_COMPILE = MeshStandardMaterial.prototype.onBeforeCompile;
const DEFAULT_STANDARD_PROGRAM_CACHE_KEY = DEFAULT_STANDARD_ON_BEFORE_COMPILE.toString();
const DEFAULT_MESH_ON_BEFORE_RENDER = Mesh.prototype.onBeforeRender;
const DEFAULT_MESH_ON_AFTER_RENDER = Mesh.prototype.onAfterRender;

interface IslandStaticMergeBucket {
  material: MeshStandardMaterial;
  meshes: Mesh<BufferGeometry, MeshStandardMaterial>[];
  owner: Group;
}

function hasMaterialTexture(material: MeshStandardMaterial): boolean {
  return Object.values(material).some((value) => (
    value !== null
    && typeof value === "object"
    && (value as { isTexture?: boolean }).isTexture === true
  ));
}

function hasUnsupportedMaterialPatch(material: MeshStandardMaterial): boolean {
  const cacheKey = material.customProgramCacheKey();
  if (material.userData.gardenHeightFog) {
    return cacheKey !== `${DEFAULT_STANDARD_PROGRAM_CACHE_KEY}|garden-height-fog-v1`;
  }
  return material.onBeforeCompile !== DEFAULT_STANDARD_ON_BEFORE_COMPILE
    || cacheKey !== DEFAULT_STANDARD_PROGRAM_CACHE_KEY;
}

function islandMaterialSignature(
  material: MeshStandardMaterial,
  mesh: Mesh,
): string {
  return JSON.stringify([
    material.flatShading,
    material.roughness,
    material.metalness,
    material.side,
    material.emissive.getHexString(),
    material.emissiveIntensity,
    material.transparent,
    material.opacity,
    material.map === null,
    mesh.castShadow,
    mesh.receiveShadow,
    material.name,
    material.toneMapped,
    material.depthWrite,
    material.depthTest,
    material.colorWrite,
    material.alphaTest,
    material.alphaHash,
    material.alphaToCoverage,
    material.blending,
    material.blendSrc,
    material.blendDst,
    material.blendEquation,
    material.blendSrcAlpha,
    material.blendDstAlpha,
    material.blendEquationAlpha,
    material.blendColor.getHexString(),
    material.blendAlpha,
    material.depthFunc,
    material.premultipliedAlpha,
    material.dithering,
    material.fog,
    material.wireframe,
    material.wireframeLinewidth,
    material.polygonOffset,
    material.polygonOffsetFactor,
    material.polygonOffsetUnits,
    material.stencilWrite,
    material.stencilWriteMask,
    material.stencilFunc,
    material.stencilRef,
    material.stencilFuncMask,
    material.stencilFail,
    material.stencilZFail,
    material.stencilZPass,
    material.shadowSide,
    material.precision,
    material.forceSinglePass,
    material.allowOverride,
    material.clipIntersection,
    material.clipShadows,
    material.clippingPlanes?.map((plane) => [
      plane.normal.x,
      plane.normal.y,
      plane.normal.z,
      plane.constant,
    ]) ?? null,
    material.defines,
    material.envMapIntensity,
    material.envMapRotation.x,
    material.envMapRotation.y,
    material.envMapRotation.z,
    material.visible,
    mesh.visible,
    mesh.layers.mask,
    mesh.renderOrder,
    mesh.frustumCulled,
  ]);
}

function prepareIslandMergeGeometry(
  mesh: Mesh<BufferGeometry, MeshStandardMaterial>,
  relativeMatrix: Matrix4,
): BufferGeometry {
  const geometry = mesh.geometry.index
    ? mesh.geometry.toNonIndexed()
    : mesh.geometry.clone();
  geometry.applyMatrix4(relativeMatrix);

  const positions = geometry.getAttribute("position");
  const sourceColors = geometry.getAttribute("color");
  const colors = new Float32Array(positions.count * 3);
  for (let index = 0; index < positions.count; index += 1) {
    const offset = index * 3;
    colors[offset] = mesh.material.color.r
      * (mesh.material.vertexColors && sourceColors ? sourceColors.getX(index) : 1);
    colors[offset + 1] = mesh.material.color.g
      * (mesh.material.vertexColors && sourceColors ? sourceColors.getY(index) : 1);
    colors[offset + 2] = mesh.material.color.b
      * (mesh.material.vertexColors && sourceColors ? sourceColors.getZ(index) : 1);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));

  // None of the eligible materials samples UVs or custom attributes. Keeping
  // only the lit-standard inputs makes unlike primitive geometries mergeable
  // without changing the shader program or its output.
  for (const attribute of Object.keys(geometry.attributes)) {
    if (attribute !== "position" && attribute !== "normal" && attribute !== "color") {
      geometry.deleteAttribute(attribute);
    }
  }
  return geometry;
}

function islandStaticMergeOwner(mesh: Mesh, root: Group): Group {
  let ancestor = mesh.parent;
  while (ancestor && ancestor !== root) {
    if (ancestor instanceof Group && ISLAND_DYNAMIC_CONTAINER_NAMES.has(ancestor.name)) {
      return ancestor;
    }
    ancestor = ancestor.parent;
  }
  return root;
}

/**
 * Collapses immutable, untextured island meshes by their complete visible
 * material state. Source albedo is moved into vertex colour, so differently
 * coloured surfaces can share the resulting white material without a shade
 * change. Dynamic, instanced, textured and shader-patched draws stay intact.
 */
export function mergeIslandStatics(root: Group): { merged: number; kept: number } {
  root.updateMatrixWorld(true);
  const ownerIds = new Map<Group, number>([[root, 0]]);
  const buckets = new Map<string, IslandStaticMergeBucket>();

  root.traverse((object) => {
    if (!(object instanceof Mesh) || object instanceof InstancedMesh) return;
    if (
      object.userData.gardenKeepSeparate
      || ISLAND_DYNAMIC_NAMES.has(object.name)
      || Array.isArray(object.material)
      || !(object.material instanceof MeshStandardMaterial)
      || hasMaterialTexture(object.material)
      || hasUnsupportedMaterialPatch(object.material)
      || object.onBeforeRender !== DEFAULT_MESH_ON_BEFORE_RENDER
      || object.onAfterRender !== DEFAULT_MESH_ON_AFTER_RENDER
      || object.customDepthMaterial !== undefined
      || object.customDistanceMaterial !== undefined
      || object.geometry.drawRange.start !== 0
      || object.geometry.drawRange.count !== Infinity
    ) {
      return;
    }
    const owner = islandStaticMergeOwner(object, root);
    if (!ownerIds.has(owner)) ownerIds.set(owner, ownerIds.size);
    const signature = `${ownerIds.get(owner)}|${islandMaterialSignature(object.material, object)}`;
    const bucket = buckets.get(signature) ?? { material: object.material, meshes: [], owner };
    bucket.meshes.push(object as Mesh<BufferGeometry, MeshStandardMaterial>);
    buckets.set(signature, bucket);
  });

  let merged = 0;
  let signatureIndex = 0;
  for (const bucket of buckets.values()) {
    if (bucket.meshes.length < 2) {
      continue;
    }
    const ownerInverse = bucket.owner.matrixWorld.clone().invert();
    const geometries = bucket.meshes.map((mesh) => prepareIslandMergeGeometry(
      mesh,
      ownerInverse.clone().multiply(mesh.matrixWorld),
    ));
    const geometry = mergeGeometries(geometries, false);
    for (const prepared of geometries) prepared.dispose();
    if (!geometry) {
      continue;
    }

    const source = bucket.meshes[0]!;
    const material = bucket.material.clone();
    material.color.set("#ffffff");
    material.vertexColors = true;
    material.userData = { ...material.userData };
    const mesh = new Mesh(geometry, material);
    mesh.name = `island-merged-${signatureIndex}`;
    mesh.castShadow = source.castShadow;
    mesh.receiveShadow = source.receiveShadow;
    mesh.renderOrder = source.renderOrder;
    mesh.frustumCulled = source.frustumCulled;
    mesh.visible = source.visible;
    mesh.layers.mask = source.layers.mask;
    bucket.owner.add(mesh);

    for (const original of bucket.meshes) {
      original.removeFromParent();
      original.geometry.dispose();
    }
    merged += bucket.meshes.length - 1;
    signatureIndex += 1;
  }

  return { merged, kept: countDrawableObjects(root) };
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

  // W1.9 (the hand, §1.1): organic masses are smooth-shaded; the crag's value
  // comes from its authored planes in vertex colour, not from facets.
  const crag = new Mesh(
    createCragHeadlandGeometry(world.supplyTide),
    new MeshStandardMaterial({
      roughness: 0.95,
      roughnessMap: createMossRoughnessTexture(),
      vertexColors: true,
    }),
  );
  crag.name = GARDEN_CRAG_HEADLAND_NAME;
  crag.castShadow = true;
  crag.receiveShadow = true;
  root.add(crag);

  root.add(createGardenPathSweep());

  const lighthouseRoot = new Group();
  lighthouseRoot.position.set(
    GARDEN_LIGHTHOUSE_ROOT_OFFSET.x,
    GARDEN_LIGHTHOUSE_ROOT_OFFSET.y,
    GARDEN_LIGHTHOUSE_ROOT_OFFSET.z,
  );
  root.add(lighthouseRoot);
  const lighthouse = createLighthouse();
  lighthouse.beacon.userData.gardenKeepSeparate = true;
  lighthouseRoot.add(lighthouse.root);

  const decoration = createIslandDecoration(season);
  root.add(decoration);
  const reflectionPond = createIslandReflectionPond();
  root.add(
    createGardenPrecinct(),
    createObservatoryPavilion(),
    reflectionPond.root,
  );
  root.add(
    createLandingTorii(),
    createLeeBridge(),
    createDangerRockFace(),
    createQuayStair(),
  );
  mergeIslandStatics(root);
  if (cloudShadows) applyGardenCloudShadows(root, cloudShadows);

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

function ringWear(distance: number, radius: number, width: number): number {
  return 1 - smoothstep01(Math.abs(distance - radius) / width);
}

/** Wear gathered where feet, roots and pond wash meet the planted ground. */
function gardenGroundWear(x: number, z: number): number {
  let wear = ringWear(Math.hypot(x - 4.4, z - 2.35), 2.28, 0.52); // pavilion sill
  const pondRadius = Math.hypot(
    (x - GARDEN_POND_CENTER.x) / GARDEN_POND_RADIUS,
    (z - GARDEN_POND_CENTER.z) / (GARDEN_POND_RADIUS * 0.68),
  );
  wear = Math.max(wear, 1 - smoothstep01(Math.abs(pondRadius - 1) / 0.18));
  for (const [px, pz] of ISLAND_LANTERN_POSITIONS) {
    wear = Math.max(wear, 1 - smoothstep01(Math.hypot(x - px, z - pz) / 0.48));
  }
  wear = Math.max(wear, 1 - smoothstep01(Math.hypot(x - 7.2, z - 3.2) / 0.7));
  for (const { x: px, z: pz } of GARDEN_NIWAKI_SPECS) {
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

const CAMERA_FACING_YAW = Math.PI / 4;

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
  // West shore triad, on the wave-cut platform under the seaward cliff.
  [
    { x: -17.3, y: -1.1, z: 3.2, scale: 1.15, dominant: true },
    { x: -16.4, y: -1.0, z: 4.4, scale: 0.68 },
    { x: -18.1, y: -1.1, z: 2.0, scale: 0.55 },
  ],
  // South beach triad, at the feet of the camera-side pines.
  [
    { x: -8.3, y: 0.4, z: 11.2, scale: 1.0, dominant: true },
    { x: -7.1, y: 0.2, z: 11.9, scale: 0.62 },
    { x: -9.4, y: 0.1, z: 11.8, scale: 0.5 },
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
  // Crown triad on the gate spur, north of the stair head.
  [
    { x: 3.0, y: 8.55, z: -5.1, scale: 0.78, dominant: true },
    { x: 3.6, y: 8.55, z: -5.4, scale: 0.5 },
    { x: 2.2, y: 8.55, z: -5.5, scale: 0.44 },
  ],
];

/**
 * One low, solid azalea batch follows the widened path all the way beyond the
 * tea house. Its enlarged domes remain a single opaque instanced draw.
 */
const KARIKOMI_DOME_CAP = 23;

function createKarikomi(season: GardenSeason): InstancedMesh<SphereGeometry, MeshStandardMaterial> {
  // Walk nearly end-to-end so the final span continues beyond the chaseki.
  const curve = gardenPathCurve();
  const domes: { color: Color; height: number; radius: number; seed: string; x: number; z: number }[] = [];
  const azalea = new Color(HARBOR_PALETTE.aurora_green)
    .lerp(new Color(HARBOR_PALETTE.timber_dark), 0.3);
  const curveLength = curve.getLength();
  // A curve normal is only locally perpendicular. On the inside of a bend,
  // another part of the path can be nearer than the sampled source point, so
  // validate each centre against the whole authored route before seating it.
  const pathSamples = curve.getSpacedPoints(1024);
  for (let step = 0; step < 23; step += 1) {
    const u = 0.04 + (step / 22) * 0.92;
    const t = curve.getUtoTmapping(u, u * curveLength);
    const point = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const tangentLength = Math.hypot(tangent.x, tangent.z) || 1;
    const seed = `karikomi.${step}`;
    const radius = (0.32 + stableUnit(`${seed}.r`) * 0.3) * 1.4;
    const halfWidth = GARDEN_PATH_HALF_WIDTH + Math.sin(t * Math.PI * 3.2) * 0.12;
    const row = step % 2 === 0 ? 0 : 0.4;
    const offset = halfWidth + 0.16 + radius + row + stableUnit(`${seed}.o`) * 0.16;
    let x = point.x + (tangent.z / tangentLength) * offset;
    let z = point.z - (tangent.x / tangentLength) * offset;
    // W1.9: the hedge beads the path's seaward flank only while that flank is
    // the lee bench; where it runs out over the bank to the beach (by the
    // garden landing) the path goes unhedged rather than planting the wash.
    if (islandTerrainHeight(x, z) < CRAG_BENCH_A_Y - 0.3) continue;
    const footprintRadius = radius * Math.max(1, 0.82 + stableUnit(`${seed}.depth`) * 0.3);
    const requiredClearance = GARDEN_PATH_HALF_WIDTH + footprintRadius + 0.01;
    for (let correction = 0; correction < 6; correction += 1) {
      let nearest = pathSamples[0]!;
      let nearestDistance = Math.hypot(x - nearest.x, z - nearest.z);
      for (let sampleIndex = 1; sampleIndex < pathSamples.length; sampleIndex += 1) {
        const sample = pathSamples[sampleIndex]!;
        const distance = Math.hypot(x - sample.x, z - sample.z);
        if (distance >= nearestDistance) continue;
        nearest = sample;
        nearestDistance = distance;
      }
      if (nearestDistance >= requiredClearance) break;
      const push = requiredClearance - nearestDistance;
      const awayX = nearestDistance > 1e-6
        ? (x - nearest.x) / nearestDistance
        : tangent.z / tangentLength;
      const awayZ = nearestDistance > 1e-6
        ? (z - nearest.z) / nearestDistance
        : -tangent.x / tangentLength;
      x += awayX * push;
      z += awayZ * push;
    }
    const color = azalea.clone().multiplyScalar(0.86 + stableUnit(`${seed}.tone`) * 0.28);
    if (season === "winter") {
      const luma = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
      color.lerp(new Color(luma, luma, luma), 0.18);
    }
    domes.push({
      color,
      height: radius * (0.44 + stableUnit(`${seed}.squash`) * 0.12),
      radius,
      seed,
      x,
      z,
    });
  }
  const mesh = new InstancedMesh(
    new SphereGeometry(1, 8, 5),
    new MeshStandardMaterial({ color: "#ffffff", flatShading: true, roughness: 0.97 }),
    Math.min(domes.length, KARIKOMI_DOME_CAP),
  );
  mesh.name = "island-karikomi";
  // `mergeIslandStatics` already skips every InstancedMesh, but the flag is
  // the repo's stated "do not swallow this draw" contract (garden-precinct).
  mesh.userData.gardenKeepSeparate = true;
  domes.forEach((dome, index) => {
    // Seated on the rock the way the lanterns are, then sunk ~18% of its own
    // height, so each dome is a mound growing out of the ground rather than a
    // ball resting on it — and so the approximate terrain never floats one.
    scratchQuaternion.setFromAxisAngle(UP_AXIS, stableUnit(`${dome.seed}.yaw`) * Math.PI);
    scratchScale.set(
      dome.radius,
      dome.height,
      dome.radius * (0.82 + stableUnit(`${dome.seed}.depth`) * 0.3),
    );
    scratchPosition.set(dome.x, islandTerrainHeight(dome.x, dome.z) + dome.height * 0.82, dome.z);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    mesh.setMatrixAt(index, scratchMatrix);
    mesh.setColorAt(index, dome.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createIslandDecoration(season: GardenSeason): Group {
  const root = new Group();
  // Five hero niwaki and one maple family share the same two instanced draws.
  root.add(createNiwakiGrove(season));
  // T2.2: one draw of clipped azalea domes edging the path and the low stones.
  root.add(createKarikomi(season));

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
      const seat = stone.dominant ? 0.9 : 0.58;
      scratchPosition.set(
        stone.x,
        islandTerrainHeight(stone.x, stone.z) + stone.scale * seat,
        stone.z,
      );
      scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
      stones.setMatrixAt(stoneIndex, scratchMatrix);
      stoneIndex += 1;
    });
  });
  stones.instanceMatrix.needsUpdate = true;
  root.add(stones);

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
      // T0.2 (2026-09-07): this was a frozen 1.15 — the last constant aperture
      // in the world after the harbour, tower and gatehouse went on the day
      // cycle. The build value is now the DAY end of the curve; `updateDayCycle`
      // owns it from the first frame. Left non-zero so a headless build (and
      // any renderer that never runs the cycle) still shows a lit lamp.
      emissiveIntensity: ISLAND_LANTERN_DAY_EMBER,
      roughness: 0.42,
      toneMapped: false,
    }),
    lanternCount,
  );
  lamps.name = ISLAND_LANTERN_LAMP_NAME;
  const caps = new InstancedMesh(
    new ConeGeometry(0.32, 0.25, 4),
    new MeshStandardMaterial({ color: "#696a61", flatShading: true, roughness: 0.9 }),
    lanternCount,
  );
  caps.name = "island-lantern-caps";
  scratchQuaternion.setFromAxisAngle(UP_AXIS, Math.PI / 4);
  ISLAND_LANTERN_POSITIONS.forEach(([x, z], index) => {
    const y = islandTerrainHeight(x, z);
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

export interface NiwakiSpec {
  height: number;
  leanX: number;
  leanZ: number;
  pads: readonly NiwakiPadSpec[];
  x: number;
  z: number;
}

/**
 * Five unequal hero pines and one autumn maple form one camera-side mass.
 * The first reaches beyond the -x/+z waterline at the lower-left edge.
 */
export const GARDEN_NIWAKI_SPECS: readonly NiwakiSpec[] = [
  {
    height: 8.5,
    leanX: -6.2,
    leanZ: 7.4,
    x: -4.8,
    z: 8.3,
    pads: [
      { t: 0.4, offsetX: -0.35, offsetZ: 0.18, scaleX: 2.35, scaleY: 0.38, scaleZ: 1.22, tone: 0, yaw: -0.28 },
      { t: 0.55, offsetX: 0.6, offsetZ: -0.28, scaleX: 1.72, scaleY: 0.3, scaleZ: 1.02, tone: 1, yaw: 0.16 },
      { t: 0.69, offsetX: -0.7, offsetZ: 0.15, scaleX: 2.58, scaleY: 0.42, scaleZ: 1.35, tone: 0, yaw: -0.12 },
      { t: 0.83, offsetX: 0.42, offsetZ: 0.24, scaleX: 1.92, scaleY: 0.32, scaleZ: 1.08, tone: 1, yaw: 0.25 },
      { t: 0.96, offsetX: -0.2, offsetZ: -0.05, scaleX: 1.28, scaleY: 0.26, scaleZ: 0.76, tone: 0, yaw: -0.34 },
    ],
  },
  {
    height: 7.15,
    leanX: 1.15,
    leanZ: 0.45,
    x: -11.5,
    z: 9.1,
    pads: [
      { t: 0.48, offsetX: 0.4, offsetZ: -0.15, scaleX: 2.1, scaleY: 0.36, scaleZ: 1.18, tone: 1, yaw: 0.18 },
      { t: 0.72, offsetX: -0.48, offsetZ: 0.2, scaleX: 2.42, scaleY: 0.4, scaleZ: 1.28, tone: 0, yaw: -0.2 },
      { t: 0.95, offsetX: 0.15, offsetZ: -0.08, scaleX: 1.18, scaleY: 0.25, scaleZ: 0.72, tone: 1, yaw: 0.3 },
    ],
  },
  {
    height: 6.35,
    leanX: -0.55,
    leanZ: 0.85,
    x: -6.5,
    z: 10.5,
    pads: [
      { t: 0.42, offsetX: -0.4, offsetZ: 0.1, scaleX: 2.18, scaleY: 0.36, scaleZ: 1.1, tone: 0, yaw: -0.2 },
      { t: 0.57, offsetX: 0.52, offsetZ: -0.25, scaleX: 1.58, scaleY: 0.29, scaleZ: 0.94, tone: 1, yaw: 0.22 },
      { t: 0.71, offsetX: -0.62, offsetZ: 0.2, scaleX: 2.36, scaleY: 0.39, scaleZ: 1.24, tone: 0, yaw: -0.08 },
      { t: 0.84, offsetX: 0.32, offsetZ: 0.18, scaleX: 1.72, scaleY: 0.31, scaleZ: 0.98, tone: 1, yaw: 0.28 },
      { t: 0.96, offsetX: -0.1, offsetZ: 0, scaleX: 1.05, scaleY: 0.23, scaleZ: 0.65, tone: 0, yaw: -0.26 },
    ],
  },
  {
    height: 5.5,
    leanX: 1.05,
    leanZ: 0.45,
    x: 0.8,
    z: 10.2,
    pads: [
      { t: 0.5, offsetX: 0.35, offsetZ: -0.1, scaleX: 1.86, scaleY: 0.33, scaleZ: 1.04, tone: 1, yaw: 0.15 },
      { t: 0.73, offsetX: -0.45, offsetZ: 0.18, scaleX: 2.12, scaleY: 0.36, scaleZ: 1.15, tone: 0, yaw: -0.22 },
      { t: 0.95, offsetX: 0.1, offsetZ: -0.05, scaleX: 0.96, scaleY: 0.22, scaleZ: 0.62, tone: 1, yaw: 0.34 },
    ],
  },
  {
    height: 4.65,
    leanX: 0.6,
    leanZ: -0.3,
    x: -9,
    z: 8.5,
    pads: [
      { t: 0.42, offsetX: -0.32, offsetZ: 0.12, scaleX: 1.68, scaleY: 0.3, scaleZ: 0.96, tone: 0, yaw: -0.2 },
      { t: 0.56, offsetX: 0.42, offsetZ: -0.18, scaleX: 1.24, scaleY: 0.25, scaleZ: 0.78, tone: 1, yaw: 0.2 },
      { t: 0.7, offsetX: -0.48, offsetZ: 0.16, scaleX: 1.84, scaleY: 0.32, scaleZ: 1.02, tone: 0, yaw: -0.1 },
      { t: 0.84, offsetX: 0.28, offsetZ: 0.14, scaleX: 1.4, scaleY: 0.27, scaleZ: 0.84, tone: 1, yaw: 0.27 },
      { t: 0.96, offsetX: -0.08, offsetZ: -0.02, scaleX: 0.82, scaleY: 0.2, scaleZ: 0.54, tone: 0, yaw: -0.3 },
    ],
  },
  {
    height: 5.8,
    leanX: -0.7,
    leanZ: 0.9,
    x: -1.8,
    z: 7.6,
    pads: [
      { t: 0.4, offsetX: -0.45, offsetZ: 0.14, scaleX: 1.72, scaleY: 0.42, scaleZ: 1.18, tone: 0, yaw: -0.28 },
      { t: 0.55, offsetX: 0.5, offsetZ: -0.18, scaleX: 1.54, scaleY: 0.38, scaleZ: 1.06, tone: 1, yaw: 0.2 },
      { t: 0.7, offsetX: -0.52, offsetZ: 0.18, scaleX: 1.94, scaleY: 0.46, scaleZ: 1.28, tone: 0, yaw: -0.12 },
      { t: 0.84, offsetX: 0.3, offsetZ: 0.12, scaleX: 1.42, scaleY: 0.37, scaleZ: 0.98, tone: 1, yaw: 0.3 },
      { t: 0.96, offsetX: -0.08, offsetZ: 0, scaleX: 0.92, scaleY: 0.3, scaleZ: 0.72, tone: 0, yaw: -0.22 },
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

function setCylinderBetween(
  mesh: InstancedMesh,
  index: number,
  from: Vector3,
  to: Vector3,
  radius: number,
): void {
  const direction = to.clone().sub(from);
  const length = direction.length();
  const midpoint = from.clone().add(to).multiplyScalar(0.5);
  const rotation = new Quaternion().setFromUnitVectors(UP_AXIS, direction.normalize());
  scratchScale.set(radius, length, radius);
  scratchMatrix.compose(midpoint, rotation, scratchScale);
  mesh.setMatrixAt(index, scratchMatrix);
}

/**
 * Five niwaki and one maple form unequal silhouettes; the first leans out
 * over camera-side water. Trunks/branches and foliage remain two draws.
 */
function createNiwakiGrove(season: GardenSeason): Group {
  const root = new Group();
  root.name = "island-niwaki";
  const trunkCount = GARDEN_NIWAKI_SPECS.reduce((sum, spec) => sum + 5 + spec.pads.length, 0);
  const padCount = GARDEN_NIWAKI_SPECS.reduce((sum, spec, index) => (
    sum + (season === "winter" && index === GARDEN_NIWAKI_SPECS.length - 1 ? 0 : spec.pads.length)
  ), 0);
  const matsuba = new Color(HARBOR_PALETTE.aurora_green)
    .lerp(new Color(HARBOR_PALETTE.timber_dark), 0.42);
  const matsubaLight = matsuba.clone().lerp(new Color(HARBOR_PALETTE.fog_day), 0.13);
  const trunks = new InstancedMesh(
    new CylinderGeometry(0.72, 1, 1, 7),
    new MeshStandardMaterial({
      color: HARBOR_PALETTE.timber_dark,
      flatShading: true,
      roughness: 1,
    }),
    trunkCount,
  );
  trunks.name = "island-niwaki-trunks";
  patchGardenFloraNight(trunks.material as MeshStandardMaterial);
  const foliageMaterial = new MeshStandardMaterial({ color: "#ffffff", flatShading: true, roughness: 0.98 });
  patchGardenFloraNight(foliageMaterial);
  patchGardenInstancedWindSway(foliageMaterial, 1, 0.76);
  const foliage = new InstancedMesh(
    createFloraPadGeometry(),
    foliageMaterial,
    padCount,
  );
  foliage.name = "island-niwaki-pads";
  let trunkIndex = 0;
  let padIndex = 0;
  const padSway = new Float32Array(padCount);
  GARDEN_NIWAKI_SPECS.forEach((spec, pineIndex) => {
    const nodes = [0, 0.23, 0.46, 0.68, 0.84, 1].map((t) => niwakiPoint(spec, t));
    for (let index = 0; index < nodes.length - 1; index += 1) {
      setCylinderBetween(
        trunks,
        trunkIndex,
        nodes[index]!,
        nodes[index + 1]!,
        0.29 - index * 0.025,
      );
      trunkIndex += 1;
    }
    spec.pads.forEach((pad) => {
      const stem = niwakiPoint(spec, Math.max(0.25, pad.t - 0.08));
      const centre = niwakiPoint(spec, pad.t).add(new Vector3(pad.offsetX, 0, pad.offsetZ));
      setCylinderBetween(trunks, trunkIndex, stem, centre, 0.085);
      trunkIndex += 1;
      // The maple sheds its umbrella, but keeps its exposed branch fork.
      if (season === "winter" && pineIndex === GARDEN_NIWAKI_SPECS.length - 1) return;
      scratchQuaternion.setFromAxisAngle(UP_AXIS, pad.yaw);
      scratchScale.set(pad.scaleX, pad.scaleY, pad.scaleZ);
      scratchMatrix.compose(centre, scratchQuaternion, scratchScale);
      foliage.setMatrixAt(padIndex, scratchMatrix);
      const color = (pad.tone ? matsubaLight : matsuba).clone();
      if (season === "autumn" && pineIndex === GARDEN_NIWAKI_SPECS.length - 1) {
        color.lerp(new Color(HARBOR_PALETTE.vermillion), 0.42);
      } else if (season === "winter") {
        const luma = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
        color.lerp(new Color(luma, luma, luma), 0.18);
      }
      foliage.setColorAt(padIndex, color);
      padSway[padIndex] = 0.74 + stableUnit(`niwaki-pad-sway.${pineIndex}.${padIndex}`) * 0.48;
      padIndex += 1;
    });
  });
  trunks.instanceMatrix.needsUpdate = true;
  foliage.instanceMatrix.needsUpdate = true;
  foliage.geometry.setAttribute("aGardenSway", new InstancedBufferAttribute(padSway, 1));
  if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true;
  for (const mesh of [trunks, foliage]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  root.add(trunks, foliage);
  return root;
}

/** Writes the one weather plan into the existing niwaki-pad draw. */
export function updateGardenNiwakiWind(
  decoration: Group,
  weather: WeatherPlan,
  reducedMotion: boolean,
): void {
  const foliage = decoration.getObjectByName("island-niwaki-pads") as InstancedMesh<BufferGeometry, MeshStandardMaterial> | undefined;
  if (foliage) updateGardenInstancedWindSway(foliage.material, weather, reducedMotion);
}


function createObservatoryPavilion(): Group {
  const root = new Group();
  root.name = "island-chaseki";
  root.position.set(4.4, 1.05, 2.35);
  root.rotation.y = 0.22;
  const stoneMaterial = new MeshStandardMaterial({
    color: "#a4a28e",
    flatShading: true,
    roughness: 1,
  });
  const timberMaterial = new MeshStandardMaterial({
    color: HARBOR_PALETTE.timber_dark,
    flatShading: true,
    roughness: 0.96,
  });
  const thatchMaterial = new MeshStandardMaterial({
    color: "#66553c",
    flatShading: true,
    roughness: 1,
  });
  const base = new Mesh(new CylinderGeometry(2.2, 2.4, 0.36, 8), stoneMaterial);
  base.position.y = 0.18;
  root.add(base);
  for (const [x, z] of [[-1.25, -0.8], [-1.25, 0.8], [1.25, -0.8], [1.25, 0.8]] as const) {
    const post = new Mesh(new CylinderGeometry(0.1, 0.13, 2.35, 6), timberMaterial);
    post.position.set(x, 1.45, z);
    root.add(post);
  }
  // Two broad hipped thatch layers make an irimoya-like tea-house roof.
  const lowerRoof = new Mesh(new ConeGeometry(2.75, 0.85, 4), thatchMaterial);
  lowerRoof.position.y = 2.85;
  lowerRoof.rotation.y = Math.PI / 4;
  lowerRoof.scale.z = 0.72;
  root.add(lowerRoof);
  const upperRoof = new Mesh(new ConeGeometry(1.72, 0.72, 4), thatchMaterial);
  upperRoof.position.y = 3.35;
  upperRoof.rotation.y = Math.PI / 4;
  upperRoof.scale.z = 0.68;
  root.add(upperRoof);
  return root;
}

export const GARDEN_POND_RADIUS = 5.5;
export const GARDEN_POND_CENTER = { x: 8.0, z: 6.0 } as const;
const POND_CENTER_X = GARDEN_POND_CENTER.x;
const POND_CENTER_Z = GARDEN_POND_CENTER.z;
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
  tower: new Vector2(
    Math.cos(POND_YAW) * (GARDEN_LIGHTHOUSE_ROOT_OFFSET.x - POND_CENTER_X)
      - Math.sin(POND_YAW) * (GARDEN_LIGHTHOUSE_ROOT_OFFSET.z - POND_CENTER_Z),
    -Math.sin(POND_YAW) * (GARDEN_LIGHTHOUSE_ROOT_OFFSET.x - POND_CENTER_X)
      - Math.cos(POND_YAW) * (GARDEN_LIGHTHOUSE_ROOT_OFFSET.z - POND_CENTER_Z),
  ).normalize(),
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
    vec2 tp=vec2(dot(p,vec2(${GARDEN_POND_REFLECTION_AXES.tower.x},${GARDEN_POND_REFLECTION_AXES.tower.y})),dot(p,vec2(${-GARDEN_POND_REFLECTION_AXES.tower.y},${GARDEN_POND_REFLECTION_AXES.tower.x})));
    float t=(2.8-tp.x)/5.6;
    float w=mix(.78,.22,t)+.2*smoothstep(.66,.72,t)*(1.-smoothstep(.84,.9,t));
    float a=max(fwidth(tp.y),.012);
    float tm=smoothstep(0.,.035,t)*(1.-smoothstep(.965,1.,t))
      *(1.-smoothstep(w-a,w+a,abs(tp.y)))
      *(.62+.38*smoothstep(-.3,.5,sin(tp.x*17.+tp.y*5.)));
    vec2 mp=vec2(dot(p,vec2(-.19572,-.98066)),dot(p,vec2(.98066,-.19572)));
    float mm=exp(-mp.y*mp.y/.16)*(1.-smoothstep(2.4,3.35,abs(mp.x)))
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
  root.name = "island-reflection-basin";
  root.position.set(POND_CENTER_X, islandTerrainHeight(POND_CENTER_X, POND_CENTER_Z) + 0.08, POND_CENTER_Z);
  root.rotation.y = POND_YAW;
  const uniforms: GardenPondReflectionUniforms = {
    uGardenPondMoonColor: { value: MOON_COLOR.clone() },
    uGardenPondStrength: { value: new Vector2(0.08, 0) },
  };
  const pondMaterial = new MeshStandardMaterial({
    color: "#244c4f",
    depthWrite: false,
    metalness: 0.12,
    opacity: 0.82,
    roughness: 0.18,
    side: DoubleSide,
    transparent: true,
  });
  patchGardenPondReflection(pondMaterial, uniforms);
  const pondGeometry = new CircleGeometry(GARDEN_POND_RADIUS, 40);
  pondGeometry.scale(1, 0.68, 1);
  const pond = new Mesh(pondGeometry, pondMaterial);
  pond.name = "island-reflection-pond-skin";
  pond.rotation.x = -Math.PI / 2;
  // The koi draw first and the translucent skin washes over them; opaque rim
  // and stepping stones still write depth, so no fish appears through stone.
  pond.renderOrder = 5;
  root.add(pond);
  const rimGeometry = new RingGeometry(
    GARDEN_POND_RADIUS - 0.16,
    GARDEN_POND_RADIUS + 0.18,
    40,
  );
  rimGeometry.scale(1, 0.68, 1);
  const rim = new Mesh(
    rimGeometry,
    new MeshStandardMaterial({
      color: "#a8a590",
      flatShading: true,
      roughness: 1,
      side: DoubleSide,
    }),
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.035;
  root.add(rim);
  const koi = createGardenKoi();
  root.add(koi.mesh);
  const reflection: GardenPondReflection = {
    update: (phase) => {
      uniforms.uGardenPondStrength.value.set(
        phase.daylight * 0.1 + phase.dusk * 0.3 + phase.night * 0.2,
        phase.night * 0.34 + phase.dusk * 0.19,
      );
    },
  };
  return { reflection, root };
}

/**
 * The garden landing on the quay stair is the threshold; the path crosses
 * the lee bench in one broad S clear of the pond, through the chaseki, and
 * ends under the crag.
 */
export const GARDEN_PATH_HALF_WIDTH = 2;
export const GARDEN_PATH_SWEEP_POINTS: readonly { x: number; z: number }[] = [
  { x: QUAY_STAIR_LANDING.x, z: QUAY_STAIR_LANDING.z },
  { x: 12.6, z: -2.2 },
  { x: 10.8, z: 0.2 },
  { x: 7.8, z: 0.9 },
  { x: 4.4, z: 2.35 },
  { x: 3.6, z: 3.8 },
] as const;

/**
 * The one authored route, as a curve. Shared by the path ribbon and the
 * karikomi that bead it (T2.2, 2026-09-07) so the planting can never drift
 * off the route it is supposed to be edging.
 */
function gardenPathCurve(): CatmullRomCurve3 {
  return new CatmullRomCurve3(
    GARDEN_PATH_SWEEP_POINTS.map(({ x, z }) => new Vector3(x, 0, z)),
    false,
    "centripetal",
  );
}

/**
 * The continuous pale path displaces both the seven box steps and the small
 * pavilion gravel apron. One ribbon is intentionally large enough to remain
 * a line after the 16px blur audit; coarse relief and the existing normal map
 * keep it gravel rather than paint.
 */
function createGardenPathSweep(): Mesh<BufferGeometry, MeshStandardMaterial> {
  const curve = gardenPathCurve();
  const segments = 56;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const gravel = STONE_PALE.clone().lerp(new Color(HARBOR_PALETTE.fog_day), 0.58);
  const color = new Color();
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const point = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const tangentLength = Math.hypot(tangent.x, tangent.z) || 1;
    const normalX = -tangent.z / tangentLength;
    const normalZ = tangent.x / tangentLength;
    const halfWidth = GARDEN_PATH_HALF_WIDTH + Math.sin(t * Math.PI * 3.2) * 0.12;
    for (const side of [-1, 1] as const) {
      const x = point.x + normalX * halfWidth * side;
      const z = point.z + normalZ * halfWidth * side;
      const rake = Math.cos(t * Math.PI * 42 + side * 0.35);
      let y = islandTerrainHeight(x, z) + 0.18 + rake * 0.025;
      if (t < 0.1) {
        y = Math.max(y, QUAY_STAIR_LANDING_Y + 0.06 - t * 1.4);
      }
      positions.push(x, y, z);
      uvs.push((side + 1) / 2, t * 7);
      color.copy(gravel).multiplyScalar(
        (0.94 + (rake + 1) * 0.025) * (1 - gardenGroundWear(x, z) * 0.08),
      );
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let index = 0; index < segments; index += 1) {
    const left = index * 2;
    const right = left + 1;
    const nextLeft = left + 2;
    const nextRight = left + 3;
    indices.push(left, nextLeft, right, right, nextLeft, nextRight);
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
  mesh.name = "island-path-sweep";
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// W7b — Pharos precinct dressing (2026-07-24 wonder plan, decision D8)
// ---------------------------------------------------------------------------

/** Island-local top of the landing torii's kasagi: the gull perch that replaced the obelisk. */
export function gardenLandingToriiPerch(): { x: number; y: number; z: number } {
  return { x: QUAY_STAIR_LANDING.x, y: QUAY_STAIR_LANDING_Y + 3.59, z: QUAY_STAIR_LANDING.z };
}

/** A single timber torii marks the garden landing without competing with the tower. */
function createLandingTorii(): Mesh<BufferGeometry, MeshStandardMaterial> {
  const yaw = Math.atan2(QUAY_STAIR_DIR.x, QUAY_STAIR_DIR.z);
  const parts: BufferGeometry[] = [];
  const place = (geometry: BufferGeometry, x: number, y: number, z: number) => {
    geometry.translate(x, y, z);
    geometry.rotateY(yaw);
    geometry.translate(QUAY_STAIR_LANDING.x, QUAY_STAIR_LANDING_Y, QUAY_STAIR_LANDING.z);
    parts.push(geometry);
  };
  // The posts stand on the stair's shoulders, which fall away from the
  // treads, so they are sunk 0.4 below the landing to bed in the rock.
  place(new BoxGeometry(0.34, 3.8, 0.34), -1.35, 1.5, 0);
  place(new BoxGeometry(0.34, 3.8, 0.34), 1.35, 1.5, 0);
  place(new BoxGeometry(3.7, 0.34, 0.48), 0, 3.42, 0);
  place(new BoxGeometry(2.8, 0.25, 0.3), 0, 2.62, 0);
  const torii = new Mesh(
    mergeGeometries(parts, false),
    new MeshStandardMaterial({
      color: HARBOR_PALETTE.vermillion,
      flatShading: true,
      roughness: 0.9,
    }),
  );
  torii.name = "island-landing-torii";
  torii.userData.gardenKeepSeparate = true;
  torii.castShadow = true;
  torii.receiveShadow = true;
  return torii;
}

/** Five plank spans reach from the lee shore toward the satellite islet. */
function createLeeBridge(): InstancedMesh<BoxGeometry, MeshStandardMaterial> {
  const start = new Vector3(17.8, WATER_LEVEL + 0.42, -6.15);
  const end = new Vector3(25.2, WATER_LEVEL + 0.42, -8.8);
  const spans = 5;
  const bridge = new InstancedMesh(
    new BoxGeometry(1.72, 0.18, 1.9, 1, 1, 1),
    new MeshStandardMaterial({
      color: HARBOR_PALETTE.timber_dark,
      flatShading: true,
      roughness: 0.96,
    }),
    spans,
  );
  bridge.name = "island-lee-plank-bridge";
  const yaw = Math.atan2(end.x - start.x, end.z - start.z);
  scratchQuaternion.setFromAxisAngle(UP_AXIS, yaw);
  for (let index = 0; index < spans; index += 1) {
    scratchPosition.lerpVectors(start, end, (index + 0.5) / spans);
    scratchPosition.y += Math.sin(((index + 0.5) / spans) * Math.PI) * 0.12;
    scratchScale.set(1, 1, 1);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    bridge.setMatrixAt(index, scratchMatrix);
  }
  bridge.instanceMatrix.needsUpdate = true;
  bridge.castShadow = true;
  bridge.receiveShadow = true;
  return bridge;
}

function hypot2(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}

// ---------------------------------------------------------------------------
// W4.9 — the island under the Wonder (grand-scale revamp 2026-07-25),
// re-seated on the W1.9 crag
//
// Instanced additions around the headland: the fractured sea plates standing
// on the wave-cut platform under the Danger cliff, and the cut-stone quay
// stair (its bed is carved into the crag above) from the quay to the gate.
// ---------------------------------------------------------------------------

const CLIFF_BASE_Y = WATER_LEVEL - 0.4;
const CLIFF_HEIGHT = 4.2;
// One face toward the north-east Danger field (+x/-z from the island). Three
// former cliff runs and their all-round talus read as a boulder border; this
// single longer, taller run reads as one exposed geological plane.
const SEA_CLIFF_RUNS: readonly (readonly [number, number])[] = [
  [4.72, 5.4],
];
const CLIFF_RIM_X = 17.6;
const CLIFF_RIM_Z = 13.2;

/**
 * Steep fractured rock plates standing along the island rim. Their outward
 * face is displaced and their inboard face is left flat so each plate beds
 * into the cliff foot behind it; the wet→pale ramp and the bedding shade are baked
 * per vertex, and every instance shares one base height so the strata line up
 * across the whole face.
 */
function createDangerRockFace(): InstancedMesh {
  const placements: { sx: number; sy: number; x: number; yaw: number; z: number }[] = [];
  SEA_CLIFF_RUNS.forEach(([start, end], runIndex) => {
    const steps = Math.max(1, Math.round((end - start) / 0.09));
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
        sy: 0.94 + stableUnit(`${seed}.h`) * 0.14,
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
  cliffs.name = "island-danger-rock-face";
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

function quayStairTreads(): { x: number; y: number; z: number }[] {
  const count = Math.max(2, Math.round(QUAY_STAIR_RUN / QUAY_STAIR_TREAD));
  const treads: { x: number; y: number; z: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    const along = QUAY_STAIR_RUN * (index + 0.5) / count;
    const x = QUAY_STAIR_START.x + QUAY_STAIR_DIR.x * along;
    const z = QUAY_STAIR_START.z + QUAY_STAIR_DIR.z * along;
    // The bed is cut to the profile, so the rock guard only ever lifts a
    // tread the shore cap would otherwise leave awash.
    treads.push({ x, y: Math.max(quayStairTreadY(along), islandTerrainHeight(x, z) + 0.07), z });
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

  // Each block is deeper than the ~0.37 rise of the upper flight, so the
  // steep flight reads as solid steps, never as floating slabs.
  const steps = new InstancedMesh(
    new BoxGeometry(QUAY_STAIR_WIDTH, 0.5, QUAY_STAIR_TREAD * 1.12),
    new MeshStandardMaterial({ color: "#a89e84", flatShading: true, roughness: 1 }),
    treads.length,
  );
  steps.name = "island-quay-stair-treads";
  steps.castShadow = true;
  steps.receiveShadow = true;
  treads.forEach((tread, index) => {
    scratchPosition.set(tread.x, tread.y - 0.25, tread.z);
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
    new BoxGeometry(0.3, 0.52, QUAY_STAIR_TREAD * 1.12),
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
        tread.y - 0.02,
        tread.z - side * across * Math.sin(yaw),
      );
      scratchScale.set(1, 1, 1);
      scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
      cheeks.setMatrixAt(index * 2 + (side > 0 ? 1 : 0), scratchMatrix);
    }
  });
  cheeks.instanceMatrix.needsUpdate = true;

  const footStone = new Mesh(
    new DodecahedronGeometry(0.72, 0),
    new MeshStandardMaterial({ color: "#8e876f", flatShading: true, roughness: 1 }),
  );
  footStone.name = "island-quay-foot-stone";
  footStone.position.set(QUAY_STAIR_START.x + 0.9, WATER_LEVEL + 0.38, QUAY_STAIR_START.z - 0.35);
  footStone.scale.set(1.25, 0.72, 0.92);
  footStone.rotation.y = yaw + 0.4;
  footStone.castShadow = true;
  footStone.receiveShadow = true;
  root.add(steps, cheeks, footStone);
  return root;
}
