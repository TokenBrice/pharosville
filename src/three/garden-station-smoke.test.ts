import { DataTexture, RGBAFormat } from "three";
import { describe, expect, it } from "vitest";
import type { PharosVilleRenderSchedulerTier } from "../renderer/render-types";
import { stationScaleFor, type StationType } from "../systems/dock-layout";
import type { DockCargoTide, DockNode } from "../systems/world-types";
import type { DockVisual } from "./garden-docks";
import { authorDock } from "./garden-docks";
import { createGardenHarborBatch, type GardenHarborBatch } from "./garden-harbor-batch";
import {
  createGardenStationSmoke,
  STATION_SMOKE_ARCHETYPES,
  STATION_SMOKE_MAX_INSTANCES,
  STATION_SMOKE_OPACITY,
  STATION_SMOKE_PUFFS_PER_CHIMNEY,
  stationSmokeOpacity,
  stationSmokeSpecs,
  type GardenStationSmoke,
} from "./garden-station-smoke";

const ISLAND_TILE = { x: 18, y: 28 };
const HEARTH_TYPES: readonly StationType[] = ["uogashi", "hatago-wharf", "tea-house-quay"];
const OTHER_TYPES: readonly StationType[] = [
  "ethereum-mole",
  "stepped-inlet",
  "fishing-pier",
  "reed-boathouse",
  "storm-mole",
  "pigeonnier-islet",
];
function dockNode(chainId: string, type: StationType, totalUsd: number, tide?: DockCargoTide): DockNode {
  return {
    chainId,
    detailId: `dock.${chainId}`,
    healthBand: "healthy",
    id: `dock.${chainId}`,
    kind: "dock",
    label: chainId,
    size: 6,
    stablecoinCount: 1,
    station: { coveId: `cove.${chainId}`, shoreBearing: 0.7, type },
    tile: { x: 40, y: 32 },
    totalUsd,
    ...(tide ? { cargoTide: tide } : {}),
  } as DockNode;
}

function batchFor(types: readonly StationType[]): GardenHarborBatch {
  return createGardenHarborBatch(types.map((type, index) => authorDock(
    dockNode(`smoke-${type}`, type, 1_000_000_000 + index * 500_000_000),
    { x: 32 + index * 4, y: 40 + (index % 3) * 5 },
    ISLAND_TILE,
  )));
}

function activeTide(): DockCargoTide {
  return {
    burnVolumeUsd: 1_000_000,
    coinCount: 1,
    direction: "minting",
    mintVolumeUsd: 9_000_000,
    netFlowUsd: 8_000_000,
    pressureScore: 66,
    reason: "tracked",
    tracked: true,
  };
}

function noise(): DataTexture {
  return new DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, RGBAFormat);
}

function meshOf(smoke: GardenStationSmoke) {
  const mesh = smoke.root.getObjectByName("dock-station-smoke-puffs");
  expect(mesh).toBeDefined();
  return mesh as unknown as {
    count: number;
    visible: boolean;
    geometry: {
      getAttribute: (name: string) => { getX: (index: number) => number };
    };
    material: { uniforms: Record<string, { value: unknown }> };
  };
}

const BASE_UPDATE = {
  docks: [] as readonly DockVisual[],
  phase: { daylight: 1, dusk: 0 },
  reducedMotion: false,
  timeSeconds: 12,
  tier: "full" as PharosVilleRenderSchedulerTier,
};

