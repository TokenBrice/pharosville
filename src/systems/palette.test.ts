import { describe, expect, it } from "vitest";
import { RISK_WATER_AREAS } from "./risk-water-areas";
import {
  DEWS_AREA_LABEL_COLORS,
  HARBOR_DERIVED_PALETTE,
  HARBOR_PALETTE,
  HARBOR_UI_PALETTE,
  hexToOklch,
  LEDGER_INK_HEX,
  NOBORI_INK_LIMITS,
  noboriInkHex,
  ZONE_THEMES,
  zoneThemeForTerrain,
} from "./palette";
import { SHIP_WATER_ZONES } from "./world-types";

describe("HARBOR_PALETTE", () => {
  it("keeps valid hex colors for Three materials", () => {
    for (const color of Object.values(HARBOR_PALETTE)) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  // D13 scopes the ceiling to supporting world pigments. Fixed anchors stay
  // pinned; imported identity/logo cloth, DOM chrome, practical lights and
  // rare-event emission do not acquire the supporting-surface ceiling.
  const CHROMA_EXEMPTIONS: Partial<Record<keyof typeof HARBOR_PALETTE, string>> = {
    vermillion: "fixed beacon/Danger anchor",
    lantern_warm: "fixed practical-light anchor",
    lantern_glow: "practical-light emission",
    sail_teal: "issuer-identity cloth",
    sail_red: "issuer-identity cloth",
    bloodmoon_red: "rare-event emission",
  };

  it("keeps supporting world pigments at or below OKLCH C 0.12", () => {
    for (const [token, hex] of Object.entries(HARBOR_PALETTE)) {
      if (CHROMA_EXEMPTIONS[token as keyof typeof HARBOR_PALETTE]) continue;
      expect(oklchChroma(hex), `${token} (${hex}) is a supporting pigment`).toBeLessThanOrEqual(0.12);
    }
    for (const [terrain, theme] of Object.entries(ZONE_THEMES)) {
      expect(oklchChroma(theme.base), `${terrain} base pigment`).toBeLessThanOrEqual(0.12);
    }
    for (const [token, hex] of Object.entries(HARBOR_DERIVED_PALETTE)) {
      expect(oklchChroma(hex), `${token} derived supporting pigment`).toBeLessThanOrEqual(0.12);
    }
    // DEWS label accents remain the separately ordered DOM/practical ladder:
    // their contrast pins below are not weakened to fit a scenery ceiling.
    expect(Object.keys(CHROMA_EXEMPTIONS)).toEqual([
      "vermillion", "lantern_warm", "lantern_glow", "sail_teal", "sail_red", "bloodmoon_red",
    ]);
  });

  it("keeps moss, mineral earth and roof values subordinate without flattening their ladders", () => {
    const moss = hexToOklch(HARBOR_PALETTE.aurora_green);
    expect(moss.l).toBeGreaterThanOrEqual(0.5);
    expect(moss.l).toBeLessThanOrEqual(0.6);
    expect(moss.c).toBeLessThanOrEqual(0.1);
    expect(moss.h).toBeGreaterThanOrEqual(120);
    expect(moss.h).toBeLessThanOrEqual(145);
    const lightness = (hex: string) => hexToOklch(hex).l;
    for (const ladder of [
      [HARBOR_PALETTE.stone_dark, HARBOR_PALETTE.stone_mid, HARBOR_PALETTE.stone_pale],
      [HARBOR_PALETTE.timber_dark, HARBOR_PALETTE.timber_mid, HARBOR_PALETTE.timber_warm],
    ]) {
      for (let step = 1; step < ladder.length; step += 1) {
        expect(lightness(ladder[step])).toBeGreaterThan(lightness(ladder[step - 1]));
      }
      expect(lightness(ladder[ladder.length - 1])).toBeLessThanOrEqual(0.56);
    }
    for (const [token, hex] of Object.entries(HARBOR_PALETTE)) {
      if (!token.startsWith("roof_")) continue;
      expect(lightness(hex), `${token} supporting roof`).toBeLessThanOrEqual(0.68);
    }
    expect(lightness(HARBOR_PALETTE.roof_thatch)).toBeLessThan(lightness(HARBOR_PALETTE.lantern_warm));
  });

  it("keeps the reserved and issuer-identity hex anchors unchanged", () => {
    // Supporting pigment may change; identity cloth and reserved accents do not.
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
    // Inspection badge hue families remain distinct even as the supporting
    // moss dye loses its former lawn-like saturation and lightness.
    const nav = oklchHue(HARBOR_PALETTE.lantern_cold);
    const yields = oklchHue(HARBOR_PALETTE.aurora_green);
    const other = oklchHue("#c9675c");
    for (const [a, b, label] of [[nav, yields, "nav/yield"], [yields, other, "yield/other"], [nav, other, "nav/other"]] as const) {
      expect(hueDistance(a, b), label).toBeGreaterThan(45);
    }
  });
});

describe("HARBOR_UI_PALETTE", () => {
  it("derives every DOM role from the shared harbor and risk palettes", () => {
    expect(HARBOR_UI_PALETTE).toEqual({
      ink: HARBOR_PALETTE.iron_dark,
      mist: HARBOR_PALETTE.fog_day,
      moss: HARBOR_PALETTE.aurora_green,
      stone: HARBOR_PALETTE.stone_mid,
      water: HARBOR_PALETTE.deep_sea_1,
      lantern: HARBOR_PALETTE.lantern_warm,
      risk: {
        calm: DEWS_AREA_LABEL_COLORS.CALM,
        watch: DEWS_AREA_LABEL_COLORS.WATCH,
        alert: DEWS_AREA_LABEL_COLORS.ALERT,
        warning: DEWS_AREA_LABEL_COLORS.WARNING,
        danger: DEWS_AREA_LABEL_COLORS.DANGER,
        ledger: LEDGER_INK_HEX,
        wreck: HARBOR_PALETTE.vermillion,
      },
    });
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

// Plan K28: nobori marks are printed in each chain's own hue at a muted
// strength. The clamp is judged here with this file's independent OKLab.
describe("noboriInkHex", () => {
  const vermillion = oklchChroma(HARBOR_PALETTE.vermillion);

  it("mutes saturated brand colours below vermillion while keeping their hue", () => {
    for (const brand of ["#ff060a", "#0052ff", "#8247e5", "#9945ff", "#f0b90b", "#12aaff", "#e84142"]) {
      const ink = noboriInkHex(brand);
      expect(oklchChroma(ink), `${brand} → ${ink}`).toBeLessThanOrEqual(NOBORI_INK_LIMITS.maxChroma + 0.002);
      expect(oklchChroma(ink), `${brand} → ${ink}`).toBeLessThan(vermillion);
      expect(hueDistance(oklchHue(ink), oklchHue(brand)), `${brand} → ${ink}`).toBeLessThan(6);
    }
  });

  it("lifts dark brands to the lightness floor and caps pale ones at the ceiling", () => {
    expect(hexToOklch(noboriInkHex("#1a1a1a")).l).toBeCloseTo(NOBORI_INK_LIMITS.minLightness, 2);
    expect(hexToOklch(noboriInkHex("#000000")).l).toBeCloseTo(NOBORI_INK_LIMITS.minLightness, 2);
    expect(hexToOklch(noboriInkHex("#97fce4")).l).toBeCloseTo(NOBORI_INK_LIMITS.maxLightness, 2);
    expect(hexToOklch(noboriInkHex("#ffffff")).l).toBeCloseTo(NOBORI_INK_LIMITS.maxLightness, 2);
  });

  it("leaves a colour already inside the ink range where it is", () => {
    const { r, g, b } = channels(noboriInkHex(HARBOR_PALETTE.stone_pale));
    const source = channels(HARBOR_PALETTE.stone_pale);
    expect(Math.abs(r - source.r)).toBeLessThanOrEqual(1);
    expect(Math.abs(g - source.g)).toBeLessThanOrEqual(1);
    expect(Math.abs(b - source.b)).toBeLessThanOrEqual(1);
  });

  it("derives kinari banner cloth as a quiet, light, warm off-white", () => {
    const kinari = HARBOR_DERIVED_PALETTE.flag_kinari;
    expect(kinari).toMatch(/^#[0-9a-f]{6}$/i);
    expect(oklchChroma(kinari)).toBeLessThan(0.04);
    expect(hexToOklch(kinari).l).toBeGreaterThan(0.84);
    expect(hueDistance(oklchHue(kinari), oklchHue(HARBOR_PALETTE.stone_pale))).toBeLessThan(6);
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
