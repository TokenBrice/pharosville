import {
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
} from "three";
import { gardenPetalDrift, gardenSeasonalVisitor, type GardenSeasonalVisitorId } from "../systems/garden-calendar";
import type { GardenRitualHandler } from "../systems/garden-director";
import { gardenSkyLatitude, type GardenSkyLatitude } from "../systems/sky-almanac";
import {
  GARDEN_BREATH_PHASE,
  gardenBreathAt,
  gardenGustAtWorldPosition,
  type WeatherPlan,
} from "../systems/weather";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import { stableUnit } from "./garden-util";
import { GARDEN_ENGAWA_KOI_WORLD } from "./garden-koi";

/** Sparse by contract and below W6.1's hard ceiling of 64. */
export const GARDEN_SPRING_PETAL_COUNT = 48;

export interface GardenSeasonalDressingUpdate {
  reducedMotion: boolean;
  timeSeconds: number;
  weather: WeatherPlan;
}

export interface GardenSeasonalDressing {
  petals: InstancedMesh<PlaneGeometry, MeshBasicMaterial> | null;
  /** W5.6: the late-autumn maple leaves, present only in the leaf-fall kō. */
  leaves: InstancedMesh<PlaneGeometry, MeshBasicMaterial> | null;
  /** The kō's visitor, or null. */
  visitor: GardenSeasonalVisitorId | null;
  /** The day score's "seasonal-visitor" ritual, or null when the kō admit none. */
  ritual: GardenRitualHandler | null;
  /**
   * 0…1: how far the early-summer fireflies have risen tonight (1 under
   * reduced motion in their kō, 0 outside it). The fireflies multiply their
   * night presence by it, so they come only with the calendar.
   */
  fireflyPresence(): number;
  root: Group;
  update(input: GardenSeasonalDressingUpdate): void;
}

/** Leaves the leaf-fall ritual drops onto the engawa shallows (one draw while present). */
export const GARDEN_LEAF_FALL_COUNT = 24;
/**
 * Where the leaf fall lands: the calm water in front of the lighthouse
 * island, in the rest frame (world units; the engawa shallows sit behind the
 * near bank from the rest seat, so leaves there would never be seen).
 */
const LEAF_FALL_WORLD = { x: 110, z: 160 } as const;
/** Seconds the fall itself takes; the leaves then drift on the water for the rest of the day. */
const LEAF_FALL_SECONDS = 14;
/** Fireflies rise over this long once their ritual starts. */
const FIREFLY_RISE_SECONDS = 25;

/** The lee cherry whose blossom feeds the water (garden-calendar seed). */
const GARDEN_PETAL_SOURCE_SEED = "lee-cherry";

/**
 * The cherry's petals on the water: instanced quads driven by W3.2's wind,
 * delayed gust and breath. They exist only from the lee cherry's opening to
 * twelve days past its peak (K24: the calendar, not the UTC quarter), and
 * thin as the drift wanes. No timer or random source is introduced; reduced
 * motion always resolves the same time-zero arrangement.
 */
