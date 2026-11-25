/**
 * LISTING POLICY 2.0 PROJECTION (unified into `npm run sync:pharos-watch`):
 * derives shared/data/stablecoins/listing-policy.json from upstream coins,
 * listing-decisions.json, and domains/reserves/*.json. Pure: no I/O.
 */
export const LISTING_POLICY_PATH = "shared/data/stablecoins/listing-policy.json";

/**
 * Documented in upstream docs/listing-policy.md (Tokenized Fund Retention) for
 * Falcon USDf's live reserve adapter. Only emitted when the target coin is an
 * active non-fund entry in the synced registry.
 */
export const REVIEWED_LIVE_ADAPTER_FUND_LINKS = {
  "jaaa-janus-henderson-anemoy": ["usdf-falcon"],
  "jtrsy-anemoy": ["usdf-falcon"],
};

const ACTIVE_NON_FUND_CLASSES = new Set(["core-stablecoin", "stablecoin-variant", "review-hold"]);
const sortAsc = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isActiveCoin = (c) => c && (c.status == null || c.status === "active");

function collectReferencedIds(coin, reserveDomain) {
  const refs = new Set();
  for (const dep of Array.isArray(coin.dependencies) ? coin.dependencies : []) {
    if (typeof dep?.id === "string" && dep.id) refs.add(dep.id);
  }
  for (const slice of Array.isArray(coin.reserves) ? coin.reserves : []) {
    if (typeof slice?.coinId === "string" && slice.coinId) refs.add(slice.coinId);
  }
  if (isPlainObject(reserveDomain)) {
    for (const slice of Array.isArray(reserveDomain.reserves) ? reserveDomain.reserves : []) {
      if (typeof slice?.coinId === "string" && slice.coinId) refs.add(slice.coinId);
    }
    for (const dep of Array.isArray(reserveDomain.dependencies) ? reserveDomain.dependencies : []) {
      if (typeof dep?.id === "string" && dep.id) refs.add(dep.id);
    }
    const relationships = reserveDomain.dependencyReview?.relationships;
    for (const rel of Array.isArray(relationships) ? relationships : []) {
      for (const candidate of [rel?.targetId, rel?.id, rel?.coinId]) {
        if (typeof candidate === "string" && candidate) refs.add(candidate);
      }
    }
  }
  return refs;
}

/**
 * @param {{ registry: Array<Record<string, any>>, listingDecisions: Record<string, any>, reservesById?: Map<string, Record<string, any>> }} input
 * @returns {{ policy: object | null, problems: string[] }}
 */
