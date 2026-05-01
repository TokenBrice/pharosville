import type { StablecoinMeta } from "../../types";
import canonicalOrderAsset from "../../data/stablecoins/canonical-order.json";
import perCoinGeneratedAsset from "../../data/stablecoins/coins.generated.json";

const CANONICAL_ORDER = canonicalOrderAsset as string[];
const PER_COIN_SOURCE_COINS = perCoinGeneratedAsset as StablecoinMeta[];

const byId = new Map(PER_COIN_SOURCE_COINS.map((stablecoin) => [stablecoin.id, stablecoin]));

export const RUNTIME_TRACKED_STABLECOINS: StablecoinMeta[] = CANONICAL_ORDER.flatMap((id) => {
  const entry = byId.get(id);
  return entry ? [entry] : [];
});

export const RUNTIME_ACTIVE_STABLECOINS = RUNTIME_TRACKED_STABLECOINS.filter(
  (stablecoin) => stablecoin.status !== "pre-launch" && stablecoin.status !== "frozen",
);

export const RUNTIME_ACTIVE_IDS = new Set(RUNTIME_ACTIVE_STABLECOINS.map((stablecoin) => stablecoin.id));

export const RUNTIME_ACTIVE_META_BY_ID = new Map(
  RUNTIME_ACTIVE_STABLECOINS.map((stablecoin) => [stablecoin.id, stablecoin]),
);

export const RUNTIME_FROZEN_STABLECOINS = RUNTIME_TRACKED_STABLECOINS.filter(
  (stablecoin) => stablecoin.status === "frozen",
);
