import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildRuntimeActiveIds, RUNTIME_ACTIVE_IDS as ACTIVE_IDS_PATH } from "../../scripts/harbour/sync-check.mjs";
import { RUNTIME_ACTIVE_IDS } from "../../shared/lib/stablecoins/runtime-registry";
import { RUNTIME_ACTIVE_IDS as clientIds } from "../../shared/lib/stablecoins/runtime-active-ids";

describe("compact client active IDs", () => {
  it("matches the full runtime registry and the generated file exactly", () => {
    const text = readFileSync(new URL(`../../${ACTIVE_IDS_PATH}`, import.meta.url), "utf8");
    expect(text).toBe(buildRuntimeActiveIds());
    expect(JSON.parse(text)).toEqual([...RUNTIME_ACTIVE_IDS]);
    expect([...clientIds]).toEqual([...RUNTIME_ACTIVE_IDS]);
  });

  it("uses canonical order, excludes missing/pre-launch/frozen rows, and admits an absent status", () => {
    const coins = [{ id: "active" }, { id: "pre", status: "pre-launch" }, { id: "frozen", status: "frozen" }, { id: "untracked" }, { id: "explicit", status: "active" }];
    expect(JSON.parse(buildRuntimeActiveIds(coins, ["explicit", "pre", "missing", "active", "frozen"]))).toEqual(["explicit", "active"]);
  });
});
