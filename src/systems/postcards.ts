/**
 * X6 (camera-4, K44): the postcard book as the "Wander" action.
 *
 * The idle state is the rest shot; nothing tours on its own. "Wander" glides
 * (the W1.7 selection glide) to the next of six places seen from inside the
 * world, and holds there until the visitor wanders on or does anything else,
 * which returns the view to the rest seat. Each card is an authored ShotSpec:
 * an eye standing somewhere a person could stand or float (a moored deck, the
 * mole end, the tea-house bench, the crag stair, low over the water), a
 * subject, the frame point the subject is composed on and a lens. The view is
 * solved per viewport so the subject holds its anchor at every gate profile;
 * `postcards.test.ts` checks every card's eye clearance, sight lines and
 * composition at the four gates.
 *
 * World units (x = tile.x·TILE_SCALE, z = tile.y·TILE_SCALE, y up; water at
 * −1.45). Eyes on the island are derived from the island's own anchors in
 * the test, so a landform move cannot leave a card standing inside the rock.
 */
import {
  cameraViewFromAngles,
  worldToScreen,
  type CameraView,
  type IsoCamera,
  type ScreenPoint,
  type WorldPoint,
} from "./projection";

export interface GardenPostcard {
  id: string;
  /** The card's name, as the announcement reads it. */
  title: string;
  eye: WorldPoint;
  /** The point the picture is composed on. */
  subject: WorldPoint;
  /** Where the subject sits in the frame (fractions of the viewport). */
  anchor: ScreenPoint;
  vFovDeg: number;
  /**
   * Points whose sight lines from the eye must stay clear (the subject's
   * silhouette, sampled on its face toward the eye).
   */
  probes: readonly WorldPoint[];
  /** The subject's own station (`x,y` dock tile), exempt from the probe. */
  ownStation?: string;
}

const WATER_Y = -1.45;
/** The Pharos's tower axis and heights (garden-observatory-slice anchors). */
const TOWER = { x: 94.82, z: 109.06, foot: 8.55, crown: 40.55 } as const;

/** Points on the tower's face toward an eye (the axis itself is inside the stone). */
function towerProbes(eye: WorldPoint): WorldPoint[] {
  const dx = eye.x - TOWER.x;
  const dz = eye.z - TOWER.z;
  const length = Math.hypot(dx, dz);
  const face = { x: TOWER.x + (dx / length) * 4.6, z: TOWER.z + (dz / length) * 4.6 };
  return [TOWER.foot + 2, 24, 36].map((y) => ({ x: face.x, y, z: face.z }));
}

const INLET_EYE: WorldPoint = { x: 128.8, y: 8, z: 177.1 };
const DECK_EYE: WorldPoint = { x: 114.55, y: WATER_Y + 2.6, z: 24.04 };
const MOLE_EYE: WorldPoint = { x: 56.57, y: 12, z: 155.56 };
const CRANE_EYE: WorldPoint = { x: 104.2, y: WATER_Y + 3.2, z: 94.2 };
const BENCH_EYE: WorldPoint = { x: 100.82, y: WATER_Y + 5, z: 127.31 };
const STAIR_EYE: WorldPoint = { x: 108.42, y: 7.9, z: 105.64 };

