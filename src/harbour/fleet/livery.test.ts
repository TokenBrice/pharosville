import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DECK, DYE_MAX_SAT, linear, liveryFor, sailDye, TOPSIDE, TRIM } from "./livery";

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

describe("sailDye", () => {
  const lum = (c: [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  it("dyes in the brand hue", () => {
    const d = sailDye("#274a81");
    expect(d.mode).toBe(1);
    expect(d.rgb[2]).toBeGreaterThan(d.rgb[0]);
  });
  it("lifts near-black brands so the sails still read", () => {
    const d = sailDye("#0a0a0a");
    expect(d.mode).toBe(1);
    expect(lum(d.rgb)).toBeGreaterThan(lum(linear("#505050")));
  });
  const hslOf = (rgb: [number, number, number]) => {
    const o = { h: 0, s: 0, l: 0 };
    new THREE.Color(rgb[0], rgb[1], rgb[2]).getHSL(o, THREE.SRGBColorSpace);
    return o;
  };
  it("caps chroma at earth-pigment strength but keeps the brand hue", () => {
    for (const hex of ["#ff0000", "#00c853", "#2962ff", "#ff00ff", "#ffd600", "#26a17b", "#f7931a"]) {
      const src = { h: 0, s: 0, l: 0 };
      new THREE.Color(hex).getHSL(src, THREE.SRGBColorSpace);
      const d = hslOf(sailDye(hex).rgb);
      expect(d.s).toBeLessThanOrEqual(DYE_MAX_SAT + 0.01);
      const dh = Math.abs(d.h - src.h);
      expect(Math.min(dh, 1 - dh)).toBeLessThan(0.01);
    }
  });
  it("keeps adjacent brand hues apart (hue order survives the cap)", () => {
    const hues = [0, 30, 60, 120, 180, 210, 240, 270, 300].map((h) => {
      const c = new THREE.Color().setHSL(h / 360, 0.9, 0.5, THREE.SRGBColorSpace);
      return hslOf(sailDye(`#${c.getHexString(THREE.SRGBColorSpace)}`).rgb).h * 360;
    });
    for (let i = 1; i < hues.length; i++) expect(hues[i] - hues[i - 1]).toBeGreaterThan(20);
  });
  it("keeps canvas for near-white brands, with a deeper band colour", () => {
    const d = sailDye("#f4f4f2");
    expect(d.mode).toBe(2);
    expect(lum(d.rgb)).toBeLessThan(0.3);
  });
});
