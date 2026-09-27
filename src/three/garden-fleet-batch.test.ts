import { beforeEach, describe, expect, it, vi } from "vitest";
import { Color, Matrix4, MeshStandardMaterial, Vector3 } from "three";
import { createFleetBatchGeometry } from "./garden-ships";
import {
  GARDEN_SAIL_DIP_MIN_SCALE,
  gardenArrivalBeatEnvelope,
} from "../systems/garden-arrival-beats";
import {
  FLEET_SAIL_ATLAS_CELLS,
  FLEET_HERO_BAND_NEAREST,
  FLEET_MAX_SAILS,
  FLEET_HULL_LOD_DISTANCE,
  beginFleetFrame,
  createFleetBatches,
  deformFleetSailVertex,
  disposeFleetBatches,
  endFleetFrame,
  fleetDrawCallCount,
  fleetInstanceCount,
  gardenFleetAttention,
  gardenFleetClothWeave,
  gardenFleetFramingRestraint,
  gardenFleetMarkPresence,
  gardenFleetShipHeroWeight,
  gardenFleetPackSailAttention,
  gardenFleetPackSailCell,
  gardenFleetUnpackSailAttention,
  gardenFleetUnpackSailCell,
  gardenFleetUnpackSailDistance,
  gardenFleetSailRestraint,
  patchSailAtlasMaterial,
  setFleetAttention,
  setFleetWeather,
  writeFleetInstance,
  type FleetInstancePose,
  type FleetSailDeformInput,
} from "./garden-fleet-batch";
import { gardenSailClothColor } from "./garden-sail-texture";
import type { ShipLivery } from "../systems/world-types";
import type { GardenHullSilhouette } from "../systems/garden-observatory-slice";
import { cameraEye, cameraPoseFromIso } from "../systems/projection";

const SILHOUETTES: GardenHullSilhouette[] = [
  "bezaisen", "kobaya", "twinhull", "takasebune", "junk", "scow",
];

function buildBatches(capacity: number) {
  return createFleetBatches({
    cache: { geometries: new Map(), wakeFillMaterial: null as never },
    capacity,
    geometryFor: (silhouette) => createFleetBatchGeometry(silhouette),
    pennantGeometry: createFleetBatchGeometry("bezaisen").sails,
    sailTexture: null,
    silhouettes: SILHOUETTES,
  });
}

function pose(overrides: Partial<FleetInstancePose> = {}): FleetInstancePose {
  return {
    atlasCell: 0,
    shipId: `ship-${overrides.atlasCell ?? 0}-${overrides.x ?? 0}`,
    headingAngle: 0,
    heel: 0,
    hullColor: new Color("#884422"),
    hullForm: { beam: 1, height: 1, length: 1 },
    pennantColor: new Color("#22aa88"),
    sailColor: new Color("#2775ca"),
    trimColor: new Color("#2775ca"),
    mastheadOffset: { x: 0, y: 4 },
    sailFurl: 0,
    pitch: 0,
    scale: 1,
    silhouette: "bezaisen",
    x: 0,
    y: 0,
    z: 0,
    ...overrides,
  };
}

describe("createFleetBatchGeometry", () => {
  it("merges every silhouette into exactly one hull and one sail geometry", () => {
    for (const silhouette of SILHOUETTES) {
      const source = createFleetBatchGeometry(silhouette);
      expect(source.hull.getAttribute("position").count).toBeGreaterThan(0);
      expect(source.sails.getAttribute("position").count).toBeGreaterThan(0);
      // The livery multiplier rides on vertex colors, so the attribute must
      // survive the merge for every part.
      expect(source.hull.getAttribute("color")).toBeDefined();
      source.hull.dispose();
      source.sails.dispose();
    }
  });

  it("marks exactly one identity sail per silhouette for the atlas path", () => {
    for (const silhouette of SILHOUETTES) {
      const { sails } = createFleetBatchGeometry(silhouette);
      const flags = sails.getAttribute("aAtlasSail");
      const sailIndices = sails.getAttribute("aSailIndex");
      expect(flags).toBeDefined();
      let marked = 0;
      for (let index = 0; index < flags.count; index += 1) {
        const identity = flags.getX(index) > 0.5;
        if (identity) marked += 1;
        // Sail index zero is reserved for the one unfurlable identity sail;
        // every other sail must stay on the atlas's plain-canvas cell.
        expect(identity).toBe(sailIndices.getX(index) === 0);
      }
      expect(marked).toBeGreaterThan(0);
      sails.dispose();
    }
  });

  it("is deterministic across rebuilds", () => {
    const first = createFleetBatchGeometry("kobaya");
    const second = createFleetBatchGeometry("kobaya");
    const a = first.hull.getAttribute("position");
    const b = second.hull.getAttribute("position");
    expect(a.count).toBe(b.count);
    for (let index = 0; index < a.count; index += 1) {
      expect(a.getX(index)).toBeCloseTo(b.getX(index), 10);
      expect(a.getY(index)).toBeCloseTo(b.getY(index), 10);
    }
    first.hull.dispose();
    first.sails.dispose();
    second.hull.dispose();
    second.sails.dispose();
  });
});

