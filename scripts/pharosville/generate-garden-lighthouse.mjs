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
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outputPath = resolve(
  repoRoot,
  "public/pharosville/models/garden-lighthouse-shell.glb",
);
const checkOnly = process.argv.includes("--check");

// Octagonal facets are the tower's identity; rotate so a flat face fronts +Z
// (door and windows sit on a face, not an edge).
const OCT = Math.PI / 8;

// Wet, weathered stone ramp painted per-vertex up the tower. Constructed from
// hex so three's ColorManagement lands them in linear space, matching how a
// material.color hex would render.
const STONE_WET = new Color("#586159");
const STONE_LOW = new Color("#b3ab93");
const STONE_HIGH = new Color("#e9e2cb");

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
      flatShading: true,
      name: "weathered-limestone",
      roughness: 0.9,
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
    ["copper", new MeshStandardMaterial({
      color: "#8a5a38",
      flatShading: true,
      metalness: 0.5,
      name: "copper-roof",
      roughness: 0.5,
    })],
    ["timber", new MeshStandardMaterial({
      color: "#43362b",
      flatShading: true,
      name: "weathered-timber",
      roughness: 0.95,
    })],
    ["glass", new MeshStandardMaterial({
      color: "#f4d9a0",
      flatShading: true,
      metalness: 0.05,
      name: "lantern-glazing",
      opacity: 0.42,
      roughness: 0.2,
      transparent: true,
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

  // Rooted, stepped foundation courses flaring into the terrain.
  oct("stone", 3.15, 3.5, 0.6, 0.3);
  oct("stone", 2.9, 3.15, 0.55, 0.875);
  oct("stone", 2.55, 2.9, 0.55, 1.425);

  // Tapered octagonal shaft with proud string courses at the joints.
  oct("stone", 2.12, 2.5, 4.6, 4.0);
  oct("stone", 2.34, 2.38, 0.2, 6.3);
  oct("stone", 1.76, 2.12, 4.6, 8.6);
  oct("stone", 1.98, 2.02, 0.2, 10.9);
  oct("stone", 1.5, 1.76, 3.4, 12.6);

  // Corbelled gallery: a flared cornice, projecting corbel blocks, deep floor.
  oct("stone", 2.16, 1.55, 0.55, 14.575);
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4;
    add("stone", new BoxGeometry(0.3, 0.45, 0.55), {
      position: [Math.sin(angle) * 1.72, 14.35, Math.cos(angle) * 1.72],
      rotation: [0, angle, 0],
    });
  }
  oct("stone", 2.28, 2.28, 0.32, 15.0);

  // Balcony railing: finer bronze posts and twin rails.
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4;
    add("bronze", new BoxGeometry(0.1, 0.82, 0.1), {
      position: [Math.sin(angle) * 2.08, 15.56, Math.cos(angle) * 2.08],
      rotation: [0, angle, 0],
    });
  }
  for (const y of [15.32, 15.92]) {
    add("bronze", new TorusGeometry(2.08, 0.05, 4, 8), {
      position: [0, y, 0],
      rotation: [Math.PI / 2, 0, 0],
    });
  }

  // Taller glazed lantern room with visible mullions and an inner warm lamp.
  oct("darkBronze", 1.34, 1.42, 0.28, 15.29);
  oct("glass", 1.16, 1.16, 2.1, 16.48, true);
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4 + OCT;
    add("darkBronze", new BoxGeometry(0.08, 2.12, 0.08), {
      position: [Math.sin(angle) * 1.18, 16.48, Math.cos(angle) * 1.18],
      rotation: [0, angle, 0],
    });
  }
  add("ember", new CylinderGeometry(0.5, 0.55, 1.5, 8), {
    position: [0, 16.3, 0],
    rotation: [0, OCT, 0],
  });
  oct("darkBronze", 1.34, 1.42, 0.24, 17.65);

  // Copper roof with dark finial.
  add("copper", new ConeGeometry(1.66, 1.4, 8), {
    position: [0, 18.47, 0],
    rotation: [0, OCT, 0],
  });
  add("darkBronze", new CylinderGeometry(0.09, 0.13, 0.42, 8), {
    position: [0, 19.38, 0],
  });
  add("darkBronze", new SphereGeometry(0.14, 8, 4), {
    position: [0, 19.66, 0],
  });

  // Arched timber door at the base, front face.
  add("timber", new BoxGeometry(0.82, 1.6, 0.22), {
    position: [0, 2.25, 2.36],
  });
  add("darkBronze", new TorusGeometry(0.42, 0.06, 4, 8, Math.PI), {
    position: [0, 3.0, 2.42],
    rotation: [Math.PI / 2, 0, 0],
  });

  // Small deep-set windows with warm emissive glazing.
  for (const [width, tall, x, y, z, angle] of [
    [0.34, 0.6, 0, 8.6, 1.8, 0],
    [0.34, 0.6, 1.88, 6.9, 0, Math.PI / 2],
    [0.32, 0.56, -1.7, 10.2, 0, Math.PI / 2],
    [0.3, 0.5, 0, 12.3, 1.54, 0],
  ]) {
    add("ember", new BoxGeometry(width, tall, 0.14), {
      position: [x, y, z],
      rotation: [0, angle, 0],
    });
  }

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
    mesh.receiveShadow = materialName !== "glass" && materialName !== "ember";
    root.add(mesh);
  }

  addAnchor(root, "anchor-beacon", [0, 16.48, 0], "beacon");
  addAnchor(root, "anchor-beam", [0, 16.48, 0], "beam");
  addAnchor(root, "anchor-label", [0, 20.2, 0], "label");
  addAnchor(root, "anchor-selection", [0, 9.9, 0], "selection");

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
    const climb = smoothstep(1.8, 11.0, y);
    base.copy(STONE_LOW).lerp(STONE_HIGH, climb);
    const wet = smoothstep(2.6, 0.0, y);
    base.lerp(STONE_WET, wet * 0.7);
    const jitter = (hash3(x, y, z) - 0.5) * 0.08;
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
