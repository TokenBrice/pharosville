import { describe, expect, it } from "vitest";
import { classifyProbe, classifyProxyOutcome, hasStaleWarning, proxyOutcomeRecords, type ProxyEvidence } from "./_outcomes";

const upstream = (status: number): ProxyEvidence => ({ source: "upstream", status, upstreamStatus: status });

describe("proxy outcome classification", () => {
  it.each([
    [{ source: "cache", status: 304 }, ["cache-hit"]],
    [upstream(200), ["upstream-success"]],
    [upstream(404), ["upstream-4xx"]],
    [upstream(503), ["upstream-5xx"]],
    [{ ...upstream(502), errorKind: "timeout" }, ["timeout"]],
    [{ ...upstream(502), errorKind: "fetch-error" }, ["fetch-error"]],
    [{ source: "not-configured", status: 500 }, ["not-configured"]],
    [{ source: "rejected", status: 404 }, ["rejected"]],
    [{ source: "rejected", status: 405 }, ["rejected"]],
    [{ ...upstream(200), upstreamStatus: 503, warning: '110 - "Response is stale"' }, ["upstream-5xx", "stale-fallback"]],
  ] as [ProxyEvidence, string[]][])('classifies %j', (evidence, expected) => {
    expect(classifyProxyOutcome(evidence)).toEqual(expected);
  });

  it("counts upstream status and final response separately, without identifiers", () => {
    const records = proxyOutcomeRecords("stablecoinReserves", { ...upstream(200), upstreamStatus: 503, warning: '110 - "Response is stale"' }, 8_001, 0.99);
    expect(records.map(({ event, outcome, statusClass, sampleRate }) => ({ event, outcome, statusClass, sampleRate }))).toEqual([
      { event: "PHAROSVILLE_PROXY_OUTCOME", outcome: "upstream-5xx", statusClass: "5xx", sampleRate: 1 },
      { event: "PHAROSVILLE_PROXY_OUTCOME", outcome: "stale-fallback", statusClass: "2xx", sampleRate: 1 },
      { event: "PHAROSVILLE_PROXY_RESPONSE", outcome: "response", statusClass: "2xx", sampleRate: 1 },
    ]);
    expect(Object.keys(records[0]!).sort()).toEqual(["endpoint", "event", "latencyBucket", "outcome", "release", "sampleRate", "statusClass"]);
    expect(records[0]).toMatchObject({ endpoint: "stablecoinReserves", latencyBucket: "gte8s", release: expect.stringMatching(/^v\d+\.\d+\.\d+$/) });
  });

  it("samples only normal successes/hits at exactly one percent", () => {
    for (const evidence of [upstream(200), { source: "cache", status: 200 } as const]) {
      expect(proxyOutcomeRecords("chains", evidence, 99, 0.009)).toHaveLength(2);
      expect(proxyOutcomeRecords("chains", evidence, 99, 0.01)).toEqual([]);
      expect(proxyOutcomeRecords("chains", evidence, 99, 0)[0]).toMatchObject({ sampleRate: 0.01, latencyBucket: "lt100ms" });
    }
    for (const evidence of [upstream(403), upstream(500), { source: "not-configured", status: 500 } as const]) {
      expect(proxyOutcomeRecords("chains", evidence, 500, 0.99)).toHaveLength(2);
    }
  });

  it.each([[99, "lt100ms"], [100, "lt1s"], [999, "lt1s"], [1000, "lt8s"], [7999, "lt8s"], [8000, "gte8s"]])("buckets %d ms", (ms, bucket) => {
    expect(proxyOutcomeRecords("chains", upstream(200), Number(ms), 0)[0]?.latencyBucket).toBe(bucket);
  });
});

describe("external probe fixtures", () => {
  it.each([
    [{ status: 200 }, "available"],
    [{ status: 503 }, "unavailable"],
    [{ status: 0 }, "unavailable"],
    [{ status: 200, contentValid: false }, "unavailable"],
    [{ status: 200, warning: '199 - "misc", 110 - "Response is stale"' }, "degraded"],
    [{ status: 200, maxAgeSec: 1800, publicationAgeSec: 1800 }, "available"],
    [{ status: 200, maxAgeSec: 1800, publicationAgeSec: 1801 }, "degraded"],
    [{ status: 200, maxAgeSec: 1800, publicationAgeSec: null }, "degraded"],
    [{ status: 200, maxAgeSec: 1800, publicationAgeSec: -1 }, "degraded"],
    [{ status: 200, maxAgeSec: 1800, publicationAgeSec: NaN }, "degraded"],
    [{ status: 200, maxAgeSec: Infinity, publicationAgeSec: 0 }, "degraded"],
  ] as const)("classifies %j as %s", (input, expected) => {
    expect(classifyProbe(input)).toBe(expected);
  });

  it("does not mistake Warning text or 1100 for the stale code", () => {
    expect(hasStaleWarning('199 - "110 is not a warning code here"')).toBe(false);
    expect(hasStaleWarning('1100 - "misc"')).toBe(false);
  });
});
