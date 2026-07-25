import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  SRGBColorSpace,
} from "three";
import type { DockNode } from "../systems/world-types";
import { GARDEN_IDENTITY_ANISOTROPY } from "./garden-util";

/**
 * N4: every harbour flies its chain's colours from the pier head.
 *
 * One 512² atlas carries every harbour's flag, mirroring the fleet's sail
 * atlas (D3): a texture per harbour would be ten uploads for ten quads, and
 * the fleet already proved the atlas pattern. Ten rendered harbours fit inside
 * sixteen cells with headroom.
 *
 * Each cell is painted in two stages:
 *
 *  1. Immediately, a deterministic **chain mark** — the chain's accent field,
 *     a hoist band, and its initials on a contrasting disc. This is the same
 *     discipline the sails use (`VISUAL_INVARIANTS.md:89`): identity never
 *     depends on an image resolving.
 *  2. Asynchronously, the chain's real logo drawn over the mark when
 *     `dock.logoPath` resolves. The checked `public/chains/` set supplies the
 *     eleven marks a rendered harbor can fly. An unsupported or failed path
 *     keeps the painted mark; it is a designed fallback, not an error state.
 */
export const CHAIN_FLAG_ATLAS_COLUMNS = 4;
export const CHAIN_FLAG_ATLAS_CELLS = 16;
export const CHAIN_FLAG_CELL_PX = 128;
export const CHAIN_FLAG_ATLAS_SIZE_PX = CHAIN_FLAG_ATLAS_COLUMNS * CHAIN_FLAG_CELL_PX;

export interface GardenChainFlagAtlas {
  /** chainId → atlas cell index. */
  readonly cellByChainId: Map<string, number>;
  dispose(): void;
  readonly texture: CanvasTexture | null;
}

interface MutableAtlas extends GardenChainFlagAtlas {
  cellByChainId: Map<string, number>;
  texture: CanvasTexture | null;
  upgraded: Set<number>;
}

/**
 * The atlas is a module-level lazy singleton rather than a per-scene resource.
 *
 * It is one texture for the life of the document, so GPU resource counts stay
 * flat across world replaces and StrictMode double-mounts — the pitfall the
 * dispose audit exists to catch. Cells are keyed by chain id, so re-composing
 * the world re-uses the paint instead of repainting it.
 */
let atlas: MutableAtlas | null = null;

export function gardenChainFlagAtlas(): GardenChainFlagAtlas {
  if (atlas) return atlas;
  atlas = createAtlas();
  return atlas;
}

/** Test seam: drops the singleton so a suite can observe a fresh atlas. */
export function resetGardenChainFlagAtlas(): void {
  atlas?.dispose();
  atlas = null;
}

function createAtlas(): MutableAtlas {
  const base: MutableAtlas = {
    cellByChainId: new Map(),
    dispose() {
      this.texture?.dispose();
      this.texture = null;
      this.cellByChainId.clear();
      this.upgraded.clear();
    },
    texture: null,
    upgraded: new Set(),
  };
  if (typeof document === "undefined") return base;

  const canvas = document.createElement("canvas");
  canvas.width = CHAIN_FLAG_ATLAS_SIZE_PX;
  canvas.height = CHAIN_FLAG_ATLAS_SIZE_PX;
  if (!canvas.getContext("2d")) return base;

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.anisotropy = GARDEN_IDENTITY_ANISOTROPY;
  texture.needsUpdate = true;
  base.texture = texture;
  return base;
}

export function gardenChainFlagCellOrigin(cell: number): { x: number; y: number } {
  return {
    x: (cell % CHAIN_FLAG_ATLAS_COLUMNS) * CHAIN_FLAG_CELL_PX,
    y: Math.floor(cell / CHAIN_FLAG_ATLAS_COLUMNS) * CHAIN_FLAG_CELL_PX,
  };
}

/**
 * UV transform for a cell, ready for `texture.repeat`/`texture.offset`-style
 * use on a cloned material or a remapped plane. Y is flipped because canvas
 * rows run downward while UV rows run upward.
 */
export function gardenChainFlagCellUv(cell: number): {
  offsetX: number;
  offsetY: number;
  scale: number;
} {
  const scale = 1 / CHAIN_FLAG_ATLAS_COLUMNS;
  const column = cell % CHAIN_FLAG_ATLAS_COLUMNS;
  const row = Math.floor(cell / CHAIN_FLAG_ATLAS_COLUMNS);
  return {
    offsetX: column * scale,
    offsetY: 1 - (row + 1) * scale,
    scale,
  };
}

