import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Box3,
  BoxGeometry,
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

// Wet, weathered stone ramp painted per-vertex up the tower (L2): wet-dark
// base rock → pale-warm crown that catches the ukiyo-e day key sun (L4).
// Constructed from hex so three's ColorManagement lands them in linear space,
// matching how a material.color hex would render.
const STONE_WET = new Color("#46524b");
const STONE_LOW = new Color("#c4b494");
const STONE_HIGH = new Color("#f7edca");

// L1 silhouette contract (Pharos Wonder 2026-07-24, decision D1 — supersedes
// D-L1's 30-unit "epic, not bigger" call): the attested three-tier Pharos of
// Alexandria, 34 units to the sceptre tip. Battered square tier (white-marble
// ramp) → octagonal drum with corbel table and Triton corner finials → short
// cylindrical drum → open bronze brazier (beacon) → bronze-gilt Zeus Soter
// statue. Anchors match GARDEN_LIGHTHOUSE_BEACON_Y / _HEIGHT exactly.
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
    if (materialName === "stone") paintStone(geometry);
    geometryByMaterial.get(materialName).push(geometry);
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
  // flat face fronting +Z; stacked open sections give the vertex-colour ramp
  // enough rows to grade from wet base to pale crown.
  const squareHalf = (y) => SQUARE_BASE_HALF
    + (SQUARE_TOP_HALF - SQUARE_BASE_HALF)
      * (y - TERRACE_TOP_Y) / (SQUARE_TOP_Y - TERRACE_TOP_Y);
  const sqr = (materialName, y0, y1) =>
    add(materialName, new CylinderGeometry(
      squareHalf(y1) * SQRT2,
      squareHalf(y0) * SQRT2,
      y1 - y0,
      4,
      1,
      true,
    ), { position: [0, (y0 + y1) / 2, 0], rotation: [0, SQ, 0] });

  // Slight entasis on the octagonal drum (Thiersch's second tier).
  const octRadius = (y) => OCT_BASE_RADIUS
    + (OCT_TOP_RADIUS - OCT_BASE_RADIUS)
      * (y - OCT_BASE_Y) / (OCT_TOP_Y - OCT_BASE_Y);

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

  // --- Grand square terrace: three box steps up to the tower plinth. --------
  add("stone", new BoxGeometry(9.2, 0.85, 9.2), { position: [0, 0.425, 0] });
  add("stone", new BoxGeometry(8.4, 0.85, 8.4), { position: [0, 1.275, 0] });
  add("stone", new BoxGeometry(7.7, 0.8, 7.7), { position: [0, 2.1, 0] });

  // --- Square tier (y 2.5 → 17.5), ~44% of the height — the Pharos mass. ----
  sqr("stone", TERRACE_TOP_Y, 8);
  sqr("stone", 8, 13);
  sqr("stone", 13, SQUARE_TOP_Y);

  // --- Slit windows with stone hoods (the coin dots): a vertical rhythm of --
  // scale cues up the tiers. Mirrored side pair keeps the x-symmetry contract.
  const windowSlot = (x, y, z, angle) => {
    add("ember", new BoxGeometry(0.26, 0.52, 0.1), {
      position: [x, y, z],
      rotation: [0, angle, 0],
    });
    add("stone", new BoxGeometry(0.38, 0.1, 0.16), {
      position: [
        x + Math.sin(angle) * 0.02,
        y + 0.34,
        z + Math.cos(angle) * 0.02,
      ],
      rotation: [0, angle, 0],
    });
  };
  windowSlot(-1.4, 11.2, squareHalf(11.2) + 0.03, 0);
  windowSlot(1.5, 5.4, squareHalf(5.4) + 0.03, 0);
  const sideSlotFace = squareHalf(9.6) + 0.03;
  windowSlot(sideSlotFace, 9.6, 0, Math.PI / 2);
  windowSlot(-sideSlotFace, 9.6, 0, -Math.PI / 2);
  windowSlot(-0.9, 14.8, -(squareHalf(14.8) + 0.03), Math.PI);
  windowSlot(0, 21, octRadius(21) * OCT_FACE + 0.03, 0);
  windowSlot(0, 24.2, octRadius(24.2) * OCT_FACE + 0.03, 0);

  // --- Elevated pylon doorway (~y 8, storm-raised per the coins) with an ----
  // arcaded approach ramp climbing the seaward face — the fuel-hauling route
  // al-Balawi described. Egyptian-pylon flavour: tapered jambs, proud lintel.
  add("stone", new BoxGeometry(1.5, 0.22, 0.95), {
    position: [0.55, 7.82, squareHalf(7.82) + 0.32],
  });
  add("timber", new BoxGeometry(0.95, 1.55, 0.14), {
    position: [0.55, 8.6, squareHalf(8.6) + 0.02],
  });
  for (const side of [-1, 1]) {
    add("darkBronze", new BoxGeometry(0.18, 1.8, 0.22), {
      position: [0.55 + side * 0.62, 8.6, squareHalf(8.6) + 0.06],
      rotation: [0, 0, -side * 0.055],
    });
  }
  add("darkBronze", new BoxGeometry(1.62, 0.34, 0.26), {
    position: [0.55, 9.6, squareHalf(9.6) + 0.04],
  });
  const rampAngle = Math.atan2(5.04, 3.2);
  add("stone", new BoxGeometry(6.0, 0.18, 0.95), {
    position: [-1.7, 5.14, 3.6],
    rotation: [0, 0, rampAngle],
  });
  add("stone", new BoxGeometry(6.0, 0.28, 0.08), {
    position: [-1.7, 5.35, 4.03],
    rotation: [0, 0, rampAngle],
  });
  // Arch piers from the terrace to the ramp underside — the arcade rhythm.
  for (const x of [-2.55, -1.7, -0.85]) {
    const underside = 5.14 + (x + 1.7) * Math.tan(rampAngle) - 0.09;
    add("stone", new BoxGeometry(0.3, underside - TERRACE_TOP_Y, 0.3), {
      position: [x, (TERRACE_TOP_Y + underside) / 2, 3.6],
    });
  }

  // --- Dedication band (ΘΕΟΙΣ ΣΩΤΗΡΣΙΝ) on the seaward face: an abstract ----
  // bronze glyph strip — small gilt bars suggesting Greek letterforms, NOT a
  // font asset. 13 glyphs for the 13 letters of the attested inscription.
  add("darkBronze", new BoxGeometry(4.6, 0.72, 0.14), {
    position: [0, 13.35, squareHalf(13.35) + 0.03],
  });
  for (let index = 0; index < 13; index += 1) {
    const x = -1.8 + index * 0.3;
    const z = squareHalf(13.35) + 0.09;
    add("gilt", new BoxGeometry(0.15, 0.4, 0.07), {
      position: [x, 13.35, z],
    });
    const variant = index % 3;
    const barY = variant === 0 ? 13.47 : variant === 1 ? 13.52 : 13.18;
    add("gilt", new BoxGeometry(variant === 1 ? 0.15 : 0.3, 0.09, 0.07), {
      position: [x, barY, z],
    });
  }

  // --- Corbel table at the octagon's base: corbels, flared ring, slab. ------
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4 + OCT;
    add("stone", new BoxGeometry(0.32, 0.5, 0.62), {
      position: [Math.sin(angle) * 2.62, 17.72, Math.cos(angle) * 2.62],
      rotation: [0, angle, 0],
    });
  }
  add("stone", new CylinderGeometry(2.4, 3.0, 0.65, 8, 1, true), {
    position: [0, 17.825, 0],
    rotation: [0, OCT, 0],
  });
  add("stone", new CylinderGeometry(2.55, 2.55, 0.24, 8), {
    position: [0, 18.27, 0],
    rotation: [0, OCT, 0],
  });

  // --- Four Triton corner finials (the coins' most diagnostic detail): ------
  // stylized conch-blowers standing on the square tier's top corners — tapered
  // body, curled tail, raised conch. Each merged cluster stays under 120 tris.
  const triton = (x, z) => {
    const body = new CylinderGeometry(0.13, 0.2, 0.75, 5);
    body.translate(0, 0.55, 0);
    const tail = new TorusGeometry(0.2, 0.07, 4, 6, Math.PI * 0.9);
    tail.rotateY(Math.PI / 2);
    tail.translate(0, 0.28, -0.18);
    const head = mergeVertices(new IcosahedronGeometry(0.13, 0));
    head.translate(0, 1.05, 0.02);
    const conch = new ConeGeometry(0.085, 0.34, 5);
    conch.rotateX(-0.9);
    conch.translate(0, 1.02, 0.28);
    const arm = new BoxGeometry(0.07, 0.3, 0.07);
    arm.rotateX(0.7);
    arm.translate(0.12, 0.85, 0.15);
    const cluster = mergeGeometries([body, tail, head, conch, arm], false);
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
  oct("stone", octRadius(22), octRadius(OCT_BASE_Y), 4.5, 19.75, true);
  oct("stone", octRadius(OCT_TOP_Y), octRadius(22), 4, 24, true);

  // --- Short cylindrical drum (y 26 → 29.5) with a base ring. ---------------
  add("stone", new CylinderGeometry(1.5, 1.5, 0.28, 16), {
    position: [0, 26.14, 0],
  });
  add("stone", new CylinderGeometry(CYL_RADIUS, CYL_RADIUS, CYL_TOP_Y - OCT_TOP_Y, 16), {
    position: [0, (OCT_TOP_Y + CYL_TOP_Y) / 2, 0],
  });

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

  // --- Crowning Zeus Soter (D2, Roman-coin type): robed body, long vertical -
  // sceptre in one hand, the other arm outstretched toward the sea (+Z).
  // Deliberately oversized per the coin convention; sceptre tip = HEIGHT.
  add("gilt", new CylinderGeometry(0.34, 0.45, 0.5, 8), {
    position: [0, 30.15, 0],
  });
  add("gilt", new CylinderGeometry(0.3, 0.52, 2.0, 8), {
    position: [0, 31.4, 0],
  });
  add("gilt", new CylinderGeometry(0.34, 0.3, 0.55, 8), {
    position: [0, 32.675, 0],
  });
  add("gilt", new SphereGeometry(0.23, 8, 6), {
    position: [0, 33.22, 0],
  });
  add("gilt", new CylinderGeometry(0.05, 0.05, 2.3, 6), {
    position: [-0.5, 32.85, 0.1],
  });
  add("gilt", new SphereGeometry(0.1, 6, 4), {
    position: [-0.5, 33.87, 0.1],
  });
  add("gilt", new BoxGeometry(0.16, 0.16, 1.05), {
    position: [0.18, 32.78, 0.6],
  });
  add("gilt", new BoxGeometry(0.52, 0.14, 0.14), {
    position: [-0.32, 32.72, 0.08],
  });

  let triangles = 0;
  let vertices = 0;
  for (const [materialName, geometries] of geometryByMaterial) {
    if (geometries.length === 0) continue;
    const geometry = mergeGeometries(geometries, false);
    if (geometry === null) {
      throw new Error(`Could not merge ${materialName} lighthouse geometry.`);
    }
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
    mesh.receiveShadow = materialName !== "ember";
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
    colors[index * 3] = clamp01(base.r + jitter);
    colors[index * 3 + 1] = clamp01(base.g + jitter);
    colors[index * 3 + 2] = clamp01(base.b + jitter);
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
