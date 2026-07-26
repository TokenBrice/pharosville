/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiMeta } from "@shared/types/api-meta";
import {
  clearPersistedPayload,
  deriveRestoredMeta,
  persistPayloadWhenIdle,
  readPersistedPayload,
  WORLD_PAYLOAD_CACHE_INTERNALS as INTERNALS,
} from "./world-payload-cache";

// This repo's vitest run has NO `localStorage`, even under jsdom: Node's
// experimental `globalThis.localStorage` shadows jsdom's implementation. Every
// test therefore installs its own store rather than assuming a global.
function createFakeStorage(): Storage & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    get length() {
      return entries.size;
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
    clear: () => entries.clear(),
  } as Storage & { entries: Map<string, string> };
}

const CHAINS_KEY = INTERNALS.storageKey("chains");
const NOW = 1_800_000_000_000;
const CHAINS_MAX_AGE_SEC = 900;

const VALID_CHAINS_PAYLOAD = {
  chains: [],
  globalTotalUsd: 1,
  chainAttributedTotalUsd: 1,
  unattributedTotalUsd: 0,
  globalChange24hPct: 0,
  globalChange7dPct: 0,
  globalChange30dPct: 0,
  updatedAt: 1_799_999_000,
  healthMethodologyVersion: "v1",
};

function storeRaw(storage: Storage, value: unknown): void {
  storage.setItem(CHAINS_KEY, typeof value === "string" ? value : JSON.stringify(value));
}

let storage: ReturnType<typeof createFakeStorage>;