/**
 * Reserves and paints this chain's flag cell, returning its index (or -1 when
 * no canvas is available, e.g. the node test environment — the caller then
 * flies a plain accent flag). Idempotent: a chain keeps its cell and is only
 * painted once.
 */
export function assignGardenChainFlagCell(dock: DockNode, accent: Color): number {
  const store = gardenChainFlagAtlas() as MutableAtlas;
  const existing = store.cellByChainId.get(dock.chainId);
  if (existing !== undefined) {
    // The cache holds the PAINT, not the fetch. A cell first assigned while
    // `logoPath` was still null — a world composed before the chains payload
    // resolved — must be able to pick the logo up on a later composition, or
    // the harbour is stuck on its painted mark for the life of the document.
    // `store.upgraded` keeps this from re-fetching a cell that already tried.
    upgradeCellWithChainLogo(
      store,
      existing,
      dock.logoPath ?? null,
      chainFlagField(dock.chainId, accent),
    );
    return existing;
  }
  if (!store.texture) return -1;

  const cell = store.cellByChainId.size;
  if (cell >= CHAIN_FLAG_ATLAS_CELLS) return -1;
  store.cellByChainId.set(dock.chainId, cell);

  const canvas = store.texture.image as HTMLCanvasElement;
  const context = canvas.getContext("2d");
  if (!context) return -1;
  paintChainMark(context, cell, dock, accent);
  store.texture.needsUpdate = true;
  upgradeCellWithChainLogo(
    store,
    cell,
    dock.logoPath ?? null,
    chainFlagField(dock.chainId, accent),
  );
  return cell;
}

const FLAG_HOIST_PX = 14;

/**
 * The cloth is dyed in the CHAIN's own colour, so a harbour is named by its
 * flag the way a ship is named by its sail (F1).
 *
 * Before this, the field was `dockAccentColor` — the health-band accent
 * (green/amber/orange/red) hue-shifted per chain. That made every healthy
 * harbour green and told you nothing about which chain you were looking at.
 * The health reading is NOT lost: the same accent still paints the district's
 * warehouse roofs (`garden-docks.ts:255`), which is the larger, closer surface
 * and the better carrier for a four-state band.
 *
 * Only the chains a harbour can actually be built for are listed. Anything
 * else falls back to the health accent, which is the previous behaviour and
 * still gives the ~90 other chains the API can report a distinct flag.
 */
const CHAIN_FLAG_FIELD: Record<string, string> = {
  aptos: "#1a1a1a",
  arbitrum: "#12aaff",
  avalanche: "#e84142",
  base: "#0052ff",
  bsc: "#f0b90b",
  ethereum: "#627eea",
  "hyperliquid-l1": "#97fce4",
  polygon: "#8247e5",
  solana: "#9945ff",
  ton: "#0098ea",
  tron: "#ff060a",
};

function chainFlagField(chainId: string, fallback: Color): Color {
  const brand = CHAIN_FLAG_FIELD[chainId];
  return brand ? new Color(brand) : fallback;
}

/** White on a dark field, near-black on a light one (BSC yellow, Hyperliquid mint). */
function flagInk(field: Color): string {
  const luminance = field.r * 0.2126 + field.g * 0.7152 + field.b * 0.0722;
  return luminance > 0.55 ? "#15191e" : "#ffffff";
}

/**
 * Stage 1: the deterministic chain mark. A logo that never loads must still
 * leave a flag that names its harbour, so the initials are the contract and
 * the logo is the upgrade.
 */
function paintChainMark(
  context: CanvasRenderingContext2D,
  cell: number,
  dock: DockNode,
  accent: Color,
): void {
  const field = chainFlagField(dock.chainId, accent);
  const size = CHAIN_FLAG_CELL_PX;
  paintChainField(context, cell, field);

  const { x, y } = gardenChainFlagCellOrigin(cell);
  context.save();
  context.translate(x, y);

  // Initials straight onto the cloth in the contrast ink — no disc. The field
  // is now the chain's own colour, so a matte behind the mark would hide the
  // very thing the flag exists to show.
  context.fillStyle = flagInk(field);
  context.font = "700 44px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const box = size - FLAG_HOIST_PX;
  context.fillText(
    chainInitials(dock.label || dock.chainId),
    FLAG_HOIST_PX + box / 2,
    size / 2 + 2,
    box * 0.8,
  );

  context.restore();
}

