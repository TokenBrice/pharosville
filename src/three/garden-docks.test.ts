import { InstancedMesh, Line, Material, Mesh, Texture } from "three";
import { describe, expect, it } from "vitest";
import type { DockNode } from "../systems/world-types";
import {
  createDock,
  gardenDockLampWorldPositions,
  gardenHarborCalmMask,
  harborPlan,
} from "./garden-docks";

const DISPLAY_TILE = { x: 40, y: 32 };
const ISLAND_TILE = { x: 18, y: 28 };

describe("garden docks", () => {
  it("gives Ethereum the grand banner arch and keeps bloom in headroom", () => {
    const visual = createDock(dock("ethereum", 10), DISPLAY_TILE, ISLAND_TILE);

    expect(visual.signature).toBe("arch");
    expect(visual.dock.chainId).toBe("ethereum");
    expect(visual.fineDetail.name).toBe("dock-fine-detail");
    // N4 supersedes the old "stays texture-free" assertion: harbours now fly a
    // chain flag sampling the shared flag atlas. This suite runs in the node
    // environment, where the atlas has no canvas and the flag falls back to a
    // plain accent material — so the harbour is still texture-free HERE, and
    // garden-chain-flag.test.ts covers the textured path under jsdom.
    expect(hasTexture(visual.root)).toBe(false);
    // Bloom comes from emissives; every warm source stays within AgX headroom.
    expect(maxEmissiveIntensity(visual.root)).toBeLessThanOrEqual(2);
  });

  it("assigns a deterministic signature prop per chain", () => {
    const first = createDock(dock("solana", 6), DISPLAY_TILE, ISLAND_TILE);
    const second = createDock(dock("solana", 6), DISPLAY_TILE, ISLAND_TILE);
    expect(first.signature).toBe(second.signature);
    expect(["crane", "net-racks", "dinghy", "crate-tower", "derrick"])
      .toContain(first.signature);
  });

  it("instances props so a dock stays within a tight draw budget", () => {
    const visual = createDock(dock("base", 7, 0.3), DISPLAY_TILE, ISLAND_TILE);
    // N4 raise (2026-07-25, measured cause): 14 -> 18. The comprehensive
    // harbour pass adds a quay wall, warehouses and roofs, a gantry crane,
    // mooring ropes, barrels and the chain flag. Measured 17 meshes for a
    // size-7 harbour. Everything repeated is instanced and everything static
    // is merged by material, so this number is flat in harbour *content* — it
    // only moves when a new material enters the harbour.
    expect(objectCount(visual.root)).toBeLessThanOrEqual(18);
    for (const name of [
      "dock-posts",
      "dock-lamp-heads",
      "dock-plank-relief",
      "dock-bollards",
      "dock-crates",
      "dock-barrels",
      "dock-pylons",
    ]) {
      expect(visual.root.getObjectByName(name), name).toBeInstanceOf(InstancedMesh);
    }
  });

  it("builds real harbour architecture, not a bare jetty", () => {
    const visual = createDock(dock("base", 7, 0.3), DISPLAY_TILE, ISLAND_TILE);
    for (const name of [
      "dock-deck",
      "dock-quay-wall",
      "dock-warehouses",
      "dock-warehouse-roofs",
      "dock-mooring-ropes",
      "dock-chain-flag",
    ]) {
      expect(visual.root.getObjectByName(name), name).toBeDefined();
    }
  });

  it("scales the harbour to the chain's supply band", () => {
    const small = createDock(dock("smallchain", 1), DISPLAY_TILE, ISLAND_TILE);
    const large = createDock(dock("bigchain", 10), DISPLAY_TILE, ISLAND_TILE);
    // Berth count drives the bollards, and cranes are earned, not given.
    expect(instanceCount(large, "dock-bollards"))
      .toBeGreaterThan(instanceCount(small, "dock-bollards"));
    expect(instanceCount(large, "dock-crates"))
      .toBeGreaterThan(instanceCount(small, "dock-crates"));
    expect(small.root.getObjectByName("dock-crane")).toBeUndefined();
    expect(large.root.getObjectByName("dock-crane")).toBeDefined();
  });

  it("gives each chain a deterministic harbour plan for silhouette variety", () => {
    expect(harborPlan(dock("ethereum", 10))).toBe("t-head");
    const plans = new Set(
      ["solana", "base", "arbitrum", "tron", "bsc", "polygon", "avalanche", "aptos"]
        .map((chainId) => harborPlan(dock(chainId, 6))),
    );
    // Not proof of a perfect spread, but a single plan across eight chains
    // would mean the silhouette carries no identity at all.
    expect(plans.size).toBeGreaterThan(1);
    expect(harborPlan(dock("solana", 6))).toBe(harborPlan(dock("solana", 6)));
  });

  it("flies a flag whose cloth faces the camera whatever way the pier points", () => {
    // Two harbours on opposite sides of the island yaw their roots apart; the
    // flag must counter-rotate so neither is edge-on to the fixed camera.
    const east = createDock(dock("base", 7), { x: 40, y: 32 }, ISLAND_TILE);
    const west = createDock(dock("base", 7), { x: 4, y: 24 }, ISLAND_TILE);
    const worldYaw = (visual: ReturnType<typeof createDock>): number => {
      const flag = visual.root.getObjectByName("dock-chain-flag");
      const pivot = flag!.children[0]!;
      return visual.root.rotation.y + pivot.rotation.y;
    };
    expect(worldYaw(east)).toBeCloseTo(Math.PI / 4, 6);
    expect(worldYaw(west)).toBeCloseTo(Math.PI / 4, 6);
  });

  it("exposes lamp world positions for sea-lane registration", () => {
    const visual = createDock(dock("arbitrum", 9), DISPLAY_TILE, ISLAND_TILE);
    const positions = gardenDockLampWorldPositions(visual);
    expect(positions.length).toBeGreaterThanOrEqual(2);
    expect(positions.length).toBeLessThanOrEqual(3);
    for (const position of positions) {
      expect(Number.isFinite(position.x)).toBe(true);
      expect(Number.isFinite(position.z)).toBe(true);
    }
  });

  it("derives the mirror-basin calm mask from the composed dock roots", () => {
    const east = createDock(dock("ethereum", 10), { x: 42, y: 31 }, ISLAND_TILE);
    const west = createDock(dock("solana", 6), { x: 25, y: 23 }, ISLAND_TILE);
    const mask = gardenHarborCalmMask([east, west]);
    expect(mask).not.toBeNull();
    const scale = Math.SQRT2;
    expect(mask!.center.x).toBeCloseTo(((42 + 25) / 2) * scale, 5);
    expect(mask!.center.z).toBeCloseTo(((31 + 23) / 2) * scale, 5);
    // Radii span the dock spread plus a berth margin, never the open sea.
    expect(mask!.radiusX).toBeGreaterThan((42 - 25) * scale / 2);
    expect(mask!.radiusX).toBeLessThanOrEqual(18);
    expect(mask!.radiusZ).toBeGreaterThan((31 - 23) * scale / 2);
    expect(mask!.radiusZ).toBeLessThanOrEqual(13);
    expect(mask!.calmStrength).toBeGreaterThan(0);
    expect(mask!.calmStrength).toBeLessThanOrEqual(1);
  });

  it("keeps a single-dock basin readable and empty input on the default", () => {
    expect(gardenHarborCalmMask([])).toBeNull();
    const solo = createDock(dock("base", 7), { x: 39, y: 38 }, ISLAND_TILE);
    const mask = gardenHarborCalmMask([solo]);
    expect(mask).not.toBeNull();
    expect(mask!.radiusX).toBeGreaterThanOrEqual(9);
    expect(mask!.radiusZ).toBeGreaterThanOrEqual(7);
  });
});

