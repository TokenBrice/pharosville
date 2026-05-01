import type { ZodType } from "zod";
import { PHAROSVILLE_API_CLIENT_CONTRACT } from "./pharosville-api-client-contract";
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

export interface PharosVilleApiEndpoint<K extends PharosVilleApiEndpointKey = PharosVilleApiEndpointKey> {
  key: K;
  path: string;
  schema: ZodType<PharosVilleApiPayload<K>>;
  metaMaxAgeSec: number;
  producerIntervalSec: number;
}

export const PHAROSVILLE_API_CONTRACT = {
  stablecoins: {
    ...PHAROSVILLE_API_CLIENT_CONTRACT.stablecoins,
    schema: StablecoinListResponseSchema,
  },
  chains: {
    ...PHAROSVILLE_API_CLIENT_CONTRACT.chains,
    schema: ChainsResponseSchema,
  },
  stability: {
    ...PHAROSVILLE_API_CLIENT_CONTRACT.stability,
    schema: StabilityIndexResponseSchema,
  },
  pegSummary: {
    ...PHAROSVILLE_API_CLIENT_CONTRACT.pegSummary,
    schema: PegSummaryResponseSchema,
  },
  stress: {
    ...PHAROSVILLE_API_CLIENT_CONTRACT.stress,
    schema: StressSignalsAllResponseSchema,
  },
  reportCards: {
    ...PHAROSVILLE_API_CLIENT_CONTRACT.reportCards,
    schema: ReportCardsResponseSchema,
  },
} satisfies {
  [K in PharosVilleApiEndpointKey]: PharosVilleApiEndpoint<K>;
};

export const PHAROSVILLE_API_ENDPOINTS = PHAROSVILLE_API_ENDPOINT_KEYS.map(
  (key) => PHAROSVILLE_API_CONTRACT[key],
);
