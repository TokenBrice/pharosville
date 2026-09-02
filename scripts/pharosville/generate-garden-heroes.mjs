import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Int16BufferAttribute,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  Uint8BufferAttribute,
  Vector3,
} from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { compressGlbWithMeshopt, measureMeshoptDeviation } from "./glb-meshopt.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelsDir = resolve(repoRoot, "public/pharosville/models");
const checkOnly = process.argv.includes("--check");

// Waterline sits at y=0: keels dip below, superstructure rises above. Wood is a
// 3-tone ramp painted per-vertex (dark wet waterline -> mid flank -> warm
// gunwale), with a flat warm "trim" tone forced onto rails, strakes, emblems
// and the figurehead. Hulls are indexed lofts (stations x ring profile) so the
// curved sheer and tumblehome are real geometry, not a texture trick.
const WOOD_LOW = new Color("#33261b");
const WOOD_MID = new Color("#6a4f34");
const WOOD_HIGH = new Color("#a97e49");
const WOOD_TRIM = new Color("#caa25e");
const WOOD_WALE = new Color("#241a12");
const GUNPORT_DARK = new Color("#171008");
const SAIL_LOW = new Color("#b7a988");
const SAIL_HIGH = new Color("#e9dec6");
const SAIL_FURLED = new Color("#9c8f70");

// Ring cross-section height fractions from keel (0) to gunwale (1); mirrored
// to port automatically. Width comes from profileWidth below.
const HULL_RING_H = [0, 0.11, 0.25, 0.4, 0.55, 0.69, 0.8, 0.89, 0.95, 1];

installFileReader();

// Wave 8: the checked hero fleet speaks the same six-family East-Asian hull
// language as the procedural fleet. IDs are intentionally historical runtime
// contracts; the family field, not the old id, now owns each silhouette.
const HERO_MODELS = [
  easternHero("garden-hero-titan", "bezaisen", "grand"),
  easternHero("garden-hero-heritage", "bezaisen", "weathered"),
  easternHero("garden-hero-carrack", "takasebune", "fortified"),
  easternHero("garden-hero-brigantine", "kobaya", "swift"),
  easternHero("garden-hero-dhow", "kobaya", "triangular"),
  easternHero("garden-hero-junk", "junk", "classic"),
  easternHero("garden-hero-barquentine", "twinhull", "trader"),
  easternHero("garden-hero-cog", "scow", "cargo"),
  easternHero("garden-hero-xebec", "junk", "raked"),
  easternHero("garden-hero-cutter", "kobaya", "small"),
  easternHero("garden-hero-tether", "bezaisen", "flagship"),
  easternHero("garden-hero-circle", "takasebune", "circle"),
  easternHero("garden-hero-maker", "twinhull", "council"),
  easternHero("garden-hero-sky", "twinhull", "sky"),
  easternHero("garden-hero-ethena", "junk", "ethena"),
  easternHero("garden-hero-liberty", "bezaisen", "liberty"),
  easternHero("garden-hero-paypal", "takasebune", "packet"),
  easternHero("garden-hero-bullion", "scow", "bullion"),
];

