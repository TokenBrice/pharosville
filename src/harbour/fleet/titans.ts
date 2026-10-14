/**
 * Titan-class flagships: the four majors sail a unique hero ship each (public/harbour/kit/titan_*.glb, built by
 * scripts/harbour/blender/titans/), whatever their supply class, so the big guys read at a glance:
 *   USDT  emerald-and-white four-masted barque · USDC  navy-and-white clipper ·
 *   USDe  dark modern staysail schooner · USDS  sky-blue-and-cream paddle frigate.
 * The hull is identity (decorative); the size keeps the supply ladder's order (USDT > USDC > the 26 m flagships >
 * USDS ≈ USDe > the 18 m large hulls) with a declared flourish over the class LOA: each GLB is built at its drawn
 * size (USDT 32 m, USDC 30 m, USDe and USDS 22 m), so the fleet draws a titan at scale 1 (its manifest loa_m).
 * Titans keep their own paint (no per-coin livery) and never strike their rig far away.
 */
export const TITANS: Readonly<Record<string, string>> = {
  "usdt-tether": "titan_usdt",
  "usdc-circle": "titan_usdc",
  "usde-ethena": "titan_usde",
  "usds-sky": "titan_usds",
};

/** The coin's titan hull id when it is in the kit; null otherwise (the boat falls back to its kit variant). */
export function titanFor(coinId: string, hasVariant: (id: string) => boolean): string | null {
  const t = TITANS[coinId];
  return t && hasVariant(t) ? t : null;
}
