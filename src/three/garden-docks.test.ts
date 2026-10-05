import { Box3, Color, InstancedMesh, Matrix4, Mesh, Ray, Vector3, type BufferGeometry } from "three";
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

import { GARDEN_SURFACE_ROLE_ATTRIBUTE, GARDEN_SURFACE_ROLE_CODES } from "./garden-surfaces";
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

  it("samples sagged station profiles, thick undersides and exposed rafters", () => {
    for (const type of ARCHETYPES) {
      const recipe = recipeWithStation(type);
      try {
        const fields = recipe.parts.filter((part) => part.geometry.name === "roof-field");
        for (const field of fields) {
          const geometry = field.geometry;
          geometry.computeBoundingBox();
          const bounds = geometry.boundingBox!;
          const center = bounds.getCenter(new Vector3());
          const acrossX = type === "ethereum-mole" && bounds.max.z - bounds.min.z > bounds.max.x - bounds.min.x;
          const halfSpan = (acrossX ? bounds.max.x - bounds.min.x : bounds.max.z - bounds.min.z) / 2;
          const hitAt = (offset: number) => roofRayHits(geometry,
            new Vector3(center.x + (acrossX ? offset : 0), 100, center.z + (acrossX ? 0 : offset)));
          const a = hitAt(halfSpan - 0.001)[0]!;
          const b = hitAt(-halfSpan + 0.001)[0]!;
          const monoPitch = Math.abs(a - b) > 0.5;
          const eave = bounds.min.y + 0.14;
          const ridge = bounds.max.y;
          const sample = hitAt(monoPitch ? 0 : halfSpan * 0.52);
          const fraction = monoPitch ? 0.5 : 0.48;
          const straight = eave + (ridge - eave) * fraction;
          expect(sample[0], `${type} modest sag`).toBeLessThan(straight - 0.01);
          expect(sample[0], `${type} no upturned caricature`).toBeGreaterThan(straight - 0.051);
          expect(sample[0]! - sample[sample.length - 1]!, `${type} underside thickness`).toBeCloseTo(0.14, 4);
          const index = recipe.parts.indexOf(field);
          const courses = recipe.parts[index + 1]!;
          const rafters = recipe.parts[index + 2]!;
          expect(courses.geometry.name).toBe("ridge-end-courses");
          expect(rafters.geometry.name).toBe("underside-rafters");
          rafters.geometry.computeBoundingBox();
          expect(rafters.geometry.boundingBox!.min.y).toBeLessThan(eave - 0.14);
          expect(rafters.geometry.boundingBox!.max.y).toBeLessThan(ridge - 0.11);
          expect(courses.color.r + courses.color.g + courses.color.b).toBeLessThan(field.color.r + field.color.g + field.color.b);
          const roles = geometry.getAttribute(GARDEN_SURFACE_ROLE_ATTRIBUTE);
          expect(Array.from(roles.array).every((role) => role === GARDEN_SURFACE_ROLE_CODES.roofTile)).toBe(true);
        }
        expect(fields.length, type).toBeGreaterThan(0);
        // End-field samples distinguish the working gable from the inset hip/gable skirt.
        const primary = fields[0]!.geometry;
        primary.computeBoundingBox();
        const box = primary.boundingBox!, x = box.max.x - 0.12;
        const endHeight = roofRayHits(primary, new Vector3(x, 100, (box.min.z + box.max.z) / 2))[0]!;
        if (type === "reed-boathouse") expect(endHeight).toBeCloseTo(box.max.y, 4);
        else if (type !== "ethereum-mole" && type !== "fishing-pier" && type !== "uogashi") {
          expect(endHeight).toBeLessThan(box.min.y + 0.14 + (box.max.y - box.min.y - 0.14) * 0.48);
        }
      } finally {
        for (const part of recipe.parts) part.geometry.dispose();
      }
    }
  });

  it("fits fixed structural bays and recessed plaster without stretching frontage joinery", () => {
    for (const type of ARCHETYPES) for (const share of [0.01, 1]) {
      const recipe = recipeWithStation(type, type, 0, DISPLAY_TILE, FIXTURE_USD, share, 0.1);
      try {
        const frames = recipe.parts.filter((part) => part.geometry.name === "structural-bays");
        expect(frames.length, type).toBeGreaterThan(0);
        for (const frame of frames) {
          const geometry = frame.geometry;
          geometry.computeBoundingBox();
          const bounds = geometry.boundingBox!;
          const positions = geometry.getAttribute("position");
          const firstPost = new Box3();
          for (let i = 0; i < 36; i += 1) firstPost.expandByPoint(new Vector3().fromBufferAttribute(positions, i));
          const post = firstPost.max.x - firstPost.min.x;
          expect(post).toBeLessThanOrEqual(0.16001);
          expect(post).toBeGreaterThanOrEqual(0.06599);
          const centers = new Set<number>();
          for (let start = 0; start < positions.count; start += 36) {
            const member = new Box3();
            for (let i = start; i < start + 36; i += 1) member.expandByPoint(new Vector3().fromBufferAttribute(positions, i));
            if (Math.abs(member.max.y - bounds.max.y) < 0.00001 && Math.abs(member.min.y - bounds.min.y) < 0.00001) {
              centers.add(Number(((member.min.x + member.max.x) / 2).toFixed(5)));
            }
          }
          const xs = [...centers].sort((a, b) => a - b);
          expect(xs[0]).toBeCloseTo(bounds.min.x + post / 2, 4);
          expect(xs[xs.length - 1]).toBeCloseTo(bounds.max.x - post / 2, 4);
          const widths = xs.slice(1).map((x, i) => x - xs[i]!);
          const module = bounds.max.z - bounds.min.z < 0.5 ? 6 : 4.5;
          for (const width of widths.slice(1, -1)) expect(width, `${type} full bay`).toBeCloseTo(module, 4);
          expect(widths[0], `${type} symmetric end fit`).toBeCloseTo(widths[widths.length - 1]!, 4);
          const plaster = recipe.parts[recipe.parts.indexOf(frame) + 1]!.geometry;
          expect(plaster.name).toBe("recessed-plaster");
          plaster.computeBoundingBox();
          expect(plaster.boundingBox!.min.z).toBeGreaterThan(bounds.min.z + post * 0.5);
          expect(plaster.boundingBox!.max.z).toBeLessThan(bounds.max.z - post * 0.5);
        }
        const expected = stationScaleFor(type, share, 0.1);
        expect(recipe.features.roof.footprint.length).toBeCloseTo(expected.length, 4);
        expect(recipe.features.roof.footprint.span).toBeCloseTo(expected.span, 4);
      } finally {
        for (const part of recipe.parts) part.geometry.dispose();
      }
    }
  });

  it("keeps nine maximum-frontage recipes within the displaced two-pass triangle budget", () => {
    let unique = 0, shadow = 0;
    for (const type of ARCHETYPES) {
      const recipe = authorDock({
        ...dock(type, 10, null, Number.POSITIVE_INFINITY),
        frontageShare: 100, frontageMedianShare: 1,
        station: { coveId: type, shoreBearing: 0, type },
      }, DISPLAY_TILE, ISLAND_TILE);
      try {
        for (const part of recipe.parts) {
          const count = (part.geometry.index?.count ?? part.geometry.getAttribute("position").count) / 3;
          unique += count;
          if (part.castShadow) shadow += count;
        }
      } finally {
        for (const part of recipe.parts) part.geometry.dispose();
      }
    }
    // Matched pre-adoption recipe census: props/flags are unchanged and cancel.
    expect(unique - 10_054).toBeLessThanOrEqual(8_000);
    expect(unique + shadow - 19_076).toBeLessThanOrEqual(16_000);
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

/** Sample actual recipe faces, independent of feature counters or roof names. */
function roofRayHits(geometry: BufferGeometry, origin: Vector3): number[] {
  const ray = new Ray(origin, new Vector3(0, -1, 0));
  const p = geometry.getAttribute("position"), index = geometry.index;
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), hit = new Vector3();
  const hits: number[] = [];
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    a.fromBufferAttribute(p, index ? index.getX(i) : i);
    b.fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1);
    c.fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2);
    if (ray.intersectTriangle(a, b, c, false, hit)) hits.push(hit.y);
  }
  return hits.sort((a, b) => b - a);
}
