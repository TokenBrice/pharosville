import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Box3,
  BoxGeometry,
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { compressGlbWithMeshopt, measureMeshoptDeviation } from "./glb-meshopt.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outputPath = resolve(
  repoRoot,
  "public/pharosville/models/garden-lighthouse-shell.glb",
);
const checkOnly = process.argv.includes("--check");

// Octagonal facets are the tower's identity; rotate so a flat face fronts +Z
// (door and windows sit on a face, not an edge).
const OCT = Math.PI / 8;
// Flat-face inradius of an octagon of circumradius r — surface offset for
// door/window props mounted on a face.
const OCT_FACE = Math.cos(Math.PI / 8);
const OCT_HALF_CHORD = Math.sin(Math.PI / 8);

// Wet, weathered stone ramp painted per-vertex up the tower (L2): wet-dark
// base rock → pale-warm crown that catches the ukiyo-e day key sun (L4).
// Constructed from hex so three's ColorManagement lands them in linear space,
// matching how a material.color hex would render.
const STONE_WET = new Color("#46524b");
const STONE_LOW = new Color("#c4b494");
const STONE_HIGH = new Color("#f7edca");
// W4 (grand-scale revamp): the AO floor. Recesses never go fully black —
// they land on a cool bounced-sky tint so the stone keeps its temperature
// break between lit face and shadowed joint.
const STONE_OCCLUDED = new Color("#3d4551");

// Monumental Pharos: battered square keep, octagonal drum, open lantern,
// conical cap and Zeus Soter. Shared anchors match the procedural shell.
const TERRACE_TOP_Y = 2.5;
const SQUARE_TOP_Y = 20.5;
const SQUARE_BASE_HALF = 4.6;
const SQUARE_TOP_HALF = 3.7;
const OCT_BASE_Y = SQUARE_TOP_Y;
const OCT_TOP_Y = 29.0;
const OCT_BASE_RADIUS = 2.75;
const OCT_TOP_RADIUS = 2.5;
const LANTERN_BASE_Y = 29.4;
const LANTERN_TOP_Y = 32.8;
const LANTERN_RADIUS = 1.9;
const BEACON_Y = 30.2;
const SCEPTRE_TIP_Y = 38;
// A 4-segment cylinder rotated π/4 reads as a square shaft with a flat face
// fronting +Z (same convention as OCT for the drums).
const SQ = Math.PI / 4;
const SQRT2 = Math.SQRT2;

// W4 masonry constants. The core shaft is sunk MORTAR_INSET behind the ashlar
// skin, so every gap between blocks reveals the core at a depth the AO pass
// reads as a mortar joint. Nothing else in the model is allowed to sit in that
// band — it is what makes the coursing legible under raking light.
const MORTAR_INSET = 0.085;
const COURSE_JOINT = 0.035;

// --- Baked-occlusion registries -------------------------------------------
// Populated while geometry is authored, consumed once by paintStone() after
// the whole tower exists. Concave creases (wall meets floor) and projecting
// ledges (cornice undersides) are the two shapes a flat vertex ramp cannot
// fake, so they are registered explicitly rather than guessed.
const CREASES = [];
const OVERHANGS = [];
const COURSE_BANDS = [];

installFileReader();

const { root, summary } = createLighthouse();
const scene = new Scene();
scene.name = "garden-lighthouse-scene";
scene.add(root);

const exported = await new GLTFExporter().parseAsync(scene, {
  animations: [],
  binary: true,
  includeCustomExtensions: false,
  onlyVisible: true,
  trs: false,
});
if (!(exported instanceof ArrayBuffer)) {
  throw new Error("GLTFExporter did not return a binary ArrayBuffer.");
}

const raw = Buffer.from(exported);
const bytes = await compressGlbWithMeshopt(raw);
const positionDeviation = await measureMeshoptDeviation(raw, bytes);
const glb = inspectGlb(bytes);
const sha256 = createHash("sha256").update(bytes).digest("hex");

if (checkOnly) {
  const current = await readFile(outputPath);
  if (!current.equals(bytes)) {
    throw new Error(
      "garden-lighthouse-shell.glb is stale; rerun this generator without --check.",
    );
  }
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);
}

console.log(JSON.stringify({
  bytes: bytes.byteLength,
  dimensions: summary.dimensions,
  drawCalls: summary.drawCalls,
  materials: summary.materials,
  meshes: glb.json.meshes?.length ?? 0,
  nodes: glb.json.nodes?.length ?? 0,
  output: outputPath,
  positionDeviation,
  sha256,
  uncompressedBytes: raw.byteLength,
  textures: glb.json.textures?.length ?? 0,
  triangles: summary.triangles,
  vertices: summary.vertices,
}, null, 2));

function registerCrease(y, reach) {
  CREASES.push({ reach, y });
}

function registerOverhang(y, reach, drop = 1.1) {
  OVERHANGS.push({ drop, reach, y });
}

