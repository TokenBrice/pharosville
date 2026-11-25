import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import type { DeadStablecoin } from "../../shared/types/market";
import { bornOf, causeFamily } from "../../src/harbour/ui/cemetery-classify";

function emitCompactPrelaunch(data: { coins: Array<Record<string, unknown>> }): string {
  const rows = data.coins.map((d) => [
    d.id, d.name, d.symbol, d.pegCurrency ?? null, d.launchPhase ?? null,
    d.expectedLaunchDate ?? null, d.logo ?? null, d.llamaId ?? null, d.brandColor ?? null,
  ]);
  return `export default {coins:${JSON.stringify(rows)}.map(([id,name,symbol,pegCurrency,launchPhase,expectedLaunchDate,logo,llamaId,brandColor])=>({id,name,symbol,pegCurrency,launchPhase,expectedLaunchDate,logo,llamaId,brandColor}))};`;
}

function emitCompactListingPolicy(data: {
  policyVersion: string;
  fundIds: string[];
  reviewHoldIds: string[];
  variantIds: string[];
  excludedIds: string[];
  frozenIds: string[];
  funds: Record<string, { navToken: boolean; pegCurrency: string; archetype: string | null; backedIds: string[]; liveAdapterBackedIds?: string[] }>;
  variantsByParent: Record<string, Array<{ id: string; symbol: string; name: string; kind: string }>>;
}): string {
  const kinds: string[] = [];
  const kindIdx = (k: string) => {
    const i = kinds.indexOf(k);
    return i >= 0 ? i : kinds.push(k) - 1;
  };
  const packedVariants: Record<string, Array<[string, string, string, number]>> = {};
  const parented = new Set<string>();
  for (const [parentId, list] of Object.entries(data.variantsByParent)) {
    packedVariants[parentId] = list.map((v) => {
      parented.add(v.id);
      return [v.id, v.symbol, v.name, kindIdx(v.kind)];
    });
  }
  const extraVariants = data.variantIds.filter((id) => !parented.has(id));
  const packedFunds: Record<string, unknown[]> = {};
  for (const [id, f] of Object.entries(data.funds)) {
    packedFunds[id] = f.liveAdapterBackedIds
      ? [f.navToken ? 1 : 0, f.pegCurrency, f.archetype, f.backedIds, f.liveAdapterBackedIds]
      : [f.navToken ? 1 : 0, f.pegCurrency, f.archetype, f.backedIds];
  }
  return [
    `const K=${JSON.stringify(kinds)},F={},V={},U=[];`,
    `for(const[id,f]of Object.entries(${JSON.stringify(packedFunds)}))F[id]={navToken:!!f[0],pegCurrency:f[1],archetype:f[2],backedIds:f[3],...(f[4]?{liveAdapterBackedIds:f[4]}:{})};`,
    `for(const[p,l]of Object.entries(${JSON.stringify(packedVariants)}))V[p]=l.map(([id,symbol,name,k])=>(U.push(id),{id,symbol,name,kind:K[k]}));`,
    `export default {policyVersion:${JSON.stringify(data.policyVersion)},fundIds:${JSON.stringify(data.fundIds)},reviewHoldIds:${JSON.stringify(data.reviewHoldIds)},variantIds:[...U,...${JSON.stringify(extraVariants)}].sort((a,b)=>a<b?-1:a>b?1:0),excludedIds:${JSON.stringify(data.excludedIds)},frozenIds:${JSON.stringify(data.frozenIds)},funds:F,variantsByParent:V};`,
  ].join("");
}

/**
 * Derive projections from canonical synced books on every build: no duplicate data to go stale. Paths resolve from
 * the repository root (every caller runs there) rather than import.meta, so Playwright's CommonJS loader can import
 * this too (tests/helpers/overlay-bundle.ts).
 */
export function staticDataProjections(root = process.cwd()): Plugin {
  const files: Record<string, string> = {
    "virtual:pharosville-cemetery": resolve(root, "shared/data/dead-stablecoins.json"),
    "virtual:pharosville-prelaunch": resolve(root, "src/harbour/data/prelaunch.json"),
    "virtual:pharosville-listing-policy": resolve(root, "shared/data/stablecoins/listing-policy.json"),
  };
  return {
    name: "pharosville-static-data-projections",
    resolveId(id) { return files[id] ? `\0${id}` : undefined; },
    load(id) {
      const file = files[id.slice(1)];
      if (!id.startsWith("\0") || !file) return;
      this.addWatchFile(file);
      const data = JSON.parse(readFileSync(file, "utf8"));
      if (id.endsWith("listing-policy")) return emitCompactListingPolicy(data);
      if (id.endsWith("prelaunch")) return emitCompactPrelaunch(data);
      const projected = (data as DeadStablecoin[]).map((d) => ({
        id: d.id, name: d.name, symbol: d.symbol, pegCurrency: d.pegCurrency,
        causeOfDeath: d.causeOfDeath, deathDate: d.deathDate, peakMcap: d.peakMcap,
        epitaph: d.epitaph, llamaId: d.llamaId, family: causeFamily(d), born: bornOf(d.obituary ?? "", d.deathDate),
      }));
      return `export default ${JSON.stringify(projected)};`;
    },
  };
}
