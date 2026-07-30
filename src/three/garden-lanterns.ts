import { Color, DataTexture, FloatType, RGBAFormat } from "three";
import type { PharosVilleRenderSchedulerState } from "../renderer/render-types";

/**
 * Shared light-lane registry: every warm light that should lay a reflection
 * lane on the sea (beacon, ship lanterns, dock lamps, buoys, memorial
 * lanterns) registers here. The water shader samples the packed DataTexture;
 * callers never talk to the shader directly. The per-tier lane cap is policy
 * owned by this module, not by callers.
 *
 * Phase 4 (Breathtaking Rendering, item 3): a fourth kind — "route". A route
 * lane is a SEGMENT (worldX/worldZ → route.x/route.z) rather than a point,
 * and the water shader scrolls emissive pulses along it: the Cerebrium
 * "nothing moves" trick for the busiest trade routes. Pulse speed and phase
 * are seeded from the lane id (deterministic, never Math.random), so callers
 * supply only the two endpoints and an intensity.
 */
export type GardenLightLaneKind = "beacon" | "lantern" | "buoy" | "route";

export interface GardenLightLane {
  color: string;
  id: string;
  intensity: number;
  kind: GardenLightLaneKind;
  worldX: number;
  worldZ: number;
  /** Route lanes only: the segment's far endpoint in world XZ. */
  route?: { x: number; z: number };
}

export const MAX_GARDEN_LIGHT_LANES = 48;

const LANE_CAP_FOR_TIER: Record<PharosVilleRenderSchedulerState["tier"], number> = {
  full: MAX_GARDEN_LIGHT_LANES,
  balanced: 12,
  interaction: 12,
  recovery: 6,
  constrained: 4,
};

const ROUTE_RESERVE_FOR_TIER: Record<PharosVilleRenderSchedulerState["tier"], number> = {
  full: 6,
  balanced: 3,
  interaction: 3,
  recovery: 2,
  constrained: 1,
};

export interface GardenLaneRegistry {
  /**
   * Packed lanes, 3 rows of RGBA-float texels:
   * row 0 = (worldX, worldZ, intensity, kind), row 1 = (r, g, b, active),
   * row 2 = route lanes only: (endX, endZ, pulseSpeed, pulsePhase).
   */
  readonly texture: DataTexture;
  readonly activeLaneCount: number;
  /**
   * Bounding circle (world XZ) of the active lanes, inflated by the shader's
   * 30-unit hard cull: outside it every lane contributes exactly zero, so the
   * water fragment can skip the whole loop coherently with identical output.
   */
  fieldBounds(): { centerX: number; centerZ: number; radius: number };
  clear(): void;
  dispose(): void;
  remove(id: string): void;
  set(lane: GardenLightLane): void;
  /**
   * Re-pack the texture for the tier's lane cap. Returns the active count.
   * `intensityScale` is the day-cycle gate: reflection pools are lantern
   * light, so the caller scales them down by day (near zero) and up at dusk/
   * night; without it the overlapping full-tier pools cross the bloom knee
   * and flood the frame.
   */
  sync(tier: PharosVilleRenderSchedulerState["tier"], intensityScale?: number): number;
}

