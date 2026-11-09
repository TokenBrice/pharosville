#!/usr/bin/env node
/**
 * The first-paint key art (E28): the day and the night poster, rendered from this checkout's real build on the real
 * GPU and encoded into public/harbour/poster{,-night}-{960,1600}.{avif,webp} (the same sizes and formats for both).
 *
 * One command, from the checkout whose harbour the posters must show (re-run it whenever the hero assets change,
 * e.g. after Pharos v2 lands or is reverted, so the poster never crossfades into a different tower):
 *
 *   node scripts/harbour/render-posters.mjs
 *
 * It starts its own dev server for this checkout (port 5299, `--port N`; or `--base URL` to use one already running),
 * captures both masters through scripts/harbour/shot.mjs (the one shared headless real-GPU Chrome; never a browser of
 * its own), encodes them, stops the server, and prints each file against its scripts/perf/budgets.json ceiling.
 * Then look at both masters (outputs/posters/) before committing, and adjust budgets.json for any file it flags
 * (measured + 5 %, with a dated note: the bytes checks never update budgets themselves).
 *
 * `--snapshot FILE` replays a recorded API snapshot and pins the clock and RNG to its epoch (shot.mjs), so the fleet,
 * the boats' places, the moon and the readings are those of the recording and a re-render changes only what the
 * build changed (a tower, an island). `--record-snapshot FILE` records one first (scripts/perf/golden.mjs, through
 * the dev server's same-origin proxy) and renders with it. Without either, the live fleet at render time is drawn.
 * `--only day|night` renders one; `--encode-only` re-encodes the existing masters. Needs avifenc, cwebp and magick.
 *
 * Both masters are the landing ("heart") preset at 1600×1000 @1 with the overlay hidden. Keep that framing:
 * app/wake.ts registers the poster onto the live first frame by projecting the hero points through the same preset.
 *   day    ?t=18.5&season=summer&dews=CALM&psi=STEADY&offpeg=0  golden hour, a calm steady harbour
 *   night  ?t=22&season=summer&dews=CALM&psi=STEADY&offpeg=0    the arrival beat's first state (E29): the decorative
 *          lamps dark (lamp-wave.ts uLampArrive = 0), so the poster crossfades into a live night with no lamp popping
 *          out and in; the fire, the moon and the ships' own lanterns lit; the beam held at 200° (out over the sea)
 * Both are illustrations, not readings: the readings are pinned (dev overrides), and no text is added.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const { values } = parseArgs({ options: {
  base: { type: "string" }, port: { type: "string", default: "5299" }, only: { type: "string" },
  masters: { type: "string", default: resolve(root, "outputs/posters") }, "encode-only": { type: "boolean", default: false },
  snapshot: { type: "string" }, "record-snapshot": { type: "string" },
} });
const snapshot = values["record-snapshot"] ?? values.snapshot;

const QUERY = "season=summer&dews=CALM&psi=STEADY&offpeg=0";
const HIDE_UI = "for (const el of document.querySelectorAll('.hb-ui, #pv-poster, .pv-arrival')) el.style.visibility = 'hidden';";
const VARIANTS = {
  day: { name: "poster", hour: 18.5, setup: HIDE_UI },
  night: {
    name: "poster-night", hour: 22,
    setup: `const m = await import('/src/harbour/lights/lamp-wave.ts'); m.lampWaveUniforms.uLampArrive.value = 0;
      window.__harbour.ctx.services.get('lighthouse').hold(${(200 * Math.PI / 180).toFixed(4)}); ${HIDE_UI}`,
  },
};
/** Encoder settings: inside the v1.2 day poster's byte budgets (scripts/perf/budgets.json) at about 0.5 bit per pixel. */
const AVIF = ["-s", "2", "-q", "48", "-y", "444", "-d", "8", "--ignore-exif", "--ignore-xmp", "--ignore-icc"];
const WEBP = ["-quiet", "-q", "62", "-m", "6", "-sharp_yuv", "-metadata", "none"];

const variants = Object.entries(VARIANTS).filter(([key]) => !values.only || values.only === key);
let server = null;
let base = values.base;
if (!values["encode-only"] && !base) {
  base = `http://localhost:${values.port}`;
  server = spawn(process.execPath, [resolve(root, "node_modules/vite/bin/vite.js"), "--port", values.port, "--strictPort"], { cwd: root, stdio: "ignore" });
  const until = Date.now() + 60_000;
  for (;;) {
    try { if ((await fetch(base)).ok) break; } catch { /* not up yet */ }
    if (server.exitCode !== null || Date.now() > until) throw new Error(`the dev server on ${base} did not start (port taken? use --port or --base)`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

const budgets = JSON.parse(readFileSync(resolve(root, "scripts/perf/budgets.json"), "utf8")).media ?? {};
try {
  if (values["record-snapshot"] && !values["encode-only"]) {
    execFileSync(process.execPath, [resolve(root, "scripts/perf/golden.mjs"), "--record-snapshot", resolve(snapshot), "--origin", `${base.replace(/\/$/, "")}/`],
      { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
  }
  mkdirSync(values.masters, { recursive: true });
  for (const [, v] of variants) {
    const master = resolve(values.masters, `${v.name}-master.png`);
    if (!values["encode-only"]) {
      const url = `${base.replace(/\/$/, "")}/?t=${v.hour}&${QUERY}`;
      execFileSync(process.execPath, [resolve(root, "scripts/harbour/shot.mjs"), "--url", url, "--out", master, "--width", "1600", "--height", "1000",
        "--wait", "7000", "--seconds", "0", "--eval-wait", "400", "--eval", `(async () => { ${v.setup} return window.__harbour.ctx.timeOfDay.clockHour; })()`,
        ...(snapshot ? ["--snapshot", resolve(snapshot)] : [])],
      { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
    }
    const small = resolve(values.masters, `${v.name}-960.png`);
    execFileSync("magick", [master, "-filter", "Lanczos", "-resize", "960x600!", "-strip", small]);
    for (const [size, png] of [[1600, master], [960, small]]) {
      const out = resolve(root, `public/harbour/${v.name}-${size}`);
      execFileSync("avifenc", [...AVIF, png, `${out}.avif`], { stdio: "ignore" });
      execFileSync("cwebp", [...WEBP, png, "-o", `${out}.webp`]);
      for (const ext of ["avif", "webp"]) {
        const key = `/harbour/${v.name}-${size}.${ext}`, bytes = statSync(`${out}.${ext}`).size, ceiling = budgets[key];
        const verdict = ceiling == null ? "NO BUDGET: add measured + 5 %" : bytes <= ceiling ? "fits its ceiling" : "OVER: re-budget at measured + 5 %";
        console.log(`${key}: ${bytes} B (measured + 5 % = ${Math.ceil(bytes * 1.05)}; ceiling ${ceiling ?? "none"}) ${verdict}`);
      }
    }
  }
} finally {
  server?.kill();
}
