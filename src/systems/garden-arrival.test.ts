import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dayCycleBeats, type DayCycleBeatName } from "./day-cycle-beats";
import { sampleGardenArrivalCeremonyPose } from "./garden-arrival";
import { gardenSkyDay, gardenSkyLatitudeForZone } from "./sky-almanac";

const INDEX_HTML = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const VEIL_SCRIPT = /<script>([\s\S]*?)<\/script>/.exec(INDEX_HTML)![1]!;

/** Runs the inline veil script against a stub page; returns the beat it painted. */
function inlineVeilBeat(hash: string, timeZone: string): string | null {
  const attributes = new Map<string, string>();
  const root = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  };
  const intl = { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone }) }) };
  const location = { hash, hostname: "localhost", search: "" };
  new Function("location", "document", "Intl", VEIL_SCRIPT)(location, { documentElement: root }, intl);
  return attributes.get("data-pv-veil-beat") ?? null;
}

function dominantBeat(beats: Record<DayCycleBeatName, number>): DayCycleBeatName {
  let beat: DayCycleBeatName = "day";
  for (const name of Object.keys(beats) as DayCycleBeatName[]) if (beats[name] > beats[beat]) beat = name;
  return beat;
}

describe("garden arrival (K17)", () => {
  it("authors an eight-to-twelve-second ceremony with a deterministic reduced-motion mid-pose", () => {
    expect(sampleGardenArrivalCeremonyPose(0, 10)).toEqual({
      compression: 1,
      ensoWake: 0,
      sailDip: 0,
    });
    const middle = sampleGardenArrivalCeremonyPose(5, 10);
    expect(middle.compression).toBeCloseTo(0.84);
    expect(middle.sailDip).toBe(1);
    expect(sampleGardenArrivalCeremonyPose(99, 10)).toEqual({
      compression: 1,
      ensoWake: 0,
      sailDip: 0,
    });
    expect(sampleGardenArrivalCeremonyPose(0, 8, true)).toEqual(middle);
  });
});

describe("inline hour veil (index.html, K17)", () => {
  it("paints the same beat as the sky clock for the zone, date and hour", () => {
    const zones = ["Europe/Paris", "Africa/Johannesburg", "Australia/Perth", "America/Lima", "Asia/Tokyo"];
    const days = ["2026-06-21", "2026-09-26", "2026-12-21"];
    for (const zone of zones) {
      for (const day of days) {
        const [year, month, date] = day.split("-").map(Number) as [number, number, number];
        // In a browser the zone is the runtime's own, so its DST half-year also counts (sky-almanac).
        const january = new Date(year, 0, 1).getTimezoneOffset();
        const july = new Date(year, 6, 1).getTimezoneOffset();
        const southern = (january !== july && january < july) || gardenSkyLatitudeForZone(zone, year).southern;
        const latitude = { latitudeRad: ((southern ? -35 : 35) * Math.PI) / 180, southern };
        const sky = gardenSkyDay(new Date(year, month - 1, date, 12), latitude);
        for (let hour = 0; hour < 24; hour += 0.25) {
          const beats = dayCycleBeats(hour, sky);
          const sorted = Object.values(beats).sort((a, b) => b - a);
          // A near-even crossfade may round either way; every settled hour must agree.
          if (sorted[0]! - sorted[1]! < 0.02) continue;
          expect(`${zone} ${day} ${hour} ${inlineVeilBeat(`#t=${hour}&d=${day}`, zone)}`)
            .toBe(`${zone} ${day} ${hour} ${dominantBeat(beats)}`);
        }
      }
    }
  });

  it("is allowed by the document CSP (public/_headers carries its hash)", () => {
    const hash = createHash("sha256").update(VEIL_SCRIPT, "utf8").digest("base64");
    const headers = readFileSync(new URL("../../public/_headers", import.meta.url), "utf8");
    expect(headers).toContain(`'sha256-${hash}'`);
    expect(headers).not.toContain("'unsafe-inline'");
    expect(INDEX_HTML).not.toMatch(/<style\b|style=|on(?:click|load|error)=/i);
  });

});
