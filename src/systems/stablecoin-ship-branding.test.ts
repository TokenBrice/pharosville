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
});