function createLighthouse() {
  const root = new Group();
  root.name = "garden-lighthouse-shell";
  root.userData = {
    assetId: "garden-lighthouse-shell",
    license: "MIT",
    provenance: "agent-authored deterministic procedural geometry",
    upAxis: "+Y",
  };

  const materials = new Map([
    ["stone", new MeshStandardMaterial({
      color: "#ffffff",
      // L4: a whisper of warm emissive simulates bounced sunlight on the
      // shade side (the key sun sits behind the tower from the camera), so
      // the stone keeps its warm-cream read instead of going dead grey.
      emissive: "#d49a3e",
      emissiveIntensity: 0.045,
      flatShading: true,
      name: "weathered-limestone",
      roughness: 0.88,
      vertexColors: true,
    })],
    ["bronze", new MeshStandardMaterial({
      color: "#5c7268",
      flatShading: true,
      metalness: 0.5,
      name: "oxidized-bronze",
      roughness: 0.55,
    })],
    ["darkBronze", new MeshStandardMaterial({
      color: "#26342f",
      flatShading: true,
      metalness: 0.6,
      name: "dark-bronze-frame",
      roughness: 0.5,
    })],
    // Bronze-gilt for the crowning Zeus Soter and the dedication glyphs (D2):
    // the highest metalness in the model with a warm emissive whisper, so the
    // statue catches the dusk bloom as a golden god against the indigo sky.
    ["gilt", new MeshStandardMaterial({
      color: "#d9a84e",
      emissive: "#f7d68a",
      emissiveIntensity: 0.06,
      flatShading: true,
      metalness: 0.85,
      name: "bronze-gilt",
      roughness: 0.3,
    })],
    ["timber", new MeshStandardMaterial({
      color: "#43362b",
      flatShading: true,
      name: "weathered-timber",
      roughness: 0.95,
    })],
    ["ember", new MeshStandardMaterial({
      color: "#3a2a18",
      emissive: "#ffc879",
      emissiveIntensity: 1.45,
      flatShading: true,
      name: "lantern-ember",
      roughness: 0.5,
      toneMapped: false,
    })],
    // W4.5: every window aperture in the tower, in its own mesh group
    // ("window-shell") behind its own material name, so the runtime can drive
    // the interior glow across the day cycle without touching the brazier
    // ember or adding a single light. Authored dim — dusk/night lift is the
    // renderer's call, not the asset's.
    ["window", new MeshStandardMaterial({
      color: "#2a2116",
      emissive: "#ffbe6e",
      emissiveIntensity: 0.55,
      flatShading: true,
      name: "lighthouse-window-glow",
      roughness: 0.62,
      toneMapped: false,
    })],
  ]);
  const geometryByMaterial = new Map(
    [...materials.keys()].map((name) => [name, []]),
  );

  const add = (materialName, geometry, transform = {}) => {
    const matrix = new Matrix4();
    const position = transform.position ?? [0, 0, 0];
    const rotation = transform.rotation ?? [0, 0, 0];
    const scale = transform.scale ?? [1, 1, 1];
    matrix.compose(
      new Vector3(...position),
      eulerQuaternion(...rotation),
      new Vector3(...scale),
    );
    geometry.applyMatrix4(matrix);
    // Every material in this model is flat-shaded, so interpolated normals are
    // dead weight: three's GLTFLoader re-flags flatShading for any primitive
    // without NORMAL, and dropping the attribute lets mergeVertices weld each
    // box's 24 corners down to 8 (position + baked-AO colour are the only
    // per-vertex data left). That is what keeps ~40k triangles inside the
    // 600 KiB earmark without a quantization extension.
    geometry.deleteAttribute("normal");
    geometry.deleteAttribute("uv");
    geometry.deleteAttribute("uv1");
    geometryByMaterial.get(materialName).push(geometry);
  };

  // Places a geometry authored in face-local space (+Z outward, +X along the
  // face, +Y up) onto a tier face rotated `angle` about Y. `tilt` rotates in
  // the face plane first (Euler XYZ applies Z before Y), which is how arch
  // voussoirs are laid around their springing line.
  const place = (materialName, geometry, angle, u, y, out, tilt = 0) => {
    add(materialName, geometry, {
      position: [
        u * Math.cos(angle) + out * Math.sin(angle),
        y,
        -u * Math.sin(angle) + out * Math.cos(angle),
      ],
      rotation: [0, angle, tilt],
    });
  };

  // A dentil course laid along a tier's faces (never a circle — a circular
  // ring buries itself in a square tier's corners and floats off its faces).
  const dentilCourse = ({
    depth = 0.16,
    faceAngles,
    faceWidth,
    height = 0.16,
    inradius,
    project = 0.06,
    width = 0.14,
    y,
  }) => {
    const count = Math.max(2, Math.round(faceWidth / (width * 2.1)));
    const pitch = faceWidth / count;
    for (const angle of faceAngles) {
      for (let index = 0; index < count; index += 1) {
        place(
          "stone",
          new BoxGeometry(width, height, depth),
          angle,
          -faceWidth / 2 + (index + 0.5) * pitch,
          y,
          inradius + project - depth / 2,
        );
      }
    }
  };

  const oct = (materialName, radiusTop, radiusBottom, height, y, open = false) =>
    add(materialName, new CylinderGeometry(
      radiusTop,
      radiusBottom,
      height,
      8,
      1,
      open,
    ), { position: [0, y, 0], rotation: [0, OCT, 0] });

  // Square shaft, battered from 4.6 to 3.7 half-width; each face is +Z local.
  const squareHalf = (y) => SQUARE_BASE_HALF
    + (SQUARE_TOP_HALF - SQUARE_BASE_HALF)
      * (y - TERRACE_TOP_Y) / (SQUARE_TOP_Y - TERRACE_TOP_Y);

  // Slight entasis on the octagonal drum (Thiersch's second tier).
  const octRadius = (y) => OCT_BASE_RADIUS
    + (OCT_TOP_RADIUS - OCT_BASE_RADIUS)
      * (y - OCT_BASE_Y) / (OCT_TOP_Y - OCT_BASE_Y);

  // --- W4.2 ashlar coursing --------------------------------------------------
  // One inset core per tier, clad in per-course rings of individually placed
  // blocks: alternating course depth, running bond (odd courses shift half a
  // block), deterministic per-block relief jitter, and interlocking corner
  // quoins that always stand proud. Apertures punch real holes in the skin so
  // window and door reveals cut through to the recessed core.
  const ashlarTier = ({
    apertures = [],
    blockWidth,
    courses,
    faceAngles,
    faceWidthAt,
    inradiusAt,
    quoins = null,
    // How far behind the nominal face the block's inner end sits. On tiers
    // that carry apertures this is the full wall thickness, so a skipped block
    // leaves a hole right through to the recessed core and the window reveal
    // has real depth instead of a painted-on frame.
    wallDepth = MORTAR_INSET + 0.04,
    y0,
    y1,
  }) => {
    const height = (y1 - y0) / courses;
    COURSE_BANDS.push({ height, y0, y1 });
    for (let course = 0; course < courses; course += 1) {
      const courseY0 = y0 + course * height;
      const midY = courseY0 + height / 2;
      const inradius = inradiusAt(midY);
      const faceWidth = faceWidthAt(midY);
      // Alternating course depth: every other ring sits back a hair, so the
      // raking key sun lays a shadow line along each joint.
      const bandInset = course % 2 === 0 ? 0 : 0.04;
      const quoinSide = quoins === null
        ? 0
        : (course % 2 === 0 ? quoins.wide : quoins.narrow);
      if (quoins !== null) {
        const offset = inradius + 0.015 - quoinSide / 2;
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            add("stone", new BoxGeometry(
              quoinSide,
              height - COURSE_JOINT,
              quoinSide,
            ), { position: [sx * offset, midY, sz * offset] });
          }
        }
        registerOverhang(midY + height / 2, inradius + 0.02, 0.16);
      }
      // Overlap the quoin slightly: a butt joint here leaves a hairline the
      // camera catches as a sky sliver along the silhouette.
      const runHalf = faceWidth / 2 - quoinSide + (quoinSide > 0 ? 0.06 : 0);
      if (runHalf <= blockWidth * 0.3) continue;
      const span = runHalf * 2;
      const count = Math.max(2, Math.round(span / blockWidth));
      const width = span / count;
      const stagger = course % 2 === 0 ? 0 : 0.5;
      for (let faceIndex = 0; faceIndex < faceAngles.length; faceIndex += 1) {
        const angle = faceAngles[faceIndex];
        for (let block = -1; block <= count; block += 1) {
          const rawStart = -runHalf + (block + stagger) * width;
          const start = Math.max(-runHalf, rawStart);
          const end = Math.min(runHalf, rawStart + width);
          if (end - start < width * 0.22) continue;
          const centre = (start + end) / 2;
          if (blockedByAperture(
            apertures,
            faceIndex,
            start,
            end,
            courseY0,
            courseY0 + height,
          )) continue;
          // Keep the quoin's 0.015 projection outermost, including at the
          // stylobate: hash jitter must not shift the base-centre bounds.
          const relief = (hashUnit(course, faceIndex, block) - 0.5) * 0.028;
          const out = inradius - bandInset + relief;
          const depth = out - (inradius - wallDepth);
          place(
            "stone",
            new BoxGeometry(end - start - COURSE_JOINT, height - COURSE_JOINT, depth),
            angle,
            centre,
            midY,
            out - depth / 2,
          );
        }
      }
    }
  };

  // --- Grand square terrace: three coursed steps up to the tower plinth. ----
  // Cores are sunk behind a single ring of facing blocks each, so the terrace
  // gets the same joint read as the shaft instead of three bare boxes.
  const terraceSteps = [
    { half: 6.2, y0: 0, y1: 0.85 },
    { half: 5.7, y0: 0.85, y1: 1.7 },
    { half: 5.2, y0: 1.7, y1: 2.5 },
  ];
  for (const step of terraceSteps) {
    const core = (step.half - MORTAR_INSET) * 2;
    add("stone", new BoxGeometry(core, step.y1 - step.y0, core), {
      position: [0, (step.y0 + step.y1) / 2, 0],
    });
    ashlarTier({
      blockWidth: 1.15,
      courses: 1,
      faceAngles: [0, Math.PI / 2, Math.PI, -Math.PI / 2],
      faceWidthAt: () => step.half * 2,
      inradiusAt: () => step.half,
      quoins: { narrow: 0.5, wide: 0.72 },
      y0: step.y0,
      y1: step.y1,
    });
    registerCrease(step.y1, step.half);
    registerOverhang(step.y1, step.half + 0.02, 0.3);
  }
  registerCrease(TERRACE_TOP_Y, SQUARE_BASE_HALF);

  // Three disciplined window rows on every face make the lower keep read
  // as an inhabited monumental building rather than a slender chimney.
  const SQUARE_FACES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  const squareWindows = SQUARE_FACES.flatMap((_, face) =>
    [6.5, 11.5, 16.5].flatMap((sill) =>
      [-2.25, 0, 2.25].map((u) => ({
        face, height: 1.35, sill, u, width: 0.72,
      })),
    ),
  );
  const DOOR_U = 0;
  const DOOR_WIDTH = 1.8;
  const DOOR_SILL = 3.35;
  const DOOR_HEIGHT = 2.05;
  const squareApertures = [
    ...squareWindows.map((window) => ({
      face: window.face,
      u0: window.u - window.width / 2 - 0.16,
      u1: window.u + window.width / 2 + 0.16,
      y0: window.sill - 0.12,
      y1: window.sill + window.height + window.width / 2 + 0.28,
    })),
    {
      face: 0,
      u0: DOOR_U - DOOR_WIDTH / 2 - 0.2,
      u1: DOOR_U + DOOR_WIDTH / 2 + 0.2,
      y0: DOOR_SILL - 0.3,
      y1: DOOR_SILL + DOOR_HEIGHT + DOOR_WIDTH / 2 + 0.34,
    },
  ];

  const SQUARE_WALL_DEPTH = 0.46;
  add("stone", new CylinderGeometry(
    (squareHalf(SQUARE_TOP_Y) - SQUARE_WALL_DEPTH) * SQRT2,
    (squareHalf(TERRACE_TOP_Y) - SQUARE_WALL_DEPTH) * SQRT2,
    SQUARE_TOP_Y - TERRACE_TOP_Y,
    4,
    1,
    false,
  ), { position: [0, (TERRACE_TOP_Y + SQUARE_TOP_Y) / 2, 0], rotation: [0, SQ, 0] });
  ashlarTier({
    apertures: squareApertures,
    blockWidth: 0.78,
    courses: 34,
    faceAngles: SQUARE_FACES,
    faceWidthAt: (y) => squareHalf(y) * 2,
    inradiusAt: squareHalf,
    quoins: { narrow: 0.54, wide: 0.76 },
    wallDepth: SQUARE_WALL_DEPTH,
    y0: TERRACE_TOP_Y,
    y1: SQUARE_TOP_Y,
  });

  // Projecting string courses divide the three window registers.
  for (const [y, height, project] of [[2.72, 0.44, 0.17], [9.7, 0.24, 0.13], [14.7, 0.24, 0.13]]) {
    const half = squareHalf(y);
    add("stone", new CylinderGeometry(
      (half + project) * SQRT2,
      (half + project) * SQRT2,
      height,
      4,
      1,
      true,
    ), { position: [0, y, 0], rotation: [0, SQ, 0] });
    add("stone", new CylinderGeometry(
      (half + 0.02) * SQRT2,
      (half + project) * SQRT2,
      0.2,
      4,
      1,
      true,
    ), { position: [0, y + height / 2 + 0.1, 0], rotation: [0, SQ, 0] });
    registerOverhang(y - height / 2, half + project + 0.02, 0.6);
    registerCrease(y + height / 2 + 0.2, half);
  }
  dentilCourse({
    depth: 0.16,
    faceAngles: SQUARE_FACES,
    faceWidth: squareHalf(20.05) * 2,
    height: 0.14,
    inradius: squareHalf(20.05),
    width: 0.13,
    y: 20.05,
  });

  // --- W4.3 arched window reveals -------------------------------------------
  // Recessed back panel + emissive aperture + jambs + projecting sill + a
  // semicircular head of seven voussoirs with a proud keystone. The reveal is
  // 0.44 deep, which is what the AO pass reads as a real opening rather than
  // a decal.
  const archedWindow = ({ angle, height, inradius, reveal, sill, u, width, voussoirs = 7 }) => {
    const backOut = inradius - reveal;
    const headY = sill + height;
    const archRadius = width / 2;
    const openingHeight = height + archRadius + 0.1;
    place("stone", new BoxGeometry(width + 0.62, openingHeight + 0.5, 0.14), angle, u, sill + openingHeight / 2 - 0.1, backOut - 0.07);
    place("window", new BoxGeometry(width, height + archRadius * 0.72, 0.07), angle, u, sill + (height + archRadius * 0.72) / 2, backOut + 0.05);
    // Jambs line the full wall thickness, so the reveal is a real tunnel with
    // the emissive aperture at the back of it.
    for (const side of [-1, 1]) {
      place("stone", new BoxGeometry(0.26, height + 0.06, reveal), angle, u + side * (width / 2 + 0.13), sill + height / 2, inradius - reveal / 2);
    }
    // Sill: the one part that projects, so it throws a shadow on the course
    // below (registered as an overhang for the AO pass).
    place("stone", new BoxGeometry(width + 0.74, 0.17, 0.6), angle, u, sill - 0.075, inradius - 0.14);
    registerOverhang(sill - 0.16, inradius + 0.2, 0.55);
    const ringRadius = archRadius + 0.15;
    for (let index = 0; index < voussoirs; index += 1) {
      const theta = Math.PI * (index + 0.5) / voussoirs;
      const keystone = index === (voussoirs - 1) / 2;
      place(
        "stone",
        new BoxGeometry(
          keystone ? 0.3 : 0.26,
          keystone ? 0.42 : 0.34,
          keystone ? 0.52 : 0.46,
        ),
        angle,
        u + Math.cos(theta) * ringRadius,
        headY + Math.sin(theta) * ringRadius,
        inradius - (keystone ? 0.2 : 0.23),
        theta - Math.PI / 2,
      );
    }
    // Hood mould: a thin drip course following the extrados.
    for (let index = 0; index < voussoirs + 2; index += 1) {
      const theta = Math.PI * index / (voussoirs + 1);
      place(
        "stone",
        new BoxGeometry(0.24, 0.12, 0.3),
        angle,
        u + Math.cos(theta) * (ringRadius + 0.26),
        headY + Math.sin(theta) * (ringRadius + 0.26),
        inradius - 0.05,
        theta - Math.PI / 2,
      );
    }
    registerOverhang(headY + ringRadius + 0.3, inradius + 0.18, 0.5);
  };

  for (const window of squareWindows) {
    archedWindow({
      angle: SQUARE_FACES[window.face],
      height: window.height,
      inradius: squareHalf(window.sill + window.height / 2),
      reveal: SQUARE_WALL_DEPTH,
      sill: window.sill,
      u: window.u,
      width: window.width,
    });
  }

  // --- W4.3 bronze double doors ---------------------------------------------
  // Tall recessed bronze portal above a broad frontal stair.
  const doorFace = squareHalf(DOOR_SILL + DOOR_HEIGHT / 2);
  const doorBack = doorFace - SQUARE_WALL_DEPTH + 0.06;
  add("stone", new BoxGeometry(DOOR_WIDTH + 0.9, DOOR_HEIGHT + DOOR_WIDTH / 2 + 0.7, 0.16), {
    position: [DOOR_U, DOOR_SILL + (DOOR_HEIGHT + DOOR_WIDTH / 2) / 2, doorBack - 0.08],
  });
  for (const side of [-1, 1]) {
    add("stone", new BoxGeometry(0.32, DOOR_HEIGHT + 0.08, SQUARE_WALL_DEPTH), {
      position: [DOOR_U + side * (DOOR_WIDTH / 2 + 0.16), DOOR_SILL + DOOR_HEIGHT / 2, doorFace - SQUARE_WALL_DEPTH / 2],
    });
  }
  for (let index = 0; index < 9; index += 1) {
    const theta = Math.PI * (index + 0.5) / 9;
    const ringRadius = DOOR_WIDTH / 2 + 0.18;
    const keystone = index === 4;
    add("stone", new BoxGeometry(keystone ? 0.34 : 0.3, keystone ? 0.5 : 0.4, keystone ? 0.58 : 0.52), {
      position: [
        DOOR_U + Math.cos(theta) * ringRadius,
        DOOR_SILL + DOOR_HEIGHT + Math.sin(theta) * ringRadius,
        doorFace - 0.24,
      ],
      rotation: [0, 0, theta - Math.PI / 2],
    });
  }
  // Threshold and landing.
  add("stone", new BoxGeometry(DOOR_WIDTH + 1.1, 0.22, 1.0), {
    position: [DOOR_U, DOOR_SILL - 0.11, doorFace + 0.18],
  });
  registerOverhang(DOOR_SILL - 0.22, doorFace + 0.7, 0.6);
  for (const side of [-1, 1]) {
    // Two studded leaves, hung against the reveal's back face.
    add("darkBronze", new BoxGeometry(DOOR_WIDTH / 2 - 0.03, DOOR_HEIGHT, 0.1), {
      position: [DOOR_U + side * (DOOR_WIDTH / 4 + 0.01), DOOR_SILL + DOOR_HEIGHT / 2, doorBack + 0.11],
    });
    for (let row = 0; row < 5; row += 1) {
      for (let column = 0; column < 2; column += 1) {
        add("bronze", new BoxGeometry(0.07, 0.07, 0.07), {
          position: [
            DOOR_U + side * (0.14 + column * 0.3),
            DOOR_SILL + 0.22 + row * 0.36,
            doorBack + 0.18,
          ],
        });
      }
    }
    // Lion-mask ring pull.
    const ring = new TorusGeometry(0.1, 0.025, 4, 8);
    add("bronze", ring, {
      position: [DOOR_U + side * 0.2, DOOR_SILL + 1.06, doorBack + 0.19],
    });
  }
  add("timber", new BoxGeometry(DOOR_WIDTH + 0.02, 0.12, 0.09), {
    position: [DOOR_U, DOOR_SILL + DOOR_HEIGHT - 0.02, doorBack + 0.1],
  });

  // Broad frontal stair, contained entirely on the stepped stylobate.
  for (let step = 0; step < 6; step += 1) {
    const height = (DOOR_SILL - TERRACE_TOP_Y) * (step + 1) / 6;
    const depth = 1.25 - step * 0.16;
    add("stone", new BoxGeometry(3.0, height, depth), {
      position: [0, TERRACE_TOP_Y + height / 2, 4.65 + depth / 2],
    });
  }

  // --- Votive frieze on the seaward face ------------------------------------
  // L6 (2026-07-25): this was a strip of thirteen abstract gilt bars, one per
  // letter of the attested dedication (ΘΕΟΙΣ ΣΩΤΗΡΣΙΝ). It read as garbled
  // text, and the operator reported it as a bug — correctly. Its features were
  // 0.09 units on a 34-unit tower, well under a pixel at overview zoom, so it
  // could only ever resolve as noise shaped like writing.
  //
  // Real letterforms cannot be the answer either: at any legible stroke width
  // thirteen Greek capitals would not fit the 5.9-unit face. So the frieze
  // becomes ORNAMENT rather than script — three gilt rosettes on a recessed
  // bronze ground, separated by paired fillets. Every feature is >= 0.3 units,
  // which reads as carved relief at overview zoom and as detail up close, and
  // cannot be mistaken for text at either.
  const BAND_Y = 19.55;
  const bandFace = squareHalf(BAND_Y);
  add("stone", new BoxGeometry(5.1, 1.02, 0.14), {
    position: [0, BAND_Y, bandFace - 0.05],
  });
  add("stone", new BoxGeometry(5.5, 0.14, 0.28), {
    position: [0, BAND_Y + 0.6, bandFace + 0.02],
  });
  // Drip course under the panel too, so the frieze sits in a moulded recess
  // rather than being pasted onto the wall.
  add("stone", new BoxGeometry(5.5, 0.12, 0.24), {
    position: [0, BAND_Y - 0.58, bandFace + 0.01],
  });
  registerOverhang(BAND_Y + 0.52, bandFace + 0.2, 0.4);
  // Deliberately NOT a dark recessed ground with light marks in it: that shape
  // reads as writing whatever you put inside it, which is how the old glyph
  // strip came to look like broken text. The field is the same limestone as the
  // wall, and the relief sits proud of it.
  const ROSETTE_PETALS = 8;
  for (const rosetteX of [-1.62, 0, 1.62]) {
    // Stone patera behind each boss, so the ornament has a seat.
    add("stone", new CylinderGeometry(0.34, 0.34, 0.07, 8), {
      position: [rosetteX, BAND_Y, bandFace + 0.06],
      rotation: [Math.PI / 2, 0, Math.PI / 8],
    });
    add("gilt", new CylinderGeometry(0.15, 0.15, 0.08, 8), {
      position: [rosetteX, BAND_Y, bandFace + 0.11],
      rotation: [Math.PI / 2, 0, 0],
    });
    for (let petal = 0; petal < ROSETTE_PETALS; petal += 1) {
      const angle = (petal / ROSETTE_PETALS) * Math.PI * 2;
      add("gilt", new BoxGeometry(0.19, 0.1, 0.06), {
        position: [
          rosetteX + Math.cos(angle) * 0.23,
          BAND_Y + Math.sin(angle) * 0.23,
          bandFace + 0.09,
        ],
        rotation: [0, 0, angle],
      });
    }
  }
  // Stone pilaster strips dividing the three bays.
  for (const filletX of [-2.24, -0.81, 0.81, 2.24]) {
    add("stone", new BoxGeometry(0.16, 0.68, 0.1), {
      position: [filletX, BAND_Y, bandFace + 0.05],
    });
  }

  // Octagonal foot moulding rises directly from the broad square gallery.
  oct("stone", 2.9, 3.12, 0.35, SQUARE_TOP_Y + 0.175);
  oct("stone", 2.95, 2.95, 0.18, SQUARE_TOP_Y + 0.44);
  registerCrease(SQUARE_TOP_Y + 0.53, 2.8);
  registerOverhang(SQUARE_TOP_Y + 0.35, 3.12, 0.8);

  // Projecting corbelled gallery with a continuous balustrade.
  const GALLERY_Y = SQUARE_TOP_Y;
  const GALLERY_HALF = 4.7;
  const GALLERY_SHAFT_HALF = squareHalf(GALLERY_Y - 0.5);
  // Corbel brackets carrying the oversail, five to a face plus the corners.
  for (const angle of SQUARE_FACES) {
    for (let index = 0; index < 5; index += 1) {
      const u = -GALLERY_SHAFT_HALF * 0.78 + (index / 4) * GALLERY_SHAFT_HALF * 1.56;
      place(
        "stone",
        new BoxGeometry(0.34, 0.42, GALLERY_HALF - GALLERY_SHAFT_HALF + 0.1),
        angle,
        u,
        GALLERY_Y - 0.34,
        (GALLERY_SHAFT_HALF + GALLERY_HALF) / 2,
      );
    }
  }
  // Deck slab and its coping edge.
  add("stone", new BoxGeometry(GALLERY_HALF * 2, 0.28, GALLERY_HALF * 2), {
    position: [0, GALLERY_Y - 0.05, 0],
  });
  add("stone", new BoxGeometry(GALLERY_HALF * 2 + 0.22, 0.14, GALLERY_HALF * 2 + 0.22), {
    position: [0, GALLERY_Y + 0.16, 0],
  });
  registerOverhang(GALLERY_Y - 0.4, GALLERY_HALF + 0.12, 1.6);
  registerCrease(GALLERY_Y + 0.23, GALLERY_HALF);
  // Balustrade: a run of turned balusters under a continuous rail, with a
  // squat pier at each corner for the Tritons to stand on.
  const BALUSTER_TOP_Y = GALLERY_Y + 1.02;
  for (const angle of SQUARE_FACES) {
    const run = GALLERY_HALF * 2 - 1.5;
    const count = 11;
    for (let index = 0; index < count; index += 1) {
      const u = -run / 2 + (index / (count - 1)) * run;
      place(
        "stone",
        new CylinderGeometry(0.09, 0.13, 0.62, 6),
        angle,
        u,
        GALLERY_Y + 0.54,
        GALLERY_HALF - 0.14,
      );
    }
    // Kerb under the balusters and the rail over them.
    place("stone", new BoxGeometry(run + 0.4, 0.16, 0.3), angle, 0, GALLERY_Y + 0.31, GALLERY_HALF - 0.14);
    place("stone", new BoxGeometry(run + 0.4, 0.18, 0.36), angle, 0, BALUSTER_TOP_Y - 0.16, GALLERY_HALF - 0.14);
  }
  for (const [cornerX, cornerZ] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    add("stone", new BoxGeometry(0.72, 1.35, 0.72), {
      position: [cornerX * (GALLERY_HALF - 0.3), GALLERY_Y + 0.9, cornerZ * (GALLERY_HALF - 0.3)],
    });
    add("stone", new BoxGeometry(0.86, 0.14, 0.86), {
      position: [cornerX * (GALLERY_HALF - 0.3), GALLERY_Y + 1.64, cornerZ * (GALLERY_HALF - 0.3)],
    });
  }

  // --- Four Triton corner finials (the coins' most diagnostic detail) -------
  // W4.3: real form, not cones — a plinth, a tapered torso with shoulders, a
  // curled fish tail with a flared fluke, two raised arms, and a spiral conch
  // built from four tapering whorls.
  const triton = (x, z, y) => {
    const parts = [];
    const plinth = new BoxGeometry(0.62, 0.24, 0.62);
    plinth.translate(0, 0.12, 0);
    parts.push(plinth);
    const torso = new CylinderGeometry(0.17, 0.24, 0.62, 6);
    torso.translate(0, 0.62, 0);
    parts.push(torso);
    const shoulders = new CylinderGeometry(0.2, 0.17, 0.2, 6);
    shoulders.translate(0, 1.0, 0);
    parts.push(shoulders);
    // Fish tail: a curled torus arc dropping behind the body into a fluke.
    const tail = new TorusGeometry(0.26, 0.085, 4, 7, Math.PI * 1.05);
    tail.rotateY(Math.PI / 2);
    tail.rotateX(0.35);
    tail.translate(0, 0.4, -0.24);
    parts.push(tail);
    for (const side of [-1, 1]) {
      const fluke = new BoxGeometry(0.06, 0.3, 0.16);
      fluke.rotateX(0.9);
      fluke.rotateZ(side * 0.5);
      fluke.translate(side * 0.11, 0.24, -0.44);
      parts.push(fluke);
    }
    const head = mergeVertices(new IcosahedronGeometry(0.135, 0));
    head.translate(0, 1.18, 0.01);
    parts.push(head);
    for (const side of [-1, 1]) {
      const upperArm = new BoxGeometry(0.075, 0.28, 0.075);
      upperArm.rotateZ(-side * 0.5);
      upperArm.translate(side * 0.19, 1.0, 0.03);
      parts.push(upperArm);
      const forearm = new BoxGeometry(0.07, 0.26, 0.07);
      forearm.rotateX(0.6);
      forearm.rotateZ(-side * 0.2);
      forearm.translate(side * 0.22, 1.22, 0.16);
      parts.push(forearm);
    }
    // Conch: four tapering whorls on a rising spiral, mouth flared forward.
    for (let whorl = 0; whorl < 4; whorl += 1) {
      const t = whorl / 3;
      const shell = new CylinderGeometry(0.11 - t * 0.075, 0.13 - t * 0.08, 0.12, 6);
      shell.rotateX(-1.0);
      shell.translate(0, 1.3 + t * 0.14, 0.26 + t * 0.16);
      parts.push(shell);
    }
    const mouth = new ConeGeometry(0.13, 0.16, 6, 1, true);
    mouth.rotateX(1.05);
    mouth.translate(0, 1.27, 0.2);
    parts.push(mouth);
    const cluster = mergeGeometries(parts, false);
    if (cluster === null) throw new Error("Could not merge triton cluster.");
    add("stone", cluster, {
      position: [x, y, z],
      rotation: [0, Math.atan2(x, z), 0],
    });
  };
  // L6: the Tritons move out onto the gallery's corner piers. They used to
  // stand at +-2.55 against the drum's flare, which half-buried them; on the
  // piers they read as four figures at the corners of the monument.
  const TRITON_OFFSET = GALLERY_HALF - 0.3;
  const TRITON_Y = GALLERY_Y + 1.71;
  triton(TRITON_OFFSET, TRITON_OFFSET, TRITON_Y);
  triton(-TRITON_OFFSET, TRITON_OFFSET, TRITON_Y);
  triton(TRITON_OFFSET, -TRITON_OFFSET, TRITON_Y);
  triton(-TRITON_OFFSET, -TRITON_OFFSET, TRITON_Y);

  // Octagonal middle drum: one tall arched window on each flat face.
  const OCT_FACES = Array.from({ length: 8 }, (_, index) => index * Math.PI / 4);
  const octWindows = OCT_FACES.map((_, face) => ({
    face, height: 2.15, sill: 24.25, u: 0, width: 0.82,
  }));
  const octApertures = octWindows.map((window) => ({
    face: window.face,
    u0: window.u - window.width / 2 - 0.15,
    u1: window.u + window.width / 2 + 0.15,
    y0: window.sill - 0.12,
    y1: window.sill + window.height + window.width / 2 + 0.26,
  }));
  const OCT_WALL_DEPTH = 0.36;
  oct(
    "stone",
    octRadius(OCT_TOP_Y) - OCT_WALL_DEPTH / OCT_FACE,
    octRadius(OCT_BASE_Y) - OCT_WALL_DEPTH / OCT_FACE,
    OCT_TOP_Y - OCT_BASE_Y,
    (OCT_BASE_Y + OCT_TOP_Y) / 2,
    false,
  );
  ashlarTier({
    apertures: octApertures,
    blockWidth: 0.72,
    courses: 16,
    faceAngles: OCT_FACES,
    faceWidthAt: (y) => octRadius(y) * OCT_HALF_CHORD * 2,
    inradiusAt: (y) => octRadius(y) * OCT_FACE,
    wallDepth: OCT_WALL_DEPTH,
    y0: OCT_BASE_Y,
    y1: OCT_TOP_Y,
  });
  for (const window of octWindows) {
    archedWindow({
      angle: OCT_FACES[window.face],
      height: window.height,
      inradius: octRadius(window.sill + window.height / 2) * OCT_FACE,
      reveal: OCT_WALL_DEPTH,
      sill: window.sill,
      u: window.u,
      voussoirs: 5,
      width: window.width,
    });
  }

  // Eight edge pilasters follow the drum's batter; the face centres stay
  // clear for windows. Capitals support the corbel table at its head.
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4 + OCT;
    const y0 = OCT_BASE_Y + 0.53;
    const y1 = OCT_TOP_Y - 0.4;
    const shaft = new CylinderGeometry(0.15, 0.2, y1 - y0, 6);
    shaft.rotateX(Math.atan2(OCT_BASE_RADIUS - OCT_TOP_RADIUS, OCT_TOP_Y - OCT_BASE_Y));
    place("stone", shaft, angle, 0, (y0 + y1) / 2, octRadius((y0 + y1) / 2));
    place("stone", new BoxGeometry(0.52, 0.22, 0.48), angle, 0, y0, octRadius(y0));
    place("stone", new BoxGeometry(0.48, 0.28, 0.5), angle, 0, y1, octRadius(y1));
  }
  dentilCourse({
    depth: 0.28,
    faceAngles: OCT_FACES,
    faceWidth: OCT_TOP_RADIUS * OCT_HALF_CHORD * 2,
    height: 0.26,
    inradius: OCT_TOP_RADIUS * OCT_FACE,
    width: 0.22,
    y: OCT_TOP_Y - 0.2,
  });
  registerOverhang(OCT_TOP_Y - 0.35, 2.65, 0.9);

  // Broad annular floor is the shared summit-bird perch. The open lantern
  // sits inboard, leaving its outer rim unobstructed in both representations.
  add("stone", new CylinderGeometry(2.55, 2.55, 0.4, 32), {
    position: [0, (OCT_TOP_Y + LANTERN_BASE_Y) / 2, 0],
  });
  registerCrease(LANTERN_BASE_Y, LANTERN_RADIUS);
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4 + OCT;
    place("stone", new CylinderGeometry(0.24, 0.27, 0.18, 8), angle, 0, 29.49, LANTERN_RADIUS);
    place("stone", new CylinderGeometry(0.16, 0.18, 2.45, 12), angle, 0, 30.805, LANTERN_RADIUS);
    place("stone", new BoxGeometry(0.45, 0.22, 0.45), angle, 0, 32.14, LANTERN_RADIUS);
    // Real semicircular arch voussoirs bridge each neighbouring column pair.
    const faceAngle = angle + Math.PI / 8;
    const archRadius = LANTERN_RADIUS * Math.sin(Math.PI / 8);
    for (let stone = 0; stone < 9; stone += 1) {
      const theta = Math.PI * (stone + 0.5) / 9;
      place("stone", new BoxGeometry(0.27, 0.24, 0.36),
        faceAngle, Math.cos(theta) * archRadius,
        32.03 + Math.sin(theta) * archRadius,
        LANTERN_RADIUS * OCT_FACE, theta - Math.PI / 2);
    }
  }
  // Emissive-only inner wall makes every lantern opening burn warm at dusk,
  // with no additional lights or textures and an open top around the fire.
  add("window", new CylinderGeometry(1.3, 1.3, 2.75, 32, 1, true), {
    position: [0, 30.925, 0],
  });
  add("stone", new CylinderGeometry(2.18, 2.08, 0.4, 32), {
    position: [0, LANTERN_TOP_Y + 0.2, 0],
  });
  registerOverhang(LANTERN_TOP_Y, 2.18, 0.7);
  add("stone", new ConeGeometry(2.2, 1.2, 32), {
    position: [0, 33.8, 0],
  });
  add("gilt", new CylinderGeometry(0.48, 0.48, 0.12, 16), {
    position: [0, 34.4, 0],
  });
  add("stone", new CylinderGeometry(0.52, 0.65, 0.6, 8), {
    position: [0, 34.7, 0],
  });

  // Bowl centred on the beacon, nestled inside the lantern's glowing drum.
  add("bronze", new CylinderGeometry(0.48, 0.65, 0.3, 12), {
    position: [0, 29.72, 0],
  });
  add("bronze", new CylinderGeometry(1.1, 0.48, 0.65, 16, 1, true), {
    position: [0, BEACON_Y, 0],
  });
  add("bronze", mirrorGeometry(new CylinderGeometry(1.02, 0.42, 0.6, 16, 1, true)), {
    position: [0, BEACON_Y, 0],
  });
  add("ember", new CylinderGeometry(0.98, 0.98, 0.16, 16), {
    position: [0, BEACON_Y, 0],
  });
  add("bronze", new TorusGeometry(1.1, 0.065, 4, 16), {
    position: [0, BEACON_Y + 0.325, 0],
    rotation: [Math.PI / 2, 0, 0],
  });

  // --- Crowning Zeus Soter (D2, Roman-coin type) ----------------------------
  // W4.6: real modelled form. Moulded plinth, a draped robe built from six
  // lathed courses with vertical fold ribs, shoulders and a himation roll, a
  // radiate head, one arm outstretched to the sea (+Z) and one bearing the
  // sceptre whose tip is exactly SCEPTRE_TIP_Y.
  const statueStart = geometryByMaterial.get("gilt").length;
  // Author the sculptural detail in its original local proportions, then
  // seat its 29.9–34 range exactly on the summit's 35–38 range.
  const statueTip = 34;
  add("gilt", new CylinderGeometry(0.46, 0.52, 0.16, 8), { position: [0, 29.98, 0] });
  add("gilt", new CylinderGeometry(0.38, 0.46, 0.18, 8), { position: [0, 30.15, 0] });
  add("gilt", new CylinderGeometry(0.34, 0.38, 0.14, 8), { position: [0, 30.31, 0] });
  const ROBE_BASE = 30.38;
  const ROBE_TOP = 32.4;
  const robeCourses = 6;
  for (let index = 0; index < robeCourses; index += 1) {
    const t0 = index / robeCourses;
    const t1 = (index + 1) / robeCourses;
    const y0 = ROBE_BASE + (ROBE_TOP - ROBE_BASE) * t0;
    const y1 = ROBE_BASE + (ROBE_TOP - ROBE_BASE) * t1;
    const r0 = 0.5 - 0.2 * t0 - Math.sin(t0 * Math.PI) * 0.03;
    const r1 = 0.5 - 0.2 * t1 - Math.sin(t1 * Math.PI) * 0.03;
    add("gilt", new CylinderGeometry(r1, r0, y1 - y0, 10, 1, true), {
      position: [0, (y0 + y1) / 2, 0],
    });
  }
  // Drapery folds: ribs baked onto the robe's batter (leaned inward by the
  // taper angle before they are swung around the axis) so they hug the cloth
  // instead of floating off it at the shoulders.
  const ROBE_BATTER = Math.atan2(0.5 - 0.3, ROBE_TOP - ROBE_BASE);
  for (let index = 0; index < 10; index += 1) {
    const angle = index * Math.PI / 5 + Math.PI / 10;
    const wobble = (hashUnit(index, 7, 3) - 0.5) * 0.18;
    const rib = new BoxGeometry(0.075, 1.82 + wobble, 0.075);
    rib.rotateZ(ROBE_BATTER);
    rib.translate(0.42, (ROBE_BASE + ROBE_TOP) / 2 + wobble * 0.4, 0);
    add("gilt", rib, { rotation: [0, angle, 0] });
  }
  // Himation roll across the chest, shoulders, neck, radiate head.
  add("gilt", new CylinderGeometry(0.33, 0.3, 0.24, 10), { position: [0, 32.5, 0] });
  add("gilt", new BoxGeometry(0.66, 0.14, 0.5), {
    position: [0.03, 32.42, 0.06],
    rotation: [0, 0, 0.22],
  });
  add("gilt", new CylinderGeometry(0.3, 0.34, 0.36, 10), { position: [0, 32.78, 0] });
  add("gilt", new CylinderGeometry(0.11, 0.13, 0.12, 8), { position: [0, 33.0, 0] });
  add("gilt", new SphereGeometry(0.21, 10, 7), { position: [0, 33.2, 0] });
  add("gilt", new BoxGeometry(0.24, 0.1, 0.24), { position: [0, 33.32, 0.02] });
  for (let index = 0; index < 7; index += 1) {
    const angle = -Math.PI / 2 + (index / 6) * Math.PI;
    add("gilt", new ConeGeometry(0.032, 0.24, 4), {
      position: [Math.sin(angle) * 0.2, 33.44, Math.cos(angle) * 0.2],
      rotation: [Math.cos(angle) * 0.3, 0, -Math.sin(angle) * 0.3],
    });
  }
  // Sea-side arm: shoulder, upper arm, forearm, open hand.
  add("gilt", new SphereGeometry(0.11, 8, 6), { position: [0.3, 32.86, 0.04] });
  add("gilt", new BoxGeometry(0.14, 0.44, 0.14), {
    position: [0.34, 32.7, 0.22],
    rotation: [-0.65, 0, 0.16],
  });
  add("gilt", new BoxGeometry(0.12, 0.5, 0.12), {
    position: [0.3, 32.66, 0.62],
    rotation: [-1.32, 0, 0.1],
  });
  add("gilt", new BoxGeometry(0.16, 0.08, 0.2), { position: [0.28, 32.66, 0.9] });
  // Sceptre arm and the sceptre itself: tip lands on SCEPTRE_TIP_Y exactly.
  add("gilt", new SphereGeometry(0.11, 8, 6), { position: [-0.3, 32.86, 0.02] });
  add("gilt", new BoxGeometry(0.44, 0.13, 0.13), {
    position: [-0.42, 32.74, 0.06],
    rotation: [0, 0, 0.2],
  });
  add("gilt", new CylinderGeometry(0.05, 0.05, 2.3, 6), {
    position: [-0.5, statueTip - 1.15, 0.1],
  });
  add("gilt", new SphereGeometry(0.1, 6, 4), { position: [-0.5, 33.87, 0.1] });
  add("gilt", new TorusGeometry(0.09, 0.022, 4, 8), {
    position: [-0.5, 33.62, 0.1],
    rotation: [Math.PI / 2, 0, 0],
  });
  const statueScaleY = 3 / (statueTip - 29.9);
  for (const geometry of geometryByMaterial.get("gilt").slice(statueStart)) {
    geometry.scale(1, statueScaleY, 1);
    geometry.translate(0, SCEPTRE_TIP_Y - statueTip * statueScaleY, 0);
  }

  // Everything is authored; the occlusion registries are complete, so the
  // stone can finally be painted (W4.2/W4.4 — geometry-aware baked AO).
  for (const geometry of geometryByMaterial.get("stone")) paintStone(geometry);

  let triangles = 0;
  let vertices = 0;
  for (const [materialName, geometries] of geometryByMaterial) {
    if (geometries.length === 0) continue;
    const merged = mergeGeometries(geometries, false);
    if (merged === null) {
      throw new Error(`Could not merge ${materialName} lighthouse geometry.`);
    }
    // Weld: with normals dropped, each authored box collapses from 24 corner
    // vertices to 8, and coincident block corners share. This is the whole
    // reason ~40k triangles fit in the byte earmark.
    const geometry = mergeVertices(merged);
    merged.dispose();
    packVertexColors(geometry);
    geometry.name = `${materialName}-geometry`;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    vertices += geometry.getAttribute("position").count;
    triangles += geometry.index === null
      ? geometry.getAttribute("position").count / 3
      : geometry.index.count / 3;
    const mesh = new Mesh(geometry, materials.get(materialName));
    mesh.name = `${materialName}-shell`;
    mesh.castShadow = true;
    mesh.receiveShadow = materialName !== "ember" && materialName !== "window";
    root.add(mesh);
  }

  addAnchor(root, "anchor-beacon", [0, BEACON_Y, 0], "beacon");
  addAnchor(root, "anchor-beam", [0, BEACON_Y, 0], "beam");
  addAnchor(root, "anchor-label", [0, SCEPTRE_TIP_Y + 0.9, 0], "label");
  addAnchor(root, "anchor-selection", [0, SCEPTRE_TIP_Y / 2, 0], "selection");

  root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(root);
  const size = bounds.getSize(new Vector3());
  const dimensions = {
    x: round(size.x),
    y: round(size.y),
    z: round(size.z),
  };
  if (
    Math.abs(bounds.min.y) > 0.001
    || Math.abs(bounds.min.x + bounds.max.x) > 0.001
  ) {
    throw new Error(
      `Unexpected lighthouse bounds: ${JSON.stringify({
        max: bounds.max.toArray(),
        min: bounds.min.toArray(),
      })}`,
    );
  }
  if (Math.abs(bounds.max.y - SCEPTRE_TIP_Y) > 0.001) {
    throw new Error(
      `Lighthouse height drifted from ${SCEPTRE_TIP_Y}: ${bounds.max.y}`,
    );
  }

  return {
    root,
    summary: {
      dimensions,
      drawCalls: root.children.filter((child) => child instanceof Mesh).length,
      materials: materials.size,
      triangles,
      vertices,
    },
  };
}

