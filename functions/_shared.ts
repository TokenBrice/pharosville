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
  "permissions-policy": "accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
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
  waitUntilOrVoid(context, cache.put(cacheKey, response.clone()).catch(() => undefined));
}
