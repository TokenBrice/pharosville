import { Color, Matrix4 } from "three";
import { describe, expect, it } from "vitest";
import type { DockNode } from "../systems/world-types";
import { HARBOR_PALETTE } from "../systems/palette";
import { EVM_BAY_STATION_SLOTS, OUTER_HARBOR_STATION_SLOTS } from "../systems/world-layout";
import {
  authorDock,
  gardenHarborLanternWorldPositions,
  gardenHarborCalmMask,
  HARBOR_FLAG_SCALE_MULTIPLIER,
  harborIdentity,
  type DockRecipe,
  type StationType,
} from "./garden-docks";
import { createGardenHarborBatch } from "./garden-harbor-batch";
import { dockFixture as dock, ISLAND_TILE } from "./__fixtures__/harbor";

const DISPLAY_TILE = { x: 40, y: 32 };
// The nine surviving archetypes (2026-09-04 cutover): annex-pavilion,
// salvage-slip, signal-jetty and gate-landing are deleted; boathouse-precinct
// is renamed ethereum-mole; hatago-wharf and uogashi join the roster.
const ARCHETYPES: readonly StationType[] = [
  "ethereum-mole", "hatago-wharf", "uogashi", "stepped-inlet", "fishing-pier",
  "tea-house-quay", "reed-boathouse", "storm-mole", "pigeonnier-islet",
];
const SCALE_LADDER: Record<StationType, { length: number; span: number; top: number }> = {
  "ethereum-mole": { length: 24.0, span: 10.0, top: 21.5 },
  "stepped-inlet": { length: 16.0, span: 7.8, top: 9.4 },
  "fishing-pier": { length: 15.4, span: 6.7, top: 8.3 },
  "tea-house-quay": { length: 15.0, span: 7.4, top: 10.7 },
  "hatago-wharf": { length: 14.6, span: 6.6, top: 11.8 },
  uogashi: { length: 14.2, span: 7.8, top: 7.2 },
  "storm-mole": { length: 13.4, span: 8.8, top: 12.1 },
  "reed-boathouse": { length: 13.6, span: 6.0, top: 11.2 },
  "pigeonnier-islet": { length: 12.6, span: 5.6, top: 8.6 },
};
const FIXTURE_USD = 7_000_000_000;
const fixtureSupplyFactor = Math.min(1, Math.max(0, (Math.log10(FIXTURE_USD) - 8.5) / 3.2));
const fixtureLengthMultiplier = 0.95 + fixtureSupplyFactor * 0.40;
const fixtureHeightMultiplier = 0.95 + fixtureSupplyFactor * 0.15;
const EMITTED_ARCHETYPES: readonly StationType[] = [...new Set([
  ...EVM_BAY_STATION_SLOTS,
  ...OUTER_HARBOR_STATION_SLOTS,
].map((slot) => slot.type))];

