import { createRoot } from "react-dom/client";
import type { Engine } from "../engine/engine";
import { HarbourUI } from "./App";
import { StoreContext } from "./hooks";
import { HarbourUIStore } from "./store";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { OverlayFailure } from "./OverlayFailure";
import "./harbour-ui.css";

/** Mount the overlay UI above the canvas. Call after engine.init() so the services exist. */
export function mountHarbourUI(engine: Engine, el: HTMLElement): () => void {
  const store = new HarbourUIStore(engine);
  if (import.meta.env.DEV) (window as unknown as { __harbourUI?: HarbourUIStore }).__harbourUI = store;
  const root = createRoot(el);
  root.render(<StoreContext.Provider value={store}><SectionErrorBoundary name="harbour-controls" fallback={(retry, attempts) => <div className="hb-ui"><OverlayFailure scope="controls" retry={retry} attempts={attempts} /></div>}><HarbourUI /></SectionErrorBoundary></StoreContext.Provider>);
  return () => { root.unmount(); store.dispose(); };
}
