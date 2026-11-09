import { describe, expect, it, vi } from "vitest";
import { truthCopy } from "../truth-copy";
import { reportFixture } from "../../__fixtures__/report";
import { browserObservation, createReadingSession, parseObservation, READING_KEY, READING_LIMIT, returnDigest, serializeObservation, type BrowserObservation, type ReadingStorage } from "./digest";

const now = Date.UTC(2026, 10, 8, 12);
function observation(at = now): BrowserObservation {
  const f = reportFixture(() => {}, at);
  return browserObservation(f.model, f.payloads, at)!;
}
function storage(raw: string | null = null): ReadingStorage {
  let value = raw;
  return { getItem: vi.fn(() => value), setItem: vi.fn((_k, v) => { value = v; }), removeItem: vi.fn(() => { value = null; }) };
}
const lines = (previous: BrowserObservation | null, current: BrowserObservation | null) => returnDigest(previous, current).map((r) => r.text);

describe("one bounded browser observation", () => {
  it("has no first-visit comparison, saves once and freezes the prior baseline", () => {
    const prior = observation(now - 86400e3), current = observation();
    const disk = storage(serializeObservation(prior)), session = createReadingSession(() => disk, now);
    expect(session.getSnapshot().prior).toEqual(prior);
    expect(session.save(current)).toBe(true);
    expect(session.getSnapshot().prior).toEqual(prior);
    expect(session.save(observation(now + 1))).toBe(false);
    expect(disk.setItem).toHaveBeenCalledTimes(1);
    expect(disk.setItem).toHaveBeenCalledWith(READING_KEY, serializeObservation(current));
    const first = createReadingSession(() => storage(), now);
    expect(lines(first.getSnapshot().prior, current)).toEqual(["Comparison unavailable."]);
    expect(first.save(current)).toBe(true);
    expect(first.getSnapshot().prior).toBeNull();
    expect(lines(prior, current)[0]).toBe("Compared with this browser's reading at 2026-11-07 12:00:00 UTC.");
  });

  it("treats the old observation schema as no baseline", () => {
    const old = JSON.stringify({ ...observation(), version: 1 });
    expect(createReadingSession(() => storage(old), now).getSnapshot().prior).toBeNull();
    const wire = JSON.parse(serializeObservation(observation()));
    expect(wire.v).toBe(2);
    for (const v of [1, 3]) expect(parseObservation(JSON.stringify({ ...wire, v }), now)).toBeNull();
  });

  it("silently tolerates corrupt records and denied reads/writes/removals", () => {
    for (const raw of ["{", "null", "[]", "{}", JSON.stringify({ ...observation(), version: 3 })]) {
      expect(createReadingSession(() => storage(raw), now).getSnapshot().prior).toBeNull();
    }
    const denied = createReadingSession(() => { throw new Error("denied"); }, now);
    expect(denied.getSnapshot().unavailable).toBe(true);
    expect(denied.save(observation())).toBe(false);
    expect(() => denied.forget()).not.toThrow();
    const disk = storage(serializeObservation(observation(now - 1)));
    disk.setItem = () => { throw new Error("quota"); };
    disk.removeItem = () => { throw new Error("denied"); };
    const session = createReadingSession(() => disk, now);
    expect(session.save(observation())).toBe(false);
    expect(session.getSnapshot().unavailable).toBe(true);
    expect(lines(session.getSnapshot().unavailable ? null : session.getSnapshot().prior, observation())).toEqual(["Comparison unavailable."]);
    expect(() => session.forget()).not.toThrow();
    expect(session.getSnapshot().prior).toBeNull();
  });

  it("rejects oversized UTF-8, malformed, non-finite, future, duplicate and inconsistent records", () => {
    expect(parseObservation(" ".repeat(READING_LIMIT + 1), now)).toBeNull();
    expect(parseObservation("é".repeat(READING_LIMIT / 2 + 1), now)).toBeNull();
    const bad: Array<(r: BrowserObservation) => void> = [
      (r) => { r.savedAt = now + 1; },
      (r) => { r.sourceTimes.stability = now + 1; },
      (r) => { r.psi.date = now + 1; },
      (r) => { r.psi.score = Infinity; },
      (r) => { r.psi.score = -1; },
      (r) => { r.psi.method = " "; },
      (r) => { r.supply.push(r.supply[0]); },
      (r) => { r.pegs.push(r.pegs[0]); },
      (r) => { r.supply[0].usd = -1; },
      (r) => { r.supply[0].buckets = ["same", "same"]; },
      (r) => { r.pegs[0].id = "outside-supply"; },
      (r) => { r.supply = []; },
    ];
    for (const mutate of bad) { const record = observation(); mutate(record); expect(parseObservation(serializeObservation(record), now)).toBeNull(); }
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const disk = storage(), session = createReadingSession(() => disk, now);
    expect(session.save(observation(now + 1))).toBe(false);
    expect(disk.setItem).not.toHaveBeenCalled();
    clock.mockRestore();
  });

  it("round-trips interned identities and rejects broken references and unknown fields", () => {
    const record = observation();
    record.supply[0].buckets = ["peggedUSD", "peggedEUR"];
    record.pegs[0].method = "peg-row-2";
    const raw = serializeObservation(record);
    expect(parseObservation(raw, now)).toEqual(record);
    const mutations = [
      (w: Record<string, unknown>) => { w.g = 999; },
      (w: Record<string, unknown>) => { (w.p as unknown[])[3] = 999; },
      (w: Record<string, unknown>) => { (w.e as unknown[][])[0][0] = 999; },
      (w: Record<string, unknown>) => { (w.e as unknown[][])[0][2] = 999; },
      (w: Record<string, unknown>) => { (w.c as unknown[][])[0][3] = 999; },
      (w: Record<string, unknown>) => { w.extra = true; },
    ];
    for (const mutate of mutations) {
      const wire = JSON.parse(raw) as Record<string, unknown>;
      mutate(wire);
      expect(parseObservation(JSON.stringify(wire), now)).toBeNull();
    }
  });

  it("records admitted current coherent sources only, preserving zero and null supply", () => {
    const f = reportFixture();
    f.model.hasFleet = false;
    expect(browserObservation(f.model, f.payloads, now)).toBeNull();
    f.model.hasFleet = true;
    for (const key of ["stablecoins", "stability", "pegSummary"] as const) {
      f.model.truth[key].state = "stale";
      expect(browserObservation(f.model, f.payloads, now)).toBeNull();
      f.model.truth[key].state = "current";
    }
    f.payloads.stability!.fetchedAtMs!++;
    expect(browserObservation(f.model, f.payloads, now)).toBeNull();
    const zero = reportFixture((u) => {
      const rows = u.stablecoins.peggedAssets as Array<Record<string, unknown>>;
      rows[0].circulating = { peggedUSD: 0 }; rows[1].circulating = { peggedUSD: null };
      (u.stability.current as Record<string, unknown>).score = 0;
    });
    const record = browserObservation(zero.model, zero.payloads, now)!;
    expect(record.psi.score).toBe(0);
    expect(record.supply.find((r) => r.id === "usdc-circle")!.usd).toBe(0);
    expect(record.supply.find((r) => r.id === "tether")!.usd).toBeNull();
    zero.model.readings.psi.score = null;
    expect(browserObservation(zero.model, zero.payloads, now)).toBeNull();
    expect(browserObservation(null, {}, now)).toBeNull();
  });

  it("keeps sanitized incomplete supply out of saved totals and digest movers", () => {
    const f = reportFixture((u) => { (u.stablecoins.peggedAssets as Array<Record<string, unknown>>)[0].circulating = { peggedUSD: 10e6, peggedEUR: null }; });
    const current = browserObservation(f.model, f.payloads, now)!;
    expect(current.supply.find((r) => r.id === "usdc-circle")!.usd).toBeNull();
    expect(parseObservation(serializeObservation(current), now)).toEqual(current);
    const prior = observation(now - 1);
    prior.supply.find((r) => r.id === "usdc-circle")!.usd = 8e6;
    expect(lines(prior, current).some((s) => s.startsWith("USDC:"))).toBe(false);
    expect(lines(prior, current)).toContain("1 coins lack a comparable reading.");
  });

  it("never compares PSI when either input coverage is degraded or unknown, even if flags match", () => {
    for (const field of ["dewsUnavailable", "depegEventsUnavailable"] as const) {
      for (const degradation of [true, null]) {
        for (const side of ["prior", "current", "both"]) {
          const prior = observation(now - 1), current = observation();
          if (side !== "current") prior.psi[field] = degradation;
          if (side !== "prior") current.psi[field] = degradation;
          const line = lines(prior, current).find((s) => s.startsWith("PSI"))!;
          expect(line).toContain("PSI comparison unavailable.");
          if (degradation === true) expect(line).toContain(truthCopy({ kind: "psi-qualification", [field]: true }));
        }
      }
    }
    const f = reportFixture((u) => { delete (u.stability.current as Record<string, unknown>).inputDegradation; });
    expect(browserObservation(f.model, f.payloads, now)!.psi.dewsUnavailable).toBeNull();
  });

  it("compares only compatible PSI and peg methods/coverage; reports coverage separately", () => {
    const prior = observation(now - 86400e3), current = observation();
    prior.psi.score = 0; current.psi.score = 1;
    expect(lines(prior, current).some((s) => s.includes("+1.0 points."))).toBe(true);
    current.psi.method = "psi-2"; current.pegMethod = "peg-2";
    expect(lines(prior, current)).toContain("PSI comparison unavailable.");
    expect(lines(prior, current)).toContain("Off-peg comparison unavailable.");
    current.psi.method = `${prior.psi.method} `;
    const untrimmed = parseObservation(serializeObservation(current), now)!;
    expect(untrimmed.psi.method).toBe(current.psi.method);
    expect(lines(prior, untrimmed)).toContain("PSI comparison unavailable.");
    current.psi.method = prior.psi.method; current.psi.dewsUnavailable = true;
    expect(lines(prior, current).find((s) => s.startsWith("PSI"))).toContain("PSI comparison unavailable.");
    current.pegMethod = prior.pegMethod;
    current.pegs[0].method = "peg-row-2";
    expect(lines(prior, current)).toContain("Off-peg comparison unavailable.");
    current.pegs = [{ ...prior.pegs[0], offPeg: true }, { id: "new", offPeg: true, method: "peg-1" }];
    current.supply = [current.supply[0], { id: "new", symbol: "NEW", usd: 2e6, buckets: ["peggedUSD"] }];
    expect(lines(prior, current)).toContain("Off-peg coins among 1 comparable covered coins: 0 in the saved reading; 1 in this reading.");
    expect(lines(prior, current)).toContain("Coverage changes: 1 added and 1 removed supply IDs; 1 added and 0 removed covered peg IDs.");
    expect(lines(prior, current).join(" ")).not.toMatch(/while.*away|entered|left|issued|minted/);
    expect(lines(current, prior)).toEqual(["Comparison unavailable."]);
  });

  it("ranks at most three matched complete supply differences, suppresses null/bucket changes and keeps zeros", () => {
    const prior = observation(now - 1), current = observation();
    prior.supply = ["z", "d", "b", "a", "null", "bucket"].map((id) => ({ id, symbol: id, usd: id === "null" ? null : 0, buckets: ["peggedUSD"] }));
    current.supply = prior.supply.map((r) => ({ ...r, usd: 1e6, buckets: r.id === "bucket" ? ["peggedEUR"] : r.buckets }));
    const movers = returnDigest(prior, current).filter((r) => r.text.endsWith("reported USD supply value."));
    expect(movers.map((r) => r.text)).toEqual(["a: +$1.00M reported USD supply value.", "b: +$1.00M reported USD supply value.", "d: +$1.00M reported USD supply value."]);
    expect(movers.every((r) => !r.inputs.some(([key]) => key.includes("%")))).toBe(true);
  });

  it("forgets disk and frozen baseline and prevents this visit from silently saving it again", () => {
    const disk = storage(serializeObservation(observation(now - 1))), session = createReadingSession(() => disk, now), fn = vi.fn();
    const unsubscribe = session.subscribe(fn);
    session.forget();
    expect(disk.removeItem).toHaveBeenCalledWith(READING_KEY);
    expect(session.getSnapshot().prior).toBeNull();
    expect(session.canSave()).toBe(false);
    expect(session.save(observation())).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("benchmarks UTF-8 size and the validated serialization/save of a full 625-coin fleet with 350 covered peg rows", () => {
    const f = reportFixture((u) => {
      const base = (u.stablecoins.peggedAssets as Array<Record<string, unknown>>)[0];
      u.stablecoins.peggedAssets = Array.from({ length: 625 }, (_, i) => ({ ...base, id: `stablecoin-test-coin-${i}`, symbol: `C${i}`, circulating: { peggedUSD: i * 1e6 } })) as typeof u.stablecoins.peggedAssets;
      u.pegSummary.coins = Array.from({ length: 350 }, (_, i) => ({ id: `stablecoin-test-coin-${i}`, currentDeviationBps: 0, activeDepeg: false, pegScore: 100, methodologyVersion: "peg-1" }));
    });
    const record = browserObservation(f.model, f.payloads, now)!;
    expect(record).not.toBeNull();
    const serialized = serializeObservation(record), bytes = new TextEncoder().encode(serialized).byteLength;
    const timings: number[] = [];
    for (let i = 0; i < 20; i++) {
      const disk = storage(), session = createReadingSession(() => disk, now), start = performance.now();
      expect(session.save(browserObservation(f.model, f.payloads, now)!)).toBe(true);
      timings.push(performance.now() - start);
    }
    const maxMs = Math.max(...timings);
    console.info(`digest benchmark: ${bytes} UTF-8 bytes; capture/validate/serialize/save max ${maxMs.toFixed(3)} ms (20 in-memory Storage writes)`);
    expect(record.supply).toHaveLength(625);
    expect(record.pegs).toHaveLength(350);
    expect(parseObservation(serialized, now)).toEqual(record);
    expect(bytes).toBeLessThanOrEqual(READING_LIMIT - 8 * 1024);
    expect(maxMs).toBeLessThan(50);
  });
});