const summaries = [];
for (const model of HERO_MODELS) {
  const { root, summary } = model.build();
  const scene = new Scene();
  scene.name = `${model.id}-scene`;
  scene.add(root);

  const exported = await new GLTFExporter().parseAsync(scene, {
    animations: [],
    binary: true,
    includeCustomExtensions: false,
    onlyVisible: true,
    trs: false,
  });
  if (!(exported instanceof ArrayBuffer)) {
    throw new Error(`GLTFExporter did not return a binary ArrayBuffer for ${model.id}.`);
  }

  const raw = Buffer.from(exported);
  const bytes = await compressGlbWithMeshopt(raw);
  const positionDeviation = await measureMeshoptDeviation(raw, bytes);
  const glb = inspectGlb(bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const outputPath = resolve(modelsDir, `${model.id}.glb`);

  if (checkOnly) {
    const current = await readFile(outputPath);
    if (!current.equals(bytes)) {
      throw new Error(
        `${model.id}.glb is stale; rerun this generator without --check.`,
      );
    }
  } else {
    await mkdir(modelsDir, { recursive: true });
    await writeFile(outputPath, bytes);
  }

  summaries.push({
    id: model.id,
    anchors: summary.anchors,
    bounds: summary.boundsY,
    bytes: bytes.byteLength,
    dimensions: summary.dimensions,
    drawCalls: summary.drawCalls,
    materials: summary.materials,
    meshes: glb.json.meshes?.length ?? 0,
    nodes: glb.json.nodes?.length ?? 0,
    output: outputPath,
    positionDeviation,
    sha256,
    textures: glb.json.textures?.length ?? 0,
    triangles: summary.triangles,
    uncompressedBytes: raw.byteLength,
    vertices: summary.vertices,
  });
}

console.log(JSON.stringify(summaries, null, 2));

function easternHeroAnchors() {
  return {
  "garden-hero-titan": { bow: [5.5, 2.5, 0], label: [0, 9.2, 0], masthead: [1.3, 7.5, 0], selection: [0, 2.6, 0], stern: [-4.15, 6.15, 0] },
  "garden-hero-heritage": { bow: [4.4, 1.85, 0], label: [0, 7.3, 0], masthead: [0.8, 6.25, 0], selection: [0, 1.9, 0], stern: [-3.5, 2.75, 0] },
  "garden-hero-carrack": { bow: [5.7, 1.55, 0], label: [0, 7.6, 0], masthead: [0.55, 6.4, 0], selection: [0, 1.8, 0], stern: [-5.4, 2.3, 0] },
  "garden-hero-brigantine": { bow: [5.1, 1.45, 0], label: [0, 7.5, 0], masthead: [2.45, 6.2, 0], selection: [0, 1.5, 0], stern: [-3.3, 1.8, 0] },
  "garden-hero-dhow": { bow: [4.4, 2.4, 0], label: [0, 9.2, 0], masthead: [-2.7, 6.3, 0], selection: [0, 1.8, 0], stern: [-3.6, 3.1, 0] },
  "garden-hero-junk": { bow: [4.6, 2.5, 0], label: [0, 9.4, 0], masthead: [0.35, 8.2, 0], selection: [0, 2.4, 0], stern: [-5.05, 4.7, 0] },
  "garden-hero-barquentine": { bow: [4.5, 1.35, 0], label: [0, 7.8, 0], masthead: [3.1, 6.7, 0], selection: [0, 1.6, 0], stern: [-3.7, 1.7, 0] },
  "garden-hero-cog": { bow: [3.7, 1.3, 0], label: [0, 6.1, 0], masthead: [0.2, 4.8, 0], selection: [0, 1.5, 0], stern: [-3.7, 1.6, 0] },
  "garden-hero-xebec": { bow: [4.2, 1.6, 0], label: [0, 9.1, 0], masthead: [0.15, 7.8, 0], selection: [0, 1.8, 0], stern: [-4.1, 2.5, 0] },
  "garden-hero-cutter": { bow: [4.8, 1.25, 0], label: [0, 6.9, 0], masthead: [0.5, 5.8, 0], selection: [0, 1.3, 0], stern: [-2.8, 1.5, 0] },
  "garden-hero-tether": { bow: [4.6, 2.3, 0], label: [0, 9.6, 0], masthead: [-0.1, 8.05, 0], selection: [0, 2.9, 0], stern: [-4.3, 6.9, 0] },
  "garden-hero-circle": { bow: [5.8, 1.45, 0], label: [0, 8, 0], masthead: [0.5, 6.8, 0], selection: [0, 1.7, 0], stern: [-5.4, 2.1, 0] },
  "garden-hero-maker": { bow: [4.4, 1.35, 0], label: [0, 7.9, 0], masthead: [1.5, 6.8, 0], selection: [0, 1.7, 0], stern: [-3.8, 2.3, 0] },
  "garden-hero-sky": { bow: [4.5, 1.4, 0], label: [0, 8.3, 0], masthead: [1.8, 7.2, 0], selection: [0, 1.8, 0], stern: [-3.9, 2.2, 0] },
  "garden-hero-ethena": { bow: [4.1, 1.55, 0], label: [0, 9.3, 0], masthead: [1, 8, 0], selection: [0, 1.8, 0], stern: [-3.9, 2.4, 0] },
  "garden-hero-liberty": { bow: [4.7, 2.5, 0], label: [0, 8.9, 0], masthead: [1.1, 7.55, 0], selection: [0, 2.2, 0], stern: [-3.2, 3.4, 0] },
  "garden-hero-paypal": { bow: [5.8, 1.4, 0], label: [0, 7.4, 0], masthead: [3.5, 6.2, 0], selection: [0, 1.6, 0], stern: [-5.3, 2, 0] },
  "garden-hero-bullion": { bow: [3.7, 1.05, 0], label: [0, 5.8, 0], masthead: [-2.75, 4.5, 0], selection: [0, 1.4, 0], stern: [-3.8, 1.55, 0] },
  };
}

function easternHero(id, family, variant) {
  return { build: () => buildEasternHero(id, family, variant), id };
}

/**
 * Compact shared authoring kit for the six fleet families. The exaggerated
 * massing is deliberate: beam, deckhouse, hull count and sail outline must
 * survive a 20 px render before small fittings or livery become legible.
 */
function buildEasternHero(id, family, variant) {
  const builder = createBuilder(id);
  const { add } = builder;
  const anchors = easternHeroAnchors()[id];
  const mastX = anchors.masthead[0];
  const mastTop = anchors.masthead[1];

  if (family === "bezaisen") addBezaisen(add, variant, mastX, mastTop);
  else if (family === "kobaya") addKobaya(add, variant, mastX, mastTop);
  else if (family === "twinhull") addTwinHull(add, variant, mastX, mastTop);
  else if (family === "takasebune") addTakasebune(add, variant, mastX, mastTop);
  else if (family === "junk") addEasternJunk(add, variant, mastX, mastTop);
  else addScow(add, variant, mastX, mastTop);

  add("glow", new BoxGeometry(0.34, 0.32, 0.18), {
    position: [anchors.stern[0], Math.min(anchors.stern[1], mastTop - 0.55), 0],
  });
  add("glow", new BoxGeometry(0.28, 0.28, 0.18), {
    position: [anchors.bow[0], Math.min(anchors.bow[1], mastTop - 0.7), 0],
  });
  addBanner(add, anchors.masthead, variant === "flagship" ? 1.45 : 0.9, 0.34);

  builder.addAnchor("anchor-lantern-stern", anchors.stern, "lantern-stern");
  builder.addAnchor("anchor-lantern-bow", anchors.bow, "lantern-bow");
  builder.addAnchor("anchor-masthead", anchors.masthead, "masthead");
  builder.addAnchor("anchor-selection", anchors.selection, "selection");
  builder.addAnchor("anchor-label", anchors.label, "label");
  return builder.finalize({ assertZSymmetric: true });
}

function familyStations({ beam, bow = 5, deck = 1.2, depth = 0.8, length = 10, rise = 0.35, zOffset = 0 }) {
  return hullStations({
    bowSharpness: 1.65,
    bowTrim: 0.98,
    bowX: bow,
    count: 13,
    deckMid: deck,
    deckRiseBow: rise,
    deckRiseStern: rise * 0.65,
    keelDepth: depth,
    keelFlatness: 0.72,
    maxBeam: beam,
    sternX: bow - length,
    transomFraction: 0.74,
    tumbleAft: 0.9,
    tumbleBow: 0.94,
  }).map((station) => ({ ...station, zOffset }));
}

function addFamilyHull(add, stations, bulwarkHeight = 0.24) {
  addHullLoft(add, stations, { bulwarkHeight, gunports: false });
  addStrake(add, stations, { h0: 0.88, h1: 0.97, paint: true, tone: WOOD_TRIM });
}

function addBezaisen(add, variant, mastX, mastTop) {
  const flagship = variant === "flagship";
  const beam = flagship ? 2.45 : variant === "grand" ? 2.2 : 1.92;
  const stations = familyStations({ beam, bow: flagship ? 5.6 : 5.15, deck: 1.28, depth: 0.92, length: flagship ? 11.6 : 10.3, rise: 0.48 });
  addFamilyHull(add, stations, 0.34);
  const sternHeight = flagship ? 3.75 : variant === "grand" ? 3.3 : 2.65;
  add("wood", new BoxGeometry(3.25, sternHeight, beam * 1.52), {
    position: [-3.25, 1.3 + sternHeight / 2, 0], tone: variant === "weathered" ? WOOD_MID : WOOD_HIGH,
  });
  add("trim", new BoxGeometry(3.65, 0.18, beam * 1.72), {
    position: [-3.25, 1.3 + sternHeight, 0], tone: WOOD_TRIM,
  });
  add("wood", new BoxGeometry(3.1, 1.15, beam * 1.32), { position: [0.1, 1.95, 0] });
  add("wood", new CylinderGeometry(beam * 0.9, beam * 0.9, 3.8, 4), {
    position: [0.1, 2.72, 0], rotation: [0, 0, Math.PI / 2], tone: WOOD_HIGH,
  });
  addMast(add, mastX, 1.55, mastTop + 0.12, -0.025, { platform: false });
  // The procedural identity sail survives hero attachment and is re-homed to
  // this mast. It is the bezaisen's ONE enormous rectangular course: leave
  // the GLB course slot empty, with broad head/foot yards framing that cloth.
  addIdentityFrame(add, mastX, mastTop * 0.38, mastTop * 0.88, 2.0);
}

function addKobaya(add, variant, mastX, mastTop) {
  const small = variant === "small";
  const stations = familyStations({ beam: small ? 0.72 : 0.9, bow: 5.25, deck: 0.82, depth: 0.52, length: small ? 8.6 : 10.4, rise: 0.22 });
  addFamilyHull(add, stations, 0.16);
  add("wood", new BoxGeometry(2.1, 0.75, 1.22), { position: [-2.7, 1.25, 0] });
  add("trim", new BoxGeometry(2.4, 0.13, 1.48), { position: [-2.7, 1.7, 0], tone: WOOD_TRIM });
  add("spar", new CylinderGeometry(0.055, 0.09, small ? 3.2 : 4.3, 5), {
    position: [6.25, 1.45, 0], rotation: [0, 0, Math.PI / 2 - 0.2],
  });
  addMast(add, mastX, 1.0, mastTop + 0.08, -0.055, { platform: false });
  addLateen(add, [mastX + 0.15, mastTop - 0.25, 0], [mastX + 0.1, 2.1, 0], [mastX - 3.0, 2.45, 0], 0.34);
  const foreX = Math.min(3.25, mastX + 2.7);
  addMast(add, foreX, 0.98, mastTop * 0.78, -0.035, { platform: false });
  addJib(add, [foreX, mastTop * 0.7, 0], [5.9, 2.0, 0], [foreX, 1.5, 0], 0.26);
  if (variant === "triangular") add("wood", new ConeGeometry(0.72, 0.55, 4), { position: [-2.6, 2.05, 0], rotation: [0, Math.PI / 4, 0], tone: WOOD_HIGH });
  if (variant === "swift") addOarBank(add, { count: 4, deckY: 0.96, halfBeam: 0.88, length: 1.6, spacing: 0.9, x: 0 });
}

function addTwinHull(add, variant, mastX, mastTop) {
  const offset = variant === "council" ? 1.45 : 1.3;
  for (const side of [-1, 1]) {
    addFamilyHull(add, familyStations({ beam: 0.58, bow: 4.8, deck: 0.72, depth: 0.52, length: 9.2, rise: 0.18, zOffset: side * offset }), 0.12);
  }
  add("wood", new BoxGeometry(6.8, 0.24, offset * 2 + 1.05), { position: [0, 1.02, 0] });
  add("trim", new BoxGeometry(4.0, 0.16, offset * 2 + 1.25), { position: [-0.6, 1.22, 0], tone: WOOD_TRIM });
  for (const side of [-1, 1]) {
    const top = mastTop - (side > 0 ? 0.05 : 0.65);
    add("spar", new CylinderGeometry(0.07, 0.1, top - 1.15, 6), { position: [mastX, (top + 1.15) / 2, side * offset] });
    add("sail", triangleSailGeometry([mastX, top - 0.25, side * offset], [mastX, 2.0, side * offset], [mastX - 2.35, 2.2, side * offset], 0.22));
  }
  if (variant === "council") addTorii(add, -1.1, 1.28, offset * 1.15);
  else if (variant === "sky") addSunArch(add, { halfBeam: offset, height: 1.35, radius: 0.5, x: -0.8, y: 1.22 });
  else addPavilion(add, { halfBeam: offset * 0.72, height: 1.0, length: 2.2, x: -1.25 });
}

function addTakasebune(add, variant, mastX, mastTop) {
  const stations = familyStations({ beam: 1.25, bow: 6.25, deck: 0.72, depth: 0.48, length: 12.5, rise: 0.12 });
  addFamilyHull(add, stations, 0.13);
  const bays = variant === "packet" ? 5 : 4;
  for (let index = 0; index < bays; index += 1) {
    const x = -3.6 + index * 1.65;
    add("wood", new BoxGeometry(1.38, 0.7, 1.85), { position: [x, 1.18, 0], tone: index % 2 ? WOOD_MID : WOOD_HIGH });
    add("wood", new CylinderGeometry(1.08, 1.08, 1.52, 4), { position: [x, 1.75, 0], rotation: [0, 0, Math.PI / 2], tone: WOOD_HIGH });
  }
  addMast(add, mastX, 0.9, mastTop + 0.08, -0.025, { platform: false });
  addLateen(add, [mastX, mastTop - 0.25, 0], [mastX, 2.1, 0], [mastX - 2.6, 2.35, 0], 0.28);
  addIdentityFrame(add, mastX, mastTop * 0.42, mastTop * 0.64, 1.05);
  if (variant === "circle") addSunArch(add, { halfBeam: 0.72, height: 1.0, radius: 0.46, x: -4.15, y: 1.0 });
  if (variant === "fortified") add("wood", new BoxGeometry(2.1, 1.25, 2.2), { position: [-4.45, 2.25, 0] });
}

function addEasternJunk(add, variant, mastX, mastTop) {
  const stations = familyStations({ beam: 1.72, bow: 4.35, deck: 1.12, depth: 0.62, length: 8.9, rise: 0.26 });
  addFamilyHull(add, stations, 0.28);
  add("wood", new BoxGeometry(2.45, 1.2, 2.55), { position: [-3.05, 1.95, 0] });
  add("trim", new BoxGeometry(2.75, 0.15, 2.85), { position: [-3.05, 2.62, 0], tone: WOOD_TRIM });
  addMast(add, mastX, 1.35, mastTop + 0.08, variant === "raked" ? -0.08 : -0.025, { platform: false });
  addBattenedLug(add, { aft: variant === "raked" ? 3.0 : 2.65, battens: 5, billow: 0.28, footY: 2.45, forward: 0.72, mastX, topY: mastTop - 0.25 });
  const aftX = mastX - 2.65;
  addMast(add, aftX, 1.25, mastTop * 0.72, -0.04, { platform: false });
  addBattenedLug(add, { aft: 1.45, battens: 4, billow: 0.2, footY: 2.25, forward: 0.4, mastX: aftX, topY: mastTop * 0.69 });
  if (variant === "ethena") addTorii(add, -3.2, 2.68, 1.18);
}

function addScow(add, variant, mastX, mastTop) {
  const stations = familyStations({ beam: variant === "bullion" ? 2.45 : 2.15, bow: 4.1, deck: 0.78, depth: 0.95, length: 8.2, rise: 0.12 });
  addFamilyHull(add, stations, 0.22);
  add("wood", new SphereGeometry(1.45, 9, 6), { position: [-0.65, 1.25, 0], scale: [1.65, 0.72, 1.5], tone: WOOD_MID });
  addMast(add, mastX, 1.0, mastTop + 0.08, -0.02, { platform: false });
  addSquareSail(add, mastX, mastTop * 0.62, 1.55, 1.55, { yaw: 0.04 });
  if (variant === "bullion") {
    add("wood", new BoxGeometry(2.7, 1.15, 2.8), { position: [1.2, 1.65, 0], tone: WOOD_WALE });
    add("trim", new BoxGeometry(2.95, 0.16, 3.05), { position: [1.2, 2.3, 0], tone: WOOD_TRIM });
  } else {
    for (const x of [-2.4, 1.75]) add("wood", new BoxGeometry(1.35, 0.8, 1.55), { position: [x, 1.35, 0] });
  }
}

function addTorii(add, x, y, halfBeam) {
  for (const side of [-1, 1]) add("wood", new CylinderGeometry(0.09, 0.12, 1.5, 6), { position: [x, y + 0.75, side * halfBeam], tone: WOOD_TRIM });
  add("trim", new BoxGeometry(0.18, 0.18, halfBeam * 2 + 0.8), { position: [x, y + 1.52, 0], tone: WOOD_TRIM });
  add("trim", new BoxGeometry(0.16, 0.14, halfBeam * 2 + 1.15), { position: [x, y + 1.78, 0], tone: WOOD_TRIM });
}

function createBuilder(assetId) {
  const root = new Group();
  root.name = assetId;
  root.userData = {
    assetId,
    license: "MIT",
    provenance: "agent-authored deterministic procedural geometry",
    upAxis: "+Y",
  };

  const materials = new Map([
    // Double-sided so the lofted hull and bulwark read from every angle even
    // where the camera sees an inner face through the open deck.
    ["wood", new MeshStandardMaterial({
      color: "#ffffff",
      flatShading: true,
      name: "hero-wood",
      roughness: 0.84,
      side: 2,
      vertexColors: true,
    })],
    // W1/D2: the sheer strake, kept out of `wood` so the runtime can paint it
    // in the issuer's colour. Authored white with vertex colours, like `wood`,
    // so a runtime multiply modulates the baked trim shading instead of
    // flattening it.
    ["trim", new MeshStandardMaterial({
      color: "#ffffff",
      flatShading: true,
      name: "hero-trim",
      roughness: 0.84,
      side: 2,
      vertexColors: true,
    })],
    // W6: a low warm emissive so the rigging catches the lantern at night.
    // Emissive does not depend on scene lighting, so at 0.05 it is invisible
    // against a bright daylit frame and clearly present against a dark one —
    // the effect wanted, without a per-frame material update.
    ["spar", new MeshStandardMaterial({
      color: "#2e2620",
      emissive: "#5a3c18",
      emissiveIntensity: 0.05,
      flatShading: true,
      name: "hero-spar",
      roughness: 0.9,
    })],
    ["sail", new MeshStandardMaterial({
      color: "#ffffff",
      name: "hero-canvas",
      roughness: 0.8,
      side: 2,
      vertexColors: true,
    })],
    ["glow", new MeshStandardMaterial({
      color: "#3a2a18",
      emissive: "#ffc879",
      emissiveIntensity: 1.4,
      flatShading: true,
      name: "hero-gallery-glow",
      roughness: 0.5,
      // Gallery windows are single quads (not boxes) to save vertices.
      side: 2,
      toneMapped: false,
    })],
  ]);
  const geometryByMaterial = new Map(
    [...materials.keys()].map((name) => [name, []]),
  );

  const add = (materialName, geometry, transform = {}) => {
    const matrix = new Matrix4();
    matrix.compose(
      new Vector3(...(transform.position ?? [0, 0, 0])),
      eulerQuaternion(...(transform.rotation ?? [0, 0, 0])),
      new Vector3(...(transform.scale ?? [1, 1, 1])),
    );
    geometry.applyMatrix4(matrix);
    if (materialName === "wood" || materialName === "trim") {
      paintWood(geometry, transform.tone ?? null);
    }
    else if (materialName === "sail") paintSail(geometry, transform.furled ?? false);
    // Every part stays indexed: indexed merges keep the vertex budget low
    // enough for the 1.5-3k triangle target without a budget raise.
    if (geometry.index === null) {
      throw new Error(`${assetId} part must be indexed before merging.`);
    }
    geometryByMaterial.get(materialName).push(geometry);
  };

  const anchors = {};

  return {
    add,
    addAnchor(name, position, role) {
      addAnchor(root, name, position, role);
      anchors[role] = position;
    },
    finalize({ assertZSymmetric }) {
      let triangles = 0;
      let vertices = 0;
      for (const [materialName, geometries] of geometryByMaterial) {
        if (geometries.length === 0) continue;
        const geometry = mergeGeometries(geometries, false);
        if (geometry === null) {
          throw new Error(`Could not merge ${materialName} geometry for ${assetId}.`);
        }
        geometry.name = `${materialName}-geometry`;
        // UVs are dead weight in a vertex-colored, texture-less asset; drop
        // them post-merge to keep the GLB lean.
        geometry.deleteAttribute("uv");
        quantizeAttributes(geometry);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        vertices += geometry.getAttribute("position").count;
        triangles += geometry.index === null
          ? geometry.getAttribute("position").count / 3
          : geometry.index.count / 3;
        const mesh = new Mesh(geometry, materials.get(materialName));
        mesh.name = `${materialName}-hull`;
        mesh.castShadow = true;
        mesh.receiveShadow = materialName === "wood";
        root.add(mesh);
      }

      root.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(root);
      const size = bounds.getSize(new Vector3());
      if (assertZSymmetric && Math.abs(bounds.min.z + bounds.max.z) > 0.001) {
        throw new Error(
          `${assetId} hull is not symmetric across z: ${JSON.stringify({
            max: bounds.max.toArray(),
            min: bounds.min.toArray(),
          })}`,
        );
      }

      return {
        root,
        summary: {
          anchors,
          bounds,
          boundsY: { max: round(bounds.max.y), min: round(bounds.min.y) },
          dimensions: { x: round(size.x), y: round(size.y), z: round(size.z) },
          drawCalls: root.children.filter((child) => child instanceof Mesh).length,
          materials: [...geometryByMaterial].filter(([, g]) => g.length > 0).length,
          triangles,
          vertices,
        },
      };
    },
  };
}

/**
 * W5.6 (decision D8): shrink the interleaved vertex payload before export.
 *
 * - NORMAL -> normalized SHORT. Quantization error is at most 1/32767 per
 *   component, well inside the 0.0005 unit-length tolerance the exporter and
 *   glTF-validator apply, so the exporter keeps the integer attribute instead
 *   of rebuilding a float one. Needs `KHR_mesh_quantization`, which
 *   `GLTFExporter` detects and declares itself; three r18x reads it natively,
 *   so no browser-side decoder is added.
 * - COLOR_0 -> normalized UNSIGNED_BYTE. This is core glTF 2.0, not an
 *   extension, and 8 bits per channel is exactly what the wood ramp was
 *   authored against.
 *
 * POSITION deliberately stays FLOAT. Quantizing it would require a
 * dequantization scale/translation on the mesh node, and `garden-models.ts`
 * asserts a base-centre origin at unit scale that the hero attach path and the
 * anchor contract both depend on. The bytes are not worth breaking that.
 */
function quantizeAttributes(geometry) {
  const normal = geometry.getAttribute("normal");
  if (normal !== undefined) {
    const packed = new Int16Array(normal.count * 3);
    for (let index = 0; index < normal.count; index += 1) {
      const at = index * 3;
      // Degenerate triangles (collapsed sail columns, the keel ring closure)
      // leave zero-length normals behind. Unitise here — otherwise the
      // exporter rejects the whole attribute and rebuilds it as FLOAT, which
      // silently undoes the quantization.
      const [x, y, z] = [normal.array[at], normal.array[at + 1], normal.array[at + 2]];
      const length = Math.hypot(x, y, z);
      const unit = length > 1e-6 ? [x / length, y / length, z / length] : [1, 0, 0];
      for (let axis = 0; axis < 3; axis += 1) {
        const value = Math.round(unit[axis] * 32767);
        packed[at + axis] = Math.min(32767, Math.max(-32767, value));
      }
    }
    geometry.setAttribute("normal", new Int16BufferAttribute(packed, 3, true));
  }

  const color = geometry.getAttribute("color");
  if (color !== undefined) {
    const packed = new Uint8Array(color.count * 3);
    for (let index = 0; index < packed.length; index += 1) {
      packed[index] = Math.round(clamp01(color.array[index]) * 255);
    }
    geometry.setAttribute("color", new Uint8BufferAttribute(packed, 3, true));
  }
}

/**
 * Parametric station table for a lofted hull. Each station carries its
 * waterline half-beam, deck half-beam (tumblehome: deck narrower than the
 * waterline), deck height (the curved sheer) and keel depth.
 */
function hullStations({
  bowSharpness = 1.6,
  bowTrim = 0.985,
  bowX,
  count,
  deckMid,
  deckRiseBow,
  deckRiseStern,
  keelDepth,
  keelFlatness = 0,
  maxBeam,
  sternX,
  transomFraction,
  tumbleAft,
  tumbleBow,
}) {
  const stations = [];
  for (let index = 0; index < count; index += 1) {
    const t = index / (count - 1);
    // Beam plan: full midships, transom fraction at the stern, a powered taper
    // to the stem (higher sharpness = finer clipper entry).
    const midFullness = 0.62 + 0.38 * Math.sin(Math.PI * smoothstep(0.02, 0.98, t));
    const sternFill = transomFraction + (1 - transomFraction) * smoothstep(0, 0.2, t);
    const bowTaper = 1 - Math.pow(smoothstep(0.66, 1, t), bowSharpness) * bowTrim;
    const waterBeam = maxBeam * midFullness * sternFill * bowTaper;
    // Curved sheer: deck rises fore and aft, the bow lifted slightly more.
    const deckY = deckMid
      + deckRiseStern * Math.pow(1 - t, 2.2)
      + deckRiseBow * Math.pow(t, 2.4);
    // Keel plan: a rounded arc for the deep-water hulls, or (keelFlatness -> 1)
    // a flat bottom with sharply rising ends — the cog / junk shallow-draught
    // profile that reads as a completely different vessel from the waterline.
    const keelArc = 0.3 + 0.7 * Math.sin(Math.PI * Math.pow(smoothstep(0, 1, t), 0.85));
    const keelFlat = smoothstep(0, 0.2, t) * smoothstep(1, 0.8, t);
    const keelY = -keelDepth * (keelArc + (keelFlat - keelArc) * keelFlatness);
    const tumble = tumbleAft + (tumbleBow - tumbleAft) * t;
    stations.push({
      deckBeam: Math.max(0.02, waterBeam * tumble),
      deckY,
      keelY,
      waterBeam: Math.max(0.02, waterBeam),
      x: sternX + (bowX - sternX) * t,
    });
  }
  return stations;
}

// (HULL_RING_H lives with the palette constants at the top: the top-level
// generation loop runs before function bodies are reached.)

/**
 * Hull cross-section width at height fraction h: a rounded V below the
 * waterline (hWater), a gentle tumblehome taper above it.
 */
function profileWidth(h, hWater, waterBeam, deckBeam) {
  if (h <= hWater) {
    return waterBeam * (0.16 + 0.84 * smoothstep(0, 1, h / Math.max(hWater, 0.001)));
  }
  const above = smoothstep(0, 1, (h - hWater) / Math.max(1 - hWater, 0.001));
  return waterBeam + (deckBeam - waterBeam) * above;
}

function ringPoint(station, h, side) {
  const y = station.keelY + (station.deckY - station.keelY) * Math.pow(h, 0.92);
  const hWater = -station.keelY / Math.max(station.deckY - station.keelY, 0.001);
  const halfWidth = profileWidth(h, hWater, station.waterBeam, station.deckBeam);
  return [station.x, y, (station.zOffset ?? 0) + side * halfWidth];
}

/**
 * Lofts the hull shell, deck, bulwark and transom from the station table.
 * Everything is indexed grids: the shell is a closed ring per station, the
 * deck a 5-across cambered grid, the bulwark three ribbons per side (outer,
 * cap, inner) so the wall reads solid from the camera's high angle.
 */
function addHullLoft(add, stations, { bulwarkHeight, gunports }) {
  // Shell: ring order keel -> starboard up -> gunwale -> port down, closed.
  const ring = [
    ...HULL_RING_H.map((h) => [h, 1]),
    ...HULL_RING_H.slice(1, -1).reverse().map((h) => [h, -1]),
  ];
  const shell = loftGeometry(
    stations.map((station) => ring.map(([h, side]) => ringPoint(station, h, side))),
    { closedRing: true },
  );
  add("wood", shell);

  // Deck: cambered grid between the gunwales, following the sheer.
  const deckCols = [-1, -0.5, 0, 0.5, 1];
  const deck = gridGeometry(
    stations.length,
    deckCols.length,
    (i, j) => {
      const station = stations[i];
      const across = deckCols[j];
      const camber = 0.1 * (1 - across * across);
      return [
        station.x,
        station.deckY + camber,
        (station.zOffset ?? 0) + across * station.deckBeam,
      ];
    },
    { expected: [0, 1, 0] },
  );
  add("wood", deck, { tone: WOOD_MID });

  // Bulwark: solid wall above the gunwale, slightly toed inboard.
  for (const side of [-1, 1]) {
    const bulwarkPoint = (i, row) => {
      const station = stations[i];
      const top = row >= 1;
      const inset = top ? 0.94 : 1;
      const inner = row >= 2 ? 0.12 : 0;
      const y = station.deckY + (top ? bulwarkHeight : 0);
      return [
        station.x,
        y,
        (station.zOffset ?? 0) + side * (station.deckBeam * inset - inner),
      ];
    };
    add("wood", gridGeometry(stations.length, 2, (i, j) => bulwarkPoint(i, j), {
      expected: [0, 0, side],
    }));
    add("wood", gridGeometry(stations.length, 2, (i, j) => bulwarkPoint(i, j + 1), {
      expected: [0, 1, 0],
    }), { tone: WOOD_TRIM });
    add("wood", gridGeometry(stations.length, 2, (i, j) => bulwarkPoint(i, j + 2), {
      expected: [0, 0, -side],
    }));
  }

  // Transom: flat stern cap across the last station ring, slightly raked.
  const stern = stations[0];
  const transomRows = HULL_RING_H.map((h) => ringPoint(stern, h, 1));
  const transom = gridGeometry(2, HULL_RING_H.length, (i, j) => {
    const [x, y] = [transomRows[j][0] - 0.02 * j, transomRows[j][1]];
    const zOffset = stern.zOffset ?? 0;
    const halfWidth = transomRows[j][2] - zOffset;
    const z = zOffset + halfWidth * (i === 0 ? 1 : -1);
    return [x, y, z];
  }, { expected: [-1, 0, 0] });
  add("wood", transom);

  if (gunports) {
    // Gunport band: a painted ribbon on the upper flank, dark ports
    // alternating with hull tone (titan only — the clipper keeps clean sides).
    addStrake(add, stations, { h0: 0.68, h1: 0.76, painter: "gunports" });
  }
}

/**
 * A painted ribbon following the hull surface between two height fractions,
 * offset just proud of the shell. Used for the trim sheer strake, the dark
 * wales, and the gunport band.
 */
function addStrake(add, stations, { h0, h1, paint = false, painter = null, tone = null }) {
  for (const side of [-1, 1]) {
    const geometry = gridGeometry(stations.length, 2, (i, j) => {
      const station = stations[i];
      const zOffset = station.zOffset ?? 0;
      const point = ringPoint(station, j === 0 ? h0 : h1, side);
      return [
        point[0],
        point[1],
        zOffset + (point[2] - zOffset) * 1.018 + side * 0.012,
      ];
    }, { expected: [0, 0, side] });
    if (painter === "gunports") paintGunports(geometry);
    // W1/D2: `paint` routes the SHEER strake — the topmost band, the one that
    // traces the sheer curve — onto its own material, so the runtime can dye it
    // in the issuer's colour exactly as the batched fleet dyes its gunwale
    // ring. Every other strake stays part of the wood.
    add(paint ? "trim" : "wood", geometry, { tone });
  }
}

/** Alternating dark gunport squares along a strake ribbon. */
function paintGunports(geometry) {
  const position = geometry.getAttribute("position");
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const colors = new Float32Array(position.count * 3);
  const base = new Color();
  for (let index = 0; index < position.count; index += 1) {
    const u = (position.getX(index) - min.x) / Math.max(max.x - min.x, 0.001);
    const port = Math.floor(u * 14) % 2 === 0;
    base.copy(port ? GUNPORT_DARK : WOOD_WALE);
    colors[index * 3] = base.r;
    colors[index * 3 + 1] = base.g;
    colors[index * 3 + 2] = base.b;
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
}

/**
 * Carved-ish figurehead for the titan: a raked arm, an elongated torso, a
 * head and a swept crest, all trim tone. ~200 triangles of low-poly sculpture.
 */

/**
 * Two-part mast with a top platform: lower mast + slimmer topmast, slight
 * rake (rotation z, negative leans aft). Returns the masthead height.
 */
function addMast(add, x, baseY, topY, rake, { platform = true } = {}) {
  const lowerTop = baseY + (topY - baseY) * 0.62;
  add("spar", new CylinderGeometry(0.09, 0.14, lowerTop - baseY, 7), {
    position: [x, (baseY + lowerTop) / 2, 0],
    rotation: [0, 0, rake],
  });
  add("spar", new CylinderGeometry(0.05, 0.08, topY - lowerTop + 0.3, 6), {
    position: [x + rake * (topY - lowerTop) * 0.5, (lowerTop + topY) / 2 - 0.1, 0],
    rotation: [0, 0, rake],
  });
  // Mast top platform (crow's nest disc). Unstayed pole masts — the junk and
  // the dhow — carry no top, so the option exists.
  if (platform) {
    add("spar", new CylinderGeometry(0.3, 0.22, 0.12, 7), {
      position: [x + rake * (lowerTop - baseY) * 0.5, lowerTop + 0.05, 0],
    });
  }
}

/**
 * Billowed square sail hung below a yawed yard (S2: angled yards, bellied
 * canvas). The yard crosses the mast; the sail belly bows out toward +z.
 */
function addSquareSail(add, mastX, centerY, halfWidth, height, { yaw }) {
  add("spar", new BoxGeometry(halfWidth * 2.12, 0.1, 0.1), {
    position: [mastX, centerY + height / 2 + 0.04, 0],
    rotation: [0, yaw, 0],
  });
  const geometry = gridGeometry(9, 6, (i, j) => {
    const u = i / 8;
    const v = j / 5;
    // Billow: fullest mid-luff, foot sags a touch between the clews.
    const billow = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.34;
    const sag = Math.sin(u * Math.PI) * (1 - v) * 0.08;
    return [
      (u - 0.5) * halfWidth * 2,
      (v - 0.5) * height - sag,
      billow,
    ];
  });
  add("sail", geometry, {
    position: [mastX, centerY, 0.03],
    rotation: [0, yaw, 0],
  });
  // Braces running aft and down from each yard arm (W5.4 running rigging).
  const arm = halfWidth * 1.06;
  for (const side of [-1, 1]) {
    addStay(
      add,
      [
        mastX + side * arm * Math.cos(yaw),
        centerY + height / 2 + 0.04,
        -side * arm * Math.sin(yaw),
      ],
      [mastX - halfWidth * 1.5, centerY - height * 0.55, side * 0.2],
      0.02,
    );
  }
}

/** Lateen/fore-aft triangular sail on a sloped yard (mizzen), billowed. */
function addLateen(add, peak, tack, clew, billow) {
  // The yard runs from the peak down past the tack, extending a touch low.
  const foot = [tack[0] + 0.55, tack[1] - 0.75, 0];
  addStay(add, foot, peak, 0.05);
  add("sail", triangleSailGeometry(peak, tack, clew, billow));
}

/** Triangular jib on the bowsprit stay. */
function addJib(add, stayBase, stayTop, tack, billow) {
  add("sail", triangleSailGeometry(stayTop, stayBase, tack, billow));
}

/**
 * A triangle sail as an indexed fan grid between the stay edge (a-b) and the
 * clew, with billow normal to the cloth plane (z-bowed; the sail material is
 * double-sided so winding does not matter).
 */
function triangleSailGeometry(a, b, clew, billow) {
  const cols = 6;
  const rows = 5;
  return gridGeometry(cols, rows, (i, j) => {
    const u = i / (cols - 1);
    const v = j / (rows - 1);
    // Interpolate along the stay edge, then out toward the clew, collapsing
    // the far column so the grid reads as a triangle.
    const sx = a[0] + (b[0] - a[0]) * u;
    const sy = a[1] + (b[1] - a[1]) * u;
    const sz = a[2] + (b[2] - a[2]) * u;
    const spread = v * (1 - u * 0.92);
    const bow = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * billow;
    return [
      sx + (clew[0] - sx) * spread,
      sy + (clew[1] - sy) * spread,
      sz + (clew[2] - sz) * spread + bow,
    ];
  });
}

/**
 * Four-corner (fore-and-aft) sail as an indexed bilinear patch between tack,
 * clew, throat and peak, billowed toward +z. This is the quadrilateral cousin
 * of `triangleSailGeometry` and carries every gaff and lug sail in the fleet.
 */
function quadSailGeometry(corners, billow, cols = 7, rows = 5) {
  const { clew, peak, tack, throat } = corners;
  return gridGeometry(cols, rows, (i, j) => {
    const u = i / (cols - 1);
    const v = j / (rows - 1);
    const bow = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * billow;
    const point = [0, 1, 2].map((axis) => {
      const foot = tack[axis] + (clew[axis] - tack[axis]) * u;
      const head = throat[axis] + (peak[axis] - throat[axis]) * u;
      return foot + (head - foot) * v;
    });
    point[2] += bow;
    return point;
  });
}

/**
 * Gaff rig: boom along the foot, gaff spar peaked aft along the head, and the
 * bellied quadrilateral sail between them. The fore-and-aft signature that
 * separates the brigantine / barquentine / cutter from the square-riggers.
 */

/**
 * Battened lug sail: the junk's signature. A near-rectangular panel that
 * carries a small balance area forward of its unstayed mast, stiffened by
 * horizontal batten spars that read as hard banding even at overview zoom.
 */
function addBattenedLug(add, { aft, battens, billow, footY, forward, mastX, topY }) {
  const tack = [mastX + forward * 0.55, footY, 0];
  const clew = [mastX - aft, footY + 0.3, 0];
  const throat = [mastX + forward, topY - 0.12, 0];
  const peak = [mastX - aft * 0.94, topY + 0.34, 0];
  add("sail", quadSailGeometry({ clew, peak, tack, throat }, billow, 7, battens + 1));
  for (let index = 0; index <= battens; index += 1) {
    const v = index / battens;
    const from = [0, 1, 2].map((axis) => tack[axis] + (throat[axis] - tack[axis]) * v);
    const to = [0, 1, 2].map((axis) => clew[axis] + (peak[axis] - clew[axis]) * v);
    addStay(add, from, to, 0.045);
  }
}

/**
 * Bare yard and boom framing the open identity-sail slot. The runtime hangs
 * the procedural logo sail on the `masthead` anchor; these two spars give it a
 * rig to belong to on hulls whose own canvas would otherwise fill the slot.
 */
function addIdentityFrame(add, mastX, footY, headY, halfWidth) {
  add("spar", new BoxGeometry(halfWidth * 2.1, 0.1, 0.1), {
    position: [mastX - halfWidth * 0.08, headY, 0],
  });
  add("spar", new BoxGeometry(halfWidth * 1.9, 0.09, 0.09), {
    position: [mastX - halfWidth * 0.1, footY, 0],
  });
}

/**
 * Shroud ladder: standing rigging fanning from the channels to the mast top,
 * crossed by ratlines. Cheap in triangles, and the single biggest contributor
 * to "this reads as a real ship" at overview zoom (W5.4).
 */

/** Grating hatch and capstan drum: the deck stops reading as a bare plank. */

/** Ship's boat stowed on deck chocks — scale cue and deck interest. */

/** Open rail: stanchions and a cap rail, for hulls with no solid bulwark. */

/**
 * Deck cargo: stacked reserve chests under a net. The net is a crosshatch of
 * thin spars, which reads as lashing at overview zoom without a texture.
 */

/** Cargo derrick: a boom angled out over the rail with its lift tackle. */

/**
 * Temple colonnade: the Maker masonry motif as a real portico — a stylobate,
 * a rank of columns down each side, and an architrave slab over them.
 */

/**
 * W5/D5 — a stepped temple roof with a gable, sitting on the architrave. This
 * is DAI's half of the Sky-squadron split: mass above the rail, in a shape
 * nothing else in the world carries.
 */

/**
 * W5/D5 — USDS's half: a tall gilded sun-arch amidships. Two posts and a ring
 * standing well above the bulwark, so the two Sky hulls differ at 20px even
 * though they share a station table.
 */
function addSunArch(add, { halfBeam, height, radius, x, y }) {
  for (const side of [-1, 1]) {
    add("wood", new CylinderGeometry(0.11, 0.14, height, 6), {
      position: [x, y + height / 2, side * halfBeam],
      tone: WOOD_TRIM,
    });
  }
  add("wood", new BoxGeometry(0.34, 0.16, halfBeam * 2 + 0.5), {
    position: [x, y + height, 0],
    tone: WOOD_TRIM,
  });
  // The disc itself: a broad thin ring standing on the crosspiece, edge-on to
  // the keel so it presents its full face to the isometric camera.
  add("wood", new CylinderGeometry(radius, radius, 0.14, 14), {
    position: [x, y + height + radius + 0.12, 0],
    rotation: [Math.PI / 2, 0, 0],
    tone: WOOD_HIGH,
  });
  for (let ray = 0; ray < 8; ray += 1) {
    const angle = (ray / 8) * Math.PI * 2;
    add("wood", new BoxGeometry(0.1, 0.34, 0.1), {
      position: [
        x + Math.cos(angle) * (radius + 0.2),
        y + height + radius + 0.12 + Math.sin(angle) * (radius + 0.2),
        0,
      ],
      rotation: [0, 0, angle],
      tone: WOOD_TRIM,
    });
  }
}

/** Ceremonial canopy on gilded posts, with a valance hanging from its eaves. */
function addPavilion(add, { halfBeam, height, length, x }) {
  for (const side of [-1, 1]) {
    for (const offset of [-length / 2, length / 2]) {
      add("wood", new CylinderGeometry(0.07, 0.09, height, 6), {
        position: [x + offset, height / 2, side * halfBeam],
        tone: WOOD_TRIM,
      });
    }
  }
  add("wood", new BoxGeometry(length + 0.5, 0.14, halfBeam * 2 + 0.5), {
    position: [x, height + 0.07, 0],
    tone: WOOD_TRIM,
  });
  add("wood", new ConeGeometry(halfBeam * 1.35, 0.5, 4), {
    position: [x, height + 0.34, 0],
    rotation: [0, Math.PI / 4, 0],
    tone: WOOD_HIGH,
  });
  // Valance: a scalloped skirt under the eaves, on all four sides.
  for (const side of [-1, 1]) {
    add("sail", new PlaneGeometry(length + 0.5, 0.26), {
      position: [x, height - 0.07, side * (halfBeam + 0.24)],
    });
  }
}

/**
 * A bank of sweeps: oars angled down to the water on both sides, each with its
 * loom inboard of the rail. The single most recognisable deck feature a vessel
 * can carry at overview zoom.
 */
function addOarBank(add, { count, deckY, length, spacing, x, halfBeam, bladeDrop = 0.86 }) {
  for (const side of [-1, 1]) {
    for (let index = 0; index < count; index += 1) {
      const ox = x + (index - (count - 1) / 2) * spacing;
      add("spar", new CylinderGeometry(0.055, 0.07, length, 4), {
        position: [ox - length * 0.18, deckY - 0.34, side * (halfBeam + length * 0.3)],
        rotation: [side * 0.62, 0, 0.28],
      });
      // Blade at the outboard end, biting the water.
      add("wood", new BoxGeometry(0.5, 0.07, 0.2), {
        position: [
          ox - length * 0.42,
          deckY - bladeDrop,
          side * (halfBeam + length * 0.62),
        ],
        rotation: [0, 0, 0.2],
        tone: WOOD_TRIM,
      });
    }
  }
}

/**
 * W5 — the apostis: the projecting outboard beam a real galley works her
 * sweeps from, carried on knees off the hull.
 *
 * Measured, USD1's oar bank was authored at halfBeam 0.95 against a hull whose
 * waterline half-beam there is 1.96 — the looms were INSIDE the hull and the
 * blades cleared it by 0.29 units, a metre below the deck edge, occluded at
 * every camera angle. The docstring called it "the single most recognisable
 * deck feature a vessel can carry" and it contributed nothing. Hanging the
 * sweeps off a visible structure OUTSIDE the hull is what makes the claim true.
 */

/**
 * Paddle box: the drum housing a side paddle wheel, with radial spoke ribs on
 * its outer face. Nothing else in the fleet has a wheel amidships.
 */

/**
 * Outrigger sponson: a slim secondary hull carried off each beam on cross
 * beams. Used for the delta-neutral runner, where the two opposed floats are
 * the whole point of the silhouette.
 */

/**
 * W5 — an arcaded spar deck: a covered gallery on regular columns, running
 * above the bulwark for most of the ship's length.
 *
 * Repetition is the point. Every other hull in the world is built from curves;
 * a rank of even bays reads as ORDER at any zoom, which is what USDC's brief
 * asks for and what its flush-mounted stern gallery could never deliver.
 */

/**
 * W5 (decision D7) — the Titan grammar. Two marks, and only two, so the tier
 * reads as a CLASS at a glance without the eight bespoke hulls collapsing into
 * one uniform squadron.
 *
 * Both sit ABOVE the rail, which is the only place anything survives the
 * isometric camera: measured on the hero fleet, every identity feature authored
 * inside the bulwark line is swallowed by the hull's own silhouette.
 *
 * 1. A stern lantern on a gilded bracket, cantilevered off the taffrail.
 * 2. A masthead top-castle — a railed fighting top, not the plain disc every
 *    other mast carries.
 */

/**
 * W7 — a fighting tower on posts at a hull's end.
 *
 * The cog and the carrack measured 0.792 IoU: both were "a box with crenels
 * forward, a box with crenels aft", at nearly the same x and y. Two ships
 * cannot be told apart by degree, only by KIND. So the carrack keeps wide,
 * heavy, overhanging castles — the fortress — and the cog's become narrow
 * towers standing clear of the deck on legs, which is what a medieval cog's
 * castles actually were: temporary timber structures bolted on for a voyage.
 *
 * Narrow-and-tall against wide-and-heavy is a difference the isometric camera
 * can resolve; two boxes of similar mass is not.
 */

/** Crenellated rail caps along a castle roof — the cog's fighting platform. */

/** Furled sail: yard plus a slim bundled cylinder of canvas along it. */

/** Masthead banner streaming aft, vertex wave growing toward the fly end. */
function addBanner(add, masthead, length, drop) {
  const geometry = gridGeometry(11, 3, (i, j) => {
    const u = i / 10;
    const v = j / 2;
    return [
      -u * length,
      (0.5 - v) * drop * (1 - u * 0.35),
      Math.sin(u * Math.PI * 2.2) * 0.2 * u,
    ];
  });
  add("wood", geometry, {
    position: [masthead[0] - 0.08, masthead[1] + 0.18, masthead[2]],
    tone: WOOD_TRIM,
  });
}

/** Thin spar line between two points (stays, the lateen yard). */
function addStay(add, from, to, radius = 0.028) {
  const length = distance(from, to);
  const geometry = new CylinderGeometry(radius, radius, length, 4);
  const direction = new Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]).normalize();
  const quaternion = new Object3D().quaternion;
  quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction);
  geometry.applyQuaternion(quaternion);
  geometry.translate(
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2,
    (from[2] + to[2]) / 2,
  );
  add("spar", geometry);
}

