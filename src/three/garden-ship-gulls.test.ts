import { Group, InstancedMesh, Object3D, ShaderMaterial } from "three";
import { describe, expect, it } from "vitest";
import {
  createGardenShipGulls,
  GARDEN_GULL_COUNT,
  GARDEN_GULL_FLOCK_NAME,
  GARDEN_GULL_LOOP_COUNT,
  GARDEN_GULL_LOOP_SECONDS,
  GARDEN_GULL_WINGSPAN,
  type GardenGullShip,
} from "./garden-ship-gulls";
import { gardenBirdPixelSpan } from "./garden-summit-birds";

function gullShip(id: string, mastheadHeight = 6): GardenGullShip {
  return { mastheadHeight, root: new Group(), ship: { id } };
}

function meshes(ship: GardenGullShip): InstancedMesh[] {
  const found: InstancedMesh[] = [];
  ship.root.traverse((object: Object3D) => {
    if ((object as InstancedMesh).isInstancedMesh) found.push(object as InstancedMesh);
  });
  return found;
}

describe("garden ship gulls", () => {
  it("consolidates three ship sorties into one five-bird draw", () => {
    const ships = [gullShip("usdt"), gullShip("usdc"), gullShip("usde")];
    createGardenShipGulls(ships);
    expect(meshes(ships[0]!)).toHaveLength(1);
    expect(meshes(ships[0]!)[0]!.count).toBe(GARDEN_GULL_COUNT);
    expect(ships[0]!.root.getObjectByName(GARDEN_GULL_FLOCK_NAME)).toBeDefined();
    expect(meshes(ships[1]!)).toHaveLength(0);
    expect(meshes(ships[2]!)).toHaveLength(0);
    expect(GARDEN_GULL_COUNT).toBe(5);
    expect(GARDEN_GULL_LOOP_COUNT).toBe(4);
  });

  it("authors two paired wide slow loops and one station", () => {
    const ship = gullShip("usdt");
    createGardenShipGulls([ship]);
    const mesh = meshes(ship)[0]!;
    expect(Array.from(mesh.geometry.getAttribute("aPhase").array)).toEqual([
      0, 0.5, expect.closeTo(0.12), expect.closeTo(0.62), 1,
    ]);
    expect((mesh.material as ShaderMaterial).vertexShader).toContain("mix(4.4, 5.2");
    expect(GARDEN_GULL_LOOP_SECONDS).toBeGreaterThanOrEqual(180);
    expect(gardenBirdPixelSpan(GARDEN_GULL_WINGSPAN, 120)).toBeGreaterThanOrEqual(8);
  });

  it("tracks the live masthead and makes reduced motion a perched static frame", () => {
    const ship = gullShip("usdt", 3);
    const gulls = createGardenShipGulls([ship]);
    const material = meshes(ship)[0]!.material as ShaderMaterial;
    gulls.update({ reducedMotion: false, timeSeconds: 9.5, visible: true });
    expect(material.uniforms.uFlight!.value).toBe(1);
    ship.mastheadHeight = 7.5;
    gulls.update({ reducedMotion: true, timeSeconds: 99, visible: true });
    expect(material.uniforms.uHeight!.value).toBe(7.5);
    expect(material.uniforms.uFlight!.value).toBe(0);
    expect(material.uniforms.uTime!.value).toBe(0);
  });
});
