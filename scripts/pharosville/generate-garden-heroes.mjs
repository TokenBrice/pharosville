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
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Scene,
  SphereGeometry,
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
const HULL_RING_H = [0, 0.16, 0.38, 0.6, 0.78, 0.89, 1];

installFileReader();

const summaries = [];
for (const model of [
  { build: buildTitan, id: "garden-hero-titan" },
  { build: buildHeritage, id: "garden-hero-heritage" },
]) {
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

  addMast(add, 3.4, 1.6, 6.7, -0.035);
  addSquareSail(add, 3.42, 4.35, 1.85, 1.7, { yaw: 0.06 });
  addSquareSail(add, 3.44, 5.9, 1.45, 0.95, { yaw: 0.09 });

  // Mizzen steps forward of the castle so its lateen clears the tiers.
  addMast(add, -2.0, 1.9, 6.5, -0.05);
  addLateen(add, [-2.1, 5.9, 0], [-0.8, 3.2, 0], [-3.6, 3.9, 0], 0.55);
  addFurled(add, -1.92, 6.05, 1.0);

  // Stays: bowsprit -> fore -> main -> mizzen -> stern (thin spar cylinders).
  addStay(add, [7.9, 3.0, 0], [3.45, 6.9, 0]);
  addStay(add, [3.45, 6.9, 0], [1.35, 7.85, 0]);
  addStay(add, [1.35, 7.85, 0], [-1.95, 6.75, 0]);
  addStay(add, [-1.95, 6.75, 0], [-4.4, 5.6, 0]);

  // Anchor stocks lashed at the bow, port and starboard.
  for (const side of [-1, 1]) {
    add("spar", new CylinderGeometry(0.05, 0.05, 0.85, 5), {
      position: [4.6, 1.35, side * 1.55],
      rotation: [0.5 * side, 0, 0.35],
    });
  }

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

  // Two raked masts. The main course slot stays open for the procedural
  // identity sail; the fore mast carries the set canvas.
  addMast(add, 0.8, 1.3, 6.3, -0.06);
  addFurled(add, 0.9, 5.5, 1.1);

  addMast(add, 2.9, 1.35, 5.5, -0.07);
  addSquareSail(add, 2.92, 3.6, 1.45, 1.35, { yaw: 0.07 });
  addSquareSail(add, 2.94, 4.85, 1.15, 0.8, { yaw: 0.1 });

  addStay(add, [6.9, 2.9, 0], [2.95, 5.7, 0]);
  addStay(add, [2.95, 5.7, 0], [0.85, 6.5, 0]);
  addStay(add, [0.85, 6.5, 0], [-3.9, 2.9, 0]);

  addBanner(add, [0.8, 6.35, 0], 1.2, 0.42);

  builder.addAnchor("anchor-lantern-stern", [-3.5, 2.75, 0], "lantern-stern");
  builder.addAnchor("anchor-lantern-bow", [4.4, 1.85, 0], "lantern-bow");
  builder.addAnchor("anchor-masthead", [0.8, 6.25, 0], "masthead");
  builder.addAnchor("anchor-selection", [0, 1.9, 0], "selection");
  builder.addAnchor("anchor-label", [0, 7.3, 0], "label");

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
 * Parametric station table for a lofted hull. Each station carries its
 * waterline half-beam, deck half-beam (tumblehome: deck narrower than the
 * waterline), deck height (the curved sheer) and keel depth.
 */
function hullStations({
  bowSharpness = 1.6,
  bowX,
  count,
  deckMid,
  deckRiseBow,
  deckRiseStern,
  keelDepth,
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
    const bowTaper = 1 - Math.pow(smoothstep(0.66, 1, t), bowSharpness) * 0.985;
    const waterBeam = maxBeam * midFullness * sternFill * bowTaper;
    // Curved sheer: deck rises fore and aft, the bow lifted slightly more.
    const deckY = deckMid
      + deckRiseStern * Math.pow(1 - t, 2.2)
      + deckRiseBow * Math.pow(t, 2.4);
    const keelY = -keelDepth * (0.3 + 0.7 * Math.sin(Math.PI * Math.pow(smoothstep(0, 1, t), 0.85)));
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
function addMast(add, x, baseY, topY, rake) {
  const lowerTop = baseY + (topY - baseY) * 0.62;
  add("spar", new CylinderGeometry(0.09, 0.14, lowerTop - baseY, 7), {
    position: [x, (baseY + lowerTop) / 2, 0],
    rotation: [0, 0, rake],
  });
  add("spar", new CylinderGeometry(0.05, 0.08, topY - lowerTop + 0.3, 6), {
    position: [x + rake * (topY - lowerTop) * 0.5, (lowerTop + topY) / 2 - 0.1, 0],
    rotation: [0, 0, rake],
  });
  // Mast top platform (crow's nest disc).
  add("spar", new CylinderGeometry(0.3, 0.22, 0.12, 7), {
    position: [x + rake * (lowerTop - baseY) * 0.5, lowerTop + 0.05, 0],
  });
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
