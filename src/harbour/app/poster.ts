/**
 * The first-paint illustration lives outside React. Keep its original markup for resize readmission;
 * every new world must start behind the same poster, even after a previous fade removed it.
 */
const FADE_MS = 1100;
let original: HTMLElement | undefined;
let cancelFade: (() => void) | undefined;

function rememberPoster(): HTMLElement | null {
  const poster = document.getElementById("pv-poster");
  if (poster && !original) original = poster.cloneNode(true) as HTMLElement;
  return poster;
}

/**
 * `scale` (crossfade only): the live camera starts pulled back (the harbour wakes, wake.ts), so the
 * poster shrinks to the same framing early in its fade, while it is still mostly opaque; by the time it
 * is half gone it lies over the world it shows.
 */
export function dismissPoster(how: "crossfade" | "now", scale = 1): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const poster = rememberPoster();
  cancelFade?.();
  cancelFade = undefined;
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
  const done = () => {
    poster.remove();
    cleanup();
  };
  // with the wake's scale the transform ends first: only the opacity fade's end removes the poster
  const onEnd = (e: TransitionEvent) => { if (scale === 1 || e.propertyName === "opacity") done(); };
  const cleanup = () => {
    clearTimeout(timer);
    poster.removeEventListener("transitionend", onEnd);
    cancelFade = undefined;
  };
  poster.addEventListener("transitionend", onEnd);
  const timer = setTimeout(done, FADE_MS + 200);
  cancelFade = cleanup;
}

/** Back to the loading state (the world unmounted, e.g. the window shrank below the gate). */
export function resetPosterState(): void {
  if (typeof document === "undefined") return;
  document.documentElement.removeAttribute("data-pv-live");
  cancelFade?.();
  cancelFade = undefined;
  const poster = rememberPoster();
  if (!poster && original) document.body.prepend(original.cloneNode(true));
}
