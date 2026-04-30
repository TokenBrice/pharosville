#!/usr/bin/env node

const args = process.argv.slice(2);
let baseUrl = process.env.SMOKE_UI_URL ?? "https://pharosville.pharos.watch";
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--url" && args[index + 1]) {
    baseUrl = args[index + 1];
    index += 1;
  }
}

const base = new URL(baseUrl);
base.pathname = "/";
base.search = "";
base.hash = "";

async function expectOk(path) {
  const url = new URL(path, base);
  const response = await fetch(url, { redirect: "manual" });
  if (!response.ok) {
    throw new Error(`${url.toString()} returned ${response.status}`);
  }
  return response;
}

async function main() {
  await expectOk("/");
  const stablecoins = await expectOk("/api/stablecoins");
  const json = await stablecoins.json();
  if (!json || !Array.isArray(json.peggedAssets) || json.peggedAssets.length < 100) {
    throw new Error("/api/stablecoins returned an unexpected payload");
  }

  const forbidden = await fetch(new URL("/api/health", base), { redirect: "manual" });
  if (forbidden.status !== 404) {
    throw new Error(`/api/health should be blocked by the PharosVille proxy, got ${forbidden.status}`);
  }

  console.log(`[smoke-live] ${base.toString()} OK`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
