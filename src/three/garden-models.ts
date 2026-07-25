import type { Group, Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * The ten hero hulls (W5.1, decision D4). Order is the authoring order in
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

const LIGHTHOUSE_SHA256 = "390477368cfecc235a771300f7cecfc1f8047a6adfa43806cd198f911ba7b03b";
const lighthouseUrl = `/pharosville/models/garden-lighthouse-shell.glb?v=${LIGHTHOUSE_SHA256.slice(0, 12)}`;

const HERO_TITAN_SHA256 = "9781336f543636254d9fef561948406ea5e32c0f9d76ed3ec6cbccbfe0e20c0a";
const heroTitanUrl = `/pharosville/models/garden-hero-titan.glb?v=${HERO_TITAN_SHA256.slice(0, 12)}`;
const HERO_HERITAGE_SHA256 = "2ebc0db2ff3f367cd2206bc7cc881e3d6047f1992a20a3b6766d3b55e136792f";
const heroHeritageUrl = `/pharosville/models/garden-hero-heritage.glb?v=${HERO_HERITAGE_SHA256.slice(0, 12)}`;
const HERO_CARRACK_SHA256 = "9f99819938c53a221bd35fc7e5aff7e8e8cf06b92b06b2a4359a6bcc3149732e";
const heroCarrackUrl = `/pharosville/models/garden-hero-carrack.glb?v=${HERO_CARRACK_SHA256.slice(0, 12)}`;
const HERO_BRIGANTINE_SHA256 = "411409b1e79fd49eacba12ff828e2816e1f2144effa3cb85f586f6a8aebf8dd5";
const heroBrigantineUrl = `/pharosville/models/garden-hero-brigantine.glb?v=${HERO_BRIGANTINE_SHA256.slice(0, 12)}`;
const HERO_DHOW_SHA256 = "7a20a160ced1cddecdc7cccaf973fb1630a1284b388899ccc4d5a0c95aa6816b";
const heroDhowUrl = `/pharosville/models/garden-hero-dhow.glb?v=${HERO_DHOW_SHA256.slice(0, 12)}`;
const HERO_JUNK_SHA256 = "8fe4f736281add63e01d905965c4c16d3e78302cea2f267b4bc1562e5350483c";
const heroJunkUrl = `/pharosville/models/garden-hero-junk.glb?v=${HERO_JUNK_SHA256.slice(0, 12)}`;
const HERO_BARQUENTINE_SHA256 = "d2d94ea53cd3c982aeb2ce00bd09c95d6f9d3638761ea1c22edc8a81d015b88f";
const heroBarquentineUrl = `/pharosville/models/garden-hero-barquentine.glb?v=${HERO_BARQUENTINE_SHA256.slice(0, 12)}`;
const HERO_COG_SHA256 = "a77dc9655243ae7c64c6eb04adf4124eff0f18e2cec726bb27fa0ba99c609299";
const heroCogUrl = `/pharosville/models/garden-hero-cog.glb?v=${HERO_COG_SHA256.slice(0, 12)}`;
const HERO_XEBEC_SHA256 = "042d616ade6c20cebedcea4b7ab008c5eedb6d62fbdcff2382360e8d6be37e41";
const heroXebecUrl = `/pharosville/models/garden-hero-xebec.glb?v=${HERO_XEBEC_SHA256.slice(0, 12)}`;
const HERO_CUTTER_SHA256 = "22b043632fee45603c863931a0a493332e8be770f3b097761673bd4181e53861";
const heroCutterUrl = `/pharosville/models/garden-hero-cutter.glb?v=${HERO_CUTTER_SHA256.slice(0, 12)}`;
const HERO_TETHER_SHA256 = "4eb56cb7e9a9649a5645e1ad45dff735c0c29a59f4e64119f5691e60d47daac6";
const heroTetherUrl = `/pharosville/models/garden-hero-tether.glb?v=${HERO_TETHER_SHA256.slice(0, 12)}`;
const HERO_CIRCLE_SHA256 = "24e736aec6af668c1f61a8fba1328408667419648d71cfda72f57523530f2831";
const heroCircleUrl = `/pharosville/models/garden-hero-circle.glb?v=${HERO_CIRCLE_SHA256.slice(0, 12)}`;
const HERO_MAKER_SHA256 = "6a2397cde4226dbfae8eea6d142364d58cfe60f4a1da9a2452a20f7cdc93adab";
const heroMakerUrl = `/pharosville/models/garden-hero-maker.glb?v=${HERO_MAKER_SHA256.slice(0, 12)}`;
const HERO_SKY_SHA256 = "230bba7fe1acda1e46efe5f6e94c339546f9f7edb9a1ae5dfca8d44ce6137a92";
const heroSkyUrl = `/pharosville/models/garden-hero-sky.glb?v=${HERO_SKY_SHA256.slice(0, 12)}`;
const HERO_ETHENA_SHA256 = "51540d4c5783803f350d3a2f1f20f3fa37b556cbeab6afedab34aa7029fc3cd5";
const heroEthenaUrl = `/pharosville/models/garden-hero-ethena.glb?v=${HERO_ETHENA_SHA256.slice(0, 12)}`;
const HERO_LIBERTY_SHA256 = "be738709bb0f06ffc5ed4cfc2c49246e5dfec559ae36beb26696ca81749a3717";
const heroLibertyUrl = `/pharosville/models/garden-hero-liberty.glb?v=${HERO_LIBERTY_SHA256.slice(0, 12)}`;
const HERO_PAYPAL_SHA256 = "0a7c49d223d8411b31302dd067fc355b9154a682c9b9cffb276b6ba8317bd16c";
const heroPaypalUrl = `/pharosville/models/garden-hero-paypal.glb?v=${HERO_PAYPAL_SHA256.slice(0, 12)}`;
const HERO_BULLION_SHA256 = "730dc6b80ca2965678e539b2b7454848c8d8b0c24ad67061f9ec04fb75d3eceb";
const heroBullionUrl = `/pharosville/models/garden-hero-bullion.glb?v=${HERO_BULLION_SHA256.slice(0, 12)}`;

// Every hero hull shares all but identity, geometry, and budgets; this factory
// keeps the constant boilerplate (origin/scale/lod/provenance/license)
// authored once across the ten models.
//
// W5.6 (decision D8): hero GLBs carry `KHR_mesh_quantization` — NORMAL as
// normalized SHORT, COLOR_0 as normalized UNSIGNED_BYTE. Measured across the
// ten hulls: 1,114,668 -> 863,964 bytes (-22.5%) with identical triangle and
// vertex counts. `artifact.compression` stays "none" because that field tracks
// container codecs (DRACO/meshopt), which are still not adopted: three reads
// quantized attributes natively, so no browser-side decoder ships.
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
      bytes: 546_320,
      compression: "none",
      gltfVersion: 2,
      sha256: LIGHTHOUSE_SHA256,
      url: lighthouseUrl,
    },
    dimensions: {
      x: 9.649,
      y: 34,
      // 9.469 -> 9.490: the terrace steps gained proud corner quoins, which
      // are the widest thing on the +z side. The silhouette is unchanged.
      z: 9.49,
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
      drawCalls: 7,
      materials: 7,
      textures: 0,
      triangles: 33_444,
      vertices: 21_642,
    },
    budgets: {
      // Grand-scale revamp raise (2026-07-25, measured cause, W4.1–W4.6): GLB
      // v5 keeps the v4 silhouette exactly (34 units, beacon 30.1) and spends
      // every added triangle on SURFACE. Measured from the regenerated
      // artifact: 2,420 → 31,716 tris, 3,447 → 20,598 verts, 6 → 7 draws, and
      // 156,816 → 519,364 bytes. What the spend bought: ashlar coursing with
      // running bond, per-block relief jitter and interlocking quoins on the
      // square/octagon/cylinder tiers; a 0.46-deep wall so window and door
      // reveals are real openings; twenty-two arched reveals with voussoir
      // heads, sills and hood moulds; bronze double doors; a plinth and string
      // course; four dentil courses; an eight-column colonnade on the drum; a
      // spiral ramp with its arcade; modelled Tritons, Zeus Soter and the
      // bronze mirror dish. Baked geometry-aware AO rides in the vertex
      // colours (still zero textures).
      //
      // The 7th draw is the new "window-shell" group (W4.5): every aperture
      // sits behind material "lighthouse-window-glow" so the runtime can drive
      // the interior glow across the day cycle without adding a light.
      //
      // L6 (2026-07-25) added 1,728 triangles and 26,956 bytes for the
      // projecting balustraded gallery at the head of the square tier (corbel
      // brackets, deck, coping, balusters, rail, corner piers, with the Tritons
      // moved out onto the piers) and replaced the abstract 13-glyph dedication
      // strip — which read as garbled text at overview zoom — with a three-bay
      // rosette frieze in relief. Silhouette contract untouched: still 34 units
      // tall, beacon at 30.1, and inside the terrace footprint on x/z.
      //
      // Bytes are held down without a decoder or a glTF extension: the model
      // is entirely flat-shaded, so NORMAL is dropped (three's GLTFLoader
      // re-flags flatShading for primitives without it) and mergeVertices
      // welds each box's 24 corners to 8; COLOR_0 ships as normalized
      // UNSIGNED_BYTE VEC4, which is core glTF 2.0. Together those cut the
      // per-vertex cost from 36 bytes to 16 — a float export of the same
      // geometry measures ~1.5 MiB.
      maxBytes: 600 * 1024,
      maxDrawCalls: 12,
      maxMaterials: 12,
      maxTextures: 0,
      maxTriangles: 40_000,
      maxVertices: 26_000,
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
    label: "Garden treasury galleon hero hull",
    sha256: HERO_TITAN_SHA256,
    url: heroTitanUrl,
    bytes: 117_708,
    dimensions: { x: 13.38, y: 9.084, z: 3.64 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-4.15, 6.15, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [5.5, 2.5, 0] },
      masthead: { node: "anchor-masthead", position: [1.3, 7.5, 0] },
      label: { node: "anchor-label", position: [0, 9.2, 0] },
      selection: { node: "anchor-selection", position: [0, 2.6, 0] },
    },
    pickCenter: [0, 3.44, 0],
    pickHeight: 9.084,
    pickRadius: 6.71,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 3_326, vertices: 4_158 },
    budgets: {
      maxBytes: 128 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 4_100,
      maxVertices: 5_000,
    },
  }),
  "garden-hero-heritage": heroModelMetadata({
    id: "garden-hero-heritage",
    label: "Garden tea clipper hero hull",
    sha256: HERO_HERITAGE_SHA256,
    url: heroHeritageUrl,
    bytes: 93_980,
    dimensions: { x: 14.207, y: 7.65, z: 3.295 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.5, 2.75, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.4, 1.85, 0] },
      masthead: { node: "anchor-masthead", position: [0.8, 6.25, 0] },
      label: { node: "anchor-label", position: [0, 7.3, 0] },
      selection: { node: "anchor-selection", position: [0, 1.9, 0] },
    },
    pickCenter: [0, 2.92, 0],
    pickHeight: 7.65,
    pickRadius: 7.12,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_680, vertices: 3_293 },
    budgets: {
      maxBytes: 104 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 3_400,
      maxVertices: 4_100,
    },
  }),
  "garden-hero-carrack": heroModelMetadata({
    id: "garden-hero-carrack",
    label: "Garden war carrack hero hull",
    sha256: HERO_CARRACK_SHA256,
    url: heroCarrackUrl,
    bytes: 119_408,
    dimensions: { x: 12.796, y: 9.449, z: 5.947 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-4.1, 5.5, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [3.7, 4.2, 0] },
      masthead: { node: "anchor-masthead", position: [0.55, 7.75, 0] },
      label: { node: "anchor-label", position: [0, 9.4, 0] },
      selection: { node: "anchor-selection", position: [0, 2.7, 0] },
    },
    pickCenter: [0, 3.6, 0],
    pickHeight: 9.449,
    pickRadius: 6.42,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 3_264, vertices: 4_198 },
    budgets: {
      maxBytes: 120 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 3_900,
      maxVertices: 4_900,
    },
  }),
  "garden-hero-brigantine": heroModelMetadata({
    id: "garden-hero-brigantine",
    label: "Garden brigantine hero hull",
    sha256: HERO_BRIGANTINE_SHA256,
    url: heroBrigantineUrl,
    bytes: 74_156,
    dimensions: { x: 13.531, y: 8.544, z: 3.633 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.3, 2.2, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.3, 1.75, 0] },
      masthead: { node: "anchor-masthead", position: [2.45, 6.85, 0] },
      label: { node: "anchor-label", position: [0, 8.1, 0] },
      selection: { node: "anchor-selection", position: [0, 1.8, 0] },
    },
    pickCenter: [0, 3.32, 0],
    pickHeight: 8.544,
    pickRadius: 6.79,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_150, vertices: 2_499 },
    budgets: {
      maxBytes: 80 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 2_700,
      maxVertices: 3_100,
    },
  }),
  "garden-hero-dhow": heroModelMetadata({
    id: "garden-hero-dhow",
    label: "Garden dhow hero hull",
    sha256: HERO_DHOW_SHA256,
    url: heroDhowUrl,
    bytes: 76_988,
    dimensions: { x: 13.17, y: 11.017, z: 3.316 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.6, 3.1, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.4, 2.4, 0] },
      masthead: { node: "anchor-masthead", position: [-2.7, 6.3, 0] },
      label: { node: "anchor-label", position: [0, 9.2, 0] },
      selection: { node: "anchor-selection", position: [0, 1.8, 0] },
    },
    pickCenter: [0, 4.51, 0],
    pickHeight: 11.017,
    pickRadius: 6.6,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_094, vertices: 2_592 },
    budgets: {
      maxBytes: 88 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 2_600,
      maxVertices: 3_200,
    },
  }),
  "garden-hero-junk": heroModelMetadata({
    id: "garden-hero-junk",
    label: "Garden junk hero hull",
    sha256: HERO_JUNK_SHA256,
    url: heroJunkUrl,
    bytes: 79_356,
    dimensions: { x: 11.205, y: 9.48, z: 4.809 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-5.05, 4.7, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.6, 2.5, 0] },
      masthead: { node: "anchor-masthead", position: [0.35, 8.2, 0] },
      label: { node: "anchor-label", position: [0, 9.4, 0] },
      selection: { node: "anchor-selection", position: [0, 2.4, 0] },
    },
    pickCenter: [0, 3.96, 0],
    pickHeight: 9.48,
    pickRadius: 5.62,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_264, vertices: 2_695 },
    budgets: {
      maxBytes: 88 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 2_800,
      maxVertices: 3_300,
    },
  }),
  "garden-hero-barquentine": heroModelMetadata({
    id: "garden-hero-barquentine",
    label: "Garden barquentine hero hull",
    sha256: HERO_BARQUENTINE_SHA256,
    url: heroBarquentineUrl,
    bytes: 93_108,
    dimensions: { x: 14.319, y: 9.2, z: 3.877 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.65, 2.5, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.7, 1.95, 0] },
      masthead: { node: "anchor-masthead", position: [3.8, 7.3, 0] },
      label: { node: "anchor-label", position: [0, 8.6, 0] },
      selection: { node: "anchor-selection", position: [0, 2, 0] },
    },
    pickCenter: [0, 3.6, 0],
    pickHeight: 9.2,
    pickRadius: 7.18,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_724, vertices: 3_228 },
    budgets: {
      maxBytes: 104 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 3_400,
      maxVertices: 4_000,
    },
  }),
  "garden-hero-cog": heroModelMetadata({
    id: "garden-hero-cog",
    label: "Garden cog hero hull",
    sha256: HERO_COG_SHA256,
    url: heroCogUrl,
    bytes: 83_212,
    dimensions: { x: 13.129, y: 9.216, z: 3.586 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.95, 4.6, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.05, 4.5, 0] },
      masthead: { node: "anchor-masthead", position: [0.2, 7.8, 0] },
      label: { node: "anchor-label", position: [0, 9, 0] },
      selection: { node: "anchor-selection", position: [0, 2.6, 0] },
    },
    pickCenter: [0, 3.65, 0],
    pickHeight: 9.216,
    pickRadius: 6.58,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_188, vertices: 2_786 },
    budgets: {
      maxBytes: 88 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 2_600,
      maxVertices: 3_300,
    },
  }),
  "garden-hero-xebec": heroModelMetadata({
    id: "garden-hero-xebec",
    label: "Garden xebec hero hull",
    sha256: HERO_XEBEC_SHA256,
    url: heroXebecUrl,
    bytes: 90_688,
    dimensions: { x: 15.973, y: 9.64, z: 3.484 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-5.75, 2.8, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.9, 1.8, 0] },
      masthead: { node: "anchor-masthead", position: [0.15, 8.2, 0] },
      label: { node: "anchor-label", position: [0, 9.4, 0] },
      selection: { node: "anchor-selection", position: [0, 1.9, 0] },
    },
    pickCenter: [0, 3.82, 0],
    pickHeight: 9.64,
    pickRadius: 8.01,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_486, vertices: 3_078 },
    budgets: {
      maxBytes: 96 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 3_100,
      maxVertices: 3_700,
    },
  }),
  "garden-hero-cutter": heroModelMetadata({
    id: "garden-hero-cutter",
    label: "Garden cutter hero hull",
    sha256: HERO_CUTTER_SHA256,
    url: heroCutterUrl,
    bytes: 77_608,
    dimensions: { x: 15.63, y: 10.54, z: 3.171 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.4, 1.55, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [3.9, 1.6, 0] },
      masthead: { node: "anchor-masthead", position: [0.5, 9.1, 0] },
      label: { node: "anchor-label", position: [0, 10.2, 0] },
      selection: { node: "anchor-selection", position: [0, 1.6, 0] },
    },
    pickCenter: [0, 4.21, 0],
    pickHeight: 10.54,
    pickRadius: 7.83,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_064, vertices: 2_585 },
    budgets: {
      maxBytes: 88 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 2_600,
      maxVertices: 3_200,
    },
  }),
  "garden-hero-tether": heroModelMetadata({
    id: "garden-hero-tether",
    label: "Garden Tether bullion barge",
    sha256: HERO_TETHER_SHA256,
    url: heroTetherUrl,
    bytes: 142_144,
    dimensions: { x: 13.522, y: 9.9, z: 5.515 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-4.3, 6.9, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.6, 2.3, 0] },
      masthead: { node: "anchor-masthead", position: [-0.1, 8.05, 0] },
      label: { node: "anchor-label", position: [0, 9.6, 0] },
      selection: { node: "anchor-selection", position: [0, 2.9, 0] },
    },
    pickCenter: [0, 3.63, 0],
    pickHeight: 9.9,
    pickRadius: 6.78,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 3_694, vertices: 5_106 },
    budgets: {
      maxBytes: 160 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 4_100,
      maxVertices: 5_300,
    },
  }),
  "garden-hero-circle": heroModelMetadata({
    id: "garden-hero-circle",
    label: "Garden Circle revenue cutter",
    sha256: HERO_CIRCLE_SHA256,
    url: heroCircleUrl,
    bytes: 121_416,
    dimensions: { x: 13.823, y: 9.93, z: 3.989 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-4.5, 3.2, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.9, 2.05, 0] },
      masthead: { node: "anchor-masthead", position: [0.5, 8.35, 0] },
      label: { node: "anchor-label", position: [0, 9.8, 0] },
      selection: { node: "anchor-selection", position: [0, 2.4, 0] },
    },
    pickCenter: [0, 3.89, 0],
    pickHeight: 9.93,
    pickRadius: 6.93,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 3_328, vertices: 4_265 },
    budgets: {
      maxBytes: 144 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 4_000,
      maxVertices: 5_000,
    },
  }),
  "garden-hero-maker": heroModelMetadata({
    id: "garden-hero-maker",
    label: "Garden Maker temple barque",
    sha256: HERO_MAKER_SHA256,
    url: heroMakerUrl,
    bytes: 96_804,
    dimensions: { x: 12.001, y: 9.064, z: 4.365 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-4, 2.85, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.6, 2.2, 0] },
      masthead: { node: "anchor-masthead", position: [1.5, 7.45, 0] },
      label: { node: "anchor-label", position: [0, 8.8, 0] },
      selection: { node: "anchor-selection", position: [0, 2.4, 0] },
    },
    pickCenter: [0, 3.43, 0],
    pickHeight: 9.064,
    pickRadius: 6.02,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_682, vertices: 3_349 },
    budgets: {
      maxBytes: 96 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 3_000,
      maxVertices: 3_500,
    },
  }),
  "garden-hero-sky": heroModelMetadata({
    id: "garden-hero-sky",
    label: "Garden Sky squadron flagship",
    sha256: HERO_SKY_SHA256,
    url: heroSkyUrl,
    bytes: 102_904,
    dimensions: { x: 12.608, y: 9.764, z: 4.365 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-4.3, 2.9, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [5, 2.4, 0] },
      masthead: { node: "anchor-masthead", position: [1.8, 8.15, 0] },
      label: { node: "anchor-label", position: [0, 9.5, 0] },
      selection: { node: "anchor-selection", position: [0, 2.5, 0] },
    },
    pickCenter: [0, 3.78, 0],
    pickHeight: 9.764,
    pickRadius: 6.32,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_926, vertices: 3_570 },
    budgets: {
      maxBytes: 120 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 3_300,
      maxVertices: 3_700,
    },
  }),
  "garden-hero-ethena": heroModelMetadata({
    id: "garden-hero-ethena",
    label: "Garden Ethena basis runner",
    sha256: HERO_ETHENA_SHA256,
    url: heroEthenaUrl,
    bytes: 83_572,
    dimensions: { x: 14.686, y: 9.74, z: 5.492 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-2.9, 2.3, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.6, 1.8, 0] },
      masthead: { node: "anchor-masthead", position: [1, 8.25, 0] },
      label: { node: "anchor-label", position: [0, 9.6, 0] },
      selection: { node: "anchor-selection", position: [0, 2, 0] },
    },
    pickCenter: [0, 3.87, 0],
    pickHeight: 9.74,
    pickRadius: 7.36,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_794, vertices: 2_714 },
    budgets: {
      maxBytes: 104 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 3_100,
      maxVertices: 3_200,
    },
  }),
  "garden-hero-liberty": heroModelMetadata({
    id: "garden-hero-liberty",
    label: "Garden World Liberty state barge",
    sha256: HERO_LIBERTY_SHA256,
    url: heroLibertyUrl,
    bytes: 110_016,
    dimensions: { x: 13.549, y: 8.88, z: 8.124 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.2, 3.4, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.7, 2.5, 0] },
      masthead: { node: "anchor-masthead", position: [1.1, 7.55, 0] },
      label: { node: "anchor-label", position: [0, 8.9, 0] },
      selection: { node: "anchor-selection", position: [0, 2.2, 0] },
    },
    pickCenter: [0, 3.64, 0],
    pickHeight: 8.88,
    pickRadius: 6.79,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_830, vertices: 3_901 },
    budgets: {
      maxBytes: 128 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 3_400,
      maxVertices: 4_600,
    },
  }),
  "garden-hero-paypal": heroModelMetadata({
    id: "garden-hero-paypal",
    label: "Garden PayPal mail packet",
    sha256: HERO_PAYPAL_SHA256,
    url: heroPaypalUrl,
    bytes: 95_516,
    dimensions: { x: 13.238, y: 8.42, z: 3.453 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.3, 2.4, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.6, 1.75, 0] },
      masthead: { node: "anchor-masthead", position: [3.5, 6.9, 0] },
      label: { node: "anchor-label", position: [0, 8.4, 0] },
      selection: { node: "anchor-selection", position: [0, 2.2, 0] },
    },
    pickCenter: [0, 3.23, 0],
    pickHeight: 8.42,
    pickRadius: 6.64,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_658, vertices: 3_250 },
    budgets: {
      maxBytes: 96 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 3_000,
      maxVertices: 3_500,
    },
  }),
  // W5 (decision D6) — XAUT. The bullion hoy: the only hull in the world that
  // sits DOWN in the water. Deck almost at the waterline, iron-banded topsides,
  // an armoured strongroom under a barrel vault, a lifting crane over it, and a
  // stubby two-mast rig. Every other titan is tall; this is the exception that
  // proves the tier, and the waterline itself is its silhouette.
  "garden-hero-bullion": heroModelMetadata({
    id: "garden-hero-bullion",
    label: "Garden Tether Gold bullion hoy",
    sha256: HERO_BULLION_SHA256,
    url: heroBullionUrl,
    bytes: 74_392,
    dimensions: { x: 9.525, y: 7.23, z: 5.205 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-4.7, 1.85, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [3.9, 1.15, 0] },
      masthead: { node: "anchor-masthead", position: [-2.75, 5.2, 0] },
      label: { node: "anchor-label", position: [0, 6.4, 0] },
      selection: { node: "anchor-selection", position: [0, 1.6, 0] },
    },
    pickCenter: [0, 2.04, 0],
    pickHeight: 7.23,
    pickRadius: 4.78,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_106, vertices: 2_495 },
    budgets: {
      maxBytes: 96 * 1024,
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
