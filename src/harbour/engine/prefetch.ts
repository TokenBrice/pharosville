import { CIVIC_BASE, type CivicManifest } from "../civic/assemble";
import { KIT_BASE, type KitManifest } from "../fleet/hull-kit";
import { ISLAND_URL } from "../world/island-system";
import { LIGHTHOUSE_URL } from "../world/lighthouse-system";
import type { AssetStore } from "./assets";

async function manifest<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}

/**
 * Start every GLB the first frame needs (island, lighthouse, the civic plots, the hull kit) at engine
 * creation, instead of system by system as each init reaches it. Bytes only: parsing stays in each system's
 * init. The civic and kit GLBs follow the island's bytes: the island parses first, so it should land first,
 * and the small GLBs then download while it parses. Runs inside the Engine, so blocked viewports (which never
 * construct one) fetch nothing.
 */
export function prefetchHarbour(assets: AssetStore): void {
  const island = assets.prefetch(ISLAND_URL);
  void assets.prefetch(LIGHTHOUSE_URL);
  const civic = manifest<CivicManifest>(`${CIVIC_BASE}manifest.json`);
  const kit = manifest<KitManifest>(`${KIT_BASE}manifest.json`);
  void island.then(async () => {
    for (const spec of Object.values((await civic)?.kinds ?? {})) void assets.prefetch(CIVIC_BASE + spec.file);
    for (const h of (await kit)?.hulls ?? []) {
      void assets.prefetch(KIT_BASE + h.file);
      if (h.lod) void assets.prefetch(KIT_BASE + h.lod);
    }
    for (const p of (await kit)?.props ?? []) void assets.prefetch(KIT_BASE + p.file);
  });
}
