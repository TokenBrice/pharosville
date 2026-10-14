/**
 * The cemetery's schema gate for `npm run sync:pharos-watch`, run as `node --import tsx scripts/harbour/sync-schema.mjs <file>`
 * so it can load the TypeScript contract itself: the candidate dead-stablecoins.json must pass shared/'s strict zod
 * schema (parseDeadStablecoinAssets), carry unique ids, and collide with none of this repo's frozen registry coins
 * (shared/lib/cemetery-runtime.ts throws at runtime on such a collision). Prints each violation; exits 1 on any.
 */
import { readFileSync } from "node:fs";
import { parseDeadStablecoinAssets } from "../../shared/lib/stablecoins/schema.ts";
import { RUNTIME_FROZEN_STABLECOINS } from "../../shared/lib/stablecoins/runtime-registry.ts";

const file = process.argv[2];
const problems = [];
try {
  const rows = parseDeadStablecoinAssets(JSON.parse(readFileSync(file, "utf8")), "dead-stablecoins.json (synced)");
  const seen = new Set();
  const frozen = new Set(RUNTIME_FROZEN_STABLECOINS.map((c) => c.id));
  for (const r of rows) {
    if (seen.has(r.id)) problems.push(`dead id ${r.id} appears twice`);
    if (frozen.has(r.id)) problems.push(`dead id ${r.id} is also a frozen coin in shared/data/stablecoins (the cemetery would throw)`);
    seen.add(r.id);
  }
} catch (err) {
  problems.push(err instanceof Error ? err.message : String(err));
}
for (const p of problems) console.error(`[sync:schema] ${p}`);
process.exit(problems.length ? 1 : 0);
