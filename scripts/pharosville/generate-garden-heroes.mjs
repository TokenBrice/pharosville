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

// W5.1 / decision D4: ten distinct hero hulls carry the 24 largest
// stablecoins. `garden-hero-titan` (treasury galleon) and
// `garden-hero-heritage` (tea clipper) keep their ids because the runtime
// fallback contract already names them; the other eight are new. Each hull is
// recognisable by silhouette alone — sheer, rig plan, castles and stern
// gallery all differ — so identity survives at overview zoom where livery
// colour is a few pixels wide.
const HERO_MODELS = [
  { build: buildTitan, id: "garden-hero-titan" },
  { build: buildHeritage, id: "garden-hero-heritage" },
  { build: buildCarrack, id: "garden-hero-carrack" },
  { build: buildBrigantine, id: "garden-hero-brigantine" },
  { build: buildDhow, id: "garden-hero-dhow" },
  { build: buildJunk, id: "garden-hero-junk" },
  { build: buildBarquentine, id: "garden-hero-barquentine" },
  { build: buildCog, id: "garden-hero-cog" },
  { build: buildXebec, id: "garden-hero-xebec" },
  { build: buildCutter, id: "garden-hero-cutter" },
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

  const bytes = Buffer.from(exported);
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
    sha256,
    textures: glb.json.textures?.length ?? 0,
    triangles: summary.triangles,
    vertices: summary.vertices,
  });
}

console.log(JSON.stringify(summaries, null, 2));

/**
 * Monumental galleon three-master: broad beam, full curved sheer with
 * tumblehome, a tall stepped stern castle with warm gallery windows, a carved
 * figurehead under a raked bowsprit, a multi-sail plan with billowed canvas
 * (the main course slot is left open for the procedural identity sail), and
 * lantern anchors at bow / stern / masthead. Bow faces +X, waterline at y=0.
 */
function buildTitan() {
  const builder = createBuilder("garden-hero-titan");
  const { add } = builder;

  const stations = hullStations({
    bowX: 6.05,
    count: 19,
    deckMid: 1.3,
    deckRiseBow: 0.75,
    deckRiseStern: 1.05,
    keelDepth: 1.0,
    maxBeam: 2.2,
    sternX: -5.1,
    transomFraction: 0.7,
    tumbleAft: 0.8,
    tumbleBow: 0.92,
  });
  addHullLoft(add, stations, { bulwarkHeight: 0.34, gunports: true });

  // Sheer strake (trim) at the gunwale and a dark wale mid-hull: the classic
  // dark-band / light-stripe color blocking (S4).
  addStrake(add, stations, { h0: 0.9, h1: 0.97, tone: WOOD_TRIM });
  addStrake(add, stations, { h0: 0.52, h1: 0.6, tone: WOOD_WALE });
  addStrake(add, stations, { h0: 0.36, h1: 0.42, tone: WOOD_WALE });

  // Keel and rudder.
  add("wood", new BoxGeometry(8.6, 0.22, 0.16), {
    position: [0.3, -0.98, 0],
    tone: WOOD_WALE,
  });
  add("wood", new BoxGeometry(0.16, 1.5, 0.5), {
    position: [-5.14, -0.35, 0],
    rotation: [0, 0, -0.1],
    tone: WOOD_WALE,
  });

  // Tall stern castle: three tiers stepping up over the quarterdeck, wrapped
  // by a trim balcony and warm gallery windows on the transom and sides.
  add("wood", new BoxGeometry(2.9, 1.6, 3.2), { position: [-3.7, 2.75, 0] });
  add("wood", new BoxGeometry(2.3, 1.1, 2.7), { position: [-3.95, 4.15, 0] });
  add("wood", new BoxGeometry(1.7, 0.85, 2.15), { position: [-4.15, 5.05, 0] });
  add("wood", new BoxGeometry(2.6, 0.18, 3.4), {
    position: [-3.75, 3.6, 0],
    tone: WOOD_TRIM,
  });
  add("wood", new BoxGeometry(2.0, 0.16, 2.9), {
    position: [-4.0, 4.75, 0],
    tone: WOOD_TRIM,
  });
  add("wood", new BoxGeometry(1.9, 0.16, 2.35), {
    position: [-4.15, 5.5, 0],
    tone: WOOD_TRIM,
  });
  // Gallery windows: transom rows plus side lights on each tier, each row
  // sitting just proud of its tier's aft face (flat quads facing outward).
  for (const z of [-1.05, -0.53, 0, 0.53, 1.05]) {
    add("glow", new PlaneGeometry(0.36, 0.6), {
      position: [-5.26, 2.7, z],
      rotation: [0, -Math.PI / 2, 0],
    });
  }
  for (const z of [-0.72, -0.24, 0.24, 0.72]) {
    add("glow", new PlaneGeometry(0.32, 0.5), {
      position: [-5.18, 4.15, z],
      rotation: [0, -Math.PI / 2, 0],
    });
  }
  for (const z of [-0.5, 0, 0.5]) {
    add("glow", new PlaneGeometry(0.3, 0.4), {
      position: [-5.09, 5.05, z],
      rotation: [0, -Math.PI / 2, 0],
    });
  }
  for (const side of [-1, 1]) {
    for (const x of [-3.2, -4.0, -4.8]) {
      add("glow", new PlaneGeometry(0.5, 0.42), {
        position: [x, 2.7, side * 1.62],
        rotation: [0, side > 0 ? 0 : Math.PI, 0],
      });
    }
  }
  // Stern lantern housing crowning the castle (the lantern-stern anchor sits
  // just above it, where the runtime hangs the stern lantern sprite).
  add("spar", new BoxGeometry(0.4, 0.34, 0.4), { position: [-4.15, 5.75, 0] });
  add("glow", new BoxGeometry(0.26, 0.3, 0.26), { position: [-4.15, 5.77, 0] });
  add("spar", new ConeGeometry(0.3, 0.28, 4), { position: [-4.15, 6.05, 0] });

  // Beakhead: raked prow platform reaching forward from the bow.
  add("wood", new BoxGeometry(1.9, 0.22, 0.72), {
    position: [5.65, 1.85, 0],
    rotation: [0, 0, 0.22],
    tone: WOOD_TRIM,
  });
  addFigurehead(add, [6.35, 1.6, 0]);

  // Bowsprit reaching past the figurehead, plus a jib on its stay.
  add("spar", new CylinderGeometry(0.08, 0.13, 3.4, 6), {
    position: [6.45, 2.35, 0],
    rotation: [0, 0, Math.PI / 2 - 0.35],
  });
  addJib(add, [4.9, 3.1, 0], [7.6, 3.35, 0], [4.9, 1.7, 0], 0.5);

  // Three masts, slightly raked aft. The main (center) course slot stays open
  // for the procedural identity (logo) sail; fore and mizzen carry set canvas.
  addMast(add, 1.3, 1.55, 7.6, -0.028);
  addFurled(add, 1.42, 6.6, 1.35);

  // The fore mast stands clear of the main course slot: the runtime hangs the
  // logo sail there, and overlapping canvas would eat the identity.
  addMast(add, 3.8, 1.6, 6.7, -0.035);
  addSquareSail(add, 3.82, 4.35, 1.62, 1.7, { yaw: 0.06 });
  addSquareSail(add, 3.84, 5.9, 1.3, 0.95, { yaw: 0.09 });

  // Mizzen steps forward of the castle so its lateen clears the tiers.
  addMast(add, -2.0, 1.9, 6.5, -0.05);
  addLateen(add, [-2.1, 5.9, 0], [-0.8, 3.2, 0], [-3.6, 3.9, 0], 0.55);
  addFurled(add, -1.92, 6.05, 1.0);

  // Stays: bowsprit -> fore -> main -> mizzen -> stern (thin spar cylinders).
  addStay(add, [7.9, 3.0, 0], [3.85, 6.9, 0]);
  addStay(add, [3.85, 6.9, 0], [1.35, 7.85, 0]);
  addStay(add, [1.35, 7.85, 0], [-1.95, 6.75, 0]);
  addStay(add, [-1.95, 6.75, 0], [-4.4, 5.6, 0]);

  // Anchor stocks lashed at the bow, port and starboard.
  for (const side of [-1, 1]) {
    add("spar", new CylinderGeometry(0.05, 0.05, 0.85, 5), {
      position: [4.6, 1.35, side * 1.55],
      rotation: [0.5 * side, 0, 0.35],
    });
  }

  addShrouds(add, { baseY: 1.5, halfBeam: 0.94, mastX: 1.3, spread: 0.5, topY: 5.25 });
  addShrouds(add, { baseY: 1.85, halfBeam: 0.76, mastX: 3.8, spread: 0.42, topY: 4.76 });
  addShrouds(add, { baseY: 1.75, halfBeam: 0.88, mastX: -2.0, spread: 0.42, topY: 4.75 });
  addDeckFurniture(add, { capstanX: -0.55, deckY: 1.34, hatchX: 0.55 });
  addShipsBoat(add, 2.35, 1.66);

  // Banner streaming aft from the main masthead (trim tone, frozen wave).
  addBanner(add, [1.3, 7.55, 0], 1.5, 0.5);

  builder.addAnchor("anchor-lantern-stern", [-4.15, 6.15, 0], "lantern-stern");
  builder.addAnchor("anchor-lantern-bow", [5.5, 2.5, 0], "lantern-bow");
  builder.addAnchor("anchor-masthead", [1.3, 7.5, 0], "masthead");
  builder.addAnchor("anchor-selection", [0, 2.6, 0], "selection");
  builder.addAnchor("anchor-label", [0, 9.2, 0], "label");

  return builder.finalize({ assertZSymmetric: true });
}

