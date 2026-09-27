// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { acquireGardenNoisePack } from "./garden-noise-pack";

describe("garden noise pack", () => {
  it("shares one texture across leases and frees it only with the last one", () => {
    const first = acquireGardenNoisePack(() => {});
    const second = acquireGardenNoisePack(() => {});
    if (!first || !second) throw new Error("Expected the pack to load under a DOM");
    const dispose = vi.spyOn(first.texture, "dispose");

    // Two consumers, one GPU texture against the census.
    expect(second.texture).toBe(first.texture);

    // Another consumer letting go must not pull the texture out from under
    // the one still sampling it; a repeated release is not a second owner.
    first.release();
    first.release();
    expect(dispose).not.toHaveBeenCalled();

    second.release();
    expect(dispose).toHaveBeenCalledOnce();

    // A later consumer gets a live texture, not the disposed one.
    const third = acquireGardenNoisePack(() => {});
    expect(third?.texture).not.toBe(first.texture);
    third?.release();
  });
});
