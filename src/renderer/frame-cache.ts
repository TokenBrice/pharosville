import type { LoadedPharosVilleAsset } from "./asset-manager";
import { entityAssetId, resolveEntityGeometry, type ResolvedEntityGeometry, type WorldSelectableEntity } from "./geometry";
import type { DrawPharosVilleInput } from "./render-types";

export interface RenderFrameCache {
  assetForEntity(entity: WorldSelectableEntity): LoadedPharosVilleAsset | null;
  geometryForEntity(entity: WorldSelectableEntity): ResolvedEntityGeometry;
}

// Entities are referentially stable across frames thanks to the structural
// world cache (`completeWorldRef` in use-pharosville-world-data.ts), so we can
// key per-frame lookups directly off the entity reference. This avoids both
// the per-frame `Map` allocation and the `${kind}:${id}` string churn that the
// previous string-keyed cache produced (~150 string allocs/frame at typical
// load).
export function createRenderFrameCache(input: DrawPharosVilleInput): RenderFrameCache {
  const assetsByEntity = new WeakMap<WorldSelectableEntity, LoadedPharosVilleAsset | null>();
  const geometryByEntity = new WeakMap<WorldSelectableEntity, ResolvedEntityGeometry>();

  const assetForEntity = (entity: WorldSelectableEntity) => {
    if (assetsByEntity.has(entity)) return assetsByEntity.get(entity) ?? null;
    const asset = resolveEntityAsset(input, entity);
    assetsByEntity.set(entity, asset);
    return asset;
  };

  const geometryForEntity = (entity: WorldSelectableEntity) => {
    const cached = geometryByEntity.get(entity);
    if (cached) return cached;
    const geometry = resolveEntityGeometry({
      asset: assetForEntity(entity),
      camera: input.camera,
      entity,
      mapWidth: input.world.map.width,
      shipMotionSamples: input.shipMotionSamples,
    });
    geometryByEntity.set(entity, geometry);
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
