import { Matrix4 } from "three";
import { describe, expect, it } from "vitest";
import type { DockNode } from "../systems/world-types";
import {
  authorDock,
  gardenHarborCalmMask,
  harborIdentity,
  harborPlan,
  type DockRecipe,
  type HarborPropKind,
} from "./garden-docks";
import { createGardenHarborBatch } from "./garden-harbor-batch";
import { dockFixture as dock, ISLAND_TILE } from "./__fixtures__/harbor";

const DISPLAY_TILE = { x: 40, y: 32 };

describe("garden docks", () => {
  it("gives Ethereum the grand banner arch and keeps luminous surfaces explicit", () => {
    const recipe = authorDock(dock("ethereum", 10), DISPLAY_TILE, ISLAND_TILE);
    expect(recipe.signature).toBe("arch");
    expect(recipe.dock.chainId).toBe("ethereum");
    expect(recipe.parts.some((part) => part.bucket === "window")).toBe(true);
    expect(recipe.props.some((prop) => prop.kind === "lampHead")).toBe(true);
  });

  it("assigns a deterministic signature prop per chain", () => {
    const first = authorDock(dock("solana", 6), DISPLAY_TILE, ISLAND_TILE);
    const second = authorDock(dock("solana", 6), DISPLAY_TILE, ISLAND_TILE);
    expect(first.signature).toBe(second.signature);
    expect(["crane", "net-racks", "dinghy", "crate-tower", "derrick"])
      .toContain(first.signature);
  });

  it("authors a harbour as bucket parts and prop instances, never meshes", () => {
    const recipe = authorDock(dock("base", 7, 0.3), DISPLAY_TILE, ISLAND_TILE);
    const buckets = new Set(recipe.parts.map((part) => part.bucket));
    expect([...buckets].sort()).toEqual(["accent", "metal", "roof", "stone", "timber", "wall", "window"]);
    const kinds = new Set(recipe.props.map((prop) => prop.kind));
    for (const kind of ["post", "lampHead", "plank", "bollard", "crate", "barrel", "pylon", "piling"]) {
      expect(kinds.has(kind as HarborPropKind), kind).toBe(true);
    }
    const stone = recipe.parts.find((part) => part.bucket === "stone")!;
    expect(stone.color.getHexString()).not.toBe("ffffff");
    expect(recipe.flag.atlasCell).toBeGreaterThanOrEqual(-1);
    expect(recipe.rootMatrix.determinant()).toBeCloseTo(1, 5);
  });

  it("keeps the quay materials' height-fog contract on the recipe, not on a material", () => {
    const recipe = authorDock(dock("base", 7), DISPLAY_TILE, ISLAND_TILE);
    expect(recipe.identity).toBeDefined();
    expect(recipe.parts.every((part) => part.geometry.getAttribute("position").count > 0)).toBe(true);
  });

  it("builds real harbour architecture, not a bare jetty", () => {
    const recipe = authorDock(dock("base", 7, 0.3), DISPLAY_TILE, ISLAND_TILE);
    for (const bucket of ["timber", "stone", "wall", "roof", "accent", "window"] as const) {
      expect(recipe.parts.some((part) => part.bucket === bucket), bucket).toBe(true);
    }
    expect(recipe.parts.some((part) => part.fineDetail)).toBe(true);
    expect(recipe.flag.chainId).toBe("base");
  });

  it("turns weak chain health into cracked masonry and one leaning bollard", () => {
    const weak = {
      ...dock("base", 7),
      healthFactors: {
        backingDiversity: 0.12,
        chainEnvironment: 0.22,
        concentration: 0.84,
        pegStability: 0.3,
        quality: 0.18,
      },
    } satisfies DockNode;
    const recipe = authorDock(weak, DISPLAY_TILE, ISLAND_TILE);
    expect(recipe.parts.some((part) => part.bucket === "metal" && !part.fineDetail)).toBe(true);
    const bollard = recipe.props.find((prop) => prop.kind === "bollard")!;
    expect(Math.abs(bollard.matrix.elements[1]!)).toBeGreaterThan(0.05);
  });

  it("scales the harbour to the chain's supply band", () => {
    const small = authorDock(dock("arbitrum", 1), DISPLAY_TILE, ISLAND_TILE);
    const large = authorDock(dock("arbitrum", 10), DISPLAY_TILE, ISLAND_TILE);
    expect(propCount(large, "bollard")).toBeGreaterThan(propCount(small, "bollard"));
    expect(propCount(large, "crate")).toBeGreaterThan(propCount(small, "crate"));
    expect(nonFineMetalParts(small)).toBe(0);
    expect(nonFineMetalParts(large)).toBeGreaterThan(0);
  });

  it("gives each chain a deterministic harbour plan for silhouette variety", () => {
    expect(harborPlan(dock("ethereum", 10))).toBe("t-head");
    const plans = new Set(
      ["solana", "base", "arbitrum", "tron", "bsc", "polygon", "avalanche", "aptos"]
        .map((chainId) => harborPlan(dock(chainId, 6))),
    );
    expect(plans.size).toBeGreaterThan(1);
    expect(harborPlan(dock("solana", 6))).toBe(harborPlan(dock("solana", 6)));
  });

  it("flies a flag whose cloth faces the camera whatever way the pier points", () => {
    const east = authorDock(dock("base", 7), { x: 40, y: 32 }, ISLAND_TILE);
    const west = authorDock(dock("base", 7), { x: 4, y: 24 }, ISLAND_TILE);
    const worldYaw = (recipe: DockRecipe): number => recipe.anchorRotationY + recipe.flag.placement.yaw;
    expect(worldYaw(east)).toBeCloseTo(Math.PI / 4, 6);
    expect(worldYaw(west)).toBeCloseTo(Math.PI / 4, 6);
  });

  it("keeps the authored flag pose available for reduced motion", () => {
    const recipe = authorDock(dock("base", 7), DISPLAY_TILE, ISLAND_TILE);
    const batch = createGardenHarborBatch([recipe]);
    const before = new Matrix4();
    const restored = new Matrix4();
    batch.flags.getMatrixAt(0, before);
    batch.setFlagYaw("base", -1.2);
    batch.setFlagYaw("base", recipe.flag.placement.yaw);
    batch.flags.getMatrixAt(0, restored);
    expect(restored.equals(before)).toBe(true);
    batch.dispose();
  });

  it("varies repeated planks and chain-flag sag deterministically by entity", () => {
    const first = authorDock(dock("base", 7), DISPLAY_TILE, ISLAND_TILE);
    const repeat = authorDock(dock("base", 7), DISPLAY_TILE, ISLAND_TILE);
    const other = authorDock(dock("solana", 7), DISPLAY_TILE, ISLAND_TILE);
    const matrices = (recipe: DockRecipe): number[] => recipe.props
      .filter((prop) => prop.kind === "plank")
      .flatMap((prop) => Array.from(prop.matrix.elements));
    expect(matrices(first)).toEqual(matrices(repeat));
    expect(matrices(first)).not.toEqual(matrices(other));
    expect([first.flag.sag, first.flag.wavePhase]).toEqual([repeat.flag.sag, repeat.flag.wavePhase]);
    expect([first.flag.sag, first.flag.wavePhase]).not.toEqual([other.flag.sag, other.flag.wavePhase]);
  });

  it("exposes lamp world positions for sea-lane registration", () => {
    const recipe = authorDock(dock("arbitrum", 9), DISPLAY_TILE, ISLAND_TILE);
    expect(recipe.lampWorldPositions.length).toBeGreaterThanOrEqual(2);
    expect(recipe.lampWorldPositions.length).toBeLessThanOrEqual(3);
    for (const position of recipe.lampWorldPositions) {
      expect(Number.isFinite(position.x)).toBe(true);
      expect(Number.isFinite(position.z)).toBe(true);
    }
  });

  it("derives the mirror-basin calm mask from the composed dock roots", () => {
    const batch = createGardenHarborBatch([
      authorDock(dock("ethereum", 10), { x: 42, y: 31 }, ISLAND_TILE),
      authorDock(dock("solana", 6), { x: 25, y: 23 }, ISLAND_TILE),
    ]);
    const mask = gardenHarborCalmMask(batch.docks);
    expect(mask).not.toBeNull();
    const scale = Math.SQRT2;
    expect(mask!.center.x).toBeCloseTo(((42 + 25) / 2) * scale, 5);
    expect(mask!.center.z).toBeCloseTo(((31 + 23) / 2) * scale, 5);
    expect(mask!.radiusX).toBeGreaterThan((42 - 25) * scale / 2);
    expect(mask!.radiusX).toBeLessThanOrEqual(18);
    expect(mask!.radiusZ).toBeGreaterThan((31 - 23) * scale / 2);
    expect(mask!.radiusZ).toBeLessThanOrEqual(13);
    expect(mask!.calmStrength).toBeGreaterThan(0);
    expect(mask!.calmStrength).toBeLessThanOrEqual(1);
    batch.dispose();
  });

  it("makes Ethereum the capital: the largest harbour, and the only grand one", () => {
    const capital = authorDock(dock("ethereum", 10), DISPLAY_TILE, ISLAND_TILE);
    const rivals = NAMED_CHAINS
      .filter((chainId) => chainId !== "ethereum")
      .map((chainId) => authorDock(dock(chainId, 10), DISPLAY_TILE, ISLAND_TILE));
    for (const rival of rivals) {
      expect(capital.footprint.length, rival.dock.chainId).toBeGreaterThan(rival.footprint.length);
      expect(capital.footprint.span, rival.dock.chainId).toBeGreaterThan(rival.footprint.span);
      expect(rival.identity.enclosure).not.toBe("grand");
    }
    expect(capital.identity.enclosure).toBe("grand");
    expect(capital.identity.landmark).toBe("campanile");
    expect(nonFineMetalParts(capital)).toBeGreaterThan(0);
    expect(capital.parts.filter((part) => part.bucket === "stone").length).toBeGreaterThan(1);
  });

  it("still orders harbour scale by the chain's own supply", () => {
    const scaleOf = (totalUsd: number): number =>
      authorDock(dock("aptos", 6, null, totalUsd), DISPLAY_TILE, ISLAND_TILE).footprint.length;
    expect(scaleOf(500_000_000)).toBeLessThan(scaleOf(5_000_000_000));
    expect(scaleOf(5_000_000_000)).toBeLessThan(scaleOf(80_000_000_000));
  });

  it("builds structurally different harbours for different chains", () => {
    const tron = authorDock(dock("tron", 9), DISPLAY_TILE, ISLAND_TILE);
    const hyperliquid = authorDock(dock("hyperliquid", 9), DISPLAY_TILE, ISLAND_TILE);
    expect(structureFingerprint(tron)).not.toBe(structureFingerprint(hyperliquid));
    expect(tron.parts.filter((part) => part.bucket === "stone").length).toBeGreaterThan(
      hyperliquid.parts.filter((part) => part.bucket === "stone").length,
    );
    const identities = new Set(NAMED_CHAINS.map((chainId) => {
      const { enclosure, landmark, plan, roofline, works } = harborIdentity(dock(chainId, 6));
      return `${plan}|${enclosure}|${landmark}|${roofline}|${works}`;
    }));
    expect(identities.size).toBe(NAMED_CHAINS.length);
  });

  it("gives an unlisted chain a coherent harbour, deterministically", () => {
    const identity = harborIdentity(dock("some-unlisted-chain", 5));
    expect(identity).toEqual(harborIdentity(dock("some-unlisted-chain", 5)));
    expect(identity.enclosure).not.toBe("grand");
  });

  it("builds the same harbour geometry on every call", () => {
    for (const chainId of ["ethereum", "solana", "avalanche"]) {
      const first = authorDock(dock(chainId, 8), DISPLAY_TILE, ISLAND_TILE);
      const second = authorDock(dock(chainId, 8), DISPLAY_TILE, ISLAND_TILE);
      expect(structureFingerprint(second), chainId).toBe(structureFingerprint(first));
      expect(second.footprint, chainId).toEqual(first.footprint);
    }
  });

  it("keeps a single-dock basin readable and empty input on the default", () => {
    expect(gardenHarborCalmMask([])).toBeNull();
    const batch = createGardenHarborBatch([
      authorDock(dock("base", 7), { x: 39, y: 38 }, ISLAND_TILE),
    ]);
    const mask = gardenHarborCalmMask(batch.docks);
    expect(mask).not.toBeNull();
    expect(mask!.radiusX).toBeGreaterThanOrEqual(9);
    expect(mask!.radiusZ).toBeGreaterThanOrEqual(7);
    batch.dispose();
  });
});

const NAMED_CHAINS = [
  "aptos", "arbitrum", "avalanche", "base", "bsc", "ethereum",
  "hyperliquid", "polygon", "solana", "ton", "tron",
];

function structureFingerprint(recipe: DockRecipe): string {
  const entries = recipe.parts.map((part) => {
    const position = part.geometry.getAttribute("position");
    let checksum = 0;
    for (let index = 0; index < position.array.length; index += 1) {
      checksum = (checksum + Math.round(position.array[index]! * 1e4) * (index + 1)) % 2_147_483_647;
    }
    return `${part.bucket}:${part.fineDetail}:${position.count}:${checksum}`;
  });
  entries.push(...recipe.props.map((prop) => `${prop.kind}:${prop.fineDetail}:${prop.matrix.elements.join(",")}`));
  return entries.sort().join("|");
}

function propCount(recipe: DockRecipe, kind: HarborPropKind): number {
  return recipe.props.filter((prop) => prop.kind === kind).length;
}

function nonFineMetalParts(recipe: DockRecipe): number {
  return recipe.parts.filter((part) => part.bucket === "metal" && !part.fineDetail).length;
}
