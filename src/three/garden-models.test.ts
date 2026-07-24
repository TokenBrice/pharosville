import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it, vi } from "vitest";
import {
  createGardenModelLibrary,
  GARDEN_MODEL_MANIFEST,
  gardenModelAnchor,
  type GardenModelSourceLoader,
  validateGardenModelMetadata,
} from "./garden-models";

const metadata = GARDEN_MODEL_MANIFEST["garden-lighthouse-shell"];
const assetPath = resolve(
  process.cwd(),
  `public${metadata.artifact.url.split("?")[0]}`,
);

describe("garden model manifest", () => {
  it("matches the raw GLB header, budget, hash, and inventory", () => {
    const bytes = readFileSync(assetPath);
    const json = readGlbJson(bytes);

    expect(bytes.toString("ascii", 0, 4)).toBe("glTF");
    expect(bytes.readUInt32LE(4)).toBe(2);
    expect(bytes.readUInt32LE(8)).toBe(bytes.byteLength);
    expect(bytes.byteLength).toBe(metadata.artifact.bytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      metadata.artifact.sha256,
    );
    expect(validateGardenModelMetadata(metadata)).toEqual([]);
    expect(json.asset.version).toBe("2.0");
    expect(json.meshes).toHaveLength(metadata.geometry.drawCalls);
    expect(json.materials).toHaveLength(metadata.geometry.materials);
    expect(json.textures).toBeUndefined();
    expect(json.images).toBeUndefined();
  });

  it("records every integration anchor as a named GLB node", () => {
    const json = readGlbJson(readFileSync(assetPath));
    const nodeNames = new Set(json.nodes?.map(({ name }) => name));

    for (const anchor of Object.values(metadata.anchors)) {
      expect(nodeNames).toContain(anchor.node);
    }
    expect(metadata.origin).toMatchObject({
      convention: "base-center",
      position: [0, 0, 0],
      upAxis: "+Y",
    });
    expect(metadata.dimensions.y).toBeCloseTo(19.8);
    expect(metadata.lod.strategy).toBe("single");
    expect(metadata.artifact.compression).toBe("none");
  });

  it("loads at the recorded scale with its base on y=0", async () => {
    const bytes = readFileSync(assetPath);
    const arrayBuffer = new Uint8Array(bytes).buffer;
    const gltf = await new GLTFLoader().parseAsync(arrayBuffer, "");
    const model = gltf.scene.getObjectByName(metadata.id);
    if (model === undefined) throw new Error("Lighthouse root node missing.");

    const bounds = new Box3().setFromObject(model);
    const size = bounds.getSize(new Vector3());

    expect(bounds.min.y).toBeCloseTo(0, 5);
    expect(size.x).toBeCloseTo(metadata.dimensions.x, 3);
    expect(size.y).toBeCloseTo(metadata.dimensions.y, 3);
    expect(size.z).toBeCloseTo(metadata.dimensions.z, 3);
    for (const [id, anchor] of Object.entries(metadata.anchors)) {
      expect(gardenModelAnchor(
        model,
        metadata.id,
        id as keyof typeof metadata.anchors,
      ).position.toArray()).toEqual(anchor.position);
    }
  });
});

describe("createGardenModelLibrary", () => {
  it("loads once and returns independent clones with shared mesh resources", async () => {
    const source = fixtureScene();
    const loadAsync = vi.fn(async () => ({ scene: source }));
    const library = createGardenModelLibrary({ loadAsync });

    const firstLoad = library.load("garden-lighthouse-shell");
    const secondLoad = library.load("garden-lighthouse-shell");
    const [canonical, repeated] = await Promise.all([firstLoad, secondLoad]);
    const firstClone = await library.clone("garden-lighthouse-shell");
    const secondClone = await library.clone("garden-lighthouse-shell");

    expect(loadAsync).toHaveBeenCalledTimes(1);
    expect(loadAsync).toHaveBeenCalledWith(metadata.artifact.url);
    expect(canonical).toBe(repeated);
    expect(firstClone).not.toBe(canonical);
    expect(secondClone).not.toBe(firstClone);
    expect(mesh(firstClone).geometry).toBe(mesh(secondClone).geometry);
    expect(mesh(firstClone).material).toBe(mesh(secondClone).material);
    expect(gardenModelAnchor(
      firstClone,
      "garden-lighthouse-shell",
      "beacon",
    )).not.toBe(gardenModelAnchor(
      secondClone,
      "garden-lighthouse-shell",
      "beacon",
    ));
  });

  it("evicts a failed request so the next load can retry", async () => {
    const source = fixtureScene();
    const loadAsync = vi.fn<GardenModelSourceLoader["loadAsync"]>()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ scene: source });
    const library = createGardenModelLibrary({ loadAsync });

    await expect(library.load("garden-lighthouse-shell")).rejects.toThrow(
      "temporary failure",
    );
    await expect(library.load("garden-lighthouse-shell")).resolves.toBe(source);
    expect(loadAsync).toHaveBeenCalledTimes(2);
  });
});

interface GlbJson {
  asset: { version: string };
  images?: unknown[];
  materials?: unknown[];
  meshes?: unknown[];
  nodes?: { name?: string }[];
  textures?: unknown[];
}

function readGlbJson(bytes: Buffer): GlbJson {
  expect(bytes.toString("ascii", 16, 20)).toBe("JSON");
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(
    bytes.toString("utf8", 20, 20 + jsonLength).trim(),
  ) as GlbJson;
}

function fixtureScene(): Group {
  const root = new Group();
  root.name = "garden-lighthouse-shell";
  root.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
  for (const anchor of Object.values(metadata.anchors)) {
    const object = new Object3D();
    object.name = anchor.node;
    object.position.fromArray(anchor.position);
    root.add(object);
  }
  return root;
}

function mesh(root: Group): Mesh {
  const found = root.children.find((child): child is Mesh => child instanceof Mesh);
  if (found === undefined) throw new Error("Fixture mesh missing.");
  return found;
}
