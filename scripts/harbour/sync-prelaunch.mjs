/**
 * THE SHIPYARD'S ORDER BOOK (P6 D20, unified into `npm run sync:pharos-watch`): the pharos-watch registry's pre-launch
 * coins → src/harbour/data/prelaunch.json. A library step of scripts/harbour/sync-pharos-watch.mjs (pure: no I/O).
 *
 * Milestones keep date / type / title only (the descriptions are long-form and live on pharos.watch/upcoming).
 * The registry carries no issuer field: `issuer` is the jurisdiction's country when stated (the UI may show it as such).
 * `logo` comes from the already-synced data/logos.json, `brandColor` from data/brand-colors.json ("light|dark" pairs:
 * the first is the brand colour on a light ground).
 */
export const SOURCE_LABEL = "pharos-watch shared/data/stablecoins/coins.generated.json (status: pre-launch)";
const PHASES = new Set(["announced", "testnet", "auditing", "beta", "launching-soon"]);
/** YYYY, YYYY-MM, YYYY-MM-DD, or a quarter / half: 2026-Q4, 2027-H1. */
const DATE = /^\d{4}(-(\d{2}(-\d{2})?|Q[1-4]|H[12]))?$/;

/**
 * @param {unknown} rows the registry (coins.generated.json)
 * @param {Record<string, string>} logos data/logos.json after the logo step
 * @param {Record<string, string>} brand data/brand-colors.json after the colour step
 * @returns {{ book: object, problems: string[] }} the book, and every schema violation found on the way
 */
export function buildPrelaunchBook(rows, logos, brand) {
  const problems = [];
  const all = Array.isArray(rows) ? rows : rows && typeof rows === "object" ? Object.values(rows) : null;
  if (!all) return { book: null, problems: ["coins.generated.json is neither an array nor an object"] };
  const pre = all.filter((r) => r && r.status === "pre-launch");
  const seen = new Set();
  const coins = [];
  for (const r of [...pre].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (typeof r.id !== "string" || !r.id) { problems.push(`pre-launch row without an id: ${JSON.stringify(r).slice(0, 80)}`); continue; }
    if (seen.has(r.id)) problems.push(`pre-launch id ${r.id} appears twice`);
    seen.add(r.id);
    if (r.launchPhase != null && !PHASES.has(r.launchPhase)) problems.push(`${r.id}: unknown launchPhase ${JSON.stringify(r.launchPhase)}`);
    for (const k of ["expectedLaunchDate", "announcedDate"]) {
      if (r[k] != null && !(typeof r[k] === "string" && DATE.test(r[k]))) problems.push(`${r.id}: ${k} ${JSON.stringify(r[k])} is not YYYY[-MM[-DD] | -Qn | -Hn]`);
    }
    const peg = r.flags?.pegCurrency ?? null;
    if (peg !== null && typeof peg !== "string") problems.push(`${r.id}: flags.pegCurrency is not a string`);
    const milestones = (Array.isArray(r.milestones) ? r.milestones : [])
      .filter((m) => m && typeof m.date === "string" && typeof m.title === "string")
      .map((m) => ({ date: m.date, type: m.type ?? "milestone", title: m.title }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const logo = typeof logos[r.id] === "string" ? logos[r.id] : null;
    coins.push({
      id: r.id,
      name: r.name ?? r.symbol ?? r.id,
      symbol: r.symbol ?? r.id,
      pegCurrency: peg,
      pegType: peg ? `pegged${peg}` : "",
      launchPhase: PHASES.has(r.launchPhase) ? r.launchPhase : null,
      launchPhaseDetail: typeof r.launchPhaseDetail === "string" ? r.launchPhaseDetail : null,
      expectedLaunchDate: r.expectedLaunchDate ?? null,
      announcedDate: r.announcedDate ?? null,
      milestones,
      issuer: r.jurisdiction?.country ?? null,
      logo,
      brandColor: typeof brand[r.id] === "string" && /^#[0-9a-f]{6}/i.test(brand[r.id]) ? brand[r.id].slice(0, 7).toLowerCase() : null,
      llamaId: r.llamaId != null ? String(r.llamaId) : null,
      geckoId: r.geckoId ?? null,
    });
  }
  const phases = {};
  for (const c of coins) phases[c.launchPhase ?? "null"] = (phases[c.launchPhase ?? "null"] ?? 0) + 1;
  return { book: { source: SOURCE_LABEL, count: coins.length, phases, coins }, problems };
}