describe("fleet sail deformation", () => {
  const sailInput: FleetSailDeformInput = {
    furlMask: 0,
    hullForm: { beam: 1, height: 1, length: 1, waterline: 0 },
    instanceX: 8,
    instanceZ: -3,
    sailHead: { x: 0.2, y: 3.4, z: 0.08 },
    sailIndex: 2,
    uv: { x: 0.4, y: 0.6 },
    vertex: { x: 0.7, y: 2.2, z: 0.3 },
    windFlutter: 0.9,
    windTime: 4.7,
  };

  it("runs flutter and furling in sail-local space before hull deformation", () => {
    const material = new MeshStandardMaterial();
    patchSailAtlasMaterial(material);
    const shader = {
      fragmentShader: "#include <common>\n#include <map_fragment>",
      uniforms: {} as Record<string, unknown>,
      vertexShader: "#include <common>\n#include <begin_vertex>\n#include <uv_vertex>",
    };
    material.onBeforeCompile(shader as never, null as never);

    const dropAt = shader.vertexShader.indexOf("float sailDrop");
    const furlAt = shader.vertexShader.indexOf("transformed.y = mix");
    const hullAt = shader.vertexShader.indexOf("transformed.x *= aHullForm.x");
    expect(dropAt).toBeGreaterThan(-1);
    expect(furlAt).toBeGreaterThan(dropAt);
    expect(hullAt).toBeGreaterThan(furlAt);
    expect(shader.vertexShader).toContain("* setSail;");
  });

  it("keeps flutter independent of hull height, ride offset, and waterline", () => {
    const staticWind = deformFleetSailVertex({ ...sailInput, windFlutter: 0 });
    const animated = deformFleetSailVertex(sailInput);
    const baselineDelta = animated.z - staticWind.z;

    for (const height of [0.55, 1, 1.8]) {
      for (const waterline of [-0.4, 0, 0.35]) {
        const hullForm = { beam: 1, height, length: 1, waterline };
        const still = deformFleetSailVertex({ ...sailInput, hullForm, windFlutter: 0 });
        const windy = deformFleetSailVertex({ ...sailInput, hullForm });
        expect(windy.z - still.z).toBeCloseTo(baselineDelta, 10);
      }
    }
  });
  it("dips a sail to 0.6 about its yard without moving the hull batch", () => {
    const set = deformFleetSailVertex({ ...sailInput, windFlutter: 0, sailScale: 1 });
    const dipped = deformFleetSailVertex({ ...sailInput, windFlutter: 0, sailScale: 0.6 });

    expect(set.y).toBeCloseTo(2.2, 10);
    expect(dipped.y).toBeCloseTo(3.4 - (3.4 - 2.2) * 0.6, 10);
    expect(dipped.x).toBe(set.x);
  });

  it("preserves every furl bit and yard-relative dip through Float32 packing", () => {
    for (let mask = 0; mask < 2 ** FLEET_MAX_SAILS; mask += 1) {
      const packed = Math.fround(mask + (1 - GARDEN_SAIL_DIP_MIN_SCALE) * 0.99);
      for (let sailIndex = 0; sailIndex < FLEET_MAX_SAILS; sailIndex += 1) {
        const decoded = deformFleetSailVertex({
          ...sailInput, furlMask: packed, sailIndex, windFlutter: 0,
        });
        const expected = deformFleetSailVertex({
          ...sailInput, furlMask: mask, sailIndex, windFlutter: 0,
          sailScale: GARDEN_SAIL_DIP_MIN_SCALE,
        });
        expect(decoded.setSail).toBe(expected.setSail);
        expect(decoded.y).toBeCloseTo(expected.y, 5);
        expect(decoded.z).toBeCloseTo(expected.z, 5);
      }
    }
  });


  it("keeps every furled sail bundled under every hull form and wind state", () => {
    for (let sailIndex = 0; sailIndex < FLEET_MAX_SAILS; sailIndex += 1) {
      const furlMask = 2 ** sailIndex;
      for (const hullForm of [
        { beam: 0.6, height: 1.7, length: 1.3, waterline: -0.35 },
        { beam: 1.4, height: 0.65, length: 0.8, waterline: 0.3 },
      ]) {
        const still = deformFleetSailVertex({
          ...sailInput,
          furlMask,
          hullForm,
          sailIndex,
          windFlutter: 0,
        });
        const gale = deformFleetSailVertex({
          ...sailInput,
          furlMask,
          hullForm,
          sailIndex,
          windFlutter: 1,
          windTime: 91,
        });
        expect(gale.setSail).toBe(0);
        expect(gale.x).toBeCloseTo(still.x, 10);
        expect(gale.y).toBeCloseTo(still.y, 10);
        expect(gale.z).toBeCloseTo(still.z, 10);
      }
    }
  });

  it("braces a square sail about its mast, never a fore-and-aft one", () => {
    const square = { ...sailInput, square: true, windFlutter: 0, windTime: 0 };
    const quarter = Math.PI / 4;
    const braced = deformFleetSailVertex({ ...square, braceRad: quarter });
    const unbraced = deformFleetSailVertex({ ...square, braceRad: 0 });
    const radius = (point: { x: number; z: number }) => Math.hypot(
      point.x - sailInput.sailHead.x,
      point.z - sailInput.sailHead.z,
    );
    // Rotation about the mast: distance from the pivot kept, the point moved.
    expect(radius(braced)).toBeCloseTo(radius(unbraced), 10);
    expect(Math.hypot(braced.x - unbraced.x, braced.z - unbraced.z)).toBeGreaterThan(0.1);
    // + swings the starboard (+z) yardarm forward (+x).
    const yardarm = deformFleetSailVertex({
      ...square, braceRad: quarter, cloth: 0, vertex: { x: 0.2, y: 3.4, z: 2.08 },
    });
    expect(yardarm.x).toBeGreaterThan(sailInput.sailHead.x + 1);
    const triangle = { ...sailInput, windFlutter: 0, windTime: 0 };
    expect(deformFleetSailVertex({ ...triangle, braceRad: quarter }))
      .toEqual(deformFleetSailVertex({ ...triangle, braceRad: 0 }));
  });

  it("round-trips the brace and luff through the packed instance channels", () => {
    for (const cell of [0, 7, 255]) {
      for (const brace of [-0.75, -0.5, 0, 0.31, 0.7]) {
        const unpacked = gardenFleetUnpackSailCell(Math.fround(gardenFleetPackSailCell(cell, brace)));
        expect(unpacked.cell).toBe(cell);
        expect(unpacked.braceRad).toBeCloseTo(brace, 3);
      }
    }
    for (const attention of [0, 0.37, 1]) {
      for (const luff of [0, 0.3, 1]) {
        const unpacked = gardenFleetUnpackSailAttention(Math.fround(gardenFleetPackSailAttention(attention, luff)));
        expect(unpacked.attention).toBeCloseTo(attention, 4);
        expect(unpacked.luff).toBeCloseTo(Math.round(luff * 31) / 31, 6);
      }
    }
  });
});

describe("fleet downwind convention", () => {
  it("points pennants toward default, quarter-turn, and opposite bearings", () => {
    const bearings = [0, Math.PI / 2, Math.PI] as const;
    for (const windAngle of bearings) {
      const batches = buildBatches(1);
      setFleetWeather({
        breath: 0.5,
        gust: 0,
        timeSeconds: 0,
        windAngle,
        windDirX: Math.cos(windAngle),
        windDirZ: Math.sin(windAngle),
        windSpeed: 0,
      });
      beginFleetFrame(batches);
      writeFleetInstance(batches, pose({ headingAngle: 0.73, x: 0, z: 0 }));
      endFleetFrame(batches);

      const matrix = new Matrix4();
      batches.pennant.mesh.getMatrixAt(0, matrix);
      const direction = new Vector3(1, 0, 0).transformDirection(matrix);
      expect(direction.x).toBeCloseTo(Math.cos(windAngle), 6);
      expect(direction.z).toBeCloseTo(Math.sin(windAngle), 6);
      disposeFleetBatches(batches);
    }
    setFleetWeather(null);
  });
});

