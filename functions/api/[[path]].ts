interface Env {
  PHAROS_API_BASE?: string;
  PHAROS_API_KEY?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
  params: {
    path?: string | string[];
  };
}

interface AllowedEndpoint {
  pathname: string;
  search: string;
}

const ALLOWED_ENDPOINTS: readonly AllowedEndpoint[] = [
  { pathname: "/api/stablecoins", search: "" },
  { pathname: "/api/chains", search: "" },
  { pathname: "/api/stability-index", search: "?detail=true" },
  { pathname: "/api/peg-summary", search: "" },
  { pathname: "/api/stress-signals", search: "" },
  { pathname: "/api/report-cards", search: "" },
];

const FORWARDED_RESPONSE_HEADERS = [
  "cache-control",
  "content-type",
  "etag",
  "retry-after",
  "warning",
  "x-data-age",
] as const;

function jsonError(message: string, status: number, headers?: HeadersInit): Response {
  return Response.json({ error: message }, { status, headers });
}

function normalizeBaseUrl(base: string | undefined): string | null {
  const trimmed = base?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return null;
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function isAllowedRequest(url: URL): boolean {
  return ALLOWED_ENDPOINTS.some((endpoint) => (
    endpoint.pathname === url.pathname
    && endpoint.search === url.search
  ));
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

export async function onRequest(context: PagesContext): Promise<Response> {
  if (context.request.method !== "GET") {
    return jsonError("Method not allowed", 405, { Allow: "GET" });
  }

  const url = new URL(context.request.url);
  if (!isAllowedRequest(url)) {
    return jsonError("Not found", 404);
  }

  const base = normalizeBaseUrl(context.env.PHAROS_API_BASE);
  const apiKey = context.env.PHAROS_API_KEY?.trim();
  if (!base || !apiKey) {
    return jsonError("PharosVille API proxy is not configured", 500);
  }

  const upstream = await fetch(buildUpstreamUrl(base, url), {
    headers: {
      Accept: "application/json",
      "X-API-Key": apiKey,
    },
    redirect: "manual",
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: copyForwardedHeaders(upstream),
  });
}
