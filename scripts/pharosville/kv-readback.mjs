import { pathToFileURL } from "node:url";

// Allow a full KV propagation window; each request also has a ten-second deadline.
export const RETRY_DELAYS_MS = [0, 5_000, 10_000, 15_000, 30_000, 15_000];
const CANARY_EVENT = "PHAROSVILLE_CANARY_PROBE";

export function canaryKey(runToken) {
  if (typeof runToken !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(runToken)) return null;
  return `${CANARY_EVENT}:run:${runToken}`;
}

export function classifyConfiguration(env, storage) {
  if (!env.CF_KV_READ_TOKEN?.trim() || !env.CLIENT_ERROR_KV_NAMESPACE_ID?.trim() || !env.CLOUDFLARE_ACCOUNT_ID?.trim()) return "not-configured";
  if (storage === "not-configured") return "not-configured";
  if (storage !== "accepted") return "failed";
  if (!/^[a-f0-9]{32}$/i.test(env.CLIENT_ERROR_KV_NAMESPACE_ID) || !/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID)) return "failed";
  return "ready";
}

export function classifyReadback(status, body) {
  if (status === 404 || status === 429 || status >= 500) return "retry";
  if (status !== 200 || typeof body !== "string" || body.length > 8_192 || !body.startsWith(`${CANARY_EVENT} `)) return "failed";
  try {
    return JSON.parse(body.slice(CANARY_EVENT.length + 1)).event === CANARY_EVENT ? "found" : "failed";
  } catch {
    return "failed";
  }
}

/** Never return response bodies, URLs or thrown messages: any may contain credentials. */
export async function readback({ env, runToken, storage }, {
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const configuration = classifyConfiguration(env, storage);
  if (configuration !== "ready") return { state: configuration, reason: configuration === "not-configured" ? "credentials-or-binding" : "configuration-or-write", attempts: 0 };
  const key = canaryKey(runToken);
  if (!key) return { state: "failed", reason: "invalid-run-token", attempts: 0 };
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${env.CLIENT_ERROR_KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}`;
  let attempts = 0;
  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await sleep(delay);
    attempts++;
    try {
      const response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${env.CF_KV_READ_TOKEN}` },
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      const result = classifyReadback(response.status, response.status === 200 ? await response.text() : "");
      if (result === "found") return { state: "found", reason: "retrieved", attempts };
      if (result === "failed") return { state: "failed", reason: "read-refused-or-invalid-record", attempts };
    } catch {
      // Network and deadline failures share the same bounded retry budget.
    }
  }
  return { state: "failed", reason: "not-retrieved-within-retry-budget", attempts };
}

export function resultMessage(result) {
  if (result.state === "not-configured") return "::notice::KV readback: not configured (read credentials or CLIENT_ERROR_KV binding absent); persistence not verified.";
  if (result.state === "found") return `KV readback: retrieved the synthetic report (${result.attempts} attempt(s)).`;
  return `::error::KV readback failed: ${result.reason} (${result.attempts} attempt(s)).`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await readback({ env: process.env, runToken: process.env.CANARY_RUN_TOKEN, storage: process.env.CANARY_STORAGE });
  console.log(resultMessage(result));
  if (result.state === "failed") process.exitCode = 1;
}