describe("fleet batches", () => {
  it("moves a ship exactly once through each side of the half-unit LOD dead band", () => {
    const batches = buildBatches(FLEET_HERO_BAND_NEAREST + 1);
    const viewport = { x: 1200, y: 640 };
    const camera = { offsetX: 600, offsetY: 320, zoom: 0.72 };
    const eye = cameraEye(cameraPoseFromIso(camera, viewport));
    const batch = batches.bySilhouette.get("bezaisen")!;
    const offsets = [-1, 0.1, 0.24, 0.26, 0.1, -0.1, -0.24, -0.26];
    const farCounts: number[] = [];
    offsets.forEach((offset, index) => {
      beginFleetFrame(batches, { camera, viewport, timeSeconds: index });
      // A nearer hero band, so the crossing ship is rank and file.
      for (let near = 0; near < FLEET_HERO_BAND_NEAREST; near += 1) {
        writeFleetInstance(batches, pose({
          shipId: `near-${near}`, silhouette: "kobaya", x: eye.x + 10 + near, y: eye.y, z: eye.z,
        }));
      }
      writeFleetInstance(batches, pose({
        shipId: "crossing", atlasCell: 3,
        x: eye.x + FLEET_HULL_LOD_DISTANCE + offset, y: eye.y, z: eye.z,
      }));
      endFleetFrame(batches);
      expect(batch.hull.mesh.count + batch.far.mesh.count).toBe(1);
      expect(batch.sails.mesh.count).toBe(batch.hull.mesh.count);
      farCounts.push(batch.far.mesh.count);
    });
    expect(farCounts).toEqual([0, 0, 0, 1, 1, 1, 1, 0]);
    disposeFleetBatches(batches);
  });

  it("dissolves a ship across the ink boundary over the fade, covering it once", () => {
    const batches = buildBatches(FLEET_HERO_BAND_NEAREST + 1);
    const viewport = { x: 1200, y: 640 };
    const camera = { offsetX: 600, offsetY: 320, zoom: 0.72 };
    const eye = cameraEye(cameraPoseFromIso(camera, viewport));
    const batch = batches.bySilhouette.get("bezaisen")!;
    const frame = (timeSeconds: number, offset: number) => {
      beginFleetFrame(batches, { camera, viewport, timeSeconds });
      for (let near = 0; near < FLEET_HERO_BAND_NEAREST; near += 1) {
        writeFleetInstance(batches, pose({
          shipId: `near-${near}`, silhouette: "kobaya", x: eye.x + 10 + near, y: eye.y, z: eye.z,
        }));
      }
      writeFleetInstance(batches, pose({
        shipId: "crossing", atlasCell: 3, x: eye.x + FLEET_HULL_LOD_DISTANCE + offset, y: eye.y, z: eye.z,
      }));
      endFleetFrame(batches);
    };
    frame(0, -5);
    frame(1 / 60, -5);
    expect(batch.far.mesh.count).toBe(0);
    // Step past the threshold at 60 Hz: both LODs draw, their dissolves sum to one.
    let seconds = 1 / 60;
    let bothFrames = 0;
    while (seconds < 2) {
      seconds += 1 / 60;
      frame(seconds, 5);
      if (batch.hull.mesh.count === 1 && batch.far.mesh.count === 1) {
        bothFrames += 1;
        const full = gardenFleetUnpackSailDistance(batch.sails.sailAttention!.getY(0)).hidden;
        const ink = gardenFleetUnpackSailDistance(batch.far.sailAttention!.getY(0)).hidden;
        expect(full + ink).toBeCloseTo(1, 1);
      }
      if (batch.hull.mesh.count === 0) break;
    }
    expect(bothFrames / 60).toBeGreaterThanOrEqual(0.8);
    expect(batch.far.mesh.count).toBe(1);
    expect(gardenFleetUnpackSailDistance(batch.far.sailAttention!.getY(0)).hidden).toBe(0);
    // Reduced motion cuts straight across.
    beginFleetFrame(batches, { camera, reducedMotion: true, viewport, timeSeconds: seconds + 1 });
    for (let near = 0; near < FLEET_HERO_BAND_NEAREST; near += 1) {
      writeFleetInstance(batches, pose({
        shipId: `near-${near}`, silhouette: "kobaya", x: eye.x + 10 + near, y: eye.y, z: eye.z,
      }));
    }
    writeFleetInstance(batches, pose({
      shipId: "crossing", atlasCell: 3, x: eye.x + FLEET_HULL_LOD_DISTANCE - 5, y: eye.y, z: eye.z,
    }));
    endFleetFrame(batches);
    expect(batch.far.mesh.count).toBe(0);
    expect(batch.hull.mesh.count).toBe(1);
    disposeFleetBatches(batches);
  });

  it("keeps leaders, the nearest boats and an attended ship rigged at any distance", () => {
    const batches = buildBatches(FLEET_HERO_BAND_NEAREST + 8);
    const viewport = { x: 1200, y: 640 };
    const camera = { offsetX: 600, offsetY: 320, zoom: 0.72 };
    const eye = cameraEye(cameraPoseFromIso(camera, viewport));
    const far = FLEET_HULL_LOD_DISTANCE * 2;
    const packedFor = (silhouette: GardenHullSilhouette, cell: number) => {
      const batch = batches.bySilhouette.get(silhouette)!;
      for (const part of [batch.sails, batch.far]) {
        for (let slot = 0; slot < part.mesh.count; slot += 1) {
          if (Math.floor(part.atlasCell!.getX(slot)) === cell) {
            return { far: part === batch.far, ...gardenFleetUnpackSailDistance(part.sailAttention!.getY(slot)) };
          }
        }
      }
      throw new Error(`missing cell ${cell}`);
    };
    const frame = (timeSeconds: number, nearestOffset: number, attendedCell = 0) => {
      beginFleetFrame(batches, { camera, viewport, timeSeconds });
      for (let near = 0; near < FLEET_HERO_BAND_NEAREST; near += 1) {
        writeFleetInstance(batches, pose({
          atlasCell: 100 + near, shipId: `near-${near}`, silhouette: "kobaya",
          x: eye.x + 10 + near, y: eye.y, z: eye.z,
        }));
      }
      // Rank 17 this frame; `nearestOffset` pulls it inside the nearest 16.
      writeFleetInstance(batches, pose({
        atlasCell: 50, shipId: "drifter", silhouette: "junk",
        x: eye.x + 10 + FLEET_HERO_BAND_NEAREST + nearestOffset, y: eye.y, z: eye.z,
      }));
      writeFleetInstance(batches, pose({
        atlasCell: 1, leader: true, shipId: "leader", x: eye.x + far, y: eye.y, z: eye.z,
      }));
      writeFleetInstance(batches, pose({
        atlasCell: 2, attention: attendedCell === 2 ? 1 : 0, shipId: "outsider",
        x: eye.x + far + 5, y: eye.y, z: eye.z,
      }));
      endFleetFrame(batches);
    };

    frame(0, 0);
    frame(1, 0);
    expect(packedFor("bezaisen", 1)).toMatchObject({ far: false, hero: 1 });
    expect(packedFor("bezaisen", 2)).toMatchObject({ far: true, hero: 0 });
    expect(packedFor("kobaya", 100)).toMatchObject({ far: false, hero: 1 });
    expect(packedFor("junk", 50).hero).toBe(0);
    expect(gardenFleetShipHeroWeight(batches, "leader")).toBe(1);
    expect(gardenFleetShipHeroWeight(batches, "outsider")).toBe(0);
    // A ship the batch never ranked (a GLB hero hull) keeps its lights.
    expect(gardenFleetShipHeroWeight(batches, "glb-titan")).toBe(1);

    // Hovering the far silhouette brings its rig back in the same frame.
    frame(2, 0, 2);
    expect(packedFor("bezaisen", 2)).toMatchObject({ far: false, hero: 1 });

    // Joining needs rank ≤ 16; once in, a ship stays until it falls past 20.
    frame(3, -1.5);
    expect(packedFor("junk", 50).hero).toBe(1);
    frame(4, 0);
    expect(packedFor("junk", 50).hero).toBe(1);
    disposeFleetBatches(batches);
  });

  it("adds only six draws and saves at least 25k fleet triangles at a 60% far share", () => {
    const batches = buildBatches(40);
    const viewport = { x: 1200, y: 640 };
    const camera = { offsetX: 600, offsetY: 320, zoom: 0.72 };
    const eye = cameraEye(cameraPoseFromIso(camera, viewport));
    let nearTriangles = 0;
    let farTriangles = 0;
    beginFleetFrame(batches, { camera, viewport, timeSeconds: 0 });
    for (const silhouette of SILHOUETTES) {
      const batch = batches.bySilhouette.get(silhouette)!;
      const near = (batch.hull.mesh.geometry.getAttribute("position").count
        + batch.sails.mesh.geometry.getAttribute("position").count) / 3;
      const far = batch.far.mesh.geometry.getAttribute("position").count / 3;
      nearTriangles += near;
      farTriangles += far;
      // W4.F3 budget: the ink silhouette costs no more than the plank it replaced.
      expect(far).toBeLessThanOrEqual(40);
      for (const distance of [20, 200]) {
        writeFleetInstance(batches, pose({
          shipId: `${silhouette}-${distance}`, silhouette,
          x: eye.x + distance, y: eye.y, z: eye.z,
        }));
      }
      // Matrix consumes four locations; the ink silhouette carries no livery.
      expect(Object.keys(batch.far.mesh.geometry.attributes).length + 4).toBeLessThanOrEqual(16);
    }
    endFleetFrame(batches);
    expect(fleetInstanceCount(batches)).toBe(12);
    expect(fleetDrawCallCount(batches)).toBe(19);
    const savings = 140_000 * 0.6 * (1 - farTriangles / nearTriangles);
    expect(savings).toBeGreaterThanOrEqual(25_000);
    disposeFleetBatches(batches);
  });
  it("fits every sail geometry within the vertex attribute limit", () => {
    const batches = buildBatches(1);
    for (const { sails } of batches.bySilhouette.values()) {
      const attributeCount = Object.keys(sails.mesh.geometry.attributes).length;
      expect(attributeCount).toBeLessThanOrEqual(16);
      // instanceMatrix is stored on the mesh and consumes four additional slots.
      expect(attributeCount + 4).toBeLessThanOrEqual(16);
    }
    disposeFleetBatches(batches);
  });

  it("restores a dipped identity sail to full scale thirty seconds into dwell", () => {
    const batches = buildBatches(1);
    const sails = batches.bySilhouette.get("bezaisen")!.sails;
    const furlMask = 21;
    for (const secondsInto of [1.2, 30]) {
      const beat = gardenArrivalBeatEnvelope({
        segment: { kind: "dock-dwell", secondsInto, secondsRemaining: 100 - secondsInto },
      });
      beginFleetFrame(batches);
      writeFleetInstance(batches, pose({
        silhouette: "bezaisen",
        sailFurl: furlMask,
        sailScale: 1 - beat.furl * (1 - GARDEN_SAIL_DIP_MIN_SCALE),
      }));
      endFleetFrame(batches);
      const packed = sails.mesh.geometry.getAttribute("aSailFurl").getX(0);
      if (secondsInto === 30) expect(packed).toBe(furlMask);
      // Packed into a Float32 attribute beside the 21 mask: two decimals hold.
      else expect(packed).toBeCloseTo(furlMask + beat.furl * (1 - GARDEN_SAIL_DIP_MIN_SCALE), 2);
    }
    disposeFleetBatches(batches);
  });

  it("keeps draw calls flat as the fleet grows", () => {
    const batches = buildBatches(400);

    beginFleetFrame(batches);
    for (let index = 0; index < 20; index += 1) {
      writeFleetInstance(batches, pose({ silhouette: SILHOUETTES[index % SILHOUETTES.length]!, x: index }));
    }
    endFleetFrame(batches);
    const drawsAt20 = fleetDrawCallCount(batches);
    expect(fleetInstanceCount(batches)).toBe(20);

    beginFleetFrame(batches);
    for (let index = 0; index < 320; index += 1) {
      writeFleetInstance(batches, pose({ silhouette: SILHOUETTES[index % SILHOUETTES.length]!, x: index }));
    }
    endFleetFrame(batches);

    expect(fleetInstanceCount(batches)).toBe(320);
    // 6 families x (hull + sails) + 1 pennant batch = 13, at any fleet size.
    expect(fleetDrawCallCount(batches)).toBe(drawsAt20);
    expect(fleetDrawCallCount(batches)).toBe(13);
    // No fleet geometry enters the directional map: contact discs ground ships.
    for (const batch of batches.bySilhouette.values()) {
      for (const part of [batch.hull, batch.sails, batch.far]) expect(part.mesh.castShadow).toBe(false);
    }
    expect(batches.pennant.mesh.castShadow).toBe(false);

    disposeFleetBatches(batches);
  });

  it("never exceeds capacity", () => {
    const batches = buildBatches(8);
    beginFleetFrame(batches);
    for (let index = 0; index < 200; index += 1) {
      writeFleetInstance(batches, pose({ silhouette: "bezaisen", x: index }));
    }
    endFleetFrame(batches);
    expect(fleetInstanceCount(batches)).toBe(8);
    disposeFleetBatches(batches);
  });

  it("renders a selected outsider after a full ordinary slice and disposes its buffers", () => {
    const batches = buildBatches(320);
    const geometryDisposals = [...batches.bySilhouette.values()].flatMap((batch) => [
      vi.spyOn(batch.hull.mesh.geometry, "dispose"),
      vi.spyOn(batch.sails.mesh.geometry, "dispose"),
      vi.spyOn(batch.far.mesh.geometry, "dispose"),
    ]);
    const materialDisposals = batches.materials.map((material) => (
      vi.spyOn(material, "dispose")
    ));

    beginFleetFrame(batches);
    for (let index = 0; index < 320; index += 1) {
      writeFleetInstance(batches, pose({
        silhouette: SILHOUETTES[index % SILHOUETTES.length]!,
        x: index,
      }));
    }
    // The renderer's selected transient is an additional placement. Hull and
    // sail batches remain within their per-silhouette allocation; the shared
    // pennant batch is deliberately capped rather than reallocated.
    writeFleetInstance(batches, pose({ silhouette: "bezaisen", x: 320 }));
    endFleetFrame(batches);

    expect(fleetInstanceCount(batches)).toBe(321);
    expect(batches.pennant.mesh.count).toBe(320);
    for (const batch of batches.bySilhouette.values()) {
      expect(batch.hull.mesh.count).toBeLessThanOrEqual(batches.capacity);
      expect(batch.sails.mesh.count).toBeLessThanOrEqual(batches.capacity);
    }

    disposeFleetBatches(batches);
    for (const dispose of geometryDisposals) expect(dispose).toHaveBeenCalledTimes(1);
    for (const dispose of materialDisposals) expect(dispose).toHaveBeenCalledTimes(1);
    expect(batches.root.children).toHaveLength(0);
    expect(batches.bySilhouette.size).toBe(0);
  });

  it("routes each instance to its own atlas cell", () => {
    const batches = buildBatches(16);
    beginFleetFrame(batches);
    writeFleetInstance(batches, pose({ atlasCell: 7, silhouette: "bezaisen" }));
    writeFleetInstance(batches, pose({ atlasCell: 12, silhouette: "bezaisen" }));
    endFleetFrame(batches);
    const cells = batches.bySilhouette.get("bezaisen")!.sails.atlasCell!;
    expect(gardenFleetUnpackSailCell(cells.getX(0)).cell).toBe(7);
    expect(gardenFleetUnpackSailCell(cells.getX(1)).cell).toBe(12);
    disposeFleetBatches(batches);
  });

  it("mirrors canvas atlas rows into WebGL texture coordinates", () => {
    const material = new MeshStandardMaterial();
    patchSailAtlasMaterial(material);
    const shader = {
      fragmentShader: "#include <common>\n#include <map_fragment>",
      uniforms: {} as Record<string, unknown>,
      vertexShader: [
        "#include <common>",
        "#include <begin_vertex>",
        "#include <uv_vertex>",
      ].join("\n"),
    };

    material.onBeforeCompile(shader as never, null as never);

    // CanvasTexture has flipY=true: canvas row 0 is texture row 15. Pin the
    // transform itself so an apparently harmless top-left atlas calculation
    // cannot silently make every ship sample a logo from the opposite row.
    expect(shader.vertexShader).toContain(
      "float textureRow = columns - 1.0 - canvasRow;",
    );
    expect(shader.vertexShader).toContain(
      "vec2 cellOrigin = vec2(mod(cell, columns), textureRow) / columns;",
    );
    expect(shader.vertexShader).not.toContain(
      "vec2(mod(cell, columns), floor(cell / columns))",
    );
  });

  it("reuses buffers across frames instead of reallocating", () => {
    const batches = buildBatches(64);
    const bezaisen = batches.bySilhouette.get("bezaisen")!;
    const matrixBuffer = bezaisen.hull.mesh.instanceMatrix.array;

    for (let frame = 0; frame < 5; frame += 1) {
      beginFleetFrame(batches);
      for (let index = 0; index < 10 + frame * 5; index += 1) {
        writeFleetInstance(batches, pose({ silhouette: "bezaisen", x: index }));
      }
      endFleetFrame(batches);
    }

    expect(bezaisen.hull.mesh.instanceMatrix.array).toBe(matrixBuffer);
    disposeFleetBatches(batches);
  });

  it("writes each ship's own proportions to hull and sails alike (N5a)", () => {
    const batches = buildBatches(16);
    beginFleetFrame(batches);
    writeFleetInstance(batches, pose({
      hullForm: { beam: 0.7, height: 1.3, length: 1.2 },
      silhouette: "bezaisen",
    }));
    writeFleetInstance(batches, pose({
      hullForm: { beam: 1.25, height: 0.8, length: 0.75 },
      silhouette: "bezaisen",
    }));
    endFleetFrame(batches);

    const batch = batches.bySilhouette.get("bezaisen")!;
    for (const part of [batch.hull, batch.sails]) {
      // (length, beam, height) — the rig must deform with the hull it sits on.
      // Stored in a Float32Array, so compare at float precision.
      for (const [slot, expected] of [[0, [1.2, 0.7, 1.3]], [1, [0.75, 1.25, 0.8]]] as const) {
        expect(part.hullForm.getX(slot)).toBeCloseTo(expected[0], 6);
        expect(part.hullForm.getY(slot)).toBeCloseTo(expected[1], 6);
        expect(part.hullForm.getZ(slot)).toBeCloseTo(expected[2], 6);
      }
    }
    // Untouched instances stay at the authored shape rather than collapsing.
    expect(batch.hull.hullForm.getX(9)).toBe(1);
    disposeFleetBatches(batches);
  });

  it("keeps draw calls flat once per-ship deformation is on", () => {
    const batches = buildBatches(64);
    beginFleetFrame(batches);
    for (let index = 0; index < 40; index += 1) {
      writeFleetInstance(batches, pose({
        hullForm: { beam: 0.7 + index * 0.01, height: 1, length: 1.3 - index * 0.01 },
        silhouette: SILHOUETTES[index % SILHOUETTES.length]!,
      }));
    }
    endFleetFrame(batches);
    // 40 ships, 40 different shapes, still one draw call per part.
    expect(fleetDrawCallCount(batches)).toBe(13);
    disposeFleetBatches(batches);
  });

  it("sizes the sail atlas to hold the rendered fleet", () => {
    // D3: 16x16 cells. Cell 0 is the shared blank canvas, so 255 logo slots
    // must cover the ~205-ship world with headroom.
    expect(FLEET_SAIL_ATLAS_CELLS).toBe(256);
  });
});

