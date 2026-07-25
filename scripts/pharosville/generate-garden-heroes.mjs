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

// Shared hull DNA for the Sky squadron (N5(b)): DAI and USDS are built from
// the same station parameters at different lengths, so they read as two ships
// from one yard. Lives up here with the other module constants because the
// generation loop at the top of the file runs before function bodies do.
const SKY_SQUADRON_HULL = {
  bowSharpness: 1.5,
  bowTrim: 0.92,
  deckMid: 1.3,
  deckRiseBow: 0.8,
  deckRiseStern: 0.85,
  keelDepth: 1.0,
  maxBeam: 2.15,
  transomFraction: 0.72,
  tumbleAft: 0.8,
  tumbleBow: 0.86,
};


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
  // N5(b): seven bespoke hulls, one per named titan. These are not variations
  // on the generic ten — each carries a structure no other vessel has (netted
  // cargo and derricks, a glazed gallery, a temple portico, outrigger floats,
  // oar banks, paddle boxes), so the ship people look for by name is
  // identifiable from its silhouette alone.
  { build: buildTether, id: "garden-hero-tether" },
  { build: buildCircle, id: "garden-hero-circle" },
  { build: buildMaker, id: "garden-hero-maker" },
  { build: buildSky, id: "garden-hero-sky" },
  { build: buildEthena, id: "garden-hero-ethena" },
  { build: buildLiberty, id: "garden-hero-liberty" },
  { build: buildPaypal, id: "garden-hero-paypal" },
  // W5 (decision D6): XAUT had no bespoke hull at all — it shared the generic
  // treasury galleon with BUIDL, which is the one titan the operator could not
  // recognise because it was not its own ship.
  { build: buildBullion, id: "garden-hero-bullion" },
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
    maxBeam: 1.78,
    sternX: -5.1,
    transomFraction: 0.7,
    tumbleAft: 0.8,
    tumbleBow: 0.92,
  });
  addHullLoft(add, stations, { bulwarkHeight: 0.34, gunports: true });

  // Sheer strake (trim) at the gunwale and a dark wale mid-hull: the classic
  // dark-band / light-stripe color blocking (S4).
  addStrake(add, stations, { h0: 0.9, h1: 0.97, paint: true, tone: WOOD_TRIM });
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
  // W7: a fourth tier, so the treasure fleet's flagship out-towers the carrack.
  add("wood", new BoxGeometry(1.2, 0.7, 1.6), { position: [-4.35, 5.85, 0] });
  add("wood", new BoxGeometry(1.4, 0.15, 1.8), {
    position: [-4.35, 6.28, 0],
    tone: WOOD_TRIM,
  });
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
  // W7: a gilded beakhead grating projecting past the stem, with a head rail
  // each side. The galleon's wealth reads forward as well as aft, and the
  // structure extends the plan where the carrack's crenels do not.
  add("wood", new BoxGeometry(1.9, 0.14, 0.95), {
    position: [7.0, 2.05, 0],
    rotation: [0, 0, -0.18],
    tone: WOOD_TRIM,
  });
  for (const side of [-1, 1]) {
    add("wood", new BoxGeometry(2.1, 0.12, 0.12), {
      position: [6.95, 2.42, side * 0.44],
      rotation: [0, 0, -0.2],
      tone: WOOD_HIGH,
    });
    for (const legX of [6.35, 7.4]) {
      add("spar", new CylinderGeometry(0.05, 0.05, 0.42, 4), {
        position: [legX, 2.24, side * 0.44],
      });
    }
  }
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

  addStrake(add, stations, { h0: 0.88, h1: 0.96, paint: true, tone: WOOD_TRIM });
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
  // W7: a jibboom carried out beyond the bowsprit. The clipper's whole claim is
  // reach; a spar past the stem extends the plan outline, which is one of the
  // only two places the isometric camera registers anything.
  add("spar", new CylinderGeometry(0.04, 0.07, 2.6, 5), {
    position: [8.05, 3.35, 0],
    rotation: [0, 0, Math.PI / 2 - 0.2],
  });
  addStay(add, [9.25, 3.6, 0], [3.4, 5.7, 0], 0.024);
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
    deckMid: 1.62,
    deckRiseBow: 1.35,
    deckRiseStern: 1.5,
    keelDepth: 1.05,
    maxBeam: 2.95,
    sternX: -5.15,
    transomFraction: 0.74,
    tumbleAft: 0.72,
    tumbleBow: 0.8,
  });
  addHullLoft(add, stations, { bulwarkHeight: 0.4, gunports: true });
  addStrake(add, stations, { h0: 0.91, h1: 0.99, paint: true, tone: WOOD_TRIM });
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
  // W7: the forecastle OVERHANGS the stem. A fortress that stops at the stem is
  // just a box on a boat; carrying it out past the bow is what states the type,
  // and it extends the plan silhouette where the cog's towers do not.
  add("wood", new BoxGeometry(2.0, 1.15, 1.55), { position: [5.55, 3.15, 0] });
  add("wood", new BoxGeometry(2.2, 0.16, 1.75), {
    position: [5.55, 3.8, 0],
    tone: WOOD_TRIM,
  });
  addCrenels(add, 4.75, 6.35, 3.96, 0.88, 4);
  for (const side of [-1, 1]) {
    add("wood", new BoxGeometry(0.22, 1.25, 0.2), {
      position: [5.9, 2.05, side * 0.5],
      rotation: [0, 0, -0.34],
      tone: WOOD_MID,
    });
  }
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
  // Third tier: the carrack is the tallest thing afloat aft.
  add("wood", new BoxGeometry(1.45, 0.95, 1.5), { position: [-4.3, 5.72, 0] });
  add("wood", new BoxGeometry(1.6, 0.16, 1.65), {
    position: [-4.3, 6.28, 0],
    tone: WOOD_TRIM,
  });
  addCrenels(add, -5.0, -3.6, 6.44, 0.82, 4);
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
  addStrake(add, stations, { h0: 0.88, h1: 0.96, paint: true, tone: WOOD_TRIM });
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

  // W7: the main boom sheets right out past the transom. "Canvas forward, boom
  // aft" is the brigantine's brief and the overhang is what makes it legible.
  add("spar", new CylinderGeometry(0.055, 0.08, 5.2, 5), {
    position: [-3.25, 2.05, 0],
    rotation: [0, 0, Math.PI / 2 + 0.04],
  });
  add("wood", new BoxGeometry(0.22, 0.22, 0.22), {
    position: [-5.8, 1.95, 0],
    tone: WOOD_TRIM,
  });
  addStay(add, [-5.8, 1.95, 0], [-0.95, 6.1, 0], 0.026);
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
  addStrake(add, stations, { h0: 0.86, h1: 0.94, paint: true, tone: WOOD_TRIM });
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
  // W7: the yard is carried further forward and its heel further aft, so the
  // single vast triangle overhangs BOTH ends. Nothing else in the world does.
  add("spar", new CylinderGeometry(0.05, 0.11, 11.4, 5), {
    position: [2.35, 5.35, 0],
    rotation: [0, 0, 0.62],
  });
  addLateen(add, [1.55, 9.55, 0], [7.5, 1.35, 0], [-1.3, 2.8, 0], 0.5);

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
    deckMid: 0.95,
    deckRiseBow: 0.85,
    deckRiseStern: 2.4,
    keelDepth: 0.7,
    keelFlatness: 0.85,
    maxBeam: 2.35,
    sternX: -5.0,
    transomFraction: 0.86,
    tumbleAft: 1.0,
    tumbleBow: 1.0,
  });
  addHullLoft(add, stations, { bulwarkHeight: 0.3, gunports: false });
  addStrake(add, stations, { h0: 0.9, h1: 0.98, paint: true, tone: WOOD_TRIM });
  addStrake(add, stations, { h0: 0.62, h1: 0.68, tone: WOOD_WALE });
  addStrake(add, stations, { h0: 0.4, h1: 0.46, tone: WOOD_WALE });

  add("wood", new BoxGeometry(8.4, 0.2, 0.9), {
    position: [0.1, -0.68, 0],
    tone: WOOD_WALE,
  });

  // Towering flat transom, the junk's unmistakable stern.
  // W7: the transom goes higher again. A junk's stern is the tallest flat face
  // in the world and it should out-read every castle in the fleet.
  add("wood", new BoxGeometry(0.95, 1.4, 1.7), { position: [-5.1, 6.5, 0] });
  add("wood", new BoxGeometry(1.2, 0.18, 1.95), {
    position: [-5.1, 7.28, 0],
    tone: WOOD_TRIM,
  });
  for (const side of [-1, 1]) {
    add("glow", new PlaneGeometry(0.3, 0.34), {
      position: [-5.1, 6.5, side * 0.87],
      rotation: [0, side > 0 ? 0 : Math.PI, 0],
    });
  }
  add("wood", new BoxGeometry(1.1, 2.6, 2.0), { position: [-5.05, 4.3, 0] });
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
  addStrake(add, stations, { h0: 0.88, h1: 0.96, paint: true, tone: WOOD_TRIM });
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

  // W7: the two gaff booms are carried well aft, so the "square forward,
  // fore-and-aft behind" split shows in the plan and not only in the sail shapes.
  for (const [mastX, boomY, length] of [[0.4, 2.35, 4.0], [-3.0, 2.15, 3.6]]) {
    add("spar", new CylinderGeometry(0.05, 0.075, length, 5), {
      position: [mastX - length / 2 + 0.2, boomY, 0],
      rotation: [0, 0, Math.PI / 2 + 0.03],
    });
  }
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
    deckMid: 1.95,
    deckRiseBow: 1.0,
    deckRiseStern: 1.0,
    keelDepth: 0.85,
    keelFlatness: 0.9,
    maxBeam: 1.75,
    sternX: -5.4,
    transomFraction: 0.8,
    tumbleAft: 0.98,
    tumbleBow: 0.98,
  });
  addHullLoft(add, stations, { bulwarkHeight: 0.34, gunports: false });

  // Clinker planking: overlapping strake bands are the cog's whole surface
  // language, so it gets four instead of the usual two.
  addStrake(add, stations, { h0: 0.9, h1: 0.98, paint: true, tone: WOOD_TRIM });
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

  // W7: fighting TOWERS, not castles. Narrow, tall, standing clear of the deck
  // on legs — which is what a cog's castles actually were, and the only way to
  // separate this hull from the carrack, whose castles are wide and heavy.
  addEndTower(add, { deckY: 3.0, halfBeam: 0.6, halfWidth: 0.68, height: 2.3, x: 4.2 });
  addEndTower(add, { deckY: 3.1, halfBeam: 0.66, halfWidth: 0.74, height: 2.7, x: -4.15 });

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
  addStrake(add, stations, { h0: 0.88, h1: 0.96, paint: true, tone: WOOD_TRIM });
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
  // W7: a long beakhead spike forward. The xebec is the only hull that leans
  // forward, and a spar out past the stem doubles that read in the plan.
  add("wood", new BoxGeometry(2.9, 0.16, 0.3), {
    position: [7.15, 2.35, 0],
    rotation: [0, 0, -0.1],
    tone: WOOD_TRIM,
  });
  add("wood", new ConeGeometry(0.16, 0.7, 5), {
    position: [8.55, 2.2, 0],
    rotation: [0, 0, -Math.PI / 2 - 0.1],
    tone: WOOD_HIGH,
  });
  // Stern gallery carried further out over the water on corbels.
  for (const side of [-1, 1]) {
    add("wood", new BoxGeometry(0.7, 0.14, 0.16), {
      position: [-6.15, 1.5, side * 0.55],
      rotation: [0, 0, 0.4],
      tone: WOOD_MID,
    });
  }
  add("wood", new BoxGeometry(1.35, 0.95, 1.5), { position: [-6.4, 2.05, 0] });
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
  addStrake(add, stations, { h0: 0.86, h1: 0.94, paint: true, tone: WOOD_TRIM });
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
  // W7: the cutter's brief is "the only hero whose rig reaches further forward
  // than its own stem". At 3.9 it barely did; a jibboom makes it unarguable.
  add("spar", new CylinderGeometry(0.035, 0.06, 3.0, 5), {
    position: [9.35, 2.15, 0],
    rotation: [0, 0, Math.PI / 2 - 0.08],
  });
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

