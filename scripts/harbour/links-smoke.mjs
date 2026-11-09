#!/usr/bin/env node
/** D18/D19 built-origin navigation, using only the serialized shared real-GPU browser. */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { evidenceUrl } from "../perf/extras-budget.mjs";
import { classifyGpu } from "./capture-provenance.mjs";
import { isBrowserNotice } from "./console-notices.mjs";
import { pinCaptureClock, replaySnapshot } from "../perf/snapshot-replay.mjs";

const CANONICAL = "https://pharosville.pharos.watch/";
export function linkSmokeUrls(origin, canary, second = "place.pharos") {
  if (`ship.${canary}`.length > 128 || second.length > 128 || !/^[a-z0-9][a-z0-9-]*$/.test(canary) || !/^(ship|chain|yard|wreck|place)\.[a-z0-9][a-z0-9-]*$/.test(second) || second === `ship.${canary}`) throw new Error("Invalid or duplicate canary/second subject");
  const home = new URL(origin);
  if (!["http:", "https:"].includes(home.protocol) || home.username || home.password) throw new Error("Invalid built origin");
  home.search = ""; home.hash = "";
  const first = new URL(home), canonical = new URL(CANONICAL);
  first.searchParams.set("sel", `ship.${canary}`);
  canonical.searchParams.set("sel", `ship.${canary}`);
  return { home: home.href, first: first.href, canonical: canonical.href, firstSubject: `ship.${canary}`, secondSubject: second };
}
export function clipboardStub() {
  window.__linksCopied = [];
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.__linksCopied.push(text); } } });
  try { localStorage.setItem("harbour.sound", "off"); localStorage.setItem("pv:intro-seen", "1"); } catch { /* optional storage */ }
}
export function evaluateLinks(input) {
  if (classifyGpu(input?.provenance?.gpu) !== "hardware") return { status: "SKIP", exitCode: 78, reasons: ["No real-GPU link smoke evidence"] };
  const s = input.observation, reasons = [];
  for (const key of ["initial", "second", "back", "forward", "closed", "copied", "reopened"]) {
    if (s?.[key]?.pass !== true) reasons.push(`Missing/failed ${key} assertion`);
  }
  const canonical = evidenceUrl(s?.canonical), first = canonical?.searchParams.get("sel");
  if (!first || !/^ship\.[a-z0-9][a-z0-9-]*$/.test(first) || canonical.origin !== new URL(CANONICAL).origin || canonical.pathname !== "/"
    || [...canonical.searchParams.keys()].some((k) => k !== "sel") || canonical.hash) reasons.push("Noncanonical subject URL");
  for (const key of ["initial", "back", "reopened"]) {
    const sample = s?.[key];
    if (!sample?.title?.trim() || sample.subject !== first || evidenceUrl(sample.url)?.searchParams.get("sel") !== first || sample.title !== s?.initial?.title) reasons.push(`Wrong subject/title in ${key}`);
  }
  if (!s?.second?.subject || s.second.subject === first || !s.second.title?.trim() || s?.forward?.subject !== s.second.subject || s.forward.title !== s.second.title
    || [s.second, s?.forward].some((v) => evidenceUrl(v?.url)?.searchParams.get("sel") !== s.second.subject)) reasons.push("Second/Forward subject mismatch");
  if (!evidenceUrl(s?.closed?.url) || evidenceUrl(s.closed.url).searchParams.has("sel")) reasons.push("Sel-less Back did not close");
  if (!Number.isInteger(s?.second?.historyBefore) || s.second.historyBefore < 1) reasons.push("Missing history count");
  if (s?.second?.historyAfter !== s?.second?.historyBefore + 1) reasons.push("Selection did not add exactly one history entry");
  if (s?.copied?.url !== s?.canonical || !s?.canonical?.startsWith(`${CANONICAL}?sel=ship.`)) reasons.push("Clipboard is not the canonical subject URL");
  if (!Array.isArray(input.consoleErrors) || input.consoleErrors.length) reasons.push("Console errors/warnings or missing console evidence");
  return { status: reasons.length ? "FAIL" : "PASS", exitCode: reasons.length ? 1 : 0, reasons };
}

