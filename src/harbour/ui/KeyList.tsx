import { createContext, useContext } from "react";
import { useStore } from "./hooks";
import type { HarbourUIStore } from "./store";

/** One inventory for the strip, sheet and character shortcuts. */
export const ACTIONS = {
  search: { label: "Search", keys: ["/"], cap: "/" },
  ledger: { label: "Ledger and legend", keys: ["l"], cap: "L" },
  names: { label: "Names", keys: ["c"], cap: "C" },
  home: { label: "Home", keys: ["h", "Home"], cap: "H" },
  help: { label: "Help and controls", keys: ["?"], cap: "?" },
  reading: { label: "How to read the harbour", keys: [], cap: "" },
  watch: { label: "Start watch", keys: ["w"], cap: "W" },
  postcard: { label: "Postcard", keys: ["p"], cap: "P" },
  previous: { label: "Previous ship", keys: ["["], cap: "[" },
  next: { label: "Next ship", keys: ["]"], cap: "]" },
  follow: { label: "Follow ship", keys: ["f"], cap: "F" },
  up: { label: "Pan up", keys: ["ArrowUp"], cap: "↑" },
  down: { label: "Pan down", keys: ["ArrowDown"], cap: "↓" },
  left: { label: "Pan left", keys: ["ArrowLeft"], cap: "←" },
  right: { label: "Pan right", keys: ["ArrowRight"], cap: "→" },
  zoomIn: { label: "Zoom in", keys: ["+", "="], cap: "+" },
  zoomOut: { label: "Zoom out", keys: ["-", "_"], cap: "−" },
} satisfies Record<string, { label: string; keys: string[]; cap: string }>;
export type HarbourAction = keyof typeof ACTIONS;
export const ActionContext = createContext<((action: HarbourAction) => void) | null>(null);

export function performAction(store: HarbourUIStore, action: HarbourAction): void {
  const s = store.getSnapshot();
  if (action === "search") store.set({ searchOpen: true });
  else if (action === "ledger") store.set({ ledgerOpen: !s.ledgerOpen });
  else if (action === "reading") store.startGuide(); // D06: the five-stop guide, on demand only
  else if (action === "names") store.set({ chartMode: !s.chartMode });
  else if (action === "home") store.goHome();
  else if (action === "watch") store.toggleWatch();
  else if (action === "postcard") store.requestPostcard();
  else if (action === "previous" || action === "next") store.stepHull(action === "next" ? 1 : -1);
  else if (action === "follow") store.toggleFollow();
  else if (action === "zoomIn" || action === "zoomOut") store.keyZoom(action === "zoomIn" ? 1 : -1);
  else if (["up", "down", "left", "right"].includes(action)) {
    store.stopAutomation();
    const [x, z] = store.ctx.rig.dragToWorld(action === "left" ? 80 : action === "right" ? -80 : 0,
      action === "up" ? 80 : action === "down" ? -80 : 0, store.ctx.renderer.domElement.clientHeight || innerHeight);
    store.ctx.rig.pan(x, z);
  }
}

export function useHarbourAction() {
  const action = useContext(ActionContext), store = useStore();
  return action ?? ((id: HarbourAction) => performAction(store, id));
}

export function KeyList() {
  return <section className="hb-keylist" aria-label="Keyboard">
    <h3 className="hb-sc">Keyboard</h3>
    <dl>{Object.entries(ACTIONS).filter(([, a]) => a.cap).map(([id, a]) => <div key={id}><dt><kbd>{a.cap}</kbd></dt><dd>{a.label}</dd></div>)}
      <div><dt><kbd>Esc</kbd></dt><dd>Close, or let go</dd></div>
    </dl>
  </section>;
}
