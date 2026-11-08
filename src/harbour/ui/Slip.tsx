import { useState } from "react";
import { useStore, useUISlice } from "./hooks";
import type { UIState } from "./store";

export type SlipMode = "watch" | "still" | "names";

/** What each mode's slip says, and its way out (the watch's line is its current subject). */
const SLIPS: Record<SlipMode, { label: string; line?: string; act: string; key?: string; name?: string }> = {
  watch: { label: "Harbourmaster’s watch", act: "Stop", key: "W", name: "Stop the watch (W)" },
  still: { label: "Still world", line: "Motion is still. Readings continue to update.", act: "Turn off" },
  names: { label: "Names", line: "The chart is lettered: harbours, landmarks and the largest ships.", act: "Hide", key: "C", name: "Hide chart names (C)" },
};

/**
 * The slip (O8-I7), the overlay's one toast: the on-state of a mode the visitor turned on (chart Names, C; Still
 * world; the harbourmaster's watch, W), with a caps label, one line and the way out. It stays while its mode is on;
 * one shows at a time, the most consequential (the watch moves the camera, Still world stops the world, Names only
 * letters it); it sits bottom-centre of the free area (harbour-ui.css). It answers the visitor's
 * own actions only, never a market event (D11). Its announcement is the existing polite live line (App) or the Still
 * world checkbox itself, so the slip adds no second voice. The element stays mounted (hidden) so it can fade both ways.
 */
export function Slip() {
  const store = useStore();
  const names = useUISlice((s) => s.chartMode);
  const still = useUISlice((s) => !!s.still);
  const watch = useUISlice((s) => s.watch);
  const top: SlipMode | null = watch ? "watch" : still ? "still" : names ? "names" : null;
  // what the slip last said stays drawn while it fades out
  const [last, setLast] = useState<{ mode: SlipMode; watch: UIState["watch"] } | null>(null);
  if (top && (top !== last?.mode || (top === "watch" && watch !== last.watch))) setLast({ mode: top, watch });
  const s = last ? SLIPS[last.mode] : null;
  const off = () => last?.mode === "watch" ? store.stopWatch() : last?.mode === "still" ? store.motion.setStill(false) : store.set({ chartMode: false });
  return (
    <div className="hb-slip hb-paper hb-fade" data-shown={!!top} data-mode={last?.mode}>
      {last && s && <>
        <span className="hb-sc">{s.label}</span>
        <span>{last.mode === "watch" ? <><b>{last.watch?.symbol}</b> {last.watch?.line}</> : s.line}</span>
        <button type="button" onClick={off} aria-label={s.name}>{s.key && <kbd>{s.key}</kbd>}{s.act}</button>
      </>}
    </div>
  );
}
