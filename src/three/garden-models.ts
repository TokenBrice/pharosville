import type { Group, Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type GardenModelId =
  | "garden-lighthouse-shell"
  | "garden-hero-titan"
  | "garden-hero-heritage";
export type GardenModelAnchorId =
  | "beacon"
  | "beam"
  | "label"
  | "selection"
  | "lantern-bow"
  | "lantern-stern"
  | "masthead";
export type Vector3Tuple = readonly [x: number, y: number, z: number];

export interface GardenModelMetadata {
  readonly id: GardenModelId;
  readonly label: string;
  readonly artifact: {
    readonly bytes: number;
    readonly compression: "none";
    readonly gltfVersion: 2;
    readonly sha256: string;
    readonly url: string;
  };
  readonly dimensions: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly scale: {
    readonly modelUnitsPerWorldUnit: 1;
    readonly runtime: Vector3Tuple;
  };
  readonly origin: {
    readonly convention: "base-center";
    readonly forwardAxis: "+Z";
    readonly position: Vector3Tuple;
    readonly upAxis: "+Y";
  };
  readonly anchors: Readonly<Partial<Record<GardenModelAnchorId, {
    readonly node: string;
    readonly position: Vector3Tuple;
  }>>>;
  readonly lod: {
    readonly strategy: "single";
    readonly levels: readonly [{
      readonly maxDistance: null;
      readonly minDistance: 0;
      readonly name: "full";
      readonly url: string;
    }];
  };
  readonly pickProxy: {
    readonly center: Vector3Tuple;
    readonly height: number;
    readonly radius: number;
    readonly shape: "cylinder";
  };
  readonly geometry: {
    readonly drawCalls: number;
    readonly materials: number;
    readonly textures: number;
    readonly triangles: number;
    readonly vertices: number;
  };
  readonly budgets: {
    readonly maxBytes: number;
    readonly maxDrawCalls: number;
    readonly maxMaterials: number;
    readonly maxTextures: number;
    readonly maxTriangles: number;
    readonly maxVertices: number;
  };
  readonly provenance: {
    readonly createdBy: "agent-authored";
    readonly generator: string;
    readonly method: "deterministic-procedural";
    readonly sourceAsset: null;
  };
  readonly license: {
    readonly notice: string;
    readonly spdx: "MIT";
  };
}

const LIGHTHOUSE_SHA256 = "2d8b304f113140f7f968725cfd0efb29aa12412875389866fd6c2dd31703eeb1";
const lighthouseUrl = `/pharosville/models/garden-lighthouse-shell.glb?v=${LIGHTHOUSE_SHA256.slice(0, 12)}`;

const HERO_TITAN_SHA256 = "8b96930629a65d28c3fdf314879feb21eb27d5d954b25efb948fbd294490431c";
const heroTitanUrl = `/pharosville/models/garden-hero-titan.glb?v=${HERO_TITAN_SHA256.slice(0, 12)}`;
const HERO_HERITAGE_SHA256 = "19c80bc75bf312acf67b7517646c3ade6b6570941df6f65abcf6890067a8625d";
const heroHeritageUrl = `/pharosville/models/garden-hero-heritage.glb?v=${HERO_HERITAGE_SHA256.slice(0, 12)}`;

// The two hero hulls share every field except identity, geometry, and budgets;
// this factory keeps the constant boilerplate (origin/scale/lod/provenance/
// license) authored once.
function heroModelMetadata(config: {
  id: "garden-hero-titan" | "garden-hero-heritage";
  label: string;
  sha256: string;
  url: string;
  bytes: number;
  dimensions: GardenModelMetadata["dimensions"];
  anchors: GardenModelMetadata["anchors"];
  pickCenter: Vector3Tuple;
  pickHeight: number;
  pickRadius: number;
  geometry: GardenModelMetadata["geometry"];
  budgets: GardenModelMetadata["budgets"];
}): GardenModelMetadata {
  return {
    id: config.id,
    label: config.label,
    artifact: {
      bytes: config.bytes,
      compression: "none",
      gltfVersion: 2,
      sha256: config.sha256,
      url: config.url,
    },
    dimensions: config.dimensions,
    scale: { modelUnitsPerWorldUnit: 1, runtime: [1, 1, 1] },
    origin: {
      convention: "base-center",
      forwardAxis: "+Z",
      position: [0, 0, 0],
      upAxis: "+Y",
    },
    anchors: config.anchors,
    lod: {
      strategy: "single",
      levels: [{ maxDistance: null, minDistance: 0, name: "full", url: config.url }],
    },
    pickProxy: {
      center: config.pickCenter,
      height: config.pickHeight,
      radius: config.pickRadius,
      shape: "cylinder",
    },
    geometry: config.geometry,
    budgets: config.budgets,
    provenance: {
      createdBy: "agent-authored",
      generator: "scripts/pharosville/generate-garden-heroes.mjs",
      method: "deterministic-procedural",
      sourceAsset: null,
    },
    license: { notice: "Copyright (c) 2026 TokenBrice", spdx: "MIT" },
  };
}

export const GARDEN_MODEL_MANIFEST = {
  "garden-lighthouse-shell": {
    id: "garden-lighthouse-shell",
    label: "Garden Observatory lighthouse shell",
    artifact: {
      bytes: 156_816,
      compression: "none",
      gltfVersion: 2,
      sha256: LIGHTHOUSE_SHA256,
      url: lighthouseUrl,
    },
    dimensions: {
      x: 9.649,
      y: 34,
      z: 9.469,
    },
    scale: {
      modelUnitsPerWorldUnit: 1,
      runtime: [1, 1, 1],
    },
    origin: {
      convention: "base-center",
      forwardAxis: "+Z",
      position: [0, 0, 0],
      upAxis: "+Y",
    },
    anchors: {
      beacon: {
        node: "anchor-beacon",
        position: [0, 30.1, 0],
      },
      beam: {
        node: "anchor-beam",
        position: [0, 30.1, 0],
      },
      label: {
        node: "anchor-label",
        position: [0, 34.9, 0],
      },
      selection: {
        node: "anchor-selection",
        position: [0, 17, 0],
      },
    },
    lod: {
      strategy: "single",
      levels: [{
        maxDistance: null,
        minDistance: 0,
        name: "full",
        url: lighthouseUrl,
      }],
    },
    pickProxy: {
      center: [0, 17, 0],
      height: 34,
      radius: 5,
      shape: "cylinder",
    },
    geometry: {
      drawCalls: 6,
      materials: 6,
      textures: 0,
      triangles: 2_420,
      vertices: 3_447,
    },
    budgets: {
      // Pharos Wonder raise (2026-07-24, measured cause, decision D1): GLB v4
      // rebuilds the tower as the three-tier Pharos (battered square tier →
      // octagonal drum → cylindrical drum → open brazier → Zeus Soter statue,
      // 34 units). 2,744 → 2,420 tris and 7 → 6 draws measured from the
      // regenerated artifact (the glazed lantern room, balcony, and spire are
      // replaced by the statue/triton/brazier crown). Bytes: 151,356 →
      // 156,816 measured. Anchors: beacon/beam 22.85 → 30.1 (brazier centre).
      maxBytes: 192 * 1024,
      maxDrawCalls: 8,
      maxMaterials: 8,
      maxTextures: 0,
      maxTriangles: 4_000,
      maxVertices: 4_000,
    },
    provenance: {
      createdBy: "agent-authored",
      generator: "scripts/pharosville/generate-garden-lighthouse.mjs",
      method: "deterministic-procedural",
      sourceAsset: null,
    },
    license: {
      notice: "Copyright (c) 2026 TokenBrice",
      spdx: "MIT",
    },
  },
  "garden-hero-titan": heroModelMetadata({
    id: "garden-hero-titan",
    label: "Garden titan hero hull",
    sha256: HERO_TITAN_SHA256,
    url: heroTitanUrl,
    bytes: 95_868,
    dimensions: { x: 13.38, y: 9.084, z: 4.493 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-4.15, 6.15, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [5.5, 2.5, 0] },
      masthead: { node: "anchor-masthead", position: [1.3, 7.5, 0] },
      label: { node: "anchor-label", position: [0, 9.2, 0] },
      selection: { node: "anchor-selection", position: [0, 2.6, 0] },
    },
    pickCenter: [0, 3.4, 0],
    pickHeight: 9.2,
    pickRadius: 6.8,
    geometry: { drawCalls: 4, materials: 4, textures: 0, triangles: 2_190, vertices: 2_446 },
    budgets: {
      maxBytes: 100 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 3_500,
      maxVertices: 3_000,
    },
  }),
  "garden-hero-heritage": heroModelMetadata({
    id: "garden-hero-heritage",
    label: "Garden heritage hero hull",
    sha256: HERO_HERITAGE_SHA256,
    url: heroHeritageUrl,
    bytes: 65_380,
    dimensions: { x: 12.031, y: 7.65, z: 3.295 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.5, 2.75, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.4, 1.85, 0] },
      masthead: { node: "anchor-masthead", position: [0.8, 6.25, 0] },
      label: { node: "anchor-label", position: [0, 7.3, 0] },
      selection: { node: "anchor-selection", position: [0, 1.9, 0] },
    },
    pickCenter: [0, 2.6, 0],
    pickHeight: 7.7,
    pickRadius: 6.1,
    geometry: { drawCalls: 4, materials: 4, textures: 0, triangles: 1_538, vertices: 1_574 },
    budgets: {
      maxBytes: 80 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 2_500,
      maxVertices: 2_200,
    },
  }),
} as const satisfies Readonly<Record<GardenModelId, GardenModelMetadata>>;

