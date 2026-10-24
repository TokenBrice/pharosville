import { describe, expect, it } from "vitest";
import { dewRime } from "./dew";

const AUTUMN = [0, 0, 1, 0], WINTER = [0, 0, 0, 1], SUMMER = [0, 1, 0, 0];

describe("W12 dew and rime: decorative mornings, never mist", () => {
  it("dew on spring/autumn dawns, burning off as the sun climbs; none in summer or by day", () => {
    expect(dewRime(AUTUMN, 0.05, 7.4, 7, 10, 0)[0]).toBeGreaterThan(0.6);
    expect(dewRime(AUTUMN, 0.5, 7.4, 7, 10, 0)[0]).toBe(0);
    expect(dewRime(AUTUMN, 0.05, 13, 7, 10, 0)[0]).toBe(0);
    expect(dewRime(SUMMER, 0.05, 6.2, 6, 20, 0)[0]).toBe(0);
    expect(dewRime(AUTUMN, 0.05, 7.4, 7, 10, 0.8)[0]).toBe(0);   // rain is not dew
  });

  it("rime on cold winter dawns, melted by 10:00, never when mild", () => {
    expect(dewRime(WINTER, 0.1, 8, 7.5, 1, 0)[1]).toBeGreaterThan(0.9);
    expect(dewRime(WINTER, 0.4, 10.5, 7.5, 1, 0)[1]).toBe(0);
    expect(dewRime(WINTER, 0.1, 8, 7.5, 6, 0)[1]).toBe(0);
    expect(dewRime(AUTUMN, 0.1, 8, 7.5, 1, 0)[1]).toBe(0);
  });
});
