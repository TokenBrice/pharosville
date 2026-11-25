#!/usr/bin/env node
/**
 * Staleness guard for the vendored pharos-watch data (`npm run check:pharos-watch-sync`, part of validate:docs).
 * FAILS when the order book or the logo book points at a file that is not in public/ (or a yard logo is not in
 * data/logos.json). WARNS, never fails, when the sync stamp (data/pharos-watch-sync.json) is missing or older than
 * 30 days: run `npm run sync:pharos-watch -- --source <pharos-watch checkout>` (docs/pharosville/OPERATIONS.md).
 * Also FAILS when the synced Listing Policy 2.0 catalogs (`listing-policy.json`, `runtime-active-ids.json`,
 * `runtime-slim.json`, `social-cards.json`, `prelaunch.json`) violate structural or cross-file invariants.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isActiveRegistryCoin, LISTING_POLICY_PATH, SOCIAL_CARDS_PATH } from "./sync-listing-policy.mjs";
import { safeHttpsUrl } from "./sync-prelaunch.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MAX_AGE_DAYS = 30;
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
const SLUG_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const sortAsc = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export const RUNTIME_SLIM = "shared/data/stablecoins/runtime-slim.json";
export const RUNTIME_ACTIVE_IDS = "shared/data/stablecoins/runtime-active-ids.json";
export { LISTING_POLICY_PATH, SOCIAL_CARDS_PATH };

/** Active allowlist in canonical order (with upstream Policy 2.0 exclusion filtering when listingDecisions is supplied). */
export function buildRuntimeActiveIds(
  coins = readJson("shared/data/stablecoins/coins.generated.json"),
  order = readJson("shared/data/stablecoins/canonical-order.json"),
  listingDecisions = null,
) {
  const byId = new Map(coins.map((coin) => [coin.id, coin]));
  const classById = listingDecisions?.listingClassById ?? null;
  const isActive = (coin) => isActiveRegistryCoin(coin)
    && (!classById || classById[coin.id] !== "excluded");
  const ids = [];
  const seen = new Set();
  for (const id of order) {
    if (seen.has(id)) continue;
    const coin = byId.get(id);
    if (!isActive(coin)) continue;
    seen.add(id);
    ids.push(id);
  }
  if (classById) {
    const extra = coins
      .filter((coin) => coin && typeof coin.id === "string" && !seen.has(coin.id) && isActive(coin))
      .map((coin) => coin.id)
      .sort(sortAsc);
    ids.push(...extra);
  }
  return `${JSON.stringify(ids, null, 1)}\n`;
}

/** The fields the browser reads from a pre-launch coin (src/harbour/ui/yard.ts) or a frozen one (shared/lib/cemetery-runtime.ts's shape). */
const SLIM_KEYS = ["id", "name", "symbol", "status", "llamaId", "flags", "launchPhase", "launchPhaseDetail", "expectedLaunchDate", "milestones", "obituary", "contracts"];

/**
 * The browser's registry: only the non-excluded pre-launch and frozen (with obituary) coins,
 * in canonical order, trimmed to SLIM_KEYS (flags to pegCurrency), so the full registry never ships.
 * Returns the file's exact text.
 */
export function buildRuntimeSlim(
  coins = readJson("shared/data/stablecoins/coins.generated.json"),
  order = readJson("shared/data/stablecoins/canonical-order.json"),
  listingDecisions = null,
) {
  const byId = new Map(coins.map((c) => [c.id, c]));
  const classById = listingDecisions?.listingClassById ?? null;
  const include = (c) => {
    if (!c) return false;
    if (c.status === "pre-launch") return !classById || classById[c.id] !== "excluded";
    if (c.status === "frozen") return c.obituary != null;
    return false;
  };
  const seen = new Set();
  const orderedIds = [];
  for (const id of order) {
    if (seen.has(id)) continue;
    seen.add(id);
    orderedIds.push(id);
  }
  if (classById) {
    for (const id of coins.map((c) => c?.id).filter((id) => typeof id === "string" && !seen.has(id)).sort(sortAsc)) {
      seen.add(id);
      orderedIds.push(id);
    }
  }
  const slim = orderedIds.flatMap((id) => {
    const c = byId.get(id);
    if (!include(c)) return [];
    const row = {};
    for (const k of SLIM_KEYS) {
      if (c[k] === undefined) continue;
      if (k === "flags") {
        row[k] = { pegCurrency: c.flags?.pegCurrency ?? "USD" };
      } else if (k === "milestones" && Array.isArray(c[k])) {
        row[k] = c[k].map((m) => {
          if (!m || typeof m !== "object" || Array.isArray(m)) return m;
          const { sourceUrl, ...rest } = m;
          const clean = safeHttpsUrl(sourceUrl);
          return clean ? { ...rest, sourceUrl: clean } : rest;
        });
      } else {
        row[k] = c[k];
      }
    }
    return [row];
  });
  return `${JSON.stringify(slim, null, 1)}\n`;
}

