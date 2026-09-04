import { BoxGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, OrthographicCamera, Scene } from "three";
import { describe, expect, it } from "vitest";
import { STATION_SCALE_LADDER } from "../systems/dock-layout";
import { dockFixture, DISPLAY_TILES, ISLAND_TILE } from "./__fixtures__/harbor";
import { authorDock, type StationType } from "./garden-docks";
import { createGardenHarborBatch } from "./garden-harbor-batch";
import {
  createDrawOwnerRecorder,
  shouldRequestDrawCensus,
  type DrawRecorderTarget,
} from "./garden-draw-census";

function box(name: string): Mesh {
  const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  mesh.name = name;
  return mesh;
}

/** A renderer stand-in that "draws" a list of objects through renderBufferDirect and counts them in info. */
function fakeRenderer(draws: Array<{ object: Mesh | InstancedMesh; group?: { start: number; count: number } }>): DrawRecorderTarget & { render(): void } {
  const target: DrawRecorderTarget & { render(): void } = {
    info: { render: { calls: 0 } },
    renderBufferDirect() { target.info.render.calls += 1; },
    render() {
      target.info.render.calls = 0;
      const camera = new OrthographicCamera();
      for (const draw of draws) {
        const material = Array.isArray(draw.object.material) ? draw.object.material[0] : draw.object.material;
        target.renderBufferDirect(camera, null, draw.object.geometry, material, draw.object, draw.group ?? null);
      }
    },
  };
  return target;
}

const CURRENT_STATION_TYPES: readonly StationType[] = [
  "ethereum-mole",
  "hatago-wharf",
  "uogashi",
  "stepped-inlet",
  "fishing-pier",
  "tea-house-quay",
  "reed-boathouse",
  "storm-mole",
  "pigeonnier-islet",
];

function censusHarborBatch() {
  return createGardenHarborBatch(CURRENT_STATION_TYPES.map((type, index) => {
    const chainId = `census-${type}`;
    return authorDock({
      ...dockFixture(chainId, 6),
      station: {
        coveId: `census-${type}`,
        shoreBearing: (index / CURRENT_STATION_TYPES.length) * Math.PI * 2,
        type,
      },
    }, DISPLAY_TILES[index % DISPLAY_TILES.length]!, ISLAND_TILE);
  }));
}