/**
 * Elegant clipper two-master: lean hull with a sharp raked bow, low freeboard,
 * refined gilt stem emblem and trailboards instead of a figurehead, raked
 * masts with billowed square canvas on the fore mast (the main course slot
 * stays open for the procedural identity sail), a modest quarterdeck cabin,
 * and a stern crest. Reads distinguished rather than monumental.
 */
function buildHeritage() {
  const builder = createBuilder("garden-hero-heritage");
  const { add } = builder;

  const stations = hullStations({
    bowSharpness: 2.2,
    bowX: 5.15,
    count: 17,
    deckMid: 1.05,
    deckRiseBow: 0.85,
    deckRiseStern: 0.5,
    keelDepth: 0.85,
    maxBeam: 1.62,
    sternX: -4.55,
    transomFraction: 0.66,
    tumbleAft: 0.86,
    tumbleBow: 0.95,
  });
  addHullLoft(add, stations, { bulwarkHeight: 0.28, gunports: false });

  addStrake(add, stations, { h0: 0.88, h1: 0.96, tone: WOOD_TRIM });
  addStrake(add, stations, { h0: 0.5, h1: 0.57, tone: WOOD_WALE });

  add("wood", new BoxGeometry(7.6, 0.18, 0.12), {
    position: [0.2, -0.82, 0],
    tone: WOOD_WALE,
  });
  add("wood", new BoxGeometry(0.14, 1.25, 0.4), {
    position: [-4.6, -0.28, 0],
    rotation: [0, 0, -0.08],
    tone: WOOD_WALE,
  });

  // Raked cutwater: the clipper's sharp bow statement, with a gilt emblem and
  // trailboards sweeping aft along the bow flanks.
  add("wood", new BoxGeometry(1.7, 0.3, 0.22), {
    position: [5.35, 1.35, 0],
    rotation: [0, 0, 0.42],
    tone: WOOD_TRIM,
  });
  add("wood", new SphereGeometry(0.22, 7, 5), {
    position: [5.55, 1.75, 0],
    tone: WOOD_TRIM,
  });
  for (const side of [-1, 1]) {
    add("wood", new BoxGeometry(1.5, 0.12, 0.08), {
      position: [4.55, 1.6, side * 0.72],
      rotation: [0, -side * 0.38, 0.12],
      tone: WOOD_TRIM,
    });
  }

  // Low quarterdeck cabin with a lit gallery band and a stern crest.
  add("wood", new BoxGeometry(2.2, 0.85, 2.0), { position: [-3.35, 1.95, 0] });
  add("wood", new BoxGeometry(2.45, 0.15, 2.2), {
    position: [-3.4, 2.42, 0],
    tone: WOOD_TRIM,
  });
  for (const z of [-0.62, 0, 0.62]) {
    add("glow", new PlaneGeometry(0.32, 0.42), {
      position: [-4.52, 2.0, z],
      rotation: [0, -Math.PI / 2, 0],
    });
  }
  for (const side of [-1, 1]) {
    add("glow", new PlaneGeometry(0.42, 0.34), {
      position: [-3.4, 2.0, side * 1.02],
      rotation: [0, side > 0 ? 0 : Math.PI, 0],
    });
  }
  add("wood", new BoxGeometry(0.5, 0.34, 0.5), {
    position: [-4.62, 2.6, 0],
    tone: WOOD_TRIM,
  });

  // Long raked bowsprit with a jib.
  add("spar", new CylinderGeometry(0.06, 0.11, 3.0, 6), {
    position: [5.7, 2.05, 0],
    rotation: [0, 0, Math.PI / 2 - 0.3],
  });
  addJib(add, [3.9, 3.15, 0], [6.85, 2.85, 0], [3.9, 1.85, 0], 0.42);

  // Three raked masts. The main course slot stays open for the procedural
  // identity sail; the fore mast carries the set canvas and a gaff spanker
  // sheets aft over the quarterdeck.
  addMast(add, 0.8, 1.3, 6.3, -0.06);
  addIdentityFrame(add, 0.8, 3.0, 5.05, 1.2);
  addFurled(add, 0.9, 5.6, 1.1);

  addMast(add, 3.35, 1.35, 5.5, -0.07);
  addSquareSail(add, 3.37, 3.6, 1.35, 1.35, { yaw: 0.07 });
  addSquareSail(add, 3.39, 4.85, 1.1, 0.8, { yaw: 0.1 });

  addMast(add, -2.3, 1.35, 5.6, -0.05, { platform: false });
  addGaffSail(add, {
    billow: 0.32,
    boomAft: 1.85,
    boomY: 2.65,
    gaffAft: 1.5,
    gaffY: 4.3,
    mastX: -2.3,
    peakRise: 0.6,
  });

  addStay(add, [6.9, 2.9, 0], [3.4, 5.7, 0]);
  addStay(add, [3.4, 5.7, 0], [0.85, 6.5, 0]);
  addStay(add, [0.85, 6.5, 0], [-2.35, 5.5, 0]);
  addStay(add, [-2.35, 5.5, 0], [-4.3, 2.9, 0]);

  addShrouds(add, { baseY: 1.25, halfBeam: 0.7, mastX: 0.8, spread: 0.42, topY: 4.4 });
  addShrouds(add, { baseY: 1.4, halfBeam: 0.56, mastX: 3.35, spread: 0.36, topY: 3.92 });
  addShrouds(add, { baseY: 1.3, halfBeam: 0.64, mastX: -2.3, spread: 0.34, topY: 3.99 });
  addDeckFurniture(add, { capstanX: 2.05, deckY: 1.12, hatchX: -0.65, hatchHalf: 0.42 });

  addBanner(add, [0.8, 6.35, 0], 1.2, 0.42);

  builder.addAnchor("anchor-lantern-stern", [-3.5, 2.75, 0], "lantern-stern");
  builder.addAnchor("anchor-lantern-bow", [4.4, 1.85, 0], "lantern-bow");
  builder.addAnchor("anchor-masthead", [0.8, 6.25, 0], "masthead");
  builder.addAnchor("anchor-selection", [0, 1.9, 0], "selection");
  builder.addAnchor("anchor-label", [0, 7.3, 0], "label");

  return builder.finalize({ assertZSymmetric: true });
}