/**
 * N5(b) — USDT. The bullion barge: the heaviest thing afloat, sitting deep on
 * its reserves. Widest beam in the fleet, a low waist buried under stacked and
 * netted chests, two working cargo derricks, and a three-tier counting house
 * aft with lit windows. It reads as wealth in transit, not as a warship.
 */
function buildTether() {
  const builder = createBuilder("garden-hero-tether");
  const { add } = builder;

  const stations = hullStations({
    bowSharpness: 1.1,
    bowTrim: 0.86,
    bowX: 5.5,
    count: 19,
    deckMid: 1.05,
    deckRiseBow: 0.9,
    deckRiseStern: 1.95,
    keelDepth: 1.25,
    maxBeam: 2.7,
    sternX: -5.4,
    transomFraction: 0.8,
    tumbleAft: 0.7,
    tumbleBow: 0.78,
  });
  addHullLoft(add, stations, { bulwarkHeight: 0.3, gunports: false });
  addStrake(add, stations, { h0: 0.9, h1: 0.99, paint: true, tone: WOOD_TRIM });
  addStrake(add, stations, { h0: 0.72, h1: 0.79, tone: WOOD_TRIM });
  addStrake(add, stations, { h0: 0.5, h1: 0.6, tone: WOOD_WALE });
  addStrake(add, stations, { h0: 0.34, h1: 0.42, tone: WOOD_WALE });

  add("wood", new BoxGeometry(9.2, 0.28, 0.22), {
    position: [0.1, -1.18, 0],
    tone: WOOD_WALE,
  });
  add("wood", new BoxGeometry(0.2, 1.7, 0.55), {
    position: [-5.44, -0.4, 0],
    rotation: [0, 0, -0.05],
    tone: WOOD_WALE,
  });

  // Counting house: three tiers of lit offices stacked over the run.
  add("wood", new BoxGeometry(3.1, 1.7, 2.7), { position: [-3.85, 3.35, 0] });
  add("wood", new BoxGeometry(3.3, 0.2, 2.95), {
    position: [-3.9, 4.3, 0],
    tone: WOOD_TRIM,
  });
  add("wood", new BoxGeometry(2.4, 1.2, 2.2), { position: [-4.1, 5.0, 0] });
  add("wood", new BoxGeometry(2.6, 0.18, 2.4), {
    position: [-4.15, 5.69, 0],
    tone: WOOD_TRIM,
  });
  add("wood", new BoxGeometry(1.7, 0.8, 1.6), { position: [-4.3, 6.18, 0] });
  add("wood", new BoxGeometry(1.9, 0.16, 1.8), {
    position: [-4.3, 6.66, 0],
    tone: WOOD_TRIM,
  });
  // W5: a fourth tier. The counting house already reads — it is the one titan
  // feature that fully worked — so it is pushed rather than rebuilt.
  add("wood", new BoxGeometry(1.15, 0.62, 1.1), { position: [-4.45, 7.05, 0] });
  add("wood", new BoxGeometry(1.35, 0.14, 1.3), {
    position: [-4.45, 7.43, 0],
    tone: WOOD_TRIM,
  });
  add("wood", new ConeGeometry(0.62, 0.55, 4), {
    position: [-4.45, 7.75, 0],
    rotation: [0, Math.PI / 4, 0],
    tone: WOOD_HIGH,
  });
  for (const side of [-1, 1]) {
    add("glow", new PlaneGeometry(0.38, 0.32), {
      position: [-4.45, 7.05, side * 0.56],
      rotation: [0, side > 0 ? 0 : Math.PI, 0],
    });
  }
  for (const z of [-0.94, -0.32, 0.32, 0.94]) {
    add("glow", new PlaneGeometry(0.4, 0.62), {
      position: [-5.42, 3.3, z],
      rotation: [0, -Math.PI / 2, 0],
    });
    add("glow", new PlaneGeometry(0.32, 0.46), {
      position: [-5.32, 5.0, z * 0.72],
      rotation: [0, -Math.PI / 2, 0],
    });
  }
  for (const side of [-1, 1]) {
    for (const x of [-3.1, -3.9, -4.7]) {
      add("glow", new PlaneGeometry(0.48, 0.44), {
        position: [x, 3.3, side * 1.37],
        rotation: [0, side > 0 ? 0 : Math.PI, 0],
      });
    }
  }

  // The cargo itself: two netted blocks of chests filling the waist.
  // W5: the waist stacks rise a tier so the cargo breaks the bulwark line.
  // Below it the hull's own silhouette swallowed them.
  addCargoStack(add, { columns: 3, height: 4, rows: 3, x: 1.5, y: 1.15, z: 0 });
  addCargoStack(add, { columns: 2, height: 3, rows: 3, x: -0.85, y: 1.1, z: 0 });

  addMast(add, -0.1, 1.2, 8.1, -0.02);
  addIdentityFrame(add, -0.1, 4.35, 6.4, 1.45);
  addSquareSail(add, -0.08, 7.15, 1.2, 0.95, { yaw: 0.05 });
  addShrouds(add, { baseY: 1.15, halfBeam: 1.14, mastX: -0.1, spread: 0.56, topY: 5.48 });

  addMast(add, 3.3, 1.55, 6.8, 0.03);
  addSquareSail(add, 3.32, 5.2, 1.4, 1.45, { yaw: 0.07 });
  addShrouds(add, { baseY: 1.5, halfBeam: 0.92, mastX: 3.3, spread: 0.44, topY: 4.79 });

  // W5: the booms swing OUT past the rail. At reach 1.5 against a 2.7 half-beam
  // they were inboard, so they never touched the plan silhouette.
  addDerrick(add, { boomLength: 3.4, mastX: 2.1, mastY: 1.5, reach: 3.4, side: 1 });
  addDerrick(add, { boomLength: 3.4, mastX: 2.1, mastY: 1.5, reach: 3.4, side: -1 });

  add("spar", new CylinderGeometry(0.09, 0.14, 2.9, 6), {
    position: [5.85, 2.5, 0],
    rotation: [0, 0, Math.PI / 2 - 0.3],
  });
  addJib(add, [4.4, 3.6, 0], [7.0, 3.3, 0], [4.4, 2.2, 0], 0.46);

  addStay(add, [7.1, 3.1, 0], [3.35, 6.95, 0]);
  addStay(add, [3.35, 6.95, 0], [-0.05, 8.2, 0]);
  addStay(add, [-0.05, 8.2, 0], [-4.4, 6.8, 0]);

  addTitanMarks(add, { lanternX: -5.5, lanternY: 2.35, mastX: -0.1, topY: 5.51 });
  addBanner(add, [-0.1, 8.15, 0], 1.55, 0.5);

  builder.addAnchor("anchor-lantern-stern", [-4.3, 6.9, 0], "lantern-stern");
  builder.addAnchor("anchor-lantern-bow", [4.6, 2.3, 0], "lantern-bow");
  builder.addAnchor("anchor-masthead", [-0.1, 8.05, 0], "masthead");
  builder.addAnchor("anchor-selection", [0, 2.9, 0], "selection");
  builder.addAnchor("anchor-label", [0, 9.6, 0], "label");

  return builder.finalize({ assertZSymmetric: true });
}

