/**
 * The first-paint poster (index.html `#pv-poster`) lives outside the React root so it survives the
 * first render. It is dismissed once: crossfaded when the live harbour has drawn its first real
 * frame, or dropped at once when the viewport gate keeps the world unmounted.
 */
const FADE_MS = 1100;

export function dismissPoster(how: "crossfade" | "now"): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const poster = document.getElementById("pv-poster");
  if (how === "now") {
    poster?.remove();
    return;
  }
  root.setAttribute("data-pv-live", "");
  if (!poster) return;
  const done = () => poster.remove();
  poster.addEventListener("transitionend", done, { once: true });
  setTimeout(done, FADE_MS + 200);
}

/** Back to the loading state (the world unmounted, e.g. the window shrank below the gate). */
export function resetPosterState(): void {
  if (typeof document === "undefined") return;
  document.documentElement.removeAttribute("data-pv-live");
}
