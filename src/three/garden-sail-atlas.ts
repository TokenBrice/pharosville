import { CanvasTexture, ClampToEdgeWrapping, SRGBColorSpace } from "three";
import type { ThreeLogoAssets } from "../renderer/world-renderer-backend";
import type { ShipNode } from "../systems/world-types";
import {
  FLEET_SAIL_ATLAS_CELLS,
  FLEET_SAIL_ATLAS_COLUMNS,
  FLEET_SAIL_ATLAS_CELL_PX,
  FLEET_SAIL_ATLAS_SIZE_PX,
} from "./garden-fleet-batch";
import { createGardenSailCanvas } from "./garden-sail-texture";

/**
 * W1 / decision D3: one 2048² atlas carries every batched ship's identity
 * sail, replacing the previous one-`CanvasTexture`-per-ship pipeline.
 *
 * Cell 0 is the shared plain-canvas cell that every non-identity sail samples
 * (see `aAtlasSail` in `garden-fleet-batch.ts`), so 255 logo slots remain —
 * comfortably above the ~205-ship world.
 *
 * Ships past the slot limit fall back to cell 0 and keep their livery through
 * `instanceColor` plus the pennant accent, satisfying the "stable livery and
 * readable logo or symbol fallback" invariant without a blank sail.
 */
export interface GardenSailAtlas {
  /** detailId → atlas cell index. Cell 0 means "plain canvas". */
  cellByShipId: Map<string, number>;
  dispose: () => void;
  /** Logo generation key this atlas was painted for; null until first paint. */
  logoGenerationKey: string | null;
  texture: CanvasTexture | null;
}

const PLAIN_CANVAS_FILL = "#efe7d4";

export function createGardenSailAtlas(): GardenSailAtlas {
  if (typeof document === "undefined") {
    return {
      cellByShipId: new Map(),
      dispose: () => {},
      logoGenerationKey: null,
      texture: null,
    };
  }
  const canvas = document.createElement("canvas");
  canvas.width = FLEET_SAIL_ATLAS_SIZE_PX;
  canvas.height = FLEET_SAIL_ATLAS_SIZE_PX;
  const context = canvas.getContext("2d");
  if (!context) {
    return {
      cellByShipId: new Map(),
      dispose: () => {},
      logoGenerationKey: null,
      texture: null,
    };
  }
  // Cell 0: the plain canvas every non-identity sail samples.
  context.fillStyle = PLAIN_CANVAS_FILL;
  context.fillRect(0, 0, FLEET_SAIL_ATLAS_CELL_PX, FLEET_SAIL_ATLAS_CELL_PX);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;

  return {
    cellByShipId: new Map(),
    dispose: () => texture.dispose(),
    logoGenerationKey: null,
    texture,
  };
}

export function gardenSailAtlasCellOrigin(cell: number): { x: number; y: number } {
  return {
    x: (cell % FLEET_SAIL_ATLAS_COLUMNS) * FLEET_SAIL_ATLAS_CELL_PX,
    y: Math.floor(cell / FLEET_SAIL_ATLAS_COLUMNS) * FLEET_SAIL_ATLAS_CELL_PX,
  };
}

/**
 * Repaints the atlas for the current fleet. Cheap no-op when neither the ship
 * set nor the logo generation has changed, so this is safe to call per frame.
 *
 * Assignment is by stable ship order, so a given ship keeps its cell for the
 * life of a world; only a world replace or a logo generation bump repaints.
 */
export function syncGardenSailAtlas(
  atlas: GardenSailAtlas,
  ships: readonly ShipNode[],
  logos: ThreeLogoAssets,
): boolean {
  const generation = logos.getLogoGenerationKey();
  const unchanged = atlas.logoGenerationKey === generation
    && atlas.cellByShipId.size === Math.min(ships.length, FLEET_SAIL_ATLAS_CELLS - 1);
  if (unchanged) return false;
  if (!atlas.texture) return false;

  const canvas = atlas.texture.image as HTMLCanvasElement;
  const context = canvas.getContext("2d");
  if (!context) return false;

  atlas.logoGenerationKey = generation;
  atlas.cellByShipId.clear();

  let cell = 1;
  for (const ship of ships) {
    if (cell >= FLEET_SAIL_ATLAS_CELLS) break;
    const sailCanvas = createGardenSailCanvas(ship, logos.getLogo(ship.logoSrc));
    if (!sailCanvas) continue;
    const origin = gardenSailAtlasCellOrigin(cell);
    context.clearRect(
      origin.x,
      origin.y,
      FLEET_SAIL_ATLAS_CELL_PX,
      FLEET_SAIL_ATLAS_CELL_PX,
    );
    context.drawImage(sailCanvas, origin.x, origin.y);
    atlas.cellByShipId.set(ship.detailId, cell);
    cell += 1;
  }

  atlas.texture.needsUpdate = true;
  return true;
}

/** Cell for a ship, or 0 (plain canvas) when it did not fit the atlas. */
export function gardenSailAtlasCell(atlas: GardenSailAtlas, ship: ShipNode): number {
  return atlas.cellByShipId.get(ship.detailId) ?? 0;
}
