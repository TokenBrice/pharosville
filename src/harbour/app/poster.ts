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

export function dismissPoster(how: "crossfade" | "now"): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const poster = rememberPoster();
  cancelFade?.();
  cancelFade = undefined;
  if (how === "now") {
    poster?.remove();
    return;
  }
  root.setAttribute("data-pv-live", "");
  if (!poster) return;
  const done = () => {
    poster.remove();
    cleanup();
  };
  const cleanup = () => {
    clearTimeout(timer);
    poster.removeEventListener("transitionend", done);
    cancelFade = undefined;
  };
  poster.addEventListener("transitionend", done, { once: true });
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
