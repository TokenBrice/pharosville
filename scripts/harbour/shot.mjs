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
 *     [--mobile]            emulate a mobile browser (CDP Emulation mobile flag: viewport meta, overlay scrollbars)
 *     [--touch]             emulate a touch screen (CDP Emulation.setTouchEmulationEnabled: touch events,
 *                           maxTouchPoints, (pointer: coarse)/(hover: none)); --eval code may then drive raw CDP
 *                           input through `await window.__cdp(method, params)`, e.g.
 *                           __cdp("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
 *     [--screen WxH]        the emulated physical screen (window.screen), e.g. 832x750 under an 832x680 viewport
 *     [--log-requests]      record every request from navigation on; the report gains `requests`
 *                           ({ url, type, status, bytes }), `apiRequests` (same-origin /api/* URLs) and
 *                           `transferBytes`. Use it for the desktop gate: a blocked viewport must show 0 apiRequests.
 *   Load / perf measurement (all via CDP on the capture tab; additive, off by default):
 *     [--throttle <name>]   network emulation (Network.emulateNetworkConditions) from navigation on:
 *                             fast4g  9 Mbps down / 1.5 Mbps up, 40 ms RTT
 *                             cable   20 Mbps down / 5 Mbps up, 20 ms RTT
 *     [--cpu-throttle <r>]  CPU slowdown factor (Emulation.setCPUThrottlingRate), e.g. 4
 *     [--cold]              before navigating: Network.clearBrowserCache (the WHOLE shared profile's HTTP cache)
 *                           + Storage.clearDataForOrigin(all) for the target origin, so the visit is a first visit
 *     [--igpu]              use the 'igpu' capture profile (headless ANGLE on GL/EGL: the AMD Raphael iGPU, a
 *                           laptop-class proxy); refuses unless the GPU string is AMD/Radeon. Combine with --uncapped.
 *   With any of these (or always), the report carries `load`: `firstFrameNavMs` (navigation start -> first live
 *   world frame, as seen by a rAF poll), the engine's own `firstFrameMs` (engine construction -> first frame),
 *   the Navigation Timing marks (ttfb, domContentLoaded, load), and `wireBytes` / `wireBytesAtFirstFrame`
 *   (CDP encodedDataLength summed over the page target: on-the-wire bytes incl. headers; cache hits count ~0).
 *     [--human]             do not report automation (navigator.webdriver stays false): the arrival drift-in and
 *                           intro card play as for a visitor. By default captures report it, so they skip both.
 *     [--init-script "js"] page.addInitScript before navigation (observers for --eval to read back)
 *     [--profile f.cpuprofile] V8 CPU profile (Profiler domain) of the main thread, navigation -> first frame + --wait;
 *                           [--profile-us N] sampling interval (default 200 us)
 *     [--steady-profile f.cpuprofile] V8 CPU profile over the --seconds frame-timing window only (steady state)
 *     [--heap-sample f.json] V8 sampling heap profile (HeapProfiler, incl. objects minor/major GC collected) over
 *                           the same window: who allocates per frame
 *     [--trace f.json]      Chrome trace (Tracing domain: devtools.timeline, gpu, v8, blink) over the same window
 *     [--waterfall]         per-request CDP timeline (`waterfall`: start/resp/end ms from the document request,
 *                           initial priority, wire bytes, cache-control, content-encoding, cached, protocol)
 *     [--ready-timeout s]   how long to wait for the first frame (default 60; use more under throttling)
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
const profileName = args.igpu ? (args.uncapped ? "igpu-uncapped" : "igpu") : args.webgpu ? "webgpu" : args.uncapped ? "uncapped" : "standard";
const THROTTLES = {
  fast4g: { downMbps: 9, upMbps: 1.5, rttMs: 40 },
  cable: { downMbps: 20, upMbps: 5, rttMs: 20 },
};
const throttle = args.throttle ? THROTTLES[args.throttle] : null;
if (args.throttle && !throttle) { console.error(`unknown --throttle ${args.throttle} (known: ${Object.keys(THROTTLES).join(", ")})`); process.exit(2); }
const releaseCapture = await captureLock(profileName);
const browser = await connectShared(profileName);
const context = browser.contexts()[0] ?? await browser.newContext();
// Captures are serialised by the lock, so any page still open now was orphaned by a killed or timed-out
// capture and would keep rendering in the background, skewing GPU numbers. Close it (keep about:blank).
for (const stale of context.pages()) {
  if (stale.url() !== "about:blank") await Promise.race([stale.close().catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
}
const page = await context.newPage();
await page.setViewportSize({ width, height });
const [screenWidth, screenHeight] = typeof args.screen === "string" ? args.screen.split("x").map(Number) : [];
const cdp = await context.newCDPSession(page);
if (dpr !== 1 || args.mobile || args.touch || screenWidth) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: dpr, mobile: !!args.mobile,
    ...(screenWidth && screenHeight ? { screenWidth, screenHeight } : {}),
  });
  if (args.touch) {
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await page.exposeFunction("__cdp", (method, params) => cdp.send(method, params));
  }
}
await page.bringToFront();
let finishing = false;
async function finish(code = 0) {
  if (finishing) return;
  finishing = true;
  // Release the shared lock FIRST, then try to close our tab, and never let a hung close keep us alive.
  await releaseCapture().catch(() => {});
  setTimeout(() => process.exit(code), 3000).unref?.();
  await Promise.race([page.close().catch(() => {}), new Promise((r) => setTimeout(r, 2500))]);
  process.exit(code);
}
// A hung capture must never hold the shared lock: hard-stop after --timeout seconds (default 240).
const HARD_TIMEOUT = setTimeout(() => { console.error("shot.mjs: hard timeout, releasing the capture lock"); void finish(124); }, Number(args.timeout ?? 240) * 1000);
HARD_TIMEOUT.unref?.();
for (const ev of ["unhandledRejection", "uncaughtException"]) process.on(ev, (err) => { console.error(err); void finish(1); });
const consoleErrors = [];
page.on("console", (msg) => { if (msg.type() === "error" || msg.type() === "warning") consoleErrors.push(`[${msg.type()}] ${msg.text()}`.slice(0, 400)); });
page.on("pageerror", (err) => consoleErrors.push(`[pageerror] ${String(err).slice(0, 400)}`));
const requests = [];
let navWallMs = Date.now();
// on-the-wire bytes of the page target (CDP), always tracked: cheap and needed for load measurement
let wireBytes = 0;
await cdp.send("Network.enable");
cdp.on("Network.loadingFinished", (e) => { wireBytes += e.encodedDataLength ?? 0; });
if (args.cold) {
  await cdp.send("Network.clearBrowserCache");
  await cdp.send("Storage.clearDataForOrigin", { origin: new URL(url).origin, storageTypes: "all" });
}
if (throttle) {
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: throttle.rttMs,
    downloadThroughput: (throttle.downMbps * 1e6) / 8, uploadThroughput: (throttle.upMbps * 1e6) / 8,
  });
}
if (args["cpu-throttle"]) await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(args["cpu-throttle"]) });
// --profile out.cpuprofile [--profile-us 200]: V8 sampling profile of the page's main thread from navigation until the
// measurement starts (first frame + --wait): open it in DevTools > Performance, or aggregate its nodes by self time
if (args.profile) {
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: Number(args["profile-us"] ?? 200) });
  await cdp.send("Profiler.start");
}
// --waterfall: per-request CDP timeline (ms from the document request): start, response, end, priority, wire bytes,
// cache-control / content-encoding / content-type; the report gains `waterfall`, sorted by start
const waterfall = new Map();
let wfT0 = null;
if (args.waterfall) {
  cdp.on("Network.requestWillBeSent", (e) => {
    if (wfT0 === null) wfT0 = e.timestamp;
    waterfall.set(e.requestId, { url: e.request.url.replace(/^https?:\/\/[^/]+/, ""), type: e.type, priority: e.request.initialPriority, start: e.timestamp });
  });
  cdp.on("Network.responseReceived", (e) => {
    const w = waterfall.get(e.requestId); if (!w) return;
    const h = Object.fromEntries(Object.entries(e.response.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    Object.assign(w, { status: e.response.status, resp: e.timestamp, cc: h["cache-control"] ?? null, enc: h["content-encoding"] ?? null, ct: h["content-type"] ?? null, cached: e.response.fromDiskCache || e.response.fromMemoryCache || false, proto: e.response.protocol });
  });
  cdp.on("Network.loadingFinished", (e) => { const w = waterfall.get(e.requestId); if (w) Object.assign(w, { end: e.timestamp, wire: e.encodedDataLength }); });
  cdp.on("Network.loadingFailed", (e) => { const w = waterfall.get(e.requestId); if (w) Object.assign(w, { end: e.timestamp, failed: e.errorText }); });
}
if (args["log-requests"]) {
  page.on("requestfinished", async (req) => {
    const entry = { url: req.url(), type: req.resourceType(), status: null, bytes: null };
    requests.push(entry);
    try { entry.status = (await req.response())?.status() ?? null; entry.bytes = (await req.sizes()).responseBodySize; } catch { /* page closed */ }
    // ms since navigation: when the request started and when its body finished (the waterfall)
    try { const t = req.timing(); entry.startMs = Math.round(t.startTime - navWallMs); entry.endMs = Math.round(t.startTime + t.responseEnd - navWallMs); } catch { /* no timing */ }
  });
  page.on("requestfailed", (req) => requests.push({ url: req.url(), type: req.resourceType(), status: "failed", bytes: 0 }));
}

