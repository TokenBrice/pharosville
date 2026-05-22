import { z } from "zod";
import { ChainsResponseSchema } from "./chains";
import {
  PegSummaryResponseSchema,
  StablecoinListResponseSchema,
  StressSignalsAllResponseSchema,
} from "./market";
import { ReportCardsResponseSchema } from "./report-cards";
import { StabilityIndexResponseSchema } from "./stability";

export const PHAROSVILLE_API_CONTRACT_VERSION = 1;

export const PHAROSVILLE_API_PAYLOAD_SCHEMAS = {
  stablecoins: StablecoinListResponseSchema,
  chains: ChainsResponseSchema,
  stability: StabilityIndexResponseSchema,
  pegSummary: PegSummaryResponseSchema,
  stress: StressSignalsAllResponseSchema,
  reportCards: ReportCardsResponseSchema,
} as const;

export type PharosVilleApiEndpointKey = keyof typeof PHAROSVILLE_API_PAYLOAD_SCHEMAS;

export const PHAROSVILLE_API_ENDPOINT_KEYS = Object.freeze(
  Object.keys(PHAROSVILLE_API_PAYLOAD_SCHEMAS),
) as readonly PharosVilleApiEndpointKey[];

export const PharosVilleApiPayloadsSchema = z.object(PHAROSVILLE_API_PAYLOAD_SCHEMAS);

export type PharosVilleApiPayloads = z.infer<typeof PharosVilleApiPayloadsSchema>;
export type PharosVilleApiPayload<K extends PharosVilleApiEndpointKey> = PharosVilleApiPayloads[K];
