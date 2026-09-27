import { describe, expect, it } from "vitest";
import { gardenAlmanacDay, gardenRitualLedgerEntry } from "./garden-almanac";
import { GARDEN_RITUAL_KINDS } from "./garden-director";
import { gardenSkyToday } from "./sky-almanac";

describe("garden almanac", () => {
  it("writes a plain-language, locally timestamped ledger line for every ritual", () => {
    const messages = new Set<string>();
    for (const kind of GARDEN_RITUAL_KINDS) {
      const entry = gardenRitualLedgerEntry({ id: `${kind}:x`, kind, clockHour: 18.1, directorSeconds: 100 }, "2026-09-26");
      expect(entry.timestampLabel).toBe("18:06");
      expect(entry.id.startsWith("2026-09-26:")).toBe(true);
      messages.add(entry.message);
    }
    expect(messages.size).toBe(GARDEN_RITUAL_KINDS.length);
  });

  it("names the kō from the sun, not the month", () => {
    const north = { latitudeRad: (35 * Math.PI) / 180, southern: false };
    expect(gardenAlmanacDay(new Date("2026-09-26T12:00:00Z"), 12, gardenSkyToday(), north).microseason).toBe("Thunder ceases");
    expect(gardenAlmanacDay(new Date("2026-11-15T12:00:00Z"), 12, gardenSkyToday(), north).microseason).not.toBe("Thunder ceases");
  });
});
