import { describe, expect, it } from "vitest";
import { CRON_INTERVALS_CLIENT } from "@shared/lib/cron-intervals-client";
import { CRON_INTERVALS } from "@shared/lib/cron-jobs";

describe("CRON_INTERVALS_CLIENT", () => {
  it("matches the canonical CRON_INTERVALS value for every key it ships", () => {
    // NFS4 #4: server cadence is the source of truth. If any of these drift,
    // the client map must be updated in the same change-set so the desktop
    // chunk's freshness budgets stay accurate.
    for (const [job, intervalSec] of Object.entries(CRON_INTERVALS_CLIENT)) {
      expect(CRON_INTERVALS[job], `CRON_INTERVALS_CLIENT[${job}] is out of sync`).toBe(intervalSec);
    }
  });
});