describe("W5.8/W7.3 instanced hull surface", () => {
  it("bakes repeated-prop pivots and rope masks into the merged hull", () => {
    const source = createFleetBatchGeometry("bezaisen");
    const masks = source.hull.getAttribute("aPartMasks");
    const pivot = source.hull.getAttribute("aVariationPivot");
    expect(masks.itemSize).toBe(4);
    expect(pivot.itemSize).toBe(4);
    expect(Array.from({ length: masks.count }, (_, index) => masks.getX(index)).some((value) => value > 0.5)).toBe(true);
    expect(Array.from({ length: masks.count }, (_, index) => masks.getY(index)).some((value) => value > 0.5)).toBe(true);
    source.hull.dispose();
    source.sails.dispose();
  });

  it("writes decorative and age terms to one hull-only vec4 attribute", () => {
    const batches = buildBatches(4);
    beginFleetFrame(batches);
    writeFleetInstance(batches, pose({
      hullForm: {
        beam: 1,
        height: 1,
        length: 1,
        waterline: 0,
        agePatina: 0.82,
        hullValue: 0.95,
        propRotation: 7 * Math.PI / 180,
        ropeSag: -0.06,
      } as FleetInstancePose["hullForm"],
    }));
    endFleetFrame(batches);

    const batch = batches.bySilhouette.get("bezaisen")!;
    expect(batch.hull.hullSurface?.itemSize).toBe(4);
    expect(batch.hull.hullSurface?.getX(0)).toBeCloseTo(0.95);
    expect(batch.hull.hullSurface?.getY(0)).toBeCloseTo(0.82);
    expect(batch.hull.hullSurface?.getZ(0)).toBeCloseTo(7 * Math.PI / 180);
    expect(batch.hull.hullSurface?.getW(0)).toBeCloseTo(-0.06);
    expect(batch.sails.hullSurface).toBeNull();
    expect(fleetDrawCallCount(batches)).toBe(3);
    disposeFleetBatches(batches);
  });


});

