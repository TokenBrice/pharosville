#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import { pathToFileURL } from "node:url";

import { discoverPharosApiConfig } from "./setup-local-api-key.mjs";

const require = createRequire(import.meta.url);
const { PHAROSVILLE_SMOKE_ALLOWLIST_ENDPOINTS } = require("../../shared/lib/pharosville-smoke-matrix.ts");

const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const MAX_LOG_LINES = 60;

function usage() {
  return [
    "Usage: node scripts/pharosville/smoke-dev-proxy.mjs [--port <number>] [--startup-timeout-ms <number>] [--request-timeout-ms <number>]",
    "",
    "Starts local Vite, probes allowlisted /api/* endpoints through the local proxy, and exits non-zero on failures.",
  ].join("\n");
}

function parseArgs(argv) {
  let port = null;
  let startupTimeoutMs = DEFAULT_STARTUP_TIMEOUT_MS;
  let requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }

    if (arg === "--port") {
      const next = argv[index + 1];
      if (!next) throw new Error("--port requires a value");
      port = parsePort(next);
      index += 1;
      continue;
    }

    if (arg === "--startup-timeout-ms") {
      const next = argv[index + 1];
      if (!next) throw new Error("--startup-timeout-ms requires a value");
      startupTimeoutMs = parsePositiveInt(next, "--startup-timeout-ms");
      index += 1;
      continue;
    }

    if (arg === "--request-timeout-ms") {
      const next = argv[index + 1];
      if (!next) throw new Error("--request-timeout-ms requires a value");
      requestTimeoutMs = parsePositiveInt(next, "--request-timeout-ms");
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { port, startupTimeoutMs, requestTimeoutMs };
}

function parsePositiveInt(value, label) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${label} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function parsePort(value) {
  if (!/^\d+$/.test(value)) {
    throw new Error("--port must be an integer between 1 and 65535");
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("--port must be an integer between 1 and 65535");
  }
  return port;
}

function stripAnsi(value) {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\u001B\[[0-9;]*m/g, "");
}

function appendLog(logLines, line) {
  if (!line) return;
  logLines.push(line);
  if (logLines.length > MAX_LOG_LINES) {
    logLines.splice(0, logLines.length - MAX_LOG_LINES);
  }
}

function extractFirstUrl(line) {
  const clean = stripAnsi(line);
  const matches = clean.match(/https?:\/\/[^\s)]+/g);
  if (!matches) return null;
  for (const match of matches) {
    try {
      const url = new URL(match);
      return url.toString();
    } catch {
      // Continue scanning.
    }
  }
  return null;
}

