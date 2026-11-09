import { describe, expect, it, vi } from "vitest";
import { canaryKey, classifyConfiguration, classifyReadback, readback, resultMessage, RETRY_DELAYS_MS } from "../../scripts/pharosville/kv-readback.mjs";

const env = { CF_KV_READ_TOKEN: "fixture-credential-sentinel", CLIENT_ERROR_KV_NAMESPACE_ID: "a".repeat(32), CLOUDFLARE_ACCOUNT_ID: "b".repeat(32) };
const options = { env, runToken: "fixture-run-1", storage: "accepted" };
const record = 'PHAROSVILLE_CANARY_PROBE {"event":"PHAROSVILLE_CANARY_PROBE","category":"canary"}';

describe("synthetic KV readback", () => {
  it("uses bounded delays covering the eventual-consistency window", () => {
    expect(RETRY_DELAYS_MS).toEqual([0, 5000, 10000, 15000, 30000, 15000]);
    expect(RETRY_DELAYS_MS.reduce((sum, ms) => sum + ms, 0)).toBe(75_000);
  });

  it.each(["CF_KV_READ_TOKEN", "CLIENT_ERROR_KV_NAMESPACE_ID", "CLOUDFLARE_ACCOUNT_ID"])("does no network I/O without %s", async (key) => {
    const fetchImpl = vi.fn();
    const result = await readback({ ...options, env: { ...env, [key]: "" } }, { fetchImpl });
    expect(result.state).toBe("not-configured");
    expect(resultMessage(result)).toContain("not configured");
    expect(resultMessage(result)).not.toContain("PASS");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("distinguishes absent bindings, failed writes and malformed configuration", async () => {
    expect(classifyConfiguration(env, "not-configured")).toBe("not-configured");
    expect(classifyConfiguration(env, "failed")).toBe("failed");
    expect(classifyConfiguration(env, "")).toBe("failed");
    expect(classifyConfiguration({ ...env, CLIENT_ERROR_KV_NAMESPACE_ID: "invalid" }, "accepted")).toBe("failed");
    const fetchImpl = vi.fn();
    expect((await readback({ ...options, storage: "not-configured" }, { fetchImpl })).state).toBe("not-configured");
    expect((await readback({ ...options, storage: "failed" }, { fetchImpl })).state).toBe("failed");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses the exact run key and read-only API auth, allowing bounded propagation retries", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(new Response(record));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await readback(options, { fetchImpl, sleep });
    expect(result).toEqual({ state: "found", reason: "retrieved", attempts: 2 });
    expect(sleep).toHaveBeenCalledWith(5000);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${env.CLIENT_ERROR_KV_NAMESPACE_ID}/values/PHAROSVILLE_CANARY_PROBE%3Arun%3Afixture-run-1`);
    expect(init.headers).toEqual({ Authorization: `Bearer ${env.CF_KV_READ_TOKEN}` });
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([404, 429, 503, "network"])("fails accepted-but-unreadable reports after the bounded %s retries", async (status) => {
    const fetchImpl = status === "network" ? vi.fn().mockRejectedValue(new Error(env.CF_KV_READ_TOKEN)) : vi.fn().mockImplementation(async () => new Response(null, { status }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await readback(options, { fetchImpl, sleep });
    expect(result).toEqual({ state: "failed", reason: "not-retrieved-within-retry-budget", attempts: 6 });
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(sleep.mock.calls.flat()).toEqual(RETRY_DELAYS_MS.slice(1));
    expect(resultMessage(result)).not.toContain(env.CF_KV_READ_TOKEN);
  });

  it.each([401, 403, 200])("does not retry refused or malformed %s responses or expose their bodies", async (status) => {
    const result = await readback(options, { fetchImpl: async () => new Response(env.CF_KV_READ_TOKEN, { status }), sleep: vi.fn() });
    expect(result.state).toBe("failed");
    expect(result.attempts).toBe(1);
    expect(JSON.stringify(result)).not.toContain(env.CF_KV_READ_TOKEN);
    expect(resultMessage(result)).not.toContain(env.CF_KV_READ_TOKEN);
    expect(resultMessage(result)).not.toContain(env.CLIENT_ERROR_KV_NAMESPACE_ID);
  });

  it("accepts only a bounded canary token and canary record", async () => {
    expect(canaryKey("fixture-run-1")).toBe("PHAROSVILLE_CANARY_PROBE:run:fixture-run-1");
    for (const token of [undefined, "", "x".repeat(81), "bad/token", "bad:token"]) expect(canaryKey(token)).toBeNull();
    expect(classifyReadback(200, record)).toBe("found");
    for (const body of ["not json", 'PHAROSVILLE_CLIENT_ERROR {}', 'PHAROSVILLE_CANARY_PROBE {}', 'PHAROSVILLE_CANARY_PROBE null', record.repeat(100)]) expect(classifyReadback(200, body)).toBe("failed");
    const fetchImpl = vi.fn();
    expect((await readback({ ...options, runToken: "bad/token" }, { fetchImpl })).state).toBe("failed");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