/**
 * War carrack: the fortress. Bluff bows, heavy tumblehome, an overhanging
 * crenellated forecastle and a two-tier aftercastle, three masts (square main
 * and fore, lateen mizzen) and two gunport bands. Reads massive and defensive
 * where the galleon reads wealthy.
 */
function buildCarrack() {
  const builder = createBuilder("garden-hero-carrack");
  const { add } = builder;

  const stations = hullStations({
    bowSharpness: 1.15,
    bowTrim: 0.9,
    bowX: 5.55,
    count: 19,
    deckMid: 1.4,
    deckRiseBow: 1.35,
    deckRiseStern: 1.5,
    keelDepth: 1.05,
    maxBeam: 2.45,
    sternX: -5.15,
    transomFraction: 0.74,
    tumbleAft: 0.72,
    tumbleBow: 0.8,
  });
  addHullLoft(add, stations, { bulwarkHeight: 0.4, gunports: true });
  addStrake(add, stations, { h0: 0.91, h1: 0.99, tone: WOOD_TRIM });
  addStrake(add, stations, { h0: 0.56, h1: 0.63, tone: WOOD_WALE });
  addStrake(add, stations, { h0: 0.42, h1: 0.48, tone: WOOD_WALE });

  add("wood", new BoxGeometry(8.8, 0.24, 0.18), {
    position: [0.2, -1.0, 0],
    tone: WOOD_WALE,
  });
  add("wood", new BoxGeometry(0.18, 1.55, 0.52), {
    position: [-5.2, -0.35, 0],
    rotation: [0, 0, -0.06],
    tone: WOOD_WALE,
  });

  // Overhanging forecastle with a fighting rail — the carrack's tell.
  add("wood", new BoxGeometry(2.4, 1.5, 1.9), { position: [3.7, 3.05, 0] });
  add("wood", new BoxGeometry(2.6, 0.18, 2.05), {
    position: [3.65, 3.89, 0],
    tone: WOOD_TRIM,
  });
  addCrenels(add, 2.7, 4.7, 3.98, 0.95, 4);
  add("wood", new BoxGeometry(1.6, 0.2, 0.62), {
    position: [5.35, 2.55, 0],
    rotation: [0, 0, 0.3],
    tone: WOOD_TRIM,
  });

  // Two-tier aftercastle with quarter overhang and a lit gallery.
  add("wood", new BoxGeometry(2.9, 1.8, 2.6), { position: [-3.75, 2.95, 0] });
  add("wood", new BoxGeometry(3.05, 0.18, 2.8), {
    position: [-3.8, 3.94, 0],
    tone: WOOD_TRIM,
  });
  add("wood", new BoxGeometry(2.1, 1.15, 2.05), { position: [-4.05, 4.6, 0] });
  add("wood", new BoxGeometry(2.25, 0.16, 2.2), {
    position: [-4.1, 5.26, 0],
    tone: WOOD_TRIM,
  });
  addCrenels(add, -4.9, -3.2, 5.34, 1.02, 4);
  for (const z of [-0.86, -0.29, 0.29, 0.86]) {
    add("glow", new PlaneGeometry(0.36, 0.56), {
      position: [-5.26, 2.95, z],
      rotation: [0, -Math.PI / 2, 0],
    });
  }
  for (const side of [-1, 1]) {
    for (const x of [-3.1, -3.9, -4.7]) {
      add("glow", new PlaneGeometry(0.46, 0.4), {
        position: [x, 2.95, side * 1.32],
        rotation: [0, side > 0 ? 0 : Math.PI, 0],
      });
    }
  }

  // Square main carrying the identity course, square fore over the forecastle,
  // lateen mizzen tucked under the aftercastle.
  addMast(add, 0.55, 1.5, 7.85, -0.02);
  addIdentityFrame(add, 0.55, 4.0, 6.05, 1.35);
  addSquareSail(add, 0.57, 6.85, 1.15, 0.9, { yaw: 0.05 });

  addMast(add, 3.65, 3.9, 7.0, 0.04);
  addSquareSail(add, 3.67, 5.5, 1.35, 1.4, { yaw: 0.07 });

  addMast(add, -2.55, 2.0, 6.3, -0.06);
  addLateen(add, [-2.65, 6.1, 0], [-1.2, 2.9, 0], [-4.2, 3.4, 0], 0.5);

  add("spar", new CylinderGeometry(0.08, 0.13, 3.0, 6), {
    position: [6.0, 3.05, 0],
    rotation: [0, 0, Math.PI / 2 - 0.32],
  });
  addJib(add, [4.6, 4.4, 0], [7.15, 4.0, 0], [4.6, 2.9, 0], 0.45);

  addStay(add, [7.3, 3.7, 0], [3.7, 7.15, 0]);
  addStay(add, [3.7, 7.15, 0], [0.6, 8.1, 0]);
  addStay(add, [0.6, 8.1, 0], [-2.5, 6.55, 0]);
  addStay(add, [-2.5, 6.55, 0], [-4.5, 5.4, 0]);

  addShrouds(add, { baseY: 1.5, halfBeam: 1.02, mastX: 0.55, spread: 0.52, topY: 5.44 });
  addShrouds(add, { baseY: 4.05, halfBeam: 0.92, mastX: 3.65, spread: 0.4, topY: 5.82 });
  addShrouds(add, { baseY: 1.95, halfBeam: 0.98, mastX: -2.55, spread: 0.4, topY: 4.67 });
  addDeckFurniture(add, { capstanX: 2.0, deckY: 1.42, hatchX: -0.75 });
  addShipsBoat(add, 1.9, 1.76);

  addBanner(add, [0.55, 7.9, 0], 1.45, 0.48);

  builder.addAnchor("anchor-lantern-stern", [-4.1, 5.5, 0], "lantern-stern");
  builder.addAnchor("anchor-lantern-bow", [3.7, 4.2, 0], "lantern-bow");
  builder.addAnchor("anchor-masthead", [0.55, 7.75, 0], "masthead");
  builder.addAnchor("anchor-selection", [0, 2.7, 0], "selection");
  builder.addAnchor("anchor-label", [0, 9.4, 0], "label");

  return builder.finalize({ assertZSymmetric: true });
}

/**
 * Brigantine: square-rigged fore, fore-and-aft gaff main. A lean, low, fast
 * merchant silhouette whose asymmetric rig — canvas forward, boom aft — is
 * legible even as a few pixels of mast.
 */
