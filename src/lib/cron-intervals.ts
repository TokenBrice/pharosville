import { CRON_INTERVALS } from "@shared/lib/cron-jobs";

export const CRON_15MIN = CRON_INTERVALS["sync-stablecoins"] * 1000;
export const CRON_30MIN = CRON_INTERVALS["sync-dex-liquidity"] * 1000;