export function buildListingPolicy({ registry, listingDecisions, reservesById = new Map() }) {
  const problems = [];
  if (!Array.isArray(registry)) problems.push("registry must be an array");
  if (!isPlainObject(listingDecisions)) {
    problems.push("listing-decisions.json must be an object");
  } else {
    if (listingDecisions.policyVersion !== "2.0") {
      problems.push(`listing-decisions.json policyVersion must be "2.0" (got ${JSON.stringify(listingDecisions.policyVersion)})`);
    }
    if (!isPlainObject(listingDecisions.listingClassById)) {
      problems.push("listing-decisions.json listingClassById must be a plain object");
    }
  }
  if (problems.length) return { policy: null, problems };

  const classById = listingDecisions.listingClassById;
  const byId = new Map();
  for (const coin of registry) {
    if (!isPlainObject(coin) || typeof coin.id !== "string" || !coin.id) continue;
    byId.set(coin.id, coin);
  }

  const fundIdSet = new Set();
  const reviewHoldIdSet = new Set();
  const variantIdSet = new Set();
  const frozenIdSet = new Set();
  const activeNonFundCoins = [];
  const activeNonFundIdSet = new Set();
  const activeCoreIdSet = new Set();

  for (const coin of byId.values()) {
    if (coin.status === "frozen") frozenIdSet.add(coin.id);
    if (!isActiveCoin(coin)) continue;
    const cls = classById[coin.id];
    if (cls === "tokenized-fund") {
      fundIdSet.add(coin.id);
    } else if (ACTIVE_NON_FUND_CLASSES.has(cls)) {
      activeNonFundCoins.push(coin);
      activeNonFundIdSet.add(coin.id);
      if (cls === "core-stablecoin") activeCoreIdSet.add(coin.id);
      if (cls === "review-hold") reviewHoldIdSet.add(coin.id);
      if (cls === "stablecoin-variant") variantIdSet.add(coin.id);
    }
  }

  const fundIds = [...fundIdSet].sort(sortAsc);
  const reviewHoldIds = [...reviewHoldIdSet].sort(sortAsc);
  const variantIds = [...variantIdSet].sort(sortAsc);
  const frozenIds = [...frozenIdSet].sort(sortAsc);
  const excludedIds = Object.entries(classById)
    .filter(([, cls]) => cls === "excluded")
    .map(([id]) => id)
    .sort(sortAsc);

  const backedByFund = new Map(fundIds.map((fid) => [fid, new Set()]));
  const reserveMap = reservesById instanceof Map ? reservesById : new Map();

  for (const coin of activeNonFundCoins) {
    const refs = collectReferencedIds(coin, reserveMap.get(coin.id));
    for (const ref of refs) {
      if (!fundIdSet.has(ref)) continue;
      const set = backedByFund.get(ref);
      set.add(coin.id);
      if (classById[coin.id] === "stablecoin-variant" && typeof coin.variantOf === "string" && activeCoreIdSet.has(coin.variantOf)) {
        set.add(coin.variantOf);
      }
    }
  }

  const funds = {};
  for (const fid of fundIds) {
    const coin = byId.get(fid);
    const liveAdapterBackedIds = [...new Set(
      (REVIEWED_LIVE_ADAPTER_FUND_LINKS[fid] ?? []).filter((id) => activeNonFundIdSet.has(id)),
    )].sort(sortAsc);
    for (const id of liveAdapterBackedIds) backedByFund.get(fid).add(id);

    const backedIds = [...backedByFund.get(fid)].sort(sortAsc);
    const archetype = typeof coin.mechanismArchetype === "string"
      ? coin.mechanismArchetype
      : typeof coin.flags?.archetype === "string"
        ? coin.flags.archetype
        : null;
    const meta = {
      navToken: Boolean(coin.flags?.navToken),
      pegCurrency: typeof coin.flags?.pegCurrency === "string" ? coin.flags.pegCurrency : "USD",
      archetype,
      backedIds,
    };
    if (liveAdapterBackedIds.length > 0) meta.liveAdapterBackedIds = liveAdapterBackedIds;
    funds[fid] = meta;
  }

  const variantsGrouped = new Map();
  for (const vid of variantIds) {
    const coin = byId.get(vid);
    if (!coin || typeof coin.variantOf !== "string" || !coin.variantOf) continue;
    const list = variantsGrouped.get(coin.variantOf) ?? [];
    list.push({
      id: coin.id,
      symbol: typeof coin.symbol === "string" && coin.symbol ? coin.symbol : coin.id,
      name: typeof coin.name === "string" && coin.name ? coin.name : (coin.symbol ?? coin.id),
      kind: typeof coin.variantKind === "string" && coin.variantKind ? coin.variantKind : "variant",
    });
    variantsGrouped.set(coin.variantOf, list);
  }

  const variantsByParent = {};
  for (const parentId of [...variantsGrouped.keys()].sort(sortAsc)) {
    variantsByParent[parentId] = variantsGrouped.get(parentId).sort((a, b) => sortAsc(a.id, b.id));
  }

  return {
    policy: {
      policyVersion: "2.0",
      fundIds,
      reviewHoldIds,
      variantIds,
      excludedIds,
      frozenIds,
      funds,
      variantsByParent,
    },
    problems,
  };
}