export async function runLinksSmoke({ url, canary, name, second, secondName, snapshot, timeoutMs = 120000 }) {
  const urls = linkSmokeUrls(url, canary, second), consoleErrors = [], observation = { canonical: urls.canonical };
  if ((process.env.CI && process.env.CI !== "false") || process.env.GITHUB_ACTIONS === "true") return { status: "SKIP", exitCode: 78, reasons: ["CI has no operator real-GPU browser"] };
  const chrome = process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "/opt/google/chrome/chrome";
  if (!existsSync(chrome)) return { status: "SKIP", exitCode: 78, reasons: ["Operator Chrome unavailable"] };
  const { captureLock, connectShared } = await import("./shared-browser.mjs");
  const release = await captureLock();
  const pages = [];
  let provenance = null, browser;
  try {
    try { browser = await connectShared(); }
    catch { return { status: "SKIP", exitCode: 78, reasons: ["Shared real-GPU browser unavailable"] }; }
    const context = browser.contexts()[0] ?? await browser.newContext();
    let replay = null, fixtureHash = null;
    if (snapshot) {
      const bytes = await readFile(resolve(snapshot), "utf8");
      replay = JSON.parse(bytes); fixtureHash = createHash("sha256").update(bytes).digest("hex");
      if (!replay.responses || !Number.isFinite(replay.epoch)) throw new Error("Snapshot needs responses and epoch");
    }
    const fresh = async () => {
      const page = await context.newPage(); pages.push(page);
      page.setDefaultTimeout(timeoutMs); page.setDefaultNavigationTimeout(timeoutMs);
      await page.setViewportSize({ width: 1600, height: 1000 });
      page.on("console", (message) => { if (["error", "warning"].includes(message.type()) && !isBrowserNotice(message.text())) consoleErrors.push(`[${message.type()}] ${message.text()}`); });
      page.on("pageerror", (error) => consoleErrors.push(`[pageerror] ${error.message}`));
      await page.addInitScript(clipboardStub);
      if (replay) { await page.addInitScript(replaySnapshot, replay); await page.addInitScript(pinCaptureClock, { epoch: replay.epoch }); }
      return page;
    };
    const ready = (page) => page.waitForFunction(() => {
      const e = window.__harbour, r = e?.ctx.services.get("readiness"), f = e?.ctx.services.get("fleet-frame");
      return r?.prepared && r.revision > 0 && r.boats > 0 && f?.revision === r.revision && f.drawn === r.boats
        && window.__harbourStats?.renderedRevision === r.revision && document.documentElement.hasAttribute("data-pv-live") && !document.getElementById("pv-poster");
    });
    const panel = async (page, subject, title) => {
      await page.waitForFunction(({ subject, title }) => new URL(location.href).searchParams.get("sel") === subject
        && document.querySelector('.hb-panel[data-shown="true"] #hb-panel-title')?.textContent?.trim().includes(title), { subject, title });
      return { pass: true, subject, title: await page.locator("#hb-panel-title").innerText(), url: page.url() };
    };
    const page = await fresh();
    // The first entry has no subject, so the final Back exercises panel closure as well as restoration.
    await page.goto(urls.home); await ready(page);
    await page.goto(urls.first); await ready(page);
    const gpu = await page.evaluate(() => {
      const gl = window.__harbour.ctx.renderer.getContext(), ext = gl.getExtension("WEBGL_debug_renderer_info");
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
    });
    provenance = { gpu };
    if (classifyGpu(gpu) !== "hardware") return { ...evaluateLinks({ provenance }), provenance };
    observation.initial = await panel(page, urls.firstSubject, name);
    const identity = await page.evaluate(async () => {
      const digest = async (path) => {
        const response = await fetch(path);
        if (!response.ok || (path.endsWith("json") && !response.headers.get("content-type")?.includes("json"))) throw new Error(`Missing built identity ${path}`);
        return [...new Uint8Array(await crypto.subtle.digest("SHA-256", await response.arrayBuffer()))].map((n) => n.toString(16).padStart(2, "0")).join("");
      };
      return { documentHash: await digest("/"), assetRegistryHash: await digest("/asset-registry.json") };
    });
    provenance = { gpu, browser: await browser.version(), backend: gpu.match(/Vulkan|Metal|Direct3D\d*|D3D\d*|OpenGL(?: ES)?/i)?.[0] ?? "WebGL2",
      device: await page.evaluate(() => ({ platform: navigator.platform })), deliveryIdentity: identity,
      buildHash: createHash("sha256").update(JSON.stringify(identity)).digest("hex"), fixtureHash };
    const historyBefore = await page.evaluate(() => history.length);
    // Drive an actual deliberate search choice; no DEV store exposure is needed on a build.
    await page.keyboard.press("/");
    await page.getByRole("combobox", { name: "Search coins, chains and landmarks" }).fill(secondName);
    await page.getByRole("option").filter({ hasText: secondName }).first().click();
    observation.second = { ...await panel(page, urls.secondSubject, secondName), historyBefore, historyAfter: await page.evaluate(() => history.length) };
    await page.goBack(); observation.back = await panel(page, urls.firstSubject, name);
    await page.goForward(); observation.forward = await panel(page, urls.secondSubject, secondName);
    await page.goBack(); await panel(page, urls.firstSubject, name);
    await page.getByRole("button", { name: "Copy link", exact: true }).click();
    await page.waitForFunction(() => window.__linksCopied?.length > 0);
    const copied = await page.evaluate(() => window.__linksCopied.at(-1));
    observation.copied = { pass: copied === urls.canonical, url: copied };
    await page.goBack(); await ready(page);
    await page.waitForFunction(() => !new URL(location.href).searchParams.has("sel") && !document.querySelector('.hb-panel[data-shown="true"]'));
    observation.closed = { pass: true, url: page.url() };
    const reopen = await fresh();
    // Check the canonical bytes above, then exercise that URL against the same built origin.
    const local = new URL(copied); const built = new URL(urls.home); local.protocol = built.protocol; local.host = built.host;
    await reopen.goto(local.href); await ready(reopen);
    observation.reopened = await panel(reopen, urls.firstSubject, name);
    return { ...evaluateLinks({ provenance, observation, consoleErrors }), provenance, observation, consoleErrors };
  } catch (error) {
    return { status: "FAIL", exitCode: 1, reasons: [error.message], provenance, observation, consoleErrors };
  } finally {
    try { for (const page of pages) await page.close(); } finally { await release(); }
  }
}

