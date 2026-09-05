import { beforeEach, describe, expect, it, vi } from "vitest";
import { Color, Matrix4, MeshStandardMaterial, Vector3 } from "three";
import { createFleetBatchGeometry } from "./garden-ships";
import {
  FLEET_SAIL_ATLAS_CELLS,
  FLEET_MAX_SAILS,
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
  gardenFleetSailRestraint,
  patchFleetHullFormMaterial,
  patchSailAtlasMaterial,
  setFleetAerialPerspective,
  setFleetAttention,
  setFleetWeather,
  writeFleetInstance,
  type FleetInstancePose,
  type FleetSailDeformInput,
} from "./garden-fleet-batch";
import { gardenSailClothColor } from "./garden-sail-texture";
import { SAIL_DARK_CANVAS_ISSUERS } from "./garden-sail-overrides";
import type { ShipLivery } from "../systems/world-types";
import type { GardenHullSilhouette } from "../systems/garden-observatory-slice";

const SILHOUETTES: GardenHullSilhouette[] = [
  "bezaisen", "kobaya", "twinhull", "takasebune", "junk", "scow",
];

function buildBatches(capacity: number) {
  return createFleetBatches({
    cache: { geometries: new Map(), wakeFillMaterial: null as never, wakeMaterial: null as never },
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

  it("gives every family a bounding-box aspect signature separated by at least 15%", () => {
    const aspects = SILHOUETTES.map((silhouette) => {
      const source = createFleetBatchGeometry(silhouette);
      source.hull.computeBoundingBox();
      const size = source.hull.boundingBox!.getSize(new Vector3());
      source.hull.dispose();
      source.sails.dispose();
      return {
        heightBeam: size.y / size.z,
        lengthBeam: size.x / size.z,
        silhouette,
      };
    });

    for (let left = 0; left < aspects.length; left += 1) {
      for (let right = left + 1; right < aspects.length; right += 1) {
        const a = aspects[left]!;
        const b = aspects[right]!;
        const lengthDifference = Math.abs(a.lengthBeam - b.lengthBeam)
          / Math.min(a.lengthBeam, b.lengthBeam);
        const heightDifference = Math.abs(a.heightBeam - b.heightBeam)
          / Math.min(a.heightBeam, b.heightBeam);
        expect(
          lengthDifference,
          `${a.silhouette}/${b.silhouette} length/beam`,
        ).toBeGreaterThanOrEqual(0.15);
        expect(
          heightDifference,
          `${a.silhouette}/${b.silhouette} height/beam`,
        ).toBeGreaterThanOrEqual(0.15);
      }
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
    sailHead: { y: 3.4, z: 0.08 },
    sailIndex: 2,
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
    for (const batch of batches.bySilhouette.values()) {
      expect(batch.hull.mesh.castShadow).toBe(true);
      expect(batch.sails.mesh.castShadow).toBe(false);
    }

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
    expect(cells.getX(0)).toBe(7);
    expect(cells.getX(1)).toBe(12);
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

  it("packs the seaworthiness fitting code with rope sag without another attribute", () => {
    const batches = buildBatches(4);
    beginFleetFrame(batches);
    writeFleetInstance(batches, pose({
      hullForm: {
        beam: 1,
        fittingCode: 19,
        height: 1,
        length: 1,
        ropeSag: -0.06,
        waterline: 0,
      } as FleetInstancePose["hullForm"],
    }));
    endFleetFrame(batches);
    expect(batches.bySilhouette.get("bezaisen")?.hull.hullSurface?.getW(0)).toBeCloseTo(18.94);
    disposeFleetBatches(batches);
  });

  it("keeps value/patina off sail cloth and verdigris off the identity strake", () => {
    const hullMaterial = new MeshStandardMaterial();
    patchFleetHullFormMaterial(hullMaterial);
    const hullShader = {
      fragmentShader: "#include <common>",
      uniforms: {} as Record<string, unknown>,
      vertexShader: "#include <common>\n#include <begin_vertex>\n#include <color_vertex>",
    };
    hullMaterial.onBeforeCompile(hullShader as never, null as never);
    expect(hullShader.vertexShader).toContain("vColor.xyz *= aHullSurface.x");
    expect(hullShader.vertexShader).toContain("aPartMasks.z * age");
    expect(hullShader.vertexShader).toContain("aPartMasks.x");
    expect(hullShader.vertexShader).toContain("aPartMasks.y");

    const sailMaterial = new MeshStandardMaterial();
    patchSailAtlasMaterial(sailMaterial);
    const sailShader = {
      fragmentShader: "#include <common>\n#include <map_fragment>\n#include <normal_fragment_begin>",
      uniforms: {} as Record<string, unknown>,
      vertexShader: "#include <common>\n#include <begin_vertex>\n#include <project_vertex>\n#include <uv_vertex>",
    };
    sailMaterial.onBeforeCompile(sailShader as never, null as never);
    expect(sailShader.vertexShader).not.toContain("aHullSurface");
    expect(sailShader.fragmentShader).not.toContain("verdigris");
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
const OVERVIEW_ZOOM = 0.44;
const WIDE_ZOOM = 0.8;
const DEFAULT_ZOOM = 1.0;
const INSPECTION_ZOOM = 1.05;

const FRAGMENT_STUB = [
  "#include <common>",
  "#include <map_fragment>",
  "#include <normal_fragment_begin>",
].join("\n");
const VERTEX_STUB = [
  "#include <common>",
  "#include <begin_vertex>",
  "#include <project_vertex>",
  "#include <uv_vertex>",
].join("\n");

describe("W3.7 sail restraint as a viewing condition", () => {
  it("uses the smaller wide-frame step and fully releases it at rest", () => {
    // Operator decision 2026-09-05: replace the former 15–20% default-frame
    // pin with a 10% wide-frame restraint that is exactly gone at zoom-1 rest.
    expect(gardenFleetFramingRestraint(WIDE_ZOOM)).toBeCloseTo(0.1, 12);
    expect(gardenFleetFramingRestraint(DEFAULT_ZOOM)).toBe(0);
  });

  it("keeps marks full at rest and preserves the stronger overview floor", () => {
    // Operator decision 2026-09-05: identity is fully legible at the new rest,
    // while whole-map marks retain 45% presence instead of the former 26%.
    expect(gardenFleetMarkPresence(DEFAULT_ZOOM)).toBe(1);
    expect(gardenFleetMarkPresence(0.85)).toBe(1);
    expect(gardenFleetMarkPresence(0.58)).toBeCloseTo(0.45, 12);
    expect(gardenFleetMarkPresence(OVERVIEW_ZOOM)).toBeCloseTo(0.45, 12);
  });

  it("is exactly gone at rest and inspection framing", () => {
    expect(gardenFleetFramingRestraint(DEFAULT_ZOOM)).toBe(0);
    expect(gardenFleetFramingRestraint(INSPECTION_ZOOM)).toBe(0);
    expect(gardenFleetFramingRestraint(1.4)).toBe(0);
  });

  it("dissolves smoothly as the camera sails in, never rising", () => {
    let previous = Number.POSITIVE_INFINITY;
    let largestJump = 0;
    for (let zoom = 0.3; zoom <= 1.3; zoom += 0.01) {
      const step = gardenFleetFramingRestraint(zoom);
      expect(step).toBeLessThanOrEqual(previous + 1e-12);
      if (Number.isFinite(previous)) largestJump = Math.max(largestJump, previous - step);
      previous = step;
    }
    // No cliff anywhere on the ramp: even across the deliberately short final
    // approach to rest, a hundredth of zoom cannot move the whole 0.10 step.
    expect(largestJump).toBeLessThan(0.03);
  });

  it("cancels entirely on hover and selection, at every framing", () => {
    for (const zoom of [OVERVIEW_ZOOM, DEFAULT_ZOOM, INSPECTION_ZOOM]) {
      const framing = gardenFleetFramingRestraint(zoom);
      const zoomRestraint = (1 - gardenFleetMarkPresence(zoom)) * 0.55;
      const attended = gardenFleetSailRestraint({
        aerial: 0,
        attention: 1,
        framing,
        zoomRestraint,
      });
      // Full dye back: the attended ship is a ship the visitor is looking at,
      // so no zoom-keyed restraint applies to it at all.
      expect(attended).toBeCloseTo(0, 12);
    }
  });

  it("keeps a hovered ship behind the same air as everything else", () => {
    // Attention answers "which one", not "how far away". The DEPTH term is real
    // atmosphere and survives, or a hovered horizon ship would punch through
    // the haze the whole frame is built on.
    const restraint = gardenFleetSailRestraint({
      aerial: 0.4,
      attention: 1,
      framing: gardenFleetFramingRestraint(DEFAULT_ZOOM),
      zoomRestraint: 0.28,
    });
    expect(restraint).toBeCloseTo(0.4, 12);
  });

  it("composes on the existing recession instead of stacking with it", () => {
    const framing = gardenFleetFramingRestraint(WIDE_ZOOM);
    const zoomRestraint = (1 - gardenFleetMarkPresence(WIDE_ZOOM)) * 0.55;
    const combined = gardenFleetSailRestraint({
      aerial: 0,
      attention: 0,
      framing,
      zoomRestraint,
    });
    // Multiplicative on the remaining chroma: strictly more restrained than the
    // old term, strictly less than adding the two, and never saturating.
    expect(combined).toBeGreaterThan(zoomRestraint);
    expect(combined).toBeLessThan(zoomRestraint + framing);
    expect(combined).toBeLessThan(1);
  });

  it("never fully drains a rank-and-file ship, even at whole-map framing", () => {
    const worst = gardenFleetSailRestraint({
      // The widest framing, at the far end of the fog, with no attention.
      aerial: 0.4,
      attention: 0,
      framing: gardenFleetFramingRestraint(OVERVIEW_ZOOM),
      zoomRestraint: (1 - gardenFleetMarkPresence(OVERVIEW_ZOOM)) * 0.55,
    });
    // Hue is identity (F1) and must survive every viewing condition. Half the
    // chroma is restraint; all of it would be a different ship.
    expect(worst).toBeLessThan(0.6);
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

  // The five issuers the override table names, plus DAI (deliberately NOT in
  // the table, decision D5) and two ordinary strongly-branded coins.
  const ISSUERS: readonly (readonly [string, string])[] = [
    ["bean-beanstalk", "#46b955"],
    ["cash-phantom", "#b9b5ab"],
    ["csusdl-coinshift", "#f08a7e"],
    ["eusd-lybra", "#8ec9e8"],
    ["zchf-frankencoin", "#c9c9c9"],
    ["dai-makerdao", "#f5ac37"],
    ["usdc-circle", "#2775ca"],
    ["usdt-tether", "#26a17b"],
  ];

  it("cannot move any issuer's contrast against a white mark, at any framing", () => {
    for (const [shipId, primary] of ISSUERS) {
      const cloth = gardenSailClothColor(livery(primary), shipId);
      const before = whiteContrast(cloth);
      for (const zoom of [OVERVIEW_ZOOM, DEFAULT_ZOOM, INSPECTION_ZOOM]) {
        for (const aerial of [0, 0.4]) {
          const restraint = gardenFleetSailRestraint({
            aerial,
            attention: 0,
            framing: gardenFleetFramingRestraint(zoom),
            zoomRestraint: (1 - gardenFleetMarkPresence(zoom)) * 0.55,
          });
          // Chroma-only desaturation converges on the cloth's OWN luminance, so
          // luminance — and therefore the pirate contrast floor, which is a
          // luminance ratio — is invariant by construction, not by tuning.
          expect(whiteContrast(applyRestraint(cloth, restraint))).toBeCloseTo(before, 10);
        }
      }
    }
  });

  it("leaves the five named pale issuers under their black canvas", () => {
    // The override table is upstream of everything here: the step never touches
    // `gardenSailClothColor`, so the five stay exactly where D5 put them.
    for (const [shipId, primary] of ISSUERS) {
      if (!SAIL_DARK_CANVAS_ISSUERS.has(shipId)) continue;
      const cloth = gardenSailClothColor(livery(primary), shipId);
      const restrained = applyRestraint(
        cloth,
        gardenFleetSailRestraint({
          aerial: 0,
          attention: 0,
          framing: gardenFleetFramingRestraint(DEFAULT_ZOOM),
          zoomRestraint: (1 - gardenFleetMarkPresence(DEFAULT_ZOOM)) * 0.55,
        }),
      );
      // Still near-black cloth carrying a white mark, restraint or no restraint.
      expect(whiteContrast(restrained)).toBeGreaterThan(10);
    }
  });

  it("keeps two quieted issuers apart from one another at wide framing", () => {
    const restraint = gardenFleetSailRestraint({
      aerial: 0,
      attention: 0,
      framing: gardenFleetFramingRestraint(WIDE_ZOOM),
      zoomRestraint: (1 - gardenFleetMarkPresence(WIDE_ZOOM)) * 0.55,
    });
    const circle = applyRestraint(
      gardenSailClothColor(livery("#2775ca"), "usdc-circle"),
      restraint,
    );
    const tether = applyRestraint(
      gardenSailClothColor(livery("#26a17b"), "usdt-tether"),
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
    expect(attention.getX(0)).toBe(0);
    expect(attention.getX(1)).toBe(1);
    // An unwritten instance is rank-and-file, not an unexplained bright sail.
    expect(attention.getX(9)).toBe(0);
    expect(fleetDrawCallCount(batches)).toBe(3);
    disposeFleetBatches(batches);
    setFleetAttention(null);
  });
});

describe("W3.7 woven cloth", () => {
  it("stays off at overview framing and comes fully in at inspection", () => {
    expect(gardenFleetClothWeave(OVERVIEW_ZOOM)).toBe(0);
    expect(gardenFleetClothWeave(0.52)).toBe(0);
    // At the new zoom-1 rest the surface is nearly resolved; the final fraction
    // still arrives only at close inspection.
    expect(gardenFleetClothWeave(DEFAULT_ZOOM)).toBeGreaterThan(0.8);
    expect(gardenFleetClothWeave(DEFAULT_ZOOM)).toBeLessThan(1);
    expect(gardenFleetClothWeave(1.12)).toBe(1);
  });

  it("compiles into the sail shader as relief, gated, and shy of the mark", () => {
    const material = new MeshStandardMaterial();
    patchSailAtlasMaterial(material);
    const shader = { fragmentShader: FRAGMENT_STUB, uniforms: {}, vertexShader: VERTEX_STUB };
    material.onBeforeCompile!(shader as never, null as never);

    // Warp and weft, on the cell-local uv so every sail in the rig is cloth —
    // not only the one carrying the mark.
    expect(shader.vertexShader).toContain("vClothUv = uv;");
    expect(shader.fragmentShader).toContain("float weave = warp * 0.5 + weft * 0.4");
    // Zoom-gated and derivative-guarded, so it can never shimmer at distance.
    expect(shader.fragmentShader).toContain("uClothWeave * clothDetail");
    expect(shader.fragmentShader).toContain("fwidth(vClothUv.x)");
    // ...and it stands down under the emblem it must not eat.
    expect(shader.fragmentShader).toContain("1.0 - markCover * 0.7");
    // Relief, not just a printed pattern: the normal stage reads it back.
    expect(shader.fragmentShader).toContain("clothTangent * gClothWarp");
  });

  it("routes attention and the framing step through the sail material", () => {
    const material = new MeshStandardMaterial();
    patchSailAtlasMaterial(material);
    const shader = {
      fragmentShader: FRAGMENT_STUB,
      uniforms: {} as Record<string, { value: number }>,
      vertexShader: VERTEX_STUB,
    };
    material.onBeforeCompile!(shader as never, null as never);

    setFleetAerialPerspective({ fogFar: 300, fogNear: 180, strength: 0.4, zoom: DEFAULT_ZOOM });
    expect(shader.uniforms.uFramingRestraint!.value)
      .toBeCloseTo(gardenFleetFramingRestraint(DEFAULT_ZOOM), 10);
    expect(shader.uniforms.uClothWeave!.value)
      .toBeCloseTo(gardenFleetClothWeave(DEFAULT_ZOOM), 10);

    // A world teardown puts every restraint back to "no viewing condition".
    setFleetAerialPerspective(null);
    expect(shader.uniforms.uFramingRestraint!.value).toBe(0);
    expect(shader.uniforms.uClothWeave!.value).toBe(0);
    expect(shader.uniforms.uClothRestraint!.value).toBe(0);
  });

  it("composes aerial chroma recession before the shared height fog", () => {
    const material = new MeshStandardMaterial();
    patchSailAtlasMaterial(material);
    const shader = {
      fragmentShader: [
        "#include <common>",
        "#include <map_fragment>",
        "#include <normal_fragment_begin>",
        "#include <fog_fragment>",
      ].join("\n"),
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: [
        "#include <common>",
        "#include <begin_vertex>",
        "#include <project_vertex>",
        "#include <uv_vertex>",
        "#include <worldpos_vertex>",
      ].join("\n"),
    };
    material.onBeforeCompile!(shader as never, null as never);

    const restraintAt = shader.fragmentShader.indexOf("sailCloth = mix(sailCloth");
    const fogAt = shader.fragmentShader.indexOf("gl_FragColor.rgb = gardenApplyHeightFog");
    expect(restraintAt).toBeGreaterThan(-1);
    expect(fogAt).toBeGreaterThan(restraintAt);
    expect(shader.fragmentShader).toContain("pow(sunDot, 8.0)");
    expect(shader.vertexShader).toContain("vGardenHeightFogWorldPosition");
    expect(shader.uniforms.uGardenHeightFogDensity).toBeDefined();
  });
});
