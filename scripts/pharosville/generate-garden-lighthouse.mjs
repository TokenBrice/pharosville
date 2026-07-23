import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Box3,
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
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
    ["limestone", new MeshStandardMaterial({
      color: "#c8c2aa",
      flatShading: true,
      name: "weathered-limestone",
      roughness: 0.92,
    })],
    ["lightStone", new MeshStandardMaterial({
      color: "#ded7bf",
      flatShading: true,
      name: "sunlit-limestone",
      roughness: 0.88,
    })],
    ["wetStone", new MeshStandardMaterial({
      color: "#65716a",
      flatShading: true,
      name: "wet-waterline-stone",
      roughness: 1,
    })],
    ["bronze", new MeshStandardMaterial({
      color: "#4e6f65",
      flatShading: true,
      metalness: 0.55,
      name: "oxidized-bronze",
      roughness: 0.58,
    })],
    ["darkBronze", new MeshStandardMaterial({
      color: "#243c3a",
      flatShading: true,
      metalness: 0.62,
      name: "dark-bronze-frame",
      roughness: 0.5,
    })],
    ["timber", new MeshStandardMaterial({
      color: "#493b31",
      flatShading: true,
      name: "weathered-timber",
      roughness: 0.94,
    })],
    ["glass", new MeshStandardMaterial({
      color: "#d8eee3",
      flatShading: true,
      metalness: 0.06,
      name: "lantern-glazing",
      opacity: 0.3,
      roughness: 0.24,
      transparent: true,
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
    geometryByMaterial.get(materialName).push(geometry);
  };

  add("wetStone", new CylinderGeometry(2.5, 2.7, 0.7, 8), {
    position: [0, 0.35, 0],
  });
  add("limestone", new CylinderGeometry(2.15, 2.42, 4.45, 8), {
    position: [0, 2.825, 0],
  });
  add("lightStone", new CylinderGeometry(2.25, 2.35, 0.24, 8), {
    position: [0, 4.98, 0],
  });
  add("limestone", new CylinderGeometry(1.8, 2.13, 4.45, 8), {
    position: [0, 7.225, 0],
  });
  add("lightStone", new CylinderGeometry(1.91, 2.01, 0.24, 8), {
    position: [0, 9.4, 0],
  });
  add("limestone", new CylinderGeometry(1.44, 1.79, 3.82, 8), {
    position: [0, 11.33, 0],
  });

  for (const y of [2.15, 6.35, 10.55]) {
    add("lightStone", new CylinderGeometry(
      2.28 - y * 0.065,
      2.31 - y * 0.065,
      0.12,
      8,
    ), { position: [0, y, 0] });
  }

  add("timber", new BoxGeometry(0.78, 1.42, 0.18), {
    position: [0, 1.41, 2.28],
  });
  add("darkBronze", new TorusGeometry(0.4, 0.055, 4, 8, Math.PI), {
    position: [0, 2.1, 2.38],
    rotation: [Math.PI / 2, 0, 0],
  });

  for (const [y, radius] of [[6.6, 1.99], [10.65, 1.63]]) {
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      add("darkBronze", new BoxGeometry(0.36, 0.78, 0.1), {
        position: [
          Math.sin(angle) * radius,
          y,
          Math.cos(angle) * radius,
        ],
        rotation: [0, angle, 0],
      });
    }
  }

  add("bronze", new CylinderGeometry(1.94, 1.94, 0.28, 8), {
    position: [0, 13.34, 0],
  });
  add("lightStone", new CylinderGeometry(1.45, 1.5, 0.3, 8), {
    position: [0, 13.49, 0],
  });

  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4;
    add("bronze", new BoxGeometry(0.09, 0.82, 0.09), {
      position: [
        Math.sin(angle) * 1.68,
        13.86,
        Math.cos(angle) * 1.68,
      ],
      rotation: [0, angle, 0],
    });
  }
  for (const y of [13.51, 14.2]) {
    add("bronze", new TorusGeometry(1.68, 0.055, 4, 8), {
      position: [0, y, 0],
      rotation: [Math.PI / 2, 0, 0],
    });
  }

  add("darkBronze", new CylinderGeometry(1.13, 1.13, 0.22, 8), {
    position: [0, 13.8, 0],
  });
  add("glass", new CylinderGeometry(1.03, 1.03, 1.65, 8, 1, true), {
    position: [0, 14.72, 0],
  });
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4;
    add("darkBronze", new BoxGeometry(0.075, 1.72, 0.075), {
      position: [
        Math.sin(angle) * 1.04,
        14.72,
        Math.cos(angle) * 1.04,
      ],
      rotation: [0, angle, 0],
    });
  }
  add("darkBronze", new CylinderGeometry(1.13, 1.13, 0.2, 8), {
    position: [0, 15.62, 0],
  });
  add("bronze", new ConeGeometry(1.52, 1.25, 8), {
    position: [0, 16.285, 0],
  });
  add("darkBronze", new CylinderGeometry(0.09, 0.12, 0.4, 8), {
    position: [0, 17.07, 0],
  });
  add("darkBronze", new SphereGeometry(0.12, 8, 4), {
    position: [0, 17.18, 0],
    scale: [1, 1, 1],
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
    mesh.receiveShadow = materialName !== "glass";
    root.add(mesh);
  }

  addAnchor(root, "anchor-beacon", [0, 14.72, 0], "beacon");
  addAnchor(root, "anchor-beam", [0, 14.72, 0], "beam");
  addAnchor(root, "anchor-label", [0, 17.75, 0], "label");
  addAnchor(root, "anchor-selection", [0, 8.65, 0], "selection");

  root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(root);
  const size = bounds.getSize(new Vector3());
  const dimensions = {
    x: round(size.x),
    y: round(size.y),
    z: round(size.z),
  };
  if (
    Math.abs(bounds.min.x + 2.7) > 0.001
    || Math.abs(bounds.min.y) > 0.001
    || Math.abs(bounds.min.z + 2.7) > 0.001
    || Math.abs(dimensions.y - 17.3) > 0.001
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
