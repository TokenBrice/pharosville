import { PHAROSVILLE_API_CLIENT_ENDPOINTS } from "../../shared/lib/pharosville-api-client-contract";
import {
  buildLastGoodCacheKey,
  buildPathCacheKey,
  getEdgeCache,
  isJsonResponse,
  jsonErrorResponse,
  LAST_GOOD_CACHE_PATH_PREFIX,
  maybeStoreJsonEdgeCache,
  reportEdgeCacheFailure,
  maybeStoreLastGoodEdgeCache,
  readLastGoodEdgeCache,
  withDefaultJsonCacheControl,
  withSecurityHeaders,
  type EdgeCache,
  type LastGoodEdgeEntry,
  type PagesContextWithWaitUntil,
} from "../_shared";
import type { PharosVilleApiEndpointKey } from "../../shared/types/pharosville-endpoint-keys";
import { endpointProjector, type ProjectionJson } from "./_project";

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
  "age",
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

/** GET validators use weak comparison, including lists and the wildcard. */
function conditionalResponse(request: Request, response: Response): Response {
  const condition = request.headers.get("if-none-match");
  const etag = response.headers.get("etag");
  if (response.status !== 200 || !condition || !etag) return response;
  const tags = condition.match(/(?:W\/)?"[^"]*"|\*/g) ?? [];
  if (!tags.some((tag) => tag === "*" || tag.replace(/^W\//, "") === etag.replace(/^W\//, ""))) return response;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(null, { status: 304, statusText: "Not Modified", headers });
}

async function projectedResponse(response: Response, key: PharosVilleApiEndpointKey): Promise<Response> {
  if (response.status !== 200 || !isJsonResponse(response)) return response;
  const body = JSON.stringify(endpointProjector(key)(await response.json() as ProjectionJson));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const headers = new Headers(response.headers);
  // Upstream validators/encoding describe a different representation.
  // pv1 is the projection epoch; bump it when changing the projector contract.
  headers.set("etag", `"pv1-${hash}"`);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Serves the long-TTL last-good copy in place of a 502 when the upstream API is
 * down, marked so the client tells the truth about it. `Warning: 110` is the
 * marker `src/lib/api.ts` already reads to demote a payload out of `fresh`, and
 * `x-data-age` carries the copy's own age plus the time it sat in the cache.
 * `no-store` keeps browsers from pinning the stale body past the outage.
 * Always send the body with that warning, even for matching browser validators;
 * stale demotion must not depend on a browser merging 304 freshness headers.
 */
async function staleLastGoodResponse(entry: LastGoodEdgeEntry, key: PharosVilleApiEndpointKey): Promise<Response> {
  const response = entry.response.headers.get("etag")?.startsWith('"pv1-') ? entry.response : await projectedResponse(entry.response, key);
  const headers = copyForwardedHeaders(response);
  const upstreamAge = Number(headers.get("x-data-age"));
  const baseAge = Number.isFinite(upstreamAge) && upstreamAge >= 0 ? upstreamAge : 0;
  const cacheAge = Math.max(0, Number(headers.get("age")) || 0);
  headers.set("x-data-age", String(baseAge + Math.max(0, entry.baseCacheAgeSeconds + entry.storedAgeSeconds - cacheAge)));
  headers.set("warning", '110 - "Response is stale"');
  headers.set("cache-control", "no-store");
  return withSecurityHeaders(
    new Response(response.body, { status: 200, statusText: "OK", headers }),
    API_SECURITY_RESPONSE_HEADERS,
  );
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

async function fetchUpstream(url: string, apiKey: string, key: PharosVilleApiEndpointKey): Promise<UpstreamFetchResult> {
  const controller = new AbortController();
  const startedAt = Date.now();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, UPSTREAM_TIMEOUT_MS);
  try {
    const request = (async () => {
      const upstream = await fetch(url, {
        headers: {
          Accept: "application/json",
          "X-API-Key": apiKey,
        },
        redirect: "manual",
        signal: controller.signal,
      });
      // Consume under the same deadline: a successful header is not a complete response.
      const text = await upstream.text();
      const response = new Response(text || null, { status: upstream.status, statusText: upstream.statusText, headers: upstream.headers });
      return projectedResponse(response, key);
    })();
    const response = await Promise.race([
      request,
      new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true })),
    ]);
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
  // The last-good copies live under this prefix in `caches.default`, the same
  // store the CDN serves this zone from. The allowlist below would 404 the
  // prefix anyway; what matters here is `no-store`, so the refusal can never be
  // cached onto a key and disable the fallback for the next 24 hours.
  if (url.pathname.startsWith(LAST_GOOD_CACHE_PATH_PREFIX)) {
    return jsonError("Not found", 404, { "cache-control": "no-store" });
  }

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
  const cached = await cache?.match(cacheKey).catch((error) => {
    reportEdgeCacheFailure("normal-read", error);
    return undefined;
  });
  if (cached) {
    // Upgrade pre-cutover cache objects once; subsequent hits reuse the digest.
    const projected = cached.headers.get("etag")?.startsWith('"pv1-') ? cached : await projectedResponse(cached, endpoint.key);
    if (projected !== cached) maybeStoreEdgeCache(context, cache, cacheKey, projected);
    return withSecurityHeaders(conditionalResponse(context.request, projected), API_SECURITY_RESPONSE_HEADERS);
  }

  const lastGoodCacheKey = buildLastGoodCacheKey(url, CACHE_KEY_ORIGIN);
  const upstream = await fetchUpstream(buildUpstreamUrl(base, url), apiKey, endpoint.key);
  if (!upstream.ok) {
    logUpstreamFailure(context, endpoint.path, upstream);
    const lastGood = await readLastGoodEdgeCache(cache, lastGoodCacheKey);
    return lastGood
      ? await staleLastGoodResponse(lastGood, endpoint.key)
      : jsonError("PharosVille API upstream request failed", 502);
  }

  // An upstream 5xx is the same outage from the visitor's side. A 4xx is not —
  // that is an answer about the request, and forwarding it stays honest.
  if (upstream.response.status >= 500) {
    const lastGood = await readLastGoodEdgeCache(cache, lastGoodCacheKey);
    if (lastGood) return staleLastGoodResponse(lastGood, endpoint.key);
  }

  const body = upstream.response.body;
  const response = prepareProxyResponseForCache(new Response(body, {
    status: upstream.response.status,
    statusText: upstream.response.statusText,
    headers: copyForwardedHeaders(upstream.response),
  }), endpoint.metaMaxAgeSec);
  maybeStoreEdgeCache(context, cache, cacheKey, response);
  maybeStoreLastGoodEdgeCache(context, cache, lastGoodCacheKey, response);
  return withSecurityHeaders(conditionalResponse(context.request, response), API_SECURITY_RESPONSE_HEADERS);
}
