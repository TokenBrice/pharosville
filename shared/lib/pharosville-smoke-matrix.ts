export interface PharosVilleSmokeBlockedVariant {
  path: string;
  statuses: readonly number[];
  init?: {
    method: "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";
  };
}

type PharosVilleSmokeMethod = NonNullable<PharosVilleSmokeBlockedVariant["init"]>["method"];

export const PHAROSVILLE_SMOKE_ALLOWLIST_ENDPOINTS = [
  "/api/stablecoins",
  "/api/chains",
  "/api/stability-index?detail=true",
  "/api/peg-summary",
  "/api/stress-signals",
  "/api/report-cards",
] as const;

const SHARED_BLOCKED_404_PATHS = [
  "/api/health",
  "/api/stability-index",
  "/api/stability-index?detail=false",
  "/api/stability-index?detail=true&extra=1",
] as const;

const PROXY_ONLY_BLOCKED_404_PATHS = [
  "/api/stablecoins?extra=1",
  "/api/chains?extra=1",
  "/api/peg-summary?extra=1",
  "/api/stress-signals?days=7",
  "/api/report-cards?extra=1",
] as const;

const SMOKE_LIVE_ONLY_BLOCKED_404_PATHS = [
  "/api/stablecoins?detail=true",
  "/api/report-cards?foo=bar",
] as const;

function blocked404(path: string): PharosVilleSmokeBlockedVariant {
  return {
    path,
    statuses: [404],
  };
}

function blocked405(method: PharosVilleSmokeMethod): PharosVilleSmokeBlockedVariant {
  return {
    path: "/api/stablecoins",
    statuses: [405],
    init: { method },
  };
}

export const PHAROSVILLE_PROXY_BLOCKED_VARIANTS = [
  ...SHARED_BLOCKED_404_PATHS.map(blocked404),
  ...PROXY_ONLY_BLOCKED_404_PATHS.map(blocked404),
  blocked405("POST"),
  blocked405("PUT"),
  blocked405("PATCH"),
  blocked405("DELETE"),
  blocked405("OPTIONS"),
] as const satisfies readonly PharosVilleSmokeBlockedVariant[];

export const PHAROSVILLE_SMOKE_LIVE_BLOCKED_VARIANTS = [
  ...SHARED_BLOCKED_404_PATHS.map(blocked404),
  ...SMOKE_LIVE_ONLY_BLOCKED_404_PATHS.map(blocked404),
  blocked405("POST"),
] as const satisfies readonly PharosVilleSmokeBlockedVariant[];
