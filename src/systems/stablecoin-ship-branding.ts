import type { StablecoinMeta } from "@shared/types";
import type { ShipLivery, ShipLogoShape, ShipSailPanel, ShipStripePattern } from "./world-types";

export type StablecoinShipBranding = ShipLivery;

const PEG_SAIL_COLORS: Record<string, StablecoinShipBranding> = {
  EUR: fallbackLivery("EUR peg", "#2f6db3", "#dbe8f6", "#84a9d6", "ring", "hoist", "double"),
  GBP: fallbackLivery("GBP peg", "#2c8b92", "#d9efef", "#7ac0c3", "diamond", "quartered", "cross"),
  GOLD: fallbackLivery("Gold peg", "#b9872d", "#f4dfa2", "#e0b84e", "hex", "field", "grain"),
  SILVER: fallbackLivery("Silver peg", "#7d8b96", "#e3e7ea", "#aeb8bf", "hex", "field", "single"),
  USD: fallbackLivery("USD peg", "#2e8f66", "#e4efe8", "#68b787", "circle", "center", "single"),
};

const STABLECOIN_SAIL_COLORS: Record<string, StablecoinShipBranding> = {
  "usdt-tether": livery("Tether logo livery", "#009393", "#d8efe7", "#27b6a5", "#005f61", "#f7fffb", "circle", "center", "double"),
  "usdc-circle": livery("Circle logo livery", "#2775ca", "#dbe6f7", "#6ba3e8", "#143f7a", "#f8fbff", "ring", "center", "single"),
  "usde-ethena": livery("Ethena logo livery", "#393b3c", "#e2e2dd", "#8a8d87", "#151719", "#f5f2e8", "pill", "field", "diagonal"),
  "susde-ethena": livery("Ethena staked livery", "#686963", "#e8e6dc", "#a9a68e", "#34352f", "#f7f4e8", "pill", "hoist", "diagonal"),
  "usds-sky": livery("Sky logo livery", "#d77d32", "#f3d8bd", "#f2b060", "#78411c", "#fff7e8", "diamond", "quartered", "chevron"),
  "susds-sky": livery("Sky savings livery", "#e1893e", "#f4decb", "#f5bc72", "#7a4623", "#fff8ec", "diamond", "hoist", "chevron"),
  "stusds-sky": livery("Sky staked livery", "#bd6f2b", "#ead7c1", "#de9b5a", "#6c3d1d", "#fff8ec", "diamond", "hoist", "double"),
  "dai-makerdao": livery("Dai logo livery", "#d49a2f", "#f4deb1", "#f0b84f", "#8e5c16", "#fff6da", "diamond", "quartered", "chevron"),
  "frax-frax": livery("Frax logo livery", "#2f3437", "#eeeeea", "#90938c", "#14181a", "#f6f2e8", "hex", "field", "ladder"),
  "frxusd-frax": livery("Frax USD livery", "#2f3437", "#eeeeea", "#90938c", "#14181a", "#f6f2e8", "hex", "hoist", "ladder"),
  "sfrxusd-frax": livery("Frax staked livery", "#464a4b", "#e6e6df", "#a4a196", "#1f2224", "#f6f2e8", "hex", "hoist", "double"),
  "pyusd-paypal": livery("PayPal logo livery", "#1f5f95", "#d9e3f0", "#4c9adb", "#123e6b", "#f4f8ff", "pill", "hoist", "wave"),
  "fdusd-first-digital": livery("First Digital logo livery", "#9d7c2f", "#eee2ba", "#d3b457", "#5f4718", "#fff8dc", "hex", "center", "single"),
  "gho-aave": livery("GHO logo livery", "#3cae68", "#d9f0df", "#70c994", "#1f6d40", "#f7fff7", "circle", "quartered", "wave"),
  "usdy-ondo-finance": livery("Ondo logo livery", "#2e4c7c", "#d9e2ef", "#6f89b2", "#172b4a", "#f5f8ff", "ring", "field", "single"),
  "usdm-mountain-protocol": livery("Mountain logo livery", "#575757", "#e3e3de", "#96938a", "#2a2a2a", "#f7f5ed", "triangle", "field", "chevron"),
  "usdp-paxos": livery("Paxos logo livery", "#4b9c63", "#dceee0", "#85c88d", "#265a37", "#f8fff7", "hex", "center", "double"),
  "tusd-trueusd": livery("TrueUSD logo livery", "#3962cb", "#dbe4f7", "#6f91e8", "#1f3677", "#f5f8ff", "circle", "hoist", "single"),
  "crvusd-curve": livery("Curve logo livery", "#41956b", "#d9ecdf", "#8bbf72", "#27543e", "#f7fff5", "ring", "quartered", "wave"),
  "usdd-tron-dao-reserve": livery("USDD logo livery", "#2f8b7e", "#dcece8", "#62beb2", "#1b5850", "#f6fffc", "diamond", "center", "double"),
  "lusd-liquity": livery("Liquity logo livery", "#548bcf", "#dce8f7", "#8db4e3", "#285380", "#f5faff", "hex", "hoist", "single"),
  "eura-angle": livery("Angle logo livery", "#6750a4", "#e7e3f1", "#9a85d6", "#3d2d6b", "#fbf8ff", "slash", "field", "diagonal"),
  "eurc-circle": livery("EURC Circle livery", "#214f96", "#dbe6f7", "#6d8fd2", "#102f63", "#f8fbff", "ring", "center", "double"),
  "usdglo-glo": livery("Glo logo livery", "#2f9d6a", "#ddefe6", "#69ca93", "#1c6143", "#f7fff8", "circle", "quartered", "wave"),
  "usd-overnight": livery("Overnight logo livery", "#b9863f", "#f2e4ca", "#d9ad68", "#6e4a20", "#fff8e8", "diamond", "field", "diagonal"),
  "dola-inverse-finance": livery("DOLA logo livery", "#536d95", "#e0e5f1", "#899dc0", "#2d3d59", "#f7f9ff", "slash", "hoist", "single"),
  "usdl-lift-dollar": livery("Lift Dollar livery", "#ae7b3b", "#f0e0c8", "#d2a05a", "#6c4823", "#fff7e9", "triangle", "field", "chevron"),
};

export function resolveStablecoinShipBranding(id: string, meta: StablecoinMeta): StablecoinShipBranding {
  return STABLECOIN_SAIL_COLORS[id]
    ?? PEG_SAIL_COLORS[meta.flags.pegCurrency]
    ?? fallbackLivery("Unknown peg", "#8a98a3", "#e5e7eb", "#b6c0c8", "circle", "center", "single");
}

function livery(
  label: string,
  primary: string,
  sailColor: string,
  accent: string,
  secondary: string,
  logoMatte: string,
  logoShape: ShipLogoShape,
  sailPanel: ShipSailPanel,
  stripePattern: ShipStripePattern,
): StablecoinShipBranding {
  return {
    accent,
    label,
    logoMatte,
    logoShape,
    primary,
    sailColor,
    sailPanel,
    secondary,
    source: "stablecoin-logo",
    stripePattern,
  };
}

function fallbackLivery(
  label: string,
  primary: string,
  sailColor: string,
  accent: string,
  logoShape: ShipLogoShape,
  sailPanel: ShipSailPanel,
  stripePattern: ShipStripePattern,
): StablecoinShipBranding {
  return {
    accent,
    label,
    logoMatte: "#f7f3e6",
    logoShape,
    primary,
    sailColor,
    sailPanel,
    secondary: "#334155",
    source: "peg-fallback",
    stripePattern,
  };
}
