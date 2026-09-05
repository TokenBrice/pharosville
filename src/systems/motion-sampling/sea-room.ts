import { clamp } from "../motion-utils";
import { distanceToStationFootprint } from "../dock-layout";
import { GARDEN_SILHOUETTE_FOR_HULL, gardenShipVisualScale } from "../garden-observatory-slice";
import { GARDEN_MOLE_OBSTACLES, gardenShipWaterBeamTiles, gardenShipWaterMarginTiles, isGardenShipWater } from "../garden-water-exclusion";
import type { SeaState } from "../sea-state";
import type { ShipMotionSample } from "../motion-types";
import type { ShipNode } from "../world-types";

export const SEA_ROOM_BASE_RADIUS_TILES = 0.7;
export const SEA_ROOM_MAX_NUDGE_PER_FRAME = 0.15;
const MAX_OFFSET_TILES = 8;
const NUDGE_TILES_PER_SECOND = 1.2;

export interface SeaRoomSeparationOptions {
  reducedMotion?: boolean;
  seaState?: SeaState | null;
  timeSeconds?: number;
}

interface Candidate {
  ship: ShipNode;
  sample: ShipMotionSample;
  baseX: number;
  baseY: number;
  x: number;
  y: number;
  length: number;
  beam: number;
  maxOffset: number;
  usedStep: number;
  crowded: boolean;
  includeDocks: boolean;
}
interface SeparationMemory {
  time: number;
  offsets: Map<string, { x: number; y: number; baseX: number; baseY: number }>;
}
const memoryBySamples = new WeakMap<ReadonlyMap<string, ShipMotionSample>, SeparationMemory>();

export function seaRoomSeparationRadius(seaState: SeaState | null | undefined): number {
  return SEA_ROOM_BASE_RADIUS_TILES * (1 + 0.3 * clamp(seaState?.swell ?? 0, 0, 1));
}

/**
 * Separate the final display positions, after route smoothing and garden placement.
 * Persistent offsets yield to moored hulls and relax back to the route afterwards.
 * This is bounded local avoidance, not a collision-free traffic scheduler.
 */
