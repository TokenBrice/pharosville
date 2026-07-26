import { PSI_HEX_COLORS, PSI_SWEEP_DURATION } from "@shared/lib/psi-colors";
import { describe, expect, it } from "vitest";
import { PSI_BAND_SEVERITY, psiBandSeverity } from "./world-types";

describe("PSI band severity order", () => {
  it("covers the shared band set exactly", () => {
    // A band added upstream and forgotten here would rank as null everywhere
    // and quietly leave the lighthouse rocks bare. Fail loudly instead.
    expect([...PSI_BAND_SEVERITY].sort()).toEqual(Object.keys(PSI_HEX_COLORS).sort());
  });

  it("agrees with the urgency the shared sweep durations already encode", () => {
    // `PSI_SWEEP_DURATION` is the app's existing per-band statement of "how bad
    // is this" — a worse band turns the beam faster. If this order ever
    // disagreed with it, the world would be telling two different stories about
    // the same band on the same monument.
    const bySweep = [...PSI_BAND_SEVERITY].sort(
      (left, right) => PSI_SWEEP_DURATION[right] - PSI_SWEEP_DURATION[left],
    );
    expect(bySweep).toEqual([...PSI_BAND_SEVERITY]);
  });

  it("ranks a known band and refuses an unknown one", () => {
    expect(psiBandSeverity("BEDROCK")).toBe(0);
    expect(psiBandSeverity("MELTDOWN")).toBe(PSI_BAND_SEVERITY.length - 1);
    // Null, never zero: an unrecognized band must not be filed as the calmest.
    expect(psiBandSeverity("SPICY")).toBeNull();
    expect(psiBandSeverity(null)).toBeNull();
    expect(psiBandSeverity(undefined)).toBeNull();
    expect(psiBandSeverity("")).toBeNull();
  });
});
