// @vitest-environment jsdom
import { CanvasTexture, Color, MeshStandardMaterial } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeChain } from "../__fixtures__/pharosville-world";
import { buildChainDocks } from "../systems/chain-docks";
import type { DockNode } from "../systems/world-types";
import { HARBOR_DERIVED_PALETTE, HARBOR_PALETTE, hexToOklch, NOBORI_INK_LIMITS } from "../systems/palette";
import {
  CHAIN_FLAG_ATLAS_CELLS,
  CHAIN_FLAG_ATLAS_SIZE_PX,
  CHAIN_FLAG_CELL_HEIGHT_PX,
  CHAIN_FLAG_CELL_WIDTH_PX,
  chainFlagInk,
  chainInitials,
  assignGardenChainFlagCell,
  gardenChainFlagAtlas,
  gardenChainFlagCellOrigin,
  gardenChainFlagCellUv,
  resetGardenChainFlagAtlas,
} from "./garden-chain-flag";
import { authorDock } from "./garden-docks";
import { createGardenHarborBatch } from "./garden-harbor-batch";

// jsdom has no 2D context, so the suite stubs one and asserts on the paint
// calls — the same approach garden-sail-texture.test.ts uses.
const drawImage = vi.fn();
const fillRect = vi.fn();
const fillText = vi.fn();

beforeEach(() => {
  drawImage.mockClear();
  fillRect.mockClear();
  fillText.mockClear();
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: vi.fn(() => fakeContext()),
  });
  resetGardenChainFlagAtlas();
});

afterEach(() => {
  resetGardenChainFlagAtlas();
  vi.unstubAllGlobals();
});

const ACCENT = new Color("#4d7fbe");

