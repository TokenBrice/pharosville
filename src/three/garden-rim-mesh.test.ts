import { InstancedMesh, Matrix4, Mesh, MeshStandardMaterial } from "three";
import { describe, expect, it, vi, type MockInstance } from "vitest";
import { defaultCamera } from "../systems/camera";
import { distanceToStationFootprint, stationFootprintRect } from "../systems/dock-layout";
import { RIM_COVES, RIM_OPENINGS, rimLandAt } from "../systems/garden-rim";
import {
  cameraEye,
  cameraPoseFromIso,
  worldToScreen,
} from "../systems/projection";
import {
  buildPharosVilleMap,
  EVM_BAY_STATION_SLOTS,
  OUTER_HARBOR_STATION_SLOTS,
  PIGEONNIER_STATION_SLOT,
} from "../systems/world-layout";
import { weatherForFrame } from "../systems/weather";
import {
  createGardenRimMesh,
  gardenRimBayExcursionAt,
  GARDEN_ENGAWA_DISPLACEMENT,
  GARDEN_ENGAWA_LANTERN_WORLD,
  GARDEN_ENGAWA_PINE_HEIGHT,
  GARDEN_NEAR_RIM_BAY_DEPTHS,
  GARDEN_NEAR_RIM_DISPLACEMENT,
  GARDEN_NEAR_RIM_MIN_TERRACE_HEIGHT,
  GARDEN_NEAR_RIM_SKIRT_DISPLACEMENT,
  GARDEN_RIM_COLOR_HEX,
  rimColor,
  GARDEN_RIM_FOREGROUND_BOUGH_NAME,
  GARDEN_RIM_FOREGROUND_MASSES,
} from "./garden-rim-mesh";
import { GARDEN_NIWAKI_SPECS } from "./garden-island";
import { countDrawableObjects, TILE_SCALE } from "./garden-util";

interface ScreenRect {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}

function rectsOverlap(a: ScreenRect, b: ScreenRect): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

function unionInto(rect: ScreenRect, x: number, y: number): void {
  rect.minX = Math.min(rect.minX, x);
  rect.maxX = Math.max(rect.maxX, x);
  rect.minY = Math.min(rect.minY, y);
  rect.maxY = Math.max(rect.maxY, y);
}