describe("createDrawOwnerRecorder", () => {
  it("requests on topology changes and every 120 debug frames since the last sample", () => {
    expect(shouldRequestDrawCensus({ topologyChanged: true, debug: false, framesSinceSample: 0 })).toBe(true);
    expect(shouldRequestDrawCensus({ topologyChanged: false, debug: true, framesSinceSample: 119 })).toBe(false);
    expect(shouldRequestDrawCensus({ topologyChanged: false, debug: true, framesSinceSample: 120 })).toBe(true);
    expect(shouldRequestDrawCensus({ topologyChanged: false, debug: false, framesSinceSample: 120 })).toBe(false);
  });

  it("attributes every real draw to its nearest named ancestors and reconciles exactly to info.render.calls", () => {
    const scene = new Scene();
    const content = new Group(); content.name = "content";
    const harbors = new Group(); harbors.name = "harbor-batch";
    const stoneA = box("harbor-stone"), stoneB = box("harbor-stone"), screens = box("station-lit-screens");
    const culled = box("harbor-fine-plank");            // in the scene, NOT drawn — must not appear
    harbors.add(stoneA, stoneB, screens, culled); content.add(harbors); scene.add(content);
    const renderer = fakeRenderer([{ object: stoneA }, { object: stoneB }, { object: screens }]);
    const recorder = createDrawOwnerRecorder(renderer, scene);
    recorder.arm();
    renderer.render();
    const census = recorder.finish(7)!;
    expect(census.rendererCalls).toBe(3);
    expect(census.attributedCalls).toBe(3);
    expect(census.sampledAtFrame).toBe(7);
    expect(census.owners).toEqual([
      { owner: "harbor-batch/harbor-stone", calls: 2, triangles: 24, instanced: false },
      { owner: "harbor-batch/station-lit-screens", calls: 1, triangles: 12, instanced: false },
    ]);
  });

  it("attributes every visible drawable in the nine-archetype harbor layer", () => {
    // The ladder is the authored roster: this explicit check catches a
    // retired archetype or a missing replacement before it reaches the batch.
    expect([...Object.keys(STATION_SCALE_LADDER)].sort()).toEqual([...CURRENT_STATION_TYPES].sort());
    const batch = censusHarborBatch();
    const scene = new Scene();
    const content = new Group(); content.name = "content-part-docks";
    content.add(batch.root); scene.add(content);
    const drawables: Mesh[] = [];
    batch.root.traverse((object) => {
      if (!(object instanceof Mesh) || !object.visible) return;
      if ((object.geometry.getAttribute("position")?.count ?? 0) === 0) return;
      drawables.push(object);
    });

    // The harbor layer is draw-quantised: all nine station types share its
    // coarse buckets and instanced prop meshes.
    expect(drawables.length).toBeGreaterThan(0);
    expect(drawables.length).toBeLessThanOrEqual(20);
    expect(new Set(drawables.map((object) => object.name)).size).toBe(drawables.length);

    const renderer = fakeRenderer(drawables.map((object) => ({ object })));
    const recorder = createDrawOwnerRecorder(renderer, scene);
    recorder.arm();
    renderer.render();
    const census = recorder.finish(1)!;

    expect(census.rendererCalls).toBe(drawables.length);
    expect(census.attributedCalls).toBe(census.rendererCalls);
    expect(census.owners.map((entry) => entry.owner)).toEqual(
      drawables.map((object) => `harbor-batch/${object.name}`).sort((a, b) => a.localeCompare(b)),
    );
    expect(census.owners.every((entry) => entry.calls === 1 && entry.triangles > 0)).toBe(true);
    // Phase 5's coarse-tier guard: shared buckets keep the full roster below
    // the harbor layer's 60,000-triangle ceiling.
    expect(census.owners.reduce((sum, entry) => sum + entry.triangles, 0)).toBeLessThanOrEqual(60_000);
    expect(census.owners.some((entry) => entry.instanced)).toBe(true);
    batch.dispose();
  });

  it("counts an InstancedMesh as one call with count-many triangles and a multi-material group per group draw", () => {
    const scene = new Scene();
    const props = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial(), 40); props.name = "dock-posts";
    const stairTreads = new Mesh(new BoxGeometry(), [new MeshStandardMaterial(), new MeshStandardMaterial()]); stairTreads.name = "island-quay-stair-treads";
    scene.add(props, stairTreads);
    const renderer = fakeRenderer([
      { object: props },
      { object: stairTreads, group: { start: 0, count: 18 } },
      { object: stairTreads, group: { start: 18, count: 18 } },
    ]);
    const recorder = createDrawOwnerRecorder(renderer, scene);
    recorder.arm(); renderer.render();
    const census = recorder.finish(1)!;
    expect(census.attributedCalls).toBe(census.rendererCalls);
    expect(census.owners).toEqual([
      { owner: "island-quay-stair-treads", calls: 2, triangles: 12, instanced: false },
      { owner: "dock-posts", calls: 1, triangles: 480, instanced: true },
    ]);
  });

  it("does not attribute a renderBufferDirect invocation that Three declines to draw", () => {
    const scene = new Scene();
    const drawn = box("drawn");
    const skipped = box("skipped");
    scene.add(drawn, skipped);
    const renderer = fakeRenderer([{ object: drawn }, { object: skipped }]);
    const issueDraw = renderer.renderBufferDirect;
    renderer.renderBufferDirect = (camera, renderScene, geometry, material, object, group) => {
      if (object === skipped) return;
      issueDraw(camera, renderScene, geometry, material, object, group);
    };
    const recorder = createDrawOwnerRecorder(renderer, scene);
    recorder.arm(); renderer.render();
    const census = recorder.finish(1)!;
    expect(census.rendererCalls).toBe(1);
    expect(census.attributedCalls).toBe(1);
    expect(census.owners).toEqual([
      { owner: "drawn", calls: 1, triangles: 12, instanced: false },
    ]);
  });

  it("restores the original renderBufferDirect after one sampled frame and returns null when not armed", () => {
    const scene = new Scene();
    const mesh = box("x"); scene.add(mesh);
    const renderer = fakeRenderer([{ object: mesh }]);
    const original = renderer.renderBufferDirect;
    const recorder = createDrawOwnerRecorder(renderer, scene);
    expect(recorder.finish(0)).toBeNull();
    recorder.arm(); renderer.render(); recorder.finish(1);
    expect(renderer.renderBufferDirect).toBe(original);
    renderer.render();                                  // second frame is not recorded
    expect(recorder.finish(2)).toBeNull();
  });
});
