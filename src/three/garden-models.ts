import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/**
 * The eighteen hero hulls. Order is the authoring order in
 * `scripts/pharosville/generate-garden-heroes.mjs`; `unique-ships.ts` maps
 * stablecoins onto these ids and must stay in sync with this list.
 */
export const GARDEN_HERO_MODEL_IDS = [
  "garden-hero-titan",
  "garden-hero-heritage",
  "garden-hero-carrack",
  "garden-hero-brigantine",
  "garden-hero-dhow",
  "garden-hero-junk",
  "garden-hero-barquentine",
  "garden-hero-cog",
  "garden-hero-xebec",
  "garden-hero-cutter",
  // N5(b): bespoke hulls, one per named titan. Assigned to exactly one coin
  // each in `unique-ships.ts` — they are not part of the shared rotation.
  "garden-hero-tether",
  "garden-hero-circle",
  "garden-hero-maker",
  "garden-hero-sky",
  "garden-hero-ethena",
  "garden-hero-liberty",
  "garden-hero-paypal",
  "garden-hero-bullion",
] as const;
export type GardenHeroModelId = typeof GARDEN_HERO_MODEL_IDS[number];
export type GardenModelId = "garden-lighthouse-shell" | GardenHeroModelId;
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
    readonly compression: "meshopt";
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

const LIGHTHOUSE_SHA256 = "683bcbcac8ccd18f9f6b6237931f5011600e1d87088507dab912aca1fd39b9c9";
const lighthouseUrl = `/pharosville/models/garden-lighthouse-shell.glb?v=${LIGHTHOUSE_SHA256.slice(0, 12)}`;

