// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dismissPoster, resetPosterState } from "./poster";

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="pv-poster" aria-hidden="true"><img alt="" src="/poster.avif"></div>';
  resetPosterState();
});
afterEach(() => { resetPosterState(); vi.useRealTimers(); });

const transitionEnd = (property: string) => Object.assign(new Event("transitionend"), { propertyName: property });

describe("poster fade ownership", () => {
  it("retains the existing 1100 ms fade plus 200 ms removal fallback", () => {
    dismissPoster("crossfade");
    expect(document.documentElement.hasAttribute("data-pv-live")).toBe(true);
    vi.advanceTimersByTime(1299);
    expect(document.getElementById("pv-poster")).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(document.getElementById("pv-poster")).toBeNull();
  });

  it("removes the poster on the actual transition end, including the existing reduced-motion path", () => {
    const poster = document.getElementById("pv-poster")!;
    dismissPoster("crossfade");
    poster.dispatchEvent(new Event("transitionend"));
    expect(document.getElementById("pv-poster")).toBeNull();
    resetPosterState();
    vi.advanceTimersByTime(1300);
    expect(document.getElementById("pv-poster")).not.toBeNull();
  });

  it("cancels an in-flight old fade before readmission reuses the illustration", () => {
    const poster = document.getElementById("pv-poster")!;
    dismissPoster("crossfade");
    vi.advanceTimersByTime(600);
    resetPosterState();
    expect(document.documentElement.hasAttribute("data-pv-live")).toBe(false);
    poster.dispatchEvent(new Event("transitionend"));
    vi.advanceTimersByTime(1300);
    expect(document.getElementById("pv-poster")).toBe(poster);
  });

  it("restores the original illustration after removal and gives the next fade its own deadline", () => {
    dismissPoster("now");
    expect(document.getElementById("pv-poster")).toBeNull();
    resetPosterState();
    expect(document.querySelector("#pv-poster img")?.getAttribute("src")).toBe("/poster.avif");
    expect(document.documentElement.hasAttribute("data-pv-live")).toBe(false);
    dismissPoster("crossfade");
    vi.advanceTimersByTime(1299);
    expect(document.getElementById("pv-poster")).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(document.getElementById("pv-poster")).toBeNull();
  });
});

describe("E28 the seamless arrival", () => {
  it("settles the poster onto the live first frame (registered) and dims day key art toward night with its fade", () => {
    const poster = document.getElementById("pv-poster")!;
    // the landscape landing's registration (1600×1000: s 0.922)
    dismissPoster("crossfade", { register: { s: 0.92184, x: 120.5, y: -33.25 }, dip: 1 });
    expect(poster.style.transformOrigin).toBe("0 0");
    expect(poster.style.transform).toBe("translate(120.50px,-33.25px) scale(0.92184)");
    expect(poster.style.filter).toBe("brightness(0.400) saturate(0.600)");
    // the settle and the dip run ahead of the 1.1 s fade, so the poster lies over its own world before it is half gone
    expect(poster.style.transition).toMatch(/opacity 1100ms/);
    expect(poster.style.transition).toMatch(/transform 800ms/);
    expect(poster.style.transition).toMatch(/filter 800ms/);
    expect(poster.style.transition).toMatch(/mask-size 800ms/);
    // landscape keeps E28's feather (arrival-shell.css: 15 % a side)
    expect(poster.style.transition).not.toMatch(/--pv-feather/);
    expect(poster.style.getPropertyValue("--pv-feather")).toBe("");
    // only the opacity's end removes it: the shorter transform and filter ends do not cut the fade short
    poster.dispatchEvent(transitionEnd("transform"));
    poster.dispatchEvent(transitionEnd("filter"));
    expect(document.getElementById("pv-poster")).not.toBeNull();
    poster.dispatchEvent(transitionEnd("opacity"));
    expect(document.getElementById("pv-poster")).toBeNull();
  });

  it("B1: a poster settling well inside the window fades front-loaded and widens its feather to min(40 %, 15 % / s)", () => {
    const poster = document.getElementById("pv-poster")!;
    // the portrait tablet's registration (834×1112 touch: s 0.562): the 15 % feather would be ≈ 40–75 px on screen
    dismissPoster("crossfade", { register: { s: 0.56233, x: 84.26, y: 222.35 } });
    expect(poster.style.transform).toBe("translate(84.26px,222.35px) scale(0.56233)");
    expect(poster.style.getPropertyValue("--pv-feather")).toBe("26.67%"); // 15 % / s: 125 px a side on screen
    expect(poster.style.transition).toMatch(/opacity 900ms cubic-bezier\(\.2, ?\.6, ?\.4, ?1\)/);
    expect(poster.style.transition).toMatch(/transform 800ms/);
    // the mask lies on its box at once (no oversize drawing in to cut the box edge) and the feather grows with the settle
    expect(poster.style.transition).not.toMatch(/mask-size|--pv-feather/);
    expect(poster.style.animation).toMatch(/pv-feather-in 800ms/);
    // the opacity's own end removes it; the fallback follows the shorter fade
    vi.advanceTimersByTime(1099);
    expect(document.getElementById("pv-poster")).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(document.getElementById("pv-poster")).toBeNull();
    resetPosterState();
    // the feather never passes 40 % (a very small registration), and readmission clears it with the settle
    const again = document.getElementById("pv-poster")!;
    dismissPoster("crossfade", { register: { s: 0.3, x: 0, y: 0 } });
    expect(again.style.getPropertyValue("--pv-feather")).toBe("40.00%");
    resetPosterState();
    expect(again.getAttribute("style")).toBeNull();
    // the threshold: at 0.85 and above (landscape) nothing changes
    dismissPoster("crossfade", { register: { s: 0.85, x: 0, y: 0 } });
    expect(again.style.transition).toMatch(/opacity 1100ms/);
    expect(again.style.getPropertyValue("--pv-feather")).toBe("");
  });

  it("scales the dip with the live night share and adds no filter by day or for the night key art", () => {
    const poster = document.getElementById("pv-poster")!;
    dismissPoster("crossfade", { dip: 0.5 });
    expect(poster.style.filter).toBe("brightness(0.700) saturate(0.800)");
    resetPosterState();
    expect(poster.getAttribute("style")).toBeNull();
    dismissPoster("crossfade", { dip: 0.02, register: null });
    expect(poster.style.filter).toBe("");
    expect(poster.style.transform).toBe("");
  });

  it("under reduced motion crossfades in opacity only, over 400 ms", () => {
    const poster = document.getElementById("pv-poster")!;
    dismissPoster("crossfade", { reduced: true, register: { s: 0.5, x: 10, y: 10 }, dip: 1 });
    expect(poster.style.transition).toBe("opacity 400ms linear");
    expect(poster.style.maskImage).toBe("none");
    expect(poster.style.transform).toBe("");
    expect(poster.style.filter).toBe("");
    vi.advanceTimersByTime(599);
    expect(document.getElementById("pv-poster")).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(document.getElementById("pv-poster")).toBeNull();
  });

  it("returns an interrupted settle to the resting poster on readmission", () => {
    const poster = document.getElementById("pv-poster")!;
    dismissPoster("crossfade", { register: { s: 0.9, x: 4, y: 5 }, dip: 1 });
    vi.advanceTimersByTime(300);
    resetPosterState();
    expect(document.getElementById("pv-poster")).toBe(poster);
    expect(poster.getAttribute("style")).toBeNull();
  });
});
