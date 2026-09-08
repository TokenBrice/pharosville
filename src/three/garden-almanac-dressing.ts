import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  BoxGeometry,
  CapsuleGeometry,
  CircleGeometry,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from "three";
import type { GardenAlmanacEvent } from "../systems/garden-almanac";
import { GARDEN_MOTION_DURATIONS } from "../systems/motion-tokens";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import { TILE_SCALE } from "./garden-util";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { dayCycleBeats } from "./garden-day-cycle";
import { requestGardenBeat, type GardenDirectorState, type GardenBeat } from "../systems/garden-director";
import type { GardenKeeperRitual } from "./garden-lanterns";

export const GARDEN_ALMANAC_FADE_SECONDS = GARDEN_MOTION_DURATIONS.breathe.ms / 1_000;
export const GARDEN_HERON_PERCH_WORLD = {
  x: 82.6 * TILE_SCALE,
  y: GARDEN_WATER_Y + 1.22,
  z: 126.6 * TILE_SCALE,
} as const;

export interface GardenAlmanacDressingUpdate {
  activeEvent: GardenAlmanacEvent | null;
  deltaSeconds: number;
  reducedMotion: boolean;
  timeSeconds: number;
  hour?: number;
  director?: GardenDirectorState | undefined;
}

export interface GardenAlmanacDressing {
  heron: Mesh<BufferGeometry, MeshBasicMaterial>;
  keeper: Mesh<BufferGeometry, MeshBasicMaterial>;
  keeperRitual: GardenKeeperRitual;
  keeperPath: readonly Vector3[];
  /**
   * The rim path is content (rebuilt with the world); the dressing is scene.
   * Re-derive the walk in place so fixture lighting created against the same
   * array sees the new ribbon.
   */
  setKeeperPath(pathGeometry: BufferGeometry, pathSegmentCount: number): void;
  meteor: Line<BufferGeometry, LineBasicMaterial>;
  root: Group;
  update(input: GardenAlmanacDressingUpdate): void;
}

/**
 * Three deliberately small scene-owned sightings. They share the route clock,
 * use the named nine-second breathe duration for entry/exit, and allocate no
 * timers. Reduced motion holds the active event at one complete authored pose.
 */
