import { projectDiagnostic } from "../src/error-diagnostic";
import {
  getEdgeCache,
  jsonErrorResponse,
  reportEdgeCacheFailure,
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
const RATE_LIMIT_QUERY_PARAM = "rate-limit";

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
const CANARY_RUN_HEADER = "x-pharosville-canary-run";
const STORAGE_HEADER = "x-pharosville-storage";
const SYNTHETIC_STORAGE_TIMEOUT_MS = 2_000;
type StorageSignal = "accepted" | "failed" | "not-configured";
const KV_TTL_SECONDS = 30 * 24 * 60 * 60;
const LOG_SECURITY_RESPONSE_HEADERS = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
} as const;

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
 * filed under. The rate limiter ignores it entirely, so a spoofer can neither
 * reach another caller's budget nor widen its own.
 */
function isSyntheticProbe(request: Request): boolean {
  return request.headers.get(CANARY_HEADER)?.trim() === "1";
}

/**
 * A reserved query on this Function's own route. `caches.default` is the store
 * the CDN serves this zone from, and Cloudflare documents no support for writing
 * a key on a hostname the deployment does not serve — a rejected `put` would
 * leave the limiter silently open. In-zone it cannot be poisoned either: `/_log`
 * answers every GET `405` with `no-store`, and a hit could only ever return the
 * literal `1` to someone who already knew the address it was derived from.
 */
function rateLimitCacheKey(request: Request, bucket: string): Request {
  const url = new URL(request.url);
  url.search = `?${RATE_LIMIT_QUERY_PARAM}=${bucket}`;
  return new Request(url.toString(), { method: "GET" });
}

async function isRateLimited(context: PagesContext): Promise<boolean> {
  const cache = getEdgeCache();
  if (!cache) return false;

  // One bucket per caller, whatever that caller claims to be. Namespacing the
  // key by a synthetic marker instead would hand anyone who alternates the
  // header on and off two buckets and so twice the budget; marking a request
  // synthetic must never loosen its limit. A bucket shared across callers is the
  // opposite failure — anyone could hold it open and 429 the CI probe out of the
  // sky — so the caller stays the only thing the key is derived from.
  const bucket = await sha256Hex(clientIp(context.request));
  const cacheKey = rateLimitCacheKey(context.request, bucket);
  const hit = await cache.match(cacheKey);
  if (hit) return true;

  const cacheWrite = cache.put(
    cacheKey,
    new Response("1", {
      headers: { "cache-control": `public, max-age=${RATE_LIMIT_WINDOW_SECONDS}` },
    }),
  ).catch((error) => reportEdgeCacheFailure("log-rate-limit", error));
  waitUntilOrVoid(context, cacheWrite);
  return false;
}

/** Real reports never wait for KV; only the synthetic probe receives its storage result. */
function storeReport(context: PagesContext, event: string, line: string, runToken: string | null): Promise<StorageSignal> {
  try {
    const kv = context.env?.CLIENT_ERROR_KV;
    if (!kv) return Promise.resolve("not-configured");
    const key = event === CANARY_EVENT && runToken
      ? `${CANARY_EVENT}:run:${runToken}`
      : `${event}:${new Date().toISOString()}:${crypto.randomUUID()}`;
    const storage = kv.put(key, line, { expirationTtl: KV_TTL_SECONDS })
      .then(() => "accepted" as const, () => "failed" as const);
    waitUntilOrVoid(context, storage);
    return storage;
  } catch {
    return Promise.resolve("failed");
  }
}

async function syntheticStorageSignal(storage: Promise<StorageSignal>): Promise<StorageSignal> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      storage,
      new Promise<StorageSignal>((resolve) => {
        timeoutId = setTimeout(() => resolve("failed"), SYNTHETIC_STORAGE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
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
  const runToken = synthetic ? request.headers.get(CANARY_RUN_HEADER) : null;
  if (runToken !== null && !/^[a-zA-Z0-9_-]{1,80}$/.test(runToken)) return rejected("Bad request", 400);
  if (await isRateLimited(context)) {
    const response = rejected("Too many requests", 429);
    response.headers.set("retry-after", String(RATE_LIMIT_WINDOW_SECONDS));
    return response;
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

  const projected = projectDiagnostic(payload);
  if (!projected) {
    return rejected("Bad request", 400);
  }

  const event = synthetic ? CANARY_EVENT : CLIENT_ERROR_EVENT;
  // Flat, not nested: every projected field sits at the top level so a log
  // query can filter on `category` or `code` without unwrapping a blob.
  const line = `${event} ${JSON.stringify({
    event,
    ...projected,
  })}`;
  console.error(line);
  const storage = storeReport(context, event, line, runToken);

  const response = noContent();
  if (synthetic) response.headers.set(STORAGE_HEADER, await syntheticStorageSignal(storage));
  return response;
}
