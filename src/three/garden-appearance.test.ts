import { describe, expect, it } from "vitest";
import {
  GARDEN_APPEARANCE_CLASSIFICATION,
  GARDEN_APPEARANCE_DEFAULTS,
  GARDEN_APPEARANCE_PRESETS,
  exportGardenAppearance,
  gardenAppearanceChecksum,
  gardenAppearanceInvalidation,
  parseGardenAppearance,
} from "./garden-appearance";
import { GARDEN_SURFACE_RECIPES } from "./garden-surfaces";

// Appearance never admits financial colours, classifications, poses or clocks.
describe("garden appearance contract", () => {
  it("freezes identity defaults and derives moss/stone response from the one surface grammar", () => {
    const defaults = GARDEN_APPEARANCE_DEFAULTS;
    expect(Object.isFrozen(defaults)).toBe(true);
    expect(Object.isFrozen(defaults.thresholdProfile)).toBe(true);
    expect(defaults.keyLight).toBe(1);
    expect(defaults.skyFill).toBe(1);
    expect(defaults.airBalance).toBe(1);
    expect(defaults.mossRoughness).toBe(GARDEN_SURFACE_RECIPES.moss.roughness);
    expect(defaults.stoneRoughness).toBe(GARDEN_SURFACE_RECIPES.stone.roughness);
    expect(defaults.mossShading).toBe("authored");
    expect(defaults.stoneShading).toBe("authored");
    expect(defaults.thresholdProfile).toEqual({});
    expect(gardenAppearanceInvalidation(defaults, parseGardenAppearance(defaults))).toEqual({ changed: [], rebuildParts: [] });
  });

  it("classifies role scalars, shader variants and the reserved named profile separately", () => {
    const defaults = GARDEN_APPEARANCE_DEFAULTS;
    expect(GARDEN_APPEARANCE_CLASSIFICATION.mossRoughness.update).toBe("uniform-update");
    expect(GARDEN_APPEARANCE_CLASSIFICATION.stoneShading.update).toBe("material-recompile");
    expect(GARDEN_APPEARANCE_CLASSIFICATION.thresholdProfile.update).toBe("named-part-rebuild");
    expect(gardenAppearanceInvalidation(defaults, { ...defaults, stoneRoughness: 0.84 })).toEqual({ changed: ["stoneRoughness"], rebuildParts: [] });
    expect(gardenAppearanceInvalidation(defaults, { ...defaults, mossShading: "faceted" })).toEqual({ changed: ["mossShading"], rebuildParts: [] });
    expect(gardenAppearanceInvalidation(defaults, { ...defaults, preset: "renamed" })).toEqual({ changed: [], rebuildParts: [] });
  });

  it("exports canonical local JSON with schema, preset and a reproducible content checksum", () => {
    for (const preset of GARDEN_APPEARANCE_PRESETS) {
      expect(Object.isFrozen(preset)).toBe(true);
      const json = exportGardenAppearance(preset);
      expect(exportGardenAppearance(parseGardenAppearance(JSON.parse(json)))).toBe(json);
      const reversed = Object.fromEntries(Object.entries(preset).reverse());
      expect(exportGardenAppearance(parseGardenAppearance(reversed))).toBe(json);
      expect(JSON.parse(json).checksum).toBe(gardenAppearanceChecksum(preset));
    }
    expect(gardenAppearanceChecksum(GARDEN_APPEARANCE_PRESETS[1]!)).not.toBe(gardenAppearanceChecksum(GARDEN_APPEARANCE_DEFAULTS));
  });

  it("rejects stale schemas, corrupt checksums, non-finite values and analytical knobs", () => {
    const defaults = GARDEN_APPEARANCE_DEFAULTS;
    expect(() => parseGardenAppearance({ ...defaults, schemaVersion: 0 })).toThrow("Stale");
    expect(() => parseGardenAppearance({ ...defaults, checksum: "00000000" })).toThrow("checksum mismatch");
    expect(() => parseGardenAppearance({ ...defaults, skyFill: NaN })).toThrow("skyFill");
    expect(() => parseGardenAppearance({ ...defaults, mossRoughness: Infinity })).toThrow("mossRoughness");
    expect(() => parseGardenAppearance({ ...defaults, clock: 12 })).toThrow("Unknown");
    expect(() => parseGardenAppearance({ ...defaults, riskColour: "red" })).toThrow("Unknown");
    expect(() => parseGardenAppearance({ ...defaults, stoneShading: "placeholder" })).toThrow("stoneShading");
  });

  it("leaves threshold registration to S1, refusing invented or silently ignored parameters", () => {
    expect(() => parseGardenAppearance({ ...GARDEN_APPEARANCE_DEFAULTS, thresholdProfile: { recess: 0.5 } })).toThrow("not registered");
  });
});