describe("stationSmokeSpecs", () => {
  it("exposes one ridge chimney for each hearth archetype and none for the rest", () => {
    const batch = batchFor([...HEARTH_TYPES, ...OTHER_TYPES]);
    const specs = stationSmokeSpecs(batch.docks);
    expect(specs.map((spec) => spec.archetype).sort()).toEqual([...STATION_SMOKE_ARCHETYPES].sort());
    for (const type of OTHER_TYPES) {
      expect(specs.some((spec) => spec.detailId === `dock.smoke-${type}`)).toBe(false);
    }
    batch.dispose();
  });

  it("keeps one chimney per archetype even when several stations share it", () => {
    const types: readonly StationType[] = ["uogashi", "uogashi", "hatago-wharf", "tea-house-quay"];
    const batch = createGardenHarborBatch(types.map((type, index) => authorDock(
      dockNode(`${type}.${index}`, type, index === 0 ? 5_000_000_000 : 1_000_000_000),
      { x: 32 + index * 5, y: 42 },
      ISLAND_TILE,
    )));
    const specs = stationSmokeSpecs(batch.docks);
    expect(specs).toHaveLength(3);
    // The representative is the largest harbour, not the first rendered.
    expect(specs.find((spec) => spec.archetype === "uogashi")?.detailId).toBe("dock.uogashi.0");
    batch.dispose();
  });

  it("anchors sit on the three archetypes' ridges", () => {
    const totalUsd = 4_000_000_000;
    for (const type of HEARTH_TYPES) {
      const recipe = authorDock(
        dockNode(`ridge-${type}`, type, totalUsd),
        { x: 36, y: 44 },
        ISLAND_TILE,
      );
      const { chimney, footprint } = recipe;
      expect(chimney, type).not.toBeNull();
      const scale = stationScaleFor(type, totalUsd);
      // Every anchor stays inside the authored local footprint.
      expect(chimney!.x, type).toBeGreaterThanOrEqual(footprint.minX);
      expect(chimney!.x, type).toBeLessThanOrEqual(footprint.maxX);
      expect(chimney!.z, type).toBeGreaterThanOrEqual(footprint.minZ);
      expect(chimney!.z, type).toBeLessThanOrEqual(footprint.maxZ);
      if (type === "uogashi") {
        // The kitchen's mono-pitch ridge is the landward edge of the span.
        expect(chimney!.z, type).toBeCloseTo(-scale.span / 2, 6);
        expect(chimney!.y, type).toBeGreaterThan(5.5 * scale.heightScale);
        expect(chimney!.y, type).toBeLessThanOrEqual(scale.secondLevelTop);
      } else {
        // Both irimoya ridges run along x through z = 0.
        expect(chimney!.z, type).toBeCloseTo(0, 6);
        const ridgeY = type === "hatago-wharf"
          ? scale.secondLevelTop
          : 6.35 * scale.heightScale;
        expect(chimney!.y, type).toBeCloseTo(ridgeY, 6);
        if (type === "tea-house-quay") {
          // Clear of the moon-window loft (half-width 1.9) seated on the ridge.
          const hallX = chimney!.x + scale.length * 0.28;
          expect(Math.abs(chimney!.x - hallX), type).toBeGreaterThan(1.9);
        }
      }
    }
  });

  it("turns the local anchor through the dock's own yaw and position", () => {
    const batch = batchFor(HEARTH_TYPES);
    const visual = batch.docks.find((dock) => dock.recipe.plan === "hatago-wharf")!;
    const spec = stationSmokeSpecs(batch.docks).find((entry) => entry.archetype === "hatago-wharf")!;
    const { anchorPosition, chimney } = visual.recipe;
    // A rotation preserves the anchor's radius and lifts y by the chimney's.
    const horizontal = Math.hypot(spec.anchor.x - anchorPosition.x, spec.anchor.z - anchorPosition.z);
    expect(horizontal).toBeCloseTo(Math.hypot(chimney!.x, chimney!.z), 6);
    expect(spec.anchor.y).toBeCloseTo(anchorPosition.y + chimney!.y, 6);
    batch.dispose();
  });
});

