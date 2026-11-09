#!/usr/bin/env node
/**
 * The first-paint key art (E28): the day and the night poster, rendered from the real build on the real GPU and
 * encoded into public/harbour/poster{,-night}-{960,1600}.{avif,webp} (the same sizes and formats for both).
 *
 * Both masters are the landing ("heart") preset at 1600×1000 @1 with the overlay hidden. Keep that framing:
 * app/wake.ts registers the poster onto the live first frame by projecting the hero points through the same preset.
 *   day    ?t=18.5&season=summer&dews=CALM&psi=STEADY&offpeg=0  golden hour, a calm steady harbour
 *   night  ?t=22&season=summer&dews=CALM&psi=STEADY&offpeg=0    the arrival beat's first state (E29): the decorative
 *          lamps dark (lamp-wave.ts uLampArrive = 0), so the poster crossfades into a live night with no lamp popping
 *          out and in; the fire, the moon and the ships' own lanterns lit; the beam held at 200° (out over the sea)
 * Both are illustrations, not readings: the readings are pinned (dev overrides), and no text is added.
 *
 * Refresh whenever the hero assets change ("poster refreshed after assets settle"), then re-budget the eight files in
 * scripts/perf/budgets.json (measured + 5 %) and look at both masters before committing.
 *
 * Usage:
 *   node scripts/harbour/render-posters.mjs --base http://localhost:5204 [--only day|night] [--masters DIR]
 *   node scripts/harbour/render-posters.mjs --encode-only [--masters DIR]     (re-encode existing masters)
 * The dev server of this checkout must serve --base. Captures go through scripts/harbour/shot.mjs (the one shared
 * headless real-GPU Chrome; never a browser of its own). Needs avifenc, cwebp and ImageMagick (magick) on PATH.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const { values } = parseArgs({ options: {
  base: { type: "string", default: "http://localhost:5204" }, only: { type: "string" }, masters: { type: "string", default: resolve(root, "outputs/posters") },
  "encode-only": { type: "boolean", default: false },
} });

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

mkdirSync(values.masters, { recursive: true });
for (const [key, v] of Object.entries(VARIANTS)) {
  if (values.only && values.only !== key) continue;
  const master = resolve(values.masters, `${v.name}-master.png`);
  if (!values["encode-only"]) {
    const url = `${values.base.replace(/\/$/, "")}/?t=${v.hour}&${QUERY}`;
    execFileSync(process.execPath, [resolve(root, "scripts/harbour/shot.mjs"), "--url", url, "--out", master, "--width", "1600", "--height", "1000",
      "--wait", "7000", "--seconds", "0", "--eval-wait", "400", "--eval", `(async () => { ${v.setup} return window.__harbour.ctx.timeOfDay.clockHour; })()`],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
  }
  const small = resolve(values.masters, `${v.name}-960.png`);
  execFileSync("magick", [master, "-filter", "Lanczos", "-resize", "960x600!", "-strip", small]);
  for (const [size, png] of [[1600, master], [960, small]]) {
    const out = resolve(root, `public/harbour/${v.name}-${size}`);
    execFileSync("avifenc", [...AVIF, png, `${out}.avif`], { stdio: "ignore" });
    execFileSync("cwebp", [...WEBP, png, "-o", `${out}.webp`]);
    for (const ext of ["avif", "webp"]) console.log(`${v.name}-${size}.${ext}: ${statSync(`${out}.${ext}`).size} B`);
  }
}
