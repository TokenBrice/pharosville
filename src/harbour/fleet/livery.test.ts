import { describe, expect, it } from "vitest";
import { DECK, linear, liveryFor, TOPSIDE, TRIM } from "./livery";

const ids = Array.from({ length: 400 }, (_, i) => `coin-${i}`);

describe("liveryFor", () => {
  it("is deterministic per coin and valid", () => {
    for (const id of ids.slice(0, 50)) {
      const a = liveryFor(id, "usd"), b = liveryFor(id, "usd");
      expect(a).toEqual(b);
      expect(TOPSIDE[a.topside]).toBeDefined();
      expect(TRIM[a.stripe]).toBeDefined();
      expect(DECK[a.deck]).toBeDefined();
      if (a.roof) expect(TRIM[a.roof]).toBeDefined();
    }
  });

  it("spreads the usd fleet across the paint pot (a fan of colour, not one dominant paint)", () => {
    const n = new Map<string, number>();
    for (const id of ids) { const k = liveryFor(id, "usd").topside; n.set(k, (n.get(k) ?? 0) + 1); }
    expect(n.size).toBe(Object.keys(TOPSIDE).length);
    for (const c of n.values()) expect(c / ids.length).toBeLessThan(0.25);
  });

  it("keeps gold hulls dark and never paints a stripe the topside's own colour", () => {
    for (const id of ids) {
      expect(["tar", "oxblood", "navy", "forest"]).toContain(liveryFor(id, "gold").topside);
      const l = liveryFor(id, "fiat");
      expect(l.stripe).not.toBe(l.topside);
    }
  });

  it("falls back to the usd pot for an unknown family", () => {
    expect(liveryFor("x", "martian")).toEqual(liveryFor("x", "usd"));
  });
});

describe("linear", () => {
  it("decodes sRGB hex", () => {
    expect(linear("#FFFFFF")).toEqual([1, 1, 1]);
    expect(linear("#000000")).toEqual([0, 0, 0]);
    expect(linear("#808080")[0]).toBeCloseTo(0.2159, 3);
  });
});