function buildBrigantine() {
  const builder = createBuilder("garden-hero-brigantine");
  const { add } = builder;

  const stations = hullStations({
    bowSharpness: 2.0,
    bowX: 5.6,
    count: 17,
    deckMid: 1.0,
    deckRiseBow: 0.72,
    deckRiseStern: 0.48,
    keelDepth: 0.9,
    maxBeam: 1.78,
    sternX: -4.85,
    transomFraction: 0.62,
    tumbleAft: 0.9,
    tumbleBow: 0.95,
  });
  addHullLoft(add, stations, { bulwarkHeight: 0.28, gunports: false });
  addStrake(add, stations, { h0: 0.88, h1: 0.96, tone: WOOD_TRIM });
  addStrake(add, stations, { h0: 0.5, h1: 0.57, tone: WOOD_WALE });

  add("wood", new BoxGeometry(7.9, 0.18, 0.14), {
    position: [0.2, -0.86, 0],
    tone: WOOD_WALE,
  });
  add("wood", new BoxGeometry(0.14, 1.3, 0.42), {
    position: [-4.88, -0.3, 0],
    rotation: [0, 0, -0.08],
    tone: WOOD_WALE,
  });

  // Low trunk cabin aft with a lit skylight band, and a plain stem head.
  add("wood", new BoxGeometry(1.95, 0.7, 1.5), { position: [-3.15, 1.6, 0] });
  add("wood", new BoxGeometry(2.15, 0.14, 1.7), {
    position: [-3.2, 1.99, 0],
    tone: WOOD_TRIM,
  });
  for (const side of [-1, 1]) {
    for (const x of [-2.6, -3.55]) {
      add("glow", new PlaneGeometry(0.4, 0.28), {
        position: [x, 1.6, side * 0.77],
        rotation: [0, side > 0 ? 0 : Math.PI, 0],
      });
    }
  }
  add("wood", new BoxGeometry(1.3, 0.22, 0.16), {
    position: [5.15, 1.55, 0],
    rotation: [0, 0, 0.36],
    tone: WOOD_TRIM,
  });

  // Fore mast: square-rigged, and the mast the identity course hangs on.
  addMast(add, 2.45, 1.25, 6.95, -0.04);
  addIdentityFrame(add, 2.45, 3.35, 5.4, 1.3);
  addSquareSail(add, 2.47, 6.05, 1.05, 0.85, { yaw: 0.08 });

  // Main mast: unstayed-looking pole with the big gaff mainsail and boom.
  addMast(add, -0.95, 1.15, 7.35, -0.05, { platform: false });
  addGaffSail(add, {
    billow: 0.42,
    boomAft: 2.9,
    boomY: 1.85,
    gaffAft: 2.35,
    gaffY: 4.9,
    mastX: -0.95,
    peakRise: 0.85,
  });

  add("spar", new CylinderGeometry(0.06, 0.11, 3.2, 6), {
    position: [6.05, 2.0, 0],
    rotation: [0, 0, Math.PI / 2 - 0.26],
  });
  addJib(add, [3.6, 3.2, 0], [7.35, 2.6, 0], [3.6, 1.8, 0], 0.45);

  addStay(add, [7.4, 2.65, 0], [2.5, 6.8, 0]);
  addStay(add, [2.5, 6.8, 0], [-0.9, 7.2, 0]);
  addStay(add, [-0.9, 7.2, 0], [-4.3, 2.1, 0]);

  addShrouds(add, { baseY: 1.2, halfBeam: 0.66, mastX: 2.45, spread: 0.38, topY: 4.79 });
  addShrouds(add, { baseY: 1.1, halfBeam: 0.74, mastX: -0.95, spread: 0.42, topY: 5.0 });
  addDeckFurniture(add, { capstanX: 1.3, deckY: 1.02, hatchX: 0.35, hatchHalf: 0.42 });

  addBanner(add, [-0.95, 7.2, 0], 1.25, 0.42);

  builder.addAnchor("anchor-lantern-stern", [-3.3, 2.2, 0], "lantern-stern");
  builder.addAnchor("anchor-lantern-bow", [4.3, 1.75, 0], "lantern-bow");
  builder.addAnchor("anchor-masthead", [2.45, 6.85, 0], "masthead");
  builder.addAnchor("anchor-selection", [0, 1.8, 0], "selection");
  builder.addAnchor("anchor-label", [0, 8.1, 0], "label");

  return builder.finalize({ assertZSymmetric: true });
}

/**
 * Dhow: one enormous settee lateen on a forward-raked pole mast, a long
 * overhanging yard that reaches past the stem, a sharply raked straight stem
 * and a raised poop. The most distinctive silhouette in the fleet — a single
 * vast triangle rather than a stack of squares.
 */
function buildDhow() {
  const builder = createBuilder("garden-hero-dhow");
  const { add } = builder;

  const stations = hullStations({
    bowSharpness: 2.4,
    bowX: 5.7,
    count: 17,
    deckMid: 0.85,
    deckRiseBow: 1.5,
    deckRiseStern: 1.25,
    keelDepth: 0.95,
    maxBeam: 1.62,
    sternX: -4.9,
    transomFraction: 0.7,
    tumbleAft: 0.9,
    tumbleBow: 0.96,
  });
  addHullLoft(add, stations, { bulwarkHeight: 0.24, gunports: false });
  addStrake(add, stations, { h0: 0.86, h1: 0.94, tone: WOOD_TRIM });
  addStrake(add, stations, { h0: 0.46, h1: 0.53, tone: WOOD_WALE });

  add("wood", new BoxGeometry(8.0, 0.2, 0.14), {
    position: [0.2, -0.9, 0],
    tone: WOOD_WALE,
  });
  add("wood", new BoxGeometry(0.14, 1.35, 0.44), {
    position: [-4.94, -0.3, 0],
    rotation: [0, 0, -0.1],
    tone: WOOD_WALE,
  });

  // Straight raked stem post spearing forward above the waterline.
  add("wood", new BoxGeometry(2.9, 0.3, 0.24), {
    position: [5.55, 2.45, 0],
    rotation: [0, 0, 0.62],
    tone: WOOD_TRIM,
  });
  add("wood", new BoxGeometry(0.4, 0.4, 0.2), {
    position: [6.4, 3.75, 0],
    tone: WOOD_TRIM,
  });

  // Raised poop with a carved transom band and lamp-lit quarters.
  add("wood", new BoxGeometry(1.9, 0.95, 1.45), { position: [-3.6, 2.35, 0] });
  add("wood", new BoxGeometry(2.1, 0.16, 1.65), {
    position: [-3.65, 2.9, 0],
    tone: WOOD_TRIM,
  });
  for (const z of [-0.42, 0.42]) {
    add("glow", new PlaneGeometry(0.34, 0.4), {
      position: [-4.57, 2.35, z],
      rotation: [0, -Math.PI / 2, 0],
    });
  }
  for (const side of [-1, 1]) {
    add("glow", new PlaneGeometry(0.44, 0.3), {
      position: [-3.6, 2.3, side * 0.74],
      rotation: [0, side > 0 ? 0 : Math.PI, 0],
    });
  }

  // Main pole mast raked forward under the great lateen.
  addMast(add, 1.5, 1.0, 8.0, 0.1, { platform: false });
  addLateen(add, [2.6, 8.55, 0], [5.5, 2.0, 0], [-1.3, 2.8, 0], 0.5);

  // Small mizzen: bare, so the runtime identity sail becomes its canvas.
  addMast(add, -2.7, 1.5, 6.4, 0.06, { platform: false });
  addIdentityFrame(add, -2.7, 3.0, 5.05, 1.15);

  addStay(add, [2.35, 7.9, 0], [-2.65, 6.25, 0]);
  addStay(add, [-2.65, 6.25, 0], [-4.6, 2.95, 0]);

  addShrouds(add, { baseY: 0.95, halfBeam: 0.7, mastX: 1.5, spread: 0.34, topY: 5.34 });
  addShrouds(add, { baseY: 1.45, halfBeam: 0.62, mastX: -2.7, spread: 0.3, topY: 4.54 });
  addRailPosts(add, stations, { count: 9, height: 0.34 });
  addDeckFurniture(add, { capstanX: -0.4, deckY: 0.96, hatchX: 0.55, hatchHalf: 0.4 });

  addBanner(add, [1.5, 7.95, 0], 1.2, 0.4);

  builder.addAnchor("anchor-lantern-stern", [-3.6, 3.1, 0], "lantern-stern");
  builder.addAnchor("anchor-lantern-bow", [4.4, 2.4, 0], "lantern-bow");
  builder.addAnchor("anchor-masthead", [-2.7, 6.3, 0], "masthead");
  builder.addAnchor("anchor-selection", [0, 1.8, 0], "selection");
  builder.addAnchor("anchor-label", [0, 9.2, 0], "label");

  return builder.finalize({ assertZSymmetric: true });
}

