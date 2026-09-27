import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
  gardenIslandDisplayTile,
} from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import type { ScreenPoint } from "../systems/projection";
import { REST_SEAT_EYE_HEIGHT } from "../systems/rest-seat";
import type { WeatherPlan } from "../systems/weather";
import { chainGardenMaterialPatch } from "./garden-aerial";
import { gardenLandingStonePerch, islandTerrainHeight } from "./garden-island";
import type { GardenKeeperRitual } from "./garden-lanterns";

/**
 * W5.3 (life-3): the island's gulls — birds with wings.
 *
 * Six gulls, mostly perched on the island's structure (the signal mast's
 * truck, the chaseki's ridge, the landing stone, the shore rocks). Now and then one
 * lifts for a closed sortie: a few quick beats with the wings bent at the
 * wrist, then a long banking glide on stiff wings in the gull's shallow "M",
 * and back down to the spot she left. Each bird is real wing geometry — an
 * inner and an outer panel per side, a forked tail, Y relief — articulated in
 * the vertex shader (shoulder and wrist hinges, flap-flap-glide on a per-bird
 * clock); perched, the wings fold along the flanks.
 *
 * They never climb above `GARDEN_GULL_CEILING` (below the rest seat's eye, so
 * from the seat no gull can ever stand against the sky above the horizon, let
 * alone the crown) and never enter the lantern's exclusion disc around the
 * tower axis. No gulls at night: the flock roosts as the night beat rises.
 * Reduced motion: every bird perched, wings folded.
 */

/** Gulls resting on, and now and then wheeling over, the island itself. */
export const GARDEN_GULL_COUNT = 6;
/** Highest a gull flies, world units: under the rest seat's eye height. */
export const GARDEN_GULL_CEILING = REST_SEAT_EYE_HEIGHT - 3.5;
/** Horizontal radius about the tower axis no airborne gull enters. */
export const GARDEN_GULL_CROWN_EXCLUSION = 7.5;
/** Night beat past which the flock has gone to roost. */
export const GARDEN_GULL_ROOST_NIGHT = 0.35;

/**
 * Shared station-bird sorties are deliberately rare: a successful window uses
 * only 18% of its minute, for a design occupancy below one bird in ten.
 */
export const GARDEN_BIRD_SORTIE_PERIOD = 62;
export const GARDEN_BIRD_SORTIE_CHANCE = 0.55;
export const GARDEN_BIRD_SORTIE_SHARE = 0.18;

/**
 * Eased progress through one closed excursion, [0, 1]: 0 while she is sitting
 * (before her turn), 1 once she is back down (after it), and the eased sweep
 * between while she is up. Both resting values put her on her perch and both
 * approach it with zero speed, so a sortie has no take-off pop and no landing
 * snap.
 */
export function gardenBirdSortie(
  seed: number,
  timeSeconds: number,
  period: number = GARDEN_BIRD_SORTIE_PERIOD,
  chance: number = GARDEN_BIRD_SORTIE_CHANCE,
  share: number = GARDEN_BIRD_SORTIE_SHARE,
): number {
  if (share <= 0 || chance <= 0) return 0;
  // The bird's own window clock, offset by her seed so no two birds share a
  // window boundary and the flock can never lift as one.
  const cycle = timeSeconds / period + seed * 7.13;
  const window = Math.floor(cycle);
  const frac = cycle - window;
  // One deterministic die per (bird, window), and where in it her turn falls.
  const flies = gardenBirdHash(window * 1.37 + seed * 91.7) <= chance ? 1 : 0;
  const start = gardenBirdHash(window * 3.91 + seed * 17.3) * (1 - share);
  const u = Math.min(1, Math.max(0, (frac - start) / share));
  return flies * u * u * (3 - 2 * u);
}

/** `fract(sin(n) * 43758.5453123)`. */
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
 * progress 0 and 1 the offset is exactly zero and the climb term is zero too.
 * `heading` is the loop's exact tangent. Returns `[x, y, z, heading]`.
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

export interface GardenGullFlockUpdate {
  constrained: boolean;
  /** 0..1 night beat — the flock roosts (is gone) past `GARDEN_GULL_ROOST_NIGHT`. */
  night?: number;
  reducedMotion: boolean;
  timeSeconds: number;
  keeperRitual?: GardenKeeperRitual;
  /**
   * Phase 2 weather: a downwind drift on every sortie, and the storm scatter —
   * as the storm level crosses ~0.6 the flock climbs and disperses.
   */
  weather?: Pick<WeatherPlan, "wind" | "stormLevel">;
}

