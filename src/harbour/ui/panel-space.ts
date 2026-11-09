import { useEffect, useRef } from "react";
import { useStore } from "./hooks";

/** Registration joins the store's batched overlay measurement pass. */
export function usePanelSpace(kind: "panel" | "ledger" | "mark", visible: boolean) {
  const store = useStore();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!visible || !ref.current) return;
    return store.measurePanel?.(kind, ref.current);
  }, [kind, store, visible]);
  return ref;
}