/**
 * Junk: flat-bottomed, blunt-bowed, with a towering square transom and three
 * unstayed masts carrying battened lug sails. The batten spars give hard
 * horizontal banding no other hull in the fleet has.
 */
function buildJunk() {
  const builder = createBuilder("garden-hero-junk");
  const { add } = builder;

  const stations = hullStations({
    bowSharpness: 1.0,
    bowTrim: 0.62,
    bowX: 5.3,
    count: 17,
    deckMid: 1.25,
    deckRiseBow: 0.85,
    deckRiseStern: 1.5,
    keelDepth: 0.7,
    keelFlatness: 0.85,
    maxBeam: 2.1,
    sternX: -5.0,
    transomFraction: 0.86,
    tumbleAft: 1.0,
    tumbleBow: 1.0,
  });
  addHullLoft(add, stations, { bulwarkHeight: 0.3, gunports: false });
  addStrake(add, stations, { h0: 0.9, h1: 0.98, tone: WOOD_TRIM });
  addStrake(add, stations, { h0: 0.62, h1: 0.68, tone: WOOD_WALE });
  addStrake(add, stations, { h0: 0.4, h1: 0.46, tone: WOOD_WALE });

  add("wood", new BoxGeometry(8.4, 0.2, 0.9), {
    position: [0.1, -0.68, 0],
    tone: WOOD_WALE,
  });

  // Towering flat transom, the junk's unmistakable stern.
  add("wood", new BoxGeometry(1.1, 2.05, 2.0), { position: [-5.05, 3.4, 0] });
  add("wood", new BoxGeometry(1.35, 0.2, 2.25), {
    position: [-5.05, 4.5, 0],
    tone: WOOD_TRIM,
  });
  add("wood", new BoxGeometry(1.3, 0.18, 2.2), {
    position: [-5.05, 3.05, 0],
    tone: WOOD_TRIM,
  });
  for (const z of [-0.72, -0.24, 0.24, 0.72]) {
    add("glow", new PlaneGeometry(0.32, 0.5), {
      position: [-5.62, 3.7, z],
      rotation: [0, -Math.PI / 2, 0],
    });
  }
  // Blunt bow transom instead of a stem: no bowsprit anywhere on this hull.
  add("wood", new BoxGeometry(0.28, 1.3, 0.92), {
    position: [5.34, 2.35, 0],
    tone: WOOD_TRIM,
  });

  // Deck houses stepping down forward of the transom.
  add("wood", new BoxGeometry(1.7, 0.75, 1.45), { position: [-2.6, 2.35, 0] });
  add("wood", new BoxGeometry(1.9, 0.15, 1.65), {
    position: [-2.6, 2.8, 0],
    tone: WOOD_TRIM,
  });

  addMast(add, 3.55, 1.9, 6.6, 0.08, { platform: false });
  addBattenedLug(add, {
    aft: 2.1,
    battens: 5,
    billow: 0.3,
    footY: 2.6,
    forward: 0.75,
    mastX: 3.55,
    topY: 6.2,
  });

  // Main mast stays bare between yard and boom: that gap is the identity sail.
  addMast(add, 0.35, 1.85, 8.3, 0.03, { platform: false });
  addIdentityFrame(add, 0.35, 4.25, 6.3, 1.4);

  addMast(add, -3.2, 2.7, 6.5, 0.05, { platform: false });
  addBattenedLug(add, {
    aft: 1.6,
    battens: 4,
    billow: 0.26,
    footY: 3.3,
    forward: 0.6,
    mastX: -3.2,
    topY: 6.1,
  });

  addShrouds(add, { baseY: 1.8, halfBeam: 0.8, mastX: 3.55, ratlines: 2, shrouds: 2, spread: 0.28, topY: 4.71 });
  addShrouds(add, { baseY: 1.75, halfBeam: 1.02, mastX: 0.35, ratlines: 2, shrouds: 2, spread: 0.3, topY: 5.85 });
  addShrouds(add, { baseY: 2.6, halfBeam: 0.98, mastX: -3.2, ratlines: 2, shrouds: 2, spread: 0.26, topY: 5.06 });
  addDeckFurniture(add, { capstanX: 1.75, deckY: 1.28, hatchX: -1.1 });
  addShipsBoat(add, 2.15, 1.62);

  addBanner(add, [0.35, 8.3, 0], 1.3, 0.44);

  builder.addAnchor("anchor-lantern-stern", [-5.05, 4.7, 0], "lantern-stern");
  builder.addAnchor("anchor-lantern-bow", [4.6, 2.5, 0], "lantern-bow");
  builder.addAnchor("anchor-masthead", [0.35, 8.2, 0], "masthead");
  builder.addAnchor("anchor-selection", [0, 2.4, 0], "selection");
  builder.addAnchor("anchor-label", [0, 9.4, 0], "label");

  return builder.finalize({ assertZSymmetric: true });
}

/**
 * Barquentine: square fore, gaff main and gaff mizzen. Three masts, but only
 * the forward one carries yards — a rig that reads as "half square-rigger,
 * half schooner" and separates cleanly from both.
 */
function buildBarquentine() {
  const builder = createBuilder("garden-hero-barquentine");
  const { add } = builder;

  const stations = hullStations({
    bowSharpness: 2.0,
    bowX: 6.0,
    count: 19,
    deckMid: 1.1,
    deckRiseBow: 0.8,
    deckRiseStern: 0.6,
    keelDepth: 0.95,
    maxBeam: 1.9,
    sternX: -5.3,
    transomFraction: 0.62,
    tumbleAft: 0.88,
    tumbleBow: 0.94,
  });
  addHullLoft(add, stations, { bulwarkHeight: 0.3, gunports: false });
  addStrake(add, stations, { h0: 0.88, h1: 0.96, tone: WOOD_TRIM });
  addStrake(add, stations, { h0: 0.66, h1: 0.72, tone: WOOD_TRIM });
  addStrake(add, stations, { h0: 0.48, h1: 0.55, tone: WOOD_WALE });

  add("wood", new BoxGeometry(8.6, 0.2, 0.15), {
    position: [0.2, -0.9, 0],
    tone: WOOD_WALE,
  });
  add("wood", new BoxGeometry(0.15, 1.35, 0.44), {
    position: [-5.33, -0.3, 0],
    rotation: [0, 0, -0.08],
    tone: WOOD_WALE,
  });

  add("wood", new BoxGeometry(2.05, 0.8, 1.6), { position: [-3.6, 1.85, 0] });
  add("wood", new BoxGeometry(2.25, 0.15, 1.8), {
    position: [-3.65, 2.3, 0],
    tone: WOOD_TRIM,
  });
  for (const z of [-0.5, 0.5]) {
    add("glow", new PlaneGeometry(0.3, 0.36), {
      position: [-5.4, 1.85, z],
      rotation: [0, -Math.PI / 2, 0],
    });
  }
  for (const side of [-1, 1]) {
    for (const x of [-3.0, -4.1]) {
      add("glow", new PlaneGeometry(0.42, 0.3), {
        position: [x, 1.85, side * 0.82],
        rotation: [0, side > 0 ? 0 : Math.PI, 0],
      });
    }
  }
  add("wood", new BoxGeometry(1.5, 0.24, 0.18), {
    position: [5.5, 1.75, 0],
    rotation: [0, 0, 0.34],
    tone: WOOD_TRIM,
  });

  addMast(add, 3.8, 1.4, 7.4, -0.03);
  addIdentityFrame(add, 3.8, 3.65, 5.7, 1.35);
  addSquareSail(add, 3.82, 6.35, 1.1, 0.9, { yaw: 0.06 });

  addMast(add, 0.4, 1.25, 7.9, -0.04, { platform: false });
  addGaffSail(add, {
    billow: 0.4,
    boomAft: 2.5,
    boomY: 1.95,
    gaffAft: 2.0,
    gaffY: 5.4,
    mastX: 0.4,
    peakRise: 0.8,
  });

  addMast(add, -3.0, 1.6, 7.0, -0.04, { platform: false });
  addGaffSail(add, {
    billow: 0.36,
    boomAft: 2.05,
    boomY: 2.65,
    gaffAft: 1.7,
    gaffY: 5.2,
    mastX: -3.0,
    peakRise: 0.7,
  });

  add("spar", new CylinderGeometry(0.07, 0.12, 3.1, 6), {
    position: [6.4, 2.25, 0],
    rotation: [0, 0, Math.PI / 2 - 0.28],
  });
  addJib(add, [4.6, 3.6, 0], [7.7, 3.0, 0], [4.6, 2.1, 0], 0.42);

  addStay(add, [7.75, 3.05, 0], [3.85, 7.25, 0]);
  addStay(add, [3.85, 7.25, 0], [0.45, 7.75, 0]);
  addStay(add, [0.45, 7.75, 0], [-2.95, 6.85, 0]);

  addShrouds(add, { baseY: 1.35, halfBeam: 0.7, mastX: 3.8, spread: 0.4, topY: 5.12 });
  addShrouds(add, { baseY: 1.2, halfBeam: 0.8, mastX: 0.4, spread: 0.44, topY: 5.38 });
  addShrouds(add, { baseY: 1.55, halfBeam: 0.78, mastX: -3.0, spread: 0.38, topY: 4.95 });
  addDeckFurniture(add, { capstanX: 2.15, deckY: 1.12, hatchX: -1.4, hatchHalf: 0.45 });
  addShipsBoat(add, 1.4, 1.5);

  addBanner(add, [0.4, 7.8, 0], 1.3, 0.44);

  builder.addAnchor("anchor-lantern-stern", [-3.65, 2.5, 0], "lantern-stern");
  builder.addAnchor("anchor-lantern-bow", [4.7, 1.95, 0], "lantern-bow");
  builder.addAnchor("anchor-masthead", [3.8, 7.3, 0], "masthead");
  builder.addAnchor("anchor-selection", [0, 2.0, 0], "selection");
  builder.addAnchor("anchor-label", [0, 8.6, 0], "label");

  return builder.finalize({ assertZSymmetric: true });
}

