import { Color, DataTexture, FloatType, RGBAFormat } from "three";
import type { PharosVilleRenderSchedulerState } from "../renderer/render-types";

/**
 * Shared light-lane registry: every warm light that should lay a reflection
 * lane on the sea (beacon, ship lanterns, dock lamps, buoys, memorial
 * lanterns) registers here. The water shader samples the packed DataTexture;
 * callers never talk to the shader directly. The per-tier lane cap is policy
 * owned by this module, not by callers.
 */
export type GardenLightLaneKind = "beacon" | "lantern" | "buoy";

export interface GardenLightLane {
  color: string;
  id: string;
  intensity: number;
  kind: GardenLightLaneKind;
  worldX: number;
  worldZ: number;
}

export const MAX_GARDEN_LIGHT_LANES = 48;

const LANE_CAP_FOR_TIER: Record<PharosVilleRenderSchedulerState["tier"], number> = {
  full: MAX_GARDEN_LIGHT_LANES,
  balanced: 12,
  interaction: 12,
  recovery: 6,
  constrained: 4,
};

export interface GardenLaneRegistry {
  /** Packed lanes: row 0 = (worldX, worldZ, intensity, kind), row 1 = (r, g, b, active). */
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
  const data = new Float32Array(MAX_GARDEN_LIGHT_LANES * 2 * 4);
  const texture = new DataTexture(
    data,
    MAX_GARDEN_LIGHT_LANES,
    2,
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
      ) {
        dirty = true;
      }
    },
    sync(tier, intensityScale = 1) {
      const cap = Math.min(LANE_CAP_FOR_TIER[tier], MAX_GARDEN_LIGHT_LANES);
      if (!dirty && cap === lastCap && intensityScale === lastScale) return activeLaneCount;

      const ranked = [...lanes.values()].toSorted((left, right) => (
        lanePriority(right) - lanePriority(left)
      ));
      const active = ranked.slice(0, cap);
      data.fill(0);
      for (const [index, lane] of active.entries()) {
        const header = index * 4;
        data[header] = lane.worldX;
        data[header + 1] = lane.worldZ;
        data[header + 2] = lane.intensity * intensityScale;
        data[header + 3] = lane.kind === "beacon" ? 2 : lane.kind === "buoy" ? 1 : 0;
        scratchColor.set(lane.color);
        const body = (MAX_GARDEN_LIGHT_LANES + index) * 4;
        data[body] = scratchColor.r;
        data[body + 1] = scratchColor.g;
        data[body + 2] = scratchColor.b;
        data[body + 3] = 1;
      }
      texture.needsUpdate = true;
      activeLaneCount = active.length;
      dirty = false;
      lastCap = cap;
      lastScale = intensityScale;
      // Centroid + max reach so the water can skip the lane loop wholesale for
      // fragments that no active lane can touch (the shader hard-culls at 30
      // world units, so this bound is output-identical).
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

function lanePriority(lane: GardenLightLane): number {
  return lane.kind === "beacon"
    ? Number.MAX_SAFE_INTEGER
    : lane.intensity;
}
