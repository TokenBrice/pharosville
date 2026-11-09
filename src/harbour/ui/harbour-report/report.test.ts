import { describe, expect, it } from "vitest";
import { reportFixture } from "../../__fixtures__/report";
import type { ProjectionJson } from "../../../../functions/api/_project";
import { completeSupply, harbourReport } from "./report";

function report(f = reportFixture(), days: 1 | 7 = 1) { return harbourReport(f.model, f.payloads, days, f.nowMs); }
const texts = (f = reportFixture(), days: 1 | 7 = 1) => report(f, days).map((r) => r.text);
function supplyRows(u: ReturnType<typeof reportFixture>["upstream"]) { return u.stablecoins.peggedAssets as Array<Record<string, ProjectionJson>>; }

describe("projected harbour report", () => {
  it("uses matched complete buckets, binding templates and ID ties for daily and weekly comparisons", () => {
    const f = reportFixture();
    expect(texts(f)).toContain("Reported USD supply value changed by $0 across 2 comparable coins.");
    expect(texts(f).filter((s) => s.includes(":") && s.includes("reported USD supply"))).toEqual(["USDT: −$2.00M reported USD supply value.", "USDC: +$2.00M reported USD supply value."]);
    expect(texts(f, 7)).toContain("Reported USD supply value changed by +$3.00M across 2 comparable coins.");
    expect(texts(f)).toContain("0 coins lack a comparable reading.");
    const evidence = report(f)[0].inputs;
    expect(evidence).toContainEqual(["Previous total USD supply value", "15000000"]);
    expect(evidence).toContainEqual(["Current total USD supply value", "15000000"]);
    expect(evidence).toContainEqual(["Source updated (UTC)", "2026-11-08 11:59:00 UTC"]);
    expect(evidence).toContainEqual(["Comparison bucket", "circulatingPrevDay"]);
  });

  it("retains real zero, withholds null/absent/mismatched/incomplete buckets and never supplies a percent from zero", () => {
    const f = reportFixture((u) => {
      const rows = supplyRows(u);
      rows[0].circulatingPrevDay = { peggedUSD: 0 };
      rows[1].circulating = { peggedUSD: null };
      rows.push({ ...rows[0], id: "missing", circulatingPrevDay: null });
      rows.push({ ...rows[0], id: "different", circulatingPrevDay: { peggedEUR: 0 } });
      rows.push({ ...rows[0], id: "empty", circulatingPrevDay: {} });
    });
    expect(texts(f)).toContain("Reported USD supply value changed by +$10.0M across 1 comparable coins.");
    expect(texts(f)).toContain("4 coins lack a comparable reading.");
    expect(report(f)[0].inputs.some(([label]) => label.includes("%"))).toBe(false);
    expect(report(f).find((r) => r.text.startsWith("USDC:"))!.inputs.some(([label]) => label.includes("%"))).toBe(false);
    expect(completeSupply({ peggedUSD: 0 })).toBe(0);
    for (const value of [{ peggedUSD: NaN }, { peggedUSD: Infinity }, { peggedUSD: -1 }, { peggedUSD: 1, peggedEUR: null }, {}, null]) expect(completeSupply(value)).toBeNull();
  });

  it("does not double count duplicate IDs, fabricate totals without comparisons, or overflow", () => {
    const f = reportFixture((u) => {
      const rows = supplyRows(u);
      rows.push({ ...rows[0] });
      rows[1].circulatingPrevDay = null;
    });
    expect(texts(f)[0]).toBe("Comparison unavailable.");
    expect(texts(f)).toContain("3 coins lack a comparable reading.");
    expect(completeSupply({ a: Number.MAX_VALUE, b: Number.MAX_VALUE })).toBeNull();
    const huge = reportFixture((u) => { for (const r of supplyRows(u)) { r.circulating = { peggedUSD: Number.MAX_VALUE }; r.circulatingPrevDay = { peggedUSD: 0 }; } });
    expect(texts(huge)[0]).toBe("Comparison unavailable.");
  });

  it("ranks at most three absolute movers at the inclusive threshold with deterministic ties", () => {
    const f = reportFixture((u) => {
      const base = supplyRows(u)[0];
      u.stablecoins.peggedAssets = ["z", "d", "b", "a", "small"].map((id) => ({ ...base, id, symbol: id, circulating: { peggedUSD: id === "small" ? 999999 : 1e6 }, circulatingPrevDay: { peggedUSD: 0 } }));
    });
    expect(texts(f).filter((s) => s.endsWith("reported USD supply value."))).toEqual(["a: +$1.00M reported USD supply value.", "b: +$1.00M reported USD supply value.", "d: +$1.00M reported USD supply value."]);
  });

  it("cites actual PSI dates and refuses missing requested dates or incompatible/unknown methods", () => {
    const f = reportFixture();
    expect(texts(f)).toContain("PSI changed by +1.0 points between 2026-11-07 11:59:00 UTC and 2026-11-08 11:59:00 UTC.");
    expect(texts(f, 7)).toContain("PSI changed by +11.0 points between 2026-11-01 11:59:00 UTC and 2026-11-08 11:59:00 UTC.");
    for (const method of ["psi-2", null, ""]) {
      const mismatch = reportFixture((u) => { (u.stability.history as Array<Record<string, ProjectionJson>>)[1].methodologyVersion = method; });
      expect(texts(mismatch)).toContain("PSI comparison unavailable.");
    }
    const sparse = reportFixture((u) => { u.stability.history = (u.stability.history as ProjectionJson[]).slice(0, 1); });
    expect(texts(sparse)).toContain("PSI comparison unavailable.");
    expect(texts(sparse, 7).some((s) => s.startsWith("PSI changed by"))).toBe(true);
  });

  it("reuses A08 qualifiers for all coverage statuses, withheld net and seven-day valuation/history", () => {
    for (const status of ["partial-history", "bootstrapping", "lagging", "disabled", "unknown"]) {
      const f = reportFixture((u) => {
        const coin = (u.mintBurn.coins as Array<Record<string, ProjectionJson>>)[0];
        (coin.coverage as Record<string, ProjectionJson>).status = status;
      });
      const line = texts(f).at(-1)!;
      expect(line).toContain(status === "lagging" ? "Flow coverage is lagging." : status === "disabled" || status === "unknown" ? "Flow reading unavailable." : "Partial history");
      expect(line).not.toContain("$0");
    }
    const partial = reportFixture((u) => {
      const coin = (u.mintBurn.coins as Array<Record<string, ProjectionJson>>)[0];
      coin.netFlow24hUsd = null; coin.netFlow7dUsd = null;
      coin.valuation = { window24h: { completeness: "partial" }, netFlow7d: "partial" };
    });
    expect(texts(partial).at(-1)).toBe("Reported flow across Ethereum over 24 hours: Net unavailable: some events lack USD valuation.");
    expect(texts(partial, 7).at(-1)).toContain("Net unavailable: some events lack USD valuation.");
    const unknown = reportFixture((u) => { (u.mintBurn.coins as Array<Record<string, ProjectionJson>>)[0].valuation = { window24h: { completeness: "unknown" } }; });
    expect(texts(unknown).at(-1)).toContain("Valuation completeness is unknown.");
    const short = reportFixture((u) => { const c = (u.mintBurn.coins as Array<Record<string, ProjectionJson>>)[0].coverage as Record<string, ProjectionJson>; c.historyStartAt = fNow() / 1000 - 86400; });
    expect(texts(short, 7).at(-1)).toContain("Partial history");
    expect(texts().at(-1)).toBe("Reported flow across Ethereum over 24 hours: $0 net flow.");
  });

  it("does not invent a flow scope and suppresses comparisons for stale or not-yet-installed readings", () => {
    const f = reportFixture((u) => { delete u.mintBurn.scope; });
    expect(texts(f).at(-1)).toContain("Flow scope is unavailable.");
    const other = reportFixture();
    other.model.truth.stablecoins.state = "stale";
    other.model.truth.stability.state = "stale";
    other.model.truth.mintBurn.state = "stale";
    expect(texts(other)[0]).toBe("Comparison unavailable.");
    expect(texts(other)).toContain("PSI comparison unavailable.");
    expect(texts(other).at(-1)).toContain("Flow reading unavailable.");
    const pending = reportFixture();
    pending.payloads.stablecoins!.fetchedAtMs!++;
    expect(texts(pending)[0]).toBe("Comparison unavailable.");
    const aged = harbourReport(pending.model, pending.payloads, 1, pending.nowMs + 10 * 86400e3);
    expect(aged[0].text).toBe("Comparison unavailable.");
    expect(aged[0].inputs.find(([name]) => name === "Reading state")?.[1]).toBe("Supply: stale. Last observed 2026-11-08 11:59:00 UTC.");
  });
});
function fNow() { return Date.UTC(2026, 10, 8, 12); }