/**
 * Cog: the medieval workhorse. Flat bottom, straight raked stem and sternpost,
 * clinker planking banding the whole flank, crenellated fore and aft castles,
 * and one mast carrying one huge square sail — which is the identity sail.
 */
function buildCog() {
  const builder = createBuilder("garden-hero-cog");
  const { add } = builder;

  const stations = hullStations({
    bowSharpness: 1.0,
    bowTrim: 0.78,
    bowX: 5.6,
    count: 15,
    deckMid: 1.5,
    deckRiseBow: 1.0,
    deckRiseStern: 1.0,
    keelDepth: 0.85,
    keelFlatness: 0.9,
    maxBeam: 2.3,
    sternX: -5.4,
    transomFraction: 0.8,
    tumbleAft: 0.98,
    tumbleBow: 0.98,
  });
  addHullLoft(add, stations, { bulwarkHeight: 0.34, gunports: false });

  // Clinker planking: overlapping strake bands are the cog's whole surface
  // language, so it gets four instead of the usual two.
  addStrake(add, stations, { h0: 0.9, h1: 0.98, tone: WOOD_TRIM });
  addStrake(add, stations, { h0: 0.74, h1: 0.8, tone: WOOD_WALE });
  addStrake(add, stations, { h0: 0.6, h1: 0.66, tone: WOOD_WALE });
  addStrake(add, stations, { h0: 0.46, h1: 0.52, tone: WOOD_WALE });
  addStrake(add, stations, { h0: 0.32, h1: 0.38, tone: WOOD_WALE });

  add("wood", new BoxGeometry(9.2, 0.22, 1.0), {
    position: [0.1, -0.82, 0],
    tone: WOOD_WALE,
  });
  // Straight stem and sternpost, raked hard — no curve anywhere on this hull.
  add("wood", new BoxGeometry(2.7, 0.34, 0.28), {
    position: [5.55, 2.1, 0],
    rotation: [0, 0, 0.72],
    tone: WOOD_TRIM,
  });
  add("wood", new BoxGeometry(2.5, 0.34, 0.28), {
    position: [-5.4, 2.1, 0],
    rotation: [0, 0, -0.72],
    tone: WOOD_TRIM,
  });
  add("wood", new BoxGeometry(0.2, 1.6, 0.5), {
    position: [-5.5, -0.15, 0],
    rotation: [0, 0, -0.16],
    tone: WOOD_WALE,
  });

  // Fore and aft fighting castles.
  add("wood", new BoxGeometry(1.75, 1.45, 1.7), { position: [4.05, 3.4, 0] });
  add("wood", new BoxGeometry(1.95, 0.18, 1.9), {
    position: [4.05, 4.22, 0],
    tone: WOOD_TRIM,
  });
  addCrenels(add, 3.35, 4.75, 4.31, 0.87, 5);
  add("wood", new BoxGeometry(2.0, 1.55, 1.85), { position: [-3.95, 3.45, 0] });
  add("wood", new BoxGeometry(2.2, 0.18, 2.05), {
    position: [-3.95, 4.32, 0],
    tone: WOOD_TRIM,
  });
  addCrenels(add, -4.75, -3.15, 4.41, 0.95, 5);
  for (const z of [-0.5, 0.5]) {
    add("glow", new PlaneGeometry(0.34, 0.42), {
      position: [-4.97, 3.4, z],
      rotation: [0, -Math.PI / 2, 0],
    });
  }

  // One mast, one course — the runtime identity sail fills the frame.
  addMast(add, 0.2, 1.6, 7.9, -0.02);
  addIdentityFrame(add, 0.2, 3.9, 6.05, 1.75);
  addFurled(add, 0.22, 6.95, 1.35);

  addStay(add, [5.05, 3.6, 0], [0.25, 7.8, 0]);
  addStay(add, [0.25, 7.8, 0], [-4.85, 3.7, 0]);
  for (const side of [-1, 1]) {
    addStay(add, [0.25, 7.3, 0], [0.4, 2.0, side * 1.05]);
  }

  addShrouds(add, {
    baseY: 1.55,
    halfBeam: 1.02,
    mastX: 0.2,
    ratlines: 4,
    shrouds: 4,
    spread: 0.6,
    topY: 5.5,
  });
  addDeckFurniture(add, { capstanX: -1.55, deckY: 1.52, hatchX: 1.6 });
  addShipsBoat(add, 2.55, 1.9);

  addBanner(add, [0.2, 7.85, 0], 1.35, 0.46);

  builder.addAnchor("anchor-lantern-stern", [-3.95, 4.6, 0], "lantern-stern");
  builder.addAnchor("anchor-lantern-bow", [4.05, 4.5, 0], "lantern-bow");
  builder.addAnchor("anchor-masthead", [0.2, 7.8, 0], "masthead");
  builder.addAnchor("anchor-selection", [0, 2.6, 0], "selection");
  builder.addAnchor("anchor-label", [0, 9.0, 0], "label");

  return builder.finalize({ assertZSymmetric: true });
}

/**
 * Xebec: long, low and lean, with three forward-raked lateen masts, a long
 * overhanging beakhead and an overhanging stern gallery. Nothing else in the
 * fleet leans forward, so the rake alone identifies it.
 */
