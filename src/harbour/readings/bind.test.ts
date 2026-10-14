import { describe, expect, it } from "vitest";
import { buildHarbourModel } from "../model/build";
import type { HarbourPayloads } from "../model/types";
import {
  applyDevOverrides, deriveTargets, lampStepForBand, mastForBand, reachForScore, seaStepForShare, tideFromFraction, tideFromPct,
  TIDE_FULL_SCALE_PCT,
} from "./bind";
import { boardHeight, boardScaleUsd } from "./tide-board";

const NOW = 1_790_000_000_000;
const fresh = { updatedAt: NOW / 1000 - 60, ageSeconds: 60, status: "fresh" as const };
const snap = <T,>(data: T) => ({ data, meta: fresh, fetchedAtMs: NOW });

function drop(p: HarbourPayloads, key: keyof HarbourPayloads): HarbourPayloads {
  const out = { ...p };
  delete out[key];
  return out;
}

function payloads(over: HarbourPayloads = {}): HarbourPayloads {
  const base: HarbourPayloads = {
    stablecoins: snap({ peggedAssets: [
      { id: "a", name: "A", symbol: "A", pegType: "peggedUSD", circulating: { peggedUSD: 90e9 }, chainCirculating: { Ethereum: { current: 90e9 } }, chains: ["Ethereum"] },
      { id: "b", name: "B", symbol: "B", pegType: "peggedUSD", circulating: { peggedUSD: 5e9 }, chainCirculating: { Tron: { current: 5e9 } }, chains: ["Tron"] },
    ] }) as NonNullable<HarbourPayloads["stablecoins"]>,
    stability: snap({ current: { score: 91.2, band: "BEDROCK" } }) as NonNullable<HarbourPayloads["stability"]>,
    pegSummary: snap({ coins: [{ id: "b", currentDeviationBps: -300, activeDepeg: true }] }) as NonNullable<HarbourPayloads["pegSummary"]>,
    stress: snap({ signals: { a: { score: 10, band: "CALM" }, b: { score: 70, band: "ALERT" } } }) as NonNullable<HarbourPayloads["stress"]>,
    chains: snap({ chains: [], globalChange7dPct: -0.0036 }) as NonNullable<HarbourPayloads["chains"]>,
  };
  return { ...base, ...over };
}

const derive = (p: HarbourPayloads, attempted = true) =>
  deriveTargets({ model: buildHarbourModel(p, NOW), chainsChange7d: (p.chains?.data as { globalChange7dPct?: number } | undefined)?.globalChange7dPct, stablecoinsAttempted: attempted });

