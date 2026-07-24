import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Box3,
  BoxGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Scene,
  Shape,
  ShapeGeometry,
  Vector3,
} from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelsDir = resolve(repoRoot, "public/pharosville/models");
const checkOnly = process.argv.includes("--check");

// Waterline sits at y=0: keels dip below, superstructure rises above. Wood is a
// 3-tone ramp painted per-vertex (dark wet waterline -> mid flank -> warm
// gunwale), with a flat warm "trim" tone forced onto rails and the figurehead.
const WOOD_LOW = new Color("#33261b");
const WOOD_MID = new Color("#6a4f34");
const WOOD_HIGH = new Color("#a97e49");
const WOOD_TRIM = new Color("#caa25e");
const SAIL_LOW = new Color("#b7a988");
const SAIL_HIGH = new Color("#e9dec6");
const SAIL_FURLED = new Color("#9c8f70");

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
 * Monumental three-master: broad beam, curved sheer, a raised stern castle with
 * warm gallery windows, a figurehead at the bow, three masts carrying a mix of
 * furled and set canvas (the main square sail slot is left open for the
 * procedural identity sail), and lantern anchors at bow / stern / masthead.
 */
function buildTitan() {
  const builder = createBuilder("garden-hero-titan");
  const { add } = builder;

  // Broad, full hull with a long run to a raised bow.
  addHull(add, [
    [-4.7, -1.9], [-4.9, 1.9], [-1.0, 2.15], [2.4, 1.95],
    [5.0, 0.95], [5.85, 0], [5.0, -0.95], [2.4, -1.95], [-1.0, -2.15],
  ], 1.55, 0.9);

  // Curved sheer deck cap and a proud gunwale rail strip (trim tone).
  addDeck(add, [
    [-4.45, -1.6], [-4.6, 1.6], [-1.0, 1.85], [2.35, 1.66],
    [4.72, 0.8], [5.5, 0], [4.72, -0.8], [2.35, -1.66], [-1.0, -1.85],
  ], 1.66, 0.62);
  for (const side of [-1, 1]) {
    add("wood", new BoxGeometry(9.2, 0.34, 0.22), {
      position: [0.2, 1.78, side * 1.86],
      tone: WOOD_TRIM,
    });
  }

  // Raised stern castle stepping up over the quarterdeck, with a gallery.
  add("wood", new BoxGeometry(2.7, 1.55, 3.15), { position: [-3.55, 2.42, 0] });
  add("wood", new BoxGeometry(2.15, 1.15, 2.75), { position: [-3.75, 3.55, 0] });
  add("wood", new BoxGeometry(2.45, 0.22, 3.35), {
    position: [-3.6, 4.16, 0],
    tone: WOOD_TRIM,
  });
  // Stern gallery windows (warm emissive) wrapping the transom face.
  for (const z of [-0.82, -0.27, 0.27, 0.82]) {
    add("glow", new BoxGeometry(0.16, 0.62, 0.38), { position: [-4.68, 2.6, z] });
  }
  for (const z of [-0.6, 0, 0.6]) {
    add("glow", new BoxGeometry(0.16, 0.46, 0.34), { position: [-4.85, 3.5, z] });
  }

  // Figurehead suggestion: a raised prow beak with a warm-trim crest.
  add("wood", new BoxGeometry(1.5, 0.5, 0.5), {
    position: [5.35, 1.35, 0],
    rotation: [0, 0, 0.32],
  });
  add("wood", new BoxGeometry(0.7, 0.62, 0.34), {
    position: [5.95, 1.5, 0],
    tone: WOOD_TRIM,
  });

  // Bowsprit reaching past the figurehead.
  add("spar", new CylinderGeometry(0.09, 0.12, 3.0, 6), {
    position: [6.15, 2.05, 0],
    rotation: [0, 0, Math.PI / 2 - 0.32],
  });

  // Three masts. Main (center) carries only a furled topsail yard so the
  // procedural identity (logo) sail becomes the grand main course; fore and
  // mizzen carry set canvas for the furled+set mix.
  addMast(add, 1.4, 6.9, 0.34);
  addSail(add, 1.4, 6.05, 2.4, 0.55, "furled", 1);

  addMast(add, 3.15, 5.6, 0.3);
  addSail(add, 3.15, 3.85, 1.85, 1.55, "square", 1);
  addSail(add, 3.15, 5.05, 1.9, 0.45, "furled", 1);

  addMast(add, -2.15, 5.9, 0.3);
  addSail(add, -2.15, 4.0, 2.0, 1.5, "fore-aft", -1);

  // Banner at the main masthead (trim tone, gentle vertex wave).
  addBanner(add, 1.4, 6.7, 1.15, 0.62);

  builder.addAnchor("anchor-lantern-stern", [-3.85, 4.4, 0], "lantern-stern");
  builder.addAnchor("anchor-lantern-bow", [4.7, 2.35, 0], "lantern-bow");
  builder.addAnchor("anchor-masthead", [1.4, 6.6, 0], "masthead");
  builder.addAnchor("anchor-selection", [0, 2.4, 0], "selection");
  builder.addAnchor("anchor-label", [0, 8.4, 0], "label");

  return builder.finalize({ assertZSymmetric: true });
}

