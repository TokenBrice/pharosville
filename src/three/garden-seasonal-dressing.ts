import {
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
} from "three";
import type { GardenSeason } from "../systems/season";
import {
  GARDEN_BREATH_PHASE,
  gardenBreathAt,
  gardenGustAtWorldPosition,
  type WeatherPlan,
} from "../systems/weather";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import { stableUnit } from "./garden-util";

/** Sparse by contract and below W6.1's hard ceiling of 64. */
export const GARDEN_SPRING_PETAL_COUNT = 48;

export interface GardenSeasonalDressingUpdate {
  islandX: number;
  islandZ: number;
  reducedMotion: boolean;
  timeSeconds: number;
  weather: WeatherPlan;
}

export interface GardenSeasonalDressing {
  petals: InstancedMesh<PlaneGeometry, MeshBasicMaterial> | null;
  root: Group;
  update(input: GardenSeasonalDressingUpdate): void;
}

/**
 * Spring's one seasonal moving layer. Petals are instanced quads on the water,
 * driven by W3.2's wind, delayed gust and breath. No timer or random source is
 * introduced; reduced motion always resolves the same time-zero arrangement.
 */
export function createGardenSeasonalDressing(season: GardenSeason): GardenSeasonalDressing {
  const root = new Group();
  root.name = "garden-seasonal-dressing";
  if (season !== "spring") {
    return { petals: null, root, update() {} };
  }

  const petalColor = new Color(HARBOR_PALETTE.foam_white)
    .lerp(new Color(HARBOR_PALETTE.vermillion), 0.18);
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
  petals.frustumCulled = false;
  petals.renderOrder = 4;
  root.add(petals);

  const dummy = new Object3D();
  const update = ({ islandX, islandZ, reducedMotion, timeSeconds, weather }: GardenSeasonalDressingUpdate): void => {
    const time = reducedMotion ? 0 : Math.max(0, timeSeconds);
    const breath = gardenBreathAt(time, GARDEN_BREATH_PHASE.mist);
    for (let index = 0; index < GARDEN_SPRING_PETAL_COUNT; index += 1) {
      const angle = stableUnit(`season.petal.angle.${index}`) * Math.PI * 2;
      const radius = 18 + stableUnit(`season.petal.radius.${index}`) * 16;
      const anchorX = islandX + Math.cos(angle) * radius;
      const anchorZ = islandZ + Math.sin(angle) * radius * 0.72;
      const gust = gardenGustAtWorldPosition(time, anchorX, anchorZ, weather, reducedMotion);
      const speed = 0.28 + weather.windSpeed * 0.72 + gust * 0.45;
      const span = 22;
      const travel = ((stableUnit(`season.petal.travel.${index}`) * span + time * speed) % span)
        - span * 0.5;
      const cross = (stableUnit(`season.petal.cross.${index}`) - 0.5) * 2.4;
      dummy.position.set(
        anchorX + weather.windDirX * travel - weather.windDirZ * cross,
        GARDEN_WATER_Y + 0.065,
        anchorZ + weather.windDirZ * travel + weather.windDirX * cross,
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

  return { petals, root, update };
}
