/**
 * NFS4 #4: client-only cron interval map.
 *
 * The full `shared/lib/cron-jobs.ts` weighs in at ~28 job definitions plus
 * group/schedule metadata that the desktop chunk never reads. We hand-curate
 * the small subset of intervals the browser actually needs (endpoint registry
 * + freshness budgets) here so the desktop bundle never pulls the server-only
 * cron job catalog (and its `"sync-mint-burn"`, `"dispatch-telegram-alerts"`,
 * `"prune-cron-history"`, ... string literals) into the graph.
 *
 * Drift between this map and the canonical `CRON_INTERVALS` is asserted in
 * `cron-intervals-client.test.ts`, so server-side cadence changes will fail
 * the unit suite until this file is updated in lockstep.
 */
export const CRON_INTERVALS_CLIENT = Object.freeze({
  "sync-stablecoins": 900,
  "sync-stablecoin-charts": 3600,
  "sync-usds-status": 86_400,
  "sync-fx-rates": 1800,
  "sync-bluechip": 86_400,
  "sync-dex-liquidity": 1800,
  "sync-yield-data": 3600,
  "compute-dews": 1800,
  "stability-index": 1800,
  "sync-mint-burn": 1800,
  "sync-redemption-backstops": 4 * 3600,
  "sync-blacklist": 6 * 3600,
  "publish-report-card-cache": 900,
} as const);

export type CronIntervalsClientKey = keyof typeof CRON_INTERVALS_CLIENT;
