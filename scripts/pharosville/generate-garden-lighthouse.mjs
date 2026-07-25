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

// L1 silhouette contract (Pharos Wonder 2026-07-24, decision D1 — supersedes
// D-L1's 30-unit "epic, not bigger" call): the attested three-tier Pharos of
// Alexandria, 34 units to the sceptre tip. Battered square tier (white-marble
// ramp) → octagonal drum with corbel table and Triton corner finials → short
// cylindrical drum → open bronze brazier (beacon) → bronze-gilt Zeus Soter
// statue. Anchors match GARDEN_LIGHTHOUSE_BEACON_Y / _HEIGHT exactly.
//
// W4 (grand-scale revamp 2026-07-25) keeps every number below untouched: the
// MASS was right, the SURFACE was not. Everything added in this revision is
// cladding, relief, and AO inside the same silhouette.
const TERRACE_TOP_Y = 2.5;
const SQUARE_TOP_Y = 17.5;
const SQUARE_BASE_HALF = 3.4;
const SQUARE_TOP_HALF = 2.9;
const OCT_BASE_Y = 17.5;
const OCT_TOP_Y = 26;
const OCT_BASE_RADIUS = 2.15;
const OCT_TOP_RADIUS = 2.0;
const CYL_TOP_Y = 29.5;
const CYL_RADIUS = 1.35;
const BEACON_Y = 30.1;
const SCEPTRE_TIP_Y = 34;
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

