/**
 * The first-paint illustration lives outside React. Keep its original markup for resize readmission;
 * every new world must start behind the same poster, even after a previous fade removed it.
 * This module is in the React-free entry: plain DOM only (the harbour chunk computes the fade, wake.ts arrivalFade).
 */
const FADE_MS = 1100;
/** E28: reduced motion crossfades in opacity only, over this long. */
const REDUCED_FADE_MS = 400;
/**
 * B1: a poster that settles well inside the window (registration scale under INSET_S: a portrait tablet's landing stands
 * much further out than the key art's camera) would show as a picture in a picture. It fades front-loaded instead (half
 * gone within 300 ms), and its mask lies on its own box with a feather that grows to min(40 %, 15 % / s) of the box
 * (arrival-shell.css --pv-feather), as soft on screen as landscape's. At INSET_S and above (landscape) the fade and the
 * mask stay E28's.
 */
const INSET_S = 0.85;
const INSET_FADE_MS = 900;
let original: HTMLElement | undefined;
let cancelFade: (() => void) | undefined;

/** A CSS transform in px about the poster box's top-left: translate(x, y) scale(s). */
export interface PosterRegistration { s: number; x: number; y: number }
export interface PosterFade {
  /** E28: lay the poster over the live first frame as it fades (wake.ts posterRegistration); none = a plain fade. */
  register?: PosterRegistration | null;
  /** E28: dim the day key art toward night as it fades, 0 none … 1 full night (brightness 0.4, saturation 0.6). */
  dip?: number;
  /** Opacity only, over 400 ms. */
  reduced?: boolean;
}

function rememberPoster(): HTMLElement | null {
  const poster = document.getElementById("pv-poster");
  if (poster && !original) original = poster.cloneNode(true) as HTMLElement;
  return poster;
}

export function dismissPoster(how: "crossfade" | "now", fade: PosterFade = {}): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const poster = rememberPoster();
  cancelFade?.();
  cancelFade = undefined;
  if (how === "now") {
    poster?.remove();
    return;
  }
  let fadeMs = fade.reduced ? REDUCED_FADE_MS : FADE_MS;
  if (poster) {
    const s = poster.style, r = fade.register, dip = Math.min(1, Math.max(0, fade.dip ?? 0));
    // reduced motion: opacity alone (no settle, no dip, and no feather drawing in: arrival-shell.css keeps the mask out
    // of the OS preference already; a reduction the CSS cannot see, such as a forced one, drops it too)
    if (fade.reduced) { s.transition = `opacity ${REDUCED_FADE_MS}ms linear`; s.maskImage = "none"; }
    else {
      // the settle, the dip and the feather (arrival-shell.css draws the mask in) run ahead of the fade, so the poster
      // lies over the world it shows, in its light and with soft edges, well before it is half gone
      const settle = "800ms cubic-bezier(.2,.7,.2,1)";
      if (r && r.s < INSET_S) {
        // B1: settling well inside the window, it is half gone by +300 ms. Its mask lies on its own box from the reveal
        // (no oversize left to draw in, which would cut the box edge hard while it shrinks into the window) and the
        // feather grows from nothing with the settle (arrival-shell.css pv-feather-in): at rest both looks are opaque
        fadeMs = INSET_FADE_MS;
        s.transition = `opacity ${INSET_FADE_MS}ms cubic-bezier(.2,.6,.4,1), transform ${settle}, filter ${settle}`;
        s.setProperty("--pv-feather", `${Math.min(40, 15 / r.s).toFixed(2)}%`);
        s.animation = `pv-feather-in ${settle} both`;
      } else s.transition = `opacity ${FADE_MS}ms cubic-bezier(.45,0,.75,1), transform ${settle}, filter ${settle}, mask-size ${settle}`;
      if (r) { s.transformOrigin = "0 0"; s.transform = `translate(${r.x.toFixed(2)}px,${r.y.toFixed(2)}px) scale(${r.s.toFixed(5)})`; }
      if (dip > 0.05) s.filter = `brightness(${(1 - 0.6 * dip).toFixed(3)}) saturate(${(1 - 0.4 * dip).toFixed(3)})`;
    }
  }
  root.setAttribute("data-pv-live", "");
  if (!poster) return;
  const done = () => {
    poster.remove();
    cleanup();
  };
  // the transform and filter end first: only the opacity fade's end removes the poster
  const onEnd = (e: Event) => { if (!("propertyName" in e) || (e as TransitionEvent).propertyName === "opacity") done(); };
  const cleanup = () => {
    clearTimeout(timer);
    poster.removeEventListener("transitionend", onEnd);
    cancelFade = undefined;
  };
  poster.addEventListener("transitionend", onEnd);
  const timer = setTimeout(done, fadeMs + 200);
  cancelFade = cleanup;
}

/** Back to the loading state (the world unmounted, e.g. the window shrank below the gate). */
export function resetPosterState(): void {
  if (typeof document === "undefined") return;
  document.documentElement.removeAttribute("data-pv-live");
  cancelFade?.();
  cancelFade = undefined;
  const poster = rememberPoster();
  if (poster) poster.removeAttribute("style"); // an interrupted fade's settle and dip
  else if (original) document.body.prepend(original.cloneNode(true));
}
