import { describe, expect, it } from "vitest";
import type { HarbourModel } from "../model/types";
import { postcardCaption } from "./postcard";

const model = (state: "current" | "stale", psi: { lit: boolean; score: number | null; band: string | null; stale?: boolean }) => ({
  hasFleet: true,
  readings: { psi: { stale: false, ...psi } },
  truth: { stablecoins: { state, ageSec: state === "stale" ? 7200 : 300, serverStatus: null }, chains: { state: "current", ageSec: 300, serverStatus: null } },
}) as unknown as HarbourModel;

const NOW = Date.UTC(2026, 9, 24, 17, 10);

describe("postcard caption", () => {
  it("names the date, the hour shown and the index with its band", () => {
    const c = postcardCaption(model("current", { lit: true, score: 78.4, band: "STEADY" }), 19.2, NOW);
    expect(c.title).toMatch(/^PharosVille · 24 October 2026 · 19:12 · Pharos Stability Index 78, Steady$/);
    expect(c.fresh).toBe("Readings as of 17:05 UTC");
    expect(c.stale).toBe(false);
    expect(c.file).toBe("pharosville-2026-10-24-1912.png");
  });
  it("says so when the readings are stale", () => {
    const c = postcardCaption(model("stale", { lit: true, score: 78, band: "STEADY" }), 9, NOW);
    expect(c.stale).toBe(true);
    expect(c.fresh).toMatch(/^Stale readings: last updated 2 h ago/);
  });
  it("never invents an index without a reading", () => {
    expect(postcardCaption(model("current", { lit: false, score: null, band: null }), 9, NOW).title).toMatch(/Index: no reading$/);
    expect(postcardCaption(null, 9, NOW).fresh).toMatch(/No harbour data/);
  });
});