export interface GardenGullFlock {
  gulls: InstancedMesh<BufferGeometry, MeshStandardMaterial>;
  root: Group;
  update(input: GardenGullFlockUpdate): void;
}

export interface GardenGullFlockOptions {
  tileScale?: number;
}

const DEFAULT_TILE_SCALE = Math.SQRT2;

/** Sortie clock (life-3): on average well under one bird airborne. */
const ISLAND_GULL_PERIOD = 140;
const ISLAND_GULL_SORTIE_CHANCE = 0.3;
const ISLAND_GULL_SORTIE_SHARE = 0.14;
const ISLAND_GULL_LOOP_RADIUS = 6;
const ISLAND_GULL_LOOP_SPREAD = 1.2;
/** Bank into the sortie's constant turn, radians at full air. */
const GULL_BANK = 0.42;

const LANDING_STONE_GULL_PERCH = gardenLandingStonePerch();
/** The signal mast's step on the lee bench and its height (`garden-signal-mast.ts`, world-renderer). */
const SIGNAL_MAST_TRUCK = { x: 7.2, y: 0.98 + 7.2, z: 3.2 } as const;
/** The chaseki's hipped ridge (root (4.4, 1.05, 2.35) yawed 0.22; roof seat 2.58 + ridge 0.85). */
const CHASEKI_RIDGE = { x: 4.4, y: 1.05 + 2.58 + 0.85, z: 2.35, yaw: 0.22 } as const;

function chasekiRidge(along: number): { x: number; y: number; z: number } {
  return {
    x: CHASEKI_RIDGE.x + along * Math.cos(CHASEKI_RIDGE.yaw),
    y: CHASEKI_RIDGE.y,
    z: CHASEKI_RIDGE.z - along * Math.sin(CHASEKI_RIDGE.yaw),
  };
}

function shoreRock(x: number, z: number): { x: number; y: number; z: number } {
  return { x, y: islandTerrainHeight(x, z), z };
}

/**
 * Where the island's gulls sit, island-local, with the height each bird's turn
 * tops out at. Every perch is real structure on the post-W1 crag, visible from
 * the rest seat: the signal mast's truck, the chaseki's ridge, the taller
 * landing stone and two rocks on the camera-side shore.
 */
const ISLAND_GULL_PERCHES: readonly {
  x: number;
  y: number;
  z: number;
  apex: number;
}[] = [
  { ...SIGNAL_MAST_TRUCK, apex: 10.8 },
  { ...chasekiRidge(-0.5), apex: 8.6 },
  { ...chasekiRidge(0.55), apex: 9.4 },
  { ...LANDING_STONE_GULL_PERCH, apex: 9.2 },
  { ...shoreRock(15.5, 7), apex: 7.6 },
  { ...shoreRock(4, 13.5), apex: 8.2 },
];

/**
 * One sortie seed per island gull. The index LEADS the name: FNV-1a barely
 * moves for names differing only in their last character.
 */
const ISLAND_GULL_SEEDS = Array.from(
  { length: GARDEN_GULL_COUNT },
  (_, index) => stableUnit(`${index}.island-gull`),
);

// --- Geometry: nose at −z, wings along ±x, the fly pose in `position`. ---
const GULL_SHOULDER_X = 0.07;
const GULL_WRIST = 0.46;
const GULL_TIP = 1;
const GULL_BACK = new Color(HARBOR_PALETTE.foam_white).lerp(new Color(HARBOR_PALETTE.fog_blue), 0.3)
  .lerp(new Color(HARBOR_PALETTE.stone_dark), 0.12);
const GULL_WHITE = new Color(HARBOR_PALETTE.foam_white).lerp(new Color(HARBOR_PALETTE.stone_pale), 0.08);
const GULL_TIPS = new Color(HARBOR_PALETTE.iron_dark);
const GULL_BILL = new Color("#c9a84a");

interface GullPart {
  fly: BufferGeometry;
  fold: BufferGeometry;
  colour: (index: number, position: Vector3) => Color;
  /** Signed span fraction for wing vertices; 0 elsewhere. */
  span: (position: Vector3) => number;
}

function panel(points: readonly (readonly [number, number, number])[], rows: number, columns: number, flip: boolean): BufferGeometry {
  const indices: number[] = [];
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const a = row * columns + column;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      if (flip) indices.push(a, b, c, b, d, c);
      else indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(points.flat(), 3));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * One wing, fly and folded poses with the same topology. Span stations run
 * shoulder → wrist → tip; the outer hand is swept back to a pointed tip.
 */
