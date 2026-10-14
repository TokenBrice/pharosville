/**
 * HarbourModel: the truth layer. Pure data, no renderer, no clock reads.
 * Built by buildHarbourModel(payloads, nowMs) from the seven same-origin endpoints.
 *
 * Inputs are typed as the narrow slices of the shared API types this layer reads, so the full
 * payloads are assignable and test fixtures stay small.
 */
import type { ApiMeta } from "@shared/types/api-meta";
import type { ChainsResponse, ChainSummary } from "@shared/types/chains";
import type { CauseFamily } from "./obituary";
import type { DeadStablecoin, PegSummaryCoin, StablecoinData, StressSignalEntry } from "@shared/types/market";
import type { MintBurnFlowsResponse } from "@shared/types/mint-burn";
import type { SafetyGradeEntry } from "@shared/types/safety-grades";
import type { StabilityIndexCurrent } from "@shared/types/stability";
import type { PharosVilleApiEndpointKey } from "@shared/types/pharosville-endpoint-keys";
import type { HullClass } from "../layout/types";

export type { HullClass };
export type EndpointKey = PharosVilleApiEndpointKey;

// ------------------------------------------------------------------ inputs

export type CoinRow = Pick<StablecoinData, "id" | "name" | "symbol" | "pegType" | "circulating" | "chainCirculating" | "chains">
  & Partial<Pick<StablecoinData, "price" | "circulatingPrevDay" | "circulatingPrevWeek" | "circulatingPrevMonth">>;
export interface StablecoinsPayload { peggedAssets: CoinRow[] }

export type ChainRow = Pick<ChainSummary, "id" | "name" | "totalUsd"> & Partial<Pick<ChainSummary, "dominanceShare" | "healthScore" | "healthBand" | "change24hPct" | "change7dPct" | "change30dPct">>;
export interface ChainsPayload extends Partial<Pick<ChainsResponse, "globalTotalUsd" | "unattributedTotalUsd" | "globalChange7dPct">> { chains: ChainRow[] }

export interface StabilityPayload {
  current: (Pick<StabilityIndexCurrent, "score" | "band"> & Partial<Pick<StabilityIndexCurrent, "avg24h" | "computedAt">>) | null;
}
export type PegCoinRow = Pick<PegSummaryCoin, "id" | "currentDeviationBps" | "activeDepeg"> & Partial<Pick<PegSummaryCoin, "pegScore">>;
export interface PegSummaryPayload { coins: PegCoinRow[] }
export interface StressPayload {
  signals: Record<string, Pick<StressSignalEntry, "score" | "band">>;
  coverageRatio?: number;
}
export interface SafetyGradesPayload { grades: Array<Pick<SafetyGradeEntry, "id" | "grade">> }
export interface MintBurnPayload {
  hourly: Array<Pick<MintBurnFlowsResponse["hourly"][number], "hourTs" | "netFlowUsd" | "mintVolumeUsd" | "burnVolumeUsd"> & { valuation?: string }>;
  scope?: { chainIds: string[]; label?: string } | undefined;
}

export interface PayloadByKey {
  stablecoins: StablecoinsPayload;
  chains: ChainsPayload;
  stability: StabilityPayload;
  pegSummary: PegSummaryPayload;
  stress: StressPayload;
  safetyGrades: SafetyGradesPayload;
  mintBurn: MintBurnPayload;
}

/** One endpoint's last good payload plus the freshness evidence that came with it. */
export interface EndpointSnapshot<T> {
  data: T | null;
  /** Parsed _meta / X-Data-Age evidence at fetch time. */
  meta: ApiMeta | null;
  /** Wall-clock ms when `data` was received. */
  fetchedAtMs: number | null;
  /** Last fetch error (data may still hold an older good payload). */
  error?: string | null;
}

export type HarbourPayloads = { [K in EndpointKey]?: EndpointSnapshot<PayloadByKey[K]> };

export interface BuildOptions {
  /** Chains that own a pier, in layout order (layout.piers[].chain). Default: top 8 by supply. */
  pieredChains?: readonly string[];
  /** Dead-coin list; default shared/data/dead-stablecoins.json. */
  dead?: readonly DeadStablecoin[];
}

// ------------------------------------------------------------------ outputs

export type RigFamily = "usd" | "eur" | "gold" | "fiat" | "other";
export type BoatState = "circuit" | "moored" | "shoals" | "wrecked";
export type DewsBand = "CALM" | "WATCH" | "ALERT" | "WARNING" | "DANGER";
/** "far" = the Far Ports (chains without a pier + unattributed supply). */
export type Where = string;

