import type {
  ChainsResponse,
  ChainSummary,
} from "@shared/types/chains";
import type {
  PegSummaryResponse,
  ReportCardsResponse,
  StablecoinData,
  StablecoinListResponse,
  StabilityIndexResponse,
  StressSignalsAllResponse,
} from "@shared/types";
import type { CemeteryEntry } from "@shared/lib/cemetery-runtime";
import type { PharosVilleInputs } from "../systems/pharosville-world";
import type { PharosVilleFreshness } from "../systems/world-types";
import {
  fixtureChains,
  fixturePegSummary,
  fixtureReportCards,
  fixtureStability,
  fixtureStress,
  makeAsset,
} from "./pharosville-world";

/**
 * Fluent builder for `PharosVilleInputs` test fixtures (maint F11). Replaces
 * the handcrafted `worldForShip(...)` /`makeWorld(...)` patterns in
 * `motion.test.ts` and `pharosville-world.test.ts` for new tests; existing
 * tests can migrate opportunistically.
 *
 * Usage:
 * ```ts
 * const inputs = new WorldBuilder()
 *   .addAsset({ id: "usdc", symbol: "USDC" })
 *   .addAsset({ id: "usdt", symbol: "USDT" })
 *   .withChain({ id: "ethereum" })
 *   .markStale("stablecoins")
 *   .build();
 * const world = buildPharosVilleWorld(inputs);
 * ```
 *
 * Defaults: starts empty (no assets, no chains). Calls `withDefaultChains()`
 * to seed with `fixtureChains`. All other inputs (stability, pegSummary,
 * stress, reportCards) default to the existing fixture payloads from
 * `pharosville-world.ts`. Freshness flags all default to false (fresh data).
 */
export class WorldBuilder {
  private assets: StablecoinData[] = [];
  private chains: ChainSummary[] = [];
  private stability: StabilityIndexResponse | null | undefined = fixtureStability;
  private pegSummary: PegSummaryResponse | null | undefined = fixturePegSummary;
  private stress: StressSignalsAllResponse | null | undefined = fixtureStress;
  private reportCards: ReportCardsResponse | null | undefined = fixtureReportCards;
  private cemeteryEntries: readonly CemeteryEntry[] | undefined = undefined;
  private routeMode: PharosVilleInputs["routeMode"] = "world";
  private generatedAt: number | undefined = undefined;
  private freshness: PharosVilleFreshness = {
    stablecoinsStale: false,
    chainsStale: false,
    stabilityStale: false,
    pegSummaryStale: false,
    stressStale: false,
    reportCardsStale: false,
  };

  /** Append a stablecoin asset (becomes a ship after build). */
  addAsset(overrides: Parameters<typeof makeAsset>[0]): this {
    this.assets.push(makeAsset(overrides));
    return this;
  }

  /** Replace the asset list wholesale. */
  withAssets(assets: readonly StablecoinData[]): this {
    this.assets = [...assets];
    return this;
  }

  /** Append a chain (becomes a dock after build). */
  withChain(chain: ChainSummary): this {
    this.chains.push(chain);
    return this;
  }

  /** Replace the chain list wholesale; convenience for full fixture. */
  withChains(chains: readonly ChainSummary[]): this {
    this.chains = [...chains];
    return this;
  }

  /** Seed with the canonical fixtureChains payload. */
  withDefaultChains(): this {
    this.chains = [...fixtureChains.chains];
    return this;
  }

  /** Set/clear individual response payloads. */
  withStability(value: StabilityIndexResponse | null | undefined): this {
    this.stability = value;
    return this;
  }

  withPegSummary(value: PegSummaryResponse | null | undefined): this {
    this.pegSummary = value;
    return this;
  }

  withStress(value: StressSignalsAllResponse | null | undefined): this {
    this.stress = value;
    return this;
  }

  withReportCards(value: ReportCardsResponse | null | undefined): this {
    this.reportCards = value;
    return this;
  }

  withCemeteryEntries(entries: readonly CemeteryEntry[]): this {
    this.cemeteryEntries = entries;
    return this;
  }

  withRouteMode(mode: NonNullable<PharosVilleInputs["routeMode"]>): this {
    this.routeMode = mode;
    return this;
  }

  withGeneratedAt(timestamp: number): this {
    this.generatedAt = timestamp;
    return this;
  }

  /** Mark a single payload's freshness flag stale (true). */
  markStale(payload: keyof PharosVilleFreshness): this {
    this.freshness = { ...this.freshness, [payload]: true };
    return this;
  }

  build(): PharosVilleInputs {
    const inputs: PharosVilleInputs = {
      stablecoins: { peggedAssets: this.assets } as StablecoinListResponse,
      chains: { chains: this.chains } as ChainsResponse,
      stability: this.stability,
      pegSummary: this.pegSummary,
      stress: this.stress,
      reportCards: this.reportCards,
      freshness: this.freshness,
      routeMode: this.routeMode,
    };
    if (this.cemeteryEntries !== undefined) inputs.cemeteryEntries = this.cemeteryEntries;
    if (this.generatedAt !== undefined) inputs.generatedAt = this.generatedAt;
    return inputs;
  }
}
