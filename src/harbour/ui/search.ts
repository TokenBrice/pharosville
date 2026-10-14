/** Fuzzy search over coins, harbours (chains) and landmarks. Pure; the ranking favours what a reader means by a ticker. */

export interface Searchable { id: string; symbol: string; name: string; supply: number }

function subsequenceScore(q: string, s: string): number {
  // every query char in order; reward contiguous runs and word starts, penalise gaps
  let si = 0, score = 0, run = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi];
    let found = -1;
    for (let k = si; k < s.length; k++) if (s[k] === c) { found = k; break; }
    if (found < 0) return -1;
    const gap = found - si;
    run = gap === 0 && qi > 0 ? run + 1 : 0;
    const wordStart = found === 0 || /[\s\-_.()]/.test(s[found - 1]);
    score += 4 + run * 3 + (wordStart ? 6 : 0) - Math.min(gap, 6);
    si = found + 1;
  }
  return score;
}

/** Scores ≥ STRONG are exact, prefix or word-start matches; anything weaker is only offered when nothing strong is. */
export const STRONG = 600;

export function scoreCoin(query: string, c: Searchable): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const sym = c.symbol.toLowerCase(), name = c.name.toLowerCase();
  if (sym === q) return 1000;
  if (name === q) return 950;
  // coarse tiers; within a tier the bigger hull wins (searchCoins breaks ties by supply)
  if (sym.startsWith(q)) return 800;
  if (name.startsWith(q)) return 700;
  if (name.split(/[\s\-_.()]+/).some((w) => w.startsWith(q))) return 600;
  if (sym.includes(q)) return 500;
  // a fragment inside a word ("tron" in "electronic") is noise unless the query is long and specific
  if (q.length >= 5 && name.includes(q)) return 400;
  const a = subsequenceScore(q, sym), b = subsequenceScore(q, name);
  const best = Math.max(a, b);
  return best > 0 && best >= q.length * 5 ? 100 + Math.min(best, 250) : -1;
}

/**
 * Top `limit` matches, best first; ties broken by supply (the bigger hull is the likelier target).
 * When anything matches strongly (exact, prefix, word start), the weak tail is dropped.
 */
export function searchCoins<T extends Searchable>(query: string, coins: readonly T[], limit = 8): T[] {
  const q = query.trim();
  if (!q) return [];
  const scored: Array<[number, T]> = [];
  let top = 0;
  for (const c of coins) {
    const s = scoreCoin(q, c);
    if (s > 0) { scored.push([s, c]); top = Math.max(top, s); }
  }
  const floor = top >= STRONG ? 500 : 0;
  return scored.filter(([s]) => s >= floor)
    .sort((x, y) => y[0] - x[0] || y[1].supply - x[1].supply)
    .slice(0, limit).map(([, c]) => c);
}
