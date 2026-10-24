import { describe, expect, it } from "vitest";
import { kindle, WAKE_PULLBACK } from "./wake";

describe("the harbour wakes", () => {
  it("kindles the fire from dark to exactly its live value", () => {
    expect(kindle(0)).toBe(0);
    expect(kindle(0.3)).toBe(0);
    expect(kindle(1.6)).toBeGreaterThan(0.3);
    expect(kindle(2.9)).toBe(1);
    expect(kindle(60)).toBe(1);
  });
  it("starts only a little further out", () => expect(WAKE_PULLBACK).toBeLessThanOrEqual(0.14));
});
