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

/**
 * Texture capacity — the packing layout the water shader is compiled against.
 * It is NOT the night's light budget; see `GARDEN_LANE_BUDGET_FOR_TIER`.
 */
export const MAX_GARDEN_LIGHT_LANES = 48;

/**
 * W3.1 (The Great Quieting) — the night's light hierarchy, enforced here
 * because this registry is where every reflection on the sea is authored.
 *
 * ONE dominant light (the beacon) and ONE secondary (the moon road, which the
 * water shader owns and this module never touches). Everything else is an
 * EMBER: present, warm, and subordinate. Three policies carry that:
 *
 *  1. `GARDEN_LANE_BUDGET_FOR_TIER` — how many pools may burn at once. The
 *     full tier used to pack the whole 48-texel texture; forty-plus pools over
 *     one harbour is a marina at festival, not a lighthouse over dark water.
 *  2. `GARDEN_LANE_EMBER_GAIN` — a global brightness step on the decorative
 *     kinds. Beacon and route lanes are exempt: the beacon IS the hierarchy's
 *     top, and route pulses carry a reading (see 3).
 *  3. `GARDEN_EMBER_LANE_MIN_SEPARATION` — pools closer than their own
 *     falloff merge into one pale disc, which is how the sea went milky. The
 *     dimmer of two crowded lanes stands down; its lamp still burns on land.
 *
 * Route pulses are DATA (the busiest harbours by held value). Their reading is
 * never dimmed and never spatially thinned — it is capped in SIMULTANEITY and
 * rotated, which is a viewing condition: every route still takes its turn.
 */
const GARDEN_LANE_BUDGET_FOR_TIER: Record<PharosVilleRenderSchedulerState["tier"], number> = {
  full: 24,
  balanced: 12,
  interaction: 12,
  recovery: 6,
  constrained: 4,
};

/**
 * Ember gain per lane kind. Multiplies the caller's day-cycle
 * `intensityScale`, so it demotes the pools without touching the lamps,
 * the lit windows, or any lane's relative ordering — a dangerous buoy still
 * out-reads a calm one, a titan still out-reads a standard hull.
 */
export const GARDEN_LANE_EMBER_GAIN: Record<GardenLightLaneKind, number> = {
  beacon: 1,
  route: 1,
  lantern: 0.55,
  buoy: 0.55,
};

/**
 * World units. The shader's pool is `exp(-distSq / 24)` — it falls to 1/e at
 * ~4.9 units — so two ember lanes inside this radius are painting one disc
 * between them. The brighter one keeps it.
 */
export const GARDEN_EMBER_LANE_MIN_SEPARATION = 6;

/** How many route pulses may run at once. Registered routes above this rotate. */
const ROUTE_RESERVE_FOR_TIER: Record<PharosVilleRenderSchedulerState["tier"], number> = {
  full: 4,
  balanced: 3,
  interaction: 3,
  recovery: 2,
  constrained: 1,
};

/**
 * Rotation period for the route-pulse cap, in seconds. Long enough that a
 * viewer reads a still harbour rather than a shuffling one; a full turn of
 * every registered route is a matter of minutes, at garden tempo.
 */
export const GARDEN_ROUTE_PULSE_ROTATION_SECONDS = 90;

/**
 * Clock for the route-pulse rotation. Absent (or reduced motion), the
 * selection holds at window 0 — a complete, deterministic, static composition,
 * identical on every reload.
 */
export interface GardenLaneClock {
  reducedMotion?: boolean;
  timeSeconds: number;
}

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
   * Re-pack the texture for the tier's lane budget. Returns the active count.
   * `intensityScale` is the day-cycle gate: reflection pools are lantern
   * light, so the caller scales them down by day (near zero) and up at dusk/
   * night; without it the overlapping full-tier pools cross the bloom knee
   * and flood the frame. `clock` drives the route-pulse rotation only, and is
   * a pure input — the same clock always packs the same texture.
   */
  sync(
    tier: PharosVilleRenderSchedulerState["tier"],
    intensityScale?: number,
    clock?: GardenLaneClock,
  ): number;
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
  let lastRotation = -1;
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
    sync(tier, intensityScale = 1, clock) {
      const cap = Math.min(GARDEN_LANE_BUDGET_FOR_TIER[tier], MAX_GARDEN_LIGHT_LANES);
      const rotation = routeRotationWindow(clock);
      if (
        !dirty
        && cap === lastCap
        && intensityScale === lastScale
        && rotation === lastRotation
      ) {
        return activeLaneCount;
      }

      const active = selectActiveLanes([...lanes.values()], tier, cap, rotation);
      data.fill(0);
      for (const [index, lane] of active.entries()) {
        const header = index * 4;
        data[header] = lane.worldX;
        data[header + 1] = lane.worldZ;
        data[header + 2] = lane.intensity * intensityScale * GARDEN_LANE_EMBER_GAIN[lane.kind];
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
      lastRotation = rotation;
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
  rotation: number,
): GardenLightLane[] {
  const ranked = lanes.toSorted((left, right) => (
    lanePriority(right) - lanePriority(left)
    || left.id.localeCompare(right.id)
  ));
  const beacons = ranked.filter((lane) => lane.kind === "beacon").slice(0, cap);
  const routeCapacity = Math.max(
    0,
    Math.min(ROUTE_RESERVE_FOR_TIER[tier], cap - beacons.length),
  );
  const routes = rotateRoutePulses(
    ranked.filter((lane) => lane.kind === "route"),
    routeCapacity,
    rotation,
  );
  const reservedIds = new Set([...beacons, ...routes].map((lane) => lane.id));
  const emberBudget = cap - beacons.length - routes.length;
  const embers: GardenLightLane[] = [];
  // Ember lanes are admitted brightest-first, and only where they are not
  // already inside another ember's pool: a crowd of pools reads as one pale
  // disc, so the crowd is what gets thinned, never the light's brightness.
  for (const lane of ranked) {
    if (embers.length >= emberBudget) break;
    if (reservedIds.has(lane.id)) continue;
    // A route that lost this rotation stays dark until its turn: filling the
    // ember budget with it would hand back the simultaneity the cap took.
    if (lane.kind === "route" || lane.kind === "beacon") continue;
    if (embers.some((kept) => (
      (kept.worldX - lane.worldX) ** 2 + (kept.worldZ - lane.worldZ) ** 2
        < GARDEN_EMBER_LANE_MIN_SEPARATION ** 2
    ))) {
      continue;
    }
    embers.push(lane);
  }
  return [...beacons, ...routes, ...embers];
}

/**
 * The route-pulse cap as a viewing condition: at most `capacity` of the
 * registered routes pulse at once, and which ones rotates on the clock so no
 * route is permanently unlit. A pure function of (routes, capacity, window) —
 * the same three always return the same lanes, in the same order.
 */
function rotateRoutePulses(
  routes: readonly GardenLightLane[],
  capacity: number,
  rotation: number,
): GardenLightLane[] {
  if (capacity <= 0) return [];
  if (routes.length <= capacity) return [...routes];
  const offset = ((rotation % routes.length) + routes.length) % routes.length;
  return Array.from(
    { length: capacity },
    (_, index) => routes[(offset + index) % routes.length]!,
  );
}

/** Which rotation window the clock is in; 0 whenever there is no motion. */
function routeRotationWindow(clock: GardenLaneClock | undefined): number {
  if (!clock || clock.reducedMotion || !Number.isFinite(clock.timeSeconds)) return 0;
  return Math.floor(clock.timeSeconds / GARDEN_ROUTE_PULSE_ROTATION_SECONDS);
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
