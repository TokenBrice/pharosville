import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  SRGBColorSpace,
} from "three";
import { NOBORI_CLOTH_ASPECT } from "../systems/dock-layout";
import { HARBOR_DERIVED_PALETTE, noboriInkHex } from "../systems/palette";
import type { DockNode } from "../systems/world-types";
import { GARDEN_IDENTITY_ANISOTROPY } from "./garden-util";

/**
 * Every harbour names itself with a nobori (plan K28): undyed kinari cloth
 * printed with the chain's mark in a muted ink of the chain's own hue.
 *
 * One 512² atlas carries every harbour's banner, mirroring the fleet's sail
 * atlas (D3). Cells are portrait, the cloth's own proportion, so the mark is
 * painted undistorted: 8 × 2 cells of 64 × 208 px, sixteen banners for the
 * ten a rendered harbour ring can fly.
 *
 * Each cell is painted in two stages:
 *
 *  1. Immediately, a deterministic **chain mark** — the kinari field, the
 *     chichi hoist band and top sleeve in the chain's ink, a plain maru (disc)
 *     mon and the chain's initials written down the cloth. This is the same
 *     discipline the sails use (`VISUAL_INVARIANTS.md:89`): identity never
 *     depends on an image resolving.
 *  2. Asynchronously, the chain's real logo takes the mon's place when
 *     `dock.logoPath` resolves. The checked `public/chains/` set supplies the
 *     eleven marks a rendered harbor can fly. An unsupported or failed path
 *     keeps the painted mark; it is a designed fallback, not an error state.
 *
 * The mark is the mon over the vertical initials, one tall lockup that spans
 * most of the cloth: the far west stations sit ~230 u from the rest seat, so a
 * square mark on a 1 u cloth would be a few pixels, while the lockup keeps
 * every in-frame mark at or above the 18 px K28 gate without growing the cloth.
 */
export const CHAIN_FLAG_ATLAS_COLUMNS = 8;
export const CHAIN_FLAG_ATLAS_ROWS = 2;
export const CHAIN_FLAG_ATLAS_CELLS = CHAIN_FLAG_ATLAS_COLUMNS * CHAIN_FLAG_ATLAS_ROWS;
export const CHAIN_FLAG_ATLAS_SIZE_PX = 512;
export const CHAIN_FLAG_CELL_WIDTH_PX = CHAIN_FLAG_ATLAS_SIZE_PX / CHAIN_FLAG_ATLAS_COLUMNS;
export const CHAIN_FLAG_CELL_HEIGHT_PX = CHAIN_FLAG_CELL_WIDTH_PX * NOBORI_CLOTH_ASPECT;

/** Chichi: the band of loops lacing the cloth to its pole. */
const HOIST_PX = 6;
/** The sleeve the crossbar runs through. */
const SLEEVE_PX = 6;
const MARK_CENTRE_X = HOIST_PX + (CHAIN_FLAG_CELL_WIDTH_PX - HOIST_PX) / 2;
const MON_SIZE_PX = 50;
const MON_TOP_PX = 14;
const LETTER_FONT_PX = 58;
const LETTER_PITCH_PX = 62;
const FIRST_LETTER_CENTRE_PX = MON_TOP_PX + MON_SIZE_PX + 8 + LETTER_PITCH_PX / 2;
/** Bold sans capitals stand about 0.72 of their font size. */
const CAP_HEIGHT_RATIO = 0.72;

/**
 * The share of the cloth's height the painted mark spans, from the mon's top
 * to the foot of the second initial. The K28 gate (every mark ≥ 18 px tall at
 * the 1600×1000 rest) is measured on this span.
 */
export const NOBORI_MARK_HEIGHT_FRACTION = (
  FIRST_LETTER_CENTRE_PX + LETTER_PITCH_PX + (LETTER_FONT_PX * CAP_HEIGHT_RATIO) / 2 - MON_TOP_PX
) / CHAIN_FLAG_CELL_HEIGHT_PX;

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
    x: (cell % CHAIN_FLAG_ATLAS_COLUMNS) * CHAIN_FLAG_CELL_WIDTH_PX,
    y: Math.floor(cell / CHAIN_FLAG_ATLAS_COLUMNS) * CHAIN_FLAG_CELL_HEIGHT_PX,
  };
}

/**
 * UV rect of a cell, the same transform the banner shader applies. Y is
 * flipped because canvas rows run downward while UV rows run upward.
 */
export function gardenChainFlagCellUv(cell: number): {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
} {
  const scaleX = CHAIN_FLAG_CELL_WIDTH_PX / CHAIN_FLAG_ATLAS_SIZE_PX;
  const scaleY = CHAIN_FLAG_CELL_HEIGHT_PX / CHAIN_FLAG_ATLAS_SIZE_PX;
  const column = cell % CHAIN_FLAG_ATLAS_COLUMNS;
  const row = Math.floor(cell / CHAIN_FLAG_ATLAS_COLUMNS);
  return {
    offsetX: column * scaleX,
    offsetY: 1 - (row + 1) * scaleY,
    scaleX,
    scaleY,
  };
}

/**
 * Reserves and paints this chain's banner cell, returning its index (or -1
 * when no canvas is available, e.g. the node test environment — the caller
 * then flies plain kinari cloth). Idempotent: a chain keeps its cell and is
 * only painted once.
 */
