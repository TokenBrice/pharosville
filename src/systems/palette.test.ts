import { describe, expect, it } from "vitest";
import { RISK_WATER_AREAS } from "./risk-water-areas";
import { DEWS_AREA_LABEL_COLORS, HARBOR_PALETTE, ZONE_THEMES, zoneThemeForTerrain } from "./palette";
import { SHIP_WATER_ZONES } from "./world-types";

describe("HARBOR_PALETTE", () => {
  it("keeps valid hex colors for Three materials", () => {
    for (const color of Object.values(HARBOR_PALETTE)) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  // Warm-village pass (2026-09-05). Vermilion remains the one sacred accent,
  // while the raised quiet-field ceiling lets authored roofs, land, and sea
  // carry enough dye to separate warm ground from cool water.
  //
  // The ceiling is perceptual chroma, NOT HSL saturation, and the difference
  // matters: HSL S is a ratio against available lightness, so it runs away on
  // dark colours — authentic kachi-iro (#181b39) measures HSL S 41 % while
  // being about as quiet as a colour gets. Judged that way the whole night sea
  // would look like a violation and grading it "down" would only turn indigo
  // into mud.
  const RESERVED_ACCENTS = new Set([
    "vermillion", // shu-akane — the sacred accent (beacon flame, DANGER)
    "lantern_warm", // yamabuki gold — lantern warmth, and hex-pinned by the guard script
    "lantern_glow", // the same lamp, one stop up
    "sail_red", // issuer identity, exempt by the restraint contract
    "bloodmoon_red", // rare-event accent
  ]);

  it("keeps every non-accent token under the dentō-shoku chroma ceiling", () => {
    // The warm-village decision raises the perceptual dye allowance from 0.10
    // to 0.14; the reserved accents stay exempt and unchanged.
    const CEILING = 0.14;
    for (const [token, hex] of Object.entries(HARBOR_PALETTE)) {
      if (RESERVED_ACCENTS.has(token)) continue;
      expect(oklchChroma(hex), `${token} (${hex}) must stay within the authored ceiling`).toBeLessThan(CEILING);
    }
  });

  it("keeps the reserved and issuer-identity hex anchors unchanged", () => {
    // These exact pins are the boundary of the re-grade: warmth may increase
    // around them, but identity cloth and the sacred accents do not move.
    expect(HARBOR_PALETTE.lantern_warm).toBe("#d49a3e");
    expect(HARBOR_PALETTE.vermillion).toBe("#c23a22");
    expect(HARBOR_PALETTE.sail_teal).toBe("#3a5e5a");
    expect(HARBOR_PALETTE.sail_red).toBe("#9a3a2e");
  });

  it("leaves vermilion the loudest thing in the palette", () => {
    // Exclusivity is the point of a reserved accent. If anything ever ties it,
    // it is no longer reserved.
    const vermillion = oklchChroma(HARBOR_PALETTE.vermillion);
    for (const [token, hex] of Object.entries(HARBOR_PALETTE)) {
      if (token === "vermillion" || token === "bloodmoon_red") continue;
      expect(oklchChroma(hex), `${token} must not out-shout vermilion`).toBeLessThan(vermillion);
    }
  });

  it("keeps the overlay-badge colors distinguishable after the re-grade", () => {
    // `garden-ships.ts` encodes the NAV / YIELD overlay badge in hue alone
    // (lantern_cold vs aurora_green vs #c9675c). Moving aurora_green from
    // verdigris to grass raised its chroma; this checks that the re-grade still
    // keeps the three hue-only badge states distinct.
    const nav = oklchHue(HARBOR_PALETTE.lantern_cold);
    const yields = oklchHue(HARBOR_PALETTE.aurora_green);
    const other = oklchHue("#c9675c");
    for (const [a, b, label] of [[nav, yields, "nav/yield"], [yields, other, "yield/other"], [nav, other, "nav/other"]] as const) {
      expect(hueDistance(a, b), label).toBeGreaterThan(45);
    }
  });
});

describe("ZONE_THEMES", () => {
  it("keeps distinct risk-water bases and analytical accents", () => {
    expect(ZONE_THEMES["calm-water"]!.label.accent).toBe(DEWS_AREA_LABEL_COLORS.CALM);
    expect(ZONE_THEMES["storm-water"]!.label.accent).toBe(DEWS_AREA_LABEL_COLORS.DANGER);
    expect(new Set(Object.values(ZONE_THEMES).map((theme) => theme.base)).size)
      .toBe(Object.keys(ZONE_THEMES).length);
  });

  it("ramps risk-water bases down a monotonic value ladder", () => {
    // L3 (Sea Master): the water shader luminance-matches each tint against the
    // live water before mixing it — that is what stops a tint reading as paint,
    // and it throws most of a hue's own brightness away. VALUE is what survives
    // the match, so value is what has to carry the escalation, hue-blind or not.
    //
    // This replaces two pinned hex literals. Those pinned the wrong thing: they
    // held `calm-water` at #125e7e, a saturated cyan-blue laid over the 43% of
    // the sea that is Calm, which pulled the rendered sea away from the
    // authored cool-teal descent.
    const ladder = ["calm-water", "watch-water", "alert-water", "warning-water", "storm-water"] as const;
    const levels = ladder.map((terrain) => relativeLuminance(ZONE_THEMES[terrain]!.base));
    for (let step = 1; step < levels.length; step += 1) {
      expect(levels[step]!, `${ladder[step]} must be darker than ${ladder[step - 1]}`)
        .toBeLessThan(levels[step - 1]!);
    }
  });

  it("walks calm to danger toward cooler blue-teal while descending in value", () => {
    // Warm-village re-grade: hue now helps distinguish the analytical water
    // family without replacing its existing monotonic value encoding.
    const ladder = ["calm-water", "watch-water", "alert-water", "warning-water", "storm-water"] as const;
    const hues = ladder.map((terrain) => oklchHue(ZONE_THEMES[terrain]!.base));
    for (let step = 1; step < hues.length; step += 1) {
      expect(hues[step]!, `${ladder[step]} must be bluer than ${ladder[step - 1]}`)
        .toBeGreaterThan(hues[step - 1]!);
    }
    expect(hues[0]).toBeGreaterThanOrEqual(190);
    expect(hues.at(-1)).toBeLessThanOrEqual(245);
  });

  it("keeps every risk-water base inside the sea's own blue-green family", () => {
    // A tint outside the water gamut reads as paint on a surface however gently
    // it is laid on. Ledger is the one deliberate outsider: NAV-priced water is
    // not a risk band, and its slate says so.
    for (const [terrain, theme] of Object.entries(ZONE_THEMES)) {
      if (terrain === "ledger-water") continue;
      const { r, g, b } = channels(theme.base);
      expect(g, `${terrain} must not be red-dominant`).toBeGreaterThanOrEqual(r);
      expect(Math.max(g, b), `${terrain} must lean blue-green`).toBeGreaterThanOrEqual(r);
    }
  });

  it("falls back to the generic water theme", () => {
    expect(zoneThemeForTerrain("unknown")).toBe(ZONE_THEMES.water);
  });

  it("covers every ship water zone", () => {
    for (const zone of SHIP_WATER_ZONES) {
      const placement = Object.values(RISK_WATER_AREAS).find((area) => area.motionZone === zone);
      expect(placement, zone).toBeDefined();
      expect(zoneThemeForTerrain(placement!.terrain), zone).not.toBe(ZONE_THEMES.water);
    }
  });
});

describe("DEWS_AREA_LABEL_COLORS", () => {
  const LADDER = ["CALM", "WATCH", "ALERT", "WARNING", "DANGER"] as const;
  // src/pharosville.css `.pharosville-shell { background: #050d13; }` — the
  // ground any DOM band label sits on, and the guard script's own body colour.
  const SHELL_BACKGROUND = "#050d13";

  it("ramps the accents down a monotonic value ladder and up a chroma ladder", () => {
    // W0.5: hue is never the only channel — the band NAME carries the reading —
    // but when hue IS present it must not contradict the escalation. The
    // framework defaults this replaced ran light-dark-LIGHTEST-dark-darkest,
    // which is no order at all once the colour is taken away.
    const levels = LADDER.map((band) => relativeLuminance(DEWS_AREA_LABEL_COLORS[band]));
    const chromas = LADDER.map((band) => chroma(DEWS_AREA_LABEL_COLORS[band]));
    for (let step = 1; step < LADDER.length; step += 1) {
      expect(levels[step]!, `${LADDER[step]} must be darker than ${LADDER[step - 1]}`)
        .toBeLessThan(levels[step - 1]!);
      expect(chromas[step]!, `${LADDER[step]} must be more saturated than ${LADDER[step - 1]}`)
        .toBeGreaterThan(chromas[step - 1]!);
    }
  });

  it("keeps every accent inside the harbor palette's chroma register", () => {
    // The defaults sat at chroma 0.64-0.89, louder than anything authored in
    // HARBOR_PALETTE. Vermillion, the loudest thing the palette owns, is the
    // ceiling — danger may reach it and nothing may pass it.
    const ceiling = chroma(HARBOR_PALETTE.vermillion);
    for (const band of LADDER) {
      expect(chroma(DEWS_AREA_LABEL_COLORS[band]), band).toBeLessThanOrEqual(ceiling);
    }
  });

  it("clears WCAG AA against the shell ground for every band", () => {
    // These are label accents; a band a visitor cannot read is a band that does
    // not exist. 4.5:1 is the text threshold, which is the strictest use they
    // could be put to.
    for (const band of LADDER) {
      expect(contrastRatio(DEWS_AREA_LABEL_COLORS[band], SHELL_BACKGROUND), band)
        .toBeGreaterThanOrEqual(4.5);
    }
  });
});

function channels(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

/** WCAG relative luminance, so "darker" means darker to the eye, not smaller in hex. */
function relativeLuminance(hex: string): number {
  const { r, g, b } = channels(hex);
  const linear = (channel: number): number => {
    const scaled = channel / 255;
    return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** Saturation as the sRGB cube's own spread — enough to rank "how loud is it". */
function chroma(hex: string): number {
  const { r, g, b } = channels(hex);
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

/** OKLab a/b for a hex — the perceptual plane the chroma ceiling is judged in. */
function oklab(hex: string): { a: number; b: number } {
  const { r, g, b } = channels(hex);
  const toLinear = (channel: number): number => {
    const scaled = channel / 255;
    return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  const [red, green, blue] = [toLinear(r), toLinear(g), toLinear(b)];
  const long = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const medium = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const short = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  return {
    a: 1.9779984951 * long - 2.4285922050 * medium + 0.4505937099 * short,
    b: 0.0259040371 * long + 0.7827717662 * medium - 0.8086757660 * short,
  };
}

function oklchChroma(hex: string): number {
  const { a, b } = oklab(hex);
  return Math.hypot(a, b);
}

function oklchHue(hex: string): number {
  const { a, b } = oklab(hex);
  const degrees = (Math.atan2(b, a) * 180) / Math.PI;
  return degrees < 0 ? degrees + 360 : degrees;
}

function hueDistance(a: number, b: number): number {
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
}

function contrastRatio(foreground: string, background: string): number {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (light + 0.05) / (dark + 0.05);
}
