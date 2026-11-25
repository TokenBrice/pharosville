import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetStore } from "./assets";
import { deferred } from "./deferred";
import { consumeBinary, GROUNDCOVER_URL, prefetchHarbour, VEGETATION_INSTANCES_URL, VEGETATION_URL } from "./prefetch";
import layoutUrl from "../data/layout.json?url";
import { CIVIC_BASE } from "../civic/assemble";
import { KIT_BASE } from "../fleet/hull-kit";
import { ISLAND_URL, TERRAIN_SPLAT_URL, TERRAIN_TOPO_URL } from "../world/island-system";
import { LIGHTHOUSE_URL } from "../world/lighthouse-system";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fixture() {
  const island = deferred(), layout = deferred<Response>();
  const fetcher = vi.fn(async (url: string) => url === layoutUrl ? layout.promise
    : url === VEGETATION_INSTANCES_URL ? new Response(new Uint8Array([0x48, 0x42, 0x56, 0x47]), { status: 200, headers: { "content-type": "application/octet-stream" } })
    : url === GROUNDCOVER_URL ? new Response(new Uint8Array([0x48, 0x42, 0x47, 0x43]), { status: 200, headers: { "content-type": "application/octet-stream" } })
    : Response.json(url.startsWith(CIVIC_BASE)
      ? { kinds: { mint: { file: "mint.glb" }, duplicate: { file: "mint.glb" }, "office-works": { file: "office-works.glb" }, "hull-stages": { file: "hull-stages.glb" } } }
      : { hulls: [{ file: "hull.glb", lod: "hull-lod.glb" }], props: [{ file: "prop.glb" }] }));
  vi.stubGlobal("fetch", fetcher);
  const assets = new AssetStore();
  const prefetch = vi.spyOn(assets, "prefetch").mockImplementation((url) => url === ISLAND_URL ? island.promise : Promise.resolve());
  const texture = vi.spyOn(assets, "texture").mockImplementation(() => Promise.resolve({} as never));
  return { assets, prefetch, texture, fetcher, island, layout };
}

describe("arrival request frontier", () => {
  it("shares layout JSON, stages terrain/flora/civic/kit payloads behind island bytes, and leaves later owners alone", async () => {
    const f = fixture();
    prefetchHarbour(f.assets);
    const consumer = f.assets.json(layoutUrl);
    // Before island bytes land, only island + lighthouse GLBs race for bandwidth (no terrain/flora contention)
    expect(f.prefetch.mock.calls.flat()).toEqual([ISLAND_URL, LIGHTHOUSE_URL]);
    expect(f.texture.mock.calls).toEqual([]);
    f.layout.resolve(Response.json({ civic: [{ kind: "mint" }, { kind: "duplicate" }, { kind: "missing" }] }));
    await consumer;
    expect(f.prefetch.mock.calls.flat()).toEqual([ISLAND_URL, LIGHTHOUSE_URL]);
    f.island.resolve();
    await vi.waitFor(() => expect(f.prefetch).toHaveBeenCalledWith(CIVIC_BASE + "mint.glb"));
    expect(f.texture.mock.calls).toEqual([[TERRAIN_SPLAT_URL, false], [TERRAIN_TOPO_URL, false]]);
    expect(f.prefetch.mock.calls.flat()).toEqual(expect.arrayContaining([VEGETATION_URL, KIT_BASE + "hull.glb", KIT_BASE + "hull-lod.glb", KIT_BASE + "prop.glb"]));
    expect(f.prefetch.mock.calls.flat().filter((url) => url.startsWith(CIVIC_BASE))).toEqual([CIVIC_BASE + "mint.glb"]);
    const bin = await consumeBinary(f.assets, VEGETATION_INSTANCES_URL);
    expect(bin?.byteLength).toBe(4);
    expect(f.fetcher.mock.calls.filter(([url]) => url === VEGETATION_INSTANCES_URL)).toHaveLength(1);
    const gcBin = await consumeBinary(f.assets, GROUNDCOVER_URL);
    expect(gcBin?.byteLength).toBe(4);
    expect(f.fetcher.mock.calls.filter(([url]) => url === GROUNDCOVER_URL)).toHaveLength(1);
    expect(f.fetcher.mock.calls.filter(([url]) => url === layoutUrl)).toHaveLength(1);
    f.assets.dispose();
  });

  it("does not hold the hull kit behind a waiting civic layout", async () => {
    const f = fixture();
    prefetchHarbour(f.assets); f.island.resolve();
    await vi.waitFor(() => expect(f.prefetch).toHaveBeenCalledWith(KIT_BASE + "hull.glb"));
    expect(f.prefetch.mock.calls.flat().some((url) => url.startsWith(CIVIC_BASE))).toBe(false);
    f.assets.dispose();
  });

  it("checks cancellation after manifest/layout awaits and never starts an obsolete frontier", async () => {
    const f = fixture();
    prefetchHarbour(f.assets); f.island.resolve(); f.assets.dispose();
    f.layout.resolve(Response.json({ civic: [{ kind: "mint" }] }));
    await vi.waitFor(() => expect(f.fetcher).toHaveBeenCalledTimes(3));
    await Promise.resolve();
    expect(f.prefetch.mock.calls.flat()).toEqual([ISLAND_URL, LIGHTHOUSE_URL]);
    expect(f.texture).not.toHaveBeenCalled();
    prefetchHarbour(f.assets);
    expect(f.prefetch).toHaveBeenCalledTimes(2);
    expect(f.texture).toHaveBeenCalledTimes(0);
  });

  it("skips prefetching seabed and caustics-pass chunks when &extras=-refract disables refraction", async () => {
    vi.resetModules();
    let seabedLoaded = false;
    let causticsLoaded = false;
    vi.doMock("./extras", () => ({ extraEnabled: (name: string) => name !== "refract" }));
    vi.doMock("../ocean/seabed", () => { seabedLoaded = true; return {}; });
    vi.doMock("../ocean/caustics-pass", () => { causticsLoaded = true; return {}; });
    try {
      const { prefetchHarbour: freshPrefetch } = await import("./prefetch");
      const f = fixture();
      freshPrefetch(f.assets);
      f.island.resolve();
      await vi.waitFor(() => expect(f.prefetch).toHaveBeenCalledWith(VEGETATION_URL));
      await new Promise((r) => setTimeout(r, 20));
      expect(seabedLoaded).toBe(false);
      expect(causticsLoaded).toBe(false);
      f.assets.dispose();
    } finally {
      vi.doUnmock("./extras");
      vi.doUnmock("../ocean/seabed");
      vi.doUnmock("../ocean/caustics-pass");
      vi.resetModules();
    }
  });
});
