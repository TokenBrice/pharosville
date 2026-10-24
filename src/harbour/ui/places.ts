/**
 * The P6 places the UI names and picks: the civic plots (layout.civic) and the sea zones
 * (layout.seaZones), read structurally from the layout and guarded (both are optional in older
 * layouts). Civic plots answer to the panel ids the UI already uses where one exists
 * (customs → "customs-house", the storm station → "storm-mast", the shipyard → "slipway"), so search,
 * the ledger and the readings keep one id per place.
 */
import type { HarbourLayout, Vec2, Vec3 } from "../layout/types";

export interface CivicPlot { id: string; kind: string; position: Vec3; rotationY: number; footprint: [number, number] }
export interface SeaZone { id: string; name: string; kind: string; chain?: string; polygon: Vec2[]; labelAnchor: Vec2 }

const isVec = (v: unknown, n: number): boolean => Array.isArray(v) && v.length >= n && v.slice(0, n).every((x) => typeof x === "number" && Number.isFinite(x));

const plotCache = new WeakMap<object, CivicPlot[]>();
export function civicPlots(L: HarbourLayout | null): CivicPlot[] {
  if (!L) return [];
  let out = plotCache.get(L);
  if (out) return out;
  const raw = (L as { civic?: unknown }).civic;
  out = Array.isArray(raw) ? raw.filter((c): c is CivicPlot => !!c && typeof c === "object" && typeof (c as CivicPlot).id === "string"
    && typeof (c as CivicPlot).kind === "string" && isVec((c as CivicPlot).position, 3) && isVec((c as CivicPlot).footprint, 2))
    .map((c) => ({ ...c, rotationY: Number.isFinite(c.rotationY) ? c.rotationY : 0 })) : [];
  plotCache.set(L, out);
  return out;
}

const zoneCache = new WeakMap<object, SeaZone[]>();
export function seaZones(L: HarbourLayout | null): SeaZone[] {
  if (!L) return [];
  let out = zoneCache.get(L);
  if (out) return out;
  const raw = (L as { seaZones?: unknown }).seaZones;
  out = Array.isArray(raw) ? raw.filter((z): z is SeaZone => !!z && typeof z === "object" && typeof (z as SeaZone).id === "string"
    && Array.isArray((z as SeaZone).polygon) && (z as SeaZone).polygon.length >= 3 && isVec((z as SeaZone).labelAnchor, 2)) : [];
  zoneCache.set(L, out);
  return out;
}

/** Civic kind → the panel / landmark id the UI uses for it. Harbour offices are harbours, not landmarks. */
export const CIVIC_PANEL_ID: Record<string, string> = {
  customs: "customs-house", stormstation: "storm-mast", shipyard: "slipway",
  mint: "mint", burn: "burn", registry: "registry", chartroom: "chartroom", harbourmaster: "harbourmaster", keeperslog: "keeperslog",
};

/** Height of each civic model's tag anchor above its plot (m; the civic manifest's tallest features). */
export const CIVIC_TOP: Record<string, number> = {
  mint: 33, burn: 22, shipyard: 22, customs: 30, registry: 18, chartroom: 12, stormstation: 22, harbourmaster: 26, keeperslog: 10, "harbour-office": 17,
};
export const civicTop = (kind: string) => CIVIC_TOP[kind] ?? CIVIC_TOP[kind.split(":")[0]] ?? 14;

/** Names for the places that are not (or not only) layout landmarks. */
export const PLACE_NAME: Record<string, string> = {
  mint: "The Mint", burn: "The Burn", slipway: "The Shipyard", "customs-house": "Customs House", registry: "The Registry",
  chartroom: "The Chart Room", "storm-mast": "Storm-signal Station", harbourmaster: "Harbourmaster’s Office", keeperslog: "The Keeper’s Log",
  pharos: "The Pharos", "harbour-tug": "Harbour tug", shoals: "The Shoals", "far-ports": "The Far Ports", "wreck-cove": "Wreck Cove", "the-roads": "The Roads",
};

/** A sea zone that opens a panel (as a landmark id), or null (open water and harbour water are handled apart). */
export const ZONE_PANEL: Record<string, string> = { shoals: "shoals", farPorts: "far-ports", wreckCove: "wreck-cove", roads: "the-roads" };

/** The chain a harbour office stands for ("harbour-office:hyperliquid-l1" → "Hyperliquid L1"), by the layout's piers. */
export function officeChain(L: HarbourLayout | null, kind: string): string | null {
  if (!kind.startsWith("harbour-office:")) return null;
  const slug = kind.slice("harbour-office:".length);
  const slugOf = (s: string) => s.toLowerCase().replace(/\s+/g, "-");
  return L?.piers.find((p) => slugOf(p.chain) === slug || p.id === `pier-${slug}`)?.chain
    ?? seaZones(L).find((z) => z.chain && slugOf(z.chain) === slug)?.chain ?? null;
}

/** Point in the plot's rotated footprint, with a margin (m). Front (+z local) faces the water. */
export function inPlot(p: CivicPlot, x: number, z: number, margin = 0): boolean {
  const dx = x - p.position[0], dz = z - p.position[2];
  const c = Math.cos(p.rotationY), s = Math.sin(p.rotationY);
  // world → local: the inverse of three.js rotation.y (local → world is x = lx c + lz s, z = −lx s + lz c)
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) <= p.footprint[0] / 2 + margin && Math.abs(lz) <= p.footprint[1] / 2 + margin;
}

/** The civic plot behind a panel id (the first one), or null. */
export function plotFor(L: HarbourLayout | null, panelId: string): CivicPlot | null {
  return civicPlots(L).find((p) => CIVIC_PANEL_ID[p.kind] === panelId) ?? null;
}

/** The display name of a landmark / place id. */
export function placeName(L: HarbourLayout | null, id: string): string {
  return PLACE_NAME[id] ?? seaZones(L).find((z) => z.id === id)?.name ?? L?.landmarks.find((l) => l.id === id)?.name ?? id;
}

export function inPoly(x: number, z: number, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** House colours of the eight piered chains (civic manifest `chains`), by display name. */
export const CHAIN_COLOR: Record<string, string> = {
  Ethereum: "#627EEA", Tron: "#D8322B", BSC: "#F0B90B", Solana: "#9945FF", "Hyperliquid L1": "#3FC1AE", Base: "#0052FF", Arbitrum: "#28A0F0", Polygon: "#8247E5",
};

/** Flow-scope chain ids → display names ("ethereum" → "Ethereum"). */
export const scopeName = (id: string) => ({ ethereum: "Ethereum", base: "Base", arbitrum: "Arbitrum", "arbitrum-one": "Arbitrum" } as Record<string, string>)[id.toLowerCase()] ?? id.charAt(0).toUpperCase() + id.slice(1);
