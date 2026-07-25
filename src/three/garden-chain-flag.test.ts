// @vitest-environment jsdom
import { CanvasTexture, Color, Mesh, MeshStandardMaterial } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeChain } from "../__fixtures__/pharosville-world";
import { buildChainDocks } from "../systems/chain-docks";
import type { DockNode } from "../systems/world-types";
import {
  CHAIN_FLAG_ATLAS_CELLS,
  CHAIN_FLAG_ATLAS_COLUMNS,
  chainInitials,
  assignGardenChainFlagCell,
  gardenChainFlagAtlas,
  gardenChainFlagCellOrigin,
  gardenChainFlagCellUv,
  resetGardenChainFlagAtlas,
} from "./garden-chain-flag";
import { createDock } from "./garden-docks";

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

  it("maps cells to non-overlapping atlas rects", () => {
    const seen = new Set<string>();
    for (let cell = 0; cell < CHAIN_FLAG_ATLAS_CELLS; cell += 1) {
      const origin = gardenChainFlagCellOrigin(cell);
      const uv = gardenChainFlagCellUv(cell);
      expect(uv.scale).toBeCloseTo(1 / CHAIN_FLAG_ATLAS_COLUMNS, 6);
      expect(uv.offsetX).toBeGreaterThanOrEqual(0);
      expect(uv.offsetY).toBeGreaterThanOrEqual(0);
      expect(uv.offsetX + uv.scale).toBeLessThanOrEqual(1 + 1e-6);
      expect(uv.offsetY + uv.scale).toBeLessThanOrEqual(1 + 1e-6);
      const key = `${origin.x}.${origin.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("paints a chain mark so a harbour is named even with no logo asset", () => {
    assignGardenChainFlagCell(dock("hyperliquid", "Hyperliquid L1"), ACCENT);
    // Field + hoist band, then the chain's initials on their disc.
    expect(fillRect).toHaveBeenCalled();
    expect(fillText).toHaveBeenCalledWith("HL", expect.any(Number), expect.any(Number), expect.any(Number));
    // The logo is a later upgrade, never part of the first paint.
    expect(drawImage).not.toHaveBeenCalled();
  });

  it("refuses remote logo paths so browser code stays same-origin", () => {
    const remote = dock("evil", "Evil");
    remote.logoPath = "https://example.com/evil.png";
    // Still hands back a painted cell: the chain mark is the contract, the
    // logo is only ever an upgrade.
    expect(assignGardenChainFlagCell(remote, ACCENT)).toBe(0);
  });

  it("gives the harbour flag the atlas texture and its own cell's UVs", () => {
    const visual = createDock(dock("base", "Base"), { x: 40, y: 32 }, { x: 18, y: 28 });
    const flag = visual.root.getObjectByName("dock-chain-flag");
    const cloth = flag!.children[0]!.children[0] as Mesh;
    const material = cloth.material as MeshStandardMaterial;
    expect(material.map).toBe(gardenChainFlagAtlas().texture);
    const uv = cloth.geometry.getAttribute("uv");
    const cell = gardenChainFlagCellUv(0);
    for (let index = 0; index < uv.count; index += 1) {
      expect(uv.getX(index)).toBeGreaterThanOrEqual(cell.offsetX - 1e-6);
      expect(uv.getX(index)).toBeLessThanOrEqual(cell.offsetX + cell.scale + 1e-6);
      expect(uv.getY(index)).toBeGreaterThanOrEqual(cell.offsetY - 1e-6);
      expect(uv.getY(index)).toBeLessThanOrEqual(cell.offsetY + cell.scale + 1e-6);
    }
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
