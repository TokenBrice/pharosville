import { resolve } from "node:path";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { staticDataProjections } from "../../scripts/vite/static-data-plugin";

/** Built only in memory by the tests, using the app's canonical data projections. */
export async function overlayBundle() {
  const result = await build({
    configFile: false, logLevel: "error", plugins: [staticDataProjections(), react()],
    // library mode leaves process.env in the IIFE; the browser has no process (React reads NODE_ENV)
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    resolve: { alias: { "@": resolve("src"), "@shared": resolve("shared") } },
    build: { write: false, minify: false, lib: { entry: resolve("tests/harness/entry.tsx"), name: "OverlayHarness", formats: ["iife"] } },
  });
  const output = (Array.isArray(result) ? result[0]! : result) as { output: Array<{ type: string; code?: string; source?: string | Uint8Array; fileName: string }> };
  return {
    script: output.output.find((file) => file.type === "chunk")!.code!,
    css: String(output.output.find((file) => file.fileName.endsWith(".css"))!.source),
    html: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Overlay contract</title><link rel="stylesheet" href="/arrival-shell.css"><link rel="stylesheet" href="/__qa__/overlay.css"></head><body><main><h1 class="sr-only">Overlay contract</h1><div id="overlay"></div></main><script src="/__qa__/overlay.js"></script></body></html>',
  };
}
