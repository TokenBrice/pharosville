import { classifyFreshnessRatio } from "@shared/lib/status-thresholds";
import type { ApiMeta } from "@shared/types/api-meta";
import type { PharosVilleApiEndpointKey } from "@shared/types/pharosville-endpoint-keys";

/**
 * Last-good world payloads, kept in this browser so a returning visitor gets a
 * harbour immediately instead of staring at the loading sea while six feeds
 * refetch — and still gets one when the API is down entirely.
 *
 * Hand-rolled rather than `@tanstack/query-persist-client-core`: that package
 * restores the WHOLE query cache as-is, which would hand the app its old
 * `_meta` verbatim and let a two-hour-old payload present itself as `fresh`.
 * The rule here is the opposite — restored data is republished with a
 * recomputed age and the same `Warning: 110` marker the edge proxy sets when it
 * serves last-good data, so it travels the demotion path in `src/lib/api.ts`
 * and lands in the existing staleness UI, caveats and ledger wording. Doing
 * that through the library would have meant a custom serialise/deserialise pair
 * anyway, on top of a dependency and its own restore lifecycle.
 *
 * VALIDATION SITS ON THE WRITE SIDE. Payloads are checked against the shared
 * Zod contract before they are allowed into the store, so nothing unvalidated
 * can ever be restored. That is deliberately not a read-time check: the
 * contract module pulls Zod and every payload schema, and `src/lib/api.ts`
 * documents at length why that must stay off the world's critical path. The
 * validation therefore runs where `auditApiPayloadContract` already runs —
 * behind a dynamic import, when the browser is idle. A schema change that
 * lands after a payload was stored is caught by {@link STORE_VERSION}.
 */

/** Bump when a stored payload's shape changes; mismatched entries are deleted on read. */
const STORE_VERSION = 1;

const KEY_PREFIX = "pharosville.world-cache";

/** Matches the edge cache's own ceiling: nothing older than a day is worth restoring. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Per-entry ceiling in serialized characters. The stablecoins payload is the
 * big one (~0.8 MB and growing with the fleet); six entries near this cap would
 * still sit inside a typical 5 MB origin quota. An oversized payload is simply
 * not persisted — a partial restore is a smaller world, not a broken one.
 */
const MAX_ENTRY_CHARS = 1_000_000;

/**
 * Persisting means a full Zod parse of the payload, so it is not something to
 * do on every poll tick. The first successful fetch of a session writes
 * immediately; after that an endpoint refreshes its entry at most this often.
 */
const PERSIST_MIN_INTERVAL_MS = 10 * 60 * 1000;

/**
 * The `110` marker is what `src/lib/api.ts` reads to demote a payload out of
 * `fresh`. Provenance is spelled out so a log or a support question can tell a
 * browser restore apart from an edge-served stale hit.
 */
const RESTORED_WARNING = '110 - "Response is stale (restored from this browser\'s last-good cache)"';

/**
 * Keys that must never reach storage. These are public read endpoints and the
 * persister is only ever handed a parsed body plus `ApiMeta` — no headers, no
 * `RequestInit` — but the payloads are server-shaped, so assert it rather than
 * trust it.
 */
const CREDENTIAL_KEY_PATTERN
  = /"(?:authorization|cookie|set-cookie|x-api-key|api[-_]?key|apikey|access[-_]?token|refresh[-_]?token|client[-_]?secret|secret|password|passphrase|bearer|pharos_api_key)"\s*:/i;

interface StoredEntry {
  v: number;
  storedAt: number;
  meta: ApiMeta | null;
  data: unknown;
}

export interface RestoredPayload<T> {
  data: T;
  /** Never `fresh`: always carries {@link RESTORED_WARNING} and a recomputed age. */
  meta: ApiMeta;
  /** Epoch ms the entry was written, for `initialDataUpdatedAt`. */
  storedAt: number;
}

function storageKey(endpointKey: PharosVilleApiEndpointKey): string {
  return `${KEY_PREFIX}.${endpointKey}`;
}

/**
 * Resolved per call rather than cached: Safari's private mode throws on access,
 * and tests stub the global.
 */
function resolveStorage(): Storage | null {
  try {
    const storage = globalThis.localStorage;
    if (!storage || typeof storage.getItem !== "function") return null;
    return storage;
  } catch {
    return null;
  }
}

function discard(storage: Storage, endpointKey: PharosVilleApiEndpointKey): null {
  try {
    storage.removeItem(storageKey(endpointKey));
  } catch {
    // A store we cannot write to is a store we simply do not use.
  }
  return null;
}

/**
 * Republish a stored payload's freshness the way `src/lib/api.ts` would have
 * published it had the edge served this body from its last-good cache: age
 * recomputed from the payload's own `updatedAt`, classified by the shared
 * ratio thresholds, then demoted out of `fresh` by the `Warning: 110` marker.
 * Same rule, same thresholds, same marker — not a second notion of stale.
 */
export function deriveRestoredMeta(
  storedMeta: ApiMeta | null,
  storedAt: number,
  metaMaxAgeSec: number,
  nowMs: number,
): ApiMeta {
  // Without meta the only timestamp we have is when this browser saw the body.
  // That understates age, which is why the warning below still applies.
  const updatedAt = storedMeta?.updatedAt ?? Math.floor(storedAt / 1000);
  const ageSeconds = Math.max(0, Math.floor(nowMs / 1000) - updatedAt);
  const classified = classifyFreshnessRatio(ageSeconds / Math.max(1, metaMaxAgeSec));

  return {
    updatedAt,
    ageSeconds,
    status: classified === "fresh" ? "degraded" : classified,
    warning: RESTORED_WARNING,
    ...(storedMeta?.dependencies !== undefined ? { dependencies: storedMeta.dependencies } : {}),
  };
}

