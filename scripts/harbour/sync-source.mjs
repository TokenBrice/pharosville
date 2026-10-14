/**
 * What `npm run sync:pharos-watch` reads from a pharos-watch checkout, from AUTHORED, tracked files only: the
 * registry's coins.generated.json and legacy-llama-redirects.generated.json are gitignored build output upstream
 * (absent from any fresh clone), so both are rebuilt here the way pharos-watch builds them, for the fields we use:
 *   registry  = shared/data/stablecoins/coins/*.json in file-name order, `flags.pegCurrency` defaulting to "USD"
 *               (its zod default; the domain sidecars carry none of the fields the sync reads)
 *   redirects = legacy-route-redirects.json + every registry llama id → its slug + public/_redirects' /stablecoin/ 301s
 * A local checkout and the workflow's sparse checkout therefore produce identical output.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/** Paths the sync reads (the workflow's sparse checkout lists the same). */
export const SOURCE_PATHS = [
  "data/logos.json",
  "public/logos",
  "public/_redirects",
  "shared/data/dead-stablecoins.json",
  "shared/data/stablecoins/coins",
  "shared/data/stablecoins/legacy-route-redirects.json",
];

export async function loadRegistry(source) {
  const dir = join(source, "shared/data/stablecoins/coins");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const rows = [];
  for (const f of files) {
    const coin = JSON.parse(await readFile(join(dir, f), "utf8"));
    if (coin && typeof coin === "object") rows.push({ ...coin, flags: { ...coin.flags, pegCurrency: coin.flags?.pegCurrency ?? "USD" } });
  }
  return rows;
}

export async function loadRedirects(source, registry) {
  const out = JSON.parse(await readFile(join(source, "shared/data/stablecoins/legacy-route-redirects.json"), "utf8").catch(() => "{}"));
  for (const c of registry) if (typeof c.llamaId === "string" && c.llamaId) out[c.llamaId] = `/stablecoin/${c.id}/`;
  const pages = await readFile(join(source, "public/_redirects"), "utf8").catch(() => "");
  for (const line of pages.split("\n")) {
    const m = line.match(/^\/stablecoin\/([^/*]+)\/?\s+(\S+)\s+301\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
