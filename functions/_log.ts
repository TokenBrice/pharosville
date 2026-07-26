import {
  getEdgeCache,
  jsonErrorResponse,
  waitUntilOrVoid,
  withSecurityHeaders,
  type PagesContextWithWaitUntil,
} from "./_shared";

/**
 * Minimal shape of a Workers KV binding. It is optional because the namespace
 * is attached in the Cloudflare dashboard rather than in `wrangler.toml`, so a
 * deployment without it must still accept and log reports.
 */
interface LogKvNamespace {
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface PagesContext extends PagesContextWithWaitUntil {
  request: Request;
  env?: { CLIENT_ERROR_KV?: LogKvNamespace };
}

const MAX_BODY_BYTES = 4 * 1024;
const RATE_LIMIT_WINDOW_SECONDS = 10;
const RATE_LIMIT_CACHE_ORIGIN = "https://pharosville-log-rate-limit.local";

/**
 * Fixed event tokens. Pages Functions logs are streamed, never stored, so the
 * only thing that makes a report findable is a stable literal to grep for —
 * in `wrangler pages deployment tail` and in a KV listing prefix alike.
 *
 * Neither token is a prefix of the other: a search for real client errors can
 * never match a synthetic canary probe.
 */
const CLIENT_ERROR_EVENT = "PHAROSVILLE_CLIENT_ERROR";
const CANARY_EVENT = "PHAROSVILLE_CANARY_PROBE";
const CANARY_HEADER = "x-pharosville-canary";
const KV_TTL_SECONDS = 30 * 24 * 60 * 60;
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

/**
 * A caller's own claim about itself, not a credential — anyone can send this
 * header. It therefore buys nothing but a label: the event token the report is
 * filed under, and a second bucket namespace for that same caller. Nothing a
 * spoofer sends can reach another caller's budget or another caller's reports.
 */
function isSyntheticProbe(request: Request): boolean {
  return request.headers.get(CANARY_HEADER)?.trim() === "1";
}

async function isRateLimited(context: PagesContext, synthetic: boolean): Promise<boolean> {
  const cache = getEdgeCache();
  if (!cache) return false;

  // Every bucket is keyed by caller, synthetic or not. The marker only picks
  // which of that caller's two buckets is spent, so a probe never spends a real
  // visitor's budget from the same address, and a spoofed marker can only
  // exhaust the spoofer's own bucket. A bucket shared across callers would be
  // the opposite: anyone could hold it open and 429 the CI probe out of the sky.
  const scope = synthetic ? "canary" : "client";
  const bucket = await sha256Hex(clientIp(context.request));
  const cacheKey = new Request(`${RATE_LIMIT_CACHE_ORIGIN}/_log/${scope}/${bucket}`, { method: "GET" });
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

/**
 * Best-effort durable copy. One key per report rather than a per-day counter:
 * KV is eventually consistent, so concurrent read-modify-write increments lose
 * each other, while distinct keys never collide and `wrangler kv key list
 * --prefix <EVENT>:<date>` still yields the day's count along with the reports
 * themselves. Never throws and never blocks the response.
 */
function storeReport(context: PagesContext, event: string, ray: string, line: string): void {
  try {
    const kv = context.env?.CLIENT_ERROR_KV;
    if (!kv) return;
    const key = `${event}:${new Date().toISOString()}:${ray || crypto.randomUUID()}`;
    waitUntilOrVoid(
      context,
      kv.put(key, line, { expirationTtl: KV_TTL_SECONDS }).catch(() => undefined),
    );
  } catch {
    // A missing, misconfigured, or failing binding must never cost a report the
    // console line that is otherwise the only record of it.
  }
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

  const synthetic = isSyntheticProbe(request);
  if (await isRateLimited(context, synthetic)) {
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
  const event = synthetic ? CANARY_EVENT : CLIENT_ERROR_EVENT;
  // Flat, not nested: every projected field sits at the top level so a log
  // query can filter on `category` or `message` without unwrapping a blob.
  const line = `${event} ${JSON.stringify({
    event,
    ...projected,
    country,
    origin,
    ray,
    ua: truncate(ua, 200),
  })}`;
  console.error(line);
  storeReport(context, event, ray, line);

  return noContent();
}