export interface GardenModelSourceLoader {
  loadAsync(url: string): Promise<{ scene: Group }>;
}

export interface GardenModelLibrary {
  clear(): void;
  clone(id: GardenModelId): Promise<Group>;
  load(id: GardenModelId): Promise<Group>;
}

/**
 * Creates a small per-renderer model cache. Clones share static geometry and
 * materials; the renderer remains responsible for disposing them at teardown.
 */
export function createGardenModelLibrary(
  sourceLoader: GardenModelSourceLoader = new GLTFLoader(),
): GardenModelLibrary {
  const cache = new Map<GardenModelId, Promise<Group>>();

  const load = (id: GardenModelId): Promise<Group> => {
    const cached = cache.get(id);
    if (cached !== undefined) return cached;

    const metadata = GARDEN_MODEL_MANIFEST[id];
    assertGardenModelMetadata(metadata);
    const pending = sourceLoader.loadAsync(metadata.artifact.url)
      .then(({ scene }) => {
        assertGardenModelAnchors(scene, metadata);
        return scene;
      })
      .catch((error: unknown) => {
        cache.delete(id);
        throw error;
      });
    cache.set(id, pending);
    return pending;
  };

  return {
    clear() {
      cache.clear();
    },
    async clone(id) {
      return (await load(id)).clone(true);
    },
    load,
  };
}

