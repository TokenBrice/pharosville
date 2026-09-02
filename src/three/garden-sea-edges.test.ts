import { InstancedMesh, Mesh, MeshStandardMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import { GARDEN_SEA_EDGE_SITES } from "../systems/garden-sea-edge-sites";
import { weatherForFrame } from "../systems/weather";
import { GARDEN_SEA_EDGES_OVERVIEW_NAME, createGardenSeaEdges } from "./garden-sea-edges";

describe("garden sea edges", () => {
  it("batches the complete geography into four stone signatures and two instanced draws", () => {
    const edges = createGardenSeaEdges();
    expect(edges.root.name).toBe(GARDEN_SEA_EDGES_OVERVIEW_NAME);
    expect([...edges.bucketMeshes.keys()]).toEqual(["natural", "pale", "dark", "slate"]);
    expect(edges.drawCallCount).toBe(6);
    expect(edges.drawCallCount).toBeLessThanOrEqual(6);
    expect(edges.root.children).toHaveLength(edges.drawCallCount);
    expect(edges.reedInstances).toBeInstanceOf(InstancedMesh);
    expect(edges.fixtureInstances).toBeInstanceOf(InstancedMesh);
    expect(edges.siteCount).toBe(GARDEN_SEA_EDGE_SITES.length);
    expect(edges.triangleCount).toBeGreaterThan(0);
    edges.dispose();
  });

  it("keeps vertex colour, shared height fog and static-shadow readiness on every draw", () => {
    const edges = createGardenSeaEdges();
    edges.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      expect(object.geometry.getAttribute("color"), object.name).toBeDefined();
      expect(object.material).toBeInstanceOf(MeshStandardMaterial);
      expect((object.material as MeshStandardMaterial).vertexColors, object.name).toBe(true);
      expect((object.material as MeshStandardMaterial).userData.gardenHeightFog, object.name).toBe(true);
      expect(object.castShadow, object.name).toBe(true);
      expect(object.receiveShadow, object.name).toBe(true);
    });
    edges.dispose();
  });

  it("is deterministic and disposes the six owned draw resources once", () => {
    const first = createGardenSeaEdges();
    const second = createGardenSeaEdges();
    expect(Array.from(first.reedInstances.instanceMatrix.array)).toEqual(
      Array.from(second.reedInstances.instanceMatrix.array),
    );
    for (const signature of first.bucketMeshes.keys()) {
      expect(Array.from(first.bucketMeshes.get(signature)!.geometry.getAttribute("position").array)).toEqual(
        Array.from(second.bucketMeshes.get(signature)!.geometry.getAttribute("position").array),
      );
    }
    const disposed = vi.fn();
    first.root.traverse((object) => {
      if (object instanceof Mesh) object.geometry.addEventListener("dispose", disposed);
    });
    first.dispose();
    first.dispose();
    expect(disposed).toHaveBeenCalledTimes(6);
    expect(first.root.children).toHaveLength(0);
    second.dispose();
  });

  it("adds per-instance reed sway without adding a draw or oscillator", () => {
    const edges = createGardenSeaEdges();
    const sway = edges.reedInstances.geometry.getAttribute("aGardenSway");
    expect(sway.count).toBe(edges.reedInstances.count);
    const material = edges.reedInstances.material as MeshStandardMaterial;
    expect(material.customProgramCacheKey()).toContain("garden-instanced-wind-sway");
    const weather = weatherForFrame({ baseWind: 0.6, psiStress: 0.3, timeSeconds: 2 });
    edges.updateWind(weather, false);
    const uniforms = material.userData.gardenWindSwayUniforms as {
      uGardenWindDirection: { value: { x: number; y: number } };
      uGardenWindStrength: { value: number };
    };
    expect(uniforms.uGardenWindDirection.value.x).toBeCloseTo(weather.windDirX);
    expect(uniforms.uGardenWindStrength.value).toBeGreaterThan(0);
    expect(edges.drawCallCount).toBe(6);
    edges.dispose();
  });
});
