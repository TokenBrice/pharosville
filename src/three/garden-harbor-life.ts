import {
  BufferGeometry,
  PlaneGeometry,
  Vector2,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
} from "three";
import {
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
  gardenIslandDisplayTile,
} from "../systems/garden-observatory-slice";
import type { ScreenPoint } from "../systems/projection";
import {
  GARDEN_BIRD_SORTIE_CHANCE,
  GARDEN_BIRD_SORTIE_SHARE,
  gardenBirdSortie,
  gardenBirdSortieOffset,
} from "./garden-summit-birds";
import { gardenLandingStonePerch } from "./garden-island";
import type { WeatherPlan } from "../systems/weather";
import type { GardenKeeperRitual } from "./garden-lanterns";

/** Gulls resting on, and now and then wheeling over, the island itself. */
export const GARDEN_GULL_COUNT = 6;

export interface GardenHarborLifeOptions {
  tileScale?: number;
}

export interface GardenGullFlockUpdate {
  constrained: boolean;
  /** 0..1 — gulls roost (fade out) as night settles. */
  night?: number;
  reducedMotion: boolean;
  timeSeconds: number;
  keeperRitual?: GardenKeeperRitual;
  /**
   * Phase 2 weather: a downwind drift on every orbit, and the storm scatter
   * beat — as the storm level crosses ~0.6 the flock climbs and disperses.
   * Both are pure functions of the plan, so the reduced-motion still frame
   * keeps them as composition.
   */
  weather?: Pick<WeatherPlan, "wind" | "stormLevel">;
}

export interface GardenGullFlock {
  gulls: InstancedMesh<BufferGeometry, MeshBasicMaterial>;
  root: Group;
  update(input: GardenGullFlockUpdate): void;
}

export interface GardenGullFlockOptions {
  tileScale?: number;
}

export const GARDEN_FIREFLY_COUNT = 14;

export interface GardenFirefliesUpdate {
  fullTier: boolean;
  night: number;
  reducedMotion: boolean;
  timeSeconds: number;
  /**
   * Phase 4: wind-coupled drift. Gusts push the swarm downwind and each mote
   * swims back home on its own slow cycle — a pure function of the weather
   * plan and the clock, frozen flat under reduced motion.
   */
  weather?: Pick<WeatherPlan, "wind">;
}

export interface GardenFireflies {
  root: Group;
  update(input: GardenFirefliesUpdate): void;
}

/**
 * A handful of warm motes drifting near the island's path lanterns at night.
 * Full tier only; reduced motion freezes them at their seed positions. One
 * instanced additive mesh — a single extra draw call.
 */
