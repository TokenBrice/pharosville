import { SoundToggle } from "../audio/SoundToggle";
import { presentationCopy, usePresentation } from "./presentation";
import { truthState } from "./bits";
import { useUISlice } from "./hooks";
import { useFeedHealth } from "./feed-health";
import { ACTIONS, useHarbourAction } from "./KeyList";


/**
 * The only persistent chrome (D11): wordmark + one live dot. Hover or keyboard focus opens the state
 * word and the key strip, whose keys are real buttons (search, ledger, chart, home); on touch the strip
 * stays open (harbour-ui.css). Whenever the reading is not plainly live the state word stays out at rest
 * (O8-I7), and the mark's shape says the state too (a dot live, a ring-and-bar stale, a ring unavailable).
 */
export function CornerMark() {
  const action = useHarbourAction();
  const model = useUISlice((s) => s.model);
  const ledgerOpen = useUISlice((s) => s.ledgerOpen);
  const chartMode = useUISlice((s) => s.chartMode);
  const display = presentationCopy(usePresentation());
  const t = truthState(model);
  const health = useFeedHealth();
  const live = t.word === "live" && !display && !health;


  return (
    <div className="hb-mark hb-paper" data-live={live}>
      <button
        type="button"
        className="hb-mark-btn"
        aria-label={`PharosVille — ${t.detail} ${display} ${health} Open the ledger.`}
        aria-expanded={ledgerOpen}
        onClick={() => action("ledger")}
      >
        <span className="hb-mark-word">Pharos<i>Ville</i></span>
        <span className="hb-dot" data-state={t.state} aria-hidden="true" />
      </button>
      <span className="hb-mark-more">
        <div>
          <span className="hb-mark-state" role="status" data-state={t.state} title={`${t.detail} ${display}`}>{t.word} {display} {health}</span>
          <span className="hb-keys">
            {(["search", "ledger", "names", "home"] as const).map((id) => <button key={id} type="button" onClick={() => action(id)} aria-label={ACTIONS[id].label}
              aria-expanded={id === "ledger" ? ledgerOpen : undefined} aria-pressed={id === "names" ? chartMode : undefined}>
              <kbd aria-hidden="true">{ACTIONS[id].cap}</kbd>{id === "ledger" ? "Ledger" : ACTIONS[id].label}
            </button>)}
            <button type="button" onClick={() => action("help")}><span aria-hidden="true">⋯ </span>Help and controls</button>
          </span>
        </div>
      </span>
      <SoundToggle />
    </div>
  );
}