function buildXebec() {
  const builder = createBuilder("garden-hero-xebec");
  const { add } = builder;

  const stations = hullStations({
    bowSharpness: 2.6,
    bowX: 6.2,
    count: 19,
    deckMid: 0.9,
    deckRiseBow: 0.9,
    deckRiseStern: 0.9,
    keelDepth: 0.95,
    maxBeam: 1.7,
    sternX: -5.6,
    transomFraction: 0.66,
    tumbleAft: 0.82,
    tumbleBow: 0.9,
  });
  addHullLoft(add, stations, { bulwarkHeight: 0.24, gunports: false });
  addStrake(add, stations, { h0: 0.88, h1: 0.96, tone: WOOD_TRIM });
  addStrake(add, stations, { h0: 0.44, h1: 0.5, tone: WOOD_WALE });
  // Oar ports: the xebec was rowed as well as sailed.
  addStrake(add, stations, { h0: 0.6, h1: 0.67, painter: "gunports" });

  add("wood", new BoxGeometry(9.0, 0.2, 0.14), {
    position: [0.2, -0.9, 0],
    tone: WOOD_WALE,
  });
  add("wood", new BoxGeometry(0.14, 1.3, 0.42), {
    position: [-5.63, -0.3, 0],
    rotation: [0, 0, -0.08],
    tone: WOOD_WALE,
  });

  // Long overhanging beakhead spearing forward past the stem.
  add("wood", new BoxGeometry(2.0, 0.22, 0.5), {
    position: [6.3, 1.7, 0],
    rotation: [0, 0, 0.16],
    tone: WOOD_TRIM,
  });
  add("wood", new ConeGeometry(0.16, 0.6, 5), {
    position: [7.3, 1.9, 0],
    rotation: [0, 0, -Math.PI / 2 + 0.16],
    tone: WOOD_TRIM,
  });

  // Overhanging stern gallery with lit quarter lights.
  add("wood", new BoxGeometry(1.35, 0.95, 1.5), { position: [-5.75, 2.05, 0] });
  add("wood", new BoxGeometry(1.6, 0.16, 1.7), {
    position: [-5.75, 2.6, 0],
    tone: WOOD_TRIM,
  });
  for (const z of [-0.44, 0.44]) {
    add("glow", new PlaneGeometry(0.32, 0.4), {
      position: [-6.44, 2.05, z],
      rotation: [0, -Math.PI / 2, 0],
    });
  }
  for (const side of [-1, 1]) {
    add("glow", new PlaneGeometry(0.42, 0.32), {
      position: [-5.75, 2.0, side * 0.77],
      rotation: [0, side > 0 ? 0 : Math.PI, 0],
    });
  }

  addMast(add, 3.6, 1.2, 7.6, 0.13, { platform: false });
  addLateen(add, [3.9, 7.9, 0], [6.9, 1.9, 0], [1.55, 2.6, 0], 0.42);

  // Middle mast bare: the identity sail is this ship's mainsail.
  addMast(add, 0.15, 1.15, 8.3, 0.11, { platform: false });
  addIdentityFrame(add, 0.15, 4.25, 6.3, 1.3);

  addMast(add, -3.4, 1.5, 7.0, 0.09, { platform: false });
  addLateen(add, [-3.15, 7.3, 0], [-0.5, 2.0, 0], [-5.6, 2.9, 0], 0.4);

  addStay(add, [3.75, 7.75, 0], [0.2, 8.2, 0]);
  addStay(add, [0.2, 8.2, 0], [-3.3, 6.9, 0]);

  addShrouds(add, { baseY: 1.15, halfBeam: 0.62, mastX: 3.6, ratlines: 2, shrouds: 2, spread: 0.3, topY: 4.97 });
  addShrouds(add, { baseY: 1.05, halfBeam: 0.7, mastX: 0.15, ratlines: 2, shrouds: 2, spread: 0.32, topY: 5.58 });
  addShrouds(add, { baseY: 1.45, halfBeam: 0.66, mastX: -3.4, ratlines: 2, shrouds: 2, spread: 0.3, topY: 4.91 });
  addRailPosts(add, stations, { count: 11, height: 0.3 });
  addDeckFurniture(add, { capstanX: -1.6, deckY: 0.92, hatchX: 1.75, hatchHalf: 0.42 });

  addBanner(add, [0.15, 8.25, 0], 1.3, 0.42);

  builder.addAnchor("anchor-lantern-stern", [-5.75, 2.8, 0], "lantern-stern");
  builder.addAnchor("anchor-lantern-bow", [4.9, 1.8, 0], "lantern-bow");
  builder.addAnchor("anchor-masthead", [0.15, 8.2, 0], "masthead");
  builder.addAnchor("anchor-selection", [0, 1.9, 0], "selection");
  builder.addAnchor("anchor-label", [0, 9.4, 0], "label");

  return builder.finalize({ assertZSymmetric: true });
}

/**
 * Cutter: one tall mast, a gaff mainsail and boom, and a bowsprit almost as
 * long as the hull carrying two headsails. The smallest hero, and the only one
 * whose rig extends further forward than its own stem.
 */
