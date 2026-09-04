import {
  BufferGeometry,
  CircleGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
} from "three";
import {
  GARDEN_DOCK_ROOT_Y,
  gardenDockDisplayTile,
  gardenIslandDisplayTile,
} from "../systems/garden-observatory-slice";
import type { ScreenPoint } from "../systems/projection";
import type { DockNode } from "../systems/world-types";
import {
  GARDEN_BIRD_SORTIE_CHANCE,
  GARDEN_BIRD_SORTIE_SHARE,
  gardenBirdSortie,
  gardenBirdSortieOffset,
} from "./garden-summit-birds";

/** Gulls wheeling over the island itself. */
export const GARDEN_GULL_COUNT = 9;
/** Gulls working each rendered harbour — see `createGardenGullFlock`. */
export const GARDEN_QUAY_GULL_COUNT = 2;

export interface GardenHarborLifeOptions {
  tileScale?: number;
}

export interface GardenGullFlockUpdate {
  constrained: boolean;
  /** 0..1 — gulls roost (fade out) as night settles. */
  night?: number;
  reducedMotion: boolean;
  timeSeconds: number;
  /**
   * Phase 2 weather: a downwind drift on every orbit, and the storm scatter
   * beat — as the storm level crosses ~0.6 the flock climbs and disperses.
   * Both are pure functions of the plan, so the reduced-motion still frame
   * keeps them as composition.
   */
  weather?: {
    windDirX: number;
    windDirZ: number;
    windSpeed: number;
    stormLevel: number;
  };
}

export interface GardenGullFlock {
  gulls: InstancedMesh<BufferGeometry, MeshBasicMaterial>;
  root: Group;
  update(input: GardenGullFlockUpdate): void;
}

