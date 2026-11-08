import { useState } from "react";
import { useStore, useUISlice } from "./hooks";
import type { UIState } from "./store";

export type SlipMode = "watch" | "still" | "names";

/** The active modes, most recently turned on first: each keeps its place, a newly active one goes in front. */
export function slipOrder(prev: readonly SlipMode[], active: readonly SlipMode[]): SlipMode[] {
  return [...active.filter((m) => !prev.includes(m)), ...prev.filter((m) => active.includes(m))];
}

/**
 * The slip (O8-I7), the overlay's one toast: the on-state of a mode the visitor turned on (chart Names, C; Still
 * world; the harbourmaster's watch, W), with a caps label, one line and the way out. It stays while its mode is on;
 * one shows at a time, the latest; it sits bottom-centre of the free area (harbour-ui.css). It answers the visitor's
 * own actions only, never a market event (D11). Its announcement is the existing polite live line (App) or the Still
 * world checkbox itself, so the slip adds no second voice. The element stays mounted (hidden) so it can fade both ways.
 */
export function Slip() {
  const store = useStore();
  const names = useUISlice((s) => s.chartMode);
  const still = useUISlice((s) => !!s.still);
  const watch = useUISlice((s) => s.watch);
  const active: SlipMode[] = [];
  if (watch) active.push("watch");
  if (still) active.push("still");
  if (names) active.push("names");
  const [order, setOrder] = useState<SlipMode[]>([]);
  const next = slipOrder(order, active);
  if (next.join() !== order.join()) setOrder(next);
  // what the slip last said stays drawn while it fades out
  const top = next[0] ?? null;
  const [last, setLast] = useState<{ mode: SlipMode; watch: UIState["watch"] } | null>(null);
  if (top && (top !== last?.mode || (top === "watch" && watch !== last.watch))) setLast({ mode: top, watch });
  return (
    <div className="hb-slip hb-paper hb-fade" data-shown={!!top} data-mode={last?.mode}>
      {last?.mode === "watch" ? <>
        <span className="hb-sc">Harbourmaster’s watch</span>
        <span><b>{last.watch?.symbol}</b> {last.watch?.line}</span>
        <button type="button" onClick={() => store.stopWatch()} aria-label="Stop the watch (W)"><kbd>W</kbd>Stop</button>
      </> : last?.mode === "still" ? <>
        <span className="hb-sc">Still world</span>
        <span>Motion is still. Readings continue to update.</span>
        <button type="button" onClick={() => store.motion.setStill(false)}>Turn off</button>
      </> : last?.mode === "names" ? <>
        <span className="hb-sc">Names</span>
        <span>The chart is lettered: harbours, landmarks and the largest ships.</span>
        <button type="button" onClick={() => store.set({ chartMode: false })} aria-label="Hide chart names (C)"><kbd>C</kbd>Hide</button>
      </> : null}
    </div>
  );
}