describe("F1 brand-dyed cloth", () => {
  it("writes each ship's dye to every sail in its batch", () => {
    const batches = buildBatches(16);
    beginFleetFrame(batches);
    writeFleetInstance(batches, pose({ sailColor: new Color("#2775ca"), silhouette: "bezaisen" }));
    writeFleetInstance(batches, pose({ sailColor: new Color("#136649"), silhouette: "bezaisen" }));
    endFleetFrame(batches);

    const tint = batches.bySilhouette.get("bezaisen")!.sails.sailTint!;
    const circle = new Color("#2775ca");
    const tether = new Color("#136649");
    expect(tint.getX(0)).toBeCloseTo(circle.r, 5);
    expect(tint.getZ(0)).toBeCloseTo(circle.b, 5);
    expect(tint.getY(1)).toBeCloseTo(tether.g, 5);
    // An unwritten instance stays plain canvas rather than going black.
    expect(tint.getX(9)).toBe(1);
    disposeFleetBatches(batches);
  });

  it("keeps the dye off the draw-call count", () => {
    const batches = buildBatches(64);
    beginFleetFrame(batches);
    for (let index = 0; index < 40; index += 1) {
      writeFleetInstance(batches, pose({
        sailColor: new Color().setHSL(index / 40, 0.6, 0.4),
        silhouette: SILHOUETTES[index % SILHOUETTES.length]!,
      }));
    }
    endFleetFrame(batches);
    // 40 ships, 40 different dyes, still one draw call per part.
    expect(fleetDrawCallCount(batches)).toBe(13);
    disposeFleetBatches(batches);
  });
});