async function allocateEphemeralPort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string" || !address.port) {
        server.close(() => reject(new Error("Failed to allocate ephemeral port")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function waitForProcessExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve({ code: child.exitCode, signal: child.signalCode });
      return;
    }
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

async function shutdownProcess(child) {
  if (!child || child.exitCode !== null) return;

  child.kill("SIGTERM");
  const graceful = await Promise.race([
    waitForProcessExit(child),
    new Promise((resolve) => setTimeout(() => resolve(null), 5_000)),
  ]);
  if (graceful) return;

  child.kill("SIGKILL");
  await waitForProcessExit(child);
}

function startViteServer({ port, startupTimeoutMs, env }) {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npmCmd, ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logs = [];
  let ready = false;
  let readyResolve;
  let readyReject;
  const readyPromise = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  const maybeCaptureUrl = (chunk) => {
    const text = chunk.toString("utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = stripAnsi(line).trim();
      if (!trimmed) continue;
      appendLog(logs, trimmed);
      if (ready) continue;
      const detectedUrl = extractFirstUrl(trimmed);
      if (!detectedUrl) continue;
      ready = true;
      readyResolve(detectedUrl);
    }
  };

  child.stdout.on("data", maybeCaptureUrl);
  child.stderr.on("data", maybeCaptureUrl);
  child.on("error", (error) => {
    if (!ready) {
      readyReject(error);
    }
  });
  child.once("exit", (code, signal) => {
    if (!ready) {
      const suffix = logs.length > 0 ? `\n${logs.join("\n")}` : "";
      readyReject(new Error(`Vite exited before ready (code=${code ?? "null"}, signal=${signal ?? "null"})${suffix}`));
    }
  });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Timed out waiting for Vite startup after ${startupTimeoutMs}ms`)), startupTimeoutMs);
  });

  const serverUrlPromise = Promise.race([readyPromise, timeoutPromise]);
  return { child, logs, serverUrlPromise };
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(2_000),
      });
      if (response.status < 500) return;
      lastError = new Error(`Server responded ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const suffix = lastError instanceof Error ? `: ${lastError.message}` : "";
  throw new Error(`Vite did not become reachable at ${url} within ${timeoutMs}ms${suffix}`);
}

function isJsonContentType(response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return contentType.includes("application/json") || contentType.includes("+json");
}

async function smokeEndpoint(baseUrl, path, requestTimeoutMs) {
  const url = new URL(path, baseUrl);
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(requestTimeoutMs),
  });

  if (!response.ok) {
    const snippet = (await response.text()).slice(0, 240).replace(/\s+/g, " ").trim();
    throw new Error(`${response.status} ${response.statusText}${snippet ? ` ${snippet}` : ""}`);
  }

  const proxyHeader = response.headers.get("x-pharosville-proxy");
  if (proxyHeader !== "1") {
    throw new Error(`missing x-pharosville-proxy: 1 (got ${proxyHeader ?? "null"})`);
  }

  if (!isJsonContentType(response)) {
    const contentType = response.headers.get("content-type") ?? "missing";
    throw new Error(`non-JSON content-type: ${contentType}`);
  }

  try {
    await response.json();
  } catch {
    throw new Error("invalid JSON body");
  }

  return response.status;
}

async function runSmoke(baseUrl, requestTimeoutMs) {
  const failures = [];
  for (const path of PHAROSVILLE_SMOKE_ALLOWLIST_ENDPOINTS) {
    try {
      const status = await smokeEndpoint(baseUrl, path, requestTimeoutMs);
      console.log(`✓ ${path} ${status}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${path}: ${message}`);
      console.log(`✗ ${path}`);
    }
  }

  if (failures.length > 0) {
    console.error("\n[smoke-dev-proxy] failures:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`\n[smoke-dev-proxy] OK (${PHAROSVILLE_SMOKE_ALLOWLIST_ENDPOINTS.length} endpoints)`);
}

async function main() {
  const { port: providedPort, startupTimeoutMs, requestTimeoutMs } = parseArgs(process.argv.slice(2));
  const selectedPort = providedPort ?? await allocateEphemeralPort();
  const discovered = discoverPharosApiConfig(process.cwd());

  if (!discovered.apiKey) {
    console.error("[smoke-dev-proxy] No local PHAROS_API_KEY found.");
    if (discovered.checkedPaths.length > 0) {
      console.error("Checked:");
      for (const path of discovered.checkedPaths) {
        console.error(`- ${path}`);
      }
    }
    process.exit(1);
  }

  const env = {
    ...process.env,
    PHAROS_API_BASE: discovered.apiBase,
    PHAROS_API_KEY: discovered.apiKey,
  };

  console.log(`[smoke-dev-proxy] starting vite on port ${selectedPort}`);

  const { child, logs, serverUrlPromise } = startViteServer({
    port: selectedPort,
    startupTimeoutMs,
    env,
  });

  let signalHandling = false;
  const handleSignal = (signal) => {
    if (signalHandling) return;
    signalHandling = true;
    shutdownProcess(child)
      .finally(() => {
        process.exit(signal === "SIGINT" ? 130 : 143);
      });
  };
  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);

  try {
    const serverUrl = await serverUrlPromise;
    await waitForHttp(serverUrl, startupTimeoutMs);
    console.log(`[smoke-dev-proxy] probing ${serverUrl}`);
    await runSmoke(serverUrl, requestTimeoutMs);
  } finally {
    process.removeListener("SIGINT", handleSignal);
    process.removeListener("SIGTERM", handleSignal);
    await shutdownProcess(child);
    if (process.exitCode && logs.length > 0) {
      console.error("\n[smoke-dev-proxy] vite logs:");
      for (const line of logs) {
        console.error(line);
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[smoke-dev-proxy] failed");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