describe("garden rim mesh", () => {
  it("builds the terraced authored ring in eleven batched opaque draws", () => {
    const rim = createGardenRimMesh();
    expect(rim.root.name).toBe("garden-rim");
    expect(rim.drawCallCount).toBe(11);
    expect(rim.drawCallCount).toBeLessThanOrEqual(13);
    expect(countDrawableObjects(rim.root)).toBe(11);
    expect(rim.root.getObjectByName("garden-rim-land")).toBeInstanceOf(Mesh);
    expect(rim.root.getObjectByName("garden-rim-tide-rock")).toBeInstanceOf(Mesh);
    expect(rim.root.getObjectByName("garden-rim-path")).toBeInstanceOf(Mesh);
    expect(rim.root.getObjectByName("garden-rim-pines")).toBeInstanceOf(InstancedMesh);
    expect(rim.root.getObjectByName("garden-rim-stones")).toBeInstanceOf(InstancedMesh);
    expect(rim.root.getObjectByName("garden-rim-revetments")).toBeInstanceOf(InstancedMesh);
    expect(rim.root.getObjectByName("garden-flora-karikomi")).toBeInstanceOf(InstancedMesh);
    expect(rim.root.getObjectByName("garden-flora-momiji")).toBeInstanceOf(InstancedMesh);
    expect(rim.root.getObjectByName("garden-rim-understory")).toBeUndefined();
    expect((rim.root.getObjectByName("garden-flora-bamboo") as InstancedMesh).count).toBe(35);
    expect(rim.root.getObjectByName(GARDEN_RIM_FOREGROUND_BOUGH_NAME)).toBeInstanceOf(Mesh);
    expect(rim.root.getObjectByName("garden-rim-foreground-pines")).toBeUndefined();
    expect(rim.root.getObjectByName("garden-rim-foreground-torii")).toBeUndefined();
    expect(rim.foregroundMassCount).toBe(1);
    expect(rim.pineCount).toBe(120);
    expect(rim.understoryCount).toBe(80);
    expect(rim.broadleafCount).toBe(60);
    expect(rim.engawaPineCount).toBe(1);
    expect(rim.steppingStoneCount).toBe(3);
    // Headland, stepping and skirt stones share their draw with the boulder toe.
    expect(rim.stoneCount).toBe(120);
    expect(rim.coastFormCounts.beach).toBeGreaterThan(0);
    expect(rim.coastFormCounts.revetment).toBeGreaterThan(0);
    expect(rim.coastFormCounts.boulder).toBeGreaterThan(0);
    const revetments = rim.root.getObjectByName("garden-rim-revetments") as InstancedMesh;
    expect(revetments.count * 12).toBeLessThanOrEqual(2_000);
    expect(GARDEN_ENGAWA_LANTERN_WORLD.x).toBeGreaterThan(0);
    expect(GARDEN_ENGAWA_LANTERN_WORLD.z).toBeGreaterThan(GARDEN_ENGAWA_LANTERN_WORLD.x);
    expect(rim.pathSegmentCount).toBeGreaterThan(80);
    // The cove-rooted rectangles retain the Mole spur without admitting
    // dressing onto any authored station geometry.
    expect(rim.coveSpurCount).toBe(8);
    // G2 species redistribution: measured 116,886 (G1: 90,426).
    // Islet and niwaki savings pay the net +24,668 combined flora delta.
    expect(rim.triangleCount).toBeGreaterThan(116_000);
    expect(rim.triangleCount).toBeLessThanOrEqual(117_000);
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


  it("rakes station envelopes to gravel and exposes rock on authored steep faces", () => {
    const station = EVM_BAY_STATION_SLOTS[0]!.cove.tile;
    expect(`#${rimColor(station.x, station.y).getHexString()}`).toBe(
      GARDEN_RIM_COLOR_HEX.rakedGravel,
    );
    const steepFaces: Array<readonly [number, number]> = [];
    for (const inset of [2, 4, 6, 8, 10, 12]) {
      for (const along of [16, 32, 48, 64, 80, 96, 112, 128]) {
        steepFaces.push([inset, along], [along, inset]);
      }
    }
    expect(steepFaces.some(([x, y]) => (
      `#${rimColor(x, y).getHexString()}` === GARDEN_RIM_COLOR_HEX.exposedRock
    ))).toBe(true);
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

  it("raises only the north/west rim into hills and keeps station shoulders level", () => {
    const rim = createGardenRimMesh();
    const land = rim.root.getObjectByName("garden-rim-land") as Mesh;
    const positions = land.geometry.getAttribute("position");
    const stationClearances = [
      ...EVM_BAY_STATION_SLOTS,
      ...OUTER_HARBOR_STATION_SLOTS,
      PIGEONNIER_STATION_SLOT,
    ].map((slot) => stationFootprintRect(
      slot.type,
      slot.cove.tile,
      slot.cove.seawardBearing,
      slot.cove.id,
    ));
    let farCrest = Number.NEGATIVE_INFINITY;
    let nearCrest = Number.NEGATIVE_INFINITY;
    let protectedSamples = 0;
    for (let index = 0; index < positions.count; index += 1) {
      const tileX = positions.getX(index) / TILE_SCALE;
      const tileY = positions.getZ(index) / TILE_SCALE;
      if (tileX < 0 || tileY < 0 || tileX > 139 || tileY > 139) continue;
      const height = positions.getY(index);
      const farDistance = Math.min(tileX, tileY);
      const nearDistance = Math.min(139 - tileX, 139 - tileY);
      if (farDistance < nearDistance) farCrest = Math.max(farCrest, height);
      else nearCrest = Math.max(nearCrest, height);
      if (stationClearances.some(
        (rect) => distanceToStationFootprint({ x: tileX, y: tileY }, rect) <= 6,
      )) {
        protectedSamples += 1;
        expect(height, `station shoulder at ${tileX},${tileY}`).toBeLessThanOrEqual(3.1);
      }
    }
    expect(farCrest).toBeGreaterThan(8);
    expect(nearCrest).toBeLessThanOrEqual(3.1);
    expect(protectedSamples).toBeGreaterThan(0);
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
    // …at clearly lower density than the matching in-bounds shore band for the
    // pines. Stones are no longer a fair density probe: the boulder toe
    // (W1.13) follows the whole coast, apron included, by design.
    const skirtArea = 147 * 147 - boundary * boundary;
    const shoreBandArea = boundary * boundary - 133 * 133;
    const shoreBandCount = (tiles: Array<{ x: number; z: number }>) => tiles.filter(
      (tile) => rimBand(tile) > 133 && rimBand(tile) <= boundary,
    ).length;
    expect(skirtPines.length / skirtArea).toBeLessThan(shoreBandCount(pines) / shoreBandArea);
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

  it("frames the rest corner with one dark pine bough", () => {
    const rim = createGardenRimMesh();
    const map = buildPharosVilleMap();
    const projectionViewport = { x: 1600, y: 1000 };
    const projectionCamera = defaultCamera({
      height: projectionViewport.y,
      map,
      width: projectionViewport.x,
    });
    const projectionPose = cameraPoseFromIso(projectionCamera, projectionViewport);
    const projectionEye = cameraEye(projectionPose);
    for (const mass of GARDEN_RIM_FOREGROUND_MASSES) {
      const mesh = rim.root.getObjectByName(mass.name) as Mesh;
      expect(mesh, mass.name).toBeInstanceOf(Mesh);
      // Dark, textureless silhouette participating in the static shadow pass.
      const material = mesh.material as MeshStandardMaterial;
      expect(material.vertexColors).toBe(true);
      expect(material.emissive.getHex()).toBe(0);
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox!;
      // This is a camera-relative repoussoir, not planted rim dressing: its
      // authored footing may sit beyond the finite plate. Its contract is the
      // projected needle-pad silhouette at the rest-frame corner below.
      const anchorWorld = {
        x: mass.tile.x * TILE_SCALE,
        z: mass.tile.y * TILE_SCALE,
      };
      const towardTarget = {
        x: -Math.sin(projectionPose.yaw),
        z: -Math.cos(projectionPose.yaw),
      };
      const eyeToAnchor = {
        x: anchorWorld.x - projectionEye.x,
        z: anchorWorld.z - projectionEye.z,
      };
      const forwardDistance = eyeToAnchor.x * towardTarget.x + eyeToAnchor.z * towardTarget.z;
      expect(forwardDistance, `${mass.name} distance in front of the rest eye`).toBeGreaterThanOrEqual(6);
      expect(forwardDistance, `${mass.name} distance in front of the rest eye`).toBeLessThanOrEqual(10);
      // The reused pine builder contributes four flattened pads plus its
      // leaning trunk in one merged geometry, comfortably under 1.5k tris.
      const triangles = (mesh.geometry.index?.count
        ?? mesh.geometry.getAttribute("position").count) / 3;
      expect(triangles, `${mass.name} triangle budget`).toBeLessThanOrEqual(1500);
      const crest = bb.max.y - Math.min(bb.min.y, 0.9);
      expect(crest, `${mass.name} crest`).toBeGreaterThanOrEqual(mass.height * 0.85);
      const viewAxisY = projectionEye.y - forwardDistance * Math.tan(projectionPose.pitch);
      expect(bb.max.y, `${mass.name} stays below the rest view axis`).toBeLessThan(viewAxisY);
    }
    expect(rim.foregroundMassCount).toBe(1);

    // Screen-space placement is authoritative for this camera-relative bough:
    // its projected pads must cross the desktop rest frame's lower-left 15%.
    for (const viewport of [
      { height: 1000, width: 1600 },
    ]) {
      const camera = defaultCamera({ ...viewport, height: viewport.height, map, width: viewport.width });
      for (const mass of GARDEN_RIM_FOREGROUND_MASSES) {
        const mesh = rim.root.getObjectByName(mass.name) as Mesh;
        mesh.geometry.computeBoundingBox();
        const bb = mesh.geometry.boundingBox!;
        const scaled: ScreenRect = {
          maxX: Number.NEGATIVE_INFINITY,
          maxY: Number.NEGATIVE_INFINITY,
          minX: Number.POSITIVE_INFINITY,
          minY: Number.POSITIVE_INFINITY,
        };
        for (const [x, y, z] of [
          [bb.min.x, bb.min.y, bb.min.z],
          [bb.max.x, bb.min.y, bb.min.z],
          [bb.min.x, bb.max.y, bb.min.z],
          [bb.max.x, bb.max.y, bb.min.z],
          [bb.min.x, bb.min.y, bb.max.z],
          [bb.max.x, bb.min.y, bb.max.z],
          [bb.min.x, bb.max.y, bb.max.z],
          [bb.max.x, bb.max.y, bb.max.z],
        ] as const) {
          const point = worldToScreen(
            { x, y, z },
            camera,
            { x: viewport.width, y: viewport.height },
          );
          unionInto(scaled, point.x, point.y);
        }
        if (viewport.width === 1600) {
          // The pads own and cross the lower-left 15% of the desktop rest frame.
          const corner: ScreenRect = {
            maxX: viewport.width * 0.15,
            maxY: viewport.height,
            minX: 0,
            minY: viewport.height * 0.85,
          };
          expect(rectsOverlap(scaled, corner), `${mass.name} misses the rest corner`).toBe(true);
          expect(scaled.minX, "pine bough is clipped by the left frame edge").toBeLessThan(0);
          expect(scaled.maxY, "pine bough keeps its foot in the lower band")
            .toBeGreaterThan(viewport.height * 0.85);
        }
      }
    }
    rim.dispose();
  });

  it("keeps every vegetation batch solid, textureless and instance-coloured", () => {
    // T2.2 (2026-09-07). N8AO runs autoDetectTransparency = false,
    // transparencyAware = false and halfRes = true, so an alpha-tested or
    // alpha-blended foliage card occludes as a solid half-res rectangle — a
    // dark bruise around every plant — and punches holes in the water. This
    // pin is the reason the whole pass is instanced solid geometry.
    const rim = createGardenRimMesh();
    for (const name of [
      "garden-rim-pines",
      "garden-flora-karikomi",
      "garden-flora-momiji",
      "garden-flora-cherry",
      "garden-flora-bamboo",
    ]) {
      const batch = rim.root.getObjectByName(name) as InstancedMesh;
      const material = batch.material as MeshStandardMaterial;
      expect(material.transparent, name).toBe(false);
      expect(material.alphaTest, name).toBe(0);
      expect(material.map, name).toBeNull();
      // Every new batch answers the one shared weather plan, not a local
      // oscillator: same vertex sway rig as the pines.
      expect(batch.geometry.getAttribute("aGardenSway").count, name).toBe(batch.count);
    }
    rim.dispose();
  });

  it("drops deciduous crowns in winter while retaining the pine silhouette", () => {
    const summer = createGardenRimMesh("summer");
    const winter = createGardenRimMesh("winter");
    for (const name of ["garden-flora-momiji", "garden-flora-cherry"]) {
      const leafy = summer.root.getObjectByName(name) as InstancedMesh;
      const bare = winter.root.getObjectByName(name) as InstancedMesh;
      expect(bare.count).toBe(leafy.count);
      expect(bare.geometry.index!.count).toBeLessThan(leafy.geometry.index!.count / 2);
    }
    expect(winter.pineInstances.geometry.index!.count).toBe(summer.pineInstances.geometry.index!.count);
    summer.dispose();
    winter.dispose();
  }, 20_000);

  it("marks every rim batch as a static shadow user and disposes once", () => {
    const rim = createGardenRimMesh();
    const disposals: MockInstance[] = [];
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
    const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <begin_vertex>", fragmentShader: "#include <common>\n#include <opaque_fragment>" };
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
