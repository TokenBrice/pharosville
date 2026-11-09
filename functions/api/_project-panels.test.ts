import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { panelUpstreamFixtures, PANEL_COIN_ID } from "../../src/harbour/__fixtures__/panels";
import { PHAROSVILLE_PANEL_ENDPOINT_KEYS, panelEndpointPath, allowedPanelEndpoint } from "../../shared/lib/pharosville-panel-endpoints";
import { PHAROSVILLE_PANEL_SCHEMAS } from "../../shared/types/pharosville-panels";
import { PHAROSVILLE_SMOKE_PANEL_ENDPOINTS, PHAROSVILLE_PANEL_BLOCKED_404_PATHS } from "../../shared/lib/pharosville-smoke-matrix";
import { RUNTIME_ACTIVE_IDS } from "../../shared/lib/stablecoins/runtime-registry";
import { panelEndpointProjector } from "./_project-panels";

describe("on-demand panel contract", () => {
  it.each(PHAROSVILLE_PANEL_ENDPOINT_KEYS)("projects upstream-schema-fed %s without mutation or healthy defaults", (key) => {
    const input = panelUpstreamFixtures()[key];
    const original = structuredClone(input);
    const projected = panelEndpointProjector(key)(input);
    expect(PHAROSVILLE_PANEL_SCHEMAS[key].safeParse(projected).success).toBe(true);
    expect(input).toEqual(original);
    expect(panelEndpointProjector(key)(projected)).toEqual(projected);
    expect(panelEndpointProjector(key)(null)).toBeNull();
    expect(panelEndpointProjector(key)({})).toEqual({});
    const gzipBytes = gzipSync(JSON.stringify(projected)).byteLength;
    process.stdout.write(`[panel projection] ${key}: ${gzipBytes} gzip bytes\n`);
    expect(gzipBytes).toBeLessThanOrEqual(key === "dexLiquidity" ? 30_000 : 10_000);
  });

  it("preserves ongoing/empty events, null and absent evidence", () => {
    const project = panelEndpointProjector("depegEvents");
    const events = PHAROSVILLE_PANEL_SCHEMAS.depegEvents.parse(project(panelUpstreamFixtures().depegEvents));
    expect(events.events[0].endedAt).toBeNull();
    expect(project({ events: [], total: 0 })).toEqual({ events: [], total: 0 });
    expect(project({ events: null, methodology: null })).toEqual({ events: null, methodology: null });
    expect(panelEndpointProjector("stablecoinReserves")({ liveAt: null, reserves: null, sync: null, provenance: null, metadata: null, displayUrl: null, evidenceUrls: null }))
      .toEqual({ liveAt: null, reserves: null, sync: null, provenance: null, metadata: null, displayUrl: null, evidenceUrls: null });
    expect(panelEndpointProjector("dexLiquidity")({ [PANEL_COIN_ID]: null, _meta: null })).toEqual({ [PANEL_COIN_ID]: null, _meta: null });
  });

  it("drops unsafe links and unrelated upstream fields", () => {
    const projected = panelEndpointProjector("stablecoinReserves")({ ...panelUpstreamFixtures().stablecoinReserves,
      displayUrl: "javascript:alert(1)", evidenceUrls: ["https://circle.com/evidence", "http://circle.com", "//circle.com", "data:text/html,test", "https://user:pass@circle.com/"], source: "not retained",
    });
    expect(projected).not.toHaveProperty("source");
    expect(projected).not.toHaveProperty("displayUrl");
    expect(projected).toHaveProperty("evidenceUrls", ["https://circle.com/evidence"]);
    expect(PHAROSVILLE_PANEL_SCHEMAS.stablecoinReserves.safeParse(projected).success).toBe(true);
    expect(PHAROSVILLE_PANEL_SCHEMAS.stablecoinReserves.safeParse({ ...projected as object, displayUrl: "http://circle.com" }).success).toBe(false);
    expect(panelEndpointProjector("dexLiquidity")({ unknown: {}, _meta: null })).toEqual({ _meta: null });
  });

  it("keeps the canary paths canonical and validates every active subject", () => {
    expect(PHAROSVILLE_PANEL_ENDPOINT_KEYS.map((key) => panelEndpointPath(key, PANEL_COIN_ID))).toEqual(PHAROSVILLE_SMOKE_PANEL_ENDPOINTS);
    for (const id of RUNTIME_ACTIVE_IDS) for (const key of PHAROSVILLE_PANEL_ENDPOINT_KEYS) {
      const path = panelEndpointPath(key, id)!;
      expect(allowedPanelEndpoint(path)).toMatchObject({ key, path });
    }
    expect(panelEndpointPath("depegEvents", "unknown")).toBeNull();
    expect(panelEndpointPath("stablecoinReserves", "USDC-CIRCLE")).toBeNull();
  });
  it.each(PHAROSVILLE_PANEL_BLOCKED_404_PATHS)("rejects the raw path %s", (path) => {
    expect(allowedPanelEndpoint(path)).toBeNull();
  });
});