export interface CircuitStop {
  /** Pier chain name, or null for the Far Ports. */
  chain: string | null;
  where: Where;
  /** Dock-time share (quantized to CIRCUIT_SHARE_STEP, sums to 1). */
  share: number;
  /** Unquantized supply share of this stop. */
  rawShare: number;
}

export interface Boat {
  id: string;
  symbol: string;
  name: string;
  /** USD supply (sum of circulating buckets). */
  supply: number;
  hullClass: HullClass;
  rig: RigFamily;
  pegType: string;
  brandColor: string;
  logo: string | null;
  /** Chain supply shares (chain name → share of the boat's chain-attributed supply), descending. */
  chainShares: Array<{ chain: string; share: number; usd: number }>;
  /** Circuit stops in sailing order. A single stop = moored at home. */
  circuit: CircuitStop[];
  home: Where;
  pegDeviationBps: number | null;
  activeDepeg: boolean;
  /** No peg reading (null deviation or not tracked): unlit stern lamp. */
  nullPeg: boolean;
  dews: DewsBand | null;
  dewsScore: number | null;
  grade: string | null;
  state: BoatState;
}

export interface Harbour {
  chain: string;
  where: Where;
  piered: boolean;
  supplyUsd: number;
  share: number;
  /** Boats that dock here (any circuit stop or home). */
  visitors: number;
  /** /api/chains totalUsd when present. */
  chainsTotalUsd: number | null;
  healthScore: number | null;
}

export type Freshness = "current" | "stale" | "unavailable";
export interface EndpointTruth {
  state: Freshness;
  ageSec: number | null;
  /** Server-reported status at fetch time. */
  serverStatus: ApiMeta["status"] | null;
}

export type ConditionBand = "BEDROCK" | "STEADY" | "TREMOR" | "FRACTURE" | "CRISIS" | "MELTDOWN";

export interface PsiReading {
  /** False when there is no reading: unlit lantern, never a calm default. */
  lit: boolean;
  score: number | null;
  band: ConditionBand | null;
  avg24h: number | null;
  /** Seconds per beam revolution (PSI_SWEEP_DURATION); null when unlit. */
  sweepSec: number | null;
  /** 0..1 beam reach/brightness from the score; null when unlit. */
  reach: number | null;
  lamp: "white" | "amber" | "red" | null;
  stale: boolean;
}

export interface SeaStateReading {
  /** Supply-weighted share of boats with activeDepeg; null when unknown. */
  offPegShare: number | null;
  /** 0 calm (<0.5 %), 1 (0.5–2 %), 2 (2–10 %), 3 (>10 %); null when unknown. */
  step: 0 | 1 | 2 | 3 | null;
  stale: boolean;
}

export interface WeatherReading {
  /** Supply-weighted DEWS level 0 (CALM) … 4 (DANGER) over covered supply; null when unknown. */
  level: number | null;
  band: DewsBand | null;
  cloudCover: number | null;
  wind: number | null;
  /** Share of supply with a DEWS reading. */
  coverage: number | null;
  stale: boolean;
}

export interface FlowsReading {
  /** 24 hourly bars, oldest first; netUsd null = partial valuation (drawn as a gap, not zero). */
  hourly: Array<{ hourTs: number; netUsd: number | null; mintUsd: number; burnUsd: number }>;
  net24hUsd: number | null;
  scope: string[];
  stale: boolean;
  available: boolean;
}

export interface HarbourReadings {
  psi: PsiReading;
  seaState: SeaStateReading;
  weather: WeatherReading;
  flows: FlowsReading;
  /** Storm cones hoisted: one per ALERT+ coin, max 5; `extra` is the "+N". null = unknown. */
  stormCones: { count: number; shown: number; extra: number } | null;
  shoals: Array<{ id: string; bps: number | null; supply: number }>;
  /** The dead, oldest first. `family`: the cause family (model/obituary.ts) that picks the wreck's form. */
  wrecks: Array<{ id: string; name: string; symbol: string; cause: string; family: CauseFamily; deathDate: string; peakMcap: number | null }>;
}

export interface HarbourModel {
  builtAtMs: number;
  /** Stable key of the inputs that shape the sailing plan; equal keys → identical plan. */
  planKey: string;
  boats: Boat[];
  harbours: Harbour[];
  readings: HarbourReadings;
  truth: Record<EndpointKey, EndpointTruth>;
  /** Totals reconcile: boats.length === payloadCount. */
  payloadCount: number;
  supplyTotal: number;
  /** stablecoins endpoint usable (data present) — false means AWAITING DATA, empty harbour. */
  hasFleet: boolean;
}
