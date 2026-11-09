#!/usr/bin/env node
import { parseArgs } from "node:util";
import { captureLock, connectShared } from "./shared-browser.mjs";
import { classifyGpu } from "./capture-provenance.mjs";
import { formatShaderVerdicts, matrixExitCode } from "./shader-matrix-core.mts";

const { values } = parseArgs({ options: { url: { type: "string" }, help: { type: "boolean" } }, strict: true });
if (values.help) {
  console.log("Usage: node scripts/harbour/shader-matrix.mjs --url http://localhost:5173/\nRequires the Vite dev origin and a shared real-GPU browser. Exits 0 PASS, 1 FAIL, 78 no real GPU.");
} else {
  const url = new URL(values.url ?? "http://localhost:5173/");
  url.hash = "";
  let release, browser, page;
  try {
    release = await captureLock();
    try { browser = await connectShared(); }
    catch (error) { console.error(`SKIP: shared real-GPU browser unavailable: ${error.message}`); process.exitCode = 78; }
    if (browser) {
      page = await browser.contexts()[0].newPage();
      const diagnostics = [];
      page.on("pageerror", (error) => diagnostics.push(error.stack ?? error.message));
      page.on("console", (message) => { if (["error", "warning"].includes(message.type())) diagnostics.push(`${message.type()}: ${message.text()}`); });
      // A blank document at the requested dev origin loads fixtures without mounting/fetching the live world.
      await page.route(url.href, (route) => route.request().isNavigationRequest()
        ? route.fulfill({ contentType: "text/html", body: "<!doctype html><title>PharosVille shader matrix</title>" }) : route.continue());
      await page.goto(url.href);
      const identity = await page.evaluate(() => {
        const gl = document.createElement("canvas").getContext("webgl2");
        if (!gl) return "none";
        const debug = gl.getExtension("WEBGL_debug_renderer_info");
        const name = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : "unknown";
        gl.getExtension("WEBGL_lose_context")?.loseContext(); return name;
      });
      console.log(`GPU: ${identity}\nBrowser: ${browser.version()}\nOrigin: ${url.origin}`);
      if (classifyGpu(identity) !== "hardware") { console.error("SKIP: no verified real GPU"); process.exitCode = 78; }
      else {
        const result = await page.evaluate(async () => {
          const { runShaderMatrix } = await import("/src/harbour/engine/shaders/matrix-runner.ts");
          return runShaderMatrix();
        });
        if (diagnostics.length) result.rows.push({ id: "page-diagnostics", draws: 0, logs: diagnostics });
        console.log(formatShaderVerdicts(result.rows));
        process.exitCode = matrixExitCode(result.rows, classifyGpu(result.renderer) === "hardware");
        console.log(`\n${process.exitCode === 0 ? "PASS" : process.exitCode === 78 ? "SKIP" : "FAIL"}: ${result.rows.length} recipes`);
      }
    }
  } catch (error) { console.error(error.stack ?? error.message); process.exitCode = 1; }
  finally { await page?.close(); await browser?.close(); await release?.(); }
}
