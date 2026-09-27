import { Box3, Color, InstancedMesh, Matrix4, Mesh, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { DockNode } from "../systems/world-types";
import { HARBOR_PALETTE } from "../systems/palette";
import { EVM_BAY_STATION_SLOTS, OUTER_HARBOR_STATION_SLOTS } from "../systems/world-layout";
import { HARBOR_NOBORI_FACING_YAW, HARBOR_QUAY_TOP_Y, STATION_SCALE_LADDER, stationScaleFor, STATION_LOCAL_BOUNDS } from "../systems/dock-layout";
import { GARDEN_DOCK_ROOT_Y } from "../systems/garden-observatory-slice";
import {
  authorDock,
  gardenHarborLanternWorldPositions,
  harborIdentity,
  WALL_PLASTER,
  type DockRecipe,
  type StationType,
} from "./garden-docks";
import { createGardenHarborBatch } from "./garden-harbor-batch";
import { dockFixture as dock, ISLAND_TILE } from "./__fixtures__/harbor";

const DISPLAY_TILE = { x: 40, y: 32 };
const ARCHETYPES: readonly StationType[] = [
  "ethereum-mole", "hatago-wharf", "uogashi", "stepped-inlet", "fishing-pier",
  "tea-house-quay", "reed-boathouse", "storm-mole", "pigeonnier-islet",
];
const ACCENT_COLOR: Record<StationType, string> = {
  "ethereum-mole": HARBOR_PALETTE.stone_mid,
  "fishing-pier": HARBOR_PALETTE.aurora_green,
  "hatago-wharf": HARBOR_PALETTE.timber_warm,
  "pigeonnier-islet": HARBOR_PALETTE.moonlight,
  "reed-boathouse": HARBOR_PALETTE.timber_warm,
  "stepped-inlet": HARBOR_PALETTE.iron_dark,
  "storm-mole": HARBOR_PALETTE.fog_pale,
  "tea-house-quay": HARBOR_PALETTE.lantern_warm,
  uogashi: HARBOR_PALETTE.lantern_cold,
};
const FIXTURE_USD = 7_000_000_000;
const EMITTED_ARCHETYPES: readonly StationType[] = [...new Set([
  ...EVM_BAY_STATION_SLOTS,
  ...OUTER_HARBOR_STATION_SLOTS,
].map((slot) => slot.type))];

describe("garden station recipes", () => {
  it("gives every station its own ground-level identity", () => {
    const identities = ARCHETYPES.map((type) => recipeWithStation(type).identity);
    expect(new Set(identities.map((identity) => identity.signature)).size).toBe(ARCHETYPES.length);
    for (const type of ARCHETYPES) expect(recipeWithStation(type).station.type).toBe(type);
  });

  it("keeps every maximum recipe inside its declared local envelope", () => {
    const roundingTolerance = 0.011;
    for (const type of ARCHETYPES) {
      const node = {
        ...dock(type, 10, null, Number.POSITIVE_INFINITY),
        station: { coveId: `cove.${type}`, shoreBearing: 0, type },
      } as DockNode & { station: { coveId: string; shoreBearing: number; type: StationType } };
      const bounds = recipeBounds(authorDock(node, DISPLAY_TILE, ISLAND_TILE));
      const declared = STATION_LOCAL_BOUNDS[type];
      expect(bounds.min.x, `${type} minX`).toBeGreaterThanOrEqual(declared.minX - roundingTolerance);
      expect(bounds.max.x, `${type} maxX`).toBeLessThanOrEqual(declared.maxX + roundingTolerance);
      expect(bounds.min.z, `${type} minZ`).toBeGreaterThanOrEqual(declared.minZ - roundingTolerance);
      expect(bounds.max.z, `${type} maxZ`).toBeLessThanOrEqual(declared.maxZ + roundingTolerance);
      if (type === "ethereum-mole") {
        const components = declared.components!;
        const recipe = authorDock(node, DISPLAY_TILE, ISLAND_TILE);
        for (const part of recipe.parts.filter((candidate) => candidate.bucket === "stone")) {
          const position = part.geometry.getAttribute("position");
          for (let index = 0; index < position.count; index += 1) {
            const x = position.getX(index);
            const z = position.getZ(index);
            expect(components.some((component) => (
              x >= component.minX - roundingTolerance
              && x <= component.maxX + roundingTolerance
              && z >= component.minZ - roundingTolerance
              && z <= component.maxZ + roundingTolerance
            )), `ethereum-mole ${part.bucket} vertex ${index} outside solid components`)
              .toBe(true);
          }
        }
      }
    }
  });

  it("stands each station's one stone lantern on its quay, on the rest seat's side", () => {
    for (const type of ARCHETYPES) {
      for (const frontageShare of [0.01, 10]) {
        const recipe = authorDock({
          ...dock(type, 10, null, 1),
          frontageShare,
          frontageMedianShare: 1,
          station: { coveId: `lantern.${type}`, shoreBearing: 0.7, type },
        }, DISPLAY_TILE, ISLAND_TILE);
        const lantern = recipe.lantern!;
        expect(lantern, type).not.toBeNull();
        expect(lantern.y, `${type} on the quay top`).toBeCloseTo(GARDEN_DOCK_ROOT_Y + HARBOR_QUAY_TOP_Y, 6);
        const local = new Vector3(lantern.x, 0, lantern.z)
          .applyMatrix4(new Matrix4().copy(recipe.rootMatrix).invert());
        const declared = STATION_LOCAL_BOUNDS[type];
        expect(local.x, `${type} lantern X`).toBeLessThanOrEqual(declared.maxX);
        expect(local.x, `${type} lantern X`).toBeGreaterThanOrEqual(declared.minX);
        expect(Math.abs(local.z), `${type} lantern off-centre`).toBeGreaterThan(0.9);
        // Camera side: the lantern's tangent offset points toward the eye.
        const toEye = new Vector3(161.54, 0, 254.11).applyMatrix4(new Matrix4().copy(recipe.rootMatrix).invert());
        expect(Math.sign(local.z), `${type} toward the rest seat`).toBe(Math.sign(toEye.z));
      }
    }
  });

  it("leaves the western terrace arc dark but keeps each of its stations one lit shoji", () => {
    for (const [coveId, type] of [["ethereum-mole", "ethereum-mole"], ["ledger-fog-hook", "hatago-wharf"], ["wreck-shoal-east", "storm-mole"]] as const) {
      const recipe = authorDock({ ...dock(coveId, 6), station: { coveId, shoreBearing: 0, type } }, DISPLAY_TILE, ISLAND_TILE);
      expect(recipe.lantern, coveId).toBeNull();
      expect(recipe.features.warmWindowCount, coveId).toBeGreaterThanOrEqual(1);
      expect(gardenHarborLanternWorldPositions([recipe])).toEqual([]);
    }
  });

  it("kindles the ring outward from the beacon: every near station before every far one", () => {
    const near = recipeWithStation("tea-house-quay", "near", 0, { x: ISLAND_TILE.x + 30, y: ISLAND_TILE.y });
    const far = recipeWithStation("tea-house-quay", "far", 0, { x: ISLAND_TILE.x + 75, y: ISLAND_TILE.y });
    for (const chain of ["a", "b", "c", "d", "e", "f"]) {
      const nearOrder = recipeWithStation("uogashi", `near-${chain}`, 0, { x: ISLAND_TILE.x, y: ISLAND_TILE.y + 30 }).kindleOrder;
      const farOrder = recipeWithStation("uogashi", `far-${chain}`, 0, { x: ISLAND_TILE.x, y: ISLAND_TILE.y + 75 }).kindleOrder;
      expect(nearOrder.lantern).toBeLessThan(far.kindleOrder.lantern);
      expect(farOrder.lantern).toBeGreaterThan(near.kindleOrder.lantern);
      // A station's shoji follows its own lantern.
      expect(nearOrder.shoji).toBeGreaterThan(nearOrder.lantern);
      expect(farOrder.shoji).toBeLessThanOrEqual(1);
    }
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

  // Harbour-1: one low, roof-dominant vernacular. The roof carries at least
  // 40 % of each station's elevation above its quay, one plaster and three
  // roof tones serve the whole ring, nothing ordinary rises past the rim
  // hills, and the Mole's open fire-watch frame is the ring's one vertical.
  it("builds every station in one low, roof-dominant vernacular", () => {
    const roofTones = new Set([
      HARBOR_PALETTE.roof_slate_kawara,
      HARBOR_PALETTE.roof_storm_slate,
    ].map((hex) => new Color(hex).getHexString()));
    let civicCopper = "";
    for (const type of ARCHETYPES) {
      const recipe = recipeWithStation(type);
      const { roof } = recipe.features;
      const top = STATION_SCALE_LADDER[type].silhouetteTop;
      const share = (roof.height - roof.eaveY) / (roof.height - HARBOR_QUAY_TOP_Y);
      expect(share, `${type} roof share of elevation`).toBeGreaterThanOrEqual(0.4);
      expect(maxGeometryY(recipe), `${type} silhouette`).toBeLessThanOrEqual(top + 0.2);
      if (type === "ethereum-mole") {
        expect(maxGeometryY(recipe)).toBeGreaterThan(13);
      } else {
        expect(Math.abs(roof.height - top), `${type} ridge on the ladder`).toBeLessThan(0.15);
        expect(top, `${type} below the rim hills`).toBeLessThanOrEqual(9.5);
      }
      expect(recipe.features.quayPlatform.height, `${type} raised quay`).toBeGreaterThanOrEqual(1.45);
      expect(recipe.features.warmWindowCount, `${type} shoji`).toBe(type === "ethereum-mole" ? 3 : 1);
      const field = recipe.parts.find((part) => part.bucket === "roof")!.color.getHexString();
      if (type === "ethereum-mole") civicCopper = field;
      else expect(roofTones.has(field), `${type} roof tone ${field}`).toBe(true);
      for (const wall of recipe.parts.filter((part) => part.bucket === "wall")) {
        expect(wall.color.getHexString(), `${type} one plaster`).toBe(WALL_PLASTER.getHexString());
      }
    }
    expect(roofTones.has(civicCopper)).toBe(false);
  });

  // Hour-Print §1.1 rule 2, "nothing glows by day": the day cycle zeroes the
  // window emissive in daylight, so the albedo alone decides how a window
  // reads at noon. Openings must be dark voids.
  it("authors every shoji and the moon window as a dark opening by day", () => {
    for (const type of ARCHETYPES) {
      const recipe = recipeWithStation(type);
      const window = recipe.parts.find((part) => part.bucket === "window")!;
      const { r, g, b } = window.color;
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      // Relative luminance 0.03 is CIE L* ≈ 20.
      expect(luminance, `${type} window albedo`).toBeLessThan(0.03);
    }
  });

  it("scales chain-station roof mass by supply with clamped length while keeping the Mole fixed", () => {
    const medianShare = 0.1;
    for (const type of ARCHETYPES) {
      const lowShare = 0.01;
      const highShare = 1;
      const low = recipeWithStation(type, `low-${type}`, 0, DISPLAY_TILE, 1, lowShare, medianShare);
      const high = recipeWithStation(type, `high-${type}`, 0, DISPLAY_TILE, 1e20, highShare, medianShare);
      if (type === "ethereum-mole") {
        expect(low.features.roof.footprint).toEqual(high.features.roof.footprint);
        expect(low.features.roof.footprint.length).toBeCloseTo(24, 5);
        continue;
      }
      expect(low.features.roof.footprint.length).toBeCloseTo(stationScaleFor(type, lowShare, medianShare).length, 1);
      expect(high.features.roof.footprint.length).toBeCloseTo(stationScaleFor(type, highShare, medianShare).length, 1);
      expect(high.features.roof.footprint.length).toBeGreaterThan(low.features.roof.footprint.length);
      expect(low.features.roof.height).toBeCloseTo(high.features.roof.height, 1);
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

  it("makes Ethereum the largest station and the only one standing past its roof", () => {
    const capital = recipeWithStation("ethereum-mole", "ethereum");
    const others = ARCHETYPES.filter((type) => type !== "ethereum-mole")
      .map((type, index) => recipeWithStation(type, `chain-${index}`));
    for (const other of others) {
      expect(capital.footprint.length).toBeGreaterThan(other.footprint.length);
      expect(capital.footprint.span).toBeGreaterThan(other.footprint.span);
      expect(maxGeometryY(other)).toBeLessThan(capital.features.roof.height);
    }
    expect(capital.identity.signature).toBe("enclosed-basin");
    expect(maxGeometryY(capital) - capital.features.roof.height).toBeGreaterThanOrEqual(3);
  });

  it("pins the Ethereum Mole composition, night discipline, and render budget", () => {
    const mole = recipeWithStation("ethereum-mole", "ethereum");
    const bounds = recipeBounds(mole);
    expect(bounds.max.y).toBeCloseTo(13.5, 6);
    expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(40);
    expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(34);

    // The two masonry bands leave the authored 18 × 14 basin as actual
    // negative space, rather than covering it with a decorative water plane.
    const stone = mole.parts.find((part) => part.bucket === "stone")!.geometry;
    const stonePosition = stone.getAttribute("position");
    let basinVertices = 0;
    let longArmEnd = -Infinity;
    let shortArmEnd = -Infinity;
    for (let index = 0; index < stonePosition.count; index += 1) {
      const x = stonePosition.getX(index);
      const y = stonePosition.getY(index);
      const z = stonePosition.getZ(index);
      if (x > -3 && x < 15 && y >= 0.75 && Math.abs(z) < 7) basinVertices += 1;
      if (z < -7 && z > -12.5) longArmEnd = Math.max(longArmEnd, x);
      if (z > 7) shortArmEnd = Math.max(shortArmEnd, x);
    }
    expect(basinVertices).toBe(0);
    expect(longArmEnd).toBeCloseTo(17, 5);
    expect(shortArmEnd).toBeGreaterThanOrEqual(12.3);
    expect(shortArmEnd).toBeLessThanOrEqual(STATION_LOCAL_BOUNDS["ethereum-mole"].components![2]!.maxX);
    expect(longArmEnd - shortArmEnd).toBeGreaterThan(4);

    expect(mole.identity.signature).toBe("enclosed-basin");
    const emissive = mole.parts.find((part) => part.bucket === "window")!.geometry;
    emissive.computeBoundingBox();
    expect(emissive.boundingBox!.max.y).toBeLessThanOrEqual(7);
    const vermillion = new Color(HARBOR_PALETTE.vermillion).getHex();
    expect(mole.parts.every((part) => part.color.getHex() !== vermillion)).toBe(true);

    const batch = createGardenHarborBatch([mole]);
    let triangles = 0;
    let draws = 0;
    batch.root.traverse((object) => {
      if (!(object instanceof Mesh) || !object.visible) return;
      draws += 1;
      const geometryTriangles = object.geometry.index
        ? object.geometry.index.count / 3
        : object.geometry.getAttribute("position").count / 3;
      triangles += geometryTriangles * (object instanceof InstancedMesh ? object.count : 1);
    });
    expect(triangles).toBeGreaterThanOrEqual(3_500);
    expect(triangles).toBeLessThanOrEqual(9_000);
    expect(draws).toBeLessThanOrEqual(10);
    batch.dispose();
  });

  it("keeps architectural voids and structural ironwork in the cruise tier", () => {
    for (const type of ["reed-boathouse", "pigeonnier-islet"] as const) {
      const recipe = recipeWithStation(type);
      const coarseMetal = recipe.parts.find((part) => part.bucket === "metal" && !part.fineDetail);
      expect(coarseMetal, `${type} coarse void`).toBeDefined();
      coarseMetal!.geometry.computeBoundingBox();
      expect(coarseMetal!.geometry.boundingBox!.max.y, `${type} visible void height`).toBeGreaterThan(3.5);
    }
    const fishing = recipeWithStation("fishing-pier");
    expect(fishing.parts.some((part) => part.bucket === "metal" && part.fineDetail)).toBe(true);
  });

  it("uses one palette-owned architectural accent per station", () => {
    for (const type of ARCHETYPES) {
      const accents = recipeWithStation(type).parts.filter((part) => part.bucket === "accent");
      expect(accents, type).toHaveLength(1);
      expect(accents[0]!.color.getHex(), type).toBe(new Color(ACCENT_COLOR[type]).getHex());
      expect(accents[0]!.color.getHex(), `${type} never vermillion`).not.toBe(new Color(HARBOR_PALETTE.vermillion).getHex());
    }
  });

  it("permits one archetype works prop at most", () => {
    for (const type of ARCHETYPES) {
      const recipe = recipeWithStation(type);
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
      part.bucket === "stone"
      && part.color.getHexString() === new Color(HARBOR_PALETTE.iron_dark).getHexString()
      && !part.fineDetail
    ));
    expect(cracks?.bucket).toBe("stone");
    const bollard = recipe.props.find((prop) => prop.kind === "bollard")!;
    expect(Math.abs(bollard.matrix.elements[1]!)).toBeGreaterThan(0.05);
  });

  it("allocates visible quay and roof frontage by tracked-supply share", () => {
    const dimensionsFor = (frontageShare: number) => {
      const recipe = recipeWithStation(
        "uogashi",
        `solana-${frontageShare}`,
        0,
        DISPLAY_TILE,
        5_000_000_000,
        frontageShare,
        0.1,
      );
      return {
        quay: recipe.features.quayPlatform.footprint.length,
        roof: recipe.features.roof.footprint.length,
      };
    };
    const low = dimensionsFor(0.1);
    const middle = dimensionsFor(Math.sqrt(0.1));
    const high = dimensionsFor(1);

    expect(low.quay).toBeLessThan(middle.quay);
    expect(middle.quay).toBeLessThan(high.quay);
    expect(low.roof).toBeLessThan(middle.roof);
    expect(middle.roof).toBeLessThan(high.roof);
  });

  it("flies rest-facing nobori", () => {
    const recipe = recipeWithStation("hatago-wharf", "base", Math.PI / 2);
    expect(recipe.anchorRotationY + recipe.flag.placement.yaw).toBeCloseTo(HARBOR_NOBORI_FACING_YAW, 6);
  });
});

function recipeWithStation(
  type: StationType,
  chainId: string = type,
  shoreBearing = 0,
  tile = DISPLAY_TILE,
  totalUsd = FIXTURE_USD,
  frontageShare?: number,
  frontageMedianShare?: number,
): DockRecipe {
  const node = {
    ...dock(chainId, 7, null, totalUsd),
    ...(frontageShare === undefined ? {} : { frontageShare }),
    ...(frontageMedianShare === undefined ? {} : { frontageMedianShare }),
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

function recipeBounds(recipe: DockRecipe): Box3 {
  const bounds = new Box3().makeEmpty();
  for (const part of recipe.parts) {
    part.geometry.computeBoundingBox();
    if (part.geometry.boundingBox) bounds.union(part.geometry.boundingBox);
  }
  return bounds;
}
