import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../App";

/** Imported only after the physical screen and current viewport both pass the gate. */
export function mountApp(container: HTMLElement): () => void {
  const root = createRoot(container);
  root.render(<StrictMode><App /></StrictMode>);
  return () => root.unmount();
}
