// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dismissPoster, resetPosterState } from "./poster";

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="pv-poster" aria-hidden="true"><img alt="" src="/poster.avif"></div>';
  resetPosterState();
});
afterEach(() => { resetPosterState(); vi.useRealTimers(); });

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
