import { describe, expect, it } from "vitest";
import { bornOf, causeFamily, cemeteryUrl, daysSinceDeath, deadRecord, deadRecords, deadSummaries, FAMILIES, installDeadRecords } from "./obituary";
import dead from "@shared/data/dead-stablecoins.json";
import type { DeadStablecoin } from "@shared/types/market";
import scenery from "virtual:pharosville-cemetery";
import { wrecks } from "./readings";

describe("the dead, as Wreck Cove tells them", () => {
  const rec = deadSummaries();
  const bySym = (s: string, year?: string) => [...rec.values()].find((r) => r.symbol === s && (!year || r.deathDate.startsWith(year)))!;

  it("sorts every dead coin into a cause family", () => {
    expect(rec.size).toBeGreaterThanOrEqual(88);
    for (const r of rec.values()) expect(FAMILIES[r.family]).toBeDefined();
    expect(bySym("UST").family).toBe("spiral");
    expect(bySym("BUSD").family).toBe("decree");
    expect(bySym("FEI").family).toBe("wind-down"); // a hack hastened a vote to close: still a wind-down
    expect(bySym("CASH", "2022").family).toBe("exploit"); // infinite mint
    expect(bySym("USDC.m").family).toBe("counterparty");
    expect(bySym("VAI").family).toBe("run");
    expect(bySym("MOD").family).toBe("run"); // survived its exploit (funds recovered), then drained away
  });

  it("projects exactly the same wreck forms, order, sizes and hover records without narrative text", () => {
    expect(wrecks(scenery)).toEqual(wrecks(dead as DeadStablecoin[]));
    expect(scenery.every((d) => !("obituary" in d) && !("sourceUrl" in d))).toBe(true);
    for (const d of dead as DeadStablecoin[]) {
      const { obituary: _obituary, sourceUrl: _url, sourceLabel: _label, ...summary } = deadRecord(d);
      expect(rec.get(d.id)).toEqual(summary);
    }
  });

  it("installs complete narratives before detail panels mount", () => {
    installDeadRecords(dead as DeadStablecoin[]);
    expect([...deadRecords().values()]).toEqual((dead as DeadStablecoin[]).map(deadRecord));
  });

  it("reads the families from the data's cause and the obituary's own words", () => {
    expect(causeFamily({ id: "x", causeOfDeath: "liquidity-drain", obituary: "A flash loan exploit in 2023 drained $8.5M." })).toBe("exploit");
    expect(causeFamily({ id: "x", causeOfDeath: "algorithmic-failure", obituary: "Traders exploited the gap between price and collateral." })).toBe("spiral");
    expect(causeFamily({ id: "x", causeOfDeath: "abandoned", obituary: "An $80M hack sealed its fate." })).toBe("wind-down");
  });

  it("states a launch only where the obituary does", () => {
    expect(bornOf("One of the first stablecoins ever created (2014), NuBits held its peg.", "2018-03")).toBe("2014");
    expect(bornOf("Launched in late 2021 as agEUR.", "2026-03")).toBe("late 2021");
    expect(bornOf("It launched in April 2022 on NEAR.", "2022-10")).toBe("April 2022");
    expect(bornOf("Collapsed when holders dumped it.", "2018-03")).toBeNull();
    expect(bornOf("Launched in 2027, somehow.", "2022-10")).toBeNull();
  });

  it("links each grave on pharos.watch and reads month-only dates generously", () => {
    expect(cemeteryUrl("ust-terrausd-2022-05")).toBe("https://pharos.watch/cemetery/#ust-terrausd-2022-05");
    expect(daysSinceDeath("2026-09", Date.UTC(2026, 9, 14))).toBe(14);
    expect(daysSinceDeath("2026-10-01", Date.UTC(2026, 9, 14))).toBe(13);
    expect(daysSinceDeath("unknown", Date.UTC(2026, 9, 14))).toBeNull();
  });
});
