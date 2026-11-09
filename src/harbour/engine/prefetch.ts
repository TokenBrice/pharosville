import { CIVIC_BASE, type CivicManifest } from "../civic/assemble";
import { KIT_BASE, type KitManifest } from "../fleet/hull-kit";
import { ISLAND_URL } from "../world/island-system";
import { LIGHTHOUSE_URL } from "../world/lighthouse-system";
import layoutUrl from "../data/layout.json?url";
import type { HarbourLayout } from "../layout/types";
import type { AssetStore } from "./assets";

/**
 * Start every GLB the first frame needs (island, lighthouse, the civic plots, the hull kit) at engine
 * creation, instead of system by system as each init reaches it. Bytes only: parsing stays in each system's
 * init. The civic and kit GLBs follow the island's bytes: the island parses first, so it should land first,
 * and the small GLBs then download while it parses. Runs inside the Engine, so blocked viewports (which never
 * construct one) fetch nothing.
 */
export function prefetchHarbour(assets: AssetStore): void {
  if (assets.signal.aborted) return;
  const island = assets.prefetch(ISLAND_URL);
  void assets.prefetch(LIGHTHOUSE_URL);
  const civic = assets.json<CivicManifest>(`${CIVIC_BASE}manifest.json`).catch(() => null);
  const kit = assets.json<KitManifest>(`${KIT_BASE}manifest.json`).catch(() => null);
  const layout = assets.json<HarbourLayout>(layoutUrl).catch(() => null);
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