function dock(chainId: string, size: number, backingDiversity: number | null = null): DockNode {
  return {
    backingDiversity,
    chainId,
    concentration: null,
    detailId: `dock.${chainId}`,
    harboredStablecoins: [],
    healthBand: "healthy",
    id: `dock.${chainId}`,
    kind: "dock",
    label: chainId,
    size,
    stablecoinCount: 1,
    tile: { x: 40, y: 32 },
    totalUsd: size * 1_000_000_000,
  };
}

function instanceCount(visual: ReturnType<typeof createDock>, name: string): number {
  const mesh = visual.root.getObjectByName(name);
  if (!(mesh instanceof InstancedMesh)) throw new Error(`${name} is not instanced.`);
  return mesh.count;
}

function objectCount(root: import("three").Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (object instanceof Mesh || object instanceof Line) count += 1;
  });
  return count;
}

function hasTexture(root: import("three").Object3D): boolean {
  let found = false;
  root.traverse((object) => {
    if (!(object instanceof Mesh) && !(object instanceof InstancedMesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (materialHasTexture(material)) found = true;
    }
  });
  return found;
}

function materialHasTexture(material: Material): boolean {
  return Object.values(material).some((value) => value instanceof Texture);
}

function maxEmissiveIntensity(root: import("three").Object3D): number {
  let max = 0;
  root.traverse((object) => {
    const material = (object as Mesh).material;
    const materials = Array.isArray(material) ? material : material ? [material] : [];
    for (const entry of materials) {
      const intensity = (entry as { emissiveIntensity?: number }).emissiveIntensity;
      if (typeof intensity === "number") max = Math.max(max, intensity);
    }
  });
  return max;
}
