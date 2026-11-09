#!/usr/bin/env node
/**
 * THE OFFLINE MIX GATE (E31). Renders the REAL ambience and music graphs (src/harbour/audio) with an
 * OfflineAudioContext inside a page of a running dev server, driven only through the shared headless capture
 * browser (connectShared + captureLock: no browser is launched, no window opened, nothing reaches a speaker),
 * at the seeded scenes of scripts/audio/mix-scenes.ts; then measures every render here in Node
 * (scripts/audio/loudness.mts: BS.1770-4 integrated loudness with gating, true peak 4× oversampled) and prints
 * PASS/FAIL per target, writing a JSON report.
 *
 *   npx vite --port 5203 --strictPort &      # any dev server of this checkout
 *   node scripts/audio/mix-report.mjs --url http://localhost:5203 --out outputs/audio/mix-report.json
 *     [--label after] [--scenes calm,storm,...] [--mute windGain,howlBus]   (a diagnostic: those nodes cut)
 *     [--wav outputs/audio/wav]   also write each render as a 16-bit stereo WAV, for a pair of ears
 *
 * The page opens at 400×700, under the desktop gate: the world never mounts and no /api request is made.
 * Targets (PLAN §5 v1.7.0, O9-I1/I3/I5; v1.8.0 S1/S4): calm −26 ± 2 LUFS; every DEWS state, and the roughest sea
 * state, ≤ calm + 6 LU; both storms at once ≤ calm + 7 LU; true peak ≤ −1 dBTP in every scene; the stale foghorn
 * ≤ +8 LU over the stale harbour's floor; music 6 ± 2 LU under the calm ambience; the Pharos breath with ≥ 60 % of
 * its energy above 250 Hz, one breath at a time (sounding ≤ 85 % of the time at every sweep, 12 s down to 1.2 s).
 * Exit 0 when every target passes, 1 when one fails, 2 on a setup error.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { captureLock, connectShared } from "../harbour/shared-browser.mjs";
import { cueOverFloor, energyAbove, meter } from "./loudness.mts";
import { mixTargets } from "./mix-targets.mts";

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith("--")) continue;
  const n = process.argv[i + 1];
  if (n === undefined || n.startsWith("--")) args[a.slice(2)] = true; else { args[a.slice(2)] = n; i++; }
}
const base = String(args.url ?? "http://localhost:5203").replace(/\/$/, "");
const out = resolve(String(args.out ?? "outputs/audio/mix-report.json"));
const label = String(args.label ?? "");
/** a tuning diagnostic: ambience nodes to disconnect in every scene of this run (the report says so) */
const mute = typeof args.mute === "string" ? args.mute.split(",") : [];
const wavDir = typeof args.wav === "string" ? resolve(args.wav) : null;
const CHUNK = 1 << 20;
/** A foghorn blast's span: 2.6 s of horn, its 1.4 s release and the harbour walls' slap-back. */
const HORN_SPAN = 5;

/** A 16-bit PCM stereo WAV of the render (dithered by rounding only: listening copies, not measurements). */
function wav([L, R], sr) {
  const n = L.length, b = Buffer.alloc(44 + n * 4);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 4, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 4, 28);
  b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 4, 40);
  const q = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  for (let i = 0; i < n; i++) { b.writeInt16LE(q(L[i]), 44 + i * 4); b.writeInt16LE(q(R[i]), 46 + i * 4); }
  return b;
}

const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : x === -Infinity ? null : x);

/** Duty of a breath render: the share of 10 ms frames within 30 dB of its loudest, from the first breath on. */
function duty([L, R], sr, from) {
  const W = Math.round(sr * 0.01), rms = [];
  for (let i = Math.round(from * sr); i + W <= L.length; i += W) {
    let s = 0;
    for (let k = i; k < i + W; k++) { const m = (L[k] + R[k]) / 2; s += m * m; }
    rms.push(Math.sqrt(s / W));
  }
  const top = Math.max(...rms), floor = top * 10 ** (-30 / 20);
  return rms.filter((v) => v >= floor).length / rms.length;
}

async function checkout() {
  try { const r = await fetch(`${base}/__pharosville/checkout`); return r.ok ? await r.json() : null; } catch { return null; }
}

const identity = await checkout();
if (!identity) { console.error(`mix-report: no dev server of this checkout at ${base} (start one: npx vite --port 5203 --strictPort)`); process.exit(2); }

const release = await captureLock("standard");
const browser = await connectShared("standard");
const context = browser.contexts()[0] ?? await browser.newContext();
const page = await context.newPage();
let code;
const hard = setTimeout(() => { console.error("mix-report: hard timeout"); void finish(124); }, 15 * 60_000);
hard.unref?.();
async function finish(exit) {
  clearTimeout(hard);
  await page.close().catch(() => {});
  await release().catch(() => {});
  process.exit(exit);
}