/**
 * Indexed grid builder. point(i, j) returns [x, y, z]; if `expected` is
 * given, the triangle winding is flipped when the first quad's geometric
 * normal points away from it (front-face visibility for front-side
 * materials).
 */
function gridGeometry(cols, rows, point, { expected = null } = {}) {
  const positions = new Float32Array(cols * rows * 3);
  const uvs = new Float32Array(cols * rows * 2);
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const [x, y, z] = point(i, j);
      const at = (j * cols + i) * 3;
      positions[at] = x;
      positions[at + 1] = y;
      positions[at + 2] = z;
      uvs[(j * cols + i) * 2] = i / Math.max(cols - 1, 1);
      uvs[(j * cols + i) * 2 + 1] = j / Math.max(rows - 1, 1);
    }
  }
  const indices = [];
  for (let j = 0; j < rows - 1; j += 1) {
    for (let i = 0; i < cols - 1; i += 1) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  if (expected !== null && firstQuadNormal(geometry).dot(new Vector3(...expected)) < 0) {
    flipWinding(geometry);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Lofts closed rings along the hull (indexed tube). Winding is normalised by
 * signed volume so the shell faces outward regardless of ring order.
 */
function loftGeometry(rings, { closedRing }) {
  const ringSize = rings[0].length;
  const geometry = gridGeometry(rings.length, ringSize, (i, j) => rings[i][j]);
  if (closedRing) {
    // Stitch the last ring column back to the first.
    const indices = Array.from(geometry.index.array);
    for (let i = 0; i < rings.length - 1; i += 1) {
      const a = i * ringSize + ringSize - 1;
      const b = i * ringSize;
      const c = a + ringSize;
      const d = b + ringSize;
      indices.push(a, c, b, b, c, d);
    }
    geometry.setIndex(indices);
  }
  if (signedVolume(geometry) < 0) flipWinding(geometry);
  geometry.computeVertexNormals();
  return geometry;
}

function firstQuadNormal(geometry) {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const p = (n) => new Vector3().fromBufferAttribute(position, index.getX(n));
  const [a, b, c] = [p(0), p(1), p(2)];
  return new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
}

/** Signed volume of the (near-closed) shell; negative means inward faces. */
function signedVolume(geometry) {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  let volume = 0;
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let n = 0; n < index.count; n += 3) {
    a.fromBufferAttribute(position, index.getX(n));
    b.fromBufferAttribute(position, index.getX(n + 1));
    c.fromBufferAttribute(position, index.getX(n + 2));
    volume += a.dot(new Vector3().crossVectors(b, c));
  }
  return volume / 6;
}

function flipWinding(geometry) {
  const index = geometry.getIndex();
  for (let n = 0; n < index.count; n += 3) {
    const swap = index.getX(n + 1);
    index.setX(n + 1, index.getX(n + 2));
    index.setX(n + 2, swap);
  }
  index.needsUpdate = true;
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function paintWood(geometry, tone) {
  const position = geometry.getAttribute("position");
  if (geometry.hasAttribute("color")) return; // precolored parts keep their paint
  const colors = new Float32Array(position.count * 3);
  const base = new Color();
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    if (tone) {
      base.copy(tone);
    } else {
      // Waterline (~y=0) reads wet-dark; the flank warms up to the gunwale.
      const climb = smoothstep(-0.2, 3.0, y);
      base.copy(WOOD_LOW).lerp(WOOD_MID, smoothstep(-0.5, 0.9, y));
      base.lerp(WOOD_HIGH, climb * climb);
    }
    const jitter = (hash3(x, y, z) - 0.5) * 0.06;
    colors[index * 3] = clamp01(base.r + jitter);
    colors[index * 3 + 1] = clamp01(base.g + jitter);
    colors[index * 3 + 2] = clamp01(base.b + jitter);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
}

function paintSail(geometry, furled) {
  const position = geometry.getAttribute("position");
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const span = Math.max(0.001, box.max.y - box.min.y);
  const colors = new Float32Array(position.count * 3);
  const base = new Color();
  for (let index = 0; index < position.count; index += 1) {
    if (furled) {
      base.copy(SAIL_FURLED);
    } else {
      const t = (position.getY(index) - box.min.y) / span;
      base.copy(SAIL_LOW).lerp(SAIL_HIGH, smoothstep(0, 1, t));
    }
    const x = position.getX(index);
    const jitter = (hash3(x, position.getY(index), position.getZ(index)) - 0.5) * 0.05;
    colors[index * 3] = clamp01(base.r + jitter);
    colors[index * 3 + 1] = clamp01(base.g + jitter);
    colors[index * 3 + 2] = clamp01(base.b + jitter);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function hash3(x, y, z) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function addAnchor(root, name, position, role) {
  const anchor = new Object3D();
  anchor.name = name;
  anchor.position.set(...position);
  anchor.userData = { role };
  root.add(anchor);
}

function eulerQuaternion(x, y, z) {
  const object = new Object3D();
  object.rotation.set(x, y, z);
  return object.quaternion;
}

function inspectGlb(bytes) {
  if (bytes.byteLength < 20 || bytes.toString("ascii", 0, 4) !== "glTF") {
    throw new Error("Generated output is not a GLB file.");
  }
  if (bytes.readUInt32LE(4) !== 2) {
    throw new Error("Generated GLB is not glTF version 2.");
  }
  if (bytes.readUInt32LE(8) !== bytes.byteLength) {
    throw new Error("Generated GLB header byte length is incorrect.");
  }
  const jsonLength = bytes.readUInt32LE(12);
  if (bytes.toString("ascii", 16, 20) !== "JSON") {
    throw new Error("Generated GLB does not begin with a JSON chunk.");
  }
  return {
    json: JSON.parse(bytes.toString("utf8", 20, 20 + jsonLength).trim()),
  };
}

function installFileReader() {
  if (typeof globalThis.FileReader !== "undefined") return;

  globalThis.FileReader = class FileReader {
    error = null;
    onloadend = null;
    result = null;

    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(
        (result) => {
          this.result = result;
          this.onloadend?.();
        },
        (error) => {
          this.error = error;
          this.onloadend?.();
        },
      );
    }

    readAsDataURL(blob) {
      blob.arrayBuffer().then(
        (result) => {
          const base64 = Buffer.from(result).toString("base64");
          this.result = `data:${blob.type};base64,${base64}`;
          this.onloadend?.();
        },
        (error) => {
          this.error = error;
          this.onloadend?.();
        },
      );
    }
  };
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
