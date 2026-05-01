#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function usage() {
  console.error("Usage: npm run agent:plan:new -- <slug>");
}

export function sanitizeSlug(value) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function formatDate(date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nextAvailablePath(repoRoot, fileBase) {
  const agentsDir = resolve(repoRoot, "agents");
  mkdirSync(agentsDir, { recursive: true });

  let fileName = `${fileBase}.md`;
  let counter = 2;
  while (existsSync(join(agentsDir, fileName))) {
    fileName = `${fileBase}-${counter}.md`;
    counter += 1;
  }
  return join(agentsDir, fileName);
}

function template({ title, today }) {
  return [
    `# ${title}`,
    "",
    `Date: ${today}`,
    "",
    "## Goal",
    "",
    "- ",
    "",
    "## Scope",
    "",
    "- In scope:",
    "- Out of scope:",
    "",
    "## Constraints",
    "",
    "- Keep changes route-local unless explicitly requested otherwise.",
    "- Preserve `/api/*` allowlist and server-side secret handling.",
    "",
    "## Plan",
    "",
    "1. ",
    "2. ",
    "3. ",
    "",
    "## Validation",
    "",
    "- [ ] `npm run validate:changed`",
    "- [ ] Additional focused checks (list exact commands):",
    "",
    "## Handoff",
    "",
    "- Files changed:",
    "- Risks/notes:",
    "- Follow-ups:",
    "",
  ].join("\n");
}

function main() {
  const slugArg = process.argv[2];
  if (!slugArg) {
    usage();
    process.exit(1);
  }

  const repoRoot = process.cwd();
  const slug = sanitizeSlug(slugArg);
  if (!slug) {
    console.error("Slug resolves to empty after sanitization.");
    process.exit(1);
  }

  const today = formatDate(new Date());
  const fileBase = `${today}-${slug}`;
  const outputPath = nextAvailablePath(repoRoot, fileBase);
  const title = slug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  writeFileSync(outputPath, template({ title, today }), "utf8");

  console.log(`Created plan scaffold: ${outputPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
