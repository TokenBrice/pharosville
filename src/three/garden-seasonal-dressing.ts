import {
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Vector3,
} from "three";
import {
  GARDEN_LETS_GO_TREE,
  gardenPetalDrift,
  gardenSeasonalVisitor,
  type GardenSeasonalVisitorId,
} from "../systems/garden-calendar";
import type { GardenRitualHandler } from "../systems/garden-director";
import { gardenActiveDayScore } from "../systems/garden-score";
import { REST_SEAT_EYE_LANDSCAPE } from "../systems/rest-seat";
import { gardenSkyLatitude, type GardenSkyLatitude } from "../systems/sky-almanac";
import {
  GARDEN_BREATH_PHASE,
  gardenBreathAt,
  gardenGustAtWorldPosition,
  type WeatherPlan,
} from "../systems/weather";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import { deciduousLeafColor, type GardenLetsGoCrown } from "./garden-flora";
import { stableUnit } from "./garden-util";
import { GARDEN_ENGAWA_KOI_WORLD } from "./garden-koi";

/** Sparse by contract and below W6.1's hard ceiling of 64. */
export const GARDEN_SPRING_PETAL_COUNT = 48;

export interface GardenSeasonalDressingUpdate {
  reducedMotion: boolean;
  timeSeconds: number;
  weather: WeatherPlan;
}

/** The one tree that lets go (the island maple): its crown uniform and world crown centre. */
export interface GardenLetsGoTree {
  anchor: Vector3;
  crown: GardenLetsGoCrown;
}

export interface GardenSeasonalDressing {
  petals: InstancedMesh<PlaneGeometry, MeshBasicMaterial> | null;
  /** W5.6: the late-autumn maple leaves, present only in the leaf-fall kō. */
  leaves: InstancedMesh<PlaneGeometry, MeshBasicMaterial> | null;
  /** X5: the leaves the maple lets go of in its one scored afternoon (hidden until then). */
  letsGoLeaves: InstancedMesh<PlaneGeometry, MeshBasicMaterial>;
  /** The kō's visitor, or null. */
  visitor: GardenSeasonalVisitorId | null;
  /** The day score's "seasonal-visitor" ritual, or null when the kō admit none. */
  ritual: GardenRitualHandler | null;
  /** The day score's "tree-lets-go" ritual: the maple drops its last leaves pad by pad. */
  letsGoRitual: GardenRitualHandler;
  /** The island (re)build hands over its maple; the leaves then fall from its crown. */
  setLetsGoTree(tree: GardenLetsGoTree | null): void;
  /**
   * 0…1: how far the early-summer fireflies have risen tonight at this local
   * clock hour (1 under reduced motion in their kō, 0 outside it). They rise
   * with their scored ritual and stay out for the rest of the night — also for
   * a visitor who arrives after it. The fireflies multiply their night
   * presence by it, so they come only with the calendar.
   */
  fireflyPresence(clockHour: number): number;
  root: Group;
  update(input: GardenSeasonalDressingUpdate): void;
}

/** Leaves the leaf-fall ritual drops from the maple (one draw while present). */
export const GARDEN_LEAF_FALL_COUNT = 24;
/** Leaves the maple lets go of on its day (one draw while present). */
export const GARDEN_LETS_GO_LEAF_COUNT = 48;
/**
 * Before the island hands over its maple, leaves fall onto the calm water in
 * front of the lighthouse island, in the rest frame (world units).
 */
const LEAF_FALL_WORLD = { x: 110, z: 160 } as const;
/** Seconds over which the leaf-fall visitor's leaves leave the tree. */
const LEAF_FALL_RELEASE_SECONDS = 9;
/** Seconds one leaf takes from the crown to the water. */
const LEAF_DROP_SECONDS = 5;
/** Seconds the leaf fall takes; the leaves then drift on the water for the rest of the day. */
const LEAF_FALL_SECONDS = LEAF_FALL_RELEASE_SECONDS + LEAF_DROP_SECONDS;
/** The maple lets go of its crown over this long, pad by pad (score hold 180 s). */
const LETS_GO_RELEASE_SECONDS = 140;
const LETS_GO_SECONDS = LETS_GO_RELEASE_SECONDS + LEAF_DROP_SECONDS + 2;
/** Fireflies rise over this long once their ritual starts. */
const FIREFLY_RISE_SECONDS = 25;
/** After midnight the fireflies of an early-summer night are still out until this hour (the night beat hides them at dawn). */
const FIREFLY_NIGHT_ENDS_HOUR = 5;
/** Leaves land this far from the crown centre toward the seat (the water at the island's foot). */
const LEAF_LANDING_REACH = [6.5, 9.5] as const;