/**
 * Rewrites the baked-AO colour ramp as normalized UNSIGNED_BYTE VEC4, which is
 * core glTF 2.0 for COLOR_0 (no extension, no decoder) and cuts the attribute
 * from 12 bytes per vertex to 4. Combined with the dropped NORMAL attribute
 * this is what lets the Wonder-grade tower ship at a third of the bytes a
 * float-attribute export of the same geometry would cost, leaving the runtime
 * GLB earmark free for the hero hulls. VEC4 rather than VEC3 because glTF
 * requires a vertex bufferView byteStride to be a multiple of 4.
 */
function packVertexColors(geometry) {
  const color = geometry.getAttribute("color");
  if (color === undefined) return;
  const packed = new Uint8Array(color.count * 4);
  for (let index = 0; index < color.count; index += 1) {
    packed[index * 4] = Math.round(clamp01(color.getX(index)) * 255);
    packed[index * 4 + 1] = Math.round(clamp01(color.getY(index)) * 255);
    packed[index * 4 + 2] = Math.round(clamp01(color.getZ(index)) * 255);
    packed[index * 4 + 3] = 255;
  }
  geometry.setAttribute("color", new BufferAttribute(packed, 4, true));
}

/** True when an ashlar block overlaps a window or door opening. */
function blockedByAperture(apertures, face, u0, u1, y0, y1) {
  for (const aperture of apertures) {
    if (aperture.face !== face) continue;
    if (u1 <= aperture.u0 || u0 >= aperture.u1) continue;
    if (y1 <= aperture.y0 || y0 >= aperture.y1) continue;
    return true;
  }
  return false;
}

