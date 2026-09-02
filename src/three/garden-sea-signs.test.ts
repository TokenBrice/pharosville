import {
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
} from "three";
import { describe, expect, it } from "vitest";
import { DEWS_AREA_LABEL_COLORS } from "../systems/palette";
import {
  createGardenSeaSigns,
  seaSignScaleForZoom,
  type SeaSignSpec,
} from "./garden-sea-signs";

const specs: SeaSignSpec[] = [
  { accent: DEWS_AREA_LABEL_COLORS.CALM, body: "calm", label: "Calm Anchorage", reading: "20 ships" },
  { accent: DEWS_AREA_LABEL_COLORS.WARNING, body: "warning", label: "Warning Shoals", reading: "4 ships" },
  { accent: DEWS_AREA_LABEL_COLORS.DANGER, body: "danger", label: "Danger Strait", reading: "2 ships" },
];

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
    expect((carvings.material as MeshBasicMaterial).map).toBeNull();
    expect(signs.lampPositions).toEqual([]);
    signs.dispose();
  });

  it("cuts every carved name into one textureless stroke mesh", () => {
    const signs = createGardenSeaSigns(specs);
    const carvings = signs.root.getObjectByName("garden-sea-steles-carving") as Mesh;
    expect((carvings.material as MeshBasicMaterial).map).toBeNull();
    expect(carvings.geometry.getAttribute("position").count).toBeGreaterThan(specs.length * 40);
    signs.dispose();
  });

  it("keeps true world scale nearby and enlarges the face on the overview rung", () => {
    const signs = createGardenSeaSigns(specs);
    const carvings = signs.root.getObjectByName("garden-sea-steles-carving") as Mesh;
    signs.update({ night: 0, reducedMotion: true, visible: true, zoom: 1 });
    carvings.geometry.computeBoundingBox();
    const nearWidth = carvings.geometry.boundingBox!.max.x - carvings.geometry.boundingBox!.min.x;
    signs.update({ night: 0, reducedMotion: true, visible: true, zoom: 0.28 });
    carvings.geometry.computeBoundingBox();
    const farWidth = carvings.geometry.boundingBox!.max.x - carvings.geometry.boundingBox!.min.x;
    expect(seaSignScaleForZoom(0.28)).toBe(3.2);
    expect(farWidth).toBeGreaterThan(nearWidth);
    // The root never scales the absolute sites away from their body boundaries.
    expect(signs.root.scale.toArray()).toEqual([1, 1, 1]);
    signs.dispose();
  });

  it("raises only the hovered body's carving to full weight", () => {
    const signs = createGardenSeaSigns(specs);
    const carvings = signs.root.getObjectByName("garden-sea-steles-carving") as Mesh;
    signs.update({ activeBody: "warning", night: 0, visible: true, zoom: 1 });
    const color = carvings.geometry.getAttribute("color");
    const warningWeights = Array.from({ length: color.count }, (_, index) => (
      color.getX(index) + color.getY(index) + color.getZ(index)
    ));
    expect(Math.max(...warningWeights)).toBeGreaterThan(Math.min(...warningWeights) * 2);

    signs.update({ activeBody: "danger", night: 0, visible: true, zoom: 1 });
    const dangerWeights = Array.from({ length: color.count }, (_, index) => (
      color.getX(index) + color.getY(index) + color.getZ(index)
    ));
    expect(dangerWeights).not.toEqual(warningWeights);
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

  it("allocates no texture when a name becomes active", () => {
    const signs = createGardenSeaSigns(specs);
    const carvings = signs.root.getObjectByName("garden-sea-steles-carving") as Mesh;
    expect((carvings.material as MeshBasicMaterial).map).toBeNull();
    signs.update({ activeBody: "calm", night: 1, visible: true, zoom: 0.28 });
    expect((carvings.material as MeshBasicMaterial).map).toBeNull();
    signs.dispose();
  });
});
