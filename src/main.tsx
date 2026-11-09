import { installClientErrorReporter, reportClientError } from "./error-reporter";
import { canViewportShowMap, isWidescreenViewport } from "./systems/viewport-gate";
import { dismissPoster, resetPosterState } from "./harbour/app/poster";

// Keep this entry React-free: even physical-screen-denied, zoomed-out windows must not preload the world.
installClientErrorReporter();
const root = document.getElementById("root")!;
// D20: the welcome is first-byte HTML beside the arrival; CSS size queries pick one for the first paint
// (arrival-shell.css), then data-pv-gate hands the choice to this gate, which adds the physical-screen half.
const page = document.getElementById("pv-welcome")!;
const arrival = root.innerHTML;
let admitted: boolean | undefined;
let generation = 0;
let unmount: (() => void) | undefined;
let leave: (() => void) | undefined;

function sync(): void {
  const screenCapable = !!window.screen && isWidescreenViewport(window.screen.width, window.screen.height);
  const next = screenCapable && canViewportShowMap(window.innerWidth, window.innerHeight);
  page.dataset.screenCapable = String(screenCapable);
  if (next === admitted) return;
  admitted = next;
  document.documentElement.dataset.pvGate = next ? "arrival" : "welcome";
  const ticket = ++generation;
  unmount?.();
  leave?.();
  unmount = leave = undefined;
  if (!next) {
    root.replaceChildren();
    dismissPoster("now");
    // The handoff and the window gauge load with the welcome alone (Q17), never with the world.
    void import("./welcome-handoff").then(({ startWelcome }) => {
      if (ticket === generation) leave = startWelcome(page);
    }, () => {});
    return;
  }
  resetPosterState();
  root.innerHTML = arrival;
  // Only JavaScript admission promises the harbour (D20): the first-byte card is finished without it.
  root.querySelector(".pv-arrival__stage")!.textContent = "Raising the harbour.";
  // Inert hints are activated only after BOTH shared predicates pass; React and world discovery overlap.
  for (const hint of document.querySelectorAll<HTMLLinkElement>("link[data-pv-preload]")) {
    hint.rel = hint.dataset.pvPreload!;
  }
  void import("./harbour/app/react-entry").then(({ mountApp }) => {
    if (ticket === generation && admitted) unmount = mountApp(root);
  }).catch((error: unknown) => {
    if (ticket !== generation || !admitted) return;
    const stage = root.querySelector(".pv-arrival__stage");
    if (stage) stage.textContent = "The harbour module could not load. Open Pharos analytics, or reload this page to retry.";
    reportClientError("render", { kind: "harbour-module-failure", message: String(error) }, "harbour-module-failure");
  });
}

const orientation = window.screen?.orientation;
orientation?.addEventListener?.("change", sync);
window.addEventListener("orientationchange", sync);
window.addEventListener("resize", sync);
sync();
export function disposeAdmission(): void {
  ++generation;
  orientation?.removeEventListener?.("change", sync);
  window.removeEventListener("orientationchange", sync);
  window.removeEventListener("resize", sync);
  unmount?.();
  leave?.();
}
import.meta.hot?.dispose(disposeAdmission);
