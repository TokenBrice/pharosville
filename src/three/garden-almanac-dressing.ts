import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Vector3,
} from "three";
import type { GardenRitualHandler } from "../systems/garden-director";
import { HARBOR_PALETTE } from "../systems/palette";
import { GARDEN_REST_VIEW_AZIMUTH } from "../systems/sky-almanac";
import { stableUnit } from "./garden-util";

/** Seconds the streak takes to cross; it then fades over `GARDEN_METEOR_FADE_SECONDS`. */
export const GARDEN_METEOR_TRAVEL_SECONDS = 0.8;
export const GARDEN_METEOR_FADE_SECONDS = 0.45;
/** Well inside the dome (centred on the view target, not the eye) so the tower and ridges still occlude it. */
const METEOR_DISTANCE = 300;
const DEG = Math.PI / 180;

export interface GardenAlmanacDressingUpdate {
  cameraPosition: Vector3;
  reducedMotion: boolean;
}

export interface GardenAlmanacDressing {
  meteor: Line<BufferGeometry, LineBasicMaterial>;
  root: Group;
  /** The day score's "meteor" ritual (register with `registerRitual`). */
  ritual: GardenRitualHandler;
  update(input: GardenAlmanacDressingUpdate): void;
}

/**
 * The dark-moon meteor (W5.1): one brief streak high in the rest view's sky,
 * head bright and tail fading, crossing in under a second. It exists only
 * while its scored ritual runs — rare (half the dark-moon nights), tiny (one
 * two-vertex line, one draw while visible) and absent under reduced motion,
 * where the ritual never starts. Decorative: it carries no data.
 */
export function createGardenAlmanacDressing(): GardenAlmanacDressing {
  const root = new Group();
  root.name = "garden-almanac-dressing";
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  const head = HARBOR_PALETTE.foam_white;
  const material = new LineBasicMaterial({
    blending: AdditiveBlending,
    color: head,
    depthWrite: false,
    fog: false,
    opacity: 0,
    toneMapped: false,
    transparent: true,
    vertexColors: true,
  });
  // Tail black under additive blending: the streak fades to nothing behind its head.
  geometry.setAttribute("color", new Float32BufferAttribute([1, 1, 1, 0, 0, 0], 3));
  const meteor = new Line(geometry, material);
  meteor.name = "garden-almanac-meteor";
  meteor.frustumCulled = false;
  meteor.renderOrder = 2;
  meteor.visible = false;
  root.add(meteor);

  const from = new Vector3();
  const to = new Vector3();
  let startSeconds = Number.NaN;
  let ageSeconds = Number.POSITIVE_INFINITY;
  let seed = 0;

  const skyPoint = (azimuth: number, elevation: number, target: Vector3): Vector3 => target.set(
    Math.cos(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    Math.sin(azimuth) * Math.cos(elevation),
  ).multiplyScalar(METEOR_DISTANCE);

  const ritual: GardenRitualHandler = {
    start(t) {
      startSeconds = t;
      ageSeconds = 0;
      seed = Math.round(t);
    },
    update(t) {
      ageSeconds = Math.max(0, t - startSeconds);
      return ageSeconds >= GARDEN_METEOR_TRAVEL_SECONDS + GARDEN_METEOR_FADE_SECONDS;
    },
    cancel() {
      ageSeconds = Number.POSITIVE_INFINITY;
      meteor.visible = false;
    },
  };

  const update = ({ cameraPosition, reducedMotion }: GardenAlmanacDressingUpdate): void => {
    const total = GARDEN_METEOR_TRAVEL_SECONDS + GARDEN_METEOR_FADE_SECONDS;
    meteor.visible = !reducedMotion && ageSeconds < total;
    if (!meteor.visible) return;
    // A seeded bearing inside the rest view, falling left-to-right or right-to-left.
    const side = stableUnit(`meteor.side.${seed}`) < 0.5 ? -1 : 1;
    const azimuth = GARDEN_REST_VIEW_AZIMUTH + (stableUnit(`meteor.bearing.${seed}`) - 0.5) * 0.5;
    // Seen from the rest seat's eye the frame's top edge sits near 11°: the
    // streak starts 8–11° up and falls 3°, above the ridges and the lantern.
    const elevation = (8 + stableUnit(`meteor.height.${seed}`) * 3) * DEG;
    const travel = Math.min(1, ageSeconds / GARDEN_METEOR_TRAVEL_SECONDS);
    const headAzimuth = azimuth + side * (travel - 0.5) * 0.16;
    const headElevation = elevation - travel * 3 * DEG;
    const tailLength = 0.015 + 0.035 * Math.min(1, travel * 2);
    skyPoint(headAzimuth, headElevation, from).add(cameraPosition);
    skyPoint(headAzimuth - side * tailLength, headElevation + tailLength * 0.45, to).add(cameraPosition);
    const positions = geometry.getAttribute("position") as Float32BufferAttribute;
    positions.setXYZ(0, from.x, from.y, from.z);
    positions.setXYZ(1, to.x, to.y, to.z);
    positions.needsUpdate = true;
    const fade = ageSeconds <= GARDEN_METEOR_TRAVEL_SECONDS
      ? 1
      : 1 - (ageSeconds - GARDEN_METEOR_TRAVEL_SECONDS) / GARDEN_METEOR_FADE_SECONDS;
    material.opacity = 0.85 * Math.max(0, fade) * Math.min(1, ageSeconds / 0.08);
  };

  return { meteor, root, ritual, update };
}
