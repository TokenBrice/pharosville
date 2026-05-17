interface PagesContext {
  request: Request;
  waitUntil?: (promise: Promise<unknown>) => void;
}

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

const MAX_BODY_BYTES = 4 * 1024;
const RATE_LIMIT_WINDOW_SECONDS = 10;
const RATE_LIMIT_CACHE_ORIGIN = "https://pharosville-log-rate-limit.local";
const SECURITY_RESPONSE_HEADERS = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

const STRING_PAYLOAD_FIELDS = [
  ["category", 64],
  ["kind", 64],
  ["message", 1_000],
  ["filename", 500],
  ["reason", 1_000],
  ["stack", 2_000],
  ["url", 500],
] as const;
const NUMBER_PAYLOAD_FIELDS = ["ts", "lineno", "colno"] as const;

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_RESPONSE_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function noContent(): Response {
  return withSecurityHeaders(new Response(null, { status: 204 }));
}

function rejected(message: string, status: number): Response {
  return withSecurityHeaders(Response.json({ error: message }, { status }));
}

function sameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function getEdgeCache(): EdgeCache | null {
  const maybeCaches = globalThis.caches as unknown as { default?: EdgeCache } | undefined;
  return maybeCaches?.default ?? null;
}

function clientIp(request: Request): string {
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || "unknown";
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function isRateLimited(context: PagesContext): Promise<boolean> {
  const cache = getEdgeCache();
  if (!cache) return false;

  const ipHash = await sha256Hex(clientIp(context.request));
  const cacheKey = new Request(`${RATE_LIMIT_CACHE_ORIGIN}/_log/${ipHash}`, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return true;

  const cacheWrite = cache.put(
    cacheKey,
    new Response("1", {
      headers: { "cache-control": `public, max-age=${RATE_LIMIT_WINDOW_SECONDS}` },
    }),
  ).catch(() => undefined);
  if (context.waitUntil) {
    context.waitUntil(cacheWrite);
  } else {
    void cacheWrite;
  }
  return false;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function projectedUrl(value: string, maxLength: number): string {
  try {
    const parsed = new URL(value);
    return truncate(`${parsed.origin}${parsed.pathname}`, maxLength);
  } catch {
    return truncate(value, maxLength);
  }
}

function projectPayload(payload: unknown): Record<string, string | number> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const source = payload as Record<string, unknown>;
  const projected: Record<string, string | number> = {};

  for (const [field, maxLength] of STRING_PAYLOAD_FIELDS) {
    const value = source[field];
    if (typeof value !== "string") continue;
    projected[field] = field === "url" || field === "filename"
      ? projectedUrl(value, maxLength)
      : truncate(value, maxLength);
  }

  for (const field of NUMBER_PAYLOAD_FIELDS) {
    const value = source[field];
    if (typeof value === "number" && Number.isFinite(value)) projected[field] = value;
  }

  return Object.keys(projected).length > 0 ? projected : null;
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request } = context;
  if (request.method !== "POST") {
    return rejected("Method not allowed", 405);
  }

  if (!sameOriginRequest(request)) {
    return rejected("Forbidden", 403);
  }

  if (await isRateLimited(context)) {
    return rejected("Too many requests", 429);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return rejected("Unsupported media type", 415);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return rejected("Payload too large", 413);
  }

  let payload: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return rejected("Payload too large", 413);
    payload = JSON.parse(text);
  } catch {
    return rejected("Bad request", 400);
  }

  const projected = projectPayload(payload);
  if (!projected) {
    return rejected("Bad request", 400);
  }

  const ray = request.headers.get("cf-ray") ?? "";
  const country = request.headers.get("cf-ipcountry") ?? "";
  const ua = request.headers.get("user-agent") ?? "";
  const origin = request.headers.get("origin") ?? "";
  console.error(JSON.stringify({
    source: "pharosville-client",
    country,
    origin,
    payload: projected,
    ray,
    ua: truncate(ua, 200),
  }));

  return noContent();
}