export function gardenModelAnchor(
  root: Object3D,
  id: GardenModelId,
  anchorId: GardenModelAnchorId,
): Object3D {
  const anchors = GARDEN_MODEL_MANIFEST[id].anchors as Partial<
    Record<GardenModelAnchorId, { node: string; position: Vector3Tuple }>
  >;
  const anchorMeta = anchors[anchorId];
  if (anchorMeta === undefined) {
    throw new Error(`Model ${id} has no anchor ${anchorId}.`);
  }
  const anchor = root.getObjectByName(anchorMeta.node);
  if (anchor === undefined) {
    throw new Error(`Model ${id} is missing anchor ${anchorMeta.node}.`);
  }
  return anchor;
}

export function validateGardenModelMetadata(
  metadata: GardenModelMetadata,
): string[] {
  const errors: string[] = [];
  const actuals = metadata.geometry;
  const budgets = metadata.budgets;

  const artifactPath = metadata.artifact.url.split("?")[0] ?? "";
  if (!artifactPath.startsWith("/") || !artifactPath.endsWith(".glb")) {
    errors.push("artifact.url must be a same-origin .glb path");
  }
  if (!/^[a-f0-9]{64}$/.test(metadata.artifact.sha256)) {
    errors.push("artifact.sha256 must be a lowercase SHA-256 digest");
  }
  if (metadata.artifact.bytes <= 0 || metadata.artifact.bytes > budgets.maxBytes) {
    errors.push("artifact.bytes exceeds its positive byte budget");
  }
  if (
    metadata.dimensions.x <= 0
    || metadata.dimensions.y <= 0
    || metadata.dimensions.z <= 0
  ) {
    errors.push("dimensions must be positive");
  }
  if (
    metadata.origin.position.some((value) => value !== 0)
    || metadata.scale.runtime.some((value) => value !== 1)
  ) {
    errors.push("model must use an unscaled base-center origin");
  }
  if (metadata.lod.levels[0].url !== metadata.artifact.url) {
    errors.push("single LOD path must match artifact.url");
  }
  if (actuals.drawCalls > budgets.maxDrawCalls) errors.push("draw-call budget exceeded");
  if (actuals.materials > budgets.maxMaterials) errors.push("material budget exceeded");
  if (actuals.textures > budgets.maxTextures) errors.push("texture budget exceeded");
  if (actuals.triangles > budgets.maxTriangles) errors.push("triangle budget exceeded");
  if (actuals.vertices > budgets.maxVertices) errors.push("vertex budget exceeded");

  const anchorNodes = Object.values(metadata.anchors).map(({ node }) => node);
  if (new Set(anchorNodes).size !== anchorNodes.length) {
    errors.push("anchor node names must be unique");
  }
  if (
    metadata.pickProxy.height < metadata.dimensions.y
    || metadata.pickProxy.radius * 2 < Math.max(
      metadata.dimensions.x,
      metadata.dimensions.z,
    )
  ) {
    errors.push("pick proxy must contain the model dimensions");
  }
  return errors;
}

function assertGardenModelMetadata(metadata: GardenModelMetadata): void {
  const errors = validateGardenModelMetadata(metadata);
  if (errors.length > 0) {
    throw new Error(`Invalid garden model metadata: ${errors.join("; ")}`);
  }
}

function assertGardenModelAnchors(
  root: Object3D,
  metadata: GardenModelMetadata,
): void {
  for (const { node } of Object.values(metadata.anchors)) {
    if (root.getObjectByName(node) === undefined) {
      throw new Error(`Model ${metadata.id} is missing anchor ${node}.`);
    }
  }
}