/**
 * N5(b) — USDC. The revenue cutter: naval order made visible. A disciplined
 * near-straight sheer where every other hull curves, an evenly spaced gunport
 * band, and a glazed gallery wrapping the stern on three faces — the ship you
 * can see inside. A signal mast aft flies the attestation hoist.
 */
function buildCircle() {
  const builder = createBuilder("garden-hero-circle");
  const { add } = builder;

  const stations = hullStations({
    bowSharpness: 2.1,
    bowX: 6.0,
    count: 19,
    deckMid: 1.3,
    deckRiseBow: 0.5,
    deckRiseStern: 0.42,
    keelDepth: 1.0,
    maxBeam: 1.95,
    sternX: -5.5,
    transomFraction: 0.62,
    tumbleAft: 0.86,
    tumbleBow: 0.92,
  });
  addHullLoft(add, stations, { bulwarkHeight: 0.34, gunports: true });
  addStrake(add, stations, { h0: 0.9, h1: 0.98, paint: true, tone: WOOD_TRIM });
  addStrake(add, stations, { h0: 0.56, h1: 0.62, tone: WOOD_WALE });
  addStrake(add, stations, { h0: 0.44, h1: 0.5, tone: WOOD_TRIM });

  add("wood", new BoxGeometry(9.0, 0.22, 0.16), {
    position: [0.2, -0.96, 0],
    tone: WOOD_WALE,
  });
  add("wood", new BoxGeometry(0.16, 1.45, 0.48), {
    position: [-5.53, -0.32, 0],
    rotation: [0, 0, -0.07],
    tone: WOOD_WALE,
  });

  // Glazed observation gallery: continuous lights across the transom and both
  // quarters, framed in trim. The transparency read.
  add("wood", new BoxGeometry(1.9, 1.05, 2.0), { position: [-4.5, 2.4, 0] });
  add("wood", new BoxGeometry(2.15, 0.16, 2.25), {
    position: [-4.5, 3.0, 0],
    tone: WOOD_TRIM,
  });
  add("wood", new BoxGeometry(2.15, 0.14, 2.25), {
    position: [-4.5, 1.83, 0],
    tone: WOOD_TRIM,
  });
  for (const z of [-0.8, -0.27, 0.27, 0.8]) {
    add("glow", new PlaneGeometry(0.44, 0.72), {
      position: [-5.47, 2.4, z],
      rotation: [0, -Math.PI / 2, 0],
    });
  }
  for (const side of [-1, 1]) {
    for (const x of [-3.85, -4.5, -5.15]) {
      add("glow", new PlaneGeometry(0.54, 0.72), {
        position: [x, 2.4, side * 1.01],
        rotation: [0, side > 0 ? 0 : Math.PI, 0],
      });
    }
  }

  // W5: the arcaded spar deck. Circle's whole idea — naval order, transparency,
  // the ship you can see inside — was authored FLUSH with the hull (a stern
  // gallery, boarding steps, a gunport band) and none of it survived the
  // isometric read; it measured 0.751 IoU against a shared barquentine. So the
  // idea moves above the rail as repeated structure: a covered gallery running
  // the length of the ship on regular columns. Straight lines and even bays
  // where every other hull curves, and nothing else in the world carries one.
  addArcade(add, { bays: 9, halfBeam: 0.92, height: 1.05, x0: -3.2, x1: 4.1, y: 2.05 });

  // Stern lantern tower: a squared, stepped block over the transom — the
  // vertical counterpart to the arcade's horizontal.
  add("wood", new BoxGeometry(1.25, 1.05, 1.3), { position: [-4.55, 4.05, 0] });
  add("wood", new BoxGeometry(1.45, 0.14, 1.5), {
    position: [-4.55, 4.64, 0],
    tone: WOOD_TRIM,
  });
  add("wood", new BoxGeometry(0.85, 0.8, 0.9), { position: [-4.55, 5.11, 0] });
  add("wood", new BoxGeometry(1.05, 0.13, 1.1), {
    position: [-4.55, 5.57, 0],
    tone: WOOD_TRIM,
  });
  for (const side of [-1, 1]) {
    add("glow", new PlaneGeometry(0.4, 0.5), {
      position: [-4.55, 4.05, side * 0.66],
      rotation: [0, side > 0 ? 0 : Math.PI, 0],
    });
    add("glow", new PlaneGeometry(0.3, 0.38), {
      position: [-4.55, 5.11, side * 0.46],
      rotation: [0, side > 0 ? 0 : Math.PI, 0],
    });
  }

  addMast(add, 0.5, 1.45, 8.4, -0.03);
  addIdentityFrame(add, 0.5, 4.55, 6.7, 1.4);
  addSquareSail(add, 0.52, 7.45, 1.15, 0.9, { yaw: 0.05 });
  addShrouds(add, { baseY: 1.4, halfBeam: 0.84, mastX: 0.5, ratlines: 4, shrouds: 4, spread: 0.5, topY: 5.79 });

  addMast(add, 3.9, 1.5, 6.9, -0.02);
  addSquareSail(add, 3.92, 5.35, 1.25, 1.3, { yaw: 0.06 });
  addShrouds(add, { baseY: 1.45, halfBeam: 0.72, mastX: 3.9, spread: 0.4, topY: 4.82 });

  // Signal mast: a short pole aft flying a vertical hoist of small flags.
  addMast(add, -3.0, 1.6, 5.4, -0.04, { platform: false });
  for (let flag = 0; flag < 3; flag += 1) {
    add("sail", new PlaneGeometry(0.5, 0.3), {
      position: [-2.72, 4.55 - flag * 0.44, 0],
    });
  }

  add("spar", new CylinderGeometry(0.07, 0.11, 3.1, 6), {
    position: [6.4, 2.25, 0],
    rotation: [0, 0, Math.PI / 2 - 0.26],
  });
  addJib(add, [4.8, 4.0, 0], [7.75, 3.05, 0], [4.8, 2.15, 0], 0.44);

  addStay(add, [7.8, 3.1, 0], [3.95, 7.0, 0]);
  addStay(add, [3.95, 7.0, 0], [0.55, 8.5, 0]);
  addStay(add, [0.55, 8.5, 0], [-2.95, 5.5, 0]);

  addTitanMarks(add, { lanternX: -5.15, lanternY: 5.75, mastX: 0.5, topY: 5.82 });
  addBanner(add, [0.5, 8.45, 0], 1.4, 0.46);

  builder.addAnchor("anchor-lantern-stern", [-4.5, 3.2, 0], "lantern-stern");
  builder.addAnchor("anchor-lantern-bow", [4.9, 2.05, 0], "lantern-bow");
  builder.addAnchor("anchor-masthead", [0.5, 8.35, 0], "masthead");
  builder.addAnchor("anchor-selection", [0, 2.4, 0], "selection");
  builder.addAnchor("anchor-label", [0, 9.8, 0], "label");

  return builder.finalize({ assertZSymmetric: true });
}