// --- Baked ambient occlusion ------------------------------------------------
// The v4 ramp was height-only, which is why prismatic solids read as flat
// pixels. This pass is geometry-aware: it darkens by how far a vertex sits
// inside the tower's nominal envelope (mortar joints, window reveals, the door
// recess), by its position under a registered projecting ledge, by proximity
// to a concave wall/floor crease, and by a per-course band that puts a shadow
// line under every ashlar joint.

/** Outer reach of the tower's nominal envelope at height y. */
function envelopeReach(y) {
  if (y < 0.85) return 6.2;
  if (y < 1.7) return 5.7;
  if (y < TERRACE_TOP_Y) return 5.2;
  if (y <= SQUARE_TOP_Y) {
    return SQUARE_BASE_HALF
      + (SQUARE_TOP_HALF - SQUARE_BASE_HALF)
        * (y - TERRACE_TOP_Y) / (SQUARE_TOP_Y - TERRACE_TOP_Y);
  }
  if (y <= OCT_TOP_Y) {
    const radius = OCT_BASE_RADIUS
      + (OCT_TOP_RADIUS - OCT_BASE_RADIUS)
        * (y - OCT_BASE_Y) / (OCT_TOP_Y - OCT_BASE_Y);
    return radius * OCT_FACE;
  }
  if (y <= LANTERN_BASE_Y) return 2.55;
  if (y <= LANTERN_TOP_Y) return LANTERN_RADIUS;
  if (y <= 33.2) return 2.18;
  if (y <= 34.4) return 2.2 * (34.4 - y) / 1.2;
  return 0.52;
}

