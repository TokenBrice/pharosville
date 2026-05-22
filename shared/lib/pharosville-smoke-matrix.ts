import { PHAROSVILLE_ENDPOINT_PATHS } from "./pharosville-endpoint-registry";

export interface PharosVilleSmokeBlockedVariant {
  path: string;
  statuses: readonly number[];
  init?: {
    method: "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";
  };
}

type PharosVilleSmokeMethod = NonNullable<PharosVilleSmokeBlockedVariant["init"]>["method"];

function endpointPathAt(index: number, runtimeFactsPathHint: string): string {
  return PHAROSVILLE_ENDPOINT_PATHS[index] ?? runtimeFactsPathHint;
}

export const PHAROSVILLE_SMOKE_ALLOWLIST_ENDPOINTS = [
  endpointPathAt(0, "/api/stablecoins"),
  endpointPathAt(1, "/api/chains"),
  endpointPathAt(2, "/api/stability-index?detail=true"),
  endpointPathAt(3, "/api/peg-summary"),
  endpointPathAt(4, "/api/stress-signals"),
  endpointPathAt(5, "/api/report-cards"),
] as const;

function assertSameOrderedPaths(
  label: string,
  actual: readonly string[],
  expected: readonly string[],
): void {
  if (
    actual.length === expected.length
    && actual.every((path, index) => path === expected[index])
  ) {
    return;
  }
  throw new Error(`${label} must match the PharosVille endpoint registry`);
}

assertSameOrderedPaths(
  "PHAROSVILLE_SMOKE_ALLOWLIST_ENDPOINTS",
  PHAROSVILLE_SMOKE_ALLOWLIST_ENDPOINTS,
  PHAROSVILLE_ENDPOINT_PATHS,
);

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
