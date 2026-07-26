import { Group } from "three";
import type { PharosVilleRenderSchedulerTier } from "../renderer/render-types";
import type { DayCyclePhase } from "./garden-day-cycle";

/**
 * The old borrowed-scenery layer drew three vertical triangle fans just beyond
 * the authored map. Legal camera framings exposed them against the water, where
 * they read as corrupt geometry rather than a distant horizon. The sky dome,
 * fog, and open-ocean shader already provide continuous depth, so the clean
 * horizon is deliberately geometry-free.
 *
 * Keep this small lifecycle object instead of special-casing it in the scene
 * owner: it preserves the one-owner create/update/dispose contract while making
 * a future accidental reintroduction measurable (`silhouetteCount === 0`).
 */
export interface GardenHorizonFrame {
  targetX: number;
  targetZ: number;
  tier: PharosVilleRenderSchedulerTier;
}

export interface GardenHorizon {
  drawCallCount: number;
  root: Group;
  silhouetteCount: number;
  triangleCount: number;
  dispose: () => void;
  update: (phase: DayCyclePhase, frame: GardenHorizonFrame) => void;
}

export function createGardenHorizon(): GardenHorizon {
  const root = new Group();
  root.name = "garden-horizon";
  root.visible = false;

  return {
    drawCallCount: 0,
    root,
    silhouetteCount: 0,
    triangleCount: 0,
    dispose() {
      root.clear();
    },
    update(_phase, frame) {
      root.position.set(frame.targetX, 0, frame.targetZ);
      root.visible = false;
    },
  };
}
