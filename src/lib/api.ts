import { classifyFreshnessRatio } from "@shared/lib/status-thresholds";
import { PHAROSVILLE_API_CLIENT_ENDPOINTS } from "@shared/lib/pharosville-api-client-contract";
import type { ApiDependencyMeta, ApiMeta } from "@shared/types/api-meta";

export type { ApiMeta } from "@shared/types/api-meta";

export type ApiContractMode = "strict" | "warn";

interface SchemaParseIssue {
  path: readonly PropertyKey[];
  message: string;
}

type SchemaValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: readonly SchemaParseIssue[] } };

export interface ApiSchema<T> {
  safeParse(data: unknown): SchemaValidationResult<T>;
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isApiMetaStatus(value: unknown): value is ApiMeta["status"] {
  return value === "fresh" || value === "degraded" || value === "stale";
}

function isApiDependencyMetaStatus(value: unknown): value is ApiDependencyMeta["status"] {
  return value === "fresh" || value === "degraded" || value === "stale" || value === "unavailable";
}

function parseNullableNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function parseApiDependencyMeta(value: unknown): ApiDependencyMeta | null {
  if (!isRecord(value) || !isApiDependencyMetaStatus(value.status)) return null;

  const updatedAt = parseNullableNumber(value.updatedAt);
  const ageSeconds = parseNullableNumber(value.ageSeconds);
  const reason = parseNullableString(value.reason);
  if (
    (value.updatedAt !== undefined && updatedAt === undefined)
    || (value.ageSeconds !== undefined && ageSeconds === undefined)
    || (value.reason !== undefined && reason === undefined)
  ) {
    return null;
  }

  return {
    ...(updatedAt !== undefined ? { updatedAt } : {}),
    ...(ageSeconds !== undefined ? { ageSeconds } : {}),
    status: value.status,
    ...(reason !== undefined ? { reason } : {}),
  };
}

function parseApiMeta(value: unknown): ApiMeta | null {
  if (
    !isRecord(value)
    || typeof value.updatedAt !== "number"
    || !Number.isFinite(value.updatedAt)
    || typeof value.ageSeconds !== "number"
    || !Number.isFinite(value.ageSeconds)
    || !isApiMetaStatus(value.status)
  ) {
    return null;
  }

  const warning = parseNullableString(value.warning);
  if (value.warning !== undefined && warning === undefined) return null;

  let dependencies: Record<string, ApiDependencyMeta> | null | undefined;
  if (value.dependencies !== undefined && value.dependencies !== null) {
    if (!isRecord(value.dependencies)) return null;
    dependencies = {};
    for (const [key, dependency] of Object.entries(value.dependencies)) {
      const parsed = parseApiDependencyMeta(dependency);
      if (!parsed) return null;
      dependencies[key] = parsed;
    }
  } else {
    dependencies = value.dependencies === null ? null : undefined;
  }

  return {
    updatedAt: value.updatedAt,
    ageSeconds: value.ageSeconds,
    status: value.status,
    ...(warning !== undefined ? { warning } : {}),
    ...(dependencies !== undefined ? { dependencies } : {}),
  };
}

async function buildFetchError(path: string, res: Response): Promise<ApiFetchError> {
  let bodyText: string | null;
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
  schema?: ApiSchema<T>,
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

async function resolveApiSchema<T>(
  path: string,
  schema?: ApiSchema<T>,
): Promise<ApiSchema<T> | undefined> {
  if (import.meta.env.PROD) return schema;
  if (schema) return schema;

  const endpoint = PHAROSVILLE_API_CLIENT_ENDPOINTS.find((candidate) => candidate.path === path);
  if (!endpoint) return undefined;

  const { PHAROSVILLE_API_CONTRACT } = await import("@shared/lib/pharosville-api-contract");
  return PHAROSVILLE_API_CONTRACT[endpoint.key].schema as ApiSchema<T>;
}

export async function apiFetch<T>(
  path: string,
  schema?: ApiSchema<T>,
  init?: RequestInit,
  contractMode?: ApiContractMode,
): Promise<T> {
  assertSameOriginApiPath(path);
  const res = await fetch(path, init);
  if (!res.ok) throw await buildFetchError(path, res);
  const data: unknown = await res.json();
  const validationSchema = await resolveApiSchema(path, schema);
  return validateApiPayload(path, data, validationSchema, contractMode);
}

export async function apiFetchWithMeta<T>(
  path: string,
  schema?: ApiSchema<T>,
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
    meta = parseApiMeta(_meta);
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

  const validationSchema = await resolveApiSchema(path, schema);
  return { data: validateApiPayload(path, data, validationSchema, contractMode), meta };
}
