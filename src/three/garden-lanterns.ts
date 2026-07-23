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
  clear(): void;
  dispose(): void;
  remove(id: string): void;
  set(lane: GardenLightLane): void;
  /** Re-pack the texture for the tier's lane cap. Returns the active count. */
  sync(tier: PharosVilleRenderSchedulerState["tier"]): number;
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

  return {
    get activeLaneCount() {
      return activeLaneCount;
    },
    texture,
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
    sync(tier) {
      const cap = Math.min(LANE_CAP_FOR_TIER[tier], MAX_GARDEN_LIGHT_LANES);
      if (!dirty && cap === lastCap) return activeLaneCount;

      const ranked = [...lanes.values()].toSorted((left, right) => (
        lanePriority(right) - lanePriority(left)
      ));
      const active = ranked.slice(0, cap);
      data.fill(0);
      for (const [index, lane] of active.entries()) {
        const header = index * 4;
        data[header] = lane.worldX;
        data[header + 1] = lane.worldZ;
        data[header + 2] = lane.intensity;
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
      return activeLaneCount;
    },
  };
}

function lanePriority(lane: GardenLightLane): number {
  return lane.kind === "beacon"
    ? Number.MAX_SAFE_INTEGER
    : lane.intensity;
}
