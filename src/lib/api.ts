import type { ZodType } from "zod";
import { classifyFreshnessRatio } from "@shared/lib/status-thresholds";
import { ApiMetaSchema, type ApiMeta } from "@shared/types/api-meta";

export type { ApiMeta } from "@shared/types/api-meta";

export type ApiContractMode = "strict" | "warn";

export class SchemaValidationError extends Error {
  readonly path: string;
  readonly issues: string;

  constructor(path: string, issues: string) {
    super(`Schema validation failed for ${path}: ${issues}`);
    this.name = "SchemaValidationError";
    this.path = path;
    this.issues = issues;
  }
}

export class ApiFetchError extends Error {
  readonly status: number;
  readonly path: string;
  readonly bodyText: string | null;

  constructor(path: string, status: number, bodyText: string | null) {
    super(`Failed to fetch ${path}: ${status}`);
    this.name = "ApiFetchError";
    this.status = status;
    this.path = path;
    this.bodyText = bodyText;
  }
}

export class ApiPathError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`API fetch path must be a same-origin /api/ path: ${path}`);
    this.name = "ApiPathError";
    this.path = path;
  }
}

function assertSameOriginApiPath(path: string): void {
  if (
    !path.startsWith("/api/")
    || path.startsWith("//")
    || /^[a-z][a-z0-9+.-]*:/i.test(path)
  ) {
    throw new ApiPathError(path);
  }
}

function formatIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): string {
  return issues.map((i) => `${i.path.map(String).join(".")}: ${i.message}`).join(", ");
}

function isFreshnessWarningHeader(warningHeader: string): boolean {
  return /(?:^|,\s*)110\b/.test(warningHeader)
    || /Response is (?:degraded|stale)/i.test(warningHeader);
}

async function buildFetchError(path: string, res: Response): Promise<ApiFetchError> {
  let bodyText: string | null = null;
  try {
    bodyText = await res.text();
  } catch {
    bodyText = null;
  }
  return new ApiFetchError(path, res.status, bodyText);
}

const DEFAULT_CONTRACT_MODE: ApiContractMode = import.meta.env.PROD ? "warn" : "strict";

const warnedSchemaPaths = new Set<string>();
function logSchemaDriftOnce(path: string, issues: string): void {
  if (warnedSchemaPaths.has(path)) return;
  warnedSchemaPaths.add(path);
  console.warn(`[api] schema drift in warn mode for ${path}: ${issues}`);
}

function validateApiPayload<T>(
  path: string,
  data: unknown,
  schema?: ZodType<T>,
  contractMode: ApiContractMode = DEFAULT_CONTRACT_MODE,
): T {
  if (!schema) return data as T;
  if (contractMode === "warn") {
    const result = schema.safeParse(data);
    if (!result.success) {
      logSchemaDriftOnce(path, formatIssues(result.error.issues));
    }
    return data as T;
  }

  const result = schema.safeParse(data);
  if (result.success) return result.data;

  throw new SchemaValidationError(path, formatIssues(result.error.issues));
}

export async function apiFetch<T>(
  path: string,
  schema?: ZodType<T>,
  init?: RequestInit,
  contractMode?: ApiContractMode,
): Promise<T> {
  assertSameOriginApiPath(path);
  const res = await fetch(path, init);
  if (!res.ok) throw await buildFetchError(path, res);
  const data: unknown = await res.json();
  return validateApiPayload(path, data, schema, contractMode);
}

export async function apiFetchWithMeta<T>(
  path: string,
  schema?: ZodType<T>,
  init?: RequestInit,
  maxAgeSec = 900,
  contractMode?: ApiContractMode,
): Promise<{ data: T; meta: ApiMeta | null }> {
  assertSameOriginApiPath(path);
  const res = await fetch(path, init);
  if (!res.ok) throw await buildFetchError(path, res);

  const json: unknown = await res.json();
  let meta: ApiMeta | null = null;
  let data = json;

  if (json && typeof json === "object" && !Array.isArray(json) && "_meta" in json) {
    const { _meta, ...rest } = json as Record<string, unknown>;
    const parsed = ApiMetaSchema.safeParse(_meta);
    if (parsed.success) meta = parsed.data;
    data = rest;
  }

  if (!meta) {
    const ageHeader = res.headers.get("X-Data-Age");
    if (ageHeader) {
      const age = Number(ageHeader);
      if (Number.isFinite(age) && age >= 0) {
        meta = {
          updatedAt: Math.floor(Date.now() / 1000) - age,
          ageSeconds: age,
          status: classifyFreshnessRatio(age / maxAgeSec),
        };
      }
    }
  }

  const warningHeader = res.headers.get("Warning");
  if (warningHeader) {
    const freshnessWarning = isFreshnessWarningHeader(warningHeader);
    if (meta) {
      meta = {
        ...meta,
        status: freshnessWarning && meta.status === "fresh" ? "degraded" : meta.status,
        warning: warningHeader,
      };
    } else if (freshnessWarning) {
      meta = {
        updatedAt: Math.floor(Date.now() / 1000),
        ageSeconds: 0,
        status: "degraded",
        warning: warningHeader,
      };
    }
  }

  return { data: validateApiPayload(path, data, schema, contractMode), meta };
}