/** The lee cherry whose blossom feeds the water (garden-calendar seed). */
const GARDEN_PETAL_SOURCE_SEED = "lee-cherry";

/**
 * The seasonal dressing: the cherry's petals on the water, the kō-gated
 * visitor (leaf fall or fireflies) and the one tree that lets go. Petals are
 * instanced quads driven by W3.2's wind, delayed gust and breath. They exist
 * only from the lee cherry's opening to twelve days past its peak (K24: the
 * calendar, not the UTC quarter), and thin as the drift wanes. No timer or
 * random source is introduced; reduced motion always resolves the same
 * static arrangement.
 */
export function createGardenSeasonalDressing(
  date: Date,
  latitude: GardenSkyLatitude = gardenSkyLatitude(),
): GardenSeasonalDressing {
  const root = new Group();
  root.name = "garden-seasonal-dressing";
  const visitor = gardenSeasonalVisitor(date, latitude)?.id ?? null;
  let tree: GardenLetsGoTree | null = null;
  // W5.6 (K24): the kō-gated visitor, one scored ritual a day.
  let ritualStart = Number.NaN;
  let ritualAge = Number.POSITIVE_INFINITY;
  const ritual: GardenRitualHandler | null = visitor ? {
    start(t) { ritualStart = t; ritualAge = 0; },
    update(t) {
      ritualAge = Math.max(0, t - ritualStart);
      return ritualAge >= (visitor === "fireflies" ? FIREFLY_RISE_SECONDS : LEAF_FALL_SECONDS);
    },
    cancel() {
      // Whatever has already risen or fallen stays: evidence, not a replay.
    },
  } : null;
  let reduced = false;
  const fireflyPresence = (clockHour: number): number => {
    if (visitor !== "fireflies") return 0;
    if (reduced) return 1;
    if (Number.isFinite(ritualAge)) return Math.min(1, ritualAge / FIREFLY_RISE_SECONDS);
    // Not risen in this session: out already if tonight's rise has passed
    // (or it is past midnight), otherwise still to come.
    const clockSec = clockHour * 3_600;
    if (clockHour < FIREFLY_NIGHT_ENDS_HOUR) return 1;
    return gardenActiveDayScore().some((entry) => (
      entry.kind === "seasonal-visitor" && clockSec >= entry.startSec + entry.windowSec
    )) ? 1 : 0;
  };
  const leaves = visitor === "leaf-fall" ? createLeafFall("season.leaf", GARDEN_LEAF_FALL_COUNT, LEAF_FALL_RELEASE_SECONDS) : null;
  if (leaves) {
    leaves.mesh.name = "garden-autumn-leaf-fall";
    root.add(leaves.mesh);
  }

  // X5 (garden-7): one tree lets go. The ritual walks the maple's crown to
  // bare across the release, pad by pad, and each pad's leaves drift down to
  // the water at the island's foot. Cancel (reduced motion, disposal) keeps
  // whatever has already gone: evidence, not a replay.
  const letsGo = createLeafFall("season.lets-go", GARDEN_LETS_GO_LEAF_COUNT, LETS_GO_RELEASE_SECONDS);
  letsGo.mesh.name = "garden-maple-lets-go";
  root.add(letsGo.mesh);
  let letsGoStart = Number.NaN;
  let letsGoAge = Number.POSITIVE_INFINITY;
  let letsGoFromCrown = 1;
  const letsGoRitual: GardenRitualHandler = {
    start(t) {
      letsGoStart = t;
      letsGoAge = 0;
      letsGoFromCrown = tree?.crown.value ?? 1;
    },
    update(t) {
      letsGoAge = Math.max(0, t - letsGoStart);
      if (tree) {
        const released = Math.min(1, letsGoAge / LETS_GO_RELEASE_SECONDS);
        tree.crown.value = letsGoFromCrown * (1 - released);
      }
      return letsGoAge >= LETS_GO_SECONDS;
    },
    cancel() {},
  };

  const update = (
    { reducedMotion, timeSeconds, weather }: GardenSeasonalDressingUpdate,
    petals: ((time: number, weather: WeatherPlan, reducedMotion: boolean) => void) | null,
  ): void => {
    reduced = reducedMotion;
    const time = reducedMotion ? 0 : Math.max(0, timeSeconds);
    // Reduced motion: the season's static state, the leaves already lying on the water.
    leaves?.update(reducedMotion ? LEAF_FALL_SECONDS : ritualAge, time, weather, reducedMotion, tree);
    letsGo.update(letsGoAge, time, weather, reducedMotion, tree);
    petals?.(time, weather, reducedMotion);
  };
  const shared = {
    leaves: leaves?.mesh ?? null,
    letsGoLeaves: letsGo.mesh,
    visitor,
    ritual,
    letsGoRitual,
    setLetsGoTree(next: GardenLetsGoTree | null) {
      tree = next;
      // A rebuilt island keeps what the tree has already let go of today.
      if (next && Number.isFinite(letsGoAge)) {
        next.crown.value = Math.min(next.crown.value, letsGoFromCrown * (1 - Math.min(1, letsGoAge / LETS_GO_RELEASE_SECONDS)));
      }
      letsGo.setColor(next ? LETS_GO_LEAF_COLOR : DEFAULT_LEAF_COLOR);
    },
    fireflyPresence,
    root,
  };
  const drift = gardenPetalDrift(GARDEN_PETAL_SOURCE_SEED, date, latitude);
  if (drift <= 0) {
    return { ...shared, petals: null, update: (input) => update(input, null) };
  }

  // Derived blush, never vermillion (§1.1 rule 5).
  const petalColor = new Color(HARBOR_PALETTE.foam_white)
    .lerp(new Color(HARBOR_PALETTE.roof_cote_clay), 0.14);
  const petals = new InstancedMesh(
    new PlaneGeometry(0.34, 0.16),
    new MeshBasicMaterial({
      color: petalColor,
      depthWrite: false,
      opacity: 0.72,
      side: DoubleSide,
      transparent: true,
    }),
    GARDEN_SPRING_PETAL_COUNT,
  );
  petals.name = "garden-spring-water-petals";
  petals.count = Math.max(6, Math.round(GARDEN_SPRING_PETAL_COUNT * drift));
  petals.frustumCulled = false;
  petals.renderOrder = 4;
  root.add(petals);

  const dummy = new Object3D();
  const updatePetals = (time: number, weather: WeatherPlan, reducedMotion: boolean): void => {
    const breath = gardenBreathAt(time, GARDEN_BREATH_PHASE.mist);
    for (let index = 0; index < petals.count; index += 1) {
      const angle = stableUnit(`season.petal.angle.${index}`) * Math.PI * 2;
      // Re-site the old island-centred ring into one small drift over the calm
      // engawa shallows. The broad water interval remains an empty positive.
      const radius = 0.8 + stableUnit(`season.petal.radius.${index}`) * 2.2;
      const anchorX = GARDEN_ENGAWA_KOI_WORLD.x + Math.cos(angle) * radius;
      const anchorZ = GARDEN_ENGAWA_KOI_WORLD.z + Math.sin(angle) * radius * 0.72;
      const gust = gardenGustAtWorldPosition(time, anchorX, anchorZ, weather, reducedMotion);
      const speed = 0.28 + weather.wind.speed * 0.72 + gust * 0.45;
      const span = 5;
      const travel = ((stableUnit(`season.petal.travel.${index}`) * span + time * speed) % span)
        - span * 0.5;
      const cross = (stableUnit(`season.petal.cross.${index}`) - 0.5) * 1.4;
      dummy.position.set(
        anchorX + weather.wind.x * travel - weather.wind.y * cross,
        GARDEN_WATER_Y + 0.065,
        anchorZ + weather.wind.y * travel + weather.wind.x * cross,
      );
      dummy.rotation.set(
        -Math.PI / 2,
        0,
        angle + time * (0.08 + stableUnit(`season.petal.turn.${index}`) * 0.08),
      );
      const scale = (0.82 + stableUnit(`season.petal.scale.${index}`) * 0.36)
        * (0.96 + breath * 0.08);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      petals.setMatrixAt(index, dummy.matrix);
    }
    petals.instanceMatrix.needsUpdate = true;
  };

  return { ...shared, petals, update: (input) => update(input, updatePetals) };
}