async function main() {
  const { values: a } = parseArgs({ options: { help: { type: "boolean" }, url: { type: "string", default: "http://127.0.0.1:4180/" },
    canary: { type: "string", default: "usdc-circle" }, name: { type: "string", default: "USDC" }, second: { type: "string", default: "place.pharos" },
    "second-name": { type: "string", default: "Pharos" }, snapshot: { type: "string" }, out: { type: "string", default: "outputs/perf/links" } } });
  if (a.help) { console.log("Usage: node scripts/harbour/links-smoke.mjs [--url BUILT_ORIGIN --snapshot FILE --canary usdc-circle --name USDC --second place.pharos --second-name Pharos --out DIR]\nClipboard write is stubbed before scripts; clipboard-read is never requested. Exit 0 PASS / 1 FAIL / 78 no real GPU. Uses connectShared only; no browser launch or publication."); return; }
  const out = resolve(a.out); await mkdir(out, { recursive: true });
  const result = await runLinksSmoke({ ...a, secondName: a["second-name"] });
  await writeFile(resolve(out, "summary.json"), JSON.stringify({ tool: "links-smoke", ...result }, null, 2) + "\n");
  console.log(`Links ${result.status}: ${out}`); process.exitCode = result.exitCode;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().then(() => process.exit(process.exitCode ?? 0)).catch((error) => { console.error(error.message); process.exit(1); });
