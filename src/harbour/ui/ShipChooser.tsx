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
    <p id="hb-ship-chooser-title">Choose a ship</p>
    {choices.slice(0, 5).map((hit) => {
      const boat = store.boat(hit.id);
      return <button key={hit.id} type="button" onClick={() => store.select(hit)}>{boat ? `${boat.symbol} · ${boat.name}` : hit.id}</button>;
    })}
    <button type="button" onClick={cancel}>Cancel</button>
  </dialog>;
}
