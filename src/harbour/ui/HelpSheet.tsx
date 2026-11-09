import { useEffect, useRef, useSyncExternalStore } from "react";
import { Search, BookOpen, House, CircleHelp, Camera, ZoomIn, ZoomOut } from "lucide-react";
import { ACTIONS, type HarbourAction, useHarbourAction } from "./KeyList";
import { useStore, useUISlice } from "./hooks";
import { WatchStartButton } from "./WatchControls";

export function HelpSheet({ onClose, shortcuts, setShortcuts }: {
  onClose: () => void; shortcuts: boolean; setShortcuts: (enabled: boolean) => void;
}) {
  const store = useStore(), run = useHarbourAction();
  const selected = useUISlice((s) => s.selected);
  const still = useSyncExternalStore(store.motion.subscribe, () => store.motion.still);
  const reduced = useSyncExternalStore(store.motion.subscribe, () => store.motion.reduced);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const button = (id: HarbourAction, Icon?: typeof Search) => <button type="button" className="hb-control" key={id} onClick={() => run(id)}>
    {Icon && <Icon aria-hidden="true" strokeWidth={1.25} />}<span>{ACTIONS[id].label}</span>{ACTIONS[id].cap && <kbd aria-hidden="true">{ACTIONS[id].cap}</kbd>}
  </button>;
  return <section className="hb-help hb-paper hb-neat" role="dialog" aria-labelledby="hb-help-title"
    onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } }}>
    <header className="hb-panel-head"><h2 id="hb-help-title" className="hb-title" tabIndex={-1} ref={heading}>Help and controls</h2></header>
    <button type="button" className="hb-close" aria-label="Close" onClick={onClose}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
    </button>
    <div className="hb-help-body">
      <p>Explore at your pace.</p>
      <div className="hb-help-actions">{button("search", Search)}{button("ledger", BookOpen)}{button("home", House)}{button("reading", CircleHelp)}<WatchStartButton onStart={onClose} /></div>
      <details><summary>Explore further</summary>
        <div className="hb-help-actions">{button("postcard", Camera)}{button("previous")}{button("next")}
          {selected?.kind === "boat" && button("follow")}</div>
        <details><summary>View controls</summary><div className="hb-help-actions">
          {(["up", "down", "left", "right"] as const).map((id) => button(id))}
          {button("zoomIn", ZoomIn)}{button("zoomOut", ZoomOut)}
        </div></details>
      </details>
      <div className="hb-help-preferences">
        <label><input type="checkbox" checked={still} onChange={(e) => store.motion.setStill(e.currentTarget.checked)} /> Still world</label>
        {reduced && <p role="status">Motion is still. Readings continue to update.</p>}
        <label><input type="checkbox" checked={shortcuts} onChange={(e) => setShortcuts(e.currentTarget.checked)} /> Character shortcuts</label>
      </div>
    </div>
  </section>;
}
