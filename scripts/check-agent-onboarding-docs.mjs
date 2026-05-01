#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const scopePrefixes = [
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "docs/pharosville-page.md",
  "docs/pharosville/",
];

const lintRules = [
  {
    id: "legacy-output-path",
    message: "Use outputs/pharosville/... scratch paths, not output/pharosville/...",
    pattern: /\boutput\/pharosville\//g,
  },
  {
    id: "planning-typo",
    message: "Use 'planning', not 'planing'.",
    pattern: /\bplaning artifacts\b/gi,
  },
];

export function listOnboardingMarkdownFiles(repoRoot = process.cwd()) {
  const output = execFileSync("git", ["ls-files", "-z", "--cached", "--", "*.md"], { cwd: repoRoot });
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((filePath) => scopePrefixes.some((prefix) => filePath === prefix || filePath.startsWith(prefix)));
}

export function findOnboardingDocFindings(filePath, text) {
  const findings = [];

  for (const rule of lintRules) {
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      findings.push({
        filePath,
        line: lineNumberForIndex(text, match.index ?? 0),
        id: rule.id,
        message: rule.message,
        snippet: match[0],
      });
    }
  }

  if (filePath === "AGENTS.md" && !text.includes("docs/pharosville/AGENT_ONBOARDING.md")) {
    findings.push({
      filePath,
      line: 1,
      id: "agents-onboarding-link",
      message: "AGENTS.md should link to docs/pharosville/AGENT_ONBOARDING.md.",
      snippet: "missing onboarding link",
    });
  }

  if (filePath === "CLAUDE.md" && !text.includes("AGENTS.md")) {
    findings.push({
      filePath,
      line: 1,
      id: "claude-canonical-link",
      message: "CLAUDE.md should reference AGENTS.md as canonical guidance.",
      snippet: "missing AGENTS.md reference",
    });
  }

  return findings;
}

export function checkOnboardingDocs({ repoRoot = process.cwd(), markdownFiles } = {}) {
  const files = markdownFiles ?? listOnboardingMarkdownFiles(repoRoot).map((filePath) => ({ path: filePath }));
  const findings = [];

  for (const file of files) {
    const text = typeof file.text === "string"
      ? file.text
      : readFileSync(resolve(repoRoot, file.path), "utf8");
    findings.push(...findOnboardingDocFindings(file.path, text));
  }

  return { scannedFileCount: files.length, findings };
}

function lineNumberForIndex(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function main() {
  const { scannedFileCount, findings } = checkOnboardingDocs();
  if (findings.length > 0) {
    console.error("Agent onboarding doc check failed:");
    for (const finding of findings) {
      console.error(
        `- ${finding.filePath}:${finding.line} [${finding.id}] ${finding.message} (${finding.snippet})`,
      );
    }
    process.exit(1);
  }

  console.log(`Agent onboarding doc check passed for ${scannedFileCount} markdown files.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
