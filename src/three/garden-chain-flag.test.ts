// @vitest-environment jsdom
import { CanvasTexture, Color, Mesh, MeshStandardMaterial } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => resetGardenChainFlagAtlas());

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
