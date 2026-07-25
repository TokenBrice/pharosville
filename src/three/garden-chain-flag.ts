import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  SRGBColorSpace,
} from "three";
import type { DockNode } from "../systems/world-types";

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
 *     `dock.logoPath` resolves. the API reports chain logo paths under a chains directory, and
 *     what production serves.
 *
 * NOTE (2026-07-25): this repository ships no `public/chains/` directory, so
 * stage 2 currently no-ops in local dev and CI and every harbour flies its
 * painted mark. If production serves chain logo images, the same build
 * upgrades itself there. See the N4 report — vendoring the chain logos into
 * `public/chains/` (plus a `data/` manifest so `validate-runtime-media.mjs`
 * covers them) is an operator call, not one an agent should make unilaterally.
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
  if (existing !== undefined) return existing;
  if (!store.texture) return -1;

  const cell = store.cellByChainId.size;
  if (cell >= CHAIN_FLAG_ATLAS_CELLS) return -1;
  store.cellByChainId.set(dock.chainId, cell);

  const canvas = store.texture.image as HTMLCanvasElement;
  const context = canvas.getContext("2d");
  if (!context) return -1;
  paintChainMark(context, cell, dock, accent);
  store.texture.needsUpdate = true;
  upgradeCellWithChainLogo(store, cell, dock.logoPath ?? null);
  return cell;
}

const FLAG_HOIST_PX = 14;

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
  const { x, y } = gardenChainFlagCellOrigin(cell);
  const size = CHAIN_FLAG_CELL_PX;
  context.save();
  context.translate(x, y);
  context.clearRect(0, 0, size, size);

  const field = `#${accent.getHexString()}`;
  context.fillStyle = field;
  context.fillRect(0, 0, size, size);

  // Darker hoist band at the mast edge, so the cloth reads as a flag rather
  // than a floating square even when the mark itself is faint.
  const hoist = accent.clone().multiplyScalar(0.62);
  context.fillStyle = `#${hoist.getHexString()}`;
  context.fillRect(0, 0, FLAG_HOIST_PX, size);

  // Contrasting disc: the same matte the sails put behind a coin logo.
  const luminance = accent.r * 0.2126 + accent.g * 0.7152 + accent.b * 0.0722;
  const ink = luminance > 0.32 ? "#1b2026" : "#f2ece0";
  const disc = luminance > 0.32 ? "#f4efe4" : "#20262d";
  const centerX = FLAG_HOIST_PX + (size - FLAG_HOIST_PX) / 2;
  const centerY = size / 2;
  const radius = (size - FLAG_HOIST_PX) * 0.29;
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fillStyle = disc;
  context.globalAlpha = 0.94;
  context.fill();
  context.globalAlpha = 1;

  context.fillStyle = ink;
  context.font = "700 38px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(chainInitials(dock.label || dock.chainId), centerX, centerY + 2, radius * 1.7);

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
/** See the note in `upgradeCellWithChainLogo`. */
const CHAIN_LOGO_UPGRADE_ENABLED = false;

function upgradeCellWithChainLogo(
  store: MutableAtlas,
  cell: number,
  logoPath: string | null,
): void {
  // Disabled pending an explicit runtime-media decision (2026-07-25).
  //
  // Chain logos would be a NEW class of runtime media. The contract currently
  // allows exactly three: the stablecoin-logo inventory, the checked water
  // texture, and the checked model manifest — and `npm run check:runtime-media`
  // enforces it. This repository ships no `public/chains/` directory, so every
  // harbour would fire a request that 404s on this build, and whether
  // production serves those paths is unverified.
  //
  // The painted per-chain mark below is deterministic and already distinct per
  // chain, so the harbour flags read correctly without it. To turn this on:
  // ship `public/chains/`, add the class to the runtime-media allowlist and to
  // VISUAL_INVARIANTS, and regenerate RUNTIME_FACTS.
  if (!CHAIN_LOGO_UPGRADE_ENABLED) return;
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
    const drawn = box * 0.78;
    const width = (image.naturalWidth / natural) * drawn;
    const height = (image.naturalHeight / natural) * drawn;
    context.drawImage(
      image,
      x + FLAG_HOIST_PX + (box - width) / 2,
      y + (size - height) / 2,
      width,
      height,
    );
    texture.needsUpdate = true;
  });
  image.addEventListener("error", () => {
    // Keep the painted chain mark. Nothing to do.
  });
  image.src = logoPath;
}
