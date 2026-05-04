#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const markdownLinkPattern = /!?\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const codeSpanPattern = /`([^`\n]+)`/g;
const npmRunPattern = /\bnpm\s+run\s+([A-Za-z0-9:_-]+)/g;

const onboardingScopePrefixes = [
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "docs/pharosville-page.md",
  "docs/pharosville/",
];

const onboardingLintRules = [
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
const repoRootPathPattern =
  /\b(?:README\.md|AGENTS\.md|CLAUDE\.md|package\.json|package-lock\.json|wrangler\.toml|vite\.config\.ts|vitest\.config\.ts|playwright\.config\.ts|tsconfig\.json|(?:agent|agents|data|docs|functions|public|scripts|shared|src|tests)\/[A-Za-z0-9._~!$&'()+,;=:@%/\-[\]*{}]+)(?=$|[\s`),.;])/g;
const repoRootPathStartPattern =
  /^(?:README\.md|AGENTS\.md|CLAUDE\.md|package\.json|package-lock\.json|wrangler\.toml|vite\.config\.ts|vitest\.config\.ts|playwright\.config\.ts|tsconfig\.json|(?:agent|agents|data|docs|functions|public|scripts|shared|src|tests)\/)/;

const ignoredReferencePattern =
  /^(?:https?:|mailto:|#|\/(?:api|pharosville)(?:\/|$)|[a-z]+:)/i;

export function loadPackageScripts(packageJsonPath = "package.json") {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  return new Set(Object.keys(packageJson.scripts ?? {}));
}

export function listTrackedMarkdownFiles(repoRoot = process.cwd()) {
  const output = execFileSync("git", ["ls-files", "-z", "--cached", "--", "*.md"], { cwd: repoRoot });
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((path) => !path.startsWith("agent/"))
    .filter((path) => !path.startsWith("docs/superpowers/plans/"))
    .filter((path) => !path.startsWith("docs/superpowers/specs/"));
}

export function findDocumentedNpmRunCommands(text) {
  const commands = [];
  for (const match of text.matchAll(npmRunPattern)) {
    commands.push({
      scriptName: match[1],
      line: lineNumberForIndex(text, match.index ?? 0),
    });
  }
  return commands;
}

export function findPathReferencesInMarkdown(filePath, text) {
  const references = [];
  collectMarkdownLinkReferences(filePath, text, references);
  collectCodeSpanReferences(filePath, text, references);
  collectBarePathReferences(filePath, text, references);
  return dedupeReferences(references);
}

export function isOnboardingMarkdownPath(filePath) {
  return onboardingScopePrefixes.some((prefix) => filePath === prefix || filePath.startsWith(prefix));
}

// Maximum age of a "Last updated:" date in onboarding-scope docs before we
// emit a warning. Set to 0 to disable. Override with PV_DOC_STALENESS_DAYS env.
const DOC_STALENESS_DAYS = Number.parseInt(
  process.env.PV_DOC_STALENESS_DAYS ?? "30",
  10,
);

const lastUpdatedDatePattern = /^Last updated:\s*(\d{4}-\d{2}-\d{2})/m;

function staleDocFindings(filePath, text) {
  if (DOC_STALENESS_DAYS <= 0) return [];
  const match = text.match(lastUpdatedDatePattern);
  if (!match) return [];
  const stamp = new Date(`${match[1]}T00:00:00Z`);
  if (Number.isNaN(stamp.getTime())) return [];
  const ageDays = Math.floor((Date.now() - stamp.getTime()) / 86_400_000);
  if (ageDays <= DOC_STALENESS_DAYS) return [];
  return [{
    filePath,
    line: lineNumberForIndex(text, match.index ?? 0),
    id: "doc-staleness",
    severity: "warning",
    message: `"Last updated: ${match[1]}" is ${ageDays} days old (threshold ${DOC_STALENESS_DAYS}). Refresh this doc or rotate the date if still accurate.`,
    snippet: match[0],
  }];
}

export function findOnboardingDocFindings(filePath, text) {
  const findings = [];

  for (const rule of onboardingLintRules) {
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

  findings.push(...staleDocFindings(filePath, text));

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
  const files = markdownFiles
    ?? listTrackedMarkdownFiles(repoRoot)
      .filter(isOnboardingMarkdownPath)
      .map((filePath) => ({ path: filePath }));
  const findings = [];

  for (const file of files) {
    const text = typeof file.text === "string"
      ? file.text
      : readFileSync(resolve(repoRoot, file.path), "utf8");
    findings.push(...findOnboardingDocFindings(file.path, text));
  }

  return { scannedFileCount: files.length, findings };
}

export function checkMarkdownFiles({ repoRoot = process.cwd(), markdownFiles, packageScripts, exists = existsSync }) {
  const missingScripts = [];
  const missingPaths = [];

  for (const file of markdownFiles) {
    const text = typeof file.text === "string" ? file.text : readFileSync(resolve(repoRoot, file.path), "utf8");
    for (const command of findDocumentedNpmRunCommands(text)) {
      if (!packageScripts.has(command.scriptName)) {
        missingScripts.push({ filePath: file.path, ...command });
      }
    }

    for (const reference of findPathReferencesInMarkdown(file.path, text)) {
      const resolved = resolveReferencePath(repoRoot, file.path, reference.target);
      if (!resolved) continue;
      if (!exists(resolved.checkPath)) {
        missingPaths.push({
          filePath: file.path,
          line: reference.line,
          target: reference.target,
          checkedPath: resolved.displayPath,
        });
      }
    }
  }

  return { missingScripts, missingPaths };
}

function collectMarkdownLinkReferences(filePath, text, references) {
  markdownLinkPattern.lastIndex = 0;
  for (const match of text.matchAll(markdownLinkPattern)) {
    const target = cleanReference(match[1]);
    if (target) {
      references.push({
        filePath,
        target,
        line: lineNumberForIndex(text, match.index ?? 0),
      });
    }
  }
}

function collectCodeSpanReferences(filePath, text, references) {
  codeSpanPattern.lastIndex = 0;
  for (const match of text.matchAll(codeSpanPattern)) {
    const target = cleanReference(match[1]);
    if (!target || !isPathLikeReference(target)) continue;
    references.push({
      filePath,
      target,
      line: lineNumberForIndex(text, match.index ?? 0),
    });
  }
}

function collectBarePathReferences(filePath, text, references) {
  repoRootPathPattern.lastIndex = 0;
  for (const match of text.matchAll(repoRootPathPattern)) {
    const target = cleanReference(match[0]);
    if (!target) continue;
    if (isEmbeddedBarePathMatch(text, match.index ?? 0)) continue;
    if (!hasBarePathSignal(target)) continue;
    references.push({
      filePath,
      target,
      line: lineNumberForIndex(text, match.index ?? 0),
    });
  }
}

function isPathLikeReference(target) {
  if (/^(?:npm|npx|pnpm|yarn)\s/.test(target)) return false;
  if (target.startsWith("@")) return false;
  if (target.startsWith("./") || target.startsWith("../")) return true;
  return repoRootPathStartPattern.test(target);
}

function hasBarePathSignal(target) {
  if (target.endsWith("/") || /[*{[]/.test(target)) return true;
  const lastPart = target.split("/").at(-1) ?? target;
  return lastPart.includes(".");
}

function isEmbeddedBarePathMatch(text, index) {
  const previous = index > 0 ? text[index - 1] : "";
  return /[A-Za-z0-9_@/.-]/.test(previous);
}

function cleanReference(rawTarget) {
  const withoutAnchor = rawTarget.trim().split("#")[0];
  const withoutQuery = withoutAnchor.split("?")[0];
  const withoutTrailingPunct = withoutQuery.replace(/[,:;.)]+$/g, "");
  const withoutLineRange = withoutTrailingPunct.replace(/:(?:\d+)(?:-\d+)?(?:,\s*\d+(?:-\d+)?)*$/, "");
  const cleaned = withoutLineRange.replace(/[,:;.)]+$/g, "");
  if (!cleaned || ignoredReferencePattern.test(cleaned)) return null;
  if (cleaned.includes("://")) return null;
  if (cleaned.includes("$(") || cleaned.includes("${")) return null;
  return cleaned;
}

function resolveReferencePath(repoRoot, markdownPath, target) {
  if (isAbsolute(target)) {
    const absolute = resolve(target);
    const repoRelative = relative(repoRoot, absolute);
    if (repoRelative.startsWith("..") || isAbsolute(repoRelative)) return null;
    return {
      checkPath: globCheckPath(absolute),
      displayPath: repoRelative || ".",
    };
  }

  const basePath = target.startsWith("./") || target.startsWith("../")
    ? resolve(repoRoot, dirname(markdownPath), target)
    : resolve(repoRoot, target);
  const repoRelative = relative(repoRoot, basePath);
  if (repoRelative.startsWith("..") || isAbsolute(repoRelative)) return null;
  return {
    checkPath: globCheckPath(basePath),
    displayPath: normalizeDisplayPath(repoRelative),
  };
}

function globCheckPath(resolvedPath) {
  const globIndex = resolvedPath.search(/[*{[]/);
  if (globIndex < 0) return resolvedPath;
  const prefix = resolvedPath.slice(0, globIndex);
  const slashIndex = Math.max(prefix.lastIndexOf("/"), prefix.lastIndexOf("\\"));
  return slashIndex >= 0 ? prefix.slice(0, slashIndex) : prefix;
}

function normalizeDisplayPath(filePath) {
  return filePath.replaceAll("\\", "/") || ".";
}

function dedupeReferences(references) {
  const seen = new Set();
  const deduped = [];
  for (const reference of references) {
    const key = `${reference.filePath}:${reference.line}:${reference.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(reference);
  }
  return deduped;
}

function lineNumberForIndex(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function main() {
  const repoRoot = process.cwd();
  const packageScripts = loadPackageScripts(resolve(repoRoot, "package.json"));
  const markdownFiles = listTrackedMarkdownFiles(repoRoot).map((path) => ({ path }));
  const { missingScripts, missingPaths } = checkMarkdownFiles({ repoRoot, markdownFiles, packageScripts });

  const onboardingFiles = markdownFiles.filter((file) => isOnboardingMarkdownPath(file.path));
  const { findings: onboardingFindings } = checkOnboardingDocs({ repoRoot, markdownFiles: onboardingFiles });

  let failed = false;

  if (missingScripts.length > 0 || missingPaths.length > 0) {
    failed = true;
    console.error("Documentation path/script check failed:");
    if (missingScripts.length > 0) {
      console.error("\nMissing package scripts referenced by markdown:");
      for (const finding of missingScripts) {
        console.error(`- ${finding.filePath}:${finding.line} npm run ${finding.scriptName}`);
      }
    }
    if (missingPaths.length > 0) {
      console.error("\nMissing local paths referenced by markdown:");
      for (const finding of missingPaths) {
        console.error(`- ${finding.filePath}:${finding.line} ${finding.target} -> ${finding.checkedPath}`);
      }
    }
  }

  const onboardingWarnings = onboardingFindings.filter((f) => f.severity === "warning");
  const onboardingErrors = onboardingFindings.filter((f) => f.severity !== "warning");

  if (onboardingErrors.length > 0) {
    failed = true;
    console.error("Agent onboarding doc check failed:");
    for (const finding of onboardingErrors) {
      console.error(
        `- ${finding.filePath}:${finding.line} [${finding.id}] ${finding.message} (${finding.snippet})`,
      );
    }
  }

  if (onboardingWarnings.length > 0) {
    console.warn("Agent onboarding doc warnings (non-blocking):");
    for (const finding of onboardingWarnings) {
      console.warn(
        `- ${finding.filePath}:${finding.line} [${finding.id}] ${finding.message}`,
      );
    }
  }

  if (failed) {
    process.exit(1);
  }

  console.log(`Documentation path/script check passed for ${markdownFiles.length} markdown files.`);
  console.log(`Agent onboarding doc check passed for ${onboardingFiles.length} markdown files (${onboardingWarnings.length} warnings).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
