import { InstancedMesh, Matrix4, Mesh, MeshStandardMaterial } from "three";
import { describe, expect, it, vi, type MockInstance } from "vitest";
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
  gardenRimBayExcursionAt,
  GARDEN_NEAR_RIM_BAY_DEPTHS,
  GARDEN_NEAR_RIM_DISPLACEMENT,
  GARDEN_NEAR_RIM_MIN_TERRACE_HEIGHT,
  GARDEN_NEAR_RIM_SKIRT_DISPLACEMENT,
  GARDEN_RIM_COLOR_HEX,
  rimColor,
} from "./garden-rim-mesh";
import { countDrawableObjects, TILE_SCALE } from "./garden-util";

/** The five headland triads. */
const HEADLAND_STONES = 15;

describe("garden rim mesh", () => {
  it("builds the terraced authored ring in eleven batched opaque draws", () => {
    const rim = createGardenRimMesh();
    expect(rim.root.name).toBe("garden-rim");
    expect(rim.drawCallCount).toBe(11);
    expect(countDrawableObjects(rim.root)).toBe(11);
    expect(rim.root.getObjectByName("garden-rim-ridge-grove")).toBeInstanceOf(InstancedMesh);
    expect(rim.root.getObjectByName("garden-rim-land")).toBeInstanceOf(Mesh);
    expect(rim.root.getObjectByName("garden-rim-tide-rock")).toBeInstanceOf(Mesh);
    expect(rim.root.getObjectByName("garden-rim-path")).toBeInstanceOf(Mesh);
    expect(rim.root.getObjectByName("garden-rim-pines")).toBeInstanceOf(InstancedMesh);
    expect(rim.root.getObjectByName("garden-rim-stones")).toBeInstanceOf(InstancedMesh);
    expect(rim.root.getObjectByName("garden-rim-revetments")).toBeInstanceOf(InstancedMesh);
    expect(rim.root.getObjectByName("garden-flora-karikomi")).toBeInstanceOf(InstancedMesh);
    expect(rim.root.getObjectByName("garden-flora-momiji")).toBeInstanceOf(InstancedMesh);
    expect(rim.root.getObjectByName("garden-rim-understory")).toBeUndefined();
    expect(rim.root.getObjectByName("garden-rim-foreground-pines")).toBeUndefined();
    expect(rim.root.getObjectByName("garden-rim-foreground-torii")).toBeUndefined();
    // W4.G1 / garden-master-4: a gardener's few, not a nursery — pines ~45 in
    // odd groups plus three heroes, momiji five, cherry three, bamboo in one
    // to three groves, karikomi ~40 wave segments.
    expect(rim.pineCount).toBeGreaterThanOrEqual(43);
    expect(rim.pineCount).toBeLessThanOrEqual(51);
    expect((rim.root.getObjectByName("garden-flora-momiji") as InstancedMesh).count).toBe(5);
    expect((rim.root.getObjectByName("garden-flora-cherry") as InstancedMesh).count).toBe(3);
    expect(rim.broadleafCount).toBe(8);
    expect((rim.root.getObjectByName("garden-flora-bamboo") as InstancedMesh).count).toBeLessThanOrEqual(9);
    expect(rim.understoryCount).toBeLessThanOrEqual(45);
    expect(rim.steppingStoneCount).toBe(3);
    expect(rim.stoneCount).toBeGreaterThan(HEADLAND_STONES);
    expect(rim.coastFormCounts.beach).toBeGreaterThan(0);
    expect(rim.coastFormCounts.revetment).toBeGreaterThan(0);
    expect(rim.coastFormCounts.boulder).toBeGreaterThan(0);
    const revetments = rim.root.getObjectByName("garden-rim-revetments") as InstancedMesh;
    expect(revetments.count * 12).toBeLessThanOrEqual(2_000);
    expect(rim.pathSegmentCount).toBeGreaterThan(80);
    // The cove-rooted rectangles retain the Mole spur without admitting
    // dressing onto any authored station geometry.
    expect(rim.coveSpurCount).toBe(8);
    // W8.2 (headroom-7): the land sheet decimates from 42.7k to ≤ 28k
    // triangles, which pays for the niwaki grammar: the rim as a whole does
    // not grow past its G2 116k.
    const land = rim.root.getObjectByName("garden-rim-land") as Mesh;
    expect(land.geometry.index!.count / 3).toBeLessThanOrEqual(28_000);
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
    // Decimated but watertight (W8.2): where a coarse block meets fine cells,
    // the coarse edge is open and its midpoint is a real vertex that both
    // fine halves share — a T-junction on one line, never a crack. What else
    // is open is coast (the tide-rock courses hang from it) or the laid-on
    // ground decals.
    const index = land.geometry.index!;
    const keyOf = (vertex: number) => `${positions.getX(vertex).toFixed(3)},${positions.getY(vertex).toFixed(3)},${positions.getZ(vertex).toFixed(3)}`;
    const edgeUses = new Map<string, number>();
    const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    for (let triangle = 0; triangle < index.count; triangle += 3) {
      for (let corner = 0; corner < 3; corner += 1) {
        const key = edgeKey(keyOf(index.getX(triangle + corner)), keyOf(index.getX(triangle + ((corner + 1) % 3))));
        edgeUses.set(key, (edgeUses.get(key) ?? 0) + 1);
      }
    }
    // Midpoints are looked up by position with a float32 tolerance.
    const byPlace = new Map<string, string[]>();
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      const place = `${Math.round(positions.getX(vertex) * 50)},${Math.round(positions.getZ(vertex) * 50)}`;
      byPlace.set(place, [...(byPlace.get(place) ?? []), keyOf(vertex)]);
    }
    const open = [...edgeUses.keys()].filter((key) => edgeUses.get(key) === 1);
    const covered = new Set<string>();
    for (const key of open) {
      const [aKey, bKey] = key.split("|") as [string, string];
      const a = aKey.split(",").map(Number);
      const b = bKey.split(",").map(Number);
      const midX = Math.round((a[0]! + b[0]!) * 25);
      const midZ = Math.round((a[2]! + b[2]!) * 25);
      const mid = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].flatMap((dz) => byPlace.get(`${midX + dx},${midZ + dz}`) ?? []))
        .find((candidate) => {
          const [x, y, z] = candidate.split(",").map(Number);
          return Math.abs(x! - (a[0]! + b[0]!) / 2) < 0.005 && Math.abs(z! - (a[2]! + b[2]!) / 2) < 0.005
            && Math.abs(y! - (a[1]! + b[1]!) / 2) < 0.005;
        });
      if (!mid) continue;
      if (edgeUses.get(edgeKey(aKey, mid)) === 1 && edgeUses.get(edgeKey(mid, bKey)) === 1) {
        covered.add(key).add(edgeKey(aKey, mid)).add(edgeKey(mid, bKey));
      }
    }
    expect(covered.size).toBeGreaterThan(0);
    const tide = rim.root.getObjectByName("garden-rim-tide-rock") as Mesh;
    const tidePositions = tide.geometry.getAttribute("position");
    const coast = new Set<string>();
    for (let vertex = 0; vertex < tidePositions.count; vertex += 1) {
      coast.add(`${tidePositions.getX(vertex).toFixed(3)},${tidePositions.getY(vertex).toFixed(3)},${tidePositions.getZ(vertex).toFixed(3)}`);
    }
    const cracks = open.filter((key) => !covered.has(key) && !key.split("|").every((point) => coast.has(point)));
    // 90 ground decals lay four open edges each over the sheet.
    expect(cracks.length).toBeLessThanOrEqual(90 * 4);
    // The pine is the niwaki grammar: wider than tall, pads on level arms.
    const pine = rim.pineInstances.geometry;
    pine.computeBoundingBox();
    const size = pine.boundingBox!.max.clone().sub(pine.boundingBox!.min);
    expect(Math.max(size.x, size.z)).toBeGreaterThanOrEqual(size.y);
    expect(pine.getAttribute("aGardenFoliage")).toBeDefined();
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
    expect(skirtPines.length).toBeGreaterThanOrEqual(3);
    expect(skirtPines.some((tile) => tile.x > boundary)).toBe(true);
    expect(skirtPines.some((tile) => tile.z > boundary)).toBe(true);
    expect(skirtStones.length).toBeGreaterThanOrEqual(3);
    expect(skirtStones.some((tile) => tile.x > boundary)).toBe(true);
    expect(skirtStones.some((tile) => tile.z > boundary)).toBe(true);
    // …thinning to none before the plate limit at tile 147…
    expect(pines.concat(stones).every((tile) => rimBand(tile) <= 145)).toBe(true);
    // …while the stroll stays an authored in-bounds route: no ribbon or cove
    // spur of the path draw crosses tile 139…
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

  it("drops deciduous crowns in winter by the calendar while the pines hold", () => {
    const summer = createGardenRimMesh(new Date("2026-07-01T12:00:00Z"));
    const winter = createGardenRimMesh(new Date("2027-01-20T12:00:00Z"));
    const leaf = (rim: typeof summer, name: string) => Array.from(
      (rim.root.getObjectByName(name) as InstancedMesh).geometry.getAttribute("aGardenLeaf").array as Float32Array,
    );
    for (const name of ["garden-flora-momiji", "garden-flora-cherry"]) {
      expect(leaf(summer, name).every((value) => value === 1), name).toBe(true);
      expect(leaf(winter, name).every((value) => value === 0), name).toBe(true);
    }
    expect(leaf(winter, "garden-rim-pines")).toEqual(leaf(summer, "garden-rim-pines"));
    summer.dispose();
    winter.dispose();
  }, 20_000);

  it("masses the far ridges as a pine grove that holds no bamboo, maple or karikomi", () => {
    const rim = createGardenRimMesh();
    const matrix = new Matrix4();
    const tiles = (name: string) => {
      const mesh = rim.root.getObjectByName(name) as InstancedMesh;
      return Array.from({ length: mesh.count }, (_, index) => {
        mesh.getMatrixAt(index, matrix);
        return { x: matrix.elements[12] / TILE_SCALE, y: matrix.elements[14] / TILE_SCALE };
      });
    };
    const westRidge = (tile: { x: number; y: number }) => tile.x < 16 && tile.y > 44 && tile.y < 92;
    expect(tiles("garden-rim-ridge-grove").filter(westRidge).length).toBeGreaterThanOrEqual(12);
    expect(tiles("garden-rim-pines").filter(westRidge).length).toBeGreaterThanOrEqual(12);
    // garden-4: the crests carry the grove only — nothing else stands above
    // the level shore.
    const heights = (name: string) => {
      const mesh = rim.root.getObjectByName(name) as InstancedMesh;
      return Array.from({ length: mesh.count }, (_, index) => {
        mesh.getMatrixAt(index, matrix);
        return matrix.elements[13];
      });
    };
    for (const name of ["garden-flora-bamboo", "garden-flora-momiji", "garden-flora-cherry", "garden-flora-karikomi"]) {
      expect(Math.max(...heights(name)), name).toBeLessThanOrEqual(3.2);
    }
    rim.dispose();
  });

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
