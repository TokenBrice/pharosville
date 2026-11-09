// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hullClassFor } from "../model/classify";
import { seaStateReading } from "../model/readings";
import { freshDeath, WREATH_DAYS } from "../fleet/wreck-cove";
import { daysSinceDeath } from "../model/obituary";
import { officeWorks, OFFICE_WORKS_ON, OFFICE_WORKS_HOLD, OFFICE_FURL_ON, OFFICE_FURL_HOLD, TIDE_FULL_SCALE_PCT, TIDE_SLACK_PCT } from "../readings/bind";
import type { Boat, EndpointTruth } from "../model/types";
import { ANNIVERSARY_RULE, CEREMONY_RULE, FLOW_RULE, HULL_RULE, LETTERING_RULE, OFFICE_RULE, SAIL_RULE, SEA_RULE, TIDE_RULE, WREATH_RULE, WRECK_RULE } from "./facts";
import { Ledger } from "./Ledger";
vi.mock("./hooks", () => ({ useStore: () => ({ ctx: { services: new Map() } }), useUISlice: (fn: (s: object) => unknown) => fn({ ledgerOpen: true, model: null }), usePresence: () => [true, true] }));
afterEach(cleanup);

describe("the declared visual key", () => {
  it("prints the shared exact explanations and coverage qualification", () => {
    render(<Ledger onClose={() => {}} />);
    for (const sentence of [ANNIVERSARY_RULE, CEREMONY_RULE, FLOW_RULE, HULL_RULE, LETTERING_RULE, OFFICE_RULE, SAIL_RULE, SEA_RULE, TIDE_RULE, WREATH_RULE, WRECK_RULE]) expect(screen.getByText(sentence, { exact: false })).toBeTruthy();
    expect(screen.getAllByText("Peg readings: unavailable.").length).toBeGreaterThan(0);
  });
  it("agrees with owner thresholds at 10%, office release boundaries and supply classes", () => {
    const truth: EndpointTruth = { state: "current", ageSec: 0, serverStatus: "fresh" };
    const sea = (share: number) => seaStateReading([{ supply: share * 100, activeDepeg: true }, { supply: (1 - share) * 100, activeDepeg: false }] as Boat[], true, truth).step;
    expect([sea(0.0049), sea(0.005), sea(0.02), sea(0.1)]).toEqual([0, 1, 2, 3]);
    expect([OFFICE_WORKS_ON, OFFICE_WORKS_HOLD, OFFICE_FURL_ON, OFFICE_FURL_HOLD]).toEqual([0.08, 0.06, -0.08, -0.06]);
    expect(officeWorks(0.06, "works")).toBe("works");
    expect(officeWorks(0.05999, "works")).toBe("neutral");
    expect(officeWorks(-0.06, "furled")).toBe("furled");
    expect(officeWorks(-0.05999, "furled")).toBe("neutral");
    expect([TIDE_FULL_SCALE_PCT, TIDE_SLACK_PCT]).toEqual([2, 0.01]);
    for (const bound of [1e6, 1e7, 1e8, 1e9, 1e10]) expect(hullClassFor(bound)).not.toBe(hullClassFor(bound - 1));
  });
  it("counts a month-only wreath age from month end through 90 days", () => {
    const end = Date.UTC(2026, 0, 31);
    expect(WREATH_DAYS).toBe(90);
    expect(freshDeath([{ deathDate: "2026-01" }], end + 90 * 86400000)).not.toBeNull();
    expect(freshDeath([{ deathDate: "2026-01" }], end + 91 * 86400000)).toBeNull();
    expect(daysSinceDeath("2026-01", end + 90 * 86400000)).toBe(90);
    expect(daysSinceDeath("2026-01", end + 91 * 86400000)).toBe(91);
  });
});
