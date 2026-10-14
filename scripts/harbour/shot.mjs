#!/usr/bin/env node
/**
 * Real-GPU capture for the Harbour reboot.
 *
 * Launches the operator's Chrome through its Linux WRAPPER (/usr/bin/google-chrome-stable,
 * which applies ~/.config/chrome-flags.conf) in HEADED mode, because headless resolves to
 * SwiftShader on this machine. Refuses to report a software frame.
 *
 * Usage:
 *   node scripts/harbour/shot.mjs --url http://localhost:5190/harbour.html --out agents/.../x.png
 *     [--width 1600 --height 1000] [--dpr 1] [--wait 4000] [--seconds 5]
 *     [--webgpu]            enable WebGPU (default operator Chrome on Linux exposes NO adapter)
 *     [--eval "js"]         run in page after load, before measuring (e.g. set time of day); a JSON-able
 *                           return value (a Promise is awaited) is reported as `evalResult`
 *     [--burst N --interval ms]   extra frames <out>-NN.png
 *     [--json out.json]     write the report as JSON
 *     [--uncapped]          launch with --disable-gpu-vsync --disable-frame-rate-limit: rAF runs as fast as the
 *                           GPU allows, so fps/p50 are the TRUE frame cost (not clamped to the display refresh)
 *     [--log-requests]      record every request from navigation on; the report gains `requests`
 *                           ({ url, type, status, bytes }), `apiRequests` (same-origin /api/* URLs) and
 *                           `transferBytes`. Use it for the desktop gate: a blocked viewport must show 0 apiRequests.
 *
 * Report: GPU identity, WebGPU availability, frame-time p50/p95/max over --seconds (rAF deltas),
 * console errors, and window.__harbourStats (if the page exposes it: draws, triangles, backend).
 */
import { captureLock, connectShared } from "./shared-browser.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const url = args.url ?? "http://localhost:5190/";
const outPath = resolve(args.out ?? "outputs/harbour/shot.png");
const width = Number(args.width ?? 1600);
const height = Number(args.height ?? 1000);
const dpr = Number(args.dpr ?? 1);
const waitMs = Number(args.wait ?? 4000);
const seconds = Number(args.seconds ?? 4);
// One persistent capture browser per profile (scripts/harbour/shared-browser.mjs): every capture is a
// TAB in the same long-lived window, never a new window. Captures are serialised by a lock.
const profileName = args.webgpu ? "webgpu" : args.uncapped ? "uncapped" : "standard";
const releaseCapture = await captureLock(profileName);
const browser = await connectShared(profileName);
const context = browser.contexts()[0] ?? await browser.newContext();
const page = await context.newPage();
await page.setViewportSize({ width, height });
if (dpr !== 1) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile: false });
}
await page.bringToFront();
async function finish(code = 0) {
  await page.close().catch(() => {});
  await releaseCapture();
  process.exit(code);
}
for (const ev of ["unhandledRejection", "uncaughtException"]) process.on(ev, (err) => { console.error(err); void finish(1); });
const consoleErrors = [];
page.on("console", (msg) => { if (msg.type() === "error" || msg.type() === "warning") consoleErrors.push(`[${msg.type()}] ${msg.text()}`.slice(0, 400)); });
page.on("pageerror", (err) => consoleErrors.push(`[pageerror] ${String(err).slice(0, 400)}`));
const requests = [];
if (args["log-requests"]) {
  page.on("requestfinished", async (req) => {
    const entry = { url: req.url(), type: req.resourceType(), status: null, bytes: null };
    requests.push(entry);
    try { entry.status = (await req.response())?.status() ?? null; entry.bytes = (await req.sizes()).responseBodySize; } catch { /* page closed */ }
  });
  page.on("requestfailed", (req) => requests.push({ url: req.url(), type: req.resourceType(), status: "failed", bytes: 0 }));
}

await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(waitMs);

let evalResult;
if (args.eval) {
  evalResult = await page.evaluate((code) => (0, eval)(code), String(args.eval));
  await page.waitForTimeout(1200);
}

const identity = await page.evaluate(async () => {
  const c = document.createElement("canvas");
  const gl = c.getContext("webgl2");
  const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
  let webgpu = null;
  if (navigator.gpu) {
    try { const a = await navigator.gpu.requestAdapter(); webgpu = a ? `${a.info?.vendor ?? "?"}/${a.info?.architecture ?? "?"}` : null; } catch { webgpu = null; }
  }
  return { webgl: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "none", webgpu };
});

if (/swiftshader|llvmpipe|software/i.test(identity.webgl)) {
  console.error(`REFUSED: software renderer (${identity.webgl}). Not a real-GPU frame.`);
  await finish(78);
}

const timing = await page.evaluate((secs) => new Promise((done) => {
  const deltas = []; let last = performance.now(); const end = last + secs * 1000;
  function tick(now) { deltas.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else done(deltas); }
  requestAnimationFrame(tick);
}), seconds);
timing.sort((a, b) => a - b);
const pct = (p) => timing[Math.min(timing.length - 1, Math.floor(p * timing.length))];
const stats = await page.evaluate(() => (window.__harbourStats ? JSON.parse(JSON.stringify(window.__harbourStats)) : null));

await mkdir(dirname(outPath), { recursive: true });
await page.screenshot({ path: outPath });
const burst = Number(args.burst ?? 0);
for (let i = 0; i < burst; i++) {
  await page.waitForTimeout(Number(args.interval ?? 600));
  await page.screenshot({ path: outPath.replace(/\.png$/, `-${String(i).padStart(2, "0")}.png`) });
}

const report = {
  url, out: outPath, viewport: `${width}x${height}@${dpr}`, gpu: identity.webgl, webgpuAdapter: identity.webgpu,
  frames: timing.length, fps: Math.round(timing.length / seconds),
  p50: +pct(0.5).toFixed(2), p95: +pct(0.95).toFixed(2), max: +timing[timing.length - 1].toFixed(2),
  stats, consoleErrors: consoleErrors.slice(0, 20),
  ...(evalResult === undefined ? {} : { evalResult }),
  ...(args["log-requests"] ? {
    apiRequests: requests.filter((r) => new URL(r.url).pathname.startsWith("/api/")).map((r) => r.url),
    transferBytes: requests.reduce((sum, r) => sum + (r.bytes ?? 0), 0),
    requests,
  } : {}),
};
console.log(JSON.stringify(report, null, 1));
if (args.json) { await mkdir(dirname(resolve(args.json)), { recursive: true }); await writeFile(resolve(args.json), JSON.stringify(report, null, 1)); }
await finish(0);