function gullWing(side: 1 | -1): GullPart {
  const spans = [0, 0.2, GULL_WRIST - GULL_SHOULDER_X, 0.72 - GULL_SHOULDER_X, GULL_TIP - GULL_SHOULDER_X];
  const fly: [number, number, number][] = [];
  const fold: [number, number, number][] = [];
  for (const span of spans) {
    const s = span / (GULL_TIP - GULL_SHOULDER_X);
    const outer = Math.max(0, (span - (GULL_WRIST - GULL_SHOULDER_X)) / (GULL_TIP - GULL_WRIST));
    const leading = -0.12 + outer * outer * 0.3;
    const chord = s >= 0.999 ? 0.02 : 0.3 * (1 - 0.35 * s) * (1 - 0.6 * outer);
    for (const t of [0, 1]) {
      fly.push([side * (GULL_SHOULDER_X + span), 0.015 * (1 - t), leading + t * chord]);
      // Folded along the back: span runs aft, the hand crossing over the tail.
      fold.push([side * (0.075 + 0.02 * (1 - s)), 0.05 + 0.02 * t, -0.08 + s * 0.52 + t * 0.05]);
    }
  }
  return {
    fly: panel(fly, spans.length, 2, side < 0),
    fold: panel(fold, spans.length, 2, side < 0),
    colour: (index) => (Math.floor(index / 2) >= 3 ? GULL_TIPS : GULL_BACK),
    span: (position) => side * Math.min(1, Math.max(0, (Math.abs(position.x) - GULL_SHOULDER_X) / (GULL_TIP - GULL_SHOULDER_X))),
  };
}

function gullBody(): GullPart {
  const make = () => {
    const geometry = new SphereGeometry(1, 6, 4);
    geometry.scale(0.085, 0.075, 0.3);
    geometry.translate(0, 0.02, 0.03);
    return geometry;
  };
  return {
    fly: make(),
    fold: make(),
    colour: (_index, position) => (position.z < -0.22 ? GULL_BILL : GULL_WHITE),
    span: () => 0,
  };
}

function gullTail(): GullPart {
  const make = () => panel([
    [-0.07, 0.02, 0.26], [0.07, 0.02, 0.26],
    [-0.11, 0.015, 0.44], [0.11, 0.015, 0.44],
  ], 2, 2, false);
  return { fly: make(), fold: make(), colour: () => GULL_WHITE, span: () => 0 };
}

/**
 * Builds the gull: `position`/`normal` are the open-winged pose, `aFold` /
 * `aFoldNormal` the perched pose, `aWing` the signed span fraction.
 */
