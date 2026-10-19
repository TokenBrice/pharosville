import { installClientErrorReporter, reportClientError } from "./error-reporter";
import { installGoogleAnalytics } from "./google-analytics";
import { canViewportShowMap, isWidescreenViewport } from "./systems/viewport-gate";
import { dismissPoster, resetPosterState } from "./harbour/app/poster";

// Keep this entry React-free: even physical-screen-denied, zoomed-out windows must not preload the world.
installClientErrorReporter();
const root = document.getElementById("root")!;
const arrival = root.innerHTML;
let admitted: boolean | undefined;
let generation = 0;
let unmount: (() => void) | undefined;

function welcome(screenCapable: boolean): void {
  const template = document.getElementById("pv-welcome") as HTMLTemplateElement;
  root.replaceChildren(template.content.cloneNode(true));
  const size = root.querySelector("[data-pv-size]");
  if (size) {
    size.setAttribute("data-screen-capable", String(screenCapable));
    if (screenCapable) size.textContent = "Your device can show the living harbour. Give this window more room: ";
  }
  dismissPoster("now");
  // Two callbacks leave a paint opportunity for the useful welcome before analytics starts.
  requestAnimationFrame(() => requestAnimationFrame(() => { if (!admitted) installGoogleAnalytics(); }));
}

function sync(): void {
  const screenCapable = !!window.screen && isWidescreenViewport(window.screen.width, window.screen.height);
  const next = screenCapable && canViewportShowMap(window.innerWidth, window.innerHeight);
  if (next === admitted) {
    if (!next) {
      const size = root.querySelector("[data-pv-size]");
      if (size?.getAttribute("data-screen-capable") !== String(screenCapable)) welcome(screenCapable);
    }
    return;
  }
  admitted = next;
  const ticket = ++generation;
  unmount?.();
  unmount = undefined;
  if (!next) { welcome(screenCapable); return; }
  resetPosterState();
  root.innerHTML = arrival;
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
}
import.meta.hot?.dispose(disposeAdmission);