describe("garden chain flag atlas", () => {
  it("paints one shared texture for every harbour", () => {
    const first = assignGardenChainFlagCell(dock("ethereum", "Ethereum"), ACCENT);
    const second = assignGardenChainFlagCell(dock("solana", "Solana"), ACCENT);
    expect(first).toBe(0);
    expect(second).toBe(1);
    const atlas = gardenChainFlagAtlas();
    expect(atlas.texture).toBeInstanceOf(CanvasTexture);
    // One texture for every harbour is the whole point of the atlas.
    expect(atlas.cellByChainId.size).toBe(2);
  });

  it("keeps a chain on its cell across repeated world composition", () => {
    const initial = assignGardenChainFlagCell(dock("base", "Base"), ACCENT);
    assignGardenChainFlagCell(dock("tron", "Tron"), ACCENT);
    const repeated = assignGardenChainFlagCell(dock("base", "Base"), ACCENT);
    expect(repeated).toBe(initial);
    expect(gardenChainFlagAtlas().cellByChainId.size).toBe(2);
  });

  it("maps cells to non-overlapping portrait atlas rects", () => {
    const seen = new Set<string>();
    for (let cell = 0; cell < CHAIN_FLAG_ATLAS_CELLS; cell += 1) {
      const origin = gardenChainFlagCellOrigin(cell);
      const uv = gardenChainFlagCellUv(cell);
      expect(origin.x + CHAIN_FLAG_CELL_WIDTH_PX).toBeLessThanOrEqual(CHAIN_FLAG_ATLAS_SIZE_PX);
      expect(origin.y + CHAIN_FLAG_CELL_HEIGHT_PX).toBeLessThanOrEqual(CHAIN_FLAG_ATLAS_SIZE_PX);
      // The UV rect is the same canvas rect, flipped to UV rows.
      expect(uv.offsetX).toBeCloseTo(origin.x / CHAIN_FLAG_ATLAS_SIZE_PX, 6);
      expect(uv.offsetY + uv.scaleY).toBeCloseTo(1 - origin.y / CHAIN_FLAG_ATLAS_SIZE_PX, 6);
      expect(uv.offsetY).toBeGreaterThanOrEqual(0);
      const key = `${origin.x}.${origin.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("paints a chain mark so a harbour is named even with no logo asset", () => {
    assignGardenChainFlagCell(dock("hyperliquid", "Hyperliquid L1"), ACCENT);
    // Cloth, hoist band and sleeve, then the initials written down the banner.
    expect(fillRect).toHaveBeenCalled();
    expect(fillText).toHaveBeenCalledWith("H", expect.any(Number), expect.any(Number), expect.any(Number));
    expect(fillText).toHaveBeenCalledWith("L", expect.any(Number), expect.any(Number), expect.any(Number));
    const [first, second] = fillText.mock.calls;
    expect(second![2]).toBeGreaterThan(first![2]);
    // The logo is a later upgrade, never part of the first paint.
    expect(drawImage).not.toHaveBeenCalled();
  });

  // Plan K28 / harbour-2: the flags used to be dyed in raw brand hex (Tron
  // #ff060a measured C 0.256 against vermillion's 0.177). The cloth is now
  // kinari and every ink passes the nobori clamp, including the health-accent
  // fallback for chains without a brand entry.
  it("prints every mark in a muted ink of its chain's hue on kinari cloth", () => {
    const fills: string[] = [];
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: vi.fn(() => recordingContext(fills)),
    });
    resetGardenChainFlagAtlas();
    const loudAccent = new Color("#ff0000");
    for (const [chainId, label] of [
      ["tron", "Tron"], ["aptos", "Aptos"], ["bsc", "BSC"], ["hyperliquid", "Hyperliquid"],
      ["base", "Base"], ["solana", "Solana"], ["x-layer", "X Layer"],
    ] as const) {
      assignGardenChainFlagCell(dock(chainId, label), loudAccent);
    }
    expect(fills).toContain(HARBOR_DERIVED_PALETTE.flag_kinari);
    expect(fills).not.toContain("#ff060a");
    const vermillion = hexToOklch(HARBOR_PALETTE.vermillion).c;
    for (const fill of fills.filter((value) => value !== HARBOR_DERIVED_PALETTE.flag_kinari)) {
      const ink = hexToOklch(fill);
      expect(ink.c, fill).toBeLessThanOrEqual(NOBORI_INK_LIMITS.maxChroma + 0.005);
      expect(ink.c, fill).toBeLessThan(vermillion);
      expect(ink.l, fill).toBeGreaterThanOrEqual(NOBORI_INK_LIMITS.minLightness - 0.005);
      expect(ink.l, fill).toBeLessThanOrEqual(NOBORI_INK_LIMITS.maxLightness + 0.005);
    }
    // Hue survives the clamp: Tron stays in the red family, Base in the blue.
    expect(hueDistance(hexToOklch(chainFlagInk("tron", loudAccent)).h, hexToOklch("#ff060a").h)).toBeLessThan(8);
    expect(hueDistance(hexToOklch(chainFlagInk("base", loudAccent)).h, hexToOklch("#0052ff").h)).toBeLessThan(8);
  });

  it("refuses remote logo paths so browser code stays same-origin", () => {
    const remote = dock("evil", "Evil");
    remote.logoPath = "https://example.com/evil.png";
    // Still hands back a painted cell: the chain mark is the contract, the
    // logo is only ever an upgrade.
    expect(assignGardenChainFlagCell(remote, ACCENT)).toBe(0);
  });

  it("gives the harbour flag the atlas texture and its own cell's UVs", () => {
    const recipe = authorDock(dock("base", "Base"), { x: 40, y: 32 }, { x: 18, y: 28 });
    const batch = createGardenHarborBatch([recipe]);
    const material = batch.flags.material as MeshStandardMaterial;
    expect(material.map).toBe(gardenChainFlagAtlas().texture);
    expect(batch.flags.geometry.getAttribute("aFlagCell").getX(0)).toBe(0);
    batch.dispose();
  });

  // The failure mode this guards is silence: if `logoPath` is ever dropped
  // between the chains payload and the flag, every harbour quietly keeps its
  // painted mark and nothing anywhere reports a problem.
  describe("chain logo fetch", () => {
    it("carries logoPath from the chains payload through to an image fetch", () => {
      const requested: string[] = [];
      installImageSpy(requested);
      // Go through the real systems path, not a hand-built DockNode, so the
      // assertion covers buildChainDocks and the DockNode contract too.
      const docks = buildChainDocks({
        chains: [makeChain({ id: "ethereum", name: "Ethereum", totalUsd: 100, logoPath: "/chains/ethereum.png" })],
        globalTotalUsd: 100,
      } as Parameters<typeof buildChainDocks>[0]);

      expect(docks).toHaveLength(1);
      // Rewritten to the vendored glyph-only SVG: the flag knocks the mark out
      // of the cloth, so it must fetch the transparent vector we ship rather
      // than the raster the API still names.
      expect(docks[0]!.logoPath).toBe("/chains/ethereum.svg");
      assignGardenChainFlagCell(docks[0]!, ACCENT);
      expect(requested).toEqual(["/chains/ethereum.svg"]);
    });

    it("leaves a chain we do not vendor on the path the API gave", () => {
      const requested: string[] = [];
      installImageSpy(requested);
      const docks = buildChainDocks({
        chains: [makeChain({ id: "xlayer", name: "X Layer", totalUsd: 100, logoPath: "/chains/xlayer.png" })],
        globalTotalUsd: 100,
      } as Parameters<typeof buildChainDocks>[0]);

      expect(docks[0]!.logoPath).toBe("/chains/xlayer.png");
    });

    it("attempts the fetch exactly once per chain, however often the world recomposes", () => {
      const requested: string[] = [];
      installImageSpy(requested);
      const dockNode = dock("base", "Base");
      assignGardenChainFlagCell(dockNode, ACCENT);
      assignGardenChainFlagCell(dockNode, ACCENT);
      assignGardenChainFlagCell(dockNode, ACCENT);
      expect(requested).toEqual(["/chains/base.png"]);
    });

    it("still picks the logo up when the first composition had no logoPath", () => {
      const requested: string[] = [];
      installImageSpy(requested);
      const early = dock("base", "Base");
      early.logoPath = null;
      // A world composed before the chains payload resolved.
      const cell = assignGardenChainFlagCell(early, ACCENT);
      expect(requested).toEqual([]);
      // ...and the same chain once the payload arrives. The cell is cached,
      // but the fetch must not be.
      expect(assignGardenChainFlagCell(dock("base", "Base"), ACCENT)).toBe(cell);
      expect(requested).toEqual(["/chains/base.png"]);
    });

    it("never fetches a path that is not same-origin", () => {
      const requested: string[] = [];
      installImageSpy(requested);
      const remote = dock("evil", "Evil");
      remote.logoPath = "https://example.com/evil.png";
      assignGardenChainFlagCell(remote, ACCENT);
      expect(requested).toEqual([]);
    });
  });

  it("derives readable initials from a chain name", () => {
    expect(chainInitials("Ethereum")).toBe("ET");
    expect(chainInitials("Hyperliquid L1")).toBe("HL");
    expect(chainInitials("X Layer")).toBe("XL");
    expect(chainInitials("BSC")).toBe("BS");
  });
});

function dock(chainId: string, label: string): DockNode {
  return {
    chainId,
    concentration: null,
    detailId: `dock.${chainId}`,
    harboredStablecoins: [],
    healthBand: "healthy",
    id: `dock.${chainId}`,
    kind: "dock",
    station: { coveId: "fixture-cove", type: "tea-house-quay", shoreBearing: 0 },
    label,
    logoPath: `/chains/${chainId}.png`,
    size: 7,
    stablecoinCount: 1,
    tile: { x: 40, y: 32 },
    totalUsd: 7_000_000_000,
  };
}

/**
 * Replaces `Image` with a recorder: assigning `src` is the observable moment
 * the fetch is attempted, and jsdom will not load a real file anyway.
 */
function installImageSpy(requested: string[]): void {
  class RecordingImage {
    decoding = "auto";
    naturalHeight = 32;
    naturalWidth = 32;
    addEventListener(): void {}
    set src(value: string) {
      requested.push(value);
    }
  }
  vi.stubGlobal("Image", RecordingImage);
}

function fakeContext(): CanvasRenderingContext2D {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    drawImage,
    fill: vi.fn(),
    fillRect,
    fillText,
    restore: vi.fn(),
    save: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

/** A 2D context that records every `fillStyle` the painter sets. */
function recordingContext(fills: string[]): CanvasRenderingContext2D {
  const context = fakeContext() as unknown as Record<string, unknown>;
  Object.defineProperty(context, "fillStyle", {
    get: () => fills.at(-1) ?? "",
    set: (value: string) => fills.push(value),
  });
  return context as unknown as CanvasRenderingContext2D;
}

function hueDistance(a: number, b: number): number {
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
}