describe("readings → world targets", () => {
  it("PSI: reach is monotonic and spreads the BEDROCK range", () => {
    expect(reachForScore(97) - reachForScore(91)).toBeGreaterThan(0.12);
    expect(reachForScore(55)).toBeLessThan(0.15);
    expect(reachForScore(10)).toBe(0);
    expect(reachForScore(100)).toBe(1);
  });

  it("PSI: 3-step lamp and the band's sweep period", () => {
    expect([lampStepForBand("BEDROCK"), lampStepForBand("STEADY"), lampStepForBand("TREMOR"), lampStepForBand("FRACTURE"), lampStepForBand("CRISIS"), lampStepForBand("MELTDOWN")]).toEqual([0, 0, 1, 1, 2, 2]);
    const t = derive(payloads());
    expect(t.psi).toMatchObject({ lit: true, band: "BEDROCK", sweepSec: 12, lamp: 0 });
  });

  it("PSI: a null band is an unlit lantern, never BEDROCK", () => {
    const t = derive(payloads({ stability: snap({ current: null }) as NonNullable<HarbourPayloads["stability"]> }));
    expect(t.psi.lit).toBe(false);
    expect(t.psi.band).toBeNull();
    expect(t.psi.reach).toBe(0);
  });

  it("sea state: 4 declared steps of the supply-weighted off-peg share", () => {
    expect([0.001, 0.005, 0.019, 0.02, 0.099, 0.1, 0.5].map(seaStepForShare)).toEqual([0, 1, 1, 2, 2, 3, 3]);
    expect(derive(payloads()).sea).toBe(2); // ~5 % of supply on the Shoals
  });

  it("weather and cones follow the same supply-weighted DEWS band, unknown stays unknown", () => {
    const t = derive(payloads());
    // one small ALERT coin under a CALM giant: the weather is calm, so the mast flies no cone ...
    expect(t.weather?.band).toBe("CALM");
    expect(t.cones).toBe(0);
    expect(t.pennant).toBe(false);
    // ... and the panel still gets the individual alert
    expect(t.alerts.map((a) => a.id)).toEqual(["b"]);
    expect(t.weather?.cloud).toBeGreaterThan(0.15);
    expect([mastForBand("CALM"), mastForBand("WATCH"), mastForBand("ALERT"), mastForBand("WARNING"), mastForBand("DANGER")])
      .toEqual([{ cones: 0, pennant: false }, { cones: 1, pennant: false }, { cones: 2, pennant: false }, { cones: 3, pennant: false }, { cones: 4, pennant: true }]);
    expect(mastForBand(null)).toEqual({ cones: null, pennant: false });
    const u = derive(drop(payloads(), "stress"));
    expect(u.weather).toBeNull();
    expect(u.cones).toBeNull();
    expect(u.alerts).toEqual([]);
  });

  it("tide: globalChange7dPct is a fraction; signed-sqrt against the full scale; slack near zero", () => {
    expect(tideFromFraction(-0.0036).pct).toBeCloseTo(-0.36);
    expect(tideFromFraction(-0.0036).level).toBeCloseTo(-Math.sqrt(0.36 / TIDE_FULL_SCALE_PCT));
    expect(tideFromPct(0.005).level).toBe(0);
    expect(tideFromPct(5).level).toBe(1);
    expect(tideFromFraction(undefined)).toEqual({ pct: null, level: 0 });
    expect(derive(drop(payloads(), "chains")).tide.pct).toBeNull();
  });

  it("fog only for a stale or (attempted) unavailable /api/stablecoins", () => {
    expect(derive(payloads()).fog).toBe(false);
    const stale = payloads({ stablecoins: { ...payloads().stablecoins!, meta: { ...fresh, status: "stale" } } });
    expect(derive(stale).fog).toBe(true);
    expect(derive(drop(payloads(), "stablecoins"), false).fog).toBe(false); // still syncing
    expect(derive(drop(payloads(), "stablecoins"), true).fog).toBe(true);
    // a stale side endpoint dims its landmark, never fogs the harbour
    const sideStale = derive(payloads({ stress: { ...payloads().stress!, meta: { ...fresh, status: "stale" } } }));
    expect(sideStale.fog).toBe(false);
    expect(sideStale.landmarks["storm-mast"].state).toBe("stale");
    expect(derive(drop(payloads(), "mintBurn")).landmarks["customs-house"].state).toBe("unknown");
  });

  it("dev overrides", () => {
    const t = applyDevOverrides(derive(payloads()), new URLSearchParams("psi=TREMOR&psiScore=55&offpeg=0.06&dews=ALERT&stale=1"));
    expect(t.psi).toMatchObject({ lit: true, band: "TREMOR", lamp: 1, sweepSec: 6, score: 55 });
    expect(t.sea).toBe(2);
    expect(t.weather?.band).toBe("ALERT");
    expect(t.cones).toBe(2);
    expect(t.fog).toBe(true);
    expect(t.landmarks.harbour.state).toBe("stale");
    expect(applyDevOverrides(t, new URLSearchParams("psi=none")).psi.lit).toBe(false);
    expect(applyDevOverrides(t, new URLSearchParams("dews=DANGER"))).toMatchObject({ cones: 4, pennant: true });
  });

  it("tide board scale: symmetric, $50M steps, never below one step", () => {
    expect(boardScaleUsd({ hourly: [{ hourTs: 0, netUsd: 186e6, mintUsd: 0, burnUsd: 0 }, { hourTs: 1, netUsd: -179e6, mintUsd: 0, burnUsd: 0 }] })).toBe(200e6);
    expect(boardScaleUsd({ hourly: [{ hourTs: 0, netUsd: null, mintUsd: 0, burnUsd: 0 }] })).toBe(50e6);
    // signed-sqrt heights: sign and order kept, a quiet hour still stands off the line
    expect(boardHeight(200e6, 200e6)).toBe(1);
    expect(boardHeight(-50e6, 200e6)).toBeCloseTo(-0.5);
    expect(boardHeight(2e6, 200e6)).toBeCloseTo(0.1);
    expect(boardHeight(-900e6, 200e6)).toBe(-1);
  });
});
