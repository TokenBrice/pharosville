/**
 * Six inspectable stations in an explicit stroll. Idle holds the current
 * station; only Home returns to the seat. Eyes and subjects use the same
 * terrain, shore and veranda anchors as the production scene.
 */
import {
  cameraViewFromAngles,
  worldToScreen,
  type CameraView,
  type IsoCamera,
  type ScreenPoint,
  type WorldPoint,
} from "./projection";
import { gardenIslandDisplayTile, gardenTowerWorldAnchors } from "./garden-observatory-slice";
import { LIGHTHOUSE_TILE } from "./world-layout";
import { TILE_SCALE } from "./projection";
import { rimLandAt } from "./garden-rim";
import { GARDEN_CHASEKI_ANCHORS, GARDEN_CHASEKI_FEET, GARDEN_QUAY_STAIR_HEAD, islandTerrainHeight } from "../three/garden-island";
import { gardenRimHeightAt } from "../three/garden-rim-mesh";

export interface StationLocalBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minDolly: number;
  maxDolly: number;
}

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
  /** Authored eye envelope and relative dolly range, never a free orbit. */
  localBounds: StationLocalBounds;
}

const WATER_Y = -1.45;
/** The Pharos's tower axis and heights (garden-observatory-slice anchors). */
const tower = gardenTowerWorldAnchors(LIGHTHOUSE_TILE);
const TOWER = { x: tower.foot.x, z: tower.foot.z, foot: tower.foot.y, crown: tower.crown.y };
const island = gardenIslandDisplayTile(LIGHTHOUSE_TILE);
const ISLAND_ORIGIN = { x: island.x * TILE_SCALE, z: island.y * TILE_SCALE };
const islandPoint = (point: WorldPoint): WorldPoint => ({ x: ISLAND_ORIGIN.x + point.x, y: point.y, z: ISLAND_ORIGIN.z + point.z });

/** The actual production terrain, not the selection probe's coarse crag drum. */
export function strollGroundHeight(x: number, z: number): number | null {
  const lx = x - ISLAND_ORIGIN.x, lz = z - ISLAND_ORIGIN.z;
  if (Math.hypot(lx, lz) <= 30) {
    const height = islandTerrainHeight(lx, lz);
    if (height > WATER_Y) return height;
  }
  return rimLandAt(x / TILE_SCALE, z / TILE_SCALE) ? gardenRimHeightAt(x / TILE_SCALE, z / TILE_SCALE) : null;
}

const CHASEKI_BOX = {
  minX: Math.min(...GARDEN_CHASEKI_FEET.map((point) => point.x)) - 0.65,
  maxX: Math.max(...GARDEN_CHASEKI_FEET.map((point) => point.x)) + 0.65,
  minZ: Math.min(...GARDEN_CHASEKI_FEET.map((point) => point.z)) - 0.65,
  maxZ: Math.max(...GARDEN_CHASEKI_FEET.map((point) => point.z)) + 0.65,
};

/** Conservative roof envelopes from the accepted chaseki and precinct kit. */
export function strollShelterHeight(x: number, z: number): number | null {
  const lx = x - ISLAND_ORIGIN.x, lz = z - ISLAND_ORIGIN.z;
  if (lx >= CHASEKI_BOX.minX && lx <= CHASEKI_BOX.maxX && lz >= CHASEKI_BOX.minZ && lz <= CHASEKI_BOX.maxZ) return GARDEN_CHASEKI_ANCHORS.ridge.y;
  if (Math.abs(x - tower.foot.x) <= 5.6 && Math.abs(z - (tower.foot.z - 7)) <= 1.3) return tower.foot.y + 2.26;
  const gateX = ISLAND_ORIGIN.x + GARDEN_QUAY_STAIR_HEAD.x;
  const gateZ = ISLAND_ORIGIN.z + GARDEN_QUAY_STAIR_HEAD.z;
  if (Math.abs(x - gateX) <= 0.5 && Math.abs(z - gateZ) <= 1.9) return tower.foot.y + 2.32;
  return null;
}

