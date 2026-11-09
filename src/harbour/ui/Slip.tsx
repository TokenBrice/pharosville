import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { StagedMoment } from "../model/event-hub";
import { dayBookLine } from "../model/events";
import { useStore, useUISlice } from "./hooks";
import { PLACE_NAME } from "./places";
import type { PickHit } from "./services";
import type { HarbourUIStore } from "./store";

export type SlipMode = "still" | "names";

/** What each mode's slip says, and its way out. */
const SLIPS: Record<SlipMode, { label: string; line?: string; act: string; key?: string; name?: string }> = {
  still: { label: "Still world", line: "Motion is still. Readings continue to update.", act: "Turn off" },
  names: { label: "Names", line: "The chart is lettered: harbours, landmarks and the largest ships.", act: "Hide", key: "C", name: "Hide chart names (C)" },
};

/** The staged moment's subject, for Look: its ship, the landmark that stages it, or none. */
export function momentSubject(store: HarbourUIStore, m: StagedMoment): { hit: PickHit; name: string } | null {
  const e = m.event;
  const place = (id: string) => ({ hit: { kind: "landmark" as const, id }, name: PLACE_NAME[id] ?? id });
  if (e.kind === "psi-band") return place("pharos");
  if (e.kind === "dews-band") return place("storm-mast");
  if (e.kind === "flow-hour") return place(e.field.startsWith("burn") ? "burn" : "mint");
  if (e.kind === "death") return place("wreck-cove");
  const boat = e.coinId ? store.getSnapshot().model?.boats.find((b) => b.id === e.coinId && b.state !== "wrecked") : undefined;
  return boat ? { hit: { kind: "boat", id: boat.id }, name: boat.symbol } : null;
}

/** The Day book's own sentence for a moment (DayBook.tsx prints the same words after its time). */
export const momentLine = (m: StagedMoment): string => dayBookLine(m.event, "").trim();

/** The moment being staged now (the events service, model/event-hub.ts), or null. */
function useMoment(store: HarbourUIStore): StagedMoment | null {
  useUISlice((s) => s.tick); // a service may arrive after the overlay: the 1 Hz tick picks it up
  const ev = (store.ctx as HarbourUIStore["ctx"] | undefined)?.services.get("events"); // test doubles may carry no engine
  const subscribe = useCallback((fn: () => void) => ev?.subscribe(fn) ?? (() => {}), [ev]);
  return useSyncExternalStore(subscribe, () => ev?.current ?? null);
}

/**
 * The slip (O8-I7), the overlay's one toast, bottom-centre of the free area (harbour-ui.css), one at a time:
 *  - a staged moment (O7-I4): for its ≤ 20 s, the Day book's own sentence and a Look button that brings an off-screen
 *    subject into view on request. Never an alarm: only confirmed changes the rarity budget stages (≤ 1 per 3 min),
 *    none under reduced motion, and it never moves the camera on its own;
 *  - the on-state of a mode the visitor turned on (chart Names, C; Still world), with a caps label, one line and the
 *    way out, while that mode is on, the more consequential first (Still world stops the world, Names only letters it).
 * None while the watch's own controls show (WatchControls, D14: Previous / Next / Inspect / Stop watch). The slip is
 * not a live region: a moment is announced once on the overlay's polite live line (App), Names and the watch keep
 * their own announcements and Still world its checkbox, so it adds no second voice. The element stays mounted
 * (hidden) so it can fade both ways.
 */
export function Slip() {
  const store = useStore();
  const names = useUISlice((s) => s.chartMode);
  const still = useUISlice((s) => !!s.still);
  const watch = useUISlice((s) => s.watch);
  const moment = useMoment(store);
  const linkNotice = useUISlice((s) => s.linkNotice);
  const top: SlipMode | "moment" | null = watch ? null : moment ? "moment" : still ? "still" : names ? "names" : null;
  // what the slip last said stays drawn while it fades out
  const [last, setLast] = useState<SlipMode | "moment" | null>(null);
  const [shownMoment, setShownMoment] = useState<StagedMoment | null>(null);
  if (top && top !== last) setLast(top);
  if (moment && moment !== shownMoment) setShownMoment(moment);
  useEffect(() => {
    if (moment && !watch) store.set({ announce: `Day book: ${momentLine(moment)}` });
  }, [store, moment, watch]);
  if (linkNotice) return <div className="hb-slip hb-paper" role="status" aria-live="polite" data-shown="true" data-mode="link">{linkNotice}</div>;
  if (last === "moment" && shownMoment) {
    const subject = momentSubject(store, shownMoment);
    return (
      <div className="hb-slip hb-paper hb-fade" data-shown={!!top} data-mode="moment">
        <span className="hb-sc">Day book</span>
        <span>{shownMoment.event.dev ? <em>{momentLine(shownMoment)}</em> : momentLine(shownMoment)}</span>
        {subject && <button type="button" onClick={() => store.look(subject.hit)} aria-label={`Look at ${subject.name}`}>Look</button>}
      </div>
    );
  }
  const s = last && last !== "moment" ? SLIPS[last] : null;
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
