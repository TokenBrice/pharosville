import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useStore } from "../ui/hooks";
import { getSoundController } from "./controller";
import "./sound-toggle.css";

/**
 * The speaker beside the wordmark: opt-in ambient sound (D13), off by default, remembered per visitor.
 * Drawn in the chart voice: a thin ink speaker; sound waves when on, a short hairline stroke through it when off.
 */
export function SoundToggle() {
  const store = useStore();
  const ctl = useMemo(() => getSoundController(store.ctx), [store]);
  const on = useSyncExternalStore(ctl.subscribe, () => ctl.on, () => false);
  // the chart table's foley: a panel opened / closed / turned to another place, the ledger opened / closed
  // (watched here, so no UI file carries a sound hook; cue() is a no-op unless the sound is playing)
  useEffect(() => {
    let prev = store.getSnapshot();
    return store.subscribe(() => {
      const s = store.getSnapshot(), p = prev;
      prev = s;
      if (s.selected !== p.selected) ctl.cue(!p.selected ? "open" : !s.selected ? "close" : "page");
      if (s.ledgerOpen !== p.ledgerOpen) ctl.cue(s.ledgerOpen ? "page" : "close");
    });
  }, [store, ctl]);
  const label = on ? "Ambient sound: on. Turn it off." : "Ambient sound: off. Turn it on.";
  return (
    <button type="button" className="hb-sound" aria-pressed={on} aria-label={label} title={on ? "Sound on" : "Sound off"} onClick={() => ctl.toggle()}>
      <svg viewBox="0 0 20 16" width="20" height="16" aria-hidden="true">
        <path className="hb-sound-body" d="M2.5 5.6h2.8L9.2 2.3v11.4L5.3 10.4H2.5z" />
        <g className="hb-sound-waves">
          <path d="M12 5.3c.9.7 1.4 1.6 1.4 2.7s-.5 2-1.4 2.7" />
          <path d="M14.3 3.3c1.6 1.2 2.5 2.8 2.5 4.7s-.9 3.5-2.5 4.7" />
        </g>
        <path className="hb-sound-off" d="M12.4 5.6l4.6 4.8M17 5.6l-4.6 4.8" />
      </svg>
    </button>
  );
}