// --init-script "js": runs in the page before any of its own scripts (page.addInitScript), e.g. to install a
// MutationObserver / PerformanceObserver whose results a later --eval reads back
if (args["init-script"]) await page.addInitScript(String(args["init-script"]));
// The shared browser is a normal Chrome driven over CDP, so navigator.webdriver reads false and the page would
// play its first-visit theatre (the arrival drift-in with the fire kindling, the intro card) into the capture.
// Report the automation so captures are deterministic; `--human` keeps the visitor's arrival (or force it per
// page with ?wake=1 / ?intro=1).
if (!args.human) await page.addInitScript(() => { Object.defineProperty(Navigator.prototype, "webdriver", { get: () => true, configurable: true }); });
navWallMs = Date.now();
await page.goto(url, { waitUntil: "load", timeout: Number(args["ready-timeout"] ?? 60) * 1000 });
// Wait for the world's first live frame (poster crossfade done), not a fixed delay. Pages without the
// Harbour runtime simply time out here after 60 s worth of polling only if they never report.
const firstFrameNavMs = await page.waitForFunction(() => window.__harbourStats?.firstFrameMs != null && performance.now(), null, { timeout: Number(args["ready-timeout"] ?? 60) * 1000 })
  .then((h) => h.jsonValue()).catch(() => null);
