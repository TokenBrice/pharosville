import { describe, expect, it } from "vitest";
import { analyticalRouteHref } from "./route-links";

describe("analyticalRouteHref", () => {
  it("keeps local implemented routes local", () => {
    expect(analyticalRouteHref("/")).toBe("/");
  });

  it("sends analytical routes to the canonical Pharos Watch host", () => {
    expect(analyticalRouteHref("/stablecoins/")).toBe("https://pharos.watch/stablecoins/");
    expect(analyticalRouteHref("/chains/ethereum/")).toBe("https://pharos.watch/chains/ethereum/");
  });

  it("does not rewrite already absolute links", () => {
    expect(analyticalRouteHref("https://example.com/report")).toBe("https://example.com/report");
    expect(analyticalRouteHref("//example.com/report")).toBe("//example.com/report");
  });
});