describe("peg trim (Tier 3 #13)", () => {
  it("carries the waterline in aHullForm.w on both the hull and its rig", () => {
    const batches = buildBatches(4);
    beginFleetFrame(batches);
    writeFleetInstance(batches, pose({
      hullForm: { beam: 1, height: 1, length: 1, waterline: -0.16 },
      silhouette: "bezaisen",
    }));
    writeFleetInstance(batches, pose({
      hullForm: { beam: 1, height: 1, length: 1, waterline: 0.08 },
      silhouette: "bezaisen",
    }));
    endFleetFrame(batches);

    const batch = batches.bySilhouette.get("bezaisen")!;
    expect(batch.hull.hullForm.itemSize).toBe(4);
    expect(batch.hull.hullForm.getW(0)).toBeCloseTo(-0.16);
    expect(batch.hull.hullForm.getW(1)).toBeCloseTo(0.08);
    // The rig is stepped into the hull: if the two disagree, a trimmed ship
    // sails out from under its own masts.
    expect(batch.sails.hullForm.getW(0)).toBeCloseTo(-0.16);
    expect(batch.sails.hullForm.getW(1)).toBeCloseTo(0.08);
    disposeFleetBatches(batches);
  });

  it("defaults an unwritten instance to the authored shape on an even keel", () => {
    const batches = buildBatches(2);
    const batch = batches.bySilhouette.get("kobaya")!;
    expect(batch.hull.hullForm.getX(1)).toBe(1);
    expect(batch.hull.hullForm.getY(1)).toBe(1);
    expect(batch.hull.hullForm.getZ(1)).toBe(1);
    expect(batch.hull.hullForm.getW(1)).toBe(0);
    disposeFleetBatches(batches);
  });

  it("moves the pennant with the masthead it flies from", () => {
    const batches = buildBatches(2);
    beginFleetFrame(batches);
    writeFleetInstance(batches, pose({ mastheadOffset: { x: 0, y: 4 }, silhouette: "bezaisen" }));
    writeFleetInstance(batches, pose({
      hullForm: { beam: 1, height: 1, length: 1, waterline: -0.16 },
      mastheadOffset: { x: 0, y: 4 },
      silhouette: "bezaisen",
    }));
    endFleetFrame(batches);

    // The pennant is placed on the CPU and never sees the vertex shader's trim,
    // so it has to be offset explicitly or it hangs where the mast used to be.
    const level = new Matrix4();
    const trimmed = new Matrix4();
    batches.pennant.mesh.getMatrixAt(0, level);
    batches.pennant.mesh.getMatrixAt(1, trimmed);
    expect(trimmed.elements[13]! - level.elements[13]!).toBeCloseTo(-0.16);
    disposeFleetBatches(batches);
  });
});

