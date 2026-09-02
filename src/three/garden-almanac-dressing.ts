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
import { TILE_SCALE } from "./garden-util";

export const GARDEN_ALMANAC_FADE_SECONDS = GARDEN_MOTION_DURATIONS.breathe.ms / 1_000;
export const GARDEN_LANTERN_ROUND_COUNT = 7;
export const GARDEN_HERON_PERCH_WORLD = {
  x: 82.6 * TILE_SCALE,
  y: GARDEN_WATER_Y + 1.22,
  z: 126.6 * TILE_SCALE,
} as const;
export const GARDEN_LANTERN_ROUND_TILES = [
  { x: 10, y: 72 },
  { x: 9, y: 82 },
  { x: 10, y: 92 },
  { x: 26, y: 135 },
  { x: 48, y: 136 },
  { x: 82, y: 136 },
  { x: 112, y: 135 },
] as const;

export interface GardenAlmanacDressingUpdate {
  activeEvent: GardenAlmanacEvent | null;
  deltaSeconds: number;
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
 * timers. Reduced motion holds the active event at one complete authored pose.
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
      shownEvent = input.activeEvent;
      pendingEvent = null;
      fade = shownEvent ? 1 : 0;
      shownSinceSeconds = input.timeSeconds;
    } else {
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
    }

    hideAll(heron, lanternRound, meteor);
    if (!shownEvent || fade <= 0) return;
    const ageSeconds = input.reducedMotion
      ? shownEvent.id === "lantern-round" ? 18 : shownEvent.id === "heron-dusk" ? 7 : 4.5
      : Math.max(0, input.timeSeconds - shownSinceSeconds);

    if (shownEvent.id === "heron-dusk") {
      heron.visible = true;
      heronMaterial.opacity = fade * 0.82;
      const landing = Math.min(1, ageSeconds / 7);
      heron.position.set(
        GARDEN_HERON_PERCH_WORLD.x,
        GARDEN_HERON_PERCH_WORLD.y + (1 - landing) * 2.2,
        GARDEN_HERON_PERCH_WORLD.z,
      );
      heron.rotation.y = Math.PI * 0.22;
      heron.rotation.z = input.reducedMotion
        ? 0
        : (1 - landing) * Math.sin(input.timeSeconds * 1.4) * 0.12;
      return;
    }

    if (shownEvent.id === "lantern-round") {
      lanternRound.visible = true;
      // Seven warm points, no light sources or reflection lanes: the almanac
      // round stays beneath the beacon/moon and inside the ember budget.
      lanternMaterial.opacity = fade * 0.58;
      const litCount = Math.min(GARDEN_LANTERN_ROUND_COUNT, Math.floor(ageSeconds / 1.8) + 1);
      for (let index = 0; index < GARDEN_LANTERN_ROUND_COUNT; index += 1) {
        const tile = GARDEN_LANTERN_ROUND_TILES[index]!;
        lanternMatrix.makeTranslation(
          tile.x * TILE_SCALE,
          GARDEN_WATER_Y + 1.35,
          tile.y * TILE_SCALE,
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
      (38 + travel * 74) * TILE_SCALE,
      GARDEN_WATER_Y + 31 - travel * 5,
      (9 + travel * 11) * TILE_SCALE,
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
