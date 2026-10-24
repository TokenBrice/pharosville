/**
 * The first-paint poster (index.html `#pv-poster`) lives outside the React root so it survives the
 * first render. It is dismissed once: crossfaded when the live harbour has drawn its first real
 * frame, or dropped at once when the viewport gate keeps the world unmounted.
 */
const FADE_MS = 1100;

/**
 * `scale` (crossfade only): the live camera starts pulled back (the harbour wakes, wake.ts), so the
 * poster shrinks to the same framing early in its fade, while it is still mostly opaque; by the time it
 * is half gone it lies over the world it shows.
 */
export function dismissPoster(how: "crossfade" | "now", scale = 1): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const poster = document.getElementById("pv-poster");
  if (how === "now") {
    poster?.remove();
    return;
  }
  if (poster && scale !== 1) {
    poster.style.transition = `opacity ${FADE_MS}ms cubic-bezier(.45,0,.75,1), transform 800ms cubic-bezier(.2,.7,.2,1)`;
    poster.style.transform = `scale(${scale})`;
  }
  root.setAttribute("data-pv-live", "");
  if (!poster) return;
  const done = () => poster.remove();
  poster.addEventListener("transitionend", (e) => { if (e.propertyName === "opacity") done(); });
  setTimeout(done, FADE_MS + 200);
}

/** Back to the loading state (the world unmounted, e.g. the window shrank below the gate). */
export function resetPosterState(): void {
  if (typeof document === "undefined") return;
  document.documentElement.removeAttribute("data-pv-live");
}
