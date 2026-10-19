#!/usr/bin/env node
/**
 * Real-GPU capture for the Harbour reboot.
 *
 * Uses the one persistent headless real-GPU Chrome per profile and the shared capture lock.
 * Refuses software frames; no window is opened on the operator's desktop.
 *
 * Usage:
 *   node scripts/harbour/shot.mjs --url http://localhost:5190/harbour.html --out agents/.../x.png
 *     [--width 1600 --height 1000] [--dpr 1] [--wait 4000] [--seconds 5]
 *     [--webgpu]            enable WebGPU (default operator Chrome on Linux exposes NO adapter)
 *     [--eval "js"]         run in page after load, before measuring (e.g. set time of day); a JSON-able
 *                           return value (a Promise is awaited) is reported as `evalResult`
 *     [--burst N --interval ms]   extra frames <out>-NN.png
 *     [--json out.json]     write the report as JSON
 *     [--uncapped]          remove vsync/rAF caps; pacing still includes submission/back-pressure and is NOT GPU time
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
 *     [--init-script "js"] page.addInitScript before navigation (observers for --eval to read back)
 *     [--init-script-file path] read a large init script from disk (e.g. embedded immutable API snapshot)
 *     [--profile f.cpuprofile] V8 CPU profile (Profiler domain) of the main thread, navigation -> first frame + --wait;
 *                           [--profile-us N] sampling interval (default 200 us)
 *     [--steady-profile f.cpuprofile] V8 CPU profile over the --seconds frame-timing window only (steady state)
 *     [--heap-sample f.json] V8 sampling heap profile (HeapProfiler, incl. objects minor/major GC collected) over
 *                           the same window: who allocates per frame
 *     [--trace f.json]      Chrome trace (Tracing domain: devtools.timeline, gpu, v8, blink) over the same window
 *     [--waterfall]         per-request CDP timeline (`waterfall`: start/resp/end ms from the document request,
 *                           initial priority, wire bytes, cache-control, content-encoding, cached, protocol)
 *     [--ready-timeout s]   how long to wait for the first frame (default 60; use more under throttling)
 *     [--warm-seed ms]      load once (default 1800 ms settle), then reset counters and measure a repeat navigation
 *     [--eval-wait ms]      delay after --eval (default 1200); --seconds 0 skips frame timing for still captures
 *     [--frame-eval "js"]   awaited before each screenshot; window.__captureFrameIndex is 0 for the initial frame
 *     [--gpu-drain-timeout ms] async query drain after timing (default 15000); pending counts remain in the report
 *     [--cdp]              expose window.__cdp(method, params) to --eval without touch emulation
 *
 * Report: GPU identity, WebGPU availability, frame-time p50/p95/max over --seconds (rAF deltas),
 * console errors, and window.__harbourStats (if the page exposes it: draws, triangles, backend).
 */
