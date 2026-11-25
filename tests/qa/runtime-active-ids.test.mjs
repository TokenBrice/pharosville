import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildRuntimeActiveIds, RUNTIME_ACTIVE_IDS as ACTIVE_IDS_PATH } from "../../scripts/harbour/sync-check.mjs";
import { LISTING_POLICY_PATH } from "../../scripts/harbour/sync-listing-policy.mjs";
import { RUNTIME_ACTIVE_IDS as clientIds } from "../../shared/lib/stablecoins/runtime-active-ids";

describe("compact client active IDs", () => {
  it("matches the synced Policy 2.0 active ID list and excludes frozen/excluded rows", () => {
    const ids = JSON.parse(readFileSync(new URL(`../../${ACTIVE_IDS_PATH}`, import.meta.url), "utf8"));
    const policy = JSON.parse(readFileSync(new URL(`../../${LISTING_POLICY_PATH}`, import.meta.url), "utf8"));
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBeGreaterThan(200);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...clientIds]).toEqual(ids);
    for (const id of policy.fundIds) expect(clientIds.has(id)).toBe(true);
    for (const id of policy.excludedIds) expect(clientIds.has(id)).toBe(false);
    for (const id of policy.frozenIds) expect(clientIds.has(id)).toBe(false);
  });

  it("uses canonical order, excludes missing/pre-launch/frozen/excluded rows, and admits an absent status", () => {
    const coins = [
      { id: "active" },
      { id: "pre", status: "pre-launch" },
      { id: "frozen", status: "frozen" },
      { id: "delisted", status: "delisted" },
      { id: "untracked" },
      { id: "explicit", status: "active" },
      { id: "excluded-coin", status: "active" },
    ];
    expect(JSON.parse(buildRuntimeActiveIds(coins, ["explicit", "pre", "missing", "active", "frozen"]))).toEqual(["explicit", "active"]);
    expect(JSON.parse(buildRuntimeActiveIds(
      coins,
      ["explicit", "pre", "missing", "active", "frozen", "delisted", "excluded-coin"],
      { listingClassById: { "excluded-coin": "excluded" } },
    ))).toEqual(["explicit", "active", "untracked"]);
  });
});