/**
 * The bare cloth: chain field plus its darker hoist band at the mast edge, so
 * the flag reads as fabric rather than a floating square.
 *
 * Separate from the mark because the logo upgrade (stage 2) has to repaint the
 * cloth before drawing — otherwise the stage 1 initials stay visible underneath
 * a transparent logo.
 */
function paintChainField(
  context: CanvasRenderingContext2D,
  cell: number,
  field: Color,
): void {
  const { x, y } = gardenChainFlagCellOrigin(cell);
  const size = CHAIN_FLAG_CELL_PX;
  context.save();
  context.translate(x, y);
  context.clearRect(0, 0, size, size);

  context.fillStyle = `#${field.getHexString()}`;
  context.fillRect(0, 0, size, size);

  const hoist = field.clone().multiplyScalar(0.62);
  context.fillStyle = `#${hoist.getHexString()}`;
  context.fillRect(0, 0, FLAG_HOIST_PX, size);
  context.restore();
}

/** Up to two letters: "Hyperliquid L1" → "HL", "Base" → "BA", "BSC" → "BS". */
export function chainInitials(name: string): string {
  const words = name.trim().split(/[\s-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/**
 * Stage 2: draw the chain's real logo over its mark. Same-origin paths only —
 * the runtime media contract forbids remote asset URLs in browser code. A
 * failed load is not an error: the painted mark is the contract, the logo is
 * the upgrade, so failures keep the flag exactly as it is.
 */
function upgradeCellWithChainLogo(
  store: MutableAtlas,
  cell: number,
  logoPath: string | null,
  field: Color,
): void {
  // Enabled 2026-07-25 by operator decision, with the assets shipped.
  //
  // Chain logos are a fourth class of runtime media alongside the
  // stablecoin-logo inventory, the checked water texture and the model
  // manifest. `public/chains/` now carries the eleven marks a harbour can
  // actually fly (the ten PREFERRED_DOCK_TILES chains plus TON's pigeonnier
  // wharf), so the fetch resolves locally as well as in production.
  //
  // Any chain outside that set keeps the painted mark, which is why the
  // fallback below is not an error path: a miss is the designed outcome for
  // the other ~90 chains the API can report.
  if (!logoPath || !logoPath.startsWith("/")) return;
  if (store.upgraded.has(cell)) return;
  if (typeof Image === "undefined") return;
  store.upgraded.add(cell);

  const image = new Image();
  image.decoding = "async";
  image.addEventListener("load", () => {
    const texture = store.texture;
    if (!texture) return;
    const canvas = texture.image as HTMLCanvasElement;
    const context = canvas.getContext("2d");
    if (!context) return;
    const { x, y } = gardenChainFlagCellOrigin(cell);
    const size = CHAIN_FLAG_CELL_PX;
    const box = size - FLAG_HOIST_PX;
    const natural = Math.max(1, Math.max(image.naturalWidth, image.naturalHeight));
    const drawn = box * 0.82;
    const width = (image.naturalWidth / natural) * drawn;
    const height = (image.naturalHeight / natural) * drawn;

    // Repaint the cloth first: stage 1 left the chain's initials on it, and a
    // knocked-out mark is transparent everywhere the glyph is not.
    paintChainField(context, cell, field);

    const knockout = knockOutMark(image, width, height, flagInk(field));
    if (!knockout) return;
    context.drawImage(
      knockout,
      x + FLAG_HOIST_PX + (box - width) / 2,
      y + (size - height) / 2,
    );
    texture.needsUpdate = true;
  });
  image.addEventListener("error", () => {
    // Keep the painted chain mark. Nothing to do.
  });
  image.src = logoPath;
}

/**
 * Recolours a chain logo to a single flat ink, keeping only its silhouette.
 *
 * `source-in` keeps the incoming fill only where the existing pixels are
 * opaque, so the glyph's own alpha becomes the stencil. This assumes the mark
 * is a transparent-background GLYPH — a logo supplied as a filled badge (an
 * opaque disc or square) has no transparency to stencil against and would
 * knock out as a solid block of ink. See the chain-asset requirement in
 * `agents/2026-07-25-logo-vectorisation-brief.md`.
 *
 * Drawn on its own canvas rather than in place because `source-in` against the
 * atlas would erase every other harbour's cell.
 */
function knockOutMark(
  image: HTMLImageElement,
  width: number,
  height: number,
  ink: string,
): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "source-in";
  context.fillStyle = ink;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}