/**
 * N5(b) — DAI, elder of the Sky squadron. The temple barque: MakerDAO's
 * masonry identity carried as an actual portico amidships, with a blunt stone
 * ram at the stem and heavy weathered topsides. Shares its hull lines with
 * `buildSky` (same station parameters, stretched) so the two read as one
 * squadron; the upperworks are what tell them apart.
 */
function buildMaker() {
  const builder = createBuilder("garden-hero-maker");
  const { add } = builder;

  const stations = hullStations({
    ...SKY_SQUADRON_HULL,
    bowX: 5.4,
    count: 17,
    sternX: -5.0,
  });
  addHullLoft(add, stations, { bulwarkHeight: 0.32, gunports: false });
  addStrake(add, stations, { h0: 0.9, h1: 0.98, paint: true, tone: WOOD_TRIM });
  // Coursed masonry: four bands of equal depth, like ashlar blocks.
  addStrake(add, stations, { h0: 0.74, h1: 0.8, tone: WOOD_WALE });
  addStrake(add, stations, { h0: 0.6, h1: 0.66, tone: WOOD_WALE });
  addStrake(add, stations, { h0: 0.46, h1: 0.52, tone: WOOD_WALE });

  add("wood", new BoxGeometry(8.6, 0.24, 0.2), {
    position: [0.2, -0.96, 0],
    tone: WOOD_WALE,
  });
  add("wood", new BoxGeometry(0.18, 1.5, 0.5), {
    position: [-5.03, -0.35, 0],
    rotation: [0, 0, -0.06],
    tone: WOOD_WALE,
  });

  // Stone ram: a squared-off block stem, no figurehead, no beakhead.
  add("wood", new BoxGeometry(1.5, 0.85, 0.7), {
    position: [5.45, 1.7, 0],
    tone: WOOD_TRIM,
  });
  add("wood", new BoxGeometry(0.9, 0.5, 0.5), {
    position: [6.05, 1.35, 0],
    tone: WOOD_HIGH,
  });

  // W5 (decision D5): the portico stands CLEAR of the bulwark, on a raised
  // stylobate, and gains a pediment. Measured, DAI and USDS were 0.790 IoU —
  // effectively one ship — because everything separating them was authored
  // inside the rail, where the hull's own silhouette swallows it. The shared
  // hull lines stay (two ships from one yard is the right idea); the difference
  // moves up to where it survives.
  addColonnade(add, {
    baseY: 1.75, cella: true, columns: 4, halfBeam: 0.78, height: 1.75, length: 3.2, x: -0.4,
  });
  addPediment(add, { halfBeam: 0.95, length: 3.3, x: -0.4, y: 3.87 });

  add("wood", new BoxGeometry(1.7, 0.85, 1.6), { position: [-4.0, 2.05, 0] });
  add("wood", new BoxGeometry(1.9, 0.16, 1.8), {
    position: [-4.0, 2.55, 0],
    tone: WOOD_TRIM,
  });
  for (const z of [-0.5, 0.5]) {
    add("glow", new PlaneGeometry(0.34, 0.44), {
      position: [-4.88, 2.05, z],
      rotation: [0, -Math.PI / 2, 0],
    });
  }

  addMast(add, 1.5, 1.5, 7.5, -0.03);
  addIdentityFrame(add, 1.5, 4.0, 6.05, 1.4);
  addSquareSail(add, 1.52, 6.85, 1.15, 0.85, { yaw: 0.05 });
  addShrouds(add, { baseY: 1.45, halfBeam: 0.92, mastX: 1.5, spread: 0.5, topY: 5.22 });

  addMast(add, -2.4, 1.6, 6.2, -0.05);
  addSquareSail(add, -2.38, 4.5, 1.15, 1.2, { yaw: 0.07 });
  addShrouds(add, { baseY: 1.55, halfBeam: 0.86, mastX: -2.4, spread: 0.4, topY: 4.45 });

  addStay(add, [5.9, 2.4, 0], [1.55, 7.6, 0]);
  addStay(add, [1.55, 7.6, 0], [-2.35, 6.3, 0]);

  addTitanMarks(add, { lanternX: -4.75, lanternY: 2.7, mastX: 1.5, topY: 5.25 });
  addBanner(add, [1.5, 7.55, 0], 1.35, 0.46);

  builder.addAnchor("anchor-lantern-stern", [-4.0, 2.85, 0], "lantern-stern");
  builder.addAnchor("anchor-lantern-bow", [4.6, 2.2, 0], "lantern-bow");
  builder.addAnchor("anchor-masthead", [1.5, 7.45, 0], "masthead");
  builder.addAnchor("anchor-selection", [0, 2.4, 0], "selection");
  builder.addAnchor("anchor-label", [0, 8.8, 0], "label");

  return builder.finalize({ assertZSymmetric: true });
}

/**
 * N5(b) — USDS, the squadron's newer sibling. Same hull DNA as `buildMaker`
 * (identical station parameters, a longer run) so they sail as a matched pair,
 * but the closed temple gives way to an open sun pavilion, the ram to a
 * forward-reaching prow, and two masts to three. Recognisably the same yard,
 * recognisably the later ship.
 */
function buildSky() {
  const builder = createBuilder("garden-hero-sky");
  const { add } = builder;

  const stations = hullStations({
    ...SKY_SQUADRON_HULL,
    bowX: 5.9,
    count: 19,
    sternX: -5.4,
  });
  addHullLoft(add, stations, { bulwarkHeight: 0.32, gunports: false });
  addStrake(add, stations, { h0: 0.9, h1: 0.98, paint: true, tone: WOOD_TRIM });
  addStrake(add, stations, { h0: 0.74, h1: 0.8, tone: WOOD_WALE });
  addStrake(add, stations, { h0: 0.6, h1: 0.66, tone: WOOD_WALE });
  addStrake(add, stations, { h0: 0.46, h1: 0.52, tone: WOOD_WALE });

  add("wood", new BoxGeometry(9.0, 0.24, 0.2), {
    position: [0.2, -0.96, 0],
    tone: WOOD_WALE,
  });
  add("wood", new BoxGeometry(0.18, 1.5, 0.5), {
    position: [-5.43, -0.35, 0],
    rotation: [0, 0, -0.06],
    tone: WOOD_WALE,
  });

  // Forward-reaching prow with a raised sun disc where DAI carries its ram.
  add("wood", new BoxGeometry(1.8, 0.26, 0.4), {
    position: [5.85, 2.2, 0],
    rotation: [0, 0, 0.26],
    tone: WOOD_TRIM,
  });
  add("wood", new CylinderGeometry(0.42, 0.42, 0.14, 10), {
    position: [6.15, 2.72, 0],
    rotation: [Math.PI / 2, 0, 0],
    tone: WOOD_HIGH,
  });

  // W5 (decision D5): the sun-arch stands where DAI carries its temple, and it
  // stands ABOVE the rail. The pavilion it replaces sat inside the bulwark and
  // was the only thing telling the two Sky hulls apart, which is why they
  // measured 0.790 IoU — one ship, drawn twice.
  addSunArch(add, { halfBeam: 0.92, height: 1.5, radius: 0.62, x: -0.3, y: 1.75 });

  add("wood", new BoxGeometry(1.8, 0.9, 1.7), { position: [-4.3, 2.1, 0] });
  add("wood", new BoxGeometry(2.0, 0.16, 1.9), {
    position: [-4.3, 2.63, 0],
    tone: WOOD_TRIM,
  });
  for (const z of [-0.52, 0.52]) {
    add("glow", new PlaneGeometry(0.34, 0.46), {
      position: [-5.25, 2.1, z],
      rotation: [0, -Math.PI / 2, 0],
    });
  }

  addMast(add, 1.8, 1.5, 8.2, -0.03);
  addIdentityFrame(add, 1.8, 4.4, 6.5, 1.4);
  addSquareSail(add, 1.82, 7.35, 1.15, 0.9, { yaw: 0.05 });
  addShrouds(add, { baseY: 1.45, halfBeam: 0.92, mastX: 1.8, spread: 0.5, topY: 5.65 });

  addMast(add, -1.1, 1.5, 7.0, -0.04);
  addSquareSail(add, -1.08, 5.2, 1.2, 1.25, { yaw: 0.07 });
  addShrouds(add, { baseY: 1.45, halfBeam: 0.9, mastX: -1.1, spread: 0.44, topY: 4.91 });

  // W5: the mizzen goes taller and further aft than DAI's, so the two Sky
  // hulls differ in rig profile as well as in what they carry amidships.
  addMast(add, -4.25, 1.7, 7.3, -0.06, { platform: false });
  addGaffSail(add, {
    billow: 0.34,
    boomAft: 1.6,
    boomY: 3,
    gaffAft: 1.3,
    gaffY: 5.9,
    mastX: -4.25,
    peakRise: 0.7,
  });

  addStay(add, [6.4, 2.9, 0], [1.85, 8.3, 0]);
  addStay(add, [1.85, 8.3, 0], [-1.05, 7.1, 0]);
  addStay(add, [-1.05, 7.1, 0], [-4.2, 7.4, 0]);

  addTitanMarks(add, { lanternX: -5.05, lanternY: 2.75, mastX: 1.8, topY: 5.68 });
  addBanner(add, [1.8, 8.25, 0], 1.4, 0.46);

  builder.addAnchor("anchor-lantern-stern", [-4.3, 2.9, 0], "lantern-stern");
  builder.addAnchor("anchor-lantern-bow", [5.0, 2.4, 0], "lantern-bow");
  builder.addAnchor("anchor-masthead", [1.8, 8.15, 0], "masthead");
  builder.addAnchor("anchor-selection", [0, 2.5, 0], "selection");
  builder.addAnchor("anchor-label", [0, 9.5, 0], "label");

  return builder.finalize({ assertZSymmetric: true });
}