/** Reach of a vertex in the metric of the tier it belongs to. */
function surfaceReach(x, y, z) {
  if (y <= SQUARE_TOP_Y) return Math.max(Math.abs(x), Math.abs(z));
  if (y <= OCT_TOP_Y) {
    let best = 0;
    for (let index = 0; index < 8; index += 1) {
      const angle = index * Math.PI / 4;
      best = Math.max(best, x * Math.sin(angle) + z * Math.cos(angle));
    }
    return best;
  }
  return Math.hypot(x, z);
}

/** Shadow line under every ashlar course joint. */
function courseShadow(y) {
  for (const band of COURSE_BANDS) {
    if (y < band.y0 - 1e-6 || y > band.y1 + 1e-6) continue;
    const local = (y - band.y0) / band.height;
    const fraction = local - Math.floor(local);
    return 1 - 0.24 * (1 - smoothstep(0, 0.3, fraction));
  }
  return 1;
}

function occlusion(x, y, z) {
  const reach = surfaceReach(x, y, z);
  let ao = 1;

  // Cavity: how far the vertex is sunk behind the nominal surface.
  ao *= 1 - 0.62 * smoothstep(0.012, 0.16, envelopeReach(y) - reach);
  ao *= courseShadow(y);

  for (const crease of CREASES) {
    const dy = (y - crease.y) / 0.44;
    const dr = (reach - crease.reach) / 0.6;
    ao *= 1 - 0.32 * (1 - smoothstep(0, 1, Math.hypot(dy, dr)));
  }

  for (const ledge of OVERHANGS) {
    const below = ledge.y - y;
    if (below <= 0 || below > ledge.drop) continue;
    if (reach > ledge.reach + 0.06) continue;
    ao *= 1 - 0.42 * (1 - smoothstep(0, ledge.drop, below));
  }

  // The tower's foot sits in its own shadow against the sea.
  ao *= 0.58 + 0.42 * smoothstep(0, 3.6, y);
  return clamp01(ao);
}

