import { useEffect, useRef } from "react";

/** Native modality also excludes controls inside closed disclosures. */
export function useModalDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    dialog?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    return () => {
      dialog?.close();
      const target = trigger?.isConnected && trigger !== document.body
        ? trigger : document.querySelector<HTMLElement>('[data-testid="pharosville-world"]');
      target?.focus({ preventScroll: true });
    };
  }, []);
  return ref;
}
