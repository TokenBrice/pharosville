import { estimateRenderTargetExtraBytes, estimateTextureBytes } from "./texture-byte-estimate";
import { Texture, type Mesh, type Object3D, type Scene, type ShaderMaterial, type RenderTarget, type WebGLRenderer } from "three";
import type { TextureOwnerCensus, TextureOwnerManifestEntry, TextureStorageEstimate } from "../renderer/render-types";

export function emptyTextureStorageEstimate(): TextureStorageEstimate {
  return { textureBytes: 0, liveTextureBytes: 0, renderbufferBytes: 0, liveRenderbufferBytes: 0,
    unknownTextureCount: 0, unknownLiveTextureCount: 0, unknownRenderTargetCount: 0 };
}

function textureOwnerName(object: Object3D, root: Object3D): string {
  let current: Object3D | null = object;
  while (current && current !== root) {
    if (current.name) return current.name;
    current = current.parent;
  }
  return object.type;
}

export function textureOwnerCensus(
  root: Scene,
  rendererTextures: number,
  manifest: readonly TextureOwnerManifestEntry[] = [],
  renderer?: WebGLRenderer,
): TextureOwnerCensus {
  const ownerByTexture = new Map<Texture, string>();
  const sceneTextures = new Set<Texture>();
  // Explicit owners take precedence over the nearest mesh name. Water's
  // material samples the wake/lane/environment textures, but those resources
  // belong to their scene-scope systems; the post chain is not in the scene at
  // all. Seeding the map also makes the census useful for renderer allocations
  // that have no object/material edge to follow.
  for (const entry of manifest) {
    if (!ownerByTexture.has(entry.texture)) ownerByTexture.set(entry.texture, entry.owner);
  }
  root.traverse((object) => {
    if (!(object as Mesh).isMesh) return;
    const owner = textureOwnerName(object, root);
    const { material } = object as Mesh;
    const materials = Array.isArray(material) ? material : [material];
    for (const entry of materials) {
      for (const value of Object.values(entry)) {
        if (value instanceof Texture) {
          sceneTextures.add(value);
          if (!ownerByTexture.has(value)) ownerByTexture.set(value, owner);
        }
      }
      const uniforms = (entry as ShaderMaterial).uniforms;
      if (!uniforms) continue;
      for (const uniform of Object.values(uniforms)) {
        if (uniform.value instanceof Texture) {
          sceneTextures.add(uniform.value);
          if (!ownerByTexture.has(uniform.value)) ownerByTexture.set(uniform.value, owner);
        }
      }
    }
  });
  if (root.environment) {
    sceneTextures.add(root.environment);
    if (!ownerByTexture.has(root.environment)) {
      ownerByTexture.set(root.environment, "environment.pmrem");
    }
  }
  // RenderTarget back-references are native in Three 0.185. Include sibling and
  // depth attachments once, without teaching every system a second manifest API.
  const targets = new Map<RenderTarget, string>();
  for (const [texture, owner] of ownerByTexture) {
    const target = texture.renderTarget;
    if (!target || targets.has(target)) continue;
    targets.set(target, owner);
    for (const attachment of [...target.textures, ...(target.depthTexture ? [target.depthTexture] : [])]) {
      if (!ownerByTexture.has(attachment)) ownerByTexture.set(attachment, owner);
    }
  }
  const properties = renderer?.properties as { get(resource: object): Record<string, unknown> } | undefined;
  const liveHandles = new Set<unknown>();
  const ownerCounts = new Map<string, {
    liveTextureCount: number;
    liveTextureNames: string[];
    textureCount: number;
    byteEstimates: TextureStorageEstimate;
  }>();
  for (const [texture, owner] of ownerByTexture) {
    const stats = ownerCounts.get(owner) ?? {
      liveTextureCount: 0,
      liveTextureNames: [],
      textureCount: 0,
      byteEstimates: emptyTextureStorageEstimate(),
    };
    stats.textureCount += 1;
    const bytes = estimateTextureBytes(texture);
    if (bytes === null) stats.byteEstimates.unknownTextureCount += 1;
    else stats.byteEstimates.textureBytes += bytes;
    const handle = properties?.get(texture).__webglTexture;
    if (handle != null && !liveHandles.has(handle)) {
      liveHandles.add(handle);
      stats.liveTextureCount += 1;
      stats.liveTextureNames.push(texture.name || texture.uuid);
      if (bytes === null) stats.byteEstimates.unknownLiveTextureCount += 1;
      else stats.byteEstimates.liveTextureBytes += bytes;
    }
    ownerCounts.set(owner, stats);
  }
  for (const [target, owner] of targets) {
    const stats = ownerCounts.get(owner)!;
    const runtime = properties?.get(target);
    const live = runtime?.__webglFramebuffer != null;
    // The extension's implicit multisample allocation is implementation-defined.
    const implicitMultisampling = live && target.samples > 0 && !runtime?.__webglMultisampledFramebuffer;
    const bytes = implicitMultisampling ? null : estimateRenderTargetExtraBytes(target, renderer?.capabilities.maxSamples);
    if (bytes === null) stats.byteEstimates.unknownRenderTargetCount += 1;
    else {
      stats.byteEstimates.renderbufferBytes += bytes;
      if (live) stats.byteEstimates.liveRenderbufferBytes += bytes;
    }
  }
  const byteEstimates = emptyTextureStorageEstimate();
  for (const { byteEstimates: ownerBytes } of ownerCounts.values()) {
    for (const key of Object.keys(byteEstimates) as (keyof TextureStorageEstimate)[]) byteEstimates[key] += ownerBytes[key];
  }
  return {
    byteEstimates,
    attributedLiveTextures: properties ? liveHandles.size : null,
    owners: [...ownerCounts]
      .map(([owner, stats]) => ({ owner, ...stats }))
      .sort((left, right) => (
        right.textureCount - left.textureCount
        || left.owner.localeCompare(right.owner)
      )),
    referencedTextures: sceneTextures.size,
    attributedTextures: ownerByTexture.size,
    rendererTextures,
    minimumUnattributedRendererTextures: Math.max(
      0,
      rendererTextures - (properties ? liveHandles.size : ownerByTexture.size),
    ),
  };
}
