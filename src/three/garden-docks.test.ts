import { Color, Matrix4 } from "three";
import { describe, expect, it } from "vitest";
import type { DockNode } from "../systems/world-types";
import { HARBOR_PALETTE } from "../systems/palette";
import {
  authorDock,
  authorPrecinctBridge,
  gardenHarborCalmMask,
  harborIdentity,
  type DockRecipe,
  type StationType,
} from "./garden-docks";
import { createGardenHarborBatch } from "./garden-harbor-batch";
import { dockFixture as dock, ISLAND_TILE } from "./__fixtures__/harbor";

const DISPLAY_TILE = { x: 40, y: 32 };
const ARCHETYPES: readonly StationType[] = [
  "boathouse-precinct", "annex-pavilion", "gate-landing", "tea-house-quay",
  "fishing-pier", "stepped-inlet", "reed-boathouse", "pigeonnier-islet",
];

describe("garden station recipes", () => {
  it("authors one explicit roofline, flag shape, and signature per station type", () => {
    const identities = ARCHETYPES.map((type) => recipeWithStation(type).identity);
    expect(new Set(identities.map((identity) => identity.roofline)).size).toBe(ARCHETYPES.length);
    expect(new Set(identities.map((identity) => identity.flagShape)).size).toBe(ARCHETYPES.length);
    expect(new Set(identities.map((identity) => identity.signature)).size).toBe(ARCHETYPES.length);
    for (const type of ARCHETYPES) expect(recipeWithStation(type).station.type).toBe(type);
  });

  it("uses the incoming shore bearing and keeps local +X seaward", () => {
    const bearing = 1.17;
    const recipe = recipeWithStation("gate-landing", "gate", bearing);
    expect(recipe.anchorRotationY).toBeCloseTo(-bearing, 6);
    expect(recipe.station.shoreBearing).toBe(bearing);
  });

  it("falls back to legacy identity and island bearing while B2 is absent", () => {
    const { station: _ethereumStation, ...ethereumWithoutStation } = dock("ethereum", 10);
    const { station: _baseStation, ...baseWithoutStation } = dock("base", 6);
    const recipe = authorDock(ethereumWithoutStation as DockNode, DISPLAY_TILE, ISLAND_TILE);
    expect(recipe.station.type).toBe("boathouse-precinct");
    expect(recipe.station.coveId).toBe("legacy.ethereum");
    expect(recipe.anchorRotationY).toBeCloseTo(-Math.atan2(4, 22), 6);
    expect(harborIdentity(baseWithoutStation as DockNode).stationType).toBe("annex-pavilion");
  });

  it("makes Ethereum the largest station and gives only it the bell-tower silhouette", () => {
    const capital = recipeWithStation("boathouse-precinct", "ethereum");
    const others = ARCHETYPES.slice(1).map((type, index) => recipeWithStation(type, `chain-${index}`));
    for (const other of others) {
      expect(capital.footprint.length).toBeGreaterThan(other.footprint.length);
      expect(capital.footprint.span).toBeGreaterThan(other.footprint.span);
    }
    expect(capital.identity.signature).toBe("moon-viewing-deck");
    expect(maxGeometryY(capital)).toBeGreaterThan(5);
    expect(Math.max(...others.map(maxGeometryY))).toBeLessThan(5);
  });

  it("keeps industrial identity props out and permits one works prop at most", () => {
    for (const type of ARCHETYPES) {
      const recipe = recipeWithStation(type);
      expect(recipe.props.some((prop) => ["crate", "barrel", "crane", "gantry", "derrick"].includes(prop.kind))).toBe(false);
      const works = recipe.props.filter((prop) => prop.kind === "netRack" || prop.kind === "reedClump");
      expect(works.length, type).toBeLessThanOrEqual(1);
    }
    expect(recipeWithStation("fishing-pier").props.filter((prop) => prop.kind === "netRack")).toHaveLength(1);
    expect(recipeWithStation("reed-boathouse").props.filter((prop) => prop.kind === "reedClump")).toHaveLength(1);
  });

  it("retains masonry health tint, cracks, and one leaning bollard", () => {
    const weak = {
      ...dock("bsc", 7),
      healthFactors: {
        backingDiversity: 0.12,
        chainEnvironment: 0.22,
        concentration: 0.84,
        pegStability: 0.3,
        quality: 0.18,
      },
    } satisfies DockNode;
    const recipe = authorDock(weak, DISPLAY_TILE, ISLAND_TILE);
    const cracks = recipe.parts.find((part) => (
      part.color.getHexString() === new Color(HARBOR_PALETTE.iron_dark).getHexString()
      && !part.fineDetail
    ));
    expect(cracks?.bucket).toBe("stone");
    const bollard = recipe.props.find((prop) => prop.kind === "bollard")!;
    expect(Math.abs(bollard.matrix.elements[1]!)).toBeGreaterThan(0.05);
  });

  it("keeps station scale monotonic with supply", () => {
    const scaleOf = (totalUsd: number): number => authorDock(
      dock("solana", 6, null, totalUsd), DISPLAY_TILE, ISLAND_TILE,
    ).footprint.length;
    expect(scaleOf(500_000_000)).toBeLessThan(scaleOf(5_000_000_000));
    expect(scaleOf(5_000_000_000)).toBeLessThan(scaleOf(80_000_000_000));
  });

  it("authors deterministic covered bridges only to annexes in the precinct arc", () => {
    const precinct = recipeWithStation("boathouse-precinct", "ethereum", 0, { x: 14, y: 74 });
    const annex = recipeWithStation("annex-pavilion", "base", 0, { x: 14, y: 80 });
    const bridge = authorPrecinctBridge(precinct, annex);
    expect(bridge.map((part) => part.bucket)).toEqual(["timber", "roof"]);
    expect(bridge.every((part) => part.geometry.getAttribute("position").count > 0)).toBe(true);
    const postPairs = bridge[0]!.geometry.userData.precinctBridgePostPairs as Array<{
      left: { x: number; z: number };
      right: { x: number; z: number };
      yaw: number;
    }>;
    const diagonal = postPairs.find((pair) => Math.abs(Math.sin(pair.yaw)) > 0.1)!;
    const across = {
      x: diagonal.right.x - diagonal.left.x,
      z: diagonal.right.z - diagonal.left.z,
    };
    expect(Math.hypot(across.x, across.z)).toBeCloseTo(0.62, 6);
    expect(across.x * Math.cos(diagonal.yaw) - across.z * Math.sin(diagonal.yaw)).toBeCloseTo(0, 6);
    expect(fingerprint(bridge)).toBe(fingerprint(authorPrecinctBridge(precinct, annex)));
    expect(authorPrecinctBridge(annex, precinct)).toEqual([]);
    const far = recipeWithStation("annex-pavilion", "polygon", 0, { x: 14, y: 100 });
    expect(authorPrecinctBridge(precinct, far)).toEqual([]);
  });

  it("flies camera-facing flags and restores reduced-motion pose", () => {
    const recipe = recipeWithStation("annex-pavilion", "base", Math.PI / 2);
    expect(recipe.anchorRotationY + recipe.flag.placement.yaw).toBeCloseTo(Math.PI / 4, 6);
    const batch = createGardenHarborBatch([recipe]);
    const before = new Matrix4();
    const restored = new Matrix4();
    batch.flags.getMatrixAt(0, before);
    batch.setFlagPose("base", -1.2, 0.08);
    batch.setFlagPose("base", recipe.flag.placement.yaw, 0);
    batch.flags.getMatrixAt(0, restored);
    expect(restored.equals(before)).toBe(true);
    batch.dispose();
  });

  it("keeps lamp registration and the composed calm-mask contract", () => {
    const batch = createGardenHarborBatch([
      recipeWithStation("boathouse-precinct", "ethereum", 0, { x: 42, y: 31 }),
      recipeWithStation("fishing-pier", "solana", 0, { x: 25, y: 23 }),
    ]);
    expect(batch.docks.every((visual) => visual.recipe.lampWorldPositions.length >= 1)).toBe(true);
    const mask = gardenHarborCalmMask(batch.docks)!;
    expect(mask.radiusX).toBeGreaterThanOrEqual(9);
    expect(mask.radiusX).toBeLessThanOrEqual(18);
    expect(mask.radiusZ).toBeGreaterThanOrEqual(7);
    expect(mask.radiusZ).toBeLessThanOrEqual(13);
    expect(gardenHarborCalmMask([])).toBeNull();
    batch.dispose();
  });
});

function recipeWithStation(
  type: StationType,
  chainId: string = type,
  shoreBearing = 0,
  tile = DISPLAY_TILE,
): DockRecipe {
  const node = {
    ...dock(chainId, 7),
    station: { coveId: `cove.${chainId}`, shoreBearing, type },
    tile,
  } as DockNode & { station: { coveId: string; shoreBearing: number; type: StationType } };
  return authorDock(node, tile, ISLAND_TILE);
}

function maxGeometryY(recipe: DockRecipe): number {
  let max = -Infinity;
  for (const part of recipe.parts) {
    const position = part.geometry.getAttribute("position");
    for (let index = 0; index < position.count; index += 1) max = Math.max(max, position.getY(index));
  }
  return max;
}

function fingerprint(parts: DockRecipe["parts"]): string {
  return parts.map((part) => {
    const position = part.geometry.getAttribute("position");
    let sum = 0;
    for (let index = 0; index < position.array.length; index += 1) sum += Math.round(position.array[index]! * 1e4) * (index + 1);
    return `${part.bucket}:${position.count}:${sum}`;
  }).join("|");
}
