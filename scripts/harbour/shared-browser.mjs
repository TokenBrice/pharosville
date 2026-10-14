/**
 * ONE persistent real-GPU capture browser per profile, shared by every capture.
 *
 * Why: launching a headed Chrome per capture pops a new window on the operator's desktop every few
 * seconds (Hyprland places each one under the mouse). Instead, the first capture starts a single
 * long-lived Chrome (through the operator's wrapper, so chrome-flags.conf still applies) with a CDP
 * port; every later capture connects to it, opens a TAB, and closes only that tab. Captures are
 * serialised by a lock so exactly one tab is in the foreground (hidden tabs pause rAF) and frame
 * timings are not polluted by concurrent captures.
 *
 * Profiles (separate processes only because their launch flags differ):
 *   standard  :9333   normal vsync
 *   uncapped  :9334   --disable-gpu-vsync --disable-frame-rate-limit
 *   webgpu    :9335   --enable-unsafe-webgpu --enable-features=Vulkan
 *
 * The window carries WM_CLASS "harbour-capture" (XWayland) so a compositor rule can park it, e.g.
 * Hyprland: windowrulev2 = workspace special:harbour silent, class:^(harbour-capture)$
 *
 * Stop them: node scripts/harbour/shared-browser.mjs stop
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const ROOT = "/var/tmp/harbour-capture";
export const PROFILES = {
  standard: { port: 9333, flags: [] },
  uncapped: { port: 9334, flags: ["--disable-gpu-vsync", "--disable-frame-rate-limit"] },
  webgpu: { port: 9335, flags: ["--enable-unsafe-webgpu"] },
};
const CHROME = process.platform === "darwin"
  ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  : "/opt/google/chrome/chrome";
/**
 * HEADLESS on the real GPU: on this Linux/NVIDIA machine new-headless Chrome with ANGLE-on-Vulkan
 * reaches the RTX (verified 2026-10-14: "ANGLE (NVIDIA, Vulkan 1.4.341 (NVIDIA GeForce RTX 5070 Ti))"),
 * so captures open NO window at all. (Headless through the GL path resolves to SwiftShader or the
 * AMD iGPU; shot.mjs still refuses software renderers.) Set HARBOUR_HEADED=1 to get a visible window.
 */
const HEADLESS_GPU = process.platform === "linux" && process.env.HARBOUR_HEADED !== "1"
  ? ["--headless=new", "--use-angle=vulkan", "--enable-features=Vulkan", "--enable-gpu", "--ignore-gpu-blocklist", "--use-cmd-decoder=passthrough", "--force-color-profile=srgb"]
  : [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

async function tryConnect(port) {
  try { return await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 3000 }); } catch { return null; }
}

/** mkdir-based lock with stale-owner recovery. Returns a release function. */
async function lock(name, timeoutMs) {
  const dir = `${ROOT}/${name}.lock`;
  const deadline = Date.now() + timeoutMs;
  await mkdir(ROOT, { recursive: true });
  for (;;) {
    try {
      await mkdir(dir);
      await writeFile(`${dir}/pid`, String(process.pid));
      return async () => { await rm(dir, { recursive: true, force: true }); };
    } catch {
      const owner = Number(await readFile(`${dir}/pid`, "utf8").catch(() => "0"));
      if (owner && !alive(owner)) { await rm(dir, { recursive: true, force: true }); continue; }
      if (Date.now() > deadline) throw new Error(`timed out waiting for lock ${name} (held by pid ${owner})`);
      await sleep(250 + Math.random() * 250);
    }
  }
}

/** Connect to the profile's persistent browser, starting it once if needed. */
export async function connectShared(profileName = "standard") {
  const profile = PROFILES[profileName];
  let browser = await tryConnect(profile.port);
  if (browser) return browser;
  const release = await lock(`start-${profileName}`, 60_000);
  try {
    browser = await tryConnect(profile.port);
    if (browser) return browser;
    const child = spawn(CHROME, [
      `--remote-debugging-port=${profile.port}`,
      `--user-data-dir=${ROOT}/profile-${profileName}`,
      "--no-first-run", "--no-default-browser-check", "--disable-session-crashed-bubble",
      "--class=harbour-capture", "--window-size=1720,1180",
      ...HEADLESS_GPU,
      "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling",
      ...profile.flags,
      "about:blank",
    ], { detached: true, stdio: "ignore" });
    child.unref();
    for (let i = 0; i < 80 && !browser; i++) { await sleep(250); browser = await tryConnect(profile.port); }
    if (!browser) throw new Error(`shared capture browser (${profileName}) did not start on :${profile.port}`);
    return browser;
  } finally { await release(); }
}

/** Serialise captures across all agents/processes (one foreground tab, honest frame timings). */
export function captureLock(profileName = "standard") {
  return lock(`capture-${profileName}`, 15 * 60_000);
}

if (process.argv[1]?.endsWith("shared-browser.mjs") && process.argv[2] === "stop") {
  for (const [name, p] of Object.entries(PROFILES)) {
    const b = await tryConnect(p.port);
    if (b) { const s = await b.newBrowserCDPSession(); await s.send("Browser.close").catch(() => {}); console.log(`stopped ${name}`); }
  }
}
