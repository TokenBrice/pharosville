import { describe, expect, it } from "vitest";
import type { StablecoinMeta } from "@shared/types";
import { resolveStablecoinShipBranding } from "./stablecoin-ship-branding";
import { UNIQUE_SHIP_DEFINITIONS } from "./unique-ships";

function makeMeta(): StablecoinMeta {
  return {
    flags: {
      backing: "rwa-backed",
      governance: "decentralized",
      navToken: false,
      pegCurrency: "USD",
      rwa: false,
      yieldBearing: false,
    },
  } as StablecoinMeta;
}

describe("resolveStablecoinShipBranding", () => {
  it("returns an explicit stablecoin-logo livery for every unique ship id", () => {
    const meta = makeMeta();
    for (const id of Object.keys(UNIQUE_SHIP_DEFINITIONS)) {
      const branding = resolveStablecoinShipBranding(id, meta);
      expect(branding.source, id).toBe("stablecoin-logo");
    }
  });

  it("pins fallback livery generation to the shared FNV hash", () => {
    expect(resolveStablecoinShipBranding("alpha-dollar", makeMeta())).toEqual({
      accent: "#48a877",
      label: "USD peg derived livery",
      logoMatte: "#f4eddb",
      logoShape: "hex",
      primary: "#2e9568",
      sailColor: "#d9e9db",
      sailPanel: "hoist",
      secondary: "#4c4c45",
      source: "peg-fallback",
      stripePattern: "double",
    });
  });

  it("derives brand-color liveries from extracted issuer colors when present", () => {
    // mim-abracadabra has no hand-tuned livery but does have an extracted
    // brand color, so it must take the brand-color path, not the peg pastel.
    const branding = resolveStablecoinShipBranding("mim-abracadabra", makeMeta());
    expect(branding.source).toBe("brand-color");
    expect(branding.label).toBe("Issuer brand livery");
    // Deterministic: same id resolves to the identical livery.
    expect(resolveStablecoinShipBranding("mim-abracadabra", makeMeta())).toEqual(branding);
    // The brand primary must drive the colored surfaces (no peg-green drift).
    expect(branding.primary).not.toBe("#2e8f66");
    expect(branding.sailColor).not.toBe("#e4efe8");
  });

  it("keeps hand-tuned liveries ahead of brand-color derivation", () => {
    // usdc-circle exists in both the hand-tuned table and brand-colors.json;
    // the hand-tuned entry must win.
    expect(resolveStablecoinShipBranding("usdc-circle", makeMeta()).source).toBe("stablecoin-logo");
  });
});
