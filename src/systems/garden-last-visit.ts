import { isVisualDebugAllowed } from "../lib/pharosville-debug";

/**
 * X2 (data-poetry-5): where the water stood on the tidal flat at the visitor's
 * last visit, as a supply-tide offset (−1 ebb … +1 flood), or null when there
 * is no stored visit, no stored tide, or no storage at all.
 *
 * The visit hook (`use-visit-snapshot.ts`) writes it once, from the snapshot it
 * reads before replacing it; the tidal flat reads it per frame for its wrack
 * line. One number in module state keeps React out of the render loop.
 */
let lastVisitTideOffset: number | null = null;

/**
 * The flat's tide must have moved at least this much (of full scale) since the
 * last visit to be drawn as a wrack line and told in the visit sentence.
 */
export const LAST_VISIT_TIDE_MIN_DELTA = 0.15;

export function setGardenLastVisitTide(offset: number | null): void {
  lastVisitTideOffset = typeof offset === "number" && Number.isFinite(offset)
    ? Math.max(-1, Math.min(1, offset))
    : null;
}

let seamSearch: string | null = null;
let seamHash: string | null = null;
let seamValue: number | null = null;

/**
 * Debug seam (`debug=1&lastTide=<offset>`, localhost/dev only): fakes the
 * stored last visit so a capture can show the wrack line without seeding
 * localStorage. Cached per URL: this is read from the render loop.
 */
function debugLastVisitTide(): number | null {
  if (typeof window === "undefined" || !isVisualDebugAllowed()) return null;
  const { hash, search } = window.location;
  if (hash !== seamHash || search !== seamSearch) {
    seamHash = hash;
    seamSearch = search;
    const rawHash = hash.startsWith("#") ? hash.slice(1) : hash;
    const params = [new URLSearchParams(search), new URLSearchParams(rawHash.startsWith("?") ? rawHash.slice(1) : rawHash)];
    const debug = params.some((entry) => entry.get("debug") === "1");
    const raw = params.map((entry) => entry.get("lastTide")).find((value) => value !== null) ?? null;
    const parsed = raw === null ? Number.NaN : Number(raw);
    seamValue = debug && Number.isFinite(parsed) ? Math.max(-1, Math.min(1, parsed)) : null;
  }
  return seamValue;
}

/** The last visit's tide offset (the debug seam wins when present). */
export function gardenLastVisitTide(): number | null {
  return debugLastVisitTide() ?? lastVisitTideOffset;
}
