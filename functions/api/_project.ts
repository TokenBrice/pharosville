import { RUNTIME_ACTIVE_IDS } from "../../shared/lib/stablecoins/runtime-registry";
import type { PharosVilleApiEndpointKey } from "../../shared/types/pharosville-endpoint-keys";

/**
 * Payload projection at the edge: forward the CONTRACT, not the upstream's
 * extras.
 *
 * `/api/safety-grades` carries one row per graded asset, but the world only
 * ever reads grades for assets that passed `RUNTIME_ACTIVE_IDS` —
 * `buildSafetyGradeMap` is indexed solely by the ids of rendered ships, and
 * the graveyard is built from `RUNTIME_CEMETERY_ENTRIES`, not from grades.
 * Rows outside that set cannot be reached, so they are dropped here instead
 * of shipped and parsed. Every other key of the response — `model`,
 * `methodologyVersion`, `asOfSec`, `publicationStatus` — is forwarded
 * untouched. Projection happens once per edge-cache miss, not per request.
 */

interface JsonRecord {
  [key: string]: unknown;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function projectSafetyGrades(payload: unknown): unknown {
  if (!isRecord(payload) || !Array.isArray(payload.grades)) return payload;
  const grades: unknown[] = [];
  for (const grade of payload.grades) {
    if (!isRecord(grade) || typeof grade.id !== "string") continue;
    if (!RUNTIME_ACTIVE_IDS.has(grade.id)) continue;
    grades.push(grade);
  }
  return { ...payload, grades };
}

const PROJECTORS: Partial<Record<PharosVilleApiEndpointKey, (payload: unknown) => unknown>> = {
  safetyGrades: projectSafetyGrades,
};

export function endpointProjector(
  key: PharosVilleApiEndpointKey,
): ((payload: unknown) => unknown) | null {
  return PROJECTORS[key] ?? null;
}
