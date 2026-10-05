import { DataTexture, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Raycaster, ShaderLib, Vector3, type IUniform } from "three";
import { describe, expect, it, vi, type Mock, type MockInstance } from "vitest";
import { distanceToStationFootprint, stationFootprintRect } from "../systems/dock-layout";
import { RIM_COVES, RIM_OPENINGS, rimLandAt } from "../systems/garden-rim";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import {
  EVM_BAY_STATION_SLOTS,
  OUTER_HARBOR_STATION_SLOTS,
  PIGEONNIER_STATION_SLOT,
} from "../systems/world-layout";
import { weatherForFrame } from "../systems/weather";
import {
  createGardenRimMesh,
  gardenRimBayExcursionAt,
  gardenRimDecorativeLandAt,
  gardenRimHeightAt,
  GARDEN_DECORATIVE_COAST_ENVELOPE_TILES,
  GARDEN_NEAR_RIM_BAY_DEPTHS,
  GARDEN_NEAR_RIM_DISPLACEMENT,
  GARDEN_NEAR_RIM_MIN_TERRACE_HEIGHT,
  GARDEN_NEAR_RIM_SKIRT_DISPLACEMENT,
  GARDEN_RIM_COLOR_HEX,
  GARDEN_SHORE_SEGMENTS,
  GARDEN_SHORE_CONTACT,
  shoreBeachWeight,
  gardenShoreSegmentAt,
  writeGardenShoreSample,
  type GardenShoreSample,
  rimColor,
} from "./garden-rim-mesh";
import { countDrawableObjects, disposeThreeObjectTree, TILE_SCALE } from "./garden-util";
import type { GardenSurfaceAtlasLease, GardenSurfaceAtlasOwner } from "./garden-surface-atlas";
import {
  GARDEN_SURFACE_ROLE_ATTRIBUTE,
  GARDEN_SURFACE_ROLE_CODES,
  GARDEN_SURFACE_WEIGHT_ATTRIBUTE,
  type GardenSurfaceMetadata,
} from "./garden-surfaces";

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
    const revetments = rim.root.getObjectByName("garden-rim-revetments") as InstancedMesh;
    expect(revetments.count * 12).toBeLessThanOrEqual(2_000);
    expect(rim.pathSegmentCount).toBeGreaterThan(80);
    // The cove-rooted rectangles retain the Mole spur without admitting
    // dressing onto any authored station geometry.
    expect(rim.coveSpurCount).toBe(8);
    // The decorative apron earns at most 12k unique / 24k main+shadow
    // triangles; broad exterior is decimated, not another dense heightfield.
    const land = rim.root.getObjectByName("garden-rim-land") as Mesh;
    expect(land.geometry.index!.count / 3).toBeLessThanOrEqual(40_000);
    expect(rim.triangleCount).toBeLessThanOrEqual(129_000);
    const shore = rim.root.getObjectByName("garden-rim-tide-rock") as Mesh;
    const landDefines = (land.material as MeshStandardMaterial).defines;
    if (!landDefines) throw new Error("Decorative terrain requires its scoped aerial define");
    expect(landDefines.GARDEN_AIR_DECORATIVE_TERRAIN).toBe(1);
    expect(shore.material).toBe(land.material);
    expect(((rim.root.getObjectByName("garden-rim-path") as Mesh).material as MeshStandardMaterial).defines?.GARDEN_AIR_DECORATIVE_TERRAIN).toBeUndefined();
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

  it("seats shoreline courses at the rendered water datum so wet contact remains live", () => {
    const rim = createGardenRimMesh();
    const shore = rim.root.getObjectByName("garden-rim-tide-rock") as Mesh;
    const positions = shore.geometry.getAttribute("position");
    const sample: GardenShoreSample = { segment: null, depth: 0, substrate: null, exposure: 0, state: "dry" };
    const courses = [
      { above: -0.35, state: "submerged" },
      { above: -0.16, state: "submerged" },
      { above: 0.045, state: "damp" },
      { above: GARDEN_SHORE_CONTACT.dryAbove, state: "damp" },
    ] as const;
    const counts = courses.map(() => 0);
    for (let index = 0; index < positions.count; index += 1) {
      const y = positions.getY(index);
      for (let course = 0; course < courses.length; course += 1) {
        const expected = courses[course]!;
        if (Math.abs(y - (GARDEN_WATER_Y + expected.above)) > 1e-6) continue;
        writeGardenShoreSample(sample, positions.getX(index), y, positions.getZ(index), GARDEN_WATER_Y);
        expect(sample.state).toBe(expected.state);
        counts[course] = counts[course]! + 1;
      }
    }
    for (const count of counts) expect(count).toBeGreaterThan(0);
    rim.dispose();
  });

  it("owns contiguous authored reaches with explicit quay and exposed-coast transitions", () => {
    expect(Object.isFrozen(GARDEN_SHORE_SEGMENTS)).toBe(true);
    for (const segment of GARDEN_SHORE_SEGMENTS) {
      expect(Object.isFrozen(segment)).toBe(true);
      expect(Object.isFrozen(segment.start)).toBe(true);
      expect(Object.isFrozen(segment.end)).toBe(true);
      expect([segment.start.x, segment.start.z, segment.end.x, segment.end.z].every(Number.isFinite)).toBe(true);
      if (segment.side === "outer") {
        expect(segment.substrate).toBe("bedrock");
        expect(segment.exposure).toBe(1);
      }
    }
    const beach = GARDEN_SHORE_SEGMENTS.find((segment) => segment.side === "inner" && segment.form === "beach")!;
    const neighbours = GARDEN_SHORE_SEGMENTS.filter((segment) => segment.side === "inner" && segment.form === "bedrock");
    const before = neighbours.find((segment) => segment.bearingEnd === beach.bearingStart)!;
    const after = neighbours.find((segment) => segment.bearingStart === beach.bearingEnd)!;
    expect(Math.hypot(before.end.x - beach.start.x, before.end.z - beach.start.z)).toBeLessThan(0.01);
    expect(Math.hypot(after.start.x - beach.end.x, after.start.z - beach.end.z)).toBeLessThan(0.01);
    const at = (degrees: number) => {
      const bearing = degrees * Math.PI / 180;
      return gardenShoreSegmentAt(
        (69.5 + 30 * Math.cos(bearing)) * TILE_SCALE,
        (69.5 + 30 * Math.sin(bearing)) * TILE_SCALE,
      );
    };
    for (let degrees = 36; degrees < 100; degrees += 0.5) expect(at(degrees)).toBe(beach);
    expect(at(34.9)).toBe(before);
    expect(at(100.1)).toBe(after);
    for (const cove of RIM_COVES) {
      expect(gardenShoreSegmentAt(cove.tile.x * TILE_SCALE, cove.tile.y * TILE_SCALE)?.id).toBe(`quay-${cove.id}`);
    }
    for (const opening of RIM_OPENINGS) expect(at((opening.bearingStart + opening.bearingEnd) * 90 / Math.PI)).toBeNull();
    expect(gardenShoreSegmentAt(Number.NaN, 0)).toBeNull();
  });

  it("samples physical depth, substrate and static contact without supply-tide state", () => {
    const cove = RIM_COVES[0]!;
    const sample: GardenShoreSample = { segment: null, depth: 0, substrate: null, exposure: 0, state: "dry" };
    const waterY = -1.45, x = cove.tile.x * TILE_SCALE, z = cove.tile.y * TILE_SCALE;
    for (const [height, depth, state] of [[1, 0, "dry"], [0.2, 0, "damp"], [-0.6, 0.6, "submerged"]] as const) {
      writeGardenShoreSample(sample, x, waterY + height, z, waterY);
      expect(sample.depth).toBeCloseTo(depth, 8);
      expect(sample.state).toBe(state);
      expect(sample.substrate).toBe("masonry");
      expect(sample.segment?.id).toBe(`quay-${cove.id}`);
    }
    expect(Object.isFrozen(GARDEN_SHORE_CONTACT)).toBe(true);
    for (const [height, state] of [
      [GARDEN_SHORE_CONTACT.submergedAbove - 0.001, "submerged"],
      [GARDEN_SHORE_CONTACT.submergedAbove, "damp"],
      [GARDEN_SHORE_CONTACT.dryAbove, "damp"],
      [GARDEN_SHORE_CONTACT.dryAbove + 0.001, "dry"],
    ] as const) {
      writeGardenShoreSample(sample, x, height, z, 0);
      expect(sample.state).toBe(state);
    }
    // Mineral-to-beach exposure feathers continuously across the authored join.
    const at = (degrees: number) => {
      const angle = degrees * Math.PI / 180;
      writeGardenShoreSample(sample, (69.5 + 30 * Math.cos(angle)) * TILE_SCALE, waterY, (69.5 + 30 * Math.sin(angle)) * TILE_SCALE, waterY);
      return sample.exposure;
    };
    expect(Math.abs(at(35.01) - at(34.99))).toBeLessThan(0.001);
    expect(at(45)).toBeLessThan(at(36));
    expect(shoreBeachWeight(x, z)).toBe(0);
    const angle = 45 * Math.PI / 180;
    const beachX = (69.5 + 30 * Math.cos(angle)) * TILE_SCALE;
    const beachZ = (69.5 + 30 * Math.sin(angle)) * TILE_SCALE;
    expect(shoreBeachWeight(beachX, beachZ)).toBe(1);
    writeGardenShoreSample(sample, Number.NaN, Number.NaN, 0, Number.NaN);
    expect(sample.segment).toBeNull();
    expect(Number.isFinite(sample.depth)).toBe(true);
    expect(Number.isFinite(sample.exposure)).toBe(true);
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
    // Indexed faces repeatedly reference the same immutable positions. Format
    // each vertex once; the complete edge/T-junction proof still visits them all.
    const vertexKeys = Array.from({ length: positions.count }, (_, vertex) => (
      `${positions.getX(vertex).toFixed(3)},${positions.getY(vertex).toFixed(3)},${positions.getZ(vertex).toFixed(3)}`
    ));
    const edgeUses = new Map<string, number>();
    const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    for (let triangle = 0; triangle < index.count; triangle += 3) {
      for (let corner = 0; corner < 3; corner += 1) {
        const key = edgeKey(vertexKeys[index.getX(triangle + corner)]!, vertexKeys[index.getX(triangle + ((corner + 1) % 3))]!);
        edgeUses.set(key, (edgeUses.get(key) ?? 0) + 1);
      }
    }
    // Midpoints are looked up by position with a float32 tolerance.
    const byPlace = new Map<string, string[]>();
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      const place = `${Math.round(positions.getX(vertex) * 50)},${Math.round(positions.getZ(vertex) * 50)}`;
      byPlace.set(place, [...(byPlace.get(place) ?? []), vertexKeys[vertex]!]);
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
    const exteriorCovered = [...covered].filter((edge) => edge.split("|").some((point) => {
      const [x, , z] = point.split(",").map(Number);
      return Math.min(x!, z!) < 0 || Math.max(x!, z!) > 139 * TILE_SCALE;
    }));
    expect(exteriorCovered.length).toBeGreaterThan(0);
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
    // Exterior toe stones keep their authored world anchors rather than
    // snapping onto the chart edge, where a station may occupy the land.
    expect(stonePoints.some((point) => point.x < 0 || point.y < 0)).toBe(true);
    for (const point of stonePoints) {
      expect(Math.min(point.x, point.y)).toBeGreaterThanOrEqual(-GARDEN_DECORATIVE_COAST_ENVELOPE_TILES);
      expect(Math.max(point.x, point.y)).toBeLessThanOrEqual(139 + GARDEN_DECORATIVE_COAST_ENVELOPE_TILES);
    }
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

  it("bounds an irregular decorative silhouette on all four sides without changing the chart", () => {
    const before = Array.from({ length: 140 * 140 }, (_, i) => rimLandAt(i % 140, Math.floor(i / 140)));
    const rim = createGardenRimMesh();
    const limit = GARDEN_DECORATIVE_COAST_ENVELOPE_TILES;
    for (const name of ["garden-rim-land", "garden-rim-tide-rock"]) {
      const mesh = rim.root.getObjectByName(name) as Mesh;
      mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox!;
      expect(bounds.min.x).toBeLessThan(0);
      expect(bounds.min.z).toBeLessThan(0);
      expect(bounds.max.x).toBeGreaterThan(139 * TILE_SCALE);
      expect(bounds.max.z).toBeGreaterThan(139 * TILE_SCALE);
      expect(bounds.min.x).toBeGreaterThanOrEqual(-limit * TILE_SCALE - 0.001);
      expect(bounds.min.z).toBeGreaterThanOrEqual(-limit * TILE_SCALE - 0.001);
      expect(bounds.max.x).toBeLessThanOrEqual((139 + limit) * TILE_SCALE + 0.001);
      expect(bounds.max.z).toBeLessThanOrEqual((139 + limit) * TILE_SCALE + 0.001);
    }
    // The visible feet continue underneath the annulus, never terminate at
    // its waterline. Top/face retain their existing two buckets.
    const face = rim.root.getObjectByName("garden-rim-tide-rock") as Mesh;
    expect(face.geometry.boundingBox!.min.y).toBeLessThan(-0.11);
    const contactPositions = face.geometry.getAttribute("position");
    const contactNormals = face.geometry.getAttribute("normal");
    const contactIndices = face.geometry.index!;
    let exteriorContacts = 0;
    for (let i = 0; i < contactPositions.count; i += 12) {
      // The second course's wall normal points to sea, not into the land;
      // its submerged shelf faces up rather than being back-face culled.
      const dx = contactPositions.getX(i + 5) - contactPositions.getX(i + 4);
      const dz = contactPositions.getZ(i + 5) - contactPositions.getZ(i + 4);
      if (Math.hypot(dx, dz) > 1e-5) {
        expect(-dz * contactNormals.getX(i + 4) + dx * contactNormals.getZ(i + 4)).toBeGreaterThan(0);
      }
      expect(contactNormals.getY(i + 8)).toBeGreaterThanOrEqual(0);
      const shelfStart = i / 12 * 18 + 12;
      for (let triangle = shelfStart; triangle < shelfStart + 6; triangle += 3) {
        const a = contactIndices.getX(triangle), b = contactIndices.getX(triangle + 1), c = contactIndices.getX(triangle + 2);
        const normalY = (contactPositions.getZ(b) - contactPositions.getZ(a)) * (contactPositions.getX(c) - contactPositions.getX(a))
          - (contactPositions.getX(b) - contactPositions.getX(a)) * (contactPositions.getZ(c) - contactPositions.getZ(a));
        expect(normalY, "projected or clipped shelf triangle").toBeGreaterThanOrEqual(-1e-6);
      }
      const x = contactPositions.getX(i) / TILE_SCALE, z = contactPositions.getZ(i) / TILE_SCALE;
      if (x < 0 || z < 0 || x > 139 || z > 139) {
        exteriorContacts += 1;
        expect(contactPositions.getY(i + 8)).toBeLessThan(-0.11);
      }
    }
    expect(exteriorContacts).toBeGreaterThan(0);
    const land = rim.root.getObjectByName("garden-rim-land") as Mesh;
    const positions = land.geometry.getAttribute("position");
    const indices = land.geometry.index!;
    let apronTriangles = 0;
    for (let i = 0; i < indices.count; i += 3) {
      if ([0, 1, 2].some((corner) => {
        const vertex = indices.getX(i + corner);
        const x = positions.getX(vertex) / TILE_SCALE, y = positions.getZ(vertex) / TILE_SCALE;
        return x < 0 || y < 0 || x > 139 || y > 139;
      })) apronTriangles += 1;
    }
    expect(apronTriangles).toBeGreaterThan(0);
    expect(apronTriangles).toBeLessThanOrEqual(12_000);
    const sides = [
      (along: number, out: number) => [-out, along],
      (along: number, out: number) => [139 + out, along],
      (along: number, out: number) => [along, -out],
      (along: number, out: number) => [along, 139 + out],
    ];
    for (const point of sides) {
      const reaches: number[] = [];
      for (let along = 0; along <= 139; along += 1) {
        let reach = 0;
        for (let out = 0.5; out <= limit; out += 0.5) {
          const [x, y] = point(along, out);
          if (gardenRimDecorativeLandAt(x!, y!)) reach = out;
        }
        reaches.push(reach);
      }
      expect(Math.max(...reaches)).toBeGreaterThan(0);
      expect(new Set(reaches.filter((reach) => reach > 0)).size).toBeGreaterThan(5);
      let run = 0;
      for (let i = 1; i < reaches.length; i += 1) {
        run = reaches[i]! > 0 && reaches[i] === reaches[i - 1] ? run + 1 : 0;
        expect(run, "straight outer run").toBeLessThan(140 / 3);
      }
      // A side may carry a dominant headland and a smaller counterpart,
      // not a periodic ruffle. Ignore water gaps and quantization plateaus.
      let rising = false;
      let peaks = 0;
      for (let i = 1; i < reaches.length; i += 1) {
        if (reaches[i] === 0 || reaches[i - 1] === 0) { rising = false; continue; }
        const change = reaches[i]! - reaches[i - 1]!;
        if (change > 0) rising = true;
        if (change < 0 && rising) { peaks += 1; rising = false; }
      }
      expect(peaks, "repeated scalloped apron").toBeLessThanOrEqual(2);
    }
    // Corner returns curve inside their envelope instead of meeting at a
    // right-angled outer box. The in-chart corner remains authoritative land.
    expect(gardenRimDecorativeLandAt(143, 143)).toBe(true);
    expect(gardenRimDecorativeLandAt(149, 149)).toBe(false);
    expect(gardenRimDecorativeLandAt(-5, 144)).toBe(true);
    expect(gardenRimDecorativeLandAt(-12, 151)).toBe(false);
    expect(gardenRimDecorativeLandAt(-12, 86)).toBe(true);
    expect(gardenRimHeightAt(-12, 86)).toBeGreaterThan(5);
    expect(gardenRimDecorativeLandAt(-limit - 0.1, 100)).toBe(false);
    expect(gardenRimDecorativeLandAt(100, 139 + limit + 0.1)).toBe(false);
    expect(Array.from({ length: 140 * 140 }, (_, i) => rimLandAt(i % 140, Math.floor(i / 140)))).toEqual(before);
    expect(GARDEN_NEAR_RIM_SKIRT_DISPLACEMENT).toContain("all four sides");
    rim.dispose();
  });

  it("keeps both full opening corridors and Danger Strait clear of the exterior coast", () => {
    for (const opening of RIM_OPENINGS) {
      for (let angle = opening.bearingStart + 0.02; angle < opening.bearingEnd; angle += 0.04) {
        const dx = Math.cos(angle), dy = Math.sin(angle);
        const border = 69.5 / Math.max(Math.abs(dx), Math.abs(dy));
        for (let out = 0; out <= 18; out += 0.5) {
          expect(gardenRimDecorativeLandAt(69.5 + dx * (border + out), 69.5 + dy * (border + out))).toBe(false);
        }
      }
    }
    const rim = createGardenRimMesh();
    for (const name of ["garden-rim-land", "garden-rim-tide-rock"]) {
      const mesh = rim.root.getObjectByName(name) as Mesh;
      const positions = mesh.geometry.getAttribute("position");
      let dangerStraitVertices = 0;
      for (let i = 0; i < positions.count; i += 1) {
        const x = positions.getX(i) / TILE_SCALE, y = positions.getZ(i) / TILE_SCALE;
        if (x > 142 && y > 18 && y < 42) dangerStraitVertices += 1;
      }
      expect(dangerStraitVertices, `${name} vertices inside Danger Strait`).toBe(0);
    }
    rim.root.updateMatrixWorld(true);
    expect(new Raycaster(new Vector3(0, 100, 0), new Vector3(0, -1, 0)).intersectObject(rim.root, true)).toEqual([]);
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
    let protectedCrest = Number.NEGATIVE_INFINITY;
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
        protectedCrest = Math.max(protectedCrest, height);
      }
    }
    expect(farCrest).toBeGreaterThan(8);
    expect(nearCrest).toBeLessThanOrEqual(3.1);
    expect(protectedSamples).toBeGreaterThan(0);
    expect(protectedCrest, "station shoulders").toBeLessThanOrEqual(3.1);
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
    // Existing dressing thins before the separately bounded outer coast;
    // no new prop inventory is added to fill the larger decorative envelope.
    expect(pines.concat(stones).every((tile) => rimBand(tile) <= 139 + GARDEN_DECORATIVE_COAST_ENVELOPE_TILES)).toBe(true);
    // …while the stroll stays an authored in-bounds route: no ribbon or cove
    // spur of the path draw crosses tile 139…
    const path = rim.root.getObjectByName("garden-rim-path") as Mesh;
    path.geometry.computeBoundingBox();
    expect(path.geometry.boundingBox!.max.x).toBeLessThanOrEqual(boundary * TILE_SCALE + 0.02);
    expect(path.geometry.boundingBox!.max.z).toBeLessThanOrEqual(boundary * TILE_SCALE + 0.02);
    // Positive-side relief stays subordinate to the actual in-chart ridge
    // crest. The northeast return inherits the northern ridge; unlike the old
    // two-sided skirt it is not required to flatten to the low south bank.
    const land = rim.root.getObjectByName("garden-rim-land") as Mesh;
    const landPositions = land.geometry.getAttribute("position");
    const skirtHeights = new Set<number>();
    let skirtTop = Number.NEGATIVE_INFINITY;
    let inChartCrest = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < landPositions.count; index += 1) {
      const x = landPositions.getX(index) / TILE_SCALE;
      const z = landPositions.getZ(index) / TILE_SCALE;
      if (x >= 0 && z >= 0 && x <= boundary && z <= boundary) {
        inChartCrest = Math.max(inChartCrest, landPositions.getY(index));
      }
      if (Math.max(x, z) <= boundary) continue;
      skirtHeights.add(Math.round(landPositions.getY(index) * 20) / 20);
      skirtTop = Math.max(skirtTop, landPositions.getY(index));
    }
    expect(skirtHeights.size).toBeGreaterThanOrEqual(40);
    expect(skirtTop).toBeLessThanOrEqual(inChartCrest);
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

  it("keeps authored substrates in one terrain material with finite role weights and metric coordinates", () => {
    const rim = createGardenRimMesh();
    const land = rim.root.getObjectByName("garden-rim-land") as Mesh;
    const shore = rim.root.getObjectByName("garden-rim-tide-rock") as Mesh;
    expect(shore.material).toBe(land.material);
    expect((land.material as MeshStandardMaterial).userData.gardenSurface).toMatchObject({
      role: "moss", mapping: "triplanar", vertexRoles: true, vertexWeights: true,
    });
    const landRoles = new Set(land.geometry.getAttribute(GARDEN_SURFACE_ROLE_ATTRIBUTE).array);
    for (const role of ["moss", "stone", "gravel", "earth"] as const) expect(landRoles.has(GARDEN_SURFACE_ROLE_CODES[role]), role).toBe(true);
    for (const mesh of [land, shore]) {
      const position = mesh.geometry.getAttribute("position");
      const roles = mesh.geometry.getAttribute(GARDEN_SURFACE_ROLE_ATTRIBUTE);
      const weights = mesh.geometry.getAttribute(GARDEN_SURFACE_WEIGHT_ATTRIBUTE);
      const uv = mesh.geometry.getAttribute("uv");
      const indices = mesh.geometry.index!;
      expect(roles.count).toBe(position.count);
      expect(weights.count).toBe(position.count);
      expect(uv.count).toBe(position.count);
      for (const name of ["position", "normal", "color", "uv", GARDEN_SURFACE_ROLE_ATTRIBUTE, GARDEN_SURFACE_WEIGHT_ATTRIBUTE]) {
        expect(mesh.geometry.getAttribute(name).array.every(Number.isFinite), name).toBe(true);
      }
      // Preserve every vertex/face comparison, but reduce the results before
      // constructing matchers instead of creating one for every scalar.
      let minWeight = Number.POSITIVE_INFINITY;
      let maxWeight = Number.NEGATIVE_INFINITY;
      let metricCoordinates = true;
      for (let vertex = 0; vertex < position.count; vertex += 1) {
        const weight = weights.getX(vertex);
        minWeight = Math.min(minWeight, weight);
        maxWeight = Math.max(maxWeight, weight);
        metricCoordinates = Object.is(uv.getX(vertex), position.getX(vertex))
          && Object.is(uv.getY(vertex), position.getZ(vertex)) && metricCoordinates;
      }
      expect(minWeight).toBeGreaterThanOrEqual(0);
      expect(maxWeight).toBeLessThanOrEqual(1);
      expect(metricCoordinates).toBe(true);
      let homogeneousFaceRoles = true;
      for (let face = 0; face < indices.count; face += 3) {
        const role = roles.getX(indices.getX(face));
        homogeneousFaceRoles = Object.is(roles.getX(indices.getX(face + 1)), role)
          && Object.is(roles.getX(indices.getX(face + 2)), role) && homogeneousFaceRoles;
      }
      expect(homogeneousFaceRoles).toBe(true);
    }
    expect([...new Set(shore.geometry.getAttribute(GARDEN_SURFACE_ROLE_ATTRIBUTE).array)]).toEqual([GARDEN_SURFACE_ROLE_CODES.stone]);
    for (const [name, role, mapping] of [
      ["garden-rim-path", "gravel", "worldXZ"],
      ["garden-rim-stones", "stone", "triplanar"],
      ["garden-rim-revetments", "stone", "triplanar"],
    ]) {
      const material = (rim.root.getObjectByName(name) as Mesh).material as MeshStandardMaterial;
      expect(material.userData.gardenSurface).toMatchObject({ role, mapping });
      expect(material.metalness).toBe(0);
      expect(material.normalMap).toBeNull();
      expect(material.roughnessMap).toBeNull();
    }
    rim.dispose();
  });

  it("releases each rim atlas lease once across rebuild and teardown without generic double-release", () => {
    const textures = { albedo: new DataTexture(), normal: new DataTexture(), orm: new DataTexture() };
    const textureDisposals = Object.values(textures).map((texture) => vi.spyOn(texture, "dispose"));
    const uniforms = { uGardenSurfaceAlbedo: { value: textures.albedo },
      uGardenSurfaceNormal: { value: textures.normal }, uGardenSurfaceOrm: { value: textures.orm } };
    const releases: Mock[] = [];
    const atlas: GardenSurfaceAtlasOwner = { textures, release: vi.fn(), lease: vi.fn(() => {
      const release = vi.fn();
      releases.push(release);
      const lease: GardenSurfaceAtlasLease = { textures, uniforms, release, ready: Promise.resolve(true), error: null,
        detailSource: { key: "rim-test-detail", uniforms,
          glsl: "GardenSurfaceDetail gardenSampleSurface(vec3 p, vec3 n, vec2 uv, float role, float repeatMetres) { return GardenSurfaceDetail(vec3(1.0), 0.0, vec3(0.0)); }" } };
      return lease;
    }) };
    const partRoot = new Group();
    for (let rebuild = 0; rebuild < 2; rebuild += 1) {
      const rim = createGardenRimMesh(undefined, atlas);
      partRoot.add(rim.root);
      expect(atlas.lease).toHaveBeenCalledTimes(rebuild + 1);
      for (const name of ["garden-rim-land", "garden-rim-tide-rock", "garden-rim-path", "garden-rim-stones", "garden-rim-revetments"]) {
        const material = (rim.root.getObjectByName(name) as Mesh).material as MeshStandardMaterial;
        const surface = material.userData.gardenSurface as GardenSurfaceMetadata;
        expect(surface.sourceKey).toBe("rim-test-detail");
        expect(Number.isFinite(surface.metresPerRepeat) && Number.isFinite(surface.detailStrength)).toBe(true);
        const shader = { vertexShader: ShaderLib.standard.vertexShader,
          fragmentShader: ShaderLib.standard.fragmentShader, uniforms: {} as Record<string, IUniform> };
        material.onBeforeCompile(shader as never, null as never);
        for (const [key, uniform] of Object.entries(uniforms)) expect(shader.uniforms[key]).toBe(uniform);
      }
      rim.dispose();
      rim.dispose();
      disposeThreeObjectTree(partRoot);
      expect(partRoot.children).toHaveLength(0);
      expect(releases[rebuild]).toHaveBeenCalledTimes(1);
    }
    expect(atlas.release).not.toHaveBeenCalled();
    for (const disposal of textureDisposals) expect(disposal).not.toHaveBeenCalled();
    Object.values(textures).forEach((texture) => texture.dispose());
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
