import { InstancedMesh, Line, Material, Matrix4, Mesh, MeshStandardMaterial, Texture } from "three";
import { describe, expect, it } from "vitest";
import type { DockNode } from "../systems/world-types";
import { weatherForFrame } from "../systems/weather";
import {
  createDock,
  gardenDockLampWorldPositions,
  gardenHarborCalmMask,
  harborIdentity,
  harborPlan,
  updateDockFlagWind,
} from "./garden-docks";
import {
  gardenQuayEpistemicHazeUniform,
  setGardenQuayEpistemicHaze,
} from "./garden-height-fog";

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

  it("reuses the quay materials' height fog for Chains staleness", () => {
    const visual = createDock(dock("base", 7), DISPLAY_TILE, ISLAND_TILE);
    const foggedMaterials: MeshStandardMaterial[] = [];
    visual.root.traverse((object) => {
      if (foggedMaterials.length > 0 || !(object instanceof Mesh)) return;
      const candidate = Array.isArray(object.material) ? object.material[0] : object.material;
      if (candidate instanceof MeshStandardMaterial && candidate.userData.gardenHeightFog) {
        foggedMaterials.push(candidate);
      }
    });
    const material = foggedMaterials[0];
    expect(material).toBeDefined();
    if (!material) throw new Error("expected a fogged quay material");
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: "#include <common>\n#include <worldpos_vertex>\n#include <project_vertex>",
      fragmentShader: "#include <common>\n#include <fog_fragment>",
    };
    material.onBeforeCompile(shader as never, null as never);
    expect(shader.fragmentShader).toContain("gardenApplyLocalizedHeightFog");
    expect(shader.fragmentShader).toContain("uniform float uGardenEpistemicHaze;");
    expect(shader.uniforms.uGardenEpistemicHaze).toBe(gardenQuayEpistemicHazeUniform);
    setGardenQuayEpistemicHaze(true);
    expect(shader.uniforms.uGardenEpistemicHaze!.value).toBe(1);
    setGardenQuayEpistemicHaze(false);
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
    const visual = createDock(weak, DISPLAY_TILE, ISLAND_TILE);
    expect(visual.root.getObjectByName("dock-masonry-cracks")).toBeInstanceOf(Mesh);
    const bollards = visual.root.getObjectByName("dock-bollards") as InstancedMesh;
    const matrix = new Matrix4();
    bollards.getMatrixAt(0, matrix);
    expect(Math.abs(matrix.elements[1]!)).toBeGreaterThan(0.05);
  });

  it("scales the harbour to the chain's supply band", () => {
    // Same chain (so the same authored identity), two supply bands: only the
    // amount of harbour built differs. Arbitrum carries the gantry landmark, so
    // it is where "a crane is earned by size" is observable.
    const small = createDock(dock("arbitrum", 1), DISPLAY_TILE, ISLAND_TILE);
    const large = createDock(dock("arbitrum", 10), DISPLAY_TILE, ISLAND_TILE);
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

  it("routes chain flags through the shared wind and restores the authored reduced-motion pose", () => {
    const visual = createDock(dock("base", 7), DISPLAY_TILE, ISLAND_TILE);
    const pivot = visual.root.getObjectByName("dock-chain-flag-wind-pivot")!;
    const authoredYaw = pivot.rotation.y;
    const weather = weatherForFrame({ baseWind: 0.7, psiStress: 0.4, timeSeconds: 2 });

    updateDockFlagWind(visual, weather, 2, false);
    expect(visual.root.rotation.y + pivot.rotation.y).toBeCloseTo(-weather.windAngle, 6);
    expect(pivot.rotation.z).not.toBe(0);

    updateDockFlagWind(visual, weather, 900, true);
    expect(pivot.rotation.y).toBeCloseTo(authoredYaw, 8);
    expect(pivot.rotation.z).toBe(0);
  });

  it("varies repeated planks and chain-flag sag deterministically by entity", () => {
    const first = createDock(dock("base", 7), DISPLAY_TILE, ISLAND_TILE);
    const repeat = createDock(dock("base", 7), DISPLAY_TILE, ISLAND_TILE);
    const other = createDock(dock("solana", 7), DISPLAY_TILE, ISLAND_TILE);
    const matrices = (visual: ReturnType<typeof createDock>): number[] => (
      Array.from((visual.root.getObjectByName("dock-plank-relief") as InstancedMesh).instanceMatrix.array)
    );
    const flagPositions = (visual: ReturnType<typeof createDock>): number[] => {
      const group = visual.root.getObjectByName("dock-chain-flag")!;
      return Array.from((group.children[0]!.children[0] as Mesh).geometry.getAttribute("position").array);
    };
    expect(matrices(first)).toEqual(matrices(repeat));
    expect(matrices(first)).not.toEqual(matrices(other));
    expect(flagPositions(first)).toEqual(flagPositions(repeat));
    expect(flagPositions(first)).not.toEqual(flagPositions(other));
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

  it("makes Ethereum the capital: the largest harbour, and the only grand one", () => {
    // Every named slip at the SAME supply band, so nothing here comes from the
    // data — this is purely the capital's plan against the others'.
    const capital = createDock(dock("ethereum", 10), DISPLAY_TILE, ISLAND_TILE);
    const rivals = NAMED_CHAINS
      .filter((chainId) => chainId !== "ethereum")
      .map((chainId) => createDock(dock(chainId, 10), DISPLAY_TILE, ISLAND_TILE));

    for (const rival of rivals) {
      expect(capital.footprint.length, rival.dock.chainId)
        .toBeGreaterThan(rival.footprint.length);
      expect(capital.footprint.span, rival.dock.chainId)
        .toBeGreaterThan(rival.footprint.span);
      expect(rival.identity.enclosure).not.toBe("grand");
    }
    // A campanile AND a gantry AND an enclosed basin: no rival has all three.
    expect(capital.identity.enclosure).toBe("grand");
    expect(capital.identity.landmark).toBe("campanile");
    expect(capital.root.getObjectByName("dock-crane")).toBeDefined();
    expect(capital.root.getObjectByName("dock-breakwater")).toBeDefined();
  });

  it("still orders harbour scale by the chain's own supply", () => {
    const scaleOf = (totalUsd: number): number =>
      createDock(dock("aptos", 6, null, totalUsd), DISPLAY_TILE, ISLAND_TILE).footprint.length;
    expect(scaleOf(500_000_000)).toBeLessThan(scaleOf(5_000_000_000));
    expect(scaleOf(5_000_000_000)).toBeLessThan(scaleOf(80_000_000_000));
  });

  it("builds structurally different harbours for different chains", () => {
    // Not colour, not a prop: two named chains must differ in the meshes they
    // build and in the vertex counts of those meshes.
    const tron = createDock(dock("tron", 9), DISPLAY_TILE, ISLAND_TILE);
    const hyperliquid = createDock(dock("hyperliquid", 9), DISPLAY_TILE, ISLAND_TILE);
    expect(structureFingerprint(tron)).not.toBe(structureFingerprint(hyperliquid));
    // Tron encloses a basin behind a hooked mole; Hyperliquid is an open
    // roadstead with no sea defence at all.
    expect(tron.root.getObjectByName("dock-breakwater")).toBeDefined();
    expect(hyperliquid.root.getObjectByName("dock-breakwater")).toBeUndefined();

    // And across the named slips, no two harbours share an identity.
    const identities = new Set(
      NAMED_CHAINS.map((chainId) => {
        const { enclosure, landmark, plan, roofline, works } = harborIdentity(dock(chainId, 6));
        return `${plan}|${enclosure}|${landmark}|${roofline}|${works}`;
      }),
    );
    expect(identities.size).toBe(NAMED_CHAINS.length);
  });

  it("gives an unlisted chain a coherent harbour, deterministically", () => {
    const identity = harborIdentity(dock("some-unlisted-chain", 5));
    expect(identity).toEqual(harborIdentity(dock("some-unlisted-chain", 5)));
    // The fallback never hands out the capital's architecture.
    expect(identity.enclosure).not.toBe("grand");
  });

  it("builds the same harbour geometry on every call", () => {
    for (const chainId of ["ethereum", "solana", "avalanche"]) {
      const first = createDock(dock(chainId, 8), DISPLAY_TILE, ISLAND_TILE);
      const second = createDock(dock(chainId, 8), DISPLAY_TILE, ISLAND_TILE);
      expect(structureFingerprint(second), chainId).toBe(structureFingerprint(first));
      expect(second.footprint, chainId).toEqual(first.footprint);
    }
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

/** The chains with an authored slip in CHAIN_HARBOR_IDENTITIES. */
const NAMED_CHAINS = [
  "aptos",
  "arbitrum",
  "avalanche",
  "base",
  "bsc",
  "ethereum",
  "hyperliquid",
  "polygon",
  "solana",
  "ton",
  "tron",
];

function dock(
  chainId: string,
  size: number,
  backingDiversity: number | null = null,
  totalUsd = size * 1_000_000_000,
): DockNode {
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
    totalUsd,
  };
}

/**
 * A structural signature of a built harbour: which meshes exist, how much
 * geometry each carries, and a checksum of the vertex positions. Two harbours
 * with the same fingerprint are the same building, whatever colour they are.
 */
function structureFingerprint(visual: ReturnType<typeof createDock>): string {
  const entries: string[] = [];
  visual.root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const position = object.geometry.getAttribute("position");
    let checksum = 0;
    for (let index = 0; index < position.array.length; index += 1) {
      checksum = (checksum + Math.round(position.array[index]! * 1e4) * (index + 1)) % 2_147_483_647;
    }
    const instances = object instanceof InstancedMesh ? object.count : 1;
    entries.push(`${object.name}:${position.count}:${instances}:${checksum}`);
  });
  return entries.sort().join("|");
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
