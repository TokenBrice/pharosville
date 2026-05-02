import type { TilePoint } from "../systems/projection";

export type WorldDrawablePass = "underlay" | "body" | "overlay" | "selection";

export interface WorldDrawableSortFields {
  depth: number;
  detailId?: string;
  entityId?: string;
  kind: string;
  pass: WorldDrawablePass;
  screenBounds: { height: number; width: number; x: number; y: number };
  tieBreaker: string;
  // Optional numeric tie-breaker. When present, used in place of the
  // string `tieBreaker` during sort to skip lexicographic comparison.
  // Producers can leave this absent; the sort falls back to `tieBreaker`.
  sortIndex?: number;
}

export interface WorldDrawable extends WorldDrawableSortFields {
  draw: (ctx: CanvasRenderingContext2D) => void;
}

const DRAWABLE_PASS_RANK: Record<WorldDrawablePass, number> = {
  underlay: 0,
  body: 1,
  overlay: 2,
  selection: 3,
};

// Intern `kind` strings to a small-int rank so the sort comparator avoids
// the per-comparison lexicographic compare. Unknown kinds fall back to a
// stable lazy interning bucket above the well-known set.
const DRAWABLE_KIND_RANK: Record<string, number> = {
  area: 0,
  dock: 1,
  ship: 2,
  lighthouse: 3,
  grave: 4,
  scenery: 5,
  district: 6,
  cluster: 7,
};
const DRAWABLE_KIND_RANK_BASE = 100;
const drawableKindRankLazy = new Map<string, number>();
let drawableKindRankCursor = DRAWABLE_KIND_RANK_BASE;

function drawableKindRank(kind: string): number {
  const known = DRAWABLE_KIND_RANK[kind];
  if (known !== undefined) return known;
  let lazy = drawableKindRankLazy.get(kind);
  if (lazy === undefined) {
    lazy = drawableKindRankCursor;
    drawableKindRankCursor += 1;
    drawableKindRankLazy.set(kind, lazy);
  }
  return lazy;
}

export function sortByIsoDepth<T>(
  items: readonly T[],
  tileFor: (item: T) => TilePoint,
  tieBreakerFor: (item: T) => string,
): T[] {
  return [...items].sort((a, b) => {
    const aTile = tileFor(a);
    const bTile = tileFor(b);
    return (aTile.x + aTile.y) - (bTile.x + bTile.y)
      || aTile.y - bTile.y
      || compareText(tieBreakerFor(a), tieBreakerFor(b));
  });
}

export function drawableDepth(tile: TilePoint): number {
  return (tile.x + tile.y) * 1000 + tile.y;
}

export function sortWorldDrawables<T extends WorldDrawableSortFields>(drawables: readonly T[]): T[] {
  return [...drawables].sort(compareWorldDrawables);
}

export function sortWorldDrawablesInPlace<T extends WorldDrawableSortFields>(drawables: T[]): T[] {
  return drawables.sort(compareWorldDrawables);
}

function compareWorldDrawables(a: WorldDrawableSortFields, b: WorldDrawableSortFields): number {
  return (
    selectionRank(a) - selectionRank(b)
    || a.depth - b.depth
    || DRAWABLE_PASS_RANK[a.pass] - DRAWABLE_PASS_RANK[b.pass]
    || drawableKindRank(a.kind) - drawableKindRank(b.kind)
    || compareTieBreaker(a, b)
  );
}

function compareTieBreaker(a: WorldDrawableSortFields, b: WorldDrawableSortFields): number {
  // Prefer the numeric tie-breaker when both descriptors carry one (cheaper
  // than a per-comparison string compare). Fall back to the legacy string
  // `tieBreaker` whenever either side omits the numeric variant so producers
  // that haven't been migrated keep their existing ordering.
  if (a.sortIndex !== undefined && b.sortIndex !== undefined) return a.sortIndex - b.sortIndex;
  return compareText(a.tieBreaker, b.tieBreaker);
}

function selectionRank(drawable: WorldDrawableSortFields): number {
  return drawable.pass === "selection" ? 1 : 0;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function drawablePassCounts(drawables: readonly Pick<WorldDrawableSortFields, "pass">[]): Record<WorldDrawablePass, number> {
  return drawables.reduce<Record<WorldDrawablePass, number>>((counts, drawable) => {
    counts[drawable.pass] += 1;
    return counts;
  }, {
    underlay: 0,
    body: 0,
    overlay: 0,
    selection: 0,
  });
}
