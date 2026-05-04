#!/usr/bin/env node
/**
 * Lightweight color guard for the PharosVille route.
 *
 * Two checks:
 *   1. Banned-color drift (purple, orb/bokeh language, checkerboard placeholders)
 *      across non-test source files.
 *   2. WCAG AA contrast for known foreground/background --pv-* token pairs in
 *      `src/pharosville.css`. Translucent foregrounds are flattened against the
 *      immediate background; translucent backgrounds are flattened against the
 *      body color (#050d13). Default mode is `warn` so the lane stays green
 *      while we tune; set `CONTRAST_MODE=strict` to fail the build on drops
 *      below 4.5:1 (or hard-fail on <3:1 in any mode).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname);
const trackedFiles = execFileSync("git", ["ls-files", "src"], { encoding: "utf8" }).split("\n");
const sourceExtensionPattern = /\.(?:css|ts|tsx)$/;
const testFilePattern = /(?:^|\/)(?:__tests__|tests?)\/|\.test\.(?:ts|tsx)$/;
const waiverPattern = /pharosville-color-guard:\s*allow/i;
const files = trackedFiles
  .filter((file) => existsSync(file) && sourceExtensionPattern.test(file) && !testFilePattern.test(file))
  .sort();

const bannedPatterns = [
  { pattern: /checkerboard/i, message: "checkerboard placeholder text is not allowed in production route files" },
  { pattern: /#(?:a855f7|9333ea|7c3aed|8b5cf6)/i, message: "avoid default purple accent drift in PharosVille" },
  { pattern: /\b(?:orb|orbs|bokeh)\b/i, message: "decorative orb/bokeh language is not part of the PharosVille visual system" },
];

const failures = [];

for (const file of files) {
  const source = readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => !waiverPattern.test(line))
    .join("\n");
  for (const { pattern, message } of bannedPatterns) {
    if (pattern.test(source)) failures.push(`${file}: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// WCAG AA contrast check
// ---------------------------------------------------------------------------

const BODY_BG_HEX = "#050d13"; // src/pharosville.css `body { background: #050d13; }`
const CONTRAST_MODE = (process.env.CONTRAST_MODE ?? "warn").toLowerCase();
const STRICT = CONTRAST_MODE === "strict";

const cssPath = resolve(REPO_ROOT, "src/pharosville.css");
const cssText = readFileSync(cssPath, "utf8");

// Token pairs to validate. Each pair is [foreground token, background token, label, kind].
// "body" pairs require >= 4.5:1; "decorative" pairs only fail under 3:1.
const PAIRS = [
  ["--pv-parchment", "--pv-bg",          "parchment on body",        "body"],
  ["--pv-parchment", "--pv-panel",       "parchment on panel",       "body"],
  ["--pv-muted",     "--pv-panel",       "muted on panel",           "body"],
  ["--pv-muted",     "--pv-bg",          "muted on body",            "body"],
  ["--pv-gold",      "--pv-bg",          "gold on body",             "decorative"],
  ["--pv-gold-bright","--pv-bg",         "gold-bright on body",      "decorative"],
  ["--pv-ink-text",  "--pv-parchment-warm", "ink-text on parchment", "body"],
  ["--pv-ink-soft",  "--pv-parchment-warm", "ink-soft on parchment", "body"],
];

// Token aliases — `--pv-bg` is not a real declared token; we resolve it to body bg.
const TOKEN_ALIASES = new Map([
  ["--pv-bg", BODY_BG_HEX],
]);

function extractTokens(css) {
  const tokens = new Map();
  const re = /(--pv-[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  for (const match of css.matchAll(re)) {
    const name = match[1];
    const value = match[2].trim();
    // First definition wins per file so the :root fallback isn't masked.
    if (!tokens.has(name)) tokens.set(name, value);
  }
  return tokens;
}

const TOKEN_VALUES = extractTokens(cssText);

function resolveToken(token, seen = new Set()) {
  if (TOKEN_ALIASES.has(token)) return TOKEN_ALIASES.get(token);
  if (seen.has(token)) return null;
  seen.add(token);
  const raw = TOKEN_VALUES.get(token);
  if (!raw) return null;
  const varMatch = raw.match(/var\((--pv-[a-z0-9-]+)\)/i);
  if (varMatch) return resolveToken(varMatch[1], seen);
  return raw;
}

function parseColor(input) {
  const value = input.trim();
  if (value.startsWith("#")) {
    let hex = value.slice(1);
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    if (hex.length === 4) hex = hex.split("").map((c) => c + c).join("");
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }
    if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: parseInt(hex.slice(6, 8), 16) / 255,
      };
    }
    return null;
  }
  const rgbMatch = value.match(/^rgba?\(\s*([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)(?:[\s,/]+([0-9.]+%?))?\s*\)$/i);
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
      a: rgbMatch[4] === undefined ? 1 : (rgbMatch[4].endsWith("%") ? Number(rgbMatch[4].slice(0, -1)) / 100 : Number(rgbMatch[4])),
    };
  }
  const hslMatch = value.match(/^hsla?\(\s*([0-9.]+)\s*,?\s*([0-9.]+)%\s*,?\s*([0-9.]+)%(?:[\s,/]+([0-9.]+%?))?\s*\)$/i);
  if (hslMatch) {
    const h = Number(hslMatch[1]);
    const s = Number(hslMatch[2]) / 100;
    const l = Number(hslMatch[3]) / 100;
    const a = hslMatch[4] === undefined ? 1 : (hslMatch[4].endsWith("%") ? Number(hslMatch[4].slice(0, -1)) / 100 : Number(hslMatch[4]));
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0, g = 0, b = 0;
    if (0 <= hp && hp < 1) [r, g, b] = [c, x, 0];
    else if (1 <= hp && hp < 2) [r, g, b] = [x, c, 0];
    else if (2 <= hp && hp < 3) [r, g, b] = [0, c, x];
    else if (3 <= hp && hp < 4) [r, g, b] = [0, x, c];
    else if (4 <= hp && hp < 5) [r, g, b] = [x, 0, c];
    else if (5 <= hp && hp < 6) [r, g, b] = [c, 0, x];
    const m = l - c / 2;
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255),
      a,
    };
  }
  return null;
}

function compositeOver(fg, bg) {
  // Premultiplied alpha composite of fg over opaque bg.
  const a = fg.a;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1,
  };
}

function relativeLuminance({ r, g, b }) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(fg, bg) {
  const lFg = relativeLuminance(fg);
  const lBg = relativeLuminance(bg);
  const lighter = Math.max(lFg, lBg);
  const darker = Math.min(lFg, lBg);
  return (lighter + 0.05) / (darker + 0.05);
}

const bodyBg = parseColor(BODY_BG_HEX);
const contrastWarnings = [];
const contrastFailures = [];

console.log("\nWCAG AA contrast pairs:");
for (const [fgToken, bgToken, label, kind] of PAIRS) {
  const fgRaw = resolveToken(fgToken);
  const bgRaw = resolveToken(bgToken);
  if (!fgRaw || !bgRaw) {
    console.log(`  - ${label}: SKIP (token unresolved fg=${fgRaw} bg=${bgRaw})`);
    continue;
  }
  const fgColor = parseColor(fgRaw);
  let bgColor = parseColor(bgRaw);
  if (!fgColor || !bgColor) {
    console.log(`  - ${label}: SKIP (parse failed fg=${fgRaw} bg=${bgRaw})`);
    continue;
  }
  if (bgColor.a < 1) bgColor = compositeOver(bgColor, bodyBg);
  const fgFlat = fgColor.a < 1 ? compositeOver(fgColor, bgColor) : fgColor;
  const ratio = contrastRatio(fgFlat, bgColor);
  const ratioStr = ratio.toFixed(2);
  const minBody = 4.5;
  const minHard = 3.0;
  if (ratio < minHard) {
    contrastFailures.push(`${label}: ${ratioStr}:1 (hard fail at <3:1)`);
    console.log(`  - ${label}: ${ratioStr}:1 FAIL`);
  } else if (kind === "body" && ratio < minBody) {
    if (STRICT) contrastFailures.push(`${label}: ${ratioStr}:1 (need ≥4.5:1)`);
    else contrastWarnings.push(`${label}: ${ratioStr}:1 (need ≥4.5:1)`);
    console.log(`  - ${label}: ${ratioStr}:1 ${STRICT ? "FAIL" : "WARN"}`);
  } else {
    console.log(`  - ${label}: ${ratioStr}:1 OK`);
  }
}

if (contrastWarnings.length > 0) {
  console.warn(`\nContrast warnings (mode=${CONTRAST_MODE}):`);
  for (const w of contrastWarnings) console.warn(`  - ${w}`);
  console.warn("Set CONTRAST_MODE=strict to fail the build on these.");
}

if (failures.length > 0 || contrastFailures.length > 0) {
  if (failures.length > 0) console.error("\nBanned color failures:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  if (contrastFailures.length > 0) console.error("\nContrast failures:\n" + contrastFailures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}

console.log(`\nPharosVille color check passed for ${files.length} non-test source files.`);
