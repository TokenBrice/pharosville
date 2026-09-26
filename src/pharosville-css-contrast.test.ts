import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Text roles are AA (≥ 4.5:1) against the surface they sit on in each phase.
// The night phase once re-pointed a shared token under card links and section
// titles (1.23:1) and left the controls at 3.4–4.4:1; this reads the shipped
// stylesheet, resolves the tokens the browser would, and measures the pairs.

const css = readFileSync(new URL("./pharosville.css", import.meta.url), "utf8");

// Chrome over the scene is a translucent water backing; measure it composited
// over a mid-grey scene, far brighter than any night frame behind the chrome.
const SCENE_BEHIND_CHROME = "#808080";

type Rgba = { rgb: [number, number, number]; alpha: number };

function block(pattern: RegExp): string {
  const match = css.match(pattern);
  if (!match?.[1]) throw new Error(`missing CSS block ${pattern}`);
  return match[1];
}

function declarations(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [, name, value] of body.matchAll(/^\s*(--[\w-]+|background|color|outline):\s*([^;]+);/gm)) {
    out.set(name!, value!.trim());
  }
  return out;
}

const dayTokens = declarations(block(/^:root \{([\s\S]*?)^\}/m));
const nightTokens = new Map([
  ...dayTokens,
  ...declarations(block(/^:root\[data-phase="night"\] \{([\s\S]*?)^\}/m)),
]);

function resolve(value: string, tokens: ReadonlyMap<string, string>): Rgba {
  const trimmed = value.trim();
  if (trimmed === "transparent") return { rgb: [0, 0, 0], alpha: 0 };
  const hex = trimmed.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    return {
      rgb: [0, 2, 4].map((index) => Number.parseInt(hex[1]!.slice(index, index + 2), 16)) as [number, number, number],
      alpha: 1,
    };
  }
  const reference = trimmed.match(/^var\((--[\w-]+)\)$/);
  if (reference) {
    const token = tokens.get(reference[1]!);
    if (!token) throw new Error(`unresolved token ${reference[1]}`);
    return resolve(token, tokens);
  }
  const mix = trimmed.match(/^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%,\s*(.+)\)$/);
  if (mix) {
    const weight = Number(mix[2]) / 100;
    const a = resolve(mix[1]!, tokens);
    const b = resolve(mix[3]!, tokens);
    const alpha = a.alpha * weight + b.alpha * (1 - weight);
    // Premultiplied sRGB interpolation, as CSS Color 5 specifies.
    const rgb = a.rgb.map((channel, index) => (
      alpha === 0 ? 0 : (channel * a.alpha * weight + b.rgb[index]! * b.alpha * (1 - weight)) / alpha
    )) as [number, number, number];
    return { rgb, alpha };
  }
  throw new Error(`unsupported colour ${trimmed}`);
}

function over(top: Rgba, bottom: Rgba): Rgba {
  return {
    rgb: top.rgb.map((channel, index) => channel * top.alpha + bottom.rgb[index]! * (1 - top.alpha)) as [number, number, number],
    alpha: 1,
  };
}

function luminance({ rgb }: Rgba): number {
  const [r, g, b] = rgb.map((channel) => {
    const scaled = channel / 255;
    return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: Rgba, background: Rgba): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

function ruleValue(pattern: RegExp, property: string): string {
  const value = declarations(block(pattern)).get(property);
  if (!value) throw new Error(`missing ${property} in ${pattern}`);
  return value;
}

const surfaces = {
  day: {
    tokens: dayTokens,
    card: ruleValue(/^\.pharosville-detail-panel \{([\s\S]*?)^\}/m, "background"),
  },
  night: {
    tokens: nightTokens,
    card: ruleValue(/^:root\[data-phase="night"\] \.pharosville-detail-panel \{([\s\S]*?)^\}/m, "background"),
  },
};
const CONTROLS = /^\.pharosville-world-controls__affordance,[^{]*\{([\s\S]*?)^\}/m;
const CAPTION = /^\.pharosville-now-caption \{([\s\S]*?)^\}/m;

describe("pharosville.css text roles", () => {
  for (const [phase, { tokens, card }] of Object.entries(surfaces)) {
    it(`keeps ${phase} card links, focus ring and section titles at AA`, () => {
      const paper = resolve(card, tokens);
      const painted = {
        link: ruleValue(/^\.pv-panel-link \{([\s\S]*?)^\}/m, "color"),
        "section title": ruleValue(/^\.pv-section-title \{([\s\S]*?)^\}/m, "color"),
        "link focus ring": ruleValue(/^\.pv-panel-link:focus-visible \{([\s\S]*?)^\}/m, "outline").replace(/^\S+\s+solid\s+/, ""),
      };
      for (const [name, colour] of Object.entries(painted)) {
        expect(contrast(resolve(colour, tokens), paper), `${phase} ${name}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`keeps ${phase} caption, controls and key cap at AA over the scene`, () => {
      const scene = resolve(SCENE_BEHIND_CHROME, tokens);
      const controls = over(resolve(ruleValue(CONTROLS, "background"), tokens), scene);
      const caption = over(resolve(ruleValue(CAPTION, "background"), tokens), scene);
      const pairs: Array<[string, string, Rgba]> = [
        ["controls", ruleValue(CONTROLS, "color"), controls],
        ["key cap", ruleValue(/^\.pharosville-world-controls kbd \{([\s\S]*?)^\}/m, "color"), controls],
        ["caption", ruleValue(CAPTION, "color"), caption],
      ];
      for (const [name, colour, backing] of pairs) {
        expect(contrast(resolve(colour, tokens), backing), `${phase} ${name}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
