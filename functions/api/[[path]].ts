import { PHAROSVILLE_API_CLIENT_ENDPOINTS } from "../../shared/lib/pharosville-api-client-contract";
import {
  buildPathCacheKey,
  getEdgeCache,
  jsonErrorResponse,
  maybeStoreJsonEdgeCache,
  withDefaultJsonCacheControl,
  withSecurityHeaders,
  type EdgeCache,
  type PagesContextWithWaitUntil,
} from "../_shared";

interface Env {
  PHAROS_API_BASE?: string;
  PHAROS_API_KEY?: string;
}

interface PagesContext extends PagesContextWithWaitUntil {
  request: Request;
  env: Env;
  params: {
    path?: string | string[];
  };
}

const FORWARDED_RESPONSE_HEADERS = [
  "cache-control",
  "content-type",
  "etag",
  "retry-after",
  "warning",
  "x-data-age",
] as const;
const API_SECURITY_RESPONSE_HEADERS = {
  "cross-origin-opener-policy": "same-origin",
  "content-security-policy": "default-src 'self'; base-uri 'self'; object-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self' https://api.pharos.watch; frame-ancestors 'none'; form-action 'self'",
} as const;

const REQUIRED_PHAROS_API_ORIGIN = "https://api.pharos.watch";
const CACHE_KEY_ORIGIN = "https://pharosville.pharos.watch";
const UPSTREAM_TIMEOUT_MS = 8_000;

function jsonError(message: string, status: number, headers?: HeadersInit): Response {
  return jsonErrorResponse(message, status, API_SECURITY_RESPONSE_HEADERS, headers);
}

function normalizeBaseUrl(base: string | undefined): string | null {
  const trimmed = base?.trim();
  if (trimmed !== REQUIRED_PHAROS_API_ORIGIN) return null;
  try {
    const parsed = new URL(trimmed);
    if (
      parsed.protocol !== "https:"
      || parsed.hostname !== "api.pharos.watch"
      || parsed.username
      || parsed.password
      || parsed.port
      || parsed.pathname !== "/"
      || parsed.search
      || parsed.hash
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function getAllowedEndpoint(url: URL) {
  const path = `${url.pathname}${url.search}`;
  return PHAROSVILLE_API_CLIENT_ENDPOINTS.find((endpoint) => endpoint.path === path) ?? null;
}

function buildUpstreamUrl(base: string, url: URL): string {
  return `${base}${url.pathname}${url.search}`;
}

function copyForwardedHeaders(upstream: Response): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("x-pharosville-proxy", "1");
  return headers;
}

function prepareProxyResponseForCache(response: Response, maxAgeSec: number): Response {
  return withDefaultJsonCacheControl(response, maxAgeSec);
}

function maybeStoreEdgeCache(
  context: PagesContext,
  cache: EdgeCache | null,
  cacheKey: Request,
  response: Response,
): void {
  maybeStoreJsonEdgeCache(context, cache, cacheKey, response);
}

type UpstreamFetchResult =
  | { durationMs: number; ok: true; response: Response }
  | { durationMs: number; errorKind: "fetch-error" | "timeout"; ok: false };

async function fetchUpstream(url: string, apiKey: string): Promise<UpstreamFetchResult> {
  const controller = new AbortController();
  const startedAt = Date.now();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
      },
      redirect: "manual",
      signal: controller.signal,
    });
    return { durationMs: Date.now() - startedAt, ok: true, response };
  } catch {
    return {
      durationMs: Date.now() - startedAt,
      errorKind: timedOut || controller.signal.aborted ? "timeout" : "fetch-error",
      ok: false,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function logUpstreamFailure(context: PagesContext, endpointPath: string, failure: Extract<UpstreamFetchResult, { ok: false }>): void {
  console.error(JSON.stringify({
    source: "pharosville-api-proxy",
    event: failure.errorKind === "timeout" ? "upstream_timeout" : "upstream_fetch_failed",
    level: "error",
    status: 502,
    errorKind: failure.errorKind,
    durationMs: failure.durationMs,
    timeoutMs: UPSTREAM_TIMEOUT_MS,
    endpointPath,
    upstreamOrigin: REQUIRED_PHAROS_API_ORIGIN,
    ray: context.request.headers.get("cf-ray") ?? "",
    country: context.request.headers.get("cf-ipcountry") ?? "",
  }));
}

export async function onRequest(context: PagesContext): Promise<Response> {
  if (context.request.method !== "GET") {
    return jsonError("Method not allowed", 405, { Allow: "GET" });
  }

  const url = new URL(context.request.url);
  const endpoint = getAllowedEndpoint(url);
  if (!endpoint) {
    return jsonError("Not found", 404);
  }

  const base = normalizeBaseUrl(context.env.PHAROS_API_BASE);
  const apiKey = context.env.PHAROS_API_KEY?.trim();
  if (!base || !apiKey) {
    return jsonError("PharosVille API proxy is not configured", 500);
  }

  const cache = getEdgeCache();
  const cacheKey = buildPathCacheKey(url, CACHE_KEY_ORIGIN);
  const cached = await cache?.match(cacheKey);
  if (cached) return withSecurityHeaders(cached, API_SECURITY_RESPONSE_HEADERS);

  const upstream = await fetchUpstream(buildUpstreamUrl(base, url), apiKey);
  if (!upstream.ok) {
    logUpstreamFailure(context, endpoint.path, upstream);
    return jsonError("PharosVille API upstream request failed", 502);
  }

  const response = prepareProxyResponseForCache(new Response(upstream.response.body, {
    status: upstream.response.status,
    statusText: upstream.response.statusText,
    headers: copyForwardedHeaders(upstream.response),
  }), endpoint.metaMaxAgeSec);
  maybeStoreEdgeCache(context, cache, cacheKey, response);
  return withSecurityHeaders(response, API_SECURITY_RESPONSE_HEADERS);
}
