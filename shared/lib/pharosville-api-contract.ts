import type { ZodType } from "zod";
import {
  PHAROSVILLE_API_ENDPOINT_KEYS,
  type PharosVilleApiEndpointKey,
  type PharosVilleApiPayload,
} from "../types/pharosville";
import { ChainsResponseSchema } from "../types/chains";
import {
  PegSummaryResponseSchema,
  StablecoinListResponseSchema,
  StressSignalsAllResponseSchema,
} from "../types/market";
import { ReportCardsResponseSchema } from "../types/report-cards";
import { StabilityIndexResponseSchema } from "../types/stability";
import { PHAROSVILLE_ENDPOINT_REGISTRY } from "./pharosville-endpoint-registry";

export interface PharosVilleApiEndpoint<K extends PharosVilleApiEndpointKey = PharosVilleApiEndpointKey> {
  key: K;
  path: string;
  queryKey: readonly string[];
  schema: ZodType<PharosVilleApiPayload<K>>;
  metaMaxAgeSec: number;
  producerIntervalSec: number;
}

export const PHAROSVILLE_API_CONTRACT = {
  stablecoins: {
    ...PHAROSVILLE_ENDPOINT_REGISTRY.stablecoins,
    schema: StablecoinListResponseSchema,
  },
  chains: {
    ...PHAROSVILLE_ENDPOINT_REGISTRY.chains,
    schema: ChainsResponseSchema,
  },
  stability: {
    ...PHAROSVILLE_ENDPOINT_REGISTRY.stability,
    schema: StabilityIndexResponseSchema,
  },
  pegSummary: {
    ...PHAROSVILLE_ENDPOINT_REGISTRY.pegSummary,
    schema: PegSummaryResponseSchema,
  },
  stress: {
    ...PHAROSVILLE_ENDPOINT_REGISTRY.stress,
    schema: StressSignalsAllResponseSchema,
  },
  reportCards: {
    ...PHAROSVILLE_ENDPOINT_REGISTRY.reportCards,
    schema: ReportCardsResponseSchema,
  },
} as const satisfies {
  [K in PharosVilleApiEndpointKey]: PharosVilleApiEndpoint<K>;
};

export const PHAROSVILLE_API_ENDPOINTS = PHAROSVILLE_API_ENDPOINT_KEYS.map(
  (key) => PHAROSVILLE_API_CONTRACT[key],
);
