// @vitest-environment jsdom
import {
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Texture,
} from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEWS_AREA_LABEL_COLORS } from "../systems/palette";
import {
  createGardenSeaSigns,
  seaSignScaleForZoom,
  type SeaSignSpec,
} from "./garden-sea-signs";

const context = {
  fillText: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  strokeText: vi.fn(),
};

const specs: SeaSignSpec[] = [
  { accent: DEWS_AREA_LABEL_COLORS.CALM, body: "calm", label: "Calm Anchorage", reading: "20 ships" },
  { accent: DEWS_AREA_LABEL_COLORS.WARNING, body: "warning", label: "Warning Shoals", reading: "4 ships" },
  { accent: DEWS_AREA_LABEL_COLORS.DANGER, body: "danger", label: "Danger Strait", reading: "2 ships" },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(context as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("garden sea steles", () => {
  it("batches all stone and all carvings into two draws", () => {
    const signs = createGardenSeaSigns(specs);
    const drawables: Mesh[] = [];
    signs.root.traverse((object) => {
      if (object instanceof Mesh) drawables.push(object);
    });

    expect(signs.root.name).toBe("garden-sea-steles");
    expect(drawables).toHaveLength(2);
    const stones = signs.root.getObjectByName("garden-sea-steles-stone");
    const carvings = signs.root.getObjectByName("garden-sea-steles-carving") as Mesh;
    expect(stones).toBeInstanceOf(InstancedMesh);
    expect((stones as InstancedMesh).count).toBe(specs.length);
    expect(carvings.material).toBeInstanceOf(MeshBasicMaterial);
    expect((carvings.material as MeshBasicMaterial).map).toBeInstanceOf(Texture);
    expect(signs.lampPositions).toEqual([]);
    signs.dispose();
  });

  it("packs every carved name into one disjoint atlas", () => {
    const signs = createGardenSeaSigns(specs);
    const carvings = signs.root.getObjectByName("garden-sea-steles-carving") as Mesh;
    const map = (carvings.material as MeshBasicMaterial).map!;
    expect((map.image as HTMLCanvasElement).width).toBe(1024);
    expect((map.image as HTMLCanvasElement).height).toBe(1024);
    expect(context.fillText).toHaveBeenCalledTimes(specs.length);
    expect(context.strokeText).toHaveBeenCalledTimes(specs.length);
    expect(context.fillText.mock.calls.map((call) => call[0])).toEqual(
      specs.map((spec) => spec.label.toUpperCase()),
    );
    expect(context.fillText.mock.calls.flat().join(" ")).not.toContain("SHIPS");

    const uv = carvings.geometry.getAttribute("uv");
    const cellRanges = specs.map((_, cell) => {
      const values = Array.from({ length: 4 }, (__, vertex) => uv.getY(cell * 4 + vertex));
      return { min: Math.min(...values), max: Math.max(...values) };
    }).sort((left, right) => left.min - right.min);
    expect(cellRanges.every((range) => range.max - range.min === 192 / 1024)).toBe(true);
    for (let index = 1; index < cellRanges.length; index += 1) {
      expect(cellRanges[index]!.min).toBeGreaterThanOrEqual(cellRanges[index - 1]!.max);
    }
    signs.dispose();
  });

  it("keeps true world scale at every zoom", () => {
    const signs = createGardenSeaSigns(specs);
    for (const zoom of [0.28, 0.7776, 1.4, 2.4]) {
      signs.update({ night: 0, visible: true, zoom });
      expect(seaSignScaleForZoom(zoom)).toBe(1);
      expect(signs.root.scale.toArray()).toEqual([1, 1, 1]);
    }
    signs.dispose();
  });

  it("raises only the hovered body's carving to full weight", () => {
    const signs = createGardenSeaSigns(specs);
    const carvings = signs.root.getObjectByName("garden-sea-steles-carving") as Mesh;
    signs.update({ activeBody: "warning", night: 0, visible: true, zoom: 1 });
    const color = carvings.geometry.getAttribute("color");
    const weight = (cell: number) => color.getX(cell * 4)
      + color.getY(cell * 4)
      + color.getZ(cell * 4);
    expect(weight(1)).toBeGreaterThan(weight(0) * 2);
    expect(weight(1)).toBeGreaterThan(weight(2) * 2);

    signs.update({ activeBody: "danger", night: 0, visible: true, zoom: 1 });
    expect(weight(2)).toBeGreaterThan(weight(1) * 2);
    signs.dispose();
  });

  it("supports the signs=0 renderer gate without changing its resources", () => {
    const signs = createGardenSeaSigns(specs);
    signs.update({ night: 0, visible: false, zoom: 1 });
    expect(signs.root.visible).toBe(false);
    expect(signs.root.getObjectByName("garden-sea-steles-stone")).toBeDefined();
    signs.update({ night: 0, visible: true, zoom: 1 });
    expect(signs.root.visible).toBe(true);
    signs.dispose();
  });

  it("disposes its one atlas exactly once", () => {
    const signs = createGardenSeaSigns(specs);
    const carvings = signs.root.getObjectByName("garden-sea-steles-carving") as Mesh;
    const texture = (carvings.material as MeshBasicMaterial).map!;
    const dispose = vi.spyOn(texture, "dispose");
    signs.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
