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
  "bold-liquity":         livery("Liquity BOLD livery",   "#1a1a3a", "#7ed87e", "#a8d8a8", "#0d0e1f", "#fff5e8", "diamond", "center", "cross"),
  "fxusd-f-x-protocol":   livery("f(x) USD livery",       "#5a8a5a", "#3d6b3d", "#a8c97a", "#1a3520", "#f7fff5", "slash",   "field",  "diagonal"),
  "xaut-tether":          livery("Tether Gold livery",    "#009393", "#d6cfa6", "#d8b04a", "#005f61", "#fffbe5", "hex",     "center", "grain"),
  "paxg-paxos":           livery("PAX Gold livery",       "#b48a3a", "#f3e3a6", "#d9b65c", "#5a3d12", "#fffdec", "hex",     "field",  "grain"),
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
    ?? derivedFallbackLivery(id, meta);
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

const FALLBACK_ACCENTS = [
  "#2f9d6a",
  "#3e73c4",
  "#b9872d",
  "#7a65b8",
  "#c85e4b",
  "#2f8b92",
  "#8c7a3f",
  "#5e86c8",
] as const;

const FALLBACK_LOGO_SHAPES = ["circle", "diamond", "hex", "pill", "ring", "slash", "triangle"] as const satisfies readonly ShipLogoShape[];
const FALLBACK_SAIL_PANELS = ["center", "field", "hoist", "quartered"] as const satisfies readonly ShipSailPanel[];
const FALLBACK_STRIPES = ["single", "double", "diagonal", "chevron", "wave", "ladder", "cross", "grain"] as const satisfies readonly ShipStripePattern[];

function derivedFallbackLivery(id: string, meta: StablecoinMeta): StablecoinShipBranding {
  const peg = meta.flags.pegCurrency;
  const base = PEG_SAIL_COLORS[peg] ?? fallbackLivery("Unknown peg", "#8a98a3", "#e5e7eb", "#b6c0c8", "circle", "center", "single");
  const hash = stableHash(id);
  const accentSeed = FALLBACK_ACCENTS[hash % FALLBACK_ACCENTS.length];
  const nextAccent = FALLBACK_ACCENTS[(hash >>> 3) % FALLBACK_ACCENTS.length];
  const accent = mixHex(base.accent, accentSeed, 0.56);
  const primary = mixHex(base.primary, accentSeed, 0.42);
  const secondary = mixHex(base.secondary, darkenHex(nextAccent, 0.42), 0.38);
  const sailColor = mixHex(base.sailColor, lightenHex(accentSeed, 0.74), 0.34);
  const logoMatte = mixHex(base.logoMatte, lightenHex(nextAccent, 0.82), 0.28);
  return {
    accent,
    label: `${peg ?? "Unknown"} peg derived livery`,
    logoMatte,
    logoShape: FALLBACK_LOGO_SHAPES[(hash >>> 5) % FALLBACK_LOGO_SHAPES.length],
    primary,
    sailColor,
    sailPanel: FALLBACK_SAIL_PANELS[(hash >>> 9) % FALLBACK_SAIL_PANELS.length],
    secondary,
    source: "peg-fallback",
    stripePattern: FALLBACK_STRIPES[(hash >>> 13) % FALLBACK_STRIPES.length],
  };
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mixHex(first: string, second: string, amount: number): string {
  const a = parseHex(first);
  const b = parseHex(second);
  return toHex({
    red: mix(a.red, b.red, amount),
    green: mix(a.green, b.green, amount),
    blue: mix(a.blue, b.blue, amount),
  });
}

function lightenHex(hex: string, amount: number): string {
  return mixHex(hex, "#f8f2df", amount);
}

function darkenHex(hex: string, amount: number): string {
  return mixHex(hex, "#17222a", amount);
}

function parseHex(hex: string): { blue: number; green: number; red: number } {
  const normalized = hex.replace("#", "");
  return {
    red: Number.parseInt(normalized.slice(0, 2), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    blue: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function toHex(color: { blue: number; green: number; red: number }): string {
  return `#${hexChannel(color.red)}${hexChannel(color.green)}${hexChannel(color.blue)}`;
}

function hexChannel(value: number): string {
  return Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, "0");
}

function mix(first: number, second: number, amount: number): number {
  return first + (second - first) * amount;
}
