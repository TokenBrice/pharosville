// NFS4 #4: read from the client-only interval map; the full `cron-jobs.ts`
// catalog is server-side and must not enter the desktop chunk.
import { CRON_INTERVALS_CLIENT } from "@shared/lib/cron-intervals-client";

export const CRON_15MIN = CRON_INTERVALS_CLIENT["sync-stablecoins"] * 1000;
export const CRON_30MIN = CRON_INTERVALS_CLIENT["sync-dex-liquidity"] * 1000;