const HERO_TITAN_SHA256 = "226d585a2264290773b1dc487cc4e7f974a7735cec8a1ffebd0ea1aa01ec67f6";
const heroTitanUrl = `/pharosville/models/garden-hero-titan.glb?v=${HERO_TITAN_SHA256.slice(0, 12)}`;
const HERO_HERITAGE_SHA256 = "07dd1b57119aca31cc22a86d7347a9f7876c62601f02f45aec937658720789fe";
const heroHeritageUrl = `/pharosville/models/garden-hero-heritage.glb?v=${HERO_HERITAGE_SHA256.slice(0, 12)}`;
const HERO_CARRACK_SHA256 = "70f87b2d3c2c66133027028f3d0a7299b58834c1f7c657e308495e62e3b6013a";
const heroCarrackUrl = `/pharosville/models/garden-hero-carrack.glb?v=${HERO_CARRACK_SHA256.slice(0, 12)}`;
const HERO_BRIGANTINE_SHA256 = "2a00702207a19b49c688f815da7bc0f80697b4afa8667a4777f87da67576bab7";
const heroBrigantineUrl = `/pharosville/models/garden-hero-brigantine.glb?v=${HERO_BRIGANTINE_SHA256.slice(0, 12)}`;
const HERO_DHOW_SHA256 = "3bb620332d6bad25402985e7f77640f36387b7e903f439eb123617bdb1048358";
const heroDhowUrl = `/pharosville/models/garden-hero-dhow.glb?v=${HERO_DHOW_SHA256.slice(0, 12)}`;
const HERO_JUNK_SHA256 = "0db88b55685fe0086ff46bff3eb3f140578fcb77321a7b7d92d9522f30bf2f2c";
const heroJunkUrl = `/pharosville/models/garden-hero-junk.glb?v=${HERO_JUNK_SHA256.slice(0, 12)}`;
const HERO_BARQUENTINE_SHA256 = "fbeed772c2ebec026bb18f6edde050c494414892aab6546bb8dfb532bfd1432c";
const heroBarquentineUrl = `/pharosville/models/garden-hero-barquentine.glb?v=${HERO_BARQUENTINE_SHA256.slice(0, 12)}`;
const HERO_COG_SHA256 = "8a1b0f5fcfd064325c0d9cfbbfbeb78bdc2cbd51f28945145d9db5aa8b3a4792";
const heroCogUrl = `/pharosville/models/garden-hero-cog.glb?v=${HERO_COG_SHA256.slice(0, 12)}`;
const HERO_XEBEC_SHA256 = "87c09779b7cfbee024e8571fef17147fa32c720a3fe588e6373e5baa1a1e9540";
const heroXebecUrl = `/pharosville/models/garden-hero-xebec.glb?v=${HERO_XEBEC_SHA256.slice(0, 12)}`;
const HERO_CUTTER_SHA256 = "c3cb5c76cbaa1e72a35159d591a6c8e02370fcef2901c92adfa75f4648c0c9aa";
const heroCutterUrl = `/pharosville/models/garden-hero-cutter.glb?v=${HERO_CUTTER_SHA256.slice(0, 12)}`;
const HERO_TETHER_SHA256 = "fd98b1089c306898bf300a53169b4b1d3183f9038fce174dac5a2f4e37013e55";
const heroTetherUrl = `/pharosville/models/garden-hero-tether.glb?v=${HERO_TETHER_SHA256.slice(0, 12)}`;
const HERO_CIRCLE_SHA256 = "4f1a9e6f4b2d8db04d4368ad2be3e2c6d114b686335b33ac2b58a35fa606842d";
const heroCircleUrl = `/pharosville/models/garden-hero-circle.glb?v=${HERO_CIRCLE_SHA256.slice(0, 12)}`;
const HERO_MAKER_SHA256 = "fc0a62b0acc422aa713f18658af2d0d49dba3703bec8be97e30ab496cc52c52b";
const heroMakerUrl = `/pharosville/models/garden-hero-maker.glb?v=${HERO_MAKER_SHA256.slice(0, 12)}`;
const HERO_SKY_SHA256 = "0301094e72b79623dbbbb26d22458dc0e9a629bb5a1c5ebcff9d27b830426823";
const heroSkyUrl = `/pharosville/models/garden-hero-sky.glb?v=${HERO_SKY_SHA256.slice(0, 12)}`;
const HERO_ETHENA_SHA256 = "b4fcf32ac216e5a08b770ef04b31ad706c87c4b717a3ce95dfaef91e05f21d82";
const heroEthenaUrl = `/pharosville/models/garden-hero-ethena.glb?v=${HERO_ETHENA_SHA256.slice(0, 12)}`;
const HERO_LIBERTY_SHA256 = "db9783ef4d2114386e8c3d6b278bf49c3d6b3eeb4f3c8c7abbc1a52585da1972";
const heroLibertyUrl = `/pharosville/models/garden-hero-liberty.glb?v=${HERO_LIBERTY_SHA256.slice(0, 12)}`;
const HERO_PAYPAL_SHA256 = "764c6b2666b0b9c61316a49b62990c5fa9470e87c4dbf80313ddb54687905529";
const heroPaypalUrl = `/pharosville/models/garden-hero-paypal.glb?v=${HERO_PAYPAL_SHA256.slice(0, 12)}`;
const HERO_BULLION_SHA256 = "1ff959496ad568b00da78728f56cee9dc5c3232c288a1680eff4d873141cb3e3";
const heroBullionUrl = `/pharosville/models/garden-hero-bullion.glb?v=${HERO_BULLION_SHA256.slice(0, 12)}`;