/** The six places, in book order. */
export const GARDEN_POSTCARDS: readonly GardenPostcard[] = [
  {
    // camera-4 "Crown in Air": low over the inlet mouth, the lantern in open sky.
    id: "inlet-mouth",
    title: "The inlet mouth",
    eye: INLET_EYE,
    subject: { x: TOWER.x, y: TOWER.crown, z: TOWER.z },
    anchor: { x: 0.64, y: 0.14 },
    vFovDeg: 38,
    probes: towerProbes(INLET_EYE),
  },
  {
    // From a deck in the quiet north basin (no berth there): the crane and
    // satellite islets in the middle ground, the Pharos rising behind them.
    id: "north-deck",
    title: "From a deck in the north basin",
    eye: DECK_EYE,
    subject: { x: TOWER.x, y: TOWER.crown, z: TOWER.z },
    anchor: { x: 0.62, y: 0.14 },
    vFovDeg: 36,
    probes: towerProbes(DECK_EYE),
  },
  {
    // camera-4 "Mole at Market": the Ethereum Mole on the lower-left third.
    id: "mole-end",
    title: "The mole at market",
    eye: MOLE_EYE,
    subject: { x: 21.2, y: 1.2, z: 134.35 },
    anchor: { x: 0.36, y: 0.58 },
    vFovDeg: 32,
    probes: [{ x: 21.2, y: 0.4, z: 134.35 }, { x: 21.2, y: 3.5, z: 134.35 }],
    ownStation: "15,95",
  },
  {
    // Low over the water north of the island: the crane stones and the north passage.
    id: "crane-islet",
    title: "The crane islet",
    eye: CRANE_EYE,
    subject: { x: 100.41, y: 0.2, z: 69.3 },
    anchor: { x: 0.38, y: 0.6 },
    vFovDeg: 32,
    probes: [{ x: 100.41, y: 0.2, z: 70.6 }, { x: 100.41, y: 1.6, z: 70.6 }],
  },
  {
    // From a boat off the lee shore, past the lone islet's stones: the
    // tea-house on its bench under the crag.
    id: "chaseki-bench",
    title: "By the tea-house",
    eye: BENCH_EYE,
    subject: { x: 106.22, y: 2.6, z: 112.66 },
    anchor: { x: 0.38, y: 0.58 },
    vFovDeg: 32,
    probes: [{ x: 106.3, y: 3.0, z: 114.4 }, { x: 106.3, y: 4.2, z: 114.4 }],
  },
  {
    // High on the crag stair: over the bench and the anchorage to the reed station.
    id: "crag-stair",
    title: "High on the crag stair",
    eye: STAIR_EYE,
    subject: { x: 155.6, y: 1.5, z: 185.3 },
    anchor: { x: 0.64, y: 0.46 },
    vFovDeg: 32,
    probes: [{ x: 155.6, y: 1.5, z: 185.3 }],
    ownStation: "110,131",
  },
];

/**
 * The card's view at this viewport: the eye fixed, the look turned (no roll)
 * until the subject lands on its anchor. Newton on (yaw, pitch) with
 * finite-difference steps; converges in a handful of iterations because the
 * projection is smooth and the start is the straight look at the subject.
 */
export function postcardView(card: GardenPostcard, viewport: ScreenPoint): CameraView {
  const dx = card.eye.x - card.subject.x;
  const dz = card.eye.z - card.subject.z;
  let yaw = Math.atan2(dx, dz);
  let pitch = Math.atan2(card.eye.y - card.subject.y, Math.hypot(dx, dz));
  const distance = Math.hypot(dx, card.eye.y - card.subject.y, dz);
  const viewAt = (y: number, p: number) => cameraViewFromAngles(card.eye, y, p, distance, card.vFovDeg);
  const frameAt = (y: number, p: number): ScreenPoint => {
    const camera: IsoCamera = { offsetX: 0, offsetY: 0, zoom: 1, shot: { presence: 1, view: viewAt(y, p) } };
    const screen = worldToScreen(card.subject, camera, viewport);
    return { x: screen.x / viewport.x - card.anchor.x, y: screen.y / viewport.y - card.anchor.y };
  };
  const h = 1e-4;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const error = frameAt(yaw, pitch);
    if (Math.abs(error.x) < 1e-7 && Math.abs(error.y) < 1e-7) break;
    const dYaw = frameAt(yaw + h, pitch);
    const dPitch = frameAt(yaw, pitch + h);
    const a = (dYaw.x - error.x) / h;
    const b = (dPitch.x - error.x) / h;
    const c = (dYaw.y - error.y) / h;
    const d = (dPitch.y - error.y) / h;
    const determinant = a * d - b * c;
    if (Math.abs(determinant) < 1e-12) break;
    yaw -= (d * error.x - b * error.y) / determinant;
    pitch -= (a * error.y - c * error.x) / determinant;
  }
  return viewAt(yaw, pitch);
}

/**
 * The camera state that shows a card: the given rig (the rest's hand-off
 * rig, so a gesture that follows lands near the seat) under the card's shot.
 * No rest pose rides under it: the seat's threshold stays at the seat.
 */
export function postcardCamera(card: GardenPostcard, rig: IsoCamera, viewport: ScreenPoint): IsoCamera {
  return {
    offsetX: rig.offsetX,
    offsetY: rig.offsetY,
    zoom: rig.zoom,
    shot: { presence: 1, view: postcardView(card, viewport) },
  };
}
