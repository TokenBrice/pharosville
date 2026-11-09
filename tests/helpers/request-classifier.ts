import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

interface Registry { urls?: Record<string, string>; models?: Record<string, { url: string }>; files?: Array<{ url: string }> }
interface BuildGraph { [url: string]: { imports: string[] } }
const SHELL = ["/", "/index.html", "/favicon.svg", "/manifest.webmanifest", "/arrival-shell.css", "/harbour/poster-960.avif", "/og-card.png", "/@vite/client", "/node_modules/vite/dist/client/env.mjs", "/@react-refresh", "/src/main.tsx", "/src/error-reporter.ts", "/src/error-diagnostic.ts", "/src/content/pharosville-version.ts", "/src/systems/viewport-gate.ts", "/src/harbour/app/poster.ts", "/src/welcome-handoff.ts"];
/** The welcome's own lazy chunk (main.tsx loads it below the gate alone): allowed by name, never by extension. */
const WELCOME_CHUNK = /\bimport\(\s*["']\.\/(welcome-handoff-[\w-]+\.js)["']\s*\)/g;

export function requestClassifier(registry: Registry = {}, graph: BuildGraph = {}, entries: string[] = []) {
  const allowed = new Set(SHELL);
  for (const [original, url] of Object.entries(registry.urls ?? {})) {
    if (SHELL.includes(original) || original.startsWith("/fonts/")) { allowed.add(original); allowed.add(url); }
  }
  const visit = (url: string) => {
    if (allowed.has(url)) return;
    allowed.add(url);
    for (const dependency of graph[url]?.imports ?? []) visit(dependency);
  };
  entries.forEach(visit);
  return (value: string) => {
    const path = new URL(value, "https://scenario.invalid").pathname;
    if (allowed.has(path) || path.startsWith("/fonts/")) return false;
    // Fail closed for newly added transports, rather than guessing by file extension.
    return true;
  };
}

/** Read the actual hashed shell/static import graph when testing dist; dev uses source identities. */
export function loadRequestClassifier(root = process.cwd()) {
  const dist = resolve(root, "dist"), index = resolve(dist, "index.html");
  if (!existsSync(index)) return requestClassifier();
  const registryPath = resolve(dist, "asset-registry.json");
  const registry: Registry = existsSync(registryPath) ? JSON.parse(readFileSync(registryPath, "utf8")) as Registry : {};
  const graph: BuildGraph = {};
  const read = (url: string) => {
    if (graph[url]) return;
    graph[url] = { imports: [] };
    const text = readFileSync(resolve(dist, `.${url}`), "utf8");
    const source = ts.createSourceFile(url, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    for (const statement of source.statements) {
      if ((!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const target = new URL(statement.moduleSpecifier.text, `https://scenario.invalid${url}`).pathname;
      if (target.endsWith(".js")) { graph[url]!.imports.push(target); read(target); }
    }
    for (const [, chunk] of text.matchAll(WELCOME_CHUNK)) {
      const target = new URL(chunk!, `https://scenario.invalid${url}`).pathname;
      graph[url]!.imports.push(target); read(target);
    }
  };
  const html = readFileSync(index, "utf8");
  const entries = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]!);
  entries.forEach(read);
  const styles = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]!);
  return requestClassifier(registry, graph, [...entries, ...styles]);
}