export function assignGardenChainFlagCell(dock: DockNode, accent: Color): number {
  const store = gardenChainFlagAtlas() as MutableAtlas;
  const ink = chainFlagInk(dock.chainId, accent);
  const initials = chainInitials(dock.label || dock.chainId);
  const existing = store.cellByChainId.get(dock.chainId);
  if (existing !== undefined) {
    // The cache holds the PAINT, not the fetch. A cell first assigned while
    // `logoPath` was still null — a world composed before the chains payload
    // resolved — must be able to pick the logo up on a later composition, or
    // the harbour is stuck on its painted mark for the life of the document.
    // `store.upgraded` keeps this from re-fetching a cell that already tried.
    upgradeCellWithChainLogo(store, existing, dock.logoPath ?? null, ink, initials);
    return existing;
  }
  if (!store.texture) return -1;

  const cell = store.cellByChainId.size;
  if (cell >= CHAIN_FLAG_ATLAS_CELLS) return -1;
  store.cellByChainId.set(dock.chainId, cell);

  const canvas = store.texture.image as HTMLCanvasElement;
  const context = canvas.getContext("2d");
  if (!context) return -1;
  paintBanner(context, cell, ink, initials, null);
  store.texture.needsUpdate = true;
  upgradeCellWithChainLogo(store, cell, dock.logoPath ?? null, ink, initials);
  return cell;
}

/**
 * Brand colours, the SOURCE of each chain's ink hue — never painted as they
 * are. Tron's #ff060a measures OKLCH C 0.256 against vermillion's 0.177; the
 * banner prints every one through `noboriInkHex` (C ≤ 0.10, L 0.38–0.62), so
 * Tron becomes a dusky iron-oxide red and Aptos' near-black a sumi grey.
 *
 * Before the nobori, the cloth itself was dyed in these hexes at ×4.2 scale.
 * The health reading is NOT carried here: the per-chain health accent paints
 * the district's warehouse roofs (`garden-docks.ts`), the larger, closer
 * surface and the better carrier for a four-state band.
 *
 * Keys are the canonical chain ids the world scaffold normalizes every feed
 * to (`hyperliquid`, never the upstream `hyperliquid-l1` spelling) — unlike
 * `VENDORED_CHAIN_MARKS` in `chain-docks.ts`, which keys logo filename slugs
 * and legitimately keeps the alias. Chains outside this list take their ink
 * hue from the health accent, through the same clamp.
 */
const CHAIN_BRAND_HEX: Record<string, string> = {
  aptos: "#1a1a1a",
  arbitrum: "#12aaff",
  avalanche: "#e84142",
  base: "#0052ff",
  bsc: "#f0b90b",
  ethereum: "#627eea",
  hyperliquid: "#97fce4",
  polygon: "#8247e5",
  solana: "#9945ff",
  ton: "#0098ea",
  tron: "#ff060a",
};

/** The muted ink a chain's mark, hoist band and sleeve are printed in. */
export function chainFlagInk(chainId: string, fallback: Color): string {
  return noboriInkHex(CHAIN_BRAND_HEX[chainId] ?? `#${fallback.getHexString()}`);
}

/**
 * Paints one banner: kinari field, ink chichi band and sleeve, then the mark —
 * the mon (the chain's knocked-out logo, or a plain maru before it loads) over
 * the initials written down the cloth, tategaki-fashion.
 */
function paintBanner(
  context: CanvasRenderingContext2D,
  cell: number,
  ink: string,
  initials: string,
  logo: HTMLCanvasElement | null,
): void {
  const { x, y } = gardenChainFlagCellOrigin(cell);
  const width = CHAIN_FLAG_CELL_WIDTH_PX;
  const height = CHAIN_FLAG_CELL_HEIGHT_PX;
  context.save();
  context.translate(x, y);
  context.clearRect(0, 0, width, height);
  context.fillStyle = HARBOR_DERIVED_PALETTE.flag_kinari;
  context.fillRect(0, 0, width, height);
  context.fillStyle = ink;
  context.fillRect(0, 0, HOIST_PX, height);
  context.fillRect(0, 0, width, SLEEVE_PX);

  if (logo) {
    context.drawImage(
      logo,
      MARK_CENTRE_X - logo.width / 2,
      MON_TOP_PX + (MON_SIZE_PX - logo.height) / 2,
    );
  } else {
    context.beginPath();
    context.arc(MARK_CENTRE_X, MON_TOP_PX + MON_SIZE_PX / 2, MON_SIZE_PX * 0.42, 0, Math.PI * 2);
    context.fill();
  }

  context.font = `700 ${LETTER_FONT_PX}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (const [index, letter] of [...initials].entries()) {
    context.fillText(
      letter,
      MARK_CENTRE_X,
      FIRST_LETTER_CENTRE_PX + index * LETTER_PITCH_PX,
      width - HOIST_PX - 6,
    );
  }
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
 * Stage 2: the chain's real logo becomes the mon. Same-origin paths only —
 * the runtime media contract forbids remote asset URLs in browser code. A
 * failed load is not an error: the painted mark is the contract, the logo is
 * the upgrade, so failures keep the banner exactly as it is.
 */
function upgradeCellWithChainLogo(
  store: MutableAtlas,
  cell: number,
  logoPath: string | null,
  ink: string,
  initials: string,
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
    const natural = Math.max(1, Math.max(image.naturalWidth, image.naturalHeight));
    const width = (image.naturalWidth / natural) * MON_SIZE_PX;
    const height = (image.naturalHeight / natural) * MON_SIZE_PX;
    const mon = knockOutMark(image, width, height, ink);
    if (!mon) return;
    // Repaint the whole banner: stage 1's maru sits where the mon goes, and a
    // knocked-out mark is transparent everywhere the glyph is not.
    paintBanner(context, cell, ink, initials, mon);
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
