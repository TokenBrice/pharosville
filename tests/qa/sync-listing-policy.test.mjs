import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import listingPolicyVirtual from "virtual:pharosville-listing-policy";
import { buildListingPolicy, buildSocialCards, REVIEWED_LIVE_ADAPTER_FUND_LINKS } from "../../scripts/harbour/sync-listing-policy.mjs";
import { buildPrelaunchBook } from "../../scripts/harbour/sync-prelaunch.mjs";
import { buildRuntimeActiveIds, buildRuntimeSlim } from "../../scripts/harbour/sync-check.mjs";
import { RUNTIME_ACTIVE_IDS } from "../../shared/lib/stablecoins/runtime-active-ids";

describe("sync-listing-policy (Listing Policy 2.0)", () => {
  it("rejects malformed inputs or non-2.0 policy versions", () => {
    expect(buildListingPolicy({ registry: null, listingDecisions: { policyVersion: "2.0", listingClassById: {} } }).policy).toBeNull();
    expect(buildListingPolicy({ registry: [], listingDecisions: { policyVersion: "1.0", listingClassById: {} } }).problems[0]).toMatch(/policyVersion/);
    expect(buildListingPolicy({ registry: [], listingDecisions: { policyVersion: "2.0", listingClassById: null } }).problems[0]).toMatch(/listingClassById/);
  });

  it("projects funds, backed links (static, dependencyReview, variant parent, live-adapter), variants, review-holds, frozen, and excluded deterministically", () => {
    const registry = [
      { id: "usdf-falcon", name: "Falcon USD", symbol: "USDf", flags: { pegCurrency: "USD" } },
      { id: "usdc-circle", name: "USD Coin", symbol: "USDC", status: "active", flags: { pegCurrency: "USD" } },
      { id: "eur0-usual", name: "Usual Euro", symbol: "EUR0", flags: { pegCurrency: "EUR" }, dependencies: [{ id: "eutbl-spiko", weight: 0.5 }] },
      { id: "susdc-vault", name: "Staked USDC", symbol: "sUSDC", variantOf: "usdc-circle", variantKind: "strategy-vault", flags: { pegCurrency: "USD" } },
      { id: "wusdc-bare", name: "Wrapped USDC", symbol: "wUSDC", variantOf: "usdc-circle", flags: { pegCurrency: "USD" } },
      { id: "rcusd-r25", name: "R25 USD", symbol: "rcUSD", flags: { pegCurrency: "USD" } },
      { id: "buidl-blackrock", name: "BUIDL", symbol: "BUIDL", mechanismArchetype: "tbill", flags: { pegCurrency: "USD", navToken: false } },
      { id: "eutbl-spiko", name: "Spiko EU T-Bills", symbol: "EUTBL", mechanismArchetype: "tbill", flags: { pegCurrency: "EUR", navToken: true } },
      { id: "jaaa-janus-henderson-anemoy", name: "Anemoy JAAA", symbol: "JAAA", mechanismArchetype: "rwa-credit-fund", flags: { pegCurrency: "USD", navToken: true } },
      { id: "jtrsy-anemoy", name: "Anemoy JTRSY", symbol: "JTRSY", mechanismArchetype: "tbill", flags: { pegCurrency: "USD", navToken: true } },
      { id: "quarantined-fund", name: "Quarantined", symbol: "QF", status: "quarantined", flags: { pegCurrency: "USD", navToken: true } },
      { id: "frozen-fund", name: "Frozen Fund", symbol: "FF", status: "frozen", obituary: { causeOfDeath: "abandoned", deathDate: "2026-01", epitaph: "bye", obituary: "bye", sourceUrl: "https://example.com", sourceLabel: "ex" }, flags: { pegCurrency: "USD", navToken: true } },
      { id: "delisted-coin", name: "Delisted", symbol: "DEL", status: "delisted", flags: { pegCurrency: "USD" } },
    ];
    const listingDecisions = {
      schemaVersion: 1,
      policyVersion: "2.0",
      listingClassById: {
        "usdf-falcon": "core-stablecoin",
        "usdc-circle": "core-stablecoin",
        "eur0-usual": "core-stablecoin",
        "susdc-vault": "stablecoin-variant",
        "wusdc-bare": "stablecoin-variant",
        "rcusd-r25": "review-hold",
        "buidl-blackrock": "tokenized-fund",
        "eutbl-spiko": "tokenized-fund",
        "jaaa-janus-henderson-anemoy": "tokenized-fund",
        "jtrsy-anemoy": "tokenized-fund",
        "quarantined-fund": "tokenized-fund",
        "frozen-fund": "tokenized-fund",
        "delisted-coin": "excluded",
        "removed-legacy": "excluded",
      },
    };
    const reservesById = new Map([
      ["susdc-vault", { id: "susdc-vault", reserves: [{ name: "BUIDL", pct: 40, risk: "low", coinId: "buidl-blackrock" }] }],
      ["rcusd-r25", { id: "rcusd-r25", dependencyReview: { relationships: [{ targetId: "eutbl-spiko" }] } }],
    ]);

    const { policy, problems } = buildListingPolicy({ registry, listingDecisions, reservesById });
    expect(problems).toEqual([]);
    expect(policy.policyVersion).toBe("2.0");
    expect(policy.fundIds).toEqual(["buidl-blackrock", "eutbl-spiko", "jaaa-janus-henderson-anemoy", "jtrsy-anemoy"]);
    expect(policy.reviewHoldIds).toEqual(["rcusd-r25"]);
    expect(policy.variantIds).toEqual(["susdc-vault", "wusdc-bare"]);
    expect(policy.frozenIds).toEqual(["frozen-fund"]);
    expect(policy.excludedIds).toEqual(["delisted-coin", "removed-legacy"]);

    expect(policy.funds["buidl-blackrock"]).toEqual({
      navToken: false,
      pegCurrency: "USD",
      archetype: "tbill",
      backedIds: ["usdc-circle"],
    });
    expect("liveAdapterBackedIds" in policy.funds["buidl-blackrock"]).toBe(false);

    expect(policy.funds["eutbl-spiko"]).toEqual({
      navToken: true,
      pegCurrency: "EUR",
      archetype: "tbill",
      backedIds: ["eur0-usual"],
    });
    expect(policy.funds["jaaa-janus-henderson-anemoy"]).toEqual({
      navToken: true,
      pegCurrency: "USD",
      archetype: "rwa-credit-fund",
      backedIds: ["usdf-falcon"],
      liveAdapterBackedIds: ["usdf-falcon"],
    });
    expect(REVIEWED_LIVE_ADAPTER_FUND_LINKS["jtrsy-anemoy"]).toEqual(["usdf-falcon"]);
    expect(policy.funds["jtrsy-anemoy"].liveAdapterBackedIds).toEqual(["usdf-falcon"]);

    expect(policy.variantsByParent).toEqual({
      "usdc-circle": [
        { id: "susdc-vault", symbol: "sUSDC", name: "Staked USDC", kind: "strategy-vault" },
        { id: "wusdc-bare", symbol: "wUSDC", name: "Wrapped USDC", kind: "variant" },
      ],
    });

    const cards = buildSocialCards({ registry, listingDecisions });
    expect(Object.keys(cards.core)).toEqual(["eur0-usual", "usdc-circle", "usdf-falcon"]);
    expect(Object.keys(cards.funds)).toEqual(["buidl-blackrock", "eutbl-spiko", "jaaa-janus-henderson-anemoy", "jtrsy-anemoy"]);
    expect(cards.core["susdc-vault"]).toBeUndefined();
    expect(cards.core["rcusd-r25"]).toBeUndefined();
    expect(cards.core["delisted-coin"]).toBeUndefined();
  });

  it("reports missing/unrecognized active listing classes and keeps frozenIds disjoint from excludedIds", () => {
    const { policy, problems } = buildListingPolicy({
      registry: [
        { id: "unclassified-coin", name: "Unclassified", symbol: "UNC", flags: { pegCurrency: "USD" } },
        { id: "frozen-excluded", name: "Frozen Excl", symbol: "FE", status: "frozen", flags: { pegCurrency: "USD" } },
      ],
      listingDecisions: {
        policyVersion: "2.0",
        listingClassById: { "frozen-excluded": "excluded" },
      },
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/unclassified-coin/);
    expect(policy.frozenIds).toEqual(["frozen-excluded"]);
    expect(policy.excludedIds).toEqual([]);
  });

  it("omits reviewed live-adapter links when the target coin is inactive or absent", () => {
    const { policy, problems } = buildListingPolicy({
      registry: [
        { id: "jaaa-janus-henderson-anemoy", name: "JAAA", symbol: "JAAA", flags: { pegCurrency: "USD", navToken: true } },
        { id: "usdf-falcon", name: "USDf", symbol: "USDf", status: "frozen", flags: { pegCurrency: "USD" } },
      ],
      listingDecisions: {
        schemaVersion: 1,
        policyVersion: "2.0",
        listingClassById: { "jaaa-janus-henderson-anemoy": "tokenized-fund", "usdf-falcon": "core-stablecoin" },
      },
    });
    expect(problems).toEqual([]);
    expect(policy.funds["jaaa-janus-henderson-anemoy"].backedIds).toEqual([]);
    expect("liveAdapterBackedIds" in policy.funds["jaaa-janus-henderson-anemoy"]).toBe(false);
  });
});

describe("sync-prelaunch Policy 2.0 updates", () => {
  it("accepts the launched phase and filters out Policy 2.0 excluded pre-launch coins", () => {
    const rows = [
      { id: "coin-launched", name: "Launched Coin", symbol: "LCH", status: "pre-launch", launchPhase: "launched", flags: { pegCurrency: "USD" } },
      { id: "coin-excluded", name: "Excluded Coin", symbol: "EXC", status: "pre-launch", launchPhase: "announced", flags: { pegCurrency: "USD" } },
      { id: "coin-beta", name: "Beta Coin", symbol: "BET", status: "pre-launch", launchPhase: "beta", flags: { pegCurrency: "EUR" } },
    ];
    const { book, problems } = buildPrelaunchBook(rows, {}, {}, { "coin-excluded": "excluded", "coin-launched": "core-stablecoin" });
    expect(problems).toEqual([]);
    expect(book.count).toBe(2);
    expect(book.phases).toEqual({ beta: 1, launched: 1 });
    expect(book.coins.map((c) => c.id)).toEqual(["coin-beta", "coin-launched"]);
    expect(book.coins[1].launchPhase).toBe("launched");
  });
});

describe("buildRuntimeActiveIds & buildRuntimeSlim Policy 2.0 filtering", () => {
  const coins = [
    { id: "core-a", name: "Core A", symbol: "CA", flags: { pegCurrency: "USD" } },
    { id: "fund-a", name: "Fund A", symbol: "FA", flags: { pegCurrency: "USD" } },
    { id: "var-a", name: "Var A", symbol: "VA", status: "active", flags: { pegCurrency: "USD" } },
    { id: "extra-active", name: "Extra", symbol: "EX", flags: { pegCurrency: "USD" } },
    { id: "quar-a", name: "Quar", symbol: "QA", status: "quarantined", flags: { pegCurrency: "USD" } },
    { id: "del-a", name: "Del", symbol: "DA", status: "delisted", flags: { pegCurrency: "USD" } },
    { id: "excl-active", name: "Excl", symbol: "EA", flags: { pegCurrency: "USD" } },
    { id: "pre-ok", name: "Pre OK", symbol: "PO", status: "pre-launch", flags: { pegCurrency: "USD" } },
    { id: "pre-excl", name: "Pre Excl", symbol: "PE", status: "pre-launch", flags: { pegCurrency: "USD" } },
    { id: "frozen-ok", name: "Frozen OK", symbol: "FO", status: "frozen", obituary: { causeOfDeath: "abandoned", deathDate: "2026-01", epitaph: "e", obituary: "o", sourceUrl: "https://example.com", sourceLabel: "s" }, flags: { pegCurrency: "USD" } },
    { id: "frozen-no-obit", name: "Frozen No Obit", symbol: "FN", status: "frozen", flags: { pegCurrency: "USD" } },
  ];
  const listingDecisions = {
    policyVersion: "2.0",
    listingClassById: {
      "core-a": "core-stablecoin",
      "fund-a": "tokenized-fund",
      "var-a": "stablecoin-variant",
      "extra-active": "review-hold",
      "quar-a": "tokenized-fund",
      "del-a": "excluded",
      "excl-active": "excluded",
      "pre-ok": "core-stablecoin",
      "pre-excl": "excluded",
      "frozen-ok": "core-stablecoin",
      "frozen-no-obit": "core-stablecoin",
    },
  };
  const order = ["fund-a", "core-a", "quar-a", "del-a", "excl-active", "pre-ok", "pre-excl", "frozen-ok", "frozen-no-obit", "var-a"];

  it("emits canonical active non-excluded IDs plus sorted active extras", () => {
    expect(JSON.parse(buildRuntimeActiveIds(coins, order, listingDecisions))).toEqual([
      "fund-a",
      "core-a",
      "var-a",
      "extra-active",
    ]);
  });

  it("emits non-excluded pre-launch and frozen-with-obituary rows in canonical order", () => {
    const slim = JSON.parse(buildRuntimeSlim(coins, order, listingDecisions));
    expect(slim.map((r) => r.id)).toEqual(["pre-ok", "frozen-ok"]);
    expect(slim[0].flags).toEqual({ pegCurrency: "USD" });
    expect(slim[1].obituary).toBeTruthy();
  });
});

describe("virtual:pharosville-listing-policy synced artifact", () => {
  it("loads the synced Policy 2.0 catalog cleanly through Vite with lossless round-trip parity", () => {
    const rawPolicy = JSON.parse(readFileSync(resolve(process.cwd(), "shared/data/stablecoins/listing-policy.json"), "utf8"));
    expect(listingPolicyVirtual).toEqual(rawPolicy);
    expect(listingPolicyVirtual.policyVersion).toBe("2.0");
    expect(listingPolicyVirtual.fundIds.length).toBeGreaterThanOrEqual(10);
    for (const fid of listingPolicyVirtual.fundIds) {
      expect(RUNTIME_ACTIVE_IDS.has(fid)).toBe(true);
      expect(listingPolicyVirtual.funds[fid]).toBeDefined();
      expect(Array.isArray(listingPolicyVirtual.funds[fid].backedIds)).toBe(true);
    }
    for (const id of listingPolicyVirtual.excludedIds) expect(RUNTIME_ACTIVE_IDS.has(id)).toBe(false);
    for (const id of listingPolicyVirtual.frozenIds) expect(RUNTIME_ACTIVE_IDS.has(id)).toBe(false);
  });
});