describe("createGardenStationSmoke", () => {
  it("builds at most 24 instances across the three chimneys", () => {
    const batch = batchFor([...HEARTH_TYPES, ...OTHER_TYPES]);
    const specs = stationSmokeSpecs(batch.docks);
    expect(specs).toHaveLength(3);
    const smoke = createGardenStationSmoke(specs, noise());
    expect(smoke.chimneyCount).toBe(3);
    expect(smoke.instanceCapacity).toBe(STATION_SMOKE_PUFFS_PER_CHIMNEY * 3);
    expect(smoke.instanceCapacity).toBeLessThanOrEqual(STATION_SMOKE_MAX_INSTANCES);
    smoke.update({ ...BASE_UPDATE, docks: batch.docks });
    expect(meshOf(smoke).count).toBeLessThanOrEqual(STATION_SMOKE_MAX_INSTANCES);
    smoke.dispose();
    batch.dispose();
  });

  it("smokes only while the harbour's cargo tide stands crates", () => {
    const batch = batchFor(HEARTH_TYPES);
    const docks = batch.docks;
    const uogashi = docks.find((dock) => dock.recipe.plan === "uogashi")!;
    const smoke = createGardenStationSmoke(stationSmokeSpecs(docks), noise());
    const mesh = meshOf(smoke);

    smoke.update({ ...BASE_UPDATE, docks });
    expect(mesh.visible).toBe(false);

    uogashi.recipe.dock.cargoTide = activeTide();
    smoke.update({ ...BASE_UPDATE, docks });
    expect(mesh.visible).toBe(true);
    const gates = (archetypeIndex: number) => Array.from({ length: STATION_SMOKE_PUFFS_PER_CHIMNEY }, (_, puff) => (
      mesh.geometry.getAttribute("aGate").getX(puff * 3 + archetypeIndex)
    ));
    expect(gates(0).every((gate) => gate === 1)).toBe(true);
    expect(gates(1).every((gate) => gate === 0)).toBe(true);
    expect(gates(2).every((gate) => gate === 0)).toBe(true);

    delete uogashi.recipe.dock.cargoTide;
    smoke.update({ ...BASE_UPDATE, docks });
    expect(mesh.visible).toBe(false);
    expect(gates(0).every((gate) => gate === 0)).toBe(true);
    smoke.dispose();
    batch.dispose();
  });

  it("fades through the day-first opacity ladder, day above dusk above night", () => {
    expect(stationSmokeOpacity({ daylight: 1, dusk: 0 })).toBe(STATION_SMOKE_OPACITY.day);
    expect(stationSmokeOpacity({ daylight: 0, dusk: 1 })).toBe(STATION_SMOKE_OPACITY.dusk);
    expect(stationSmokeOpacity({ daylight: 0, dusk: 0 })).toBe(STATION_SMOKE_OPACITY.night);
    expect(STATION_SMOKE_OPACITY.day).toBeGreaterThan(STATION_SMOKE_OPACITY.dusk);
    expect(STATION_SMOKE_OPACITY.dusk).toBeGreaterThan(STATION_SMOKE_OPACITY.night);

    const batch = batchFor(HEARTH_TYPES);
    batch.docks[0]!.recipe.dock.cargoTide = activeTide();
    const smoke = createGardenStationSmoke(stationSmokeSpecs(batch.docks), noise());
    const mesh = meshOf(smoke);
    smoke.update({ ...BASE_UPDATE, docks: batch.docks, phase: { daylight: 0, dusk: 0 } });
    expect(mesh.material.uniforms.uOpacity!.value).toBeCloseTo(STATION_SMOKE_OPACITY.night, 6);
    expect(mesh.material.uniforms.uDayMix!.value).toBeCloseTo(0, 6);
    smoke.dispose();
    batch.dispose();
  });

  it("pins to the deterministic t=0 pose under reduced motion", () => {
    const batch = batchFor(HEARTH_TYPES);
    const smoke = createGardenStationSmoke(stationSmokeSpecs(batch.docks), noise());
    const mesh = meshOf(smoke);
    const uniforms = (mesh.material.uniforms as { uTime: { value: number } });

    smoke.update({ ...BASE_UPDATE, docks: batch.docks, reducedMotion: true, timeSeconds: 90 });
    expect(uniforms.uTime.value).toBe(0);
    smoke.update({ ...BASE_UPDATE, docks: batch.docks, reducedMotion: true, timeSeconds: 400 });
    expect(uniforms.uTime.value).toBe(0);

    smoke.update({ ...BASE_UPDATE, docks: batch.docks, timeSeconds: 25 });
    expect(uniforms.uTime.value).toBe(25);
    smoke.dispose();
    batch.dispose();
  });

  it("sheds per scheduler tier without reallocating", () => {
    const batch = batchFor(HEARTH_TYPES);
    batch.docks[0]!.recipe.dock.cargoTide = activeTide();
    const smoke = createGardenStationSmoke(stationSmokeSpecs(batch.docks), noise());
    const mesh = meshOf(smoke);

    smoke.update({ ...BASE_UPDATE, docks: batch.docks, tier: "full" });
    expect(mesh.count).toBe(24);
    expect(mesh.visible).toBe(true);

    smoke.update({ ...BASE_UPDATE, docks: batch.docks, tier: "balanced" });
    expect(mesh.count).toBe(12);

    smoke.update({ ...BASE_UPDATE, docks: batch.docks, tier: "constrained" });
    expect(mesh.count).toBe(0);
    expect(mesh.visible).toBe(false);
    smoke.dispose();
    batch.dispose();
  });
});
