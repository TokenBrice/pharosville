/**
 * Top-10 Major Titan flagships: the ten largest stablecoins each sail a bespoke classical hero vessel
 * (public/harbour/kit/titan_*.glb, built by scripts/harbour/blender/titans/), unmistakable by silhouette and craft:
 *   - Flagship class (>= $10B, beam <= 7.80 m for 7/7 flagship berths):
 *     1. titan_usdt  (32.0 × 7.80 m) Sovereign Syracusia grain colossus, emerald-jade & ivory, Aphrodite temple aft
 *     2. titan_usdc  (28.5 × 7.60 m) Imperial Deceres, navy & marble, Astrolabe rotunda & Archimedes catapult
 *   - Large class ($1B–$10B, <= 22.0 × 6.20 m for 33/33 large pier berths):
 *     3. titan_usde  (22.0 × 5.05 m) Obsidian & satin-silver Hellenistic pentere, hanging deck-garden & sprit mizzen
 *     4. titan_dai   (21.2 × 6.20 m) Golden-ochre Doric corbita citadel, stone fortress & collateral vault
 *     5. titan_usds  (21.8 × 6.15 m) Ptolemaic Thalamegos sky-palace, twin swan-neck prows & living brazier tower
 *     6. titan_rlusd (22.0 × 3.85 m) Cobalt & seafoam trireme express packet with live animated oar banks
 *     7. titan_usd1  (21.6 × 5.70 m) Gilded eagle-prow imperial liburna, twin ceremonial masts & marble loggia
 *     8. titan_xaut  (22.0 × 4.45 m) Sun-forged golden bullion cataphract galley with live animated gilded oars
 *     9. titan_usdg  (21.6 × 6.00 m) Twin-castled laurel-olive & bone-white global consortium naus
 *    10. titan_pyusd (21.0 × 5.30 m) Sapphire & silver commerce lembos packet with twin canopies & sprit mizzen
 *
 * The hull is identity (decorative); the D9 size ladder holds (USDT 32 m > USDC 28.5 m > kit flagship 26 m >
 * 8 large Titans 21–22 m > kit large 18 m > medium 13 m). Each GLB is built at drawn size so the fleet draws a titan
 * at scale 1 (its manifest loa_m). Titans keep their own paint (no per-coin livery) and never strike their rig far away.
 * (D-5: audio/feed.ts keeps the conch bound to the original four Titans through its own CONCH_TITANS constant.)
 */
export const TITANS: Readonly<Record<string, string>> = {
  "usdt-tether": "titan_usdt",
  "usdc-circle": "titan_usdc",
  "usde-ethena": "titan_usde",
  "dai-makerdao": "titan_dai",
  "usds-sky": "titan_usds",
  "rlusd-ripple": "titan_rlusd",
  "usd1-world-liberty-financial": "titan_usd1",
  "xaut-tether": "titan_xaut",
  "usdg-paxos": "titan_usdg",
  "pyusd-paypal": "titan_pyusd",
};

/** The coin's titan hull id when it is in the kit; null otherwise (the boat falls back to its kit variant). */
export function titanFor(coinId: string, hasVariant: (id: string) => boolean): string | null {
  const t = TITANS[coinId];
  return t && hasVariant(t) ? t : null;
}
