import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextPalette, PALETTE_FADE, PALETTE_TOKENS, registerPaletteTokens, type Palette } from "./palette";

const css = readFileSync(new URL("./harbour-ui.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const block = (selector: string) => { const at = css.indexOf(`${selector} {`); return css.slice(at, css.indexOf("\n}", at) + 2); };
afterEach(() => { vi.unstubAllGlobals(); });

describe("the night bridge switch (O8-I1)", () => {
  it("turns night only above 0.55 and day only below 0.45, holding the current palette in between", () => {
    expect(nextPalette("day", 0.55)).toBe("day");
    expect(nextPalette("day", 0.551)).toBe("night");
    expect(nextPalette("night", 0.45)).toBe("night");
    expect(nextPalette("night", 0.449)).toBe("day");
    for (const night of [0.46, 0.5, 0.54]) {
      expect(nextPalette("day", night)).toBe("day");
      expect(nextPalette("night", night)).toBe("night");
    }
  });

  it("opens in the hour's palette: a first reading splits the band at 0.5", () => {
    expect(nextPalette(null, 0)).toBe("day");
    expect(nextPalette(null, 0.49)).toBe("day");
    expect(nextPalette(undefined, 0.5)).toBe("night");
    expect(nextPalette(null, 1)).toBe("night");
    expect(nextPalette(null, Number.NaN)).toBe("day");
  });

  it("flips once at dusk and once at dawn however the factor jitters about the threshold", () => {
    let palette: Palette = "day", flips = 0;
    for (let s = 0; s <= 400; s++) {
      const night = (s <= 200 ? s / 200 : (400 - s) / 200) + 0.04 * Math.sin(s * 2.7);
      const next = nextPalette(palette, night);
      if (next !== palette) flips++;
      palette = next;
    }
    expect(flips).toBe(2);
    expect(palette).toBe("day");
  });

  it("crossfades exactly the colours the night bridge redefines, over --t-palette, cut under reduced motion", () => {
    const night = [...block('.hb-ui[data-palette="night"]').matchAll(/--([\w-]+):\s*([^;]+);/g)]
      .filter(([, , value]) => !value.trim().startsWith("url(") && !/\dpx/.test(value)).map(([, name]) => name);
    expect([...PALETTE_TOKENS].sort()).toEqual(night.sort());
    expect(PALETTE_FADE.transitionProperty.split(", ")).toEqual(PALETTE_TOKENS.map((t) => `--${t}`));
    const root = block(".hb-ui");
    expect(root).toContain("transition-duration: var(--t-palette);");
    expect(root).toContain("transition-timing-function: ease-in-out;");
    expect(css).toContain(".hb-ui.hb-reduced { transition-duration: 0s; }");
  });

  it("registers each token as an inherited <color> so it can interpolate, and tolerates a second registration", () => {
    const seen = new Set<string>();
    const registerProperty = vi.fn((d: PropertyDefinition) => {
      if (seen.has(d.name)) throw new DOMException("already registered", "InvalidModificationError");
      seen.add(d.name);
    });
    vi.stubGlobal("CSS", { registerProperty });
    registerPaletteTokens();
    expect(() => registerPaletteTokens()).not.toThrow();
    expect(seen).toEqual(new Set(PALETTE_TOKENS.map((t) => `--${t}`)));
    expect(registerProperty).toHaveBeenCalledWith({ name: "--paper", syntax: "<color>", inherits: true, initialValue: "transparent" });
  });

  it("is a cut, not an error, where the API is missing", () => {
    vi.stubGlobal("CSS", undefined);
    expect(() => registerPaletteTokens()).not.toThrow();
    vi.stubGlobal("CSS", {});
    expect(() => registerPaletteTokens()).not.toThrow();
  });
});