beforeEach(() => {
  storage = createFakeStorage();
  vi.stubGlobal("localStorage", storage);
  INTERNALS.resetPersistThrottle();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("deriveRestoredMeta", () => {
  it("never republishes restored data as fresh", () => {
    const storedMeta: ApiMeta = { updatedAt: Math.floor(NOW / 1000), ageSeconds: 0, status: "fresh" };
    const meta = deriveRestoredMeta(storedMeta, NOW, CHAINS_MAX_AGE_SEC, NOW);

    expect(meta.status).toBe("degraded");
    expect(meta.warning).toContain("110");
  });

  it("recomputes age from the payload's own updatedAt and classifies it stale once well past max age", () => {
    const storedMeta: ApiMeta = { updatedAt: Math.floor(NOW / 1000) - 40_000, ageSeconds: 5, status: "fresh" };
    const meta = deriveRestoredMeta(storedMeta, NOW - 1000, CHAINS_MAX_AGE_SEC, NOW);

    expect(meta.ageSeconds).toBe(40_000);
    expect(meta.status).toBe("stale");
  });

  it("falls back to the moment this browser stored the body when there is no meta", () => {
    const meta = deriveRestoredMeta(null, NOW - 60_000, CHAINS_MAX_AGE_SEC, NOW);

    expect(meta.updatedAt).toBe(Math.floor((NOW - 60_000) / 1000));
    expect(meta.ageSeconds).toBe(60);
    expect(meta.status).toBe("degraded");
  });
});

describe("readPersistedPayload", () => {
  it("restores a stored payload immediately, marked stale rather than fresh", () => {
    storeRaw(storage, {
      v: INTERNALS.STORE_VERSION,
      storedAt: NOW - 60_000,
      meta: { updatedAt: Math.floor(NOW / 1000) - 120, ageSeconds: 120, status: "fresh" },
      data: VALID_CHAINS_PAYLOAD,
    });

    const restored = readPersistedPayload<typeof VALID_CHAINS_PAYLOAD>("chains", CHAINS_MAX_AGE_SEC, NOW);

    expect(restored?.data).toEqual(VALID_CHAINS_PAYLOAD);
    expect(restored?.storedAt).toBe(NOW - 60_000);
    expect(restored?.meta.status).not.toBe("fresh");
    expect(restored?.meta.status).toBe("degraded");
  });

  it("returns null without throwing when there is no storage at all", () => {
    vi.stubGlobal("localStorage", undefined);

    expect(readPersistedPayload("chains", CHAINS_MAX_AGE_SEC, NOW)).toBeNull();
  });

  it("discards an entry older than the 24h ceiling", () => {
    storeRaw(storage, {
      v: INTERNALS.STORE_VERSION,
      storedAt: NOW - INTERNALS.MAX_AGE_MS - 1,
      meta: null,
      data: VALID_CHAINS_PAYLOAD,
    });

    expect(readPersistedPayload("chains", CHAINS_MAX_AGE_SEC, NOW)).toBeNull();
    expect(storage.entries.has(CHAINS_KEY)).toBe(false);
  });

  it("discards an entry whose timestamp is in the future by more than the ceiling", () => {
    storeRaw(storage, {
      v: INTERNALS.STORE_VERSION,
      storedAt: NOW + INTERNALS.MAX_AGE_MS + 1,
      meta: null,
      data: VALID_CHAINS_PAYLOAD,
    });

    expect(readPersistedPayload("chains", CHAINS_MAX_AGE_SEC, NOW)).toBeNull();
    expect(storage.entries.has(CHAINS_KEY)).toBe(false);
  });

  it("discards an oversized entry", () => {
    storage.setItem(CHAINS_KEY, "x".repeat(INTERNALS.MAX_ENTRY_CHARS + 1));

    expect(readPersistedPayload("chains", CHAINS_MAX_AGE_SEC, NOW)).toBeNull();
    expect(storage.entries.has(CHAINS_KEY)).toBe(false);
  });

  it("discards an entry that is not parseable JSON", () => {
    storeRaw(storage, "{not json");

    expect(readPersistedPayload("chains", CHAINS_MAX_AGE_SEC, NOW)).toBeNull();
    expect(storage.entries.has(CHAINS_KEY)).toBe(false);
  });

  it("discards an entry written by a different store version", () => {
    storeRaw(storage, {
      v: INTERNALS.STORE_VERSION + 1,
      storedAt: NOW - 1_000,
      meta: null,
      data: VALID_CHAINS_PAYLOAD,
    });

    expect(readPersistedPayload("chains", CHAINS_MAX_AGE_SEC, NOW)).toBeNull();
    expect(storage.entries.has(CHAINS_KEY)).toBe(false);
  });

  it("discards an entry with no payload", () => {
    storeRaw(storage, { v: INTERNALS.STORE_VERSION, storedAt: NOW - 1_000, meta: null, data: null });

    expect(readPersistedPayload("chains", CHAINS_MAX_AGE_SEC, NOW)).toBeNull();
    expect(storage.entries.has(CHAINS_KEY)).toBe(false);
  });
});

describe("write guards", () => {
  it("stamps the current store version so a later bump busts it", () => {
    expect(INTERNALS.writePersistedPayload("chains", VALID_CHAINS_PAYLOAD, null, NOW)).toBe(true);

    const entry = JSON.parse(storage.entries.get(CHAINS_KEY)!) as { v: number; storedAt: number };
    expect(entry.v).toBe(INTERNALS.STORE_VERSION);
    expect(entry.storedAt).toBe(NOW);
  });

  it("refuses a payload carrying a credential-shaped key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const written = INTERNALS.writePersistedPayload(
      "chains",
      { ...VALID_CHAINS_PAYLOAD, authorization: "Bearer nope" },
      null,
      NOW,
    );

    expect(written).toBe(false);
    expect(storage.entries.has(CHAINS_KEY)).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("refuses a payload over the per-entry size cap", () => {
    const written = INTERNALS.writePersistedPayload(
      "chains",
      { ...VALID_CHAINS_PAYLOAD, healthMethodologyVersion: "x".repeat(INTERNALS.MAX_ENTRY_CHARS) },
      null,
      NOW,
    );

    expect(written).toBe(false);
    expect(storage.entries.has(CHAINS_KEY)).toBe(false);
  });

  it("leaves no half-written entry when the store rejects the write", () => {
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(INTERNALS.writePersistedPayload("chains", VALID_CHAINS_PAYLOAD, null, NOW)).toBe(false);
    expect(storage.entries.has(CHAINS_KEY)).toBe(false);
  });
});

describe("persistPayloadWhenIdle", () => {
  beforeEach(() => {
    // jsdom has no requestIdleCallback; run the queued work inline so the
    // assertions do not depend on a timer.
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
      callback({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline);
      return 0;
    });
  });

  it("persists a payload that satisfies the shared contract schema", async () => {
    persistPayloadWhenIdle("chains", VALID_CHAINS_PAYLOAD, null, NOW);

    await vi.waitFor(() => expect(storage.entries.has(CHAINS_KEY)).toBe(true));
    const restored = readPersistedPayload("chains", CHAINS_MAX_AGE_SEC, NOW);
    expect(restored?.data).toEqual(VALID_CHAINS_PAYLOAD);
  });

  it("never lets a payload that fails contract validation into the store", async () => {
    storeRaw(storage, {
      v: INTERNALS.STORE_VERSION,
      storedAt: NOW - 1_000,
      meta: null,
      data: VALID_CHAINS_PAYLOAD,
    });

    persistPayloadWhenIdle("chains", { chains: "not an array" }, null, NOW);

    // The bad payload is rejected AND the entry it would have replaced is
    // dropped, so a shape change cannot leave a stale world behind.
    await vi.waitFor(() => expect(storage.entries.has(CHAINS_KEY)).toBe(false));
  });

  it("does not rewrite the same endpoint again inside the throttle window", async () => {
    persistPayloadWhenIdle("chains", VALID_CHAINS_PAYLOAD, null, NOW);
    await vi.waitFor(() => expect(storage.entries.has(CHAINS_KEY)).toBe(true));

    persistPayloadWhenIdle("chains", VALID_CHAINS_PAYLOAD, null, NOW + INTERNALS.PERSIST_MIN_INTERVAL_MS - 1);
    await Promise.resolve();
    expect(JSON.parse(storage.entries.get(CHAINS_KEY)!).storedAt).toBe(NOW);

    persistPayloadWhenIdle("chains", VALID_CHAINS_PAYLOAD, null, NOW + INTERNALS.PERSIST_MIN_INTERVAL_MS);
    await vi.waitFor(() => {
      expect(JSON.parse(storage.entries.get(CHAINS_KEY)!).storedAt)
        .toBe(NOW + INTERNALS.PERSIST_MIN_INTERVAL_MS);
    });
  });

  it("does nothing when there is no storage", () => {
    vi.stubGlobal("localStorage", undefined);

    expect(() => persistPayloadWhenIdle("chains", VALID_CHAINS_PAYLOAD, null, NOW)).not.toThrow();
  });
});

describe("clearPersistedPayload", () => {
  it("removes the entry", () => {
    INTERNALS.writePersistedPayload("chains", VALID_CHAINS_PAYLOAD, null, NOW);
    clearPersistedPayload("chains");

    expect(storage.entries.has(CHAINS_KEY)).toBe(false);
  });
});
