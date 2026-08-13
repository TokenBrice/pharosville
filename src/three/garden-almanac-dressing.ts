import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import type { GardenAlmanacEvent } from "../systems/garden-almanac";
import { GARDEN_MOTION_DURATIONS } from "../systems/motion-tokens";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";

export const GARDEN_ALMANAC_FADE_SECONDS = GARDEN_MOTION_DURATIONS.breathe.ms / 1_000;
export const GARDEN_LANTERN_ROUND_COUNT = 7;

export interface GardenAlmanacDressingUpdate {
  activeEvent: GardenAlmanacEvent | null;
  deltaSeconds: number;
  islandX: number;
  islandZ: number;
  reducedMotion: boolean;
  timeSeconds: number;
}

export interface GardenAlmanacDressing {
  heron: Mesh<BufferGeometry, MeshBasicMaterial>;
  lanternRound: InstancedMesh<SphereGeometry, MeshBasicMaterial>;
  meteor: Line<BufferGeometry, LineBasicMaterial>;
  root: Group;
  update(input: GardenAlmanacDressingUpdate): void;
}

/**
 * Three deliberately small scene-owned sightings. They share the route clock,
 * use the named nine-second breathe duration for entry/exit, and allocate no
 * timers. Reduced motion removes the layer completely.
 */
