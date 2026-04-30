import type { LoadedPharosVilleAsset } from "./asset-manager";
import { entityAssetId, resolveEntityGeometry, type ResolvedEntityGeometry, type WorldSelectableEntity } from "./geometry";
import type { DrawPharosVilleInput } from "./render-types";

export interface RenderFrameCache {
  assetForEntity(entity: WorldSelectableEntity): LoadedPharosVilleAsset | null;
  geometryForEntity(entity: WorldSelectableEntity): ResolvedEntityGeometry;
}

export function createRenderFrameCache(input: DrawPharosVilleInput): RenderFrameCache {
  const assetsByEntity = new Map<string, LoadedPharosVilleAsset | null>();
  const geometryByEntity = new Map<string, ResolvedEntityGeometry>();

  const assetForEntity = (entity: WorldSelectableEntity) => {
    const key = entityFrameKey(entity);
    if (assetsByEntity.has(key)) return assetsByEntity.get(key) ?? null;
    const asset = resolveEntityAsset(input, entity);
    assetsByEntity.set(key, asset);
    return asset;
  };

  const geometryForEntity = (entity: WorldSelectableEntity) => {
    const key = entityFrameKey(entity);
    const cached = geometryByEntity.get(key);
    if (cached) return cached;
    const geometry = resolveEntityGeometry({
      asset: assetForEntity(entity),
      camera: input.camera,
      entity,
      mapWidth: input.world.map.width,
      shipMotionSamples: input.shipMotionSamples,
    });
    geometryByEntity.set(key, geometry);
    return geometry;
  };

  return {
    assetForEntity,
    geometryForEntity,
  };
}

function resolveEntityAsset(input: DrawPharosVilleInput, entity: WorldSelectableEntity) {
  if (entity.kind === "dock") {
    return input.assets?.get(entity.assetId) ?? input.assets?.get("dock.wooden-pier") ?? null;
  }
  const assetId = entityAssetId(entity);
  return assetId ? input.assets?.get(assetId) ?? null : null;
}

function entityFrameKey(entity: WorldSelectableEntity) {
  return `${entity.kind}:${entity.id}`;
}
