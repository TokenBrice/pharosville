import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { onRequest as pharosVilleApiProxy } from "./functions/api/[[path]]";

const root = fileURLToPath(new URL(".", import.meta.url));
const pharosVilleDesktopQuery = "(min-width: 1280px) and (min-height: 760px)";
const PHAROS_SHARED_ENV_FILE = "pharosville.env.local";

function parseLoosePharosEnvFile(filePath: string): Record<string, string> {
  try {
    const file = readFileSync(filePath, "utf8");
    return Object.fromEntries(file.split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^\s*(PHAROS_API_(?:BASE|KEY))\s*(?:=|:)\s*(.*?)\s*$/);
      if (!match) return [];
      const value = match[2].replace(/^([`'"])(.*)\1$/, "$2").trim();
      return [[match[1], value]];
    }));
  } catch {
    return {};
  }
}

function resolveGitCommonDir(): string | null {
  try {
    const rawPath = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: root })
      .toString("utf8")
      .trim();
    if (!rawPath) return null;
    return isAbsolute(rawPath) ? rawPath : resolve(root, rawPath);
  } catch {
    return null;
  }
}

function loadWorktreeSharedPharosEnv(): Record<string, string> {
  const commonDir = resolveGitCommonDir();
  if (!commonDir) return {};

  const commonRoot = dirname(commonDir);
  const merged: Record<string, string> = {};
  const candidateFiles = [
    commonRoot !== root ? join(commonRoot, ".env.local") : null,
    join(commonDir, PHAROS_SHARED_ENV_FILE),
  ].filter((value): value is string => Boolean(value));

  for (const filePath of candidateFiles) {
    Object.assign(merged, parseLoosePharosEnvFile(filePath));
  }

  return merged;
}

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
            method: req.method,
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

function desktopChunkModulePreload(): Plugin {
  return {
    name: "pharosville-desktop-chunk-modulepreload",
    apply: "build",
    transformIndexHtml(_html, context) {
      const bundle = context.bundle;
      if (!bundle) return [];

      const desktopChunk = Object.values(bundle).find((entry) => (
        entry.type === "chunk"
        && entry.isDynamicEntry
        && entry.facadeModuleId?.endsWith("/src/pharosville-desktop-data.tsx")
      ));
      if (!desktopChunk || desktopChunk.type !== "chunk") return [];

      return [{
        tag: "link",
        attrs: {
          rel: "modulepreload",
          href: `/${desktopChunk.fileName}`,
          media: pharosVilleDesktopQuery,
        },
        injectTo: "head",
      }];
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = {
    ...loadWorktreeSharedPharosEnv(),
    ...loadEnv(mode, root, "PHAROS_API_"),
    ...process.env,
  };

  return {
    plugins: [
      localPharosVilleApiProxy({
        PHAROS_API_BASE: env.PHAROS_API_BASE ?? "https://api.pharos.watch",
        PHAROS_API_KEY: env.PHAROS_API_KEY,
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
    build: {
      target: "es2022",
      outDir: "dist",
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
          },
        },
      },
    },
  };
});
