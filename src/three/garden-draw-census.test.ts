import { BoxGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, OrthographicCamera, Scene } from "three";
import { describe, expect, it } from "vitest";
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
    const docks = new Group(); docks.name = "docks";
    const deckA = box("dock-deck"), deckB = box("dock-deck"), quay = box("dock-quay-wall");
    const culled = box("dock-crane");                       // in the scene, NOT drawn — must not appear
    docks.add(deckA, deckB, quay, culled); content.add(docks); scene.add(content);
    const renderer = fakeRenderer([{ object: deckA }, { object: deckB }, { object: quay }]);
    const recorder = createDrawOwnerRecorder(renderer, scene);
    recorder.arm();
    renderer.render();
    const census = recorder.finish(7)!;
    expect(census.rendererCalls).toBe(3);
    expect(census.attributedCalls).toBe(3);
    expect(census.sampledAtFrame).toBe(7);
    expect(census.owners).toEqual([
      { owner: "docks/dock-deck", calls: 2, triangles: 24, instanced: false },
      { owner: "docks/dock-quay-wall", calls: 1, triangles: 12, instanced: false },
    ]);
  });

  it("counts an InstancedMesh as one call with count-many triangles and a multi-material group per group draw", () => {
    const scene = new Scene();
    const props = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial(), 40); props.name = "dock-posts";
    const terrace = new Mesh(new BoxGeometry(), [new MeshStandardMaterial(), new MeshStandardMaterial()]); terrace.name = "island-terrace";
    scene.add(props, terrace);
    const renderer = fakeRenderer([
      { object: props },
      { object: terrace, group: { start: 0, count: 18 } },
      { object: terrace, group: { start: 18, count: 18 } },
    ]);
    const recorder = createDrawOwnerRecorder(renderer, scene);
    recorder.arm(); renderer.render();
    const census = recorder.finish(1)!;
    expect(census.attributedCalls).toBe(census.rendererCalls);
    expect(census.owners).toEqual([
      { owner: "island-terrace", calls: 2, triangles: 12, instanced: false },
      { owner: "dock-posts", calls: 1, triangles: 480, instanced: true },
    ]);
  });

  it("does not attribute a renderBufferDirect invocation that Three declines to draw", () => {
    const scene = new Scene();
    const empty = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial(), 0); empty.name = "empty";
    scene.add(empty);
    const renderer = fakeRenderer([{ object: empty }]);
    renderer.renderBufferDirect = () => {};
    const recorder = createDrawOwnerRecorder(renderer, scene);
    recorder.arm(); renderer.render();
    const census = recorder.finish(1)!;
    expect(census.rendererCalls).toBe(0);
    expect(census.attributedCalls).toBe(0);
    expect(census.owners).toEqual([]);
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
