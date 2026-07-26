import { RUNTIME_ACTIVE_IDS } from "../../shared/lib/stablecoins/runtime-registry";
import type { PharosVilleApiEndpointKey } from "../../shared/types/pharosville-endpoint-keys";

/**
 * Payload projection at the edge: forward the CONTRACT, not the upstream's
 * extras.
 *
 * `/api/report-cards` is 2.98 MB — more than half of the ~5 MB PharosVille
 * downloads and parses before it can draw anything, and the largest single item
 * on the critical path by a wide margin. Two thirds of it is never read:
 *
 * - `dimensions[*].detailItems` (0.59 MB) is not in `ReportCardDimensionSchema`
 *   at all. Zod strips it on arrival, so no consumer can see it even today; it
 *   is pure transfer and parse cost. It is also self-duplicating — each item
 *   repeats the same sentence as label, value and detail.
 * - 443 cards arrive for a world that renders 187 ships. `cards` has exactly
 *   one consumer, `buildReportCardMap`, and it is only ever indexed by the id
 *   of an asset that passed `RUNTIME_ACTIVE_IDS`. Cards outside that set cannot
 *   be reached. (The graveyard does not use them either — it is built from
 *   `RUNTIME_CEMETERY_ENTRIES`.)
 *
 * Projection happens once per edge-cache miss, not per request, and every other
 * key of the response — `_meta`, `updatedAt`, `safetyScoreIdentity`,
 * `methodology` — is forwarded untouched.
 */

interface JsonRecord {
  [key: string]: unknown;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function projectReportCards(payload: unknown): unknown {
  if (!isRecord(payload) || !Array.isArray(payload.cards)) return payload;
  const cards: unknown[] = [];
  for (const card of payload.cards) {
    if (!isRecord(card) || typeof card.id !== "string") continue;
    if (!RUNTIME_ACTIVE_IDS.has(card.id)) continue;
    if (!isRecord(card.dimensions)) {
      cards.push(card);
      continue;
    }
    const dimensions: JsonRecord = {};
    for (const [key, dimension] of Object.entries(card.dimensions)) {
      if (!isRecord(dimension)) {
        dimensions[key] = dimension;
        continue;
      }
      const { detailItems: _detailItems, ...kept } = dimension;
      dimensions[key] = kept;
    }
    cards.push({ ...card, dimensions });
  }
  return { ...payload, cards };
}

const PROJECTORS: Partial<Record<PharosVilleApiEndpointKey, (payload: unknown) => unknown>> = {
  reportCards: projectReportCards,
};

export function endpointProjector(
  key: PharosVilleApiEndpointKey,
): ((payload: unknown) => unknown) | null {
  return PROJECTORS[key] ?? null;
}
