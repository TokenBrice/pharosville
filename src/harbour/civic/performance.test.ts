import { CivicBoards, flagPlace, wallPlace } from "./boards";
import { Shipyard, type YardHull } from "./shipyard";
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
    const mats = { kit: () => base, track: vi.fn() } as unknown as HarbourMaterials;
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

describe("retained civic boards", () => {
  function canvas() {
    const g = { save() {}, restore() {}, clearRect() {}, beginPath() {}, rect() {}, clip() {}, drawImage: vi.fn() };
    vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => g }) });
    return g;
  }

  it("retains geometry/UVs and touches only moved flag ranges, including hide/show", () => {
    canvas();
    const boards = new CivicBoards(128), slot = boards.alloc(32, 16)!;
    boards.place("wall", slot, wallPlace(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), 4, 2));
    boards.place("flag", slot, flagPlace(new THREE.Vector3(5, 3, 0), [1, 0], 3, 2));
    boards.update(0, false, 0, 0);
    const g = boards.mesh.geometry, p = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv;
    const wall = p.array.slice(0, 12), oldUV = uv.array.slice(), index = g.index!, full = index.array.slice();
    p.clearUpdateRanges(); (g.attributes.normal as THREE.BufferAttribute).clearUpdateRanges();
    const indexVersion = index.version, uvVersion = (uv as THREE.BufferAttribute).version;
    boards.move("flag", flagPlace(new THREE.Vector3(5, 3, 0), [0, 1], 3, 2));
    boards.update(0, false, 0, 0.8);
    expect(boards.mesh.geometry).toBe(g); expect(g.attributes.position).toBe(p); expect(g.attributes.uv).toBe(uv);
    expect(p.array.slice(0, 12)).toEqual(wall); expect(uv.array).toEqual(oldUV);
    expect(p.updateRanges).toEqual([{ start: 12, count: 66 }]);
    expect(index.version).toBe(indexVersion); expect((uv as THREE.BufferAttribute).version).toBe(uvVersion);
    expect(Array.from(uv.array.slice(0, 8))).toEqual([0, 0.875, 0.25, 0.875, 0, 1, 0.25, 1]);
    boards.show("wall", false); boards.update(0, false, 0, 0);
    expect(g.drawRange.count).toBe(60); expect(g.attributes.position).toBe(p);
    boards.show("wall", true); boards.update(0, false, 0, 0);
    expect(g.drawRange.count).toBe(66); expect(index.array).toEqual(full);
    boards.dispose();
  });

  it("coalesces paints and image completions, then uploads only their small rectangles", async () => {
    const g = canvas(), renderer = { initTexture: vi.fn(), copyTextureToTexture: vi.fn() };
    const boards = new CivicBoards(2048, renderer as unknown as THREE.WebGLRenderer);
    const a = boards.alloc(512, 128)!, b = boards.alloc(128, 64)!;
    const start = boards.texture.version;
    for (let i = 0; i < 5; i++) boards.paint(a, () => {});
    boards.touch(b); await boards.stage();
    expect(renderer.initTexture).toHaveBeenCalledOnce(); expect(boards.texture.version).toBe(start + 1);
    const version = boards.texture.version;
    boards.paint(a, () => {}); boards.touch(a); boards.touch(a); await boards.stage();
    expect(renderer.initTexture).toHaveBeenCalledOnce(); expect(renderer.copyTextureToTexture).toHaveBeenCalledOnce();
    expect(boards.texture.version).toBe(version); // no full-canvas invalidation after first allocation
    const [source, destination, region, at] = renderer.copyTextureToTexture.mock.calls[0];
    expect(source.image).toMatchObject({ width: 512, height: 128 }); expect(destination).toBe(boards.texture);
    expect(region).toBeNull(); expect(at.toArray()).toEqual([a.x, 2048 - a.y - a.h]);
    expect(g.drawImage).toHaveBeenCalledWith(boards.canvas, a.x, a.y, a.w, a.h, 0, 0, a.w, a.h);
    expect(boards.material.map).toBe(boards.texture); expect(boards.material.emissiveMap).toBe(boards.texture);
    boards.dispose(); boards.touch(a); await boards.stage(); expect(renderer.copyTextureToTexture).toHaveBeenCalledOnce();
  });
});

describe("retained shipyard", () => {
  it("launches/unlaunches hulls, posts and boards using only the retained index prefix", () => {
    const material = new THREE.MeshStandardMaterial(), show = vi.fn();
    const Constructor = Shipyard as unknown as new (plot: unknown, mats: unknown, boards: unknown) => Shipyard;
    const yard = new Constructor({ nodes: new Map() }, { kit: () => material }, { show });
    const internal = yard as unknown as { mesh: THREE.Mesh; placed: unknown[]; rebuild(): void };
    for (const [i, id] of ["a", "b"].entries()) {
      const hull = new THREE.BoxGeometry(); hull.deleteAttribute("uv");
      hull.setAttribute("color", new THREE.BufferAttribute(new Float32Array(hull.attributes.position.count * 4), 4));
      internal.placed.push({ place: { coin: { id } }, hull, extra: [], board: new THREE.Vector3(i * 10, 0, 0), boardW: 4 });
      yard.hulls.push({ coin: { id }, launched: false } as YardHull);
    }
    internal.rebuild();
    const mesh = internal.mesh, g = mesh.geometry, position = g.attributes.position, index = g.index!, full = index.array.slice();
    const disposed = vi.fn(); g.addEventListener("dispose", disposed);
    yard.setLaunched(new Set(["a"]));
    expect(internal.mesh).toBe(mesh); expect(mesh.geometry).toBe(g); expect(g.attributes.position).toBe(position); expect(g.index).toBe(index);
    expect(g.drawRange.count).toBe(108); expect(index.array.slice(0, 108)).toEqual(full.slice(108));
    expect(yard.hulls[0].launched).toBe(true); expect(show).toHaveBeenCalledWith("yard:a", false);
    yard.setLaunched(new Set(["a", "b"])); expect(mesh.visible).toBe(false); expect(g.drawRange.count).toBe(0);
    yard.setLaunched(new Set()); expect(mesh.visible).toBe(true); expect(index.array).toEqual(full);
    expect(disposed).not.toHaveBeenCalled(); yard.dispose(); expect(disposed).toHaveBeenCalledOnce(); material.dispose();
  });
});