import { captureLock, connectShared } from "./shared-browser.mjs";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
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
if (args.help) {
  console.log((await readFile(new URL(import.meta.url), "utf8")).split("/**")[1].split("*/")[0].replace(/^ \* ?/gm, ""));
  process.exit(0);
}
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
  }
}
if (args.touch || args.cdp) await page.exposeFunction("__cdp", (method, params) => cdp.send(method, params));
await page.bringToFront();
let finishing = false;
async function finish(code = 0) {
  if (finishing) return;
  finishing = true;
  // Close our tab before releasing: another capture must not observe or close a still-rendering tab.
  setTimeout(() => process.exit(code), 3000).unref?.();
  await Promise.race([page.close().catch(() => {}), new Promise((r) => setTimeout(r, 2500))]);
  await releaseCapture().catch(() => {});
  process.exit(code);
}
// A hung capture must never hold the shared lock: hard-stop after --timeout seconds (default 240).
const HARD_TIMEOUT = setTimeout(() => { console.error("shot.mjs: hard timeout, releasing the capture lock"); void finish(124); }, Number(args.timeout ?? 240) * 1000);
HARD_TIMEOUT.unref?.();
for (const ev of ["unhandledRejection", "uncaughtException"]) process.on(ev, (err) => { console.error(err); void finish(1); });
const consoleErrors = [];
page.on("console", (msg) => { if (msg.type() === "error" || msg.type() === "warning") consoleErrors.push(`[${msg.type()}] ${msg.text()}`.slice(0, 400)); });
page.on("pageerror", (err) => consoleErrors.push(`[pageerror] ${String(err).slice(0, 400)}`));
const navigations = [];
page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations.push({ url: frame.url(), ms: Date.now() - navWallMs }); });
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
let requestT0 = null;
const networkStatus = new Map();
const requestRows = new Map();
cdp.on("Network.responseReceivedExtraInfo", (e) => {
  networkStatus.set(e.requestId, e.statusCode);
  const w = waterfall.get(e.requestId);
  if (w) Object.assign(w, { networkStatus: e.statusCode, status: e.statusCode });
  const r = requestRows.get(e.requestId);
  if (r) Object.assign(r, { networkStatus: e.statusCode, status: e.statusCode });
});
if (args.waterfall) {
  cdp.on("Network.requestWillBeSent", (e) => {
    if (wfT0 === null) wfT0 = e.timestamp;
    waterfall.set(e.requestId, { url: e.request.url.replace(/^https?:\/\/[^/]+/, ""), fullUrl: e.request.url, type: e.type, priority: e.request.initialPriority, start: e.timestamp });
  });
  cdp.on("Network.responseReceived", (e) => {
    const w = waterfall.get(e.requestId); if (!w) return;
    const h = Object.fromEntries(Object.entries(e.response.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    Object.assign(w, { status: networkStatus.get(e.requestId) ?? e.response.status, networkStatus: networkStatus.get(e.requestId) ?? null, responseStatus: e.response.status, resp: e.timestamp, cc: h["cache-control"] ?? null, enc: h["content-encoding"] ?? null, ct: h["content-type"] ?? null, cached: e.response.fromDiskCache || e.response.fromMemoryCache || false, proto: e.response.protocol });
  });
  cdp.on("Network.loadingFinished", (e) => { const w = waterfall.get(e.requestId); if (w) Object.assign(w, { end: e.timestamp, wire: e.encodedDataLength }); });
  cdp.on("Network.loadingFailed", (e) => { const w = waterfall.get(e.requestId); if (w) Object.assign(w, { end: e.timestamp, failed: e.errorText }); });
}
if (args["log-requests"]) {
  cdp.on("Network.requestWillBeSent", (e) => {
    requestT0 ??= e.timestamp;
    const entry = { url: e.request.url, type: e.type, status: null, bytes: null, startMs: Math.round((e.timestamp - requestT0) * 1000) };
    requestRows.set(e.requestId, entry);
    requests.push(entry);
  });
  cdp.on("Network.responseReceived", (e) => {
    const r = requestRows.get(e.requestId);
    if (r) Object.assign(r, { status: networkStatus.get(e.requestId) ?? e.response.status, responseStatus: e.response.status });
  });
  cdp.on("Network.loadingFinished", (e) => {
    const r = requestRows.get(e.requestId);
    if (r) Object.assign(r, { bytes: e.encodedDataLength, endMs: Math.round((e.timestamp - requestT0) * 1000) });
  });
  cdp.on("Network.loadingFailed", (e) => {
    const r = requestRows.get(e.requestId);
    if (r) Object.assign(r, { status: "failed", failed: e.errorText, bytes: 0 });
  });
}

// --init-script "js": runs in the page before any of its own scripts (page.addInitScript), e.g. to install a
// MutationObserver / PerformanceObserver whose results a later --eval reads back
if (args["init-script"]) await page.addInitScript(String(args["init-script"]));
if (args["init-script-file"]) await page.addInitScript({ path: resolve(args["init-script-file"]) });
if (args["warm-seed"]) {
  await page.goto(url, { waitUntil: "load", timeout: Number(args["ready-timeout"] ?? 60) * 1000 });
  await page.waitForFunction(() => window.__harbour && window.__harbourStats?.firstFrameMs != null, null, { timeout: Number(args["ready-timeout"] ?? 60) * 1000 });
  await page.waitForTimeout(Number(args["warm-seed"] === true ? 1800 : args["warm-seed"]));
  await page.goto("about:blank", { waitUntil: "load" });
  waterfall.clear(); networkStatus.clear(); requestRows.clear(); wfT0 = requestT0 = null; wireBytes = 0;
  requests.length = consoleErrors.length = navigations.length = 0;
}
navWallMs = Date.now();
await page.goto(url, { waitUntil: "load", timeout: Number(args["ready-timeout"] ?? 60) * 1000 });
// A missing engine/first frame is a failed capture, never a plausible report from an empty page.
const firstFrameNavMs = await page.waitForFunction(() => window.__harbour && window.__harbourStats?.firstFrameMs != null && performance.now(), null, { timeout: Number(args["ready-timeout"] ?? 60) * 1000 })
  .then((h) => h.jsonValue());
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
  await page.waitForTimeout(Number(args["eval-wait"] ?? 1200));
}

const identity = await page.evaluate(async () => {
  const gl = window.__harbour?.ctx.renderer.getContext();
  if (!gl) throw new Error("Harbour engine disappeared before GPU identification");
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
let traceDone = null;
if (args.trace) {
  traceDone = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
  await cdp.send("Tracing.start", { transferMode: "ReturnAsStream", traceConfig: { includedCategories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame", "toplevel", "gpu", "v8", "blink", "cc", "viz", "disabled-by-default-v8.gc"] } });
}
const timing = await page.evaluate((secs) => new Promise((done, fail) => {
  const engine = window.__harbour;
  if (!engine) throw new Error("Harbour engine disappeared before measurement");
  window.__gpuPasses?.reset();
  const deltas = [], rafDeltas = [];
  let start, last, lastRaf, governorFrameStart;
  function tick(now) {
    if (window.__harbour !== engine) { fail(new Error("Navigation/remount replaced the engine during measurement")); return; }
    const actual = performance.now();
    if (start === undefined) {
      start = last = actual; lastRaf = now; governorFrameStart = window.__harbour.governor.frameId;
      if (secs <= 0) { window.__gpuPasses?.pause(); done({ deltas, rafDeltas, startMs: actual, endMs: actual, elapsedMs: 0, governorFrameStart, governorFrameEnd: governorFrameStart }); return; }
    } else { deltas.push(actual - last); rafDeltas.push(now - lastRaf); last = actual; lastRaf = now; }
    if (actual - start < secs * 1000) requestAnimationFrame(tick);
    else { window.__gpuPasses?.pause(); done({ deltas, rafDeltas, startMs: start, endMs: actual, elapsedMs: actual - start, governorFrameStart, governorFrameEnd: window.__harbour.governor.frameId }); }
  }
  requestAnimationFrame(tick);
}), seconds);
// End trace before profiler/heap teardown, so sampler-induced GC is outside the steady window.
if (args.trace) {
  await cdp.send("Tracing.end");
  const { stream } = await traceDone;
  await mkdir(dirname(resolve(args.trace)), { recursive: true });
  const file = await open(resolve(args.trace), "w");
  try {
    for (;;) {
      const chunk = await cdp.send("IO.read", { handle: stream, size: 1024 * 1024 });
      await file.writeFile(chunk.base64Encoded ? Buffer.from(chunk.data, "base64") : chunk.data);
      if (chunk.eof) break;
    }
  } finally { await file.close(); await cdp.send("IO.close", { handle: stream }); }
}
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
const gpuPasses = await page.evaluate(async (timeout) => {
  const p = window.__gpuPasses;
  if (!p) return null;
  p.pause();
  const end = performance.now() + timeout;
  let snapshot = p.snapshot();
  while (snapshot.currentPendingQueries > 0 && performance.now() < end) {
    await new Promise((r) => requestAnimationFrame(r));
    snapshot = p.snapshot();
  }
  return snapshot;
}, Number(args["gpu-drain-timeout"] ?? 15000));
const sorted = [...timing.deltas].sort((a, b) => a - b);
const pct = (p) => sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))].toFixed(2) : null;
const { stats, marks, gpuSamples } = await page.evaluate((range) => {
  const engine = window.__harbour;
  if (!engine) throw new Error("Harbour engine disappeared after measurement");
  const stats = JSON.parse(JSON.stringify(window.__harbourStats));
  const info = engine.ctx.renderer.info;
  Object.assign(stats, { textures: info.memory.textures, geometries: info.memory.geometries, programs: info.programs?.length ?? 0 });
  return { stats, marks: Object.fromEntries(["pv:first-frame", "pv:first-fleet-frame"].map((name) => [name, performance.getEntriesByName(name).at(-1)?.startTime ?? null])), gpuSamples: (engine.governor.completedGpuSamples?.() ?? []).filter((sample) => sample.frame > range.governorFrameStart && sample.frame <= range.governorFrameEnd) };
}, timing);
const gpuValues = gpuSamples.map((sample) => sample.ms).sort((a, b) => a - b);
const gpuSampleDistribution = { samples: gpuValues.length, population: "bounded retained completed governor samples within the measured frame range", p10Ms: gpuValues.length ? gpuValues[Math.floor(gpuValues.length * 0.1)] : null, p50Ms: gpuValues.length ? gpuValues[Math.floor(gpuValues.length * 0.5)] : null, p95Ms: gpuValues.length ? gpuValues[Math.floor(gpuValues.length * 0.95)] : null };

await mkdir(dirname(outPath), { recursive: true });
async function beforeCapture(index) {
  if (args["frame-eval"]) await page.evaluate(async ({ code, index }) => { window.__captureFrameIndex = index; return await (0, eval)(code); }, { code: String(args["frame-eval"]), index });
}
await beforeCapture(0);
await page.screenshot({ path: outPath });
const burst = Number(args.burst ?? 0);
for (let i = 0; i < burst; i++) {
  await page.waitForTimeout(Number(args.interval ?? 600));
  await beforeCapture(i + 1);
  await page.screenshot({ path: outPath.replace(/\.png$/, `-${String(i).padStart(2, "0")}.png`) });
}

const report = {
  url, out: outPath, viewport: `${width}x${height}@${dpr}${args.mobile ? " mobile" : ""}${args.touch ? " touch" : ""}`, gpu: identity.webgl, webgpuAdapter: identity.webgpu,
  frames: timing.deltas.length, fps: timing.elapsedMs > 0 ? +(timing.deltas.length * 1000 / timing.elapsedMs).toFixed(2) : null,
  p50: pct(0.5), p95: pct(0.95), max: sorted.at(-1) ?? null,
  gpuSampleDistribution,
  timing, gpuPasses, gpuSamples, navigations, stats, consoleErrors: consoleErrors.slice(0, 20),
  load: { firstFrameNavMs: Math.round(firstFrameNavMs), firstFrameMs: stats?.firstFrameMs ?? null, firstFleetFrameMs: stats?.firstFleetFrameMs ?? null, marks, ...navTiming, wireBytesAtFirstFrame, wireBytes,
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
