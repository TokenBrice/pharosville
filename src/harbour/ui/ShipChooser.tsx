import { useEffect, useRef } from "react";
import { useStore } from "./hooks";
import type { PickHit } from "./services";
import "./camera-controls.css";

export function ShipChooser({ choices }: { choices: PickHit[] }) {
  const store = useStore(), dialog = useRef<HTMLDialogElement>(null);
  const cancel = () => store.set({ shipChoices: [] });
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="hb-ship-chooser hb-paper hb-neat" aria-labelledby="hb-ship-chooser-title"
    onCancel={(e) => { e.preventDefault(); cancel(); }} onClose={cancel}>
    <p id="hb-ship-chooser-title" className="hb-sec-h hb-sc">Choose a ship</p>
    <ul className="hb-list">{choices.slice(0, 5).map((hit) => {
      const boat = store.boat(hit.id);
      return <li key={hit.id}><button type="button" className="hb-row" onClick={() => store.select(hit)}>{boat ? `${boat.symbol} · ${boat.name}` : hit.id}</button></li>;
    })}</ul>
    <button type="button" className="hb-control" onClick={cancel}>Cancel</button>
  </dialog>;
}
