/**
 * The harbourmaster's watch (12-M7b, opt-in `W`, D-5) and the idle breath (12-M7a). Pure logic, unit-tested.
 *
 * Watch subjects are ranked from named model fields, at most one per reason, in this order:
 *  - mover: the largest absolute 24 h supply change (|supply − Σ circulatingPrevDay|), at least WATCH_MOVER_MIN_USD;
 *  - depeg: the worst current depeg (activeDepeg, largest |pegDeviationBps|);
 *  - launch: the largest coin new to the register this week (Σ circulatingPrevWeek = 0, supply > 0).
 * The watch is never started by idleness; the idle breath never travels.
 */
import { money } from "./format";

export const WATCH_MOVER_MIN_USD = 1e6;
/** Dwell at each subject (s) once the glide has landed. */
export const WATCH_DWELL_S = 20;

export interface WatchCoin { id: string; symbol: string; supply: number; activeDepeg: boolean; pegDeviationBps: number | null; prevDay: number | null; prevWeek: number | null }
export interface WatchStop { id: string; reason: "mover" | "depeg" | "launch"; line: string }

export function rankWatch(coins: readonly WatchCoin[]): WatchStop[] {
  const out: WatchStop[] = [];
  const taken = new Set<string>();
  const add = (c: WatchCoin | undefined, reason: WatchStop["reason"], line: string) => { if (c && !taken.has(c.id)) { taken.add(c.id); out.push({ id: c.id, reason, line }); } };

  let mover: WatchCoin | undefined, dMax = WATCH_MOVER_MIN_USD;
  for (const c of coins) {
    if (c.prevDay == null || c.prevDay <= 0) continue;
    const d = Math.abs(c.supply - c.prevDay);
    if (d >= dMax) { dMax = d; mover = c; }
  }
  if (mover && mover.prevDay != null) add(mover, "mover", `biggest supply change in 24 h (${money(mover.supply - mover.prevDay, { signed: true })})`);

  let depeg: WatchCoin | undefined, bMax = -1;
  for (const c of coins) {
    if (!c.activeDepeg || c.pegDeviationBps == null) continue;
    const b = Math.abs(c.pegDeviationBps);
    if (b > bMax) { bMax = b; depeg = c; }
  }
  if (depeg) add(depeg, "depeg", `worst depeg now (${Math.round(depeg.pegDeviationBps ?? 0)} bps off peg)`);

  let launch: WatchCoin | undefined;
  for (const c of coins) if (c.prevWeek === 0 && c.supply > 0 && (!launch || c.supply > launch.supply)) launch = c;
  if (launch) add(launch, "launch", "new to the register this week");
  return out;
}

/** Idle breath: starts after this much stillness (s), one breath per period (s), ±3 % distance. */
export const IDLE_AFTER_S = 180;
export const BREATH_PERIOD_S = 90;
export const BREATH_K = 0.03;
/** Ground drift amplitude of the breath (m): a few metres round home. */
const BREATH_M = 4;

/** The breath offset after `idleS` seconds without input. Zero before IDLE_AFTER_S; eases in over 20 s. */
export function idleBreath(idleS: number, out: { k: number; dx: number; dz: number }): typeof out {
  const t = idleS - IDLE_AFTER_S;
  if (t <= 0) { out.k = out.dx = out.dz = 0; return out; }
  const ramp = Math.min(1, t / 20), e = ramp * ramp * (3 - 2 * ramp);
  const w = (2 * Math.PI * t) / BREATH_PERIOD_S;
  out.k = BREATH_K * Math.sin(w) * e;
  out.dx = BREATH_M * Math.sin(w * 0.5) * e;
  out.dz = BREATH_M * 0.6 * Math.sin(w * 0.5 + 1.3) * e;
  return out;
}