/**
 * N5(b) — USDe. The basis runner: a delta-neutral position rendered as a
 * trimaran. A knife-thin centre hull carries the cargo, and two opposed floats
 * — the long leg and the short — hold it upright on cross beams. No other hull
 * in the fleet is three-hulled, so it is unmistakable from any angle.
 */
function buildEthena() {
  const builder = createBuilder("garden-hero-ethena");
  const { add } = builder;

  const stations = hullStations({
    bowSharpness: 2.6,
    bowX: 6.4,
    count: 19,
    deckMid: 0.85,
    deckRiseBow: 0.85,
    deckRiseStern: 0.55,
    keelDepth: 0.95,
    maxBeam: 1.3,
    sternX: -5.8,
    transomFraction: 0.55,
    tumbleAft: 0.88,
    tumbleBow: 0.94,
  });
  addHullLoft(add, stations, { bulwarkHeight: 0.22, gunports: false });
  addStrake(add, stations, { h0: 0.88, h1: 0.96, paint: true, tone: WOOD_TRIM });
  addStrake(add, stations, { h0: 0.5, h1: 0.56, tone: WOOD_WALE });

  add("wood", new BoxGeometry(9.6, 0.2, 0.14), {
    position: [0.2, -0.9, 0],
    tone: WOOD_WALE,
  });

  // W5: the floats ride higher, so their decks clear the centre hull's rail and
  // the three-hulled plan reads from above rather than only in section.
  addSponsons(add, {
    beam: 0.7,
    bowX: 4.3,
    deckY: 1.0,
    lift: 0.42,
    offset: 2.05,
    sternX: -3.7,
  });

  // W5: an ARCHED cross beam over the deck. The flat 0.3x0.12 spar it replaces
  // was level with the rail and invisible; delta-neutral should read as a
  // literal balance, which means the tie has to stand up where it can be seen.
  for (const beamX of [-1.6, 1.9]) {
    for (const side of [-1, 1]) {
      add("spar", new BoxGeometry(0.22, 1.6, 0.16), {
        position: [beamX, 1.9, side * 1.15],
        rotation: [side * -0.55, 0, 0],
      });
    }
    add("spar", new BoxGeometry(0.26, 0.16, 2.6), { position: [beamX, 2.58, 0] });
  }
  add("wood", new BoxGeometry(1.4, 0.5, 0.8), {
    position: [-2.6, 1.3, 0],
    tone: WOOD_MID,
  });
  for (const side of [-1, 1]) {
    add("glow", new PlaneGeometry(0.36, 0.26), {
      position: [-2.6, 1.3, side * 0.42],
      rotation: [0, side > 0 ? 0 : Math.PI, 0],
    });
  }

  // W5: an A-frame mast — two legs off the floats meeting at the head. Nothing
  // else in the world is masted this way, and it states the balance the hull is.
  for (const side of [-1, 1]) {
    add("spar", new CylinderGeometry(0.075, 0.11, 7.7, 6), {
      position: [1.0, 4.55, side * 0.85],
      rotation: [side * 0.22, 0, 0],
    });
  }
  addMast(add, 1.0, 1.0, 8.4, 0.06, { platform: false });
  addIdentityFrame(add, 1.0, 4.4, 6.5, 1.3);
  addShrouds(add, { baseY: 1.0, halfBeam: 2.1, mastX: 1.0, ratlines: 2, shrouds: 2, spread: 0.4, topY: 5.59 });

  addMast(add, -2.9, 1.05, 6.4, 0.05, { platform: false });
  addGaffSail(add, {
    billow: 0.36,
    boomAft: 1.9,
    boomY: 1.9,
    gaffAft: 1.5,
    gaffY: 4.5,
    mastX: -2.9,
    peakRise: 0.7,
  });

  add("spar", new CylinderGeometry(0.06, 0.1, 3.2, 6), {
    position: [6.9, 1.9, 0],
    rotation: [0, 0, Math.PI / 2 - 0.2],
  });
  addJib(add, [1.4, 7.4, 0], [8.3, 2.1, 0], [3.4, 1.7, 0], 0.42);

  addStay(add, [8.35, 2.15, 0], [1.05, 8.3, 0]);
  addStay(add, [1.05, 8.3, 0], [-2.85, 6.5, 0]);

  addTitanMarks(add, { lanternX: -5.45, lanternY: 1.65, mastX: 1.0, topY: 5.62 });
  addBanner(add, [1.0, 8.35, 0], 1.3, 0.42);

  builder.addAnchor("anchor-lantern-stern", [-2.9, 2.3, 0], "lantern-stern");
  builder.addAnchor("anchor-lantern-bow", [4.6, 1.8, 0], "lantern-bow");
  builder.addAnchor("anchor-masthead", [1.0, 8.25, 0], "masthead");
  builder.addAnchor("anchor-selection", [0, 2.0, 0], "selection");
  builder.addAnchor("anchor-label", [0, 9.6, 0], "label");

  return builder.finalize({ assertZSymmetric: true });
}

/**
 * N5(b) — USD1. The state barge: ceremony rather than commerce. Shallow,
 * broad, gilded, with a double bank of sweeps down both sides and a canopied
 * pavilion aft. It is the only vessel in the fleet propelled by oars, which
 * makes its silhouette unmistakable even before the gilding registers.
 */
function buildLiberty() {
  const builder = createBuilder("garden-hero-liberty");
  const { add } = builder;

  const stations = hullStations({
    bowSharpness: 1.6,
    bowX: 5.6,
    count: 17,
    deckMid: 1.0,
    deckRiseBow: 1.25,
    deckRiseStern: 1.45,
    keelDepth: 0.7,
    keelFlatness: 0.7,
    maxBeam: 2.0,
    sternX: -5.4,
    transomFraction: 0.7,
    tumbleAft: 0.84,
    tumbleBow: 0.9,
  });
  addHullLoft(add, stations, { bulwarkHeight: 0.24, gunports: false });
  addStrake(add, stations, { h0: 0.9, h1: 0.99, paint: true, tone: WOOD_TRIM });
  addStrake(add, stations, { h0: 0.76, h1: 0.83, tone: WOOD_HIGH });
  addStrake(add, stations, { h0: 0.52, h1: 0.6, tone: WOOD_TRIM });

  add("wood", new BoxGeometry(8.8, 0.2, 0.9), {
    position: [0.1, -0.7, 0],
    tone: WOOD_WALE,
  });

  // Gilded stem standard reaching high over the bow. W5: it was a 0.9-unit
  // cone at x 6.2, which is invisible at overview zoom; it now reaches forward
  // and up far enough to extend the plan silhouette past the stem.
  add("wood", new BoxGeometry(3.4, 0.3, 0.3), {
    position: [6.1, 3.3, 0],
    rotation: [0, 0, 0.66],
    tone: WOOD_TRIM,
  });
  add("wood", new ConeGeometry(0.46, 1.5, 6), {
    position: [7.35, 5.15, 0],
    tone: WOOD_HIGH,
  });
  add("wood", new CylinderGeometry(0.5, 0.5, 0.16, 12), {
    position: [7.05, 4.25, 0],
    rotation: [Math.PI / 2, 0, 0],
    tone: WOOD_HIGH,
  });

  // W5: the sweeps move OUTBOARD. The hull's waterline half-beam here is 1.96
  // and its deck is at 1.55; the old bank sat at halfBeam 0.95 with deckY 1.4,
  // so the looms were inside the hull and the blades cleared it by 0.29 units,
  // a metre below the rail. Nothing read. They now hang off an apostis 1.2
  // units clear of the hull, with the blades dipping to the water.
  addApostis(add, { halfBeam: 2.35, x0: -2.3, x1: 3.4, y: 1.5 });
  addOarBank(add, {
    bladeDrop: 1.45,
    count: 8,
    deckY: 1.62,
    halfBeam: 2.35,
    length: 2.6,
    spacing: 0.78,
    x: 0.55,
  });

  addPavilion(add, { halfBeam: 0.86, height: 1.5, length: 2.6, x: -3.2 });
  add("wood", new BoxGeometry(1.5, 0.6, 1.3), {
    position: [-3.2, 0.3, 0],
    tone: WOOD_HIGH,
  });
  for (const side of [-1, 1]) {
    add("glow", new PlaneGeometry(0.4, 0.3), {
      position: [-3.2, 0.35, side * 0.68],
      rotation: [0, side > 0 ? 0 : Math.PI, 0],
    });
  }

  addMast(add, 1.1, 1.35, 7.6, -0.02);
  addIdentityFrame(add, 1.1, 4.0, 6.1, 1.55);
  addFurled(add, 1.12, 6.85, 1.3);
  addShrouds(add, { baseY: 1.3, halfBeam: 0.9, mastX: 1.1, ratlines: 4, shrouds: 4, spread: 0.54, topY: 5.24 });

  addStay(add, [5.4, 2.9, 0], [1.15, 7.7, 0]);
  addStay(add, [1.15, 7.7, 0], [-3.3, 3.4, 0]);

  addTitanMarks(add, { lanternX: -5.05, lanternY: 2.2, mastX: 1.1, topY: 5.27 });
  addBanner(add, [1.1, 7.65, 0], 1.45, 0.5);

  builder.addAnchor("anchor-lantern-stern", [-3.2, 3.4, 0], "lantern-stern");
  builder.addAnchor("anchor-lantern-bow", [4.7, 2.5, 0], "lantern-bow");
  builder.addAnchor("anchor-masthead", [1.1, 7.55, 0], "masthead");
  builder.addAnchor("anchor-selection", [0, 2.2, 0], "selection");
  builder.addAnchor("anchor-label", [0, 8.9, 0], "label");

  return builder.finalize({ assertZSymmetric: true });
}

