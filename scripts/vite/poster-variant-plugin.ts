import type { Plugin } from "vite";
import { nightShell, wantsNightPoster } from "../../functions/_poster";

/**
 * Dev only: the night key art exactly as the `/` Pages Function serves it (functions/index.ts, E28), so a dev visit at
 * night, or any `?t=` pinned to night, opens on the night poster before first paint. The dev server's own time zone
 * stands in for the edge's `cf.timezone`. Production builds never run this; the Function owns the choice there.
 */
export function posterVariantDev(): Plugin {
  return {
    name: "pharosville-poster-variant-dev",
    apply: "serve",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const url = new URL(ctx.originalUrl ?? ctx.path, "http://localhost");
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return wantsNightPoster({ timeZone, nowMs: Date.now(), search: url.searchParams }) ? nightShell(html) : html;
      },
    },
  };
}