/**
 * Elegant classic two-master: lower and leaner than the titan, refined warm
 * trim, a modest quarterdeck cabin, no towering castle. Reads distinguished
 * rather than monumental.
 */
function buildHeritage() {
  const builder = createBuilder("garden-hero-heritage");
  const { add } = builder;

  addHull(add, [
    [-4.1, -1.25], [-4.25, 1.25], [-0.8, 1.42], [2.35, 1.28],
    [4.35, 0.62], [5.05, 0], [4.35, -0.62], [2.35, -1.28], [-0.8, -1.42],
  ], 1.28, 0.72);

  addDeck(add, [
    [-3.9, -1.02], [-4.0, 1.02], [-0.8, 1.18], [2.3, 1.06],
    [4.1, 0.5], [4.75, 0], [4.1, -0.5], [2.3, -1.06], [-0.8, -1.18],
  ], 1.28, 0.5);
  for (const side of [-1, 1]) {
    add("wood", new BoxGeometry(8.1, 0.26, 0.18), {
      position: [0.15, 1.36, side * 1.18],
      tone: WOOD_TRIM,
    });
  }

  // Low quarterdeck cabin with a single lit gallery band.
  add("wood", new BoxGeometry(2.1, 0.82, 2.05), { position: [-3.0, 1.72, 0] });
  add("wood", new BoxGeometry(2.35, 0.16, 2.28), {
    position: [-3.05, 2.16, 0],
    tone: WOOD_TRIM,
  });
  for (const z of [-0.55, 0, 0.55]) {
    add("glow", new BoxGeometry(0.14, 0.4, 0.3), { position: [-4.03, 1.78, z] });
  }

  // Refined raked cutwater at the bow (no figurehead — elegance over spectacle).
  add("wood", new BoxGeometry(1.15, 0.42, 0.34), {
    position: [4.75, 1.05, 0],
    rotation: [0, 0, 0.3],
    tone: WOOD_TRIM,
  });
  add("spar", new CylinderGeometry(0.07, 0.1, 2.4, 6), {
    position: [5.35, 1.55, 0],
    rotation: [0, 0, Math.PI / 2 - 0.28],
  });

  // Two masts. Main carries a furled topsail yard (the procedural identity sail
  // becomes the main course); the fore mast sets a fore-aft sail.
  addMast(add, 0.7, 5.5, 0.28);
  addSail(add, 0.7, 4.75, 2.0, 0.42, "furled", 1);

  addMast(add, -1.75, 4.7, 0.26);
  addSail(add, -1.75, 3.15, 1.65, 1.3, "fore-aft", -1);

  addBanner(add, 0.7, 5.3, 0.95, 0.5);

  builder.addAnchor("anchor-lantern-stern", [-3.1, 2.4, 0], "lantern-stern");
  builder.addAnchor("anchor-lantern-bow", [4.0, 1.5, 0], "lantern-bow");
  builder.addAnchor("anchor-masthead", [0.7, 5.2, 0], "masthead");
  builder.addAnchor("anchor-selection", [0, 1.7, 0], "selection");
  builder.addAnchor("anchor-label", [0, 6.6, 0], "label");

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
    ["wood", new MeshStandardMaterial({
      color: "#ffffff",
      flatShading: true,
      name: "hero-wood",
      roughness: 0.84,
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
    // ExtrudeGeometry is non-indexed while the primitives are indexed; merging a
    // mix throws, so normalise every part to non-indexed first.
    geometryByMaterial.get(materialName).push(
      geometry.index === null ? geometry : geometry.toNonIndexed(),
    );
  };

  return {
    add,
    addAnchor(name, position, role) {
      addAnchor(root, name, position, role);
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

function addHull(add, points, depth, keelDrop) {
  const shape = new Shape();
  const [first, ...rest] = points;
  shape.moveTo(first[0], first[1]);
  for (const [x, z] of rest) shape.lineTo(x, z);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.16,
    bevelThickness: 0.16,
    depth,
    steps: 1,
  });
  // Extrude runs along +Z; stand it up so the deck faces +Y and the keel drops.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, depth / 2 - keelDrop, 0);
  add("wood", geometry);
}

function addDeck(add, points, scaleWidthAt, sheer) {
  const shape = new Shape();
  const [first, ...rest] = points;
  shape.moveTo(first[0], first[1]);
  for (const [x, z] of rest) shape.lineTo(x, z);
  shape.closePath();
  const geometry = new ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position");
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const maxX = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), 0.001);
  for (let index = 0; index < position.count; index += 1) {
    const nx = position.getX(index) / maxX;
    // Curved sheer: deck rises fore and aft, bow (+x) lifted slightly more.
    position.setY(index, sheer * nx * nx * (nx > 0 ? 1.12 : 1));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  add("wood", geometry, { position: [0, scaleWidthAt, 0] });
}

function addMast(add, x, height, baseY) {
  add("spar", new CylinderGeometry(0.08, 0.13, height, 6), {
    position: [x, baseY + height / 2, 0],
  });
}

/**
 * Set square/fore-aft canvas or a furled bundle. Set sails are curved planes
 * (billow via z displacement); furled sails are a slim bundled cylinder along
 * the yard. Yards are added as dark spars either way.
 */
function addSail(add, mastX, centerY, width, height, kind, facing) {
  if (kind === "furled") {
    add("spar", new BoxGeometry(width * 2.05, 0.11, 0.11), {
      position: [mastX, centerY, 0],
    });
    add("sail", new CylinderGeometry(0.16, 0.16, width * 1.9, 6), {
      furled: true,
      position: [mastX, centerY - 0.04, 0],
      rotation: [0, 0, Math.PI / 2],
    });
    return;
  }
  // Yard across the top of the sail.
  add("spar", new BoxGeometry(width * 2.1, 0.1, 0.1), {
    position: [mastX, centerY + height / 2, 0],
  });
  const geometry = new PlaneGeometry(width, height, 4, 4);
  const position = geometry.getAttribute("position");
  const halfW = width / 2;
  for (let index = 0; index < position.count; index += 1) {
    const u = (position.getX(index) + halfW) / width;
    const v = position.getY(index) / height + 0.5;
    // Billow bows the canvas out toward +z, fullest mid-luff.
    const billow = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.32;
    position.setZ(index, billow);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  const isForeAft = kind === "fore-aft";
  add("sail", geometry, {
    position: [mastX + facing * (isForeAft ? halfW * 0.9 : 0), centerY, 0.02],
    rotation: isForeAft ? [0, -facing * 0.32, 0] : [0, 0, 0],
  });
}

function addBanner(add, mastX, y, length, drop) {
  const geometry = new PlaneGeometry(length, drop, 4, 1);
  const position = geometry.getAttribute("position");
  const half = length / 2;
  for (let index = 0; index < position.count; index += 1) {
    const u = (position.getX(index) + half) / length;
    // A gentle streaming wave frozen into the cloth.
    position.setZ(index, Math.sin(u * Math.PI * 2) * 0.14 * u);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  add("wood", geometry, {
    position: [mastX + half + 0.12, y, 0],
    tone: WOOD_TRIM,
  });
}

function paintWood(geometry, tone) {
  const position = geometry.getAttribute("position");
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
      const climb = smoothstep(-0.2, 2.4, y);
      base.copy(WOOD_LOW).lerp(WOOD_MID, smoothstep(-0.4, 0.9, y));
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
