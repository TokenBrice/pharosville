import { BufferGeometry, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial } from "three";
import { describe, expect, it } from "vitest";
import { applyGardenMonthRecord } from "./garden-month-record";

function garden() {
  const root = new Group();
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0], 3));
  geometry.setAttribute("color", new Float32BufferAttribute([0.35, 0.5, 0.3], 3));
  const shelf = new Mesh(geometry, new MeshStandardMaterial({ vertexColors: true }));
  shelf.name = "island-planted-shelf-0";
  const shrubs = new InstancedMesh(geometry, new MeshStandardMaterial({ color: "#5c7350" }), 2);
  shrubs.name = "island-shrubs";
  shrubs.setMatrixAt(0, new Matrix4().identity());
  shrubs.setMatrixAt(1, new Matrix4().identity());
  root.add(shelf, shrubs);
  return { root, shelf, shrubs };
}

describe("garden month record rendering", () => {
  it("greens moss, opens blossoms, and grows existing instances after a calm month", () => {
    const { root, shelf, shrubs } = garden();
    applyGardenMonthRecord(root, { averagePsi: 90, growth: 1, sampleCount: 30, spanDays: 29, unavailable: false });
    const colors = shelf.geometry.getAttribute("color");
    expect(colors.getY(0)).toBeGreaterThan(colors.getX(0));
    expect(shrubs.instanceColor).not.toBeNull();
    const transformed = new Matrix4();
    shrubs.getMatrixAt(0, transformed);
    expect(transformed.elements[0]).toBeGreaterThan(1);
  });

  it("browns moss and sheds existing instances after a stressed month", () => {
    const { root, shelf, shrubs } = garden();
    applyGardenMonthRecord(root, { averagePsi: 20, growth: 0, sampleCount: 30, spanDays: 29, unavailable: false });
    const colors = shelf.geometry.getAttribute("color");
    expect(colors.getX(0)).toBeGreaterThan(colors.getY(0));
    const transformed = new Matrix4();
    shrubs.getMatrixAt(0, transformed);
    expect(transformed.elements[0]).toBeLessThan(1);
  });
});