describe("garden station recipes", () => {
  it("authors one explicit roofline, flag shape, and signature per station type", () => {
    const identities = ARCHETYPES.map((type) => recipeWithStation(type).identity);
    expect(new Set(identities.map((identity) => identity.roofline)).size).toBe(ARCHETYPES.length);
    expect(new Set(identities.map((identity) => identity.flagShape)).size).toBe(ARCHETYPES.length);
    expect(new Set(identities.map((identity) => identity.signature)).size).toBe(ARCHETYPES.length);
    expect(new Set(identities.map((identity) => identity.secondLevel)).size).toBe(ARCHETYPES.length);
    for (const type of ARCHETYPES) expect(recipeWithStation(type).station.type).toBe(type);
  });

  it("uses the incoming shore bearing and keeps local +X seaward", () => {
    const bearing = 1.17;
    const recipe = recipeWithStation("hatago-wharf", "inn", bearing);
    expect(recipe.anchorRotationY).toBeCloseTo(-bearing, 6);
    expect(recipe.station.shoreBearing).toBe(bearing);
  });

  it("renders every emitted station type at its authored shore bearing", () => {
    for (const [index, type] of EMITTED_ARCHETYPES.entries()) {
      const bearing = -Math.PI + index * 0.51;
      const recipe = recipeWithStation(type, `emitted-${type}`, bearing);
      expect(recipe.station.type).toBe(type);
      expect(recipe.anchorRotationY).toBeCloseTo(-bearing, 6);
      expect(recipe.parts.some((part) => part.bucket === "roof")).toBe(true);
    }
  });

  it("gives every station a distance-readable primary mass, named second level, lit stone quay, windows, and 1.6x flag", () => {
    const secondLevels = new Set<string>();
    const roofColors = new Set<string>();
    for (const type of ARCHETYPES) {
      const recipe = recipeWithStation(type);
      const rung = SCALE_LADDER[type];
      const expectedLength = type === "ethereum-mole"
        ? rung.length
        : Math.min(20, Math.max(12.6, rung.length * fixtureLengthMultiplier));
      const expectedTop = type === "ethereum-mole" ? rung.top : rung.top * fixtureHeightMultiplier;
      expect(recipe.features.primaryMass.footprint.length, `${type} primary length`).toBeCloseTo(expectedLength, 5);
      expect(recipe.features.primaryMass.footprint.span, `${type} primary span`).toBeCloseTo(rung.span, 4);
      expect(recipe.features.primaryMass.height, `${type} primary height`).toBeGreaterThanOrEqual(type === "ethereum-mole" ? 7.0 : 5.4);
      expect(recipe.features.secondLevel.height, `${type} second-level top`).toBeCloseTo(expectedTop, 5);
      expect(recipe.features.secondLevel.height, `${type} second-level height`).toBeGreaterThan(recipe.features.primaryMass.height);
      expect(recipe.features.quayPlatform.footprint.length, `${type} quay length`).toBeGreaterThan(6.0);
      expect(recipe.features.quayPlatform.footprint.span, `${type} quay span`).toBeGreaterThan(5.0);
      expect(recipe.features.quayPlatform.height, `${type} raised quay`).toBeGreaterThanOrEqual(1.45);
      expect(recipe.features.quayPlatform.litEdge, `${type} quay light`).toBe(true);
      expect(recipe.features.warmWindowCount, `${type} warm windows`).toBeGreaterThan(0);
      expect(recipe.flag.scaleMultiplier, `${type} flag multiplier`).toBe(HARBOR_FLAG_SCALE_MULTIPLIER);
      expect(recipe.flag.scaleMultiplier).toBe(1.6);
      secondLevels.add(recipe.features.secondLevel.name);
      roofColors.add(recipe.parts.find((part) => part.bucket === "roof")!.color.getHexString());
    }
    expect(secondLevels.size).toBe(ARCHETYPES.length);
    expect(roofColors.size).toBe(ARCHETYPES.length);
    // The ordinary stations retain their authored 7.2..12.1 ordering while
    // supply raises the whole band through the §6 height multiplier. The Mole
    // alone is exempt and remains at its 21.5 local silhouette.
    const ordinaryHeights = ARCHETYPES
      .filter((type) => type !== "ethereum-mole")
      .map((type) => recipeWithStation(type).features.secondLevel.height);
    expect(Math.min(...ordinaryHeights)).toBeCloseTo(7.2 * fixtureHeightMultiplier, 5);
    expect(Math.max(...ordinaryHeights)).toBeCloseTo(12.1 * fixtureHeightMultiplier, 5);
    const moleHeight = recipeWithStation("ethereum-mole").features.secondLevel.height;
    expect(moleHeight).toBeGreaterThan(Math.max(...ordinaryHeights));
    expect(moleHeight).toBeCloseTo(21.5, 5);
  });

  it("separates every archetype on footprint area and second-level height with the mole clear ahead", () => {
    // No two of the nine archetypes may sit within 10% on BOTH footprint
    // area and second-level height — the "one pavilion, eleven hats" clone
    // failure this roster replaced — and the mole leads the largest
    // ordinary station by at least 1.20x so the landmark reads as one.
    const profiles = ARCHETYPES.map((type) => {
      const recipe = recipeWithStation(type);
      const footprint = recipe.features.primaryMass.footprint;
      return {
        type,
        area: footprint.length * footprint.span,
        length: footprint.length,
        height: recipe.features.secondLevel.height,
      };
    });
    for (let left = 0; left < profiles.length; left += 1) {
      for (let right = left + 1; right < profiles.length; right += 1) {
        const first = profiles[left]!;
        const second = profiles[right]!;
        const areaGap = Math.abs(first.area - second.area) / Math.min(first.area, second.area);
        const heightGap = Math.abs(first.height - second.height) / Math.min(first.height, second.height);
        expect(
          areaGap > 0.1 || heightGap > 0.1,
          `${first.type}/${second.type}: area gap ${(areaGap * 100).toFixed(1)}%, height gap ${(heightGap * 100).toFixed(1)}%`,
        ).toBe(true);
      }
    }
    const mole = profiles.find((profile) => profile.type === "ethereum-mole")!;
    const largestOrdinaryLength = Math.max(
      ...profiles.filter((profile) => profile.type !== "ethereum-mole").map((profile) => profile.length),
    );
    expect(mole.length).toBeGreaterThanOrEqual(largestOrdinaryLength * 1.2);
  });

  it("scales chain-station roof mass by supply with clamped length while keeping the Mole fixed", () => {
    for (const type of ARCHETYPES) {
      const rung = SCALE_LADDER[type];
      const low = recipeWithStation(type, `low-${type}`, 0, DISPLAY_TILE, 1);
      const high = recipeWithStation(type, `high-${type}`, 0, DISPLAY_TILE, 1e20);
      if (type === "ethereum-mole") {
        expect(low.features.primaryMass.footprint.length).toBeCloseTo(rung.length, 5);
        expect(high.features.primaryMass.footprint.length).toBeCloseTo(rung.length, 5);
        expect(low.features.secondLevel.height).toBeCloseTo(rung.top, 5);
        expect(high.features.secondLevel.height).toBeCloseTo(rung.top, 5);
        continue;
      }
      expect(low.features.primaryMass.footprint.length).toBeCloseTo(Math.max(12.6, rung.length * 0.95), 5);
      expect(high.features.primaryMass.footprint.length).toBeCloseTo(Math.min(20, rung.length * 1.35), 5);
      expect(low.features.secondLevel.height).toBeCloseTo(rung.top * 0.95, 5);
      expect(high.features.secondLevel.height).toBeCloseTo(rung.top * 1.1, 5);
    }
  });

  it("gives every station roof a ridge, eave and gable profile instead of a flat plane", () => {
    for (const type of ARCHETYPES) {
      const recipe = recipeWithStation(type);
      const roofParts = recipe.parts.filter((part) => part.bucket === "roof");
      // The field part stays the station's ladder colour; a second, darker
      // trim part carries the ridge cap, fascia shadow lines and gable plate.
      expect(roofParts.length, `${type} roof parts`).toBeGreaterThanOrEqual(2);
      const [field, trim] = roofParts;
      const fieldProfile = field.geometry.userData.roofField as { fieldShells: number; fieldTriangles: number };
      expect(fieldProfile.fieldShells, `${type} field shells`).toBeGreaterThanOrEqual(1);
      // A flat single quad is 2 triangles; every articulated field breaks up.
      expect(fieldProfile.fieldTriangles, `${type} field triangles`).toBeGreaterThanOrEqual(6);
      const trimProfile = trim.geometry.userData.roofTrim as {
        brackets: number; fascias: number; gablePlates: number;
        ridgeCaps: number; ridgeBeams: number; surfaceBreaks: number;
      };
      expect(trimProfile.ridgeCaps, `${type} ridge cap`).toBeGreaterThanOrEqual(1);
      expect(trimProfile.fascias, `${type} eave fascias`).toBeGreaterThanOrEqual(4);
      expect(trimProfile.gablePlates, `${type} gable plate`).toBeGreaterThanOrEqual(1);
      expect(trimProfile.brackets, `${type} eave brackets`).toBeGreaterThanOrEqual(4);
      expect(trimProfile.surfaceBreaks, `${type} surface break`).toBeGreaterThanOrEqual(1);
      const luminance = (color: Color) => color.r + color.g + color.b;
      expect(luminance(trim.color), `${type} trim darker than field`).toBeLessThan(luminance(field.color));
      const structure = recipe.parts.find((part) => part.bucket === "timber")!.geometry.userData.roofStructure as { brackets: number; ridgeBeams: number };
      expect(structure.ridgeBeams, `${type} ridge beam`).toBeGreaterThanOrEqual(1);
      expect(structure.brackets, `${type} structural brackets`).toBeGreaterThanOrEqual(4);
    }
  });

  it("falls back to legacy identity and island bearing while B2 is absent", () => {
    const { station: _ethereumStation, ...ethereumWithoutStation } = dock("ethereum", 10);
    const { station: _baseStation, ...baseWithoutStation } = dock("base", 6);
    const recipe = authorDock(ethereumWithoutStation as DockNode, DISPLAY_TILE, ISLAND_TILE);
    expect(recipe.station.type).toBe("ethereum-mole");
    expect(recipe.station.coveId).toBe("legacy.ethereum");
    expect(recipe.anchorRotationY).toBeCloseTo(-Math.atan2(4, 22), 6);
    expect(harborIdentity(baseWithoutStation as DockNode).stationType).toBe("hatago-wharf");
  });

  it("makes Ethereum the largest station and gives only it the bell-tower silhouette", () => {
    const capital = recipeWithStation("ethereum-mole", "ethereum");
    const others = ARCHETYPES.filter((type) => type !== "ethereum-mole")
      .map((type, index) => recipeWithStation(type, `chain-${index}`));
    for (const other of others) {
      expect(capital.footprint.length).toBeGreaterThan(other.footprint.length);
      expect(capital.footprint.span).toBeGreaterThan(other.footprint.span);
    }
    expect(capital.identity.signature).toBe("moon-viewing-deck");
    expect(capital.identity.secondLevel).toBe("bell-tower");
    expect(others.every((other) => other.identity.secondLevel !== "bell-tower")).toBe(true);
    expect(capital.features.secondLevel.height - capital.features.primaryMass.height).toBeGreaterThanOrEqual(3);
    expect(maxGeometryY(capital)).toBeGreaterThan(11);
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


  it("flies camera-facing flags and restores reduced-motion pose", () => {
    const recipe = recipeWithStation("hatago-wharf", "base", Math.PI / 2);
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

  it("roots approach lanterns at each remote station and offsets them seaward", () => {
    const recipes = [
      authorDock({
        ...dock("base", 7),
        station: { coveId: "left-cove", type: "hatago-wharf", shoreBearing: 0 },
      }, { x: 14, y: 80 }, ISLAND_TILE),
      authorDock({
        ...dock("solana", 7),
        station: { coveId: "right-cove", type: "tea-house-quay", shoreBearing: Math.PI },
      }, { x: 131, y: 80 }, ISLAND_TILE),
    ];
    const positions = gardenHarborLanternWorldPositions(recipes);

    expect(positions).toHaveLength(4);
    for (const [recipeIndex, recipe] of recipes.entries()) {
      const bearing = recipe.station.shoreBearing;
      for (const lantern of positions.slice(recipeIndex * 2, recipeIndex * 2 + 2)) {
        const offsetX = lantern.x - recipe.anchorPosition.x;
        const offsetZ = lantern.z - recipe.anchorPosition.z;
        expect(offsetX * Math.cos(bearing) + offsetZ * Math.sin(bearing)).toBeCloseTo(1.25);
      }
    }
  });

  it("keeps lamp registration and the composed calm-mask contract", () => {
    const batch = createGardenHarborBatch([
      recipeWithStation("ethereum-mole", "ethereum", 0, { x: 42, y: 31 }),
      recipeWithStation("fishing-pier", "solana", 0, { x: 25, y: 23 }),
    ]);
    expect(batch.docks.every((visual) => visual.recipe.lampWorldPositions.length >= 1)).toBe(true);
    const mask = gardenHarborCalmMask(batch.docks)!;
    expect(mask.radiusX).toBeGreaterThanOrEqual(9);
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
  totalUsd = FIXTURE_USD,
): DockRecipe {
  const node = {
    ...dock(chainId, 7, null, totalUsd),
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
