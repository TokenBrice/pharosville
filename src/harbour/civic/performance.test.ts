import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetStore } from "../engine/assets";
import { mergeStaticMeshes } from "../engine/static-merge";
import type { HarbourMaterials } from "../world/materials";
import { mergeStatic } from "./assemble";
import { Workers } from "./workers";

afterEach(() => vi.unstubAllGlobals());

describe("engine-lifetime static JSON", () => {
  it("shares the same fetch, parse, promise and value between prefetch and consumers", async () => {
    const value = { kinds: { mint: { file: "mint.glb" } } };
    const json = vi.fn().mockResolvedValue(value);
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json });
    vi.stubGlobal("fetch", fetcher);
    const assets = new AssetStore();
    const early = assets.json<typeof value>("/harbour/civic/manifest.json");
    const consumer = assets.json<typeof value>("/harbour/civic/manifest.json");
    expect(consumer).toBe(early);
    expect(await early).toBe(value);
    expect(await assets.json("/harbour/civic/manifest.json")).toBe(value);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(json).toHaveBeenCalledTimes(1);
    await new AssetStore().json("/harbour/civic/manifest.json");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("evicts HTTP, network and parse failures so the next consumer can retry", async () => {
    const json = vi.fn().mockResolvedValue({ hulls: [] });
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: true, json: () => Promise.reject(new SyntaxError("invalid JSON")) })
      .mockResolvedValue({ ok: true, json });
    vi.stubGlobal("fetch", fetcher);
    const assets = new AssetStore(), url = "/harbour/kit/manifest.json";
    await expect(assets.json(url)).rejects.toThrow("HTTP 503");
    await expect(assets.json(url)).rejects.toThrow("offline");
    await expect(assets.json(url)).rejects.toThrow("invalid JSON");
    await expect(assets.json(url)).resolves.toEqual({ hulls: [] });
    await assets.json(url);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(json).toHaveBeenCalledTimes(1);
  });
});

describe("civic worker dirty placements", () => {
  function workers() {
    const base = new THREE.MeshStandardMaterial();
    const mats = { kit: () => base } as unknown as HarbourMaterials;
    return { crew: new Workers(mats, 2, 17), base };
  }

  it("keeps static and held matrices unchanged while still applying data and visibility changes", () => {
    const { crew, base } = workers();
    try {
      const slot = crew.slots[0];
      Object.assign(slot, { x: 5, y: 3, z: -9, h: 0.7, visible: true, hammer: 1, tempo: 0.7 });
      crew.update(1 / 60, true);
      const matrix = new THREE.Matrix4();
      crew.mesh.getMatrixAt(0, matrix);
      const expected = new THREE.Matrix4().compose(new THREE.Vector3(5, 3, -9), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.7), new THREE.Vector3(1, 1, 1));
      expect(Array.from(matrix.elements)).toEqual(Array.from(new Float32Array(expected.elements)));
      const anim = crew.mesh.geometry.getAttribute("aAnim") as THREE.InstancedBufferAttribute;
      const matrices = crew.mesh.instanceMatrix.version, animation = anim.version;
      const setMatrix = vi.spyOn(crew.mesh, "setMatrixAt");
      crew.update(1 / 60, true); // hammer motion is shader-only
      crew.update(1, false);    // reduced motion holds the clock, not incoming data
      expect(setMatrix).not.toHaveBeenCalled();
      expect(crew.mesh.instanceMatrix.version).toBe(matrices);
      expect(anim.version).toBe(animation); // 0.7 is compared at the stored Float32 precision
      slot.tempo = 0.82;
      crew.update(1, false);
      expect(anim.version).toBe(animation + 1);
      expect(setMatrix).not.toHaveBeenCalled();
      slot.x = 6;
      crew.update(1, false);
      expect(setMatrix).toHaveBeenCalledTimes(1);
      slot.visible = false;
      crew.update(1, false);
      crew.mesh.getMatrixAt(0, matrix);
      expect(matrix.equals(new THREE.Matrix4().makeScale(0, 0, 0))).toBe(true);
      const hiddenVersion = crew.mesh.instanceMatrix.version;
      crew.update(1, false);
      expect(crew.mesh.instanceMatrix.version).toBe(hiddenVersion);
      slot.visible = true;
      crew.update(1, false);
      crew.mesh.getMatrixAt(0, matrix);
      expect(matrix.elements[12]).toBe(6);
    } finally { crew.dispose(); base.dispose(); }
  });
});

describe("audited merged local transforms", () => {
  it("freezes only childless merged civic outputs, leaving animated nodes and ancestors live", () => {
    const root = new THREE.Group(), material = new THREE.MeshStandardMaterial();
    material.name = "hb_kit";
    const building = new THREE.Mesh(new THREE.BoxGeometry(), material);
    building.name = "building";
    building.position.x = 8;
    const press = new THREE.Mesh(new THREE.BoxGeometry(), material);
    press.name = "press_0";
    root.add(building, press);
    const [merged] = mergeStatic([root]);
    expect(merged.matrixAutoUpdate).toBe(false);
    expect(merged.matrix.equals(new THREE.Matrix4())).toBe(true);
    expect(merged.children).toHaveLength(0);
    expect(root.matrixAutoUpdate).toBe(true);
    expect(press.matrixAutoUpdate).toBe(true);
    press.position.y = 2;
    root.updateMatrixWorld(true);
    expect(press.matrixWorld.elements[13]).toBe(2);
    merged.geometry.dispose(); building.geometry.dispose(); press.geometry.dispose(); material.dispose();
  });

  it("keeps the engine merger's local matrix fixed without freezing its destination", () => {
    const root = new THREE.Group(), material = new THREE.MeshBasicMaterial();
    root.position.x = 10;
    const a = new THREE.Mesh(new THREE.BoxGeometry(), material), b = new THREE.Mesh(new THREE.BoxGeometry(), material);
    b.position.x = 3;
    root.add(a, b);
    const [merged] = mergeStaticMeshes([a, b], root, "test");
    expect(merged.matrixAutoUpdate).toBe(false);
    expect(merged.matrix.equals(new THREE.Matrix4())).toBe(true);
    expect(root.matrixAutoUpdate).toBe(true);
    expect(merged.matrixWorld.elements[12]).toBe(10);
    merged.geometry.dispose(); material.dispose();
  });
});
