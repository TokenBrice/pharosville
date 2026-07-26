import type { ChainsResponse } from "@shared/types/chains";

/**
 * The tide line — the fleet's weekly supply flow, read off the stonework.
 *
 * `chains.globalChange7dPct` has arrived on every load and driven nothing. It is
 * the one number that says whether the whole asset class grew or shrank over a
 * week, and the harbour had no way to show it.
 *
 * A harbour already has an instrument for exactly this: the tide. Water standing
 * high against the stone, or drawn back to leave wet rock bare, is the most
 * legible thing in any real port, and it reads as a CONDITION rather than a
 * warning — which is right, because supply growing or shrinking is neither good
 * nor bad on its own.
 *
 * ## The units trap
 *
 * `globalChange7dPct` is a FRACTION (1.0 = 100%), despite the `Pct` suffix, and
 * despite `ShipNode.change7dPct` — which `recent-change.ts` computes locally —
 * being in PERCENT units. The two fields share a name shape and disagree by
 * 100x. Verified against the live payload: the fleet's own 7d change computed
 * from `/api/stablecoins` was +0.0486%, and `globalChange7dPct` read 0.000187,
 * which matches only as a fraction. Nothing else in the app had ever read the
 * chains-side change fields, so there was no prior convention to follow. Passing
 * this straight to `formatChangePercent` would under-report by 100x, which is
 * why `change7dPct` below is converted once, here, and carried in percent units
 * from this point on.
 *
 * ## Why the response is not linear
 *
 * Total stablecoin supply is enormous and slow: the observed week moved
 * +0.019%, and the trailing month -0.92% (about -0.21%/week). On a linear scale
 * against any threshold big enough to mean "a real move", the tide would sit
 * pinned at the datum permanently and the cue would be indistinguishable from a
 * broken one.
 *
 * So the response is a signed square root against a 2% full scale — a genuinely
 * large week for an asset class this size. Small ordinary moves lift off the
 * datum enough to see; large ones still separate. The compression is the same
 * idea the fleet's own size tiers use on market cap, for the same reason.
 */

/** Weekly move, as a fraction, that stands the tide at its full excursion. */
export const SUPPLY_TIDE_FULL_SCALE_PCT = 2;

/**
 * Below this the week is reported as slack water rather than as a direction.
 * A hundredth of a percent of a ~$330B float is noise in the producers, not a
 * tide, and calling it "rising" would be asserting a direction from rounding.
 */
export const SUPPLY_TIDE_SLACK_PCT = 0.01;

export type SupplyTideState = "flood" | "ebb" | "slack" | "unavailable";

export interface SupplyTide {
  /** Signed weekly supply change in PERCENT units, or null when unavailable. */
  change7dPct: number | null;
  /**
   * Signed -1..1 excursion from the harbour datum, after compression.
   * Positive floods (supply grew, water stands high); negative ebbs (supply
   * shrank, water draws back and bares wet stone).
   */
  offset: number;
  state: SupplyTideState;
}

export const UNAVAILABLE_SUPPLY_TIDE: SupplyTide = Object.freeze({
  change7dPct: null,
  offset: 0,
  state: "unavailable",
});

/** Signed square-root compression against full scale, clamped to -1..1. */
export function supplyTideOffset(change7dPct: number): number {
  const magnitude = Math.min(1, Math.sqrt(Math.abs(change7dPct) / SUPPLY_TIDE_FULL_SCALE_PCT));
  return change7dPct < 0 ? -magnitude : magnitude;
}

export function buildSupplyTide(chains: ChainsResponse | null | undefined): SupplyTide {
  const raw = chains?.globalChange7dPct;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return UNAVAILABLE_SUPPLY_TIDE;
  // The one conversion. Everything downstream — the band, the detail row, the
  // ledger clause — reads percent units.
  const change7dPct = raw * 100;
  if (Math.abs(change7dPct) < SUPPLY_TIDE_SLACK_PCT) {
    return { change7dPct, offset: 0, state: "slack" };
  }
  return {
    change7dPct,
    offset: supplyTideOffset(change7dPct),
    state: change7dPct > 0 ? "flood" : "ebb",
  };
}
