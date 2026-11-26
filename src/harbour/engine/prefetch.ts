import { CIVIC_BASE, type CivicManifest } from "../civic/assemble";
import { KIT_BASE, type KitManifest } from "../fleet/hull-kit";
import { ISLAND_URL, TERRAIN_SPLAT_URL, TERRAIN_TOPO_URL } from "../world/island-system";
import { LIGHTHOUSE_URL } from "../world/lighthouse-system";
import layoutUrl from "../data/layout.json?url";
import type { HarbourLayout } from "../layout/types";
import { assetUrl, type AssetStore } from "./assets";
import { extraEnabled } from "./extras";
import { isAbort } from "./failure";
import type { QualityTier } from "./quality";
import { transport } from "./transport";

export const VEGETATION_URL = "/harbour/flora/vegetation.glb";
export const VEGETATION_INSTANCES_URL = "/harbour/flora/vegetation-instances.bin";
export const GROUNDCOVER_URL = "/harbour/groundcover.bin";

const prefetchedBins = new WeakMap<AssetStore, Map<string, Promise<ArrayBuffer | null>>>();

/** Fetch a same-origin binary payload once per AssetStore; missing/404 resolves to null. */
export function prefetchBinary(assets: AssetStore, url: string): Promise<ArrayBuffer | null> {
  if (assets.signal.aborted) return Promise.resolve(null);
  let map = prefetchedBins.get(assets);
  if (!map) prefetchedBins.set(assets, (map = new Map()));
  let p = map.get(url);
  if (!p) {
    const resolved = assetUrl(url);
    p = transport(assets.signal, async (signal) => {
      const res = await fetch(resolved, { signal });
      if (!res.ok || (res.headers.get("content-type") ?? "").includes("text/html")) return null;
      return res.arrayBuffer();
    }).catch((cause: unknown) => {
      if (isAbort(cause) || assets.signal.aborted) throw cause;
      return null;
    });
    map.set(url, p);
  }
  return p;
}

/** Consume a prefetched binary payload (or fetch it now) and release the cache entry once taken. */
export async function consumeBinary(assets: AssetStore, url: string): Promise<ArrayBuffer | null> {
  assets.signal.throwIfAborted();
  const map = prefetchedBins.get(assets);
  const p = map?.get(url) ?? prefetchBinary(assets, url);
  map?.delete(url);
  return p;
}

/**
 * Start every GLB and terrain/flora/ground-cover data payload the first frame needs (island, terrain splat/topo maps,
 * vegetation prototypes + instance table, ground-cover instances, lighthouse, the civic plots, the hull kit) at engine creation,
 * instead of system by system as each init reaches it. Bytes only for GLBs: parsing stays in each system's
 * init. The terrain maps, flora/ground-cover payloads, their lazy runtime chunks, and the civic/kit GLBs follow the
 * island's bytes: the island parses first, so it should land first without competing for HTTP/1.1 slots, and the
 * follow-up payloads download while it parses. Runs inside the Engine, so blocked viewports (which never construct one)
 * fetch nothing.
 */
export function prefetchHarbour(assets: AssetStore, initialTier: QualityTier = "high"): void {
  if (assets.signal.aborted) return;
  const island = assets.prefetch(ISLAND_URL);
  void assets.prefetch(LIGHTHOUSE_URL);
  const civic = assets.json<CivicManifest>(`${CIVIC_BASE}manifest.json`).catch(() => null);
  const kit = assets.json<KitManifest>(`${KIT_BASE}manifest.json`).catch(() => null);
  const layout = assets.json<HarbourLayout>(layoutUrl).catch(() => null);
  void island.then(() => {
    if (assets.signal.aborted) return;
    for (const u of [TERRAIN_SPLAT_URL, TERRAIN_TOPO_URL]) void assets.texture(u, false).catch(() => {});
    void assets.prefetch(VEGETATION_URL);
    void prefetchBinary(assets, VEGETATION_INSTANCES_URL).catch(() => {});
    void prefetchBinary(assets, GROUNDCOVER_URL).catch(() => {});
    void import("../world/shaders/terrain").catch(() => {});
    void import("../ocean/ocean-material").catch(() => {});
    void import("../world/vegetation-system").catch(() => {});
    void import("../world/groundcover-system").catch(() => {});
    void import("../ocean/wake-collars").catch(() => {});
    if (extraEnabled("refract")) {
      void import("../ocean/seabed").catch(() => {});
      void import("../ocean/caustics-pass").catch(() => {});
    }
    if (initialTier !== "low") {
      void import("../ocean/projected-grid").catch(() => {});
      void import("../ocean/wake-ribbons").catch(() => {});
      if (extraEnabled("fft")) void import("../ocean/fft/fft-system").catch(() => {});
      if (extraEnabled("mirror")) {
        if (initialTier === "high" && extraEnabled("planar")) void import("../ocean/planar-mirror").catch(() => {});
        else void import("../ocean/hiz-ssr").catch(() => {});
      }
    }
    void import("../weather/precip").catch(() => {});
    void import("../weather/lightning").catch(() => {});
    void import("../weather/rainbow").catch(() => {});
  });
  void Promise.all([island, civic, layout]).then(([, manifest, layout]) => {
    if (assets.signal.aborted) return;
    const files = new Set(layout?.civic?.map((plot) => manifest?.kinds[plot.kind]?.file));
    for (const file of files) if (file) void assets.prefetch(CIVIC_BASE + file);
  });
  void Promise.all([island, kit]).then(([, manifest]) => {
    if (assets.signal.aborted) return;
    for (const h of manifest?.hulls ?? []) {
      void assets.prefetch(KIT_BASE + h.file);
      if (h.lod) void assets.prefetch(KIT_BASE + h.lod);
    }
    for (const p of manifest?.props ?? []) void assets.prefetch(KIT_BASE + p.file);
  });
}
