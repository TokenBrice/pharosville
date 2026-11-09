import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetStore } from "./assets";
import { deferred } from "./deferred";
import { prefetchHarbour } from "./prefetch";
import layoutUrl from "../data/layout.json?url";
import { CIVIC_BASE } from "../civic/assemble";
import { KIT_BASE } from "../fleet/hull-kit";
import { ISLAND_URL } from "../world/island-system";
import { LIGHTHOUSE_URL } from "../world/lighthouse-system";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fixture() {
  const island = deferred(), layout = deferred<Response>();
  const fetcher = vi.fn(async (url: string) => url === layoutUrl ? layout.promise : Response.json(url.startsWith(CIVIC_BASE)
    ? { kinds: { mint: { file: "mint.glb" }, duplicate: { file: "mint.glb" }, "office-works": { file: "office-works.glb" }, "hull-stages": { file: "hull-stages.glb" } } }
    : { hulls: [{ file: "hull.glb", lod: "hull-lod.glb" }], props: [{ file: "prop.glb" }] }));
  vi.stubGlobal("fetch", fetcher);
  const assets = new AssetStore();
  const prefetch = vi.spyOn(assets, "prefetch").mockImplementation((url) => url === ISLAND_URL ? island.promise : Promise.resolve());
  return { assets, prefetch, fetcher, island, layout };
}

describe("arrival request frontier", () => {
  it("shares layout JSON, starts only layout-used civic files, and leaves later owners alone", async () => {
    const f = fixture();
    prefetchHarbour(f.assets);
    const consumer = f.assets.json(layoutUrl);
    expect(f.prefetch.mock.calls.flat()).toEqual([ISLAND_URL, LIGHTHOUSE_URL]);
    f.layout.resolve(Response.json({ civic: [{ kind: "mint" }, { kind: "duplicate" }, { kind: "missing" }] }));
    await consumer;
    expect(f.prefetch.mock.calls.flat()).toEqual([ISLAND_URL, LIGHTHOUSE_URL]);
    f.island.resolve();
    await vi.waitFor(() => expect(f.prefetch).toHaveBeenCalledWith(CIVIC_BASE + "mint.glb"));
    expect(f.prefetch.mock.calls.flat()).toEqual(expect.arrayContaining([KIT_BASE + "hull.glb", KIT_BASE + "hull-lod.glb", KIT_BASE + "prop.glb"]));
    expect(f.prefetch.mock.calls.flat().filter((url) => url.startsWith(CIVIC_BASE))).toEqual([CIVIC_BASE + "mint.glb"]);
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
    prefetchHarbour(f.assets);
    expect(f.prefetch).toHaveBeenCalledTimes(2);
  });
});
