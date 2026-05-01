import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { onRequest as pharosVilleApiProxy } from "./functions/api/[[path]]";

const root = fileURLToPath(new URL(".", import.meta.url));
const pharosVilleDesktopQuery = "(min-width: 1280px) and (min-height: 760px)";

function loadLooseLocalPharosEnv(): Record<string, string> {
  try {
    const file = readFileSync(join(root, ".env.local"), "utf8");
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
    ...loadLooseLocalPharosEnv(),
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