export function createGardenAlmanacDressing(options?: {
  pathGeometry: BufferGeometry;
  pathSegmentCount: number;
}): GardenAlmanacDressing {
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

  const keeper = new Mesh(createKeeperGeometry(), new MeshBasicMaterial({ vertexColors: true }));
  keeper.name = "garden-evening-keeper";
  keeper.visible = false;
  const path: Vector3[] = options ? keeperPath(options.pathGeometry, options.pathSegmentCount) : [];
  const setKeeperPath = (pathGeometry: BufferGeometry, pathSegmentCount: number): void => {
    path.length = 0;
    path.push(...keeperPath(pathGeometry, pathSegmentCount));
  };
  const keeperRitual: GardenKeeperRitual = { active: false, progress: 0, direction: "evening" };
  let keeperBeat: GardenBeat | null = null;
  let previousBlue = 0;
  let previousDawn = 0;

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

  root.add(heron, keeper, meteor);
  hideAll(heron, meteor);
  let shownEvent: GardenAlmanacEvent | null = null;
  let pendingEvent: GardenAlmanacEvent | null = null;
  let fade = 0;
  let shownSinceSeconds = 0;

  const update = (input: GardenAlmanacDressingUpdate): void => {
    const beats = dayCycleBeats(input.hour ?? 12);
    const evening = beats.blue > previousBlue && previousBlue === 0;
    const dawn = beats.dawn > previousDawn && previousDawn === 0;
    previousBlue = beats.blue;
    previousDawn = beats.dawn;
    if (!input.reducedMotion && input.director && (evening || dawn)) {
      keeperBeat = requestGardenBeat(input.director, {
        kind: "keeper", foreground: false, durationSeconds: 180, priority: 20,
        subject: dawn ? "dawn" : "evening",
      }, input.timeSeconds);
      if (keeperBeat) keeperRitual.direction = dawn ? "dawn" : "evening";
    }
    keeperRitual.active = !input.reducedMotion && keeperBeat !== null
      && input.director?.active?.id === keeperBeat.id
      && input.timeSeconds < keeperBeat.startSeconds + keeperBeat.durationSeconds;
    keeperRitual.progress = input.reducedMotion ? 0.5 : keeperBeat
      ? Math.min(1, Math.max(0, (input.timeSeconds - keeperBeat.startSeconds) / keeperBeat.durationSeconds)) : 0;
    keeper.visible = path.length > 1 && (input.reducedMotion || keeperRitual.active);
    if (keeper.visible) {
      const progress = input.reducedMotion ? 0.5 : keeperRitual.direction === "dawn"
        ? 1 - keeperRitual.progress : keeperRitual.progress;
      placeKeeper(keeper, path, progress);
      if (!input.reducedMotion && keeperRitual.direction === "dawn") keeper.rotation.y += Math.PI;
    }
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

    hideAll(heron, meteor);
    if (!shownEvent || fade <= 0) return;
    const ageSeconds = input.reducedMotion
      ? shownEvent.id === "heron-dusk" ? 7 : 4.5
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

  return { heron, keeper, keeperPath: path, keeperRitual, meteor, root, setKeeperPath, update };
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
  meteor: Line,
): void {
  heron.visible = false;
  meteor.visible = false;
}

/** 24 capsule + 8 hat + 12 lantern triangles, merged into one draw. */
function createKeeperGeometry(): BufferGeometry {
  const body = new CapsuleGeometry(0.22, 0.56, 1, 4).translate(0, 0.55, 0);
  const hat = new CircleGeometry(0.38, 8).rotateX(-Math.PI / 2).translate(0, 1.16, 0);
  const lantern = new BoxGeometry(0.22, 0.3, 0.22).translate(0.36, 0.53, 0.16);
  const parts = [body, hat, lantern];
  const dyes = [HARBOR_PALETTE.timber_dark, HARBOR_PALETTE.stone_dark, HARBOR_PALETTE.lantern_warm];
  parts.forEach((part, index) => {
    const color = new Color(dyes[index]!);
    const colors = new Float32Array(part.getAttribute("position").count * 3);
    for (let offset = 0; offset < colors.length; offset += 3) color.toArray(colors, offset);
    part.setAttribute("color", new Float32BufferAttribute(colors, 3));
  });
  const geometry = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  return geometry;
}

/** Recover ribbon centre lines, excluding the appended veranda boxes. */
function keeperPath(geometry: BufferGeometry, segmentCount: number): Vector3[] {
  const positions = geometry.getAttribute("position");
  let longest: Vector3[] = [];
  let current: Vector3[] = [];
  let currentLength = 0;
  let longestLength = 0;
  for (let segment = 0; segment < segmentCount; segment += 1) {
    const offset = segment * 4;
    const a = new Vector3().fromBufferAttribute(positions, offset)
      .add(new Vector3().fromBufferAttribute(positions, offset + 3)).multiplyScalar(0.5);
    const b = new Vector3().fromBufferAttribute(positions, offset + 1)
      .add(new Vector3().fromBufferAttribute(positions, offset + 2)).multiplyScalar(0.5);
    if (current.length === 0 || current[current.length - 1]!.distanceTo(a) > 0.01) {
      current = [a];
      currentLength = 0;
    }
    current.push(b);
    currentLength += a.distanceTo(b);
    if (currentLength > longestLength) {
      longest = current;
      longestLength = currentLength;
    }
  }
  return longest;
}

function placeKeeper(keeper: Mesh, path: readonly Vector3[], progress: number): void {
  let length = 0;
  for (let index = 1; index < path.length; index += 1) length += path[index - 1]!.distanceTo(path[index]!);
  let distance = progress * length;
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1]!;
    const b = path[index]!;
    const span = a.distanceTo(b);
    if (distance <= span || index === path.length - 1) {
      keeper.position.copy(a).lerp(b, span > 0 ? distance / span : 0);
      keeper.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      return;
    }
    distance -= span;
  }
}
