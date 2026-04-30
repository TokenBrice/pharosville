#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

const excludedPathParts = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  ".wrangler",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "report",
  "reports",
  "test-results",
  "tmp",
  "temp",
]);

const generatedOutputPatterns = [
  /(?:^|\/)generated(?:\/|$)/i,
  /(?:^|\/)__generated__(?:\/|$)/i,
  /(?:^|\/)snapshots?(?:\/|$)/i,
  /\.(?:map|min\.js|snap)$/i,
];

const binaryExtensionPattern =
  /\.(?:avif|bmp|gif|ico|jpeg|jpg|pdf|png|webp|woff2?|ttf|otf|eot|zip|gz|tgz|br|wasm)$/i;
const maxTextFileBytes = 1_500_000;

const privateKeyPattern = new RegExp(["-----BEGIN ", "(?:[A-Z0-9]+ )?PRIVATE KEY", "-----"].join(""), "i");
const bearerPattern = new RegExp("\\bBearer\\s+([A-Za-z0-9._~+/-]{20,})\\b", "g");
const npmAuthTokenPattern = new RegExp("(?:^|\\n)\\s*_authToken\\s*=\\s*([^\\s#;]{12,})", "g");
const vendorTokenPatterns = [
  {
    label: "OpenAI-style API key",
    pattern: new RegExp("\\bsk-[A-Za-z0-9_-]{32,}\\b", "g"),
  },
  {
    label: "GitHub token",
    pattern: new RegExp("\\bgh[pousr]_[A-Za-z0-9_]{30,}\\b", "g"),
  },
  {
    label: "Cloudflare token",
    pattern: new RegExp("\\bCF_[A-Za-z0-9_-]{24,}\\b", "g"),
  },
];

const sensitiveAssignmentPattern =
  /(?:^|[\s"'`{,])([A-Z0-9_.-]*(?:secret|token|password|passwd|api[_-]?key|private[_-]?key|auth)[A-Z0-9_.-]*)\s*([:=])\s*(['"]?)([^'"\s#;,)}\]]{8,})(?:\3)/gim;

const placeholderValuePattern =
  /^(?:\$[A-Z0-9_]+|%[A-Z0-9_]+%|<[^>]+>|\{[^}]+\}|your[_-].*|.*(?:changeme|dummy|example|fake|fixture|mock|placeholder|redacted|sample|test|todo|xxx|not[_-]?a[_-]?secret).*)$/i;

export function shouldScanCommittedPath(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (parts.some((part) => excludedPathParts.has(part))) return false;
  if (generatedOutputPatterns.some((pattern) => pattern.test(normalized))) return false;
  if (binaryExtensionPattern.test(normalized)) return false;
  return true;
}

export function isProbablyText(buffer) {
  if (buffer.length > maxTextFileBytes) return false;
  if (buffer.includes(0)) return false;
  return true;
}

export function findSecretFindingsInText(filePath, text) {
  const findings = [];
  const lines = text.split(/\r?\n/);

  if (privateKeyPattern.test(text)) {
    const lineIndex = lines.findIndex((line) => privateKeyPattern.test(line));
    findings.push({
      filePath,
      line: lineIndex >= 0 ? lineIndex + 1 : 1,
      label: "private key block",
      snippet: "private key material redacted",
    });
  }

  for (const { label, pattern } of vendorTokenPatterns) {
    collectPatternFindings({ filePath, text, pattern, label, findings });
  }
  collectPatternFindings({ filePath, text, pattern: bearerPattern, label: "bearer token", findings });
  collectPatternFindings({ filePath, text, pattern: npmAuthTokenPattern, label: "npm auth token", findings });

  for (const line of lines.entries()) {
    const [index, sourceLine] = line;
    sensitiveAssignmentPattern.lastIndex = 0;
    for (const match of sourceLine.matchAll(sensitiveAssignmentPattern)) {
      const [, key, separator, quote, value] = match;
      if (!quote && !isEnvironmentStyleAssignment(sourceLine, key, separator)) continue;
      if (!isSuspiciousSecretValue(value)) continue;
      findings.push({
        filePath,
        line: index + 1,
        label: `sensitive assignment (${key})`,
        snippet: redactLine(sourceLine, value),
      });
    }
  }

  return findings;
}

function isEnvironmentStyleAssignment(line, key, separator) {
  if (separator !== "=") return false;
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*(?:export\\s+)?${escapedKey}\\s*=`).test(line);
}

export function scanCommittedFiles(repoRoot = process.cwd()) {
  const trackedFiles = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot });
  const files = trackedFiles
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter(shouldScanCommittedPath);

  const findings = [];
  let scannedCount = 0;

  for (const filePath of files) {
    if (!existsSync(filePath)) continue;
    const stats = statSync(filePath);
    if (!stats.isFile()) continue;
    const buffer = readFileSync(filePath);
    if (!isProbablyText(buffer)) continue;
    scannedCount += 1;
    findings.push(...findSecretFindingsInText(filePath, buffer.toString("utf8")));
  }

  return { scannedCount, findings };
}

function collectPatternFindings({ filePath, text, pattern, label, findings }) {
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const value = match[1] ?? match[0];
    if (!isSuspiciousSecretValue(value)) continue;
    const line = lineNumberForIndex(text, match.index ?? 0);
    const sourceLine = text.split(/\r?\n/)[line - 1] ?? "";
    findings.push({
      filePath,
      line,
      label,
      snippet: redactLine(sourceLine, value),
    });
  }
}

function isSuspiciousSecretValue(value) {
  const trimmed = value.trim();
  if (trimmed.length < 12) return false;
  if (placeholderValuePattern.test(trimmed)) return false;
  return /[A-Za-z]/.test(trimmed) && /[0-9_-]/.test(trimmed);
}

function redactLine(line, value) {
  return line.replace(value, redactValue(value)).trim();
}

function redactValue(value) {
  if (value.length <= 8) return "[REDACTED]";
  return `${value.slice(0, 3)}...[REDACTED]...${value.slice(-2)}`;
}

function lineNumberForIndex(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function main() {
  const { scannedCount, findings } = scanCommittedFiles();
  if (findings.length > 0) {
    console.error("Committed-file secret scan failed:");
    for (const finding of findings) {
      console.error(`- ${finding.filePath}:${finding.line} ${finding.label}: ${finding.snippet}`);
    }
    process.exit(1);
  }

  console.log(`Committed-file secret scan passed for ${scannedCount} tracked text files.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