/**
 * W3.7. The restraint contract in `VISUAL_INVARIANTS.md` says distance and zoom
 * are VIEWING CONDITIONS, not identity changes. These cases pin the three
 * clauses that make that true of the new default-framing step.
 */
const OVERVIEW_ZOOM = 0.4;
/** The 1600×1000 rest zoom (`defaultCamera`). */
const REST_ZOOM = 1.15;

describe("eye-distance fleet hierarchy", () => {
  it("keeps the near third vivid and quiets the far third without popping on camera moves", () => {
    const batches = buildBatches(12);
    const viewport = { x: 1200, y: 640 };
    const camera = { offsetX: 600, offsetY: 320, zoom: 0.72 };
    const eye = cameraEye(cameraPoseFromIso(camera, viewport));
    const frame = (timeSeconds: number, nextCamera = camera) => {
      beginFleetFrame(batches, { camera: nextCamera, viewport, timeSeconds });
      for (let index = 0; index < 9; index += 1) {
        writeFleetInstance(batches, pose({
          atlasCell: index + 1, x: eye.x + (index + 1) * 10, y: eye.y, z: eye.z,
        }));
      }
      endFleetFrame(batches);
    };
    frame(0);
    const distance = {
      getY: (index: number) => {
        const batch = batches.bySilhouette.get("bezaisen")!;
        for (const part of [batch.sails, batch.far]) {
          for (let slot = 0; slot < part.mesh.count; slot += 1) {
            if (Math.floor(part.atlasCell!.getX(slot)) === index + 1) {
              return gardenFleetUnpackSailDistance(part.sailAttention!.getY(slot)).presence;
            }
          }
        }
        throw new Error(`missing ship ${index + 1}`);
      },
    };
    for (const index of [0, 1, 2]) {
      expect(gardenFleetFramingRestraint(distance.getY(index))).toBe(0);
      expect(gardenFleetMarkPresence(distance.getY(index))).toBe(1);
    }
    for (const index of [6, 7, 8]) {
      expect(gardenFleetFramingRestraint(distance.getY(index))).toBeCloseTo(0.12);
      expect(gardenFleetMarkPresence(distance.getY(index))).toBeCloseTo(0.3);
      // ...unless the ship is in the hero band, which keeps its full mark.
      expect(gardenFleetMarkPresence(distance.getY(index), 1)).toBe(1);
    }
    expect(distance.getY(4)).toBeGreaterThan(0);
    expect(distance.getY(4)).toBeLessThan(1);
    const moved = { ...camera, offsetX: camera.offsetX - 5000 };
    frame(0, moved);
    expect(distance.getY(0)).toBe(0);
    frame(0.35, moved);
    expect(distance.getY(0)).toBeGreaterThan(0);
    expect(distance.getY(0)).toBeLessThan(1);
    frame(3.5, moved);
    expect(distance.getY(0)).toBeGreaterThan(0.99);
    disposeFleetBatches(batches);
  });

  it("preserves real aerial recession when attention restores the dye", () => {
    expect(gardenFleetSailRestraint({
      aerial: 0.4, attention: 1, framing: 0.25,
    })).toBeCloseTo(0.4);
  });
});

describe("W3.7 chroma only, never value", () => {
  /** WCAG contrast against white, on three.js LINEAR components. */
  function whiteContrast(color: Color): number {
    return 1.05 / (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b + 0.05);
  }

  /** The fragment shader's restraint, run on the CPU: mix toward own luminance. */
  function applyRestraint(cloth: Color, restraint: number): Color {
    const luma = 0.2126 * cloth.r + 0.7152 * cloth.g + 0.0722 * cloth.b;
    return new Color(
      cloth.r + (luma - cloth.r) * restraint,
      cloth.g + (luma - cloth.g) * restraint,
      cloth.b + (luma - cloth.b) * restraint,
    );
  }

  function livery(primary: string): ShipLivery {
    return { primary } as ShipLivery;
  }

  // Pale, neutral and strongly-branded issuers across the wheel.
  const ISSUERS: readonly string[] = [
    "#46b955", "#b9b5ab", "#f08a7e", "#8ec9e8", "#c9c9c9", "#f5ac37", "#2775ca", "#26a17b",
  ];

  it("cannot move any issuer's contrast against its mon, at any distance", () => {
    for (const primary of ISSUERS) {
      const cloth = gardenSailClothColor(livery(primary));
      const before = whiteContrast(cloth);
      for (const distancePresence of [0, 0.5, 1]) {
        for (const aerial of [0, 0.4]) {
          const restraint = gardenFleetSailRestraint({
            aerial,
            attention: 0,
            framing: gardenFleetFramingRestraint(distancePresence),
          });
          // Chroma-only desaturation converges on the cloth's OWN luminance, so
          // luminance — and therefore the mon's ink contrast, which is chosen
          // against it — is invariant by construction, not by tuning.
          expect(whiteContrast(applyRestraint(cloth, restraint))).toBeCloseTo(before, 10);
        }
      }
    }
  });

  it("keeps two quieted issuers apart in the far third", () => {
    const restraint = gardenFleetSailRestraint({
      aerial: 0,
      attention: 0,
      framing: gardenFleetFramingRestraint(1),
    });
    const circle = applyRestraint(
      gardenSailClothColor(livery("#2775ca")),
      restraint,
    );
    const tether = applyRestraint(
      gardenSailClothColor(livery("#26a17b")),
      restraint,
    );
    // "Every issuer must stay recognizably itself at a glance" — blue and green
    // are still two colours after the step, not one grey.
    const separation = Math.abs(circle.r - tether.r)
      + Math.abs(circle.g - tether.g)
      + Math.abs(circle.b - tether.b);
    expect(separation).toBeGreaterThan(0.05);
  });
});