function localBounds(eye: WorldPoint, radius: number): StationLocalBounds {
  return { minX: eye.x - radius, maxX: eye.x + radius, minZ: eye.z - radius, maxZ: eye.z + radius, minDolly: 0.82, maxDolly: 1.2 };
}

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
const MOLE_MOUTH = { x: 15 * TILE_SCALE, z: 95 * TILE_SCALE };
const MOLE_EYE: WorldPoint = { x: MOLE_MOUTH.x + 35.36, y: 12, z: MOLE_MOUTH.z + 21.21 };
const CRANE_EYE = islandPoint({ x: 2.4, y: WATER_Y + 3.2, z: -16.1 });
const verandaApproach = islandPoint(GARDEN_CHASEKI_ANCHORS.approach);
const BENCH_EYE: WorldPoint = { x: verandaApproach.x - 5, y: WATER_Y + 5, z: verandaApproach.z + 13 };
const stair = islandPoint({ x: GARDEN_QUAY_STAIR_HEAD.x + 2.8, y: 0, z: GARDEN_QUAY_STAIR_HEAD.z + 0.7 });
const STAIR_EYE: WorldPoint = { ...stair, y: islandTerrainHeight(stair.x - ISLAND_ORIGIN.x, stair.z - ISLAND_ORIGIN.z) + 1.7 };

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
    localBounds: localBounds(INLET_EYE, 6),
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
    localBounds: localBounds(DECK_EYE, 4),
    probes: towerProbes(DECK_EYE),
  },
  {
    // camera-4 "Mole at Market": the Ethereum Mole on the lower-left third.
    id: "mole-end",
    title: "The mole at market",
    eye: MOLE_EYE,
    subject: { ...MOLE_MOUTH, y: 1.2 },
    anchor: { x: 0.36, y: 0.58 },
    vFovDeg: 32,
    probes: [{ ...MOLE_MOUTH, y: 0.4 }, { ...MOLE_MOUTH, y: 3.5 }],
    ownStation: "15,95",
    localBounds: localBounds(MOLE_EYE, 4),
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
    localBounds: localBounds(CRANE_EYE, 2),
  },
  {
    // From a boat off the lee shore, past the lone islet's stones: the
    // tea-house on its bench under the crag.
    id: "chaseki-bench",
    title: "The tea-house veranda",
    eye: BENCH_EYE,
    subject: islandPoint({ ...GARDEN_CHASEKI_ANCHORS.door, y: GARDEN_CHASEKI_ANCHORS.door.y + 1.1 }),
    anchor: { x: 0.38, y: 0.58 },
    vFovDeg: 32,
    probes: [islandPoint({ ...GARDEN_CHASEKI_ANCHORS.approach, y: 3 }), islandPoint({ ...GARDEN_CHASEKI_ANCHORS.approach, y: 4.2 })],
    localBounds: localBounds(BENCH_EYE, 2),
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
    localBounds: localBounds(STAIR_EYE, 0.9),
  },
];

/** Each outgoing leg follows a named water corridor or the existing stair. */
const STROLL_WAYPOINTS: readonly (readonly WorldPoint[])[] = [
  [{ x: 140, y: 7, z: 142 }, { x: 139, y: 5, z: 80 }, { x: 130, y: 3, z: 42 }],
  [{ x: 76, y: 4, z: 34 }, { x: 60, y: 5, z: 76 }, { x: 55, y: 8, z: 126 }],
  [{ x: 59, y: 6, z: 130 }, { x: 66, y: 5, z: 88 }, { x: 89, y: 3, z: 83 }],
  [{ x: 122, y: 5, z: 93 }, { x: 125, y: 5, z: 120 }, { x: 113, y: 4, z: 129 }],
  [{ x: 118, y: 4, z: 124 }, { x: 125, y: 4, z: 105 }, { x: 120, y: 7, z: 99 }],
  [{ x: 123, y: 8, z: 105 }, { x: 130, y: 8, z: 139 }],
];

/** Adjacent reverse travel uses exactly the same corridor in reverse. */
export function strollWaypoints(from: number | null, to: number | null): readonly WorldPoint[] {
  if (from === null) return [{ x: 140, y: 10, z: 177 }];
  if (to === null) return [{ x: 130, y: 10, z: 165 }];
  if ((from + 1) % GARDEN_POSTCARDS.length === to) return STROLL_WAYPOINTS[from]!;
  if ((to + 1) % GARDEN_POSTCARDS.length === from) return [...STROLL_WAYPOINTS[to]!].reverse();
  return [];
}

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

/** A station's authored view with its local gesture rig underneath. */
export function postcardCamera(card: GardenPostcard, rig: IsoCamera, viewport: ScreenPoint): IsoCamera {
  return {
    offsetX: rig.offsetX,
    offsetY: rig.offsetY,
    zoom: rig.zoom,
    shot: { presence: 1, view: postcardView(card, viewport), subject: { world: card.subject, anchor: card.anchor } },
  };
}