// Every hero hull shares all but identity, geometry, and budgets; this factory
// keeps the constant boilerplate (origin/scale/lod/provenance/license)
// authored once across all eighteen models.
//
// W5.6 (decision D8): hero GLBs carry `KHR_mesh_quantization` — NORMAL as
// normalized SHORT, COLOR_0 as normalized UNSIGNED_BYTE. Measured across the
// the original hull set while preserving identical triangle and vertex counts.
// POSITION stays FLOAT on purpose — quantizing it needs a dequantization node
// transform, which would break the base-center origin and unit runtime scale
// that `validateGardenModelMetadata` enforces below.
function heroModelMetadata(config: {
  id: GardenHeroModelId;
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
      compression: "meshopt",
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
      bytes: 232_848,
      compression: "meshopt",
      gltfVersion: 2,
      sha256: LIGHTHOUSE_SHA256,
      url: lighthouseUrl,
    },
    dimensions: {
      x: 12.43,
      y: 38,
      z: 12.43,
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
        position: [0, 30.2, 0],
      },
      beam: {
        node: "anchor-beam",
        position: [0, 30.2, 0],
      },
      label: {
        node: "anchor-label",
        position: [0, 38.9, 0],
      },
      selection: {
        node: "anchor-selection",
        position: [0, 19, 0],
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
      center: [0, 19, 0],
      height: 38,
      radius: 6.6,
      shape: "cylinder",
    },
    geometry: {
      drawCalls: 7,
      materials: 7,
      textures: 0,
      triangles: 37_160,
      vertices: 24_304,
    },
    budgets: {
      // Monumental Pharos: 38-unit crown, broader battered keep, 36 lower
      // windows, pilastered octagon and an eight-column glowing lantern.
      // Seven material-merged draws; baked UBYTE vertex AO, no textures.
      // Measured 232,848 bytes / 37,160 triangles / 24,304 vertices leaves
      // deliberate headroom without approaching the precinct's frame budget.
      maxBytes: 280 * 1024,
      maxDrawCalls: 8,
      maxMaterials: 8,
      maxTextures: 0,
      maxTriangles: 45_000,
      maxVertices: 30_000,
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
    label: "Garden grand bezaisen hero hull",
    sha256: HERO_TITAN_SHA256,
    url: heroTitanUrl,
    bytes: 20_632,
    dimensions: {"x":10.97, "y":8.767, "z":4.4},
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-4.15, 6.15, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [5.5, 2.5, 0] },
      masthead: { node: "anchor-masthead", position: [1.3, 7.5, 0] },
      label: { node: "anchor-label", position: [0, 9.2, 0] },
      selection: { node: "anchor-selection", position: [0, 2.6, 0] },
    },
    pickCenter: [0, 3.467, 0],
    pickHeight: 8.767,
    pickRadius: 5.49,
    geometry: { drawCalls: 4, materials: 4, textures: 0, triangles: 930, vertices: 842 },
    budgets: {
      maxBytes: 72 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 4_100,
      maxVertices: 5_000,
    },
  }),
  "garden-hero-heritage": heroModelMetadata({
    id: "garden-hero-heritage",
    label: "Garden weathered bezaisen hero hull",
    sha256: HERO_HERITAGE_SHA256,
    url: heroHeritageUrl,
    bytes: 20_632,
    dimensions: {"x":10.48, "y":7.517, "z":3.84},
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.5, 2.75, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.4, 1.85, 0] },
      masthead: { node: "anchor-masthead", position: [0.8, 6.25, 0] },
      label: { node: "anchor-label", position: [0, 7.3, 0] },
      selection: { node: "anchor-selection", position: [0, 1.9, 0] },
    },
    pickCenter: [0, 2.842, 0],
    pickHeight: 7.517,
    pickRadius: 5.245,
    geometry: { drawCalls: 4, materials: 4, textures: 0, triangles: 930, vertices: 842 },
    budgets: {
      maxBytes: 56 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 3_400,
      maxVertices: 4_100,
    },
  }),
  "garden-hero-carrack": heroModelMetadata({
    id: "garden-hero-carrack",
    label: "Garden fortified takasebune hero hull",
    sha256: HERO_CARRACK_SHA256,
    url: heroCarrackUrl,
    bytes: 24_668,
    dimensions: {"x":12.68, "y":7.229, "z":2.5},
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-5.4, 2.3, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [5.7, 1.55, 0] },
      masthead: { node: "anchor-masthead", position: [0.55, 6.4, 0] },
      label: { node: "anchor-label", position: [0, 7.6, 0] },
      selection: { node: "anchor-selection", position: [0, 1.8, 0] },
    },
    pickCenter: [0, 3.136, 0],
    pickHeight: 7.229,
    pickRadius: 6.345,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 1_058, vertices: 1_032 },
    budgets: {
      maxBytes: 72 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 3_900,
      maxVertices: 4_900,
    },
  }),
  "garden-hero-brigantine": heroModelMetadata({
    id: "garden-hero-brigantine",
    label: "Garden swift kobaya hero hull",
    sha256: HERO_BRIGANTINE_SHA256,
    url: heroBrigantineUrl,
    bytes: 29_260,
    dimensions: {"x":13.704, "y":7.068, "z":3.944},
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.3, 1.8, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [5.1, 1.45, 0] },
      masthead: { node: "anchor-masthead", position: [2.45, 6.2, 0] },
      label: { node: "anchor-label", position: [0, 7.5, 0] },
      selection: { node: "anchor-selection", position: [0, 1.5, 0] },
    },
    pickCenter: [0, 3.016, 0],
    pickHeight: 7.068,
    pickRadius: 6.857,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 1_270, vertices: 1_366 },
    budgets: {
      maxBytes: 48 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 2_700,
      maxVertices: 3_100,
    },
  }),
  "garden-hero-dhow": heroModelMetadata({
    id: "garden-hero-dhow",
    label: "Garden triangular-sail kobaya hero hull",
    sha256: HERO_DHOW_SHA256,
    url: heroDhowUrl,
    bytes: 24_040,
    dimensions: {"x":14.074, "y":7.168, "z":1.799},
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.6, 3.1, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.4, 2.4, 0] },
      masthead: { node: "anchor-masthead", position: [-2.7, 6.3, 0] },
      label: { node: "anchor-label", position: [0, 9.2, 0] },
      selection: { node: "anchor-selection", position: [0, 1.8, 0] },
    },
    pickCenter: [0, 3.066, 0],
    pickHeight: 7.168,
    pickRadius: 7.042,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 1_054, vertices: 969 },
    budgets: {
      maxBytes: 48 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 2_600,
      maxVertices: 3_200,
    },
  }),
  "garden-hero-junk": heroModelMetadata({
    id: "garden-hero-junk",
    label: "Garden battened junk hero hull",
    sha256: HERO_JUNK_SHA256,
    url: heroJunkUrl,
    bytes: 26_660,
    dimensions: {"x":9.96, "y":9.168, "z":3.433},
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-5.05, 4.7, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.6, 2.5, 0] },
      masthead: { node: "anchor-masthead", position: [0.35, 8.2, 0] },
      label: { node: "anchor-label", position: [0, 9.4, 0] },
      selection: { node: "anchor-selection", position: [0, 2.4, 0] },
    },
    pickCenter: [0, 3.966, 0],
    pickHeight: 9.168,
    pickRadius: 4.985,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 1_214, vertices: 1_213 },
    budgets: {
      maxBytes: 48 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 2_800,
      maxVertices: 3_300,
    },
  }),
  "garden-hero-barquentine": heroModelMetadata({
    id: "garden-hero-barquentine",
    label: "Garden twin-hull trader hero hull",
    sha256: HERO_BARQUENTINE_SHA256,
    url: heroBarquentineUrl,
    bytes: 33_432,
    dimensions: {"x":9.38, "y":7.568, "z":3.85},
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.7, 1.7, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.5, 1.35, 0] },
      masthead: { node: "anchor-masthead", position: [3.1, 6.7, 0] },
      label: { node: "anchor-label", position: [0, 7.8, 0] },
      selection: { node: "anchor-selection", position: [0, 1.6, 0] },
    },
    pickCenter: [0, 3.266, 0],
    pickHeight: 7.568,
    pickRadius: 4.695,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 1_812, vertices: 1_534 },
    budgets: {
      maxBytes: 56 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 3_400,
      maxVertices: 4_000,
    },
  }),
  "garden-hero-cog": heroModelMetadata({
    id: "garden-hero-cog",
    label: "Garden cargo scow hero hull",
    sha256: HERO_COG_SHA256,
    url: heroCogUrl,
    bytes: 24_140,
    dimensions: {"x":8.38, "y":6.097, "z":4.299},
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.7, 1.6, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [3.7, 1.3, 0] },
      masthead: { node: "anchor-masthead", position: [0.2, 4.8, 0] },
      label: { node: "anchor-label", position: [0, 6.1, 0] },
      selection: { node: "anchor-selection", position: [0, 1.5, 0] },
    },
    pickCenter: [0, 2.102, 0],
    pickHeight: 6.097,
    pickRadius: 4.195,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 1_092, vertices: 946 },
    budgets: {
      maxBytes: 56 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 2_600,
      maxVertices: 3_300,
    },
  }),
  "garden-hero-xebec": heroModelMetadata({
    id: "garden-hero-xebec",
    label: "Garden raked junk hero hull",
    sha256: HERO_XEBEC_SHA256,
    url: heroXebecUrl,
    bytes: 26_748,
    dimensions: {"x":9.08, "y":8.768, "z":3.433},
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-4.1, 2.5, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.2, 1.6, 0] },
      masthead: { node: "anchor-masthead", position: [0.15, 7.8, 0] },
      label: { node: "anchor-label", position: [0, 9.1, 0] },
      selection: { node: "anchor-selection", position: [0, 1.8, 0] },
    },
    pickCenter: [0, 3.766, 0],
    pickHeight: 8.768,
    pickRadius: 4.545,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 1_214, vertices: 1_213 },
    budgets: {
      maxBytes: 56 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 3_100,
      maxVertices: 3_700,
    },
  }),
  "garden-hero-cutter": heroModelMetadata({
    id: "garden-hero-cutter",
    label: "Garden small kobaya hero hull",
    sha256: HERO_CUTTER_SHA256,
    url: heroCutterUrl,
    bytes: 23_716,
    dimensions: {"x":11.735, "y":6.668, "z":1.48},
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-2.8, 1.5, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.8, 1.25, 0] },
      masthead: { node: "anchor-masthead", position: [0.5, 5.8, 0] },
      label: { node: "anchor-label", position: [0, 6.9, 0] },
      selection: { node: "anchor-selection", position: [0, 1.3, 0] },
    },
    pickCenter: [0, 2.816, 0],
    pickHeight: 6.668,
    pickRadius: 5.873,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 1_046, vertices: 950 },
    budgets: {
      maxBytes: 48 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 2_600,
      maxVertices: 3_200,
    },
  }),
  "garden-hero-tether": heroModelMetadata({
    id: "garden-hero-tether",
    label: "Garden Tether flagship bezaisen",
    sha256: HERO_TETHER_SHA256,
    url: heroTetherUrl,
    bytes: 20_480,
    dimensions: {"x":11.78, "y":9.317, "z":4.9},
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-4.3, 6.9, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.6, 2.3, 0] },
      masthead: { node: "anchor-masthead", position: [-0.1, 8.05, 0] },
      label: { node: "anchor-label", position: [0, 9.6, 0] },
      selection: { node: "anchor-selection", position: [0, 2.9, 0] },
    },
    pickCenter: [0, 3.742, 0],
    pickHeight: 9.317,
    pickRadius: 5.895,
    geometry: { drawCalls: 4, materials: 4, textures: 0, triangles: 930, vertices: 842 },
    budgets: {
      maxBytes: 80 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 4_100,
      maxVertices: 5_300,
    },
  }),
  "garden-hero-circle": heroModelMetadata({
    id: "garden-hero-circle",
    label: "Garden Circle takasebune",
    sha256: HERO_CIRCLE_SHA256,
    url: heroCircleUrl,
    bytes: 28_844,
    dimensions: {"x":12.68, "y":7.629, "z":2.5},
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-5.4, 2.1, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [5.8, 1.45, 0] },
      masthead: { node: "anchor-masthead", position: [0.5, 6.8, 0] },
      label: { node: "anchor-label", position: [0, 8, 0] },
      selection: { node: "anchor-selection", position: [0, 1.7, 0] },
    },
    pickCenter: [0, 3.336, 0],
    pickHeight: 7.629,
    pickRadius: 6.345,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 1_258, vertices: 1_392 },
    budgets: {
      maxBytes: 72 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 4_000,
      maxVertices: 5_000,
    },
  }),
  "garden-hero-maker": heroModelMetadata({
    id: "garden-hero-maker",
    label: "Garden Maker twin-hull council boat",
    sha256: HERO_MAKER_SHA256,
    url: heroMakerUrl,
    bytes: 32_180,
    dimensions: {"x":9.38, "y":7.668, "z":4.485},
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.8, 2.3, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.4, 1.35, 0] },
      masthead: { node: "anchor-masthead", position: [1.5, 6.8, 0] },
      label: { node: "anchor-label", position: [0, 7.9, 0] },
      selection: { node: "anchor-selection", position: [0, 1.7, 0] },
    },
    pickCenter: [0, 3.316, 0],
    pickHeight: 7.668,
    pickRadius: 4.695,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 1_764, vertices: 1_451 },
    budgets: {
      maxBytes: 64 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 3_000,
      maxVertices: 3_500,
    },
  }),
  "garden-hero-sky": heroModelMetadata({
    id: "garden-hero-sky",
    label: "Garden Sky twin-hull flagship",
    sha256: HERO_SKY_SHA256,
    url: heroSkyUrl,
    bytes: 35_216,
    dimensions: {"x":9.38, "y":8.068, "z":3.85},
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.9, 2.2, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.5, 1.4, 0] },
      masthead: { node: "anchor-masthead", position: [1.8, 7.2, 0] },
      label: { node: "anchor-label", position: [0, 8.3, 0] },
      selection: { node: "anchor-selection", position: [0, 1.8, 0] },
    },
    pickCenter: [0, 3.516, 0],
    pickHeight: 8.068,
    pickRadius: 4.695,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 1_904, vertices: 1_707 },
    budgets: {
      maxBytes: 64 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 3_300,
      maxVertices: 3_700,
    },
  }),
  "garden-hero-ethena": heroModelMetadata({
    id: "garden-hero-ethena",
    label: "Garden Ethena battened junk",
    sha256: HERO_ETHENA_SHA256,
    url: heroEthenaUrl,
    bytes: 28_308,
    dimensions: {"x":9.08, "y":8.968, "z":3.51},
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.9, 2.4, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.1, 1.55, 0] },
      masthead: { node: "anchor-masthead", position: [1, 8, 0] },
      label: { node: "anchor-label", position: [0, 9.3, 0] },
      selection: { node: "anchor-selection", position: [0, 1.8, 0] },
    },
    pickCenter: [0, 3.866, 0],
    pickHeight: 8.968,
    pickRadius: 4.545,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 1_286, vertices: 1_341 },
    budgets: {
      maxBytes: 56 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 3_100,
      maxVertices: 3_200,
    },
  }),
  "garden-hero-liberty": heroModelMetadata({
    id: "garden-hero-liberty",
    label: "Garden World Liberty bezaisen",
    sha256: HERO_LIBERTY_SHA256,
    url: heroLibertyUrl,
    bytes: 20_632,
    dimensions: {"x":10.48, "y":8.817, "z":3.84},
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.2, 3.4, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.7, 2.5, 0] },
      masthead: { node: "anchor-masthead", position: [1.1, 7.55, 0] },
      label: { node: "anchor-label", position: [0, 8.9, 0] },
      selection: { node: "anchor-selection", position: [0, 2.2, 0] },
    },
    pickCenter: [0, 3.492, 0],
    pickHeight: 8.817,
    pickRadius: 5.245,
    geometry: { drawCalls: 4, materials: 4, textures: 0, triangles: 930, vertices: 842 },
    budgets: {
      maxBytes: 64 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 3_400,
      maxVertices: 4_600,
    },
  }),
  "garden-hero-paypal": heroModelMetadata({
    id: "garden-hero-paypal",
    label: "Garden PayPal packet takasebune",
    sha256: HERO_PAYPAL_SHA256,
    url: heroPaypalUrl,
    bytes: 24_992,
    dimensions: {"x":12.68, "y":7.029, "z":2.5},
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-5.3, 2, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [5.8, 1.4, 0] },
      masthead: { node: "anchor-masthead", position: [3.5, 6.2, 0] },
      label: { node: "anchor-label", position: [0, 7.4, 0] },
      selection: { node: "anchor-selection", position: [0, 1.6, 0] },
    },
    pickCenter: [0, 3.036, 0],
    pickHeight: 7.029,
    pickRadius: 6.345,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 1_074, vertices: 1_060 },
    budgets: {
      maxBytes: 56 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 3_000,
      maxVertices: 3_500,
    },
  }),
  // XAUT keeps the deepest, roundest scow: a low sail and sealed bullion vault
  // distinguish it from the shared cargo-scow slot.
  "garden-hero-bullion": heroModelMetadata({
    id: "garden-hero-bullion",
    label: "Garden Tether Gold bullion scow",
    sha256: HERO_BULLION_SHA256,
    url: heroBullionUrl,
    bytes: 24_132,
    dimensions: {"x":9.188, "y":5.797, "z":4.899},
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.8, 1.55, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [3.7, 1.05, 0] },
      masthead: { node: "anchor-masthead", position: [-2.75, 4.5, 0] },
      label: { node: "anchor-label", position: [0, 5.8, 0] },
      selection: { node: "anchor-selection", position: [0, 1.4, 0] },
    },
    pickCenter: [0, 1.951, 0],
    pickHeight: 5.797,
    pickRadius: 4.599,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 1_092, vertices: 946 },
    budgets: {
      maxBytes: 48 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 2_900,
      maxVertices: 3_400,
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

interface GardenGlb {
  accessors: Array<{
    bufferView: number;
    byteOffset?: number;
    componentType: 5121 | 5122 | 5123 | 5126;
    count: number;
    normalized?: boolean;
    type: "SCALAR" | "VEC3" | "VEC4";
  }>;
  bufferViews: Array<{
    byteLength: number;
    byteOffset?: number;
    byteStride?: number;
    extensions: {
      EXT_meshopt_compression: {
        byteLength: number;
        byteOffset: number;
        byteStride: number;
        count: number;
        filter?: string;
        mode: string;
      };
    };
  }>;
  materials: Array<{
    doubleSided?: boolean;
    emissiveFactor?: [number, number, number];
    extensions?: { KHR_materials_emissive_strength?: { emissiveStrength: number } };
    name?: string;
    pbrMetallicRoughness?: {
      baseColorFactor?: [number, number, number, number];
      metallicFactor?: number;
      roughnessFactor?: number;
    };
  }>;
  meshes: Array<{ primitives: Array<{
    attributes: { COLOR_0?: number; NORMAL?: number; POSITION: number };
    indices: number;
    material: number;
  }> }>;
  nodes: Array<{ children?: number[]; matrix?: number[]; mesh?: number; name?: string }>;
  scene: number;
  scenes: Array<{ nodes: number[] }>;
}

/**
 * The checked-in garden models deliberately use a tiny GLB subset. Keeping
 * that contract here avoids shipping the general loader's texture, skin,
 * animation, camera, extension and parser machinery for textureless static
 * geometry. Asset tests still parse every GLB with Three's reference loader.
 */
function createGardenGlbLoader(): GardenModelSourceLoader {
  const itemSizes = { SCALAR: 1, VEC3: 3, VEC4: 4 } as const;
  return {
    async loadAsync(url) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Garden model request failed (${response.status}): ${url}`);
      const bytes = await response.arrayBuffer();
      const data = new DataView(bytes);
      if (data.getUint32(0, true) !== 0x46546c67 || data.getUint32(4, true) !== 2) {
        throw new Error(`Garden model is not a GLB 2.0 asset: ${url}`);
      }
      const jsonLength = data.getUint32(12, true);
      const json = JSON.parse(new TextDecoder().decode(
        new Uint8Array(bytes, 20, jsonLength),
      ).trim()) as GardenGlb;
      const binOffset = 28 + jsonLength;
      const bin = new Uint8Array(bytes, binOffset, data.getUint32(20 + jsonLength, true));
      await MeshoptDecoder.ready;
      const views = json.bufferViews.map((view) => {
        const extension = view.extensions.EXT_meshopt_compression;
        const decoded = new Uint8Array(view.byteLength);
        MeshoptDecoder.decodeGltfBuffer(
          decoded,
          extension.count,
          extension.byteStride,
          bin.subarray(extension.byteOffset, extension.byteOffset + extension.byteLength),
          extension.mode,
          extension.filter,
        );
        return decoded;
      });
      const attribute = (index: number): BufferAttribute => {
        const accessor = json.accessors[index]!;
        let view = views[accessor.bufferView]!;
        let offset = accessor.byteOffset ?? 0;
        const length = accessor.count * itemSizes[accessor.type];
        const componentBytes = accessor.componentType === 5126 ? 4 : accessor.componentType === 5121 ? 1 : 2;
        const itemBytes = itemSizes[accessor.type] * componentBytes;
        const stride = json.bufferViews[accessor.bufferView]!.byteStride ?? itemBytes;
        if (stride !== itemBytes) {
          // glTF pads RGB8/XYZ16 records to four-byte alignment. Keep their
          // integer normalization, but remove per-vertex padding before Three
          // or the hero merger treats this as a tightly packed attribute.
          const packed = new Uint8Array(accessor.count * itemBytes);
          for (let vertex = 0; vertex < accessor.count; vertex += 1) {
            const start = offset + vertex * stride;
            packed.set(view.subarray(start, start + itemBytes), vertex * itemBytes);
          }
          view = packed;
          offset = 0;
        }
        const array = accessor.componentType === 5126
          ? new Float32Array(view.buffer, offset, length)
          : accessor.componentType === 5123
            ? new Uint16Array(view.buffer, offset, length)
            : accessor.componentType === 5122
              ? new Int16Array(view.buffer, offset, length)
              : new Uint8Array(view.buffer, offset, length);
        return new BufferAttribute(array, itemSizes[accessor.type], accessor.normalized ?? false);
      };
      const material = (index: number, vertexColors: boolean, flatShading: boolean): MeshStandardMaterial => {
        const source = json.materials[index]!;
        const pbr = source.pbrMetallicRoughness;
        const result = new MeshStandardMaterial({
          color: new Color().fromArray(pbr?.baseColorFactor ?? [1, 1, 1, 1]),
          emissive: new Color().fromArray(source.emissiveFactor ?? [0, 0, 0]),
          emissiveIntensity: source.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1,
          metalness: pbr?.metallicFactor ?? 1,
          roughness: pbr?.roughnessFactor ?? 1,
          ...(source.doubleSided ? { side: DoubleSide } : {}),
          flatShading,
          vertexColors,
        });
        result.name = source.name ?? "";
        return result;
      };
      const objects = json.nodes.map((node) => {
        if (node.mesh === undefined) return new Group();
        const primitives = json.meshes[node.mesh]!.primitives;
        const meshes = primitives.map((primitive) => {
          const geometry = new BufferGeometry();
          geometry.setAttribute("position", attribute(primitive.attributes.POSITION));
          if (primitive.attributes.NORMAL !== undefined) {
            geometry.setAttribute("normal", attribute(primitive.attributes.NORMAL));
          }
          if (primitive.attributes.COLOR_0 !== undefined) {
            geometry.setAttribute("color", attribute(primitive.attributes.COLOR_0));
          }
          geometry.setIndex(attribute(primitive.indices));
          geometry.computeBoundingSphere();
          return new Mesh(
            geometry,
            material(
              primitive.material,
              primitive.attributes.COLOR_0 !== undefined,
              primitive.attributes.NORMAL === undefined,
            ),
          );
        });
        if (meshes.length === 1) return meshes[0]!;
        const group = new Group();
        group.add(...meshes);
        return group;
      });
      json.nodes.forEach((node, index) => {
        const object = objects[index]!;
        object.name = node.name ?? "";
        if (node.matrix !== undefined) object.applyMatrix4(new Matrix4().fromArray(node.matrix));
        if (node.children !== undefined) object.add(...node.children.map((child) => objects[child]!));
      });
      const scene = new Group();
      scene.add(...json.scenes[json.scene]!.nodes.map((index) => objects[index]!));
      return { scene };
    },
  };
}

/**
 * Creates a small per-renderer model cache. Clones share static geometry and
 * materials; the renderer remains responsible for disposing them at teardown.
 *
 * The decoder is the one bundled in `three/examples/jsm/libs`, so it is bundle
 * code in the guarded renderer chunk rather than a remote fetch — the models
 * stay same-origin, which is the whole point of checking them in.
 */
export function createGardenModelLibrary(
  sourceLoader: GardenModelSourceLoader = createGardenGlbLoader(),
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
