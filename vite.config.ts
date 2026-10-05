import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { OutputBundle, OutputChunk } from "rollup";
import { onRequest as pharosVilleApiProxy } from "./functions/api/[[path]]";
import { loadWorktreeSharedPharosEnv } from "./scripts/pharosville/local-api-env.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const pharosVilleDesktopQuery = "(min-width: 1280px) and (min-height: 760px)";
const pharosVilleDesktopChunkName = "pharosville-desktop-data";

function localPharosVilleApiProxy(env: { PHAROS_API_BASE?: string; PHAROS_API_KEY?: string }): Plugin {
  return {
    name: "local-pharosville-api-proxy",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) {
          next();
          return;
        }

        if (!env.PHAROS_API_KEY?.trim()) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({
            error: "Local PharosVille API proxy is not configured",
            hint: "Set PHAROS_API_KEY in .env.local, main worktree .env.local, or .git/pharosville.env.local.",
          }));
          return;
        }

        try {
          const host = req.headers.host ?? "localhost";
          const request = new Request(new URL(req.url, `http://${host}`), {
            ...(req.method !== undefined ? { method: req.method } : {}),
          });
          const response = await pharosVilleApiProxy({
            request,
            env,
            params: { path: req.url.split("?")[0].split("/").slice(2) },
          });

          res.statusCode = response.status;
          res.statusMessage = response.statusText;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          server.config.logger.error(error instanceof Error ? error.stack ?? error.message : String(error));
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "Local PharosVille API proxy failed" }));
        }
      });
    },
  };
}

/** Identity comes from the serving process, never a preview CLI label or another checkout. */
function localCheckoutIdentity(): Plugin {
  return {
    name: "local-pharosville-checkout-identity",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== "/__pharosville/checkout") { next(); return; }
        res.setHeader("content-type", "application/json");
        res.setHeader("cache-control", "no-store");
        if (req.method !== "GET") { res.statusCode = 405; res.end(); return; }
        try {
          const servingRoot = realpathSync(root);
          const git = (args: string[]) => execFileSync("git", args, { cwd: servingRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
          const allowed = (path: string) => !path.split("/").some((part) => part.startsWith(".env"));
          const entries = git(["status", "--porcelain", "-z"]).split("\0");
          const dirtyPaths: string[] = [];
          for (let index = 0; index < entries.length; index++) {
            const entry = entries[index];
            if (!entry) continue;
            const path = entry.slice(3);
            if (allowed(path)) dirtyPaths.push(path);
            if (/[RC]/.test(entry.slice(0, 2))) {
              const previous = entries[++index];
              if (previous && allowed(previous)) dirtyPaths.push(previous);
            }
          }
          const sources = git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0")
            .filter((path) => path && allowed(path) && (/^(src|shared|public|functions)\//.test(path)
              || ["index.html", "vite.config.ts", "package.json", "package-lock.json"].includes(path))).sort();
          const digest = createHash("sha256");
          for (const path of sources) {
            try {
              const bytes = readFileSync(resolve(servingRoot, path));
              digest.update(`${path}\0${bytes.byteLength}\0`); digest.update(bytes);
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
              digest.update(`${path}\0missing\0`);
            }
          }
          res.end(JSON.stringify({ root: servingRoot, commit: git(["rev-parse", "HEAD"]).trim(),
            dirtyPaths: [...new Set(dirtyPaths)].sort(), sourceHash: digest.digest("hex") }));
        } catch {
          res.statusCode = 503; res.end(JSON.stringify({ error: "Serving checkout identity unavailable." }));
        }
      });
    },
  };
}

function desktopChunkModulePreload(): Plugin {
  return {
    name: "pharosville-desktop-chunk-modulepreload",
    apply: "build",
    transformIndexHtml(_html, context) {
      const bundle = context.bundle;
      if (!bundle) return [];

      const desktopChunk = Object.values(bundle).find((entry): entry is OutputChunk => (
        isOutputChunk(entry)
        && entry.isDynamicEntry
        && entry.name === pharosVilleDesktopChunkName
      ));
      if (!desktopChunk) {
        throw new Error(`Missing dynamic ${pharosVilleDesktopChunkName} chunk for desktop modulepreload.`);
      }

      const fileNames = desktopModulePreloadFileNames(bundle, desktopChunk);
      if (fileNames.length === 0) {
        throw new Error(`No modulepreload targets collected for ${pharosVilleDesktopChunkName}.`);
      }

      return fileNames.map((fileName) => ({
        tag: "link",
        attrs: {
          rel: "modulepreload",
          href: `/${fileName}`,
          media: pharosVilleDesktopQuery,
        },
        injectTo: "head",
      }));
    },
  };
}

function isOutputChunk(entry: OutputBundle[string]): entry is OutputChunk {
  return entry.type === "chunk";
}

function desktopModulePreloadFileNames(bundle: OutputBundle, desktopChunk: OutputChunk): string[] {
  const fileNames: string[] = [];
  const seen = new Set<string>();
  const visit = (fileName: string) => {
    if (seen.has(fileName)) return;
    seen.add(fileName);
    const entry = bundle[fileName];
    if (!entry || !isOutputChunk(entry)) return;
    fileNames.push(fileName);
    for (const importedFileName of entry.imports) visit(importedFileName);
  };
  visit(desktopChunk.fileName);
  return fileNames;
}

export default defineConfig(({ mode }) => {
  const env = {
    ...loadWorktreeSharedPharosEnv(root),
    ...loadEnv(mode, root, "PHAROS_API_"),
    ...process.env,
  };

  return {
    plugins: [
      localCheckoutIdentity(),
      localPharosVilleApiProxy({
        PHAROS_API_BASE: env.PHAROS_API_BASE ?? "https://api.pharos.watch",
        ...(env.PHAROS_API_KEY !== undefined ? { PHAROS_API_KEY: env.PHAROS_API_KEY } : {}),
      }),
      desktopChunkModulePreload(),
      react(),
    ],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
        "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
      },
    },
    ...(mode === "production"
      ? { esbuild: { drop: ["debugger" as const], pure: ["console.warn", "console.debug"] } }
      : {}),
    build: {
      target: "es2022",
      outDir: "dist",
      minify: "terser",
      terserOptions: {
        compress: {
          passes: 2,
        },
      },
      // Route-specific budgets are enforced by scripts/check-bundle-size.mjs.
      // Keep Vite's generic warning quiet unless a chunk exceeds the guarded budget envelope.
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-dom/")) {
              return "vendor-react";
            }
            if (id.includes("/node_modules/@tanstack/react-query/")) {
              return "vendor-query";
            }
            if (id.includes("/node_modules/lucide-react/")) {
              return "vendor-icons";
            }
            if (
              id.includes("/node_modules/three/")
              || id.includes("/node_modules/postprocessing/")
              || id.includes("/node_modules/n8ao/")
            ) {
              return "vendor-rendering";
            }
            return undefined;
          },
        },
      },
    },
  };
});
