/** Number formatting for the chart voice. Pure. U+2212 for minus, thin spaces where a typesetter would. */

export const MINUS = "−";

const sign = (n: number, plus = true) => (n < 0 ? MINUS : plus && n > 0 ? "+" : "");

/** $184.0B, $4.21B, $312M, $8.4M, $820K, $95. */
export function money(n: number | null | undefined, opts: { signed?: boolean } = {}): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  const s = opts.signed ? sign(n) : n < 0 ? MINUS : "";
  const unit = (v: number, u: string) => `${s}$${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)}${u}`;
  if (a >= 1e12) return unit(a / 1e12, "T");
  if (a >= 1e9) return a / 1e9 >= 100 ? `${s}$${(a / 1e9).toFixed(1)}B` : unit(a / 1e9, "B");
  if (a >= 1e6) return unit(a / 1e6, "M");
  if (a >= 1e3) return unit(a / 1e3, "K");
  return `${s}$${a.toFixed(0)}`;
}

/** Signed basis points: "−35 bps", "+12 bps", "0 bps". */
export function bps(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${sign(Math.round(n))}${Math.abs(Math.round(n))} bps`;
}

/** Signed percentage from a ratio (0.0123 → "+1.23%"). */
export function pctChange(ratio: number | null | undefined, digits = 2): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  const p = ratio * 100;
  const d = Math.abs(p) >= 10 ? 1 : digits;
  if (Math.abs(p) < 0.005) return "0.00%";
  return `${sign(p)}${Math.abs(p).toFixed(d)}%`;
}

/** Plain share (0.583 → "58%", 0.004 → "0.4%", <0.001 → "<0.1%"). */
export function share(ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  const p = ratio * 100;
  if (p > 0 && p < 0.1) return "<0.1%";
  return p < 9.95 && Math.abs(p - Math.round(p)) > 0.05 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`;
}

/** "BEDROCK" → "Bedrock". */
export const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** Age in seconds → "just now", "4 min", "2 h", "3 d". */
export function age(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "unknown";
  if (sec < 90) return "just now";
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  if (sec < 86400 * 2) return `${Math.round(sec / 3600)} h`;
  return `${Math.round(sec / 86400)} d`;
}

const CURRENCY: Record<string, string> = {
  USD: "US dollar", EUR: "euro", GBP: "pound sterling", CHF: "Swiss franc", JPY: "yen", CNY: "yuan", CNH: "offshore yuan",
  SGD: "Singapore dollar", AUD: "Australian dollar", CAD: "Canadian dollar", BRL: "real", TRY: "lira", KRW: "won",
  MXN: "peso", IDR: "rupiah", PHP: "Philippine peso", RUB: "rouble", ZAR: "rand", NGN: "naira", HKD: "Hong Kong dollar",
  GOLD: "gold", XAU: "gold", SILVER: "silver", XAG: "silver", VAR: "a floating basket", ETH: "ether", BTC: "bitcoin",
};

/** "peggedUSD" → "US dollar". Unknown codes stay as their code. */
export function pegName(pegType: string): string {
  const code = pegType.replace(/^pegged/i, "").toUpperCase();
  return CURRENCY[code] ?? code;
}

export const RIG_NAME: Record<string, string> = {
  usd: "square rig", eur: "Greek merchantman", gold: "galley", fiat: "hippos", other: "sprit boat",
};

export const HULL_NAME: Record<string, string> = {
  flagship: "grain ship", large: "merchantman", medium: "corbita", small: "coaster", boat: "coaster", skiff: "fishing skiff",
};

/** What a boat sails as: the peg family picks the silhouette (fleet/variants.ts), the supply class its size. */
export function vesselKind(rig: string, hullClass: string): string {
  if (rig === "gold") return hullClass === "large" || hullClass === "flagship" ? "trireme" : "bireme";
  if (rig !== "usd" && RIG_NAME[rig]) return RIG_NAME[rig];
  return HULL_NAME[hullClass] ?? hullClass;
}

/** "2022-05" → "May 2022". */
export function monthYear(s: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (!m) return s;
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${names[Number(m[2]) - 1] ?? ""} ${m[1]}`.trim();
}

export const causeName = (cause: string) => cause.replace(/-/g, " ");
