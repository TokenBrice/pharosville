export const PHAROSVILLE_API_ENDPOINT_KEYS = [
  "stablecoins",
  "chains",
  "stability",
  "pegSummary",
  "stress",
  "reportCards",
] as const;

export type PharosVilleApiEndpointKey = (typeof PHAROSVILLE_API_ENDPOINT_KEYS)[number];
