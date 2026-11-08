import { useEffect, useRef } from "react";

export function OverlayFailure({ scope, retry, attempts, close }: {
  scope: "details" | "controls"; retry: () => void; attempts: number; close?: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  return <section className="hb-panel hb-paper hb-neat" data-shown="true" aria-labelledby={`hb-${scope}-failure`}>
    <header className="hb-panel-head"><h2 id={`hb-${scope}-failure`} className="hb-title" aria-live="polite" tabIndex={-1} ref={heading}>
      {scope === "details" ? "These details could not load. The harbour is still available." : "The harbour controls could not load."}
    </h2></header>
    <div className="hb-panel-body">
      {scope === "controls" && <p><button type="button" className="hb-textbtn" onClick={retry}>Retry controls</button></p>}
      {close && <p><button type="button" className="hb-textbtn" onClick={close}>Close</button></p>}
      {(scope === "details" || attempts > 0) && <p><button type="button" className="hb-textbtn" onClick={() => location.reload()}>Reload page</button></p>}
    </div>
  </section>;
}