const wireBytesAtFirstFrame = wireBytes;
const navTiming = await page.evaluate(() => {
  const n = performance.getEntriesByType("navigation")[0];
  return n ? { ttfb: Math.round(n.responseStart), domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } : null;
});
await page.waitForTimeout(waitMs);
if (args.profile) {
  const { profile } = await cdp.send("Profiler.stop");
  await mkdir(dirname(resolve(args.profile)), { recursive: true });
  await writeFile(resolve(args.profile), JSON.stringify(profile));
}

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
if (args.igpu && !/amd|radeon/i.test(identity.webgl)) {
  console.error(`REFUSED: --igpu landed on ${identity.webgl}, not the AMD iGPU.`);
  await finish(78);
}

if (args["steady-profile"]) {
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: Number(args["profile-us"] ?? 200) });
  await cdp.send("Profiler.start");
}
if (args["heap-sample"]) {
  await cdp.send("HeapProfiler.enable");
  await cdp.send("HeapProfiler.startSampling", { samplingInterval: 16384, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
}
const traceChunks = [];
let traceDone = null;
if (args.trace) {
  cdp.on("Tracing.dataCollected", (e) => traceChunks.push(...e.value));
  traceDone = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
  await cdp.send("Tracing.start", { transferMode: "ReportEvents", traceConfig: { includedCategories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame", "toplevel", "gpu", "v8", "blink", "cc", "viz", "disabled-by-default-v8.gc"] } });
}
const timing = await page.evaluate((secs) => new Promise((done) => {
  const deltas = []; let last = performance.now(); const end = last + secs * 1000;
  function tick(now) { deltas.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else done(deltas); }
  requestAnimationFrame(tick);
}), seconds);
if (args["steady-profile"]) {
  const { profile } = await cdp.send("Profiler.stop");
  await mkdir(dirname(resolve(args["steady-profile"])), { recursive: true });
  await writeFile(resolve(args["steady-profile"]), JSON.stringify(profile));
}
if (args["heap-sample"]) {
  const { profile } = await cdp.send("HeapProfiler.stopSampling");
  await mkdir(dirname(resolve(args["heap-sample"])), { recursive: true });
  await writeFile(resolve(args["heap-sample"]), JSON.stringify(profile));
}
if (args.trace) {
  await cdp.send("Tracing.end");
  await traceDone;
  await mkdir(dirname(resolve(args.trace)), { recursive: true });
  await writeFile(resolve(args.trace), JSON.stringify({ traceEvents: traceChunks }));
}
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
  url, out: outPath, viewport: `${width}x${height}@${dpr}${args.mobile ? " mobile" : ""}${args.touch ? " touch" : ""}`, gpu: identity.webgl, webgpuAdapter: identity.webgpu,
  frames: timing.length, fps: Math.round(timing.length / seconds),
  p50: +pct(0.5).toFixed(2), p95: +pct(0.95).toFixed(2), max: +timing[timing.length - 1].toFixed(2),
  stats, consoleErrors: consoleErrors.slice(0, 20),
  load: { firstFrameNavMs: firstFrameNavMs === null ? null : Math.round(firstFrameNavMs), firstFrameMs: stats?.firstFrameMs ?? null, ...navTiming, wireBytesAtFirstFrame, wireBytes,
    ...(throttle ? { throttle: args.throttle } : {}), ...(args["cpu-throttle"] ? { cpuThrottle: Number(args["cpu-throttle"]) } : {}), ...(args.cold ? { cold: true } : {}) },
  ...(evalResult === undefined ? {} : { evalResult }),
  ...(args.waterfall ? {
    waterfall: [...waterfall.values()].sort((a, b) => a.start - b.start).map((w) => ({
      ...w, start: Math.round((w.start - wfT0) * 1000), resp: w.resp ? Math.round((w.resp - wfT0) * 1000) : null, end: w.end ? Math.round((w.end - wfT0) * 1000) : null,
    })),
  } : {}),
  ...(args["log-requests"] ? {
    apiRequests: requests.filter((r) => new URL(r.url).pathname.startsWith("/api/")).map((r) => r.url),
    transferBytes: requests.reduce((sum, r) => sum + (r.bytes ?? 0), 0),
    requests,
  } : {}),
};
console.log(JSON.stringify(report, null, 1));
if (args.json) { await mkdir(dirname(resolve(args.json)), { recursive: true }); await writeFile(resolve(args.json), JSON.stringify(report, null, 1)); }
await finish(0);
