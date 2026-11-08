import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The Pilot's Chart contract (O8-I2): the overlay CSS sets every colour and every type size through tokens, and
 * the night bridge palette redefines every palette colour, so a palette flip re-inks every surface by tokens alone.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const ui = read("./harbour-ui.css");
const sound = read("../audio/sound-toggle.css");
const block = (selector: string) => { const at = ui.indexOf(`${selector} {`); return ui.slice(at, ui.indexOf("\n}", at) + 2); };
const day = block(".hb-ui"), night = block('.hb-ui[data-palette="night"]');
const tokens = (b: string) => new Map([...b.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const DAY = tokens(day), NIGHT = tokens(night);
const LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i;
/** Inks that belong to an object, not to the paper (initials and shading on a coin's colour, fallbacks, the veil). */
const FIXED = new Set(["--on-fill", "--shade", "--fill-chain", "--fill-yard", "--fill-wreck", "--veil"]);

function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe("Pilot's Chart tokens", () => {
  it("leaves no colour literal outside the two token blocks", () => {
    expect(ui.replace(day, "").replace(night, "")).not.toMatch(LITERAL);
    expect(sound).not.toMatch(LITERAL);
  });

  it("redefines every palette colour for the night bridge, and nothing else", () => {
    const palette = [...DAY].filter(([k, v]) => !FIXED.has(k) && !v.startsWith("var(") && (LITERAL.test(v) || v.startsWith("url(")));
    expect(palette.length).toBeGreaterThan(30);
    expect(palette.map(([k]) => k).filter((k) => !NIGHT.has(k))).toEqual([]);
    expect([...NIGHT.keys()].filter((k) => !DAY.has(k))).toEqual([]);
  });

  it("sets type only in the eight steps", () => {
    const steps = [...DAY].filter(([k]) => k.startsWith("--fs-")).map(([k, v]) => `${k.slice(5)} ${v}`);
    expect(steps).toEqual(["cap 11.5px", "note 13.5px", "small 14.5px", "body 16px", "lead 17.5px", "h3 21px", "title 30px", "title-long 26px", "display 38px"]);
    const sizes = [...ui.replace(day, "").matchAll(/font(?:-size)?:\s*([^;}]+)/g)].map((m) => m[1]).filter((v) => /\d(?:px|em|rem)\b/.test(v.replace(/var\([^)]*\)/g, "")));
    expect(sizes).toEqual([]);
  });

  it("keeps text inks at 4.5:1 and marks at 3:1 on the paper, by day and by night", () => {
    for (const set of [DAY, NIGHT]) {
      const paper = set.get("--paper")!;
      for (const ink of ["--ink", "--ink-2", "--ink-3", "--brass-ink", "--link", "--up", "--down", "--stale-ink"]) expect(contrast(set.get(ink)!, paper), ink).toBeGreaterThanOrEqual(4.5);
      for (const mark of ["--rule", "--focus", "--live", "--stale", "--unavail"]) expect(contrast(set.get(mark)!, paper), mark).toBeGreaterThanOrEqual(3);
    }
  });
});
