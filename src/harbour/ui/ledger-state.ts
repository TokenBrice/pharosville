import type { Boat } from "../model/types";

export const LEDGER_TABS = ["Legend", "Coins", "Admission", "Chains", "Wrecks"] as const;
export type LedgerTab = (typeof LEDGER_TABS)[number];
export interface CoinFilters { offPeg: boolean; warning: boolean; missingPeg: boolean; peg: string; chain: string }
export interface LedgerView { query: string; sort: { key: string; dir: 1 | -1 }; scroll: number; row: string | null }
export interface LedgerContext { tab: LedgerTab; views: Record<LedgerTab, LedgerView>; filters: CoinFilters; returning: boolean }
export const clearCoinFilters = (): CoinFilters => ({ offPeg: false, warning: false, missingPeg: false, peg: "", chain: "" });
export function newLedgerContext(): LedgerContext {
  const view = (key: string, dir: 1 | -1 = -1): LedgerView => ({ query: "", sort: { key, dir }, scroll: 0, row: null });
  return { tab: "Legend", views: { Legend: view(""), Coins: view("supply"), Admission: view("phase"), Chains: view("supply"), Wrecks: view("date") }, filters: clearCoinFilters(), returning: false };
}
export function matchesCoinFilters(b: Boat, f: CoinFilters): boolean {
  return (!f.offPeg || b.activeDepeg) && (!f.warning || b.dews === "ALERT" || b.dews === "WARNING" || b.dews === "DANGER")
    && (!f.missingPeg || b.nullPeg) && (!f.peg || b.pegType === f.peg)
    && (!f.chain || b.chainShares.some((c) => c.chain === f.chain && c.usd > 0));
}
export const LEDGER_PANES_MIN_PX = 1106;