function checkUniqueSlugArray(value, label, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return new Set();
  }
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== "string" || !SLUG_ID.test(item)) errors.push(`${label} contains invalid slug id: ${JSON.stringify(item)}`);
    else if (seen.has(item)) errors.push(`${label} contains duplicate id: ${item}`);
    else seen.add(item);
  }
  return seen;
}

function main() {
  const errors = [];
  const onDisk = (p) => typeof p === "string" && p.startsWith("/") && existsSync(join(ROOT, "public", p));

  const logos = readJson("data/logos.json");
  for (const [id, p] of Object.entries(logos)) if (!onDisk(p)) errors.push(`data/logos.json ${id} → ${p} does not exist in public/`);
  const book = readJson("src/harbour/data/prelaunch.json");
  const listed = new Set(Object.values(logos));
  for (const c of book.coins ?? []) {
    if (c.logo == null) continue;
    if (!onDisk(c.logo)) errors.push(`src/harbour/data/prelaunch.json ${c.id} → ${c.logo} does not exist in public/`);
    else if (!listed.has(c.logo)) errors.push(`src/harbour/data/prelaunch.json ${c.id} → ${c.logo} is not registered in data/logos.json`);
  }
  if (book.count !== (book.coins ?? []).length) errors.push(`src/harbour/data/prelaunch.json count ${book.count} ≠ ${(book.coins ?? []).length} coins`);

  let stamp = null;
  try { stamp = readJson("data/pharos-watch-sync.json"); } catch { /* reported below */ }
  const age = stamp?.syncedAt ? Math.floor((Date.now() - Date.parse(`${stamp.syncedAt}T00:00:00Z`)) / 86_400_000) : null;
  if (age === null || Number.isNaN(age)) {
    console.warn("WARN pharos-watch sync stamp missing: run `npm run sync:pharos-watch -- --source <pharos-watch checkout>`");
  } else if (age > MAX_AGE_DAYS) {
    console.warn(`WARN pharos-watch data last changed by a sync ${age} days ago (${stamp.syncedAt}, source ${String(stamp.commit).slice(0, 12)}): run \`npm run sync:pharos-watch\` (no diff simply means it is still current)`);
  }

  // Validate Listing Policy 2.0 catalog
  let policy = null;
  try { policy = readJson(LISTING_POLICY_PATH); } catch { errors.push(`${LISTING_POLICY_PATH} is missing or unreadable: run \`npm run sync:pharos-watch\``); }
  let activeIdSet = new Set();
  let activeIds = [];
  try {
    activeIds = readJson(RUNTIME_ACTIVE_IDS);
    activeIdSet = checkUniqueSlugArray(activeIds, RUNTIME_ACTIVE_IDS, errors);
    if (activeIdSet.size === 0) errors.push(`${RUNTIME_ACTIVE_IDS} must be non-empty`);
  } catch {
    errors.push(`${RUNTIME_ACTIVE_IDS} is missing or invalid JSON: run \`npm run sync:pharos-watch\``);
  }

  let fundSet = new Set();
  let reviewHoldSet = new Set();
  let variantSet = new Set();
  let excludedSet = new Set();
  let frozenSet = new Set();
  let activeCoreSet = new Set();
  if (policy && typeof policy === "object" && !Array.isArray(policy)) {
    if (policy.policyVersion !== "2.0") errors.push(`${LISTING_POLICY_PATH} policyVersion must be "2.0"`);
    fundSet = checkUniqueSlugArray(policy.fundIds, `${LISTING_POLICY_PATH}.fundIds`, errors);
    reviewHoldSet = checkUniqueSlugArray(policy.reviewHoldIds, `${LISTING_POLICY_PATH}.reviewHoldIds`, errors);
    variantSet = checkUniqueSlugArray(policy.variantIds, `${LISTING_POLICY_PATH}.variantIds`, errors);
    excludedSet = checkUniqueSlugArray(policy.excludedIds, `${LISTING_POLICY_PATH}.excludedIds`, errors);
    frozenSet = checkUniqueSlugArray(policy.frozenIds, `${LISTING_POLICY_PATH}.frozenIds`, errors);
    activeCoreSet = new Set([...activeIdSet].filter((id) => !fundSet.has(id) && !variantSet.has(id) && !reviewHoldSet.has(id)));

    const allBuckets = [
      ["fundIds", fundSet],
      ["reviewHoldIds", reviewHoldSet],
      ["variantIds", variantSet],
      ["excludedIds", excludedSet],
      ["frozenIds", frozenSet],
    ];
    for (let i = 0; i < allBuckets.length; i += 1) {
      const [nameA, setA] = allBuckets[i];
      for (let j = i + 1; j < allBuckets.length; j += 1) {
        const [nameB, setB] = allBuckets[j];
        for (const id of setA) if (setB.has(id)) errors.push(`${LISTING_POLICY_PATH}: ${id} appears in both ${nameA} and ${nameB}`);
      }
    }
    for (const [name, set] of [["fundIds", fundSet], ["reviewHoldIds", reviewHoldSet], ["variantIds", variantSet]]) {
      for (const id of set) {
        if (activeIdSet.size > 0 && !activeIdSet.has(id)) errors.push(`${LISTING_POLICY_PATH}: ${name} entry ${id} is missing from ${RUNTIME_ACTIVE_IDS}`);
      }
    }

    if (!policy.funds || typeof policy.funds !== "object" || Array.isArray(policy.funds)) {
      errors.push(`${LISTING_POLICY_PATH}.funds must be an object`);
    } else {
      for (const fid of fundSet) {
        const meta = policy.funds[fid];
        if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
          errors.push(`${LISTING_POLICY_PATH}.funds is missing metadata for ${fid}`);
          continue;
        }
        if (typeof meta.navToken !== "boolean") errors.push(`${LISTING_POLICY_PATH}.funds.${fid}.navToken must be a boolean`);
        if (typeof meta.pegCurrency !== "string" || !meta.pegCurrency) errors.push(`${LISTING_POLICY_PATH}.funds.${fid}.pegCurrency must be a string`);
        if (meta.archetype !== null && typeof meta.archetype !== "string") errors.push(`${LISTING_POLICY_PATH}.funds.${fid}.archetype must be a string or null`);
        const backedSet = checkUniqueSlugArray(meta.backedIds, `${LISTING_POLICY_PATH}.funds.${fid}.backedIds`, errors);
        for (const bid of backedSet) {
          if (activeCoreSet.size > 0 && !activeCoreSet.has(bid)) errors.push(`${LISTING_POLICY_PATH}.funds.${fid}.backedIds entry ${bid} is not an active core stablecoin`);
        }
        if (meta.liveAdapterBackedIds !== undefined) {
          const liveSet = checkUniqueSlugArray(meta.liveAdapterBackedIds, `${LISTING_POLICY_PATH}.funds.${fid}.liveAdapterBackedIds`, errors);
          for (const lid of liveSet) {
            if (!backedSet.has(lid)) errors.push(`${LISTING_POLICY_PATH}.funds.${fid}.liveAdapterBackedIds entry ${lid} is missing from backedIds`);
          }
        }
      }
      for (const key of Object.keys(policy.funds)) {
        if (!fundSet.has(key)) errors.push(`${LISTING_POLICY_PATH}.funds.${key} is not listed in fundIds`);
      }
    }
    if (!policy.variantsByParent || typeof policy.variantsByParent !== "object" || Array.isArray(policy.variantsByParent)) {
      errors.push(`${LISTING_POLICY_PATH}.variantsByParent must be an object`);
    } else {
      const seenChildVariants = new Set();
      for (const [parentId, list] of Object.entries(policy.variantsByParent)) {
        if (!SLUG_ID.test(parentId) || (activeCoreSet.size > 0 && !activeCoreSet.has(parentId))) {
          errors.push(`${LISTING_POLICY_PATH}.variantsByParent parent ${parentId} is not an active core stablecoin`);
        }
        if (!Array.isArray(list)) {
          errors.push(`${LISTING_POLICY_PATH}.variantsByParent.${parentId} must be an array`);
          continue;
        }
        for (const v of list) {
          if (!v || typeof v !== "object" || Array.isArray(v) || typeof v.id !== "string" || !SLUG_ID.test(v.id)) {
            errors.push(`${LISTING_POLICY_PATH}.variantsByParent.${parentId} contains invalid entry`);
            continue;
          }
          if (!variantSet.has(v.id)) errors.push(`${LISTING_POLICY_PATH}.variantsByParent.${parentId} child ${v.id} is missing from variantIds`);
          if (seenChildVariants.has(v.id)) errors.push(`${LISTING_POLICY_PATH}.variantsByParent contains duplicate child ${v.id}`);
          seenChildVariants.add(v.id);
          if (typeof v.symbol !== "string" || !v.symbol) errors.push(`${LISTING_POLICY_PATH}.variantsByParent.${parentId}.${v.id} missing symbol`);
          if (typeof v.name !== "string" || !v.name) errors.push(`${LISTING_POLICY_PATH}.variantsByParent.${parentId}.${v.id} missing name`);
          if (typeof v.kind !== "string" || !v.kind) errors.push(`${LISTING_POLICY_PATH}.variantsByParent.${parentId}.${v.id} missing kind`);
        }
      }
    }
  } else if (policy !== null) {
    errors.push(`${LISTING_POLICY_PATH} must be a JSON object`);
  }

  for (const id of activeIdSet) {
    if (excludedSet.has(id)) errors.push(`${RUNTIME_ACTIVE_IDS} contains excluded id ${id}`);
    if (frozenSet.has(id)) errors.push(`${RUNTIME_ACTIVE_IDS} contains frozen id ${id}`);
  }

  // Validate prelaunch.json exclusions, disjointness and milestone sourceUrls
  const prelaunchIds = new Set();
  for (const c of book.coins ?? []) {
    if (typeof c.id !== "string" || !SLUG_ID.test(c.id)) {
      errors.push(`src/harbour/data/prelaunch.json contains invalid id: ${JSON.stringify(c.id)}`);
      continue;
    }
    prelaunchIds.add(c.id);
    if (excludedSet.has(c.id)) errors.push(`src/harbour/data/prelaunch.json entry ${c.id} is excluded in ${LISTING_POLICY_PATH}`);
    if (activeIdSet.has(c.id)) errors.push(`src/harbour/data/prelaunch.json entry ${c.id} also appears in ${RUNTIME_ACTIVE_IDS}`);
    if (frozenSet.has(c.id)) errors.push(`src/harbour/data/prelaunch.json entry ${c.id} also appears in ${LISTING_POLICY_PATH}.frozenIds`);
    for (const m of Array.isArray(c.milestones) ? c.milestones : []) {
      if (m?.sourceUrl !== undefined && safeHttpsUrl(m.sourceUrl) === null) {
        errors.push(`src/harbour/data/prelaunch.json ${c.id} milestone has unsafe sourceUrl: ${JSON.stringify(m.sourceUrl)}`);
      }
    }
  }

  const deadIds = new Set((readJson("shared/data/dead-stablecoins.json") ?? []).map((d) => d.id));

  // Validate runtime-slim.json
  try {
    const slim = readJson(RUNTIME_SLIM);
    if (!Array.isArray(slim)) {
      errors.push(`${RUNTIME_SLIM} must be a JSON array`);
    } else {
      const seenSlim = new Set();
      const slimPreIds = new Set();
      for (const row of slim) {
        if (!row || typeof row !== "object" || Array.isArray(row) || typeof row.id !== "string" || !SLUG_ID.test(row.id)) {
          errors.push(`${RUNTIME_SLIM} contains invalid row: ${JSON.stringify(row).slice(0, 80)}`);
          continue;
        }
        if (seenSlim.has(row.id)) errors.push(`${RUNTIME_SLIM} contains duplicate id: ${row.id}`);
        seenSlim.add(row.id);
        if (row.status === "pre-launch") {
          slimPreIds.add(row.id);
          if (excludedSet.has(row.id)) errors.push(`${RUNTIME_SLIM} pre-launch entry ${row.id} is excluded in ${LISTING_POLICY_PATH}`);
        } else if (row.status === "frozen") {
          if (!row.obituary) errors.push(`${RUNTIME_SLIM} frozen entry ${row.id} is missing obituary`);
          if (frozenSet.size > 0 && !frozenSet.has(row.id)) errors.push(`${RUNTIME_SLIM} frozen entry ${row.id} is missing from ${LISTING_POLICY_PATH}.frozenIds`);
          if (deadIds.has(row.id)) errors.push(`${RUNTIME_SLIM} frozen entry ${row.id} collides with shared/data/dead-stablecoins.json`);
        } else {
          errors.push(`${RUNTIME_SLIM} entry ${row.id} has unexpected status ${JSON.stringify(row.status)}`);
        }
        if (activeIdSet.has(row.id)) errors.push(`${RUNTIME_SLIM} entry ${row.id} also appears in ${RUNTIME_ACTIVE_IDS}`);
      }
      for (const id of prelaunchIds) if (!slimPreIds.has(id)) errors.push(`src/harbour/data/prelaunch.json entry ${id} missing from ${RUNTIME_SLIM}`);
      for (const id of slimPreIds) if (!prelaunchIds.has(id)) errors.push(`${RUNTIME_SLIM} pre-launch entry ${id} missing from src/harbour/data/prelaunch.json`);
    }
  } catch {
    errors.push(`${RUNTIME_SLIM} is missing or invalid JSON: run \`npm run sync:pharos-watch\``);
  }

  // Validate social-cards.json (edge identity table for functions/index.ts)
  try {
    const cards = readJson(SOCIAL_CARDS_PATH);
    if (!cards || typeof cards !== "object" || Array.isArray(cards)) {
      errors.push(`${SOCIAL_CARDS_PATH} must be a JSON object`);
    } else {
      const checkMap = (map, label, expectedSet) => {
        if (!map || typeof map !== "object" || Array.isArray(map)) {
          errors.push(`${SOCIAL_CARDS_PATH}.${label} must be an object`);
          return;
        }
        const keys = new Set(Object.keys(map));
        for (const [id, pair] of Object.entries(map)) {
          if (!SLUG_ID.test(id)) errors.push(`${SOCIAL_CARDS_PATH}.${label} invalid slug id: ${id}`);
          if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "string" || !pair[0] || typeof pair[1] !== "string" || !pair[1]) {
            errors.push(`${SOCIAL_CARDS_PATH}.${label}.${id} must be [symbol, name]`);
          }
        }
        for (const id of expectedSet) if (!keys.has(id)) errors.push(`${SOCIAL_CARDS_PATH}.${label} missing ${id}`);
        for (const id of keys) if (!expectedSet.has(id)) errors.push(`${SOCIAL_CARDS_PATH}.${label} unexpected entry ${id}`);
      };
      checkMap(cards.core, "core", activeCoreSet);
      checkMap(cards.funds, "funds", fundSet);
      checkMap(cards.yard, "yard", prelaunchIds);
    }
  } catch {
    errors.push(`${SOCIAL_CARDS_PATH} is missing or invalid JSON: run \`npm run sync:pharos-watch\``);
  }

  if (errors.length) {
    console.error("pharos-watch vendored data check failed:");
    for (const e of errors) console.error(`- ${e}`);
    process.exit(1);
  }
  console.log(`pharos-watch vendored data ok: ${Object.keys(logos).length} logos, ${book.coins?.length ?? 0} yard coins, ${activeIds.length} active ids, ${policy?.fundIds?.length ?? 0} funds${age === null || Number.isNaN(age) ? "" : `, synced ${age} day(s) ago`}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