/** A muted maple rust from timber and clay — well under the C 0.12 cap, never vermillion. */
const DEFAULT_LEAF_COLOR = new Color(HARBOR_PALETTE.timber_mid).lerp(new Color(HARBOR_PALETTE.roof_cote_clay), 0.45)
  .lerp(new Color(HARBOR_PALETTE.stone_mid), 0.35);
/** The island maple's own fully turned tone (garden-3 derived palette). */
const LETS_GO_LEAF_COLOR = deciduousLeafColor(
  GARDEN_LETS_GO_TREE.kind,
  GARDEN_LETS_GO_TREE.seed,
  { blossom: 0, flush: 0, leaf: 0, turn: 1 },
);

interface LeafFall {
  mesh: InstancedMesh<PlaneGeometry, MeshBasicMaterial>;
  setColor(color: Color): void;
  /** `age`: seconds since the release began (+∞ before it). */
  update(age: number, time: number, weather: WeatherPlan, reducedMotion: boolean, tree: GardenLetsGoTree | null): void;
}

const leafDummy = new Object3D();

/**
 * Leaves released one by one across `releaseSeconds`: each flutters from the
 * crown down to the water toward the seat, lands, then rides the same wind as
 * the petals. Per-leaf seeds are drawn once; the frame loop only does
 * arithmetic, and only while the fall is visible. Reduced motion shows every
 * released leaf already lying on the water.
 */
