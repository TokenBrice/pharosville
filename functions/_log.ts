import {
  getEdgeCache,
  jsonErrorResponse,
  waitUntilOrVoid,
  withSecurityHeaders,
  type PagesContextWithWaitUntil,
} from "./_shared";

interface PagesContext extends PagesContextWithWaitUntil {
  request: Request;
}

const MAX_BODY_BYTES = 4 * 1024;
const RATE_LIMIT_WINDOW_SECONDS = 10;
const RATE_LIMIT_CACHE_ORIGIN = "https://pharosville-log-rate-limit.local";
const LOG_SECURITY_RESPONSE_HEADERS = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
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

function noContent(): Response {
  return withSecurityHeaders(new Response(null, { status: 204 }), LOG_SECURITY_RESPONSE_HEADERS);
}

function rejected(message: string, status: number): Response {
  return jsonErrorResponse(message, status, LOG_SECURITY_RESPONSE_HEADERS);
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
  waitUntilOrVoid(context, cacheWrite);
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

async function readLimitedText(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
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
    const text = await readLimitedText(request, MAX_BODY_BYTES);
    if (text === null) return rejected("Payload too large", 413);
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
