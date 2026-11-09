import { useState } from "react";
import { useStore, useUISlice } from "./hooks";

export type SlipMode = "still" | "names";

/** What each mode's slip says, and its way out. */
const SLIPS: Record<SlipMode, { label: string; line?: string; act: string; key?: string; name?: string }> = {
  still: { label: "Still world", line: "Motion is still. Readings continue to update.", act: "Turn off" },
  names: { label: "Names", line: "The chart is lettered: harbours, landmarks and the largest ships.", act: "Hide", key: "C", name: "Hide chart names (C)" },
};

/**
 * The slip (O8-I7), the overlay's one toast: the on-state of a mode the visitor turned on (chart Names, C; Still
 * world), with a caps label, one line and the way out. It stays while its mode is on; one shows at a time, the more
 * consequential first (Still world stops the world, Names only letters it), and none while the watch's own controls
 * show; it sits bottom-centre of the free area (harbour-ui.css). It answers the visitor's
 * own actions only, never a market event (D11). Its announcement is the existing polite live line (App) or the Still
 * world checkbox itself, so the slip adds no second voice. The element stays mounted (hidden) so it can fade both ways.
 */
export function Slip() {
  const store = useStore();
  const names = useUISlice((s) => s.chartMode);
  const still = useUISlice((s) => !!s.still);
  const watch = useUISlice((s) => s.watch);
  // The watch has its own controls (WatchControls, D14: Previous / Next / Inspect / Stop watch) in the same place:
  // while it runs no slip shows, so one bottom-centre element speaks at a time.
  const top: SlipMode | null = watch ? null : still ? "still" : names ? "names" : null;
  // what the slip last said stays drawn while it fades out
  const [last, setLast] = useState<SlipMode | null>(null);
  if (top && top !== last) setLast(top);
  const s = last ? SLIPS[last] : null;
  const off = () => last === "still" ? store.motion.setStill(false) : store.set({ chartMode: false });
  return (
    <div className="hb-slip hb-paper hb-fade" data-shown={!!top} data-mode={last ?? undefined}>
      {last && s && <>
        <span className="hb-sc">{s.label}</span>
        <span>{s.line}</span>
        <button type="button" onClick={off} aria-label={s.name}>{s.key && <kbd>{s.key}</kbd>}{s.act}</button>
      </>}
    </div>
  );
}
