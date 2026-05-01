import { PHAROSVILLE_API_CLIENT_ENDPOINTS } from "../../shared/lib/pharosville-api-client-contract";

interface Env {
  PHAROS_API_BASE?: string;
  PHAROS_API_KEY?: string;
}

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

interface PagesContext {
  request: Request;
  env: Env;
  params: {
    path?: string | string[];
  };
  waitUntil?: (promise: Promise<unknown>) => void;
}

const FORWARDED_RESPONSE_HEADERS = [
  "cache-control",
  "content-type",
  "etag",
  "retry-after",
  "warning",
  "x-data-age",
] as const;

const REQUIRED_PHAROS_API_ORIGIN = "https://api.pharos.watch";
const CACHE_KEY_ORIGIN = "https://pharosville.pharos.watch";
const UPSTREAM_TIMEOUT_MS = 8_000;

function jsonError(message: string, status: number, headers?: HeadersInit): Response {
  return Response.json({ error: message }, { status, headers });
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

function isJsonResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return contentType.includes("application/json") || contentType.includes("+json");
}

function getEdgeCache(): EdgeCache | null {
  const maybeCaches = globalThis.caches as unknown as { default?: EdgeCache } | undefined;
  return maybeCaches?.default ?? null;
}

function buildCacheKey(url: URL): Request {
  return new Request(new URL(`${url.pathname}${url.search}`, CACHE_KEY_ORIGIN).toString(), {
    method: "GET",
  });
}

function prepareProxyResponseForCache(response: Response, maxAgeSec: number): Response {
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

function maybeStoreEdgeCache(
  context: PagesContext,
  cache: EdgeCache | null,
  cacheKey: Request,
  response: Response,
): void {
  if (!cache || response.status !== 200 || !isJsonResponse(response)) return;

  const cacheWrite = cache.put(cacheKey, response.clone()).catch(() => undefined);
  if (context.waitUntil) {
    context.waitUntil(cacheWrite);
  }
}

async function fetchUpstream(url: string, apiKey: string): Promise<Response | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
      },
      redirect: "manual",
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
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
  const cacheKey = buildCacheKey(url);
  const cached = await cache?.match(cacheKey);
  if (cached) return cached;

  const upstream = await fetchUpstream(buildUpstreamUrl(base, url), apiKey);
  if (!upstream) {
    return jsonError("PharosVille API upstream request failed", 502);
  }

  const response = prepareProxyResponseForCache(new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: copyForwardedHeaders(upstream),
  }), endpoint.metaMaxAgeSec);
  maybeStoreEdgeCache(context, cache, cacheKey, response);
  return response;
}