function paintStone(geometry) {
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const base = new Color();
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const climb = smoothstep(2.0, 30.0, y);
    base.copy(STONE_LOW).lerp(STONE_HIGH, climb);
    const wet = smoothstep(3.2, 0.0, y);
    base.lerp(STONE_WET, wet * 0.75);
    const jitter = (hash3(x, y, z) - 0.5) * 0.08;
    base.setRGB(
      clamp01(base.r + jitter),
      clamp01(base.g + jitter),
      clamp01(base.b + jitter),
    );
    // AO never crushes to black: it lands on a cool bounced-sky tint, keeping
    // the temperature break between the lit face and the shadowed joint.
    base.lerp(STONE_OCCLUDED, (1 - occlusion(x, y, z)) * 0.86);
    colors[index * 3] = base.r;
    colors[index * 3 + 1] = base.g;
    colors[index * 3 + 2] = base.b;
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
}

// Mirror across x=0 while preserving the authored triangle orientation.
function mirrorGeometry(geometry) {
  const mirrored = geometry.clone();
  mirrored.applyMatrix4(new Matrix4().makeScale(-1, 1, 1));
  const index = mirrored.getIndex();
  if (index !== null) {
    const ids = index.array;
    for (let offset = 0; offset < ids.length; offset += 3) {
      const swap = ids[offset + 1];
      ids[offset + 1] = ids[offset + 2];
      ids[offset + 2] = swap;
    }
    index.needsUpdate = true;
    return mirrored;
  }
  for (const attributeName of ["position", "normal"]) {
    const attribute = mirrored.getAttribute(attributeName);
    if (!attribute) continue;
    for (let offset = 0; offset < attribute.count; offset += 3) {
      for (let channel = 0; channel < attribute.itemSize; channel += 1) {
        const swap = attribute.getComponent(offset + 1, channel);
        attribute.setComponent(offset + 1, channel, attribute.getComponent(offset + 2, channel));
        attribute.setComponent(offset + 2, channel, swap);
      }
    }
    attribute.needsUpdate = true;
  }
  return mirrored;
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function hash3(x, y, z) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

/** Seeded unit hash over integer indices — the only jitter source (no RNG). */
function hashUnit(...values) {
  let hash = 2166136261;
  for (const value of values) {
    hash = Math.imul(hash ^ (Math.round(value * 1024) + 0x9e3779b9), 0x85ebca6b);
    hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  }
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
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
