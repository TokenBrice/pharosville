import { truthState } from "./bits";
import { useStore, useUISlice } from "./hooks";

/** The only persistent chrome (D11): wordmark + one live dot. Hover/focus reveals the state word and the keys. */
export function CornerMark() {
  const store = useStore();
  const model = useUISlice((s) => s.model);
  const ledgerOpen = useUISlice((s) => s.ledgerOpen);
  const t = truthState(model);
  return (
    <button
      type="button"
      className="hb-mark hb-paper"
      aria-label={`PharosVille — data ${t.word}. Open the ledger.`}
      aria-expanded={ledgerOpen}
      onClick={() => store.set({ ledgerOpen: !ledgerOpen })}
    >
      <span className="hb-mark-word">Pharos<i>Ville</i></span>
      <span className="hb-dot" data-state={t.state} aria-hidden="true" />
      <span className="hb-mark-more" aria-hidden="true">
        <div>
          <span className="hb-mark-state">{t.word}</span>
          <span className="hb-keys"><span><kbd>/</kbd>search</span><span><kbd>L</kbd>ledger</span><span><kbd>C</kbd>chart</span></span>
        </div>
      </span>
    </button>
  );
}