export function createGardenFireflies(
  lanternOffsets: ReadonlyArray<{ x: number; y: number; z: number }>,
  islandTile: ScreenPoint,
  options: Pick<GardenHarborLifeOptions, "tileScale"> = {},
): GardenFireflies {
  const tileScale = options.tileScale ?? DEFAULT_TILE_SCALE;
  const root = new Group();
  root.name = "garden-fireflies";
  root.position.set(islandTile.x * tileScale, 0, islandTile.y * tileScale);

  const material = new MeshBasicMaterial({
    color: "#f7d68a",
    depthWrite: false,
    opacity: 0,
    toneMapped: false,
    transparent: true,
  });
  const motes = new InstancedMesh(
    new PlaneGeometry(0.15, 0.15),
    material,
    GARDEN_FIREFLY_COUNT,
  );
  motes.name = "garden-firefly-motes";
  motes.frustumCulled = false;
  motes.renderOrder = 9;
  const viewport = { value: new Vector2(1, 1) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.keeperViewport = viewport;
    shader.vertexShader = `uniform vec2 keeperViewport;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `
      vec4 centre = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      vec4 mvPosition = modelViewMatrix * centre;
      float pixelsPerUnit = keeperViewport.y * projectionMatrix[1][1] / (2.0 * max(0.001, -mvPosition.z));
      float scale = max(length(instanceMatrix[0].xyz), 1.5 / (0.15 * pixelsPerUnit));
      mvPosition.xy += position.xy * scale;
      gl_Position = projectionMatrix * mvPosition;
    `);
  };
  material.customProgramCacheKey = () => "garden-firefly-billboard-v1";
  motes.onBeforeRender = (renderer) => { renderer.getSize(viewport.value); };
  root.add(motes);

  const dummy = new Object3D();
  const update = ({ fullTier, night, reducedMotion, timeSeconds, weather }: GardenFirefliesUpdate): void => {
    const visible = fullTier && night > 0.25 && lanternOffsets.length > 0;
    root.visible = visible;
    if (!visible) return;
    material.opacity = Math.min(0.85, (night - 0.25) * 1.4);
    const time = reducedMotion ? 0 : timeSeconds;
    // Phase 4: the gust envelope sets how far the swarm leaks downwind; each
    // mote fights back to its lantern on its own slow sine, so the swarm
    // breathes with the weather instead of translating as a sheet.
    const push = reducedMotion ? 0 : (weather?.wind.speed ?? 0) * (0.5 + (weather?.wind.gust ?? 0) * 0.9);
    const windX = weather?.wind.x ?? 0;
    const windZ = weather?.wind.y ?? 0;
    for (let index = 0; index < GARDEN_FIREFLY_COUNT; index += 1) {
      // One shaded arc, never a ring of competing lantern-adjacent sparks.
      const anchor = lanternOffsets[0]!;
      const seed = index * 2.399;
      const drift = 0.55 + (index % 3) * 0.22;
      const leak = push * (1.4 + Math.sin(time * 0.07 + seed * 1.3));
      dummy.position.set(
        anchor.x - 1.8 + Math.sin(seed / GARDEN_FIREFLY_COUNT * 0.9) * 2.4
          + Math.sin(time * 0.21 + seed) * drift + windX * leak,
        anchor.y + 0.35 + Math.sin(time * 0.34 + seed * 1.7) * 0.3,
        anchor.z + Math.cos(time * 0.17 + seed * 0.6) * drift + windZ * leak,
      );
      const pulse = 0.6 + 0.4 * Math.sin(time * 0.9 + seed * 3.1);
      dummy.scale.setScalar(0.7 + pulse * 0.5);
      dummy.updateMatrix();
      motes.setMatrixAt(index, dummy.matrix);
    }
    motes.instanceMatrix.needsUpdate = true;
  };
  update({ fullTier: true, night: 1, reducedMotion: true, timeSeconds: 0 });
  return { root, update };
}

const DEFAULT_TILE_SCALE = Math.SQRT2;

/**
 * Wingspan of a gull at rest, as a share of her open span. A bird standing on a
 * wall holds her wings along her body; drawing the open chevron on a perch made
 * the reduced-motion still read as a frozen mid-wheel smear. The wings open as
 * she lifts and fold again as she lands.
 */
const GULL_PERCHED_WING_SPAN = 0.3;
/** How quickly the wings open with airborne-ness: fully spread by a quarter up. */
const GULL_WING_OPEN_RATE = 4;

/**
 * W3.4 — the harbour's birds rest.
 *
 * The island's gulls SIT — on the sea wall, the lighthouse terrace, the landing stone,
 * the gatehouse coping, the signal yard — and lift only for deterministic
 * sorties out of `garden-summit-birds.ts`, the choreography the whole harbour
 * shares.
 *
 * The periods are long enough that no beat is countable, and offset per bird, so
 * the flock has no shared phase. Weather still rides on top of it: a building
 * storm raises the chance and length of a sortie until the whole flock is up and
 * spread (birds startle — that is what a flock does), and gathering night lets
 * the chance fall to nothing before the flock fades out to roost.
 *
 * O17a (Hour-Print W0.17) retired the quay gulls and their harbour-tempo cue,
 * and the bastion and stylobate perches that crowded the tower's shoulders; the
 * dock '24h supply change' rows carry that reading outright.
 */
const ISLAND_GULL_PERIOD = 74;
const ISLAND_GULL_LOOP_RADIUS = 6;
const ISLAND_GULL_LOOP_SPREAD = 1.2;

const LANDING_STONE_GULL_PERCH = gardenLandingStonePerch();

/**
 * Where the island's gulls sit, island-local (which is flock-local: both roots
 * stand on the same tile at y = 0), with the height each bird's turn tops out
 * at.
 *
 * Every perch sits on real masonry: the sea rim, the terrace (top 4.25), the
 * taller landing stone, the gatehouse coping at 6.38 and the signal mast at 6.48.
 * The terrace sortie launches away from the tower axis so its closest point is
 * its perch, clear of the battered 4.6-half-width square tier. Unset `loop`
 * uses the wide radial flight from the island's centre.
 */
const ISLAND_GULL_PERCHES: readonly {
  loop?: "tower-away";
  x: number;
  y: number;
  z: number;
  apex: number;
}[] = [
  { x: 15.22, y: 0.34, z: 7.94, apex: 7.9 },
  { x: 13.94, y: 0.34, z: -6.94, apex: 9.1 },
  { x: -1.55, y: 4.29, z: -6.7, apex: 7.6, loop: "tower-away" },
  { x: LANDING_STONE_GULL_PERCH.x, y: LANDING_STONE_GULL_PERCH.y, z: LANDING_STONE_GULL_PERCH.z, apex: 9.4 },
  { x: 1.6, y: 6.42, z: -1.25, apex: 8.0 },
  { x: 6.35, y: 6.52, z: 4.05, apex: 9.6 },
];

/**
 * One sortie seed per island gull. The index LEADS the name: `stableUnit` is
 * FNV-1a, which barely moves for names differing only in their last character,
 * and a flock whose seeds agree to three decimals shares one loop radius and one
 * window boundary. See `garden-summit-birds.ts`.
 */
const ISLAND_GULL_SEEDS = Array.from(
  { length: GARDEN_GULL_COUNT },
  (_, index) => stableUnit(`${index}.island-gull`),
);

/**
 * Creates one instanced flock. Reduced motion always resolves to the same
 * still composition — every bird on her perch with her wings folded;
 * constrained mode removes the batch without rebuilding it.
 */
export function createGardenGullFlock(
  lighthouseTile: ScreenPoint,
  options: GardenGullFlockOptions = {},
): GardenGullFlock {
  const tileScale = options.tileScale ?? DEFAULT_TILE_SCALE;
  const islandTile = gardenIslandDisplayTile(lighthouseTile);
  const root = new Group();
  root.name = "garden-harbor-gull-flock";
  root.position.set(islandTile.x * tileScale, 0, islandTile.y * tileScale);

  const gulls = new InstancedMesh(
    createGullGeometry(),
    new MeshBasicMaterial({
      color: "#ece8d8",
      depthWrite: false,
      opacity: 0.82,
      side: DoubleSide,
      transparent: true,
    }),
    GARDEN_GULL_COUNT,
  );
  gulls.name = "garden-harbor-gulls";
  gulls.frustumCulled = false;
  gulls.renderOrder = 8;
  root.add(gulls);

  const dummy = new Object3D();
  const update = ({
    constrained,
    night = 0,
    reducedMotion,
    timeSeconds,
    weather,
    keeperRitual,
  }: GardenGullFlockUpdate): void => {
    // Gulls roost as night settles — the night sky belongs to the lanterns.
    const roosted = night > 0.72;
    root.visible = !constrained && !roosted;
    if (constrained || roosted) return;
    gulls.material.opacity = 0.82 * (1 - Math.max(0, (night - 0.3) / 0.42));

    // Phase 2 weather: a downwind drift shared by every orbit, and the storm
    // scatter — gulls ride weather, and a building storm sends them climbing
    // and spreading off their stations.
    const scatterT = Math.max(0, Math.min(1, ((weather?.stormLevel ?? 0) - 0.55) / 0.23));
    const scatter = scatterT * scatterT * (3 - 2 * scatterT);
    const driftX = (weather?.wind.x ?? 0) * (weather?.wind.speed ?? 0) * 2.2;
    const driftZ = (weather?.wind.y ?? 0) * (weather?.wind.speed ?? 0) * 2.2;

    const time = reducedMotion ? 0 : timeSeconds;
    // W3.4: reduced motion resolves every bird to her perch and never consults
    // the clock — a still composition of the flock at rest, not a freeze frame.
    const keeperSettling = keeperRitual?.active && keeperRitual.direction === "evening"
      ? 1 - keeperRitual.progress : 1;
    const flight = reducedMotion ? 0 : keeperSettling;
    // How readily a bird takes a turn. A building storm drives it to certain
    // (the flock startles and stays up), and gathering night lets it fall to
    // nothing well before the flock fades out to roost.
    const settling = 1 - Math.max(0, Math.min(1, (night - 0.15) / 0.55));
    const chance = (GARDEN_BIRD_SORTIE_CHANCE + (1 - GARDEN_BIRD_SORTIE_CHANCE) * scatter)
      * settling;
    const share = GARDEN_BIRD_SORTIE_SHARE
      + (0.96 - GARDEN_BIRD_SORTIE_SHARE) * scatter;

    // Phase 4 flocking, kept for the birds that are UP: cohesion from a SHARED
    // wandering offset (an airborne flock leans the same way at the same time)
    // and organic turns from a clock-driven flow field sampled at each gull's
    // own position. Both are scaled by how airborne she is, so a bird on the
    // sea wall is not dragged off it by the wind or by the flock's mood.
    const wanderX = Math.sin(time * 0.11 + 1.2) * 2.4 + Math.sin(time * 0.043 + 0.3) * 1.6;
    const wanderZ = Math.cos(time * 0.09 + 0.5) * 2.0 + Math.sin(time * 0.051 + 2.0) * 1.4;
    for (let index = 0; index < GARDEN_GULL_COUNT; index += 1) {
      const perch = ISLAND_GULL_PERCHES[index]!;
      const seed = ISLAND_GULL_SEEDS[index]!;
      const sortie = flight
        * gardenBirdSortie(seed, time, ISLAND_GULL_PERIOD, chance, share);
      // How far into the air she is: zero on the perch at both ends of a turn.
      const air = Math.sin(Math.PI * sortie);
      const span = Math.hypot(perch.x, perch.z) || 1;
      // The terrace launch points away from the tower so its outbound loop
      // cannot cross the widened foot.
      let launchX = perch.x / span;
      let launchZ = perch.z / span;
      const loopRadius = ISLAND_GULL_LOOP_RADIUS + seed * ISLAND_GULL_LOOP_SPREAD;
      if (perch.loop === "tower-away") {
        const fromTower = Math.hypot(
          perch.x - GARDEN_LIGHTHOUSE_ROOT_OFFSET.x,
          perch.z - GARDEN_LIGHTHOUSE_ROOT_OFFSET.z,
        ) || 1;
        launchX = (perch.x - GARDEN_LIGHTHOUSE_ROOT_OFFSET.x) / fromTower;
        launchZ = (perch.z - GARDEN_LIGHTHOUSE_ROOT_OFFSET.z) / fromTower;
      }
      const [offsetX, lift, offsetZ, heading] = gardenBirdSortieOffset(
        sortie,
        launchX,
        launchZ,
        loopRadius * (1 + scatter * 0.7),
        perch.apex - perch.y + scatter * (2.2 + (index % 3) * 0.9),
      );
      const gullX = perch.x + offsetX + (wanderX + driftX) * air;
      const gullZ = perch.z + offsetZ + (wanderZ + driftZ) * air;
      dummy.position.set(gullX, perch.y + lift, gullZ);
      const flow = gullFlowAngle(gullX, gullZ, time);
      setGullHeading(dummy, heading + angleDelta(flow, heading) * 0.55 * air);
      const size = 0.52 + (index % 3) * 0.09;
      const wings = GULL_PERCHED_WING_SPAN
        + (1 - GULL_PERCHED_WING_SPAN) * Math.min(1, air * GULL_WING_OPEN_RATE);
      dummy.scale.set(size * wings, size, size);
      dummy.updateMatrix();
      gulls.setMatrixAt(index, dummy.matrix);
    }

    gulls.instanceMatrix.needsUpdate = true;
  };

  const flock = { gulls, root, update };
  update({ constrained: false, reducedMotion: true, timeSeconds: 0 });
  return flock;
}

function createGullGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([
    0, 0, -0.16,
    -1, 0, 0.22,
    -0.34, 0, -0.04,
    0, 0, -0.16,
    0.34, 0, -0.04,
    1, 0, 0.22,
    -0.1, 0, -0.28,
    0.1, 0, -0.28,
    0, 0, 0.42,
  ], 3));
  geometry.setIndex([
    0, 1, 2,
    3, 4, 5,
    6, 7, 8,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Phase 4: the shared gull flow field. Two layered curl-ish sine pairs give a
 * slowly turning heading at any point — gulls sample it at their own position
 * and blend their orbital tangent toward it, which is the cheap boid trick:
 * headings cohere and turns feel organic with zero neighbor queries. Pure in
 * (x, z, t); reduced motion samples it at t = 0 like everything else.
 */
function gullFlowAngle(x: number, z: number, timeSeconds: number): number {
  const u = Math.sin(x * 0.21 + timeSeconds * 0.13)
    + 0.6 * Math.sin((x + z) * 0.11 - timeSeconds * 0.09);
  const v = Math.cos(z * 0.17 - timeSeconds * 0.11)
    + 0.6 * Math.sin(x * 0.13 + timeSeconds * 0.07);
  return Math.atan2(v, u);
}

/** Shortest signed angle from `from` to `to`, in (-PI, PI]. */
function angleDelta(to: number, from: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * Points a gull along a heading given as `atan2(dirZ, dirX)`.
 *
 * The quarter turn is not a fudge: this flock's silhouette (unlike the summit
 * birds', whose nose is +x) flies toward -Z — its wingtips
 * at z = +0.22 are swept AFT of their roots at z = -0.16..-0.04, and the body
 * runs from a blunt head at z = -0.28 to a pointed tail at z = +0.42. Rotating
 * by the fleet's own `-atan2(vz, vx)` therefore put every gull's wings across
 * its line of travel; at a permanent orbit and 0.5 scale that was invisible, but
 * a bird sitting still on a sea wall is a silhouette a viewer can actually read.
 */
function setGullHeading(dummy: Object3D, heading: number): void {
  dummy.rotation.set(0, -heading - Math.PI / 2, 0);
}

function stableUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}
