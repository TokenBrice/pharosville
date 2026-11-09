import { API_FRESHNESS_MAX_AGE_SEC } from "./api-freshness";
import { CRON_INTERVALS_CLIENT as CRON_INTERVALS } from "./cron-intervals-client";
import { RUNTIME_ACTIVE_IDS } from "./stablecoins/runtime-registry";

export const PHAROSVILLE_PANEL_ENDPOINT_KEYS = ["depegEvents", "stablecoinReserves", "dexLiquidity"] as const;
export type PanelEndpointKey = typeof PHAROSVILLE_PANEL_ENDPOINT_KEYS[number];
export const PANEL_RESERVES_MAX_AGE_SEC = 8 * 3600;

export const PHAROSVILLE_PANEL_ENDPOINT_REGISTRY = {
  depegEvents: {
    key: "depegEvents", label: "Depeg events",
    cacheTtlSec: CRON_INTERVALS["sync-stablecoins"],
    metaMaxAgeSec: API_FRESHNESS_MAX_AGE_SEC.depegEvents,
  },
  stablecoinReserves: {
    key: "stablecoinReserves", label: "Reserves",
    cacheTtlSec: CRON_INTERVALS["sync-live-reserves"],
    metaMaxAgeSec: PANEL_RESERVES_MAX_AGE_SEC,
  },
  dexLiquidity: {
    key: "dexLiquidity", label: "DEX liquidity",
    cacheTtlSec: CRON_INTERVALS["sync-dex-liquidity"],
    metaMaxAgeSec: API_FRESHNESS_MAX_AGE_SEC.dexLiquidity,
  },
} as const;

/** Null means the subject has no allowlisted reading; callers must not request it. */
export function panelEndpointPath(key: PanelEndpointKey, id?: string): string | null {
  if (key === "dexLiquidity") return "/api/dex-liquidity";
  if (!id || !RUNTIME_ACTIVE_IDS.has(id)) return null;
  const path = key === "depegEvents"
    ? `/api/depeg-events?stablecoin=${id}&limit=30`
    : `/api/stablecoin-reserves/${id}`;
  return path.length <= 128 ? path : null;
}

/** Compare raw paths, not decoded/search-param-normalized input: this is an allowlist. */
export function allowedPanelEndpoint(path: string) {
  if (path.length > 128 || path.includes("%")) return null;
  const id = /^\/api\/depeg-events\?stablecoin=([a-z0-9-]+)&limit=30$/.exec(path)?.[1]
    ?? /^\/api\/stablecoin-reserves\/([a-z0-9-]+)$/.exec(path)?.[1];
  for (const key of PHAROSVILLE_PANEL_ENDPOINT_KEYS) {
    if (panelEndpointPath(key, id) === path) return { ...PHAROSVILLE_PANEL_ENDPOINT_REGISTRY[key], path };
  }
  return null;
}
