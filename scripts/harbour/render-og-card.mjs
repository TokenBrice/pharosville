#!/usr/bin/env node
/**
 * U6: the Open Graph card, public/og-card.png (1200×630) — the current day key art (public/harbour/poster-1600.webp,
 * the build's own E28 poster, scripts/harbour/render-posters.mjs) cropped to 1200×630, with a discreet PharosVille
 * wordmark lockup: the live corner mark's paper plaque (arrival-shell.css .pv-arrival__mark). No readings, no token
 * or chain names, no text beyond the wordmark.
 *
 *   node scripts/harbour/render-og-card.mjs --base http://localhost:5173
 *
 * `--base` is a dev server already serving this checkout. The card is composed and captured in the one shared
 * headless real-GPU Chrome through scripts/harbour/shot.mjs (--no-world, under a phone-sized screen so no world
 * loads), quantized (pngquant, then oxipng) and printed against its ceiling, scripts/perf/budgets.json
 * media["/og-card.png"] ("fits", or "OVER: re-budget at measured + 5 %"). Look at the card before committing.
 * `--encode-only` re-encodes the existing master (outputs/og-card/, uncommitted) without a capture.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const { values } = parseArgs({ options: {
  base: { type: "string", default: "http://localhost:5173" },
  master: { type: "string", default: resolve(root, "outputs/og-card/og-card-master.png") },
  out: { type: "string", default: resolve(root, "public/og-card.png") },
  "encode-only": { type: "boolean", default: false },
} });

// The key art at 1200 wide (1200×750), 30 px of sky trimmed above: the Pharos keeps its lantern and the bay its moles.
const COMPOSE = `(async () => {
  document.documentElement.style.overflow = "hidden";
  const frame = document.createElement("div");
  Object.assign(frame.style, { position: "fixed", left: "0", top: "0", width: "1200px", height: "630px", overflow: "hidden", zIndex: "99", background: "#0d1b2a" });
  const art = new Image();
  art.src = "/harbour/poster-1600.webp";
  Object.assign(art.style, { position: "absolute", left: "0", top: "-30px", width: "1200px", height: "750px", maxWidth: "none" });
  await art.decode();
  const mark = document.createElement("div");
  mark.className = "pv-arrival__mark";
  mark.append("Pharos", Object.assign(document.createElement("i"), { textContent: "Ville" }));
  Object.assign(mark.style, { top: "24px", left: "24px", color: "var(--pv-ink)", fontSize: "32px", padding: "8px 21px 10px 19px" });
  frame.append(art, mark);
  document.body.append(frame);
  await Promise.all([document.fonts.load("600 32px 'EB Garamond'"), document.fonts.load("italic 400 32px 'EB Garamond'")]);
  await document.fonts.ready;
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  return document.fonts.check("italic 400 32px 'EB Garamond'") && document.fonts.check("600 32px 'EB Garamond'") ? "composed" : "fonts missing";
})()`;

mkdirSync(dirname(values.master), { recursive: true });
const report = values["encode-only"] ? { evalResult: "composed", gpu: "(master re-encoded)" } : JSON.parse(execFileSync("node", [
  resolve(root, "scripts/harbour/shot.mjs"), "--url", `${values.base.replace(/\/$/, "")}/?t=12`, "--out", values.master,
  "--width", "1200", "--height", "630", "--screen", "390x844", "--no-world", "--seconds", "0", "--wait", "1500",
  "--eval", COMPOSE, "--eval-wait", "300",
], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
if (report.evalResult !== "composed") throw new Error(`og-card: composition failed (${report.evalResult})`);
// 128 colours, dithered: the size of the card it replaces (a social crawler's fetch, never a visitor's first frame)
execFileSync("pngquant", ["--force", "--speed", "1", "--strip", "--output", values.out, "128", values.master]);
execFileSync("oxipng", ["-o", "4", "--strip", "safe", "--quiet", values.out]);

const bytes = statSync(values.out).size;
const ceiling = JSON.parse(readFileSync(resolve(root, "scripts/perf/budgets.json"), "utf8")).media?.["/og-card.png"];
console.log(`og-card.png ${bytes} B on ${report.gpu}: ${ceiling == null ? "no ceiling in budgets.json" : bytes <= ceiling ? `fits (ceiling ${ceiling} B)` : `OVER (ceiling ${ceiling} B): re-budget at measured + 5 %`}`);