function createLeafFall(seed: string, count: number, releaseSeconds: number): LeafFall {
  const mesh = new InstancedMesh(
    new PlaneGeometry(0.62, 0.44),
    new MeshBasicMaterial({ color: DEFAULT_LEAF_COLOR, depthWrite: false, opacity: 0.82, side: DoubleSide, transparent: true }),
    count,
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.visible = false;
  const angle = new Float32Array(count);
  const spread = new Float32Array(count);
  const delay = new Float32Array(count);
  const scale = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    angle[index] = stableUnit(`${seed}.angle.${index}`) * Math.PI * 2;
    spread[index] = stableUnit(`${seed}.radius.${index}`);
    // Evenly spread releases, jittered: a steady letting-go, not a burst.
    delay[index] = ((index + stableUnit(`${seed}.delay.${index}`)) / count) * releaseSeconds;
    scale[index] = 0.8 + stableUnit(`${seed}.scale.${index}`) * 0.4;
  }
  const eye = REST_SEAT_EYE_LANDSCAPE.world;
  return {
    mesh,
    setColor(color) { mesh.material.color.copy(color); },
    update(age, time, weather, reducedMotion, tree) {
      mesh.visible = Number.isFinite(age);
      if (!mesh.visible) return;
      // Where they fall from, and which way they land: toward the seat.
      const fromX = tree?.anchor.x ?? LEAF_FALL_WORLD.x;
      const fromY = tree?.anchor.y ?? GARDEN_WATER_Y + 4.5;
      const fromZ = tree?.anchor.z ?? LEAF_FALL_WORLD.z;
      const towardX = tree ? eye.x - fromX : 0;
      const towardZ = tree ? eye.z - fromZ : 0;
      const toward = Math.hypot(towardX, towardZ) || 1;
      for (let index = 0; index < count; index += 1) {
        const released = age - delay[index]!;
        if (released < 0) {
          leafDummy.scale.setScalar(0);
        } else {
          const fall = reducedMotion ? 1 : Math.min(1, released / LEAF_DROP_SECONDS);
          const reach = tree ? LEAF_LANDING_REACH[0] + (LEAF_LANDING_REACH[1] - LEAF_LANDING_REACH[0]) * spread[index]! : 0;
          const lateral = (spread[index]! - 0.5) * (tree ? 5 : 0) + Math.cos(angle[index]!) * (0.8 + spread[index]! * (tree ? 1.2 : 5));
          const landX = fromX + (towardX / toward) * reach - (towardZ / toward) * lateral;
          const landZ = fromZ + (towardZ / toward) * reach + (towardX / toward) * lateral + (tree ? 0 : Math.sin(angle[index]!) * (0.8 + spread[index]! * 5) * 0.72);
          const startX = fromX + Math.cos(angle[index]!) * 1.4 * spread[index]!;
          const startZ = fromZ + Math.sin(angle[index]!) * 1.4 * spread[index]!;
          const glide = fall * (2 - fall);
          const gust = gardenGustAtWorldPosition(time, landX, landZ, weather, reducedMotion);
          const landedFor = reducedMotion ? 0 : Math.max(0, released - LEAF_DROP_SECONDS);
          const travel = Math.min(3.5, landedFor * (0.05 + weather.wind.speed * 0.18 + gust * 0.1));
          const sway = (1 - fall) * Math.sin(released * 2.6 + index) * 0.35;
          leafDummy.position.set(
            startX + (landX - startX) * glide + weather.wind.x * travel + sway,
            GARDEN_WATER_Y + 0.07 + (1 - fall) * (fromY - GARDEN_WATER_Y),
            startZ + (landZ - startZ) * glide + weather.wind.y * travel,
          );
          leafDummy.rotation.set(-Math.PI / 2 + (1 - fall) * Math.sin(released * 3.1 + index) * 0.9, 0, angle[index]! + travel * 0.2);
          leafDummy.scale.setScalar(scale[index]!);
        }
        leafDummy.updateMatrix();
        mesh.setMatrixAt(index, leafDummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
