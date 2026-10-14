import { useEffect, useState } from "react";
import { SoundToggle } from "../audio/SoundToggle";
import { truthState } from "./bits";
import { usePresence, useStore, useUISlice } from "./hooks";

const INTRO_KEY = "harbour.intro.seen";

/**
 * The one-time orientation caption: once per browser, a few seconds after the fleet arrives. Never in
 * automated captures (navigator.webdriver) unless forced with `?intro=1`; `?intro=0` suppresses it.
 */
function wantsIntro(): boolean {
  const forced = new URLSearchParams(location.search).get("intro");
  if (forced === "1") return true;
  if (forced === "0" || navigator.webdriver) return false;
  try { return !localStorage.getItem(INTRO_KEY); } catch { return false; }
}

/**
 * The only persistent chrome (D11): wordmark + one live dot. Hover or keyboard focus opens the state
 * word and the key strip, whose keys are real buttons (search, ledger, chart, home).
 */
export function CornerMark() {
  const store = useStore();
  const model = useUISlice((s) => s.model);
  const ledgerOpen = useUISlice((s) => s.ledgerOpen);
  const chartMode = useUISlice((s) => s.chartMode);
  const t = truthState(model);
  const ready = !!model?.hasFleet;

  const [want] = useState(wantsIntro);
  const [intro, setIntro] = useState<"waiting" | "on" | "done">("waiting");
  useEffect(() => {
    if (!ready || !want || intro !== "waiting") return;
    const id = setTimeout(() => setIntro("on"), 1400);
    return () => clearTimeout(id);
  }, [ready, want, intro]);
  useEffect(() => {
    if (intro !== "on") return;
    try { localStorage.setItem(INTRO_KEY, "1"); } catch { /* private window: it simply shows again */ }
    const id = setTimeout(() => setIntro("done"), 7000);
    return () => clearTimeout(id);
  }, [intro]);
  const [introMounted, introShown] = usePresence(intro === "on", 600);

  return (
    <div className="hb-mark hb-paper" data-intro={intro === "on"}>
      <button
        type="button"
        className="hb-mark-btn"
        aria-label={`PharosVille — data ${t.word}. Open the ledger.`}
        aria-expanded={ledgerOpen}
        onClick={() => store.set({ ledgerOpen: !ledgerOpen })}
      >
        <span className="hb-mark-word">Pharos<i>Ville</i></span>
        <span className="hb-dot" data-state={t.state} aria-hidden="true" />
      </button>
      <span className="hb-mark-more">
        <div>
          <span className="hb-mark-state" aria-hidden="true">{t.word}</span>
          <span className="hb-keys">
            <button type="button" onClick={() => store.set({ searchOpen: true })} aria-label="Search (/)"><kbd>/</kbd>search</button>
            <button type="button" onClick={() => store.set({ ledgerOpen: !ledgerOpen })} aria-label="Ledger and legend (L)" aria-expanded={ledgerOpen}><kbd>L</kbd>ledger</button>
            <button type="button" onClick={() => store.set({ chartMode: !chartMode })} aria-label="Chart names (C)" aria-pressed={chartMode}><kbd>C</kbd>chart</button>
            <button type="button" onClick={() => store.goHome()} aria-label="Back to the harbour view (H)"><kbd>H</kbd>home</button>
          </span>
        </div>
      </span>
      <SoundToggle />
      {introMounted && (
        <div className="hb-intro hb-paper hb-neat hb-fade" data-shown={introShown} role="status">
          <b>Every boat here is a stablecoin.</b>
          <span>It sails between the chains that hold it; the lighthouse, the sea and the sky are the market’s health.</span>
          <span className="hb-intro-keys">Hover anything · <kbd>L</kbd> the legend · <kbd>/</kbd> find a coin</span>
        </div>
      )}
    </div>
  );
}
