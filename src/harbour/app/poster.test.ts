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
    dismissPoster("crossfade", { register: { s: 0.84, x: 120.5, y: -33.25 }, dip: 1 });
    expect(poster.style.transformOrigin).toBe("0 0");
    expect(poster.style.transform).toBe("translate(120.50px,-33.25px) scale(0.84000)");
    expect(poster.style.filter).toBe("brightness(0.400) saturate(0.600)");
    // the settle and the dip run ahead of the 1.1 s fade, so the poster lies over its own world before it is half gone
    expect(poster.style.transition).toMatch(/opacity 1100ms/);
    expect(poster.style.transition).toMatch(/transform 800ms/);
    expect(poster.style.transition).toMatch(/filter 800ms/);
    expect(poster.style.transition).toMatch(/mask-size 800ms/);
    // only the opacity's end removes it: the shorter transform and filter ends do not cut the fade short
    poster.dispatchEvent(transitionEnd("transform"));
    poster.dispatchEvent(transitionEnd("filter"));
    expect(document.getElementById("pv-poster")).not.toBeNull();
    poster.dispatchEvent(transitionEnd("opacity"));
    expect(document.getElementById("pv-poster")).toBeNull();
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
