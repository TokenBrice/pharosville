#!/usr/bin/env node
/**
 * DOM-only capture for pages where the Harbour world does NOT mount (phone welcome page, blocked
 * windows, WebGL-failure shell). Uses the SAME persistent headless real-GPU Chrome and the SAME global
 * capture lock as scripts/harbour/shot.mjs — never launches a browser of its own, never opens a window.
 *
 *   node agents/pharosville-ultimate/tools/dom-shot.mjs --url http://localhost:5173/ \
 *     --out agents/pharosville-ultimate/shots/O8-phone.png --width 390 --height 844 --dpr 3 --mobile --touch \
 *     [--screen 390x844] [--wait 2500] [--full] [--eval "js"]
 */
import { captureLock, connectShared } from "../../../scripts/harbour/shared-browser.mjs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const a = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith("--")) continue;
  const k = argv[i].slice(2), n = argv[i + 1];
  if (n === undefined || n.startsWith("--")) a[k] = true; else { a[k] = n; i++; }
}
if (!a.url || !a.out) { console.error("need --url and --out"); process.exit(2); }
const width = Number(a.width ?? 390), height = Number(a.height ?? 844), dpr = Number(a.dpr ?? 1);
const release = await captureLock("standard");
const browser = await connectShared("standard");
const context = browser.contexts()[0] ?? await browser.newContext();
const page = await context.newPage();
const done = async (code) => { await page.close().catch(() => {}); await release().catch(() => {}); process.exit(code); };
const hard = setTimeout(() => { console.error("dom-shot: hard timeout"); void done(124); }, 120_000); hard.unref?.();
try {
  await page.setViewportSize({ width, height });
  const cdp = await context.newCDPSession(page);
  const [sw, sh] = typeof a.screen === "string" ? a.screen.split("x").map(Number) : [width, height];
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile: !!a.mobile, screenWidth: sw, screenHeight: sh });
  if (a.touch) await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  const api = [];
  page.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) api.push(u.pathname + u.search); });
  await page.bringToFront();
  await page.goto(String(a.url), { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(Number(a.wait ?? 2500));
  let evalResult;
  if (a.eval) { evalResult = await page.evaluate((c) => (0, eval)(c), String(a.eval)); await page.waitForTimeout(800); }
  await mkdir(dirname(resolve(String(a.out))), { recursive: true });
  await page.screenshot({ path: resolve(String(a.out)), fullPage: !!a.full });
  const canvas = await page.evaluate(() => !!document.querySelector("canvas"));
  console.log(JSON.stringify({ out: a.out, width, height, dpr, canvasMounted: canvas, apiRequests: api, evalResult }, null, 1));
  await done(0);
} catch (e) { console.error(e); await done(1); }
