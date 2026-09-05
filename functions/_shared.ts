export interface PagesContextWithWaitUntil {
  waitUntil?: (promise: Promise<unknown>) => void;
}

export interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export const BASE_SECURITY_RESPONSE_HEADERS = {
  "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), camera=(), clipboard-read=(), display-capture=(), document-domain=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), sync-xhr=(), usb=(), web-share=(), xr-spatial-tracking=()",
  "cross-origin-resource-policy": "same-origin",
} as const;

export function withSecurityHeaders(
  response: Response,
  endpointHeaders: HeadersInit,
): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(BASE_SECURITY_RESPONSE_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  for (const [name, value] of new Headers(endpointHeaders)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export function jsonErrorResponse(
  message: string,
  status: number,
  securityHeaders: HeadersInit,
  headers?: HeadersInit,
): Response {
  const init: ResponseInit = { status };
  if (headers) init.headers = headers;
  return withSecurityHeaders(Response.json({ error: message }, init), securityHeaders);
}

export function getEdgeCache(): EdgeCache | null {
  const maybeCaches = globalThis.caches as unknown as { default?: EdgeCache } | undefined;
  return maybeCaches?.default ?? null;
}

/**
 * Fixed token for an edge-cache write that did not land. Every such write is
 * best-effort, which is exactly why a swallowed rejection is dangerous: the
 * feature it backs — the rate limiter, the stale-on-error fallback — then looks
 * present and does nothing. Pages Functions logs are streamed, so a literal to
 * grep for in `wrangler pages deployment tail` is the whole observability story.
 */
export const EDGE_CACHE_FAILURE_EVENT = "PHAROSVILLE_EDGE_CACHE_FAILED";

export function reportEdgeCacheFailure(scope: string, error: unknown): void {
  console.error(`${EDGE_CACHE_FAILURE_EVENT} ${JSON.stringify({
    event: EDGE_CACHE_FAILURE_EVENT,
    scope,
    message: error instanceof Error ? error.message : String(error),
  })}`);
}

export function waitUntilOrVoid(
  context: PagesContextWithWaitUntil,
  promise: Promise<unknown>,
): void {
  if (context.waitUntil) {
    context.waitUntil(promise);
  } else {
    void promise;
  }
}

export function buildPathCacheKey(url: URL, origin: string): Request {
  return new Request(new URL(`${url.pathname}${url.search}`, origin).toString(), {
    method: "GET",
  });
}

export function isJsonResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return contentType.includes("application/json") || contentType.includes("+json");
}

export function withDefaultJsonCacheControl(response: Response, maxAgeSec: number): Response {
  const headers = new Headers(response.headers);
  if (response.status === 200 && isJsonResponse(response) && !headers.has("cache-control")) {
    headers.set("cache-control", `public, max-age=${maxAgeSec}`);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function maybeStoreJsonEdgeCache(
  context: PagesContextWithWaitUntil,
  cache: EdgeCache | null,
  cacheKey: Request,
  response: Response,
): void {
  if (!cache || response.status !== 200 || !isJsonResponse(response)) return;
  waitUntilOrVoid(context, cache.put(cacheKey, response.clone()).catch((error) => reportEdgeCacheFailure("normal-write", error)));
}

/**
 * How long a last-good copy may stand in for live data. Past this, presenting
 * old markets as current is a worse answer than an honest error.
 */
export const LAST_GOOD_MAX_AGE_SEC = 24 * 60 * 60;

const LAST_GOOD_STORED_AT_HEADER = "x-pharosville-last-good-stored-at";

/**
 * Reserved prefix for the long-TTL copy, on the app's own origin. `caches.default`
 * is the store the CDN serves this zone from, and Cloudflare documents no support
 * for writing a key on a hostname the deployment does not serve — a rejected
 * `put` there would be swallowed and leave the fallback permanently empty while
 * looking present, which is worse than not having it. So the key stays in-zone
 * and the proxy refuses the prefix instead: `[[path]].ts` answers it `404` with
 * `no-store`, so a stray request can neither take the key with its own response
 * nor evict the copy. A hit would only ever hand back the same public JSON the
 * live endpoint already serves. Carries no credential either way.
 */
export const LAST_GOOD_CACHE_PATH_PREFIX = "/api/__last-good";

export function buildLastGoodCacheKey(url: URL, origin: string): Request {
  return new Request(
    new URL(`${LAST_GOOD_CACHE_PATH_PREFIX}${url.pathname}${url.search}`, origin).toString(),
    { method: "GET" },
  );
}

/**
 * Pins the copy a later outage will present as the answer — so what goes in has
 * to be an answer. A mislabelled or truncated 200 is JSON by its content-type
 * alone, and promoting one of those makes garbage the thing served under
 * `Warning: 110` for the next 24 hours. Parseability is the whole test: the edge
 * does not own the schema, it only refuses to pin what is not JSON at all.
 */
export function maybeStoreLastGoodEdgeCache(
  context: PagesContextWithWaitUntil,
  cache: EdgeCache | null,
  cacheKey: Request,
  response: Response,
): void {
  if (!cache || response.status !== 200 || !isJsonResponse(response)) return;
  waitUntilOrVoid(
    context,
    storeParseableJson(cache, cacheKey, response.clone())
      .catch((error) => reportEdgeCacheFailure("last-good-write", error)),
  );
}

async function storeParseableJson(
  cache: EdgeCache,
  cacheKey: Request,
  response: Response,
): Promise<void> {
  const text = await response.text();
  try {
    JSON.parse(text);
  } catch {
    return;
  }
  const headers = new Headers(response.headers);
  headers.set("cache-control", `public, max-age=${LAST_GOOD_MAX_AGE_SEC}`);
  headers.set(LAST_GOOD_STORED_AT_HEADER, String(Math.floor(Date.now() / 1000)));
  await cache.put(cacheKey, new Response(text, {
    status: response.status,
    statusText: response.statusText,
    headers,
  }));
}

export interface LastGoodEdgeEntry {
  response: Response;
  storedAgeSeconds: number;
}

/**
 * Returns the last-good copy only while it is still inside the staleness cap.
 * An entry without a usable stamp is treated as absent rather than as fresh.
 */
export async function readLastGoodEdgeCache(
  cache: EdgeCache | null,
  cacheKey: Request,
): Promise<LastGoodEdgeEntry | null> {
  if (!cache) return null;
  const response = await cache.match(cacheKey).catch((error) => {
    reportEdgeCacheFailure("last-good-read", error);
    return undefined;
  });
  if (!response) return null;
  const storedAt = Number(response.headers.get(LAST_GOOD_STORED_AT_HEADER));
  if (!Number.isFinite(storedAt) || storedAt <= 0) return null;
  const storedAgeSeconds = Math.max(0, Math.floor(Date.now() / 1000) - storedAt);
  if (storedAgeSeconds > LAST_GOOD_MAX_AGE_SEC) return null;
  return { response, storedAgeSeconds };
}