export function createGardenSeasonalDressing(
  date: Date,
  latitude: GardenSkyLatitude = gardenSkyLatitude(),
): GardenSeasonalDressing {
  const root = new Group();
  root.name = "garden-seasonal-dressing";
  const visitor = gardenSeasonalVisitor(date, latitude)?.id ?? null;
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
  const fireflyPresence = (): number => {
    if (visitor !== "fireflies") return 0;
    if (reduced) return 1;
    return Number.isFinite(ritualAge) ? Math.min(1, ritualAge / FIREFLY_RISE_SECONDS) : 0;
  };
  const leaves = visitor === "leaf-fall" ? createLeaves() : null;
  if (leaves) root.add(leaves);
  const updateLeaves = leaves
    ? (reducedMotion: boolean, time: number, weather: WeatherPlan): void => {
      // Reduced motion: the season's static state, leaves already lying on the water.
      const fallAge = reducedMotion ? LEAF_FALL_SECONDS : ritualAge;
      leaves.visible = Number.isFinite(fallAge);
      if (!leaves.visible) return;
      placeLeaves(leaves, fallAge, reducedMotion ? 0 : time, weather, reducedMotion);
    }
    : null;
  const drift = gardenPetalDrift(GARDEN_PETAL_SOURCE_SEED, date, latitude);
  if (drift <= 0) {
    return {
      petals: null,
      leaves,
      visitor,
      ritual,
      fireflyPresence,
      root,
      update({ reducedMotion, timeSeconds, weather }) {
        reduced = reducedMotion;
        updateLeaves?.(reducedMotion, Math.max(0, timeSeconds), weather);
      },
    };
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
  const update = ({ reducedMotion, timeSeconds, weather }: GardenSeasonalDressingUpdate): void => {
    reduced = reducedMotion;
    updateLeaves?.(reducedMotion, Math.max(0, timeSeconds), weather);
    const time = reducedMotion ? 0 : Math.max(0, timeSeconds);
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

  return { petals, leaves, visitor, ritual, fireflyPresence, root, update };
}

function createLeaves(): InstancedMesh<PlaneGeometry, MeshBasicMaterial> {
  // A muted maple rust from timber and clay — well under the C 0.12 cap, never vermillion.
  const leafColor = new Color(HARBOR_PALETTE.timber_mid).lerp(new Color(HARBOR_PALETTE.roof_cote_clay), 0.45)
    .lerp(new Color(HARBOR_PALETTE.stone_mid), 0.35);
  const leaves = new InstancedMesh(
    new PlaneGeometry(0.62, 0.44),
    new MeshBasicMaterial({ color: leafColor, depthWrite: false, opacity: 0.82, side: DoubleSide, transparent: true }),
    GARDEN_LEAF_FALL_COUNT,
  );
  leaves.name = "garden-autumn-leaf-fall";
  leaves.frustumCulled = false;
  leaves.renderOrder = 4;
  leaves.visible = false;
  return leaves;
}

const leafDummy = new Object3D();

/** Each leaf flutters down on its own delay, lands, then rides the same wind as the petals. */
function placeLeaves(
  leaves: InstancedMesh<PlaneGeometry, MeshBasicMaterial>,
  fallAge: number,
  time: number,
  weather: WeatherPlan,
  reducedMotion: boolean,
): void {
  for (let index = 0; index < GARDEN_LEAF_FALL_COUNT; index += 1) {
    const angle = stableUnit(`season.leaf.angle.${index}`) * Math.PI * 2;
    const radius = 0.8 + stableUnit(`season.leaf.radius.${index}`) * 5;
    const anchorX = LEAF_FALL_WORLD.x + Math.cos(angle) * radius;
    const anchorZ = LEAF_FALL_WORLD.z + Math.sin(angle) * radius * 0.72;
    const delay = stableUnit(`season.leaf.delay.${index}`) * (LEAF_FALL_SECONDS - 5);
    const fall = Math.min(1, Math.max(0, (fallAge - delay) / 5));
    const gust = gardenGustAtWorldPosition(time, anchorX, anchorZ, weather, reducedMotion);
    const landedFor = Math.max(0, fallAge - delay - 5);
    const travel = Math.min(3.5, landedFor * (0.05 + weather.wind.speed * 0.18 + gust * 0.1));
    const sway = (1 - fall) * Math.sin(fallAge * 2.6 + index) * 0.35;
    leafDummy.position.set(
      anchorX + weather.wind.x * travel + sway,
      GARDEN_WATER_Y + 0.07 + (1 - fall) * 4.5,
      anchorZ + weather.wind.y * travel,
    );
    leafDummy.rotation.set(-Math.PI / 2 + (1 - fall) * Math.sin(fallAge * 3.1 + index) * 0.9, 0, angle + travel * 0.2);
    leafDummy.scale.setScalar(fall > 0 ? 0.8 + stableUnit(`season.leaf.scale.${index}`) * 0.4 : 0);
    leafDummy.updateMatrix();
    leaves.setMatrixAt(index, leafDummy.matrix);
  }
  leaves.instanceMatrix.needsUpdate = true;
}
