import { describe, expect, it } from "vitest";
import { gardenAnniversaryEvening, gardenAnniversaryLedgerLine } from "./garden-anniversary";

const falls = [
  { deathDate: "2022-05", name: "TerraUSD", peakMcap: 18_770_000_000 },
  { deathDate: "2023-05", name: "Small Coin", peakMcap: 2_000_000 },
  { deathDate: "2021-06", name: "Iron", peakMcap: 2_000_000_000 },
  { deathDate: "2019-05", name: "No Peak" },
];

describe("gardenAnniversaryEvening", () => {
  it("keeps the first evening of a month in which coins fell, largest first", () => {
    expect(gardenAnniversaryEvening(new Date(2026, 4, 1), 21, falls)).toEqual({
      month: 5,
      names: ["TerraUSD", "Small Coin", "No Peak"],
    });
  });

  it("is dark on every other evening of that month", () => {
    expect(gardenAnniversaryEvening(new Date(2026, 4, 2), 21, falls)).toBeNull();
    expect(gardenAnniversaryEvening(new Date(2026, 4, 31), 21, falls)).toBeNull();
  });

  it("runs the evening from noon to noon, so the small hours belong to the night before", () => {
    // 03:00 on the 2nd is still the 1st's evening; 03:00 on the 1st is the 30th's.
    expect(gardenAnniversaryEvening(new Date(2026, 4, 2), 3, falls)?.month).toBe(5);
    expect(gardenAnniversaryEvening(new Date(2026, 4, 1), 3, falls)).toBeNull();
    expect(gardenAnniversaryEvening(new Date(2026, 4, 1), 12, falls)?.month).toBe(5);
  });

  it("keeps nothing in a month in which nothing fell, or for unreadable dates", () => {
    expect(gardenAnniversaryEvening(new Date(2026, 6, 1), 21, falls)).toBeNull();
    expect(gardenAnniversaryEvening(new Date(2026, 4, 1), 21, [{ deathDate: "2022", name: "Undated" }])).toBeNull();
  });
});

describe("gardenAnniversaryLedgerLine", () => {
  it("carries the month and who is remembered, since the world shows no text", () => {
    const single = gardenAnniversaryLedgerLine({ month: 6, names: ["Iron"] });
    expect(single).toContain("June");
    expect(single).toContain("Iron");
    const many = gardenAnniversaryLedgerLine({ month: 5, names: ["TerraUSD", "Small Coin"] });
    expect(many).toContain("May");
    expect(many).toContain("TerraUSD");
    expect(many).toContain("2 stablecoins");
  });
});