export function createGardenLaneRegistry(): GardenLaneRegistry {
  const lanes = new Map<string, GardenLightLane>();
  const data = new Float32Array(MAX_GARDEN_LIGHT_LANES * 3 * 4);
  const texture = new DataTexture(
    data,
    MAX_GARDEN_LIGHT_LANES,
    3,
    RGBAFormat,
    FloatType,
  );
  texture.needsUpdate = true;
  const scratchColor = new Color();
  let activeLaneCount = 0;
  let dirty = true;
  let lastCap = -1;
  let lastScale = -1;
  // Bounding circle of the packed lanes (+ the shader's 30-unit cull reach);
  // recomputed inside sync whenever the pack changes.
  let fieldCenterX = 0;
  let fieldCenterZ = 0;
  let fieldRadius = 0;

  return {
    get activeLaneCount() {
      return activeLaneCount;
    },
    texture,
    fieldBounds() {
      return { centerX: fieldCenterX, centerZ: fieldCenterZ, radius: fieldRadius };
    },
    clear() {
      lanes.clear();
      dirty = true;
    },
    dispose() {
      texture.dispose();
    },
    remove(id) {
      if (lanes.delete(id)) dirty = true;
    },
    set(lane) {
      const existing = lanes.get(lane.id);
      lanes.set(lane.id, lane);
      if (
        !existing
        || existing.worldX !== lane.worldX
        || existing.worldZ !== lane.worldZ
        || existing.intensity !== lane.intensity
        || existing.color !== lane.color
        || existing.kind !== lane.kind
        || existing.route?.x !== lane.route?.x
        || existing.route?.z !== lane.route?.z
      ) {
        dirty = true;
      }
    },
    sync(tier, intensityScale = 1) {
      const cap = Math.min(LANE_CAP_FOR_TIER[tier], MAX_GARDEN_LIGHT_LANES);
      if (!dirty && cap === lastCap && intensityScale === lastScale) return activeLaneCount;

      const active = selectActiveLanes([...lanes.values()], tier, cap);
      data.fill(0);
      for (const [index, lane] of active.entries()) {
        const header = index * 4;
        data[header] = lane.worldX;
        data[header + 1] = lane.worldZ;
        data[header + 2] = lane.intensity * intensityScale;
        data[header + 3] = laneKindCode(lane.kind);
        scratchColor.set(lane.color);
        const body = (MAX_GARDEN_LIGHT_LANES + index) * 4;
        data[body] = scratchColor.r;
        data[body + 1] = scratchColor.g;
        data[body + 2] = scratchColor.b;
        data[body + 3] = 1;
        if (lane.kind === "route" && lane.route) {
          // Pulse speed/phase are seeded from the lane id: per-route
          // variation, deterministic across sessions, zero caller burden.
          const routeRow = (MAX_GARDEN_LIGHT_LANES * 2 + index) * 4;
          data[routeRow] = lane.route.x;
          data[routeRow + 1] = lane.route.z;
          data[routeRow + 2] = 0.05 + stableUnit(`${lane.id}.pulse-speed`) * 0.09;
          data[routeRow + 3] = stableUnit(`${lane.id}.pulse-phase`);
        }
      }
      texture.needsUpdate = true;
      activeLaneCount = active.length;
      dirty = false;
      lastCap = cap;
      lastScale = intensityScale;
      // Centroid + max reach so the water can skip the lane loop wholesale for
      // fragments that no active lane can touch (the shader hard-culls at 30
      // world units, so this bound is output-identical). Route lanes pull the
      // bound out to their far endpoint as well.
      if (active.length > 0) {
        let sumX = 0;
        let sumZ = 0;
        for (const lane of active) {
          sumX += lane.worldX;
          sumZ += lane.worldZ;
        }
        fieldCenterX = sumX / active.length;
        fieldCenterZ = sumZ / active.length;
        let reach = 0;
        for (const lane of active) {
          reach = Math.max(
            reach,
            Math.hypot(lane.worldX - fieldCenterX, lane.worldZ - fieldCenterZ),
            lane.route
              ? Math.hypot(lane.route.x - fieldCenterX, lane.route.z - fieldCenterZ)
              : 0,
          );
        }
        fieldRadius = reach + 30;
      } else {
        fieldRadius = 0;
      }
      return activeLaneCount;
    },
  };
}

function selectActiveLanes(
  lanes: readonly GardenLightLane[],
  tier: PharosVilleRenderSchedulerState["tier"],
  cap: number,
): GardenLightLane[] {
  const ranked = lanes.toSorted((left, right) => lanePriority(right) - lanePriority(left));
  const beacons = ranked.filter((lane) => lane.kind === "beacon").slice(0, cap);
  const routeCapacity = Math.min(ROUTE_RESERVE_FOR_TIER[tier], cap - beacons.length);
  const routes = ranked
    .filter((lane) => lane.kind === "route")
    .slice(0, routeCapacity);
  const reservedIds = new Set([...beacons, ...routes].map((lane) => lane.id));
  const remaining = ranked
    .filter((lane) => !reservedIds.has(lane.id))
    .slice(0, cap - beacons.length - routes.length);
  return [...beacons, ...routes, ...remaining];
}

function laneKindCode(kind: GardenLightLaneKind): number {
  if (kind === "route") return 3;
  if (kind === "beacon") return 2;
  if (kind === "buoy") return 1;
  return 0;
}

function lanePriority(lane: GardenLightLane): number {
  return lane.kind === "beacon"
    ? Number.MAX_SAFE_INTEGER
    : lane.intensity;
}

/** Deterministic 0..1 hash — the pulse schedule's per-route seed. */
function stableUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}