/**
 * Read the last-good payload for one endpoint, or `null` if there is nothing
 * usable. Anything unparseable, oversized, expired or written by another store
 * version is deleted on the way out.
 */
export function readPersistedPayload<T>(
  endpointKey: PharosVilleApiEndpointKey,
  metaMaxAgeSec: number,
  nowMs: number = Date.now(),
): RestoredPayload<T> | null {
  const storage = resolveStorage();
  if (!storage) return null;

  let raw: string | null;
  try {
    raw = storage.getItem(storageKey(endpointKey));
  } catch {
    return null;
  }
  if (!raw) return null;
  if (raw.length > MAX_ENTRY_CHARS) return discard(storage, endpointKey);

  let entry: StoredEntry;
  try {
    entry = JSON.parse(raw) as StoredEntry;
  } catch {
    return discard(storage, endpointKey);
  }

  if (!entry || typeof entry !== "object") return discard(storage, endpointKey);
  if (entry.v !== STORE_VERSION) return discard(storage, endpointKey);
  if (typeof entry.storedAt !== "number" || !Number.isFinite(entry.storedAt)) {
    return discard(storage, endpointKey);
  }
  // A clock that moved backwards makes the age unknowable, so treat it as expired.
  const age = nowMs - entry.storedAt;
  if (age > MAX_AGE_MS || age < -MAX_AGE_MS) return discard(storage, endpointKey);
  if (entry.data === undefined || entry.data === null) return discard(storage, endpointKey);

  return {
    data: entry.data as T,
    meta: deriveRestoredMeta(entry.meta ?? null, entry.storedAt, metaMaxAgeSec, nowMs),
    storedAt: entry.storedAt,
  };
}

const lastPersistedAt = new Map<PharosVilleApiEndpointKey, number>();

export function clearPersistedPayload(endpointKey: PharosVilleApiEndpointKey): void {
  const storage = resolveStorage();
  if (storage) discard(storage, endpointKey);
  lastPersistedAt.delete(endpointKey);
}

/**
 * Write a payload that has already cleared the contract schema. Returns whether
 * it made it in, so the caller (and the tests) can tell a refusal from a write.
 */
function writePersistedPayload(
  endpointKey: PharosVilleApiEndpointKey,
  data: unknown,
  meta: ApiMeta | null,
  nowMs: number,
): boolean {
  const storage = resolveStorage();
  if (!storage) return false;

  const entry: StoredEntry = { v: STORE_VERSION, storedAt: nowMs, meta, data };
  let serialized: string;
  try {
    serialized = JSON.stringify(entry);
  } catch {
    return false;
  }

  if (serialized.length > MAX_ENTRY_CHARS) return false;
  if (CREDENTIAL_KEY_PATTERN.test(serialized)) {
    console.warn(`[world-cache] refused to persist ${endpointKey}: payload contains a credential-shaped key`);
    return false;
  }

  try {
    storage.setItem(storageKey(endpointKey), serialized);
  } catch {
    // Almost always a quota error. Drop this entry rather than leaving a
    // half-written store, and let the next interval try again.
    discard(storage, endpointKey);
    return false;
  }
  return true;
}

async function validateAndPersist(
  endpointKey: PharosVilleApiEndpointKey,
  data: unknown,
  meta: ApiMeta | null,
  nowMs: number,
): Promise<void> {
  const { PHAROSVILLE_API_CONTRACT } = await import("@shared/lib/pharosville-api-contract");
  const schema = PHAROSVILLE_API_CONTRACT[endpointKey]?.schema;
  if (!schema || !schema.safeParse(data).success) {
    clearPersistedPayload(endpointKey);
    return;
  }
  if (!writePersistedPayload(endpointKey, data, meta, nowMs)) {
    lastPersistedAt.delete(endpointKey);
  }
}

/**
 * Queue a payload for persistence once the browser is idle. Never throws and
 * never blocks a render: a store that will not take the payload just means the
 * next visit loads the normal way.
 */
export function persistPayloadWhenIdle(
  endpointKey: PharosVilleApiEndpointKey,
  data: unknown,
  meta: ApiMeta | null,
  nowMs: number = Date.now(),
): void {
  if (data === undefined || data === null) return;
  if (!resolveStorage()) return;

  const previous = lastPersistedAt.get(endpointKey);
  if (previous !== undefined && nowMs - previous < PERSIST_MIN_INTERVAL_MS) return;
  lastPersistedAt.set(endpointKey, nowMs);

  const run = () => {
    void validateAndPersist(endpointKey, data, meta, nowMs).catch(() => {
      lastPersistedAt.delete(endpointKey);
    });
  };
  if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 5_000 });
  else setTimeout(run, 2_000);
}

export const WORLD_PAYLOAD_CACHE_INTERNALS = {
  STORE_VERSION,
  MAX_AGE_MS,
  MAX_ENTRY_CHARS,
  PERSIST_MIN_INTERVAL_MS,
  RESTORED_WARNING,
  storageKey,
  writePersistedPayload,
  resetPersistThrottle: () => lastPersistedAt.clear(),
} as const;