export function createGardenAlmanacDressing(): GardenAlmanacDressing {
  const root = new Group();
  root.name = "garden-almanac-dressing";

  const heronMaterial = new MeshBasicMaterial({
    color: new Color(HARBOR_PALETTE.fog_blue).lerp(new Color(HARBOR_PALETTE.foam_white), 0.35),
    depthWrite: false,
    opacity: 0,
    side: DoubleSide,
    transparent: true,
  });
  const heron = new Mesh(createHeronGeometry(), heronMaterial);
  heron.name = "garden-almanac-heron-dusk";
  heron.renderOrder = 5;

  const lanternMaterial = new MeshBasicMaterial({
    color: HARBOR_PALETTE.lantern_warm,
    depthWrite: false,
    opacity: 0,
    transparent: true,
    vertexColors: true,
  });
  const lanternRound = new InstancedMesh(
    new SphereGeometry(0.16, 6, 4),
    lanternMaterial,
    GARDEN_LANTERN_ROUND_COUNT,
  );
  lanternRound.name = "garden-almanac-lantern-round";
  lanternRound.frustumCulled = false;
  lanternRound.renderOrder = 5;

  const meteorMaterial = new LineBasicMaterial({
    color: HARBOR_PALETTE.foam_white,
    depthWrite: false,
    opacity: 0,
    transparent: true,
  });
  const meteor = new Line(
    new BufferGeometry().setFromPoints([new Vector3(-5, 0, 0), new Vector3(5, 0, 0)]),
    meteorMaterial,
  );
  meteor.name = "garden-almanac-deep-night-meteor";
  meteor.renderOrder = 8;

  root.add(heron, lanternRound, meteor);
  hideAll(heron, lanternRound, meteor);

  const lanternMatrix = new Matrix4();
  const lanternColor = new Color();
  let shownEvent: GardenAlmanacEvent | null = null;
  let pendingEvent: GardenAlmanacEvent | null = null;
  let fade = 0;
  let shownSinceSeconds = 0;

  const update = (input: GardenAlmanacDressingUpdate): void => {
    if (input.reducedMotion) {
      shownEvent = null;
      pendingEvent = null;
      fade = 0;
      hideAll(heron, lanternRound, meteor);
      return;
    }

    const deltaSeconds = Math.max(0, Number.isFinite(input.deltaSeconds) ? input.deltaSeconds : 0);
    const nextEvent = input.activeEvent;
    const nextKey = nextEvent ? `${nextEvent.dayKey}:${nextEvent.id}` : null;
    const shownKey = shownEvent ? `${shownEvent.dayKey}:${shownEvent.id}` : null;
    if (nextKey === shownKey) {
      pendingEvent = null;
      fade = Math.min(1, fade + deltaSeconds / GARDEN_ALMANAC_FADE_SECONDS);
    } else {
      pendingEvent = nextEvent;
      if (shownEvent && fade > 0) {
        fade = Math.max(0, fade - deltaSeconds / GARDEN_ALMANAC_FADE_SECONDS);
      }
      if (!shownEvent || fade === 0) {
        shownEvent = pendingEvent;
        pendingEvent = null;
        shownSinceSeconds = input.timeSeconds;
        fade = shownEvent
          ? Math.min(1, deltaSeconds / GARDEN_ALMANAC_FADE_SECONDS)
          : 0;
      }
    }

    hideAll(heron, lanternRound, meteor);
    if (!shownEvent || fade <= 0) return;
    const ageSeconds = Math.max(0, input.timeSeconds - shownSinceSeconds);

    if (shownEvent.id === "heron-dusk") {
      heron.visible = true;
      heronMaterial.opacity = fade * 0.82;
      const landing = Math.min(1, ageSeconds / 7);
      heron.position.set(
        input.islandX - 13.4,
        GARDEN_WATER_Y + 1.15 + (1 - landing) * 2.2,
        input.islandZ + 7.8,
      );
      heron.rotation.y = Math.PI * 0.22;
      heron.rotation.z = (1 - landing) * Math.sin(input.timeSeconds * 1.4) * 0.12;
      return;
    }

    if (shownEvent.id === "lantern-round") {
      lanternRound.visible = true;
      lanternMaterial.opacity = fade * 0.9;
      const litCount = Math.min(GARDEN_LANTERN_ROUND_COUNT, Math.floor(ageSeconds / 1.8) + 1);
      for (let index = 0; index < GARDEN_LANTERN_ROUND_COUNT; index += 1) {
        const angle = -0.9 + index * 0.42;
        lanternMatrix.makeTranslation(
          input.islandX - 12 + Math.cos(angle) * 7.2,
          GARDEN_WATER_Y + 1.05,
          input.islandZ + 5 + Math.sin(angle) * 6.2,
        );
        lanternRound.setMatrixAt(index, lanternMatrix);
        const lit = index < litCount;
        lanternColor.set(lit ? HARBOR_PALETTE.lantern_warm : HARBOR_PALETTE.deep_sea_1);
        lanternRound.setColorAt(index, lanternColor);
      }
      lanternRound.instanceMatrix.needsUpdate = true;
      if (lanternRound.instanceColor) lanternRound.instanceColor.needsUpdate = true;
      return;
    }

    const meteorEnvelope = ageSeconds < 3
      ? ageSeconds / 3
      : ageSeconds < 6
        ? 1
        : Math.max(0, 1 - (ageSeconds - 6) / 4);
    if (meteorEnvelope <= 0) return;
    meteor.visible = true;
    meteorMaterial.opacity = fade * meteorEnvelope * 0.78;
    const travel = Math.min(1, ageSeconds / 10);
    meteor.position.set(
      input.islandX - 26 + travel * 42,
      GARDEN_WATER_Y + 31 - travel * 5,
      input.islandZ - 18 + travel * 8,
    );
    meteor.rotation.set(0.18, -0.55, -0.3);
  };

  return { heron, lanternRound, meteor, root, update };
}

function createHeronGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([
    -0.75, 0.35, 0, 0.45, 0.7, 0, 0.65, 0.25, 0,
    0.25, 0.55, 0, 0.5, 1.65, 0, 0.72, 1.55, 0,
    0.62, 1.5, 0, 1.2, 1.42, 0, 0.7, 1.3, 0,
    -0.25, 0.3, 0, -0.12, -0.75, 0, 0.02, 0.28, 0,
    0.18, 0.3, 0, 0.34, -0.75, 0, 0.42, 0.35, 0,
  ], 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function hideAll(
  heron: Mesh,
  lanternRound: InstancedMesh,
  meteor: Line,
): void {
  heron.visible = false;
  lanternRound.visible = false;
  meteor.visible = false;
}
