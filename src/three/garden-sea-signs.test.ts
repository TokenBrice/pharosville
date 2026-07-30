// @vitest-environment jsdom
import {
  Mesh,
  MeshStandardMaterial,
  Texture,
} from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGardenSeaSigns, type SeaSignSpec } from "./garden-sea-signs";

const context = {
  arc: vi.fn(),
  beginPath: vi.fn(),
  bezierCurveTo: vi.fn(),
  fill: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  moveTo: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  stroke: vi.fn(),
  strokeRect: vi.fn(),
  strokeText: vi.fn(),
  translate: vi.fn(),
};

const specs: SeaSignSpec[] = [
  { accent: "#66aa88", body: "calm", label: "Calm Anchorage", reading: "CALM · 20" },
  { accent: "#ddaa44", body: "warning", label: "Warning Shoals", reading: "WARNING · 4" },
  { accent: "#cc4455", body: "danger", label: "Storm Strait", reading: "DANGER · 2" },
];

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(context as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("garden sea-sign texture atlas", () => {
  it("packs every board into one texture with disjoint padded UV cells", () => {
    const signs = createGardenSeaSigns(specs);
    const boards: Mesh[] = [];
    signs.root.traverse((object) => {
      if (object.name.startsWith("garden-sea-sign-board.")) boards.push(object as Mesh);
    });
    expect(boards).toHaveLength(specs.length);

    const materials = boards.map((board) => board.material as MeshStandardMaterial);
    const maps = materials.map((material) => material.map);
    expect(new Set(maps).size).toBe(1);
    expect(maps[0]).toBeInstanceOf(Texture);
    expect(materials.every((material) => material.emissiveMap === maps[0])).toBe(true);
    expect((maps[0]!.image as HTMLCanvasElement).width).toBe(1024);
    expect((maps[0]!.image as HTMLCanvasElement).height).toBe(1024);

    const ranges = boards.map((board) => {
      const uv = board.geometry.getAttribute("uv");
      const values = Array.from({ length: uv.count }, (_, index) => uv.getY(index));
      return { max: Math.max(...values), min: Math.min(...values) };
    }).sort((left, right) => left.min - right.min);
    for (const range of ranges) {
      expect(range.min).toBeGreaterThanOrEqual(0);
      expect(range.max).toBeLessThanOrEqual(1);
      expect(range.max - range.min).toBeCloseTo(272 / 1024, 6);
    }
    for (let index = 1; index < ranges.length; index += 1) {
      expect(ranges[index]!.min).toBeGreaterThan(ranges[index - 1]!.max);
    }
    expect(context.translate).toHaveBeenCalledTimes(specs.length);

    signs.dispose();
  });

  it("disposes the shared atlas once rather than once per board", () => {
    const signs = createGardenSeaSigns(specs);
    const board = signs.root.getObjectByName("garden-sea-sign-board.calm") as Mesh;
    const texture = (board.material as MeshStandardMaterial).map!;
    const dispose = vi.spyOn(texture, "dispose");

    signs.dispose();

    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