function buildCutter() {
  const builder = createBuilder("garden-hero-cutter");
  const { add } = builder;

  const stations = hullStations({
    bowSharpness: 2.2,
    bowX: 5.0,
    count: 15,
    deckMid: 0.95,
    deckRiseBow: 0.75,
    deckRiseStern: 0.4,
    keelDepth: 1.0,
    maxBeam: 1.55,
    sternX: -4.6,
    transomFraction: 0.55,
    tumbleAft: 0.9,
    tumbleBow: 0.95,
  });
  addHullLoft(add, stations, { bulwarkHeight: 0.22, gunports: false });
  addStrake(add, stations, { h0: 0.86, h1: 0.94, tone: WOOD_TRIM });
  addStrake(add, stations, { h0: 0.52, h1: 0.58, tone: WOOD_WALE });

  add("wood", new BoxGeometry(7.6, 0.2, 0.14), {
    position: [0.1, -0.96, 0],
    tone: WOOD_WALE,
  });
  add("wood", new BoxGeometry(0.14, 1.4, 0.4), {
    position: [-4.63, -0.35, 0],
    rotation: [0, 0, -0.1],
    tone: WOOD_WALE,
  });

  // Low coachroof with a lit skylight; nothing else clutters the deck.
  add("wood", new BoxGeometry(1.75, 0.55, 1.15), { position: [-1.6, 1.3, 0] });
  add("wood", new BoxGeometry(1.95, 0.13, 1.35), {
    position: [-1.6, 1.62, 0],
    tone: WOOD_TRIM,
  });
  for (const side of [-1, 1]) {
    for (const x of [-1.15, -2.05]) {
      add("glow", new PlaneGeometry(0.36, 0.24), {
        position: [x, 1.3, side * 0.6],
        rotation: [0, side > 0 ? 0 : Math.PI, 0],
      });
    }
  }

  addMast(add, 0.5, 1.15, 9.2, -0.05, { platform: false });
  addGaffSail(add, {
    billow: 0.4,
    boomAft: 3.2,
    boomY: 1.75,
    gaffAft: 2.6,
    gaffY: 4.3,
    mastX: 0.5,
    peakRise: 0.85,
  });
  // The identity sail flies above the gaff, as a cutter's topsail does.
  addIdentityFrame(add, 0.5, 4.85, 6.85, 1.15);

  // Bowsprit nearly as long as the hull, with jib and staysail.
  add("spar", new CylinderGeometry(0.06, 0.11, 3.9, 6), {
    position: [6.6, 1.95, 0],
    rotation: [0, 0, Math.PI / 2 - 0.16],
  });
  addJib(add, [1.2, 7.6, 0], [8.35, 2.35, 0], [3.2, 1.95, 0], 0.45);
  addJib(add, [1.6, 5.2, 0], [5.6, 2.35, 0], [2.6, 1.85, 0], 0.34);

  addStay(add, [8.4, 2.4, 0], [0.55, 9.05, 0]);
  addStay(add, [0.55, 9.05, 0], [-4.35, 1.5, 0]);

  addShrouds(add, {
    baseY: 1.1,
    halfBeam: 0.66,
    mastX: 0.5,
    ratlines: 4,
    shrouds: 4,
    spread: 0.44,
    topY: 6.0,
  });
  addRailPosts(add, stations, { count: 14, height: 0.28 });
  addDeckFurniture(add, { capstanX: 2.5, deckY: 1.0, hatchX: 1.3, hatchHalf: 0.38 });
  addShipsBoat(add, -3.35, 1.28);

  addBanner(add, [0.5, 9.1, 0], 1.15, 0.4);

  builder.addAnchor("anchor-lantern-stern", [-3.4, 1.55, 0], "lantern-stern");
  builder.addAnchor("anchor-lantern-bow", [3.9, 1.6, 0], "lantern-bow");
  builder.addAnchor("anchor-masthead", [0.5, 9.1, 0], "masthead");
  builder.addAnchor("anchor-selection", [0, 1.6, 0], "selection");
  builder.addAnchor("anchor-label", [0, 10.2, 0], "label");

  return builder.finalize({ assertZSymmetric: true });
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
    ["spar", new MeshStandardMaterial({
      color: "#2e2620",
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
    if (materialName === "wood") paintWood(geometry, transform.tone ?? null);
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
  return [station.x, y, side * halfWidth];
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
      return [station.x, station.deckY + camber, across * station.deckBeam];
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
      return [station.x, y, side * (station.deckBeam * inset - inner)];
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
    const z = transomRows[j][2] * (i === 0 ? 1 : -1);
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
function addStrake(add, stations, { h0, h1, painter = null, tone = null }) {
  for (const side of [-1, 1]) {
    const geometry = gridGeometry(stations.length, 2, (i, j) => {
      const point = ringPoint(stations[i], j === 0 ? h0 : h1, side);
      return [point[0], point[1], point[2] * 1.018 + side * 0.012];
    }, { expected: [0, 0, side] });
    if (painter === "gunports") paintGunports(geometry);
    add("wood", geometry, { tone });
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
function addFigurehead(add, origin) {
  const [ox, oy, oz] = origin;
  add("wood", new CylinderGeometry(0.09, 0.13, 0.9, 6), {
    position: [ox - 0.28, oy + 0.28, oz],
    rotation: [0, 0, 0.85],
    tone: WOOD_TRIM,
  });
  add("wood", new SphereGeometry(0.26, 7, 5), {
    position: [ox + 0.08, oy + 0.62, oz],
    scale: [1.35, 1, 0.72],
    tone: WOOD_TRIM,
  });
  add("wood", new SphereGeometry(0.15, 6, 5), {
    position: [ox + 0.42, oy + 0.86, oz],
    tone: WOOD_TRIM,
  });
  add("wood", new ConeGeometry(0.12, 0.5, 5), {
    position: [ox + 0.3, oy + 1.05, oz],
    rotation: [0, 0, -0.9],
    tone: WOOD_TRIM,
  });
  // Swept wings folded back along the beakhead.
  for (const side of [-1, 1]) {
    add("wood", new BoxGeometry(0.72, 0.3, 0.08), {
      position: [ox - 0.12, oy + 0.66, side * 0.24],
      rotation: [side * 0.5, 0.25, 0.35],
      tone: WOOD_TRIM,
    });
  }
}

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
function addGaffSail(add, { billow, boomAft, boomY, gaffAft, gaffY, mastX, peakRise }) {
  const tack = [mastX - 0.1, boomY, 0];
  const clew = [mastX - boomAft, boomY + 0.14, 0];
  const throat = [mastX - 0.08, gaffY, 0];
  const peak = [mastX - gaffAft, gaffY + peakRise, 0];
  addStay(add, tack, clew, 0.055);
  addStay(add, throat, peak, 0.05);
  add("sail", quadSailGeometry({ clew, peak, tack, throat }, billow));
}

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
function addShrouds(add, { baseY, halfBeam, mastX, ratlines = 3, shrouds = 3, spread = 0.5, topY }) {
  for (const side of [-1, 1]) {
    const head = [mastX, topY, side * 0.11];
    const feet = [];
    for (let index = 0; index < shrouds; index += 1) {
      const offset = shrouds === 1 ? 0 : (index / (shrouds - 1) - 0.5) * spread * 2;
      const foot = [mastX + offset, baseY, side * halfBeam];
      feet.push(foot);
      addStay(add, foot, head, 0.022);
    }
    for (let rung = 1; rung <= ratlines; rung += 1) {
      const climb = rung / (ratlines + 1);
      const along = (foot) => foot.map((value, axis) => value + (head[axis] - value) * climb);
      addStay(add, along(feet[0]), along(feet[feet.length - 1]), 0.018);
    }
  }
}

/** Grating hatch and capstan drum: the deck stops reading as a bare plank. */
function addDeckFurniture(add, { capstanX, deckY, hatchX, hatchHalf = 0.5 }) {
  add("wood", new BoxGeometry(0.95, 0.12, hatchHalf * 2), {
    position: [hatchX, deckY + 0.06, 0],
    tone: WOOD_WALE,
  });
  for (const offset of [-0.3, 0, 0.3]) {
    add("wood", new BoxGeometry(0.08, 0.16, hatchHalf * 2.06), {
      position: [hatchX + offset, deckY + 0.12, 0],
      tone: WOOD_TRIM,
    });
  }
  add("wood", new CylinderGeometry(0.16, 0.21, 0.42, 6), {
    position: [capstanX, deckY + 0.21, 0],
    tone: WOOD_TRIM,
  });
  add("wood", new CylinderGeometry(0.27, 0.27, 0.08, 6), {
    position: [capstanX, deckY + 0.45, 0],
    tone: WOOD_TRIM,
  });
}

/** Ship's boat stowed on deck chocks — scale cue and deck interest. */
function addShipsBoat(add, x, y) {
  add("wood", new SphereGeometry(0.5, 7, 4), {
    position: [x, y, 0],
    scale: [1.7, 0.44, 0.66],
    tone: WOOD_MID,
  });
  add("wood", new BoxGeometry(1.6, 0.07, 0.24), {
    position: [x, y + 0.17, 0],
    tone: WOOD_TRIM,
  });
}

/** Open rail: stanchions and a cap rail, for hulls with no solid bulwark. */
function addRailPosts(add, stations, { count, height }) {
  for (const side of [-1, 1]) {
    for (let index = 0; index < count; index += 1) {
      const station = stations[Math.round(((index + 0.5) / count) * (stations.length - 1))];
      add("wood", new BoxGeometry(0.09, height, 0.09), {
        position: [station.x, station.deckY + height / 2, side * station.deckBeam],
        tone: WOOD_TRIM,
      });
    }
  }
}

/** Crenellated rail caps along a castle roof — the cog's fighting platform. */
function addCrenels(add, x0, x1, y, halfBeam, count) {
  for (const side of [-1, 1]) {
    for (let index = 0; index < count; index += 1) {
      const t = count === 1 ? 0.5 : index / (count - 1);
      add("wood", new BoxGeometry(0.24, 0.3, 0.14), {
        position: [x0 + (x1 - x0) * t, y + 0.15, side * halfBeam],
        tone: WOOD_TRIM,
      });
    }
  }
}

/** Furled sail: yard plus a slim bundled cylinder of canvas along it. */
function addFurled(add, mastX, y, halfWidth) {
  add("spar", new BoxGeometry(halfWidth * 2.05, 0.1, 0.1), {
    position: [mastX, y, 0],
  });
  add("sail", new CylinderGeometry(0.15, 0.15, halfWidth * 1.9, 6), {
    furled: true,
    position: [mastX, y - 0.05, 0],
    rotation: [0, 0, Math.PI / 2],
  });
}

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