const bytes = Buffer.from(exported);
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
  sha256,
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
    if (transform.seat) seatOnGround(geometry);
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

  // Battered square tier: half-width tapers 3.4 → 2.9 (Strabo's white-marble
  // mass). A 4-segment cylinder rotated π/4 reads as a square shaft with a
  // flat face fronting +Z.
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
          const relief = (hashUnit(course, faceIndex, block) - 0.5) * 0.042;
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

  // --- Waterline: rock cluster the terrace is rooted in (L2/L3). ------------
  // Five displaced boulders in an odd Sakuteiki grouping, kept from v3 but
  // tucked against the wider square terrace (they still poke past its edges
  // and above the first step). Mirrored pairs keep the base-centre origin
  // contract exact (bounds symmetry check below).
  const mirroredRock = (radius, detail, jitter, position, scale, rotationY) => {
    const rock = displacedRock(radius, detail, jitter);
    add("stone", rock, { position, rotation: [0, rotationY, 0], scale, seat: true });
    const twin = displacedRock(radius, detail, jitter);
    add("stone", mirrorGeometry(twin), {
      position: [-position[0], position[1], position[2]],
      rotation: [0, -rotationY, 0],
      scale,
      seat: true,
    });
  };
  mirroredRock(0.8, 2, 0.3, [3.95, 0.5, 1.45], [1.1, 0.8, 0.95], 0.6);
  mirroredRock(0.6, 1, 0.35, [4.25, 0.5, -1.2], [1.0, 1.05, 0.9], 1.9);
  add("stone", displacedRock(0.7, 1, 0.3), {
    position: [0, 0.55, -4.2],
    rotation: [0, 2.7, 0],
    scale: [1.15, 0.85, 0.9],
    seat: true,
  });

  // --- Grand square terrace: three coursed steps up to the tower plinth. ----
  // Cores are sunk behind a single ring of facing blocks each, so the terrace
  // gets the same joint read as the shaft instead of three bare boxes.
  const terraceSteps = [
    { half: 4.6, y0: 0, y1: 0.85 },
    { half: 4.2, y0: 0.85, y1: 1.7 },
    { half: 3.85, y0: 1.7, y1: 2.5 },
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

  // --- Square tier (y 2.5 → 17.5), ~44% of the height — the Pharos mass. ----
  // W4.3 apertures: the elevated pylon doorway and a rhythm of arched slit
  // windows, each cut through the ashlar skin so the reveal has real depth.
  const SQUARE_FACES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  const squareWindows = [
    { face: 0, height: 1.35, sill: 5.1, u: 1.55, width: 0.66 },
    { face: 0, height: 1.5, sill: 11.0, u: -1.45, width: 0.7 },
    { face: 0, height: 1.3, sill: 14.5, u: -1.5, width: 0.62 },
    { face: 1, height: 1.5, sill: 9.2, u: 0, width: 0.7 },
    { face: 1, height: 1.35, sill: 13.1, u: 0.15, width: 0.66 },
    { face: 1, height: 1.2, sill: 6.0, u: -1.7, width: 0.6 },
    { face: 2, height: 1.4, sill: 14.3, u: -0.9, width: 0.68 },
    { face: 2, height: 1.35, sill: 8.2, u: 1.25, width: 0.66 },
    { face: 2, height: 1.3, sill: 11.4, u: -1.9, width: 0.62 },
    { face: 3, height: 1.5, sill: 9.2, u: 0, width: 0.7 },
    { face: 3, height: 1.35, sill: 13.1, u: -0.15, width: 0.66 },
    { face: 3, height: 1.2, sill: 6.0, u: 1.7, width: 0.6 },
  ];
  const DOOR_U = 0.55;
  const DOOR_WIDTH = 1.26;
  const DOOR_SILL = 7.95;
  const DOOR_HEIGHT = 1.9;
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
    courses: 28,
    faceAngles: SQUARE_FACES,
    faceWidthAt: (y) => squareHalf(y) * 2,
    inradiusAt: squareHalf,
    quoins: { narrow: 0.54, wide: 0.76 },
    wallDepth: SQUARE_WALL_DEPTH,
    y0: TERRACE_TOP_Y,
    y1: SQUARE_TOP_Y,
  });

  // Plinth moulding where the battered shaft meets the terrace, and one
  // string course splitting the 15-unit shaft into two readable registers.
  // Both are chosen to clear every aperture, so the ring never slices a
  // window reveal. They are also the two strongest AO creases on the tier.
  for (const [y, height, project] of [[2.72, 0.44, 0.17], [4.5, 0.3, 0.13]]) {
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
    faceWidth: squareHalf(4.28) * 2,
    height: 0.14,
    inradius: squareHalf(4.28),
    width: 0.13,
    y: 4.28,
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
  // Elevated pylon doorway (~y 8, storm-raised per the coins): a deep reveal,
  // two studded bronze leaves under a relieving arch, and a proud threshold.
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

  // --- W4.3 the great ramp: a causeway spiralling the base ------------------
  // Five inclined runs wrap the square tier anticlockwise from the terrace to
  // the pylon door, each with a parapet, a coping course, and an arcade of
  // piers carrying the deck — al-Balawi's fuel-hauling route. The path is a
  // Chebyshev square at RAMP_OFFSET from each face, so its corners stay inside
  // the terrace footprint and the model's bounds are untouched.
  const RAMP_OFFSET = 4.05;
  const RAMP_HALF_WIDTH = 0.4;
  const rampRuns = [
    { angle: 0, u0: -RAMP_OFFSET, u1: RAMP_OFFSET, y0: 2.62, y1: 3.72 },
    { angle: Math.PI / 2, u0: -RAMP_OFFSET, u1: RAMP_OFFSET, y0: 3.72, y1: 4.82 },
    { angle: Math.PI, u0: -RAMP_OFFSET, u1: RAMP_OFFSET, y0: 4.82, y1: 5.92 },
    { angle: -Math.PI / 2, u0: -RAMP_OFFSET, u1: RAMP_OFFSET, y0: 5.92, y1: 7.02 },
    { angle: 0, u0: -RAMP_OFFSET, u1: DOOR_U + 0.9, y0: 7.02, y1: DOOR_SILL - 0.11 },
  ];
  for (let runIndex = 0; runIndex < rampRuns.length; runIndex += 1) {
    const run = rampRuns[runIndex];
    const length = run.u1 - run.u0;
    const rise = run.y1 - run.y0;
    const pitch = Math.atan2(rise, length);
    const midU = (run.u0 + run.u1) / 2;
    const midY = (run.y0 + run.y1) / 2;
    const deckLength = Math.hypot(length, rise);
    place("stone", new BoxGeometry(deckLength, 0.2, RAMP_HALF_WIDTH * 2), run.angle, midU, midY, RAMP_OFFSET, pitch);
    // Outer parapet plus its coping course.
    place("stone", new BoxGeometry(deckLength, 0.46, 0.16), run.angle, midU, midY + 0.31, RAMP_OFFSET + RAMP_HALF_WIDTH - 0.07, pitch);
    place("stone", new BoxGeometry(deckLength, 0.1, 0.26), run.angle, midU, midY + 0.57, RAMP_OFFSET + RAMP_HALF_WIDTH - 0.05, pitch);
    registerOverhang(midY - 0.12, RAMP_OFFSET + RAMP_HALF_WIDTH, 0.7);
    // Arcade underneath: piers down to whichever surface is below, with a
    // five-voussoir arch head on the two lowest, most visible runs.
    const supportY = runIndex === 0 ? 1.7 : run.y0 - 3.3;
    const piers = 5;
    for (let pier = 0; pier < piers; pier += 1) {
      const t = (pier + 0.5) / piers;
      const u = run.u0 + t * length;
      const deckY = run.y0 + t * rise - 0.12;
      const height = deckY - supportY;
      if (height < 0.4) continue;
      place("stone", new BoxGeometry(0.34, height, 0.42), run.angle, u, supportY + height / 2, RAMP_OFFSET);
      if (runIndex > 1 || pier === piers - 1) continue;
      const nextU = run.u0 + (pier + 1.5) / piers * length;
      const bayHalf = (nextU - u) / 2;
      const springY = deckY - 0.62;
      for (let index = 0; index < 5; index += 1) {
        const theta = Math.PI * (index + 0.5) / 5;
        place(
          "stone",
          new BoxGeometry(0.3, 0.26, 0.36),
          run.angle,
          (u + nextU) / 2 + Math.cos(theta) * (bayHalf - 0.08),
          springY + Math.sin(theta) * (bayHalf - 0.08) * 0.7,
          RAMP_OFFSET,
          theta - Math.PI / 2,
        );
      }
    }
  }

  // --- Dedication band (ΘΕΟΙΣ ΣΩΤΗΡΣΙΝ) on the seaward face: an abstract ----
  // bronze glyph strip — small gilt bars suggesting Greek letterforms, NOT a
  // font asset. 13 glyphs for the 13 letters of the attested inscription, now
  // sunk into a moulded stone panel with its own drip course.
  const BAND_Y = 16.15;
  const bandFace = squareHalf(BAND_Y);
  add("stone", new BoxGeometry(5.1, 1.02, 0.14), {
    position: [0, BAND_Y, bandFace - 0.05],
  });
  add("stone", new BoxGeometry(5.5, 0.14, 0.28), {
    position: [0, BAND_Y + 0.6, bandFace + 0.02],
  });
  registerOverhang(BAND_Y + 0.52, bandFace + 0.2, 0.4);
  add("darkBronze", new BoxGeometry(4.6, 0.72, 0.06), {
    position: [0, BAND_Y, bandFace + 0.03],
  });
  for (let index = 0; index < 13; index += 1) {
    const x = -1.8 + index * 0.3;
    const z = bandFace + 0.08;
    add("gilt", new BoxGeometry(0.15, 0.4, 0.06), { position: [x, BAND_Y, z] });
    const variant = index % 3;
    const barY = variant === 0 ? BAND_Y + 0.12 : variant === 1 ? BAND_Y + 0.17 : BAND_Y - 0.17;
    add("gilt", new BoxGeometry(variant === 1 ? 0.15 : 0.3, 0.09, 0.06), {
      position: [x, barY, z],
    });
  }

  // --- W4.3 corbel table and dentil cornice at the square/octagon joint ------
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4 + OCT;
    add("stone", new BoxGeometry(0.32, 0.5, 0.62), {
      position: [Math.sin(angle) * 2.62, 17.72, Math.cos(angle) * 2.62],
      rotation: [0, angle, 0],
    });
  }
  dentilCourse({
    depth: 0.2,
    faceAngles: SQUARE_FACES,
    faceWidth: squareHalf(17.28) * 2,
    height: 0.2,
    inradius: squareHalf(17.28),
    width: 0.16,
    y: 17.28,
  });
  registerOverhang(17.18, 3.05, 0.9);
  add("stone", new CylinderGeometry(2.4, 3.0, 0.65, 8, 1, true), {
    position: [0, 17.825, 0],
    rotation: [0, OCT, 0],
  });
  add("stone", new CylinderGeometry(2.55, 2.55, 0.24, 8), {
    position: [0, 18.27, 0],
    rotation: [0, OCT, 0],
  });
  registerCrease(18.39, 2.4);
  registerOverhang(18.15, 2.6, 0.8);

  // --- Four Triton corner finials (the coins' most diagnostic detail) -------
  // W4.3: real form, not cones — a plinth, a tapered torso with shoulders, a
  // curled fish tail with a flared fluke, two raised arms, and a spiral conch
  // built from four tapering whorls.
  const triton = (x, z) => {
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
      position: [x, SQUARE_TOP_Y, z],
      rotation: [0, Math.atan2(x, z), 0],
    });
  };
  triton(2.55, 2.55);
  triton(-2.55, 2.55);
  triton(2.55, -2.55);
  triton(-2.55, -2.55);

  // --- Octagonal drum (y 17.5 → 26), the second tier of the coins. ----------
  const OCT_FACES = Array.from({ length: 8 }, (_, index) => index * Math.PI / 4);
  const octWindows = [];
  for (let index = 0; index < 8; index += 1) {
    octWindows.push({ face: index, height: 1.15, sill: 20.5, u: 0, width: 0.58 });
  }
  for (const index of [0, 2, 4, 6]) {
    octWindows.push({ face: index, height: 0.95, sill: 23.6, u: 0, width: 0.5 });
  }
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

  // --- W4.3 colonnade ring on the octagonal drum ----------------------------
  // Eight free-standing columns on the corbel slab, one per facet, carrying an
  // octagonal architrave with its own dentil course. This is the single change
  // that gives the drum a human scale reference at overview zoom.
  const COLONNADE_RADIUS = 2.44;
  const COLONNADE_BASE_Y = 18.39;
  const COLONNADE_TOP_Y = 22.35;
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4;
    const x = Math.sin(angle) * COLONNADE_RADIUS;
    const z = Math.cos(angle) * COLONNADE_RADIUS;
    add("stone", new BoxGeometry(0.44, 0.18, 0.44), {
      position: [x, COLONNADE_BASE_Y + 0.09, z],
      rotation: [0, angle, 0],
    });
    add("stone", new CylinderGeometry(0.17, 0.19, 0.16, 12), {
      position: [x, COLONNADE_BASE_Y + 0.26, z],
    });
    // 12-gon shaft: at this scale the facets read as flutes.
    const shaftHeight = COLONNADE_TOP_Y - COLONNADE_BASE_Y - 0.78;
    add("stone", new CylinderGeometry(0.145, 0.175, shaftHeight, 12, 1, true), {
      position: [x, COLONNADE_BASE_Y + 0.34 + shaftHeight / 2, z],
    });
    add("stone", new CylinderGeometry(0.2, 0.145, 0.16, 12), {
      position: [x, COLONNADE_TOP_Y - 0.36, z],
    });
    add("stone", new BoxGeometry(0.44, 0.16, 0.44), {
      position: [x, COLONNADE_TOP_Y - 0.2, z],
      rotation: [0, angle, 0],
    });
  }
  add("stone", new CylinderGeometry(2.66, 2.6, 0.3, 8), {
    position: [0, COLONNADE_TOP_Y + 0.03, 0],
    rotation: [0, OCT, 0],
  });
  dentilCourse({
    depth: 0.16,
    faceAngles: OCT_FACES,
    faceWidth: 2.62 * OCT_HALF_CHORD * 2,
    height: 0.16,
    inradius: 2.62 * OCT_FACE,
    width: 0.15,
    y: COLONNADE_TOP_Y + 0.31,
  });
  add("stone", new CylinderGeometry(2.58, 2.7, 0.18, 8), {
    position: [0, COLONNADE_TOP_Y + 0.48, 0],
    rotation: [0, OCT, 0],
  });
  registerOverhang(COLONNADE_TOP_Y - 0.14, 2.7, 3.9);
  registerCrease(COLONNADE_BASE_Y, 2.44);

  // --- Octagon cornice into the short cylindrical drum (y 26 → 29.5). -------
  dentilCourse({
    depth: 0.18,
    faceAngles: OCT_FACES,
    faceWidth: octRadius(25.6) * OCT_HALF_CHORD * 2,
    height: 0.18,
    inradius: octRadius(25.6) * OCT_FACE,
    width: 0.15,
    y: 25.6,
  });
  add("stone", new CylinderGeometry(1.72, 2.16, 0.42, 8, 1, true), {
    position: [0, 26.0, 0],
    rotation: [0, OCT, 0],
  });
  add("stone", new CylinderGeometry(1.62, 1.62, 0.26, 16), {
    position: [0, 26.3, 0],
  });
  registerOverhang(25.5, 2.2, 0.9);
  registerCrease(26.43, 1.5);

  const cylBase = 26.43;
  add("stone", new CylinderGeometry(
    CYL_RADIUS - MORTAR_INSET,
    CYL_RADIUS - MORTAR_INSET,
    CYL_TOP_Y - cylBase,
    16,
  ), { position: [0, (cylBase + CYL_TOP_Y) / 2, 0] });
  const CYL_FACES = Array.from({ length: 16 }, (_, index) => index * Math.PI / 8);
  ashlarTier({
    blockWidth: 0.44,
    courses: 6,
    faceAngles: CYL_FACES,
    faceWidthAt: () => CYL_RADIUS * Math.sin(Math.PI / 16) * 2,
    inradiusAt: () => CYL_RADIUS * Math.cos(Math.PI / 16),
    y0: cylBase,
    y1: CYL_TOP_Y,
  });
  dentilCourse({
    depth: 0.14,
    faceAngles: CYL_FACES,
    faceWidth: CYL_RADIUS * Math.sin(Math.PI / 16) * 2,
    height: 0.14,
    inradius: CYL_RADIUS * Math.cos(Math.PI / 16),
    width: 0.12,
    y: 29.2,
  });
  add("stone", new CylinderGeometry(1.62, 1.5, 0.24, 16), {
    position: [0, 29.48, 0],
  });
  registerOverhang(29.36, 1.66, 0.7);

  // --- Open bronze brazier (D2 — the lantern room dies; the brazier lives): -
  // foot, flared bowl with an inward-facing liner, and a dark ember bed whose
  // centre is exactly BEACON_Y (the flame/beam anchor).
  add("bronze", new CylinderGeometry(0.55, 0.82, 0.3, 12), {
    position: [0, 29.65, 0],
  });
  add("bronze", new CylinderGeometry(1.25, 0.55, 0.95, 12, 1, true), {
    position: [0, 30.275, 0],
  });
  add("bronze", mirrorGeometry(new CylinderGeometry(1.16, 0.48, 0.85, 12, 1, true)), {
    position: [0, 30.25, 0],
  });
  add("ember", new CylinderGeometry(1.02, 1.02, 0.16, 12), {
    position: [0, BEACON_Y, 0],
  });
  // Bronze rim moulding and four cardinal handles, so the bowl reads as cast
  // metal rather than a lathe primitive.
  add("bronze", new TorusGeometry(1.24, 0.07, 4, 12), {
    position: [0, 30.74, 0],
    rotation: [Math.PI / 2, 0, 0],
  });
  for (let index = 0; index < 4; index += 1) {
    const angle = index * Math.PI / 2 + Math.PI / 4;
    add("bronze", new TorusGeometry(0.17, 0.035, 4, 8, Math.PI), {
      position: [Math.sin(angle) * 1.3, 30.62, Math.cos(angle) * 1.3],
      rotation: [0, angle, 0],
    });
  }

  // --- W4.6 the bronze mirror dish ------------------------------------------
  // A polished concave dish on a gimbal behind the brazier, throwing the fire
  // seaward. Poster-art licence per D4/D6: it is the attested "mirror" given
  // real modelled form — a parabolic bowl, a rim torus, two trunnions and a
  // forked standard rooted on the drum cornice.
  const DISH_Y = 31.0;
  const DISH_Z = -1.75;
  const DISH_TILT = -0.3;
  // A sphere cap's front faces sit on its convex side, so the polished
  // concave face is drawn from a winding-reversed copy (the same trick the
  // brazier's bowl liner uses) and the cast back is a slightly larger shell
  // behind it. Without this the dish's working face is back-face culled and
  // the crown reads as a hole.
  const dishShell = () => {
    const cap = new SphereGeometry(1.0, 16, 5, 0, Math.PI * 2, 0, 0.72);
    cap.rotateX(-Math.PI / 2);
    return cap;
  };
  add("bronze", mirrorGeometry(dishShell()), {
    position: [0, DISH_Y, DISH_Z],
    rotation: [DISH_TILT, 0, 0],
  });
  add("darkBronze", dishShell(), {
    position: [0, DISH_Y, DISH_Z - 0.05],
    rotation: [DISH_TILT, 0, 0],
    scale: [1.06, 1.06, 1.06],
  });
  add("bronze", new TorusGeometry(0.66, 0.055, 4, 16), {
    position: [0, DISH_Y + 0.06, DISH_Z + 0.2],
    rotation: [DISH_TILT, 0, 0],
  });
  // Forked standard rooted on the drum cornice, raking back to the trunnions
  // the dish swings on — compact enough to stay inside the crown silhouette.
  add("darkBronze", new BoxGeometry(0.86, 0.14, 0.46), {
    position: [0, 29.56, -1.42],
  });
  add("darkBronze", new CylinderGeometry(0.085, 0.13, 1.2, 6), {
    position: [0, 30.12, -1.51],
    rotation: [-0.15, 0, 0],
  });
  for (const side of [-1, 1]) {
    add("darkBronze", new CylinderGeometry(0.055, 0.08, 0.95, 6), {
      position: [side * 0.3, 30.66, -1.66],
      rotation: [-0.1, 0, -side * 0.52],
    });
    add("bronze", new CylinderGeometry(0.06, 0.06, 0.24, 6), {
      position: [side * 0.55, DISH_Y + 0.02, DISH_Z + 0.05],
      rotation: [0, 0, Math.PI / 2],
    });
  }

  // --- Crowning Zeus Soter (D2, Roman-coin type) ----------------------------
  // W4.6: real modelled form. Moulded plinth, a draped robe built from six
  // lathed courses with vertical fold ribs, shoulders and a himation roll, a
  // radiate head, one arm outstretched to the sea (+Z) and one bearing the
  // sceptre whose tip is exactly SCEPTRE_TIP_Y.
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
    position: [-0.5, SCEPTRE_TIP_Y - 1.15, 0.1],
  });
  add("gilt", new SphereGeometry(0.1, 6, 4), { position: [-0.5, 33.87, 0.1] });
  add("gilt", new TorusGeometry(0.09, 0.022, 4, 8), {
    position: [-0.5, 33.62, 0.1],
    rotation: [Math.PI / 2, 0, 0],
  });

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
  if (y < 0.85) return 4.6;
  if (y < 1.7) return 4.2;
  if (y < TERRACE_TOP_Y) return 3.85;
  if (y <= SQUARE_TOP_Y) {
    return SQUARE_BASE_HALF
      + (SQUARE_TOP_HALF - SQUARE_BASE_HALF)
        * (y - TERRACE_TOP_Y) / (SQUARE_TOP_Y - TERRACE_TOP_Y);
  }
  if (y <= 18.15) return 3.0 + (2.4 - 3.0) * (y - SQUARE_TOP_Y) / (18.15 - SQUARE_TOP_Y);
  if (y <= 18.39) return 2.55;
  if (y <= OCT_TOP_Y) {
    const radius = OCT_BASE_RADIUS
      + (OCT_TOP_RADIUS - OCT_BASE_RADIUS)
        * (y - OCT_BASE_Y) / (OCT_TOP_Y - OCT_BASE_Y);
    return radius * OCT_FACE;
  }
  if (y <= CYL_TOP_Y) return CYL_RADIUS;
  return 1.3;
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

// Deterministic low-poly boulder: an icosahedron whose vertices are pushed
// along their own direction by a stable hash, so reruns are byte-identical.
// Welded first so the displaced mesh stays indexed like the other stone parts.
function displacedRock(radius, detail, jitter) {
  const geometry = mergeVertices(new IcosahedronGeometry(radius, detail));
  const position = geometry.getAttribute("position");
  const vertex = new Vector3();
  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    const push = 1 + (hash3(vertex.x, vertex.y, vertex.z) - 0.5) * jitter;
    vertex.multiplyScalar(push);
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Flattens anything below the base plane: rocks read seated on the terrace
// and the base-centre origin contract (bounds.min.y === 0) stays exact.
function seatOnGround(geometry) {
  const position = geometry.getAttribute("position");
  for (let index = 0; index < position.count; index += 1) {
    if (position.getY(index) < 0) position.setY(index, 0);
  }
  position.needsUpdate = true;
}

// Exact mirror across the x=0 plane (mirrored rock pairs keep the model's
// base-centre bounds symmetric). Negative x scale flips winding, so each
// triangle's winding is reversed to keep faces outward.
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