export interface GardenGullFlockOptions {
  /** Harbours the flock works, in the order the renderer draws them. */
  docks?: readonly DockNode[];
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
  weather?: {
    gust: number;
    windDirX: number;
    windDirZ: number;
    windSpeed: number;
  };
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
    new CircleGeometry(0.075, 6),
    material,
    GARDEN_FIREFLY_COUNT,
  );
  motes.name = "garden-firefly-motes";
  motes.frustumCulled = false;
  motes.renderOrder = 9;
  // Face the fixed isometric camera.
  motes.rotation.set(-Math.PI / 5.1, Math.PI / 4, 0, "YXZ");
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
    const push = (weather?.windSpeed ?? 0) * (0.5 + (weather?.gust ?? 0) * 0.9);
    const windX = weather?.windDirX ?? 0;
    const windZ = weather?.windDirZ ?? 0;
    for (let index = 0; index < GARDEN_FIREFLY_COUNT; index += 1) {
      const anchor = lanternOffsets[index % lanternOffsets.length]!;
      const seed = index * 2.399;
      const drift = 0.55 + (index % 3) * 0.22;
      const leak = push * (1.4 + Math.sin(time * 0.07 + seed * 1.3));
      dummy.position.set(
        anchor.x + Math.sin(time * 0.21 + seed) * drift + windX * leak,
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

// Harbour tempo. One scalar in -1..1 drives orbit rate, wheel radius and
// height together, so the three read as one state rather than three cues.
//
// Full scale is 3% of held supply in 24h: chain supply moves in fractions of a
// percent on a normal day, so a 3% swing is already a decisive one, and
// clamping there stops a single outlier chain from flattening every other
// harbour into the same tempo.
const QUAY_TEMPO_FULL_SCALE_PCT = 3;
// Deliberately narrow. At the extremes a filling quay's gulls circle roughly
// half again as fast as a draining one's, half again as wide, and a unit
// higher — enough to tell two harbours apart side by side, not enough to look
// frantic.
//
// The wheel stays tight because harbours may sit as close as
// GARDEN_DOCK_SEPARATION_TILES (3.5 tiles, ~5 units) apart, and two flocks
// that overlap belong to neither quay. Clearance is bought with height
// instead: the tallest dock furniture is a landmark tower topping out near
// y = 5, so the flock rides above the cranes and below the island's own gulls
// at 7.2+, which keeps the two flocks separate readings.
const QUAY_GULL_SPEED_SWING = 0.45;
const QUAY_GULL_RADIUS = 2.4;
const QUAY_GULL_RADIUS_SWING = 0.6;
const QUAY_GULL_HEIGHT = 4.2;
const QUAY_GULL_HEIGHT_SWING = 0.5;
const QUAY_GULL_SCALE = 0.42;

/**
 * W3.4 — the harbour's birds rest.
 *
 * Both flocks here used to wheel forever: nine gulls on a permanent ellipse over
 * the island and two more over every quay, none of them ever landing. Together
 * with the summit flock and the hero-hull gulls that is ~40 birds in permanent
 * orbit, which reads as clockwork rather than as life. They now SIT — on the sea
 * wall, the lighthouse terrace, an obelisk, the keeper's ridge, the signal
 * yard, the pier decks — and lift only for deterministic sorties out of
 * `garden-summit-birds.ts`, the choreography the whole harbour shares. At any
 * instant roughly a quarter of them are up.
 *
 * The periods are long enough that no beat is countable, and offset per bird, so
 * the flock has no shared phase. Weather still rides on top of it: a building
 * storm raises the chance and length of a sortie until the whole flock is up and
 * spread (birds startle — that is what a flock does), and gathering night lets
 * the chance fall to nothing before the flock fades out to roost.
 */
const ISLAND_GULL_PERIOD = 74;
const ISLAND_GULL_LOOP_RADIUS = 3.5;
const ISLAND_GULL_LOOP_SPREAD = 1.8;
const QUAY_GULL_TURN_SECONDS = 58;

/**
 * Where the island's nine gulls sit, island-local (which is flock-local: both
 * roots stand on the same tile at y = 0), with the height each bird's turn tops
 * out at — the heights the old permanent ring flew, so the airborne composition
 * is the one this world already had.
 *
 * Every one of these is a real surface, read off the geometry that builds it:
 * the sea wall's coping (`garden-island.ts` ellipse x = 0.6 + 17.2·cosθ,
 * z = 1.2 + 12.9·sinθ, top 0.30), the lighthouse terrace's top and middle steps
 * (tops 5.05 and 4.25), the west obelisk's pyramidion (apex 5.76), the keeper's
 * cottage ridge (apex 5.58) and the signal mast's yard arm (y 6.48, arms ±0.85
 * along the root's π/4 diagonal). Four on the rim, five inland, at five
 * different heights: an unequal scatter rather than a ring (fukinsei).
 */
const ISLAND_GULL_PERCHES: readonly {
  x: number;
  y: number;
  z: number;
  apex: number;
}[] = [
  { x: 15.22, y: 0.34, z: 7.94, apex: 7.9 },
  { x: -11.56, y: 0.34, z: 10.33, apex: 8.6 },
  { x: -9.93, y: 0.34, z: -9.0, apex: 7.4 },
  { x: 13.94, y: 0.34, z: -6.94, apex: 9.1 },
  { x: -10.3, y: 5.09, z: 2.1, apex: 8.3 },
  { x: -3.4, y: 4.29, z: -4.9, apex: 7.6 },
  { x: -9.2, y: 5.8, z: 4.1, apex: 9.4 },
  { x: -1.2, y: 5.62, z: -0.3, apex: 8.0 },
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
 * The quay gulls' perch, in HARBOUR-local units: out along the pier deck, whose
 * top sits at a constant 0.21 above the dock root (`PIER_DECK_TOP_Y`,
 * `garden-docks.ts`) on every harbour however large. The dock root itself stands
 * at `GARDEN_DOCK_ROOT_Y`, which is what turns that into the flock's own space.
 *
 * Deliberately inboard of anything size-dependent: the shortest pier deck runs
 * to x ≈ 3.0 and the narrowest is ±1.0 wide, so these offsets sit on planking on
 * every harbour in the world without this module having to re-derive a single
 * one of `garden-docks.ts`'s scaling formulas.
 */
const QUAY_PERCH_DECK_Y = 0.21 + 0.04 + GARDEN_DOCK_ROOT_Y;
const QUAY_PERCH_OUT = 1.5;
const QUAY_PERCH_OUT_SWING = 0.8;
const QUAY_PERCH_SEATS: readonly [number, number][] = [[0, -0.45], [0.55, 0.52]];

/**
 * 24h held-supply change -> tempo in -1..1. Chains with no reading sit at 0,
 * the same tempo as a chain that genuinely did not move, because an absent
 * number is not evidence of a busy quay.
 */
function quayTempo(change24hPct: number | null | undefined): number {
  if (typeof change24hPct !== "number" || !Number.isFinite(change24hPct)) return 0;
  const unit = change24hPct / QUAY_TEMPO_FULL_SCALE_PCT;
  return Math.max(-1, Math.min(1, unit));
}

/**
 * Creates one instanced flock. Reduced motion always resolves to the same
 * still composition; constrained mode removes the batch without rebuilding it.
 *
 * Tier 3 #13, harbour tempo: given `docks`, the flock also works the quays.
 * Each harbour gets its own small wheel of gulls whose orbit rate, radius and
 * height ride that chain's 24h HELD-SUPPLY change, so a viewer can see which
 * harbours are filling and which are draining. Gulls follow activity — a
 * working quay keeps them wheeling wide and high, a quiet one lets them tuck
 * in and settle. Deliberately no colour, count or jitter channel: a busy
 * harbour has to read as busy, never as distress.
 *
 * This does NOT duplicate the cargo-tide crates on the quay below. Those are
 * ISSUANCE, coins minted and burned at this harbour; this is the chain's total
 * held supply, which also moves when supply bridges in or out. A harbour can
 * be shipping crates out and still filling, and the two marks sit at different
 * heights precisely so that disagreement is readable rather than hidden.
 *
 * Every quay's gulls are extra INSTANCES of the flock's existing mesh, so the
 * whole layer stays the single draw call it already cost.
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

  // Quays are held island-relative so the flock keeps its single root.
  const quays = (options.docks ?? []).map((dock) => {
    const tile = gardenDockDisplayTile(dock.tile);
    return {
      seed: stableUnit(dock.chainId),
      tempo: quayTempo(dock.change24hPct),
      x: (tile.x - islandTile.x) * tileScale,
      z: (tile.y - islandTile.y) * tileScale,
    };
  });
  const gullCount = GARDEN_GULL_COUNT + quays.length * GARDEN_QUAY_GULL_COUNT;

  const gulls = new InstancedMesh(
    createGullGeometry(),
    new MeshBasicMaterial({
      color: "#ece8d8",
      depthWrite: false,
      opacity: 0.82,
      side: DoubleSide,
      transparent: true,
    }),
    gullCount,
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
    const driftX = (weather?.windDirX ?? 0) * (weather?.windSpeed ?? 0) * 2.2;
    const driftZ = (weather?.windDirZ ?? 0) * (weather?.windSpeed ?? 0) * 2.2;

    const time = reducedMotion ? 0 : timeSeconds;
    // W3.4: reduced motion resolves every bird to her perch and never consults
    // the clock — a still composition of the flock at rest, not a freeze frame.
    const flight = reducedMotion ? 0 : 1;
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
      const [offsetX, lift, offsetZ, heading] = gardenBirdSortieOffset(
        sortie,
        perch.x / span,
        perch.z / span,
        (ISLAND_GULL_LOOP_RADIUS + seed * ISLAND_GULL_LOOP_SPREAD) * (1 + scatter * 0.7),
        perch.apex - perch.y + scatter * (2.2 + (index % 3) * 0.9),
      );
      const gullX = perch.x + offsetX + (wanderX + driftX) * air;
      const gullZ = perch.z + offsetZ + (wanderZ + driftZ) * air;
      dummy.position.set(gullX, perch.y + lift, gullZ);
      const flow = gullFlowAngle(gullX, gullZ, time);
      setGullHeading(dummy, heading + angleDelta(flow, heading) * 0.55 * air);
      dummy.scale.setScalar(0.52 + (index % 3) * 0.09);
      dummy.updateMatrix();
      gulls.setMatrixAt(index, dummy.matrix);
    }

    quays.forEach((quay, quayIndex) => {
      // Tempo, unchanged in derivation and in every channel it drives: a
      // filling harbour's gulls take their turns more often and quicker, wheel
      // wider, and climb higher — and, at rest, sit further out along the pier
      // head, where the work is. A draining harbour's tuck in at its root.
      const period = QUAY_GULL_TURN_SECONDS
        / ((1 + quay.tempo * QUAY_GULL_SPEED_SWING) * (1 + scatter * 0.6));
      const loop = (QUAY_GULL_RADIUS + quay.tempo * QUAY_GULL_RADIUS_SWING)
        * (1 + scatter * 0.5);
      const apex = QUAY_GULL_HEIGHT + quay.tempo * QUAY_GULL_HEIGHT_SWING + scatter * 1.6;
      const out = QUAY_PERCH_OUT + quay.tempo * QUAY_PERCH_OUT_SWING;
      // The harbour's own bearing: its root is turned so local +x runs seaward,
      // straight out from the island (`garden-docks.ts` createDock).
      const bearing = Math.hypot(quay.x, quay.z) || 1;
      const seawardX = quay.x / bearing;
      const seawardZ = quay.z / bearing;
      for (let seat = 0; seat < GARDEN_QUAY_GULL_COUNT; seat += 1) {
        const index = GARDEN_GULL_COUNT
          + quayIndex * GARDEN_QUAY_GULL_COUNT
          + seat;
        const [alongPier, acrossPier] = QUAY_PERCH_SEATS[seat % QUAY_PERCH_SEATS.length]!;
        const localX = out + alongPier;
        const perchX = quay.x + localX * seawardX - acrossPier * seawardZ;
        const perchZ = quay.z + localX * seawardZ + acrossPier * seawardX;
        // Harbours take their turns out of step with each other, and the two
        // seats of one quay out of step with each other again.
        const seed = (quay.seed + seat * 0.37) % 1;
        const sortie = flight * gardenBirdSortie(seed, time, period, chance, share);
        const air = Math.sin(Math.PI * sortie);
        const [offsetX, lift, offsetZ, heading] = gardenBirdSortieOffset(
          sortie,
          seawardX,
          seawardZ,
          loop,
          apex - QUAY_PERCH_DECK_Y,
        );
        const gullX = perchX + offsetX + driftX * air;
        const gullZ = perchZ + offsetZ + driftZ * air;
        dummy.position.set(gullX, QUAY_PERCH_DECK_Y + lift, gullZ);
        // Same flow steering as the island flock, gentler — the quay pair is a
        // tempo reading first, a flock second.
        const flow = gullFlowAngle(gullX, gullZ, time);
        setGullHeading(dummy, heading + angleDelta(flow, heading) * 0.3 * air);
        dummy.scale.setScalar(QUAY_GULL_SCALE + seat * 0.05);
        dummy.updateMatrix();
        gulls.setMatrixAt(index, dummy.matrix);
      }
    });
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
 * birds' and the hero gulls', whose nose is +x) flies toward -Z — its wingtips
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