export function applySeaRoomSeparationPass(
  samples: ReadonlyMap<string, ShipMotionSample>,
  ships: readonly ShipNode[],
  options: SeaRoomSeparationOptions = {},
): number {
  if (options.reducedMotion) {
    memoryBySamples.delete(samples);
    return 0;
  }
  const time = options.timeSeconds ?? 0;
  let memory = memoryBySamples.get(samples);
  const elapsed = memory ? time - memory.time : 1 / 60;
  if (!memory || elapsed < 0 || elapsed > 1 || options.timeSeconds === undefined) {
    memory = { time, offsets: new Map() };
    memoryBySamples.set(samples, memory);
  }
  memory.time = time;
  const delta = clamp(elapsed, 0, 0.05);
  const step = Math.min(SEA_ROOM_MAX_NUDGE_PER_FRAME, delta * NUDGE_TILES_PER_SECOND);
  const candidates: Candidate[] = [];
  const liveIds = new Set<string>();
  for (const ship of ships) {
    const sample = samples.get(ship.id);
    // Formation children are composed from their parent by the shared resolver.
    if (!sample?.displayTile || ship.squadRole === "consort" || ship.dependencyFormation) continue;
    liveIds.add(ship.id);
    const scale = gardenShipVisualScale(ship.visual.scale || 1);
    const silhouette = GARDEN_SILHOUETTE_FOR_HULL[ship.visual.hull];
    const berth = ship.dockVisits.find((visit) => visit.dockId === sample.currentDockId);
    // Ease the detour to zero at the berth, rather than teleporting on moored state.
    const berthDistance = berth ? Math.hypot(sample.tile.x - berth.mooringTile.x, sample.tile.y - berth.mooringTile.y) : Infinity;
    const maxOffset = sample.state === "moored" ? 0 : Math.min(MAX_OFFSET_TILES, berthDistance * 0.4);
    const candidate: Candidate = {
      ship, sample, baseX: sample.displayTile.x, baseY: sample.displayTile.y,
      x: sample.displayTile.x, y: sample.displayTile.y,
      length: gardenShipWaterMarginTiles(scale, silhouette),
      beam: gardenShipWaterBeamTiles(scale, silhouette),
      maxOffset, usedStep: 0, crowded: false,
      includeDocks: !(sample.state === "moored" || sample.state === "arriving" || sample.state === "departing"
        || (sample.state === "sailing" && ship.dockVisits.length > 0)),
    };
    const previous = memory.offsets.get(ship.id);
    if (previous && Math.hypot(previous.baseX - candidate.baseX, previous.baseY - candidate.baseY) < 3 && maxOffset > 0) {
      const magnitude = Math.hypot(previous.x, previous.y);
      const decay = Math.min(1, maxOffset / Math.max(magnitude, 1e-9));
      const x = candidate.baseX + previous.x * decay;
      const y = candidate.baseY + previous.y * decay;
      if (safePosition(candidate, x, y)) {
        candidate.x = x;
        candidate.y = y;
        candidate.usedStep = magnitude * (1 - decay);
      } else {
        // A route can advance toward a bank while its avoidance offset points
        // at that bank. Hold the last safe position instead of snapping home.
        const heldX = previous.baseX + previous.x;
        const heldY = previous.baseY + previous.y;
        if (Math.hypot(heldX - candidate.baseX, heldY - candidate.baseY) <= maxOffset
          && safePosition(candidate, heldX, heldY)) {
          candidate.x = heldX;
          candidate.y = heldY;
        }
      }
    }
    candidates.push(candidate);
  }
  candidates.sort((a, b) => a.ship.id.localeCompare(b.ship.id));
  let nudgedPairs = 0;
  const comfort = seaRoomSeparationRadius(options.seaState);
  // ponytail: O(n²) at the existing <=320 fleet ceiling; spatial bins if the fleet grows.
  for (let i = 0; i < candidates.length; i += 1) {
    const a = candidates[i]!;
    for (let j = i + 1; j < candidates.length; j += 1) {
      const b = candidates[j]!;
      if (!a.maxOffset && !b.maxOffset) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      if (distance > Math.hypot(a.length, a.beam) + Math.hypot(b.length, b.beam) + comfort) continue;
      const axisX = distance > 1e-6 ? dx / distance : 1;
      const axisY = distance > 1e-6 ? dy / distance : 0;
      const radius = hullReach(a, axisX, axisY) + hullReach(b, axisX, axisY) + comfort;
      if (distance >= radius) continue;
      a.crowded = b.crowded = true;
      const share = (radius - distance) / (a.maxOffset && b.maxOffset ? 2 : 1);
      const movedA = move(a, -axisX * share, -axisY * share, step);
      const movedB = move(b, axisX * share, axisY * share, step);
      if (movedA || movedB) nudgedPairs += 1;
    }
  }
  for (const candidate of candidates) {
    const { sample, ship } = candidate;
    if (!candidate.crowded) {
      const recovery = 1 - Math.exp(-delta * 0.2);
      move(candidate, (candidate.baseX - candidate.x) * recovery, (candidate.baseY - candidate.y) * recovery, step);
    }
    sample.displayTile!.x = candidate.x;
    sample.displayTile!.y = candidate.y;
    const previous = memory.offsets.get(ship.id);
    if (previous && elapsed > 0 && Math.hypot(previous.baseX - candidate.baseX, previous.baseY - candidate.baseY) < 3) {
      const vx = (candidate.x - previous.baseX - previous.x) / elapsed;
      const vy = (candidate.y - previous.baseY - previous.y) / elapsed;
      sample.velocity ??= { x: 0, y: 0 };
      sample.velocity.x = vx;
      sample.velocity.y = vy;
      sample.speedTilesPerSecond = Math.hypot(vx, vy);
    }
    memory.offsets.set(ship.id, {
      x: candidate.x - candidate.baseX, y: candidate.y - candidate.baseY,
      baseX: candidate.baseX, baseY: candidate.baseY,
    });
  }
  for (const id of memory.offsets.keys()) if (!liveIds.has(id)) memory.offsets.delete(id);
  return nudgedPairs;
}

function hullReach(candidate: Candidate, x: number, y: number): number {
  const heading = candidate.sample.heading;
  const norm = Math.hypot(heading.x, heading.y) || 1;
  const along = (x * heading.x + y * heading.y) / norm;
  const across = (x * heading.y - y * heading.x) / norm;
  return Math.abs(along) * candidate.length + Math.abs(across) * candidate.beam;
}

function safePosition(candidate: Candidate, x: number, y: number): boolean {
  const point = { x, y };
  if (!isGardenShipWater(point, candidate.length, candidate.includeDocks)) return false;
  // Dock traffic may enter an apron, but avoidance must not push it into a mole arm.
  return GARDEN_MOLE_OBSTACLES.every((mole) => distanceToStationFootprint(point, mole)
    >= Math.min(candidate.beam, distanceToStationFootprint({ x: candidate.baseX, y: candidate.baseY }, mole)));
}

function move(candidate: Candidate, dx: number, dy: number, step: number): boolean {
  if (!candidate.maxOffset) return false;
  const distance = Math.hypot(dx, dy);
  const scale = Math.min(1, Math.max(0, step - candidate.usedStep) / Math.max(distance, 1e-9));
  if (scale <= 0) return false;
  const x = candidate.x + dx * scale;
  const y = candidate.y + dy * scale;
  if (Math.hypot(x - candidate.baseX, y - candidate.baseY) > candidate.maxOffset || !safePosition(candidate, x, y)) return false;
  candidate.x = x;
  candidate.y = y;
  candidate.usedStep += distance * scale;
  return true;
}
