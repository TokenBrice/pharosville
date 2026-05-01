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
});