describe("W3.7 attention", () => {
  beforeEach(() => setFleetAttention(null));

  it("eases a hovered ship back to full brand and releases it slowly", () => {
    setFleetAttention({
      deltaSeconds: 0.12,
      hoveredCell: 7,
      reducedMotion: false,
      selectedCell: 0,
    });
    const afterOneAttack = gardenFleetAttention(7);
    expect(afterOneAttack).toBeGreaterThan(0.5);
    expect(afterOneAttack).toBeLessThan(1);

    // Release is slower than attack: the same elapsed time gives back less.
    setFleetAttention({
      deltaSeconds: 0.12,
      hoveredCell: 0,
      reducedMotion: false,
      selectedCell: 0,
    });
    expect(gardenFleetAttention(7)).toBeGreaterThan(afterOneAttack * 0.4);
  });

  it("crossfades when the pointer moves from one ship to the next", () => {
    for (let step = 0; step < 20; step += 1) {
      setFleetAttention({
        deltaSeconds: 0.05,
        hoveredCell: 7,
        reducedMotion: false,
        selectedCell: 0,
      });
    }
    expect(gardenFleetAttention(7)).toBeCloseTo(1, 2);
    setFleetAttention({
      deltaSeconds: 0.05,
      hoveredCell: 11,
      reducedMotion: false,
      selectedCell: 0,
    });
    // The old ship fades rather than snapping off; the new one is already lit.
    expect(gardenFleetAttention(7)).toBeGreaterThan(0.8);
    expect(gardenFleetAttention(7)).toBeLessThan(1);
    expect(gardenFleetAttention(11)).toBeGreaterThan(0);
  });

  it("holds a selection while the pointer wanders elsewhere", () => {
    for (let step = 0; step < 20; step += 1) {
      setFleetAttention({
        deltaSeconds: 0.05,
        hoveredCell: 3,
        reducedMotion: false,
        selectedCell: 9,
      });
    }
    expect(gardenFleetAttention(9)).toBeCloseTo(1, 2);
    for (let step = 0; step < 20; step += 1) {
      setFleetAttention({
        deltaSeconds: 0.05,
        hoveredCell: 0,
        reducedMotion: false,
        selectedCell: 9,
      });
    }
    expect(gardenFleetAttention(9)).toBeCloseTo(1, 2);
    // The abandoned hover is well on its way out after a second...
    expect(gardenFleetAttention(3)).toBeLessThan(0.1);
    for (let step = 0; step < 60; step += 1) {
      setFleetAttention({
        deltaSeconds: 0.05,
        hoveredCell: 0,
        reducedMotion: false,
        selectedCell: 9,
      });
    }
    // ...and eventually leaves the tracking table entirely, so a long session
    // cannot accumulate envelopes for every ship the pointer ever crossed.
    expect(gardenFleetAttention(3)).toBe(0);
    expect(gardenFleetAttention(9)).toBeCloseTo(1, 6);
  });

  it("snaps rather than eases under reduced motion", () => {
    setFleetAttention({
      deltaSeconds: 0,
      hoveredCell: 5,
      reducedMotion: true,
      selectedCell: 0,
    });
    expect(gardenFleetAttention(5)).toBe(1);
    setFleetAttention({
      deltaSeconds: 0,
      hoveredCell: 0,
      reducedMotion: true,
      selectedCell: 0,
    });
    expect(gardenFleetAttention(5)).toBe(0);
  });

  it("never attends the shared plain-canvas cell", () => {
    setFleetAttention({
      deltaSeconds: 1,
      hoveredCell: 0,
      reducedMotion: false,
      selectedCell: 0,
    });
    // Cell 0 is "no ship" here exactly as it is "no mark" in the atlas; lighting
    // it would restore full brand on every overflow ship at once.
    expect(gardenFleetAttention(0)).toBe(0);
  });

  it("writes per-instance attention without adding a draw call", () => {
    setFleetAttention({
      deltaSeconds: 1,
      hoveredCell: 12,
      reducedMotion: true,
      selectedCell: 0,
    });
    const batches = buildBatches(16);
    beginFleetFrame(batches);
    writeFleetInstance(batches, pose({ atlasCell: 4, silhouette: "bezaisen" }));
    writeFleetInstance(batches, pose({ atlasCell: 12, silhouette: "bezaisen" }));
    endFleetFrame(batches);

    const attention = batches.bySilhouette.get("bezaisen")!.sails.sailAttention!;
    expect(gardenFleetUnpackSailAttention(attention.getX(0)).attention).toBe(0);
    expect(gardenFleetUnpackSailAttention(attention.getX(1)).attention).toBeCloseTo(1, 5);
    // An unwritten instance is rank-and-file, not an unexplained bright sail.
    expect(attention.getX(9)).toBe(0);
    expect(fleetDrawCallCount(batches)).toBe(3);
    disposeFleetBatches(batches);
    setFleetAttention(null);
  });
});

describe("W3.7 woven cloth", () => {
  it("is inspection-only: off at overview and at rest, fully in at close inspection", () => {
    expect(gardenFleetClothWeave(OVERVIEW_ZOOM)).toBe(0);
    // W4.F5: the rest frame reads cloth from the panel strips, never gingham.
    expect(gardenFleetClothWeave(REST_ZOOM)).toBe(0);
    expect(gardenFleetClothWeave(1.8)).toBeGreaterThan(0);
    expect(gardenFleetClothWeave(1.8)).toBeLessThan(1);
    expect(gardenFleetClothWeave(2.1)).toBe(1);
  });


});