/**
 * N5(b) — pyUSD. The mail packet: consumer payments as a scheduled service
 * rather than a treasure voyage. Side paddle boxes amidships, a stack between
 * them, a long row of small deck hatches for the many small parcels it moves,
 * and a light fore-and-aft rig kept as auxiliary. The only powered hull afloat.
 */
function buildPaypal() {
  const builder = createBuilder("garden-hero-paypal");
  const { add } = builder;

  const stations = hullStations({
    bowSharpness: 2.2,
    bowX: 5.8,
    count: 19,
    deckMid: 1.05,
    deckRiseBow: 0.6,
    deckRiseStern: 0.45,
    keelDepth: 0.85,
    maxBeam: 1.7,
    sternX: -5.4,
    transomFraction: 0.66,
    tumbleAft: 0.88,
    tumbleBow: 0.94,
  });
  addHullLoft(add, stations, { bulwarkHeight: 0.26, gunports: false });
  addStrake(add, stations, { h0: 0.88, h1: 0.96, paint: true, tone: WOOD_TRIM });
  addStrake(add, stations, { h0: 0.52, h1: 0.6, tone: WOOD_WALE });

  add("wood", new BoxGeometry(8.8, 0.2, 0.15), {
    position: [0.2, -0.88, 0],
    tone: WOOD_WALE,
  });
  add("wood", new BoxGeometry(0.16, 1.3, 0.44), {
    position: [-5.43, -0.3, 0],
    rotation: [0, 0, -0.07],
    tone: WOOD_WALE,
  });

  addPaddleBox(add, { deckY: 1.5, radius: 1.05, x: 0.1 });

  // Stack between the paddle boxes, banded at the top.
  add("spar", new CylinderGeometry(0.3, 0.34, 3.0, 10), {
    position: [0.1, 3.0, 0],
  });
  add("wood", new CylinderGeometry(0.36, 0.36, 0.22, 10), {
    position: [0.1, 4.35, 0],
    tone: WOOD_TRIM,
  });

  // Bridge deck spanning the paddle boxes.
  add("wood", new BoxGeometry(1.5, 0.5, 2.5), { position: [1.7, 1.85, 0] });
  add("wood", new BoxGeometry(1.7, 0.14, 2.7), {
    position: [1.7, 2.17, 0],
    tone: WOOD_TRIM,
  });
  for (const side of [-1, 1]) {
    add("glow", new PlaneGeometry(0.9, 0.26), {
      position: [1.7, 1.9, side * 1.26],
      rotation: [0, side > 0 ? 0 : Math.PI, 0],
    });
  }

  // A long row of small hatches: many small parcels, not one great cargo.
  for (let hatch = 0; hatch < 6; hatch += 1) {
    add("wood", new BoxGeometry(0.44, 0.16, 0.5), {
      position: [-1.5 - hatch * 0.62, 1.2, 0],
      tone: hatch % 2 === 0 ? WOOD_TRIM : WOOD_MID,
    });
  }

  addMast(add, 3.5, 1.35, 7.0, -0.04);
  addIdentityFrame(add, 3.5, 3.55, 5.4, 1.3);
  addSquareSail(add, 3.52, 6.1, 1.05, 0.8, { yaw: 0.06 });
  addShrouds(add, { baseY: 1.3, halfBeam: 0.7, mastX: 3.5, spread: 0.4, topY: 4.84 });

  addMast(add, -3.3, 1.3, 6.2, -0.05, { platform: false });
  addGaffSail(add, {
    billow: 0.34,
    boomAft: 1.7,
    boomY: 2.0,
    gaffAft: 1.35,
    gaffY: 4.4,
    mastX: -3.3,
    peakRise: 0.62,
  });

  add("spar", new CylinderGeometry(0.06, 0.1, 2.6, 6), {
    position: [6.1, 1.8, 0],
    rotation: [0, 0, Math.PI / 2 - 0.22],
  });
  addJib(add, [4.5, 3.3, 0], [7.2, 2.4, 0], [4.5, 1.7, 0], 0.4);

  addStay(add, [7.25, 2.45, 0], [3.55, 7.1, 0]);
  addStay(add, [3.55, 7.1, 0], [-3.25, 6.3, 0]);

  addTitanMarks(add, { lanternX: -5.1, lanternY: 1.75, mastX: 3.5, topY: 4.87 });
  addBanner(add, [3.5, 7.05, 0], 1.25, 0.42);

  builder.addAnchor("anchor-lantern-stern", [-3.3, 2.4, 0], "lantern-stern");
  builder.addAnchor("anchor-lantern-bow", [4.6, 1.75, 0], "lantern-bow");
  builder.addAnchor("anchor-masthead", [3.5, 6.9, 0], "masthead");
  builder.addAnchor("anchor-selection", [0, 2.2, 0], "selection");
  builder.addAnchor("anchor-label", [0, 8.4, 0], "label");

  return builder.finalize({ assertZSymmetric: true });
}

/**
 * N5(b) / W5 (decision D6) — XAUT. The bullion hoy: the only vessel in the
 * world that sits DOWN in the water. Deck almost at the waterline, a flat
 * laden bottom, iron-banded topsides, an armoured strongroom under a barrel
 * vault amidships, a heavy lifting crane over it, and a stubby two-mast rig,
 * because gold does not need speed.
 *
 * Every other titan is tall. This one is the exception that proves the tier,
 * and the waterline itself is its silhouette.
 */