export function createGardenGullGeometry(): BufferGeometry {
  const parts = [gullBody(), gullTail(), gullWing(1), gullWing(-1)];
  const prepared: BufferGeometry[] = [];
  const probe = new Vector3();
  for (const part of parts) {
    const sourceIndex = part.fly.index ? Array.from(part.fly.index.array) : null;
    const flyPositions = part.fly.getAttribute("position");
    const fly = part.fly.index ? part.fly.toNonIndexed() : part.fly;
    const fold = part.fold.index ? part.fold.toNonIndexed() : part.fold;
    fly.computeVertexNormals();
    fold.computeVertexNormals();
    const count = fly.getAttribute("position").count;
    const colours = new Float32Array(count * 3);
    const wings = new Float32Array(count);
    for (let vertex = 0; vertex < count; vertex += 1) {
      const source = sourceIndex ? sourceIndex[vertex]! : vertex;
      probe.fromBufferAttribute(flyPositions, source);
      part.colour(source, probe).toArray(colours, vertex * 3);
      wings[vertex] = part.span(probe);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", fly.getAttribute("position"));
    geometry.setAttribute("normal", fly.getAttribute("normal"));
    geometry.setAttribute("aFold", fold.getAttribute("position"));
    geometry.setAttribute("aFoldNormal", fold.getAttribute("normal"));
    geometry.setAttribute("color", new Float32BufferAttribute(colours, 3));
    geometry.setAttribute("aWing", new Float32BufferAttribute(wings, 1));
    prepared.push(geometry);
    for (const disposable of new Set([part.fly, part.fold, fly, fold])) disposable.dispose();
  }
  const merged = mergeGeometries(prepared, false);
  for (const geometry of prepared) geometry.dispose();
  if (!merged) throw new Error("garden-summit-birds: gull merge failed");
  return merged;
}

const GULL_VERTEX_PARS = /* glsl */`
attribute vec3 aFold;
attribute vec3 aFoldNormal;
attribute float aWing;
attribute float aFlight;
attribute float aSeed;
uniform float uGullTime;
vec2 gullRotate(vec2 v, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(v.x * c + v.y * s, -v.x * s + v.y * c);
}
`;

/**
 * Flap-flap-glide: each bird beats for the first 28 % of her own 4.5–7 s cycle
 * (three quick beats a second, the hand lagging 0.12 cycle), then glides in
 * the gull "M" — inner wing up 8°, hand drooped 12° below it.
 */
const GULL_WING_ANGLES = /* glsl */`
  float gullSide = aWing < 0.0 ? -1.0 : 1.0;
  float gullCycle = 4.5 + aSeed * 2.5;
  float gullInCycle = fract(uGullTime / gullCycle + aSeed * 3.7);
  float gullBeat = (1.0 - smoothstep(0.24, 0.32, gullInCycle)) * smoothstep(0.0, 0.04, gullInCycle);
  float gullPhase = 6.2831853 * 3.1 * uGullTime + aSeed * 19.0;
  float gullInner = mix(0.14, 0.55 * sin(gullPhase), gullBeat);
  float gullOuter = mix(-0.21, 0.35 * sin(gullPhase - 0.754), gullBeat);
  float gullHand = step(${(GULL_WRIST + 0.001).toFixed(4)}, abs(position.x));
`;

const GULL_BEGIN_NORMAL = /* glsl */`
  ${GULL_WING_ANGLES}
  vec3 gullFlyNormal = objectNormal;
  if (abs(aWing) > 0.0) {
    vec2 n = gullRotate(vec2(gullFlyNormal.y, gullFlyNormal.x * gullSide), gullInner + gullOuter * gullHand);
    gullFlyNormal = vec3(n.y * gullSide, n.x, gullFlyNormal.z);
  }
  objectNormal = normalize(mix(aFoldNormal, gullFlyNormal, aFlight));
`;

const GULL_BEGIN_VERTEX = /* glsl */`
  vec3 gullFly = transformed;
  if (abs(aWing) > 0.0) {
    vec2 arm = vec2(gullFly.y, abs(gullFly.x) - ${GULL_SHOULDER_X.toFixed(4)});
    float wrist = ${(GULL_WRIST - GULL_SHOULDER_X).toFixed(4)};
    vec2 bent = arm.y > wrist
      ? gullRotate(vec2(0.0, wrist), gullInner) + gullRotate(arm - vec2(0.0, wrist), gullInner + gullOuter)
      : gullRotate(arm, gullInner);
    gullFly.y = bent.x;
    gullFly.x = gullSide * (${GULL_SHOULDER_X.toFixed(4)} + bent.y);
  }
  transformed = mix(aFold, gullFly, aFlight);
`;

/**
 * Creates the flock: one InstancedMesh, one draw. Reduced motion always
 * resolves to the same still composition — every bird on her perch with her
 * wings folded; constrained mode removes the batch without rebuilding it.
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

  const geometry = createGardenGullGeometry();
  const flight = new InstancedBufferAttribute(new Float32Array(GARDEN_GULL_COUNT), 1);
  geometry.setAttribute("aFlight", flight);
  geometry.setAttribute("aSeed", new InstancedBufferAttribute(Float32Array.from(ISLAND_GULL_SEEDS), 1));
  const material = new MeshStandardMaterial({
    roughness: 0.85,
    side: DoubleSide,
    vertexColors: true,
  });
  const clock = { value: 0 };
  chainGardenMaterialPatch(material, {
    key: "garden-gull-wings-v1",
    compile: (shader) => {
      shader.uniforms.uGullTime = clock;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${GULL_VERTEX_PARS}`)
        .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>\n${GULL_BEGIN_NORMAL}`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>\n${GULL_BEGIN_VERTEX}`);
    },
  });
  const gulls = new InstancedMesh(geometry, material, GARDEN_GULL_COUNT);
  gulls.name = "garden-harbor-gulls";
  gulls.frustumCulled = false;
  root.add(gulls);

  const dummy = new Object3D();
  dummy.rotation.order = "YXZ";
  const towerX = GARDEN_LIGHTHOUSE_ROOT_OFFSET.x;
  const towerZ = GARDEN_LIGHTHOUSE_ROOT_OFFSET.z;
  const update = ({
    constrained,
    night = 0,
    reducedMotion,
    timeSeconds,
    weather,
    keeperRitual,
  }: GardenGullFlockUpdate): void => {
    // No gulls at night: the night sky belongs to the lantern and the moon.
    const roosted = night > GARDEN_GULL_ROOST_NIGHT;
    root.visible = !constrained && !roosted;
    if (constrained || roosted) return;

    // Phase 2 weather: a downwind drift shared by every sortie, and the storm
    // scatter — a building storm sends them climbing and spreading.
    const scatterT = Math.max(0, Math.min(1, ((weather?.stormLevel ?? 0) - 0.55) / 0.23));
    const scatter = scatterT * scatterT * (3 - 2 * scatterT);
    const driftX = (weather?.wind.x ?? 0) * (weather?.wind.speed ?? 0) * 2.2;
    const driftZ = (weather?.wind.y ?? 0) * (weather?.wind.speed ?? 0) * 2.2;

    // Reduced motion never consults the clock: the flock at rest.
    const time = reducedMotion ? 0 : timeSeconds;
    clock.value = time;
    const keeperSettling = keeperRitual?.active && keeperRitual.direction === "evening"
      ? 1 - keeperRitual.progress : 1;
    const flying = reducedMotion ? 0 : keeperSettling;
    // Gathering dusk lets the chance of a turn fall to nothing before roost.
    const settling = 1 - Math.max(0, Math.min(1, night / GARDEN_GULL_ROOST_NIGHT));
    const chance = (ISLAND_GULL_SORTIE_CHANCE + (1 - ISLAND_GULL_SORTIE_CHANCE) * scatter) * settling;
    const share = ISLAND_GULL_SORTIE_SHARE + (0.96 - ISLAND_GULL_SORTIE_SHARE) * scatter;

    for (let index = 0; index < GARDEN_GULL_COUNT; index += 1) {
      const perch = ISLAND_GULL_PERCHES[index]!;
      const seed = ISLAND_GULL_SEEDS[index]!;
      const sortie = flying * gardenBirdSortie(seed, time, ISLAND_GULL_PERIOD, chance, share);
      // How far into the air she is: zero on the perch at both ends of a turn.
      // (Exactly zero at rest: sin(π) is not.)
      const air = sortie > 0 && sortie < 1 ? Math.sin(Math.PI * sortie) : 0;
      const span = Math.hypot(perch.x, perch.z) || 1;
      const launchX = perch.x / span;
      const launchZ = perch.z / span;
      const loopRadius = ISLAND_GULL_LOOP_RADIUS + seed * ISLAND_GULL_LOOP_SPREAD;
      const [offsetX, lift, offsetZ, heading] = gardenBirdSortieOffset(
        sortie,
        launchX,
        launchZ,
        loopRadius * (1 + scatter * 0.7),
        perch.apex - perch.y + scatter * (2.2 + (index % 3) * 0.9),
      );
      let gullX = perch.x + offsetX + driftX * air;
      let gullZ = perch.z + offsetZ + driftZ * air;
      const gullY = Math.min(GARDEN_GULL_CEILING, perch.y + lift);
      // The crown exclusion: an airborne bird is pushed out of the disc about
      // the tower axis (a perched one sits on her authored masonry).
      if (air > 0) {
        const fromX = gullX - towerX;
        const fromZ = gullZ - towerZ;
        const radius = Math.hypot(fromX, fromZ);
        if (radius < GARDEN_GULL_CROWN_EXCLUSION) {
          const push = (GARDEN_GULL_CROWN_EXCLUSION - radius) * Math.min(1, air * 4);
          gullX += (fromX / (radius || 1)) * push;
          gullZ += (fromZ / (radius || 1)) * push;
        }
      }
      dummy.position.set(gullX, gullY, gullZ);
      // Heading as `atan2(dirZ, dirX)`; this silhouette's nose is −z.
      dummy.rotation.set(0, -heading - Math.PI / 2, -GULL_BANK * air);
      // A gull's span is ~0.7 of the heron's: 2.4–2.8 u, so the wing reads at rest.
      dummy.scale.setScalar(1.2 + (index % 3) * 0.1);
      dummy.updateMatrix();
      gulls.setMatrixAt(index, dummy.matrix);
      // Wings open as she lifts: fully spread a quarter of the way up.
      flight.setX(index, Math.min(1, air * 4));
    }
    gulls.instanceMatrix.needsUpdate = true;
    flight.needsUpdate = true;
  };

  const flock = { gulls, root, update };
  update({ constrained: false, reducedMotion: true, timeSeconds: 0 });
  return flock;
}

function stableUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}