try {
  const api = [];
  page.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) api.push(u.pathname); });
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`${base}/`, { waitUntil: "load", timeout: 60_000 });
  const names = await page.evaluate(async () => {
    window.__mix = await import("/scripts/audio/mix-scenes.ts");
    return Object.keys(window.__mix.SCENES);
  });
  const want = typeof args.scenes === "string" ? args.scenes.split(",") : names;
  const scenes = {};
  for (const name of want) {
    const t0 = Date.now();
    const info = await page.evaluate(([n, m]) => window.__mix.render(n, m), [name, mute]);
    const ch = [new Float32Array(info.length), new Float32Array(info.length)];
    for (let c = 0; c < 2; c++) {
      for (let s = 0; s < info.length; s += CHUNK) {
        const b64 = await page.evaluate(([n, k, a, m]) => window.__mix.chunk(n, k, a, m), [name, c, s, CHUNK]);
        const buf = Buffer.from(b64, "base64");
        ch[c].set(new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)), s);
      }
    }
    await page.evaluate((n) => window.__mix.free(n), name);
    if (wavDir) { await mkdir(wavDir, { recursive: true }); await writeFile(resolve(wavDir, `${name}.wav`), wav(ch, info.sr)); }
    const m = meter(ch, info.sr);
    const row = {
      seconds: info.length / info.sr, integrated: r1(m.integrated), laptop: r1(m.laptop), momentaryMax: r1(m.momentaryMax),
      shortTermMax: r1(m.shortTermMax), shortTermMin: r1(m.shortTermMin), lra: r1(m.lra), samplePeak: r1(m.samplePeak), truePeak: r1(m.truePeak),
      breaths: info.breaths.length, strikes: info.strikes.length, phrases: info.phrases.map(r1), ms: Date.now() - t0,
    };
    if (name === "storm-near") {
      row.nearClaps = info.log.filter((e) => e.kind === "thunder" && e.ok).length;
      // Gate the new peak case before display rounding can hide an over.
      row.truePeak = m.truePeak;
    }
    if (info.horns.length) {
      // the stale cue over the harbour it sounds over (S1): the floor from the end of the on-ramp, clear of every blast
      const cue = cueOverFloor(m.momentary, m.shortTerm, info.horns, HORN_SPAN, 2);
      row.horns = info.horns.map(r1); row.hornFloor = r1(cue.floor); row.hornLevels = cue.levels.map(r1); row.hornOverFloor = r1(cue.over);
    }
    if (name.startsWith("breath-")) {
      row.energyAbove250 = Math.round(energyAbove(ch, info.sr, 250) * 1000) / 1000;
      row.duty = Math.round(duty(ch, info.sr, info.breaths[0] ?? 0) * 1000) / 1000;
    }
    if (info.log.length) {
      const first = (k) => r1(info.log.filter((e) => e.kind === k && e.ok).map((e) => e.at).sort((a, b) => a - b)[0] ?? NaN);
      const washes = info.log.filter((e) => e.kind === "shore" && e.ok).map((e) => e.at).sort((a, b) => a - b);
      row.onramp = {
        firstLap: first("lap"), firstWash: first("shore"), firstGull: first("gull"),
        washes: washes.map(r1), bells: info.log.filter((e) => e.kind === "bell" && e.ok).map((e) => r1(e.at)),
        failedPlays: info.log.filter((e) => !e.ok).length,
        // momentary loudness (400 ms ending at t) through the first seconds
        momentary: Object.fromEntries([0.5, 1, 1.5, 2, 3, 5, 8].map((t) => [t, r1(m.momentary[Math.round(t * 10) - 4])])),
      };
    }
    scenes[name] = row;
    console.log(`${name.padEnd(12)} I ${String(row.integrated).padStart(6)}  laptop ${String(row.laptop).padStart(6)}  Mmax ${String(row.momentaryMax).padStart(6)}  LRA ${String(row.lra).padStart(4)}  TP ${String(r1(row.truePeak)).padStart(6)}  (${row.ms} ms)`);
    if (row.horns) console.log(`${"".padEnd(12)} foghorn at ${row.horns.join(", ")} s: ${row.hornLevels.join(" / ")} LUFS over a floor of ${row.hornFloor} → +${row.hornOverFloor} LU`);
  }
  const bank = await page.evaluate(() => window.__mix.bankTiming());

  const T = mixTargets(scenes);
  const report = {
    label, mute, url: base, date: new Date().toISOString(), browser: browser.version(), checkout: identity, apiRequests: api,
    seed: await page.evaluate(() => window.__mix.SEED), sampleRate: 48000, scenes, bank, targets: T,
    pass: T.every((t) => t.pass !== false),
  };
  console.log("");
  for (const t of T) console.log(`${t.pass === null ? "INFO" : t.pass ? "PASS" : "FAIL"}  ${t.id.padEnd(30)} ${String(t.value).padStart(7)}   (${t.goal})`);
  console.log(`\nbank (synthesis ms to first clip): ${JSON.stringify(bank)}`);
  if (api.length) console.log(`WARNING: the page made API requests: ${api.join(", ")}`);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(report, null, 1));
  console.log(`\n${report.pass ? "ALL PASS" : "FAIL"} → ${out}`);
  code = report.pass ? 0 : 1;
} catch (e) {
  console.error(e);
  code = 2;
}
await finish(code);