function buildBullion() {
  const builder = createBuilder("garden-hero-bullion");
  const { add } = builder;

  const stations = hullStations({
    bowSharpness: 1.15,
    bowTrim: 0.66,
    bowX: 4.6,
    count: 17,
    // deckMid 0.5 against 0.85-1.3 everywhere else: this is the freeboard, and
    // being the lowest in the fleet IS the design.
    deckMid: 0.5,
    deckRiseBow: 0.4,
    deckRiseStern: 0.48,
    keelDepth: 1.45,
    keelFlatness: 0.6,
    maxBeam: 2.55,
    sternX: -4.4,
    transomFraction: 0.88,
    tumbleAft: 0.92,
    tumbleBow: 0.94,
  });
  addHullLoft(add, stations, { bulwarkHeight: 0.24, gunports: false });
  addStrake(add, stations, { h0: 0.9, h1: 0.98, paint: true, tone: WOOD_TRIM });
  // Iron banding: three heavy wales stacked close, the way a strongbox is bound.
  addStrake(add, stations, { h0: 0.78, h1: 0.84, tone: WOOD_WALE });
  addStrake(add, stations, { h0: 0.66, h1: 0.72, tone: WOOD_WALE });
  addStrake(add, stations, { h0: 0.54, h1: 0.6, tone: WOOD_WALE });

  add("wood", new BoxGeometry(8.4, 0.3, 1.1), {
    position: [0.1, -1.42, 0],
    tone: WOOD_WALE,
  });

  // Strongroom: a squat armoured house under a barrel vault, banded and locked.
  add("wood", new BoxGeometry(3.4, 0.95, 2.3), { position: [-0.5, 1.32, 0] });
  add("wood", new CylinderGeometry(1.16, 1.16, 3.4, 12, 1, false, 0, Math.PI), {
    position: [-0.5, 1.8, 0],
    rotation: [0, 0, Math.PI / 2],
    tone: WOOD_TRIM,
  });
  for (const x of [-1.75, -0.5, 0.75]) {
    add("wood", new BoxGeometry(0.16, 1.05, 2.42), {
      position: [x, 1.34, 0],
      tone: WOOD_WALE,
    });
  }
  add("wood", new BoxGeometry(0.16, 0.42, 0.42), {
    position: [1.24, 1.36, 0],
    tone: WOOD_HIGH,
  });
  for (const side of [-1, 1]) {
    add("glow", new PlaneGeometry(0.3, 0.24), {
      position: [-1.15, 1.42, side * 1.16],
      rotation: [0, side > 0 ? 0 : Math.PI, 0],
    });
  }

  // Lifting crane: a heavy post, a boom out over the strongroom, and its fall.
  add("spar", new CylinderGeometry(0.15, 0.19, 3.1, 7), {
    position: [1.95, 2.3, 0],
  });
  add("spar", new CylinderGeometry(0.1, 0.14, 3.2, 6), {
    position: [0.85, 3.5, 0],
    rotation: [0, 0, Math.PI / 2 + 0.34],
  });
  addStay(add, [1.95, 3.85, 0], [-0.35, 4.4, 0], 0.035);
  add("spar", new CylinderGeometry(0.03, 0.03, 1.5, 4), {
    position: [-0.4, 3.6, 0],
  });
  add("wood", new BoxGeometry(0.46, 0.34, 0.46), {
    position: [-0.4, 2.7, 0],
    tone: WOOD_HIGH,
  });

  // Two stubby masts. The rig exists to move her, not to make her fast.
  addMast(add, -2.75, 0.9, 5.3, -0.03);
  addIdentityFrame(add, -2.75, 2.7, 4.35, 1.5);
  addShrouds(add, { baseY: 0.9, halfBeam: 1.2, mastX: -2.75, spread: 0.5, topY: 3.63 });

  addMast(add, 3.15, 0.95, 4.1, 0.02, { platform: false });
  addFurled(add, 3.17, 3.55, 1.05);

  addStay(add, [4.6, 1.4, 0], [3.2, 4.05, 0]);
  addStay(add, [3.2, 4.05, 0], [-2.7, 5.25, 0]);

  addTitanMarks(add, { lanternX: -4.15, lanternY: 1.35, mastX: -2.75, topY: 3.66 });
  addBanner(add, [-2.75, 5.25, 0], 1.35, 0.46);

  builder.addAnchor("anchor-lantern-stern", [-4.7, 1.85, 0], "lantern-stern");
  builder.addAnchor("anchor-lantern-bow", [3.9, 1.15, 0], "lantern-bow");
  builder.addAnchor("anchor-masthead", [-2.75, 5.2, 0], "masthead");
  builder.addAnchor("anchor-selection", [0, 1.6, 0], "selection");
  builder.addAnchor("anchor-label", [0, 6.4, 0], "label");

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
function addStrake(add, stations, { h0, h1, paint = false, painter = null, tone = null }) {
  for (const side of [-1, 1]) {
    const geometry = gridGeometry(stations.length, 2, (i, j) => {
      const point = ringPoint(stations[i], j === 0 ? h0 : h1, side);
      return [point[0], point[1], point[2] * 1.018 + side * 0.012];
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

/**
 * Deck cargo: stacked reserve chests under a net. The net is a crosshatch of
 * thin spars, which reads as lashing at overview zoom without a texture.
 */
function addCargoStack(add, { columns, height, rows, x, y, z }) {
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      const cx = x + (column - (columns - 1) / 2) * 0.78;
      const cz = (row - (rows - 1) / 2) * 0.62;
      for (let level = 0; level < height; level += 1) {
        add("wood", new BoxGeometry(0.66, 0.34, 0.5), {
          position: [cx, y + 0.17 + level * 0.36, z + cz],
          tone: level % 2 === 0 ? WOOD_TRIM : WOOD_MID,
        });
      }
    }
  }
  const spanX = columns * 0.78;
  const spanZ = rows * 0.62;
  const top = y + height * 0.36 + 0.06;
  for (let index = 0; index <= columns; index += 1) {
    const cx = x + (index - columns / 2) * 0.78;
    addStay(add, [cx, top, z - spanZ / 2], [cx, top, z + spanZ / 2], 0.022);
  }
  for (let index = 0; index <= rows; index += 1) {
    const cz = z + (index - rows / 2) * 0.62;
    addStay(add, [x - spanX / 2, top, cz], [x + spanX / 2, top, cz], 0.022);
  }
}

/** Cargo derrick: a boom angled out over the rail with its lift tackle. */
function addDerrick(add, { boomLength, mastX, mastY, reach, side }) {
  const foot = [mastX, mastY, 0];
  const head = [mastX + reach, mastY + boomLength * 0.55, side * boomLength * 0.5];
  add("spar", new CylinderGeometry(0.07, 0.1, boomLength, 5), {
    position: [(foot[0] + head[0]) / 2, (foot[1] + head[1]) / 2, (foot[2] + head[2]) / 2],
    rotation: [side * -0.5, 0, -0.7],
  });
  addStay(add, head, [mastX, mastY + boomLength * 1.1, 0], 0.022);
  addStay(add, head, [head[0], mastY - 0.2, head[2]], 0.02);
}

/**
 * Temple colonnade: the Maker masonry motif as a real portico — a stylobate,
 * a rank of columns down each side, and an architrave slab over them.
 */
function addColonnade(add, { columns, height, length, x, halfBeam, baseY = 0, cella = false }) {
  // W5/D5: a walled cella makes the temple read as SOLID MASS from the
  // isometric camera, where the gaps between columns are a pixel or two wide.
  // That is what contrasts it against USDS's sun-arch, which is a ring on posts
  // — a void where DAI has a block. Sharing the hull (D5) means the tops have
  // to carry the whole difference, so they must differ in kind, not degree.
  if (cella) {
    add("wood", new BoxGeometry(length * 0.72, height * 0.92, halfBeam * 1.5), {
      position: [x, baseY + height / 2 + 0.08, 0],
      tone: WOOD_MID,
    });
  }
  add("wood", new BoxGeometry(length + 0.3, 0.16, halfBeam * 2 + 0.3), {
    position: [x, baseY, 0],
    tone: WOOD_TRIM,
  });
  for (const side of [-1, 1]) {
    for (let index = 0; index < columns; index += 1) {
      const t = columns === 1 ? 0.5 : index / (columns - 1);
      add("wood", new CylinderGeometry(0.11, 0.13, height, 6), {
        position: [x + (t - 0.5) * length, baseY + height / 2 + 0.08, side * halfBeam],
        tone: WOOD_TRIM,
      });
    }
  }
  add("wood", new BoxGeometry(length + 0.4, 0.22, halfBeam * 2 + 0.4), {
    position: [x, baseY + height + 0.19, 0],
    tone: WOOD_TRIM,
  });
  add("wood", new BoxGeometry(length * 0.82, 0.16, halfBeam * 1.5), {
    position: [x, baseY + height + 0.38, 0],
    tone: WOOD_HIGH,
  });
}

/**
 * W5/D5 — a stepped temple roof with a gable, sitting on the architrave. This
 * is DAI's half of the Sky-squadron split: mass above the rail, in a shape
 * nothing else in the world carries.
 */
function addPediment(add, { halfBeam, length, x, y }) {
  for (const [step, inset] of [[0, 0], [1, 0.22], [2, 0.44]]) {
    add("wood", new BoxGeometry(length - inset * 2, 0.17, (halfBeam - inset) * 2), {
      position: [x, y + step * 0.17, 0],
      tone: step % 2 === 0 ? WOOD_TRIM : WOOD_HIGH,
    });
  }
  // Gable: a prism across the beam, ridge along the keel.
  add("wood", new CylinderGeometry(halfBeam - 0.42, halfBeam - 0.42, length - 0.95, 3), {
    position: [x, y + 0.72, 0],
    rotation: [0, 0, Math.PI / 2],
    tone: WOOD_TRIM,
  });
}

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
function addApostis(add, { halfBeam, x0, x1, y }) {
  for (const side of [-1, 1]) {
    add("wood", new BoxGeometry(x1 - x0, 0.16, 0.28), {
      position: [(x0 + x1) / 2, y, side * halfBeam],
      tone: WOOD_TRIM,
    });
    add("wood", new BoxGeometry(x1 - x0, 0.1, 0.14), {
      position: [(x0 + x1) / 2, y + 0.34, side * halfBeam],
      tone: WOOD_HIGH,
    });
    const knees = 5;
    for (let knee = 0; knee < knees; knee += 1) {
      const t = knee / (knees - 1);
      add("wood", new BoxGeometry(0.18, 0.12, 0.95), {
        position: [x0 + t * (x1 - x0), y - 0.16, side * (halfBeam - 0.44)],
        rotation: [side * 0.3, 0, 0],
        tone: WOOD_MID,
      });
      add("spar", new CylinderGeometry(0.045, 0.045, 0.42, 4), {
        position: [x0 + t * (x1 - x0), y + 0.19, side * halfBeam],
      });
    }
  }
}

/**
 * Paddle box: the drum housing a side paddle wheel, with radial spoke ribs on
 * its outer face. Nothing else in the fleet has a wheel amidships.
 */
function addPaddleBox(add, { deckY, radius, x }) {
  for (const side of [-1, 1]) {
    add("wood", new CylinderGeometry(radius, radius, 0.62, 12), {
      position: [x, deckY, side * 1.02],
      rotation: [Math.PI / 2, 0, 0],
      tone: WOOD_MID,
    });
    add("wood", new CylinderGeometry(radius * 1.04, radius * 1.04, 0.1, 12), {
      position: [x, deckY, side * 1.34],
      rotation: [Math.PI / 2, 0, 0],
      tone: WOOD_TRIM,
    });
    for (let spoke = 0; spoke < 6; spoke += 1) {
      const angle = (spoke / 6) * Math.PI * 2;
      add("wood", new BoxGeometry(radius * 1.5, 0.08, 0.08), {
        position: [x, deckY, side * 1.4],
        rotation: [0, 0, angle],
        tone: WOOD_TRIM,
      });
    }
  }
}

/**
 * Outrigger sponson: a slim secondary hull carried off each beam on cross
 * beams. Used for the delta-neutral runner, where the two opposed floats are
 * the whole point of the silhouette.
 */
function addSponsons(add, { beam, bowX, deckY, offset, sternX, lift = 0 }) {
  const stations = hullStations({
    bowSharpness: 2.4,
    bowX,
    count: 11,
    deckMid: 0.42,
    deckRiseBow: 0.5,
    deckRiseStern: 0.3,
    keelDepth: 0.5,
    maxBeam: beam,
    sternX,
    transomFraction: 0.6,
    tumbleAft: 0.9,
    tumbleBow: 0.94,
  });
  const ring = [
    ...HULL_RING_H.map((h) => [h, 1]),
    ...HULL_RING_H.slice(1, -1).reverse().map((h) => [h, -1]),
  ];
  for (const side of [-1, 1]) {
    const shell = loftGeometry(
      stations.map((station) => ring.map(([h, ringSide]) => {
        const point = ringPoint(station, h, ringSide);
        return [point[0], point[1] + lift, point[2] + side * offset];
      })),
      { closedRing: true },
    );
    add("wood", shell, { tone: WOOD_MID });
  }
  // Cross beams tying the floats to the centre hull.
  for (const beamX of [bowX * 0.55, sternX * 0.55]) {
    add("spar", new BoxGeometry(0.42, 0.14, offset * 2 + 0.6), {
      position: [beamX, deckY + lift * 0.6, 0],
    });
  }
}

/**
 * W5 — an arcaded spar deck: a covered gallery on regular columns, running
 * above the bulwark for most of the ship's length.
 *
 * Repetition is the point. Every other hull in the world is built from curves;
 * a rank of even bays reads as ORDER at any zoom, which is what USDC's brief
 * asks for and what its flush-mounted stern gallery could never deliver.
 */
function addArcade(add, { bays, halfBeam, height, x0, x1, y }) {
  const length = x1 - x0;
  // Rail-level sill the columns stand on, both sides.
  for (const side of [-1, 1]) {
    add("wood", new BoxGeometry(length, 0.14, 0.3), {
      position: [(x0 + x1) / 2, y, side * halfBeam],
      tone: WOOD_TRIM,
    });
    for (let bay = 0; bay <= bays; bay += 1) {
      const x = x0 + (bay / bays) * length;
      add("wood", new CylinderGeometry(0.075, 0.09, height, 6), {
        position: [x, y + height / 2 + 0.07, side * halfBeam],
        tone: WOOD_TRIM,
      });
    }
  }
  // Continuous entablature and a shallow roof over the whole run.
  add("wood", new BoxGeometry(length + 0.3, 0.16, halfBeam * 2 + 0.42), {
    position: [(x0 + x1) / 2, y + height + 0.15, 0],
    tone: WOOD_TRIM,
  });
  add("wood", new BoxGeometry(length + 0.1, 0.12, halfBeam * 2 + 0.16), {
    position: [(x0 + x1) / 2, y + height + 0.3, 0],
    tone: WOOD_HIGH,
  });
}

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
function addTitanMarks(add, { lanternX, lanternY, mastX, topY }) {
  // Bracket: a gilded arm reaching aft, with a knee under it.
  add("wood", new BoxGeometry(0.62, 0.11, 0.14), {
    position: [lanternX - 0.28, lanternY, 0],
    tone: WOOD_TRIM,
  });
  add("wood", new BoxGeometry(0.2, 0.34, 0.11), {
    position: [lanternX - 0.04, lanternY - 0.2, 0],
    rotation: [0, 0, 0.5],
    tone: WOOD_TRIM,
  });
  // Lantern: a tapered housing with a finial, lit on all four faces.
  add("wood", new CylinderGeometry(0.16, 0.2, 0.34, 6), {
    position: [lanternX - 0.56, lanternY + 0.24, 0],
    tone: WOOD_HIGH,
  });
  add("wood", new ConeGeometry(0.22, 0.2, 6), {
    position: [lanternX - 0.56, lanternY + 0.5, 0],
    tone: WOOD_TRIM,
  });
  for (const [rotation, offset] of [
    [[0, 0, 0], [0, 0, 0.19]],
    [[0, Math.PI, 0], [0, 0, -0.19]],
    [[0, -Math.PI / 2, 0], [0.19, 0, 0]],
    [[0, Math.PI / 2, 0], [-0.19, 0, 0]],
  ]) {
    add("glow", new PlaneGeometry(0.2, 0.24), {
      position: [lanternX - 0.56 + offset[0], lanternY + 0.24, offset[2]],
      rotation,
    });
  }

  // Top-castle: a wider platform than a plain mast top, with a stanchioned rail
  // around it. This is the mark that reads from the far side of the harbour.
  add("spar", new CylinderGeometry(0.46, 0.34, 0.13, 8), {
    position: [mastX, topY, 0],
  });
  for (let post = 0; post < 8; post += 1) {
    const angle = (post / 8) * Math.PI * 2;
    add("spar", new CylinderGeometry(0.035, 0.035, 0.3, 4), {
      position: [mastX + Math.cos(angle) * 0.4, topY + 0.21, Math.sin(angle) * 0.4],
    });
  }
  add("wood", new CylinderGeometry(0.44, 0.44, 0.07, 8), {
    position: [mastX, topY + 0.37, 0],
    tone: WOOD_TRIM,
  });
}

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
function addEndTower(add, { x, deckY, halfBeam, halfWidth, height }) {
  // Legs: the tower stands proud of the deck, so daylight shows under it.
  for (const side of [-1, 1]) {
    for (const legX of [x - halfWidth * 0.8, x + halfWidth * 0.8]) {
      add("wood", new CylinderGeometry(0.1, 0.12, 0.9, 5), {
        position: [legX, deckY + 0.45, side * halfBeam * 0.7],
        tone: WOOD_MID,
      });
    }
  }
  const baseY = deckY + 0.9;
  add("wood", new BoxGeometry(halfWidth * 2, height, halfBeam * 2), {
    position: [x, baseY + height / 2, 0],
  });
  // Banding every tier, so the tower reads as built up rather than extruded.
  for (const tier of [0.32, 0.66]) {
    add("wood", new BoxGeometry(halfWidth * 2.2, 0.13, halfBeam * 2.2), {
      position: [x, baseY + height * tier, 0],
      tone: WOOD_WALE,
    });
  }
  add("wood", new BoxGeometry(halfWidth * 2.3, 0.16, halfBeam * 2.3), {
    position: [x, baseY + height + 0.08, 0],
    tone: WOOD_TRIM,
  });
  addCrenels(add, x - halfWidth, x + halfWidth, baseY + height + 0.24, halfBeam * 1.1, 3);
  for (const side of [-1, 1]) {
    add("glow", new PlaneGeometry(0.26, 0.34), {
      position: [x, baseY + height * 0.5, side * (halfBeam + 0.02)],
      rotation: [0, side > 0 ? 0 : Math.PI, 0],
    });
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
