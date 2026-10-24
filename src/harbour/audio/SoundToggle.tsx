import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { useStore } from "../ui/hooks";
import { getSoundController, type SoundMode } from "./controller";
import "./sound-toggle.css";

const MODES: ReadonlyArray<[SoundMode, string]> = [["off", "Sound off"], ["ambient", "Ambient sound"], ["music", "Ambient sound and music"]];
const SAY: Record<SoundMode, string> = { off: "off", ambient: "ambient sound", music: "ambient sound and music" };

/**
 * The speaker beside the wordmark: opt-in sound (D13), off by default, remembered per visitor. A small menu
 * (three states, D-7): off, the ambience, or the ambience with music. Drawn in the chart voice: a thin ink
 * speaker; sound waves when on, a hairline cross when off, a small note in place of the far wave when the music plays.
 */
export function SoundToggle() {
  const store = useStore();
  const ctl = useMemo(() => getSoundController(store.ctx), [store]);
  const mode = useSyncExternalStore(ctl.subscribe, () => ctl.mode, () => "off" as SoundMode);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
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
  // focus the checked item on open; close on a click elsewhere
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const away = (e: PointerEvent) => { if (!btn.current?.parentElement?.contains(e.target as Node)) setOpen(false); };
    addEventListener("pointerdown", away, { capture: true });
    return () => removeEventListener("pointerdown", away, { capture: true });
  }, [open]);

  const close = (refocus: boolean) => { setOpen(false); if (refocus) btn.current?.focus(); };
  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (k: number) => { e.preventDefault(); items[(k + items.length) % items.length]?.focus(); };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === "Tab") close(false);
  };

  return (
    <span className="hb-sound-wrap">
      <button
        ref={btn} type="button" className="hb-sound" data-mode={mode}
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? "hb-sound-menu" : undefined}
        aria-label={`Sound: ${SAY[mode]}. Choose sound.`} title={`Sound: ${SAY[mode]}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); } }}
      >
        <svg viewBox="0 0 20 16" width="20" height="16" aria-hidden="true">
          <path className="hb-sound-body" d="M2.5 5.6h2.8L9.2 2.3v11.4L5.3 10.4H2.5z" />
          <g className="hb-sound-waves">
            <path d="M12 5.3c.9.7 1.4 1.6 1.4 2.7s-.5 2-1.4 2.7" />
            <path d="M14.3 3.3c1.6 1.2 2.5 2.8 2.5 4.7s-.9 3.5-2.5 4.7" />
          </g>
          <path className="hb-sound-off" d="M12.4 5.6l4.6 4.8M17 5.6l-4.6 4.8" />
          <g className="hb-sound-note"><path d="M16.6 10V3.6c.9.3 1.6.9 1.9 1.8" /><ellipse cx="15.2" cy="10.2" rx="1.55" ry="1.15" transform="rotate(-20 15.2 10.2)" /></g>
        </svg>
      </button>
      {open && (
        <div ref={menu} id="hb-sound-menu" role="menu" aria-label="Sound" className="hb-sound-menu hb-paper hb-neat" onKeyDown={onMenuKey}>
          {MODES.map(([m, label]) => (
            <button
              key={m} type="button" role="menuitemradio" aria-checked={mode === m} tabIndex={mode === m ? 0 : -1}
              onClick={() => { ctl.setMode(m); close(true); }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
