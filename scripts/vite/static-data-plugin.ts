import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import type { DeadStablecoin } from "../../shared/types/market";
import { bornOf, causeFamily } from "../../src/harbour/ui/cemetery-classify";

/**
 * Derive projections from canonical synced books on every build: no duplicate data to go stale. Paths resolve from
 * the repository root (every caller runs there) rather than import.meta, so Playwright's CommonJS loader can import
 * this too (tests/helpers/overlay-bundle.ts).
 */
export function staticDataProjections(root = process.cwd()): Plugin {
  const files: Record<string, string> = {
    "virtual:pharosville-cemetery": resolve(root, "shared/data/dead-stablecoins.json"),
    "virtual:pharosville-prelaunch": resolve(root, "src/harbour/data/prelaunch.json"),
  };
  return {
    name: "pharosville-static-data-projections",
    resolveId(id) { return files[id] ? `\0${id}` : undefined; },
    load(id) {
      const file = files[id.slice(1)];
      if (!id.startsWith("\0") || !file) return;
      this.addWatchFile(file);
      const data = JSON.parse(readFileSync(file, "utf8"));
      const projected = id.endsWith("cemetery")
        ? (data as DeadStablecoin[]).map((d) => ({
          id: d.id, name: d.name, symbol: d.symbol, pegCurrency: d.pegCurrency,
          causeOfDeath: d.causeOfDeath, deathDate: d.deathDate, peakMcap: d.peakMcap,
          epitaph: d.epitaph, llamaId: d.llamaId, family: causeFamily(d), born: bornOf(d.obituary ?? "", d.deathDate),
        }))
        : { coins: (data.coins as Array<Record<string, unknown>>).map((d) => ({
          id: d.id, name: d.name, symbol: d.symbol, pegCurrency: d.pegCurrency,
          launchPhase: d.launchPhase, expectedLaunchDate: d.expectedLaunchDate,
          logo: d.logo, llamaId: d.llamaId, brandColor: d.brandColor,
        })) };
      return `export default ${JSON.stringify(projected)};`;
    },
  };
}
