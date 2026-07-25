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

const HERO_TITAN_SHA256 = "6ea4288ddf7d68147b3bcec955d8aec76075b4035a6458273d4073d5eb5d4c9a";
const heroTitanUrl = `/pharosville/models/garden-hero-titan.glb?v=${HERO_TITAN_SHA256.slice(0, 12)}`;
const HERO_HERITAGE_SHA256 = "d58ed297847e84b60f8deaa56a7067480ce2ea7076d41ea4f8338b8b7a678f25";
const heroHeritageUrl = `/pharosville/models/garden-hero-heritage.glb?v=${HERO_HERITAGE_SHA256.slice(0, 12)}`;
const HERO_CARRACK_SHA256 = "ece41287cb456dfc5006b49c050979f43fca22cc22e88524af8c46e8e9ba1e44";
const heroCarrackUrl = `/pharosville/models/garden-hero-carrack.glb?v=${HERO_CARRACK_SHA256.slice(0, 12)}`;
const HERO_BRIGANTINE_SHA256 = "346e894d912d485a1143aca015bed891b959805899c58fe7ec83490d06ac9dfe";
const heroBrigantineUrl = `/pharosville/models/garden-hero-brigantine.glb?v=${HERO_BRIGANTINE_SHA256.slice(0, 12)}`;
const HERO_DHOW_SHA256 = "4c9fd30891fe2b8691d3893f5d91d149bc4f8b8fcbb806ad05dd0456add3da79";
const heroDhowUrl = `/pharosville/models/garden-hero-dhow.glb?v=${HERO_DHOW_SHA256.slice(0, 12)}`;
const HERO_JUNK_SHA256 = "f2f6155c37f7c01bf2a64d65765cfc2b0e6ae69822699c8e536e228d59336222";
const heroJunkUrl = `/pharosville/models/garden-hero-junk.glb?v=${HERO_JUNK_SHA256.slice(0, 12)}`;
const HERO_BARQUENTINE_SHA256 = "80d9007384da9754f52c56a4d1db166b23552878dadc2c6a461b554f9d05933f";
const heroBarquentineUrl = `/pharosville/models/garden-hero-barquentine.glb?v=${HERO_BARQUENTINE_SHA256.slice(0, 12)}`;
const HERO_COG_SHA256 = "44b47d3bab8dd6f2649dca20f9e65efe2f49357760a7c4d1ea6ca3fc96123a58";
const heroCogUrl = `/pharosville/models/garden-hero-cog.glb?v=${HERO_COG_SHA256.slice(0, 12)}`;
const HERO_XEBEC_SHA256 = "c05faa15f16f436e4170736ee8e786ad7afb7ba4d8aa2e9cad76c90c46d9095c";
const heroXebecUrl = `/pharosville/models/garden-hero-xebec.glb?v=${HERO_XEBEC_SHA256.slice(0, 12)}`;
const HERO_CUTTER_SHA256 = "bddd3708c3c53bd125fa6e4b8e8953516b525f132565190e4f837e1333a3f3f5";
const heroCutterUrl = `/pharosville/models/garden-hero-cutter.glb?v=${HERO_CUTTER_SHA256.slice(0, 12)}`;
const HERO_TETHER_SHA256 = "35c7f69b114152a66cc22b54873c425b90c4059bd624df978bba570d623c6cf5";
const heroTetherUrl = `/pharosville/models/garden-hero-tether.glb?v=${HERO_TETHER_SHA256.slice(0, 12)}`;
const HERO_CIRCLE_SHA256 = "b2c4b816501da38ff26e9f215efc87a6dd75c7f80fc882a2eb8c89886191d948";
const heroCircleUrl = `/pharosville/models/garden-hero-circle.glb?v=${HERO_CIRCLE_SHA256.slice(0, 12)}`;
const HERO_MAKER_SHA256 = "ea5d3d6da183cb4f7352d355e0ce9f181e7431d83647c496b9ca4087899e3ef7";
const heroMakerUrl = `/pharosville/models/garden-hero-maker.glb?v=${HERO_MAKER_SHA256.slice(0, 12)}`;
const HERO_SKY_SHA256 = "99e43e9a03c852981b681ecf1a979178faa2ff477ad1765b030c0d33006aa4f6";
const heroSkyUrl = `/pharosville/models/garden-hero-sky.glb?v=${HERO_SKY_SHA256.slice(0, 12)}`;
const HERO_ETHENA_SHA256 = "701f3ed02dfb4ea38a981b948a83de70966140a66d91647d8a6bebc2382d75a1";
const heroEthenaUrl = `/pharosville/models/garden-hero-ethena.glb?v=${HERO_ETHENA_SHA256.slice(0, 12)}`;
const HERO_LIBERTY_SHA256 = "b1e95e1587ff4b782e88f0be14ea5f32e7abb4bc5ff80c0a80de219f53edb2f6";
const heroLibertyUrl = `/pharosville/models/garden-hero-liberty.glb?v=${HERO_LIBERTY_SHA256.slice(0, 12)}`;
const HERO_PAYPAL_SHA256 = "9d86dca0b47fc1420fe01ef89a3758baa39290925bf15d467a1dc8a07dc7f7f2";
const heroPaypalUrl = `/pharosville/models/garden-hero-paypal.glb?v=${HERO_PAYPAL_SHA256.slice(0, 12)}`;

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
    bytes: 111_840,
    dimensions: { x: 13.38, y: 9.084, z: 4.493 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-4.15, 6.15, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [5.5, 2.5, 0] },
      masthead: { node: "anchor-masthead", position: [1.3, 7.5, 0] },
      label: { node: "anchor-label", position: [0, 9.2, 0] },
      selection: { node: "anchor-selection", position: [0, 2.6, 0] },
    },
    pickCenter: [0, 3.44, 0],
    pickHeight: 9.1,
    pickRadius: 6.70,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 3_202, vertices: 3_926 },
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
    bytes: 92_524,
    dimensions: { x: 12.031, y: 7.65, z: 3.295 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.5, 2.75, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.4, 1.85, 0] },
      masthead: { node: "anchor-masthead", position: [0.8, 6.25, 0] },
      label: { node: "anchor-label", position: [0, 7.3, 0] },
      selection: { node: "anchor-selection", position: [0, 1.9, 0] },
    },
    pickCenter: [0, 2.92, 0],
    pickHeight: 7.7,
    pickRadius: 6.05,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_644, vertices: 3_231 },
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
    bytes: 110_336,
    dimensions: { x: 12.796, y: 9.449, z: 4.968 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-4.1, 5.5, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [3.7, 4.2, 0] },
      masthead: { node: "anchor-masthead", position: [0.55, 7.75, 0] },
      label: { node: "anchor-label", position: [0, 9.4, 0] },
      selection: { node: "anchor-selection", position: [0, 2.7, 0] },
    },
    pickCenter: [0, 3.6, 0],
    pickHeight: 9.5,
    pickRadius: 6.40,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 3_096, vertices: 3_862 },
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
    bytes: 72_048,
    dimensions: { x: 12.651, y: 8.544, z: 3.633 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.3, 2.2, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.3, 1.75, 0] },
      masthead: { node: "anchor-masthead", position: [2.45, 6.85, 0] },
      label: { node: "anchor-label", position: [0, 8.1, 0] },
      selection: { node: "anchor-selection", position: [0, 1.8, 0] },
    },
    pickCenter: [0, 3.32, 0],
    pickHeight: 8.6,
    pickRadius: 6.35,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_102, vertices: 2_413 },
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
    bytes: 76_168,
    dimensions: { x: 11.897, y: 9.571, z: 3.316 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.6, 3.1, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.4, 2.4, 0] },
      masthead: { node: "anchor-masthead", position: [-2.7, 6.3, 0] },
      label: { node: "anchor-label", position: [0, 9.2, 0] },
      selection: { node: "anchor-selection", position: [0, 1.8, 0] },
    },
    pickCenter: [0, 3.79, 0],
    pickHeight: 9.6,
    pickRadius: 5.95,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_074, vertices: 2_558 },
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
    bytes: 77_872,
    dimensions: { x: 11.205, y: 9.48, z: 4.3 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-5.05, 4.7, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.6, 2.5, 0] },
      masthead: { node: "anchor-masthead", position: [0.35, 8.2, 0] },
      label: { node: "anchor-label", position: [0, 9.4, 0] },
      selection: { node: "anchor-selection", position: [0, 2.4, 0] },
    },
    pickCenter: [0, 3.96, 0],
    pickHeight: 9.5,
    pickRadius: 5.65,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_236, vertices: 2_639 },
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
    bytes: 91_508,
    dimensions: { x: 13.398, y: 9.2, z: 3.877 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.65, 2.5, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.7, 1.95, 0] },
      masthead: { node: "anchor-masthead", position: [3.8, 7.3, 0] },
      label: { node: "anchor-label", position: [0, 8.6, 0] },
      selection: { node: "anchor-selection", position: [0, 2, 0] },
    },
    pickCenter: [0, 3.6, 0],
    pickHeight: 9.2,
    pickRadius: 6.70,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_684, vertices: 3_160 },
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
    bytes: 78_124,
    dimensions: { x: 13.129, y: 9.216, z: 4.707 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.95, 4.6, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.05, 4.5, 0] },
      masthead: { node: "anchor-masthead", position: [0.2, 7.8, 0] },
      label: { node: "anchor-label", position: [0, 9, 0] },
      selection: { node: "anchor-selection", position: [0, 2.6, 0] },
    },
    pickCenter: [0, 3.65, 0],
    pickHeight: 9.3,
    pickRadius: 6.60,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_072, vertices: 2_602 },
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
    bytes: 87_484,
    dimensions: { x: 14.146, y: 9.64, z: 3.484 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-5.75, 2.8, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.9, 1.8, 0] },
      masthead: { node: "anchor-masthead", position: [0.15, 8.2, 0] },
      label: { node: "anchor-label", position: [0, 9.4, 0] },
      selection: { node: "anchor-selection", position: [0, 1.9, 0] },
    },
    pickCenter: [0, 3.82, 0],
    pickHeight: 9.7,
    pickRadius: 7.10,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_428, vertices: 2_959 },
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
    bytes: 76_808,
    dimensions: { x: 13.32, y: 10.54, z: 3.171 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.4, 1.55, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [3.9, 1.6, 0] },
      masthead: { node: "anchor-masthead", position: [0.5, 9.1, 0] },
      label: { node: "anchor-label", position: [0, 10.2, 0] },
      selection: { node: "anchor-selection", position: [0, 1.6, 0] },
    },
    pickCenter: [0, 4.21, 0],
    pickHeight: 10.6,
    pickRadius: 6.70,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_044, vertices: 2_551 },
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
    bytes: 119_036,
    dimensions: { x: 12.853, y: 9.9, z: 5.515 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-4.3, 6.9, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.6, 2.3, 0] },
      masthead: { node: "anchor-masthead", position: [-0.1, 8.05, 0] },
      label: { node: "anchor-label", position: [0, 9.6, 0] },
      selection: { node: "anchor-selection", position: [0, 2.9, 0] },
    },
    pickCenter: [0, 3.63, 0],
    pickHeight: 9.9,
    pickRadius: 6.45,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 3_218, vertices: 4_212 },
    budgets: {
      maxBytes: 136 * 1024,
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
    bytes: 87_544,
    dimensions: { x: 13.602, y: 9.93, z: 3.989 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-4.5, 3.2, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.9, 2.05, 0] },
      masthead: { node: "anchor-masthead", position: [0.5, 8.35, 0] },
      label: { node: "anchor-label", position: [0, 9.8, 0] },
      selection: { node: "anchor-selection", position: [0, 2.4, 0] },
    },
    pickCenter: [0, 3.89, 0],
    pickHeight: 10.0,
    pickRadius: 6.85,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_580, vertices: 2_990 },
    budgets: {
      maxBytes: 96 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 3_300,
      maxVertices: 3_800,
    },
  }),
  "garden-hero-maker": heroModelMetadata({
    id: "garden-hero-maker",
    label: "Garden Maker temple barque",
    sha256: HERO_MAKER_SHA256,
    url: heroMakerUrl,
    bytes: 82_204,
    dimensions: { x: 11.68, y: 9.064, z: 4.365 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-4, 2.85, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.6, 2.2, 0] },
      masthead: { node: "anchor-masthead", position: [1.5, 7.45, 0] },
      label: { node: "anchor-label", position: [0, 8.8, 0] },
      selection: { node: "anchor-selection", position: [0, 2.4, 0] },
    },
    pickCenter: [0, 3.43, 0],
    pickHeight: 9.1,
    pickRadius: 5.85,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_362, vertices: 2_772 },
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
    bytes: 86_764,
    dimensions: { x: 12.333, y: 9.764, z: 4.365 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-4.3, 2.9, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [5, 2.4, 0] },
      masthead: { node: "anchor-masthead", position: [1.8, 8.15, 0] },
      label: { node: "anchor-label", position: [0, 9.5, 0] },
      selection: { node: "anchor-selection", position: [0, 2.5, 0] },
    },
    pickCenter: [0, 3.78, 0],
    pickHeight: 9.8,
    pickRadius: 6.20,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_574, vertices: 2_938 },
    budgets: {
      maxBytes: 96 * 1024,
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
    bytes: 67_500,
    dimensions: { x: 14.465, y: 9.74, z: 4.933 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-2.9, 2.3, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.6, 1.8, 0] },
      masthead: { node: "anchor-masthead", position: [1, 8.25, 0] },
      label: { node: "anchor-label", position: [0, 9.6, 0] },
      selection: { node: "anchor-selection", position: [0, 2, 0] },
    },
    pickCenter: [0, 3.87, 0],
    pickHeight: 9.8,
    pickRadius: 7.25,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_426, vertices: 2_055 },
    budgets: {
      maxBytes: 80 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 3_100,
      maxVertices: 2_600,
    },
  }),
  "garden-hero-liberty": heroModelMetadata({
    id: "garden-hero-liberty",
    label: "Garden World Liberty state barge",
    sha256: HERO_LIBERTY_SHA256,
    url: heroLibertyUrl,
    bytes: 78_224,
    dimensions: { x: 12.074, y: 8.88, z: 4.664 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.2, 3.4, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.7, 2.5, 0] },
      masthead: { node: "anchor-masthead", position: [1.1, 7.55, 0] },
      label: { node: "anchor-label", position: [0, 8.9, 0] },
      selection: { node: "anchor-selection", position: [0, 2.2, 0] },
    },
    pickCenter: [0, 3.64, 0],
    pickHeight: 8.9,
    pickRadius: 6.05,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_138, vertices: 2_646 },
    budgets: {
      maxBytes: 88 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 2_700,
      maxVertices: 3_400,
    },
  }),
  "garden-hero-paypal": heroModelMetadata({
    id: "garden-hero-paypal",
    label: "Garden PayPal mail packet",
    sha256: HERO_PAYPAL_SHA256,
    url: heroPaypalUrl,
    bytes: 84_076,
    dimensions: { x: 12.968, y: 8.42, z: 3.453 },
    anchors: {
      "lantern-stern": { node: "anchor-lantern-stern", position: [-3.3, 2.4, 0] },
      "lantern-bow": { node: "anchor-lantern-bow", position: [4.6, 1.75, 0] },
      masthead: { node: "anchor-masthead", position: [3.5, 6.9, 0] },
      label: { node: "anchor-label", position: [0, 8.4, 0] },
      selection: { node: "anchor-selection", position: [0, 2.2, 0] },
    },
    pickCenter: [0, 3.23, 0],
    pickHeight: 8.5,
    pickRadius: 6.50,
    geometry: { drawCalls: 5, materials: 5, textures: 0, triangles: 2_398, vertices: 2_791 },
    budgets: {
      maxBytes: 96 * 1024,
      maxDrawCalls: 5,
      maxMaterials: 5,
      maxTextures: 0,
      maxTriangles: 3_000,
      maxVertices: 3_500,
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
