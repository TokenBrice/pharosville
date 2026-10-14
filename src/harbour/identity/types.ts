/** P6 layout additions read by the identity layer (the shared contract; layout/types.ts is owned by the island). */
export type SeaZoneKind = "harbour" | "shoals" | "farPorts" | "wreckCove" | "roads" | "open";

export interface SeaZone {
  id: string;
  name: string;
  kind: SeaZoneKind;
  chain?: string;
  polygon: Array<[number, number]>;
  labelAnchor: [number, number];
  /** three.js rotation.y convention: π/4 reads level from the default camera. */
  labelAngle: number;
}

export interface CivicPlot {
  id: string;
  kind: string;
  position: [number, number, number];
  rotationY: number;
  footprint: [number, number];
}

export interface IdentityLayout {
  seaLevel?: number;
  seaZones?: SeaZone[];
  civic?: CivicPlot[];
}

/** public/harbour/crests.json (scripts/harbour/build-crests.mjs). UV rects are [u0, v0, u1, v1]. */
export interface CrestAtlas {
  version: number;
  width: number;
  height: number;
  chains: Record<string, { color: string; rim: string; ink: string; panel: [number, number, number, number]; flag: [number, number, number, number] }>;
}

/** public/harbour/chart-lettering.json (scripts/harbour/build-crests.mjs). */
export interface GlyphInfo { slot: number; adv: number }
export interface ChartFont {
  version: number;
  atlas: [number, number];
  cell: number;
  cols: number;
  spreadPx: number;
  emPx: number;
  /** The glyph quad in em units relative to the pen position on the baseline (y up). */
  quad: { x0: number; x1: number; y0: number; y1: number };
  faces: Record<"upright" | "italic", { cap: number; chars: Record<string, GlyphInfo> }>;
  star: GlyphInfo;
}
