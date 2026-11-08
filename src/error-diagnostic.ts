// Shared by the browser and /_log so persistence never accepts a wider diagnostic shape.
export const ERROR_CATEGORIES = ["render", "data-load", "interaction", "network", "uncaught", "rejection", "unknown", "canary"] as const;
export type ErrorCategory = typeof ERROR_CATEGORIES[number];
export const ERROR_CODES = ["renderer-create", "asset-load", "asset-timeout", "target-unsupported", "target-readback", "shader-link", "preparation-timeout", "context-loss", "context-recovery", "frame-failure", "worker-crash", "worker-timeout", "invalid-payload", "audio-unavailable", "component-failure", "module-load", "boot-failure", "uncaught", "rejection", "unknown", "canary"] as const;
const LEGACY_CODES: Record<string, typeof ERROR_CODES[number]> = {
  "renderer-failure": "renderer-create", "harbour-module-failure": "module-load", "harbour-boot-failure": "boot-failure", "component-failure": "component-failure",
};

function sourceUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return undefined;
    // Diagnostics need source locations, never selection routes or arbitrary path text.
    if (!/^\/assets\/[\w./-]+\.js$/.test(url.pathname) && !/^\/src\/[\w./-]+\.[jt]sx?$/.test(url.pathname)) return undefined;
    return `${url.origin}${url.pathname}`.slice(0, 300);
  } catch { return undefined; }
}

export function projectDiagnostic(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const source = payload as Record<string, unknown>;
  if (!ERROR_CATEGORIES.includes(source.category as ErrorCategory)) return null;
  const category = source.category as ErrorCategory;
  const suppliedCode = source.code ?? source.kind;
  const fallback = category === "uncaught" || category === "rejection" || category === "canary" ? category : "unknown";
  const code = ERROR_CODES.includes(suppliedCode as typeof ERROR_CODES[number])
    ? suppliedCode as typeof ERROR_CODES[number]
    : Object.hasOwn(LEGACY_CODES, String(source.kind)) ? LEGACY_CODES[String(source.kind)]! : fallback;
  const release = typeof source.release === "string" && /^v\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(source.release) ? source.release : "unknown";
  const ts = typeof source.ts === "number" && Number.isFinite(source.ts) ? source.ts : Date.now();
  const filename = sourceUrl(source.filename);
  // Extract locations only: the first stack line and function names can contain user text.
  const stack = typeof source.stack === "string" ? [...source.stack.slice(0, 2_000).matchAll(/https?:\/\/[^\s)]+/g)]
    .map(([location]) => sourceUrl(location.replace(/:\d+(?::\d+)?$/, ""))).filter(Boolean).slice(0, 3).join("\n") : "";
  return { category, code, release, ts, ...(filename ? { filename } : {}), ...(stack ? { stack } : {}) };
}
