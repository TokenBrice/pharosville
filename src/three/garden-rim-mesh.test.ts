import { InstancedMesh, Matrix4, Mesh, MeshStandardMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import { distanceToStationFootprint, stationFootprintRect } from "../systems/dock-layout";
import { RIM_COVES, RIM_OPENINGS, rimLandAt } from "../systems/garden-rim";
import {
  EVM_BAY_STATION_SLOTS,
  OUTER_HARBOR_STATION_SLOTS,
  PIGEONNIER_STATION_SLOT,
} from "../systems/world-layout";
import { weatherForFrame } from "../systems/weather";
import {
  createGardenRimMesh,
  GARDEN_ENGAWA_DISPLACEMENT,
  GARDEN_ENGAWA_LANTERN_WORLD,
  GARDEN_ENGAWA_PINE_HEIGHT,
  gardenRimBayExcursionAt,
  GARDEN_NEAR_RIM_BAY_DEPTHS,
  GARDEN_NEAR_RIM_DISPLACEMENT,
  GARDEN_NEAR_RIM_MIN_TERRACE_HEIGHT,
  GARDEN_NEAR_RIM_SKIRT_DISPLACEMENT,
} from "./garden-rim-mesh";
import { GARDEN_NIWAKI_SPECS } from "./garden-island";
import { countDrawableObjects, TILE_SCALE } from "./garden-util";

describe("garden rim mesh", () => {
  it("builds the authored ring in five batched opaque draws", () => {
    const rim = createGardenRimMesh();
    expect(rim.root.name).toBe("garden-rim");
    expect(rim.drawCallCount).toBe(5);
    expect(rim.drawCallCount).toBeLessThanOrEqual(12);
    expect(countDrawableObjects(rim.root)).toBe(5);
    expect(rim.root.getObjectByName("garden-rim-land")).toBeInstanceOf(Mesh);
    expect(rim.root.getObjectByName("garden-rim-tide-rock")).toBeInstanceOf(Mesh);
    expect(rim.root.getObjectByName("garden-rim-path")).toBeInstanceOf(Mesh);
    expect(rim.root.getObjectByName("garden-rim-pines")).toBeInstanceOf(InstancedMesh);
    expect(rim.root.getObjectByName("garden-rim-stones")).toBeInstanceOf(InstancedMesh);
    expect(rim.pineCount).toBeGreaterThan(20);
    expect(rim.engawaPineCount).toBe(1);
    expect(rim.steppingStoneCount).toBe(3);
    // 18 in-bounds stones plus 5 deterministic skirt boulders past tile 139.
    expect(rim.stoneCount).toBe(23);
    expect(GARDEN_ENGAWA_LANTERN_WORLD.x).toBeGreaterThan(0);
    expect(GARDEN_ENGAWA_LANTERN_WORLD.z).toBeGreaterThan(GARDEN_ENGAWA_LANTERN_WORLD.x);
    expect(rim.pathSegmentCount).toBeGreaterThan(80);
    // The cove-rooted rectangles retain the Mole spur without admitting
    // dressing onto any authored station geometry.
    expect(rim.coveSpurCount).toBe(8);
    expect(rim.triangleCount).toBeGreaterThan(63_000);
    expect(rim.triangleCount).toBeLessThan(85_000);
    const shore = rim.root.getObjectByName("garden-rim-tide-rock") as Mesh;
    const positions = shore.geometry.getAttribute("position");
    let contourVertices = 0;
    for (let index = 0; index < positions.count; index += 1) {
      const gridX = positions.getX(index) / (TILE_SCALE * 0.5);
      const gridZ = positions.getZ(index) / (TILE_SCALE * 0.5);
      if (Math.abs(gridX - Math.round(gridX)) > 0.01
        || Math.abs(gridZ - Math.round(gridZ)) > 0.01) contourVertices += 1;
    }
    expect(contourVertices).toBeGreaterThan(100);
    expect(GARDEN_ENGAWA_DISPLACEMENT).toContain("pine thicket");
    // A foreground tree still frames the garden, but no longer doubles the
    // tallest island pine and puts its canopy through the fleet's sails.
    const islandPineHeight = Math.max(...GARDEN_NIWAKI_SPECS.map((pine) => pine.height));
    expect(GARDEN_ENGAWA_PINE_HEIGHT).toBeGreaterThan(islandPineHeight);
    expect(GARDEN_ENGAWA_PINE_HEIGHT).toBeLessThan(islandPineHeight * 2);
    expect(Math.max(...GARDEN_NEAR_RIM_BAY_DEPTHS)).toBeGreaterThanOrEqual(4.5);
    expect(Math.min(...GARDEN_NEAR_RIM_BAY_DEPTHS)).toBeGreaterThanOrEqual(3);
    expect(GARDEN_NEAR_RIM_MIN_TERRACE_HEIGHT).toBeGreaterThanOrEqual(1.5);
    expect(GARDEN_NEAR_RIM_DISPLACEMENT).toContain("straight shoreline");
    rim.dispose();
  });

  it("keeps continuous earth between local ledges and articulates the existing pine batch", () => {
    const rim = createGardenRimMesh();
    const land = rim.root.getObjectByName("garden-rim-land") as Mesh;
    const positions = land.geometry.getAttribute("position");
    let earth = 0;
    let offFormerTerraces = 0;
    for (let index = 0; index < positions.count; index += 1) {
      if (Math.max(positions.getX(index), positions.getZ(index)) > 139 * TILE_SCALE) continue;
      const height = positions.getY(index);
      earth += 1;
      const terrace = (height - 0.6) / 0.34;
      if (Math.abs(terrace - Math.round(terrace)) * 0.34 > 0.03) offFormerTerraces += 1;
    }
    expect(offFormerTerraces / earth).toBeGreaterThan(0.65);
    expect((land.material as MeshStandardMaterial).flatShading).toBe(false);
    // Six tapered wood segments and four unequal foliage lobes replace the
    // pole/three pads with essentially the same per-instance triangle cost.
    const pine = rim.pineInstances.geometry;
    expect(pine.index!.count / 3).toBeLessThanOrEqual(250);
    const pinePositions = pine.getAttribute("position");
    const low = [];
    const high = [];
    for (let index = 0; index < pinePositions.count; index += 1) {
      const y = pinePositions.getY(index);
      if (y > 1.5 && y < 1.8) low.push(pinePositions.getX(index));
      if (y > 2.9 && y < 3.05) high.push(pinePositions.getX(index));
    }
    expect(Math.max(...low)).toBeGreaterThan(0.4);
    expect(Math.min(...high)).toBeLessThan(-0.2);
    rim.dispose();
  });

  it("keeps every rim dressing feature outside the largest station footprints", () => {
    const rim = createGardenRimMesh();
    const matrix = new Matrix4();
    const stationClearances = [
      ...EVM_BAY_STATION_SLOTS,
      ...OUTER_HARBOR_STATION_SLOTS,
      PIGEONNIER_STATION_SLOT,
    ].map((slot) => ({
      cove: slot.cove,
      rect: stationFootprintRect(
        slot.type,
        slot.cove.tile,
        slot.cove.seawardBearing,
        slot.cove.id,
      ),
    }));
    const instanceTiles = (mesh: InstancedMesh) => {
      const tiles: Array<{ x: number; y: number }> = [];
      for (let index = 0; index < mesh.count; index += 1) {
        mesh.getMatrixAt(index, matrix);
        tiles.push({
          x: matrix.elements[12] / TILE_SCALE,
          y: matrix.elements[14] / TILE_SCALE,
        });
      }
      return tiles;
    };
    const path = rim.root.getObjectByName("garden-rim-path") as Mesh;
    const pathPositions = path.geometry.getAttribute("position");
    const pathPoints: Array<{ x: number; y: number }> = [];
    for (let index = 0; index < pathPositions.count; index += 1) {
      pathPoints.push({
        x: pathPositions.getX(index) / TILE_SCALE,
        y: pathPositions.getZ(index) / TILE_SCALE,
      });
    }
    const stonePoints = instanceTiles(
      rim.root.getObjectByName("garden-rim-stones") as InstancedMesh,
    );
    expect(stonePoints[0]!.x).toBeCloseTo(5, 5);
    expect(stonePoints[0]!.y).toBeCloseTo(110, 5);
    expect(stonePoints[1]!.x).toBeCloseTo(4.340, 3);
    expect(stonePoints[1]!.y).toBeCloseTo(110.817, 3);
    expect(stonePoints[2]!.x).toBeCloseTo(4.779, 3);
    expect(stonePoints[2]!.y).toBeCloseTo(108.974, 3);
    const scenery = [
      { name: "path", points: pathPoints },
      {
        name: "pine",
        points: instanceTiles(rim.root.getObjectByName("garden-rim-pines") as InstancedMesh),
      },
      {
        name: "stone",
        points: stonePoints,
      },
    ];
    for (const station of stationClearances) {
      for (const feature of scenery) {
        const intruders = feature.points.filter((point) => (
          distanceToStationFootprint(point, station.rect) <= 0
        ));
        expect(
          intruders,
          `${feature.name} inside ${station.cove.id} station footprint`,
        ).toEqual([]);
      }
      for (let y = 0; y < 140; y += 1) {
        for (let x = 0; x < 140; x += 1) {
          if (distanceToStationFootprint({ x, y }, station.rect) > 0) continue;
          expect(
            gardenRimBayExcursionAt(x, y),
            `bay excursion inside ${station.cove.id} at ${x},${y}`,
          ).toBe(0);
        }
      }
    }

    // The old width-based route admitted this west-rim point and therefore
    // drew a ribbon through the hatago. It is genuine land on the authored
    // route, not a synthetic off-coast counterexample, and the maximum
    // station footprint rejects it.
    const ledger = stationClearances.find(({ cove }) => cove.id === "ledger-fog-hook")!;
    const ledgerCove = RIM_COVES.find((cove) => cove.id === "ledger-fog-hook")!;
    const legacyPathPoint = { x: 3, y: 54 };
    expect(rimLandAt(legacyPathPoint.x, legacyPathPoint.y)).toBe(true);
    expect(
      Math.hypot(
        legacyPathPoint.x - ledgerCove.tile.x,
        legacyPathPoint.y - ledgerCove.tile.y,
      ),
    ).toBeGreaterThan(ledgerCove.width * 0.5 + 2.5);
    expect(distanceToStationFootprint(legacyPathPoint, ledger.rect)).toBe(0);
    const legacyHalfAlong = (ledger.rect.maxAlong - ledger.rect.minAlong) / 2;
    expect(Math.max(
      Math.abs((legacyPathPoint.x - ledger.rect.origin.x) - legacyHalfAlong)
        - legacyHalfAlong,
      0,
    )).toBeGreaterThan(0);

    // Clearance only interrupts dressing. The authoritative fukinsei coast
    // and its two unequal open-sea passages remain the same authored field.
    expect(RIM_OPENINGS).toHaveLength(2);
    expect(
      RIM_OPENINGS[0]!.bearingEnd - RIM_OPENINGS[0]!.bearingStart,
    ).toBeCloseTo(
      (RIM_OPENINGS[1]!.bearingEnd - RIM_OPENINGS[1]!.bearingStart) * 2,
      8,
    );
    rim.dispose();
  });

  it("carries the authored shoreline out across the camera-side plate margin", () => {
    const rim = createGardenRimMesh();
    const boundary = 139 * TILE_SCALE;
    const sixTiles = 6 * TILE_SCALE;
    for (const name of ["garden-rim-land", "garden-rim-tide-rock"]) {
      const mesh = rim.root.getObjectByName(name) as Mesh;
      mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox!;
      // The camera-near margins read as land receding into the haze: the
      // skirt reaches at least six tiles past tile 139 on +X and +Z…
      expect(bounds.max.x).toBeGreaterThanOrEqual(boundary + sixTiles);
      expect(bounds.max.z).toBeGreaterThanOrEqual(boundary + sixTiles);
      // …never past the finite plate…
      expect(bounds.max.x).toBeLessThanOrEqual((139 + 8.05) * TILE_SCALE);
      expect(bounds.max.z).toBeLessThanOrEqual((139 + 8.05) * TILE_SCALE);
      // …and never onto the far pair, which keeps dissolving into the seam
      // (the tide rock's small negative reach is its pre-existing wet-shelf
      // lip, present before the skirt).
      const farLimit = name === "garden-rim-land" ? 0 : -0.75 * TILE_SCALE;
      expect(bounds.min.x).toBeGreaterThanOrEqual(farLimit);
      expect(bounds.min.z).toBeGreaterThanOrEqual(farLimit);
      // The skirt clamps to the boundary tile, so the Danger Strait stretch
      // of the east boundary — water in the authored field — stays open sea:
      // no skirt geometry around tile (145, 30).
      const positions = mesh.geometry.getAttribute("position");
      const intruders: string[] = [];
      for (let index = 0; index < positions.count; index += 1) {
        const tileX = positions.getX(index) / TILE_SCALE;
        const tileZ = positions.getZ(index) / TILE_SCALE;
        if (tileX > 142 && tileZ > 18 && tileZ < 42) {
          intruders.push(`${tileX.toFixed(1)},${tileZ.toFixed(1)}`);
        }
      }
      expect(intruders).toEqual([]);
    }
    expect(GARDEN_NEAR_RIM_SKIRT_DISPLACEMENT).toContain("open water");
    rim.dispose();
  });

  it("dresses the camera-side skirt with thinning rim scenery and no stroll route", () => {
    const rim = createGardenRimMesh();
    const boundary = 139;
    const matrix = new Matrix4();
    const instanceTiles = (mesh: InstancedMesh) => {
      const tiles: Array<{ x: number; z: number }> = [];
      for (let index = 0; index < mesh.count; index += 1) {
        mesh.getMatrixAt(index, matrix);
        tiles.push({ x: matrix.elements[12] / TILE_SCALE, z: matrix.elements[14] / TILE_SCALE });
      }
      return tiles;
    };
    const pines = instanceTiles(rim.root.getObjectByName("garden-rim-pines") as InstancedMesh);
    const stones = instanceTiles(rim.root.getObjectByName("garden-rim-stones") as InstancedMesh);
    const rimBand = (tile: { x: number; z: number }) => Math.max(tile.x, tile.z);
    const skirtPines = pines.filter((tile) => rimBand(tile) > boundary);
    const skirtStones = stones.filter((tile) => rimBand(tile) > boundary);
    // The apron continues the coast: the same pines and stones exist past
    // tile 139 on both camera-near sides…
    expect(skirtPines.length).toBeGreaterThanOrEqual(6);
    expect(skirtPines.some((tile) => tile.x > boundary)).toBe(true);
    expect(skirtPines.some((tile) => tile.z > boundary)).toBe(true);
    expect(skirtStones.length).toBeGreaterThanOrEqual(3);
    expect(skirtStones.some((tile) => tile.x > boundary)).toBe(true);
    expect(skirtStones.some((tile) => tile.z > boundary)).toBe(true);
    // …at clearly lower density than the matching in-bounds shore band…
    const skirtArea = 147 * 147 - boundary * boundary;
    const shoreBandArea = boundary * boundary - 133 * 133;
    const shoreBandCount = (tiles: Array<{ x: number; z: number }>) => tiles.filter(
      (tile) => rimBand(tile) > 133 && rimBand(tile) <= boundary,
    ).length;
    expect(skirtPines.length / skirtArea).toBeLessThan(shoreBandCount(pines) / shoreBandArea);
    expect(skirtStones.length / skirtArea).toBeLessThan(shoreBandCount(stones) / shoreBandArea);
    // …thinning to none before the plate limit at tile 147…
    expect(pines.concat(stones).every((tile) => rimBand(tile) <= 145)).toBe(true);
    // …while the stroll stays an authored in-bounds route: no ribbon, cove
    // spur, or engawa geometry of the path draw crosses tile 139…
    const path = rim.root.getObjectByName("garden-rim-path") as Mesh;
    path.geometry.computeBoundingBox();
    expect(path.geometry.boundingBox!.max.x).toBeLessThanOrEqual(boundary * TILE_SCALE + 0.02);
    expect(path.geometry.boundingBox!.max.z).toBeLessThanOrEqual(boundary * TILE_SCALE + 0.02);
    // …and the far pair gains no scenery: nothing at all below tile 0.
    for (const tiles of [pines, stones]) {
      expect(Math.min(...tiles.map((tile) => tile.x))).toBeGreaterThanOrEqual(0);
      expect(Math.min(...tiles.map((tile) => tile.z))).toBeGreaterThanOrEqual(0);
    }
    // Ground relief: the apron is not one flat plane. Its surface undulates
    // (swells and dells) yet never rises past the in-bounds rim crest, so it
    // still reads as land receding into the haze.
    const land = rim.root.getObjectByName("garden-rim-land") as Mesh;
    const landPositions = land.geometry.getAttribute("position");
    const skirtHeights = new Set<number>();
    let skirtTop = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < landPositions.count; index += 1) {
      if (Math.max(landPositions.getX(index), landPositions.getZ(index)) / TILE_SCALE <= boundary) continue;
      skirtHeights.add(Math.round(landPositions.getY(index) * 20) / 20);
      skirtTop = Math.max(skirtTop, landPositions.getY(index));
    }
    expect(skirtHeights.size).toBeGreaterThanOrEqual(40);
    expect(skirtTop).toBeLessThanOrEqual(3.1);
    rim.dispose();
  });

  it("marks every rim batch as a static shadow user and disposes once", () => {
    const rim = createGardenRimMesh();
    const disposals: Array<ReturnType<typeof vi.spyOn>> = [];
    for (const child of rim.root.children as Array<Mesh | InstancedMesh>) {
      expect(child.castShadow).toBe(true);
      expect(child.receiveShadow).toBe(true);
      disposals.push(
        vi.spyOn(child.geometry, "dispose"),
        vi.spyOn(child.material as MeshStandardMaterial, "dispose"),
      );
    }
    rim.dispose();
    rim.dispose();
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("gives every pine a vertex sway weight driven by the shared weather plan", () => {
    const rim = createGardenRimMesh();
    const pines = rim.pineInstances;
    const sway = pines.geometry.getAttribute("aGardenSway");
    expect(sway.count).toBe(pines.count);
    expect(Math.min(...Array.from(sway.array))).toBeGreaterThan(0.6);
    const material = pines.material as MeshStandardMaterial;
    const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <begin_vertex>" };
    material.onBeforeCompile(shader as never, null as never);
    expect(shader.vertexShader).toContain("attribute float aGardenSway");
    expect(shader.vertexShader).toContain("uGardenWindDirection");

    const weather = weatherForFrame({ baseWind: 0.5, psiStress: 0.2, timeSeconds: 2 });
    rim.updateWind(weather, false);
    const uniforms = material.userData.gardenWindSwayUniforms as {
      uGardenWindStrength: { value: number };
    };
    expect(uniforms.uGardenWindStrength.value).toBeGreaterThan(0);
    rim.dispose();
  });
});
