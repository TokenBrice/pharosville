export interface PharosVilleSmokeBlockedVariant {
  path: string;
  statuses: readonly number[];
  init?: {
    method: "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";
  };
}

type PharosVilleSmokeMethod = NonNullable<PharosVilleSmokeBlockedVariant["init"]>["method"];

// `check:runtime-facts` compares this list to the endpoint registry.
export const PHAROSVILLE_SMOKE_ALLOWLIST_ENDPOINTS = [
  "/api/stablecoins",
  "/api/chains",
  "/api/stability-index?detail=true",
  "/api/peg-summary",
  "/api/stress-signals",
  "/api/safety-grades",
  "/api/mint-burn-flows",
] as const;

// Separate from the seven world feeds: these are opened only by the coin panel.
export const PHAROSVILLE_SMOKE_PANEL_ENDPOINTS = [
  "/api/depeg-events?stablecoin=usdc-circle&limit=30",
  "/api/stablecoin-reserves/usdc-circle",
  "/api/dex-liquidity",
] as const;

export const PHAROSVILLE_PANEL_BLOCKED_404_PATHS = [
  "/api/depeg-events",
  "/api/depeg-events?stablecoin=unknown&limit=30",
  "/api/depeg-events?stablecoin=USDC-CIRCLE&limit=30",
  "/api/depeg-events?stablecoin=usdc-circle",
  "/api/depeg-events?stablecoin=usdc-circle&limit=31",
  "/api/depeg-events?limit=30&stablecoin=usdc-circle",
  "/api/depeg-events?stablecoin=usdc-circle&limit=30&extra=1",
  "/api/depeg-events?stablecoin=usdc-circle&limit=30&limit=30",
  "/api/depeg-events?stablecoin=usdc-circle&stablecoin=usdc-circle&limit=30",
  "/api/depeg-events?stablecoin=usdc-circle%2Fextra&limit=30",
  "/api/depeg-events?stablecoin=%75sdc-circle&limit=30",
  "/api/depeg-events?stablecoin=usdc-circle&limit=030",
  "/api/depeg-events?stablecoin=usdc-circle&limit=30&",
  "/api/depeg-events?stablecoin=usdc-circle&limit=30" + "x".repeat(129),
  "/api/stablecoin-reserves",
  "/api/stablecoin-reserves/unknown",
  "/api/stablecoin-reserves/USDC-CIRCLE",
  "/api/stablecoin-reserves/usdc-circle?extra=1",
  "/api/stablecoin-reserves/usdc-circle%2Fextra",
  "/api/stablecoin-reserves/usdc-circle%5Cextra",
  "/api/stablecoin-reserves/%75sdc-circle",
  "/api/stablecoin-reserves/usdc-circle/",
  "/api/stablecoin-reserves/usdc-circle?",
  "/api/dex-liquidity?extra=1",
  "/api/dex-liquidity?",
  "/api/dex-liquidity/usdc-circle",
  "/api/DEX-LIQUIDITY",
] as const;

// The world can open without this enrichment feed: safety grades shape hulls,
// but stablecoins and chains are the only payloads required to render a useful
// harbour. Keep probing it and annotate failures without turning an unrelated
// upstream outage into a failed Pages deployment. `--strict-freshness` still
// promotes the warning to a failure for operator sign-off.
export const PHAROSVILLE_SMOKE_WARNING_ENDPOINTS = [
  "/api/safety-grades",
] as const satisfies readonly (typeof PHAROSVILLE_SMOKE_ALLOWLIST_ENDPOINTS)[number][];

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
  "/api/safety-grades?extra=1",
  "/api/mint-burn-flows?extra=1",
] as const;

const SMOKE_LIVE_ONLY_BLOCKED_404_PATHS = [
  "/api/stablecoins?detail=true",
  "/api/safety-grades?foo=bar",
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
  ...PHAROSVILLE_PANEL_BLOCKED_404_PATHS.map(blocked404),
  ...SHARED_BLOCKED_404_PATHS.map(blocked404),
  ...PROXY_ONLY_BLOCKED_404_PATHS.map(blocked404),
  blocked405("POST"),
  blocked405("PUT"),
  blocked405("PATCH"),
  blocked405("DELETE"),
  blocked405("OPTIONS"),
] as const satisfies readonly PharosVilleSmokeBlockedVariant[];

export const PHAROSVILLE_SMOKE_LIVE_BLOCKED_VARIANTS = [
  ...PHAROSVILLE_PANEL_BLOCKED_404_PATHS.map(blocked404),
  ...SHARED_BLOCKED_404_PATHS.map(blocked404),
  ...SMOKE_LIVE_ONLY_BLOCKED_404_PATHS.map(blocked404),
  blocked405("POST"),
] as const satisfies readonly PharosVilleSmokeBlockedVariant[];
