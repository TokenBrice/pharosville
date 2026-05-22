import { TILE_HEIGHT, TILE_WIDTH, type IsoCamera } from "../systems/projection";
import type { PharosVilleMap, PharosVilleTile, TerrainKind } from "../systems/world-types";
import {
  isScreenCoordinateInViewport,
  visibleTileBoundsForCamera,
  type VisibleTileBounds,
  type VisibleTileBoundsCacheState,
} from "./viewport";

export type VisibleTileVisitor = (
  tile: PharosVilleTile,
  terrain: TerrainKind,
  screenX: number,
  screenY: number,
  tileIndex: number,
) => void;

export function terrainKindForTile(tile: PharosVilleTile): TerrainKind {
  return tile.terrain ?? tile.kind;
}

export function visibleTileBoundsForMap(input: {
  cache?: VisibleTileBoundsCacheState;
  camera: IsoCamera;
  map: PharosVilleMap;
  tileMargin: number;
  viewportHeight: number;
  viewportWidth: number;
}): VisibleTileBounds | null {
  return visibleTileBoundsForCamera(
    {
      camera: input.camera,
      mapHeight: input.map.height,
      mapWidth: input.map.width,
      tileMargin: input.tileMargin,
      viewportHeight: input.viewportHeight,
      viewportWidth: input.viewportWidth,
    },
    input.cache,
  );
}

export function scanVisibleTiles(input: {
  bounds: VisibleTileBounds | null;
  camera: IsoCamera;
  map: PharosVilleMap;
  viewportHeight: number;
  viewportMarginX: number;
  viewportMarginY: number;
  viewportWidth: number;
  visit: VisibleTileVisitor;
}): number {
  const { bounds, camera, map, viewportHeight, viewportMarginX, viewportMarginY, viewportWidth, visit } = input;
  if (!bounds) return 0;

  const deltaX = (TILE_WIDTH / 2) * camera.zoom;
  const deltaY = (TILE_HEIGHT / 2) * camera.zoom;
  let visibleTileCount = 0;
  let rowScreenX = (bounds.minX - bounds.minY) * deltaX + camera.offsetX;
  let rowScreenY = (bounds.minX + bounds.minY) * deltaY + camera.offsetY;

  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    let screenX = rowScreenX;
    let screenY = rowScreenY;
    const rowOffset = y * map.width;
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const tileIndex = rowOffset + x;
      const tile = map.tiles[tileIndex];
      if (
        tile
        && isScreenCoordinateInViewport(screenX, screenY, viewportWidth, viewportHeight, viewportMarginX, viewportMarginY)
      ) {
        visibleTileCount += 1;
        visit(tile, terrainKindForTile(tile), screenX, screenY, tileIndex);
      }
      screenX += deltaX;
      screenY += deltaY;
    }
    rowScreenX -= deltaX;
    rowScreenY += deltaY;
  }

  return visibleTileCount;
}
