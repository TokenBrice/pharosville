import { Color, DataTexture, InstancedMesh, Mesh, MeshStandardMaterial, ShaderLib, type IUniform } from "three";
import { describe, expect, it, vi } from "vitest";
import { GARDEN_SEA_EDGE_SITES } from "../systems/garden-sea-edge-sites";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import { weatherForFrame } from "../systems/weather";
import { HARBOR_PALETTE, hexToOklch } from "../systems/palette";
import {
  GARDEN_SEA_EDGES_OVERVIEW_NAME,
  GARDEN_SHOAL_BAR_AWASH_HEIGHT,
  createGardenSeaEdges,
} from "./garden-sea-edges";
import { GARDEN_SHORE_CONTACT, createGardenRimMesh } from "./garden-rim-mesh";
import { applyGardenCragFinish } from "./garden-crag-finish";
import { gardenShoreContactGlsl } from "./garden-water-contract";
import { GARDEN_SURFACE_GLSL, type GardenSurfaceAtlasLease, type GardenSurfaceAtlasOwner } from "./garden-surface-atlas";

function compile(material: MeshStandardMaterial) {
  const shader = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader,
    uniforms: {} as Record<string, IUniform> };
  material.onBeforeCompile(shader as never, null as never);
  return shader;
}

describe("garden sea edges", () => {
  it("batches the complete geography into four stone signatures and two instanced draws", () => {
    const edges = createGardenSeaEdges();
    expect(edges.root.name).toBe(GARDEN_SEA_EDGES_OVERVIEW_NAME);
    expect([...edges.bucketMeshes.keys()]).toEqual(["natural", "pale", "dark", "slate"]);
    expect(edges.drawCallCount).toBe(6);
    expect(edges.drawCallCount).toBeLessThanOrEqual(6);
    expect(edges.root.children).toHaveLength(edges.drawCallCount);
    expect(edges.root.children.filter((child) => child.name === "garden-sea-edges-reeds")).toHaveLength(1);
    expect(edges.reedInstances).toBeInstanceOf(InstancedMesh);
    expect(edges.fixtureInstances).toBeInstanceOf(InstancedMesh);
    expect(edges.siteCount).toBe(GARDEN_SEA_EDGE_SITES.length);
    expect(edges.triangleCount).toBeLessThanOrEqual(4_350);
    edges.dispose();
  });

  it("lays Warning bars awash with smooth height-resolved damp and submerged stone", () => {
    const edges = createGardenSeaEdges();
    const shoals = edges.bucketMeshes.get("pale")!;
    shoals.geometry.computeBoundingBox();
    expect(shoals.geometry.boundingBox!.max.y).toBeCloseTo(GARDEN_WATER_Y + GARDEN_SHOAL_BAR_AWASH_HEIGHT, 6);
    expect((shoals.material as MeshStandardMaterial).flatShading).toBe(false);
    for (const mesh of edges.bucketMeshes.values()) {
      const material = mesh.material as MeshStandardMaterial;
      const shader = compile(material);
      expect(shader.fragmentShader).toContain(gardenShoreContactGlsl(`vGardenSurfacePosition.y - ${GARDEN_WATER_Y}`, GARDEN_SHORE_CONTACT));
      expect(shader.fragmentShader).toContain("1.0 - shoreDamp * 0.3 - shoreSubmerged * 0.16");
      expect(shader.fragmentShader).toContain("roughnessFactor = mix(roughnessFactor, 0.76, shoreDamp * 0.65)");
      expect(material.userData.gardenSurface.role).toBe("stone");
      expect(material.userData.gardenSurface.mapping).toBe("worldXZ");
      expect(material.userData.gardenSurface.metresPerRepeat).toBe(2.6);
    }
    edges.dispose();
  });

  it("gives decorative warning-shaped buoys a supporting ochre rather than the Danger accent", () => {
    const edges = createGardenSeaEdges();
    const sites = GARDEN_SEA_EDGE_SITES.filter((site) => (
      site.form === "timber-pile" || site.form === "warning-buoy"
    ));
    const expected = new Color(HARBOR_PALETTE.timber_warm).lerp(new Color(HARBOR_PALETTE.stone_pale), 0.4);
    const reserved = new Color(HARBOR_PALETTE.vermillion);
    const sampled = new Color();
    let buoys = 0;
    for (const [index, site] of sites.entries()) {
      if (site.form !== "warning-buoy") continue;
      buoys += 1;
      edges.fixtureInstances.getColorAt(index, sampled);
      expect(sampled.r).toBeCloseTo(expected.r, 6);
      expect(sampled.g).toBeCloseTo(expected.g, 6);
      expect(sampled.b).toBeCloseTo(expected.b, 6);
      expect(sampled.getHex()).not.toBe(reserved.getHex());
      expect(hexToOklch(`#${sampled.getHexString()}`).c).toBeLessThanOrEqual(0.12);
    }
    expect(buoys).toBeGreaterThan(0);
    edges.dispose();
  });

  it("keeps vertex colour and static-shadow readiness on every draw", () => {
    const edges = createGardenSeaEdges();
    edges.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      expect(object.geometry.getAttribute("color"), object.name).toBeDefined();
      expect(object.material).toBeInstanceOf(MeshStandardMaterial);
      expect((object.material as MeshStandardMaterial).vertexColors, object.name).toBe(true);
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

  it("shares exactly the same physical contact thresholds with rim terrain and the headland", () => {
    const rim = createGardenRimMesh();
    const terrain = rim.root.getObjectByName("garden-rim-land") as Mesh;
    const terrainShader = compile(terrain.material as MeshStandardMaterial);
    expect(terrainShader.fragmentShader).toContain(gardenShoreContactGlsl(`vGardenSurfacePosition.y - ${GARDEN_WATER_Y}`, GARDEN_SHORE_CONTACT));
    const crag = new MeshStandardMaterial();
    applyGardenCragFinish(crag);
    const cragShader = compile(crag);
    expect(cragShader.fragmentShader).toContain(gardenShoreContactGlsl("cragAbove", GARDEN_SHORE_CONTACT));
    expect(cragShader.fragmentShader).toContain("float cragWet = shoreDamp * (0.65 + 0.35 * shoreSubmerged)");
    expect(GARDEN_SHORE_CONTACT).toEqual({ submergedAbove: -0.02, dryAbove: 0.45 });
    rim.dispose();
    crag.dispose();
  });

  it("leases one shared atlas per geography owner and never disposes borrowed maps on rebuild", () => {
    const textures = { albedo: new DataTexture(), normal: new DataTexture(), orm: new DataTexture() };
    const uniforms = { uGardenSurfaceAlbedo: { value: textures.albedo },
      uGardenSurfaceNormal: { value: textures.normal }, uGardenSurfaceOrm: { value: textures.orm },
      uGardenSurfaceAtlasReady: { value: 1 } };
    const releases = [vi.fn(), vi.fn()];
    const leases = releases.map((release): GardenSurfaceAtlasLease => ({
      textures, uniforms, release, error: null, ready: Promise.resolve(true),
      detailSource: { key: "borrowed-test", glsl: GARDEN_SURFACE_GLSL, uniforms },
    }));
    const owner: GardenSurfaceAtlasOwner = { textures, lease: vi.fn(() => leases.shift() ?? null), release: vi.fn() };
    const mapDisposals = Object.values(textures).map((texture) => vi.spyOn(texture, "dispose"));
    const first = createGardenSeaEdges(owner);
    for (const mesh of first.bucketMeshes.values()) {
      const shader = compile(mesh.material as MeshStandardMaterial);
      for (const name of Object.keys(uniforms)) expect(shader.uniforms[name]).toBe(uniforms[name as keyof typeof uniforms]);
    }
    first.dispose();
    first.dispose();
    const rebuilt = createGardenSeaEdges(owner);
    expect(releases[0]).toHaveBeenCalledOnce();
    expect(releases[1]).not.toHaveBeenCalled();
    expect(uniforms.uGardenSurfaceAtlasReady.value).toBe(1);
    expect(rebuilt.drawCallCount).toBe(6);
    rebuilt.dispose();
    expect(releases[1]).toHaveBeenCalledOnce();
    expect(owner.lease).toHaveBeenCalledTimes(2);
    expect(owner.release).not.toHaveBeenCalled();
    for (const disposed of mapDisposals) expect(disposed).not.toHaveBeenCalled();
    for (const texture of Object.values(textures)) texture.dispose();
  });

  it("adds per-instance reed sway without adding a draw or oscillator", () => {
    const edges = createGardenSeaEdges();
    const sway = edges.reedInstances.geometry.getAttribute("aGardenSway");
    const phases = edges.reedInstances.geometry.getAttribute("aGardenBankPhase");
    expect(sway.count).toBe(edges.reedInstances.count);
    expect(phases.count).toBe(edges.reedInstances.count);
    expect(new Set(Array.from(phases.array))).toHaveProperty("size", edges.reedInstances.count);
    const material = edges.reedInstances.material as MeshStandardMaterial;
    expect(material.customProgramCacheKey()).toContain("garden-instanced-wind-sway");
    const weather = weatherForFrame({ baseWind: 0.6, psiStress: 0.3, timeSeconds: 2 });
    edges.updateWind(weather, false);
    const uniforms = material.userData.gardenWindSwayUniforms as {
      uGardenWindDirection: { value: { x: number; y: number } };
      uGardenWindStrength: { value: number };
    };
    expect(uniforms.uGardenWindDirection.value.x).toBeCloseTo(weather.wind.x);
    expect(uniforms.uGardenWindStrength.value).toBeGreaterThan(0);
    expect(edges.drawCallCount).toBe(6);
    edges.dispose();
  });
});
